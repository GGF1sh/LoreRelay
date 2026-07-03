// Settlement Mode M2a: FoW-safe map overlay snapshot (pure, no vscode/fs).

import type { WorldForge, Faction } from './worldForgeCore';
import { buildCartographyLayoutSpec, CARTOGRAPHY_MAP_SIZE } from './cartographyLayoutCore';
import { resolveLocationRegionId } from './fogOfWarCore';
import type { DiscoveryLedgerDocument } from './discoveryLedgerCore';
import { listNpcPresence } from './npcAgencyCore';
import type { NpcRegistry } from './npcRegistryCore';
import type { QuestHook, RegionWorldState, FactionWorldState } from './worldStateCore';
import type { NpcPositionsMap } from './livingWorldTypes';
import {
    settlementModeEnabled,
    type SettlementStateV1,
} from './settlementCore';
import { TILE_OVERMAP_SIZE } from './tileOvermapCore';

export const MAP_OVERLAY_VERSION = 1 as const;

export type OverlayMarkerKind =
    | 'npc'
    | 'merchant'
    | 'caravan'
    | 'faction_control'
    | 'quest'
    | 'discovery'
    | 'settlement_pressure';

export type OverlayFogVisibility = 'discovered' | 'rumored';
export type OverlayTone = 'friendly' | 'neutral' | 'hostile' | 'unknown';

export interface OverlayMarker {
    id: string;
    kind: OverlayMarkerKind;
    x: number;
    y: number;
    label: string;
    fogVisibility: OverlayFogVisibility;
    tone?: OverlayTone;
    detail?: string;
}

export interface MapOverlaySnapshot {
    version: typeof MAP_OVERLAY_VERSION;
    markers: OverlayMarker[];
}

export const OVERLAY_MARKER_KEYS = [
    'id',
    'kind',
    'x',
    'y',
    'label',
    'fogVisibility',
    'tone',
    'detail',
] as const;

export const MAX_OVERLAY_NPC = 40;
export const MAX_OVERLAY_MERCHANT = 20;
export const MAX_OVERLAY_CARAVAN = 20;
export const MAX_OVERLAY_FACTION = 50;
export const MAX_OVERLAY_QUEST = 40;
export const MAX_OVERLAY_DISCOVERY = 40;
export const MAX_OVERLAY_PRESSURE = 20;
export const MAX_OVERLAY_TOTAL = 200;
export const MAX_OVERLAY_LABEL = 64;
export const MAX_OVERLAY_DETAIL = 120;

export type SettlementPressureBand = 'calm' | 'strained' | 'unrest' | 'crisis';

export interface MapOverlayFogInput {
    discoveredRegionIds: readonly string[];
    rumoredRegionIds: readonly string[];
}

export interface MapOverlayInputs {
    forge: WorldForge;
    fog: MapOverlayFogInput;
    gridSize?: number;
    enableNpcAgency: boolean;
    enableNpcRegistry: boolean;
    enableSettlementMode: boolean;
    enableCampaignKit: boolean;
    enableFactionReputation?: boolean;
    worldTurn?: number;
    worldRegions?: Record<string, RegionWorldState>;
    worldFactions?: Record<string, FactionWorldState>;
    npcPositions?: NpcPositionsMap;
    questHooks?: QuestHook[];
    settlementState?: SettlementStateV1;
    discoveryLedger?: DiscoveryLedgerDocument;
    npcRegistry?: NpcRegistry;
    /** NPCs safe to reveal on the map (met, public, or otherwise cleared). */
    knownNpcIds?: ReadonlySet<string>;
}

const KIND_CAPS: Record<OverlayMarkerKind, number> = {
    npc: MAX_OVERLAY_NPC,
    merchant: MAX_OVERLAY_MERCHANT,
    caravan: MAX_OVERLAY_CARAVAN,
    faction_control: MAX_OVERLAY_FACTION,
    quest: MAX_OVERLAY_QUEST,
    discovery: MAX_OVERLAY_DISCOVERY,
    settlement_pressure: MAX_OVERLAY_PRESSURE,
};

function clampText(raw: string, max: number): string {
    const t = raw.trim().replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ');
    return t.slice(0, max);
}

