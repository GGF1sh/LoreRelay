// Settlement Mode M3a: sanitized isometric view snapshot (pure, no vscode/fs/DOM).

import {
    deriveEffectiveSettlementLayers,
    MAX_SETTLEMENT_NAME_CHARS,
    VALID_SETTLEMENT_LAYER_IDS,
    type ExpandLayerOp,
    type SettlementIncident,
    type SettlementLayerExpansionProfile,
    type SettlementLayerId,
    type SettlementLayoutV1,
    type SettlementMarker,
    type SettlementStateV1,
    type SettlementStructure,
    type SettlementZone,
} from './settlementCore';
import { applyExpandLayerToLayout } from './settlementLayerExpansionCore';
import { hashStringToSeed } from './tileOvermapCore';

export const SETTLEMENT_VIEW_VERSION = 1 as const;

export type SettlementTileCode =
    | 'floor'
    | 'wall'
    | 'gate'
    | 'market'
    | 'workshop'
    | 'stockpile'
    | 'quarters'
    | 'clinic'
    | 'barracks'
    | 'shrine'
    | 'water'
    | 'ruins'
    | 'hazard'
    | 'empty'
    | 'unknown';

export type SettlementViewMarkerKind =
    | 'resident'
    | 'visitor'
    | 'merchant'
    | 'project'
    | 'incident'
    | 'stock_low'
    | 'structure_note'
    | 'player';

export type SettlementViewTone =
    | 'friendly'
    | 'neutral'
    | 'hostile'
    | 'unknown'
    | 'warning'
    | 'critical';

export interface SettlementViewTile {
    x: number;
    y: number;
    z: number;
    code: SettlementTileCode;
    label: string;
    tone?: SettlementViewTone;
}

export interface SettlementViewMarker {
    id: string;
    x: number;
    y: number;
    z: number;
    kind: SettlementViewMarkerKind;
    label: string;
    tone?: SettlementViewTone;
    detail?: string;
}

export interface SettlementLayerSummary {
    id: SettlementLayerId;
    label: string;
}

export interface SettlementViewLegendEntry {
    code: SettlementTileCode | SettlementViewMarkerKind;
    label: string;
    tone?: SettlementViewTone;
}

export interface SettlementViewSnapshot {
    version: typeof SETTLEMENT_VIEW_VERSION;
    settlementId: string;
    name: string;
    layerId: SettlementLayerId;
    layers: SettlementLayerSummary[];
    width: number;
    height: number;
    tiles: SettlementViewTile[];
    markers: SettlementViewMarker[];
    legend: SettlementViewLegendEntry[];
    warnings?: string[];
}

/**
 * M4c: read-only ghost preview of a missing layer, derived from
 * `applyExpandLayerToLayout` in memory. Never persisted; the host computes
 * this once per worldView push and the Webview only draws it.
 */
export interface SettlementExpansionPreview {
    layerId: SettlementLayerId;
    profile: SettlementLayerExpansionProfile;
    tiles: SettlementViewTile[];
    markers: SettlementViewMarker[];
    warnings?: string[];
}

export const SETTLEMENT_EXPANSION_PREVIEW_KEYS = [
    'layerId',
    'profile',
    'tiles',
    'markers',
    'warnings',
] as const;

export const MAX_EXPANSION_PREVIEWS = 8;

/** Only these profiles are offered per missing layer — mirrors PROFILE_DEFAULT_LAYER in settlementLayerExpansionCore. */
const EXPANSION_PROFILES_BY_LAYER: Record<SettlementLayerId, SettlementLayerExpansionProfile[]> = {
    z1: ['roof', 'watchtower'],
    z0: ['generic'],
    'z-1': ['cellar', 'waterworks', 'shelter'],
    'z-2': ['ruins'],
};

export interface SettlementViewOptions {
    maxTiles?: number;
    maxMarkers?: number;
    revealHidden?: boolean;
}

export interface SettlementViewInputs {
    state?: SettlementStateV1;
    layout?: SettlementLayoutV1;
    selectedLayerId?: SettlementLayerId;
    options?: SettlementViewOptions;
}

