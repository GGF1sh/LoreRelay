// NOAI-ECON-FLOWS-003: deterministic single-stage processing recipes.
// Pure Core — no vscode, fs, time, randomness, persistence, or LLM.

import type {
    EconomyFlowDefinition,
    EconomyFlowDiagnostic,
    EconomyNode,
    MarketStockDelta,
    ProcessingRecipe,
    ProcessingSite,
    RuntimeProduction,
} from './economyFlowCore';
import {
    diagnoseUnknownOperationalIds,
    resolveProcessingSiteOperation,
    type EconomyOperationalState,
} from './economyOperationalCore';
import type { CommerceForge, MarketStateMap } from './livingWorldTypes';

export interface CommodityQuantity {
    commodityId: string;
    quantity: number;
}

export interface ProcessingSiteSummary {
    siteId: string;
    nodeId: string;
    recipeId: string;
    batches: number;
    condition: number;
    baseMaxBatches: number;
    effectiveMaxBatches: number;
    inputsConsumed: CommodityQuantity[];
    outputsProduced: CommodityQuantity[];
}

export interface EconomyProcessingTickInput {
    definition: EconomyFlowDefinition;
    forge: Pick<CommerceForge, 'commodities' | 'markets'>;
    markets: MarketStateMap;
    operationalState?: EconomyOperationalState;
}

export interface EconomyProcessingTickResult {
    sites: ProcessingSiteSummary[];
    inputMarketDeltas: MarketStockDelta[];
    runtimeProduction: RuntimeProduction[];
    diagnostics: EconomyFlowDiagnostic[];
}

function isNonEmptyString(value: unknown): value is string {
    return typeof value === 'string' && value.length > 0;
}

function isFiniteNumber(value: unknown): value is number {
    return typeof value === 'number' && Number.isFinite(value);
}

function nz(value: number): number {
    return Object.is(value, -0) ? 0 : value;
}

function compareId(a: string, b: string): number {
    return a < b ? -1 : a > b ? 1 : 0;
}

function stockKey(marketLocationId: string, commodityId: string): string {
    return `${marketLocationId}\0${commodityId}`;
}

function pairKey(nodeId: string, commodityId: string): string {
    return `${nodeId}\0${commodityId}`;
}

/**
 * Deterministic single-stage processing against opening market stock.
 * Outputs are returned as runtimeProduction (not market stock deltas).
 * Same-tick recipe chains are impossible by design.
 */
