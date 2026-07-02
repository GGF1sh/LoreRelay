// LW-W1 host bridge: world-kit tick + GM prompt wiring (vscode allowed).

import type { WorldForge } from './worldForgeCore';
import type { WorldState } from './worldStateCore';
import type { NpcRegistry } from './npcRegistryCore';
import type { GameRules } from './gameRules';
import type {
    CommerceForge,
    MarketStateMap,
    MarketStockEntry,
    NpcPositionsMap,
    NpcRegistryLike,
} from './livingWorldTypes';
import { parseCommerceForge } from './livingWorldForgeCore';
import { initializeMarketState } from './commerceCore';
import { runLivingWorldTick } from './worldKitTickCore';
import {
    buildLivingWorldPromptBlocks,
    formatLivingWorldGmInjection,
} from './livingWorldPromptCore';
import { computeSinceLastVisitDelta } from './worldSimCommerceCore';
import type { WorldChangeEvent } from './worldEventLogCore';

export interface LivingWorldWorldStateExt {
    markets?: MarketStateMap;
    npcPositions?: NpcPositionsMap;
    /** Per-location worldTurn when player last left (Since-last-visit). */
    lastVisitTurnByLocation?: Record<string, number>;
    /** Market stock snapshot when player last left each location. */
    marketSnapshotByLocation?: Record<string, Record<string, MarketStockEntry>>;
}

function cloneLocationMarketSnapshot(
    markets: MarketStateMap | undefined,
    locationId: string
): Record<string, MarketStockEntry> | undefined {
    const loc = markets?.[locationId];
    if (!loc) { return undefined; }
    const out: Record<string, MarketStockEntry> = {};
    for (const [commodityId, entry] of Object.entries(loc)) {
        out[commodityId] = { stock: entry.stock, priceIndex: entry.priceIndex };
    }
    return Object.keys(out).length > 0 ? out : undefined;
}

export function livingWorldEnabled(rules: GameRules): boolean {
    return rules.enableCommerce === true || rules.enableNpcAgency === true;
}

export function resolveCommerceForge(forge: WorldForge, rawForge?: unknown): CommerceForge | undefined {
    const raw = rawForge && typeof rawForge === 'object'
        ? (rawForge as Record<string, unknown>).commerce
        : undefined;
    return parseCommerceForge(raw);
}

export function ensureLivingWorldMarkets(
    commerce: CommerceForge,
    state: WorldState & LivingWorldWorldStateExt
): MarketStateMap {
    if (state.markets && Object.keys(state.markets).length > 0) {
        return state.markets;
    }
    return initializeMarketState(commerce);
}

function registryToAgencyLike(registry: NpcRegistry | undefined): NpcRegistryLike {
    const out: NpcRegistryLike = {};
    if (!registry) { return out; }
    for (const [id, entry] of Object.entries(registry.npcs)) {
        out[id] = {
            name: entry.name,
            locationId: entry.locationId,
            factionId: entry.factionId,
        };
    }
    return out;
}

export interface LivingWorldTickOutcome {
    state: WorldState & LivingWorldWorldStateExt;
    injection?: string;
}

/**
 * Run Tier-1/Tier-2 living world tick after emergent sim step.
 * Mutates and returns extended world state fields on the same object shape.
 */
export function tickLivingWorldAfterSim(
    forge: WorldForge,
    state: WorldState,
    registry: NpcRegistry | undefined,
    rules: GameRules,
    rawForgeDoc?: unknown
): LivingWorldTickOutcome {
    const ext = state as WorldState & LivingWorldWorldStateExt;
    if (!livingWorldEnabled(rules)) {
        return { state: ext };
    }

    const commerce = resolveCommerceForge(forge, rawForgeDoc);
    if (!commerce && rules.enableCommerce) {
        return { state: ext };
    }

    const markets = commerce
        ? ensureLivingWorldMarkets(commerce, ext)
        : (ext.markets ?? {});

    const tick = runLivingWorldTick({
        forge: commerce ?? { commodities: [], markets: [], transportKinds: [] },
        markets,
        registry: registryToAgencyLike(registry),
        npcPositions: ext.npcPositions ?? {},
        worldTurn: state.worldTurn,
        recentChanges: mapRecentChanges(state.recentChanges),
        commerceEnabled: rules.enableCommerce === true && !!commerce,
        agencyEnabled: rules.enableNpcAgency === true && rules.enableNpcRegistry === true,
    });

    ext.markets = tick.markets;
    ext.npcPositions = tick.npcPositions;

    return { state: ext };
}

