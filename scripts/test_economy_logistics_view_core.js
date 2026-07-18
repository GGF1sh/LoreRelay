#!/usr/bin/env node
'use strict';

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const root = path.join(__dirname, '..');
const corePath = path.join(root, 'out', 'economyLogisticsViewCore.js');

if (!fs.existsSync(corePath)) {
    console.error('FAIL: compiled output missing — run npm run compile');
    process.exit(1);
}

const {
    buildEconomyLogisticsViewModel,
    LOGISTICS_BOTTLENECK_UTILIZATION,
} = require(corePath);

let failed = 0;
function test(name, fn) {
    try {
        fn();
        console.log(`OK: ${name}`);
    } catch (error) {
        failed++;
        console.error(`FAIL: ${name}`);
        console.error(error && error.stack ? error.stack : error);
    }
}

function fixture() {
    const definition = {
        nodes: [
            { id: 'z_market', kind: 'market', label: '<Market & Hall>', marketLocationId: 'market_hall' },
            { id: 'a_region', kind: 'region', label: 'Moon Valley', regionId: 'moon' },
            { id: 'm_facility', kind: 'facility', label: 'Refinery', locationId: 'refinery' },
            { id: 'b_settlement', kind: 'settlement', label: 'River Town', locationId: 'river' },
        ],
        productionSources: [
            { id: 'src_sakura', nodeId: 'a_region', commodityId: 'sakuradite', baseOutputPerTick: 12 },
            { id: 'src_grain', nodeId: 'b_settlement', commodityId: 'grain', baseOutputPerTick: 7 },
        ],
        demands: [
            { id: 'd_grain', nodeId: 'z_market', commodityId: 'grain', baseDemandPerTick: 12 },
            { id: 'd_medicine', nodeId: 'z_market', commodityId: 'medicine', baseDemandPerTick: 4 },
        ],
        tradeRoutes: [
            { id: 'route_strained', fromNodeId: 'b_settlement', toNodeId: 'z_market', commodityId: 'grain', capacityPerTick: 10, status: 'strained' },
            { id: 'route_blocked', fromNodeId: 'm_facility', toNodeId: 'z_market', commodityId: 'medicine', capacityPerTick: 8, status: 'blocked' },
            { id: 'route_open', fromNodeId: 'a_region', toNodeId: 'm_facility', commodityId: 'sakuradite', capacityPerTick: 10, status: 'open' },
            { id: 'route_raided', fromNodeId: 'm_facility', toNodeId: 'z_market', commodityId: 'sakuradite', capacityPerTick: 10, status: 'raided' },
        ],
        processingRecipes: [{ id: 'refine', inputs: { sakuradite: 2 }, outputs: { medicine: 1 } }],
        processingSites: [{ id: 'site_refinery', nodeId: 'm_facility', recipeId: 'refine', maxBatchesPerTick: 3 }],
    };
    const flow = {
        productionSources: [
            { sourceId: 'src_grain', nodeId: 'b_settlement', commodityId: 'grain', baseOutput: 7, productivePotential: 1, condition: 0.8, effectiveOutput: 5.6 },
            { sourceId: 'src_sakura', nodeId: 'a_region', commodityId: 'sakuradite', baseOutput: 12, productivePotential: 1.25, condition: 0.5, effectiveOutput: 7.5 },
        ],
        nodes: [
            { nodeId: 'z_market', commodityId: 'medicine', fulfilledDemand: 0, unmetDemand: 4 },
            { nodeId: 'z_market', commodityId: 'grain', fulfilledDemand: 5, unmetDemand: 7 },
            { nodeId: 'm_facility', commodityId: 'sakuradite', fulfilledDemand: 0, unmetDemand: 0 },
        ],
        routes: [
            { routeId: 'route_raided', volume: 2, capacity: 2.5, baseCapacity: 10, utilization: 0.8, risk: 0.7, status: 'raided' },
            { routeId: 'route_open', volume: 7.5, capacity: 10, baseCapacity: 10, utilization: 0.75, risk: 0.1, status: 'open' },
            { routeId: 'route_blocked', volume: 0, capacity: 0, baseCapacity: 8, utilization: 0, risk: 0.4, status: 'blocked' },
            { routeId: 'route_strained', volume: 5, capacity: 5, baseCapacity: 10, utilization: 1, risk: 0.3, status: 'strained' },
        ],
        marketDeltas: [],
        diagnostics: [],
    };
    const processing = {
        sites: [{
            siteId: 'site_refinery', nodeId: 'm_facility', recipeId: 'refine', batches: 2,
            condition: 0.75, baseMaxBatches: 3, effectiveMaxBatches: 2,
            inputsConsumed: [{ commodityId: 'sakuradite', quantity: 4 }],
            outputsProduced: [{ commodityId: 'medicine', quantity: 2 }],
        }],
        inputMarketDeltas: [], runtimeProduction: [], diagnostics: [],
    };
    return {
        commerceEnabled: true,
        worldTurn: 14,
        commodities: [
            { id: 'medicine', name: 'Medicine' },
            { id: 'grain', name: 'Grain' },
            { id: 'sakuradite', name: 'Sakuradite' },
        ],
        definition,
        flow,
        processing,
    };
}

test('missing flow data returns safe unavailable models', () => {
    assert.strictEqual(buildEconomyLogisticsViewModel({ commerceEnabled: true }).unavailableReason, 'missing_definition');
    const input = fixture();
    input.flow = null;
    const result = buildEconomyLogisticsViewModel(input);
    assert.strictEqual(result.available, false);
    assert.strictEqual(result.unavailableReason, 'snapshot_unavailable');
    assert.ok(result.nodes.length > 0);
    assert.deepStrictEqual(result.routes, []);
});

