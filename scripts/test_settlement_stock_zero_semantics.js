#!/usr/bin/env node
'use strict';

/**
 * Settlement stock zero semantics — depleted stocks remain at amount 0 so OUT/shortage
 * signals stay visible (ChatGPT PR1).
 */

const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const settlementCorePath = path.join(root, 'out', 'settlementCore.js');
const eventCorePath = path.join(root, 'out', 'settlementEventCore.js');
const overlayCorePath = path.join(root, 'out', 'mapOverlayCore.js');

let failed = 0;
function fail(msg) { console.error(`FAIL: ${msg}`); failed++; }
function ok(msg) { console.log(`OK: ${msg}`); }

for (const p of [settlementCorePath, eventCorePath, overlayCorePath]) {
    if (!fs.existsSync(p)) {
        fail(`${p} missing — run npm run compile first`);
        process.exit(1);
    }
}

const {
    emptySettlementState,
    tickSettlementState,
    buildSettlementPromptBlock,
} = require(settlementCorePath);
const { computeSettlementEventWeights } = require(eventCorePath);
const { deriveSettlementPressureBand } = require(overlayCorePath);

{
    const base = {
        ...emptySettlementState('hub', 'Hub'),
        morale: 50,
        safety: 50,
        stocks: [{ id: 'food', amount: 1 }],
    };
    const after = tickSettlementState(base, {
        worldTurn: 10,
        stockConsumption: [{ stockId: 'food', amount: 1 }],
    });
    const food = after.stocks.find((s) => s.id === 'food');
    if (!food) {
        fail('food entry should remain after depletion');
    } else if (food.amount !== 0) {
        fail(`food should be 0 after consume: ${food.amount}`);
    } else {
        ok('depleted stock remains at amount 0');
    }
}

{
    const state = {
        ...emptySettlementState('hub', 'Hub'),
        stocks: [{ id: 'food', amount: 0 }],
        morale: 50,
        safety: 50,
    };
    const prompt = buildSettlementPromptBlock(state, true);
    if (!prompt.includes('food') || !prompt.includes('(OUT)')) {
        fail(`prompt should show food OUT: ${prompt}`);
    } else {
        ok('prompt shows (OUT) for zero stock');
    }
}

{
    const depleted = {
        ...emptySettlementState('hub', 'Hub'),
        stocks: [{ id: 'food', amount: 0 }],
        morale: 50,
        safety: 50,
    };
    const missing = {
        ...emptySettlementState('hub', 'Hub'),
        stocks: [],
        morale: 50,
        safety: 50,
    };
    const depletedWeights = computeSettlementEventWeights(depleted, { worldTurn: 1, seed: 42 });
    const missingWeights = computeSettlementEventWeights(missing, { worldTurn: 1, seed: 42 });
    if (depletedWeights.shortage <= 0) {
        fail(`depleted food should enable shortage event weight: ${depletedWeights.shortage}`);
    } else if (missingWeights.shortage > 0) {
        fail('missing food entry should not register as shortage');
    } else {
        ok('shortage event weight uses zero-amount stock entry');
    }
}

{
    const depleted = {
        ...emptySettlementState('hub', 'Hub'),
        stocks: [{ id: 'food', amount: 0 }],
        morale: 50,
        safety: 50,
        incidents: [],
    };
    const missing = {
        ...depleted,
        stocks: [],
    };
    if (deriveSettlementPressureBand(depleted) === 'calm') {
        fail('zero food should raise settlement pressure band');
    } else if (deriveSettlementPressureBand(missing) === 'calm') {
        fail('expected calm when food entry absent (contrast check)');
    } else {
        ok('pressure band reflects zero-amount shortage');
    }
}

if (failed > 0) {
    process.exit(1);
}
console.log('settlement stock zero semantics: all tests passed.');