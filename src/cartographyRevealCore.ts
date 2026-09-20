// Cartography C9: validated turn_result.cartographyReveal → game_state.world FoW updates.
// No vscode/fs/DOM imports — see docs/CARTOGRAPHY_C9_DESIGN.md

import type { GameStateWorld, HeldMapItem, MapItemKind } from './types/GameState';
import type { WorldForge } from './worldForgeCore';
import { isValidEventId } from './worldEventLogCore';

export const MAX_REVEAL_REGIONS_PER_TURN = 3;
export const MAX_GRANT_ITEMS_PER_TURN = 5;
export const MAX_HELD_MAP_ITEMS = 20;
export const MAX_MAP_ITEM_NAME_LEN = 120;

export type RevealStrength = 'discovered' | 'rumored';

export interface CartographyRevealRegionInput {
    regionId: string;
    strength?: RevealStrength;
    source?: string;
}

export interface CartographyRevealGrantItemInput {
    id: string;
    name: string;
    kind?: MapItemKind;
    consumable?: boolean;
}

export interface CartographyRevealInput {
    regions?: CartographyRevealRegionInput[];
    grantItems?: CartographyRevealGrantItemInput[];
    consumedItemIds?: string[];
}

export interface CartographyRevealApplyStats {
    appliedDiscovered: string[];
    appliedRumored: string[];
    rejectedCount: number;
    grantedItemIds: string[];
    consumedItemIds: string[];
}

const VALID_KINDS = new Set<MapItemKind>(['map', 'rumor', 'informant']);

function appendUnique(ids: string[], id: string): string[] {
    return ids.includes(id) ? ids : [...ids, id];
}

function removeId(ids: string[], id: string): string[] {
    return ids.filter((x) => x !== id);
}

function parseRevealStrength(raw: unknown, fallback: RevealStrength): RevealStrength {
    return raw === 'discovered' ? 'discovered' : raw === 'rumored' ? 'rumored' : fallback;
}

function normalizeGrantItem(raw: CartographyRevealGrantItemInput): HeldMapItem | undefined {
    const id = typeof raw.id === 'string' && isValidEventId(raw.id) ? raw.id : '';
    const name = typeof raw.name === 'string' ? raw.name.trim().slice(0, MAX_MAP_ITEM_NAME_LEN) : '';
    if (!id || !name) { return undefined; }
    const kind: MapItemKind = VALID_KINDS.has(raw.kind as MapItemKind)
        ? (raw.kind as MapItemKind)
        : 'map';
    const item: HeldMapItem = { id, name, kind };
    if (raw.consumable === true) { item.consumable = true; }
    return item;
}

/**
 * Apply validated cartographyReveal to game_state.world.
 * Does not mutate input world object.
 */
