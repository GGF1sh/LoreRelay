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

/**
 * Absolute economy scarcity scale. Five fixed tiers from resource-rich to
 * resource-starved. This is the "absolute standard" — no fuzzy interpretation:
 * each tier is a concrete parameter set (see ECONOMY_TIER_PARAMS). A world can
 * apply one tier globally, or a different tier per resource category / per
 * commodity (see EconomyDifficultyConfig), so "minerals abundant but farmland
 * barren" is expressible.
 */
export type EconomyTier = 'abundant' | 'plentiful' | 'normal' | 'scarce' | 'barren';

/**
 * Back-compat alias: the legacy 3-value pacing enum. Retained as an accepted
 * INPUT vocabulary only (easy → plentiful, harsh → scarce); the canonical scale
 * is EconomyTier. Kept as a type alias so existing signatures keep compiling.
 */
export type EconomyProfile = EconomyTier | 'easy' | 'harsh';

export const ECONOMY_TIERS: readonly EconomyTier[] = [
    'abundant', 'plentiful', 'normal', 'scarce', 'barren',
];

/**
 * Resolved numeric knobs for one economy tier.
 * `normal` matches the pre-tier constants exactly (back-compat contract).
 */
export interface EconomyProfileParams {
    /** Passive per-tick market restock toward targetStock. barren = 0 (no natural replenish). */
    recoveryPerTick: number;
    /** Price bump applied by a scarcity shock (e.g. food crisis) on this resource. */
    foodCrisisPriceBump: number;
    /** Stock added by a positive/abundance event (e.g. a smithing surge). */
    positiveMaterialStockGain: number;
    /** Price cut applied by a positive/abundance event. */
    positiveMaterialPriceReduction: number;
    /** Hard price ceiling for this resource. */
    maxPriceIndex: number;
    /**
     * Resting price when a market is well-supplied. >1 means the resource stays
     * expensive even when in stock (felt every turn, not only during shocks).
     * normal = 1.0 (neutral; preserves legacy "drift toward 1.0" behavior).
     */
    baselinePriceBias: number;
}

const ECONOMY_TIER_PARAMS: Record<EconomyTier, EconomyProfileParams> = {
    abundant: {
        recoveryPerTick: 4,
        foodCrisisPriceBump: 0.15,
        positiveMaterialStockGain: 5,
        positiveMaterialPriceReduction: 0.20,
        maxPriceIndex: 2.0,
        baselinePriceBias: 0.85,
    },
    plentiful: {
        recoveryPerTick: 3,
        foodCrisisPriceBump: 0.25,
        positiveMaterialStockGain: 4,
        positiveMaterialPriceReduction: 0.15,
        maxPriceIndex: 3.0,
        baselinePriceBias: 0.93,
    },
    normal: {
        recoveryPerTick: DEFAULT_MARKET_RECOVERY_PER_TICK,
        foodCrisisPriceBump: FOOD_CRISIS_PRICE_BUMP,
        positiveMaterialStockGain: STEEL_IMPROVEMENT_STOCK,
        positiveMaterialPriceReduction: STEEL_IMPROVEMENT_PRICE_REDUCTION,
        maxPriceIndex: MAX_PRICE_INDEX,
        baselinePriceBias: 1.0,
    },
    scarce: {
        recoveryPerTick: 1,
        foodCrisisPriceBump: 0.50,
        positiveMaterialStockGain: 2,
        positiveMaterialPriceReduction: 0.07,
        maxPriceIndex: 5.5,
        baselinePriceBias: 1.15,
    },
    barren: {
        recoveryPerTick: 0,
        foodCrisisPriceBump: 0.70,
        positiveMaterialStockGain: 1,
        positiveMaterialPriceReduction: 0.04,
        maxPriceIndex: 7.0,
        baselinePriceBias: 1.30,
    },
};

/** Legacy 3-value pacing names accepted on input, mapped onto the 5-tier scale. */
const LEGACY_TIER_ALIASES: Record<string, EconomyTier> = {
    easy: 'plentiful',
    harsh: 'scarce',
};

/** Missing / invalid tier → normal. Accepts legacy easy/harsh aliases. */
export function resolveEconomyProfile(profile?: string | null): EconomyTier {
    if (profile && (ECONOMY_TIERS as readonly string[]).includes(profile)) {
        return profile as EconomyTier;
    }
    if (profile && LEGACY_TIER_ALIASES[profile]) {
        return LEGACY_TIER_ALIASES[profile];
    }
    return 'normal';
}

