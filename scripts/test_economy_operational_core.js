#!/usr/bin/env node
'use strict';

// NOAI-ECON-FLOWS-004: operational conditions and route disruptions.

const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');

const forgePath = path.join(root, 'out', 'livingWorldForgeCore.js');
const flowPath = path.join(root, 'out', 'economyFlowCore.js');
const procPath = path.join(root, 'out', 'economyProcessingCore.js');
const opsPath = path.join(root, 'out', 'economyOperationalCore.js');
const kitPath = path.join(root, 'out', 'worldKitTickCore.js');

let failed = 0;
function fail(msg) { console.error(`FAIL: ${msg}`); failed++; }
function ok(msg) { console.log(`OK: ${msg}`); }
function approx(a, b, eps = 1e-9) { return Math.abs(a - b) <= eps; }
function deepClone(v) { return JSON.parse(JSON.stringify(v)); }

for (const p of [forgePath, flowPath, procPath, opsPath, kitPath]) {
    if (!fs.existsSync(p)) {
        fail(`${p} missing — run npm run compile first`);
        process.exit(1);
    }
}

const { parseCommerceForge } = require(forgePath);
const { computeEconomyFlowTick, applyEconomyFlowMarketDeltas } = require(flowPath);
const { computeEconomyProcessingTick } = require(procPath);
const {
    resolveProductionSourceOperation,
    resolveProcessingSiteOperation,
    resolveTradeRouteOperation,
} = require(opsPath);
const { runLivingWorldTick } = require(kitPath);

const baseForge = {
    commodities: [
        { id: 'wheat', name: 'Wheat', basePrice: 10, weight: 1 },
        { id: 'ore', name: 'Ore', basePrice: 20, weight: 2 },
        { id: 'metal', name: 'Metal', basePrice: 40, weight: 2 },
        { id: 'sakuradite', name: 'Sakuradite', basePrice: 100, weight: 1 },
    ],
    markets: [
        { locationId: 'town', commodityIds: ['wheat', 'ore', 'metal', 'sakuradite'], targetStock: 30 },
        { locationId: 'port', commodityIds: ['wheat', 'ore', 'metal', 'sakuradite'], targetStock: 30 },
    ],
    transportKinds: [{ id: 'wagon', name: 'Wagon', capacity: 50, speed: 1 }],
};

function nodes() {
    return [
        { id: 'farm', kind: 'facility', label: 'Farm' },
        { id: 'town_node', kind: 'settlement', label: 'Town', marketLocationId: 'town' },
        { id: 'port_node', kind: 'settlement', label: 'Port', marketLocationId: 'port' },
    ];
}

function markets(stock = {}) {
    return {
        town: {
            wheat: { stock: stock.wheat ?? 10, priceIndex: 1.25 },
            ore: { stock: stock.ore ?? 10, priceIndex: 1.0 },
            metal: { stock: stock.metal ?? 0, priceIndex: 1.0 },
            sakuradite: { stock: stock.sakuradite ?? 0, priceIndex: 1.5 },
        },
        port: {
            wheat: { stock: 0, priceIndex: 1.0 },
            ore: { stock: 0, priceIndex: 1.0 },
            metal: { stock: 0, priceIndex: 1.0 },
            sakuradite: { stock: 0, priceIndex: 1.0 },
        },
    };
}

// =========================================================================
// Operational resolution (1–11)
// =========================================================================

// 1. Neutral defaults preserve authored base values
{
    const r = resolveProductionSourceOperation({
        id: 'ps1', baseOutputPerTick: 10,
    });
    if (!approx(r.productivePotential, 1) || !approx(r.condition, 1)
        || !approx(r.effectiveMultiplier, 1) || !approx(r.effectiveOutput, 10)) {
        fail(`1. defaults: ${JSON.stringify(r)}`);
    } else {
        ok('1. neutral defaults preserve authored base values');
    }
}

// 2. Productive potential scales raw production
{
    const r = resolveProductionSourceOperation({
        id: 'ps1', baseOutputPerTick: 10, productivePotential: 0.5,
    });
    if (!approx(r.effectiveOutput, 5)) {
        fail(`2. potential scale: ${r.effectiveOutput}`);
    } else {
        ok('2. productive potential scales raw production');
    }
}

// 3. Facility condition scales raw production
{
    const r = resolveProductionSourceOperation({
        id: 'ps1', baseOutputPerTick: 10, condition: 0.4,
    });
    if (!approx(r.effectiveOutput, 4)) {
        fail(`3. condition scale: ${r.effectiveOutput}`);
    } else {
        ok('3. facility condition scales raw production');
    }
}

// 4. Potential and condition multiply together exactly once
{
    const r = resolveProductionSourceOperation({
        id: 'ps1', baseOutputPerTick: 10, productivePotential: 0.5, condition: 0.5,
    });
    if (!approx(r.effectiveMultiplier, 0.25) || !approx(r.effectiveOutput, 2.5)) {
        fail(`4. multiply once: ${JSON.stringify(r)}`);
    } else {
        ok('4. potential and condition multiply together exactly once');
    }
}

