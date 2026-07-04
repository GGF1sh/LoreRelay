#!/usr/bin/env node
'use strict';

const path = require('path');
const fs = require('fs');
const root = path.join(__dirname, '..');

let failed = 0;
function fail(msg) { console.error(`FAIL: ${msg}`); failed++; }
function ok(msg) { console.log(`OK: ${msg}`); }

const paths = [
    'out/livingWorldForgeCore.js',
    'out/livingWorldBridge.js',
    'out/commerceCore.js',
    'out/worldKitTickCore.js',
];
for (const p of paths) {
    if (!fs.existsSync(path.join(root, p))) {
        fail(`${p} missing — run npm run compile`);
        process.exit(1);
    }
}

const { parseCommerceForge } = require(path.join(root, 'out', 'livingWorldForgeCore.js'));
const {
    livingWorldEnabled,
    tickLivingWorldAfterSim,
    recordLocationVisit,
    buildLivingWorldGmLines,
} = require(path.join(root, 'out', 'livingWorldBridge.js'));
const fixture = JSON.parse(fs.readFileSync(path.join(root, '..', 'lorerelay-world-kit', 'fixtures', 'trade_routes_forge.json'), 'utf-8'));

{
    const commerce = parseCommerceForge(fixture.commerce);
    if (!commerce || commerce.markets.length !== 3) {
        fail('parseCommerceForge');
    } else {
        ok('parseCommerceForge');
    }
}

{
    if (!livingWorldEnabled({ enableCommerce: true })) { fail('commerce enabled'); }
    else if (livingWorldEnabled({ enableCommerce: false, enableNpcAgency: false })) { fail('both off'); }
    else { ok('livingWorldEnabled'); }
}

{
    const forge = {
        format: 'test',
        meta: { worldName: 't' },
        geography: { regions: [], locations: [] },
        factions: [],
        loreHistory: [],
        initialNpcs: [],
    };
    const foodCrisisEvent = {
        worldTurn: 5,
        category: 'resource',
        severity: 'warning',
        message: 'Food reserves are low',
        regionId: 'r_central',
    };
    const state = {
        format: 'lorerelay-world-state/1.1',
        worldTurn: 5,
        factions: {},
    };
    const rules = { enableCommerce: true, enableNpcAgency: true, enableNpcRegistry: true };
    const outcome = tickLivingWorldAfterSim(forge, state, undefined, rules, fixture, [foodCrisisEvent]);
    if (!outcome.state.markets || !Object.keys(outcome.state.markets).length) {
        fail('tick should init markets');
    } else {
        ok('tickLivingWorldAfterSim');
    }
}

{
    const commerce = parseCommerceForge(fixture.commerce);
    const forge = {
        format: 'test',
        meta: { worldName: 'Trade Routes' },
        geography: {
            regions: [],
            locations: [
                { id: 'elda_shop', name: "Elda's Shop" },
                { id: 'south_port', name: 'South Port' },
            ],
        },
        factions: [],
        loreHistory: [],
        initialNpcs: [],
    };
    const markets = {
        elda_shop: { wheat: { stock: 12, priceIndex: 1.0 }, steel: { stock: 3, priceIndex: 1.2 } },
        south_port: { wheat: { stock: 8, priceIndex: 1.35 } },
    };
    let ws = {
        format: 'lorerelay-world-state/1.1',
        worldTurn: 5,
        factions: {},
        markets,
    };
    ws = recordLocationVisit(ws, 'elda_shop', markets);
    const ticked = {
        ...markets,
        elda_shop: { wheat: { stock: 28, priceIndex: 1.15 }, steel: { stock: 10, priceIndex: 1.0 } },
    };
    const wsAfter = { ...ws, worldTurn: 10, markets: ticked };
    const lines = buildLivingWorldGmLines(
        forge,
        wsAfter,
        undefined,
        { enableCommerce: true, enableNpcAgency: false },
        fixture,
        'elda_shop'
    );
    if (!lines.includes('Since last visit') || !lines.includes('stock +')) {
        fail(`since-last-visit should show market delta: ${lines.slice(0, 200)}`);
    } else {
        ok('since-last-visit market delta after departure snapshot');
    }
}

if (failed > 0) { process.exit(1); }
console.log('All living world bridge tests passed.');