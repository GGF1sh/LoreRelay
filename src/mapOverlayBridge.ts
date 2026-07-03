// M2 replay/remote overlay wiring — workspace loader for buildMapOverlaySnapshot choke point.

import * as fs from 'fs';
import { getCampaignKitPath } from './campaignKit';
import { isCampaignKitPromptActive } from './gmPromptBuilderCore';
import { loadDiscoveryLedger } from './discoveryLedger';
import { loadGameRules } from './gameRules';
import {
    buildMapOverlaySnapshot,
    deriveKnownNpcIds,
    pickMapOverlaySnapshotKeys,
    sanitizeMapOverlaySnapshot,
    type MapOverlaySnapshot,
} from './mapOverlayCore';
import { loadNpcRegistry } from './npcRegistry';
import { loadSettlementState } from './settlementState';
import type { GameStateWorld } from './types/GameState';
import { buildFogPayload, normalizeFogWorldState } from './fogOfWarCore';
import { livingWorldEnabled } from './livingWorldBridge';
import { loadWorldForge, isWorldForgeEnabled } from './worldForge';
import { loadWorldState, isWorldStateEnabled } from './worldState';
import { getGameStatePath } from './workspacePaths';

function loadWorldBlockFromDisk(): GameStateWorld | undefined {
    const statePath = getGameStatePath();
    if (!statePath || !fs.existsSync(statePath)) { return undefined; }
    try {
        const raw = JSON.parse(fs.readFileSync(statePath, 'utf-8')) as { world?: GameStateWorld };
        return raw.world;
    } catch {
        return undefined;
    }
}

/**
 * Builds a FoW-safe map overlay snapshot from current workspace canonical state.
 * Single choke point for Webview, replay export, and remote play payloads.
 */
export function buildWorkspaceMapOverlay(currentLocationId?: string): MapOverlaySnapshot {
    if (!isWorldForgeEnabled()) {
        return sanitizeMapOverlaySnapshot({ version: 1, markers: [] });
    }

    const forge = loadWorldForge();
    if (!forge) {
        return sanitizeMapOverlaySnapshot({ version: 1, markers: [] });
    }

    const simEnabled = isWorldStateEnabled();
    const worldState = simEnabled ? loadWorldState() : undefined;
    const gameRules = loadGameRules();
    const registry = loadNpcRegistry();

    let worldBlock = loadWorldBlockFromDisk();
    const resolvedLocationId = currentLocationId
        ?? (typeof worldBlock?.currentLocationId === 'string' ? worldBlock.currentLocationId : undefined);
    worldBlock = normalizeFogWorldState(worldBlock, forge, resolvedLocationId) ?? worldBlock;
    const fog = buildFogPayload(worldBlock, forge);

    const campaignKitActive = isCampaignKitPromptActive({
        enableCampaignKit: gameRules.enableCampaignKit === true,
        hasCampaignKitFile: Boolean(getCampaignKitPath() && fs.existsSync(getCampaignKitPath()!)),
        enableDomainMode: gameRules.enableDomainMode === true,
        enableGuildMode: gameRules.enableGuildMode === true,
        enableEmergentSimulation: gameRules.enableEmergentSimulation === true,
        enableWorldObservatory: gameRules.enableWorldObservatory === true,
        chronicleRecapInPrompt: false,
        enableCommerce: gameRules.enableCommerce === true,
        enableNpcRegistry: gameRules.enableNpcRegistry === true,
        enableNpcRelationships: gameRules.enableNpcRelationships === true,
        livingWorldEnabled: livingWorldEnabled(gameRules),
        worldStateEnabled: simEnabled,
        worldForgeEnabled: true,
        enableTravelEncounters: gameRules.enableTravelEncounters === true,
        enableSettlementMode: gameRules.enableSettlementMode === true,
    });

    const settlementState = gameRules.enableSettlementMode === true ? loadSettlementState() : undefined;

    const snapshot = buildMapOverlaySnapshot({
        forge,
        fog: {
            discoveredRegionIds: fog.discoveredRegionIds,
            rumoredRegionIds: fog.rumoredRegionIds,
        },
        enableNpcAgency: gameRules.enableNpcAgency === true,
        enableNpcRegistry: gameRules.enableNpcRegistry === true,
        enableSettlementMode: gameRules.enableSettlementMode === true,
        enableCampaignKit: campaignKitActive,
        enableFactionReputation: gameRules.enableFactionReputation === true,
        worldTurn: worldState?.worldTurn,
        worldRegions: worldState?.regions,
        worldFactions: worldState?.factions,
        npcPositions: worldState?.npcPositions,
        questHooks: worldState?.questHooks,
        settlementState,
        discoveryLedger: campaignKitActive ? loadDiscoveryLedger() : undefined,
        npcRegistry: registry,
        knownNpcIds: deriveKnownNpcIds(registry, fog.visitedLocationIds),
    });

    return sanitizeMapOverlaySnapshot(snapshot);
}

/** Allow-listed projection for replay/remote payloads (tests + export guards). */
export function pickWorkspaceMapOverlayForExport(
    currentLocationId?: string
): Record<string, unknown> {
    return pickMapOverlaySnapshotKeys(buildWorkspaceMapOverlay(currentLocationId));
}