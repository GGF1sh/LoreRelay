import type { WorldForge, Region, RegionBiome, RegionHazard } from './worldForgeCore';
import { inferRegionBiomeFromType } from './worldForgeCore';
import { resolveCartographyThemeStyle } from './cartographyThemeStyles';

/** LoreRelay map coordinate space (matches world_forge Region x/y). */
export const CARTOGRAPHY_MAP_SIZE = 1000;
export const DEFAULT_LAYOUT_IMAGE_SIZE = 1024;
export const DEFAULT_REGION_RADIUS_MAP = 72;
/** Align with worldMapGenerator Mermaid caps — layout overlay must not scale unbounded. */
export const MAX_CARTOGRAPHY_LAYOUT_REGIONS = 20;
export const MAX_CARTOGRAPHY_LAYOUT_LOCATIONS = 100;

export interface CartographyLayoutRegion {
    id: string;
    name: string;
    biome: RegionBiome;
    /** Map space 0..1000 */
    x: number;
    y: number;
    /** Map space radius for layout blobs */
    radius: number;
    hazard?: RegionHazard;
}

export interface CartographyLayoutEdge {
    fromId: string;
    toId: string;
}

export interface CartographyLayoutSpec {
    worldName: string;
    theme?: string;
    imageWidth: number;
    imageHeight: number;
    regions: CartographyLayoutRegion[];
    edges: CartographyLayoutEdge[];
}

export interface CartographyPinPosition {
    locationId: string;
    locationName: string;
    regionId?: string;
    /** Percent 0..100 for HTML overlay (left / top). */
    leftPct: number;
    topPct: number;
}

export interface CartographyRegionLabel {
    regionId: string;
    regionName: string;
    /** Percent 0..100 — placed below region center for HTML overlay. */
    leftPct: number;
    topPct: number;
}

/** Distinct RGB fills for ControlNet layout masks (not display colors). */
export const BIOME_LAYOUT_RGB: Record<RegionBiome, [number, number, number]> = {
    forest: [34, 120, 52],
    desert: [210, 176, 72],
    mountain: [120, 108, 96],
    sea: [32, 72, 168],
    coast: [64, 148, 188],
    city: [196, 92, 40],
    plains: [148, 188, 72],
    swamp: [56, 96, 64],
    wasteland: [168, 132, 88],
    ruins: [108, 88, 72],
    dungeon: [72, 56, 88],
    underground: [56, 48, 72],
    snow: [208, 220, 232],
    volcanic: [168, 48, 32],
    other: [128, 128, 128],
};

export function mapCoordToPixel(coord: number, imageSize: number): number {
    const clamped = Math.max(0, Math.min(CARTOGRAPHY_MAP_SIZE, coord));
    return Math.round((clamped / CARTOGRAPHY_MAP_SIZE) * (imageSize - 1));
}

export function mapCoordToPercent(coord: number): number {
    const clamped = Math.max(0, Math.min(CARTOGRAPHY_MAP_SIZE, coord));
    return (clamped / CARTOGRAPHY_MAP_SIZE) * 100;
}

function resolveRegionBiome(region: Region): RegionBiome {
    return region.biome ?? inferRegionBiomeFromType(region.type);
}

function resolveRegionPosition(region: Region, index: number, total: number): { x: number; y: number } {
    if (typeof region.x === 'number' && typeof region.y === 'number') {
        return { x: region.x, y: region.y };
    }
    const angle = (Math.PI * 2 * index) / Math.max(1, total) - Math.PI / 2;
    const radius = total <= 4 ? 220 : 300;
    return {
        x: Math.round(500 + Math.cos(angle) * radius),
        y: Math.round(500 + Math.sin(angle) * radius),
    };
}

function regionRadiusForBiome(biome: RegionBiome): number {
    switch (biome) {
        case 'sea': return 96;
        case 'city': return 48;
        case 'mountain': return 80;
        default: return DEFAULT_REGION_RADIUS_MAP;
    }
}

export function buildCartographyLayoutSpec(
    forge: WorldForge,
    imageSize: number = DEFAULT_LAYOUT_IMAGE_SIZE
): CartographyLayoutSpec {
    const regions = forge.geography.regions.slice(0, MAX_CARTOGRAPHY_LAYOUT_REGIONS);
    const byId = new Map(regions.map((r) => [r.id, r]));
    const layoutRegions: CartographyLayoutRegion[] = regions.map((region, index) => {
        const biome = resolveRegionBiome(region);
        const pos = resolveRegionPosition(region, index, regions.length);
        const layoutRegion: CartographyLayoutRegion = {
            id: region.id,
            name: region.name,
            biome,
            x: pos.x,
            y: pos.y,
            radius: regionRadiusForBiome(biome),
        };
        if (region.hazard) { layoutRegion.hazard = region.hazard; }
        return layoutRegion;
    });

    const seen = new Set<string>();
    const edges: CartographyLayoutEdge[] = [];
    for (const region of regions) {
        for (const targetId of region.connectedTo ?? []) {
            if (!byId.has(targetId)) { continue; }
            const key = [region.id, targetId].sort().join('|');
            if (seen.has(key)) { continue; }
            seen.add(key);
            edges.push({ fromId: region.id, toId: targetId });
        }
    }

    return {
        worldName: forge.meta.worldName,
        theme: forge.meta.theme,
        imageWidth: imageSize,
        imageHeight: imageSize,
        regions: layoutRegions,
        edges,
    };
}

export type { CartographyThemeStyle } from './cartographyThemeStyles';
export { resolveCartographyThemeStyle };