// 5. Potential zero stops production
{
    const r = resolveProductionSourceOperation({
        id: 'ps1', baseOutputPerTick: 10, productivePotential: 0,
    });
    if (!approx(r.effectiveOutput, 0)) {
        fail(`5. potential zero: ${r.effectiveOutput}`);
    } else {
        ok('5. potential zero stops production');
    }
}

// 6. Condition zero stops production
{
    const r = resolveProductionSourceOperation({
        id: 'ps1', baseOutputPerTick: 10, condition: 0,
    });
    if (!approx(r.effectiveOutput, 0)) {
        fail(`6. condition zero: ${r.effectiveOutput}`);
    } else {
        ok('6. condition zero stops production');
    }
}

// 7. Potential above one increases production
{
    const r = resolveProductionSourceOperation({
        id: 'ps1', baseOutputPerTick: 10, productivePotential: 1.5,
    });
    if (!approx(r.effectiveOutput, 15)) {
        fail(`7. potential boost: ${r.effectiveOutput}`);
    } else {
        ok('7. potential above one increases production');
    }
}

// 8. Runtime source potential overrides Forge value
{
    const r = resolveProductionSourceOperation(
        { id: 'ps1', baseOutputPerTick: 10, productivePotential: 0.5 },
        { sourcePotentialById: { ps1: 2 } }
    );
    if (!approx(r.productivePotential, 2) || !approx(r.effectiveOutput, 20)) {
        fail(`8. runtime potential: ${JSON.stringify(r)}`);
    } else {
        ok('8. runtime source potential overrides Forge value');
    }
}

// 9. Runtime source condition overrides Forge value
{
    const r = resolveProductionSourceOperation(
        { id: 'ps1', baseOutputPerTick: 10, condition: 1 },
        { sourceConditionById: { ps1: 0.2 } }
    );
    if (!approx(r.condition, 0.2) || !approx(r.effectiveOutput, 2)) {
        fail(`9. runtime condition: ${JSON.stringify(r)}`);
    } else {
        ok('9. runtime source condition overrides Forge value');
    }
}

// 10. Invalid source runtime values fall back safely with diagnostics
{
    const diags = [];
    const r = resolveProductionSourceOperation(
        { id: 'ps1', baseOutputPerTick: 10, productivePotential: 0.5 },
        { sourcePotentialById: { ps1: NaN }, sourceConditionById: { ps1: Infinity } },
        diags
    );
    if (!approx(r.productivePotential, 0.5) || !approx(r.condition, 1)) {
        fail(`10. fallback: ${JSON.stringify(r)}`);
    } else if (diags.length < 2) {
        fail(`10. expected diagnostics: ${JSON.stringify(diags)}`);
    } else {
        ok('10. invalid source runtime values fall back with diagnostics');
    }
}

// 11. Input definitions and runtime state remain deeply unchanged
{
    const source = { id: 'ps1', baseOutputPerTick: 10, productivePotential: 0.8, condition: 0.9 };
    const operational = { sourcePotentialById: { ps1: 1.2 }, sourceConditionById: { ps1: 0.5 } };
    const beforeS = deepClone(source);
    const beforeO = deepClone(operational);
    resolveProductionSourceOperation(source, operational, []);
    if (JSON.stringify(source) !== JSON.stringify(beforeS)
        || JSON.stringify(operational) !== JSON.stringify(beforeO)) {
        fail('11. mutation detected');
    } else {
        ok('11. input definitions and runtime state remain deeply unchanged');
    }
}

// =========================================================================
// Processing condition (12–17)
// =========================================================================

// 12. Condition one preserves max batches
{
    const r = resolveProcessingSiteOperation({
        id: 's1', maxBatchesPerTick: 5, condition: 1,
    });
    if (r.effectiveMaxBatches !== 5) {
        fail(`12. preserve: ${r.effectiveMaxBatches}`);
    } else {
        ok('12. condition one preserves max batches');
    }
}

// 13. Condition one-half floors effective max batches deterministically
{
    const r = resolveProcessingSiteOperation({
        id: 's1', maxBatchesPerTick: 5, condition: 0.5,
    });
    // floor(5 * 0.5) = 2
    if (r.effectiveMaxBatches !== 2) {
        fail(`13. half floor: ${r.effectiveMaxBatches}`);
    } else {
        ok('13. condition one-half floors effective max batches');
    }
}

// 14. Condition zero stops processing
{
    const r = resolveProcessingSiteOperation({
        id: 's1', maxBatchesPerTick: 5, condition: 0,
    });
    if (r.effectiveMaxBatches !== 0) {
        fail(`14. zero: ${r.effectiveMaxBatches}`);
    } else {
        ok('14. condition zero stops processing');
    }
}

