import type { GameStateWorld } from './types/GameState';
import type { WorldForge, Region } from './worldForgeCore';
import {
    buildCartographyLayoutSpec,
    mapCoordToPercent,
    CARTOGRAPHY_MAP_SIZE,
    type CartographyPinPosition,
    type CartographyRegionLabel,
} from './cartographyLayoutCore';

export type RegionFogVisibility = 'discovered' | 'rumored' | 'unknown';

export interface FogViewPayload {
    discoveredRegionIds: string[];
    rumoredRegionIds: string[];
    visitedLocationIds: string[];
}

export interface FogRegionLayoutEntry {
    regionId: string;
    leftPct: number;
    topPct: number;
    radiusPct: number;
}

/** Resolve a location's owning region from world_forge geography. */
export function resolveLocationRegionId(forge: WorldForge, locationId: string): string | undefined {
    const loc = forge.geography.locations.find((l) => l.id === locationId);
    return loc?.regionId;
}

/** Rumored = neighbors of discovered regions (connectedTo graph) minus discovered. Not persisted. */
export function deriveRumoredRegionIds(
    discoveredRegionIds: readonly string[],
    regions: readonly Region[]
): string[] {
    const discovered = new Set(discoveredRegionIds);
    const regionById = new Map(regions.map((r) => [r.id, r]));
    const rumored = new Set<string>();

    for (const id of discovered) {
        const region = regionById.get(id);
        if (!region?.connectedTo) { continue; }
        for (const neighborId of region.connectedTo) {
            if (!discovered.has(neighborId) && regionById.has(neighborId)) {
                rumored.add(neighborId);
            }
        }
    }

    return [...rumored].sort();
}

export function getRegionFogVisibility(
    regionId: string,
    discoveredRegionIds: ReadonlySet<string>,
    rumoredRegionIds: ReadonlySet<string>
): RegionFogVisibility {
    if (discoveredRegionIds.has(regionId)) { return 'discovered'; }
    if (rumoredRegionIds.has(regionId)) { return 'rumored'; }
    return 'unknown';
}

/** Backward compat: old saves without discoveredRegionIds seed from currentLocationId's region. */
export function normalizeFogWorldState(
    world: GameStateWorld | undefined,
    forge: WorldForge,
    currentLocationId?: string
): GameStateWorld | undefined {
    const locId = currentLocationId ?? world?.currentLocationId;
    if (!world && !locId) { return world; }

    const next: GameStateWorld = world ? { ...world } : {};
    const discovered = [...(next.discoveredRegionIds ?? [])];

    if (discovered.length === 0 && locId) {
        const regionId = resolveLocationRegionId(forge, locId);
        if (regionId) {
            next.discoveredRegionIds = [regionId];
        }
    }

    if (locId) {
        return applyFogOnLocationVisit(next, forge, locId);
    }

    return Object.keys(next).length > 0 ? next : world;
}

/** Idempotent: append visited location + mark its region discovered (extension-derived only). */
export function applyFogOnLocationVisit(
    world: GameStateWorld,
    forge: WorldForge,
    locationId: string
): GameStateWorld {
    const next: GameStateWorld = { ...world };

    const visited = [...(next.visitedLocationIds ?? [])];
    if (!visited.includes(locationId)) {
        visited.push(locationId);
        next.visitedLocationIds = visited;
    }

    const regionId = resolveLocationRegionId(forge, locationId);
    if (!regionId) { return next; }

    const discovered = [...(next.discoveredRegionIds ?? [])];
    if (!discovered.includes(regionId)) {
        discovered.push(regionId);
        next.discoveredRegionIds = discovered;
    }

    return next;
}

export function buildFogPayload(world: GameStateWorld | undefined, forge: WorldForge): FogViewPayload {
    const discoveredRegionIds = [...(world?.discoveredRegionIds ?? [])];
    const rumoredRegionIds = deriveRumoredRegionIds(discoveredRegionIds, forge.geography.regions);
    const visitedLocationIds = [...(world?.visitedLocationIds ?? [])];
    return { discoveredRegionIds, rumoredRegionIds, visitedLocationIds };
}

/** Percent-space layout for client-side fog masks (parchment overlay + tile distance). */
export function buildFogRegionLayout(forge: WorldForge): FogRegionLayoutEntry[] {
    const spec = buildCartographyLayoutSpec(forge);
    return spec.regions.map((region) => ({
        regionId: region.id,
        leftPct: mapCoordToPercent(region.x),
        topPct: mapCoordToPercent(region.y),
        radiusPct: (region.radius / CARTOGRAPHY_MAP_SIZE) * 100,
    }));
}

/** Q3: mask location names for rumored/unknown regions (Remote Play leak prevention). */
export function maskCartographyPinsForFog(
    pins: CartographyPinPosition[],
    forge: WorldForge,
    fog: FogViewPayload
): CartographyPinPosition[] {
    const discovered = new Set(fog.discoveredRegionIds);
    const rumored = new Set(fog.rumoredRegionIds);

    return pins.map((pin) => {
        const regionId = pin.regionId;
        if (!regionId) { return pin; }

        const visibility = getRegionFogVisibility(regionId, discovered, rumored);
        if (visibility === 'discovered') { return pin; }

        return {
            ...pin,
            locationName: visibility === 'rumored' ? '?' : '',
        };
    });
}

export function maskCartographyRegionLabelsForFog(
    labels: CartographyRegionLabel[],
    fog: FogViewPayload
): CartographyRegionLabel[] {
    const discovered = new Set(fog.discoveredRegionIds);
    const rumored = new Set(fog.rumoredRegionIds);

    return labels.map((label) => {
        const visibility = getRegionFogVisibility(label.regionId, discovered, rumored);
        if (visibility === 'discovered') { return label; }
        if (visibility === 'rumored') { return label; }
        return {
            ...label,
            regionName: '',
        };
    });
}