test('commerce disabled returns a safe unavailable model', () => {
    const input = fixture();
    input.commerceEnabled = false;
    const result = buildEconomyLogisticsViewModel(input);
    assert.strictEqual(result.available, false);
    assert.strictEqual(result.unavailableReason, 'commerce_disabled');
});

test('nodes, routes, and commodities are stable-sorted', () => {
    const result = buildEconomyLogisticsViewModel(fixture());
    assert.deepStrictEqual(result.nodes.map((x) => x.id), ['a_region', 'b_settlement', 'm_facility', 'z_market']);
    assert.deepStrictEqual(result.routes.map((x) => x.id), ['route_blocked', 'route_open', 'route_raided', 'route_strained']);
    assert.deepStrictEqual(result.commodities.map((x) => x.id), ['grain', 'medicine', 'sakuradite']);
});

test('custom commodities and plain-text labels remain supported', () => {
    const result = buildEconomyLogisticsViewModel(fixture());
    const custom = result.commodities.find((x) => x.id === 'sakuradite');
    assert.strictEqual(custom.name, 'Sakuradite');
    assert.strictEqual(custom.localSpecialty, true);
    assert.strictEqual(result.nodes.find((x) => x.id === 'z_market').label, '<Market & Hall>');
});

test('route statuses are preserved and blocked zero-volume routes remain visible', () => {
    const result = buildEconomyLogisticsViewModel(fixture());
    assert.strictEqual(result.routes.find((x) => x.id === 'route_strained').status, 'strained');
    assert.strictEqual(result.routes.find((x) => x.id === 'route_raided').status, 'raided');
    const blocked = result.routes.find((x) => x.id === 'route_blocked');
    assert.ok(blocked);
    assert.strictEqual(blocked.status, 'blocked');
    assert.strictEqual(blocked.volume, 0);
});

test('non-finite and out-of-range numerics are safely normalized', () => {
    const input = fixture();
    input.worldTurn = Infinity;
    input.flow.routes[0].volume = NaN;
    input.flow.routes[0].risk = Infinity;
    input.flow.routes[0].utilization = 8;
    input.flow.productionSources[0].condition = -4;
    const result = buildEconomyLogisticsViewModel(input);
    const route = result.routes.find((x) => x.id === 'route_raided');
    assert.deepStrictEqual({ volume: route.volume, risk: route.risk, utilization: route.utilization }, { volume: 0, risk: 0, utilization: 1 });
    assert.strictEqual(result.nodes.find((x) => x.id === 'b_settlement').production[0].condition, 0);
    assert.strictEqual(result.worldTurn, undefined);
    assert.ok(!JSON.stringify(result).includes('null'));
});

test('shortages derive only from positive unmet demand', () => {
    const result = buildEconomyLogisticsViewModel(fixture());
    assert.strictEqual(result.shortages.length, 2);
    assert.ok(result.shortages.every((x) => x.unmetDemand > 0));
});

test('bottleneck requires high utilization and matching destination shortage', () => {
    assert.strictEqual(LOGISTICS_BOTTLENECK_UTILIZATION, 0.85);
    const result = buildEconomyLogisticsViewModel(fixture());
    assert.strictEqual(result.routes.find((x) => x.id === 'route_strained').bottleneck, true);
    assert.strictEqual(result.routes.find((x) => x.id === 'route_open').bottleneck, false);
    assert.strictEqual(result.routes.find((x) => x.id === 'route_blocked').bottleneck, false);
});

test('processing summaries are represented without recipe recalculation', () => {
    const result = buildEconomyLogisticsViewModel(fixture());
    assert.deepStrictEqual(result.processingSites[0], {
        id: 'site_refinery', nodeId: 'm_facility', recipeId: 'refine', active: true,
        batches: 2, condition: 0.75, baseMaxBatches: 3, effectiveMaxBatches: 2,
        inputs: [{ commodityId: 'sakuradite', quantity: 4 }],
        outputs: [{ commodityId: 'medicine', quantity: 2 }],
    });
});

test('input remains deeply unchanged', () => {
    const input = fixture();
    const before = structuredClone(input);
    buildEconomyLogisticsViewModel(input);
    assert.deepStrictEqual(input, before);
});

test('summary counts and total volume are correct', () => {
    const result = buildEconomyLogisticsViewModel(fixture());
    assert.deepStrictEqual(result.summary, {
        activeRoutes: 3,
        blockedRoutes: 1,
        raidedRoutes: 1,
        totalVolume: 14.5,
        shortageCount: 2,
        bottleneckCount: 1,
    });
    assert.strictEqual(result.worldTurn, 14);
});

test('unknown route, node, site, and secret fields do not enter the view model', () => {
    const input = fixture();
    input.flow.routes.push({ routeId: 'secret_route', fromNodeId: 'x', toNodeId: 'y', commodityId: 'secret', volume: 9, capacity: 9, baseCapacity: 9, utilization: 1, risk: 1, status: 'open', filesystemPath: 'C:\\secret' });
    input.flow.nodes.push({ nodeId: 'secret_node', commodityId: 'secret', unmetDemand: 10, fulfilledDemand: 0 });
    input.processing.sites.push({ siteId: 'secret_site', nodeId: 'secret_node', recipeId: 'secret', batches: 1 });
    const serialized = JSON.stringify(buildEconomyLogisticsViewModel(input));
    assert.ok(!serialized.includes('secret_route'));
    assert.ok(!serialized.includes('secret_node'));
    assert.ok(!serialized.includes('secret_site'));
    assert.ok(!serialized.includes('filesystemPath'));
    assert.ok(!serialized.includes('C:\\\\secret'));
});

if (failed) { process.exit(1); }
console.log('economy logistics view core: all tests passed.');
