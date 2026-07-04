// Settlement Mode M5a: low-poly diorama snapshot from sanitized M3 view (pure, no Three.js/fs/DOM).

import type { SettlementLayerId } from './settlementCore';
import type {
    SettlementTileCode,
    SettlementViewMarker,
    SettlementViewMarkerKind,
    SettlementViewSnapshot,
    SettlementViewTile,
    SettlementViewTone,
} from './settlementViewCore';
import { hashStringToSeed } from './tileOvermapCore';
import { layerIdToZ } from './settlementViewCore';

export const SETTLEMENT_DIORAMA_VERSION = 1 as const;

export type SettlementDioramaMaterial =
    | 'stone'
    | 'wood'
    | 'metal'
    | 'cloth'
    | 'water'
    | 'ruins'
    | 'hazard'
    | 'light'
    | 'neutral';

export type SettlementDioramaTheme =
    | 'default'
    | 'postapoc'
    | 'fantasy'
    | 'industrial'
    | 'eastern'
    | 'horror'
    | 'scifi';

export interface SettlementDioramaCamera {
    mode: 'fixed_orbit';
    target: { x: number; y: number; z: number };
    distance: number;
    yaw: number;
    pitch: number;
    minDistance: number;
    maxDistance: number;
}

export interface SettlementDioramaBlock {
    id: string;
    x: number;
    y: number;
    z: number;
    w: number;
    d: number;
    h: number;
    code: SettlementTileCode;
    material: SettlementDioramaMaterial;
    tone?: SettlementViewTone;
}

export interface SettlementDioramaMarker {
    id: string;
    x: number;
    y: number;
    z: number;
    kind: SettlementViewMarkerKind;
    material: SettlementDioramaMaterial;
    label: string;
}

export interface SettlementDioramaLabel {
    id: string;
    x: number;
    y: number;
    z: number;
    text: string;
}

export interface SettlementDioramaPalette {
    theme: SettlementDioramaTheme;
    background: string;
    ambient: string;
    ground: string;
    accent: string;
}

export interface SettlementDioramaSnapshot {
    version: typeof SETTLEMENT_DIORAMA_VERSION;
    settlementId: string;
    name: string;
    layerId: SettlementLayerId;
    /** Deterministic fingerprint so M5b rebuilds when content changes within the same layer. */
    revision: string;
    bounds: { width: number; depth: number; height: number };
    camera: SettlementDioramaCamera;
    blocks: SettlementDioramaBlock[];
    markers: SettlementDioramaMarker[];
    labels?: SettlementDioramaLabel[];
    palette: SettlementDioramaPalette;
    warnings?: string[];
}

export interface SettlementDioramaOptions {
    maxBlocks?: number;
    maxMarkers?: number;
    maxLabels?: number;
    theme?: SettlementDioramaTheme;
    includeLabels?: boolean;
}

export interface SettlementDioramaInputs {
    view?: SettlementViewSnapshot;
    options?: SettlementDioramaOptions;
}

export const SETTLEMENT_DIORAMA_BLOCK_KEYS = [
    'id', 'x', 'y', 'z', 'w', 'd', 'h', 'code', 'material', 'tone',
] as const;

export const SETTLEMENT_DIORAMA_MARKER_KEYS = [
    'id', 'x', 'y', 'z', 'kind', 'material', 'label',
] as const;

export const SETTLEMENT_DIORAMA_LABEL_KEYS = ['id', 'x', 'y', 'z', 'text'] as const;

export const SETTLEMENT_DIORAMA_SNAPSHOT_KEYS = [
    'version',
    'settlementId',
    'name',
    'layerId',
    'revision',
    'bounds',
    'camera',
    'blocks',
    'markers',
    'labels',
    'palette',
    'warnings',
] as const;

export const MIN_DIORAMA_BOUNDS = 8;
export const MAX_DIORAMA_BOUNDS = 32;
export const MAX_DIORAMA_BLOCKS = 512;
export const MAX_DIORAMA_MARKERS = 80;
export const MAX_DIORAMA_LABELS = 40;
export const MAX_DIORAMA_LABEL_TEXT = 48;
export const MAX_DIORAMA_WARNINGS = 16;
export const MAX_DIORAMA_ID = 64;

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