// 15. Runtime processing condition overrides Forge value
{
    const r = resolveProcessingSiteOperation(
        { id: 's1', maxBatchesPerTick: 10, condition: 1 },
        { processingConditionBySiteId: { s1: 0.3 } }
    );
    if (!approx(r.condition, 0.3) || r.effectiveMaxBatches !== 3) {
        fail(`15. runtime processing: ${JSON.stringify(r)}`);
    } else {
        ok('15. runtime processing condition overrides Forge value');
    }
}

// 16. Processing output is not multiplied again by source potential
{
    const def = {
        nodes: nodes(),
        productionSources: [],
        demands: [],
        tradeRoutes: [],
        processingRecipes: [
            { id: 'smelt', inputs: { ore: 1 }, outputs: { metal: 1 } },
        ],
        processingSites: [
            { id: 's1', nodeId: 'town_node', recipeId: 'smelt', maxBatchesPerTick: 2 },
        ],
    };
    const proc = computeEconomyProcessingTick({
        definition: def,
        forge: baseForge,
        markets: markets({ ore: 10 }),
    });
    // 2 metal runtime
    const flow = computeEconomyFlowTick({
        definition: def,
        forge: baseForge,
        markets: markets({ ore: 8 }),
        additionalProduction: proc.runtimeProduction,
        operationalState: {
            // Should NOT affect runtime production
            sourcePotentialById: { anything: 0 },
        },
    });
    const node = flow.nodes.find((n) => n.commodityId === 'metal');
    if (!node || !approx(node.produced, 2)) {
        fail(`16. runtime re-multiplied?: ${JSON.stringify(node)}`);
    } else {
        ok('16. processing output is not multiplied again by source potential');
    }
}

// 17. Existing no-same-tick-chain behavior remains unchanged
{
    const def = {
        nodes: nodes(),
        productionSources: [],
        demands: [],
        tradeRoutes: [],
        processingRecipes: [
            { id: 'ore_to_metal', inputs: { ore: 1 }, outputs: { metal: 1 } },
            { id: 'metal_to_weapon', inputs: { metal: 1 }, outputs: { wheat: 1 } },
        ],
        processingSites: [
            { id: 'smelter', nodeId: 'town_node', recipeId: 'ore_to_metal', maxBatchesPerTick: 3 },
            { id: 'forge', nodeId: 'town_node', recipeId: 'metal_to_weapon', maxBatchesPerTick: 3 },
        ],
    };
    const result = computeEconomyProcessingTick({
        definition: def,
        forge: baseForge,
        markets: markets({ ore: 3, metal: 0 }),
        operationalState: { processingConditionBySiteId: { smelter: 1, forge: 1 } },
    });
    const byId = Object.fromEntries(result.sites.map((s) => [s.siteId, s.batches]));
    if (byId.smelter !== 3 || byId.forge !== 0) {
        fail(`17. chain: ${JSON.stringify(byId)}`);
    } else {
        ok('17. no-same-tick-chain behavior remains unchanged');
    }
}

// =========================================================================
// Route status and modifiers (18–28)
// =========================================================================

function routeFlow(status, capacityMultiplier, riskDelta, baseRisk, operational) {
    return computeEconomyFlowTick({
        definition: {
            nodes: nodes(),
            productionSources: [
                { id: 'ps1', nodeId: 'farm', commodityId: 'wheat', baseOutputPerTick: 20 },
            ],
            demands: [],
            tradeRoutes: [
                {
                    id: 'r1',
                    fromNodeId: 'farm',
                    toNodeId: 'town_node',
                    commodityId: 'wheat',
                    capacityPerTick: 20,
                    baseRisk,
                    status,
                    capacityMultiplier,
                    riskDelta,
                },
            ],
        },
        forge: baseForge,
        markets: markets(),
        operationalState: operational,
    });
}

// 18. Open route preserves capacity
{
    const result = routeFlow('open', undefined, undefined, 0.2);
    const r = result.routes[0];
    if (!r || r.status !== 'open' || !approx(r.capacity, 20) || !approx(r.baseCapacity, 20)
        || !approx(r.volume, 20) || !approx(r.risk, 0.2)) {
        fail(`18. open: ${JSON.stringify(r)}`);
    } else {
        ok('18. open route preserves capacity');
    }
}

// 19. Strained route uses half capacity
{
    const result = routeFlow('strained');
    const r = result.routes[0];
    if (!r || r.status !== 'strained' || !approx(r.capacity, 10) || !approx(r.volume, 10)) {
        fail(`19. strained: ${JSON.stringify(r)}`);
    } else {
        ok('19. strained route uses half capacity');
    }
}

// 20. Blocked route has zero volume but remains in summaries
{
    const result = routeFlow('blocked');
    const r = result.routes[0];
    const farm = result.nodes.find((n) => n.nodeId === 'farm');
    if (!r || r.status !== 'blocked' || !approx(r.capacity, 0) || !approx(r.volume, 0)) {
        fail(`20. blocked route: ${JSON.stringify(r)}`);
    } else if (!farm || !approx(farm.unshippedSupply, 20)) {
        fail(`20. unshipped: ${JSON.stringify(farm)}`);
    } else {
        ok('20. blocked route has zero volume but remains in summaries');
    }
}

