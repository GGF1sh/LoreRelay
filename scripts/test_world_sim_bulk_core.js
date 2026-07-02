#!/usr/bin/env node
/**
 * Unit tests for worldSimBulkCore.ts
 * Requires: npm run compile
 */
const path = require('path');
const Module = require('module');

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

let core;
try {
    core = require('../out/worldSimBulkCore');
} finally {
    Module.prototype.require = origRequire;
}

const {
    clampBulkWorldSimSteps,
    runBulkWorldSimulation,
    ABSOLUTE_MAX_BULK_WORLD_STEPS,
    DEFAULT_MAX_BULK_WORLD_STEPS,
} = core;

let failed = 0;

function fail(msg) {
    console.error(`FAIL: ${msg}`);
    failed++;
}

function ok(msg) {
    console.log(`OK: ${msg}`);
}

const FORGE = {
    meta: { worldName: 'Bulk Test' },
    geography: {
        regions: [
            { id: 'r1', name: 'R1', type: 'plains', dangerLevel: 3, connectedTo: ['r2'] },
            { id: 'r2', name: 'R2', type: 'forest', dangerLevel: 5, connectedTo: ['r1'] },
        ],
        locations: [],
    },
    factions: [
        { id: 'f1', name: 'F1', type: 'neutral', power: 50, enemies: ['f2'], allies: [] },
        { id: 'f2', name: 'F2', type: 'hostile', power: 60, enemies: ['f1'], allies: [] },
    ],
    loreHistory: [],
    initialNpcs: [],
};

function makeState(worldTurn = 5) {
    return {
        format: 'lorerelay-world-state/1.0',
        worldTurn,
        factions: {
            f1: { power: 50, morale: 50, resources: { food: 30, weapons: 20 }, recentEvents: [] },
            f2: { power: 60, morale: 50, resources: { food: 10, weapons: 40 }, recentEvents: [] },
        },
        regions: {
            r1: { dangerLevel: 3, controllingFaction: 'f1', activeEvents: [] },
            r2: { dangerLevel: 5, controllingFaction: 'f2', activeEvents: [] },
        },
        globalEvents: [],
        pendingWorldEvents: [],
        recentChanges: [],
        questHooks: [],
    };
}

// clamp
if (clampBulkWorldSimSteps(10) !== 10) { fail('clamp 10'); } else { ok('clamp accepts 10'); }
if (clampBulkWorldSimSteps(0) !== 0) { fail('clamp 0'); } else { ok('clamp rejects 0'); }
if (clampBulkWorldSimSteps(200, 50) !== 50) { fail('clamp max 50'); } else { ok('clamp respects maxSteps'); }
if (clampBulkWorldSimSteps(
    ABSOLUTE_MAX_BULK_WORLD_STEPS + 5,
    ABSOLUTE_MAX_BULK_WORLD_STEPS
) !== ABSOLUTE_MAX_BULK_WORLD_STEPS) {
    fail('clamp absolute max');
} else {
    ok('clamp absolute max');
}

// bulk run
const start = makeState(10);
const result = runBulkWorldSimulation(FORGE, start, undefined, { steps: 3, enableNpcRegistry: false });
if (!result.ok) {
    fail('bulk run should succeed');
} else {
    if (result.summary.startWorldTurn !== 10) { fail('start turn'); }
    else if (result.summary.endWorldTurn !== 13) { fail(`end turn expected 13 got ${result.summary.endWorldTurn}`); }
    else if (result.summary.stepsExecuted !== 3) { fail('steps executed'); }
    else { ok('bulk advances worldTurn by N'); }
    if (start.worldTurn !== 10) { fail('input state unchanged'); }
    else { ok('input state not mutated'); }
}

const bad = runBulkWorldSimulation(FORGE, makeState(), undefined, { steps: 0, enableNpcRegistry: false });
if (bad.ok) { fail('steps 0 should fail'); } else { ok('steps 0 returns INVALID_STEPS'); }

if (DEFAULT_MAX_BULK_WORLD_STEPS !== 50) { fail('default max constant'); }
else { ok('default max constant'); }

if (failed > 0) {
    console.error(`\n${failed} test(s) failed.`);
    process.exit(1);
}
console.log('\nAll worldSimBulkCore tests passed.');