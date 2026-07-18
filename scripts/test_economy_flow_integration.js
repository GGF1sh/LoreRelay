#!/usr/bin/env node
'use strict';

// NOAI-ECON-FLOWS-002: parser, delta helper, Living World tick integration.

const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');

const forgePath = path.join(root, 'out', 'livingWorldForgeCore.js');
const flowPath = path.join(root, 'out', 'economyFlowCore.js');
const kitPath = path.join(root, 'out', 'worldKitTickCore.js');

let failed = 0;
function fail(msg) { console.error(`FAIL: ${msg}`); failed++; }
function ok(msg) { console.log(`OK: ${msg}`); }
function approx(a, b, eps = 1e-9) { return Math.abs(a - b) <= eps; }

for (const p of [forgePath, flowPath, kitPath]) {
    if (!fs.existsSync(p)) {
        fail(`${p} missing — run npm run compile first`);
        process.exit(1);
    }
}

const { parseCommerceForge } = require(forgePath);
const { applyEconomyFlowMarketDeltas, computeEconomyFlowTick } = require(flowPath);
const { runLivingWorldTick } = require(kitPath);

function deepClone(v) { return JSON.parse(JSON.stringify(v)); }

const baseCommerce = {
    commodities: [
        { id: 'wheat', name: 'Wheat', basePrice: 10, weight: 1 },
        { id: 'sakuradite', name: 'Sakuradite', basePrice: 100, weight: 1 },
        { id: 'steel', name: 'Steel', basePrice: 40, weight: 2 },
    ],
    markets: [
        { locationId: 'town', commodityIds: ['wheat', 'sakuradite', 'steel'], targetStock: 30 },
        { locationId: 'port', commodityIds: ['wheat', 'sakuradite'], targetStock: 30 },
    ],
    transportKinds: [
        { id: 'wagon', name: 'Wagon', capacity: 50, speed: 1 },
    ],
};

const sampleFlows = {
    nodes: [
        { id: 'mine', kind: 'facility', label: 'Mine' },
        { id: 'town_node', kind: 'settlement', label: 'Town', marketLocationId: 'town' },
        { id: 'port_node', kind: 'settlement', label: 'Port', marketLocationId: 'port' },
    ],
    productionSources: [
        { id: 'ps1', nodeId: 'mine', commodityId: 'sakuradite', baseOutputPerTick: 10 },
    ],
    demands: [
        { id: 'd1', nodeId: 'town_node', commodityId: 'sakuradite', baseDemandPerTick: 3 },
    ],
    tradeRoutes: [
        {
            id: 'r1',
            fromNodeId: 'mine',
            toNodeId: 'town_node',
            commodityId: 'sakuradite',
            capacityPerTick: 10,
            baseRisk: 0.25,
        },
    ],
};

// =========================================================================
// Parser (1–9)
// =========================================================================

// 1. Valid resourceFlows parses
{
    const forge = parseCommerceForge({ ...baseCommerce, resourceFlows: sampleFlows });
    if (!forge || !forge.resourceFlows) {
        fail('1. valid resourceFlows should parse');
    } else if (forge.resourceFlows.nodes.length !== 3
        || forge.resourceFlows.productionSources.length !== 1
        || forge.resourceFlows.demands.length !== 1
        || forge.resourceFlows.tradeRoutes.length !== 1) {
        fail(`1. unexpected counts: ${JSON.stringify(forge.resourceFlows)}`);
    } else {
        ok('1. valid resourceFlows parses');
    }
}

// 2. Custom commodity sakuradite remains valid
{
    const forge = parseCommerceForge({ ...baseCommerce, resourceFlows: sampleFlows });
    const src = forge && forge.resourceFlows && forge.resourceFlows.productionSources[0];
    if (!src || src.commodityId !== 'sakuradite') {
        fail('2. sakuradite production should parse');
    } else if (!forge.commodities.some((c) => c.id === 'sakuradite')) {
        fail('2. sakuradite commodity missing from forge');
    } else {
        ok('2. custom commodity sakuradite remains valid');
    }
}

