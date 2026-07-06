#!/usr/bin/env node
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');
const { spawnSync } = require('child_process');
const { createVscodeStub } = require('./test_helpers/vscode_stub');

const root = path.join(__dirname, '..');
const outCore = path.join(root, 'out', 'acceptedTurnReplayGuardCore.js');
const outGuard = path.join(root, 'out', 'acceptedTurnReplayGuard.js');
const outStateManager = path.join(root, 'out', 'stateManager.js');

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

function purge(targets) {
    for (const target of targets) {
        try {
            delete require.cache[require.resolve(target)];
        } catch {
            // ignore
        }
    }
}

function loadModules() {
    purge([outCore, outGuard]);
    return withMockedRequire({ vscode: createVscodeStub() }, () => ({
        core: require(outCore),
        guard: require(outGuard),
    }));
}

function tempWorkspace() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lr-runtime-003a-'));
    writeJson(path.join(dir, 'game_state.json'), { schemaVersion: 2, entries: [] });
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

function installWitness(ws, core, context) {
    writeJson(path.join(ws, 'game_state.json'), {
        schemaVersion: 2,
        entries: [],
        [core.RUNTIME_ACCEPTED_TURN_WITNESS_KEY]: core.buildAcceptedTurnWitness(context),
    });
}

function acceptWithWitness(ws, guard, core, turn, rawHash = 'a'.repeat(64)) {
    guard.ensureAcceptedTurnScope(ws);
    const preflight = guard.preflightAcceptedTurn(ws, turn, rawHash, 'test-accept');
    assert(preflight.kind === 'unseen', `setup ${turn.turnId}: preflight is unseen`);
    installWitness(ws, core, preflight.context);
    guard.recordAcceptedTurnAfterCommit(ws, preflight.context);
    return preflight.context;
}

function loadStateManagerHarness(ws) {
    purge([outStateManager]);
    return withMockedRequire({
        './workspacePaths': {
            getGameStatePath() { return path.join(ws, 'game_state.json'); },
            writeJsonAtomic(filePath, value, createBackup = false) {
                if (createBackup && fs.existsSync(filePath)) {
                    fs.copyFileSync(filePath, `${filePath}.bak`);
                }
                writeJson(filePath, value);
            },
        },
    }, () => require(outStateManager));
}

if (!fs.existsSync(outCore) || !fs.existsSync(outGuard) || !fs.existsSync(outStateManager)) {
    fail('compiled replay guard modules missing - run npm run compile first');
    process.exit(1);
}

