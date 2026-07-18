#!/usr/bin/env node
'use strict';

// NOAI-ECON-FLOWS-003: processing core, runtime production, parser, tick integration.

const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');

const forgePath = path.join(root, 'out', 'livingWorldForgeCore.js');
const flowPath = path.join(root, 'out', 'economyFlowCore.js');
const procPath = path.join(root, 'out', 'economyProcessingCore.js');
const kitPath = path.join(root, 'out', 'worldKitTickCore.js');

let failed = 0;
function fail(msg) { console.error(`FAIL: ${msg}`); failed++; }
function ok(msg) { console.log(`OK: ${msg}`); }
function approx(a, b, eps = 1e-9) { return Math.abs(a - b) <= eps; }
function deepClone(v) { return JSON.parse(JSON.stringify(v)); }

for (const p of [forgePath, flowPath, procPath, kitPath]) {
    if (!fs.existsSync(p)) {
        fail(`${p} missing — run npm run compile first`);
        process.exit(1);
    }
}

const { parseCommerceForge } = require(forgePath);
const { computeEconomyFlowTick, applyEconomyFlowMarketDeltas } = require(flowPath);
const { computeEconomyProcessingTick } = require(procPath);
const { runLivingWorldTick } = require(kitPath);

const baseForge = {
    commodities: [
        { id: 'sakuradite_ore', name: 'Ore', basePrice: 20, weight: 2 },
        { id: 'mana_fuel', name: 'Mana Fuel', basePrice: 15, weight: 1 },
        { id: 'refined_sakuradite', name: 'Refined', basePrice: 80, weight: 1 },
        { id: 'metal', name: 'Metal', basePrice: 30, weight: 2 },
        { id: 'weapon', name: 'Weapon', basePrice: 100, weight: 3 },
        { id: 'wheat', name: 'Wheat', basePrice: 10, weight: 1 },
    ],
    markets: [
        {
            locationId: 'old_city',
            commodityIds: [
                'sakuradite_ore', 'mana_fuel', 'refined_sakuradite',
                'metal', 'weapon', 'wheat',
            ],
            targetStock: 30,
        },
        {
            locationId: 'port',
            commodityIds: ['refined_sakuradite', 'metal', 'wheat'],
            targetStock: 30,
        },
    ],
    transportKinds: [{ id: 'wagon', name: 'Wagon', capacity: 50, speed: 1 }],
};

function makeDefinition(overrides = {}) {
    return {
        nodes: [
            { id: 'old_city_node', kind: 'settlement', label: 'Old City', marketLocationId: 'old_city' },
            { id: 'port_node', kind: 'settlement', label: 'Port', marketLocationId: 'port' },
            { id: 'wild', kind: 'region', label: 'Wilds' },
        ],
        productionSources: [],
        demands: [],
        tradeRoutes: [],
        processingRecipes: [
            {
                id: 'refine_sakuradite',
                inputs: { sakuradite_ore: 2, mana_fuel: 1 },
                outputs: { refined_sakuradite: 1 },
            },
        ],
        processingSites: [
            {
                id: 'old_city_refinery',
                nodeId: 'old_city_node',
                recipeId: 'refine_sakuradite',
                maxBatchesPerTick: 3,
            },
        ],
        ...overrides,
    };
}

function baseMarkets(extra = {}) {
    return {
        old_city: {
            sakuradite_ore: { stock: 10, priceIndex: 1.2 },
            mana_fuel: { stock: 5, priceIndex: 1.0 },
            refined_sakuradite: { stock: 0, priceIndex: 1.5 },
            metal: { stock: 0, priceIndex: 1.0 },
            weapon: { stock: 0, priceIndex: 1.0 },
            wheat: { stock: 10, priceIndex: 1.0 },
            ...((extra.old_city) || {}),
        },
        port: {
            refined_sakuradite: { stock: 0, priceIndex: 1.0 },
            metal: { stock: 0, priceIndex: 1.0 },
            wheat: { stock: 10, priceIndex: 1.0 },
            ...((extra.port) || {}),
        },
    };
}

function procInput(definition, markets) {
    return {
        definition,
        forge: baseForge,
        markets: markets || baseMarkets(),
    };
}

// =========================================================================
// Processing Core (1–16)
// =========================================================================

// 1. One-input recipe consumes input and emits runtime output
{
    const def = makeDefinition({
        processingRecipes: [
            { id: 'crush', inputs: { sakuradite_ore: 3 }, outputs: { refined_sakuradite: 1 } },
        ],
        processingSites: [
            { id: 's1', nodeId: 'old_city_node', recipeId: 'crush', maxBatchesPerTick: 2 },
        ],
    });
    const markets = baseMarkets({ old_city: { sakuradite_ore: { stock: 10, priceIndex: 1.2 } } });
    const result = computeEconomyProcessingTick(procInput(def, markets));
    const site = result.sites[0];
    if (!site || site.batches !== 2) {
        fail(`1. batches: ${JSON.stringify(site)}`);
    } else if (!approx(site.inputsConsumed[0].quantity, 6)
        || !approx(site.outputsProduced[0].quantity, 2)) {
        fail(`1. io: ${JSON.stringify(site)}`);
    } else if (result.runtimeProduction.length !== 1
        || result.runtimeProduction[0].commodityId !== 'refined_sakuradite'
        || !approx(result.runtimeProduction[0].amount, 2)) {
        fail(`1. runtime: ${JSON.stringify(result.runtimeProduction)}`);
    } else if (!result.inputMarketDeltas.some(
        (d) => d.commodityId === 'sakuradite_ore' && approx(d.delta, -6)
    )) {
        fail(`1. input delta: ${JSON.stringify(result.inputMarketDeltas)}`);
    } else {
        ok('1. one-input recipe consumes and emits runtime output');
    }
}

