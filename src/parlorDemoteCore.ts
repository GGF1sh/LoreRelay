/** Pure Campaign → Parlor history import — no vscode/fs. */

import type { ParlorMessage } from './parlorSessionCore';
import { clampParlorContent } from './parlorSessionCore';

export const DEFAULT_DEMOTE_IMPORT_LIMIT = 40;

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

export function mapCampaignEntriesToParlorMessages(
    entries: CampaignHistoryEntry[],
    options: DemoteImportOptions = {}
): ParlorMessage[] {
    const max = Math.max(1, Math.min(200, options.maxMessages ?? DEFAULT_DEMOTE_IMPORT_LIMIT));
    const now = new Date().toISOString();
    const filtered = entries.filter((e) => {
        const role = (e.role || '').toLowerCase();
        return (role === 'user' || role === 'gm') && typeof e.content === 'string' && e.content.trim();
    });
    return filtered.slice(-max).map((e, index) => {
        const role = e.role.toLowerCase() === 'user' ? 'user' as const : 'assistant' as const;
        const baseId = typeof e.id === 'string' && e.id.length <= 64 ? e.id : `import-${index}`;
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