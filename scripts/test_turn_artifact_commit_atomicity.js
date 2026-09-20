#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const corePath = path.join(root, 'out', 'stateManagerCore.js');

let failed = 0;
function fail(msg) { console.error(`FAIL: ${msg}`); failed++; }
function ok(msg) { console.log(`OK: ${msg}`); }

if (!fs.existsSync(corePath)) {
    fail('out/stateManagerCore.js missing - run npm run compile first');
    process.exit(1);
}

const { resolveGameStatePersistPlan } = require(corePath);

function shouldPersistTurnLedgers(plan) {
    return plan.action === 'write';
}

const validState = {
    schemaVersion: 2,
    entries: [{ id: 'turn-1', role: 'gm', sender: 'GM', content: 'Hello' }],
    status: { hp: { current: 10, max: 10 }, mp: { current: 5, max: 5 } },
    options: ['Look around'],
};

{
    const plan = resolveGameStatePersistPlan(validState, 'salvage');
    if (!shouldPersistTurnLedgers(plan)) {
        fail('valid salvage commit should allow ledger writes');
    } else {
        ok('valid commit enables discovery/resource ledger persistence');
    }
}

{
    const badId = {
        ...validState,
        entries: [{ id: 'bad id', role: 'gm', sender: 'GM', content: 'x' }],
    };
    const strictPlan = resolveGameStatePersistPlan(badId, 'strict');
    if (shouldPersistTurnLedgers(strictPlan)) {
        fail('strict skip should block ledger writes');
    } else if (strictPlan.action !== 'skip') {
        fail(`expected skip action, got ${strictPlan.action}`);
    } else {
        ok('strict skip blocks independent ledger writes');
    }
}

{
    const unsalvageable = {
        entries: [{ id: 'bad id', role: 'gm', sender: 'GM', content: 'x' }],
    };
    const quarantinePlan = resolveGameStatePersistPlan(unsalvageable, 'salvage');
    if (shouldPersistTurnLedgers(quarantinePlan)) {
        fail('quarantine should block ledger writes');
    } else if (quarantinePlan.action !== 'quarantine') {
        fail(`expected quarantine action, got ${quarantinePlan.action}`);
    } else {
        ok('quarantine blocks independent ledger writes');
    }
}

if (failed > 0) {
    process.exit(1);
}
console.log('turn artifact commit atomicity: all tests passed.');