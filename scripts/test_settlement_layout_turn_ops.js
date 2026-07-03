#!/usr/bin/env node
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const root = path.join(__dirname, '..');
const corePath = path.join(root, 'out', 'settlementLayoutTurnOpsCore.js');
const settlementCorePath = path.join(root, 'out', 'settlementCore.js');
const queuePath = path.join(root, 'out', 'workspaceStateQueue.js');

let failed = 0;
function fail(msg) { console.error(`FAIL: ${msg}`); failed++; }
function ok(msg) { console.log(`OK: ${msg}`); }

for (const p of [corePath, settlementCorePath, queuePath]) {
    if (!fs.existsSync(p)) {
        fail(`${p} missing — run npm run compile`);
        process.exit(1);
    }
}

const {
    applySettlementLayoutTurnOpsWithDeps,
    shouldAttemptSettlementLayoutPersistCore,
} = require(corePath);
const { emptySettlementState } = require(settlementCorePath);
const {
    getSettlementLayoutWriteQueueDepthForTests,
    resetWorkspaceWriteQueueForTests,
} = require(queuePath);

const SETTLEMENT_STATE = 'settlement_state.json';
const SETTLEMENT_LAYOUT = 'settlement_layout.json';
const GAME_STATE = 'game_state.json';
const WORLD_STATE = 'world_state.json';
const GAME_RULES = 'game_rules.json';

function readJson(filePath) {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
}

function writeJson(filePath, data) {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
}

function snapshotBytes(dir, names) {
    const out = {};
    for (const name of names) {
        const p = path.join(dir, name);
        out[name] = fs.existsSync(p) ? fs.readFileSync(p) : null;
    }
    return out;
}

function makeWorkspace(extra = {}) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lr-settlement-layout-'));
    const state = emptySettlementState('scrapbound_hub', 'Scrapbound Enclave');
    state.worldTurn = 7;
    writeJson(path.join(dir, SETTLEMENT_STATE), state);
    writeJson(path.join(dir, GAME_STATE), { schemaVersion: 2, entries: [] });
    writeJson(path.join(dir, WORLD_STATE), { worldTurn: 7, locations: [] });
    writeJson(path.join(dir, GAME_RULES), { enableSettlementMode: true, ...extra.rules });
    if (extra.layout) {
        writeJson(path.join(dir, SETTLEMENT_LAYOUT), extra.layout);
    }
    return { dir, state };
}

function makeDeps(dir, opts = {}) {
    const layoutPath = path.join(dir, SETTLEMENT_LAYOUT);
    const statePath = path.join(dir, SETTLEMENT_STATE);
    return {
        isSettlementModeEnabled: () => opts.modeEnabled !== false,
        getLayoutPath: () => layoutPath,
        readLayoutFromDisk: (p) => {
            const resolved = p ?? layoutPath;
            if (!fs.existsSync(resolved)) { return undefined; }
            try {
                const { parseSettlementLayout } = require(settlementCorePath);
                return parseSettlementLayout(readJson(resolved));
            } catch {
                return undefined;
            }
        },
        readStateFromDisk: () => {
            if (!fs.existsSync(statePath)) { return undefined; }
            try {
                const { parseSettlementState } = require(settlementCorePath);
                return parseSettlementState(readJson(statePath));
            } catch {
                return undefined;
            }
        },
        loadWorldTurn: () => 7,
        writeLayoutAtomic: (p, layout) => {
            if (opts.throwOnWrite) {
                throw new Error('simulated write failure');
            }
            fs.writeFileSync(p, JSON.stringify(layout, null, 2), 'utf-8');
        },
        clearLayoutCache: () => {},
        runSerializedMutation: (fn) => fn(),
    };
}

function cleanup(dir) {
    try {
        fs.rmSync(dir, { recursive: true, force: true });
    } catch {
        // ignore
    }
}

{
    const { dir } = makeWorkspace();
    try {
        const before = snapshotBytes(dir, [GAME_STATE, WORLD_STATE, SETTLEMENT_STATE, SETTLEMENT_LAYOUT]);
        const applied = applySettlementLayoutTurnOpsWithDeps({
            settlementOps: [{ type: 'expand_layer', layerId: 'z-1', profile: 'cellar', seed: 4 }],
        }, makeDeps(dir));
        const after = snapshotBytes(dir, [GAME_STATE, WORLD_STATE, SETTLEMENT_STATE, SETTLEMENT_LAYOUT]);
        if (!applied) {
            fail('valid expand_layer should apply');
        } else if (!after[SETTLEMENT_LAYOUT]) {
            fail('settlement_layout.json should be created');
        } else if (Buffer.compare(before[GAME_STATE], after[GAME_STATE]) !== 0
            || Buffer.compare(before[WORLD_STATE], after[WORLD_STATE]) !== 0
            || Buffer.compare(before[SETTLEMENT_STATE], after[SETTLEMENT_STATE]) !== 0) {
            fail('only settlement_layout.json should change');
        } else {
            const layout = readJson(path.join(dir, SETTLEMENT_LAYOUT));
            if (!layout.layers.includes('z-1')) {
                fail(`layout should include z-1: ${JSON.stringify(layout.layers)}`);
            } else {
                ok('valid expand_layer writes only settlement_layout.json');
            }
        }
    } finally {
        cleanup(dir);
    }
}

