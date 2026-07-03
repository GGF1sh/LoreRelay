/** Pure Parlor archive + summary helpers — no vscode/fs. */

import type { ParlorMessage, ParlorSession } from './parlorSessionCore';
import {
    MAX_PARLOR_MESSAGES,
    MAX_PARLOR_SUMMARY_CHARS,
    clampParlorContent,
} from './parlorSessionCore';

export const PARLOR_ARCHIVE_FILENAME = 'parlor_archive.ndjson';
/** When session exceeds max, archive this many oldest messages per compaction. */
export const PARLOR_ARCHIVE_BATCH = 50;

export interface ParlorArchiveRecord {
    archivedAt: string;
    activeCharacterId: string;
    messages: ParlorMessage[];
}

export function extractParlorArchiveBatch(session: ParlorSession): {
    session: ParlorSession;
    archived: ParlorMessage[];
} {
    if (session.messages.length <= MAX_PARLOR_MESSAGES) {
        return { session, archived: [] };
    }
    const overflow = session.messages.length - MAX_PARLOR_MESSAGES + PARLOR_ARCHIVE_BATCH;
    const count = Math.max(PARLOR_ARCHIVE_BATCH, overflow);
    const archived = session.messages.slice(0, count);
    const retained = session.messages.slice(count);
    return {
        session: {
            ...session,
            messages: retained,
            updatedAt: new Date().toISOString(),
        },
        archived,
    };
}

export function buildParlorArchiveSummaryDelta(
    archived: ParlorMessage[],
    characterName: string,
    locale = 'en'
): string {
    if (archived.length === 0) {
        return '';
    }
    const label = locale === 'ja'
        ? `${archived.length} 件の古い Parlor メッセージをアーカイブ`
        : `Archived ${archived.length} older Parlor message(s)`;
    const snippets = archived
        .filter((m) => m.role === 'user' || m.role === 'assistant')
        .slice(-3)
        .map((m) => {
            const who = m.role === 'user' ? (locale === 'ja' ? 'プレイヤー' : 'Player') : characterName;
            const text = m.content.replace(/\s+/g, ' ').slice(0, 80);
            return `${who}: ${text}`;
        });
    return [label, ...snippets].join('\n');
}

/** Collapse an overlong summary: keep header + recent tail (Gemini Phase C P2). */
export function compressParlorSessionSummary(
    text: string,
    maxChars = MAX_PARLOR_SUMMARY_CHARS
): string {
    if (text.length <= maxChars) {
        return text;
    }
    const lines = text.split('\n');
    const header = lines[0] || '';
    const marker = '[...summary compressed by LoreRelay...]';
    const tail = lines.slice(-6);
    let candidate = [header, marker, ...tail].join('\n');
    if (candidate.length > maxChars) {
        candidate = candidate.slice(0, maxChars);
    }
    return candidate;
}

export function mergeParlorSessionSummary(
    existing: string | undefined,
    delta: string,
    maxChars = MAX_PARLOR_SUMMARY_CHARS
): string | undefined {
    if (!delta.trim()) {
        return existing ? compressParlorSessionSummary(existing, maxChars) : undefined;
    }
    const merged = existing ? `${existing}\n${delta}` : delta;
    const compressed = compressParlorSessionSummary(merged, maxChars);
    return compressed.trim() ? compressed : undefined;
}

export function serializeParlorArchiveRecord(record: ParlorArchiveRecord): string {
    return JSON.stringify(record);
}

export function parseParlorArchiveLine(line: string): ParlorArchiveRecord | undefined {
    const trimmed = line.trim();
    if (!trimmed) {
        return undefined;
    }
    try {
        const raw = JSON.parse(trimmed) as Record<string, unknown>;
        if (!raw || typeof raw !== 'object' || !Array.isArray(raw.messages)) {
            return undefined;
        }
        const messages: ParlorMessage[] = [];
        for (const item of raw.messages) {
            if (!item || typeof item !== 'object') {
                continue;
            }
            const o = item as Record<string, unknown>;
            if (typeof o.role !== 'string' || typeof o.content !== 'string') {
                continue;
            }
            if (o.role !== 'user' && o.role !== 'assistant' && o.role !== 'system') {
                continue;
            }
            messages.push({
                id: typeof o.id === 'string' ? o.id.slice(0, 80) : `arch-${messages.length}`,
                role: o.role,
                content: clampParlorContent(o.content),
                createdAt: typeof o.createdAt === 'string' ? o.createdAt.slice(0, 40) : new Date().toISOString(),
            });
        }
        return {
            archivedAt: typeof raw.archivedAt === 'string' ? raw.archivedAt.slice(0, 40) : new Date().toISOString(),
            activeCharacterId: typeof raw.activeCharacterId === 'string' ? raw.activeCharacterId.slice(0, 64) : '',
            messages,
        };
    } catch {
        return undefined;
    }
}