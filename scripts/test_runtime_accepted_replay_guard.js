#!/usr/bin/env node
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');
const { createVscodeStub } = require('./test_helpers/vscode_stub');

const root = path.join(__dirname, '..');
const outCore = path.join(root, 'out', 'acceptedTurnReplayGuardCore.js');
const outGuard = path.join(root, 'out', 'acceptedTurnReplayGuard.js');

let failed = 0;

function fail(msg) {
    console.error(`FAIL: ${msg}`);
    failed++;
}

function ok(msg) {
    console.log(`OK: ${msg}`);
}

function assert(condition, msg) {
    if (!condition) {
        fail(msg);
        return false;
    }
    ok(msg);
    return true;
}

function withMockedRequire(mocks, fn) {
    const original = Module.prototype.require;
    Module.prototype.require = function patchedRequire(id) {
        if (Object.prototype.hasOwnProperty.call(mocks, id)) {
            return mocks[id];
        }
        return original.apply(this, arguments);
    };
    try {
        return fn();
    } finally {
        Module.prototype.require = original;
    }
}

function loadModules() {
    delete require.cache[require.resolve(outCore)];
    delete require.cache[require.resolve(outGuard)];
    return withMockedRequire({ vscode: createVscodeStub() }, () => ({
        core: require(outCore),
        guard: require(outGuard),
    }));
}

function tempWorkspace() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lr-runtime-003a-'));
    fs.writeFileSync(path.join(dir, 'game_state.json'), JSON.stringify({
        schemaVersion: 2,
        entries: [],
    }), 'utf8');
    return dir;
}

function readJson(filePath) {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, value) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(value, null, 2), 'utf8');
}

function baseTurn(extra = {}) {
    return {
        turnId: 'turn-003a',
        narration: 'The replay guard accepts this once.',
        statePatch: [{ op: 'replace', path: '/mood', value: 'steady' }],
        ...extra,
    };
}

if (!fs.existsSync(outCore) || !fs.existsSync(outGuard)) {
    fail('compiled replay guard modules missing - run npm run compile first');
    process.exit(1);
}

const { core, guard } = loadModules();

// Pure identity: host-added fields do not affect payload hash; key order is stable.
{
    const ws = tempWorkspace();
    const scope = guard.ensureAcceptedTurnScope(ws);
    const first = core.buildAcceptedTurnIdentity({
        turnId: 'stable-turn',
        z: 1,
        a: { b: 2, a: 1 },
        beforeHash: 'host-before',
        afterHash: 'host-after',
        appliedAt: 'host-time',
    }, scope);
    const second = core.buildAcceptedTurnIdentity({
        a: { a: 1, b: 2 },
        z: 1,
        turnId: 'stable-turn',
    }, scope);
    assert(first.payloadHash === second.payloadHash, 'payload hash ignores host fields and object key order');
    assert(first.identityHash === second.identityHash, 'identity hash is stable for same scope/turn/payload');
}

// Durable scope + ledger: first observation is unseen; recorded commit makes restart duplicate alreadyAccepted.
{
    const ws = tempWorkspace();
    const turn = baseTurn();
    const preflight = guard.preflightAcceptedTurn(ws, turn, 'a'.repeat(64), 'test-first');
    assert(preflight.kind === 'unseen', 'fresh accepted turn preflight is unseen');
    guard.recordAcceptedTurnAfterCommit(ws, preflight.context);
    const ledger = readJson(guard.getAcceptedTurnLedgerPath(ws));
    assert(ledger.records.length === 1, 'accepted ledger records first Accepted turn');
    const duplicate = guard.preflightAcceptedTurn(ws, turn, 'a'.repeat(64), 'test-restart');
    assert(duplicate.kind === 'alreadyAccepted', 'same bytes after restart are alreadyAccepted before apply');
}

// Witness one step ahead repairs ledger and still returns alreadyAccepted.
{
    const ws = tempWorkspace();
    const turn = baseTurn({ turnId: 'witness-turn' });
    const first = guard.preflightAcceptedTurn(ws, turn, 'b'.repeat(64), 'test-witness');
    assert(first.kind === 'unseen', 'witness repair setup starts unseen');
    const witness = core.buildAcceptedTurnWitness(first.context);
    const statePath = path.join(ws, 'game_state.json');
    writeJson(statePath, {
        schemaVersion: 2,
        entries: [],
        [core.RUNTIME_ACCEPTED_TURN_WITNESS_KEY]: witness,
    });
    const repaired = guard.preflightAcceptedTurn(ws, turn, 'b'.repeat(64), 'test-witness-restart');
    assert(repaired.kind === 'alreadyAccepted', 'canonical witness one step ahead repairs ledger as alreadyAccepted');
    const ledger = readJson(guard.getAcceptedTurnLedgerPath(ws));
    assert(ledger.records.length === 1 && ledger.records[0].identityHash === witness.identityHash, 'witness repair appends matching ledger record');
}