{
    const { dir } = makeWorkspace();
    try {
        const applied = applySettlementLayoutTurnOpsWithDeps({
            settlementOps: [{ type: 'expand_layer', layerId: 'z-1', profile: 'cellar', seed: 4 }],
        }, makeDeps(dir, { modeEnabled: false }));
        if (applied || fs.existsSync(path.join(dir, SETTLEMENT_LAYOUT))) {
            fail('settlement mode OFF should not write layout');
        } else {
            ok('settlement mode OFF skips apply');
        }
    } finally {
        cleanup(dir);
    }
}

{
    const { dir } = makeWorkspace();
    try {
        const applied = applySettlementLayoutTurnOpsWithDeps({
            settlementOps: [
                { type: 'set_score', key: 'morale', value: 80 },
                { type: 'expand_layer', layerId: 'bogus' },
            ],
        }, makeDeps(dir));
        if (applied || fs.existsSync(path.join(dir, SETTLEMENT_LAYOUT))) {
            fail('malformed/non-expand ops should not write layout');
        } else {
            ok('malformed settlementOps ignored at apply layer');
        }
    } finally {
        cleanup(dir);
    }
}

{
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lr-settlement-layout-'));
    try {
        writeJson(path.join(dir, GAME_RULES), { enableSettlementMode: true });
        const applied = applySettlementLayoutTurnOpsWithDeps({
            settlementOps: [{ type: 'expand_layer', layerId: 'z-1', profile: 'cellar', seed: 2 }],
        }, makeDeps(dir));
        if (applied || fs.existsSync(path.join(dir, SETTLEMENT_LAYOUT))) {
            fail('missing settlement_state.json should block layout write');
        } else {
            ok('missing settlement_state.json returns false without layout write');
        }
    } finally {
        cleanup(dir);
    }
}

{
    const layout = {
        version: 1,
        settlementId: 'scrapbound_hub',
        layers: ['z0', 'z-1'],
        zones: [],
        markers: [],
    };
    const { dir } = makeWorkspace({ layout });
    try {
        const layoutPath = path.join(dir, SETTLEMENT_LAYOUT);
        const before = fs.readFileSync(layoutPath);
        const applied = applySettlementLayoutTurnOpsWithDeps({
            settlementOps: [{ type: 'expand_layer', layerId: 'z-1', profile: 'cellar' }],
        }, makeDeps(dir));
        const after = fs.readFileSync(layoutPath);
        if (applied) {
            fail('no-op expansion should not report applied');
        } else if (Buffer.compare(before, after) !== 0) {
            fail('no-op expansion should not modify layout file');
        } else {
            ok('no-op expansion skips disk write');
        }
    } finally {
        cleanup(dir);
    }
}

{
    const layout = {
        version: 1,
        settlementId: 'scrapbound_hub',
        layers: ['z0'],
        zones: [],
        markers: [],
    };
    const { dir } = makeWorkspace({ layout });
    try {
        resetWorkspaceWriteQueueForTests();
        let queueCalls = 0;
        const deps = makeDeps(dir);
        const baseRun = deps.runSerializedMutation;
        deps.runSerializedMutation = (fn) => {
            queueCalls += 1;
            const { runSerializedSettlementLayoutMutation } = require(queuePath);
            runSerializedSettlementLayoutMutation(fn);
        };
        const applied = applySettlementLayoutTurnOpsWithDeps({
            settlementOps: [{ type: 'expand_layer', layerId: 'z1', profile: 'roof', seed: 11 }],
        }, deps);
        if (!applied || queueCalls !== 1) {
            fail(`apply should run through serialized queue: applied=${applied} calls=${queueCalls}`);
        } else if (getSettlementLayoutWriteQueueDepthForTests() !== 0) {
            fail('settlement layout queue should drain after apply');
        } else {
            ok('write path uses settlement layout queue');
        }
        resetWorkspaceWriteQueueForTests();
    } finally {
        cleanup(dir);
    }
}

{
    const layout = {
        version: 1,
        settlementId: 'scrapbound_hub',
        layers: ['z0'],
        zones: [],
        markers: [],
    };
    const { dir } = makeWorkspace({ layout });
    try {
        const layoutPath = path.join(dir, SETTLEMENT_LAYOUT);
        const before = fs.readFileSync(layoutPath);
        const applied = applySettlementLayoutTurnOpsWithDeps({
            settlementOps: [{ type: 'expand_layer', layerId: 'z1', profile: 'roof', seed: 5 }],
        }, makeDeps(dir, { throwOnWrite: true }));
        const after = fs.readFileSync(layoutPath);
        if (applied) {
            fail('simulated write failure should return false');
        } else if (Buffer.compare(before, after) !== 0) {
            fail('failed write should preserve original layout bytes');
        } else {
            ok('write failure preserves settlement_layout.json');
        }
    } finally {
        cleanup(dir);
    }
}

{
    const turnResult = { settlementOps: [{ type: 'expand_layer', layerId: 'z-1', profile: 'cellar' }] };
    if (!shouldAttemptSettlementLayoutPersistCore(true, turnResult.settlementOps)) {
        fail('shouldAttemptSettlementLayoutPersistCore true when mode on and expand_layer present');
    } else if (shouldAttemptSettlementLayoutPersistCore(false, turnResult.settlementOps)) {
        fail('shouldAttemptSettlementLayoutPersistCore false when mode off');
    } else {
        ok('shouldAttemptSettlementLayoutPersistCore gates on enableSettlementMode');
    }
}

if (failed > 0) {
    process.exit(1);
}
console.log('settlementLayoutTurnOps: all tests passed.');