// 21. Raided route uses quarter capacity
{
    const result = routeFlow('raided');
    const r = result.routes[0];
    if (!r || r.status !== 'raided' || !approx(r.capacity, 5) || !approx(r.volume, 5)) {
        fail(`21. raided: ${JSON.stringify(r)}`);
    } else {
        ok('21. raided route uses quarter capacity');
    }
}

// 22. Capacity multiplier combines with status multiplier
{
    // strained 0.5 * capacityMultiplier 0.5 * 20 = 5
    const result = routeFlow('strained', 0.5);
    const r = result.routes[0];
    if (!r || !approx(r.capacity, 5) || !approx(r.statusCapacityMultiplier, 0.5)
        || !approx(r.capacityMultiplier, 0.5) || !approx(r.volume, 5)) {
        fail(`22. combine: ${JSON.stringify(r)}`);
    } else {
        ok('22. capacity multiplier combines with status multiplier');
    }
}

// 23. Risk delta clamps final risk to [0,1]
{
    const high = resolveTradeRouteOperation({
        id: 'r1', capacityPerTick: 10, baseRisk: 0.8, riskDelta: 0.5,
    });
    const low = resolveTradeRouteOperation({
        id: 'r1', capacityPerTick: 10, baseRisk: 0.1, riskDelta: -0.5,
    });
    if (!approx(high.effectiveRisk, 1) || !approx(low.effectiveRisk, 0)) {
        fail(`23. risk clamp: high=${high.effectiveRisk} low=${low.effectiveRisk}`);
    } else {
        ok('23. risk delta clamps final risk to [0,1]');
    }
}

// 24. Risk does not randomly alter volume
{
    const a = routeFlow('open', 1, 0.9, 0.9);
    const b = routeFlow('open', 1, 0, 0);
    if (!approx(a.routes[0].volume, b.routes[0].volume) || !approx(a.routes[0].volume, 20)) {
        fail(`24. risk altered volume: ${a.routes[0].volume} vs ${b.routes[0].volume}`);
    } else {
        ok('24. risk does not randomly alter volume');
    }
}

// 25. Runtime route state overrides Forge route defaults
{
    const result = routeFlow('open', 1, 0, 0, {
        routeStateById: {
            r1: { status: 'blocked', capacityMultiplier: 2, riskDelta: 0.4 },
        },
    });
    const r = result.routes[0];
    if (!r || r.status !== 'blocked' || !approx(r.capacity, 0) || !approx(r.risk, 0.4)) {
        fail(`25. runtime override: ${JSON.stringify(r)}`);
    } else {
        ok('25. runtime route state overrides Forge route defaults');
    }
}

// 26. Invalid runtime route state falls back safely
{
    const diags = [];
    const r = resolveTradeRouteOperation(
        { id: 'r1', capacityPerTick: 10, status: 'strained', capacityMultiplier: 1 },
        { routeStateById: { r1: { status: 'warp', capacityMultiplier: NaN } } },
        diags
    );
    if (r.status !== 'strained' || !approx(r.capacityMultiplier, 1) || !approx(r.effectiveCapacity, 5)) {
        fail(`26. fallback: ${JSON.stringify(r)}`);
    } else if (diags.length < 1) {
        fail(`26. expected diagnostics: ${JSON.stringify(diags)}`);
    } else {
        ok('26. invalid runtime route state falls back safely');
    }
}

// 27. Blocked-route unshipped production follows existing local/unshipped rules
{
    // Market-backed source: local supply
    const local = computeEconomyFlowTick({
        definition: {
            nodes: [
                { id: 'town_node', kind: 'settlement', label: 'Town', marketLocationId: 'town' },
                { id: 'port_node', kind: 'settlement', label: 'Port', marketLocationId: 'port' },
            ],
            productionSources: [
                { id: 'ps1', nodeId: 'town_node', commodityId: 'wheat', baseOutputPerTick: 8 },
            ],
            demands: [],
            tradeRoutes: [
                {
                    id: 'r1',
                    fromNodeId: 'town_node',
                    toNodeId: 'port_node',
                    commodityId: 'wheat',
                    capacityPerTick: 8,
                    status: 'blocked',
                },
            ],
        },
        forge: baseForge,
        markets: markets(),
    });
    const delta = local.marketDeltas.find((d) => d.commodityId === 'wheat' && d.marketLocationId === 'town');
    if (!delta || !approx(delta.supplied, 8)) {
        fail(`27. market-backed local: ${JSON.stringify(delta)}`);
    } else {
        ok('27. blocked-route unshipped production follows local/unshipped rules');
    }
}