export function regionCoordToTileIndex(coord: number, gridSize: number): number {
    const clamped = Math.max(0, Math.min(CARTOGRAPHY_MAP_SIZE, coord));
    return Math.min(gridSize - 1, Math.floor((clamped / CARTOGRAPHY_MAP_SIZE) * gridSize));
}

export function resolveRegionTileCoords(
    forge: WorldForge,
    regionId: string,
    gridSize: number
): { x: number; y: number } | undefined {
    const region = forge.geography.regions.find((r) => r.id === regionId);
    if (!region) { return undefined; }
    return {
        x: regionCoordToTileIndex(region.x ?? 0, gridSize),
        y: regionCoordToTileIndex(region.y ?? 0, gridSize),
    };
}

function regionVisibility(
    regionId: string | undefined,
    discovered: ReadonlySet<string>,
    rumored: ReadonlySet<string>
): OverlayFogVisibility | 'hidden' {
    if (!regionId) { return 'hidden'; }
    if (discovered.has(regionId)) { return 'discovered'; }
    if (rumored.has(regionId)) { return 'rumored'; }
    return 'hidden';
}

function factionById(forge: WorldForge, factionId: string): Faction | undefined {
    return forge.factions.find((f) => f.id === factionId);
}

function factionTone(
    forge: WorldForge,
    factionId: string,
    factionStates: Record<string, FactionWorldState> | undefined,
    reputationEnabled: boolean
): OverlayTone {
    if (!reputationEnabled) {
        const f = factionById(forge, factionId);
        if (f?.type === 'hostile') { return 'hostile'; }
        if (f?.type === 'friendly') { return 'friendly'; }
        return 'neutral';
    }
    const rep = factionStates?.[factionId]?.playerReputation ?? 0;
    if (rep <= -40) { return 'hostile'; }
    if (rep >= 40) { return 'friendly'; }
    return 'neutral';
}

export function deriveSettlementPressureBand(state: SettlementStateV1): SettlementPressureBand {
    const morale = state.morale ?? 50;
    const safety = state.safety ?? 50;
    const unresolved = state.incidents.filter((i) => !i.resolved).length;
    const shortage = state.stocks.some((s) => s.amount <= 2);

    if (safety < 25 || morale < 20 || unresolved >= 4) { return 'crisis'; }
    if (safety < 45 || morale < 40 || unresolved >= 2 || shortage) { return 'unrest'; }
    if (safety < 60 || morale < 55 || shortage) { return 'strained'; }
    return 'calm';
}

export function pressureBandLabel(band: SettlementPressureBand): string {
    switch (band) {
        case 'calm': return 'Settlement calm';
        case 'strained': return 'Settlement strained';
        case 'unrest': return 'Settlement unrest';
        case 'crisis': return 'Settlement crisis';
        default: return 'Settlement pressure';
    }
}

/** Allow-listed marker projection — single choke point for Webview/replay/remote. */
export function sanitizeOverlayMarker(raw: OverlayMarker): OverlayMarker {
    const out: OverlayMarker = {
        id: clampText(raw.id, 64),
        kind: raw.kind,
        x: Math.max(0, Math.min(63, Math.floor(raw.x))),
        y: Math.max(0, Math.min(63, Math.floor(raw.y))),
        label: clampText(raw.label, MAX_OVERLAY_LABEL),
        fogVisibility: raw.fogVisibility === 'rumored' ? 'rumored' : 'discovered',
    };
    if (raw.tone === 'friendly' || raw.tone === 'neutral' || raw.tone === 'hostile' || raw.tone === 'unknown') {
        out.tone = raw.tone;
    }
    if (raw.detail) {
        out.detail = clampText(raw.detail, MAX_OVERLAY_DETAIL);
    }
    return out;
}

function capMarkersByKind(markers: OverlayMarker[]): OverlayMarker[] {
    const kindCounts = new Map<OverlayMarkerKind, number>();
    const out: OverlayMarker[] = [];
    const sorted = [...markers].sort((a, b) => a.id.localeCompare(b.id));
    for (const marker of sorted) {
        const count = kindCounts.get(marker.kind) ?? 0;
        const cap = KIND_CAPS[marker.kind];
        if (count >= cap) { continue; }
        kindCounts.set(marker.kind, count + 1);
        out.push(marker);
        if (out.length >= MAX_OVERLAY_TOTAL) { break; }
    }
    return out;
}