export const SETTLEMENT_VIEW_TILE_KEYS = ['x', 'y', 'z', 'code', 'label', 'tone'] as const;
export const SETTLEMENT_VIEW_MARKER_KEYS = ['id', 'x', 'y', 'z', 'kind', 'label', 'tone', 'detail'] as const;
export const SETTLEMENT_VIEW_SNAPSHOT_KEYS = [
    'version',
    'settlementId',
    'name',
    'layerId',
    'layers',
    'width',
    'height',
    'tiles',
    'markers',
    'legend',
    'warnings',
] as const;

export const MIN_VIEW_SIZE = 8;
export const MAX_VIEW_SIZE = 32;
export const DEFAULT_FALLBACK_SIZE = 16;
export const LARGE_FALLBACK_SIZE = 24;
export const MAX_VIEW_TILES = 1024;
export const MAX_VIEW_MARKERS = 120;
export const MAX_VIEW_LEGEND = 32;
export const MAX_VIEW_LABEL = 64;
export const MAX_VIEW_DETAIL = 160;
export const MAX_VIEW_WARNINGS = 16;

const VALID_TILE_CODES = new Set<SettlementTileCode>([
    'floor', 'wall', 'gate', 'market', 'workshop', 'stockpile', 'quarters',
    'clinic', 'barracks', 'shrine', 'water', 'ruins', 'hazard', 'empty', 'unknown',
]);

const VALID_MARKER_KINDS = new Set<SettlementViewMarkerKind>([
    'resident', 'visitor', 'merchant', 'project', 'incident', 'stock_low',
    'structure_note', 'player',
]);

const VALID_TONES = new Set<SettlementViewTone>([
    'friendly', 'neutral', 'hostile', 'unknown', 'warning', 'critical',
]);

const LAYER_LABELS: Record<SettlementLayerId, string> = {
    z1: 'Upper deck',
    z0: 'Ground',
    'z-1': 'Cellar',
    'z-2': 'Deep ruins',
};

const TILE_LEGEND_LABELS: Record<SettlementTileCode, string> = {
    floor: 'Floor',
    wall: 'Wall',
    gate: 'Gate',
    market: 'Market',
    workshop: 'Workshop',
    stockpile: 'Stockpile',
    quarters: 'Quarters',
    clinic: 'Clinic',
    barracks: 'Barracks',
    shrine: 'Shrine',
    water: 'Water',
    ruins: 'Ruins',
    hazard: 'Hazard',
    empty: 'Empty',
    unknown: 'Unknown',
};

const MARKER_LEGEND_LABELS: Record<SettlementViewMarkerKind, string> = {
    resident: 'Resident',
    visitor: 'Visitor',
    merchant: 'Merchant',
    project: 'Project',
    incident: 'Incident',
    stock_low: 'Low stock',
    structure_note: 'Structure',
    player: 'Player',
};

function clampText(raw: string, max: number): string {
    const t = raw.trim().replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ');
    return t.slice(0, max);
}

export function layerIdToZ(layerId: SettlementLayerId): number {
    switch (layerId) {
        case 'z1': return 1;
        case 'z0': return 0;
        case 'z-1': return -1;
        case 'z-2': return -2;
        default: return 0;
    }
}

export function resolveSelectedLayerId(raw: SettlementLayerId | undefined): SettlementLayerId {
    if (raw && (VALID_SETTLEMENT_LAYER_IDS as readonly string[]).includes(raw)) {
        return raw;
    }
    return 'z0';
}

function clampCoord(value: number, max: number): number {
    return Math.max(0, Math.min(max - 1, Math.round(value)));
}

function clampViewSize(raw: number | undefined, fallback: number): number {
    const n = typeof raw === 'number' && Number.isFinite(raw) ? Math.round(raw) : fallback;
    return Math.max(MIN_VIEW_SIZE, Math.min(MAX_VIEW_SIZE, n));
}

