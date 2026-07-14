// Tier 1: aggregate market ticks driven by world events (no vscode/fs).

import type {
    CommerceForge,
    CommodityRole,
    MarketStateMap,
    WorldChangeEventLike,
} from './livingWorldTypes';
import { isFoodCrisisEvent, isSteelCraftEvent } from './livingWorldTypes';
import { reputationTier, type ReputationTier } from './factionReputationCore';
import type { DebugTraceEntry } from './debugTraceCore';

export const DEFAULT_MARKET_RECOVERY_PER_TICK = 2;
export const MAX_PRICE_INDEX = 4;
export const MIN_PRICE_INDEX = 0.25;
export const FOOD_CRISIS_PRICE_BUMP = 0.35;
export const STEEL_IMPROVEMENT_STOCK = 3;
/** Legacy material positive-event price cut (normal profile). */
export const STEEL_IMPROVEMENT_PRICE_REDUCTION = 0.1;

/** Economy pacing enum (mirrors GameRules.economyProfile). */
export type EconomyProfile = 'easy' | 'normal' | 'harsh';

/**
 * Resolved numeric knobs for one economy profile.
 * `normal` matches the pre-profile constants exactly.
 */
export interface EconomyProfileParams {
    recoveryPerTick: number;
    foodCrisisPriceBump: number;
    positiveMaterialStockGain: number;
    positiveMaterialPriceReduction: number;
    maxPriceIndex: number;
}

const ECONOMY_PROFILE_PARAMS: Record<EconomyProfile, EconomyProfileParams> = {
    easy: {
        recoveryPerTick: 3,
        foodCrisisPriceBump: 0.25,
        positiveMaterialStockGain: 4,
        positiveMaterialPriceReduction: 0.15,
        maxPriceIndex: 3.5,
    },
    normal: {
        recoveryPerTick: DEFAULT_MARKET_RECOVERY_PER_TICK,
        foodCrisisPriceBump: FOOD_CRISIS_PRICE_BUMP,
        positiveMaterialStockGain: STEEL_IMPROVEMENT_STOCK,
        positiveMaterialPriceReduction: STEEL_IMPROVEMENT_PRICE_REDUCTION,
        maxPriceIndex: MAX_PRICE_INDEX,
    },
    harsh: {
        recoveryPerTick: 1,
        foodCrisisPriceBump: 0.5,
        positiveMaterialStockGain: 2,
        positiveMaterialPriceReduction: 0.05,
        maxPriceIndex: 5,
    },
};

/** Missing / invalid profile → normal (legacy behavior). */
export function resolveEconomyProfile(profile?: string | null): EconomyProfile {
    if (profile === 'easy' || profile === 'normal' || profile === 'harsh') {
        return profile;
    }
    return 'normal';
}

/** Centralized profile → commerce parameter mapping (do not scatter profile checks). */
export function resolveEconomyProfileParams(profile?: string | null): EconomyProfileParams {
    return ECONOMY_PROFILE_PARAMS[resolveEconomyProfile(profile)];
}

export interface MarketTickOptions {
    worldTurn: number;
    recoveryPerTick?: number;
    /** この sim tick で新規発生したイベントのみ。市場へのイベント適用に使う。 */
    stepEvents?: WorldChangeEventLike[];
    /**
     * Resolved economy profile knobs. When omitted, recovery/shocks use legacy
     * normal defaults. Prefer resolveEconomyProfileParams(profile) at the host.
     */
    economyParams?: EconomyProfileParams;
}

export interface MarketTickSummary {
    worldTurn: number;
    stockRecoveries: number;
    priceAdjustments: number;
    eventsApplied: number;
}

function cloneMarkets(markets: MarketStateMap): MarketStateMap {
    const out: MarketStateMap = {};
    for (const [loc, stocks] of Object.entries(markets)) {
        out[loc] = {};
        for (const [cid, entry] of Object.entries(stocks)) {
            out[loc][cid] = { ...entry };
        }
    }
    return out;
}

function bumpPriceIndex(
    current: number,
    delta: number,
    maxPriceIndex: number = MAX_PRICE_INDEX
): number {
    return Math.max(MIN_PRICE_INDEX, Math.min(maxPriceIndex, current + delta));
}

