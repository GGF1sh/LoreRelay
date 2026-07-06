#!/usr/bin/env node
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');
const { spawn, spawnSync } = require('child_process');
const { createVscodeStub } = require('./test_helpers/vscode_stub');

const root = path.join(__dirname, '..');
const outCore = path.join(root, 'out', 'acceptedTurnReplayGuardCore.js');
const outGuard = path.join(root, 'out', 'acceptedTurnReplayGuard.js');
const outStateManager = path.join(root, 'out', 'stateManager.js');
const vscodeStubPath = path.join(root, 'scripts', 'test_helpers', 'vscode_stub.js');

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

function oldIso(ageMs = 120000) {
    return new Date(Date.now() - ageMs).toISOString();
}

function touchOld(filePath, ageMs = 120000) {
    const when = new Date(Date.now() - ageMs);
    fs.utimesSync(filePath, when, when);
}

function writeForeignLease(ws, guard, overrides = {}) {
    const token = overrides.lockToken || `foreign-token-${Date.now()}-${Math.random()}`;
    const lockDir = guard.getAcceptedTurnWriterLeaseLockDir(ws);
    fs.mkdirSync(lockDir, { recursive: true });
    const owner = {
        schemaVersion: 1,
        hostInstanceId: overrides.hostInstanceId || 'foreign-host',
        pid: overrides.pid ?? 99999999,
        hostname: overrides.hostname || os.hostname(),
        processStartedAt: overrides.processStartedAt || oldIso(),
        createdAt: overrides.createdAt || oldIso(),
        lockToken: token,
    };
    const lease = {
        schemaVersion: 1,
        hostInstanceId: owner.hostInstanceId,
        pid: owner.pid,
        hostname: owner.hostname,
        processStartedAt: owner.processStartedAt,
        acquiredAt: overrides.acquiredAt || oldIso(),
        renewedAt: overrides.renewedAt || oldIso(),
        purpose: overrides.purpose || 'foreign',
        leaseTimeoutMs: overrides.leaseTimeoutMs || 30000,
        lockToken: token,
    };
    writeJson(guard.getAcceptedTurnWriterLeaseLockOwnerPath(ws), owner);
    writeJson(guard.getAcceptedTurnWriterLeasePath(ws), lease);
    return { owner, lease };
}

function spawnLeaseContender(ws, purpose, env = {}) {
    const childScript = `
const Module = require('module');
const original = Module.prototype.require;
Module.prototype.require = function patchedRequire(id) {
  if (id === 'vscode') {
    return require(${JSON.stringify(vscodeStubPath)}).createVscodeStub();
  }
  return original.apply(this, arguments);
};
const guard = require(${JSON.stringify(outGuard)});
const result = guard.ensureAcceptedTurnWriterLease(${JSON.stringify(ws)}, ${JSON.stringify(purpose)});
console.log(JSON.stringify({ success: !result, kind: result && result.kind, reason: result && result.reason }));
`;
    return new Promise((resolve) => {
        const child = spawn(process.execPath, ['-e', childScript], {
            cwd: root,
            env: { ...process.env, ...env },
            stdio: ['ignore', 'pipe', 'pipe'],
        });
        let stdout = '';
        let stderr = '';
        child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
        child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
        child.on('close', (code) => {
            try {
                const lines = stdout.trim().split(/\r?\n/).filter(Boolean);
                resolve({ code, stderr, ...JSON.parse(lines[lines.length - 1] || '{}') });
            } catch (e) {
                resolve({ code, stderr, success: false, parseError: String(e), stdout });
            }
        });
        child.on('error', (e) => resolve({ code: 1, stderr: String(e), success: false }));
    });
}