function inferTileCode(label: string): SettlementTileCode {
    const lower = label.toLowerCase();
    if (/\b(market|bazaar|plaza|trade)\b/.test(lower)) { return 'market'; }
    if (/\b(workshop|forge|smith|craft)\b/.test(lower)) { return 'workshop'; }
    if (/\b(stock|store|warehouse|depot)\b/.test(lower)) { return 'stockpile'; }
    if (/\b(quarter|housing|home|bed)\b/.test(lower)) { return 'quarters'; }
    if (/\b(clinic|hospital|medical|heal)\b/.test(lower)) { return 'clinic'; }
    if (/\b(barrack|guard|garrison)\b/.test(lower)) { return 'barracks'; }
    if (/\b(shrine|temple|altar)\b/.test(lower)) { return 'shrine'; }
    if (/\b(water|well|river|canal)\b/.test(lower)) { return 'water'; }
    if (/\b(gate|door|entrance)\b/.test(lower)) { return 'gate'; }
    if (/\b(ruin|wreck|scrap)\b/.test(lower)) { return 'ruins'; }
    if (/\b(hazard|toxic|radiation|danger)\b/.test(lower)) { return 'hazard'; }
    if (/\b(wall|fence|barrier)\b/.test(lower)) { return 'wall'; }
    return 'floor';
}

function structureStatusTone(status: SettlementStructure['status']): SettlementViewTone {
    switch (status) {
        case 'intact': return 'neutral';
        case 'damaged': return 'warning';
        case 'under_construction': return 'friendly';
        case 'disabled': return 'unknown';
        case 'ruined': return 'critical';
        default: return 'neutral';
    }
}

function incidentSeverityTone(severity: SettlementIncident['severity']): SettlementViewTone {
    switch (severity) {
        case 'info': return 'neutral';
        case 'warning': return 'warning';
        case 'critical': return 'critical';
        default: return 'neutral';
    }
}

function sanitizeIncidentLabel(incident: SettlementIncident): string {
    const kind = clampText(incident.kind || 'incident', 32);
    return clampText(`[${incident.severity}] ${kind}`, MAX_VIEW_LABEL);
}

function stableCoords(
    id: string,
    width: number,
    height: number,
    seed: number,
    margin = 2
): { x: number; y: number } {
    const h = hashStringToSeed(`${seed}:${id}`);
    const innerW = Math.max(1, width - margin * 2);
    const innerH = Math.max(1, height - margin * 2);
    return {
        x: margin + (h % innerW),
        y: margin + (Math.floor(h / innerW) % innerH),
    };
}

function tileKey(x: number, y: number, z: number): string {
    return `${x},${y},${z}`;
}

function markerKey(id: string): string {
    return id;
}

function resolveZoneCenter(
    zone: SettlementZone,
    width: number,
    height: number,
    seed: number
): { x: number; y: number } {
    if (typeof zone.x === 'number' && typeof zone.y === 'number') {
        return { x: clampCoord(zone.x, width), y: clampCoord(zone.y, height) };
    }
    return stableCoords(zone.id, width, height, seed, 1);
}

function expandZoneTiles(
    zone: SettlementZone,
    width: number,
    height: number,
    z: number,
    seed: number,
    revealHidden: boolean
): SettlementViewTile[] {
    if (!revealHidden && zone.id.startsWith('hidden_')) {
        return [];
    }
    const center = resolveZoneCenter(zone, width, height, seed);
    const code = zone.id.startsWith('hidden_') && revealHidden
        ? 'unknown'
        : inferTileCode(zone.label);
    const tone: SettlementViewTone = code === 'hazard' ? 'warning' : 'neutral';
    const label = clampText(zone.label, MAX_VIEW_LABEL);
    const tiles: SettlementViewTile[] = [];
    const radius = code === 'market' || code === 'workshop' ? 1 : 0;
    for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
            const x = clampCoord(center.x + dx, width);
            const y = clampCoord(center.y + dy, height);
            const tileCode = dx === 0 && dy === 0 ? code : (radius > 0 ? 'floor' : code);
            tiles.push({ x, y, z, code: tileCode, label, tone });
        }
    }
    return tiles;
}

