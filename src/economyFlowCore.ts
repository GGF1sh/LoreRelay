// NOAI-ECON-FLOWS-001: deterministic production / demand / direct-flow backbone.
// Pure Core — no vscode, fs, time, randomness, persistence, or LLM.

import type { CommerceForge, MarketStateMap } from './livingWorldTypes';

export type EconomyNodeKind =
    | 'region'
    | 'settlement'
    | 'facility'
    | 'market'
    | 'store';

export interface EconomyNode {
    id: string;
    kind: EconomyNodeKind;
    label: string;
    locationId?: string;
    regionId?: string;
    marketLocationId?: string;
}

export interface ProductionSource {
    id: string;
    nodeId: string;
    commodityId: string;
    baseOutputPerTick: number;
}

export interface ResourceDemand {
    id: string;
    nodeId: string;
    commodityId: string;
    baseDemandPerTick: number;
}

export interface TradeRoute {
    id: string;
    fromNodeId: string;
    toNodeId: string;
    commodityId: string;
    capacityPerTick: number;
    baseRisk?: number;
}

export interface EconomyFlowDefinition {
    nodes: EconomyNode[];
    productionSources: ProductionSource[];
    demands: ResourceDemand[];
    tradeRoutes: TradeRoute[];
}

export interface TradeFlowSummary {
    routeId: string;
    fromNodeId: string;
    toNodeId: string;
    commodityId: string;
    volume: number;
    capacity: number;
    utilization: number;
    risk: number;
    status: 'open';
}

export interface NodeFlowSummary {
    nodeId: string;
    commodityId: string;
    openingStock: number;
    produced: number;
    imported: number;
    exported: number;
    fulfilledDemand: number;
    unmetDemand: number;
    unshippedSupply: number;
}

export interface MarketStockDelta {
    nodeId: string;
    marketLocationId: string;
    commodityId: string;
    supplied: number;
    consumed: number;
    delta: number;
}

export interface EconomyFlowDiagnostic {
    code: string;
    message: string;
    id?: string;
}

export interface EconomyFlowTickInput {
    definition: EconomyFlowDefinition;
    forge: Pick<CommerceForge, 'commodities' | 'markets'>;
    markets: MarketStateMap;
}

export interface EconomyFlowTickResult {
    routes: TradeFlowSummary[];
    nodes: NodeFlowSummary[];
    marketDeltas: MarketStockDelta[];
    diagnostics: EconomyFlowDiagnostic[];
}

const VALID_NODE_KINDS = new Set<EconomyNodeKind>([
    'region',
    'settlement',
    'facility',
    'market',
    'store',
]);

function isNonEmptyString(value: unknown): value is string {
    return typeof value === 'string' && value.length > 0;
}

function isFiniteNumber(value: unknown): value is number {
    return typeof value === 'number' && Number.isFinite(value);
}

/** Normalize -0 to +0 for stable public numerics. */
function nz(value: number): number {
    return Object.is(value, -0) ? 0 : value;
}

function clampRisk(value: number): number {
    if (value < 0) { return 0; }
    if (value > 1) { return 1; }
    return nz(value);
}

function pairKey(nodeId: string, commodityId: string): string {
    return `${nodeId}\0${commodityId}`;
}

function compareId(a: string, b: string): number {
    return a < b ? -1 : a > b ? 1 : 0;
}

function compareNodeCommodity(
    a: { nodeId: string; commodityId: string },
    b: { nodeId: string; commodityId: string }
): number {
    const byNode = compareId(a.nodeId, b.nodeId);
    return byNode !== 0 ? byNode : compareId(a.commodityId, b.commodityId);
}

function compareMarketDelta(a: MarketStockDelta, b: MarketStockDelta): number {
    const byMarket = compareId(a.marketLocationId, b.marketLocationId);
    if (byMarket !== 0) { return byMarket; }
    const byNode = compareId(a.nodeId, b.nodeId);
    return byNode !== 0 ? byNode : compareId(a.commodityId, b.commodityId);
}

