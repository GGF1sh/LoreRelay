// LW1 Commerce: deterministic prices, trade ops, cargo (no vscode/fs).

import type {
    CargoEntry,
    CommerceForge,
    CommodityDef,
    MarketDef,
    MarketStateMap,
    MarketStockEntry,
    PlayerCommerceState,
    TradeOp,
    TradeOpKind,
} from './livingWorldTypes';
import type { DiscoveryLedgerDocument } from './discoveryLedgerCore';
import { validateSellDiscoveryTrade } from './discoveryLedgerCore';

export const MAX_TRADE_OPS_PER_TURN = 16;
export const MAX_TRADE_QTY = 999;
export const MIN_PRICE = 1;

export interface PriceQuote {
    commodityId: string;
    unitPrice: number;
    stock: number;
    priceIndex: number;
}

export interface TradeValidationError {
    code:
        | 'INVALID_OP'
        | 'UNKNOWN_MARKET'
        | 'UNKNOWN_COMMODITY'
        | 'NOT_TRADED_HERE'
        | 'INVALID_QTY'
        | 'INSUFFICIENT_STOCK'
        | 'INSUFFICIENT_CREDITS'
        | 'INSUFFICIENT_CARGO'
        | 'CARGO_CAPACITY';
    message: string;
}

export interface TradeApplyResult {
    ok: true;
    commerce: PlayerCommerceState;
    markets: MarketStateMap;
    totalCost: number;
    totalRevenue: number;
}

export interface TradeApplyFailure {
    ok: false;
    error: TradeValidationError;
}

export type SingleTradeResult = TradeApplyResult | TradeApplyFailure;

function commodityById(forge: CommerceForge, id: string): CommodityDef | undefined {
    return forge.commodities.find((c) => c.id === id);
}

