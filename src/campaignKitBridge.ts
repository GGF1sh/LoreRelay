// Campaign Kit: webview payload + job board prompt bridge.

import { loadWorldForge, isWorldForgeEnabled } from './worldForge';
import { resolveActiveCampaignKit } from './campaignKit';
import { loadDiscoveryLedger } from './discoveryLedger';
import { resolveCampaignResourcesForPrompt } from './campaignResources';
import type { CampaignKitConfig } from './campaignKitCore';
import type { DiscoveryLedgerDocument } from './discoveryLedgerCore';
import {
    pickDiscoveriesForWebviewCore,
    pickResourcesForWebviewCore,
} from './campaignLedgerWebviewSanitizeCore';
import { filterJobBoardByQuestHooks } from './campaignJobQuestCore';
import {
    buildCampaignJobBoard,
    buildCampaignJobBoardPromptBlock,
    resolveCampaignHubLocation,
    type CampaignJobBoardEntry,
} from './campaignJobBoardCore';
import type { QuestHook } from './worldStateCore';
import type { Region, WorldLocation } from './worldForgeCore';
import type { CampaignJobBoardContext } from './campaignJobBoardCore';

export interface CampaignKitWebviewPayload {
    kitId: string;
    kitName: string;
    loop: CampaignKitConfig['loop'];
    hubLocationId: string;
    hubLocationName: string;
}

function resolveLocationName(locationId: string): string | undefined {
    if (!isWorldForgeEnabled()) { return undefined; }
    const forge = loadWorldForge();
    if (!forge) { return undefined; }
    const location = forge.geography.locations.find((l) => l.id === locationId);
    return location?.name || locationId;
}

/** FoW-safe discovery list for World tab (delegates to pure core). */
export function pickDiscoveriesForWebview(
    ledger: DiscoveryLedgerDocument | undefined,
    maxEntries = 24
) {
    return pickDiscoveriesForWebviewCore(ledger, {
        maxEntries,
        resolveSiteName: (siteId) => resolveLocationName(siteId),
    });
}

export function pickJobBoardForWebview(
    entries: CampaignJobBoardEntry[] | undefined
): CampaignJobBoardEntry[] | undefined {
    if (!entries?.length) { return undefined; }
    return entries.map((e) => ({
        id: e.id,
        kind: e.kind,
        title: e.title,
        summary: e.summary,
        siteId: e.siteId,
        siteName: e.siteName,
        difficultyHint: e.difficultyHint,
        rewardHint: e.rewardHint,
        factionId: e.factionId,
    }));
}

/** kit.resources ordering preserved so the World tab shows a stable, genre-appropriate list. */
export function pickResourcesForWebview(kit: CampaignKitConfig) {
    const doc = resolveCampaignResourcesForPrompt();
    return pickResourcesForWebviewCore(kit.resources, doc?.quantities);
}

export function resolveCampaignBoardContext(
    currentLocationId: string | null | undefined,
    worldTurn: number
): CampaignJobBoardContext | undefined {
    const kit = resolveActiveCampaignKit();
    if (!kit) { return undefined; }
    const forge = isWorldForgeEnabled() ? loadWorldForge() : undefined;
    const locations: WorldLocation[] = forge?.geography.locations ?? [];
    const regions: Region[] = forge?.geography.regions ?? [];
    const hub = resolveCampaignHubLocation(locations, currentLocationId);
    const hubLocationId = hub?.id ?? 'hub';
    return {
        kit,
        hubLocationId,
        hubLocationName: hub?.name ?? hubLocationId,
        locations,
        regions,
        worldSeed: forge?.meta.worldSeed ?? kit.id,
        worldTurn: Math.max(0, Math.floor(worldTurn)),
    };
}

export function buildCampaignKitWebviewPayload(
    currentLocationId?: string | null,
    worldTurn = 0,
    questHooks?: QuestHook[]
): {
    enabled: boolean;
    campaignKit?: CampaignKitWebviewPayload;
    discoveries?: ReturnType<typeof pickDiscoveriesForWebview>;
    jobBoard?: ReturnType<typeof pickJobBoardForWebview>;
    resources?: ReturnType<typeof pickResourcesForWebview>;
} {
    const ctx = resolveCampaignBoardContext(currentLocationId, worldTurn);
    if (!ctx) {
        return { enabled: false };
    }

    const board = filterJobBoardByQuestHooks(
        buildCampaignJobBoard(ctx),
        questHooks
    );

    return {
        enabled: true,
        campaignKit: {
            kitId: ctx.kit.id,
            kitName: ctx.kit.name,
            loop: ctx.kit.loop,
            hubLocationId: ctx.hubLocationId,
            hubLocationName: ctx.hubLocationName,
        },
        discoveries: pickDiscoveriesForWebview(loadDiscoveryLedger()),
        jobBoard: pickJobBoardForWebview(board),
        resources: pickResourcesForWebview(ctx.kit),
    };
}

export function buildCampaignJobBoardPromptContext(
    currentLocationId?: string | null,
    worldTurn = 0
): string {
    const ctx = resolveCampaignBoardContext(currentLocationId, worldTurn);
    if (!ctx) { return ''; }

    const board = buildCampaignJobBoard(ctx);
    return buildCampaignJobBoardPromptBlock(ctx.kit, board, ctx.hubLocationName);
}