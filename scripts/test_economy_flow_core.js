#!/usr/bin/env node
'use strict';

// NOAI-ECON-FLOWS-001: focused tests for deterministic economy flow core.

const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const corePath = path.join(root, 'out', 'economyFlowCore.js');

let failed = 0;
function fail(msg) { console.error(`FAIL: ${msg}`); failed++; }
function ok(msg) { console.log(`OK: ${msg}`); }
function approx(a, b, eps = 1e-9) { return Math.abs(a - b) <= eps; }

if (!fs.existsSync(corePath)) {
    fail('out/economyFlowCore.js missing — run npm run compile first');
    process.exit(1);
}

const { computeEconomyFlowTick } = require(corePath);

function deepClone(value) {
    return JSON.parse(JSON.stringify(value));
}

function assertNoInvalidNumbers(obj, label) {
    const stack = [{ value: obj, path: label, key: '' }];
    while (stack.length) {
        const { value, path: p, key } = stack.pop();
        if (typeof value === 'number') {
            if (!Number.isFinite(value)) {
                fail(`${p} non-finite number: ${value}`);
                return false;
            }
            // delta may be negative; all flow magnitudes must be non-negative.
            if (key !== 'delta' && value < 0) {
                fail(`${p} negative flow: ${value}`);
                return false;
            }
            if (Object.is(value, -0)) {
                fail(`${p} has negative zero`);
                return false;
            }
        } else if (Array.isArray(value)) {
            value.forEach((item, i) => stack.push({ value: item, path: `${p}[${i}]`, key: '' }));
        } else if (value && typeof value === 'object') {
            for (const [k, v] of Object.entries(value)) {
                if (k === 'status' || k === 'code' || k === 'message' || k === 'id'
                    || k.endsWith('Id') || k === 'kind' || k === 'label') {
                    continue;
                }
                stack.push({ value: v, path: `${p}.${k}`, key: k });
            }
        }
    }
    return true;
}

const baseForge = {
    commodities: [
        { id: 'sakuradite', name: 'Sakuradite', basePrice: 100, weight: 1 },
        { id: 'wheat', name: 'Wheat', basePrice: 10, weight: 1 },
        { id: 'steel', name: 'Steel', basePrice: 40, weight: 2 },
    ],
    markets: [
        { locationId: 'market_a', commodityIds: ['sakuradite', 'wheat', 'steel'] },
        { locationId: 'market_b', commodityIds: ['sakuradite', 'wheat'] },
        { locationId: 'market_c', commodityIds: ['sakuradite'] },
    ],
};

function makeMarkets(entries) {
    // entries: { locationId: { commodityId: { stock, priceIndex } } }
    return deepClone(entries);
}

// ---------------------------------------------------------------------------
// 1. Custom commodity (sakuradite) accepted via CommerceForge commodity list
// ---------------------------------------------------------------------------
{
    const input = {
        definition: {
            nodes: [
                { id: 'mine', kind: 'facility', label: 'Mine' },
                { id: 'town', kind: 'settlement', label: 'Town', marketLocationId: 'market_a' },
            ],
            productionSources: [
                { id: 'ps1', nodeId: 'mine', commodityId: 'sakuradite', baseOutputPerTick: 10 },
            ],
            demands: [
                { id: 'd1', nodeId: 'town', commodityId: 'sakuradite', baseDemandPerTick: 4 },
            ],
            tradeRoutes: [
                {
                    id: 'r1',
                    fromNodeId: 'mine',
                    toNodeId: 'town',
                    commodityId: 'sakuradite',
                    capacityPerTick: 10,
                },
            ],
        },
        forge: baseForge,
        markets: makeMarkets({
            market_a: { sakuradite: { stock: 0, priceIndex: 1.5 } },
        }),
    };
    const result = computeEconomyFlowTick(input);
    const route = result.routes.find((r) => r.routeId === 'r1');
    const delta = result.marketDeltas.find(
        (d) => d.marketLocationId === 'market_a' && d.commodityId === 'sakuradite'
    );
    if (!route || !approx(route.volume, 10)) {
        fail(`sakuradite custom commodity route volume: ${JSON.stringify(route)}`);
    } else if (!delta || !approx(delta.supplied, 10) || !approx(delta.consumed, 4) || !approx(delta.delta, 6)) {
        fail(`sakuradite market delta: ${JSON.stringify(delta)}`);
    } else if (result.diagnostics.some((d) => d.code === 'unknown_commodity')) {
        fail('sakuradite should not produce unknown_commodity diagnostic');
    } else {
        ok('1. custom commodity sakuradite accepted via CommerceForge');
    }
}

