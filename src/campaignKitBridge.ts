// Campaign Kit: webview payload + job board prompt bridge.

import { loadWorldForge, isWorldForgeEnabled } from './worldForge';
import { resolveActiveCampaignKit } from './campaignKit';
import { loadDiscoveryLedger } from './discoveryLedger';
import type { CampaignKitConfig } from './campaignKitCore';
import type { DiscoveryEntry, DiscoveryLedgerDocument, DiscoveryStatus } from './discoveryLedgerCore';
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

const WEBVIEW_DISCOVERY_STATUSES: readonly DiscoveryStatus[] = [
    'unidentified',
    'identified',
    'appraised',
];

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

function displayLabel(entry: DiscoveryEntry): string {
    if (entry.status === 'unidentified') {
        return entry.label;
    }
    return entry.identifiedLabel || entry.label;
}

/** FoW-safe discovery list for World tab (no GM-only valueHint). */
export function pickDiscoveriesForWebview(
    ledger: DiscoveryLedgerDocument | undefined,
    maxEntries = 24
): Array<{
    id: string;
    kind: DiscoveryEntry['kind'];
    label: string;
    status: DiscoveryStatus;
    siteId?: string;
    siteName?: string;
}> | undefined {
    if (!ledger?.entries.length) { return undefined; }
    const active = ledger.entries
        .filter((e) => WEBVIEW_DISCOVERY_STATUSES.includes(e.status))
        .slice(0, maxEntries)
        .map((e) => ({
            id: e.id,
            kind: e.kind,
            label: displayLabel(e),
            status: e.status,
            siteId: e.siteId,
            siteName: e.siteId ? resolveLocationName(e.siteId) : undefined,
        }));
    return active.length ? active : undefined;
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
    }));
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