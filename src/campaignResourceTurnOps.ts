// Campaign Kit Phase G: persist campaignResourceOps to campaign_resources.json.

import type { TurnResult } from './types/TurnResult';
import type { TurnLedgerApplyResult } from './turnLedgerPersistCore';
import { resolveActiveCampaignKit } from './campaignKit';
import {
    clearCampaignResourcesCache,
    getCampaignResourcesPath,
    readCampaignResourcesFromDisk,
} from './campaignResources';
import {
    applyCampaignResourceOps,
    defaultCampaignResourceQuantities,
    parseCampaignResourceOps,
} from './campaignResourcesCore';
import { writeJsonAtomic } from './workspacePaths';
import { runSerializedCampaignResourcesMutation } from './workspaceStateQueue';

export function tryApplyCampaignResourceTurnOps(
    turnResult: Pick<TurnResult, 'campaignResourceOps'>
): TurnLedgerApplyResult {
    const kit = resolveActiveCampaignKit();
    if (!kit) {
        return { ok: false, applied: false };
    }
    const ops = parseCampaignResourceOps(turnResult.campaignResourceOps);
    if (!ops.length) {
        return { ok: true, applied: false };
    }
    const resPath = getCampaignResourcesPath();
    if (!resPath) {
        return { ok: false, applied: false };
    }

    const result: TurnLedgerApplyResult = { ok: true, applied: false };
    runSerializedCampaignResourcesMutation(() => {
        const current = readCampaignResourcesFromDisk(resPath)
            ?? { version: 1 as const, quantities: defaultCampaignResourceQuantities(kit) };
        const next = applyCampaignResourceOps(current, ops, kit);
        if (JSON.stringify(current) === JSON.stringify(next)) {
            return;
        }
        try {
            writeJsonAtomic(resPath, next);
            clearCampaignResourcesCache();
            result.applied = true;
        } catch (e) {
            result.ok = false;
            console.warn('[campaignResourceTurnOps] failed to save campaign_resources.json', e);
        }
    });
    return result;
}

export function applyCampaignResourceTurnOps(turnResult: Pick<TurnResult, 'campaignResourceOps'>): boolean {
    return tryApplyCampaignResourceTurnOps(turnResult).applied;
}