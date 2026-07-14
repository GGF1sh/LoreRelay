// Parse optional commerce block from world_forge.json (no vscode).

import type { CommerceForge, CommodityDef, CommodityRole, MarketDef, TransportKindDef } from './livingWorldTypes';

const MAX_COMMODITIES = 20;
const MAX_MARKETS = 30;
const MAX_TRANSPORT = 10;
const VALID_COMMODITY_ROLES = new Set<CommodityRole>(['staple', 'material']);

function asId(v: unknown): string | undefined {
    if (typeof v !== 'string') { return undefined; }
    const s = v.trim();
    return /^[a-zA-Z0-9_-]{1,64}$/.test(s) ? s : undefined;
}

function parseCommodity(raw: unknown): CommodityDef | undefined {
    if (!raw || typeof raw !== 'object') { return undefined; }
    const r = raw as Record<string, unknown>;
    const id = asId(r.id);
    const name = typeof r.name === 'string' ? r.name.trim() : '';
    const basePrice = typeof r.basePrice === 'number' ? Math.max(1, Math.floor(r.basePrice)) : 0;
    const weight = typeof r.weight === 'number' ? Math.max(0.1, r.weight) : 0;
    if (!id || !name || !basePrice || !weight) { return undefined; }
    const def: CommodityDef = { id, name, basePrice, weight };
    if (typeof r.role === 'string' && VALID_COMMODITY_ROLES.has(r.role as CommodityRole)) {
        def.role = r.role as CommodityRole;
    }
    return def;
}

function parseMarket(raw: unknown): MarketDef | undefined {
    if (!raw || typeof raw !== 'object') { return undefined; }
    const r = raw as Record<string, unknown>;
    const locationId = asId(r.locationId);
    if (!locationId) { return undefined; }
    const commodityIds = Array.isArray(r.commodityIds)
        ? r.commodityIds.map(asId).filter((x): x is string => !!x)
        : [];
    if (!commodityIds.length) { return undefined; }
    const market: MarketDef = { locationId, commodityIds };
    const regionId = asId(r.regionId);
    if (regionId) { market.regionId = regionId; }
    if (typeof r.supplyBias === 'number' && r.supplyBias > 0) {
        market.supplyBias = Math.min(5, r.supplyBias);
    }
    if (typeof r.targetStock === 'number') {
        market.targetStock = Math.max(0, Math.min(999, Math.floor(r.targetStock)));
    }
    return market;
}

function parseTransport(raw: unknown): TransportKindDef | undefined {
    if (!raw || typeof raw !== 'object') { return undefined; }
    const r = raw as Record<string, unknown>;
    const id = asId(r.id);
    const name = typeof r.name === 'string' ? r.name.trim() : '';
    const capacity = typeof r.capacity === 'number' ? Math.floor(r.capacity) : 0;
    const speed = typeof r.speed === 'number' ? r.speed : 0;
    if (!id || !name || capacity <= 0 || speed <= 0) { return undefined; }
    const out: TransportKindDef = { id, name, capacity, speed };
    if (typeof r.foodPerDay === 'number') {
        out.foodPerDay = Math.max(0, r.foodPerDay);
    }
    if (Array.isArray(r.themes)) {
        out.themes = r.themes.filter((t): t is string => typeof t === 'string');
    }
    return out;
}

export function parseCommerceForge(raw: unknown): CommerceForge | undefined {
    if (!raw || typeof raw !== 'object') { return undefined; }
    const r = raw as Record<string, unknown>;

    const commodities = Array.isArray(r.commodities)
        ? r.commodities.slice(0, MAX_COMMODITIES).map(parseCommodity).filter((x): x is CommodityDef => !!x)
        : [];
    const markets = Array.isArray(r.markets)
        ? r.markets.slice(0, MAX_MARKETS).map(parseMarket).filter((x): x is MarketDef => !!x)
        : [];
    const transportKinds = Array.isArray(r.transportKinds)
        ? r.transportKinds.slice(0, MAX_TRANSPORT).map(parseTransport).filter((x): x is TransportKindDef => !!x)
        : [];

    if (!commodities.length || !markets.length) { return undefined; }
    return { commodities, markets, transportKinds };
}