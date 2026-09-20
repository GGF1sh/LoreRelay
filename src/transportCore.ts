// LW1 Transport: travel days, consumption, region/location paths (no vscode/fs).

import type { CommerceForge, LocationGraphNode, RegionGraphNode, TransportKindDef } from './livingWorldTypes';

export const MAX_PATH_HOPS = 32;
export const DEFAULT_TRAVEL_DAYS = 3;
export const MIN_TRAVEL_DAYS = 1;

export interface TravelPlanInput {
    fromLocationId: string;
    toLocationId: string;
    locations: LocationGraphNode[];
    regions?: RegionGraphNode[];
    transportId: string;
    forge: CommerceForge;
    /** Override base days (Layer B narrative). */
    narrativeDays?: number;
}

export interface TravelPlan {
    fromLocationId: string;
    toLocationId: string;
    transportId: string;
    transportName: string;
    days: number;
    regionPath: string[];
    foodCost: number;
    cargoWeight: number;
    capacity: number;
}

function transportKind(forge: CommerceForge, transportId: string): TransportKindDef | undefined {
    return forge.transportKinds.find((t) => t.id === transportId);
}

function locationById(locations: LocationGraphNode[], id: string): LocationGraphNode | undefined {
    return locations.find((l) => l.id === id);
}

/** BFS shortest hop path on an undirected location graph. */
export function findLocationPath(
    locations: LocationGraphNode[],
    fromId: string,
    toId: string
): string[] | undefined {
    if (fromId === toId) { return [fromId]; }
    const byId = new Map(locations.map((l) => [l.id, l]));
    if (!byId.has(fromId) || !byId.has(toId)) { return undefined; }

    const queue: string[] = [fromId];
    const prev = new Map<string, string | null>([[fromId, null]]);
    let hops = 0;

    while (queue.length > 0 && hops <= MAX_PATH_HOPS) {
        const size = queue.length;
        for (let i = 0; i < size; i++) {
            const cur = queue.shift()!;
            if (cur === toId) {
                const path: string[] = [];
                let node: string | null = toId;
                while (node) {
                    path.unshift(node);
                    node = prev.get(node) ?? null;
                }
                return path;
            }
            const loc = byId.get(cur);
            for (const next of loc?.connectedTo ?? []) {
                if (!byId.has(next) || prev.has(next)) { continue; }
                prev.set(next, cur);
                queue.push(next);
            }
        }
        hops++;
    }
    return undefined;
}

/** BFS on region graph (for hazard / encounter hooks). */
export function findRegionPath(
    regions: RegionGraphNode[],
    fromRegionId: string,
    toRegionId: string
): string[] | undefined {
    if (fromRegionId === toRegionId) { return [fromRegionId]; }
    const byId = new Map(regions.map((r) => [r.id, r]));
    if (!byId.has(fromRegionId) || !byId.has(toRegionId)) { return undefined; }

    const queue: string[] = [fromRegionId];
    const prev = new Map<string, string | null>([[fromRegionId, null]]);
    let hops = 0;

    while (queue.length > 0 && hops <= MAX_PATH_HOPS) {
        const size = queue.length;
        for (let i = 0; i < size; i++) {
            const cur = queue.shift()!;
            if (cur === toRegionId) {
                const path: string[] = [];
                let node: string | null = toRegionId;
                while (node) {
                    path.unshift(node);
                    node = prev.get(node) ?? null;
                }
                return path;
            }
            const reg = byId.get(cur);
            for (const next of reg?.connectedTo ?? []) {
                if (!byId.has(next) || prev.has(next)) { continue; }
                prev.set(next, cur);
                queue.push(next);
            }
        }
        hops++;
    }
    return undefined;
}

export function computeTravelDays(
    pathHops: number,
    speed: number,
    narrativeDays?: number
): number {
    if (narrativeDays !== undefined && narrativeDays > 0) {
        return Math.max(MIN_TRAVEL_DAYS, Math.floor(narrativeDays));
    }
    const safeSpeed = Math.max(0.25, speed);
    const base = Math.max(1, pathHops);
    return Math.max(MIN_TRAVEL_DAYS, Math.ceil(base / safeSpeed));
}

export function computeFoodConsumption(
    days: number,
    transport: TransportKindDef,
    cargoWeight: number
): number {
    const perDay = transport.foodPerDay ?? 1;
    const cargoFactor = 1 + Math.floor(cargoWeight / 20) * 0.1;
    return Math.ceil(days * perDay * cargoFactor);
}

export function resolveTransportForTheme(
    forge: CommerceForge,
    theme: string | undefined,
    preferredId?: string
): TransportKindDef | undefined {
    if (preferredId) {
        const direct = transportKind(forge, preferredId);
        if (direct) { return direct; }
    }
    const kinds = forge.transportKinds;
    if (!kinds.length) { return undefined; }
    if (theme) {
        const themed = kinds.find((k) => k.themes?.includes(theme));
        if (themed) { return themed; }
    }
    return kinds[0];
}

export function planTravel(input: TravelPlanInput, cargoWeight = 0): TravelPlan | undefined {
    const kind = transportKind(input.forge, input.transportId);
    if (!kind) { return undefined; }

    const path = findLocationPath(input.locations, input.fromLocationId, input.toLocationId);
    if (!path) { return undefined; }

    const hopCount = Math.max(1, path.length - 1);
    const days = computeTravelDays(hopCount, kind.speed, input.narrativeDays);

    const regionPath: string[] = [];
    if (input.regions?.length) {
        const fromLoc = locationById(input.locations, input.fromLocationId);
        const toLoc = locationById(input.locations, input.toLocationId);
        if (fromLoc?.regionId && toLoc?.regionId) {
            const rpath = findRegionPath(input.regions, fromLoc.regionId, toLoc.regionId);
            if (rpath) { regionPath.push(...rpath); }
        }
    }

    return {
        fromLocationId: input.fromLocationId,
        toLocationId: input.toLocationId,
        transportId: kind.id,
        transportName: kind.name,
        days,
        regionPath,
        foodCost: computeFoodConsumption(days, kind, cargoWeight),
        cargoWeight,
        capacity: kind.capacity,
    };
}