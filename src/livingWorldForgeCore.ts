// Parse optional commerce block from world_forge.json (no vscode).

import type {
    EconomyFlowDefinition,
    EconomyNode,
    EconomyNodeKind,
    ProcessingRecipe,
    ProcessingSite,
    ProductionSource,
    ResourceDemand,
    TradeRoute,
} from './economyFlowCore';
import type { CommerceForge, CommodityDef, CommodityRole, MarketDef, TransportKindDef } from './livingWorldTypes';

const MAX_COMMODITIES = 20;
const MAX_MARKETS = 30;
const MAX_TRANSPORT = 10;
const MAX_FLOW_NODES = 100;
const MAX_FLOW_SOURCES = 200;
const MAX_FLOW_DEMANDS = 200;
const MAX_FLOW_ROUTES = 200;
const MAX_FLOW_LABEL_LEN = 120;
const MAX_FLOW_NUMERIC = 1_000_000;
const MAX_PROCESSING_RECIPES = 100;
const MAX_PROCESSING_SITES = 100;
const MAX_RECIPE_COMMODITIES = 20;
const MAX_BATCHES = 100_000;
const VALID_COMMODITY_ROLES = new Set<CommodityRole>(['staple', 'material']);
const VALID_NODE_KINDS = new Set<EconomyNodeKind>([
    'region',
    'settlement',
    'facility',
    'market',
    'store',
]);

function asId(v: unknown): string | undefined {
    if (typeof v !== 'string') { return undefined; }
    const s = v.trim();
    return /^[a-zA-Z0-9_-]{1,64}$/.test(s) ? s : undefined;
}

/** Finite non-negative number within safety limit; preserves fractions. */
function asFlowAmount(v: unknown): number | undefined {
    if (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > MAX_FLOW_NUMERIC) {
        return undefined;
    }
    return Object.is(v, -0) ? 0 : v;
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

function parseEconomyNode(raw: unknown): EconomyNode | undefined {
    if (!raw || typeof raw !== 'object') { return undefined; }
    const r = raw as Record<string, unknown>;
    const id = asId(r.id);
    if (!id) { return undefined; }
    if (typeof r.kind !== 'string' || !VALID_NODE_KINDS.has(r.kind as EconomyNodeKind)) {
        return undefined;
    }
    if (typeof r.label !== 'string') { return undefined; }
    const label = r.label.trim().slice(0, MAX_FLOW_LABEL_LEN);
    if (!label) { return undefined; }
    const node: EconomyNode = { id, kind: r.kind as EconomyNodeKind, label };
    const locationId = asId(r.locationId);
    if (locationId) { node.locationId = locationId; }
    const regionId = asId(r.regionId);
    if (regionId) { node.regionId = regionId; }
    const marketLocationId = asId(r.marketLocationId);
    if (marketLocationId) { node.marketLocationId = marketLocationId; }
    return node;
}

function parseProductionSource(raw: unknown): ProductionSource | undefined {
    if (!raw || typeof raw !== 'object') { return undefined; }
    const r = raw as Record<string, unknown>;
    const id = asId(r.id);
    const nodeId = asId(r.nodeId);
    const commodityId = asId(r.commodityId);
    const baseOutputPerTick = asFlowAmount(r.baseOutputPerTick);
    if (!id || !nodeId || !commodityId || baseOutputPerTick === undefined) {
        return undefined;
    }
    return { id, nodeId, commodityId, baseOutputPerTick };
}

function parseResourceDemand(raw: unknown): ResourceDemand | undefined {
    if (!raw || typeof raw !== 'object') { return undefined; }
    const r = raw as Record<string, unknown>;
    const id = asId(r.id);
    const nodeId = asId(r.nodeId);
    const commodityId = asId(r.commodityId);
    const baseDemandPerTick = asFlowAmount(r.baseDemandPerTick);
    if (!id || !nodeId || !commodityId || baseDemandPerTick === undefined) {
        return undefined;
    }
    return { id, nodeId, commodityId, baseDemandPerTick };
}

function parseTradeRoute(raw: unknown): TradeRoute | undefined {
    if (!raw || typeof raw !== 'object') { return undefined; }
    const r = raw as Record<string, unknown>;
    const id = asId(r.id);
    const fromNodeId = asId(r.fromNodeId);
    const toNodeId = asId(r.toNodeId);
    const commodityId = asId(r.commodityId);
    const capacityPerTick = asFlowAmount(r.capacityPerTick);
    if (!id || !fromNodeId || !toNodeId || !commodityId || capacityPerTick === undefined) {
        return undefined;
    }
    const route: TradeRoute = { id, fromNodeId, toNodeId, commodityId, capacityPerTick };
    if (r.baseRisk !== undefined) {
        if (typeof r.baseRisk !== 'number' || !Number.isFinite(r.baseRisk)) {
            return undefined;
        }
        const clamped = Math.max(0, Math.min(1, r.baseRisk));
        route.baseRisk = Object.is(clamped, -0) ? 0 : clamped;
    }
    return route;
}

/** Positive finite quantity map for recipe inputs/outputs; preserves fractions. */
function parseQuantityMap(raw: unknown): Record<string, number> | undefined {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
        return undefined;
    }
    const out: Record<string, number> = {};
    let count = 0;
    for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
        if (count >= MAX_RECIPE_COMMODITIES) { break; }
        const id = asId(key);
        if (!id) { continue; }
        if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0 || value > MAX_FLOW_NUMERIC) {
            continue;
        }
        out[id] = Object.is(value, -0) ? 0 : value;
        count++;
    }
    return Object.keys(out).length > 0 ? out : undefined;
}