function marketByLocation(forge: CommerceForge, locationId: string): MarketDef | undefined {
    return forge.markets.find((m) => m.locationId === locationId);
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

function cloneCommerce(commerce: PlayerCommerceState): PlayerCommerceState {
    return {
        ...commerce,
        cargo: commerce.cargo.map((c) => ({ ...c })),
    };
}

export function computeUnitPrice(
    commodity: CommodityDef,
    market: MarketDef,
    stock?: MarketStockEntry
): number {
    const priceIndex = stock?.priceIndex ?? 1;
    const supplyBias = market.supplyBias ?? 1;
    const raw = commodity.basePrice * priceIndex * supplyBias;
    return Math.max(MIN_PRICE, Math.round(raw));
}

export function quoteMarketPrice(
    forge: CommerceForge,
    markets: MarketStateMap,
    marketLocationId: string,
    commodityId: string
): PriceQuote | undefined {
    const market = marketByLocation(forge, marketLocationId);
    const commodity = commodityById(forge, commodityId);
    if (!market || !commodity) { return undefined; }
    if (!market.commodityIds.includes(commodityId)) { return undefined; }
    const stock = markets[marketLocationId]?.[commodityId];
    return {
        commodityId,
        unitPrice: computeUnitPrice(commodity, market, stock),
        stock: stock?.stock ?? 0,
        priceIndex: stock?.priceIndex ?? 1,
    };
}

export function cargoWeight(forge: CommerceForge, cargo: CargoEntry[]): number {
    let total = 0;
    for (const entry of cargo) {
        const commodity = commodityById(forge, entry.commodityId);
        if (!commodity) { continue; }
        total += commodity.weight * entry.qty;
    }
    return total;
}

export function transportCapacity(forge: CommerceForge, transportId: string): number {
    const kind = forge.transportKinds.find((t) => t.id === transportId);
    return kind?.capacity ?? 0;
}

export function cargoFits(
    forge: CommerceForge,
    commerce: PlayerCommerceState,
    addedCommodityId: string,
    addedQty: number
): boolean {
    const cap = transportCapacity(forge, commerce.transportId);
    if (cap <= 0) { return false; }
    const commodity = commodityById(forge, addedCommodityId);
    if (!commodity) { return false; }
    const current = cargoWeight(forge, commerce.cargo);
    return current + commodity.weight * addedQty <= cap;
}

function cargoQty(cargo: CargoEntry[], commodityId: string): number {
    return cargo.find((c) => c.commodityId === commodityId)?.qty ?? 0;
}

function adjustCargo(cargo: CargoEntry[], commodityId: string, delta: number): CargoEntry[] {
    const out = cargo.map((c) => ({ ...c }));
    const idx = out.findIndex((c) => c.commodityId === commodityId);
    if (idx < 0) {
        if (delta > 0) { out.push({ commodityId, qty: delta }); }
        return out;
    }
    const next = out[idx].qty + delta;
    if (next <= 0) {
        out.splice(idx, 1);
    } else {
        out[idx] = { commodityId, qty: next };
    }
    return out;
}

function isValidTradeOpKind(op: unknown): op is TradeOpKind {
    return op === 'buy' || op === 'sell' || op === 'sell_discovery';
}

export function parseTradeOps(raw: unknown): TradeOp[] {
    if (!Array.isArray(raw)) { return []; }
    const out: TradeOp[] = [];
    for (const item of raw.slice(0, MAX_TRADE_OPS_PER_TURN)) {
        if (!item || typeof item !== 'object') { continue; }
        const row = item as Record<string, unknown>;
        if (!isValidTradeOpKind(row.op)) { continue; }

        if (row.op === 'sell_discovery') {
            if (typeof row.discoveryId !== 'string' || !row.discoveryId) { continue; }
            const value = typeof row.value === 'number' ? Math.floor(row.value) : 0;
            if (value < 0) { continue; }
            out.push({ op: 'sell_discovery', discoveryId: row.discoveryId, value });
            continue;
        }

        if (typeof row.marketLocationId !== 'string' || !row.marketLocationId) { continue; }
        if (typeof row.commodityId !== 'string' || !row.commodityId) { continue; }
        const qty = typeof row.qty === 'number' ? Math.floor(row.qty) : 0;
        if (qty < 1 || qty > MAX_TRADE_QTY) { continue; }
        out.push({
            op: row.op,
            marketLocationId: row.marketLocationId,
            commodityId: row.commodityId,
            qty,
        });
    }
    return out;
}

export function applyTradeOp(
    forge: CommerceForge,
    markets: MarketStateMap,
    commerce: PlayerCommerceState,
    op: TradeOp,
    discoveryLedger?: DiscoveryLedgerDocument
): SingleTradeResult {
    const nextCommerce = cloneCommerce(commerce);

    if (op.op === 'sell_discovery') {
        const ledgerError = validateSellDiscoveryTrade(op.discoveryId, op.value, discoveryLedger);
        if (ledgerError) {
            return { ok: false, error: { code: 'INVALID_OP', message: ledgerError } };
        }
        nextCommerce.credits += op.value;
        return {
            ok: true,
            commerce: nextCommerce,
            markets: cloneMarkets(markets),
            totalCost: 0,
            totalRevenue: op.value,
        };
    }

    const market = marketByLocation(forge, op.marketLocationId);
    if (!market) {
        return { ok: false, error: { code: 'UNKNOWN_MARKET', message: `Unknown market ${op.marketLocationId}` } };
    }
    const commodity = commodityById(forge, op.commodityId);
    if (!commodity) {
        return { ok: false, error: { code: 'UNKNOWN_COMMODITY', message: `Unknown commodity ${op.commodityId}` } };
    }
    if (!market.commodityIds.includes(op.commodityId)) {
        return { ok: false, error: { code: 'NOT_TRADED_HERE', message: `${op.commodityId} not sold at ${op.marketLocationId}` } };
    }
    if (op.qty < 1 || op.qty > MAX_TRADE_QTY) {
        return { ok: false, error: { code: 'INVALID_QTY', message: 'Invalid quantity' } };
    }

    const nextMarkets = cloneMarkets(markets);
    if (!nextMarkets[op.marketLocationId]) {
        nextMarkets[op.marketLocationId] = {};
    }
    if (!nextMarkets[op.marketLocationId][op.commodityId]) {
        nextMarkets[op.marketLocationId][op.commodityId] = { stock: 0, priceIndex: 1 };
    }
    const stockEntry = nextMarkets[op.marketLocationId][op.commodityId];
    const unitPrice = computeUnitPrice(commodity, market, stockEntry);

    if (op.op === 'buy') {
        if (stockEntry.stock < op.qty) {
            return { ok: false, error: { code: 'INSUFFICIENT_STOCK', message: 'Market stock too low' } };
        }
        const cost = unitPrice * op.qty;
        if (nextCommerce.credits < cost) {
            return { ok: false, error: { code: 'INSUFFICIENT_CREDITS', message: 'Not enough credits' } };
        }
        if (!cargoFits(forge, nextCommerce, op.commodityId, op.qty)) {
            return { ok: false, error: { code: 'CARGO_CAPACITY', message: 'Cargo capacity exceeded' } };
        }
        nextCommerce.credits -= cost;
        nextCommerce.cargo = adjustCargo(nextCommerce.cargo, op.commodityId, op.qty);
        stockEntry.stock -= op.qty;
        return {
            ok: true,
            commerce: nextCommerce,
            markets: nextMarkets,
            totalCost: cost,
            totalRevenue: 0,
        };
    }

    const held = cargoQty(nextCommerce.cargo, op.commodityId);
    if (held < op.qty) {
        return { ok: false, error: { code: 'INSUFFICIENT_CARGO', message: 'Not enough cargo to sell' } };
    }
    const revenue = unitPrice * op.qty;
    nextCommerce.credits += revenue;
    nextCommerce.cargo = adjustCargo(nextCommerce.cargo, op.commodityId, -op.qty);
    stockEntry.stock += op.qty;
    return {
        ok: true,
        commerce: nextCommerce,
        markets: nextMarkets,
        totalCost: 0,
        totalRevenue: revenue,
    };
}

export interface BatchTradeResult {
    ok: true;
    commerce: PlayerCommerceState;
    markets: MarketStateMap;
    applied: number;
    totalCost: number;
    totalRevenue: number;
}

export interface BatchTradeFailure {
    ok: false;
    error: TradeValidationError;
    applied: number;
}

export type TradeBatchResult = BatchTradeResult | BatchTradeFailure;

export function applyTradeOps(
    forge: CommerceForge,
    markets: MarketStateMap,
    commerce: PlayerCommerceState,
    ops: TradeOp[],
    discoveryLedger?: DiscoveryLedgerDocument
): TradeBatchResult {
    let currentMarkets = markets;
    let currentCommerce = commerce;
    let applied = 0;
    let totalCost = 0;
    let totalRevenue = 0;

    for (const op of ops.slice(0, MAX_TRADE_OPS_PER_TURN)) {
        const result = applyTradeOp(forge, currentMarkets, currentCommerce, op, discoveryLedger);
        if (!result.ok) {
            return { ok: false, error: result.error, applied };
        }
        currentMarkets = result.markets;
        currentCommerce = result.commerce;
        totalCost += result.totalCost;
        totalRevenue += result.totalRevenue;
        applied++;
    }

    return {
        ok: true,
        commerce: currentCommerce,
        markets: currentMarkets,
        applied,
        totalCost,
        totalRevenue,
    };
}

/** Net credits change per market location for a trade batch (for bond adjustment batching). */
export function computePerLocationTradeCreditsDelta(
    forge: CommerceForge,
    markets: MarketStateMap,
    commerce: PlayerCommerceState,
    ops: TradeOp[],
    discoveryLedger?: DiscoveryLedgerDocument
): Record<string, number> {
    const deltas: Record<string, number> = {};
    let currentMarkets = markets;
    let currentCommerce = commerce;

    for (const op of ops.slice(0, MAX_TRADE_OPS_PER_TURN)) {
        const result = applyTradeOp(forge, currentMarkets, currentCommerce, op, discoveryLedger);
        if (!result.ok) {
            break;
        }
        currentMarkets = result.markets;
        currentCommerce = result.commerce;
        if (op.op === 'sell_discovery') {
            continue;
        }
        const net = result.totalRevenue - result.totalCost;
        deltas[op.marketLocationId] = (deltas[op.marketLocationId] ?? 0) + net;
    }

    return deltas;
}

export function buildMarketPriceTable(
    forge: CommerceForge,
    markets: MarketStateMap,
    locationIds?: string[]
): Array<{ locationId: string; quotes: PriceQuote[] }> {
    const locs = locationIds ?? forge.markets.map((m) => m.locationId);
    return locs.map((locationId) => {
        const market = marketByLocation(forge, locationId);
        const quotes: PriceQuote[] = [];
        if (!market) { return { locationId, quotes }; }
        for (const commodityId of market.commodityIds) {
            const q = quoteMarketPrice(forge, markets, locationId, commodityId);
            if (q) { quotes.push(q); }
        }
        return { locationId, quotes };
    });
}

export function initializeMarketState(forge: CommerceForge, seedStock = 30): MarketStateMap {
    const out: MarketStateMap = {};
    for (const market of forge.markets) {
        out[market.locationId] = {};
        const target = market.targetStock ?? seedStock;
        for (const commodityId of market.commodityIds) {
            out[market.locationId][commodityId] = { stock: target, priceIndex: 1 };
        }
    }
    return out;
}