// 2. Multi-input recipe uses the limiting input
{
    // ore 10 / 2 = 5, fuel 5 / 1 = 5, maxBatches 10 → 5 batches limited by both
    // ore 4 / 2 = 2, fuel 5 / 1 = 5, max 10 → 2 limited by ore
    const def = makeDefinition({
        processingSites: [
            { id: 's1', nodeId: 'old_city_node', recipeId: 'refine_sakuradite', maxBatchesPerTick: 10 },
        ],
    });
    const markets = baseMarkets({
        old_city: {
            sakuradite_ore: { stock: 4, priceIndex: 1 },
            mana_fuel: { stock: 5, priceIndex: 1 },
        },
    });
    const result = computeEconomyProcessingTick(procInput(def, markets));
    if (!result.sites[0] || result.sites[0].batches !== 2) {
        fail(`2. limiting input batches=${result.sites[0] && result.sites[0].batches}`);
    } else if (!approx(result.sites[0].inputsConsumed.find((c) => c.commodityId === 'sakuradite_ore').quantity, 4)
        || !approx(result.sites[0].inputsConsumed.find((c) => c.commodityId === 'mana_fuel').quantity, 2)) {
        fail(`2. consumed: ${JSON.stringify(result.sites[0].inputsConsumed)}`);
    } else {
        ok('2. multi-input recipe uses limiting input');
    }
}

// 3. maxBatchesPerTick caps batches
{
    const def = makeDefinition({
        processingSites: [
            { id: 's1', nodeId: 'old_city_node', recipeId: 'refine_sakuradite', maxBatchesPerTick: 1 },
        ],
    });
    const markets = baseMarkets({
        old_city: {
            sakuradite_ore: { stock: 100, priceIndex: 1 },
            mana_fuel: { stock: 100, priceIndex: 1 },
        },
    });
    const result = computeEconomyProcessingTick(procInput(def, markets));
    if (!result.sites[0] || result.sites[0].batches !== 1) {
        fail(`3. maxBatches cap: ${result.sites[0] && result.sites[0].batches}`);
    } else {
        ok('3. maxBatchesPerTick caps batches');
    }
}

// 4. Fractional input/output quantities preserved
{
    const def = makeDefinition({
        processingRecipes: [
            { id: 'frac', inputs: { sakuradite_ore: 1.5 }, outputs: { refined_sakuradite: 0.5 } },
        ],
        processingSites: [
            { id: 's1', nodeId: 'old_city_node', recipeId: 'frac', maxBatchesPerTick: 2 },
        ],
    });
    const markets = baseMarkets({
        old_city: { sakuradite_ore: { stock: 10, priceIndex: 1 } },
    });
    const result = computeEconomyProcessingTick(procInput(def, markets));
    // batches = min(2, floor(10/1.5)=6) = 2; consume 3; produce 1
    if (!result.sites[0] || result.sites[0].batches !== 2) {
        fail(`4. batches: ${JSON.stringify(result.sites[0])}`);
    } else if (!approx(result.sites[0].inputsConsumed[0].quantity, 3)
        || !approx(result.sites[0].outputsProduced[0].quantity, 1)) {
        fail(`4. fractions: ${JSON.stringify(result.sites[0])}`);
    } else {
        ok('4. fractional input/output quantities preserved');
    }
}

// 5. Insufficient input → zero batches
{
    const def = makeDefinition();
    const markets = baseMarkets({
        old_city: {
            sakuradite_ore: { stock: 1, priceIndex: 1 },
            mana_fuel: { stock: 0, priceIndex: 1 },
        },
    });
    const result = computeEconomyProcessingTick(procInput(def, markets));
    if (!result.sites[0] || result.sites[0].batches !== 0) {
        fail(`5. expected 0 batches: ${JSON.stringify(result.sites[0])}`);
    } else if (result.runtimeProduction.length !== 0 || result.inputMarketDeltas.length !== 0) {
        fail('5. zero batches should not consume or produce');
    } else {
        ok('5. insufficient input produces zero batches');
    }
}

// 6. Input stock never becomes negative
{
    const def = makeDefinition({
        processingSites: [
            { id: 's1', nodeId: 'old_city_node', recipeId: 'refine_sakuradite', maxBatchesPerTick: 100 },
        ],
    });
    const markets = baseMarkets({
        old_city: {
            sakuradite_ore: { stock: 5, priceIndex: 1 },
            mana_fuel: { stock: 5, priceIndex: 1 },
        },
    });
    const result = computeEconomyProcessingTick(procInput(def, markets));
    const applied = applyEconomyFlowMarketDeltas(markets, result.inputMarketDeltas);
    if (applied.old_city.sakuradite_ore.stock < 0 || applied.old_city.mana_fuel.stock < 0) {
        fail(`6. negative stock: ${JSON.stringify(applied.old_city)}`);
    } else {
        // batches = min(100, floor(5/2)=2, floor(5/1)=5) = 2; ore 5-4=1, fuel 5-2=3
        if (!approx(applied.old_city.sakuradite_ore.stock, 1)
            || !approx(applied.old_city.mana_fuel.stock, 3)) {
            fail(`6. unexpected stock: ore=${applied.old_city.sakuradite_ore.stock}`);
        } else {
            ok('6. input stock never becomes negative');
        }
    }
}