// ---------------------------------------------------------------------------
// 2. One production source → one market: route volume + market delta
// ---------------------------------------------------------------------------
{
    const input = {
        definition: {
            nodes: [
                { id: 'farm', kind: 'facility', label: 'Farm' },
                { id: 'city', kind: 'settlement', label: 'City', marketLocationId: 'market_a' },
            ],
            productionSources: [
                { id: 'ps1', nodeId: 'farm', commodityId: 'wheat', baseOutputPerTick: 20 },
            ],
            demands: [
                { id: 'd1', nodeId: 'city', commodityId: 'wheat', baseDemandPerTick: 5 },
            ],
            tradeRoutes: [
                {
                    id: 'r1',
                    fromNodeId: 'farm',
                    toNodeId: 'city',
                    commodityId: 'wheat',
                    capacityPerTick: 20,
                },
            ],
        },
        forge: baseForge,
        markets: makeMarkets({
            market_a: { wheat: { stock: 0, priceIndex: 1 } },
        }),
    };
    const result = computeEconomyFlowTick(input);
    const route = result.routes[0];
    const delta = result.marketDeltas[0];
    if (!route || route.routeId !== 'r1' || !approx(route.volume, 20)) {
        fail(`one-to-one route: ${JSON.stringify(route)}`);
    } else if (!delta || !approx(delta.supplied, 20) || !approx(delta.consumed, 5) || !approx(delta.delta, 15)) {
        fail(`one-to-one delta: ${JSON.stringify(delta)}`);
    } else {
        ok('2. one source → one market route volume and delta');
    }
}

// ---------------------------------------------------------------------------
// 3. One source split across two routes: proportional by capacity
// ---------------------------------------------------------------------------
{
    // produced=30, capacities 10 and 20 → volumes 10 and 20
    const input = {
        definition: {
            nodes: [
                { id: 'src', kind: 'facility', label: 'Src' },
                { id: 'a', kind: 'settlement', label: 'A', marketLocationId: 'market_a' },
                { id: 'b', kind: 'settlement', label: 'B', marketLocationId: 'market_b' },
            ],
            productionSources: [
                { id: 'ps1', nodeId: 'src', commodityId: 'sakuradite', baseOutputPerTick: 30 },
            ],
            demands: [],
            tradeRoutes: [
                {
                    id: 'r_small',
                    fromNodeId: 'src',
                    toNodeId: 'a',
                    commodityId: 'sakuradite',
                    capacityPerTick: 10,
                },
                {
                    id: 'r_large',
                    fromNodeId: 'src',
                    toNodeId: 'b',
                    commodityId: 'sakuradite',
                    capacityPerTick: 20,
                },
            ],
        },
        forge: baseForge,
        markets: makeMarkets({
            market_a: { sakuradite: { stock: 0, priceIndex: 1 } },
            market_b: { sakuradite: { stock: 0, priceIndex: 1 } },
        }),
    };
    const result = computeEconomyFlowTick(input);
    const byId = Object.fromEntries(result.routes.map((r) => [r.routeId, r]));
    if (!approx(byId.r_small.volume, 10) || !approx(byId.r_large.volume, 20)) {
        fail(`proportional split full: ${JSON.stringify(result.routes)}`);
    } else {
        ok('3. proportional split by capacity (full production)');
    }
}

