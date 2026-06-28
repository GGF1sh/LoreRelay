import type { WorldForge, Region, RegionBiome } from './worldForgeCore';
import { inferRegionBiomeFromType } from './worldForgeCore';

/** LoreRelay map coordinate space (matches world_forge Region x/y). */
export const CARTOGRAPHY_MAP_SIZE = 1000;
export const DEFAULT_LAYOUT_IMAGE_SIZE = 1024;
export const DEFAULT_REGION_RADIUS_MAP = 72;

export interface CartographyLayoutRegion {
    id: string;
    name: string;
    biome: RegionBiome;
    /** Map space 0..1000 */
    x: number;
    y: number;
    /** Map space radius for layout blobs */
    radius: number;
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
    const regions = forge.geography.regions;
    const byId = new Map(regions.map((r) => [r.id, r]));
    const layoutRegions: CartographyLayoutRegion[] = regions.map((region, index) => {
        const biome = resolveRegionBiome(region);
        const pos = resolveRegionPosition(region, index, regions.length);
        return {
            id: region.id,
            name: region.name,
            biome,
            x: pos.x,
            y: pos.y,
            radius: regionRadiusForBiome(biome),
        };
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

export function buildCartographyPositivePrompt(spec: CartographyLayoutSpec): string {
    const theme = spec.theme ? `${spec.theme} fantasy` : 'fantasy';
    const biomeSummary = summarizeBiomes(spec.regions);
    return [
        `ancient parchment fantasy world map of ${spec.worldName}`,
        `${theme} cartography`,
        'top-down illustrated map on aged paper',
        'hand-drawn coastlines, mountain chains, forests, deserts, rivers',
        'ornate compass rose, decorative border, ink lines, warm sepia tones',
        'no modern UI, no photorealistic satellite view',
        biomeSummary,
        'masterpiece, best quality, highly detailed map illustration',
    ].join(', ');
}

export function buildCartographyNegativePrompt(): string {
    return [
        'lowres, worst quality, blurry, watermark, signature, text overlay',
        'modern map, GPS, satellite photo, 3d render, anime character',
        'sci-fi HUD, UI elements, illegible gibberish text blocks',
    ].join(', ');
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

export function buildCartographyPinPositions(forge: WorldForge): CartographyPinPosition[] {
    const spec = buildCartographyLayoutSpec(forge);
    const regionById = new Map(spec.regions.map((r) => [r.id, r]));
    const pins: CartographyPinPosition[] = [];

    for (const loc of forge.geography.locations) {
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