function parseProcessingRecipe(raw: unknown): ProcessingRecipe | undefined {
    if (!raw || typeof raw !== 'object') { return undefined; }
    const r = raw as Record<string, unknown>;
    const id = asId(r.id);
    if (!id) { return undefined; }
    const inputs = parseQuantityMap(r.inputs);
    const outputs = parseQuantityMap(r.outputs);
    if (!inputs || !outputs) { return undefined; }
    return { id, inputs, outputs };
}

function parseProcessingSite(raw: unknown): ProcessingSite | undefined {
    if (!raw || typeof raw !== 'object') { return undefined; }
    const r = raw as Record<string, unknown>;
    const id = asId(r.id);
    const nodeId = asId(r.nodeId);
    const recipeId = asId(r.recipeId);
    if (!id || !nodeId || !recipeId) { return undefined; }
    if (typeof r.maxBatchesPerTick !== 'number' || !Number.isFinite(r.maxBatchesPerTick)) {
        return undefined;
    }
    const batches = Math.floor(r.maxBatchesPerTick);
    if (batches <= 0 || batches > MAX_BATCHES) { return undefined; }
    return { id, nodeId, recipeId, maxBatchesPerTick: batches };
}

/**
 * Parse optional resourceFlows. Returns undefined when missing, malformed,
 * or empty of usable rows. Does not drop duplicate IDs or bad cross-refs
 * (Slice 001 diagnostics own those).
 */
function parseResourceFlows(raw: unknown): EconomyFlowDefinition | undefined {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
        return undefined;
    }
    const r = raw as Record<string, unknown>;

    const nodes = Array.isArray(r.nodes)
        ? r.nodes.slice(0, MAX_FLOW_NODES).map(parseEconomyNode).filter((x): x is EconomyNode => !!x)
        : [];
    const productionSources = Array.isArray(r.productionSources)
        ? r.productionSources.slice(0, MAX_FLOW_SOURCES).map(parseProductionSource).filter((x): x is ProductionSource => !!x)
        : [];
    const demands = Array.isArray(r.demands)
        ? r.demands.slice(0, MAX_FLOW_DEMANDS).map(parseResourceDemand).filter((x): x is ResourceDemand => !!x)
        : [];
    const tradeRoutes = Array.isArray(r.tradeRoutes)
        ? r.tradeRoutes.slice(0, MAX_FLOW_ROUTES).map(parseTradeRoute).filter((x): x is TradeRoute => !!x)
        : [];
    const processingRecipes = Array.isArray(r.processingRecipes)
        ? r.processingRecipes.slice(0, MAX_PROCESSING_RECIPES).map(parseProcessingRecipe).filter((x): x is ProcessingRecipe => !!x)
        : [];
    const processingSites = Array.isArray(r.processingSites)
        ? r.processingSites.slice(0, MAX_PROCESSING_SITES).map(parseProcessingSite).filter((x): x is ProcessingSite => !!x)
        : [];

    if (!nodes.length && !productionSources.length && !demands.length && !tradeRoutes.length
        && !processingRecipes.length && !processingSites.length) {
        return undefined;
    }

    const def: EconomyFlowDefinition = { nodes, productionSources, demands, tradeRoutes };
    if (processingRecipes.length) {
        def.processingRecipes = processingRecipes;
    }
    if (processingSites.length) {
        def.processingSites = processingSites;
    }
    return def;
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

    const forge: CommerceForge = { commodities, markets, transportKinds };
    const resourceFlows = parseResourceFlows(r.resourceFlows);
    if (resourceFlows) {
        forge.resourceFlows = resourceFlows;
    }
    return forge;
}
