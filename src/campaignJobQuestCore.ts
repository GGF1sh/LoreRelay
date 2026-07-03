// Campaign Kit: job board entry → questHooks bridge (pure).

import type { CampaignJobBoardEntry } from './campaignJobBoardCore';
import type { QuestHook, QuestStatus } from './worldStateCore';
import { isValidEventId } from './worldEventLogCore';
import {
    MAX_QUEST_DESCRIPTION_LEN,
    MAX_QUEST_TITLE_LEN,
} from './questGeneratorCore';

const ID_RE = /^[a-zA-Z0-9_-]{1,64}$/;

function clampText(value: string, maxLen: number): string {
    return value.trim().replace(/\s+/g, ' ').slice(0, maxLen);
}

export function isValidCampaignBoardEntryId(id: unknown): id is string {
    return typeof id === 'string' && ID_RE.test(id);
}

export function questIdFromBoardEntry(boardEntryId: string): string {
    const suffix = boardEntryId
        .toLowerCase()
        .replace(/[^a-z0-9_-]+/g, '_')
        .replace(/^_+|_+$/g, '')
        .slice(0, 48);
    const id = `quest_campaign_${suffix || 'board'}`;
    return isValidEventId(id) ? id : 'quest_campaign_board';
}

export function createQuestHookFromBoardEntry(
    entry: CampaignJobBoardEntry,
    worldTurn: number,
    status: QuestStatus = 'active'
): QuestHook | undefined {
    if (!isValidCampaignBoardEntryId(entry.id)) {
        return undefined;
    }
    const id = questIdFromBoardEntry(entry.id);
    if (!isValidEventId(id)) {
        return undefined;
    }
    const siteLine = entry.siteName ? ` Target site: ${entry.siteName}.` : '';
    const rewardLine = entry.rewardHint ? ` Reward hint: ${entry.rewardHint}.` : '';
    const kindLine = entry.kind === 'rumor' ? ' (rumor — verify before committing).' : '';
    const hook: QuestHook = {
        id,
        title: clampText(entry.title, MAX_QUEST_TITLE_LEN),
        description: clampText(`${entry.summary}${siteLine}${rewardLine}${kindLine}`, MAX_QUEST_DESCRIPTION_LEN),
        source: 'campaign',
        relatedId: entry.id,
        status,
        turnGenerated: Math.max(0, Math.floor(worldTurn)),
        reward: entry.rewardHint ? clampText(entry.rewardHint, 200) : undefined,
    };
    if (entry.factionId) {
        hook.factionId = entry.factionId;
    }
    return hook;
}

/** Hide board rows already taken as active/completed campaign quest hooks. */
export function filterJobBoardByQuestHooks(
    entries: CampaignJobBoardEntry[],
    questHooks: QuestHook[] | undefined
): CampaignJobBoardEntry[] {
    if (!entries.length || !questHooks?.length) {
        return entries;
    }
    const takenRelated = new Set(
        questHooks
            .filter((h) => h.source === 'campaign' && (h.status === 'active' || h.status === 'completed'))
            .map((h) => h.relatedId)
    );
    if (!takenRelated.size) {
        return entries;
    }
    return entries.filter((e) => !takenRelated.has(e.id));
}

export function findBoardEntryById(
    entries: CampaignJobBoardEntry[],
    boardEntryId: string
): CampaignJobBoardEntry | undefined {
    if (!isValidCampaignBoardEntryId(boardEntryId)) {
        return undefined;
    }
    return entries.find((e) => e.id === boardEntryId);
}

export function upsertCampaignQuestHook(
    hooks: QuestHook[],
    entry: CampaignJobBoardEntry,
    worldTurn: number
): { hooks: QuestHook[]; changed: boolean } {
    const existing = hooks.find((h) => h.source === 'campaign' && h.relatedId === entry.id);
    if (existing) {
        if (existing.status === 'available') {
            const next = hooks.map((h) => (h.id === existing.id ? { ...h, status: 'active' as const } : h));
            return { hooks: next, changed: true };
        }
        return { hooks, changed: false };
    }
    const created = createQuestHookFromBoardEntry(entry, worldTurn, 'active');
    if (!created) {
        return { hooks, changed: false };
    }
    return { hooks: [...hooks, created], changed: true };
}