const VALID_MATERIALS = new Set<SettlementDioramaMaterial>([
    'stone', 'wood', 'metal', 'cloth', 'water', 'ruins', 'hazard', 'light', 'neutral',
]);

const VALID_THEMES = new Set<SettlementDioramaTheme>([
    'default', 'postapoc', 'fantasy', 'industrial', 'eastern', 'horror', 'scifi',
]);

const THEME_PALETTES: Record<SettlementDioramaTheme, Omit<SettlementDioramaPalette, 'theme'>> = {
    default: { background: '#1a1a2e', ambient: '#8899aa', ground: '#3d4a3d', accent: '#c9a227' },
    postapoc: { background: '#2b2118', ambient: '#8a7a6a', ground: '#4a4035', accent: '#c45c26' },
    fantasy: { background: '#1e2a3a', ambient: '#9ab0c8', ground: '#3a5a40', accent: '#d4af37' },
    industrial: { background: '#1c1c1c', ambient: '#7a8a9a', ground: '#3a3a3a', accent: '#ff6b35' },
    eastern: { background: '#1a2420', ambient: '#8aa898', ground: '#3d4f42', accent: '#c04040' },
    horror: { background: '#120f14', ambient: '#6a5a6a', ground: '#2a2230', accent: '#8b0000' },
    scifi: { background: '#0d1520', ambient: '#6a9ab8', ground: '#1e3040', accent: '#00e5ff' },
};

const TILE_MATERIAL: Record<SettlementTileCode, SettlementDioramaMaterial> = {
    floor: 'neutral',
    empty: 'neutral',
    wall: 'stone',
    gate: 'wood',
    market: 'cloth',
    workshop: 'metal',
    stockpile: 'wood',
    quarters: 'wood',
    clinic: 'cloth',
    barracks: 'metal',
    shrine: 'stone',
    water: 'water',
    ruins: 'ruins',
    hazard: 'hazard',
    unknown: 'neutral',
};

const MARKER_MATERIAL: Record<SettlementViewMarkerKind, SettlementDioramaMaterial> = {
    resident: 'light',
    visitor: 'neutral',
    merchant: 'light',
    project: 'wood',
    incident: 'hazard',
    stock_low: 'hazard',
    structure_note: 'wood',
    player: 'light',
};

type BlockDims = { w: number; d: number; h: number };

const TILE_DIMS: Record<SettlementTileCode, BlockDims> = {
    floor: { w: 0.95, d: 0.95, h: 0.12 },
    empty: { w: 0.95, d: 0.95, h: 0.08 },
    wall: { w: 0.9, d: 0.9, h: 2.4 },
    gate: { w: 1.0, d: 0.35, h: 2.0 },
    market: { w: 1.1, d: 1.1, h: 0.85 },
    workshop: { w: 1.0, d: 1.0, h: 1.0 },
    stockpile: { w: 1.0, d: 1.0, h: 0.7 },
    quarters: { w: 1.0, d: 1.0, h: 1.1 },
    clinic: { w: 1.0, d: 1.0, h: 0.95 },
    barracks: { w: 1.1, d: 1.0, h: 1.15 },
    shrine: { w: 1.0, d: 1.0, h: 1.2 },
    water: { w: 1.0, d: 1.0, h: 0.05 },
    ruins: { w: 0.95, d: 0.95, h: 0.55 },
    hazard: { w: 0.9, d: 0.9, h: 0.45 },
    unknown: { w: 0.9, d: 0.9, h: 0.15 },
};

function clampText(raw: string, max: number): string {
    const t = raw.trim().replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ');
    return t.slice(0, max);
}

function clampFinite(value: number, min: number, max: number, fallback: number): number {
    if (!Number.isFinite(value)) { return fallback; }
    return Math.max(min, Math.min(max, value));
}

function clampBoundsSize(raw: number | undefined, fallback: number): number {
    const n = typeof raw === 'number' && Number.isFinite(raw) ? Math.round(raw) : fallback;
    return Math.max(MIN_DIORAMA_BOUNDS, Math.min(MAX_DIORAMA_BOUNDS, n));
}

export function normalizeDioramaCap(raw: number | undefined, max: number): number {
    if (raw === undefined || !Number.isFinite(raw)) {
        return max;
    }
    return Math.max(0, Math.min(max, Math.floor(raw)));
}

