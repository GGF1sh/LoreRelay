#!/usr/bin/env node
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { installVscodeStub } = require('./test_helpers/vscode_stub');

const root = path.join(__dirname, '..');
const worldStatePath = path.join(root, 'out', 'worldState.js');

let failed = 0;
function fail(msg) { console.error(`FAIL: ${msg}`); failed++; }
function ok(msg) { console.log(`OK: ${msg}`); }

if (!fs.existsSync(worldStatePath)) {
    fail(`${worldStatePath} missing - run npm run compile`);
    process.exit(1);
}

let currentWorkspace = undefined;
const restore = installVscodeStub({
    workspace: {
        get workspaceFolders() {
            return currentWorkspace
                ? [{ name: path.basename(currentWorkspace), uri: { fsPath: currentWorkspace } }]
                : undefined;
        },
        getConfiguration: () => ({
            get: () => undefined,
            update: async () => undefined,
        }),
    },
});

function writeJson(filePath, data) {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
}

function makeWorldStateWithManyFactions(count) {
    const factions = {};
    for (let i = 0; i < count; i++) {
        factions[`faction_${String(i).padStart(3, '0')}`] = { power: 1, morale: 50 };
    }
    return {
        format: 'lorerelay-world-state/1.1',
        worldTurn: 3,
        factions,
        regions: {},
        globalEvents: [],
    };
}

function warningFields(worldState) {
    return [...worldState.peekLastWorldStateParseWarnings()].map((w) => w.field);
}

try {
    const worldState = require(worldStatePath);
    const dirA = fs.mkdtempSync(path.join(os.tmpdir(), 'lr-world-warn-a-'));
    const dirB = fs.mkdtempSync(path.join(os.tmpdir(), 'lr-world-warn-b-'));
    const fileA = path.join(dirA, 'world_state.json');

    writeJson(fileA, makeWorldStateWithManyFactions(250));

    currentWorkspace = dirA;
    worldState.clearWorldStateCache();
    const first = worldState.loadWorldState();
    if (!first) {
        fail('world_state in workspace A should load');
    } else if (!warningFields(worldState).includes('factions')) {
        fail('workspace A should expose faction cap warning');
    } else {
        ok('workspace A load exposes parse cap warning');
    }

    currentWorkspace = dirB;
    const missing = worldState.loadWorldState();
    if (missing !== undefined) {
        fail('missing world_state in workspace B should return undefined');
    } else if (worldState.peekLastWorldStateParseWarnings().length !== 0) {
        fail('missing world_state should clear stale parse warnings');
    } else {
        ok('missing world_state clears warning buffer');
    }

    currentWorkspace = dirA;
    const second = worldState.loadWorldState();
    if (!second) {
        fail('workspace A should reload after workspace B missing cache entry');
    } else if (!warningFields(worldState).includes('factions')) {
        fail('workspace A reload should restore its own parse warnings');
    } else {
        ok('workspace switch reload restores current workspace warnings');
    }

    const saved = worldState.saveWorldState(second);
    if (!saved) {
        fail('saveWorldState should succeed in temp workspace');
    } else if (worldState.peekLastWorldStateParseWarnings().length !== 0) {
        fail('successful normalized save should clear parse warning buffer');
    } else {
        ok('successful save clears parse warning buffer');
    }

    writeJson(fileA, makeWorldStateWithManyFactions(250));
    const future = new Date(Date.now() + 5000);
    fs.utimesSync(fileA, future, future);
    const third = worldState.loadWorldState();
    if (!third || !warningFields(worldState).includes('factions')) {
        fail('reloaded warning state should expose cap warning before parse failure test');
    } else {
        ok('warning buffer primed before parse failure test');
    }

    fs.writeFileSync(fileA, '{ invalid json', 'utf-8');
    const later = new Date(Date.now() + 10000);
    fs.utimesSync(fileA, later, later);
    const broken = worldState.loadWorldState();
    if (broken !== undefined) {
        fail('invalid world_state JSON should return undefined');
    } else if (worldState.peekLastWorldStateParseWarnings().length !== 0) {
        fail('parse failure should clear stale parse warnings');
    } else {
        ok('parse failure clears warning buffer');
    }
} finally {
    restore();
}

if (failed) {
    console.error(`world_state warning buffer tests failed: ${failed}`);
    process.exit(1);
}
console.log('world_state warning buffer tests: all tests passed.');
