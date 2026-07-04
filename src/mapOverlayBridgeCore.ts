// Pure map overlay context build — no fs/vscode (testable from Node scripts).

import type { GameRules } from './gameRules';
import {
    buildMapOverlaySnapshot,
    deriveKnownNpcIds,
    sanitizeMapOverlaySnapshot,
    type MapOverlayFogInput,
    type MapOverlaySnapshot,
} from './mapOverlayCore';
import type { DiscoveryLedgerDocument } from './discoveryLedgerCore';
import type { NpcRegistry } from './npcRegistryCore';
import type { SettlementStateV1 } from './settlementCore';
import type { VehicleState } from './vehicleCore';
import type { WorldForge } from './worldForgeCore';
import type { WorldState } from './worldState';

export type MapOverlayWorkspaceContext = {
    forge: WorldForge;
    fog: MapOverlayFogInput;
    gameRules: GameRules;
    simEnabled: boolean;
    worldState?: WorldState;
    registry: NpcRegistry;
    settlementState?: SettlementStateV1;
    campaignKitActive: boolean;
    discoveryLedger?: DiscoveryLedgerDocument;
    knownNpcIds: ReadonlySet<string>;
    vehicleState?: VehicleState;
    currentLocationId?: string;
};

export function buildMapOverlayFromContext(ctx: MapOverlayWorkspaceContext): MapOverlaySnapshot {
    const snapshot = buildMapOverlaySnapshot({
        forge: ctx.forge,
        fog: ctx.fog,
        enableNpcAgency: ctx.gameRules.enableNpcAgency === true,
        enableNpcRegistry: ctx.gameRules.enableNpcRegistry === true,
        enableSettlementMode: ctx.gameRules.enableSettlementMode === true,
        enableCampaignKit: ctx.campaignKitActive,
        enableFactionReputation: ctx.gameRules.enableFactionReputation === true,
        worldTurn: ctx.worldState?.worldTurn,
        worldRegions: ctx.worldState?.regions,
        worldFactions: ctx.worldState?.factions,
        npcPositions: ctx.worldState?.npcPositions,
        questHooks: ctx.worldState?.questHooks,
        settlementState: ctx.settlementState,
        discoveryLedger: ctx.campaignKitActive ? ctx.discoveryLedger : undefined,
        npcRegistry: ctx.registry,
        knownNpcIds: ctx.knownNpcIds,
        enableVehicleSystem: ctx.gameRules.enableVehicleSystem === true,
        vehicleState: ctx.vehicleState,
        currentLocationId: ctx.currentLocationId,
        maxNamedNpcCount: ctx.gameRules.maxNamedNpcCount ?? 10,
    });
    return sanitizeMapOverlaySnapshot(snapshot);
}

export { deriveKnownNpcIds };