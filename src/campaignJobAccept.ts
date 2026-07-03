// Campaign Kit: accept hub board entry → world_state questHooks.

import { resolveActiveCampaignKit } from './campaignKit';
import { resolveCampaignBoardContext } from './campaignKitBridge';
import { buildCampaignJobBoard } from './campaignJobBoardCore';
import {
    findBoardEntryById,
    isValidCampaignBoardEntryId,
    upsertCampaignQuestHook,
} from './campaignJobQuestCore';
import { isWorldStateEnabled, loadWorldState, saveWorldState } from './worldState';

export function acceptCampaignJobBoardEntry(
    boardEntryId: string,
    currentLocationId?: string | null
): boolean {
    if (!resolveActiveCampaignKit() || !isValidCampaignBoardEntryId(boardEntryId)) {
        return false;
    }
    if (!isWorldStateEnabled()) {
        return false;
    }
    const worldState = loadWorldState();
    if (!worldState) {
        return false;
    }

    const worldTurn = Math.max(0, Math.floor(worldState.worldTurn || 0));
    const ctx = resolveCampaignBoardContext(currentLocationId, worldTurn);
    if (!ctx) {
        return false;
    }

    const board = buildCampaignJobBoard(ctx);
    const entry = findBoardEntryById(board, boardEntryId);
    if (!entry) {
        return false;
    }

    const hooks = Array.isArray(worldState.questHooks) ? [...worldState.questHooks] : [];
    const { hooks: nextHooks, changed } = upsertCampaignQuestHook(hooks, entry, worldTurn);
    if (!changed) {
        return false;
    }
    worldState.questHooks = nextHooks;
    saveWorldState(worldState);
    return true;
}