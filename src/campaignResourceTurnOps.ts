// Campaign Kit Phase G: persist campaignResourceOps to campaign_resources.json.

import type { TurnResult } from './types/TurnResult';
import { resolveActiveCampaignKit } from './campaignKit';
import {
    clearCampaignResourcesCache,
    getCampaignResourcesPath,
    loadCampaignResources,
} from './campaignResources';
import {
    applyCampaignResourceOps,
    parseCampaignResourceOps,
} from './campaignResourcesCore';
import { writeJsonAtomic } from './workspacePaths';

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
    const current = loadCampaignResources();
    const next = applyCampaignResourceOps(current, ops, kit);
    if (JSON.stringify(current) === JSON.stringify(next)) {
        return false;
    }
    try {
        writeJsonAtomic(resPath, next);
        clearCampaignResourcesCache();
        return true;
    } catch (e) {
        console.warn('[campaignResourceTurnOps] failed to save campaign_resources.json', e);
        return false;
    }
}
