import * as fs from 'fs';
import * as path from 'path';
import { getWorkspacePath } from './workspacePaths';
import { loadGameRules } from './gameRules';
import { loadWorldForge, loadWorldForgeDocument } from './worldForge';
import {
    buildCampaignKitPromptBlock,
    getCampaignKitPreset,
    inferCampaignKitIdFromTheme,
    parseCampaignKitConfig,
    type CampaignKitConfig,
} from './campaignKitCore';

export const CAMPAIGN_KIT_FILENAME = 'campaign_kit.json';

let cachedPath = '';
let cachedMtime = 0;
let cachedKit: CampaignKitConfig | undefined;

export function getCampaignKitPath(): string | undefined {
    const ws = getWorkspacePath();
    return ws ? path.join(ws, CAMPAIGN_KIT_FILENAME) : undefined;
}

export function clearCampaignKitCache(): void {
    cachedPath = '';
    cachedMtime = 0;
    cachedKit = undefined;
}

export function loadCampaignKitFile(): CampaignKitConfig | undefined {
    const kitPath = getCampaignKitPath();
    if (!kitPath || !fs.existsSync(kitPath)) {
        return undefined;
    }
    try {
        const stat = fs.statSync(kitPath);
        if (cachedKit && cachedPath === kitPath && cachedMtime === stat.mtimeMs) {
            return cachedKit;
        }
        const raw = JSON.parse(fs.readFileSync(kitPath, 'utf-8'));
        const parsed = parseCampaignKitConfig(raw);
        cachedPath = kitPath;
        cachedMtime = stat.mtimeMs;
        cachedKit = parsed;
        return parsed;
    } catch {
        return undefined;
    }
}

function resolveThemeHint(): string {
    const forge = loadWorldForge();
    if (forge?.meta.theme) {
        return forge.meta.theme;
    }
    const rawForge = loadWorldForgeDocument() as { meta?: { theme?: unknown } } | undefined;
    return typeof rawForge?.meta?.theme === 'string' ? rawForge.meta.theme : '';
}

export function resolveActiveCampaignKit(): CampaignKitConfig | undefined {
    const fromFile = loadCampaignKitFile();
    if (fromFile) {
        return fromFile;
    }
    const rules = loadGameRules();
    if (rules.enableCampaignKit !== true) {
        return undefined;
    }
    const explicitId = typeof rules.campaignKitId === 'string' ? rules.campaignKitId : '';
    if (explicitId) {
        return getCampaignKitPreset(explicitId);
    }
    return getCampaignKitPreset(inferCampaignKitIdFromTheme(resolveThemeHint()));
}

export function buildCampaignKitPromptContext(): string {
    return buildCampaignKitPromptBlock(resolveActiveCampaignKit());
}
