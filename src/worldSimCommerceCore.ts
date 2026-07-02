// Tier 1: aggregate market ticks driven by world events (no vscode/fs).

import type {
    CommerceForge,
    MarketStateMap,
    WorldChangeEventLike,
} from './livingWorldTypes';

export const DEFAULT_MARKET_RECOVERY_PER_TICK = 2;
export const MAX_PRICE_INDEX = 4;
export const MIN_PRICE_INDEX = 0.25;
export const FOOD_CRISIS_PRICE_BUMP = 0.35;
export const STEEL_IMPROVEMENT_STOCK = 3;

export interface MarketTickOptions {
    worldTurn: number;
    recoveryPerTick?: number;
    recentChanges?: WorldChangeEventLike[];
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

function bumpPriceIndex(current: number, delta: number): number {
    return Math.max(MIN_PRICE_INDEX, Math.min(MAX_PRICE_INDEX, current + delta));
}

function isFoodCrisisEvent(ev: WorldChangeEventLike): boolean {
    const msg = ev.message.toLowerCase();
    return ev.category === 'resource'
        || msg.includes('food')
        || msg.includes('食料')
        || msg.includes('wheat')
        || msg.includes('小麦');
}

function isSteelCraftEvent(ev: WorldChangeEventLike): boolean {
    const msg = ev.message.toLowerCase();
    return msg.includes('steel')
        || msg.includes('鍛冶')
        || msg.includes('smith')
        || msg.includes('forge');
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
 * Apply world change events to market priceIndex / stock (Tier 1 aggregate sim).
 */
export function applyWorldEventsToMarkets(
    forge: CommerceForge,
    markets: MarketStateMap,
    events: WorldChangeEventLike[]
): { markets: MarketStateMap; applied: number } {
    const next = cloneMarkets(markets);
    let applied = 0;

    for (const ev of events) {
        const targets = ev.regionId
            ? marketsInRegion(forge, ev.regionId)
            : allMarketLocations(forge);

        if (isFoodCrisisEvent(ev)) {
            for (const loc of targets) {
                const wheat = next[loc]?.wheat;
                if (wheat) {
                    wheat.priceIndex = bumpPriceIndex(wheat.priceIndex, FOOD_CRISIS_PRICE_BUMP);
                    applied++;
                }
            }
        }

        if (isSteelCraftEvent(ev)) {
            for (const loc of targets) {
                const steel = next[loc]?.steel;
                if (steel) {
                    steel.stock += STEEL_IMPROVEMENT_STOCK;
                    steel.priceIndex = bumpPriceIndex(steel.priceIndex, -0.1);
                    applied++;
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
    const recovery = options.recoveryPerTick ?? DEFAULT_MARKET_RECOVERY_PER_TICK;
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
                entry.priceIndex = bumpPriceIndex(entry.priceIndex, -0.05);
                priceAdjustments++;
            } else if (entry.stock < target * 0.3 && entry.priceIndex < MAX_PRICE_INDEX) {
                entry.priceIndex = bumpPriceIndex(entry.priceIndex, 0.05);
                priceAdjustments++;
            }
        }
    }

    const eventResult = applyWorldEventsToMarkets(
        forge,
        next,
        options.recentChanges ?? []
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