// 3. Missing resourceFlows remains undefined
{
    const forge = parseCommerceForge(baseCommerce);
    if (!forge) {
        fail('3. base commerce should parse');
    } else if (forge.resourceFlows !== undefined) {
        fail(`3. expected undefined resourceFlows, got ${JSON.stringify(forge.resourceFlows)}`);
    } else {
        ok('3. missing resourceFlows remains undefined');
    }
}

// 4. Malformed rows discarded without throwing
{
    let threw = false;
    let forge;
    try {
        forge = parseCommerceForge({
            ...baseCommerce,
            resourceFlows: {
                nodes: [
                    { id: 'ok', kind: 'facility', label: 'OK' },
                    null,
                    { id: 'bad kind', kind: 'spaceship', label: 'X' },
                    { id: '!!', kind: 'facility', label: 'bad id' },
                    42,
                ],
                productionSources: [
                    { id: 'ps_ok', nodeId: 'ok', commodityId: 'wheat', baseOutputPerTick: 1 },
                    { id: 'ps_bad', nodeId: 'ok' },
                    'nope',
                ],
                demands: [undefined, { id: 'd_ok', nodeId: 'ok', commodityId: 'wheat', baseDemandPerTick: 1 }],
                tradeRoutes: [{ id: 'r_missing_fields' }],
            },
        });
    } catch (e) {
        threw = true;
        fail(`4. threw: ${e && e.message}`);
    }
    if (!threw) {
        if (!forge || !forge.resourceFlows) {
            fail('4. expected partial resourceFlows');
        } else if (forge.resourceFlows.nodes.length !== 1
            || forge.resourceFlows.productionSources.length !== 1
            || forge.resourceFlows.demands.length !== 1
            || forge.resourceFlows.tradeRoutes.length !== 0) {
            fail(`4. malformed discard counts: ${JSON.stringify(forge.resourceFlows)}`);
        } else {
            ok('4. malformed rows discarded without throwing');
        }
    }
}

// 5. Fractional values preserved
{
    const forge = parseCommerceForge({
        ...baseCommerce,
        resourceFlows: {
            nodes: [{ id: 'n1', kind: 'facility', label: 'N' }],
            productionSources: [
                { id: 'ps1', nodeId: 'n1', commodityId: 'wheat', baseOutputPerTick: 2.5 },
            ],
            demands: [
                { id: 'd1', nodeId: 'n1', commodityId: 'wheat', baseDemandPerTick: 1.25 },
            ],
            tradeRoutes: [
                {
                    id: 'r1',
                    fromNodeId: 'n1',
                    toNodeId: 'n1',
                    commodityId: 'wheat',
                    capacityPerTick: 3.75,
                    baseRisk: 0.33,
                },
            ],
        },
    });
    const rf = forge && forge.resourceFlows;
    if (!rf
        || !approx(rf.productionSources[0].baseOutputPerTick, 2.5)
        || !approx(rf.demands[0].baseDemandPerTick, 1.25)
        || !approx(rf.tradeRoutes[0].capacityPerTick, 3.75)
        || !approx(rf.tradeRoutes[0].baseRisk, 0.33)) {
        fail(`5. fractions not preserved: ${JSON.stringify(rf)}`);
    } else {
        ok('5. fractional values preserved');
    }
}

// 6. Negative and non-finite numeric values rejected
{
    const forge = parseCommerceForge({
        ...baseCommerce,
        resourceFlows: {
            nodes: [{ id: 'n1', kind: 'facility', label: 'N' }],
            productionSources: [
                { id: 'ps_neg', nodeId: 'n1', commodityId: 'wheat', baseOutputPerTick: -1 },
                { id: 'ps_nan', nodeId: 'n1', commodityId: 'wheat', baseOutputPerTick: NaN },
                { id: 'ps_inf', nodeId: 'n1', commodityId: 'wheat', baseOutputPerTick: Infinity },
                { id: 'ps_ok', nodeId: 'n1', commodityId: 'wheat', baseOutputPerTick: 1 },
            ],
            demands: [
                { id: 'd_neg', nodeId: 'n1', commodityId: 'wheat', baseDemandPerTick: -2 },
            ],
            tradeRoutes: [
                {
                    id: 'r_neg',
                    fromNodeId: 'n1',
                    toNodeId: 'n1',
                    commodityId: 'wheat',
                    capacityPerTick: -5,
                },
            ],
        },
    });
    const rf = forge && forge.resourceFlows;
    if (!rf || rf.productionSources.length !== 1 || rf.productionSources[0].id !== 'ps_ok') {
        fail(`6. production filter: ${JSON.stringify(rf && rf.productionSources)}`);
    } else if (rf.demands.length !== 0 || rf.tradeRoutes.length !== 0) {
        fail(`6. demand/route filter: ${JSON.stringify(rf)}`);
    } else {
        ok('6. negative and non-finite values rejected');
    }
}