// ---------------------------------------------------------------------------
// 4. Route allocation independent of input array order
// ---------------------------------------------------------------------------
{
    function build(routes, sources) {
        return computeEconomyFlowTick({
            definition: {
                nodes: [
                    { id: 'src', kind: 'facility', label: 'Src' },
                    { id: 'a', kind: 'settlement', label: 'A', marketLocationId: 'market_a' },
                    { id: 'b', kind: 'settlement', label: 'B', marketLocationId: 'market_b' },
                ],
                productionSources: sources,
                demands: [],
                tradeRoutes: routes,
            },
            forge: baseForge,
            markets: makeMarkets({
                market_a: { sakuradite: { stock: 0, priceIndex: 1 } },
                market_b: { sakuradite: { stock: 0, priceIndex: 1 } },
            }),
        });
    }
    // produced=15, caps 10+20 → scale=0.5 → volumes 5 and 10
    const routesA = [
        { id: 'r_small', fromNodeId: 'src', toNodeId: 'a', commodityId: 'sakuradite', capacityPerTick: 10 },
        { id: 'r_large', fromNodeId: 'src', toNodeId: 'b', commodityId: 'sakuradite', capacityPerTick: 20 },
    ];
    const routesB = [
        { id: 'r_large', fromNodeId: 'src', toNodeId: 'b', commodityId: 'sakuradite', capacityPerTick: 20 },
        { id: 'r_small', fromNodeId: 'src', toNodeId: 'a', commodityId: 'sakuradite', capacityPerTick: 10 },
    ];
    const sourcesA = [{ id: 'ps1', nodeId: 'src', commodityId: 'sakuradite', baseOutputPerTick: 15 }];
    const sourcesB = [{ id: 'ps1', nodeId: 'src', commodityId: 'sakuradite', baseOutputPerTick: 15 }];
    const ra = build(routesA, sourcesA);
    const rb = build(routesB, sourcesB);
    const volA = Object.fromEntries(ra.routes.map((r) => [r.routeId, r.volume]));
    const volB = Object.fromEntries(rb.routes.map((r) => [r.routeId, r.volume]));
    if (!approx(volA.r_small, 5) || !approx(volA.r_large, 10)) {
        fail(`order-A volumes: ${JSON.stringify(volA)}`);
    } else if (!approx(volB.r_small, 5) || !approx(volB.r_large, 10)) {
        fail(`order-B volumes: ${JSON.stringify(volB)}`);
    } else if (!approx(volA.r_small, volB.r_small) || !approx(volA.r_large, volB.r_large)) {
        fail(`order independence broken: ${JSON.stringify(volA)} vs ${JSON.stringify(volB)}`);
    } else {
        ok('4. route allocation independent of input order');
    }
}

// ---------------------------------------------------------------------------
// 5. Route volume capped by production
// ---------------------------------------------------------------------------
{
    const result = computeEconomyFlowTick({
        definition: {
            nodes: [
                { id: 'src', kind: 'facility', label: 'Src' },
                { id: 'a', kind: 'settlement', label: 'A', marketLocationId: 'market_a' },
            ],
            productionSources: [
                { id: 'ps1', nodeId: 'src', commodityId: 'wheat', baseOutputPerTick: 5 },
            ],
            demands: [],
            tradeRoutes: [
                {
                    id: 'r1',
                    fromNodeId: 'src',
                    toNodeId: 'a',
                    commodityId: 'wheat',
                    capacityPerTick: 100,
                },
            ],
        },
        forge: baseForge,
        markets: makeMarkets({ market_a: { wheat: { stock: 0, priceIndex: 1 } } }),
    });
    if (!approx(result.routes[0].volume, 5)) {
        fail(`production cap: volume=${result.routes[0].volume}`);
    } else {
        ok('5. route volume capped by production');
    }
}