function structureToTile(
    structure: SettlementStructure,
    width: number,
    height: number,
    z: number,
    seed: number
): SettlementViewTile {
    const coords = stableCoords(structure.id, width, height, seed, 2);
    const code = inferTileCode(structure.name);
    return {
        x: coords.x,
        y: coords.y,
        z,
        code,
        label: clampText(structure.name, MAX_VIEW_LABEL),
        tone: structureStatusTone(structure.status),
    };
}

function layoutMarkerKind(marker: SettlementMarker): SettlementViewMarkerKind {
    const lower = marker.label.toLowerCase();
    if (/\b(merchant|trader|vendor)\b/.test(lower)) { return 'merchant'; }
    if (/\b(visitor|guest)\b/.test(lower)) { return 'visitor'; }
    if (/\b(player|you)\b/.test(lower)) { return 'player'; }
    if (/\b(project|build|repair)\b/.test(lower)) { return 'project'; }
    return 'structure_note';
}

function layoutMarkerToView(
    marker: SettlementMarker,
    width: number,
    height: number,
    z: number,
    seed: number
): SettlementViewMarker {
    const coords = typeof marker.x === 'number' && typeof marker.y === 'number'
        ? { x: clampCoord(marker.x, width), y: clampCoord(marker.y, height) }
        : stableCoords(marker.id, width, height, seed, 1);
    return {
        id: `layout_${marker.id}`,
        x: coords.x,
        y: coords.y,
        z,
        kind: layoutMarkerKind(marker),
        label: clampText(marker.label, MAX_VIEW_LABEL),
        tone: 'neutral',
    };
}

function buildLayerSummaries(layout: SettlementLayoutV1 | undefined): SettlementLayerSummary[] {
    const layers = layout
        ? deriveEffectiveSettlementLayers(layout)
        : [...VALID_SETTLEMENT_LAYER_IDS];
    return layers.map((id) => ({ id, label: LAYER_LABELS[id] }));
}

function deriveFallbackSize(state: SettlementStateV1): number {
    return state.structures.length > 8 ? LARGE_FALLBACK_SIZE : DEFAULT_FALLBACK_SIZE;
}

function addFallbackBorder(
    width: number,
    height: number,
    z: number,
    tiles: Map<string, SettlementViewTile>
): void {
    for (let x = 0; x < width; x++) {
        tiles.set(tileKey(x, 0, z), { x, y: 0, z, code: 'wall', label: 'Wall', tone: 'neutral' });
        tiles.set(tileKey(x, height - 1, z), { x, y: height - 1, z, code: 'wall', label: 'Wall', tone: 'neutral' });
    }
    for (let y = 1; y < height - 1; y++) {
        tiles.set(tileKey(0, y, z), { x: 0, y, z, code: 'wall', label: 'Wall', tone: 'neutral' });
        tiles.set(tileKey(width - 1, y, z), { x: width - 1, y, z, code: 'wall', label: 'Wall', tone: 'neutral' });
    }
}

function buildFromLayout(
    state: SettlementStateV1,
    layout: SettlementLayoutV1,
    layerId: SettlementLayerId,
    options: SettlementViewOptions
): { width: number; height: number; tiles: SettlementViewTile[]; markers: SettlementViewMarker[]; warnings: string[] } {
    const warnings: string[] = [];
    const width = clampViewSize(undefined, deriveFallbackSize(state));
    const height = width;
    const z = layerIdToZ(layerId);
    const seed = hashStringToSeed(state.settlementId);
    const revealHidden = options.revealHidden === true;
    const tileMap = new Map<string, SettlementViewTile>();
    const markerMap = new Map<string, SettlementViewMarker>();

    if (layout.settlementId !== state.settlementId) {
        warnings.push('layout_mismatch');
    }

    for (const zone of layout.zones) {
        if (zone.layerId !== layerId) { continue; }
        for (const tile of expandZoneTiles(zone, width, height, z, seed, revealHidden)) {
            tileMap.set(tileKey(tile.x, tile.y, tile.z), tile);
        }
    }

    for (const marker of layout.markers) {
        if (marker.layerId !== layerId) { continue; }
        const viewMarker = layoutMarkerToView(marker, width, height, z, seed);
        markerMap.set(markerKey(viewMarker.id), viewMarker);
    }

    return {
        width,
        height,
        tiles: [...tileMap.values()],
        markers: [...markerMap.values()],
        warnings,
    };
}