function marketsInRegion(forge: CommerceForge, regionId: string): string[] {
    return forge.markets
        .filter((m) => m.regionId === regionId)
        .map((m) => m.locationId);
}

function allMarketLocations(forge: CommerceForge): string[] {
    return forge.markets.map((m) => m.locationId);
}

/**
 * Which commodities an economy shock lands on, resolved by economic role.
 *
 * Genre fix (§3): the food crisis / smithing shocks used to hard-key the
 * agrarian-fantasy ids `wheat`/`steel`, so a food crisis in a world without a
 * `wheat` commodity silently did nothing. Now a shock targets every commodity
 * tagged with the matching `role`, letting any world route the effect onto its
 * own vocabulary (rations, parts, nutripaste…). Worlds that tag nothing fall
 * back to the legacy id so existing scenarios (e.g. trade-routes) are unchanged.
 */
export function resolveShockTargetCommodityIds(
    forge: CommerceForge,
    role: CommodityRole,
    legacyCommodityId: string
): string[] {
    const tagged = (forge.commodities ?? [])
        .filter((c) => c.role === role)
        .map((c) => c.id);
    return tagged.length > 0 ? tagged : [legacyCommodityId];
}

/**
 * Apply world change events to market priceIndex / stock (Tier 1 aggregate sim).
 */
export function applyWorldEventsToMarkets(
    forge: CommerceForge,
    markets: MarketStateMap,
    events: WorldChangeEventLike[],
    economyParams?: EconomyProfileParams
): { markets: MarketStateMap; applied: number } {
    const params = economyParams ?? resolveEconomyProfileParams('normal');
    const next = cloneMarkets(markets);
    let applied = 0;

    for (const ev of events) {
        const targets = ev.regionId
            ? marketsInRegion(forge, ev.regionId)
            : allMarketLocations(forge);

        if (isFoodCrisisEvent(ev)) {
            const commodityIds = resolveShockTargetCommodityIds(forge, 'staple', 'wheat');
            for (const loc of targets) {
                for (const cid of commodityIds) {
                    const entry = next[loc]?.[cid];
                    if (entry) {
                        entry.priceIndex = bumpPriceIndex(
                            entry.priceIndex,
                            params.foodCrisisPriceBump,
                            params.maxPriceIndex
                        );
                        applied++;
                    }
                }
            }
        }

        if (isSteelCraftEvent(ev)) {
            const commodityIds = resolveShockTargetCommodityIds(forge, 'material', 'steel');
            for (const loc of targets) {
                for (const cid of commodityIds) {
                    const entry = next[loc]?.[cid];
                    if (entry) {
                        entry.stock += params.positiveMaterialStockGain;
                        entry.priceIndex = bumpPriceIndex(
                            entry.priceIndex,
                            -params.positiveMaterialPriceReduction,
                            params.maxPriceIndex
                        );
                        applied++;
                    }
                }
            }
        }
    }

    return { markets: next, applied };
}

/**
 * Gradual stock recovery toward market targetStock (Meine Reise shop improvement feel).
 */
export function tickMarketRecovery(
    forge: CommerceForge,
    markets: MarketStateMap,
    options: MarketTickOptions
): { markets: MarketStateMap; summary: MarketTickSummary } {
    const economyParams = options.economyParams ?? resolveEconomyProfileParams('normal');
    const recovery = options.recoveryPerTick
        ?? economyParams.recoveryPerTick
        ?? DEFAULT_MARKET_RECOVERY_PER_TICK;
    const maxPriceIndex = economyParams.maxPriceIndex;
    const next = cloneMarkets(markets);
    let stockRecoveries = 0;
    let priceAdjustments = 0;

    for (const market of forge.markets) {
        const target = market.targetStock ?? 30;
        const locStocks = next[market.locationId];
        if (!locStocks) { continue; }

        for (const commodityId of market.commodityIds) {
            const entry = locStocks[commodityId];
            if (!entry) { continue; }

            if (entry.stock < target) {
                const before = entry.stock;
                entry.stock = Math.min(target, entry.stock + recovery);
                if (entry.stock > before) { stockRecoveries++; }
            }

            if (entry.stock >= target && entry.priceIndex > 1) {
                entry.priceIndex = bumpPriceIndex(entry.priceIndex, -0.05, maxPriceIndex);
                priceAdjustments++;
            } else if (entry.stock < target * 0.3 && entry.priceIndex < maxPriceIndex) {
                entry.priceIndex = bumpPriceIndex(entry.priceIndex, 0.05, maxPriceIndex);
                priceAdjustments++;
            }
        }
    }

    const eventResult = applyWorldEventsToMarkets(
        forge,
        next,
        options.stepEvents ?? [],
        economyParams
    );

    return {
        markets: eventResult.markets,
        summary: {
            worldTurn: options.worldTurn,
            stockRecoveries,
            priceAdjustments,
            eventsApplied: eventResult.applied,
        },
    };
}

