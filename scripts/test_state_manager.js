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

// Exercise the real persistence boundary: only explicit host publication intent bypasses travel.
{
    const assert = require('assert/strict'), os = require('os'), Module = require('module');
    const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'state-publication-'));
    const statePath = path.join(workspace, 'game_state.json');
    fs.writeFileSync(path.join(workspace, 'world_forge.json'), JSON.stringify({ geography: { waterways: {} } }));
    const original = { ...validState, world: { currentLocationId: 'old-port' } };
    const restored = { ...validState, world: { currentLocationId: 'restored-port' } };
    const load = Module._load;
    Module._load = function(id, parent, ...args) {
        if (parent?.filename.endsWith('stateManager.js')) {
            if (id === './workspacePaths') return { getGameStatePath: () => statePath, writeJsonAtomic: (p, value) => fs.writeFileSync(p, JSON.stringify(value)) };
            if (id === './workspaceStateQueue') return { isGameStateWriteCircuitOpen: () => false, runSerializedGameStateMutation: fn => fn() };
            if (id === './mods/modActivationGateHost') return { areModCanonicalWritesAllowed: () => true };
        }
        return load.call(this, id, parent, ...args);
    };
    const { commitGameState } = require('../out/stateManager');
    Module._load = load;
    const reset = () => fs.writeFileSync(statePath, JSON.stringify(original));
    reset();
    assert.equal(commitGameState(restored, { mergeProfile: 'replace' }).ok, false, 'replace alone does not authorize travel');
    assert.deepEqual(JSON.parse(fs.readFileSync(statePath)), original);
    assert.equal(commitGameState({ ...restored, navigationPublication: 'timeline-restore' }, { mergeProfile: 'replace' }).ok, false, 'AI payload cannot authorize publication');
    assert.equal(commitGameState(restored, { navigationPublication: 'timeline-restore' }).ok, false, 'publication requires explicit replacement profile');
    assert.equal(commitGameState(restored, { mergeProfile: 'replace', navigationPublication: 'timeline-restore' }).ok, true);
    assert.equal(JSON.parse(fs.readFileSync(statePath)).world.currentLocationId, 'restored-port');
    reset();
    assert.equal(commitGameState(validState, { mergeProfile: 'replace', navigationPublication: 'campaign-reset' }).ok, true);
    assert.equal(JSON.parse(fs.readFileSync(statePath)).world, undefined, 'new campaign can replace old position');
    reset();
    fs.writeFileSync(path.join(workspace, '.water-navigation.json'), JSON.stringify({ version: 1, phase: 'prepared', worldHash: 'old', requestId: 'pending', writes: [], receipts: [] }));
    assert.equal(commitGameState(restored, { mergeProfile: 'replace', navigationPublication: 'timeline-restore' }).ok, false, 'pending navigation still blocks publication');
    assert.deepEqual(JSON.parse(fs.readFileSync(statePath)), original);
    console.log('stateManager: host publication intent, travel rejection and pending navigation passed.');
}
