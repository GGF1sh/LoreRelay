#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const corePath = path.join(root, 'out', 'livingWorldCommerceUiCore.js');
const forgePath = path.join(root, 'out', 'livingWorldForgeCore.js');
const samplePath = path.join(root, 'sample-scenarios', 'trade-routes', 'world_forge.json');

let failed = 0;
function ok(msg) { console.log(`OK: ${msg}`); }
function fail(msg, err) {
    console.error(`FAIL: ${msg}`);
    if (err) {
        console.error(err.stack || err.message || String(err));
    }
    failed++;
}
function run(name, fn) {
    try {
        fn();
        ok(name);
    } catch (err) {
        fail(name, err);
    }
}
function clone(value) {
    return JSON.parse(JSON.stringify(value));
}

for (const file of [corePath, forgePath]) {
    if (!fs.existsSync(file)) {
        fail(`${file} missing - run npm run compile`);
        process.exit(1);
    }
}

const {
    buildCommerceDecisionSurface,
    executeDirectTrade,
} = require(corePath);
const { parseCommerceForge } = require(forgePath);

const sample = JSON.parse(fs.readFileSync(samplePath, 'utf8'));
const commerceForge = parseCommerceForge(sample.commerce);
const locations = sample.geography.locations;
const regions = sample.geography.regions;

function q(commodityId, unitPrice, stock, priceIndex, commodityName) {
    return { commodityId, commodityName: commodityName || commodityId, unitPrice, stock, priceIndex };
}

function baseMarkets() {
    return [
        {
            locationId: 'elda_shop',
            locationName: "Elda's Shop",
            quotes: [
                q('wheat', 10, 35, 1, 'Wheat'),
                q('steel', 45, 12, 1, 'Steel'),
            ],
        },
        {
            locationId: 'south_port',
            locationName: 'South Port',
            quotes: [
                q('wheat', 13, 8, 1.3, 'Wheat'),
                q('steel', 55, 2, 1.22, 'Steel'),
                q('spice', 90, 4, 1.1, 'Spice'),
            ],
        },
        {
            locationId: 'north_farm',
            locationName: 'North Farm',
            quotes: [
                q('wheat', 12, 6, 1.2, 'Wheat'),
            ],
        },
    ];
}

function baseInput(overrides = {}) {
    return {
        commerceForge,
        marketTables: baseMarkets(),
        playerCommerce: {
            cargo: [
                { commodityId: 'wheat', qty: 2 },
                { commodityId: 'steel', qty: 1 },
            ],
            transportId: 'wagon',
        },
        currentLocationId: 'elda_shop',
        locations,
        regions,
        discoveredLocationIds: ['elda_shop', 'south_port', 'north_farm'],
        discoveredRegionIds: ['r_central', 'r_south', 'r_north'],
        recentChanges: [],
        marketFactionIds: {},
        factionReputations: {},
        ...overrides,
    };
}

function surface(overrides) {
    return buildCommerceDecisionSurface(baseInput(overrides));
}

function assertNoFutureFields(value) {
    const forbidden = new Set([
        'expectedArrivalPrice',
        'expectedProfit',
        'profit',
        'risk',
        'score',
        'rankingScore',
        'recommendation',
    ]);
    function visit(node) {
        if (!node || typeof node !== 'object') { return; }
        for (const key of Object.keys(node)) {
            assert(!forbidden.has(key), `forbidden field leaked: ${key}`);
            visit(node[key]);
        }
    }
    visit(value);
}

run('no held cargo produces no Decision Surface candidates', () => {
    assert.deepStrictEqual(surface({ playerCommerce: { cargo: [], transportId: 'wagon' } }), []);
});

run('remote commodity without matching current-market quote is not eligible', () => {
    const out = surface({
        playerCommerce: { cargo: [{ commodityId: 'spice', qty: 1 }], transportId: 'wagon' },
    });
    assert.deepStrictEqual(out, []);
});

run('eligibility uses actual unitPrice, not priceIndex alone', () => {
    const out = surface({
        playerCommerce: { cargo: [{ commodityId: 'wheat', qty: 1 }], transportId: 'wagon' },
        marketTables: [
            { locationId: 'elda_shop', locationName: "Elda's Shop", quotes: [q('wheat', 20, 35, 1, 'Wheat')] },
            { locationId: 'south_port', locationName: 'South Port', quotes: [q('wheat', 18, 8, 2.5, 'Wheat')] },
        ],
    });
    assert.deepStrictEqual(out, []);
});

