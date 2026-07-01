import type { WorldForge, RegionBiome, RegionHazard } from './worldForgeCore';
import { buildCartographyLayoutSpec, CARTOGRAPHY_MAP_SIZE } from './cartographyLayoutCore';
import type { CartographyLayoutSpec } from './cartographyLayoutCore';

/**
 * Tile Overmap — roguelike-style tile grid derived from world_forge regions.
 *
 * The grid is a pure function of (worldSeed, region layout): nothing here is
 * persisted to game_state.json and nothing is ever injected into GM prompts.
 * The webview receives the encoded grid via the worldView message and renders
 * it on a canvas (ASCII glyph theme today; the single-char codes below are the
 * stable tile vocabulary so an image-atlas tileset — CDDA tile_config.json
 * style — can be mapped onto the same codes later without regenerating data).
 */

export const TILE_OVERMAP_SIZE = 64;
/** Map-edge band (in tiles) where the ocean border may cut in. */
const OCEAN_BORDER_TILES = 5;
/** Noise amplitude applied to Voronoi distances (in normalized-radius units). */
const BORDER_JITTER = 0.9;
/** Fraction of a hazardous region's tiles that get a scattered hazard marker. */
const HAZARD_SCATTER_DENSITY = 0.14;

/** Stable single-char tile codes, keyed by biome. */
export const TILE_BIOME_CODES: Record<RegionBiome, string> = {
    forest: 'f',
    desert: 'd',
    mountain: 'm',
    sea: 's',
    coast: 'c',
    city: 'y',
    plains: 'p',
    swamp: 'w',
    wasteland: 'x',
    ruins: 'r',
    dungeon: 'g',
    underground: 'u',
    snow: 'n',
    volcanic: 'v',
    other: 'o',
};

export const TILE_CODE_SET: ReadonlySet<string> = new Set(Object.values(TILE_BIOME_CODES));

export interface TileOvermap {
    cols: number;
    rows: number;
    seed: number;
    /** rows[y] is a string of `cols` single-char biome codes. */
    tileRows: string[];
    /** Sparse road overlay as [x, y] tile coords (from region connectedTo edges). */
    roads: Array<[number, number]>;
    /** Sparse hazard markers scattered over hazardous regions' own tiles. */
    hazards: Array<{ hazard: RegionHazard; tiles: Array<[number, number]> }>;
}