// ---------------------------------------------------------------------------
// 6. Route volume capped by route capacity
// ---------------------------------------------------------------------------
{
    const result = computeEconomyFlowTick({
        definition: {
            nodes: [
                { id: 'src', kind: 'facility', label: 'Src' },
                { id: 'a', kind: 'settlement', label: 'A', marketLocationId: 'market_a' },
            ],
            productionSources: [
                { id: 'ps1', nodeId: 'src', commodityId: 'wheat', baseOutputPerTick: 100 },
            ],
            demands: [],
            tradeRoutes: [
                {
                    id: 'r1',
                    fromNodeId: 'src',
                    toNodeId: 'a',
                    commodityId: 'wheat',
                    capacityPerTick: 7,
                },
            ],
        },
        forge: baseForge,
        markets: makeMarkets({ market_a: { wheat: { stock: 0, priceIndex: 1 } } }),
    });
    if (!approx(result.routes[0].volume, 7)) {
        fail(`capacity cap: volume=${result.routes[0].volume}`);
    } else {
        const srcNode = result.nodes.find((n) => n.nodeId === 'src');
        if (!srcNode || !approx(srcNode.unshippedSupply, 93)) {
            fail(`capacity cap unshipped: ${JSON.stringify(srcNode)}`);
        } else {
            ok('6. route volume capped by route capacity');
        }
    }
}

// ---------------------------------------------------------------------------
// 7. Existing market stock + imports fulfill demand
// ---------------------------------------------------------------------------
{
    const result = computeEconomyFlowTick({
        definition: {
            nodes: [
                { id: 'src', kind: 'facility', label: 'Src' },
                { id: 'town', kind: 'settlement', label: 'Town', marketLocationId: 'market_a' },
            ],
            productionSources: [
                { id: 'ps1', nodeId: 'src', commodityId: 'wheat', baseOutputPerTick: 3 },
            ],
            demands: [
                { id: 'd1', nodeId: 'town', commodityId: 'wheat', baseDemandPerTick: 10 },
            ],
            tradeRoutes: [
                {
                    id: 'r1',
                    fromNodeId: 'src',
                    toNodeId: 'town',
                    commodityId: 'wheat',
                    capacityPerTick: 3,
                },
            ],
        },
        forge: baseForge,
        markets: makeMarkets({ market_a: { wheat: { stock: 8, priceIndex: 1.2 } } }),
    });
    // available = 8 + 0 retained + 3 import = 11; demand 10 → fulfilled 10, unmet 0
    // delta = 0 + 3 - 10 = -7; opening+delta = 1 >= 0
    const town = result.nodes.find((n) => n.nodeId === 'town' && n.commodityId === 'wheat');
    const delta = result.marketDeltas.find((d) => d.commodityId === 'wheat');
    if (!town || !approx(town.fulfilledDemand, 10) || !approx(town.unmetDemand, 0)) {
        fail(`stock+import demand: ${JSON.stringify(town)}`);
    } else if (!delta || !approx(delta.delta, -7) || !approx(8 + delta.delta, 1)) {
        fail(`stock+import delta: ${JSON.stringify(delta)}`);
    } else {
        ok('7. opening stock + imports fulfill demand');
    }
}

// ---------------------------------------------------------------------------
// 8. Demand > available → unmet demand, no negative resulting stock
// ---------------------------------------------------------------------------
{
    const open = 2;
    const result = computeEconomyFlowTick({
        definition: {
            nodes: [
                { id: 'src', kind: 'facility', label: 'Src' },
                { id: 'town', kind: 'settlement', label: 'Town', marketLocationId: 'market_a' },
            ],
            productionSources: [
                { id: 'ps1', nodeId: 'src', commodityId: 'wheat', baseOutputPerTick: 1 },
            ],
            demands: [
                { id: 'd1', nodeId: 'town', commodityId: 'wheat', baseDemandPerTick: 50 },
            ],
            tradeRoutes: [
                {
                    id: 'r1',
                    fromNodeId: 'src',
                    toNodeId: 'town',
                    commodityId: 'wheat',
                    capacityPerTick: 1,
                },
            ],
        },
        forge: baseForge,
        markets: makeMarkets({ market_a: { wheat: { stock: open, priceIndex: 1 } } }),
    });
    // available = 2 + 1 = 3; fulfilled 3; unmet 47; delta = 1 - 3 = -2; open+delta = 0
    const town = result.nodes.find((n) => n.nodeId === 'town');
    const delta = result.marketDeltas[0];
    if (!town || !approx(town.fulfilledDemand, 3) || !approx(town.unmetDemand, 47)) {
        fail(`unmet demand: ${JSON.stringify(town)}`);
    } else if (!delta || open + delta.delta < 0) {
        fail(`negative resulting stock: open=${open} delta=${delta && delta.delta}`);
    } else if (!approx(open + delta.delta, 0)) {
        fail(`expected zero stock after: ${open + delta.delta}`);
    } else {
        ok('8. unmet demand without negative resulting stock');
    }
}

