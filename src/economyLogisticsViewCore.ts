// NOAI-ECON-FLOWS-005: compact, sanitized, read-only logistics view model.
// Pure Core — no vscode, fs, time, randomness, persistence, or LLM.

import type {
    EconomyFlowDefinition,
    EconomyFlowTickResult,
    EconomyNodeKind,
} from './economyFlowCore';
import type { EconomyProcessingTickResult } from './economyProcessingCore';
import type { EconomyRouteStatus } from './economyOperationalCore';
import type { CommodityDef } from './livingWorldTypes';

export const LOGISTICS_BOTTLENECK_UTILIZATION = 0.85;

export type EconomyLogisticsUnavailableReason =
    | 'commerce_disabled'
    | 'missing_definition'
    | 'snapshot_unavailable'
    | 'no_route_summaries';

export interface EconomyLogisticsCommodityView {
    id: string;
    name: string;
    localSpecialty: boolean;
    strategic: boolean;
}

export interface EconomyLogisticsProductionView {
    sourceId: string;
    commodityId: string;
    baseOutput: number;
    effectiveOutput: number;
    productivePotential: number;
    condition: number;
}

export interface EconomyLogisticsNodeView {
    id: string;
    label: string;
    kind: EconomyNodeKind;
    locationId?: string;
    regionId?: string;
    commodityIds: string[];
    production: EconomyLogisticsProductionView[];
    processingSiteIds: string[];
    shortageCommodityIds: string[];
}

export interface EconomyLogisticsRouteView {
    id: string;
    fromNodeId: string;
    toNodeId: string;
    commodityId: string;
    volume: number;
    baseCapacity: number;
    effectiveCapacity: number;
    utilization: number;
    risk: number;
    status: EconomyRouteStatus;
    bottleneck: boolean;
}

export interface EconomyLogisticsShortageView {
    nodeId: string;
    commodityId: string;
    fulfilledDemand: number;
    unmetDemand: number;
}

export interface EconomyLogisticsQuantityView {
    commodityId: string;
    quantity: number;
}

export interface EconomyLogisticsProcessingSiteView {
    id: string;
    nodeId: string;
    recipeId: string;
    active: boolean;
    batches: number;
    condition: number;
    baseMaxBatches: number;
    effectiveMaxBatches: number;
    inputs: EconomyLogisticsQuantityView[];
    outputs: EconomyLogisticsQuantityView[];
}

export interface EconomyLogisticsViewModel {
    available: boolean;
    unavailableReason?: EconomyLogisticsUnavailableReason;
    worldTurn?: number;
    commodities: EconomyLogisticsCommodityView[];
    nodes: EconomyLogisticsNodeView[];
    routes: EconomyLogisticsRouteView[];
    shortages: EconomyLogisticsShortageView[];
    processingSites: EconomyLogisticsProcessingSiteView[];
    summary: {
        activeRoutes: number;
        blockedRoutes: number;
        raidedRoutes: number;
        totalVolume: number;
        shortageCount: number;
        bottleneckCount: number;
    };
}

export interface EconomyLogisticsViewInput {
    commerceEnabled: boolean;
    worldTurn?: number;
    commodities?: readonly Pick<CommodityDef, 'id' | 'name'>[];
    definition?: EconomyFlowDefinition | null;
    flow?: EconomyFlowTickResult | null;
    processing?: EconomyProcessingTickResult | null;
}

const VALID_NODE_KINDS = new Set<EconomyNodeKind>([
    'region', 'settlement', 'facility', 'market', 'store',
]);
const VALID_ROUTE_STATUSES = new Set<EconomyRouteStatus>([
    'open', 'strained', 'blocked', 'raided',
]);
const MAX_TEXT = 160;
const MAX_ID = 120;
const MAX_NUMBER = 1_000_000_000;

function text(value: unknown, max = MAX_TEXT): string {
    return typeof value === 'string'
        ? value.replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim().slice(0, max)
        : '';
}

function id(value: unknown): string {
    return text(value, MAX_ID);
}