function spawnLeaseHolder(ws, purpose, readyFile, releaseFile, env = {}) {
    const childScript = `
const fs = require('fs');
const path = require('path');
const Module = require('module');
const original = Module.prototype.require;
Module.prototype.require = function patchedRequire(id) {
  if (id === 'vscode') {
    return require(${JSON.stringify(vscodeStubPath)}).createVscodeStub();
  }
  return original.apply(this, arguments);
};
const guard = require(${JSON.stringify(outGuard)});
const result = guard.ensureAcceptedTurnWriterLease(${JSON.stringify(ws)}, ${JSON.stringify(purpose)});
fs.mkdirSync(path.dirname(${JSON.stringify(readyFile)}), { recursive: true });
fs.writeFileSync(${JSON.stringify(readyFile)}, JSON.stringify({ success: !result, kind: result && result.kind, reason: result && result.reason }), 'utf8');
const deadline = Date.now() + 10000;
const timer = setInterval(() => {
  if (fs.existsSync(${JSON.stringify(releaseFile)}) || Date.now() > deadline) {
    clearInterval(timer);
    console.log(JSON.stringify({ success: !result, kind: result && result.kind, reason: result && result.reason }));
  }
}, 20);
`;
    return new Promise((resolve) => {
        const child = spawn(process.execPath, ['-e', childScript], {
            cwd: root,
            env: { ...process.env, ...env },
            stdio: ['ignore', 'pipe', 'pipe'],
        });
        let stdout = '';
        let stderr = '';
        child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
        child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
        child.on('close', (code) => {
            try {
                const lines = stdout.trim().split(/\r?\n/).filter(Boolean);
                resolve({ code, stderr, ...JSON.parse(lines[lines.length - 1] || '{}') });
            } catch (e) {
                resolve({ code, stderr, success: false, parseError: String(e), stdout });
            }
        });
        child.on('error', (e) => resolve({ code: 1, stderr: String(e), success: false }));
    });
}

function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForFile(filePath, timeoutMs = 5000) {
    const deadline = Date.now() + timeoutMs;
    while (!fs.existsSync(filePath) && Date.now() < deadline) {
        await delay(10);
    }
    return fs.existsSync(filePath);
}