function findStructure(
    structureId: string,
    structures: readonly SettlementStructure[]
): SettlementStructure | undefined {
    return structures.find((s) => s.id === structureId);
}

function resolveStructureLayer(
    structureId: string,
    structures: readonly SettlementStructure[]
): SettlementLayerId {
    return findStructure(structureId, structures)?.layerId ?? 'z0';
}

function findStructureCoords(
    structureId: string,
    structures: readonly SettlementStructure[],
    width: number,
    height: number,
    seed: number
): { x: number; y: number } {
    const structure = findStructure(structureId, structures);
    if (structure) {
        return stableCoords(structure.id, width, height, seed, 2);
    }
    return { x: Math.floor(width / 2), y: Math.floor(height / 2) };
}

/** Surface-level markers until resident/visitor/merchant gain optional layerId. */
const SURFACE_MARKER_LAYER: SettlementLayerId = 'z0';

function buildStateMarkers(
    state: SettlementStateV1,
    layerId: SettlementLayerId,
    width: number,
    height: number,
    seed: number
): SettlementViewMarker[] {
    const z = layerIdToZ(layerId);
    const center = { x: Math.floor(width / 2), y: Math.floor(height / 2) };
    const markers: SettlementViewMarker[] = [];

    for (const resident of state.residents) {
        if (layerId !== SURFACE_MARKER_LAYER) { continue; }
        const coords = stableCoords(resident.npcId, width, height, seed + 11, 2);
        markers.push({
            id: `resident_${resident.npcId}`,
            x: coords.x,
            y: coords.y,
            z,
            kind: 'resident',
            label: clampText(resident.npcId, MAX_VIEW_LABEL),
            tone: 'friendly',
            detail: resident.role ? clampText(resident.role, MAX_VIEW_DETAIL) : undefined,
        });
    }

    for (const visitor of state.visitors) {
        if (layerId !== SURFACE_MARKER_LAYER) { continue; }
        const coords = stableCoords(visitor.npcId, width, height, seed + 17, 2);
        markers.push({
            id: `visitor_${visitor.npcId}`,
            x: coords.x,
            y: coords.y,
            z,
            kind: 'visitor',
            label: clampText(visitor.npcId, MAX_VIEW_LABEL),
            tone: 'neutral',
            detail: visitor.purpose ? clampText(visitor.purpose, MAX_VIEW_DETAIL) : undefined,
        });
    }

    for (const merchant of state.merchants) {
        if (layerId !== SURFACE_MARKER_LAYER) { continue; }
        const coords = stableCoords(merchant.npcId, width, height, seed + 23, 2);
        const wares = merchant.wares.slice(0, 3).map((w) => clampText(w, 24)).filter(Boolean);
        markers.push({
            id: `merchant_${merchant.npcId}`,
            x: coords.x,
            y: coords.y,
            z,
            kind: 'merchant',
            label: clampText(merchant.npcId, MAX_VIEW_LABEL),
            tone: 'friendly',
            detail: wares.length ? clampText(wares.join(', '), MAX_VIEW_DETAIL) : undefined,
        });
    }

    for (const incident of state.incidents) {
        if (incident.resolved) { continue; }
        const incidentLayer = resolveStructureLayer(incident.kind, state.structures);
        if (incidentLayer !== layerId) { continue; }
        const coords = findStructureCoords(incident.kind, state.structures, width, height, seed + 29);
        markers.push({
            id: `incident_${incident.id}`,
            x: coords.x,
            y: coords.y,
            z,
            kind: 'incident',
            label: sanitizeIncidentLabel(incident),
            tone: incidentSeverityTone(incident.severity),
            detail: incident.resolved ? undefined : clampText('Unresolved', MAX_VIEW_DETAIL),
        });
    }

    for (const structure of state.structures) {
        const layer = structure.layerId ?? 'z0';
        if (layer !== layerId) { continue; }
        if (!structure.note) { continue; }
        const coords = stableCoords(structure.id, width, height, seed + 31, 2);
        markers.push({
            id: `note_${structure.id}`,
            x: coords.x,
            y: coords.y,
            z,
            kind: 'structure_note',
            label: clampText(structure.name, MAX_VIEW_LABEL),
            tone: structureStatusTone(structure.status),
            detail: clampText(structure.note, MAX_VIEW_DETAIL),
        });
    }

    for (const stock of state.stocks) {
        if (layerId !== SURFACE_MARKER_LAYER) { continue; }
        if (stock.amount > 2) { continue; }
        markers.push({
            id: `stock_${stock.id}`,
            x: center.x,
            y: center.y,
            z,
            kind: 'stock_low',
            label: clampText(stock.amount === 0 ? `${stock.id} depleted` : `${stock.id} low`, MAX_VIEW_LABEL),
            tone: stock.amount === 0 ? 'critical' : 'warning',
        });
    }

    return markers;
}