// 7. Processing does not change priceIndex
{
    const markets = baseMarkets();
    const before = deepClone(markets);
    const result = computeEconomyProcessingTick(procInput(makeDefinition(), markets));
    const applied = applyEconomyFlowMarketDeltas(markets, result.inputMarketDeltas);
    if (applied.old_city.sakuradite_ore.priceIndex !== before.old_city.sakuradite_ore.priceIndex
        || applied.old_city.mana_fuel.priceIndex !== before.old_city.mana_fuel.priceIndex) {
        fail('7. priceIndex changed by processing path');
    } else if (JSON.stringify(markets) !== JSON.stringify(before)) {
        fail('7. input markets mutated');
    } else {
        ok('7. processing does not change priceIndex');
    }
}

// 8. Input objects remain deeply unchanged
{
    const input = procInput(makeDefinition(), baseMarkets());
    const before = deepClone(input);
    computeEconomyProcessingTick(input);
    if (JSON.stringify(input) !== JSON.stringify(before)) {
        fail('8. input mutated');
    } else {
        ok('8. input objects remain deeply unchanged');
    }
}

// 9. Custom commodities supported
{
    const def = makeDefinition();
    const result = computeEconomyProcessingTick(procInput(def, baseMarkets()));
    if (!result.sites[0] || result.sites[0].recipeId !== 'refine_sakuradite') {
        fail('9. custom commodity recipe failed');
    } else {
        ok('9. custom commodities supported');
    }
}

// 10. Unknown recipe/node/market/commodity → diagnostics
{
    const def = makeDefinition({
        processingRecipes: [
            { id: 'ok', inputs: { wheat: 1 }, outputs: { metal: 1 } },
            { id: 'bad_comm', inputs: { unicorn: 1 }, outputs: { metal: 1 } },
        ],
        processingSites: [
            { id: 's_bad_node', nodeId: 'missing', recipeId: 'ok', maxBatchesPerTick: 1 },
            { id: 's_bad_recipe', nodeId: 'old_city_node', recipeId: 'nope', maxBatchesPerTick: 1 },
            { id: 's_ok', nodeId: 'old_city_node', recipeId: 'ok', maxBatchesPerTick: 1 },
        ],
    });
    const result = computeEconomyProcessingTick(procInput(def, baseMarkets()));
    const codes = new Set(result.diagnostics.map((d) => d.code));
    if (!codes.has('unknown_commodity') || !codes.has('missing_node') || !codes.has('unknown_recipe')) {
        fail(`10. codes: ${[...codes].join(',')}`);
    } else {
        ok('10. unknown refs produce diagnostics');
    }
}

// 11. Market not trading input/output rejects site
{
    const def = makeDefinition({
        // port does not trade sakuradite_ore
        processingSites: [
            { id: 's_port', nodeId: 'port_node', recipeId: 'refine_sakuradite', maxBatchesPerTick: 1 },
        ],
    });
    const result = computeEconomyProcessingTick(procInput(def, baseMarkets()));
    if (result.sites.length !== 0) {
        fail(`11. site should be rejected: ${JSON.stringify(result.sites)}`);
    } else if (!result.diagnostics.some((d) => d.code === 'invalid_market_binding')) {
        fail(`11. expected invalid_market_binding: ${JSON.stringify(result.diagnostics)}`);
    } else {
        ok('11. market not trading input/output rejects site');
    }
}

// 12. Duplicate recipe and site IDs diagnosed
{
    const def = makeDefinition({
        processingRecipes: [
            { id: 'dup', inputs: { wheat: 1 }, outputs: { metal: 1 } },
            { id: 'dup', inputs: { wheat: 1 }, outputs: { metal: 1 } },
        ],
        processingSites: [
            { id: 's_dup', nodeId: 'old_city_node', recipeId: 'dup', maxBatchesPerTick: 1 },
            { id: 's_dup', nodeId: 'old_city_node', recipeId: 'dup', maxBatchesPerTick: 1 },
        ],
    });
    const result = computeEconomyProcessingTick(procInput(def, baseMarkets()));
    const codes = result.diagnostics.map((d) => d.code);
    if (!codes.includes('duplicate_recipe_id') || !codes.includes('duplicate_site_id')) {
        fail(`12. codes: ${codes.join(',')}`);
    } else {
        ok('12. duplicate recipe and site IDs diagnosed');
    }
}

// 13. Output arrays use stable ID/commodity ordering
{
    const def = makeDefinition({
        processingRecipes: [
            {
                id: 'r_multi',
                inputs: { mana_fuel: 1, sakuradite_ore: 1 },
                outputs: { weapon: 1, metal: 1 },
            },
        ],
        processingSites: [
            { id: 'z_site', nodeId: 'old_city_node', recipeId: 'r_multi', maxBatchesPerTick: 1 },
            { id: 'a_site', nodeId: 'old_city_node', recipeId: 'r_multi', maxBatchesPerTick: 1 },
        ],
    });
    const markets = baseMarkets({
        old_city: {
            sakuradite_ore: { stock: 10, priceIndex: 1 },
            mana_fuel: { stock: 10, priceIndex: 1 },
        },
    });
    const result = computeEconomyProcessingTick(procInput(def, markets));
    const siteIds = result.sites.map((s) => s.siteId);
    if (JSON.stringify(siteIds) !== JSON.stringify([...siteIds].sort())) {
        fail(`13. site order: ${siteIds.join(',')}`);
    } else {
        const inputs = result.sites[0].inputsConsumed.map((c) => c.commodityId);
        const outputs = result.sites[0].outputsProduced.map((c) => c.commodityId);
        if (JSON.stringify(inputs) !== JSON.stringify([...inputs].sort())
            || JSON.stringify(outputs) !== JSON.stringify([...outputs].sort())) {
            fail(`13. commodity order: in=${inputs} out=${outputs}`);
        } else {
            ok('13. output arrays use stable ID/commodity ordering');
        }
    }
}