// 7. Risk clamped to [0, 1]
{
    const forge = parseCommerceForge({
        ...baseCommerce,
        resourceFlows: {
            nodes: [
                { id: 'a', kind: 'facility', label: 'A' },
                { id: 'b', kind: 'settlement', label: 'B', marketLocationId: 'town' },
            ],
            productionSources: [],
            demands: [],
            tradeRoutes: [
                {
                    id: 'r_high',
                    fromNodeId: 'a',
                    toNodeId: 'b',
                    commodityId: 'wheat',
                    capacityPerTick: 1,
                    baseRisk: 4,
                },
                {
                    id: 'r_low',
                    fromNodeId: 'a',
                    toNodeId: 'b',
                    commodityId: 'wheat',
                    capacityPerTick: 1,
                    baseRisk: -0.5,
                },
            ],
        },
    });
    const routes = forge && forge.resourceFlows && forge.resourceFlows.tradeRoutes;
    const byId = Object.fromEntries((routes || []).map((r) => [r.id, r]));
    if (!byId.r_high || !approx(byId.r_high.baseRisk, 1)) {
        fail(`7. high risk clamp: ${JSON.stringify(byId.r_high)}`);
    } else if (!byId.r_low || !approx(byId.r_low.baseRisk, 0)) {
        fail(`7. low risk clamp: ${JSON.stringify(byId.r_low)}`);
    } else {
        ok('7. risk clamped to [0, 1]');
    }
}

// 8. Safety limits enforced
{
    const manyNodes = [];
    for (let i = 0; i < 150; i++) {
        manyNodes.push({ id: `n_${i}`, kind: 'facility', label: `N${i}` });
    }
    const forge = parseCommerceForge({
        ...baseCommerce,
        resourceFlows: {
            nodes: manyNodes,
            productionSources: [],
            demands: [],
            tradeRoutes: [],
        },
    });
    if (!forge || !forge.resourceFlows || forge.resourceFlows.nodes.length !== 100) {
        fail(`8. node limit: ${forge && forge.resourceFlows && forge.resourceFlows.nodes.length}`);
    } else {
        ok('8. safety limits enforced (nodes 100)');
    }
}

// 9. Existing commerce parsing unchanged when field absent
{
    const forge = parseCommerceForge(baseCommerce);
    if (!forge
        || forge.commodities.length !== 3
        || forge.markets.length !== 2
        || forge.transportKinds.length !== 1
        || forge.resourceFlows !== undefined) {
        fail(`9. legacy commerce shape: ${JSON.stringify(forge)}`);
    } else if (forge.commodities[0].id !== 'wheat' || forge.markets[0].locationId !== 'town') {
        fail('9. legacy commodity/market ids changed');
    } else {
        ok('9. existing commerce parsing unchanged when field absent');
    }
}

// =========================================================================
// Delta helper (10–16)
// =========================================================================

const sampleMarkets = {
    town: {
        wheat: { stock: 10, priceIndex: 1.25 },
        sakuradite: { stock: 5, priceIndex: 2.0 },
        steel: { stock: 8, priceIndex: 0.9 },
    },
    port: {
        wheat: { stock: 3, priceIndex: 1.1 },
        sakuradite: { stock: 0, priceIndex: 1.0 },
    },
};

// 10. Input markets not mutated
{
    const markets = deepClone(sampleMarkets);
    const before = deepClone(markets);
    applyEconomyFlowMarketDeltas(markets, [
        { nodeId: 't', marketLocationId: 'town', commodityId: 'wheat', supplied: 2, consumed: 0, delta: 2 },
    ]);
    if (JSON.stringify(markets) !== JSON.stringify(before)) {
        fail('10. input markets mutated');
    } else {
        ok('10. input markets are not mutated');
    }
}