function buildNpcMarkers(inputs: MapOverlayInputs, gridSize: number): OverlayMarker[] {
    if (!inputs.enableNpcRegistry || !inputs.enableNpcAgency || !inputs.npcRegistry) {
        return [];
    }
    const discovered = new Set(inputs.fog.discoveredRegionIds);
    const rumored = new Set(inputs.fog.rumoredRegionIds);
    const known = inputs.knownNpcIds ?? new Set<string>();
    const worldTurn = inputs.worldTurn ?? 0;
    const positions = inputs.npcPositions ?? {};
    const presence = listNpcPresence(
        inputs.npcRegistry.npcs,
        positions,
        worldTurn,
        true
    );
    const markers: OverlayMarker[] = [];
    for (const p of presence) {
        if (!known.has(p.npcId)) { continue; }
        const regionId = resolveLocationRegionId(inputs.forge, p.locationId);
        const vis = regionVisibility(regionId, discovered, rumored);
        if (vis === 'hidden') { continue; }
        const coords = regionId ? resolveRegionTileCoords(inputs.forge, regionId, gridSize) : undefined;
        if (!coords) { continue; }
        const label = vis === 'rumored'
            ? (p.inTransit ? 'Traveler rumored' : 'Figure rumored')
            : (p.inTransit ? `${p.name} (en route)` : p.name);
        markers.push({
            id: `npc_${p.npcId}`,
            kind: 'npc',
            x: coords.x,
            y: coords.y,
            label: clampText(label, MAX_OVERLAY_LABEL),
            fogVisibility: vis,
            tone: vis === 'rumored' ? 'unknown' : 'neutral',
            detail: p.inTransit ? 'Movement noted' : undefined,
        });
    }
    return markers;
}

function buildMerchantMarkers(inputs: MapOverlayInputs, gridSize: number): OverlayMarker[] {
    if (!settlementModeEnabled({ enableSettlementMode: inputs.enableSettlementMode }) || !inputs.settlementState) {
        return [];
    }
    const discovered = new Set(inputs.fog.discoveredRegionIds);
    const rumored = new Set(inputs.fog.rumoredRegionIds);
    const settlement = inputs.settlementState;
    const regionId = settlement.locationId
        ? resolveLocationRegionId(inputs.forge, settlement.locationId)
        : undefined;
    const vis = regionVisibility(regionId, discovered, rumored);
    if (vis === 'hidden' || !regionId) { return []; }
    const coords = resolveRegionTileCoords(inputs.forge, regionId, gridSize);
    if (!coords) { return []; }

    const markers: OverlayMarker[] = [];
    for (const merchant of settlement.merchants) {
        const label = vis === 'rumored' ? 'Merchant rumored' : `Merchant ${merchant.npcId}`;
        markers.push({
            id: `merchant_${merchant.npcId}`,
            kind: 'merchant',
            x: coords.x,
            y: coords.y,
            label,
            fogVisibility: vis,
            tone: 'unknown',
        });
    }
    return markers;
}

function buildCaravanMarkers(inputs: MapOverlayInputs, gridSize: number): OverlayMarker[] {
    if (!settlementModeEnabled({ enableSettlementMode: inputs.enableSettlementMode }) || !inputs.settlementState) {
        return [];
    }
    const discovered = new Set(inputs.fog.discoveredRegionIds);
    const rumored = new Set(inputs.fog.rumoredRegionIds);
    const settlement = inputs.settlementState;
    const regionId = settlement.locationId
        ? resolveLocationRegionId(inputs.forge, settlement.locationId)
        : undefined;
    const vis = regionVisibility(regionId, discovered, rumored);
    if (vis === 'hidden' || !regionId) { return []; }
    const coords = resolveRegionTileCoords(inputs.forge, regionId, gridSize);
    if (!coords) { return []; }

    const worldTurn = inputs.worldTurn ?? 0;
    const markers: OverlayMarker[] = [];
    for (const visitor of settlement.visitors) {
        if (visitor.purpose !== 'trade' && visitor.purpose !== 'diplomacy') { continue; }
        if (visitor.untilWorldTurn <= worldTurn) { continue; }
        markers.push({
            id: `caravan_${visitor.npcId}`,
            kind: 'caravan',
            x: coords.x,
            y: coords.y,
            label: vis === 'rumored' ? 'Caravan rumored' : 'Trade caravan',
            fogVisibility: vis,
            tone: 'unknown',
        });
    }
    return markers;
}

