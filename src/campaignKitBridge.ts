// Campaign Kit: webview payload + job board prompt bridge.

import { loadWorldForge, isWorldForgeEnabled } from './worldForge';
import { resolveActiveCampaignKit } from './campaignKit';
import { loadDiscoveryLedger } from './discoveryLedger';
import type { CampaignKitConfig } from './campaignKitCore';
import type { DiscoveryEntry, DiscoveryLedgerDocument, DiscoveryStatus } from './discoveryLedgerCore';
import {
    buildCampaignJobBoard,
    buildCampaignJobBoardPromptBlock,
    resolveCampaignHubLocation,
    type CampaignJobBoardEntry,
} from './campaignJobBoardCore';

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

export function buildCampaignKitWebviewPayload(
    currentLocationId?: string | null,
    worldTurn = 0
): {
    enabled: boolean;
    campaignKit?: CampaignKitWebviewPayload;
    discoveries?: ReturnType<typeof pickDiscoveriesForWebview>;
    jobBoard?: ReturnType<typeof pickJobBoardForWebview>;
} {
    const kit = resolveActiveCampaignKit();
    if (!kit) {
        return { enabled: false };
    }

    const forge = isWorldForgeEnabled() ? loadWorldForge() : undefined;
    const locations = forge?.geography.locations ?? [];
    const regions = forge?.geography.regions ?? [];
    const hub = resolveCampaignHubLocation(locations, currentLocationId);
    const hubLocationId = hub?.id ?? 'hub';
    const hubLocationName = hub?.name ?? hubLocationId;
    const worldSeed = forge?.meta.worldSeed ?? kit.id;

    const board = buildCampaignJobBoard({
        kit,
        hubLocationId,
        hubLocationName,
        locations,
        regions,
        worldSeed,
        worldTurn: Math.max(0, Math.floor(worldTurn)),
    });

    return {
        enabled: true,
        campaignKit: {
            kitId: kit.id,
            kitName: kit.name,
            loop: kit.loop,
            hubLocationId,
            hubLocationName,
        },
        discoveries: pickDiscoveriesForWebview(loadDiscoveryLedger()),
        jobBoard: pickJobBoardForWebview(board),
    };
}

export function buildCampaignJobBoardPromptContext(
    currentLocationId?: string | null,
    worldTurn = 0
): string {
    const kit = resolveActiveCampaignKit();
    if (!kit) { return ''; }

    const forge = isWorldForgeEnabled() ? loadWorldForge() : undefined;
    const locations = forge?.geography.locations ?? [];
    const regions = forge?.geography.regions ?? [];
    const hub = resolveCampaignHubLocation(locations, currentLocationId);
    const hubLocationId = hub?.id ?? 'hub';
    const hubLocationName = hub?.name ?? hubLocationId;
    const worldSeed = forge?.meta.worldSeed ?? kit.id;

    const board = buildCampaignJobBoard({
        kit,
        hubLocationId,
        hubLocationName,
        locations,
        regions,
        worldSeed,
        worldTurn: Math.max(0, Math.floor(worldTurn)),
    });

    return buildCampaignJobBoardPromptBlock(kit, board, hubLocationName);
}