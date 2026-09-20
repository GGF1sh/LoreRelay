#!/usr/bin/env node
'use strict';

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

const { runBulkWorldSimulationAsync, BULK_WORLD_SIM_YIELD_EVERY_STEPS } = core;

let failed = 0;
function fail(msg) { console.error(`FAIL: ${msg}`); failed++; }
function ok(msg) { console.log(`OK: ${msg}`); }

const FORGE = {
    meta: { worldName: 'Yield Test' },
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

function makeState(worldTurn = 1) {
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

(async () => {
    const steps = BULK_WORLD_SIM_YIELD_EVERY_STEPS * 4;
    let timerFiredDuringRun = false;
    const timer = setTimeout(() => {
        timerFiredDuringRun = true;
    }, 0);

    const result = await runBulkWorldSimulationAsync(FORGE, makeState(), undefined, {
        steps,
        enableNpcRegistry: false,
        yieldEverySteps: 1,
    });

    clearTimeout(timer);

    if (!result.ok) {
        fail('async bulk sim should succeed');
    } else if (result.summary.stepsExecuted !== steps) {
        fail(`expected ${steps} steps, got ${result.summary.stepsExecuted}`);
    } else if (!timerFiredDuringRun) {
        fail('event loop timer should fire during async bulk sim');
    } else {
        ok('async bulk sim yields to event loop');
    }

    if (failed > 0) {
        console.error(`\n${failed} test(s) failed.`);
        process.exit(1);
    }
    console.log('\nAll world_sim_bulk_event_loop_yield tests passed.');
})().catch((err) => {
    console.error(err);
    process.exit(1);
});