/**
 * Deterministic same-tick production → direct routes → demand → market stock deltas.
 * Never mutates input. Never writes MarketStateMap or priceIndex.
 */
export function computeEconomyFlowTick(input: EconomyFlowTickInput): EconomyFlowTickResult {
    const diagnostics: EconomyFlowDiagnostic[] = [];
    const definition = input?.definition;
    const forge = input?.forge;
    const markets = input?.markets ?? {};

    const commodityIds = new Set<string>();
    if (forge && Array.isArray(forge.commodities)) {
        for (const c of forge.commodities) {
            if (c && isNonEmptyString(c.id)) {
                commodityIds.add(c.id);
            }
        }
    }

    const marketTraded = new Map<string, Set<string>>();
    if (forge && Array.isArray(forge.markets)) {
        for (const m of forge.markets) {
            if (!m || !isNonEmptyString(m.locationId)) { continue; }
            const set = marketTraded.get(m.locationId) ?? new Set<string>();
            if (Array.isArray(m.commodityIds)) {
                for (const cid of m.commodityIds) {
                    if (isNonEmptyString(cid)) { set.add(cid); }
                }
            }
            marketTraded.set(m.locationId, set);
        }
    }

    // --- Nodes ---
    const nodesById = new Map<string, EconomyNode>();
    const seenNodeIds = new Set<string>();
    const marketOwnerCounts = new Map<string, number>();
    const rawNodes = definition && Array.isArray(definition.nodes) ? definition.nodes : [];

    for (const node of rawNodes) {
        if (!node || !isNonEmptyString(node.id)) {
            diagnostics.push({ code: 'invalid_node', message: 'Node missing id' });
            continue;
        }
        if (seenNodeIds.has(node.id)) {
            diagnostics.push({
                code: 'duplicate_node_id',
                message: `Duplicate node id: ${node.id}`,
                id: node.id,
            });
            continue;
        }
        seenNodeIds.add(node.id);
        if (!VALID_NODE_KINDS.has(node.kind as EconomyNodeKind)) {
            diagnostics.push({
                code: 'invalid_node_kind',
                message: `Invalid node kind for ${node.id}`,
                id: node.id,
            });
            continue;
        }
        nodesById.set(node.id, node);
        const mid = node.marketLocationId;
        if (isNonEmptyString(mid)) {
            marketOwnerCounts.set(mid, (marketOwnerCounts.get(mid) ?? 0) + 1);
        }
    }

    for (const [mid, count] of marketOwnerCounts) {
        if (count > 1) {
            diagnostics.push({
                code: 'duplicate_market_binding',
                message: `Multiple nodes bind marketLocationId: ${mid}`,
                id: mid,
            });
        }
    }

    function resolveMarketBinding(node: EconomyNode): string | undefined {
        const mid = node.marketLocationId;
        if (!isNonEmptyString(mid)) { return undefined; }
        if ((marketOwnerCounts.get(mid) ?? 0) !== 1) { return undefined; }
        if (!marketTraded.has(mid)) { return undefined; }
        return mid;
    }

    function marketTrades(marketLocationId: string, commodityId: string): boolean {
        return marketTraded.get(marketLocationId)?.has(commodityId) === true;
    }

    function openingStock(marketLocationId: string, commodityId: string): number {
        const entry = markets[marketLocationId]?.[commodityId];
        if (!entry || !isFiniteNumber(entry.stock) || entry.stock < 0) { return 0; }
        return entry.stock;
    }

    // --- Production: aggregate by nodeId + commodityId ---
    const produced = new Map<string, number>();
    const seenSourceIds = new Set<string>();
    const rawSources = definition && Array.isArray(definition.productionSources)
        ? definition.productionSources
        : [];

    for (const src of rawSources) {
        if (!src || !isNonEmptyString(src.id)) {
            diagnostics.push({ code: 'invalid_production_source', message: 'Production source missing id' });
            continue;
        }
        if (seenSourceIds.has(src.id)) {
            diagnostics.push({
                code: 'duplicate_source_id',
                message: `Duplicate production source id: ${src.id}`,
                id: src.id,
            });
            continue;
        }
        seenSourceIds.add(src.id);
        if (!isNonEmptyString(src.nodeId) || !nodesById.has(src.nodeId)) {
            diagnostics.push({
                code: 'missing_node',
                message: `Production source ${src.id} references missing node`,
                id: src.id,
            });
            continue;
        }
        if (!isNonEmptyString(src.commodityId) || !commodityIds.has(src.commodityId)) {
            diagnostics.push({
                code: 'unknown_commodity',
                message: `Production source ${src.id} has unknown commodity`,
                id: src.id,
            });
            continue;
        }
        if (!isFiniteNumber(src.baseOutputPerTick)) {
            diagnostics.push({
                code: 'invalid_number',
                message: `Production source ${src.id} has non-finite baseOutputPerTick`,
                id: src.id,
            });
            continue;
        }
        if (src.baseOutputPerTick < 0) {
            diagnostics.push({
                code: 'negative_value',
                message: `Production source ${src.id} has negative baseOutputPerTick`,
                id: src.id,
            });
            continue;
        }
        const key = pairKey(src.nodeId, src.commodityId);
        produced.set(key, (produced.get(key) ?? 0) + src.baseOutputPerTick);
    }

    // --- Valid direct routes (draw only from same-tick production) ---
    interface ValidRoute {
        id: string;
        fromNodeId: string;
        toNodeId: string;
        commodityId: string;
        capacityPerTick: number;
        risk: number;
    }

    const validRoutes: ValidRoute[] = [];
    const seenRouteIds = new Set<string>();
    const rawRoutes = definition && Array.isArray(definition.tradeRoutes)
        ? definition.tradeRoutes
        : [];

    for (const route of rawRoutes) {
        if (!route || !isNonEmptyString(route.id)) {
            diagnostics.push({ code: 'invalid_route', message: 'Trade route missing id' });
            continue;
        }
        if (seenRouteIds.has(route.id)) {
            diagnostics.push({
                code: 'duplicate_route_id',
                message: `Duplicate trade route id: ${route.id}`,
                id: route.id,
            });
            continue;
        }
        seenRouteIds.add(route.id);
        if (!isNonEmptyString(route.fromNodeId) || !nodesById.has(route.fromNodeId)) {
            diagnostics.push({
                code: 'missing_node',
                message: `Route ${route.id} missing fromNode`,
                id: route.id,
            });
            continue;
        }
        if (!isNonEmptyString(route.toNodeId) || !nodesById.has(route.toNodeId)) {
            diagnostics.push({
                code: 'missing_node',
                message: `Route ${route.id} missing toNode`,
                id: route.id,
            });
            continue;
        }
        if (!isNonEmptyString(route.commodityId) || !commodityIds.has(route.commodityId)) {
            diagnostics.push({
                code: 'unknown_commodity',
                message: `Route ${route.id} has unknown commodity`,
                id: route.id,
            });
            continue;
        }
        if (!isFiniteNumber(route.capacityPerTick)) {
            diagnostics.push({
                code: 'invalid_number',
                message: `Route ${route.id} has non-finite capacityPerTick`,
                id: route.id,
            });
            continue;
        }
        if (route.capacityPerTick < 0) {
            diagnostics.push({
                code: 'negative_value',
                message: `Route ${route.id} has negative capacityPerTick`,
                id: route.id,
            });
            continue;
        }

        let risk = 0;
        if (route.baseRisk !== undefined) {
            if (!isFiniteNumber(route.baseRisk)) {
                diagnostics.push({
                    code: 'invalid_number',
                    message: `Route ${route.id} has non-finite baseRisk`,
                    id: route.id,
                });
                risk = 0;
            } else if (route.baseRisk < 0) {
                diagnostics.push({
                    code: 'negative_value',
                    message: `Route ${route.id} has negative baseRisk`,
                    id: route.id,
                });
                risk = clampRisk(route.baseRisk);
            } else {
                risk = clampRisk(route.baseRisk);
            }
        }

        const toNode = nodesById.get(route.toNodeId)!;
        const destMarket = resolveMarketBinding(toNode);
        if (!destMarket) {
            diagnostics.push({
                code: 'invalid_market_binding',
                message: `Route ${route.id} destination lacks unique valid market binding`,
                id: route.id,
            });
            continue;
        }
        if (!marketTrades(destMarket, route.commodityId)) {
            diagnostics.push({
                code: 'invalid_market_binding',
                message: `Route ${route.id} destination market does not trade commodity`,
                id: route.id,
            });
            continue;
        }

        validRoutes.push({
            id: route.id,
            fromNodeId: route.fromNodeId,
            toNodeId: route.toNodeId,
            commodityId: route.commodityId,
            capacityPerTick: route.capacityPerTick,
            risk,
        });
    }

    // Capacity-proportional allocation; independent of insertion order.
    const routesBySource = new Map<string, ValidRoute[]>();
    for (const route of validRoutes) {
        const key = pairKey(route.fromNodeId, route.commodityId);
        const list = routesBySource.get(key) ?? [];
        list.push(route);
        routesBySource.set(key, list);
    }

    const exported = new Map<string, number>();
    const imported = new Map<string, number>();
    const routeVolumes = new Map<string, number>();

    for (const [key, routes] of routesBySource) {
        routes.sort((a, b) => compareId(a.id, b.id));
        const producedAmount = produced.get(key) ?? 0;
        let totalCapacity = 0;
        for (const r of routes) {
            totalCapacity += r.capacityPerTick;
        }
        const scale = totalCapacity > 0 ? Math.min(1, producedAmount / totalCapacity) : 0;
        let shipped = 0;
        for (const r of routes) {
            const volume = nz(r.capacityPerTick * scale);
            routeVolumes.set(r.id, volume);
            shipped = nz(shipped + volume);
            const importKey = pairKey(r.toNodeId, r.commodityId);
            imported.set(importKey, nz((imported.get(importKey) ?? 0) + volume));
        }
        exported.set(key, shipped);
    }

    for (const route of validRoutes) {
        if (!routeVolumes.has(route.id)) {
            routeVolumes.set(route.id, 0);
        }
    }

    // --- Demand: fulfill only at uniquely market-backed nodes ---
    const demandByPair = new Map<string, number>();
    const seenDemandIds = new Set<string>();
    const rawDemands = definition && Array.isArray(definition.demands) ? definition.demands : [];

    for (const dem of rawDemands) {
        if (!dem || !isNonEmptyString(dem.id)) {
            diagnostics.push({ code: 'invalid_demand', message: 'Demand missing id' });
            continue;
        }
        if (seenDemandIds.has(dem.id)) {
            diagnostics.push({
                code: 'duplicate_demand_id',
                message: `Duplicate demand id: ${dem.id}`,
                id: dem.id,
            });
            continue;
        }
        seenDemandIds.add(dem.id);
        if (!isNonEmptyString(dem.nodeId) || !nodesById.has(dem.nodeId)) {
            diagnostics.push({
                code: 'missing_node',
                message: `Demand ${dem.id} references missing node`,
                id: dem.id,
            });
            continue;
        }
        if (!isNonEmptyString(dem.commodityId) || !commodityIds.has(dem.commodityId)) {
            diagnostics.push({
                code: 'unknown_commodity',
                message: `Demand ${dem.id} has unknown commodity`,
                id: dem.id,
            });
            continue;
        }
        if (!isFiniteNumber(dem.baseDemandPerTick)) {
            diagnostics.push({
                code: 'invalid_number',
                message: `Demand ${dem.id} has non-finite baseDemandPerTick`,
                id: dem.id,
            });
            continue;
        }
        if (dem.baseDemandPerTick < 0) {
            diagnostics.push({
                code: 'negative_value',
                message: `Demand ${dem.id} has negative baseDemandPerTick`,
                id: dem.id,
            });
            continue;
        }
        const node = nodesById.get(dem.nodeId)!;
        const mid = resolveMarketBinding(node);
        if (!mid || !marketTrades(mid, dem.commodityId)) {
            diagnostics.push({
                code: 'invalid_market_binding',
                message: `Demand ${dem.id} node is not uniquely market-backed for commodity`,
                id: dem.id,
            });
            continue;
        }
        const key = pairKey(dem.nodeId, dem.commodityId);
        demandByPair.set(key, (demandByPair.get(key) ?? 0) + dem.baseDemandPerTick);
    }

    const activePairs = new Set<string>();
    for (const key of produced.keys()) { activePairs.add(key); }
    for (const key of imported.keys()) { activePairs.add(key); }
    for (const key of exported.keys()) { activePairs.add(key); }
    for (const key of demandByPair.keys()) { activePairs.add(key); }

    const nodeSummaries: NodeFlowSummary[] = [];
    const marketDeltas: MarketStockDelta[] = [];

    for (const key of activePairs) {
        const sep = key.indexOf('\0');
        const nodeId = key.slice(0, sep);
        const commodityId = key.slice(sep + 1);
        const node = nodesById.get(nodeId);
        if (!node) { continue; }

        const producedAmount = produced.get(key) ?? 0;
        const exportedAmount = exported.get(key) ?? 0;
        const importedAmount = imported.get(key) ?? 0;
        // Unshipped = same-tick production not placed on a route.
        const retainedLocal = nz(Math.max(0, producedAmount - exportedAmount));

        const mid = resolveMarketBinding(node);
        const isMarketBacked = !!mid && marketTrades(mid, commodityId);
        const openStock = isMarketBacked && mid ? openingStock(mid, commodityId) : 0;
        const baseDemand = isMarketBacked ? (demandByPair.get(key) ?? 0) : 0;

        // Market-backed retained production becomes local market supply.
        // Non-market retained production is reported only (no market delta).
        const localSupplyForMarket = isMarketBacked ? retainedLocal : 0;
        const available = nz(openStock + localSupplyForMarket + importedAmount);
        const fulfilledDemand = nz(Math.min(baseDemand, available));
        const unmetDemand = nz(baseDemand - fulfilledDemand);

        nodeSummaries.push({
            nodeId,
            commodityId,
            openingStock: nz(openStock),
            produced: nz(producedAmount),
            imported: nz(importedAmount),
            exported: nz(exportedAmount),
            fulfilledDemand,
            unmetDemand,
            unshippedSupply: retainedLocal,
        });

        if (isMarketBacked && mid) {
            const supplied = nz(localSupplyForMarket + importedAmount);
            const consumed = fulfilledDemand;
            const delta = nz(supplied - consumed);
            if (supplied !== 0 || consumed !== 0 || baseDemand !== 0
                || producedAmount !== 0 || importedAmount !== 0) {
                marketDeltas.push({
                    nodeId,
                    marketLocationId: mid,
                    commodityId,
                    supplied,
                    consumed,
                    delta,
                });
            }
        }
    }

    const routeSummaries: TradeFlowSummary[] = validRoutes
        .map((r) => {
            const volume = routeVolumes.get(r.id) ?? 0;
            const capacity = r.capacityPerTick;
            const utilization = capacity > 0 ? nz(volume / capacity) : 0;
            return {
                routeId: r.id,
                fromNodeId: r.fromNodeId,
                toNodeId: r.toNodeId,
                commodityId: r.commodityId,
                volume: nz(volume),
                capacity: nz(capacity),
                utilization,
                risk: r.risk,
                status: 'open' as const,
            };
        })
        .sort((a, b) => compareId(a.routeId, b.routeId));

    nodeSummaries.sort(compareNodeCommodity);
    marketDeltas.sort(compareMarketDelta);
    diagnostics.sort((a, b) => {
        const byCode = compareId(a.code, b.code);
        if (byCode !== 0) { return byCode; }
        return compareId(a.id ?? '', b.id ?? '');
    });

    return {
        routes: routeSummaries,
        nodes: nodeSummaries,
        marketDeltas,
        diagnostics,
    };
}
