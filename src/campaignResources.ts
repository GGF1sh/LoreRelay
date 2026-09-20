// Campaign Kit Phase G: workspace campaign_resources.json loader.

import * as fs from 'fs';
import * as path from 'path';
import { getWorkspacePath } from './workspacePaths';
import { resolveActiveCampaignKit } from './campaignKit';
import {
    buildCampaignResourcesPromptBlock,
    defaultCampaignResourceQuantities,
    parseCampaignResourcesDocument,
    type CampaignResourcesDocument,
} from './campaignResourcesCore';

export const CAMPAIGN_RESOURCES_FILENAME = 'campaign_resources.json';

let cachedPath = '';
let cachedMtime = 0;
let cachedDoc: CampaignResourcesDocument | undefined;

export function getCampaignResourcesPath(): string | undefined {
    const ws = getWorkspacePath();
    return ws ? path.join(ws, CAMPAIGN_RESOURCES_FILENAME) : undefined;
}

export function clearCampaignResourcesCache(): void {
    cachedPath = '';
    cachedMtime = 0;
    cachedDoc = undefined;
}

/** Fresh disk read for serialized mutations (bypasses loader cache). */
export function readCampaignResourcesFromDisk(resPath?: string): CampaignResourcesDocument | undefined {
    const resolved = resPath ?? getCampaignResourcesPath();
    if (!resolved || !fs.existsSync(resolved)) {
        return undefined;
    }
    try {
        const raw = JSON.parse(fs.readFileSync(resolved, 'utf-8'));
        return parseCampaignResourcesDocument(raw);
    } catch {
        return undefined;
    }
}

export function loadCampaignResources(): CampaignResourcesDocument | undefined {
    const resPath = getCampaignResourcesPath();
    if (!resPath || !fs.existsSync(resPath)) {
        return undefined;
    }
    try {
        const stat = fs.statSync(resPath);
        if (cachedDoc && cachedPath === resPath && cachedMtime === stat.mtimeMs) {
            return cachedDoc;
        }
        const parsed = readCampaignResourcesFromDisk(resPath);
        if (!parsed) {
            clearCampaignResourcesCache();
            return undefined;
        }
        cachedPath = resPath;
        cachedMtime = stat.mtimeMs;
        cachedDoc = parsed;
        return parsed;
    } catch {
        return undefined;
    }
}

/** Stored ledger, or default starting supplies for the active kit if none persisted yet. */
export function resolveCampaignResourcesForPrompt(): CampaignResourcesDocument | undefined {
    const kit = resolveActiveCampaignKit();
    if (!kit) { return undefined; }
    return loadCampaignResources() ?? { version: 1, quantities: defaultCampaignResourceQuantities(kit) };
}

export function buildCampaignResourcesPromptContext(): string {
    const kit = resolveActiveCampaignKit();
    if (!kit) { return ''; }
    return buildCampaignResourcesPromptBlock(resolveCampaignResourcesForPrompt(), kit);
}