// ---------------------------------------------------------------------------
// 9. Unshipped production at non-market source: reported, no market delta
// ---------------------------------------------------------------------------
{
    const result = computeEconomyFlowTick({
        definition: {
            nodes: [
                { id: 'wild', kind: 'region', label: 'Wilds' },
            ],
            productionSources: [
                { id: 'ps1', nodeId: 'wild', commodityId: 'wheat', baseOutputPerTick: 12 },
            ],
            demands: [],
            tradeRoutes: [],
        },
        forge: baseForge,
        markets: makeMarkets({}),
    });
    const node = result.nodes.find((n) => n.nodeId === 'wild');
    if (!node || !approx(node.unshippedSupply, 12) || !approx(node.produced, 12)) {
        fail(`non-market unshipped: ${JSON.stringify(node)}`);
    } else if (result.marketDeltas.length !== 0) {
        fail(`non-market should have no market deltas: ${JSON.stringify(result.marketDeltas)}`);
    } else {
        ok('9. non-market unshipped supply reported, no market delta');
    }
}

// ---------------------------------------------------------------------------
// 10. Unshipped production at market-backed source becomes local supply
// ---------------------------------------------------------------------------
{
    const result = computeEconomyFlowTick({
        definition: {
            nodes: [
                { id: 'town', kind: 'settlement', label: 'Town', marketLocationId: 'market_a' },
            ],
            productionSources: [
                { id: 'ps1', nodeId: 'town', commodityId: 'wheat', baseOutputPerTick: 9 },
            ],
            demands: [
                { id: 'd1', nodeId: 'town', commodityId: 'wheat', baseDemandPerTick: 4 },
            ],
            tradeRoutes: [],
        },
        forge: baseForge,
        markets: makeMarkets({ market_a: { wheat: { stock: 1, priceIndex: 1 } } }),
    });
    // available = 1 + 9 + 0 = 10; fulfilled 4; delta = 9 - 4 = 5
    const delta = result.marketDeltas.find((d) => d.commodityId === 'wheat');
    const node = result.nodes.find((n) => n.nodeId === 'town');
    if (!node || !approx(node.unshippedSupply, 9) || !approx(node.fulfilledDemand, 4)) {
        fail(`local supply node: ${JSON.stringify(node)}`);
    } else if (!delta || !approx(delta.supplied, 9) || !approx(delta.consumed, 4) || !approx(delta.delta, 5)) {
        fail(`local supply delta: ${JSON.stringify(delta)}`);
    } else {
        ok('10. market-backed unshipped production becomes local supply');
    }
}

// ---------------------------------------------------------------------------
// 11. Risk clamped but does not alter volume
// ---------------------------------------------------------------------------
{
    const result = computeEconomyFlowTick({
        definition: {
            nodes: [
                { id: 'src', kind: 'facility', label: 'Src' },
                { id: 'a', kind: 'settlement', label: 'A', marketLocationId: 'market_a' },
            ],
            productionSources: [
                { id: 'ps1', nodeId: 'src', commodityId: 'wheat', baseOutputPerTick: 10 },
            ],
            demands: [],
            tradeRoutes: [
                {
                    id: 'r_high',
                    fromNodeId: 'src',
                    toNodeId: 'a',
                    commodityId: 'wheat',
                    capacityPerTick: 10,
                    baseRisk: 2.5,
                },
            ],
        },
        forge: baseForge,
        markets: makeMarkets({ market_a: { wheat: { stock: 0, priceIndex: 1 } } }),
    });
    const route = result.routes[0];
    if (!route || !approx(route.volume, 10)) {
        fail(`risk should not reduce volume: ${JSON.stringify(route)}`);
    } else if (!approx(route.risk, 1) || route.status !== 'open') {
        fail(`risk clamp/status: ${JSON.stringify(route)}`);
    } else {
        ok('11. risk clamped, volume unchanged, status open');
    }
}