// 11. Valid stock deltas applied
{
    const result = applyEconomyFlowMarketDeltas(sampleMarkets, [
        { nodeId: 't', marketLocationId: 'town', commodityId: 'wheat', supplied: 4, consumed: 1, delta: 3 },
    ]);
    if (!approx(result.town.wheat.stock, 13)) {
        fail(`11. stock not applied: ${result.town.wheat.stock}`);
    } else {
        ok('11. valid stock deltas applied');
    }
}

// 12. Negative resulting stock clamps to zero
{
    const result = applyEconomyFlowMarketDeltas(sampleMarkets, [
        { nodeId: 't', marketLocationId: 'town', commodityId: 'wheat', supplied: 0, consumed: 99, delta: -99 },
    ]);
    if (result.town.wheat.stock !== 0) {
        fail(`12. clamp failed: ${result.town.wheat.stock}`);
    } else {
        ok('12. negative resulting stock clamps to zero');
    }
}

// 13. priceIndex byte-for-byte unchanged
{
    const result = applyEconomyFlowMarketDeltas(sampleMarkets, [
        { nodeId: 't', marketLocationId: 'town', commodityId: 'wheat', supplied: 1, consumed: 0, delta: 1 },
        { nodeId: 't', marketLocationId: 'town', commodityId: 'sakuradite', supplied: 0, consumed: 2, delta: -2 },
    ]);
    if (result.town.wheat.priceIndex !== 1.25
        || result.town.sakuradite.priceIndex !== 2.0
        || result.town.steel.priceIndex !== 0.9
        || result.port.wheat.priceIndex !== 1.1) {
        fail(`13. priceIndex changed: ${JSON.stringify(result)}`);
    } else {
        ok('13. priceIndex remains byte-for-byte unchanged');
    }
}

// 14. Unknown market/commodity targets ignored
{
    const result = applyEconomyFlowMarketDeltas(sampleMarkets, [
        { nodeId: 'x', marketLocationId: 'nowhere', commodityId: 'wheat', supplied: 1, consumed: 0, delta: 5 },
        { nodeId: 'x', marketLocationId: 'town', commodityId: 'unicorn', supplied: 1, consumed: 0, delta: 5 },
    ]);
    if (JSON.stringify(result) !== JSON.stringify(sampleMarkets)
        && result !== sampleMarkets) {
        // May return same ref or equal clone — both OK if values unchanged
        if (JSON.stringify(result) !== JSON.stringify(sampleMarkets)) {
            fail(`14. unknown targets altered markets: ${JSON.stringify(result)}`);
        } else {
            ok('14. unknown market/commodity targets ignored');
        }
    } else {
        ok('14. unknown market/commodity targets ignored');
    }
}

// 15. Non-finite deltas ignored
{
    const result = applyEconomyFlowMarketDeltas(sampleMarkets, [
        { nodeId: 't', marketLocationId: 'town', commodityId: 'wheat', supplied: 0, consumed: 0, delta: NaN },
        { nodeId: 't', marketLocationId: 'town', commodityId: 'wheat', supplied: 0, consumed: 0, delta: Infinity },
        null,
        { nodeId: 't', marketLocationId: 'town', commodityId: 'wheat', supplied: 0, consumed: 0, delta: 2 },
    ]);
    if (!approx(result.town.wheat.stock, 12)) {
        fail(`15. non-finite handling: ${result.town.wheat.stock}`);
    } else {
        ok('15. non-finite deltas ignored');
    }
}

// 16. Untouched entries preserve object values
{
    const markets = deepClone(sampleMarkets);
    const steelBefore = markets.town.steel;
    const portBefore = markets.port;
    const result = applyEconomyFlowMarketDeltas(markets, [
        { nodeId: 't', marketLocationId: 'town', commodityId: 'wheat', supplied: 1, consumed: 0, delta: 1 },
    ]);
    if (result.town.steel !== steelBefore) {
        // Prefer same reference for untouched commodity
        if (JSON.stringify(result.town.steel) !== JSON.stringify(steelBefore)) {
            fail('16. untouched steel values changed');
        } else {
            ok('16. untouched entries preserve object values');
        }
    } else if (result.port !== portBefore) {
        if (JSON.stringify(result.port) !== JSON.stringify(portBefore)) {
            fail('16. untouched port values changed');
        } else {
            ok('16. untouched entries preserve object values');
        }
    } else {
        ok('16. untouched entries preserve object values');
    }
}