// 28. Route results independent of input array order
{
    function build(routes) {
        return computeEconomyFlowTick({
            definition: {
                nodes: nodes(),
                productionSources: [
                    { id: 'ps1', nodeId: 'farm', commodityId: 'wheat', baseOutputPerTick: 30 },
                ],
                demands: [],
                tradeRoutes: routes,
            },
            forge: baseForge,
            markets: markets(),
        });
    }
    const a = build([
        { id: 'r_b', fromNodeId: 'farm', toNodeId: 'town_node', commodityId: 'wheat', capacityPerTick: 20, status: 'strained' },
        { id: 'r_a', fromNodeId: 'farm', toNodeId: 'port_node', commodityId: 'wheat', capacityPerTick: 20, status: 'open' },
    ]);
    const b = build([
        { id: 'r_a', fromNodeId: 'farm', toNodeId: 'port_node', commodityId: 'wheat', capacityPerTick: 20, status: 'open' },
        { id: 'r_b', fromNodeId: 'farm', toNodeId: 'town_node', commodityId: 'wheat', capacityPerTick: 20, status: 'strained' },
    ]);
    // effective caps: r_a=20, r_b=10, total=30, produced=30 → full
    const volA = Object.fromEntries(a.routes.map((r) => [r.routeId, r.volume]));
    const volB = Object.fromEntries(b.routes.map((r) => [r.routeId, r.volume]));
    if (!approx(volA.r_a, 20) || !approx(volA.r_b, 10)
        || !approx(volB.r_a, 20) || !approx(volB.r_b, 10)) {
        fail(`28. order independence: ${JSON.stringify(volA)} vs ${JSON.stringify(volB)}`);
    } else {
        ok('28. route results remain independent of input array order');
    }
}

// =========================================================================
// Parser (29–34)
// =========================================================================

// 29. Valid potential, condition, status, capacity multiplier, risk delta parse
{
    const forge = parseCommerceForge({
        ...baseForge,
        resourceFlows: {
            nodes: nodes(),
            productionSources: [
                {
                    id: 'ps1', nodeId: 'farm', commodityId: 'wheat', baseOutputPerTick: 10,
                    productivePotential: 1.2, condition: 0.8,
                },
            ],
            demands: [],
            tradeRoutes: [
                {
                    id: 'r1', fromNodeId: 'farm', toNodeId: 'town_node', commodityId: 'wheat',
                    capacityPerTick: 10, status: 'strained', capacityMultiplier: 0.5, riskDelta: -0.1,
                    baseRisk: 0.3,
                },
            ],
            processingSites: [
                { id: 's1', nodeId: 'town_node', recipeId: 'x', maxBatchesPerTick: 2, condition: 0.7 },
            ],
            processingRecipes: [
                { id: 'x', inputs: { ore: 1 }, outputs: { metal: 1 } },
            ],
        },
    });
    const src = forge.resourceFlows.productionSources[0];
    const route = forge.resourceFlows.tradeRoutes[0];
    const site = forge.resourceFlows.processingSites[0];
    if (!approx(src.productivePotential, 1.2) || !approx(src.condition, 0.8)) {
        fail(`29. source: ${JSON.stringify(src)}`);
    } else if (route.status !== 'strained' || !approx(route.capacityMultiplier, 0.5)
        || !approx(route.riskDelta, -0.1)) {
        fail(`29. route: ${JSON.stringify(route)}`);
    } else if (!approx(site.condition, 0.7)) {
        fail(`29. site: ${JSON.stringify(site)}`);
    } else {
        ok('29. valid operational fields parse');
    }
}

// 30. Fractional values preserved
{
    const forge = parseCommerceForge({
        ...baseForge,
        resourceFlows: {
            nodes: [{ id: 'n1', kind: 'facility', label: 'N' }],
            productionSources: [
                {
                    id: 'ps1', nodeId: 'n1', commodityId: 'wheat', baseOutputPerTick: 1.5,
                    productivePotential: 0.33, condition: 0.66,
                },
            ],
            demands: [],
            tradeRoutes: [],
        },
    });
    const src = forge.resourceFlows.productionSources[0];
    if (!approx(src.productivePotential, 0.33) || !approx(src.condition, 0.66)
        || !approx(src.baseOutputPerTick, 1.5)) {
        fail(`30. fractions: ${JSON.stringify(src)}`);
    } else {
        ok('30. fractional values preserved');
    }
}

// 31. Invalid optional values omitted without discarding parent row
{
    const forge = parseCommerceForge({
        ...baseForge,
        resourceFlows: {
            nodes: nodes(),
            productionSources: [
                {
                    id: 'ps1', nodeId: 'farm', commodityId: 'wheat', baseOutputPerTick: 5,
                    productivePotential: NaN, condition: 'bad',
                },
            ],
            demands: [],
            tradeRoutes: [
                {
                    id: 'r1', fromNodeId: 'farm', toNodeId: 'town_node', commodityId: 'wheat',
                    capacityPerTick: 5, status: 'warp', capacityMultiplier: Infinity, riskDelta: 'x',
                },
            ],
        },
    });
    const src = forge.resourceFlows.productionSources[0];
    const route = forge.resourceFlows.tradeRoutes[0];
    if (!src || src.baseOutputPerTick !== 5 || src.productivePotential !== undefined
        || src.condition !== undefined) {
        fail(`31. source parent: ${JSON.stringify(src)}`);
    } else if (!route || route.capacityPerTick !== 5 || route.status !== undefined
        || route.capacityMultiplier !== undefined || route.riskDelta !== undefined) {
        fail(`31. route parent: ${JSON.stringify(route)}`);
    } else {
        ok('31. invalid optional values omitted without discarding parent');
    }
}