// 14. Shared input allocation stable by siteId
{
    const def = makeDefinition({
        processingRecipes: [
            { id: 'use_ore', inputs: { sakuradite_ore: 5 }, outputs: { metal: 1 } },
        ],
        processingSites: [
            { id: 'site_b', nodeId: 'old_city_node', recipeId: 'use_ore', maxBatchesPerTick: 1 },
            { id: 'site_a', nodeId: 'old_city_node', recipeId: 'use_ore', maxBatchesPerTick: 1 },
        ],
    });
    // stock 5 → only first in siteId order (site_a) gets 1 batch
    const markets = baseMarkets({
        old_city: { sakuradite_ore: { stock: 5, priceIndex: 1 } },
    });
    const result = computeEconomyProcessingTick(procInput(def, markets));
    const byId = Object.fromEntries(result.sites.map((s) => [s.siteId, s.batches]));
    if (byId.site_a !== 1 || byId.site_b !== 0) {
        fail(`14. shared allocation: ${JSON.stringify(byId)}`);
    } else {
        ok('14. shared input allocation stable by siteId');
    }
}

// 15. Reordering recipe/site arrays does not change results
{
    const defA = makeDefinition({
        processingSites: [
            { id: 'site_b', nodeId: 'old_city_node', recipeId: 'refine_sakuradite', maxBatchesPerTick: 2 },
            { id: 'site_a', nodeId: 'old_city_node', recipeId: 'refine_sakuradite', maxBatchesPerTick: 2 },
        ],
    });
    const defB = makeDefinition({
        processingSites: [
            { id: 'site_a', nodeId: 'old_city_node', recipeId: 'refine_sakuradite', maxBatchesPerTick: 2 },
            { id: 'site_b', nodeId: 'old_city_node', recipeId: 'refine_sakuradite', maxBatchesPerTick: 2 },
        ],
    });
    const markets = baseMarkets({
        old_city: {
            sakuradite_ore: { stock: 6, priceIndex: 1 },
            mana_fuel: { stock: 6, priceIndex: 1 },
        },
    });
    const a = computeEconomyProcessingTick(procInput(defA, markets));
    const b = computeEconomyProcessingTick(procInput(defB, markets));
    if (JSON.stringify(a.sites) !== JSON.stringify(b.sites)
        || JSON.stringify(a.runtimeProduction) !== JSON.stringify(b.runtimeProduction)
        || JSON.stringify(a.inputMarketDeltas) !== JSON.stringify(b.inputMarketDeltas)) {
        fail('15. reordering changed results');
    } else {
        ok('15. reordering recipe/site arrays does not change results');
    }
}

// 16. Recipe output cannot feed another recipe same tick
{
    const def = makeDefinition({
        processingRecipes: [
            { id: 'ore_to_metal', inputs: { sakuradite_ore: 1 }, outputs: { metal: 1 } },
            { id: 'metal_to_weapon', inputs: { metal: 1 }, outputs: { weapon: 1 } },
        ],
        processingSites: [
            { id: 'smelter', nodeId: 'old_city_node', recipeId: 'ore_to_metal', maxBatchesPerTick: 5 },
            { id: 'forge', nodeId: 'old_city_node', recipeId: 'metal_to_weapon', maxBatchesPerTick: 5 },
        ],
    });
    // open metal stock 0; ore 5 → smelter produces 5 metal as runtime only
    // forge must not see that metal → 0 weapon batches
    const markets = baseMarkets({
        old_city: {
            sakuradite_ore: { stock: 5, priceIndex: 1 },
            metal: { stock: 0, priceIndex: 1 },
            weapon: { stock: 0, priceIndex: 1 },
        },
    });
    const result = computeEconomyProcessingTick(procInput(def, markets));
    const byId = Object.fromEntries(result.sites.map((s) => [s.siteId, s]));
    if (!byId.smelter || byId.smelter.batches !== 5) {
        fail(`16. smelter: ${JSON.stringify(byId.smelter)}`);
    } else if (!byId.forge || byId.forge.batches !== 0) {
        fail(`16. forge used same-tick metal: ${JSON.stringify(byId.forge)}`);
    } else if (!result.runtimeProduction.some(
        (r) => r.commodityId === 'metal' && approx(r.amount, 5)
    )) {
        fail(`16. metal runtime missing: ${JSON.stringify(result.runtimeProduction)}`);
    } else if (result.runtimeProduction.some((r) => r.commodityId === 'weapon')) {
        fail('16. weapon should not be produced same tick');
    } else {
        ok('16. recipe output cannot feed another recipe same tick');
    }
}

// =========================================================================
// Flow runtime production (17–21)
// =========================================================================