// =========================================================================
// Tick integration (17–24)
// =========================================================================

const emptyRegistry = { version: '1', npcs: {} };

function baseMarkets() {
    return {
        town: {
            wheat: { stock: 10, priceIndex: 1.0 },
            sakuradite: { stock: 0, priceIndex: 1.5 },
            steel: { stock: 5, priceIndex: 1.0 },
        },
        port: {
            wheat: { stock: 10, priceIndex: 1.0 },
            sakuradite: { stock: 0, priceIndex: 1.0 },
        },
    };
}

// 17. Flow only when commerce enabled and definition exists
{
    const withFlow = parseCommerceForge({ ...baseCommerce, resourceFlows: sampleFlows });
    const withoutFlow = parseCommerceForge(baseCommerce);
    const a = runLivingWorldTick({
        forge: withFlow,
        markets: baseMarkets(),
        registry: emptyRegistry,
        npcPositions: {},
        worldTurn: 1,
        commerceEnabled: true,
        agencyEnabled: false,
    });
    const b = runLivingWorldTick({
        forge: withFlow,
        markets: baseMarkets(),
        registry: emptyRegistry,
        npcPositions: {},
        worldTurn: 1,
        commerceEnabled: false,
        agencyEnabled: false,
    });
    const c = runLivingWorldTick({
        forge: withoutFlow,
        markets: baseMarkets(),
        registry: emptyRegistry,
        npcPositions: {},
        worldTurn: 1,
        commerceEnabled: true,
        agencyEnabled: false,
    });
    if (!a.economyFlow || b.economyFlow !== null || c.economyFlow !== null) {
        fail(`17. opt-in gating: a=${!!a.economyFlow} b=${b.economyFlow} c=${c.economyFlow}`);
    } else {
        ok('17. flow only when commerce enabled and definition exists');
    }
}

// 18. Flow production/import affects returned market stock
{
    const forge = parseCommerceForge({ ...baseCommerce, resourceFlows: sampleFlows });
    // targetStock 30, sakuradite open 0; import 10, demand 3 → delta +7; recovery may add too
    // After flow: stock 7; recovery toward 30 with +2 → 9
    const tick = runLivingWorldTick({
        forge,
        markets: baseMarkets(),
        registry: emptyRegistry,
        npcPositions: {},
        worldTurn: 1,
        commerceEnabled: true,
        agencyEnabled: false,
    });
    const stock = tick.markets.town.sakuradite.stock;
    // At least the flow contribution is visible (7 + recovery 2 = 9 under default)
    if (stock < 7) {
        fail(`18. stock too low after flow: ${stock}`);
    } else {
        ok('18. flow production/import affects returned market stock');
    }
}

// 19. Demand reduces stock without going negative
{
    const flows = {
        nodes: [
            { id: 'town_node', kind: 'settlement', label: 'Town', marketLocationId: 'town' },
        ],
        productionSources: [],
        demands: [
            { id: 'd1', nodeId: 'town_node', commodityId: 'wheat', baseDemandPerTick: 100 },
        ],
        tradeRoutes: [],
    };
    const forge = parseCommerceForge({ ...baseCommerce, resourceFlows: flows });
    const markets = baseMarkets();
    markets.town.wheat.stock = 4;
    markets.town.wheat.priceIndex = 1.0;
    // Flow: available 4, fulfilled 4, delta -4 → 0; recovery +2 → 2
    const tick = runLivingWorldTick({
        forge,
        markets,
        registry: emptyRegistry,
        npcPositions: {},
        worldTurn: 1,
        commerceEnabled: true,
        agencyEnabled: false,
    });
    if (tick.markets.town.wheat.stock < 0) {
        fail(`19. negative stock: ${tick.markets.town.wheat.stock}`);
    } else if (tick.economyFlow.nodes[0].unmetDemand < 90) {
        fail(`19. unmet demand missing: ${JSON.stringify(tick.economyFlow.nodes)}`);
    } else {
        ok('19. demand reduces stock without going negative');
    }
}

