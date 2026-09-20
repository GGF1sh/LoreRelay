#!/usr/bin/env node
/**
 * Unit tests for Since-last-visit delta logic in livingWorldBridge.ts.
 * Requires: npm run compile.
 */
const Module = require('module');

// Stub vscode and fs modules so bridge imports resolve in Node.js
const origRequire = Module.prototype.require;
Module.prototype.require = function (id) {
    if (id === 'vscode') {
        return {
            window: { showErrorMessage() {}, showWarningMessage() {} },
            workspace: {
                getConfiguration() {
                    return {
                        get(key, def) {
                            if (key === 'autoLocationImage') return false;
                            if (key === 'fogInPrompt') return false;
                            return def;
                        }
                    };
                }
            }
        };
    }
    if (id === 'fs') {
        return {
            existsSync: () => false,
            readFileSync: () => '{}',
            statSync: () => ({ mtimeMs: 0 }),
            writeFileSync: () => {}
        };
    }
    return origRequire.apply(this, arguments);
};

let recordLocationVisit;
let buildLivingWorldGmLines;

try {
    const bridge = require('../out/livingWorldBridge');
    recordLocationVisit = bridge.recordLocationVisit;
    buildLivingWorldGmLines = bridge.buildLivingWorldGmLines;
} finally {
    Module.prototype.require = origRequire;
}

let failed = 0;
function fail(msg) {
    console.error(`FAIL: ${msg}`);
    failed++;
}
function ok(msg) {
    console.log(`OK: ${msg}`);
}

// Mock Forge
const FORGE = {
    meta: { worldName: 'Test Eorzea' },
    geography: {
        regions: [
            { id: 'gridania', name: 'Gridania', connectedTo: [] }
        ],
        locations: [
            { id: 'north_farm', name: 'North Farm', regionId: 'gridania', type: 'farm' }
        ]
    },
    factions: [],
    loreHistory: []
};

const COMMERCE_FORGE = {
    commodities: [
        { id: 'wheat', name: 'Wheat', basePrice: 10, weight: 1, category: 'food' }
    ],
    markets: [
        {
            locationId: 'north_farm',
            commodityIds: ['wheat'],
            demands: [{ commodityId: 'wheat', dailyConsumption: 5, targetStock: 50, priceElasticity: 1.0 }]
        }
    ],
    transportKinds: []
};

// Raw forge doc mapping
const RAW_FORGE_DOC = {
    commerce: COMMERCE_FORGE
};

const RULES = {
    enableCommerce: true,
    enableNpcAgency: false,
    enableEmergentSimulation: true,
    enableWorldForge: true
};

function runTest() {
    console.log("Running Since-last-visit host test...");

    // 1. Initial state
    let state = {
        format: 'lorerelay-world-state/1.1',
        worldTurn: 10,
        lastSimulatedGmTurn: 10,
        factions: {},
        regions: {
            gridania: { dangerLevel: 1, controllingFaction: null, activeEvents: [] }
        },
        markets: {
            north_farm: {
                wheat: { stock: 100, priceIndex: 1.0 }
            }
        },
        lastVisitTurnByLocation: {},
        marketSnapshotByLocation: {}
    };

    // 2. Player departs from north_farm
    state = recordLocationVisit(state, 'north_farm', state.markets);

    ok("Player departed from north_farm. Snapshot captured.");
    if (!state.marketSnapshotByLocation || !state.marketSnapshotByLocation.north_farm) {
        return fail("marketSnapshotByLocation.north_farm was not created!");
    }
    const snap = state.marketSnapshotByLocation.north_farm.wheat;
    if (snap.stock !== 100 || snap.priceIndex !== 1.0) {
        return fail(`Invalid snapshot values: stock=${snap.stock}, priceIndex=${snap.priceIndex}`);
    }

    // 3. Time passes, markets recovery tick changes prices and stock
    state.worldTurn = 15;
    state.markets.north_farm.wheat.stock = 50; // Stock dropped
    state.markets.north_farm.wheat.priceIndex = 1.5; // Price increased

    // 4. Player returns to north_farm, build prompt lines
    const lines = buildLivingWorldGmLines(
        FORGE,
        state,
        undefined, // npc registry
        RULES,
        RAW_FORGE_DOC,
        'north_farm'
    );

    console.log("Generated GM prompt lines:\n" + lines);

    // 5. Verify Delta exists in prompt output
    if (!lines.includes('[Living World — Since last visit]')) {
        return fail("Prompt lines do not contain '[Living World — Since last visit]' section!");
    }
    if (!lines.includes('Wheat') || !lines.includes('50') || !lines.includes('15')) {
        return fail("Prompt lines do not describe correct stock or price changes!");
    }

    ok("Since-last-visit delta was successfully printed in prompt.");
}

try {
    runTest();
} catch (e) {
    fail("Test threw error: " + e.stack);
}

if (failed > 0) {
    console.error(`\nTest suite FAILED with ${failed} failure(s).`);
    process.exit(1);
} else {
    console.log("\nAll Since-last-visit host tests passed successfully.");
    process.exit(0);
}
