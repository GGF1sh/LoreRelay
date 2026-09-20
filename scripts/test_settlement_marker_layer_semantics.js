#!/usr/bin/env node
'use strict';

/**
 * Settlement Z-level marker semantics — people and low stock on z0 only;
 * incidents on associated structure layer (ChatGPT PR5).
 */

const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const viewCorePath = path.join(root, 'out', 'settlementViewCore.js');
const settlementCorePath = path.join(root, 'out', 'settlementCore.js');

let failed = 0;
function fail(msg) { console.error(`FAIL: ${msg}`); failed++; }
function ok(msg) { console.log(`OK: ${msg}`); }

for (const p of [viewCorePath, settlementCorePath]) {
    if (!fs.existsSync(p)) {
        fail(`${p} missing — run npm run compile first`);
        process.exit(1);
    }
}

const { buildSettlementViewSnapshot } = require(viewCorePath);
const { parseSettlementState } = require(settlementCorePath);

const baseState = parseSettlementState({
    version: 1,
    settlementId: 'scrapbound_hub',
    name: 'Scrapbound Enclave',
    morale: 55,
    safety: 40,
    stocks: [
        { id: 'food', amount: 0 },
        { id: 'parts', amount: 2 },
        { id: 'water', amount: 10 },
    ],
    structures: [
        { id: 'market_hall', name: 'Market Hall', status: 'intact', layerId: 'z0' },
        { id: 'cellar_store', name: 'Cellar Store', status: 'intact', layerId: 'z-1' },
    ],
    residents: [{ npcId: 'resident_1', role: 'guard' }],
    visitors: [{ npcId: 'visitor_1', untilWorldTurn: 20, purpose: 'trade' }],
    merchants: [{ npcId: 'trader_1', untilWorldTurn: 25, wares: ['parts'] }],
    incidents: [
        {
            id: 'inc_surface',
            worldTurn: 3,
            kind: 'market_hall',
            severity: 'warning',
            resolved: false,
            text: 'Surface incident',
        },
        {
            id: 'inc_cellar',
            worldTurn: 4,
            kind: 'cellar_store',
            severity: 'critical',
            resolved: false,
            text: 'Cellar incident',
        },
        {
            id: 'inc_orphan',
            worldTurn: 5,
            kind: 'shortage',
            severity: 'info',
            resolved: false,
            text: 'No matching structure',
        },
    ],
});

if (!baseState) {
    fail('fixture state should parse');
    process.exit(1);
}

function markerIds(snapshot) {
    return new Set((snapshot?.markers ?? []).map((m) => m.id));
}

{
    const z0 = buildSettlementViewSnapshot({ state: baseState, selectedLayerId: 'z0' });
    const zNeg1 = buildSettlementViewSnapshot({ state: baseState, selectedLayerId: 'z-1' });
    if (!z0 || !zNeg1) {
        fail('layer snapshots should build');
    } else {
        const z0Ids = markerIds(z0);
        const zNeg1Ids = markerIds(zNeg1);
        if (!z0Ids.has('resident_resident_1') || !z0Ids.has('visitor_visitor_1') || !z0Ids.has('merchant_trader_1')) {
            fail(`z0 should show people markers: ${[...z0Ids].join(', ')}`);
        } else if (zNeg1Ids.has('resident_resident_1') || zNeg1Ids.has('visitor_visitor_1') || zNeg1Ids.has('merchant_trader_1')) {
            fail('people markers must not repeat on non-z0 layers');
        } else {
            ok('residents/visitors/merchants appear on z0 only');
        }
    }
}

{
    const z0 = buildSettlementViewSnapshot({ state: baseState, selectedLayerId: 'z0' });
    const zNeg1 = buildSettlementViewSnapshot({ state: baseState, selectedLayerId: 'z-1' });
    const z0Low = (z0?.markers ?? []).filter((m) => m.kind === 'stock_low');
    const zNeg1Low = (zNeg1?.markers ?? []).filter((m) => m.kind === 'stock_low');
    if (!z0Low.length) {
        fail('z0 should include low/depleted stock markers');
    } else if (zNeg1Low.length) {
        fail('low stock markers must not appear on non-z0 layers');
    } else {
        ok('stock_low markers appear on z0 only');
    }
}

{
    const z0 = buildSettlementViewSnapshot({ state: baseState, selectedLayerId: 'z0' });
    const zNeg1 = buildSettlementViewSnapshot({ state: baseState, selectedLayerId: 'z-1' });
    const z0Ids = markerIds(z0);
    const zNeg1Ids = markerIds(zNeg1);
    if (!z0Ids.has('incident_inc_surface') || !z0Ids.has('incident_inc_orphan')) {
        fail(`z0 should show surface-linked and orphan incidents: ${[...z0Ids].join(', ')}`);
    } else if (z0Ids.has('incident_inc_cellar')) {
        fail('cellar incident should not appear on z0');
    } else if (!zNeg1Ids.has('incident_inc_cellar')) {
        fail('cellar incident should appear on z-1');
    } else if (zNeg1Ids.has('incident_inc_surface') || zNeg1Ids.has('incident_inc_orphan')) {
        fail('surface/orphan incidents should not appear on z-1');
    } else {
        ok('incidents follow associated structure layer (default z0 when unmatched)');
    }
}

{
    const z1 = buildSettlementViewSnapshot({ state: baseState, selectedLayerId: 'z1' });
    const z1People = (z1?.markers ?? []).filter((m) => ['resident', 'visitor', 'merchant'].includes(m.kind));
    if (z1People.length) {
        fail(`z1 should not show people markers: ${JSON.stringify(z1People)}`);
    } else {
        ok('upper layer (z1) does not duplicate people markers');
    }
}

if (failed > 0) {
    console.error(`\n${failed} test(s) failed.`);
    process.exit(1);
}
console.log('settlement marker layer semantics: all tests passed.');