run('eligible markets preserve forge/market order and expose no ranking score', () => {
    const out = surface();
    assert.deepStrictEqual(out.map((market) => market.locationId), ['south_port', 'north_farm']);
    assertNoFutureFields(out);
});

run('undiscovered remote locations do not reveal exact opportunity cards', () => {
    const out = surface({
        discoveredLocationIds: ['elda_shop'],
        discoveredRegionIds: ['r_central'],
    });
    assert.deepStrictEqual(out, []);
});

run('sample one-hop wagon travel preview is stable for Elda to South Port', () => {
    const out = surface({
        playerCommerce: { cargo: [{ commodityId: 'wheat', qty: 2 }], transportId: 'wagon' },
        marketTables: [
            { locationId: 'elda_shop', locationName: "Elda's Shop", quotes: [q('wheat', 10, 35, 1, 'Wheat')] },
            { locationId: 'south_port', locationName: 'South Port', quotes: [q('wheat', 13, 8, 1.3, 'Wheat')] },
        ],
    });
    assert.strictEqual(out.length, 1);
    assert.strictEqual(out[0].locationId, 'south_port');
    assert.deepStrictEqual(out[0].quotes[0].travelPreview, {
        days: 1,
        foodCost: 2,
        transportName: 'Wagon',
    });
});

run('food-crisis wheat quote receives recent event, reputation, and low-stock evidence', () => {
    const out = surface({
        playerCommerce: { cargo: [{ commodityId: 'wheat', qty: 2 }], transportId: 'wagon' },
        marketTables: [
            { locationId: 'elda_shop', locationName: "Elda's Shop", quotes: [q('wheat', 10, 35, 1, 'Wheat')] },
            { locationId: 'south_port', locationName: 'South Port', quotes: [q('wheat', 13, 8, 1.3, 'Wheat')] },
        ],
        recentChanges: [{
            worldTurn: 7,
            category: 'resource',
            severity: 'warning',
            message: 'Food shortage lifts wheat prices at the port.',
            regionId: 'r_south',
        }],
        marketFactionIds: { south_port: 'faction_port' },
        factionReputations: { faction_port: -70 },
    });
    assert.deepStrictEqual(
        out[0].quotes[0].evidence,
        ['recent_event', 'reputation_hostile', 'low_stock']
    );
});

run('steel improvement event is not evidence for elevated steel', () => {
    const out = surface({
        playerCommerce: { cargo: [{ commodityId: 'steel', qty: 1 }], transportId: 'wagon' },
        marketTables: [
            { locationId: 'elda_shop', locationName: "Elda's Shop", quotes: [q('steel', 45, 12, 1, 'Steel')] },
            { locationId: 'south_port', locationName: 'South Port', quotes: [q('steel', 55, 8, 1.2, 'Steel')] },
        ],
        recentChanges: [{
            worldTurn: 8,
            category: 'resource',
            severity: 'info',
            message: 'Steel craft improves after a smiths guild shipment.',
            regionId: 'r_south',
        }],
    });
    assert(!out[0].quotes[0].evidence.includes('recent_event'));
});

run('Decision Surface generation is mutation-free', () => {
    const input = baseInput();
    const before = clone(input);
    const out = buildCommerceDecisionSurface(input);
    assert(out.length > 0);
    assert.deepStrictEqual(input, before);
});

run('wrong-location direct buy/sell remains rejected by production Core', () => {
    const markets = {
        south_port: { wheat: { stock: 10, unitPrice: 13, priceIndex: 1.3 } },
        elda_shop: { wheat: { stock: 35, unitPrice: 10, priceIndex: 1 } },
    };
    const commerce = {
        credits: 100,
        cargo: [{ commodityId: 'wheat', qty: 1 }],
        transportId: 'wagon',
        food: 30,
        playerRole: 'merchant',
    };
    const buy = executeDirectTrade(commerceForge, markets, commerce, {
        op: 'buy',
        marketLocationId: 'south_port',
        commodityId: 'wheat',
        qty: 1,
        currentLocationId: 'elda_shop',
    });
    const sell = executeDirectTrade(commerceForge, markets, commerce, {
        op: 'sell',
        marketLocationId: 'south_port',
        commodityId: 'wheat',
        qty: 1,
        currentLocationId: 'elda_shop',
    });
    assert.strictEqual(buy.ok, false);
    assert.strictEqual(buy.reason, 'WRONG_LOCATION');
    assert.strictEqual(sell.ok, false);
    assert.strictEqual(sell.reason, 'WRONG_LOCATION');
});

if (failed > 0) {
    process.exit(1);
}
console.log('gameplay slice1 Decision Surface: all tests passed.');