function finite(value: unknown, min = 0, max = MAX_NUMBER): number {
    if (typeof value !== 'number' || !Number.isFinite(value)) { return min; }
    const next = Math.max(min, Math.min(max, value));
    return Object.is(next, -0) ? 0 : next;
}

function compareId(a: string, b: string): number {
    return a < b ? -1 : a > b ? 1 : 0;
}

function emptyModel(reason: EconomyLogisticsUnavailableReason): EconomyLogisticsViewModel {
    return {
        available: false,
        unavailableReason: reason,
        commodities: [],
        nodes: [],
        routes: [],
        shortages: [],
        processingSites: [],
        summary: {
            activeRoutes: 0,
            blockedRoutes: 0,
            raidedRoutes: 0,
            totalVolume: 0,
            shortageCount: 0,
            bottleneckCount: 0,
        },
    };
}

function sanitizeQuantities(raw: unknown): EconomyLogisticsQuantityView[] {
    if (!Array.isArray(raw)) { return []; }
    return raw
        .map((entry) => {
            const row = entry as { commodityId?: unknown; quantity?: unknown };
            return { commodityId: id(row?.commodityId), quantity: finite(row?.quantity) };
        })
        .filter((entry) => entry.commodityId)
        .sort((a, b) => compareId(a.commodityId, b.commodityId))
        .slice(0, 32);
}