export function computeEconomyProcessingTick(
    input: EconomyProcessingTickInput
): EconomyProcessingTickResult {
    const diagnostics: EconomyFlowDiagnostic[] = [];
    const definition = input?.definition;
    const forge = input?.forge;
    const markets = input?.markets ?? {};
    const operational = input?.operationalState;

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

    // --- Recipes ---
    const recipesById = new Map<string, ProcessingRecipe>();
    const seenRecipeIds = new Set<string>();
    const rawRecipes = definition && Array.isArray(definition.processingRecipes)
        ? definition.processingRecipes
        : [];

    for (const recipe of rawRecipes) {
        if (!recipe || !isNonEmptyString(recipe.id)) {
            diagnostics.push({ code: 'invalid_recipe', message: 'Processing recipe missing id' });
            continue;
        }
        if (seenRecipeIds.has(recipe.id)) {
            diagnostics.push({
                code: 'duplicate_recipe_id',
                message: `Duplicate processing recipe id: ${recipe.id}`,
                id: recipe.id,
            });
            continue;
        }
        seenRecipeIds.add(recipe.id);

        if (!recipe.inputs || typeof recipe.inputs !== 'object' || Array.isArray(recipe.inputs)
            || !recipe.outputs || typeof recipe.outputs !== 'object' || Array.isArray(recipe.outputs)) {
            diagnostics.push({
                code: 'invalid_recipe',
                message: `Recipe ${recipe.id} missing inputs/outputs`,
                id: recipe.id,
            });
            continue;
        }

        const inputEntries: Array<[string, number]> = [];
        let inputsOk = true;
        for (const [cid, qty] of Object.entries(recipe.inputs)) {
            if (!isNonEmptyString(cid) || !commodityIds.has(cid)) {
                diagnostics.push({
                    code: 'unknown_commodity',
                    message: `Recipe ${recipe.id} has unknown input commodity ${cid}`,
                    id: recipe.id,
                });
                inputsOk = false;
                break;
            }
            if (!isFiniteNumber(qty) || qty <= 0) {
                diagnostics.push({
                    code: 'invalid_number',
                    message: `Recipe ${recipe.id} has invalid input quantity for ${cid}`,
                    id: recipe.id,
                });
                inputsOk = false;
                break;
            }
            inputEntries.push([cid, qty]);
        }
        if (!inputsOk || inputEntries.length === 0) {
            if (inputsOk && inputEntries.length === 0) {
                diagnostics.push({
                    code: 'invalid_recipe',
                    message: `Recipe ${recipe.id} has no inputs`,
                    id: recipe.id,
                });
            }
            continue;
        }

        const outputEntries: Array<[string, number]> = [];
        let outputsOk = true;
        for (const [cid, qty] of Object.entries(recipe.outputs)) {
            if (!isNonEmptyString(cid) || !commodityIds.has(cid)) {
                diagnostics.push({
                    code: 'unknown_commodity',
                    message: `Recipe ${recipe.id} has unknown output commodity ${cid}`,
                    id: recipe.id,
                });
                outputsOk = false;
                break;
            }
            if (!isFiniteNumber(qty) || qty <= 0) {
                diagnostics.push({
                    code: 'invalid_number',
                    message: `Recipe ${recipe.id} has invalid output quantity for ${cid}`,
                    id: recipe.id,
                });
                outputsOk = false;
                break;
            }
            outputEntries.push([cid, qty]);
        }
        if (!outputsOk || outputEntries.length === 0) {
            if (outputsOk && outputEntries.length === 0) {
                diagnostics.push({
                    code: 'invalid_recipe',
                    message: `Recipe ${recipe.id} has no outputs`,
                    id: recipe.id,
                });
            }
            continue;
        }

        // Preserve maps with validated entries only (sorted for determinism later).
        const inputs: Record<string, number> = {};
        for (const [cid, qty] of inputEntries.sort((a, b) => compareId(a[0], b[0]))) {
            inputs[cid] = qty;
        }
        const outputs: Record<string, number> = {};
        for (const [cid, qty] of outputEntries.sort((a, b) => compareId(a[0], b[0]))) {
            outputs[cid] = qty;
        }
        recipesById.set(recipe.id, { id: recipe.id, inputs, outputs });
    }

    // --- Sites (validate; shared stock consumed later in siteId order) ---
    interface ValidSite {
        id: string;
        nodeId: string;
        recipeId: string;
        maxBatchesPerTick: number;
        condition: number;
        effectiveMaxBatches: number;
        marketLocationId: string;
        recipe: ProcessingRecipe;
    }

    const validSites: ValidSite[] = [];
    const seenSiteIds = new Set<string>();
    const rawSites = definition && Array.isArray(definition.processingSites)
        ? definition.processingSites
        : [];

    for (const site of rawSites) {
        if (!site || !isNonEmptyString(site.id)) {
            diagnostics.push({ code: 'invalid_site', message: 'Processing site missing id' });
            continue;
        }
        if (seenSiteIds.has(site.id)) {
            diagnostics.push({
                code: 'duplicate_site_id',
                message: `Duplicate processing site id: ${site.id}`,
                id: site.id,
            });
            continue;
        }
        seenSiteIds.add(site.id);

        if (!isNonEmptyString(site.nodeId) || !nodesById.has(site.nodeId)) {
            diagnostics.push({
                code: 'missing_node',
                message: `Processing site ${site.id} references missing node`,
                id: site.id,
            });
            continue;
        }
        if (!isNonEmptyString(site.recipeId) || !recipesById.has(site.recipeId)) {
            diagnostics.push({
                code: 'unknown_recipe',
                message: `Processing site ${site.id} references unknown recipe`,
                id: site.id,
            });
            continue;
        }
        if (!isFiniteNumber(site.maxBatchesPerTick)
            || !Number.isInteger(site.maxBatchesPerTick)
            || site.maxBatchesPerTick <= 0) {
            diagnostics.push({
                code: 'invalid_number',
                message: `Processing site ${site.id} has invalid maxBatchesPerTick`,
                id: site.id,
            });
            continue;
        }

        const node = nodesById.get(site.nodeId)!;
        const mid = resolveMarketBinding(node);
        if (!mid) {
            diagnostics.push({
                code: 'invalid_market_binding',
                message: `Processing site ${site.id} node is not uniquely market-backed`,
                id: site.id,
            });
            continue;
        }

        const recipe = recipesById.get(site.recipeId)!;
        let tradesOk = true;
        for (const cid of Object.keys(recipe.inputs)) {
            if (!marketTrades(mid, cid)) {
                diagnostics.push({
                    code: 'invalid_market_binding',
                    message: `Processing site ${site.id} market does not trade input ${cid}`,
                    id: site.id,
                });
                tradesOk = false;
                break;
            }
        }
        if (!tradesOk) { continue; }
        for (const cid of Object.keys(recipe.outputs)) {
            if (!marketTrades(mid, cid)) {
                diagnostics.push({
                    code: 'invalid_market_binding',
                    message: `Processing site ${site.id} market does not trade output ${cid}`,
                    id: site.id,
                });
                tradesOk = false;
                break;
            }
        }
        if (!tradesOk) { continue; }

        const resolved = resolveProcessingSiteOperation(site, operational, diagnostics);
        validSites.push({
            id: site.id,
            nodeId: site.nodeId,
            recipeId: site.recipeId,
            maxBatchesPerTick: site.maxBatchesPerTick,
            condition: resolved.condition,
            effectiveMaxBatches: resolved.effectiveMaxBatches,
            marketLocationId: mid,
            recipe,
        });
    }

    diagnostics.push(...diagnoseUnknownOperationalIds(operational, {
        siteIds: seenSiteIds,
    }));

    // Stable siteId order is the temporary priority policy for shared inputs.
    validSites.sort((a, b) => compareId(a.id, b.id));

    // Opening-stock snapshot budget (outputs never refill this map).
    const stockBudget = new Map<string, number>();
    function remaining(mid: string, cid: string): number {
        const key = stockKey(mid, cid);
        if (!stockBudget.has(key)) {
            stockBudget.set(key, openingStock(mid, cid));
        }
        return stockBudget.get(key) ?? 0;
    }
    function consume(mid: string, cid: string, amount: number): void {
        const key = stockKey(mid, cid);
        const cur = remaining(mid, cid);
        stockBudget.set(key, nz(Math.max(0, cur - amount)));
    }

    const siteSummaries: ProcessingSiteSummary[] = [];
    // Aggregate input consumption by node + market + commodity.
    const consumedByPair = new Map<string, { nodeId: string; marketLocationId: string; commodityId: string; amount: number }>();
    // Aggregate runtime production by node + commodity.
    const runtimeByPair = new Map<string, number>();

    for (const site of validSites) {
        const recipe = site.recipe;
        const inputIds = Object.keys(recipe.inputs).sort(compareId);
        const outputIds = Object.keys(recipe.outputs).sort(compareId);

        // Condition floors max batches; then limited by available inputs.
        let batches = site.effectiveMaxBatches;
        for (const cid of inputIds) {
            const required = recipe.inputs[cid];
            const avail = remaining(site.marketLocationId, cid);
            const possible = Math.floor(avail / required);
            if (possible < batches) {
                batches = possible;
            }
        }
        if (batches < 0 || !Number.isFinite(batches)) {
            batches = 0;
        }
        batches = Math.floor(batches);

        const inputsConsumed: CommodityQuantity[] = [];
        const outputsProduced: CommodityQuantity[] = [];

        if (batches > 0) {
            for (const cid of inputIds) {
                const qty = nz(recipe.inputs[cid] * batches);
                consume(site.marketLocationId, cid, qty);
                inputsConsumed.push({ commodityId: cid, quantity: qty });
                const ck = `${site.nodeId}\0${site.marketLocationId}\0${cid}`;
                const prev = consumedByPair.get(ck);
                if (prev) {
                    prev.amount = nz(prev.amount + qty);
                } else {
                    consumedByPair.set(ck, {
                        nodeId: site.nodeId,
                        marketLocationId: site.marketLocationId,
                        commodityId: cid,
                        amount: qty,
                    });
                }
            }
            for (const cid of outputIds) {
                const qty = nz(recipe.outputs[cid] * batches);
                outputsProduced.push({ commodityId: cid, quantity: qty });
                const pk = pairKey(site.nodeId, cid);
                runtimeByPair.set(pk, nz((runtimeByPair.get(pk) ?? 0) + qty));
            }
        } else {
            for (const cid of inputIds) {
                inputsConsumed.push({ commodityId: cid, quantity: 0 });
            }
            for (const cid of outputIds) {
                outputsProduced.push({ commodityId: cid, quantity: 0 });
            }
        }

        siteSummaries.push({
            siteId: site.id,
            nodeId: site.nodeId,
            recipeId: site.recipeId,
            batches,
            condition: site.condition,
            baseMaxBatches: site.maxBatchesPerTick,
            effectiveMaxBatches: site.effectiveMaxBatches,
            inputsConsumed,
            outputsProduced,
        });
    }

    // Only include sites that ran or were valid — already have all valid sites.
    // Sort summaries by siteId (already sorted by processing order).
    siteSummaries.sort((a, b) => compareId(a.siteId, b.siteId));

    const inputMarketDeltas: MarketStockDelta[] = [...consumedByPair.values()]
        .filter((c) => c.amount > 0)
        .map((c) => ({
            nodeId: c.nodeId,
            marketLocationId: c.marketLocationId,
            commodityId: c.commodityId,
            supplied: 0,
            consumed: nz(c.amount),
            delta: nz(-c.amount),
        }))
        .sort((a, b) => {
            const byMarket = compareId(a.marketLocationId, b.marketLocationId);
            if (byMarket !== 0) { return byMarket; }
            const byNode = compareId(a.nodeId, b.nodeId);
            return byNode !== 0 ? byNode : compareId(a.commodityId, b.commodityId);
        });

    const runtimeProduction: RuntimeProduction[] = [];
    for (const [key, amount] of runtimeByPair) {
        if (amount <= 0) { continue; }
        const sep = key.indexOf('\0');
        runtimeProduction.push({
            nodeId: key.slice(0, sep),
            commodityId: key.slice(sep + 1),
            amount: nz(amount),
        });
    }
    runtimeProduction.sort((a, b) => {
        const byNode = compareId(a.nodeId, b.nodeId);
        return byNode !== 0 ? byNode : compareId(a.commodityId, b.commodityId);
    });

    diagnostics.sort((a, b) => {
        const byCode = compareId(a.code, b.code);
        if (byCode !== 0) { return byCode; }
        return compareId(a.id ?? '', b.id ?? '');
    });

    return {
        sites: siteSummaries,
        inputMarketDeltas,
        runtimeProduction,
        diagnostics,
    };
}
