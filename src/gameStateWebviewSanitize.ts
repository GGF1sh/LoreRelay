// Campaign P0 — strip GM-only fields before webview postMessage.

import type { TurnResult } from './types/TurnResult';
import {
    sanitizeNpcAgencyOpsForWebview,
    type NpcTrustLookup,
} from './npcWhereaboutsTrustCore';

export function sanitizeGameStateForWebview(
    state: Record<string, unknown>
): Record<string, unknown> {
    const out = { ...state };
    delete out.hiddenState;
    delete out.profileUpdates;
    delete out.npcMemoryUpdates;

    const director = out.director;
    if (director && typeof director === 'object' && !Array.isArray(director)) {
        const d = { ...(director as Record<string, unknown>) };
        delete d.notes;
        out.director = d;
    }

    return out;
}

export function sanitizeTurnResultForWebview(
    turnResult: TurnResult,
    trustLookup: NpcTrustLookup
): TurnResult {
    if (!Array.isArray(turnResult.npcAgencyOps) || turnResult.npcAgencyOps.length === 0) {
        return turnResult;
    }
    return {
        ...turnResult,
        npcAgencyOps: sanitizeNpcAgencyOpsForWebview(
            turnResult.npcAgencyOps,
            trustLookup
        ) as TurnResult['npcAgencyOps'],
    };
}