// 20. Flow runs before existing market recovery
{
    // open=10, target=10 → recovery alone is no-op at target
    // demand 5: flow first → stock 5, recovery +2 → 7
    // recovery first would leave 10 then demand 5 → 5 (if inverted)
    const flows = {
        nodes: [
            { id: 'town_node', kind: 'settlement', label: 'Town', marketLocationId: 'town' },
        ],
        productionSources: [],
        demands: [
            { id: 'd1', nodeId: 'town_node', commodityId: 'wheat', baseDemandPerTick: 5 },
        ],
        tradeRoutes: [],
    };
    const forge = parseCommerceForge({
        ...baseCommerce,
        markets: [
            { locationId: 'town', commodityIds: ['wheat', 'sakuradite', 'steel'], targetStock: 10 },
            { locationId: 'port', commodityIds: ['wheat', 'sakuradite'], targetStock: 30 },
        ],
        resourceFlows: flows,
    });
    const markets = baseMarkets();
    markets.town.wheat = { stock: 10, priceIndex: 1.0 };
    const tick = runLivingWorldTick({
        forge,
        markets,
        registry: emptyRegistry,
        npcPositions: {},
        worldTurn: 1,
        commerceEnabled: true,
        agencyEnabled: false,
        economyProfile: 'normal', // recoveryPerTick = 2
    });
    // Expected: flow-before-recovery → 7
    if (!approx(tick.markets.town.wheat.stock, 7)) {
        fail(`20. expected stock 7 (flow then recover), got ${tick.markets.town.wheat.stock}`);
    } else {
        ok('20. flow runs before existing market recovery');
    }
}

// 21. economyFlow contains route/node/delta summaries
{
    const forge = parseCommerceForge({ ...baseCommerce, resourceFlows: sampleFlows });
    const tick = runLivingWorldTick({
        forge,
        markets: baseMarkets(),
        registry: emptyRegistry,
        npcPositions: {},
        worldTurn: 1,
        commerceEnabled: true,
        agencyEnabled: false,
    });
    const ef = tick.economyFlow;
    if (!ef || !Array.isArray(ef.routes) || !Array.isArray(ef.nodes)
        || !Array.isArray(ef.marketDeltas) || !Array.isArray(ef.diagnostics)) {
        fail(`21. missing summary arrays: ${JSON.stringify(ef && Object.keys(ef))}`);
    } else if (ef.routes.length < 1 || ef.nodes.length < 1 || ef.marketDeltas.length < 1) {
        fail(`21. empty summaries: routes=${ef.routes.length} nodes=${ef.nodes.length} deltas=${ef.marketDeltas.length}`);
    } else {
        ok('21. economyFlow contains route/node/delta summaries');
    }
}

// 22. Missing flow definition → economyFlow null
{
    const forge = parseCommerceForge(baseCommerce);
    const tick = runLivingWorldTick({
        forge,
        markets: baseMarkets(),
        registry: emptyRegistry,
        npcPositions: {},
        worldTurn: 1,
        commerceEnabled: true,
        agencyEnabled: false,
    });
    if (tick.economyFlow !== null) {
        fail(`22. expected null, got ${JSON.stringify(tick.economyFlow)}`);
    } else {
        ok('22. missing flow definition returns economyFlow: null');
    }
}

// 23. Commerce disabled → economyFlow null
{
    const forge = parseCommerceForge({ ...baseCommerce, resourceFlows: sampleFlows });
    const tick = runLivingWorldTick({
        forge,
        markets: baseMarkets(),
        registry: emptyRegistry,
        npcPositions: {},
        worldTurn: 1,
        commerceEnabled: false,
        agencyEnabled: false,
    });
    if (tick.economyFlow !== null) {
        fail('23. commerce disabled should return null economyFlow');
    } else if (JSON.stringify(tick.markets) !== JSON.stringify(baseMarkets())) {
        // markets should be untouched input reference or equal values
        // advanceNpcArrivals only for positions — markets stay input when commerce off
        if (tick.markets !== baseMarkets() && JSON.stringify(tick.markets) !== JSON.stringify(baseMarkets())) {
            fail('23. markets changed while commerce disabled');
        } else {
            ok('23. commerce disabled returns economyFlow: null');
        }
    } else {
        ok('23. commerce disabled returns economyFlow: null');
    }
}

