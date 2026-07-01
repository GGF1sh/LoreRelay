#!/usr/bin/env node
/**
 * Unit tests for stateManager.ts persist plan logic.
 */
'use strict';

const path = require('path');
const fs = require('fs');
const root = path.join(__dirname, '..');
const outPath = path.join(root, 'out', 'stateManagerCore.js');

let failed = 0;
function fail(msg) { console.error(`FAIL: ${msg}`); failed++; }
function ok(msg) { console.log(`OK: ${msg}`); }

if (!fs.existsSync(outPath)) {
    fail('out/stateManagerCore.js missing — run npm run compile first');
    process.exit(1);
}

const { resolveGameStatePersistPlan } = require(outPath);

const validState = {
    schemaVersion: 2,
    entries: [{ id: 'turn-1', role: 'gm', sender: 'GM', content: 'Hello' }],
    status: { hp: { current: 10, max: 10 }, mp: { current: 5, max: 5 } },
    options: ['Look around'],
};

{
    const plan = resolveGameStatePersistPlan(validState, 'strict');
    if (plan.action !== 'write') {
        fail('strict mode accepts valid state');
    } else {
        ok('strict mode accepts valid state');
    }
}

{
    const badId = {
        ...validState,
        entries: [{ id: 'bad id', role: 'gm', sender: 'GM', content: 'x' }],
    };
    const plan = resolveGameStatePersistPlan(badId, 'strict');
    if (plan.action !== 'skip') {
        fail('strict mode rejects invalid state');
    } else {
        ok('strict mode rejects invalid state');
    }
}

{
    const badHp = {
        ...validState,
        status: { hp: { current: -1, max: 10 }, mp: { current: 5, max: 5 } },
    };
    const plan = resolveGameStatePersistPlan(badHp, 'salvage');
    if (plan.action !== 'write' || plan.payload.status?.hp?.current < 0) {
        fail('salvage mode clamps recoverable invalid state');
    } else {
        ok('salvage mode clamps recoverable invalid state');
    }
}

{
    const unsalvageable = {
        entries: [{ id: 'bad id', role: 'gm', sender: 'GM', content: 'x' }],
    };
    const plan = resolveGameStatePersistPlan(unsalvageable, 'salvage');
    if (plan.action !== 'quarantine') {
        fail('salvage mode quarantines unsalvageable state');
    } else {
        ok('salvage mode quarantines unsalvageable state');
    }
}

if (failed > 0) {
    process.exit(1);
}
console.log('stateManager: all tests passed.');