function buildFactionMarkers(inputs: MapOverlayInputs, gridSize: number): OverlayMarker[] {
    if (!inputs.worldRegions) { return []; }
    const discovered = new Set(inputs.fog.discoveredRegionIds);
    const rumored = new Set(inputs.fog.rumoredRegionIds);
    const markers: OverlayMarker[] = [];
    for (const [regionId, state] of Object.entries(inputs.worldRegions)) {
        const vis = regionVisibility(regionId, discovered, rumored);
        if (vis === 'hidden') { continue; }
        const factionId = state.controllingFaction;
        if (!factionId) { continue; }
        const coords = resolveRegionTileCoords(inputs.forge, regionId, gridSize);
        if (!coords) { continue; }
        const faction = factionById(inputs.forge, factionId);
        const label = vis === 'rumored'
            ? 'Faction presence rumored'
            : (faction?.name ?? 'Faction control');
        markers.push({
            id: `faction_${regionId}_${factionId}`,
            kind: 'faction_control',
            x: coords.x,
            y: coords.y,
            label: clampText(label, MAX_OVERLAY_LABEL),
            fogVisibility: vis,
            tone: vis === 'rumored'
                ? 'unknown'
                : factionTone(inputs.forge, factionId, inputs.worldFactions, inputs.enableFactionReputation === true),
        });
    }
    return markers;
}

function resolveHookRegionId(forge: WorldForge, hook: QuestHook): string | undefined {
    const related = hook.relatedId;
    if (forge.geography.regions.some((r) => r.id === related)) { return related; }
    return resolveLocationRegionId(forge, related);
}

function buildQuestMarkers(inputs: MapOverlayInputs, gridSize: number): OverlayMarker[] {
    const hooks = inputs.questHooks ?? [];
    if (!hooks.length) { return []; }
    const discovered = new Set(inputs.fog.discoveredRegionIds);
    const rumored = new Set(inputs.fog.rumoredRegionIds);
    const markers: OverlayMarker[] = [];
    for (const hook of hooks) {
        if (hook.status !== 'available' && hook.status !== 'active') { continue; }
        const regionId = resolveHookRegionId(inputs.forge, hook);
        const vis = regionVisibility(regionId, discovered, rumored);
        if (vis === 'hidden' || !regionId) { continue; }
        const coords = resolveRegionTileCoords(inputs.forge, regionId, gridSize);
        if (!coords) { continue; }
        markers.push({
            id: `quest_${hook.id}`,
            kind: 'quest',
            x: coords.x,
            y: coords.y,
            label: vis === 'rumored' ? 'Quest lead rumored' : clampText(hook.title, MAX_OVERLAY_LABEL),
            fogVisibility: vis,
            tone: 'unknown',
            detail: vis === 'discovered' ? 'Job or hook' : undefined,
        });
    }
    return markers;
}

function buildDiscoveryMarkers(inputs: MapOverlayInputs, gridSize: number): OverlayMarker[] {
    if (!inputs.enableCampaignKit || !inputs.discoveryLedger?.entries.length) {
        return [];
    }
    const discovered = new Set(inputs.fog.discoveredRegionIds);
    const rumored = new Set(inputs.fog.rumoredRegionIds);
    const markers: OverlayMarker[] = [];
    for (const entry of inputs.discoveryLedger.entries) {
        if (entry.status === 'sold' || entry.status === 'consumed') { continue; }
        const regionId = entry.siteId
            ? resolveLocationRegionId(inputs.forge, entry.siteId)
            : undefined;
        const vis = regionVisibility(regionId, discovered, rumored);
        if (vis === 'hidden' || !regionId) { continue; }
        const coords = resolveRegionTileCoords(inputs.forge, regionId, gridSize);
        if (!coords) { continue; }
        const unidentified = entry.status === 'unidentified';
        const label = unidentified || vis === 'rumored'
            ? 'Unknown find'
            : clampText(entry.identifiedLabel || entry.label, MAX_OVERLAY_LABEL);
        markers.push({
            id: `discovery_${entry.id}`,
            kind: 'discovery',
            x: coords.x,
            y: coords.y,
            label,
            fogVisibility: vis,
            tone: 'unknown',
        });
    }
    return markers;
}

