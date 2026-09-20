import type { GameStateWorld } from './types/GameState';
import type { WorldForge, Region } from './worldForgeCore';
import type { RegionWorldState } from './worldStateCore';
import {
    buildCartographyLayoutSpec,
    buildCartographyPinPositions,
    mapCoordToPercent,
    CARTOGRAPHY_MAP_SIZE,
    type CartographyPinPosition,
    type CartographyRegionLabel,
    type CartographyRouteEdge,
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

/** Enriched pin metadata for World tab interaction (PR3 detail panel + hit tests). */
export interface WorldViewLocationPinMeta {
    locationId: string;
    /** Real name when discovered; empty when hidden by FoW. */
    locationName: string;
    locationType: string;
    regionId?: string;
    regionName?: string;
    dangerLevel?: number;
    factionName?: string;
    dangerTier?: 'none' | 'low' | 'medium' | 'high';
    mapHighlight?: boolean;
    highlightSeverity?: 'info' | 'warning' | 'critical';
    leftPct: number;
    topPct: number;
    fogVisibility: RegionFogVisibility;
    isCurrent: boolean;
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
    const rumoredRegionIds = mergeRumoredRegionIdsForFog(
        discoveredRegionIds,
        world?.rumorKnownRegionIds ?? [],
        forge
    );
    const visitedLocationIds = [...(world?.visitedLocationIds ?? [])];
    return { discoveredRegionIds, rumoredRegionIds, visitedLocationIds };
}

/** C9: graph-derived rumored ∪ rumorKnown − discovered. */
export function mergeRumoredRegionIdsForFog(
    discoveredRegionIds: readonly string[],
    rumorKnownRegionIds: readonly string[],
    forge: WorldForge
): string[] {
    const discovered = new Set(discoveredRegionIds);
    const derived = deriveRumoredRegionIds(discoveredRegionIds, forge.geography.regions);
    const merged = new Set<string>();
    for (const id of derived) {
        if (!discovered.has(id)) { merged.add(id); }
    }
    for (const id of rumorKnownRegionIds) {
        if (!discovered.has(id)) { merged.add(id); }
    }
    return [...merged].sort();
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

export function buildLocationPinCatalog(
    forge: WorldForge,
    currentLocationId: string | undefined | null,
    regionStates: Record<string, RegionWorldState> | undefined,
    fog: FogViewPayload,
    regionHighlightMeta?: Map<string, { mapHighlight: boolean; severity: 'info' | 'warning' | 'critical' }>
): WorldViewLocationPinMeta[] {
    const pins = buildCartographyPinPositions(forge);
    const discovered = new Set(fog.discoveredRegionIds);
    const rumored = new Set(fog.rumoredRegionIds);
    const regionById = new Map(forge.geography.regions.map((r) => [r.id, r]));
    const locById = new Map(forge.geography.locations.map((l) => [l.id, l]));
    const factionById = new Map(forge.factions.map((f) => [f.id, f]));

    return pins.map((pin) => {
        const loc = locById.get(pin.locationId);
        const region = pin.regionId ? regionById.get(pin.regionId) : undefined;
        const fogVisibility = pin.regionId
            ? getRegionFogVisibility(pin.regionId, discovered, rumored)
            : 'discovered';
        const liveDanger = pin.regionId ? regionStates?.[pin.regionId]?.dangerLevel : undefined;
        const faction = loc?.factionControl ? factionById.get(loc.factionControl) : undefined;
        const isCurrent = pin.locationId === currentLocationId;
        const showName = fogVisibility === 'discovered' || isCurrent;

        const highlight = pin.regionId ? regionHighlightMeta?.get(pin.regionId) : undefined;
        const dangerLevel = fogVisibility === 'discovered' ? (liveDanger ?? region?.dangerLevel) : undefined;

        return {
            locationId: pin.locationId,
            locationName: showName ? (loc?.name ?? pin.locationName) : '',
            locationType: loc?.type ?? 'other',
            regionId: pin.regionId,
            regionName: fogVisibility !== 'unknown' ? region?.name : undefined,
            dangerLevel,
            dangerTier: undefined,
            factionName: fogVisibility === 'discovered' ? faction?.name : undefined,
            mapHighlight: fogVisibility === 'discovered' && Boolean(highlight?.mapHighlight),
            highlightSeverity: fogVisibility === 'discovered' ? highlight?.severity : undefined,
            leftPct: pin.leftPct,
            topPct: pin.topPct,
            fogVisibility,
            isCurrent,
        };
    });
}

/** Region names the player has not discovered (for GM FoW prompt line). */
export function listUnexploredRegionNames(
    forge: WorldForge,
    discoveredRegionIds: readonly string[]
): string[] {
    const discovered = new Set(discoveredRegionIds);
    return forge.geography.regions
        .filter((r) => !discovered.has(r.id))
        .map((r) => r.name)
        .sort((a, b) => a.localeCompare(b));
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

/** Drop trade-route lines where either endpoint region is still fully unknown (FoW). */
export function maskCartographyRouteEdgesForFog(
    edges: CartographyRouteEdge[],
    fog: FogViewPayload
): CartographyRouteEdge[] {
    const discovered = new Set(fog.discoveredRegionIds);
    const rumored = new Set(fog.rumoredRegionIds);

    return edges.filter((edge) => {
        const fromVisibility = getRegionFogVisibility(edge.fromRegionId, discovered, rumored);
        const toVisibility = getRegionFogVisibility(edge.toRegionId, discovered, rumored);
        return fromVisibility !== 'unknown' && toVisibility !== 'unknown';
    });
}