function mapRecentChanges(events: WorldChangeEvent[] | undefined) {
    return (events ?? []).map((e) => ({
        worldTurn: e.worldTurn,
        category: e.category,
        severity: e.severity,
        message: e.message,
        regionId: e.regionId,
        factionId: e.factionId,
    }));
}

export function buildLivingWorldGmLines(
    forge: WorldForge,
    state: WorldState,
    registry: NpcRegistry | undefined,
    rules: GameRules,
    rawForgeDoc: unknown,
    playerLocationId?: string
): string {
    if (!livingWorldEnabled(rules)) { return ''; }

    const commerce = resolveCommerceForge(forge, rawForgeDoc);
    if (!commerce && !rules.enableNpcAgency) { return ''; }

    const ext = state as WorldState & LivingWorldWorldStateExt;
    const markets = ext.markets ?? (commerce ? initializeMarketState(commerce) : {});
    const snapshot = playerLocationId
        ? ext.marketSnapshotByLocation?.[playerLocationId]
        : undefined;
    const lastVisitTurn = playerLocationId
        ? ext.lastVisitTurnByLocation?.[playerLocationId]
        : undefined;
    const commodityIds = commerce?.markets.find((m) => m.locationId === playerLocationId)?.commodityIds ?? [];
    const lastVisit = (
        playerLocationId
        && snapshot
        && lastVisitTurn !== undefined
        && commodityIds.length > 0
    )
        ? computeSinceLastVisitDelta({
            lastVisitTurn,
            currentTurn: state.worldTurn,
            locationId: playerLocationId,
            marketsBefore: { [playerLocationId]: snapshot },
            marketsAfter: markets,
            commodityIds,
        })
        : undefined;

    const locationNames: Record<string, string> = {};
    for (const loc of forge.geography.locations) {
        locationNames[loc.id] = loc.name;
    }

    const blocks = buildLivingWorldPromptBlocks({
        forge: commerce ?? { commodities: [], markets: [], transportKinds: [] },
        markets,
        registry: registryToAgencyLike(registry),
        npcPositions: ext.npcPositions ?? {},
        worldTurn: state.worldTurn,
        commerceEnabled: rules.enableCommerce === true && !!commerce,
        agencyEnabled: rules.enableNpcAgency === true,
        playerLocationId,
        sinceLastVisit: lastVisit && lastVisit.turnsAway > 0 ? lastVisit : undefined,
        locationNames,
    });

    return formatLivingWorldGmInjection(blocks);
}

/**
 * Record player departure from a location: stamp turn + market snapshot for Since-last-visit.
 */
export function recordLocationVisit(
    state: WorldState,
    departedLocationId: string,
    markets?: MarketStateMap
): WorldState & LivingWorldWorldStateExt {
    const ext = state as WorldState & LivingWorldWorldStateExt;
    if (!departedLocationId) { return ext; }

    const visits = { ...(ext.lastVisitTurnByLocation ?? {}) };
    visits[departedLocationId] = state.worldTurn;
    ext.lastVisitTurnByLocation = visits;

    const snapshot = cloneLocationMarketSnapshot(markets ?? ext.markets, departedLocationId);
    if (snapshot) {
        const snapshots = { ...(ext.marketSnapshotByLocation ?? {}) };
        snapshots[departedLocationId] = snapshot;
        ext.marketSnapshotByLocation = snapshots;
    }

    return ext;
}