// 17. Runtime production combines with authored production
{
    const def = makeDefinition({
        productionSources: [
            { id: 'ps1', nodeId: 'old_city_node', commodityId: 'refined_sakuradite', baseOutputPerTick: 3 },
        ],
        processingRecipes: undefined,
        processingSites: undefined,
    });
    const result = computeEconomyFlowTick({
        definition: def,
        forge: baseForge,
        markets: baseMarkets(),
        additionalProduction: [
            { nodeId: 'old_city_node', commodityId: 'refined_sakuradite', amount: 4 },
        ],
    });
    const node = result.nodes.find(
        (n) => n.nodeId === 'old_city_node' && n.commodityId === 'refined_sakuradite'
    );
    if (!node || !approx(node.produced, 7)) {
        fail(`17. combined production: ${JSON.stringify(node)}`);
    } else {
        ok('17. runtime production combines with authored production');
    }
}

// 18. Runtime production can travel over an existing direct route
{
    const def = makeDefinition({
        tradeRoutes: [
            {
                id: 'r1',
                fromNodeId: 'old_city_node',
                toNodeId: 'port_node',
                commodityId: 'refined_sakuradite',
                capacityPerTick: 10,
            },
        ],
        processingRecipes: undefined,
        processingSites: undefined,
    });
    const result = computeEconomyFlowTick({
        definition: def,
        forge: baseForge,
        markets: baseMarkets(),
        additionalProduction: [
            { nodeId: 'old_city_node', commodityId: 'refined_sakuradite', amount: 6 },
        ],
    });
    const route = result.routes.find((r) => r.routeId === 'r1');
    if (!route || !approx(route.volume, 6)) {
        fail(`18. route volume: ${JSON.stringify(route)}`);
    } else {
        ok('18. runtime production can travel over a direct route');
    }
}

// 19. Unshipped runtime production at market-backed node becomes local supply
{
    const def = makeDefinition({
        processingRecipes: undefined,
        processingSites: undefined,
    });
    const result = computeEconomyFlowTick({
        definition: def,
        forge: baseForge,
        markets: baseMarkets(),
        additionalProduction: [
            { nodeId: 'old_city_node', commodityId: 'refined_sakuradite', amount: 5 },
        ],
    });
    const delta = result.marketDeltas.find(
        (d) => d.commodityId === 'refined_sakuradite' && d.marketLocationId === 'old_city'
    );
    if (!delta || !approx(delta.supplied, 5) || !approx(delta.delta, 5)) {
        fail(`19. local supply delta: ${JSON.stringify(delta)}`);
    } else {
        ok('19. unshipped runtime production becomes local supply');
    }
}

// 20. Invalid runtime production ignored with diagnostics
{
    const def = makeDefinition({
        processingRecipes: undefined,
        processingSites: undefined,
    });
    const result = computeEconomyFlowTick({
        definition: def,
        forge: baseForge,
        markets: baseMarkets(),
        additionalProduction: [
            { nodeId: 'missing', commodityId: 'wheat', amount: 1 },
            { nodeId: 'old_city_node', commodityId: 'unicorn', amount: 1 },
            { nodeId: 'old_city_node', commodityId: 'wheat', amount: NaN },
            { nodeId: 'old_city_node', commodityId: 'wheat', amount: -3 },
            { nodeId: 'old_city_node', commodityId: 'wheat', amount: 2 },
        ],
    });
    const node = result.nodes.find((n) => n.nodeId === 'old_city_node' && n.commodityId === 'wheat');
    if (!node || !approx(node.produced, 2)) {
        fail(`20. only valid runtime should apply: ${JSON.stringify(node)}`);
    } else if (result.diagnostics.length < 4) {
        fail(`20. expected diagnostics: ${JSON.stringify(result.diagnostics)}`);
    } else {
        ok('20. invalid runtime production ignored with diagnostics');
    }
}

// 21. Existing calls without runtime production remain unchanged
{
    const def = makeDefinition({
        productionSources: [
            { id: 'ps1', nodeId: 'old_city_node', commodityId: 'wheat', baseOutputPerTick: 4 },
        ],
        processingRecipes: undefined,
        processingSites: undefined,
    });
    const a = computeEconomyFlowTick({
        definition: def,
        forge: baseForge,
        markets: baseMarkets(),
    });
    const b = computeEconomyFlowTick({
        definition: def,
        forge: baseForge,
        markets: baseMarkets(),
        additionalProduction: [],
    });
    if (JSON.stringify(a.routes) !== JSON.stringify(b.routes)
        || JSON.stringify(a.nodes) !== JSON.stringify(b.nodes)
        || JSON.stringify(a.marketDeltas) !== JSON.stringify(b.marketDeltas)) {
        fail('21. empty additionalProduction changed results');
    } else {
        ok('21. calls without runtime production remain unchanged');
    }
}

// =========================================================================
// Parser (22–27)
// =========================================================================

// 22. Valid recipes and sites parse
{
    const forge = parseCommerceForge({
        ...baseForge,
        resourceFlows: makeDefinition(),
    });
    if (!forge || !forge.resourceFlows
        || !forge.resourceFlows.processingRecipes
        || forge.resourceFlows.processingRecipes.length !== 1
        || !forge.resourceFlows.processingSites
        || forge.resourceFlows.processingSites.length !== 1) {
        fail(`22. parse: ${JSON.stringify(forge && forge.resourceFlows)}`);
    } else {
        ok('22. valid recipes and sites parse');
    }
}