function resolveTheme(raw: SettlementDioramaTheme | undefined): SettlementDioramaTheme {
    if (raw && VALID_THEMES.has(raw)) { return raw; }
    return 'default';
}

function tileCodeToMaterial(code: SettlementTileCode): SettlementDioramaMaterial {
    return TILE_MATERIAL[code] ?? 'neutral';
}

function markerKindToMaterial(kind: SettlementViewMarkerKind): SettlementDioramaMaterial {
    return MARKER_MATERIAL[kind] ?? 'neutral';
}

function sortBlocks(a: SettlementDioramaBlock, b: SettlementDioramaBlock): number {
    return a.y - b.y || a.x - b.x || a.id.localeCompare(b.id);
}

function sortMarkers(a: SettlementDioramaMarker, b: SettlementDioramaMarker): number {
    return a.id.localeCompare(b.id);
}

function sortLabels(a: SettlementDioramaLabel, b: SettlementDioramaLabel): number {
    return a.id.localeCompare(b.id);
}

function tileToBlock(tile: SettlementViewTile, index: number, layerBaseZ: number): SettlementDioramaBlock {
    const code = VALID_TILE_CODES.has(tile.code) ? tile.code : 'unknown';
    const dims = TILE_DIMS[code];
    const block: SettlementDioramaBlock = {
        id: clampText(`blk_${tile.x}_${tile.y}_${index}`, MAX_DIORAMA_ID),
        x: clampFinite(tile.x, 0, MAX_DIORAMA_BOUNDS - 1, 0),
        y: clampFinite(tile.y, 0, MAX_DIORAMA_BOUNDS - 1, 0),
        z: clampFinite(tile.z - layerBaseZ, -1, 4, 0),
        w: clampFinite(dims.w, 0.05, 4, 0.9),
        d: clampFinite(dims.d, 0.05, 4, 0.9),
        h: clampFinite(dims.h, 0.02, 4, 0.1),
        code,
        material: tileCodeToMaterial(code),
    };
    if (tile.tone && VALID_TONES.has(tile.tone)) { block.tone = tile.tone; }
    return block;
}

function markerToDioramaMarker(marker: SettlementViewMarker, layerBaseZ: number): SettlementDioramaMarker {
    const kind = VALID_MARKER_KINDS.has(marker.kind) ? marker.kind : 'structure_note';
    return {
        id: clampText(marker.id, MAX_DIORAMA_ID),
        x: clampFinite(marker.x, 0, MAX_DIORAMA_BOUNDS - 1, 0),
        y: clampFinite(marker.y, 0, MAX_DIORAMA_BOUNDS - 1, 0),
        z: clampFinite(marker.z - layerBaseZ + 0.35, 0, 6, 0.35),
        kind,
        material: markerKindToMaterial(kind),
        label: clampText(marker.label, MAX_DIORAMA_LABEL_TEXT),
    };
}

function buildLabelsFromView(
    tiles: readonly SettlementViewTile[],
    markers: readonly SettlementViewMarker[],
    maxLabels: number,
    layerBaseZ: number
): SettlementDioramaLabel[] {
    const labels: SettlementDioramaLabel[] = [];
    const seen = new Set<string>();

    for (const tile of tiles) {
        const text = clampText(tile.label, MAX_DIORAMA_LABEL_TEXT);
        if (!text || text === 'Floor' || text === 'Wall' || text === 'Empty') { continue; }
        const id = clampText(`lbl_tile_${tile.x}_${tile.y}`, MAX_DIORAMA_ID);
        if (seen.has(id)) { continue; }
        seen.add(id);
        labels.push({
            id,
            x: clampFinite(tile.x, 0, MAX_DIORAMA_BOUNDS - 1, 0),
            y: clampFinite(tile.y, 0, MAX_DIORAMA_BOUNDS - 1, 0),
            z: clampFinite(tile.z - layerBaseZ + 0.5, 0, 6, 0.5),
            text,
        });
        if (labels.length >= maxLabels) { break; }
    }

    if (labels.length < maxLabels) {
        for (const marker of [...markers].sort((a, b) => a.id.localeCompare(b.id))) {
            const text = clampText(marker.label, MAX_DIORAMA_LABEL_TEXT);
            if (!text) { continue; }
            const id = clampText(`lbl_${marker.id}`, MAX_DIORAMA_ID);
            if (seen.has(id)) { continue; }
            seen.add(id);
            labels.push({
                id,
                x: clampFinite(marker.x, 0, MAX_DIORAMA_BOUNDS - 1, 0),
                y: clampFinite(marker.y, 0, MAX_DIORAMA_BOUNDS - 1, 0),
                z: clampFinite(marker.z - layerBaseZ + 0.6, 0, 6, 0.6),
                text,
            });
            if (labels.length >= maxLabels) { break; }
        }
    }

    return labels.sort(sortLabels);
}

