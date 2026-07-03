#!/usr/bin/env node
'use strict';

/**
 * Settlement expansion retry determinism — same expand_layer op at different worldTurn
 * yields identical layout (ChatGPT PR4).
 */

const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const corePath = path.join(root, 'out', 'settlementLayerExpansionCore.js');
const settlementCorePath = path.join(root, 'out', 'settlementCore.js');

let failed = 0;
function fail(msg) { console.error(`FAIL: ${msg}`); failed++; }
function ok(msg) { console.log(`OK: ${msg}`); }

for (const p of [corePath, settlementCorePath]) {
    if (!fs.existsSync(p)) {
        fail(`${p} missing — run npm run compile first`);
        process.exit(1);
    }
}

const { applyExpandLayerToLayout } = require(corePath);
const { emptySettlementState } = require(settlementCorePath);

const baseState = emptySettlementState('scrapbound_hub', 'Scrapbound Enclave');
baseState.safety = 30;

function expandOp(layerId, profile, extra = {}) {
    return { type: 'expand_layer', layerId, profile, ...extra };
}

{
    const op = expandOp('z-1', 'cellar');
    const at100 = applyExpandLayerToLayout(undefined, baseState, op, { worldTurn: 100 });
    const at200 = applyExpandLayerToLayout(undefined, baseState, op, { worldTurn: 200 });
    if (!at100.applied || !at200.applied) {
        fail('expansion should apply at both turns');
    } else if (JSON.stringify(at100.layout) !== JSON.stringify(at200.layout)) {
        fail('retry at different worldTurn must produce identical layout');
    } else {
        ok('default seed expansion is stable across worldTurn');
    }
}

{
    const op = expandOp('z1', 'watchtower');
    const stateLow = { ...baseState, worldTurn: 5 };
    const stateHigh = { ...baseState, worldTurn: 500 };
    const low = applyExpandLayerToLayout(undefined, stateLow, op);
    const high = applyExpandLayerToLayout(undefined, stateHigh, op);
    if (!low.applied || !high.applied) {
        fail('expansion should apply with state.worldTurn variance');
    } else if (JSON.stringify(low.layout) !== JSON.stringify(high.layout)) {
        fail('state.worldTurn must not affect default derived layout');
    } else {
        ok('state.worldTurn does not alter default expansion layout');
    }
}

{
    const op = expandOp('z-2', 'ruins', { seed: 77 });
    const a = applyExpandLayerToLayout(undefined, baseState, op, { worldTurn: 1 });
    const b = applyExpandLayerToLayout(undefined, baseState, op, { worldTurn: 999, seed: 77 });
    if (!a.applied || !b.applied) {
        fail('explicit seed expansion should apply');
    } else if (JSON.stringify(a.layout) !== JSON.stringify(b.layout)) {
        fail('explicit op.seed should dominate worldTurn');
    } else {
        ok('explicit op.seed remains deterministic across worldTurn');
    }
}

if (failed > 0) {
    console.error(`\n${failed} test(s) failed.`);
    process.exit(1);
}
console.log('settlement expansion retry determinism: all tests passed.');