// 32. Values clamped to defined ranges
{
    const forge = parseCommerceForge({
        ...baseForge,
        resourceFlows: {
            nodes: [{ id: 'n1', kind: 'facility', label: 'N' }],
            productionSources: [
                {
                    id: 'ps1', nodeId: 'n1', commodityId: 'wheat', baseOutputPerTick: 1,
                    productivePotential: 9, condition: -3,
                },
            ],
            demands: [],
            tradeRoutes: [
                {
                    id: 'r1', fromNodeId: 'n1', toNodeId: 'n1', commodityId: 'wheat',
                    capacityPerTick: 1, capacityMultiplier: 5, riskDelta: -3,
                },
            ],
        },
    });
    const src = forge.resourceFlows.productionSources[0];
    const route = forge.resourceFlows.tradeRoutes[0];
    if (!approx(src.productivePotential, 2) || !approx(src.condition, 0)) {
        fail(`32. source clamp: ${JSON.stringify(src)}`);
    } else if (!approx(route.capacityMultiplier, 2) || !approx(route.riskDelta, -1)) {
        fail(`32. route clamp: ${JSON.stringify(route)}`);
    } else {
        ok('32. values clamped to defined ranges');
    }
}

// 33. Missing operational fields preserves Slice 003 Forge shape
{
    const forge = parseCommerceForge({
        ...baseForge,
        resourceFlows: {
            nodes: [{ id: 'n1', kind: 'facility', label: 'N' }],
            productionSources: [
                { id: 'ps1', nodeId: 'n1', commodityId: 'wheat', baseOutputPerTick: 1 },
            ],
            demands: [],
            tradeRoutes: [],
            processingRecipes: [
                { id: 'r1', inputs: { ore: 1 }, outputs: { metal: 1 } },
            ],
            processingSites: [
                { id: 's1', nodeId: 'n1', recipeId: 'r1', maxBatchesPerTick: 1 },
            ],
        },
    });
    const src = forge.resourceFlows.productionSources[0];
    const site = forge.resourceFlows.processingSites[0];
    if (src.productivePotential !== undefined || src.condition !== undefined
        || site.condition !== undefined) {
        fail('33. unexpected operational fields present');
    } else {
        ok('33. missing operational fields preserves Slice 003 shape');
    }
}

// 34. Existing custom commodities remain valid
{
    const forge = parseCommerceForge({
        ...baseForge,
        resourceFlows: {
            nodes: nodes(),
            productionSources: [
                {
                    id: 'ps1', nodeId: 'farm', commodityId: 'sakuradite', baseOutputPerTick: 3,
                    productivePotential: 1.1,
                },
            ],
            demands: [],
            tradeRoutes: [],
        },
    });
    if (!forge.commodities.some((c) => c.id === 'sakuradite')
        || forge.resourceFlows.productionSources[0].commodityId !== 'sakuradite') {
        fail('34. sakuradite invalid');
    } else {
        ok('34. existing custom commodities remain valid');
    }
}

// =========================================================================
// Tick integration (35–42)
// =========================================================================

const emptyRegistry = { version: '1', npcs: {} };

// 35. Source condition affects final market stock
{
    const forge = parseCommerceForge({
        ...baseForge,
        resourceFlows: {
            nodes: [
                { id: 'town_node', kind: 'settlement', label: 'Town', marketLocationId: 'town' },
            ],
            productionSources: [
                {
                    id: 'ps1', nodeId: 'town_node', commodityId: 'wheat', baseOutputPerTick: 10,
                    condition: 0.5,
                },
            ],
            demands: [],
            tradeRoutes: [],
        },
    });
    // open 10, produce effective 5, demand 0 → delta +5; recovery may add
    const tick = runLivingWorldTick({
        forge,
        markets: markets({ wheat: 10 }),
        registry: emptyRegistry,
        npcPositions: {},
        worldTurn: 1,
        commerceEnabled: true,
        agencyEnabled: false,
    });
    const src = tick.economyFlow.productionSources[0];
    if (!src || !approx(src.effectiveOutput, 5)) {
        fail(`35. source summary: ${JSON.stringify(src)}`);
    } else if (tick.markets.town.wheat.stock < 15) {
        // 10 + 5 + recovery(~2) >= 15
        fail(`35. stock: ${tick.markets.town.wheat.stock}`);
    } else {
        ok('35. source condition affects final market stock');
    }
}