// 24. No-flow legacy tick result unchanged apart from nullable field
{
    const forge = parseCommerceForge(baseCommerce);
    // At target with priceIndex === 1.0, legacy recovery is a pure no-op.
    const markets = {
        town: {
            wheat: { stock: 30, priceIndex: 1.0 },
            sakuradite: { stock: 30, priceIndex: 1.0 },
            steel: { stock: 30, priceIndex: 1.0 },
        },
        port: {
            wheat: { stock: 30, priceIndex: 1.0 },
            sakuradite: { stock: 30, priceIndex: 1.0 },
        },
    };
    const tick = runLivingWorldTick({
        forge,
        markets,
        registry: emptyRegistry,
        npcPositions: {},
        worldTurn: 3,
        commerceEnabled: true,
        agencyEnabled: false,
    });
    if (tick.economyFlow !== null) {
        fail('24. legacy should have null economyFlow');
    } else if (!approx(tick.markets.town.wheat.stock, 30)
        || !approx(tick.markets.town.sakuradite.stock, 30)) {
        fail(`24. legacy stocks changed without need: wheat=${tick.markets.town.wheat.stock}`);
    } else if (!tick.marketSummary || tick.marketSummary.worldTurn !== 3) {
        fail(`24. marketSummary missing: ${JSON.stringify(tick.marketSummary)}`);
    } else if (tick.markets.town.sakuradite.priceIndex !== 1.0
        || tick.markets.town.wheat.priceIndex !== 1.0) {
        fail(`24. unexpected priceIndex: ${JSON.stringify(tick.markets.town)}`);
    } else {
        ok('24. no-flow legacy tick result unchanged apart from economyFlow field');
    }
}

// Extra: priceIndex not changed by flow delta path under integration
{
    const forge = parseCommerceForge({ ...baseCommerce, resourceFlows: sampleFlows });
    const tick = runLivingWorldTick({
        forge,
        markets: baseMarkets(),
        registry: emptyRegistry,
        npcPositions: {},
        worldTurn: 1,
        commerceEnabled: true,
        agencyEnabled: false,
    });
    // Flow does not write priceIndex; recovery may drift only when stock>=target and price>1.
    // sakuradite opens at 0, after flow 7, still < target 30 → may bump price if < 0.3*target
    // 7 < 9 → legacy may +0.05 price. That's recovery, not flow — OK.
    // Just ensure flow helper itself didn't invent markets.
    if (!tick.markets.town.sakuradite || typeof tick.markets.town.sakuradite.priceIndex !== 'number') {
        fail('priceIndex missing after integration');
    } else {
        ok('integration preserves priceIndex field presence');
    }
}

// Direct delta helper + computeEconomyFlowTick compose
{
    const forge = parseCommerceForge({ ...baseCommerce, resourceFlows: sampleFlows });
    const markets = baseMarkets();
    const flow = computeEconomyFlowTick({
        definition: forge.resourceFlows,
        forge,
        markets,
    });
    const applied = applyEconomyFlowMarketDeltas(markets, flow.marketDeltas);
    const delta = flow.marketDeltas.find((d) => d.commodityId === 'sakuradite');
    if (!delta || !approx(delta.delta, 7)) {
        fail(`compose delta: ${JSON.stringify(delta)}`);
    } else if (!approx(applied.town.sakuradite.stock, 7)
        || applied.town.sakuradite.priceIndex !== markets.town.sakuradite.priceIndex) {
        fail(`compose apply: ${JSON.stringify(applied.town.sakuradite)}`);
    } else {
        ok('compose compute + apply preserves priceIndex');
    }
}

if (failed > 0) {
    console.error(`\n${failed} failure(s)`);
    process.exit(1);
}
console.log('\nAll economy flow integration tests passed.');
process.exit(0);