/** FNV-1a style string → uint32, for deriving the grid seed from the world seed/name. */
export function hashStringToSeed(input: string): number {
    let h = 2166136261;
    for (let i = 0; i < input.length; i++) {
        h ^= input.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return h >>> 0;
}

function hash2(x: number, y: number, s: number): number {
    let h = Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(s, 1274126177);
    h = Math.imul(h ^ (h >>> 13), 1103515245);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

/** Smoothstep-interpolated value noise in [0, 1]. */
function vnoise(x: number, y: number, s: number): number {
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    const fx = x - ix;
    const fy = y - iy;
    const sx = fx * fx * (3 - 2 * fx);
    const sy = fy * fy * (3 - 2 * fy);
    const a = hash2(ix, iy, s);
    const b = hash2(ix + 1, iy, s);
    const c = hash2(ix, iy + 1, s);
    const d = hash2(ix + 1, iy + 1, s);
    return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}

function fbm(x: number, y: number, s: number): number {
    return vnoise(x, y, s) * 0.65 + vnoise(x * 2.7, y * 2.7, s + 7) * 0.35;
}

function regionTileCenter(coord: number, gridSize: number): number {
    const clamped = Math.max(0, Math.min(CARTOGRAPHY_MAP_SIZE, coord));
    return Math.min(gridSize - 1, Math.floor((clamped / CARTOGRAPHY_MAP_SIZE) * gridSize));
}

function bresenham(x0: number, y0: number, x1: number, y1: number): Array<[number, number]> {
    const points: Array<[number, number]> = [];
    const dx = Math.abs(x1 - x0);
    const dy = Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let err = dx - dy;
    let x = x0;
    let y = y0;
    while (x !== x1 || y !== y1) {
        points.push([x, y]);
        const e2 = 2 * err;
        if (e2 > -dy) { err -= dy; x += sx; }
        if (e2 < dx) { err += dx; y += sy; }
    }
    points.push([x1, y1]);
    return points;
}

function buildTileOvermapFromSpec(spec: CartographyLayoutSpec, seed: number, size: number): TileOvermap {
    const cols = size;
    const rows = size;

    if (spec.regions.length === 0) {
        return { cols, rows, seed, tileRows: Array(rows).fill('o'.repeat(cols)), roads: [], hazards: [] };
    }

    const centers = spec.regions.map((r) => ({
        gx: regionTileCenter(r.x, cols),
        gy: regionTileCenter(r.y, rows),
        /** Normalization keeps big biomes (sea) claiming more tiles than small ones (city). */
        radiusTiles: Math.max(2, (r.radius / CARTOGRAPHY_MAP_SIZE) * size),
        code: TILE_BIOME_CODES[r.biome] ?? TILE_BIOME_CODES.other,
    }));

    const hasWater = spec.regions.some((r) => r.biome === 'sea' || r.biome === 'coast');

    const tileRows: string[] = [];
    /** ownerRows[y][x] = region index owning the tile, or -1 for ocean-border overrides. */
    const ownerRows: number[][] = [];
    for (let ty = 0; ty < rows; ty++) {
        let row = '';
        const ownerRow: number[] = [];
        for (let tx = 0; tx < cols; tx++) {
            let bestIndex = 0;
            let bestScore = Infinity;
            for (let i = 0; i < centers.length; i++) {
                const c = centers[i];
                const dx = c.gx - tx;
                const dy = c.gy - ty;
                const jitter = (vnoise(tx * 0.13 + i * 7.3, ty * 0.13, seed + i) - 0.5) * BORDER_JITTER;
                const score = Math.sqrt(dx * dx + dy * dy) / c.radiusTiles + jitter;
                if (score < bestScore) {
                    bestScore = score;
                    bestIndex = i;
                }
            }
            let bestCode = centers[bestIndex].code;
            let owner = bestIndex;
            if (hasWater) {
                const edge = Math.min(tx, ty, cols - 1 - tx, rows - 1 - ty);
                if (edge < OCEAN_BORDER_TILES && fbm(tx * 0.12, ty * 0.12, seed + 31) > 0.3 + edge * 0.11) {
                    bestCode = TILE_BIOME_CODES.sea;
                    owner = -1;
                }
            }
            row += bestCode;
            ownerRow.push(owner);
        }
        tileRows.push(row);
        ownerRows.push(ownerRow);
    }

    const hazardTiles = new Map<RegionHazard, Array<[number, number]>>();
    for (let ty = 0; ty < rows; ty++) {
        for (let tx = 0; tx < cols; tx++) {
            const owner = ownerRows[ty][tx];
            if (owner < 0) { continue; }
            const hazard = spec.regions[owner].hazard;
            if (!hazard) { continue; }
            if (hash2(tx, ty, seed + 177 + owner) >= HAZARD_SCATTER_DENSITY) { continue; }
            let tiles = hazardTiles.get(hazard);
            if (!tiles) {
                tiles = [];
                hazardTiles.set(hazard, tiles);
            }
            tiles.push([tx, ty]);
        }
    }
    const hazards = [...hazardTiles.entries()].map(([hazard, tiles]) => ({ hazard, tiles }));

    const regionCenterById = new Map(spec.regions.map((r, i) => [r.id, centers[i]]));
    const roadSet = new Set<string>();
    const roads: Array<[number, number]> = [];
    for (const edge of spec.edges) {
        const from = regionCenterById.get(edge.fromId);
        const to = regionCenterById.get(edge.toId);
        if (!from || !to) { continue; }
        for (const [x, y] of bresenham(from.gx, from.gy, to.gx, to.gy)) {
            const key = `${x},${y}`;
            if (roadSet.has(key)) { continue; }
            roadSet.add(key);
            roads.push([x, y]);
        }
    }

    return { cols, rows, seed, tileRows, roads, hazards };
}

let memoKey = '';
let memoValue: TileOvermap | undefined;

/**
 * Derive the tile overmap for a world. Deterministic: same world_forge content
 * always yields the same grid, so nothing needs to be saved. Memoized because
 * pushWorldViewToWebview runs on every state sync.
 */
export function buildTileOvermap(forge: WorldForge, size: number = TILE_OVERMAP_SIZE): TileOvermap {
    const spec = buildCartographyLayoutSpec(forge);
    const seed = hashStringToSeed(forge.meta.worldSeed ?? forge.meta.worldName ?? '');
    const key = `${size}:${seed}:${JSON.stringify(spec.regions)}:${JSON.stringify(spec.edges)}`;
    if (memoValue && key === memoKey) {
        return memoValue;
    }
    memoKey = key;
    memoValue = buildTileOvermapFromSpec(spec, seed, size);
    return memoValue;
}
