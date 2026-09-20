// Campaign Kit: accept hub board entry → world_state questHooks.

import { resolveActiveCampaignKit } from './campaignKit';
import { resolveCampaignBoardContext } from './campaignKitBridge';
import { buildCampaignJobBoard } from './campaignJobBoardCore';
import {
    findBoardEntryById,
    isValidCampaignBoardEntryId,
    upsertCampaignQuestHook,
} from './campaignJobQuestCore';
import { isWorldStateEnabled, patchWorldStateQuestHooks } from './worldState';

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

    return patchWorldStateQuestHooks((hooks, worldState) => {
        const worldTurn = Math.max(0, Math.floor(worldState.worldTurn || 0));
        const ctx = resolveCampaignBoardContext(currentLocationId, worldTurn);
        if (!ctx) {
            return { hooks, changed: false };
        }

        const board = buildCampaignJobBoard(ctx);
        const entry = findBoardEntryById(board, boardEntryId);
        if (!entry) {
            return { hooks, changed: false };
        }

        return upsertCampaignQuestHook(hooks, entry, worldTurn);
    });
}