async function run() {
    const { core, guard } = loadModules();

    // Identity stability and host-only field exclusion.
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

    // V1: ordinary canonical commits preserve disk witness and ignore incoming fake authority.
    {
        const ws = tempWorkspace();
        const turn = baseTurn({ turnId: 'owned-witness' });
        const context = acceptWithWitness(ws, guard, core, turn, '1'.repeat(64));
        const stateManager = loadStateManagerHarness(ws);
        const fake = { ...context.identity, identityHash: 'f'.repeat(64), acceptedAt: 'fake' };
        const result = stateManager.commitGameState({
            schemaVersion: 2,
            entries: [],
            mood: 'ordinary',
            [core.RUNTIME_ACCEPTED_TURN_WITNESS_KEY]: fake,
        });
        const disk = readJson(path.join(ws, 'game_state.json'));
        assert(result.ok, 'ordinary commit succeeds with incoming fake witness');
        assert(disk.runtimeAcceptedTurn.identityHash === context.identity.identityHash, 'ordinary merge preserves trusted disk witness');
        assert(disk.runtimeAcceptedTurn.identityHash !== fake.identityHash, 'incoming fake witness is ignored');
    }

    // V1: replace-profile commit cannot drop witness.
    {
        const ws = tempWorkspace();
        const context = acceptWithWitness(ws, guard, core, baseTurn({ turnId: 'replace-preserve' }), '2'.repeat(64));
        const stateManager = loadStateManagerHarness(ws);
        stateManager.commitGameState({ schemaVersion: 2, entries: [], mood: 'replace' }, { mergeProfile: 'replace' });
        const disk = readJson(path.join(ws, 'game_state.json'));
        assert(disk.runtimeAcceptedTurn.identityHash === context.identity.identityHash, 'replace-profile commit preserves disk witness');
    }

    // V1/V3: malformed, missing, and wrong-epoch witnesses fail closed when active history exists.
    {
        const wsMissing = tempWorkspace();
        acceptWithWitness(wsMissing, guard, core, baseTurn({ turnId: 'missing-witness' }), '3'.repeat(64));
        writeJson(path.join(wsMissing, 'game_state.json'), { schemaVersion: 2, entries: [] });
        const missing = guard.preflightAcceptedTurn(wsMissing, baseTurn({ turnId: 'next-after-missing' }), '4'.repeat(64), 'test');
        assert(missing.kind === 'repairRequired', 'active ledger head with missing witness fails closed');

        const wsMalformed = tempWorkspace();
        acceptWithWitness(wsMalformed, guard, core, baseTurn({ turnId: 'malformed-witness' }), '5'.repeat(64));
        writeJson(path.join(wsMalformed, 'game_state.json'), {
            schemaVersion: 2,
            entries: [],
            [core.RUNTIME_ACCEPTED_TURN_WITNESS_KEY]: { identityHash: 'not-enough' },
        });
        const malformed = guard.preflightAcceptedTurn(wsMalformed, baseTurn({ turnId: 'next-after-malformed' }), '6'.repeat(64), 'test');
        assert(malformed.kind === 'repairRequired', 'malformed disk witness fails closed');

        const wsWrongEpoch = tempWorkspace();
        acceptWithWitness(wsWrongEpoch, guard, core, baseTurn({ turnId: 'wrong-epoch-witness' }), '7'.repeat(64));
        const state = readJson(path.join(wsWrongEpoch, 'game_state.json'));
        state.runtimeAcceptedTurn.timelineEpochId = '99999999-9999-4999-8999-999999999999';
        writeJson(path.join(wsWrongEpoch, 'game_state.json'), state);
        const wrongEpoch = guard.preflightAcceptedTurn(wsWrongEpoch, baseTurn({ turnId: 'next-after-wrong-epoch' }), '8'.repeat(64), 'test');
        assert(wrongEpoch.kind === 'repairRequired', 'wrong epoch witness fails closed');
    }

    // V2: same bytes become valid unseen work in a new epoch, while same-epoch duplicate is suppressed.
    {
        const ws = tempWorkspace();
        const turn = baseTurn({ turnId: 'same-bytes' });
        acceptWithWitness(ws, guard, core, turn, '9'.repeat(64));
        const sameEpoch = guard.preflightAcceptedTurn(ws, turn, '9'.repeat(64), 'same-epoch');
        assert(sameEpoch.kind === 'alreadyAccepted', 'same epoch same bytes are alreadyAccepted');
        await guard.prepareAcceptedTurnTimelineRestore(ws, 'test-epoch-rotate');
        guard.clearCanonicalAcceptedTurnWitness(ws);
        const newEpoch = guard.preflightAcceptedTurn(ws, turn, '9'.repeat(64), 'new-epoch');
        assert(newEpoch.kind === 'unseen', 'same bytes in a new epoch are unseen/new Accepted work');
    }

    // V3: ledger campaign ownership and record identity hash are validated.
    {
        const ws = tempWorkspace();
        const context = acceptWithWitness(ws, guard, core, baseTurn({ turnId: 'ledger-owner' }), 'a'.repeat(64));
        const ledgerPath = guard.getAcceptedTurnLedgerPath(ws);
        const ledger = readJson(ledgerPath);
        ledger.campaignInstanceId = '33333333-3333-4333-8333-333333333333';
        writeJson(ledgerPath, ledger);
        const wrongCampaign = guard.preflightAcceptedTurn(ws, baseTurn({ turnId: 'after-wrong-campaign' }), 'b'.repeat(64), 'test');
        assert(wrongCampaign.kind === 'repairRequired', 'wrong campaign ledger fails closed');

        const wsBadHash = tempWorkspace();
        acceptWithWitness(wsBadHash, guard, core, baseTurn({ turnId: 'bad-hash-record' }), 'c'.repeat(64));
        const badLedgerPath = guard.getAcceptedTurnLedgerPath(wsBadHash);
        const badLedger = readJson(badLedgerPath);
        badLedger.records[0].identityHash = 'e'.repeat(64);
        writeJson(badLedgerPath, badLedger);
        const invalidRecord = guard.preflightAcceptedTurn(wsBadHash, baseTurn({ turnId: 'after-bad-hash' }), 'd'.repeat(64), 'test');
        assert(invalidRecord.kind === 'repairRequired', 'invalid ledger record identityHash fails closed');

        assert(Boolean(context.identity.identityHash), 'ledger setup produced identity hash');
    }

    // V3: witness-first reconciliation repairs Turn A before evaluating newer Turn B.
    {
        const ws = tempWorkspace();
        guard.ensureAcceptedTurnScope(ws);
        const turnA = baseTurn({ turnId: 'turn-a' });
        const turnB = baseTurn({ turnId: 'turn-b' });
        const a = guard.preflightAcceptedTurn(ws, turnA, '1'.repeat(64), 'turn-a');
        assert(a.kind === 'unseen', 'Turn A setup is unseen');
        installWitness(ws, core, a.context);
        const b = guard.preflightAcceptedTurn(ws, turnB, '2'.repeat(64), 'turn-b');
        assert(b.kind === 'unseen', 'Turn A witness ahead is repaired before Turn B preflight continues');
        const ledger = readJson(guard.getAcceptedTurnLedgerPath(ws));
        assert(ledger.records.length === 1 && ledger.records[0].turnId === 'turn-a', 'witness-first repair appended Turn A');
    }

    // V3: backup recovery preserves the valid backup and both corrupt files fail closed.
    {
        const ws = tempWorkspace();
        acceptWithWitness(ws, guard, core, baseTurn({ turnId: 'backup-safe' }), 'e'.repeat(64));
        const ledgerPath = guard.getAcceptedTurnLedgerPath(ws);
        const validBackup = fs.readFileSync(ledgerPath, 'utf8');
        fs.writeFileSync(`${ledgerPath}.bak`, validBackup, 'utf8');
        fs.writeFileSync(ledgerPath, '{broken', 'utf8');
        const recovered = guard.loadAcceptedTurnLedger(ws, guard.ensureAcceptedTurnScope(ws).campaignInstanceId);
        assert(recovered.records.length === 1, 'valid ledger backup recovers corrupt primary');
        assert(fs.readFileSync(`${ledgerPath}.bak`, 'utf8') === validBackup, 'valid backup is preserved during recovery write');

        fs.writeFileSync(ledgerPath, '{broken', 'utf8');
        fs.writeFileSync(`${ledgerPath}.bak`, '{also-broken', 'utf8');
        const bothCorrupt = guard.preflightAcceptedTurn(ws, baseTurn({ turnId: 'after-both-corrupt' }), 'f'.repeat(64), 'test');
        assert(bothCorrupt.kind === 'repairRequired', 'primary and backup corrupt fails closed');
    }

    // V3: legacy retained TurnResult without scope is ambiguous and fail-closed.
    {
        const ws = tempWorkspace();
        fs.writeFileSync(path.join(ws, 'turn_result.json'), JSON.stringify(baseTurn({ turnId: 'legacy-file' })), 'utf8');
        const legacy = guard.preflightAcceptedTurn(ws, baseTurn({ turnId: 'legacy-file' }), '1'.repeat(64), 'legacy');
        assert(legacy.kind === 'repairRequired', 'retained TurnResult without scope is legacy ambiguous/repairRequired');
    }

    // V4: writer lease blocks live owners, protects live PID beyond timeout, recovers dead stale owner, and rejects malformed leases.
    {
        const ws = tempWorkspace();
        const acquired = guard.ensureAcceptedTurnWriterLease(ws, 'first-host');
        assert(!acquired, 'first host acquires writer lease');
        const leasePath = guard.getAcceptedTurnWriterLeasePath(ws);
        const live = readJson(leasePath);
        live.hostInstanceId = 'foreign-live-host';
        live.renewedAt = new Date(Date.now() - 120000).toISOString();
        writeJson(leasePath, live);
        const liveConflict = guard.ensureAcceptedTurnWriterLease(ws, 'live-beyond-timeout');
        assert(liveConflict && liveConflict.kind === 'writerConflict', 'live PID remains protected beyond timeout');

        fs.rmSync(guard.getAcceptedTurnWriterLeaseLockDir(ws), { recursive: true, force: true });
        live.pid = 99999999;
        live.renewedAt = new Date(Date.now() - 120000).toISOString();
        writeJson(leasePath, live);
        const recovered = guard.ensureAcceptedTurnWriterLease(ws, 'dead-stale-owner');
        assert(!recovered, 'stale dead owner is recovered');

        fs.rmSync(guard.getAcceptedTurnWriterLeaseLockDir(ws), { recursive: true, force: true });
        fs.writeFileSync(leasePath, '{broken', 'utf8');
        const malformed = guard.ensureAcceptedTurnWriterLease(ws, 'malformed');
        assert(malformed && malformed.kind === 'writerConflict', 'malformed lease fails closed');
    }

    // V5: restore coordinator quarantines before epoch rotation and aborts if quarantine fails.
    {
        const ws = tempWorkspace();
        guard.ensureAcceptedTurnScope(ws);
        fs.writeFileSync(path.join(ws, 'turn_result.json'), JSON.stringify(baseTurn({ turnId: 'retained' })), 'utf8');
        const before = guard.ensureAcceptedTurnScope(ws);
        const prepared = await guard.prepareAcceptedTurnTimelineRestore(ws, 'restore-test');
        const after = guard.ensureAcceptedTurnScope(ws);
        const runtimeFiles = fs.readdirSync(guard.getAcceptedTurnRuntimeDir(ws));
        assert(!('kind' in prepared), 'restore preparation succeeds');
        assert(before.timelineEpochId !== after.timelineEpochId, 'restore preparation rotates epoch after quarantine');
        assert(!fs.existsSync(path.join(ws, 'turn_result.json')), 'restore preparation removes retained root turn_result.json');
        assert(runtimeFiles.some((name) => name.includes('quarantined')), 'restore preparation quarantines retained turn_result.json');

        const wsFail = tempWorkspace();
        guard.ensureAcceptedTurnScope(wsFail);
        fs.writeFileSync(path.join(wsFail, 'turn_result.json'), JSON.stringify(baseTurn({ turnId: 'cannot-quarantine' })), 'utf8');
        const failBefore = guard.ensureAcceptedTurnScope(wsFail);
        const originalRenameSync = fs.renameSync;
        let failedPrepare;
        try {
            fs.renameSync = (oldPath, newPath) => {
                if (String(oldPath).endsWith('turn_result.json')) {
                    throw new Error('simulated quarantine failure');
                }
                return originalRenameSync(oldPath, newPath);
            };
            failedPrepare = await guard.prepareAcceptedTurnTimelineRestore(wsFail, 'restore-quarantine-fail');
        } finally {
            fs.renameSync = originalRenameSync;
        }
        const failAfter = guard.ensureAcceptedTurnScope(wsFail);
        assert('kind' in failedPrepare && failedPrepare.kind === 'repairRequired', 'quarantine failure aborts restore preparation');
        assert(failBefore.timelineEpochId === failAfter.timelineEpochId, 'quarantine failure leaves epoch unchanged');
    }

    // V5: Git runtime authority is ignored by initialization and tracked authority is detectable.
    {
        const ws = tempWorkspace();
        fs.mkdirSync(path.join(ws, '.text-adventure', 'runtime'), { recursive: true });
        fs.writeFileSync(path.join(ws, '.text-adventure', 'runtime', 'accepted_turn_scope.json'), '{}', 'utf8');
        spawnSync('git', ['init'], { cwd: ws, stdio: 'ignore' });
        fs.writeFileSync(path.join(ws, '.gitignore'), '.text-adventure/runtime/\n', 'utf8');
        spawnSync('git', ['add', '.'], { cwd: ws, stdio: 'ignore' });
        const tracked = spawnSync('git', ['ls-files', '--', '.text-adventure/runtime'], { cwd: ws, encoding: 'utf8' }).stdout.trim();
        assert(tracked === '', 'Git initialization ignore keeps runtime authority untracked');
    }
}

run()
    .then(() => {
        if (failed > 0) {
            process.exit(1);
        }
        console.log('runtime accepted replay guard: all tests passed.');
    })
    .catch((e) => {
        fail(`runtime accepted replay guard test crashed: ${e instanceof Error ? e.stack || e.message : String(e)}`);
        process.exit(1);
    });