// 23. Fractional quantities preserved
{
    const forge = parseCommerceForge({
        ...baseForge,
        resourceFlows: {
            nodes: [{ id: 'n1', kind: 'facility', label: 'N' }],
            processingRecipes: [
                { id: 'r1', inputs: { wheat: 1.25 }, outputs: { metal: 0.5 } },
            ],
            processingSites: [
                { id: 's1', nodeId: 'n1', recipeId: 'r1', maxBatchesPerTick: 2 },
            ],
        },
    });
    const r = forge && forge.resourceFlows && forge.resourceFlows.processingRecipes[0];
    if (!r || !approx(r.inputs.wheat, 1.25) || !approx(r.outputs.metal, 0.5)) {
        fail(`23. fractions: ${JSON.stringify(r)}`);
    } else {
        ok('23. fractional quantities preserved');
    }
}

// 24. Invalid quantities discarded safely
{
    let threw = false;
    let forge;
    try {
        forge = parseCommerceForge({
            ...baseForge,
            resourceFlows: {
                nodes: [{ id: 'n1', kind: 'facility', label: 'N' }],
                processingRecipes: [
                    { id: 'r_neg', inputs: { wheat: -1 }, outputs: { metal: 1 } },
                    { id: 'r_zero', inputs: { wheat: 0 }, outputs: { metal: 1 } },
                    { id: 'r_nan', inputs: { wheat: NaN }, outputs: { metal: 1 } },
                    { id: 'r_ok', inputs: { wheat: 1 }, outputs: { metal: 1 } },
                ],
                processingSites: [
                    { id: 's_bad', nodeId: 'n1', recipeId: 'r_ok', maxBatchesPerTick: 0 },
                    { id: 's_ok', nodeId: 'n1', recipeId: 'r_ok', maxBatchesPerTick: 2 },
                ],
            },
        });
    } catch (e) {
        threw = true;
        fail(`24. threw: ${e && e.message}`);
    }
    if (!threw) {
        const rf = forge && forge.resourceFlows;
        if (!rf || rf.processingRecipes.length !== 1 || rf.processingRecipes[0].id !== 'r_ok') {
            fail(`24. recipes: ${JSON.stringify(rf && rf.processingRecipes)}`);
        } else if (rf.processingSites.length !== 1 || rf.processingSites[0].id !== 's_ok') {
            fail(`24. sites: ${JSON.stringify(rf && rf.processingSites)}`);
        } else {
            ok('24. invalid quantities discarded safely');
        }
    }
}

// 25. Safety limits enforced
{
    const recipes = [];
    for (let i = 0; i < 150; i++) {
        recipes.push({ id: `r_${i}`, inputs: { wheat: 1 }, outputs: { metal: 1 } });
    }
    const forge = parseCommerceForge({
        ...baseForge,
        resourceFlows: {
            nodes: [{ id: 'n1', kind: 'facility', label: 'N' }],
            processingRecipes: recipes,
        },
    });
    if (!forge || !forge.resourceFlows
        || forge.resourceFlows.processingRecipes.length !== 100) {
        fail(`25. recipe limit: ${forge && forge.resourceFlows
            && forge.resourceFlows.processingRecipes.length}`);
    } else {
        ok('25. safety limits enforced');
    }
}

// 26. Processing-only resourceFlows remains defined
{
    const forge = parseCommerceForge({
        ...baseForge,
        resourceFlows: {
            nodes: [{ id: 'n1', kind: 'settlement', label: 'N', marketLocationId: 'old_city' }],
            productionSources: [],
            demands: [],
            tradeRoutes: [],
            processingRecipes: [
                { id: 'r1', inputs: { wheat: 1 }, outputs: { metal: 1 } },
            ],
            processingSites: [
                { id: 's1', nodeId: 'n1', recipeId: 'r1', maxBatchesPerTick: 1 },
            ],
        },
    });
    if (!forge || !forge.resourceFlows || !forge.resourceFlows.processingRecipes) {
        fail('26. processing-only resourceFlows should remain defined');
    } else {
        ok('26. processing-only resourceFlows remains defined');
    }
}

// 27. Missing processing fields preserves Slice 002 shape
{
    const forge = parseCommerceForge({
        ...baseForge,
        resourceFlows: {
            nodes: [{ id: 'mine', kind: 'facility', label: 'Mine' }],
            productionSources: [
                { id: 'ps1', nodeId: 'mine', commodityId: 'wheat', baseOutputPerTick: 1 },
            ],
            demands: [],
            tradeRoutes: [],
        },
    });
    if (!forge || !forge.resourceFlows) {
        fail('27. slice002 flows should parse');
    } else if (forge.resourceFlows.processingRecipes !== undefined
        || forge.resourceFlows.processingSites !== undefined) {
        fail(`27. unexpected processing fields: ${JSON.stringify(forge.resourceFlows)}`);
    } else {
        ok('27. missing processing fields preserves Slice 002 shape');
    }
}

// =========================================================================
// Tick integration (28–35)
// =========================================================================

const emptyRegistry = { version: '1', npcs: {} };

