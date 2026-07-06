#!/usr/bin/env node
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { installVscodeStub } = require('./test_helpers/vscode_stub');

const root = path.join(__dirname, '..');
const worldStateModulePath = path.join(root, 'out', 'worldState.js');
const worldStateSourcePath = path.join(root, 'src', 'worldState.ts');

let failed = 0;
function fail(msg) { console.error(`FAIL: ${msg}`); failed++; }
function ok(msg) { console.log(`OK: ${msg}`); }

if (!fs.existsSync(worldStateModulePath)) {
    fail(`${worldStateModulePath} missing - run npm run compile`);
    process.exit(1);
}

function extractFunctionBody(source, fnName) {
    const re = new RegExp(`function ${fnName}\\([\\s\\S]*?\\n\\}`, 'm');
    const m = source.match(re);
    return m ? m[0] : '';
}

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

{
    const source = fs.readFileSync(worldStateSourcePath, 'utf-8');
    const body = extractFunctionBody(source, 'readWorldStateSnapshotReadOnly');
    const forbidden = [
        'cachedState',
        'cachePath',
        'cacheMtime',
        'cachedWorldStateParseWarnings',
        'setWorldStateParseWarnings',
        'clearWorldStateParseWarnings',
        'warnWorldStateParseCaps',
    ];
    if (!body) {
        fail('readWorldStateSnapshotReadOnly not found');
    } else {
        const leaked = forbidden.filter((token) => body.includes(token));
        if (leaked.length > 0) {
            fail(`readWorldStateSnapshotReadOnly references shared cache/warning mutators: ${leaked.join(', ')}`);
        } else {
            ok('readWorldStateSnapshotReadOnly is structurally isolated from shared cache/warning mutators');
        }
    }
}

let currentWorkspace;
const restore = installVscodeStub({
    workspace: {
        get workspaceFolders() {
            return currentWorkspace
                ? [{ name: path.basename(currentWorkspace), uri: { fsPath: currentWorkspace } }]
                : undefined;
        },
        getConfiguration: () => ({
            get: (key, def) => {
                if (key === 'enableEmergentSimulation') {
                    return true;
                }
                return def;
            },
            update: async () => undefined,
        }),
    },
});

try {
    const worldState = require(worldStateModulePath);
    const dirA = fs.mkdtempSync(path.join(os.tmpdir(), 'lr-inspector-ro-a-'));
    const dirB = fs.mkdtempSync(path.join(os.tmpdir(), 'lr-inspector-ro-b-'));

    writeJson(path.join(dirA, 'world_state.json'), makeWorldStateWithManyFactions(250));

    currentWorkspace = dirA;
    worldState.clearWorldStateCache();
    const loaded = worldState.loadWorldState();
    const beforeFields = warningFields(worldState);
    if (!loaded) {
        fail('workspace A world_state should load');
    } else if (!beforeFields.includes('factions')) {
        fail('workspace A load should prime shared warning buffer with faction cap warning');
    } else {
        ok('workspace A load primes shared warning buffer');
    }

    const snapshotA = worldState.readWorldStateSnapshotReadOnly();
    const afterSnapshotFields = warningFields(worldState);
    if (!snapshotA.state) {
        fail('readWorldStateSnapshotReadOnly should return parsed state for workspace A');
    } else if (!snapshotA.warnings.some((w) => w.field === 'factions')) {
        fail('readWorldStateSnapshotReadOnly should return snapshot-local faction cap warning');
    } else if (JSON.stringify(beforeFields) !== JSON.stringify(afterSnapshotFields)) {
        fail('readWorldStateSnapshotReadOnly mutated shared warning buffer for workspace A');
    } else {
        ok('readWorldStateSnapshotReadOnly returns snapshot-local warnings without mutating shared warning buffer');
    }

    currentWorkspace = dirB;
    const missingSnapshot = worldState.readWorldStateSnapshotReadOnly();
    const afterMissingFields = warningFields(worldState);
    if (missingSnapshot.state !== undefined) {
        fail('missing workspace B world_state should return undefined snapshot state');
    } else if (missingSnapshot.warnings.length !== 0) {
        fail('missing workspace B world_state should return empty snapshot warnings');
    } else if (JSON.stringify(beforeFields) !== JSON.stringify(afterMissingFields)) {
        fail('workspace B read-only snapshot cleared or replaced workspace A shared warning buffer');
    } else {
        ok('workspace B read-only snapshot leaves workspace A shared warning buffer untouched');
    }
} finally {
    restore();
}

if (failed) {
    console.error(`prompt inspector read-only tests failed: ${failed}`);
    process.exit(1);
}
console.log('prompt inspector read-only tests: all tests passed.');
