// Campaign P0 PR2 — whitelist webview payloads before postMessage.

import type { TurnResult } from './types/TurnResult';
import {
    sanitizeNpcAgencyOpsForWebview,
    type NpcTrustLookup,
} from './npcWhereaboutsTrustCore';
import {
    pickGameStateForWebview,
    pickTurnResultForWebview,
} from './gameStateWebviewSanitizeCore';

export {
    WEBVIEW_GAME_STATE_ROOT_KEYS,
    WEBVIEW_GAME_ENTRY_KEYS,
    WEBVIEW_TURN_RESULT_KEYS,
    pickGameStateForWebview,
    pickTurnResultForWebview,
    sanitizeStatePatchForWebview,
} from './gameStateWebviewSanitizeCore';

export function sanitizeGameStateForWebview(
    state: Record<string, unknown>
): Record<string, unknown> {
    return pickGameStateForWebview(state);
}

export function sanitizeTurnResultForWebview(
    turnResult: TurnResult,
    trustLookup: NpcTrustLookup
): TurnResult {
    const picked = pickTurnResultForWebview(turnResult);
    if (!Array.isArray(picked.npcAgencyOps) || picked.npcAgencyOps.length === 0) {
        return picked;
    }
    return {
        ...picked,
        npcAgencyOps: sanitizeNpcAgencyOpsForWebview(
            picked.npcAgencyOps,
            trustLookup
        ) as TurnResult['npcAgencyOps'],
    };
}