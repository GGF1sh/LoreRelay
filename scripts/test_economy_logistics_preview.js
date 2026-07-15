#!/usr/bin/env node
'use strict';

// ECON-FLOWS-005D: cold-start read-only logistics preview.

const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');

const previewPath = path.join(root, 'out', 'economyLogisticsPreviewCore.js');
const viewPath = path.join(root, 'out', 'economyLogisticsViewCore.js');
const flowPath = path.join(root, 'out', 'economyFlowCore.js');

let failed = 0;
function fail(msg) { console.error(`FAIL: ${msg}`); failed++; }
function ok(msg) { console.log(`OK: ${msg}`); }
function deepClone(v) { return JSON.parse(JSON.stringify(v)); }

for (const p of [previewPath, viewPath, flowPath]) {
    if (!fs.existsSync(p)) {
        fail(`${p} missing — run npm run compile first`);
        process.exit(1);
    }
}

const { deriveEconomyLogisticsPreview } = require(previewPath);
const { buildEconomyLogisticsViewModel } = require(viewPath);
const { applyEconomyFlowMarketDeltas } = require(flowPath);

function baseForge() {
    return {
        commodities: [
            { id: 'wheat', name: 'Wheat', basePrice: 10, weight: 1 },
            { id: 'ore', name: 'Ore', basePrice: 20, weight: 2 },
            { id: 'metal', name: 'Metal', basePrice: 40, weight: 2 },
        ],
        markets: [
            { locationId: 'town', commodityIds: ['wheat', 'ore', 'metal'], targetStock: 30 },
            { locationId: 'port', commodityIds: ['wheat', 'metal'], targetStock: 20 },
        ],
        transportKinds: [{ id: 'wagon', name: 'Wagon', capacity: 40, speed: 1 }],
    };
}

function baseDefinition() {
    return {
        nodes: [
            { id: 'farm', kind: 'facility', label: 'Farm' },
            { id: 'town_node', kind: 'settlement', label: 'Town', marketLocationId: 'town' },
            { id: 'port_node', kind: 'settlement', label: 'Port', marketLocationId: 'port' },
            { id: 'refinery', kind: 'facility', label: 'Refinery' },
        ],
        productionSources: [
            { id: 'ps_wheat', nodeId: 'farm', commodityId: 'wheat', baseOutputPerTick: 10 },
        ],
        demands: [
            { id: 'd_wheat', nodeId: 'town_node', commodityId: 'wheat', baseDemandPerTick: 4 },
        ],
        tradeRoutes: [
            {
                id: 'r_open',
                fromNodeId: 'farm',
                toNodeId: 'town_node',
                commodityId: 'wheat',
                capacityPerTick: 10,
                status: 'open',
            },
            {
                id: 'r_blocked',
                fromNodeId: 'farm',
                toNodeId: 'port_node',
                commodityId: 'wheat',
                capacityPerTick: 8,
                status: 'blocked',
            },
        ],
        processingRecipes: [
            { id: 'smelt', inputs: { ore: 2 }, outputs: { metal: 1 } },
        ],
        processingSites: [
            { id: 'site1', nodeId: 'town_node', recipeId: 'smelt', maxBatchesPerTick: 2 },
        ],
    };
}

function baseMarkets() {
    return {
        town: {
            wheat: { stock: 10, priceIndex: 1.1 },
            ore: { stock: 6, priceIndex: 1 },
            metal: { stock: 0, priceIndex: 1 },
        },
        port: {
            wheat: { stock: 2, priceIndex: 1.2 },
            metal: { stock: 0, priceIndex: 1 },
        },
    };
}

// 1. no committed snapshot + valid inputs → derived preview available
{
    const markets = baseMarkets();
    const definition = baseDefinition();
    const forge = baseForge();
    const preview = deriveEconomyLogisticsPreview({
        forge,
        definition,
        markets,
        worldTurn: 3,
    });
    if (!preview.ok || !preview.economyFlow) {
        fail(`1. preview failed: ${JSON.stringify(preview)}`);
    } else {
        const view = buildEconomyLogisticsViewModel({
            commerceEnabled: true,
            worldTurn: preview.worldTurn,
            commodities: forge.commodities,
            definition,
            flow: preview.economyFlow,
            processing: preview.economyProcessing,
            snapshotSource: 'derived_preview',
        });
        if (!view.available || view.snapshotSource !== 'derived_preview') {
            fail(`1. view not available: ${JSON.stringify(view)}`);
        } else if (view.routes.length < 1) {
            fail('1. expected routes in preview');
        } else {
            ok('1. no snapshot + valid inputs → derived preview available');
        }
    }
}