function buildFallbackLayout(
    state: SettlementStateV1,
    layerId: SettlementLayerId,
    options: SettlementViewOptions
): { width: number; height: number; tiles: SettlementViewTile[]; markers: SettlementViewMarker[]; warnings: string[] } {
    const warnings = ['layout_fallback'];
    const width = clampViewSize(undefined, deriveFallbackSize(state));
    const height = width;
    const z = layerIdToZ(layerId);
    const seed = hashStringToSeed(state.settlementId);
    const tileMap = new Map<string, SettlementViewTile>();
    const centerX = Math.floor(width / 2);
    const centerY = Math.floor(height / 2);

    addFallbackBorder(width, height, z, tileMap);
    tileMap.set(tileKey(centerX, centerY, z), {
        x: centerX,
        y: centerY,
        z,
        code: 'market',
        label: clampText(state.name, MAX_VIEW_LABEL),
        tone: 'friendly',
    });

    for (const structure of state.structures) {
        const layer = structure.layerId ?? 'z0';
        if (layer !== layerId) { continue; }
        const tile = structureToTile(structure, width, height, z, seed);
        tileMap.set(tileKey(tile.x, tile.y, tile.z), tile);
    }

    const markers = buildStateMarkers(state, layerId, width, height, seed);
    return {
        width,
        height,
        tiles: [...tileMap.values()],
        markers,
        warnings,
    };
}

function sortTiles(a: SettlementViewTile, b: SettlementViewTile): number {
    return a.y - b.y || a.x - b.x || a.z - b.z || a.label.localeCompare(b.label);
}

function sortMarkers(a: SettlementViewMarker, b: SettlementViewMarker): number {
    return a.id.localeCompare(b.id);
}

function capTiles(tiles: SettlementViewTile[], maxTiles: number, warnings: string[]): SettlementViewTile[] {
    if (tiles.length <= maxTiles) { return tiles; }
    warnings.push('tile_cap_reached');
    return [...tiles].sort(sortTiles).slice(0, maxTiles);
}

function capMarkers(markers: SettlementViewMarker[], maxMarkers: number, warnings: string[]): SettlementViewMarker[] {
    if (markers.length <= maxMarkers) { return markers; }
    warnings.push('marker_cap_reached');
    return [...markers].sort(sortMarkers).slice(0, maxMarkers);
}