function buildPressureMarkers(inputs: MapOverlayInputs, gridSize: number): OverlayMarker[] {
    if (!settlementModeEnabled({ enableSettlementMode: inputs.enableSettlementMode }) || !inputs.settlementState) {
        return [];
    }
    const settlement = inputs.settlementState;
    const regionId = settlement.locationId
        ? resolveLocationRegionId(inputs.forge, settlement.locationId)
        : undefined;
    const discovered = new Set(inputs.fog.discoveredRegionIds);
    const rumored = new Set(inputs.fog.rumoredRegionIds);
    const vis = regionVisibility(regionId, discovered, rumored);
    if (vis === 'hidden' || !regionId) { return []; }
    const coords = resolveRegionTileCoords(inputs.forge, regionId, gridSize);
    if (!coords) { return []; }
    const band = deriveSettlementPressureBand(settlement);
    if (band === 'calm' && vis === 'rumored') { return []; }
    return [{
        id: `pressure_${settlement.settlementId}`,
        kind: 'settlement_pressure',
        x: coords.x,
        y: coords.y,
        label: vis === 'rumored' ? 'Settlement rumored' : pressureBandLabel(band),
        fogVisibility: vis,
        tone: band === 'crisis' ? 'hostile' : band === 'unrest' ? 'neutral' : 'unknown',
        detail: vis === 'discovered' ? `Mood: ${band}` : undefined,
    }];
}

export function buildMapOverlaySnapshot(inputs: MapOverlayInputs): MapOverlaySnapshot {
    if (!inputs.forge?.geography?.regions?.length) {
        return { version: MAP_OVERLAY_VERSION, markers: [] };
    }
    const gridSize = inputs.gridSize ?? TILE_OVERMAP_SIZE;
    buildCartographyLayoutSpec(inputs.forge);

    const raw: OverlayMarker[] = [
        ...buildNpcMarkers(inputs, gridSize),
        ...buildMerchantMarkers(inputs, gridSize),
        ...buildCaravanMarkers(inputs, gridSize),
        ...buildFactionMarkers(inputs, gridSize),
        ...buildQuestMarkers(inputs, gridSize),
        ...buildDiscoveryMarkers(inputs, gridSize),
        ...buildPressureMarkers(inputs, gridSize),
    ];

    const markers = capMarkersByKind(raw.map(sanitizeOverlayMarker));
    return { version: MAP_OVERLAY_VERSION, markers };
}

/** NPCs the player has met or encountered at a visited location. */
export function deriveKnownNpcIds(
    registry: NpcRegistry | undefined,
    visitedLocationIds: readonly string[]
): Set<string> {
    const known = new Set<string>();
    if (!registry?.npcs) { return known; }
    const visited = new Set(visitedLocationIds);
    for (const [npcId, npc] of Object.entries(registry.npcs)) {
        if ((npc.disposition?.lastInteractionTurn ?? 0) > 0) {
            known.add(npcId);
        }
        if (npc.locationId && visited.has(npc.locationId)) {
            known.add(npcId);
        }
    }
    return known;
}

/** Returns only allow-listed keys present on a marker (for tests and export guards). */
export function pickOverlayMarkerKeys(marker: OverlayMarker): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const key of OVERLAY_MARKER_KEYS) {
        if (Object.prototype.hasOwnProperty.call(marker, key) && marker[key as keyof OverlayMarker] !== undefined) {
            out[key] = marker[key as keyof OverlayMarker];
        }
    }
    return out;
}