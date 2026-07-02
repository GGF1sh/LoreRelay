#!/usr/bin/env node
'use strict';

const path = require('path');
const fs = require('fs');
const Module = require('module');
const root = path.join(__dirname, '..');

let failed = 0;
function fail(msg) { console.error(`FAIL: ${msg}`); failed++; }
function ok(msg) { console.log(`OK: ${msg}`); }

const bulkPath = path.join(root, 'out', 'worldSimBulkCore.js');
const kitPath = path.join(root, 'out', 'worldKitTickCore.js');
const forgePath = path.join(root, 'out', 'livingWorldForgeCore.js');
const commercePath = path.join(root, 'out', 'commerceCore.js');

for (const p of [bulkPath, kitPath, forgePath, commercePath]) {
    if (!fs.existsSync(p)) {
        fail(`${p} missing — run npm run compile`);
        process.exit(1);
    }
}

const origRequire = Module.prototype.require;
Module.prototype.require = function (id) {
    if (id === 'vscode') {
        return { window: { showErrorMessage() {}, showWarningMessage() {} } };
    }
    if (id === 'fs') {
        return { existsSync: () => false, readFileSync: () => '{}', statSync: () => ({ mtimeMs: 0 }), writeFileSync: () => {} };
    }
    return origRequire.apply(this, arguments);
};

let runBulkWorldSimulation;
let runLivingWorldTick;
let parseCommerceForge;
let initializeMarketState;
try {
    ({ runBulkWorldSimulation } = require(bulkPath));
    ({ runLivingWorldTick } = require(kitPath));
    ({ parseCommerceForge } = require(forgePath));
    ({ initializeMarketState } = require(commercePath));
} finally {
    Module.prototype.require = origRequire;
}

const fixture = JSON.parse(fs.readFileSync(
    path.join(root, '..', 'lorerelay-world-kit', 'fixtures', 'trade_routes_forge.json'),
    'utf-8'
));
const commerce = parseCommerceForge(fixture.commerce);

const FORGE = {
    meta: { worldName: 'LW Bulk' },
    geography: {
        regions: [
            { id: 'r_north', name: 'North', type: 'plains', dangerLevel: 1, connectedTo: ['r_central'] },
            { id: 'r_central', name: 'Central', type: 'plains', dangerLevel: 2, connectedTo: ['r_north', 'r_south'] },
            { id: 'r_south', name: 'South', type: 'coast', dangerLevel: 3, connectedTo: ['r_central'] },
        ],
        locations: [],
    },
    factions: [
        { id: 'f1', name: 'Merchants', type: 'neutral', power: 40, enemies: [], allies: [] },
    ],
    loreHistory: [],
    initialNpcs: [],
};

const markets = initializeMarketState(commerce);
markets.north_farm.wheat.stock = 10;
const wheatBefore = markets.north_farm.wheat.stock;

const state = {
    format: 'lorerelay-world-state/1.1',
    worldTurn: 1,
    factions: {
        f1: { power: 40, morale: 50, resources: { food: 30, wheat: 20 }, recentEvents: [] },
    },
    regions: {
        r_north: { dangerLevel: 1, controllingFaction: 'f1', activeEvents: [] },
        r_central: { dangerLevel: 2, controllingFaction: 'f1', activeEvents: [] },
        r_south: { dangerLevel: 3, controllingFaction: 'f1', activeEvents: [] },
    },
    globalEvents: [],
    recentChanges: [],
    markets,
};

const result = runBulkWorldSimulation(FORGE, state, undefined, {
    steps: 3,
    enableNpcRegistry: false,
    afterStep: (next) => {
        const tick = runLivingWorldTick({
            forge: commerce,
            markets: next.markets ?? markets,
            registry: fixture.npcRegistry ?? {},
            npcPositions: next.npcPositions ?? {},
            worldTurn: next.worldTurn ?? 0,
            recentChanges: next.recentChanges ?? [],
            commerceEnabled: true,
            agencyEnabled: false,
        });
        return { ...next, markets: tick.markets };
    },
});

if (!result.ok) {
    fail('bulk sim with living world hook');
} else {
    ok('bulk sim with living world hook');
}

const wheatAfter = result.state.markets?.north_farm?.wheat?.stock ?? 0;
if (wheatAfter <= wheatBefore) {
    fail(`market stock should recover over bulk steps (${wheatBefore} -> ${wheatAfter})`);
} else {
    ok(`market stock recovered (${wheatBefore} -> ${wheatAfter})`);
}

if (failed > 0) {
    process.exit(1);
}
console.log('world sim living world: all tests passed.');