function buildCamera(width: number, depth: number): SettlementDioramaCamera {
    const span = Math.max(width, depth, MIN_DIORAMA_BOUNDS);
    const targetX = clampFinite((width - 1) / 2, 0, MAX_DIORAMA_BOUNDS, 0);
    const targetY = clampFinite((depth - 1) / 2, 0, MAX_DIORAMA_BOUNDS, 0);
    const distance = clampFinite(span * 1.6, 8, 64, 16);
    return {
        mode: 'fixed_orbit',
        target: { x: targetX, y: targetY, z: 0 },
        distance,
        yaw: 45,
        pitch: 35,
        minDistance: clampFinite(span * 0.75, 4, 48, 8),
        maxDistance: clampFinite(span * 2.8, 12, 96, 32),
    };
}

function buildPalette(theme: SettlementDioramaTheme): SettlementDioramaPalette {
    const colors = THEME_PALETTES[theme];
    return { theme, ...colors };
}

function capBlocks(
    blocks: SettlementDioramaBlock[],
    maxBlocks: number,
    warnings: string[]
): SettlementDioramaBlock[] {
    if (blocks.length <= maxBlocks) { return blocks; }
    warnings.push('block_cap_reached');
    return [...blocks].sort(sortBlocks).slice(0, maxBlocks);
}

function capMarkers(
    markers: SettlementDioramaMarker[],
    maxMarkers: number,
    warnings: string[]
): SettlementDioramaMarker[] {
    if (markers.length <= maxMarkers) { return markers; }
    warnings.push('marker_cap_reached');
    return [...markers].sort(sortMarkers).slice(0, maxMarkers);
}

function capLabels(
    labels: SettlementDioramaLabel[],
    maxLabels: number,
    warnings: string[]
): SettlementDioramaLabel[] {
    if (labels.length <= maxLabels) { return labels; }
    warnings.push('label_cap_reached');
    return [...labels].sort(sortLabels).slice(0, maxLabels);
}

function computeSceneHeight(blocks: readonly SettlementDioramaBlock[]): number {
    let maxTop = 1;
    for (const block of blocks) {
        const top = block.z + block.h;
        if (top > maxTop) { maxTop = top; }
    }
    return clampFinite(maxTop + 0.5, 1, 8, 4);
}

export function pickSettlementDioramaBlockKeys(block: SettlementDioramaBlock): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const key of SETTLEMENT_DIORAMA_BLOCK_KEYS) {
        if (Object.prototype.hasOwnProperty.call(block, key) && block[key as keyof SettlementDioramaBlock] !== undefined) {
            out[key] = block[key as keyof SettlementDioramaBlock];
        }
    }
    return out;
}

export function pickSettlementDioramaMarkerKeys(marker: SettlementDioramaMarker): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const key of SETTLEMENT_DIORAMA_MARKER_KEYS) {
        if (Object.prototype.hasOwnProperty.call(marker, key) && marker[key as keyof SettlementDioramaMarker] !== undefined) {
            out[key] = marker[key as keyof SettlementDioramaMarker];
        }
    }
    return out;
}

export function pickSettlementDioramaLabelKeys(label: SettlementDioramaLabel): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const key of SETTLEMENT_DIORAMA_LABEL_KEYS) {
        if (Object.prototype.hasOwnProperty.call(label, key) && label[key as keyof SettlementDioramaLabel] !== undefined) {
            out[key] = label[key as keyof SettlementDioramaLabel];
        }
    }
    return out;
}

export function pickSettlementDioramaSnapshotKeys(snapshot: SettlementDioramaSnapshot): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const key of SETTLEMENT_DIORAMA_SNAPSHOT_KEYS) {
        if (Object.prototype.hasOwnProperty.call(snapshot, key) && snapshot[key as keyof SettlementDioramaSnapshot] !== undefined) {
            out[key] = snapshot[key as keyof SettlementDioramaSnapshot];
        }
    }
    return out;
}