function buildLegend(
    tiles: readonly SettlementViewTile[],
    markers: readonly SettlementViewMarker[]
): SettlementViewLegendEntry[] {
    const legend: SettlementViewLegendEntry[] = [];
    const seen = new Set<string>();

    for (const tile of tiles) {
        if (!seen.has(tile.code)) {
            seen.add(tile.code);
            legend.push({ code: tile.code, label: TILE_LEGEND_LABELS[tile.code] });
        }
    }
    for (const marker of markers) {
        if (!seen.has(marker.kind)) {
            seen.add(marker.kind);
            legend.push({ code: marker.kind, label: MARKER_LEGEND_LABELS[marker.kind] });
        }
    }
    return legend.slice(0, MAX_VIEW_LEGEND);
}

function sanitizeTile(tile: SettlementViewTile): SettlementViewTile {
    const code = VALID_TILE_CODES.has(tile.code) ? tile.code : 'unknown';
    const out: SettlementViewTile = {
        x: clampCoord(tile.x, MAX_VIEW_SIZE),
        y: clampCoord(tile.y, MAX_VIEW_SIZE),
        z: tile.z,
        code,
        label: clampText(tile.label, MAX_VIEW_LABEL),
    };
    if (tile.tone && VALID_TONES.has(tile.tone)) { out.tone = tile.tone; }
    return out;
}

function sanitizeMarker(marker: SettlementViewMarker): SettlementViewMarker {
    const kind = VALID_MARKER_KINDS.has(marker.kind) ? marker.kind : 'structure_note';
    const out: SettlementViewMarker = {
        id: clampText(marker.id, 64),
        x: clampCoord(marker.x, MAX_VIEW_SIZE),
        y: clampCoord(marker.y, MAX_VIEW_SIZE),
        z: marker.z,
        kind,
        label: clampText(marker.label, MAX_VIEW_LABEL),
    };
    if (marker.tone && VALID_TONES.has(marker.tone)) { out.tone = marker.tone; }
    if (marker.detail) { out.detail = clampText(marker.detail, MAX_VIEW_DETAIL); }
    return out;
}

export function pickSettlementViewTileKeys(tile: SettlementViewTile): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const key of SETTLEMENT_VIEW_TILE_KEYS) {
        if (Object.prototype.hasOwnProperty.call(tile, key) && tile[key as keyof SettlementViewTile] !== undefined) {
            out[key] = tile[key as keyof SettlementViewTile];
        }
    }
    return out;
}

export function pickSettlementViewMarkerKeys(marker: SettlementViewMarker): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const key of SETTLEMENT_VIEW_MARKER_KEYS) {
        if (Object.prototype.hasOwnProperty.call(marker, key) && marker[key as keyof SettlementViewMarker] !== undefined) {
            out[key] = marker[key as keyof SettlementViewMarker];
        }
    }
    return out;
}

export function pickSettlementExpansionPreviewKeys(preview: SettlementExpansionPreview): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const key of SETTLEMENT_EXPANSION_PREVIEW_KEYS) {
        if (Object.prototype.hasOwnProperty.call(preview, key) && preview[key as keyof SettlementExpansionPreview] !== undefined) {
            out[key] = preview[key as keyof SettlementExpansionPreview];
        }
    }
    return out;
}

/**
 * M4c: builds read-only ghost previews for layers missing from the layout.
 * Pure in-memory use of `applyExpandLayerToLayout` — never writes
 * `settlement_layout.json`. Existing layers never get a preview entry.
 */