function writeRestoreLatch(ws, reason = 'test latch') {
    writeJson(path.join(ws, '.text-adventure', 'runtime', 'accepted_turn_restore_repair_latch.json'), {
        schemaVersion: 1,
        kind: 'timelineRestoreRepairRequired',
        createdAt: new Date().toISOString(),
        reason,
        phase: 'test',
    });
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
    process.env.LORERELAY_WRITER_LEASE_HEARTBEAT_MS = '25';
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

        const wsForged = tempWorkspace();
        acceptWithWitness(wsForged, guard, core, baseTurn({ turnId: 'forged-witness' }), '6'.repeat(64));
        const forgedState = readJson(path.join(wsForged, 'game_state.json'));
        forgedState.runtimeAcceptedTurn.identityHash = 'f'.repeat(64);
        writeJson(path.join(wsForged, 'game_state.json'), forgedState);
        const forged = guard.preflightAcceptedTurn(wsForged, baseTurn({ turnId: 'next-after-forged' }), '6'.repeat(64), 'test');
        assert(forged.kind === 'repairRequired', 'structurally valid forged witness identityHash fails closed');

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

    // V3: first Accepted in a new epoch has no global parent and repairs after post-commit/pre-ledger crash.
    {
        const ws = tempWorkspace();
        acceptWithWitness(ws, guard, core, baseTurn({ turnId: 'epoch-one-a' }), '1'.repeat(64));
        await guard.prepareAcceptedTurnTimelineRestore(ws, 'epoch-two-restore');
        guard.clearCanonicalAcceptedTurnWitness(ws);
        const turnB = baseTurn({ turnId: 'epoch-two-b' });
        const b = guard.preflightAcceptedTurn(ws, turnB, '2'.repeat(64), 'epoch-two-b');
        assert(b.kind === 'unseen', 'first Turn B in new epoch is unseen');
        assert(!b.context.parentIdentityHash, 'first Turn B in new epoch has no global parent');
        installWitness(ws, core, b.context);
        const afterRestart = guard.preflightAcceptedTurn(ws, turnB, '2'.repeat(64), 'epoch-two-b-restart');
        const ledger = readJson(guard.getAcceptedTurnLedgerPath(ws));
        assert(afterRestart.kind === 'alreadyAccepted', 'new-epoch post-commit/pre-ledger witness repairs to alreadyAccepted');
        assert(ledger.records.length === 2 && ledger.records[1].turnId === 'epoch-two-b', 'new-epoch witness repair appends B after preserved historical A');
        assert(!ledger.records[1].parentIdentityHash, 'new-epoch first ledger record keeps undefined parent');
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
        let ensureFailed = false;
        try {
            guard.ensureAcceptedTurnScope(ws);
        } catch {
            ensureFailed = true;
        }
        assert(ensureFailed, 'provider scope bootstrap cannot erase legacy retained TurnResult ambiguity');
    }

    // V1/V3: explicit campaign rebind clears old witness and separates old ledger authority.
    {
        const ws = tempWorkspace();
        acceptWithWitness(ws, guard, core, baseTurn({ turnId: 'old-campaign-turn' }), '1'.repeat(64));
        fs.writeFileSync(path.join(ws, 'turn_result.json'), JSON.stringify(baseTurn({ turnId: 'retained-before-rebind' })), 'utf8');
        const oldScope = guard.ensureAcceptedTurnScope(ws);
        const rebound = guard.rebindAcceptedTurnCampaignInstance(ws);
        const state = readJson(path.join(ws, 'game_state.json'));
        const runtimeFiles = fs.readdirSync(guard.getAcceptedTurnRuntimeDir(ws));
        const next = guard.preflightAcceptedTurn(ws, baseTurn({ turnId: 'new-campaign-turn' }), '2'.repeat(64), 'post-rebind');
        assert(rebound.campaignInstanceId !== oldScope.campaignInstanceId, 'campaign rebind creates a new campaign authority');
        assert(!state.runtimeAcceptedTurn, 'campaign rebind clears old canonical witness through trusted state authority');
        assert(runtimeFiles.some((name) => name.includes('accepted_turn_ledger.json.campaign-rebind')), 'campaign rebind archives old ledger authority');
        assert(!fs.existsSync(path.join(ws, 'turn_result.json')), 'campaign rebind quarantines retained TurnResult');
        assert(next.kind === 'unseen', 'next valid TurnResult after rebind is usable under new campaign ledger');
    }

    // V4: writer lease blocks live owners, heartbeats, recovers dead/orphaned authority, and fails closed on fresh malformed authority.
    {
        guard.resetAcceptedTurnReplayGuardForTests();

        const wsLive = tempWorkspace();
        const acquired = guard.ensureAcceptedTurnWriterLease(wsLive, 'first-host');
        assert(!acquired, 'empty workspace first host acquires writer lease');
        const leasePath = guard.getAcceptedTurnWriterLeasePath(wsLive);
        const firstLease = readJson(leasePath);
        assert(typeof firstLease.lockToken === 'string' && firstLease.lockToken.length > 10, 'writer lease records a lock token');
        await delay(90);
        const heartbeatLease = readJson(leasePath);
        assert(Date.parse(heartbeatLease.renewedAt) > Date.parse(firstLease.renewedAt), 'writer lease heartbeat renews live owner');
        heartbeatLease.hostInstanceId = 'foreign-live-host';
        heartbeatLease.renewedAt = oldIso();
        writeJson(leasePath, heartbeatLease);
        const liveConflict = guard.ensureAcceptedTurnWriterLease(wsLive, 'live-beyond-timeout');
        assert(liveConflict && liveConflict.kind === 'writerConflict', 'live PID remains protected beyond timeout');
        guard.resetAcceptedTurnReplayGuardForTests();

        const wsDead = tempWorkspace();
        writeForeignLease(wsDead, guard);
        fs.rmSync(guard.getAcceptedTurnWriterLeaseLockDir(wsDead), { recursive: true, force: true });
        const recovered = guard.ensureAcceptedTurnWriterLease(wsDead, 'dead-stale-owner');
        assert(!recovered, 'stale dead owner without lock is recovered');
        guard.resetAcceptedTurnReplayGuardForTests();

        const wsRace = tempWorkspace();
        writeForeignLease(wsRace, guard, { lockToken: 'stale-race-token' });
        const raceResults = await Promise.all([
            spawnLeaseContender(wsRace, 'race-a'),
            spawnLeaseContender(wsRace, 'race-b'),
        ]);
        const raceWinners = raceResults.filter((result) => result.success);
        assert(raceWinners.length === 1, `two-process stale takeover has exactly one winner (${JSON.stringify(raceResults)})`);

        const wsOrphan = tempWorkspace();
        fs.mkdirSync(guard.getAcceptedTurnWriterLeaseLockDir(wsOrphan), { recursive: true });
        touchOld(guard.getAcceptedTurnWriterLeaseLockDir(wsOrphan));
        const orphanRecovered = guard.ensureAcceptedTurnWriterLease(wsOrphan, 'orphan-lock');
        assert(!orphanRecovered, 'orphan lock after mkdir-before-metadata crash recovers after grace');
        guard.resetAcceptedTurnReplayGuardForTests();

        const wsPidReuse = tempWorkspace();
        writeForeignLease(wsPidReuse, guard, {
            pid: process.pid,
            processStartedAt: '2000-01-01T00:00:00.000Z',
            lockToken: 'pid-reuse-token',
        });
        const pidReuseRecovered = guard.ensureAcceptedTurnWriterLease(wsPidReuse, 'pid-reuse');
        assert(!pidReuseRecovered, 'PID reuse with mismatched process-start evidence is recoverable');
        guard.resetAcceptedTurnReplayGuardForTests();

        const wsMalformed = tempWorkspace();
        const malformedPath = guard.getAcceptedTurnWriterLeasePath(wsMalformed);
        fs.mkdirSync(path.dirname(malformedPath), { recursive: true });
        fs.writeFileSync(malformedPath, '{broken', 'utf8');
        const malformedFresh = guard.ensureAcceptedTurnWriterLease(wsMalformed, 'malformed-fresh');
        assert(malformedFresh && malformedFresh.kind === 'writerConflict', 'fresh malformed lease fails closed');
        touchOld(malformedPath);
        const malformedRecovered = guard.ensureAcceptedTurnWriterLease(wsMalformed, 'malformed-old');
        assert(!malformedRecovered, 'old malformed lease is quarantined and safely recovered');

        const wsEmptyRace = tempWorkspace();
        const emptyRaceResults = await Promise.all([
            spawnLeaseContender(wsEmptyRace, 'empty-race-a'),
            spawnLeaseContender(wsEmptyRace, 'empty-race-b'),
        ]);
        assert(
            emptyRaceResults.filter((result) => result.success).length === 1,
            `two-process empty workspace acquisition has exactly one winner (${JSON.stringify(emptyRaceResults)})`
        );

        const wsDelayed = tempWorkspace();
        const delayedDir = path.join(wsDelayed, 'lease-sync');
        const delayedMarker = path.join(delayedDir, 'a-paused.json');
        const delayedResume = path.join(delayedDir, 'a-resume');
        const delayedA = spawnLeaseContender(wsDelayed, 'delayed-initial-a', {
            LORERELAY_WRITER_LEASE_PAUSE_AFTER_LOCK_FILE: delayedMarker,
            LORERELAY_WRITER_LEASE_RESUME_AFTER_LOCK_FILE: delayedResume,
            LORERELAY_WRITER_LEASE_TIMEOUT_MS: '150',
        });
        assert(await waitForFile(delayedMarker), 'delayed initial acquirer reached lock-owned pre-lease pause');
        await delay(350);
        const delayedB = await spawnLeaseContender(wsDelayed, 'delayed-initial-b', {
            LORERELAY_WRITER_LEASE_TIMEOUT_MS: '150',
        });
        fs.writeFileSync(delayedResume, 'go', 'utf8');
        const delayedAResult = await delayedA;
        const delayedResults = [delayedAResult, delayedB];
        const delayedLease = readJson(guard.getAcceptedTurnWriterLeasePath(wsDelayed));
        const delayedOwner = readJson(guard.getAcceptedTurnWriterLeaseLockOwnerPath(wsDelayed));
        assert(
            delayedResults.filter((result) => result.success).length === 1,
            `delayed initial acquirer versus orphan recovery has exactly one winner (${JSON.stringify(delayedResults)})`
        );
        assert(delayedLease.lockToken === delayedOwner.lockToken, 'delayed initial loser cannot overwrite winner token');

        const wsMalformedRace = tempWorkspace();
        const malformedRacePath = guard.getAcceptedTurnWriterLeasePath(wsMalformedRace);
        fs.mkdirSync(guard.getAcceptedTurnWriterLeaseLockDir(wsMalformedRace), { recursive: true });
        fs.mkdirSync(path.dirname(malformedRacePath), { recursive: true });
        fs.writeFileSync(malformedRacePath, '{broken', 'utf8');
        touchOld(guard.getAcceptedTurnWriterLeaseLockDir(wsMalformedRace));
        touchOld(malformedRacePath);
        const malformedRaceDir = path.join(wsMalformedRace, 'malformed-sync');
        const malformedPause = path.join(malformedRaceDir, 'a-paused.json');
        const malformedResume = path.join(malformedRaceDir, 'a-resume');
        const malformedA = spawnLeaseContender(wsMalformedRace, 'malformed-race-a', {
            LORERELAY_WRITER_LEASE_PAUSE_AFTER_MALFORMED_CAPTURE_FILE: malformedPause,
            LORERELAY_WRITER_LEASE_RESUME_AFTER_MALFORMED_CAPTURE_FILE: malformedResume,
            LORERELAY_WRITER_LEASE_RELEASE_LOCK_BEFORE_MALFORMED_CAPTURE_PAUSE: '1',
        });
        assert(await waitForFile(malformedPause), 'malformed recovery contender paused after successful malformed lease capture validation');
        assert(!fs.existsSync(malformedRacePath), 'paused malformed recoverer captured only the old malformed lease generation');
        const malformedB = await spawnLeaseContender(wsMalformedRace, 'malformed-race-b');
        fs.writeFileSync(malformedResume, 'go', 'utf8');
        const malformedAResult = await malformedA;
        const malformedRaceResults = [malformedAResult, malformedB];
        const finalMalformedRaceLease = readJson(guard.getAcceptedTurnWriterLeasePath(wsMalformedRace));
        const finalMalformedRaceOwner = readJson(guard.getAcceptedTurnWriterLeaseLockOwnerPath(wsMalformedRace));
        assert(
            malformedRaceResults.filter((result) => result.success).length === 1,
            `two-process malformed authority recovery has exactly one winner (${JSON.stringify(malformedRaceResults)})`
        );
        assert(malformedB.success, 'fresh winner can install a valid writer lease while stale recoverer is paused after validation');
        assert(!malformedAResult.success && malformedAResult.kind === 'writerConflict', 'stale malformed recoverer fails closed after fresh winner appears');
        assert(finalMalformedRaceLease.lockToken === finalMalformedRaceOwner.lockToken, 'malformed recovery loser cannot quarantine/delete fresh winner lease');

        const wsIdenticalReplacement = tempWorkspace();
        const identicalPath = guard.getAcceptedTurnWriterLeasePath(wsIdenticalReplacement);
        fs.mkdirSync(path.dirname(identicalPath), { recursive: true });
        fs.writeFileSync(identicalPath, '{broken', 'utf8');
        touchOld(identicalPath);
        const identicalDir = path.join(wsIdenticalReplacement, 'malformed-identical-sync');
        const identicalPause = path.join(identicalDir, 'a-paused.json');
        const identicalResume = path.join(identicalDir, 'a-resume');
        const identicalA = spawnLeaseContender(wsIdenticalReplacement, 'malformed-identical-a', {
            LORERELAY_WRITER_LEASE_PAUSE_AFTER_MALFORMED_CAPTURE_FILE: identicalPause,
            LORERELAY_WRITER_LEASE_RESUME_AFTER_MALFORMED_CAPTURE_FILE: identicalResume,
            LORERELAY_WRITER_LEASE_RELEASE_LOCK_BEFORE_MALFORMED_CAPTURE_PAUSE: '1',
        });
        assert(await waitForFile(identicalPause), 'identical replacement attacker waits until stale recoverer validated captured malformed bytes');
        fs.writeFileSync(identicalPath, '{broken', 'utf8');
        fs.writeFileSync(identicalResume, 'go', 'utf8');
        const identicalResult = await identicalA;
        assert(!identicalResult.success && identicalResult.kind === 'writerConflict', 'stale recoverer fails closed when identical bytes reappear at canonical lease path');
        assert(fs.readFileSync(identicalPath, 'utf8') === '{broken', 'identical-content replacement remains untouched by stale recoverer');

        const wsHeartbeatRace = tempWorkspace();
        const heartbeatDir = path.join(wsHeartbeatRace, 'heartbeat-sync');
        const heartbeatReady = path.join(heartbeatDir, 'ready.json');
        const heartbeatRelease = path.join(heartbeatDir, 'release');
        const heartbeatHolder = spawnLeaseHolder(wsHeartbeatRace, 'long-provider-heartbeat', heartbeatReady, heartbeatRelease, {
            LORERELAY_WRITER_LEASE_HEARTBEAT_MS: '25',
            LORERELAY_WRITER_LEASE_TIMEOUT_MS: '150',
        });
        assert(await waitForFile(heartbeatReady), 'long provider heartbeat holder acquired writer lease');
        await delay(450);
        const heartbeatContender = await spawnLeaseContender(wsHeartbeatRace, 'heartbeat-contender', {
            LORERELAY_WRITER_LEASE_TIMEOUT_MS: '150',
        });
        fs.writeFileSync(heartbeatRelease, 'done', 'utf8');
        const heartbeatHolderResult = await heartbeatHolder;
        assert(heartbeatHolderResult.success, 'long provider heartbeat holder remains successful beyond timeout');
        assert(heartbeatContender.kind === 'writerConflict', 'separate contender cannot take live heartbeat owner beyond timeout');
    }

    // V5: restore coordinator quarantines before epoch rotation and aborts if quarantine fails.
    {
        guard.resetAcceptedTurnReplayGuardForTests();
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

        const wsRace = tempWorkspace();
        guard.ensureAcceptedTurnScope(wsRace);
        let releaseRestore;
        let restoreStarted = false;
        let competingStarted = false;
        const restorePromise = guard.runAcceptedTurnTimelineRestoreTransaction(wsRace, 'restore-race', async () => {
            restoreStarted = true;
            await new Promise((resolve) => { releaseRestore = resolve; });
            return true;
        });
        await delay(30);
        const competingPromise = guard.runAcceptedTurnSingleFlight(async () => {
            competingStarted = true;
            return true;
        });
        await delay(60);
        assert(restoreStarted, 'restore transaction mutation has started');
        assert(!competingStarted, 'competing TurnResult work waits while restore mutation is in flight');
        releaseRestore();
        const restoreRaceResult = await restorePromise;
        await competingPromise;
        assert(!('kind' in restoreRaceResult), 'restore race transaction completes successfully');
        assert(competingStarted, 'competing TurnResult work runs only after restore mutation completes');

        const checkpointSource = fs.readFileSync(path.join(root, 'src', 'checkpointHandlers.ts'), 'utf8');
        const gitSource = fs.readFileSync(path.join(root, 'src', 'gitManager.ts'), 'utf8');
        assert(
            ['undo-last-turn', 'restore-to-turn', 'restore-checkpoint', 'regenerate-last-turn'].every((reason) => checkpointSource.includes(`runTimelineRestore(ws, '${reason}'`)),
            'Undo, rewind, checkpoint restore, and regenerate use full restore transaction wrapper'
        );
        assert(
            ['git-branch-from-turn', 'git-switch-timeline-branch'].every((reason) => gitSource.includes(`runTimelineGitRestore(cwd, '${reason}'`)),
            'Git branch-from-turn and branch switch use full restore transaction wrapper'
        );

        const wsLatch = tempWorkspace();
        guard.ensureAcceptedTurnScope(wsLatch);
        let releaseFailingRestore;
        let queuedStarted = false;
        const failingRestore = guard.runAcceptedTurnTimelineRestoreTransaction(wsLatch, 'restore-latch-failure', async () => {
            writeJson(path.join(wsLatch, 'game_state.json'), { schemaVersion: 2, entries: [], partialRestore: true });
            await new Promise((resolve) => { releaseFailingRestore = resolve; });
            throw new Error('simulated post-rotation restore failure');
        });
        await delay(30);
        const queuedTurn = guard.runAcceptedTurnSingleFlight(async () => {
            queuedStarted = true;
            assert(fs.existsSync(guard.getAcceptedTurnRestoreRepairLatchPath(wsLatch)), 'durable repair latch exists before queued TurnResult runs');
            return guard.preflightAcceptedTurn(wsLatch, baseTurn({ turnId: 'queued-after-restore-fail' }), '1'.repeat(64), 'queued');
        });
        await delay(60);
        assert(!queuedStarted, 'queued TurnResult waits while failing restore mutation is in flight');
        releaseFailingRestore();
        const restoreFailure = await failingRestore;
        const queuedOutcome = await queuedTurn;
        assert(restoreFailure.kind === 'repairRequired', 'post-rotation restore failure returns repairRequired');
        assert(fs.existsSync(guard.getAcceptedTurnRestoreRepairLatchPath(wsLatch)), 'post-rotation restore failure leaves durable repair latch');
        assert(queuedOutcome.kind === 'repairRequired', 'queued TurnResult after restore failure is blocked by latch');
        guard.resetAcceptedTurnReplayGuardForTests();
        const restartBlocked = guard.preflightAcceptedTurn(wsLatch, baseTurn({ turnId: 'after-restart-latch' }), '2'.repeat(64), 'restart');
        assert(restartBlocked.kind === 'repairRequired', 'durable repair latch survives process-local reset/restart simulation');
        let providerScopeBlocked = false;
        try {
            guard.ensureAcceptedTurnScope(wsLatch);
        } catch {
            providerScopeBlocked = true;
        }
        assert(providerScopeBlocked, 'durable repair latch blocks provider scope bootstrap');
        assert(guard.clearAcceptedTurnRestoreRepairLatchForRepair(wsLatch), 'explicit trusted repair helper clears durable latch');
        const afterExplicitClear = guard.preflightAcceptedTurn(wsLatch, baseTurn({ turnId: 'after-explicit-clear' }), '3'.repeat(64), 'after-clear');
        assert(afterExplicitClear.kind === 'unseen', 'TurnResult can proceed only after explicit latch clear helper');

        const wsEmergencyLatch = tempWorkspace();
        guard.ensureAcceptedTurnScope(wsEmergencyLatch);
        let releaseEmergencyRestore;
        let emergencyQueuedStarted = false;
        const previousLatchFailEnv = process.env.LORERELAY_RESTORE_REPAIR_LATCH_FAIL_WRITE;
        try {
            process.env.LORERELAY_RESTORE_REPAIR_LATCH_FAIL_WRITE = '1';
            const emergencyRestore = guard.runAcceptedTurnTimelineRestoreTransaction(wsEmergencyLatch, 'restore-emergency-latch-failure', async () => {
                writeJson(path.join(wsEmergencyLatch, 'game_state.json'), { schemaVersion: 2, entries: [], partialRestore: true });
                await new Promise((resolve) => { releaseEmergencyRestore = resolve; });
                throw new Error('simulated post-rotation restore failure with latch write failure');
            });
            await delay(30);
            const emergencyQueuedTurn = guard.runAcceptedTurnSingleFlight(async () => {
                emergencyQueuedStarted = true;
                assert(!fs.existsSync(guard.getAcceptedTurnRestoreRepairLatchPath(wsEmergencyLatch)), 'forced latch write failure leaves no durable latch for queued TurnResult');
                return guard.preflightAcceptedTurn(wsEmergencyLatch, baseTurn({ turnId: 'queued-after-emergency-latch' }), '4'.repeat(64), 'queued-emergency');
            });
            await delay(60);
            assert(!emergencyQueuedStarted, 'queued TurnResult waits while failing restore mutation with latch-write failure is in flight');
            releaseEmergencyRestore();
            const emergencyRestoreResult = await emergencyRestore;
            const emergencyQueuedOutcome = await emergencyQueuedTurn;
            assert(emergencyRestoreResult.kind === 'repairRequired', 'restore failure with durable latch write failure returns repairRequired');
            assert(!fs.existsSync(guard.getAcceptedTurnRestoreRepairLatchPath(wsEmergencyLatch)), 'durable latch write failure leaves no durable latch file');
            assert(emergencyQueuedOutcome.kind === 'repairRequired', 'queued TurnResult is blocked by process-local emergency latch');
            const repeatedEmergencyOutcome = guard.preflightAcceptedTurn(wsEmergencyLatch, baseTurn({ turnId: 'emergency-repeat' }), '5'.repeat(64), 'repeat-emergency');
            assert(repeatedEmergencyOutcome.kind === 'repairRequired', 'process-local emergency latch is not automatically cleared by another TurnResult preflight');
            let emergencyProviderBlocked = false;
            try {
                guard.ensureAcceptedTurnScope(wsEmergencyLatch);
            } catch {
                emergencyProviderBlocked = true;
            }
            assert(emergencyProviderBlocked, 'process-local emergency latch blocks provider scope bootstrap');
            guard.resetAcceptedTurnReplayGuardForTests();
            assert(!guard.getAcceptedTurnRestoreRepairLatchOutcome(wsEmergencyLatch), 'process-local emergency latch does not masquerade as durable restart proof after explicit process reset');
        } finally {
            if (previousLatchFailEnv === undefined) {
                delete process.env.LORERELAY_RESTORE_REPAIR_LATCH_FAIL_WRITE;
            } else {
                process.env.LORERELAY_RESTORE_REPAIR_LATCH_FAIL_WRITE = previousLatchFailEnv;
            }
        }

        const wsEmergencyClear = tempWorkspace();
        guard.installAcceptedTurnEmergencyRestoreRepairLatchForTests(wsEmergencyClear, 'manual repair still required', 'unit-test');
        assert(guard.getAcceptedTurnRestoreRepairLatchOutcome(wsEmergencyClear)?.kind === 'repairRequired', 'test-installed emergency latch blocks before explicit repair clear');
        assert(guard.clearAcceptedTurnRestoreRepairLatchForRepair(wsEmergencyClear), 'explicit trusted repair helper clears process-local emergency latch');
        assert(!guard.getAcceptedTurnRestoreRepairLatchOutcome(wsEmergencyClear), 'process-local emergency latch is cleared only by explicit trusted helper/reset');

        const wsGitFail = tempWorkspace();
        guard.ensureAcceptedTurnScope(wsGitFail);
        const asyncGitFailure = await guard.runAcceptedTurnTimelineRestoreTransaction(wsGitFail, 'git-switch-timeline-branch', async () => {
            await delay(20);
            throw new Error('simulated async git checkout failure');
        });
        assert(asyncGitFailure.kind === 'repairRequired', 'async Git-style post-transition failure returns repairRequired');
        assert(fs.existsSync(guard.getAcceptedTurnRestoreRepairLatchPath(wsGitFail)), 'async Git-style failure writes durable repair latch');
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