/** Centralized tier → commerce parameter mapping (do not scatter tier checks). */
export function resolveEconomyProfileParams(profile?: string | null): EconomyProfileParams {
    return ECONOMY_TIER_PARAMS[resolveEconomyProfile(profile)];
}

/**
 * Per-world difficulty resolution config. All fields optional; an empty config
 * resolves every commodity to `normal` (legacy behavior, byte-identical).
 * Precedence when resolving a commodity: commodity id > category/role > global.
 */
export interface EconomyDifficultyConfig {
    /** World-wide default tier. */
    globalTier?: string;
    /** Tier by resource category / commodity role (e.g. { staple: 'barren' }). */
    categoryTiers?: Record<string, string>;
    /** Tier by specific commodity id — the hook for custom world resources. */
    commodityTiers?: Record<string, string>;
    /**
     * Optional fine-tune multiplier keyed by commodity id or category. Scales each
     * knob's DEVIATION from normal: value = normal + (tierValue - normal) * modifier.
     * 1 = tier as-is, >1 = more extreme, <1 = softer, 0 = normal.
     */
    modifiers?: Record<string, number>;
}

const NORMAL_PARAMS = ECONOMY_TIER_PARAMS.normal;

/** Apply a deviation-from-normal multiplier to every knob of a tier param set. */
function applyModifier(params: EconomyProfileParams, modifier: number): EconomyProfileParams {
    if (modifier === 1) { return params; }
    const scale = (tierValue: number, normalValue: number): number =>
        normalValue + (tierValue - normalValue) * modifier;
    return {
        recoveryPerTick: Math.max(0, scale(params.recoveryPerTick, NORMAL_PARAMS.recoveryPerTick)),
        foodCrisisPriceBump: scale(params.foodCrisisPriceBump, NORMAL_PARAMS.foodCrisisPriceBump),
        positiveMaterialStockGain: scale(params.positiveMaterialStockGain, NORMAL_PARAMS.positiveMaterialStockGain),
        positiveMaterialPriceReduction: scale(params.positiveMaterialPriceReduction, NORMAL_PARAMS.positiveMaterialPriceReduction),
        // Price ceiling is intentionally NOT scaled by the modifier: it must stay
        // one of the fixed tier values so range validators can bound it (<= 7.0).
        maxPriceIndex: params.maxPriceIndex,
        baselinePriceBias: scale(params.baselinePriceBias, NORMAL_PARAMS.baselinePriceBias),
    };
}

/**
 * Resolve the effective economy params for one commodity under a difficulty
 * config. Precedence: commodity-id tier > category/role tier > global tier >
 * normal; then an optional id- or category-keyed % modifier is applied.
 */
export function resolveCommodityEconomyParams(
    config: EconomyDifficultyConfig | undefined,
    commodityId: string,
    role?: string | null
): EconomyProfileParams {
    if (!config) { return NORMAL_PARAMS; }
    const tierName =
        config.commodityTiers?.[commodityId]
        ?? (role ? config.categoryTiers?.[role] : undefined)
        ?? config.globalTier;
    const base = ECONOMY_TIER_PARAMS[resolveEconomyProfile(tierName)];
    const modifier =
        config.modifiers?.[commodityId]
        ?? (role ? config.modifiers?.[role] : undefined);
    return typeof modifier === 'number' ? applyModifier(base, modifier) : base;
}

/**
 * Highest price ceiling any tier (times any sane modifier) can legitimately
 * produce. Range validators must use THIS, not the fixed normal MAX_PRICE_INDEX,
 * or a legitimate barren/scarce price is wrongly flagged out-of-range. Includes
 * headroom for modifiers >1 on the harshest tier.
 */
export const MAX_PROFILE_PRICE_INDEX: number = Math.max(
    ...Object.values(ECONOMY_TIER_PARAMS).map((p) => p.maxPriceIndex)
);