export function buildSettlementExpansionPreviews(
    state: SettlementStateV1 | undefined,
    layout: SettlementLayoutV1 | undefined
): SettlementExpansionPreview[] {
    if (!state) { return []; }

    const baseLayout = layout && layout.settlementId === state.settlementId ? layout : undefined;
    const effectiveLayers = baseLayout
        ? deriveEffectiveSettlementLayers(baseLayout)
        : ['z0'];
    const existing = new Set(effectiveLayers);
    const missing = (VALID_SETTLEMENT_LAYER_IDS as readonly SettlementLayerId[]).filter((id) => !existing.has(id));
    if (!missing.length) { return []; }

    const width = clampViewSize(undefined, deriveFallbackSize(state));
    const height = width;
    const seed = hashStringToSeed(state.settlementId);

    const previews: SettlementExpansionPreview[] = [];
    for (const layerId of missing) {
        const profiles = EXPANSION_PROFILES_BY_LAYER[layerId] ?? [];
        for (const profile of profiles) {
            if (previews.length >= MAX_EXPANSION_PREVIEWS) { break; }
            const op: ExpandLayerOp = { type: 'expand_layer', layerId, profile };
            const result = applyExpandLayerToLayout(baseLayout, state, op, { worldTurn: state.worldTurn });
            if (!result.applied) { continue; }

            const z = layerIdToZ(layerId);
            const zones = result.layout.zones.filter((zone) => zone.layerId === layerId);
            const rawMarkers = result.layout.markers.filter((marker) => marker.layerId === layerId);

            const tiles: SettlementViewTile[] = [];
            for (const zone of zones) {
                tiles.push(...expandZoneTiles(zone, width, height, z, seed, false));
            }
            const markers = rawMarkers.map((marker) => layoutMarkerToView(marker, width, height, z, seed));

            previews.push({
                layerId,
                profile,
                tiles: tiles.map(sanitizeTile),
                markers: markers.map(sanitizeMarker),
                warnings: result.warnings.length ? result.warnings.slice(0, MAX_VIEW_WARNINGS) : undefined,
            });
        }
        if (previews.length >= MAX_EXPANSION_PREVIEWS) { break; }
    }
    return previews;
}

export function pickSettlementViewSnapshotKeys(snapshot: SettlementViewSnapshot): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const key of SETTLEMENT_VIEW_SNAPSHOT_KEYS) {
        if (Object.prototype.hasOwnProperty.call(snapshot, key) && snapshot[key as keyof SettlementViewSnapshot] !== undefined) {
            out[key] = snapshot[key as keyof SettlementViewSnapshot];
        }
    }
    return out;
}

export function buildSettlementViewSnapshot(
    inputs: SettlementViewInputs
): SettlementViewSnapshot | undefined {
    const state = inputs.state;
    if (!state) { return undefined; }

    const layerId = resolveSelectedLayerId(inputs.selectedLayerId);
    const maxTiles = Math.min(MAX_VIEW_TILES, inputs.options?.maxTiles ?? MAX_VIEW_TILES);
    const maxMarkers = Math.min(MAX_VIEW_MARKERS, inputs.options?.maxMarkers ?? MAX_VIEW_MARKERS);
    const warnings: string[] = [];

    const layout = inputs.layout && inputs.layout.settlementId === state.settlementId
        ? inputs.layout
        : undefined;

    let built = layout
        ? buildFromLayout(state, layout, layerId, inputs.options ?? {})
        : buildFallbackLayout(state, layerId, inputs.options ?? {});

    if (!layout && inputs.layout && inputs.layout.settlementId !== state.settlementId) {
        warnings.push('layout_mismatch');
    }

    const seed = hashStringToSeed(state.settlementId);
    const tiles = capTiles(built.tiles.map(sanitizeTile), maxTiles, warnings);
    const rawMarkers = layout
        ? [...built.markers, ...buildStateMarkers(state, layerId, built.width, built.height, seed)]
        : built.markers;
    const markerDedup = new Map<string, SettlementViewMarker>();
    for (const marker of rawMarkers.map(sanitizeMarker).sort(sortMarkers)) {
        markerDedup.set(marker.id, marker);
    }
    const markers = capMarkers([...markerDedup.values()], maxMarkers, warnings);

    const uniqueWarnings = [...new Set([...built.warnings, ...warnings])].slice(0, MAX_VIEW_WARNINGS);

    return {
        version: SETTLEMENT_VIEW_VERSION,
        settlementId: state.settlementId,
        name: clampText(state.name, MAX_SETTLEMENT_NAME_CHARS),
        layerId,
        layers: buildLayerSummaries(layout),
        width: built.width,
        height: built.height,
        tiles,
        markers,
        legend: buildLegend(tiles, markers),
        warnings: uniqueWarnings.length ? uniqueWarnings : undefined,
    };
}