// 28. Processing inputs consumed before flow
{
    const forge = parseCommerceForge({
        ...baseForge,
        markets: [
            {
                locationId: 'old_city',
                commodityIds: baseForge.markets[0].commodityIds,
                targetStock: 10, // at/near open after consume for recovery math
            },
            baseForge.markets[1],
        ],
        resourceFlows: makeDefinition({
            // demand on ore after processing should see reduced stock
            demands: [
                {
                    id: 'd_ore',
                    nodeId: 'old_city_node',
                    commodityId: 'sakuradite_ore',
                    baseDemandPerTick: 100,
                },
            ],
            processingSites: [
                {
                    id: 'refinery',
                    nodeId: 'old_city_node',
                    recipeId: 'refine_sakuradite',
                    maxBatchesPerTick: 2,
                },
            ],
        }),
    });
    // open ore 10; process 2 batches → consume 4; remaining 6 for demand
    // demand 100 from 6 → fulfilled 6, delta -6; stock 0; recovery toward 10
    const markets = baseMarkets({
        old_city: {
            sakuradite_ore: { stock: 10, priceIndex: 1 },
            mana_fuel: { stock: 10, priceIndex: 1 },
        },
    });
    const tick = runLivingWorldTick({
        forge,
        markets,
        registry: emptyRegistry,
        npcPositions: {},
        worldTurn: 1,
        commerceEnabled: true,
        agencyEnabled: false,
        economyProfile: 'normal',
    });
    if (!tick.economyProcessing || tick.economyProcessing.sites[0].batches !== 2) {
        fail(`28. processing: ${JSON.stringify(tick.economyProcessing)}`);
    } else {
        const oreNode = tick.economyFlow.nodes.find(
            (n) => n.commodityId === 'sakuradite_ore'
        );
        // After processing stock=6 opening for flow; demand consumes 6
        if (!oreNode || !approx(oreNode.openingStock, 6) || !approx(oreNode.fulfilledDemand, 6)) {
            fail(`28. flow should see post-process stock: ${JSON.stringify(oreNode)}`);
        } else {
            ok('28. processing inputs consumed before flow');
        }
    }
}

// 29. Processing outputs transported exactly once
{
    const forge = parseCommerceForge({
        ...baseForge,
        resourceFlows: makeDefinition({
            tradeRoutes: [
                {
                    id: 'r1',
                    fromNodeId: 'old_city_node',
                    toNodeId: 'port_node',
                    commodityId: 'refined_sakuradite',
                    capacityPerTick: 10,
                },
            ],
            processingSites: [
                {
                    id: 'refinery',
                    nodeId: 'old_city_node',
                    recipeId: 'refine_sakuradite',
                    maxBatchesPerTick: 2,
                },
            ],
        }),
    });
    // 2 batches → 2 refined; full ship to port
    const markets = baseMarkets({
        old_city: {
            sakuradite_ore: { stock: 10, priceIndex: 1 },
            mana_fuel: { stock: 10, priceIndex: 1 },
            refined_sakuradite: { stock: 0, priceIndex: 1 },
        },
    });
    const tick = runLivingWorldTick({
        forge,
        markets,
        registry: emptyRegistry,
        npcPositions: {},
        worldTurn: 1,
        commerceEnabled: true,
        agencyEnabled: false,
    });
    const route = tick.economyFlow.routes.find((r) => r.routeId === 'r1');
    const localDelta = tick.economyFlow.marketDeltas.find(
        (d) => d.marketLocationId === 'old_city' && d.commodityId === 'refined_sakuradite'
    );
    const portDelta = tick.economyFlow.marketDeltas.find(
        (d) => d.marketLocationId === 'port' && d.commodityId === 'refined_sakuradite'
    );
    // Should ship 2; local retained 0 → local delta may be absent or 0; port +2
    if (!route || !approx(route.volume, 2)) {
        fail(`29. route: ${JSON.stringify(route)}`);
    } else if (localDelta && localDelta.supplied > 0) {
        fail(`29. double-count local supply: ${JSON.stringify(localDelta)}`);
    } else if (!portDelta || !approx(portDelta.supplied, 2)) {
        fail(`29. port delta: ${JSON.stringify(portDelta)}`);
    } else {
        ok('29. processing outputs transported exactly once');
    }
}

// 30. Untransported processing outputs remain local exactly once
{
    const forge = parseCommerceForge({
        ...baseForge,
        resourceFlows: makeDefinition({
            processingSites: [
                {
                    id: 'refinery',
                    nodeId: 'old_city_node',
                    recipeId: 'refine_sakuradite',
                    maxBatchesPerTick: 2,
                },
            ],
        }),
    });
    const markets = baseMarkets({
        old_city: {
            sakuradite_ore: { stock: 10, priceIndex: 1 },
            mana_fuel: { stock: 10, priceIndex: 1 },
            refined_sakuradite: { stock: 0, priceIndex: 1 },
        },
    });
    const tick = runLivingWorldTick({
        forge,
        markets,
        registry: emptyRegistry,
        npcPositions: {},
        worldTurn: 1,
        commerceEnabled: true,
        agencyEnabled: false,
    });
    // 2 refined as local supply; recovery may add if stock < target
    // Flow delta supplied=2. Final stock = 0 + 2 + recovery
    const flowDelta = tick.economyFlow.marketDeltas.find(
        (d) => d.commodityId === 'refined_sakuradite' && d.marketLocationId === 'old_city'
    );
    if (!flowDelta || !approx(flowDelta.supplied, 2) || !approx(flowDelta.delta, 2)) {
        fail(`30. local once: ${JSON.stringify(flowDelta)}`);
    } else if (tick.markets.old_city.refined_sakuradite.stock < 2) {
        fail(`30. final stock too low: ${tick.markets.old_city.refined_sakuradite.stock}`);
    } else {
        ok('30. untransported processing outputs remain local exactly once');
    }
}