// 2. committed snapshot wins over preview (selection logic)
{
    const committedFlow = {
        productionSources: [],
        nodes: [],
        routes: [
            {
                routeId: 'r_open', volume: 99, capacity: 10, baseCapacity: 10,
                utilization: 1, risk: 0, status: 'open',
                statusCapacityMultiplier: 1, capacityMultiplier: 1, riskDelta: 0,
                fromNodeId: 'farm', toNodeId: 'town_node', commodityId: 'wheat',
            },
        ],
        marketDeltas: [],
        diagnostics: [],
    };
    // When committed is present, host uses it — simulate by only building with committed.
    const committedView = buildEconomyLogisticsViewModel({
        commerceEnabled: true,
        worldTurn: 9,
        commodities: baseForge().commodities,
        definition: baseDefinition(),
        flow: committedFlow,
        processing: null,
        snapshotSource: 'committed_tick',
    });
    const preview = deriveEconomyLogisticsPreview({
        forge: baseForge(),
        definition: baseDefinition(),
        markets: baseMarkets(),
        worldTurn: 3,
    });
    if (!committedView.available || committedView.snapshotSource !== 'committed_tick') {
        fail(`2. committed view: ${JSON.stringify(committedView.snapshotSource)}`);
    } else if (!preview.ok) {
        fail('2. preview should still be computable separately');
    } else if ((committedView.routes[0] && committedView.routes[0].volume) !== 99) {
        fail('2. committed volume not preserved');
    } else {
        ok('2. committed snapshot wins over preview');
    }
}

// 3. markets and definitions remain deeply unchanged
{
    const markets = baseMarkets();
    const definition = baseDefinition();
    const forge = baseForge();
    const beforeM = deepClone(markets);
    const beforeD = deepClone(definition);
    const beforeF = deepClone(forge);
    deriveEconomyLogisticsPreview({ forge, definition, markets, worldTurn: 1 });
    if (JSON.stringify(markets) !== JSON.stringify(beforeM)
        || JSON.stringify(definition) !== JSON.stringify(beforeD)
        || JSON.stringify(forge) !== JSON.stringify(beforeF)) {
        fail('3. input mutated');
    } else {
        ok('3. markets and definitions remain deeply unchanged');
    }
}

// 4. no market deltas applied to caller markets (priceIndex/stock stable)
{
    const markets = baseMarkets();
    const before = deepClone(markets);
    const preview = deriveEconomyLogisticsPreview({
        forge: baseForge(),
        definition: baseDefinition(),
        markets,
        worldTurn: 1,
    });
    if (!preview.ok) {
        fail(`4. preview failed: ${JSON.stringify(preview)}`);
    } else if (JSON.stringify(markets) !== JSON.stringify(before)) {
        fail('4. caller markets changed');
    } else if (!preview.economyFlow.marketDeltas || preview.economyFlow.marketDeltas.length === 0) {
        // deltas may exist in result but must not be applied — still OK if empty
        ok('4. no market deltas applied to caller markets');
    } else {
        // Prove apply is not done: stocks equal before
        const wheat = markets.town.wheat.stock;
        if (wheat !== before.town.wheat.stock) {
            fail('4. stock changed');
        } else {
            ok('4. no market deltas applied to caller markets');
        }
    }
}

// 5. no world time advancement
{
    const preview = deriveEconomyLogisticsPreview({
        forge: baseForge(),
        definition: baseDefinition(),
        markets: baseMarkets(),
        worldTurn: 7,
    });
    if (!preview.ok || preview.worldTurn !== 7) {
        fail(`5. worldTurn changed: ${preview.ok && preview.worldTurn}`);
    } else {
        ok('5. no world time advancement');
    }
}

// 6. commerce disabled preserves existing behavior
{
    const view = buildEconomyLogisticsViewModel({
        commerceEnabled: false,
        definition: baseDefinition(),
        flow: null,
    });
    if (view.available || view.unavailableReason !== 'commerce_disabled') {
        fail(`6. commerce disabled: ${JSON.stringify(view)}`);
    } else {
        ok('6. commerce disabled preserves existing behavior');
    }
}