export function buildEconomyLogisticsViewModel(
    input: EconomyLogisticsViewInput
): EconomyLogisticsViewModel {
    if (!input.commerceEnabled) { return emptyModel('commerce_disabled'); }
    const definition = input.definition;
    if (!definition) { return emptyModel('missing_definition'); }

    const commodityNameById = new Map<string, string>();
    for (const commodity of input.commodities ?? []) {
        const commodityId = id(commodity?.id);
        if (commodityId && !commodityNameById.has(commodityId)) {
            commodityNameById.set(commodityId, text(commodity.name) || commodityId);
        }
    }

    const nodeById = new Map<string, EconomyLogisticsNodeView>();
    for (const rawNode of Array.isArray(definition.nodes) ? definition.nodes : []) {
        const nodeId = id(rawNode?.id);
        if (!nodeId || nodeById.has(nodeId) || !VALID_NODE_KINDS.has(rawNode?.kind)) { continue; }
        const locationId = id(rawNode.locationId);
        const regionId = id(rawNode.regionId);
        nodeById.set(nodeId, {
            id: nodeId,
            label: text(rawNode.label) || nodeId,
            kind: rawNode.kind,
            ...(locationId ? { locationId } : {}),
            ...(regionId ? { regionId } : {}),
            commodityIds: [],
            production: [],
            processingSiteIds: [],
            shortageCommodityIds: [],
        });
    }

    const relevantCommodityIds = new Set<string>();
    const productionNodesByCommodity = new Map<string, Set<string>>();
    const sourceIds = new Set<string>();
    for (const source of Array.isArray(definition.productionSources) ? definition.productionSources : []) {
        const sourceId = id(source?.id);
        const nodeId = id(source?.nodeId);
        const commodityId = id(source?.commodityId);
        if (!sourceId || !nodeById.has(nodeId) || !commodityId) { continue; }
        sourceIds.add(sourceId);
        relevantCommodityIds.add(commodityId);
        const nodes = productionNodesByCommodity.get(commodityId) ?? new Set<string>();
        nodes.add(nodeId);
        productionNodesByCommodity.set(commodityId, nodes);
    }
    for (const demand of Array.isArray(definition.demands) ? definition.demands : []) {
        const commodityId = id(demand?.commodityId);
        if (commodityId) { relevantCommodityIds.add(commodityId); }
    }

    const routeDefinitionById = new Map<string, { fromNodeId: string; toNodeId: string; commodityId: string }>();
    for (const route of Array.isArray(definition.tradeRoutes) ? definition.tradeRoutes : []) {
        const routeId = id(route?.id);
        const fromNodeId = id(route?.fromNodeId);
        const toNodeId = id(route?.toNodeId);
        const commodityId = id(route?.commodityId);
        if (!routeId || routeDefinitionById.has(routeId) || !nodeById.has(fromNodeId)
            || !nodeById.has(toNodeId) || !commodityId) { continue; }
        routeDefinitionById.set(routeId, { fromNodeId, toNodeId, commodityId });
        relevantCommodityIds.add(commodityId);
    }

    const strategicCommodityIds = new Set<string>();
    const recipeIds = new Set<string>();
    for (const recipe of Array.isArray(definition.processingRecipes) ? definition.processingRecipes : []) {
        const recipeId = id(recipe?.id);
        if (!recipeId) { continue; }
        recipeIds.add(recipeId);
        for (const commodityId of [...Object.keys(recipe.inputs ?? {}), ...Object.keys(recipe.outputs ?? {})]) {
            const safeId = id(commodityId);
            if (safeId) {
                relevantCommodityIds.add(safeId);
                strategicCommodityIds.add(safeId);
            }
        }
    }
    const siteDefinitionById = new Map<string, { nodeId: string; recipeId: string }>();
    for (const site of Array.isArray(definition.processingSites) ? definition.processingSites : []) {
        const siteId = id(site?.id);
        const nodeId = id(site?.nodeId);
        const recipeId = id(site?.recipeId);
        if (!siteId || siteDefinitionById.has(siteId) || !nodeById.has(nodeId) || !recipeIds.has(recipeId)) { continue; }
        siteDefinitionById.set(siteId, { nodeId, recipeId });
    }

    if (!input.flow) {
        const unavailable = emptyModel('snapshot_unavailable');
        unavailable.nodes = [...nodeById.values()].sort((a, b) => compareId(a.id, b.id));
        unavailable.commodities = [...relevantCommodityIds].sort(compareId).map((commodityId) => ({
            id: commodityId,
            name: commodityNameById.get(commodityId) ?? commodityId,
            localSpecialty: (productionNodesByCommodity.get(commodityId)?.size ?? 0) === 1,
            strategic: strategicCommodityIds.has(commodityId),
        }));
        return unavailable;
    }

    for (const source of input.flow.productionSources ?? []) {
        const sourceId = id(source?.sourceId);
        const nodeId = id(source?.nodeId);
        const commodityId = id(source?.commodityId);
        const node = nodeById.get(nodeId);
        if (!sourceIds.has(sourceId) || !node || !commodityId) { continue; }
        relevantCommodityIds.add(commodityId);
        node.production.push({
            sourceId,
            commodityId,
            baseOutput: finite(source.baseOutput),
            effectiveOutput: finite(source.effectiveOutput),
            productivePotential: finite(source.productivePotential, 0, 2),
            condition: finite(source.condition, 0, 1),
        });
    }

    const shortages: EconomyLogisticsShortageView[] = [];
    for (const summary of input.flow.nodes ?? []) {
        const nodeId = id(summary?.nodeId);
        const commodityId = id(summary?.commodityId);
        if (!nodeById.has(nodeId) || !commodityId) { continue; }
        relevantCommodityIds.add(commodityId);
        const unmetDemand = finite(summary.unmetDemand);
        if (unmetDemand <= 0) { continue; }
        shortages.push({
            nodeId,
            commodityId,
            fulfilledDemand: finite(summary.fulfilledDemand),
            unmetDemand,
        });
        strategicCommodityIds.add(commodityId);
    }
    shortages.sort((a, b) => compareId(a.nodeId, b.nodeId) || compareId(a.commodityId, b.commodityId));
    const shortagePairs = new Set(shortages.map((item) => `${item.nodeId}\0${item.commodityId}`));

    const routes: EconomyLogisticsRouteView[] = [];
    for (const summary of input.flow.routes ?? []) {
        const routeId = id(summary?.routeId);
        const authored = routeDefinitionById.get(routeId);
        if (!authored) { continue; }
        const status = VALID_ROUTE_STATUSES.has(summary.status) ? summary.status : 'open';
        const utilization = finite(summary.utilization, 0, 1);
        const bottleneck = utilization >= LOGISTICS_BOTTLENECK_UTILIZATION
            && shortagePairs.has(`${authored.toNodeId}\0${authored.commodityId}`);
        routes.push({
            id: routeId,
            fromNodeId: authored.fromNodeId,
            toNodeId: authored.toNodeId,
            commodityId: authored.commodityId,
            volume: finite(summary.volume),
            baseCapacity: finite(summary.baseCapacity),
            effectiveCapacity: finite(summary.capacity),
            utilization,
            risk: finite(summary.risk, 0, 1),
            status,
            bottleneck,
        });
    }
    routes.sort((a, b) => compareId(a.id, b.id));

    const processingSites: EconomyLogisticsProcessingSiteView[] = [];
    for (const summary of input.processing?.sites ?? []) {
        const siteId = id(summary?.siteId);
        const authored = siteDefinitionById.get(siteId);
        if (!authored) { continue; }
        const batches = Math.floor(finite(summary.batches));
        const inputs = sanitizeQuantities(summary.inputsConsumed);
        const outputs = sanitizeQuantities(summary.outputsProduced);
        for (const quantity of [...inputs, ...outputs]) { relevantCommodityIds.add(quantity.commodityId); }
        processingSites.push({
            id: siteId,
            nodeId: authored.nodeId,
            recipeId: authored.recipeId,
            active: batches > 0,
            batches,
            condition: finite(summary.condition, 0, 1),
            baseMaxBatches: Math.floor(finite(summary.baseMaxBatches)),
            effectiveMaxBatches: Math.floor(finite(summary.effectiveMaxBatches)),
            inputs,
            outputs,
        });
    }
    processingSites.sort((a, b) => compareId(a.id, b.id));

    for (const node of nodeById.values()) {
        node.production.sort((a, b) => compareId(a.sourceId, b.sourceId));
        const commodityIds = new Set(node.production.map((item) => item.commodityId));
        for (const route of routes) {
            if (route.fromNodeId === node.id || route.toNodeId === node.id) { commodityIds.add(route.commodityId); }
        }
        for (const shortage of shortages) {
            if (shortage.nodeId === node.id) { commodityIds.add(shortage.commodityId); }
        }
        node.commodityIds = [...commodityIds].sort(compareId);
        node.processingSiteIds = processingSites.filter((site) => site.nodeId === node.id).map((site) => site.id);
        node.shortageCommodityIds = shortages.filter((item) => item.nodeId === node.id).map((item) => item.commodityId);
    }

    const commodities = [...relevantCommodityIds].sort(compareId).map((commodityId) => ({
        id: commodityId,
        name: commodityNameById.get(commodityId) ?? commodityId,
        localSpecialty: (productionNodesByCommodity.get(commodityId)?.size ?? 0) === 1,
        strategic: strategicCommodityIds.has(commodityId),
    }));
    const worldTurn = Number.isFinite(input.worldTurn) ? Math.max(0, Math.floor(input.worldTurn!)) : undefined;
    const totalVolume = routes.reduce((total, route) => finite(total + route.volume), 0);
    const result: EconomyLogisticsViewModel = {
        available: true,
        ...(routes.length === 0 ? { unavailableReason: 'no_route_summaries' as const } : {}),
        ...(worldTurn !== undefined ? { worldTurn } : {}),
        commodities,
        nodes: [...nodeById.values()].sort((a, b) => compareId(a.id, b.id)),
        routes,
        shortages,
        processingSites,
        summary: {
            activeRoutes: routes.filter((route) => route.volume > 0).length,
            blockedRoutes: routes.filter((route) => route.status === 'blocked').length,
            raidedRoutes: routes.filter((route) => route.status === 'raided').length,
            totalVolume,
            shortageCount: shortages.length,
            bottleneckCount: routes.filter((route) => route.bottleneck).length,
        },
    };
    return result;
}