// ---------------------------------------------------------------------------
// 12. Invalid references / numbers → diagnostics, no invalid numerics
// ---------------------------------------------------------------------------
{
    const result = computeEconomyFlowTick({
        definition: {
            nodes: [
                { id: 'a', kind: 'settlement', label: 'A', marketLocationId: 'market_a' },
                { id: 'a', kind: 'settlement', label: 'Dup', marketLocationId: 'market_b' },
                { id: 'b', kind: 'facility', label: 'B' },
            ],
            productionSources: [
                { id: 'ps_bad_node', nodeId: 'missing', commodityId: 'wheat', baseOutputPerTick: 5 },
                { id: 'ps_bad_comm', nodeId: 'b', commodityId: 'unicorn_dust', baseOutputPerTick: 5 },
                { id: 'ps_nan', nodeId: 'b', commodityId: 'wheat', baseOutputPerTick: NaN },
                { id: 'ps_neg', nodeId: 'b', commodityId: 'wheat', baseOutputPerTick: -3 },
                { id: 'ps_ok', nodeId: 'b', commodityId: 'wheat', baseOutputPerTick: 4 },
            ],
            demands: [
                { id: 'd_bad', nodeId: 'missing', commodityId: 'wheat', baseDemandPerTick: 1 },
            ],
            tradeRoutes: [
                {
                    id: 'r_bad_dest',
                    fromNodeId: 'b',
                    toNodeId: 'missing',
                    commodityId: 'wheat',
                    capacityPerTick: 4,
                },
                {
                    id: 'r_ok',
                    fromNodeId: 'b',
                    toNodeId: 'a',
                    commodityId: 'wheat',
                    capacityPerTick: 4,
                },
            ],
        },
        forge: baseForge,
        markets: makeMarkets({ market_a: { wheat: { stock: 0, priceIndex: 1 } } }),
    });
    if (result.diagnostics.length === 0) {
        fail('expected diagnostics for invalid rows');
    } else if (!assertNoInvalidNumbers(result.routes, 'routes')
        || !assertNoInvalidNumbers(result.nodes, 'nodes')
        || !assertNoInvalidNumbers(result.marketDeltas, 'marketDeltas')) {
        // fail already logged
    } else {
        const codes = new Set(result.diagnostics.map((d) => d.code));
        if (!codes.has('duplicate_node_id') || !codes.has('missing_node')
            || !codes.has('unknown_commodity') || !codes.has('invalid_number')
            || !codes.has('negative_value')) {
            fail(`diagnostic codes incomplete: ${[...codes].join(',')}`);
        } else {
            ok('12. invalid inputs produce diagnostics without invalid numerics');
        }
    }
}

// ---------------------------------------------------------------------------
// 13. Input objects remain deeply unchanged
// ---------------------------------------------------------------------------
{
    const input = {
        definition: {
            nodes: [
                { id: 'src', kind: 'facility', label: 'Src' },
                { id: 'a', kind: 'settlement', label: 'A', marketLocationId: 'market_a' },
            ],
            productionSources: [
                { id: 'ps1', nodeId: 'src', commodityId: 'wheat', baseOutputPerTick: 6 },
            ],
            demands: [
                { id: 'd1', nodeId: 'a', commodityId: 'wheat', baseDemandPerTick: 2 },
            ],
            tradeRoutes: [
                {
                    id: 'r1',
                    fromNodeId: 'src',
                    toNodeId: 'a',
                    commodityId: 'wheat',
                    capacityPerTick: 6,
                    baseRisk: 0.3,
                },
            ],
        },
        forge: baseForge,
        markets: makeMarkets({ market_a: { wheat: { stock: 5, priceIndex: 1.1 } } }),
    };
    const before = deepClone(input);
    computeEconomyFlowTick(input);
    if (JSON.stringify(input) !== JSON.stringify(before)) {
        fail('input was mutated');
    } else {
        ok('13. input objects remain deeply unchanged');
    }
}