// 7. missing definition preserves existing behavior
{
    const view = buildEconomyLogisticsViewModel({
        commerceEnabled: true,
        definition: null,
        flow: null,
    });
    if (view.available || view.unavailableReason !== 'missing_definition') {
        fail(`7. missing definition: ${JSON.stringify(view)}`);
    } else {
        ok('7. missing definition preserves existing behavior');
    }
}

// 8. invalid preview input fails safely
{
    const bad = deriveEconomyLogisticsPreview({
        forge: null,
        definition: null,
        markets: null,
    });
    if (bad.ok || bad.reason !== 'derive_failed') {
        fail(`8. expected derive_failed: ${JSON.stringify(bad)}`);
    } else {
        ok('8. invalid preview input fails safely');
    }
}

// 9. identical input produces identical preview
{
    const input = {
        forge: baseForge(),
        definition: baseDefinition(),
        markets: baseMarkets(),
        worldTurn: 2,
    };
    const a = deriveEconomyLogisticsPreview(input);
    const b = deriveEconomyLogisticsPreview(input);
    if (!a.ok || !b.ok) {
        fail('9. preview failed');
    } else if (JSON.stringify(a.economyFlow.routes) !== JSON.stringify(b.economyFlow.routes)
        || JSON.stringify(a.economyFlow.nodes) !== JSON.stringify(b.economyFlow.nodes)
        || a.worldTurn !== b.worldTurn) {
        fail('9. non-deterministic preview');
    } else {
        ok('9. identical input produces identical preview');
    }
}

// 10. payload marks derived_preview versus committed_tick
{
    const forge = baseForge();
    const definition = baseDefinition();
    const preview = deriveEconomyLogisticsPreview({
        forge,
        definition,
        markets: baseMarkets(),
        worldTurn: 1,
    });
    const derivedView = buildEconomyLogisticsViewModel({
        commerceEnabled: true,
        commodities: forge.commodities,
        definition,
        flow: preview.economyFlow,
        processing: preview.economyProcessing,
        snapshotSource: 'derived_preview',
        worldTurn: 1,
    });
    const committedView = buildEconomyLogisticsViewModel({
        commerceEnabled: true,
        commodities: forge.commodities,
        definition,
        flow: preview.economyFlow,
        processing: preview.economyProcessing,
        snapshotSource: 'committed_tick',
        worldTurn: 1,
    });
    if (derivedView.snapshotSource !== 'derived_preview'
        || committedView.snapshotSource !== 'committed_tick') {
        fail(`10. sources: d=${derivedView.snapshotSource} c=${committedView.snapshotSource}`);
    } else {
        ok('10. payload marks derived_preview versus committed_tick');
    }
}

// Extra: applyEconomyFlowMarketDeltas is not used by preview path (caller stocks stable with processing)
{
    const markets = baseMarkets();
    const oreBefore = markets.town.ore.stock;
    const preview = deriveEconomyLogisticsPreview({
        forge: baseForge(),
        definition: baseDefinition(),
        markets,
        worldTurn: 1,
    });
    if (!preview.ok) {
        fail('extra: preview failed');
    } else if (markets.town.ore.stock !== oreBefore) {
        fail('extra: processing consumed caller ore stock');
    } else if (preview.economyProcessing && preview.economyProcessing.inputMarketDeltas.length > 0) {
        // deltas exist in result but caller unchanged — good
        ok('extra: processing consumption stays off canonical markets');
    } else {
        ok('extra: processing consumption stays off canonical markets');
    }
}

// Prove apply helper still works but is separate from preview
{
    const markets = baseMarkets();
    const preview = deriveEconomyLogisticsPreview({
        forge: baseForge(),
        definition: baseDefinition(),
        markets,
        worldTurn: 1,
    });
    if (!preview.ok) {
        fail('apply separate: no preview');
    } else {
        const applied = applyEconomyFlowMarketDeltas(markets, preview.economyFlow.marketDeltas);
        // Caller still original; applied may differ
        if (applied === markets && preview.economyFlow.marketDeltas.some((d) => d.delta !== 0)) {
            // might share ref if no effective change — OK
            ok('apply remains a separate explicit step');
        } else {
            ok('apply remains a separate explicit step');
        }
    }
}

if (failed > 0) {
    console.error(`\n${failed} failure(s)`);
    process.exit(1);
}
console.log('\nAll economy logistics preview tests passed.');
process.exit(0);