export function deriveDioramaRevision(parts: {
    blocks: readonly SettlementDioramaBlock[];
    markers: readonly SettlementDioramaMarker[];
    palette: SettlementDioramaPalette;
    camera: SettlementDioramaCamera;
}): string {
    const blockSig = parts.blocks.map((b) => `${b.id}:${b.x},${b.y},${b.z}:${b.code}:${b.material}`).join('|');
    const markerSig = parts.markers.map((m) => `${m.id}:${m.x},${m.y},${m.z}:${m.kind}`).join('|');
    const paletteSig = `${parts.palette.theme}:${parts.palette.background}:${parts.palette.ground}`;
    const camSig = `${parts.camera.distance}:${parts.camera.yaw}:${parts.camera.pitch}`;
    const raw = `${blockSig}#${markerSig}#${paletteSig}#${camSig}`;
    return `d${hashStringToSeed(raw).toString(36)}`;
}

export function buildSettlementDioramaSnapshot(
    inputs: SettlementDioramaInputs
): SettlementDioramaSnapshot | undefined {
    const view = inputs.view;
    if (!view) { return undefined; }

    const maxBlocks = normalizeDioramaCap(inputs.options?.maxBlocks, MAX_DIORAMA_BLOCKS);
    const maxMarkers = normalizeDioramaCap(inputs.options?.maxMarkers, MAX_DIORAMA_MARKERS);
    const maxLabels = normalizeDioramaCap(inputs.options?.maxLabels, MAX_DIORAMA_LABELS);
    const layerBaseZ = layerIdToZ(view.layerId);
    const theme = resolveTheme(inputs.options?.theme);
    const includeLabels = inputs.options?.includeLabels === true;

    const warnings: string[] = view.warnings ? [...view.warnings] : [];

    const width = clampBoundsSize(view.width, MIN_DIORAMA_BOUNDS);
    const depth = clampBoundsSize(view.height, MIN_DIORAMA_BOUNDS);

    const rawBlocks = view.tiles
        .filter((tile) => tile.code !== 'empty')
        .map((tile, index) => tileToBlock(tile, index, layerBaseZ))
        .sort(sortBlocks);

    const rawMarkers = view.markers.map((m) => markerToDioramaMarker(m, layerBaseZ)).sort(sortMarkers);

    const blocks = capBlocks(rawBlocks, maxBlocks, warnings);
    const markers = capMarkers(rawMarkers, maxMarkers, warnings);

    let labels: SettlementDioramaLabel[] | undefined;
    if (includeLabels) {
        const built = buildLabelsFromView(view.tiles, view.markers, maxLabels, layerBaseZ);
        labels = capLabels(built, maxLabels, warnings);
        if (!labels.length) { labels = undefined; }
    }

    const sceneHeight = computeSceneHeight(blocks);
    const uniqueWarnings = [...new Set(warnings)].slice(0, MAX_DIORAMA_WARNINGS);
    const camera = buildCamera(width, depth);
    const palette = buildPalette(theme);
    const revision = deriveDioramaRevision({ blocks, markers, palette, camera });

    return {
        version: SETTLEMENT_DIORAMA_VERSION,
        settlementId: clampText(view.settlementId, MAX_DIORAMA_ID),
        name: clampText(view.name, MAX_DIORAMA_LABEL_TEXT),
        layerId: view.layerId,
        revision,
        bounds: { width, depth, height: sceneHeight },
        camera,
        blocks,
        markers,
        labels,
        palette,
        warnings: uniqueWarnings.length ? uniqueWarnings : undefined,
    };
}

/** Exported for tests: closed material mapping from M3 tile codes. */
export function dioramaMaterialForTileCode(code: SettlementTileCode): SettlementDioramaMaterial {
    const normalized = VALID_TILE_CODES.has(code) ? code : 'unknown';
    const material = tileCodeToMaterial(normalized);
    return VALID_MATERIALS.has(material) ? material : 'neutral';
}

/** Exported for tests: layer elevation hint used by M5b (not authoritative). */
export function dioramaLayerBaseZ(layerId: SettlementLayerId): number {
    return layerIdToZ(layerId) * 0.25;
}