// ---------------------------------------------------------------------------
// 14. priceIndex remains unchanged (core never writes markets)
// ---------------------------------------------------------------------------
{
    const markets = makeMarkets({
        market_a: {
            wheat: { stock: 10, priceIndex: 2.25 },
            sakuradite: { stock: 3, priceIndex: 0.8 },
        },
    });
    const before = deepClone(markets);
    computeEconomyFlowTick({
        definition: {
            nodes: [
                { id: 'src', kind: 'facility', label: 'Src' },
                { id: 'a', kind: 'settlement', label: 'A', marketLocationId: 'market_a' },
            ],
            productionSources: [
                { id: 'ps1', nodeId: 'src', commodityId: 'wheat', baseOutputPerTick: 5 },
            ],
            demands: [
                { id: 'd1', nodeId: 'a', commodityId: 'wheat', baseDemandPerTick: 100 },
            ],
            tradeRoutes: [
                {
                    id: 'r1',
                    fromNodeId: 'src',
                    toNodeId: 'a',
                    commodityId: 'wheat',
                    capacityPerTick: 5,
                },
            ],
        },
        forge: baseForge,
        markets,
    });
    if (markets.market_a.wheat.priceIndex !== 2.25
        || markets.market_a.sakuradite.priceIndex !== 0.8
        || JSON.stringify(markets) !== JSON.stringify(before)) {
        fail(`priceIndex/markets mutated: ${JSON.stringify(markets)}`);
    } else {
        ok('14. priceIndex remains unchanged');
    }
}

// ---------------------------------------------------------------------------
// 15. Public arrays use stable ID-based ordering
// ---------------------------------------------------------------------------
{
    const result = computeEconomyFlowTick({
        definition: {
            nodes: [
                { id: 'z_src', kind: 'facility', label: 'Z' },
                { id: 'm_b', kind: 'settlement', label: 'B', marketLocationId: 'market_b' },
                { id: 'm_a', kind: 'settlement', label: 'A', marketLocationId: 'market_a' },
            ],
            productionSources: [
                { id: 'ps_z', nodeId: 'z_src', commodityId: 'sakuradite', baseOutputPerTick: 20 },
            ],
            demands: [
                { id: 'd_b', nodeId: 'm_b', commodityId: 'sakuradite', baseDemandPerTick: 1 },
                { id: 'd_a', nodeId: 'm_a', commodityId: 'sakuradite', baseDemandPerTick: 1 },
            ],
            tradeRoutes: [
                {
                    id: 'r_z',
                    fromNodeId: 'z_src',
                    toNodeId: 'm_b',
                    commodityId: 'sakuradite',
                    capacityPerTick: 10,
                },
                {
                    id: 'r_a',
                    fromNodeId: 'z_src',
                    toNodeId: 'm_a',
                    commodityId: 'sakuradite',
                    capacityPerTick: 10,
                },
            ],
        },
        forge: baseForge,
        markets: makeMarkets({
            market_a: { sakuradite: { stock: 0, priceIndex: 1 } },
            market_b: { sakuradite: { stock: 0, priceIndex: 1 } },
        }),
    });
    const routeIds = result.routes.map((r) => r.routeId);
    const sortedRoutes = [...routeIds].sort();
    const nodeKeys = result.nodes.map((n) => `${n.nodeId}\0${n.commodityId}`);
    const sortedNodes = [...nodeKeys].sort();
    const deltaKeys = result.marketDeltas.map(
        (d) => `${d.marketLocationId}\0${d.nodeId}\0${d.commodityId}`
    );
    const sortedDeltas = [...deltaKeys].sort();
    if (JSON.stringify(routeIds) !== JSON.stringify(sortedRoutes)) {
        fail(`route order unstable: ${routeIds.join(',')}`);
    } else if (JSON.stringify(nodeKeys) !== JSON.stringify(sortedNodes)) {
        fail(`node order unstable: ${nodeKeys.join(',')}`);
    } else if (JSON.stringify(deltaKeys) !== JSON.stringify(sortedDeltas)) {
        fail(`delta order unstable: ${deltaKeys.join(',')}`);
    } else {
        ok('15. public arrays use stable ID-based ordering');
    }
}

if (failed > 0) {
    console.error(`\n${failed} failure(s)`);
    process.exit(1);
}
console.log('\nAll economy flow core tests passed.');
process.exit(0);
