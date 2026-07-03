// Campaign Kit Phase G: persist campaignResourceOps to campaign_resources.json.

import type { TurnResult } from './types/TurnResult';
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

export function applyCampaignResourceTurnOps(turnResult: Pick<TurnResult, 'campaignResourceOps'>): boolean {
    const kit = resolveActiveCampaignKit();
    if (!kit) {
        return false;
    }
    const ops = parseCampaignResourceOps(turnResult.campaignResourceOps);
    if (!ops.length) {
        return false;
    }
    const resPath = getCampaignResourcesPath();
    if (!resPath) {
        return false;
    }

    let applied = false;
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
            applied = true;
        } catch (e) {
            console.warn('[campaignResourceTurnOps] failed to save campaign_resources.json', e);
        }
    });
    return applied;
}