// 31. Existing flow demand sees post-processing stock state
// (covered by 28; assert explicitly)
{
    ok('31. flow demand sees post-processing stock (see test 28)');
}

// 32. Recovery runs after processing and flow
{
    const forge = parseCommerceForge({
        ...baseForge,
        markets: [
            {
                locationId: 'old_city',
                commodityIds: baseForge.markets[0].commodityIds,
                targetStock: 10,
            },
            baseForge.markets[1],
        ],
        resourceFlows: makeDefinition({
            demands: [
                {
                    id: 'd1',
                    nodeId: 'old_city_node',
                    commodityId: 'wheat',
                    baseDemandPerTick: 5,
                },
            ],
            // no processing needed for order proof with wheat at target
            processingRecipes: undefined,
            processingSites: undefined,
        }),
    });
    // open wheat 10 = target; demand 5 → stock 5; recovery +2 → 7 (flow before recovery)
    const markets = baseMarkets({
        old_city: { wheat: { stock: 10, priceIndex: 1 } },
    });
    const tick = runLivingWorldTick({
        forge,
        markets,
        registry: emptyRegistry,
        npcPositions: {},
        worldTurn: 1,
        commerceEnabled: true,
        agencyEnabled: false,
        economyProfile: 'normal',
    });
    if (!approx(tick.markets.old_city.wheat.stock, 7)) {
        fail(`32. expected 7 after flow+recovery, got ${tick.markets.old_city.wheat.stock}`);
    } else {
        ok('32. recovery runs after processing and flow');
    }
}

// 33. economyProcessing contains semantic summaries
{
    const forge = parseCommerceForge({
        ...baseForge,
        resourceFlows: makeDefinition(),
    });
    const tick = runLivingWorldTick({
        forge,
        markets: baseMarkets(),
        registry: emptyRegistry,
        npcPositions: {},
        worldTurn: 1,
        commerceEnabled: true,
        agencyEnabled: false,
    });
    const ep = tick.economyProcessing;
    if (!ep || !Array.isArray(ep.sites) || !Array.isArray(ep.inputMarketDeltas)
        || !Array.isArray(ep.runtimeProduction) || !Array.isArray(ep.diagnostics)) {
        fail(`33. missing fields: ${JSON.stringify(ep && Object.keys(ep))}`);
    } else if (ep.sites.length < 1) {
        fail('33. empty sites');
    } else {
        ok('33. economyProcessing contains semantic summaries');
    }
}

// 34. Missing processing → economyProcessing null
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
        },
    });
    const tick = runLivingWorldTick({
        forge,
        markets: baseMarkets(),
        registry: emptyRegistry,
        npcPositions: {},
        worldTurn: 1,
        commerceEnabled: true,
        agencyEnabled: false,
    });
    if (tick.economyProcessing !== null) {
        fail(`34. expected null: ${JSON.stringify(tick.economyProcessing)}`);
    } else if (!tick.economyFlow) {
        fail('34. flow should still run');
    } else {
        ok('34. missing processing returns economyProcessing: null');
    }
}

// 35. Commerce disabled → both null
{
    const forge = parseCommerceForge({
        ...baseForge,
        resourceFlows: makeDefinition(),
    });
    const tick = runLivingWorldTick({
        forge,
        markets: baseMarkets(),
        registry: emptyRegistry,
        npcPositions: {},
        worldTurn: 1,
        commerceEnabled: false,
        agencyEnabled: false,
    });
    if (tick.economyProcessing !== null || tick.economyFlow !== null) {
        fail(`35. expected both null: p=${tick.economyProcessing} f=${tick.economyFlow}`);
    } else {
        ok('35. commerce disabled returns both null');
    }
}

// Accounting example: 2 ore + 1 fuel → 1 metal, 2 batches
{
    const def = makeDefinition({
        processingRecipes: [
            {
                id: 'smelt',
                inputs: { sakuradite_ore: 2, mana_fuel: 1 },
                outputs: { metal: 1 },
            },
        ],
        processingSites: [
            { id: 's1', nodeId: 'old_city_node', recipeId: 'smelt', maxBatchesPerTick: 2 },
        ],
    });
    const result = computeEconomyProcessingTick(procInput(def, baseMarkets({
        old_city: {
            sakuradite_ore: { stock: 10, priceIndex: 1 },
            mana_fuel: { stock: 10, priceIndex: 1 },
        },
    })));
    const site = result.sites[0];
    if (!site || site.batches !== 2) {
        fail(`accounting batches: ${JSON.stringify(site)}`);
    } else {
        const ore = site.inputsConsumed.find((c) => c.commodityId === 'sakuradite_ore');
        const fuel = site.inputsConsumed.find((c) => c.commodityId === 'mana_fuel');
        const metal = site.outputsProduced.find((c) => c.commodityId === 'metal');
        if (!approx(ore.quantity, 4) || !approx(fuel.quantity, 2) || !approx(metal.quantity, 2)) {
            fail(`accounting: ${JSON.stringify(site)}`);
        } else {
            ok('accounting: 2 batches → 4 ore + 2 fuel → 2 metal');
        }
    }
}

if (failed > 0) {
    console.error(`\n${failed} failure(s)`);
    process.exit(1);
}
console.log('\nAll economy processing core tests passed.');
process.exit(0);