export interface SinceLastVisitInput {
    lastVisitTurn: number;
    currentTurn: number;
    locationId: string;
    marketsBefore: MarketStateMap;
    marketsAfter: MarketStateMap;
    commodityIds: string[];
}

export interface SinceLastVisitDelta {
    locationId: string;
    turnsAway: number;
    changes: Array<{ commodityId: string; stockDelta: number; priceIndexDelta: number }>;
}

export function computeSinceLastVisitDelta(input: SinceLastVisitInput): SinceLastVisitDelta {
    const turnsAway = Math.max(0, input.currentTurn - input.lastVisitTurn);
    const before = input.marketsBefore[input.locationId] ?? {};
    const after = input.marketsAfter[input.locationId] ?? {};
    const changes: SinceLastVisitDelta['changes'] = [];

    for (const commodityId of input.commodityIds) {
        const b = before[commodityId];
        const a = after[commodityId];
        if (!b && !a) { continue; }
        changes.push({
            commodityId,
            stockDelta: (a?.stock ?? 0) - (b?.stock ?? 0),
            priceIndexDelta: (a?.priceIndex ?? 1) - (b?.priceIndex ?? 1),
        });
    }

    return { locationId: input.locationId, turnsAway, changes };
}

/** Per tick, priceIndex drifts toward a reputation-tier target by at most this much. */
export const REPUTATION_PRICE_DRIFT_PER_TICK = 0.03;

/** Controlling faction's opinion of the player biases their market prices (surcharge when hostile, discount when allied). */
export const REPUTATION_PRICE_BIAS: Record<ReputationTier, number> = {
    hostile: 0.25,
    unfriendly: 0.1,
    neutral: 0,
    friendly: -0.1,
    allied: -0.2,
};

/**
 * Drift market priceIndex toward a reputation-tier target for markets under
 * a faction's control. Locations without a controlling faction, or factions
 * with no tracked reputation, are left untouched (neutral = no drift anyway).
 */
export function tickFactionReputationMarketDemand(
    forge: CommerceForge,
    markets: MarketStateMap,
    marketFactionIds: Record<string, string | undefined>,
    factionReputations: Record<string, number>
): { markets: MarketStateMap; applied: number } {
    const next = cloneMarkets(markets);
    let applied = 0;

    for (const market of forge.markets) {
        const factionId = marketFactionIds[market.locationId];
        if (!factionId) { continue; }
        const bias = REPUTATION_PRICE_BIAS[reputationTier(factionReputations[factionId] ?? 0)];
        const target = 1 + bias;
        const locStocks = next[market.locationId];
        if (!locStocks) { continue; }

        for (const commodityId of market.commodityIds) {
            const entry = locStocks[commodityId];
            if (!entry) { continue; }
            const diff = target - entry.priceIndex;
            if (Math.abs(diff) < 0.005) { continue; }
            const step = Math.sign(diff) * Math.min(Math.abs(diff), REPUTATION_PRICE_DRIFT_PER_TICK);
            entry.priceIndex = bumpPriceIndex(entry.priceIndex, step);
            applied++;
        }
    }

    return { markets: next, applied };
}