export function applyCartographyReveal(
    world: GameStateWorld,
    forge: WorldForge,
    reveal: CartographyRevealInput | undefined
): { world: GameStateWorld; stats: CartographyRevealApplyStats | null } {
    if (!reveal) {
        return { world, stats: null };
    }

    const validRegionIds = new Set(forge.geography.regions.map((r) => r.id));
    const next: GameStateWorld = { ...world };
    let discovered = [...(next.discoveredRegionIds ?? [])];
    let rumorKnown = [...(next.rumorKnownRegionIds ?? [])];
    const discoveredSet = () => new Set(discovered);
    let mapItems = [...(next.mapItems ?? [])];
    const consumed = new Set(next.mapItemsConsumed ?? []);
    const heldIds = new Set(mapItems.map((m) => m.id));

    const stats: CartographyRevealApplyStats = {
        appliedDiscovered: [],
        appliedRumored: [],
        rejectedCount: 0,
        grantedItemIds: [],
        consumedItemIds: [],
    };

    let appliedCount = 0;
    const regionInputs = Array.isArray(reveal.regions) ? reveal.regions : [];

    for (const entry of regionInputs) {
        if (appliedCount >= MAX_REVEAL_REGIONS_PER_TURN) {
            stats.rejectedCount++;
            continue;
        }
        const regionId = typeof entry?.regionId === 'string' ? entry.regionId.trim() : '';
        if (!regionId || !isValidEventId(regionId) || !validRegionIds.has(regionId)) {
            stats.rejectedCount++;
            continue;
        }

        const strength = parseRevealStrength(entry.strength, 'rumored');
        const isDiscovered = discoveredSet().has(regionId);

        if (strength === 'discovered') {
            if (!isDiscovered) {
                discovered = appendUnique(discovered, regionId);
                stats.appliedDiscovered.push(regionId);
                appliedCount++;
            }
            rumorKnown = removeId(rumorKnown, regionId);
        } else {
            if (!isDiscovered && !rumorKnown.includes(regionId)) {
                rumorKnown = appendUnique(rumorKnown, regionId);
                stats.appliedRumored.push(regionId);
                appliedCount++;
            }
        }
    }

    const grantInputs = Array.isArray(reveal.grantItems) ? reveal.grantItems.slice(0, MAX_GRANT_ITEMS_PER_TURN) : [];
    for (const raw of grantInputs) {
        const item = normalizeGrantItem(raw);
        if (!item || heldIds.has(item.id) || consumed.has(item.id)) { continue; }
        if (mapItems.length >= MAX_HELD_MAP_ITEMS) { break; }
        mapItems = [...mapItems, item];
        heldIds.add(item.id);
        stats.grantedItemIds.push(item.id);
    }

    const consumeInputs = Array.isArray(reveal.consumedItemIds) ? reveal.consumedItemIds : [];
    for (const rawId of consumeInputs) {
        if (typeof rawId !== 'string' || !isValidEventId(rawId)) { continue; }
        const held = mapItems.find((m) => m.id === rawId);
        if (!held) { continue; }
        mapItems = mapItems.filter((m) => m.id !== rawId);
        if (!consumed.has(rawId)) {
            next.mapItemsConsumed = appendUnique([...(next.mapItemsConsumed ?? [])], rawId);
            stats.consumedItemIds.push(rawId);
        }
    }

    if (discovered.length > 0) { next.discoveredRegionIds = discovered; }
    if (regionInputs.length > 0) {
        if (rumorKnown.length > 0) {
            next.rumorKnownRegionIds = rumorKnown;
        } else {
            delete next.rumorKnownRegionIds;
        }
    }
    if (mapItems.length > 0 || next.mapItems) { next.mapItems = mapItems; }

    const changed = stats.appliedDiscovered.length > 0
        || stats.appliedRumored.length > 0
        || stats.grantedItemIds.length > 0
        || stats.consumedItemIds.length > 0
        || stats.rejectedCount > 0;

    return { world: changed || consumeInputs.length > 0 ? next : world, stats: changed ? stats : null };
}

/** Parse loose turn_result.cartographyReveal for processTurnResult. */
export function parseCartographyReveal(raw: unknown): CartographyRevealInput | undefined {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
        return undefined;
    }
    const doc = raw as Record<string, unknown>;
    const out: CartographyRevealInput = {};

    if (Array.isArray(doc.regions)) {
        const regions: CartographyRevealRegionInput[] = [];
        for (const item of doc.regions.slice(0, MAX_REVEAL_REGIONS_PER_TURN + 5)) {
            if (!item || typeof item !== 'object') { continue; }
            const r = item as Record<string, unknown>;
            const regionId = typeof r.regionId === 'string' ? r.regionId.trim() : '';
            if (!regionId) { continue; }
            const entry: CartographyRevealRegionInput = { regionId };
            if (r.strength === 'discovered' || r.strength === 'rumored') {
                entry.strength = r.strength;
            }
            if (typeof r.source === 'string' && r.source.trim()) {
                entry.source = r.source.trim().slice(0, 200);
            }
            regions.push(entry);
        }
        if (regions.length > 0) { out.regions = regions; }
    }

    if (Array.isArray(doc.grantItems)) {
        const grantItems: CartographyRevealGrantItemInput[] = [];
        for (const item of doc.grantItems.slice(0, MAX_GRANT_ITEMS_PER_TURN + 2)) {
            if (!item || typeof item !== 'object') { continue; }
            const g = item as Record<string, unknown>;
            if (typeof g.id !== 'string' || typeof g.name !== 'string') { continue; }
            const grant: CartographyRevealGrantItemInput = {
                id: g.id.trim(),
                name: g.name.trim(),
            };
            if (g.kind === 'map' || g.kind === 'rumor' || g.kind === 'informant') {
                grant.kind = g.kind;
            }
            if (g.consumable === true) { grant.consumable = true; }
            grantItems.push(grant);
        }
        if (grantItems.length > 0) { out.grantItems = grantItems; }
    }

    if (Array.isArray(doc.consumedItemIds)) {
        const consumedItemIds = doc.consumedItemIds
            .filter((id): id is string => typeof id === 'string' && isValidEventId(id))
            .slice(0, MAX_GRANT_ITEMS_PER_TURN);
        if (consumedItemIds.length > 0) { out.consumedItemIds = consumedItemIds; }
    }

    return Object.keys(out).length > 0 ? out : undefined;
}

/** Held map items excluding consumed ids (for World tab UI). */
export function listActiveMapItems(world: GameStateWorld | undefined): HeldMapItem[] {
    const consumed = new Set(world?.mapItemsConsumed ?? []);
    return (world?.mapItems ?? []).filter((m) => !consumed.has(m.id));
}