export interface MarketTickOptions {
    worldTurn: number;
    recoveryPerTick?: number;
    /** この sim tick で新規発生したイベントのみ。市場へのイベント適用に使う。 */
    stepEvents?: WorldChangeEventLike[];
    /**
     * Resolved economy profile knobs (single tier applied to every commodity).
     * When omitted, recovery/shocks use legacy normal defaults.
     * Superseded by economyConfig when that is provided.
     */
    economyParams?: EconomyProfileParams;
    /**
     * Per-world difficulty config enabling per-category / per-commodity tiers.
     * When provided, each commodity resolves its own knobs (recovery, shock,
     * ceiling, baseline). Empty/undefined → falls back to economyParams/normal.
     */
    economyConfig?: EconomyDifficultyConfig;
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

/** Map commodity id → role for per-commodity difficulty resolution. */
function buildCommodityRoleMap(forge: CommerceForge): Record<string, string | undefined> {
    const map: Record<string, string | undefined> = {};
    for (const c of forge.commodities ?? []) {
        map[c.id] = c.role;
    }
    return map;
}

/**
 * Resolve the economy params for one commodity. Prefers the per-commodity/
 * per-category config when present; otherwise uses the single tier params
 * (legacy path). Guarantees a param set is always returned.
 */
function commodityParams(
    commodityId: string,
    roleMap: Record<string, string | undefined>,
    economyConfig: EconomyDifficultyConfig | undefined,
    fallback: EconomyProfileParams
): EconomyProfileParams {
    if (economyConfig) {
        return resolveCommodityEconomyParams(economyConfig, commodityId, roleMap[commodityId]);
    }
    return fallback;
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
    economyParams?: EconomyProfileParams,
    economyConfig?: EconomyDifficultyConfig
): { markets: MarketStateMap; applied: number } {
    const fallback = economyParams ?? resolveEconomyProfileParams('normal');
    const roleMap = buildCommodityRoleMap(forge);
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
                        const p = commodityParams(cid, roleMap, economyConfig, fallback);
                        entry.priceIndex = bumpPriceIndex(
                            entry.priceIndex,
                            p.foodCrisisPriceBump,
                            p.maxPriceIndex
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
                        const p = commodityParams(cid, roleMap, economyConfig, fallback);
                        entry.stock += p.positiveMaterialStockGain;
                        entry.priceIndex = bumpPriceIndex(
                            entry.priceIndex,
                            -p.positiveMaterialPriceReduction,
                            p.maxPriceIndex
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
    // Single-tier fallback recovery (legacy path / explicit soak override).
    const fallbackRecovery = options.recoveryPerTick
        ?? economyParams.recoveryPerTick
        ?? DEFAULT_MARKET_RECOVERY_PER_TICK;
    const roleMap = buildCommodityRoleMap(forge);
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

            // Resolve this commodity's knobs. With a per-world config, recovery,
            // ceiling and resting price can differ per resource; without one,
            // every commodity shares the single tier (legacy behavior).
            const p = options.economyConfig
                ? resolveCommodityEconomyParams(options.economyConfig, commodityId, roleMap[commodityId])
                : economyParams;
            const recovery = options.economyConfig ? p.recoveryPerTick : fallbackRecovery;
            const maxP = p.maxPriceIndex;
            const restingPrice = p.baselinePriceBias;

            if (entry.stock < target) {
                const before = entry.stock;
                entry.stock = Math.min(target, entry.stock + recovery);
                if (entry.stock > before) { stockRecoveries++; }
            }

            if (options.economyConfig) {
                // New per-resource path: when well supplied, drift toward this
                // resource's resting price (may be >1.0), so a scarce/barren
                // resource stays expensive even in stock — felt every turn, not
                // only during shocks.
                if (entry.stock >= target) {
                    const gap = restingPrice - entry.priceIndex;
                    if (Math.abs(gap) > 1e-9) {
                        const step = Math.sign(gap) * Math.min(0.05, Math.abs(gap));
                        entry.priceIndex = bumpPriceIndex(entry.priceIndex, step, maxP);
                        priceAdjustments++;
                    }
                } else if (entry.stock < target * 0.3 && entry.priceIndex < maxP) {
                    entry.priceIndex = bumpPriceIndex(entry.priceIndex, 0.05, maxP);
                    priceAdjustments++;
                }
            } else {
                // Legacy path (no per-world config): byte-identical to pre-tier
                // behavior — only drift DOWN toward 1.0 when oversupplied.
                if (entry.stock >= target && entry.priceIndex > 1) {
                    entry.priceIndex = bumpPriceIndex(entry.priceIndex, -0.05, maxP);
                    priceAdjustments++;
                } else if (entry.stock < target * 0.3 && entry.priceIndex < maxP) {
                    entry.priceIndex = bumpPriceIndex(entry.priceIndex, 0.05, maxP);
                    priceAdjustments++;
                }
            }
        }
    }

    const eventResult = applyWorldEventsToMarkets(
        forge,
        next,
        options.stepEvents ?? [],
        economyParams,
        options.economyConfig
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