/** Debug / GM override: multiply priceIndex at one market commodity (clamped). */
export function applyMarketPriceMultiplier(
    markets: MarketStateMap,
    locationId: string,
    commodityId: string,
    multiplier: number
): { markets: MarketStateMap; applied: boolean } {
    if (!Number.isFinite(multiplier) || multiplier <= 0) {
        return { markets, applied: false };
    }
    const loc = markets[locationId];
    const entry = loc?.[commodityId];
    if (!entry) {
        return { markets, applied: false };
    }
    const next = cloneMarkets(markets);
    const target = next[locationId][commodityId];
    target.priceIndex = Math.max(
        MIN_PRICE_INDEX,
        Math.min(MAX_PRICE_INDEX, target.priceIndex * multiplier)
    );
    return { markets: next, applied: true };
}

/** Deep Emit P2: generate traces for price bumps driven by world events. */
export function buildCommercePriceBumpTraceEntries(
    runId: string,
    worldTurn: number,
    forge: CommerceForge,
    marketsBefore: MarketStateMap,
    marketsAfter: MarketStateMap,
    stepEvents: WorldChangeEventLike[]
): DebugTraceEntry[] {
    const entries: DebugTraceEntry[] = [];
    const parentTraceId = `trace_step_${worldTurn}`;
    let anonSequence = 0;

    for (const ev of stepEvents) {
        if (!isFoodCrisisEvent(ev) && !isSteelCraftEvent(ev)) {
            continue;
        }

        const targets = ev.regionId
            ? marketsInRegion(forge, ev.regionId)
            : allMarketLocations(forge);

        const foodCommodityIds = isFoodCrisisEvent(ev)
            ? resolveShockTargetCommodityIds(forge, 'staple', 'wheat')
            : [];
        const steelCommodityIds = isSteelCraftEvent(ev)
            ? resolveShockTargetCommodityIds(forge, 'material', 'steel')
            : [];

        for (const loc of targets) {
            for (const cid of foodCommodityIds) {
                const before = marketsBefore[loc]?.[cid]?.priceIndex;
                const after = marketsAfter[loc]?.[cid]?.priceIndex;
                if (before !== undefined && after !== undefined && after !== before) {
                    anonSequence++;
                    const evId = ev.id ? ev.id : `anon${anonSequence}`;
                    entries.push({
                        version: 1,
                        runId,
                        traceId: `trace_com_bump_${loc}_${cid}_t${worldTurn}_${evId}`,
                        parentTraceId,
                        worldTurn,
                        subsystem: 'worldSimCommerce',
                        phase: 'effect',
                        ruleId: 'food_crisis_price_bump',
                        decision: `bump_${cid}`,
                        message: `Food crisis shock in ${loc}: ${cid} price index ${before.toFixed(2)} → ${after.toFixed(2)}`,
                        inputRefs: ev.id ? [{ kind: 'event', id: ev.id }] : undefined,
                        outputRefs: [{ kind: 'location', id: loc }],
                        audience: 'gm_safe',
                    });
                }
            }

            for (const cid of steelCommodityIds) {
                const before = marketsBefore[loc]?.[cid]?.priceIndex;
                const after = marketsAfter[loc]?.[cid]?.priceIndex;
                if (before !== undefined && after !== undefined && after !== before) {
                    anonSequence++;
                    const evId = ev.id ? ev.id : `anon${anonSequence}`;
                    entries.push({
                        version: 1,
                        runId,
                        traceId: `trace_com_bump_${loc}_${cid}_t${worldTurn}_${evId}`,
                        parentTraceId,
                        worldTurn,
                        subsystem: 'worldSimCommerce',
                        phase: 'effect',
                        ruleId: 'steel_craft_price_bump',
                        decision: `bump_${cid}`,
                        message: `Steel craft shock in ${loc}: ${cid} price index ${before.toFixed(2)} → ${after.toFixed(2)}`,
                        inputRefs: ev.id ? [{ kind: 'event', id: ev.id }] : undefined,
                        outputRefs: [{ kind: 'location', id: loc }],
                        audience: 'gm_safe',
                    });
                }
            }
        }
    }
    return entries;
}