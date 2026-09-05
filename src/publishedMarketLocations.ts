import { buildFogPayload, normalizeFogWorldState } from './fogOfWarCore';
import type { GameStateWorld } from './types/GameState';
import type { WorldForge } from './worldForgeCore';

/** Same persisted FoW authority as World View; no separate discovery state. */
export function publishedMarketLocationIds(forge: WorldForge, world: GameStateWorld | undefined): ReadonlySet<string> {
    const fog = buildFogPayload(normalizeFogWorldState(world, forge, world?.currentLocationId), forge);
    const discovered = new Set(fog.discoveredRegionIds);
    const visited = new Set(fog.visitedLocationIds);
    return new Set(forge.geography.locations.filter(location =>
        location.id === world?.currentLocationId || visited.has(location.id)
        || (location.regionId !== undefined && discovered.has(location.regionId))).map(location => location.id));
}