function resolveMapcraftStyleTag(theme?: string): string {
    const key = (theme ?? 'fantasy').toLowerCase().replace(/[\s_]+/g, '-');
    if (key.includes('cyber') || key.includes('scifi') || key.includes('sci-fi')) { return 'sci-fi'; }
    if (key.includes('postapoc') || key.includes('post-apoc') || key.includes('wasteland')) { return 'post-apocalyptic'; }
    if (key.includes('zombie') || key.includes('undead') || key.includes('horror')) { return 'post-apocalyptic'; }
    if (key === 'modern' || key.includes('urban')) { return 'modern'; }
    return '';
}

/** Trigger words for known map LoRAs (e.g. Mapcraft on Civitai). */
export function buildCartographyLoraPromptPrefix(loraName?: string, theme?: string): string {
    if (!loraName?.trim()) { return ''; }
    const lower = loraName.toLowerCase();
    if (lower.includes('mapcraft')) {
        const styleTag = resolveMapcraftStyleTag(theme);
        const tags = 'mapcraft, battle map, top-down view, from above, no humans, highly detailed, exterior, landscape';
        return styleTag ? `${tags}, ${styleTag}, ` : `${tags}, `;
    }
    return '';
}

export function buildCartographyPositivePrompt(spec: CartographyLayoutSpec, loraName?: string): string {
    const style = resolveCartographyThemeStyle(spec.theme);
    const biomeSummary = summarizeBiomes(spec.regions);
    const themeLabel = spec.theme ?? 'fantasy';
    const loraPrefix = buildCartographyLoraPromptPrefix(loraName, spec.theme);
    return [
        `${loraPrefix}flat top-down ${style.mapType} of ${spec.worldName}`,
        style.renderStyle,
        'orthographic bird eye view, map fills entire square frame edge to edge',
        'distinct zone borders, route network between locations, readable macro geography',
        'no labels, no typography, no UI frame, no floating objects, no perspective tilt',
        `${themeLabel} world setting`,
        biomeSummary,
        'masterpiece, best quality, highly detailed regional map illustration',
    ].join(', ');
}

const CARTOGRAPHY_NEGATIVE_CORE = [
    'star chart, astrolabe, zodiac wheel, celestial diagram, astronomical map, magic circle',
    'summoning circle, ritual circle, radial symmetry, circular diagram, radial grid',
    'compass rose centerpiece, ornate mandala, spherical globe, planet in space',
    'abstract diagram, infographic, flowchart, node graph visualization',
    'floating object, tilted paper, perspective view, landscape background, scenic valley',
    'mountains behind map, broken glass, shattered pane, diamond shape, kite shape, torn paper',
    'satellite photo, GPS smartphone app, character portrait, anime face, creature close-up',
    '3d render, photorealistic photograph, text, letters, words, watermark, signature',
    'lowres, worst quality, blurry',
].join(', ');

export function buildCartographyNegativePrompt(theme?: string): string {
    const style = resolveCartographyThemeStyle(theme);
    const parts = [CARTOGRAPHY_NEGATIVE_CORE];
    if (style.extraNegative) {
        parts.push(style.extraNegative);
    }
    return parts.join(', ');
}

function summarizeBiomes(regions: CartographyLayoutRegion[]): string {
    const counts = new Map<RegionBiome, number>();
    for (const r of regions) {
        counts.set(r.biome, (counts.get(r.biome) ?? 0) + 1);
    }
    const parts: string[] = [];
    for (const [biome, count] of counts.entries()) {
        if (count > 0) {
            parts.push(`${count} ${biome} region${count > 1 ? 's' : ''}`);
        }
    }
    return parts.length > 0 ? `featuring ${parts.join(', ')}` : '';
}

/** Stable micro-offset so multiple locations in one region do not stack perfectly. */
function locationOffsetPercent(locationId: string): { dx: number; dy: number } {
    let hash = 0;
    for (let i = 0; i < locationId.length; i++) {
        hash = (hash * 31 + locationId.charCodeAt(i)) >>> 0;
    }
    const dx = ((hash % 17) - 8) * 0.35;
    const dy = (((hash >> 4) % 17) - 8) * 0.35;
    return { dx, dy };
}

export function buildCartographyRegionLabels(forge: WorldForge): CartographyRegionLabel[] {
    const spec = buildCartographyLayoutSpec(forge);
    return spec.regions.map((region) => ({
        regionId: region.id,
        regionName: region.name,
        leftPct: mapCoordToPercent(region.x),
        topPct: Math.min(98, mapCoordToPercent(region.y) + 4),
    }));
}

export function buildCartographyPinPositions(forge: WorldForge): CartographyPinPosition[] {
    const spec = buildCartographyLayoutSpec(forge);
    const regionById = new Map(spec.regions.map((r) => [r.id, r]));
    const pins: CartographyPinPosition[] = [];

    for (const loc of forge.geography.locations.slice(0, MAX_CARTOGRAPHY_LAYOUT_LOCATIONS)) {
        const region = loc.regionId ? regionById.get(loc.regionId) : undefined;
        const x = region?.x ?? 500;
        const y = region?.y ?? 500;
        const offset = locationOffsetPercent(loc.id);
        pins.push({
            locationId: loc.id,
            locationName: loc.name,
            regionId: loc.regionId,
            leftPct: Math.max(0, Math.min(100, mapCoordToPercent(x) + offset.dx)),
            topPct: Math.max(0, Math.min(100, mapCoordToPercent(y) + offset.dy)),
        });
    }
    return pins;
}