// 36. Processing condition affects final output
{
    const forge = parseCommerceForge({
        ...baseForge,
        resourceFlows: {
            nodes: [
                { id: 'town_node', kind: 'settlement', label: 'Town', marketLocationId: 'town' },
            ],
            productionSources: [],
            demands: [],
            tradeRoutes: [],
            processingRecipes: [
                { id: 'smelt', inputs: { ore: 1 }, outputs: { metal: 1 } },
            ],
            processingSites: [
                {
                    id: 's1', nodeId: 'town_node', recipeId: 'smelt', maxBatchesPerTick: 4,
                    condition: 0.5,
                },
            ],
        },
    });
    const tick = runLivingWorldTick({
        forge,
        markets: markets({ ore: 10, metal: 0 }),
        registry: emptyRegistry,
        npcPositions: {},
        worldTurn: 1,
        commerceEnabled: true,
        agencyEnabled: false,
    });
    // effectiveMaxBatches = floor(4*0.5)=2 → 2 metal local
    const site = tick.economyProcessing.sites[0];
    if (!site || site.batches !== 2 || site.effectiveMaxBatches !== 2) {
        fail(`36. processing: ${JSON.stringify(site)}`);
    } else if (tick.markets.town.metal.stock < 2) {
        fail(`36. metal stock: ${tick.markets.town.metal.stock}`);
    } else {
        ok('36. processing condition affects final output');
    }
}

// 37. Blocked routes affect delivery before recovery
{
    const forge = parseCommerceForge({
        ...baseForge,
        markets: [
            { locationId: 'town', commodityIds: ['wheat', 'ore', 'metal', 'sakuradite'], targetStock: 10 },
            { locationId: 'port', commodityIds: ['wheat', 'ore', 'metal', 'sakuradite'], targetStock: 30 },
        ],
        resourceFlows: {
            nodes: nodes(),
            productionSources: [
                { id: 'ps1', nodeId: 'farm', commodityId: 'wheat', baseOutputPerTick: 10 },
            ],
            demands: [],
            tradeRoutes: [
                {
                    id: 'r1', fromNodeId: 'farm', toNodeId: 'town_node', commodityId: 'wheat',
                    capacityPerTick: 10, status: 'blocked',
                },
            ],
        },
    });
    const m = markets({ wheat: 10 });
    const tick = runLivingWorldTick({
        forge,
        markets: m,
        registry: emptyRegistry,
        npcPositions: {},
        worldTurn: 1,
        commerceEnabled: true,
        agencyEnabled: false,
        economyProfile: 'normal',
    });
    // No import to town; town wheat only recovery from 10 at target → stays ~10
    // farm unshipped (non-market)
    if (!approx(tick.economyFlow.routes[0].volume, 0)
        || tick.economyFlow.routes[0].status !== 'blocked') {
        fail(`37. route: ${JSON.stringify(tick.economyFlow.routes[0])}`);
    } else if (!approx(tick.markets.town.wheat.stock, 10)) {
        // at target, no import, no demand → no change (or recovery no-op)
        fail(`37. unexpected town stock: ${tick.markets.town.wheat.stock}`);
    } else {
        ok('37. blocked routes affect delivery before recovery');
    }
}

// 38. Recovery still runs after processing and flow
{
    const forge = parseCommerceForge({
        ...baseForge,
        markets: [
            { locationId: 'town', commodityIds: ['wheat', 'ore', 'metal', 'sakuradite'], targetStock: 10 },
            baseForge.markets[1],
        ],
        resourceFlows: {
            nodes: [
                { id: 'town_node', kind: 'settlement', label: 'Town', marketLocationId: 'town' },
            ],
            productionSources: [],
            demands: [
                { id: 'd1', nodeId: 'town_node', commodityId: 'wheat', baseDemandPerTick: 5 },
            ],
            tradeRoutes: [],
        },
    });
    // open 10 = target; demand 5 → 5; recovery +2 → 7
    const tick = runLivingWorldTick({
        forge,
        markets: markets({ wheat: 10 }),
        registry: emptyRegistry,
        npcPositions: {},
        worldTurn: 1,
        commerceEnabled: true,
        agencyEnabled: false,
        economyProfile: 'normal',
    });
    if (!approx(tick.markets.town.wheat.stock, 7)) {
        fail(`38. recovery order: ${tick.markets.town.wheat.stock}`);
    } else {
        ok('38. recovery still runs after processing and flow');
    }
}

// 39. priceIndex remains outside operational Core authority
{
    const before = markets();
    const def = {
        nodes: nodes(),
        productionSources: [
            { id: 'ps1', nodeId: 'farm', commodityId: 'wheat', baseOutputPerTick: 5, condition: 0.5 },
        ],
        demands: [],
        tradeRoutes: [
            {
                id: 'r1', fromNodeId: 'farm', toNodeId: 'town_node', commodityId: 'wheat',
                capacityPerTick: 5, status: 'strained',
            },
        ],
    };
    const flow = computeEconomyFlowTick({
        definition: def,
        forge: baseForge,
        markets: before,
        operationalState: { sourceConditionById: { ps1: 0.2 } },
    });
    const applied = applyEconomyFlowMarketDeltas(before, flow.marketDeltas);
    if (applied.town.wheat.priceIndex !== 1.25
        || JSON.stringify(before.town.wheat.priceIndex) !== JSON.stringify(1.25)) {
        fail('39. priceIndex changed by operational path');
    } else {
        ok('39. priceIndex remains outside operational Core authority');
    }
}

