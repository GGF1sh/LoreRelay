/** Pure Campaign → Parlor history import — no vscode/fs. */

import type { ParlorMessage } from './parlorSessionCore';
import { MAX_PARLOR_MESSAGES, clampParlorContent } from './parlorSessionCore';
import {
    PARLOR_ARCHIVE_BATCH,
    type ParlorArchiveRecord,
} from './parlorArchiveCore';

/** Active session cap — overflow routes directly to archive (Gemini Phase C P0). */
export const MAX_DEMOTE_ACTIVE_MESSAGES = MAX_PARLOR_MESSAGES;
export const DEFAULT_DEMOTE_IMPORT_LIMIT = MAX_DEMOTE_ACTIVE_MESSAGES;

export interface CampaignHistoryEntry {
    id?: string;
    role: string;
    content: string;
    sender?: string;
}

export interface DemoteImportOptions {
    maxMessages?: number;
    characterId?: string;
}

function filterCampaignHistoryEntries(entries: CampaignHistoryEntry[]): CampaignHistoryEntry[] {
    return entries.filter((e) => {
        const role = (e.role || '').toLowerCase();
        return (role === 'user' || role === 'gm') && typeof e.content === 'string' && e.content.trim();
    });
}

function mapFilteredEntriesToMessages(
    filtered: CampaignHistoryEntry[],
    options: DemoteImportOptions,
    startIndex = 0
): ParlorMessage[] {
    const now = new Date().toISOString();
    return filtered.map((e, index) => {
        const role = e.role.toLowerCase() === 'user' ? 'user' as const : 'assistant' as const;
        const baseId = typeof e.id === 'string' && e.id.length <= 64 ? e.id : `import-${startIndex + index}`;
        const msg: ParlorMessage = {
            id: `parlor-import-${baseId}`,
            role,
            content: clampParlorContent(e.content),
            createdAt: now,
        };
        if (options.characterId && role === 'assistant') {
            msg.characterId = options.characterId;
        }
        return msg;
    });
}

export function mapCampaignEntriesToParlorMessages(
    entries: CampaignHistoryEntry[],
    options: DemoteImportOptions = {}
): ParlorMessage[] {
    const max = Math.max(1, Math.min(MAX_DEMOTE_ACTIVE_MESSAGES, options.maxMessages ?? DEFAULT_DEMOTE_IMPORT_LIMIT));
    const filtered = filterCampaignHistoryEntries(entries);
    return mapFilteredEntriesToMessages(filtered.slice(-max), options);
}

export interface SplitCampaignImportResult {
    activeMessages: ParlorMessage[];
    archiveRecords: ParlorArchiveRecord[];
    totalImported: number;
    archivedCount: number;
}

/** Split bulk Campaign history: recent → session, older → ndjson archive batches. */
export function splitCampaignImportForParlor(
    entries: CampaignHistoryEntry[],
    options: DemoteImportOptions & { maxActive?: number } = {}
): SplitCampaignImportResult {
    const maxActive = Math.max(1, Math.min(MAX_DEMOTE_ACTIVE_MESSAGES, options.maxActive ?? MAX_DEMOTE_ACTIVE_MESSAGES));
    const filtered = filterCampaignHistoryEntries(entries);
    const allMessages = mapFilteredEntriesToMessages(filtered, options);
    if (allMessages.length <= maxActive) {
        return {
            activeMessages: allMessages,
            archiveRecords: [],
            totalImported: allMessages.length,
            archivedCount: 0,
        };
    }
    const overflow = allMessages.length - maxActive;
    const archived = allMessages.slice(0, overflow);
    const activeMessages = allMessages.slice(overflow);
    const archivedAt = new Date().toISOString();
    const archiveRecords: ParlorArchiveRecord[] = [];
    for (let i = 0; i < archived.length; i += PARLOR_ARCHIVE_BATCH) {
        archiveRecords.push({
            archivedAt,
            activeCharacterId: options.characterId || '',
            messages: archived.slice(i, i + PARLOR_ARCHIVE_BATCH),
        });
    }
    return {
        activeMessages,
        archiveRecords,
        totalImported: allMessages.length,
        archivedCount: archived.length,
    };
}

export function mergeImportedParlorMessages(
    existing: ParlorMessage[],
    imported: ParlorMessage[]
): ParlorMessage[] {
    if (imported.length === 0) {
        return existing;
    }
    const seen = new Set(existing.map((m) => m.id));
    const merged = [...existing];
    for (const msg of imported) {
        if (!seen.has(msg.id)) {
            merged.push(msg);
            seen.add(msg.id);
        }
    }
    return merged;
}