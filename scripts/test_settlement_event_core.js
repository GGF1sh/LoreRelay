#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const corePath = path.join(root, 'out', 'settlementEventCore.js');
const settlementCorePath = path.join(root, 'out', 'settlementCore.js');

let failed = 0;
function fail(msg) { console.error(`FAIL: ${msg}`); failed++; }
function ok(msg) { console.log(`OK: ${msg}`); }

for (const p of [corePath, settlementCorePath]) {
    if (!fs.existsSync(p)) {
        fail(`${p} missing - run npm run compile first`);
        process.exit(1);
    }
}

const {
    selectSettlementEvent,
    computeSettlementEventWeights,
    deriveLegacyNote,
} = require(corePath);
const { emptySettlementState } = require(settlementCorePath);

function baseState(overrides = {}) {
    return {
        ...emptySettlementState('hub', 'Hub'),
        morale: 50,
        safety: 50,
        stocks: [{ id: 'food', amount: 10 }],
        structures: [],
        residents: [],
        visitors: [],
        merchants: [],
        incidents: [],
        ...overrides,
    };
}

{
    const state = baseState();
    const ctx = { worldTurn: 5, seed: 42 };
    const a = selectSettlementEvent(state, ctx);
    const b = selectSettlementEvent(state, ctx);
    if (JSON.stringify(a) !== JSON.stringify(b)) {
        fail('selection must be deterministic for fixed seed');
    } else {
        ok('deterministic selection');
    }
}

{
    const baseline = computeSettlementEventWeights(baseState(), { worldTurn: 1, seed: 1 });
    const lowSafety = computeSettlementEventWeights(
        baseState({ safety: 15 }),
        { worldTurn: 1, seed: 1 }
    );
    if (lowSafety.raid <= baseline.raid || lowSafety.unrest <= baseline.unrest) {
        fail(`low safety should raise raid/unrest: baseline=${JSON.stringify(baseline)} low=${JSON.stringify(lowSafety)}`);
    } else {
        ok('low safety raises raid and unrest weights');
    }
}

{
    const withStock = computeSettlementEventWeights(
        baseState({ stocks: [{ id: 'food', amount: 1 }] }),
        { worldTurn: 1, seed: 1 }
    );
    const noShortage = computeSettlementEventWeights(
        baseState({ stocks: [{ id: 'food', amount: 20 }] }),
        { worldTurn: 1, seed: 1 }
    );
    if (withStock.shortage <= 0) {
        fail('stock shortage should enable shortage weight');
    } else if (noShortage.shortage !== 0) {
        fail('ample stock should zero shortage weight');
    } else {
        ok('shortage weight requires low stock');
    }
}

{
    const ctx = { worldTurn: 10, seed: 99, cooldowns: { raid: 20 } };
    const picked = selectSettlementEvent(baseState({ safety: 10 }), ctx);
    if (picked?.category === 'raid') {
        fail('category on cooldown must not be selected');
    } else {
        ok('cooldown suppresses category');
    }
}

{
    const damped = computeSettlementEventWeights(
        baseState({
            safety: 20,
            incidents: [
                { id: 'a', worldTurn: 1, kind: 'x', severity: 'warning', resolved: false, text: 'a' },
                { id: 'b', worldTurn: 2, kind: 'x', severity: 'warning', resolved: false, text: 'b' },
                { id: 'c', worldTurn: 3, kind: 'x', severity: 'warning', resolved: false, text: 'c' },
            ],
        }),
        { worldTurn: 5, seed: 1 }
    );
    const raw = computeSettlementEventWeights(
        baseState({ safety: 20 }),
        { worldTurn: 5, seed: 1 }
    );
    if (damped.raid >= raw.raid) {
        fail('many unresolved incidents should dampen negative weights');
    } else {
        ok('incident backlog dampens negative events');
    }
}

{
    const before = baseState({ morale: 30 });
    const result = selectSettlementEvent(before, { worldTurn: 2, seed: 7 });
    if (before.morale !== 30) {
        fail('selectSettlementEvent must not mutate input state');
    } else if (!result || !result.category) {
        fail('expected a candidate for stressed settlement');
    } else {
        ok('selection does not mutate state');
    }
}

{
    const healthy = baseState({ morale: 80, safety: 80, stocks: [{ id: 'food', amount: 50 }] });
    const weights = computeSettlementEventWeights(healthy, { worldTurn: 1, seed: 1 });
    if (weights.windfall <= 10 || weights.arrival <= 10) {
        fail(`healthy settlement should allow positive events: ${JSON.stringify(weights)}`);
    } else {
        ok('healthy settlement allows windfall/arrival');
    }
}

{
    const note = deriveLegacyNote({
        id: 'i1',
        worldTurn: 3,
        kind: 'attack',
        severity: 'warning',
        resolved: true,
        text: 'The north gate was breached last winter',
    });
    if (!note || !note.includes('north gate')) {
        fail(`deriveLegacyNote should return short text: ${note}`);
    } else if (deriveLegacyNote({
        id: 'i2', worldTurn: 1, kind: 'x', severity: 'info', resolved: false, text: 'open',
    })) {
        fail('unresolved incident should not produce legacy note');
    } else {
        ok('deriveLegacyNote from resolved incidents');
    }
}

{
    const blocked = selectSettlementEvent(
        baseState({ stocks: [{ id: 'food', amount: 50 }], safety: 90, morale: 90 }),
        { worldTurn: 1, seed: 1, cooldowns: { windfall: 99, arrival: 99, repair: 99, departure: 99, unrest: 99, raid: 99, shortage: 99 } }
    );
    if (blocked !== undefined) {
        fail(`all categories cooled down should return undefined, got ${JSON.stringify(blocked)}`);
    } else {
        ok('returns undefined when nothing qualifies');
    }
}

if (failed > 0) {
    console.error(`\n${failed} test(s) failed.`);
    process.exit(1);
}
console.log('settlement event core: all tests passed.');