// 40. Commerce disabled ignores operational state
{
    const forge = parseCommerceForge({
        ...baseForge,
        resourceFlows: {
            nodes: nodes(),
            productionSources: [
                { id: 'ps1', nodeId: 'farm', commodityId: 'wheat', baseOutputPerTick: 100 },
            ],
            demands: [],
            tradeRoutes: [],
        },
    });
    const m = markets();
    const tick = runLivingWorldTick({
        forge,
        markets: m,
        registry: emptyRegistry,
        npcPositions: {},
        worldTurn: 1,
        commerceEnabled: false,
        agencyEnabled: false,
        economyOperationalState: {
            sourcePotentialById: { ps1: 0 },
            routeStateById: { r1: { status: 'blocked' } },
        },
    });
    if (tick.economyFlow !== null || tick.economyProcessing !== null) {
        fail('40. commerce disabled should skip economy');
    } else if (JSON.stringify(tick.markets) !== JSON.stringify(m) && tick.markets !== m) {
        if (JSON.stringify(tick.markets) !== JSON.stringify(m)) {
            fail('40. markets changed while commerce disabled');
        } else {
            ok('40. commerce disabled ignores operational state');
        }
    } else {
        ok('40. commerce disabled ignores operational state');
    }
}

// 41. Missing runtime state preserves authored defaults
{
    const forge = parseCommerceForge({
        ...baseForge,
        resourceFlows: {
            nodes: [
                { id: 'town_node', kind: 'settlement', label: 'Town', marketLocationId: 'town' },
            ],
            productionSources: [
                {
                    id: 'ps1', nodeId: 'town_node', commodityId: 'wheat', baseOutputPerTick: 10,
                    productivePotential: 0.5, condition: 1,
                },
            ],
            demands: [],
            tradeRoutes: [],
        },
    });
    const tick = runLivingWorldTick({
        forge,
        markets: markets({ wheat: 0 }),
        registry: emptyRegistry,
        npcPositions: {},
        worldTurn: 1,
        commerceEnabled: true,
        agencyEnabled: false,
    });
    const src = tick.economyFlow.productionSources[0];
    if (!src || !approx(src.effectiveOutput, 5) || !approx(src.productivePotential, 0.5)) {
        fail(`41. authored defaults: ${JSON.stringify(src)}`);
    } else {
        ok('41. missing runtime state preserves authored defaults');
    }
}

// 42. Missing authored and runtime state preserves Slice 003 behavior
{
    const def = {
        nodes: nodes(),
        productionSources: [
            { id: 'ps1', nodeId: 'farm', commodityId: 'wheat', baseOutputPerTick: 12 },
        ],
        demands: [],
        tradeRoutes: [
            {
                id: 'r1', fromNodeId: 'farm', toNodeId: 'town_node', commodityId: 'wheat',
                capacityPerTick: 12,
            },
        ],
    };
    const result = computeEconomyFlowTick({
        definition: def,
        forge: baseForge,
        markets: markets(),
    });
    const r = result.routes[0];
    const src = result.productionSources[0];
    if (!src || !approx(src.effectiveOutput, 12) || !approx(src.productivePotential, 1)
        || !approx(src.condition, 1)) {
        fail(`42. source: ${JSON.stringify(src)}`);
    } else if (!r || r.status !== 'open' || !approx(r.capacity, 12) || !approx(r.volume, 12)
        || !approx(r.baseCapacity, 12) || !approx(r.risk, 0)) {
        fail(`42. route: ${JSON.stringify(r)}`);
    } else {
        ok('42. missing authored and runtime state preserves Slice 003 behavior');
    }
}

// Flow core unknown operational ids diagnostic
{
    const result = computeEconomyFlowTick({
        definition: {
            nodes: nodes(),
            productionSources: [
                { id: 'ps1', nodeId: 'farm', commodityId: 'wheat', baseOutputPerTick: 1 },
            ],
            demands: [],
            tradeRoutes: [],
        },
        forge: baseForge,
        markets: markets(),
        operationalState: {
            sourcePotentialById: { unknown_src: 0.5 },
            routeStateById: { unknown_route: { status: 'blocked' } },
        },
    });
    const codes = result.diagnostics.map((d) => d.code);
    if (!codes.includes('unknown_source_id') || !codes.includes('unknown_route_id')) {
        fail(`unknown id diags: ${codes.join(',')}`);
    } else {
        ok('unknown operational ids produce diagnostics');
    }
}

if (failed > 0) {
    console.error(`\n${failed} failure(s)`);
    process.exit(1);
}
console.log('\nAll economy operational core tests passed.');
process.exit(0);