// Same turnId/different payload in same epoch is quarantined, not retried as a fresh Accepted turn.
{
    const ws = tempWorkspace();
    const first = guard.preflightAcceptedTurn(ws, baseTurn({ narration: 'first' }), 'c'.repeat(64), 'test-conflict');
    assert(first.kind === 'unseen', 'conflict setup starts unseen');
    guard.recordAcceptedTurnAfterCommit(ws, first.context);
    const conflict = guard.preflightAcceptedTurn(ws, baseTurn({ narration: 'changed' }), 'd'.repeat(64), 'test-conflict');
    assert(conflict.kind === 'quarantined', 'same epoch turnId with different payload is quarantined');
}

// Corrupt primary ledger with valid backup recovers instead of silently resetting history.
{
    const ws = tempWorkspace();
    const first = guard.preflightAcceptedTurn(ws, baseTurn({ turnId: 'backup-turn' }), 'e'.repeat(64), 'test-backup');
    assert(first.kind === 'unseen', 'backup setup starts unseen');
    guard.recordAcceptedTurnAfterCommit(ws, first.context);
    const ledgerPath = guard.getAcceptedTurnLedgerPath(ws);
    const valid = fs.readFileSync(ledgerPath, 'utf8');
    fs.writeFileSync(`${ledgerPath}.bak`, valid, 'utf8');
    fs.writeFileSync(ledgerPath, '{broken', 'utf8');
    const recovered = guard.loadAcceptedTurnLedger(ws);
    assert(recovered.records.length === 1, 'valid ledger backup recovers corrupt primary');
}

// Live lease from a different host instance fails closed.
{
    const ws = tempWorkspace();
    const leasePath = guard.getAcceptedTurnWriterLeasePath(ws);
    writeJson(leasePath, {
        schemaVersion: 1,
        hostInstanceId: 'different-host-instance',
        pid: 12345,
        hostname: 'other-host',
        processStartedAt: new Date().toISOString(),
        acquiredAt: new Date().toISOString(),
        renewedAt: new Date().toISOString(),
        purpose: 'test',
        leaseTimeoutMs: 30000,
    });
    const conflict = guard.ensureAcceptedTurnWriterLease(ws, 'test-conflict');
    assert(conflict && conflict.kind === 'writerConflict', 'live foreign writer lease returns writerConflict');
}

// Epoch rotation preserves ledger history and quarantines retained turn_result.json.
{
    const ws = tempWorkspace();
    const first = guard.preflightAcceptedTurn(ws, baseTurn({ turnId: 'epoch-turn' }), 'f'.repeat(64), 'test-epoch');
    assert(first.kind === 'unseen', 'epoch setup starts unseen');
    guard.recordAcceptedTurnAfterCommit(ws, first.context);
    fs.writeFileSync(path.join(ws, 'turn_result.json'), JSON.stringify(baseTurn({ turnId: 'stale-retained' })), 'utf8');
    const before = guard.ensureAcceptedTurnScope(ws);
    const rotated = guard.rotateAcceptedTurnTimelineEpoch(ws);
    const ledger = readJson(guard.getAcceptedTurnLedgerPath(ws));
    const runtimeFiles = fs.readdirSync(guard.getAcceptedTurnRuntimeDir(ws));
    assert(rotated.timelineEpochId !== before.timelineEpochId, 'timeline epoch rotates on restore/rewind operation');
    assert(ledger.records.length === 1, 'epoch rotation does not truncate accepted ledger history');
    assert(!fs.existsSync(path.join(ws, 'turn_result.json')), 'epoch rotation removes retained root turn_result.json');
    assert(runtimeFiles.some((name) => name.includes('quarantined')), 'epoch rotation quarantines retained turn_result.json');
}

if (failed > 0) {
    process.exit(1);
}
console.log('runtime accepted replay guard: all tests passed.');
