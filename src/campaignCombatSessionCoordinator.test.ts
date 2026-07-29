import * as assert from 'node:assert/strict';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { test } from 'node:test';
import { CampaignCombatSessionCoordinator } from './campaignCombatSessionCoordinator';
import { CombatCommandPlaytestHost } from './combatCommandPlaytestHost';
import { listPendingApplyEligibleReceipts, writePendingCombatOutcomeReceipt } from './campaignCombatPendingStore';

test('coordinator debug start runs to terminal PENDING without game_state', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lr-campaign-combat-'));
    // extension root for ability catalog
    const extensionRoot = path.join(__dirname, '..');
    const host = new CombatCommandPlaytestHost({
        clock: {
            now: () => 0,
            setTimer: () => 1,
            clearTimer: () => undefined,
        },
    });
    const coordinator = new CampaignCombatSessionCoordinator(
        host,
        () => root,
        extensionRoot,
    );
    const started = coordinator.startDebug({ mode: 'command', autoRun: false });
    assert.equal(started.ok, true, started.error);
    assert.equal(coordinator.getState().lifecycle, 'running');

    // Advance until terminal (cap safety)
    for (let i = 0; i < 4000 && host.currentSession && !host.currentSession.state.outcome; i++) {
        host.step(1, host.currentSession.startId);
        coordinator.observeHostSession();
    }
    assert.ok(host.currentSession?.state.outcome, 'battle should terminate');
    coordinator.observeHostSession();
    const st = coordinator.getState();
    assert.equal(st.lifecycle, 'receipt_pending', st.lastError);
    assert.ok(st.pendingPath && fs.existsSync(st.pendingPath));
    assert.equal(listPendingApplyEligibleReceipts(root).length, 1);
    // no game_state written
    assert.equal(fs.existsSync(path.join(root, 'game_state.json')), false);
});

test('abort writes non-apply closure only', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lr-campaign-abort-'));
    const host = new CombatCommandPlaytestHost({
        clock: { now: () => 0, setTimer: () => 1, clearTimer: () => undefined },
    });
    const coordinator = new CampaignCombatSessionCoordinator(
        host,
        () => root,
        path.join(__dirname, '..'),
    );
    assert.equal(coordinator.startDebug({ autoRun: false }).ok, true);
    assert.equal(coordinator.abort('test').ok, true);
    assert.equal(coordinator.getState().lifecycle, 'aborted');
    assert.equal(listPendingApplyEligibleReceipts(root).length, 0);
    assert.ok(coordinator.getState().closurePath);
});

test('compiled BattleSpec and roster snapshot are persisted at session start', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lr-campaign-snap-'));
    const host = new CombatCommandPlaytestHost({
        clock: { now: () => 0, setTimer: () => 1, clearTimer: () => undefined },
    });
    const coordinator = new CampaignCombatSessionCoordinator(
        host,
        () => root,
        path.join(__dirname, '..'),
    );
    const started = coordinator.startDebug({ autoRun: false });
    assert.equal(started.ok, true);
    const id = started.combatSessionId!;
    const sessionDir = path.join(root, '.text-adventure', 'combat', 'sessions', id);
    assert.ok(fs.existsSync(path.join(sessionDir, 'battle-spec.json')));
    assert.ok(fs.existsSync(path.join(sessionDir, 'compiled-roster.json')));
    const roster = JSON.parse(fs.readFileSync(path.join(sessionDir, 'compiled-roster.json'), 'utf8'));
    assert.ok(roster.compiledSnapshotHash);
    assert.equal(roster.compiledSnapshotHash, coordinator.getState().compiledSnapshotHash);
    const battleSpec = JSON.parse(fs.readFileSync(path.join(sessionDir, 'battle-spec.json'), 'utf8'));
    assert.ok(Array.isArray(battleSpec.participantOrder));
    assert.deepEqual(
        battleSpec.participantOrder,
        host.currentSession?.spec.participantOrder,
    );
});

test('PENDING write failure stays retryable until durable success', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lr-campaign-retry-'));
    const host = new CombatCommandPlaytestHost({
        clock: { now: () => 0, setTimer: () => 1, clearTimer: () => undefined },
    });
    let allowWrite = false;
    const coordinator = new CampaignCombatSessionCoordinator(
        host,
        () => root,
        path.join(__dirname, '..'),
        undefined,
        (ws, receipt) => {
            if (!allowWrite) throw new Error('simulated pending write failure');
            return writePendingCombatOutcomeReceipt(ws, receipt);
        },
    );
    assert.equal(coordinator.startDebug({ autoRun: false }).ok, true);
    for (let i = 0; i < 4000 && host.currentSession && !host.currentSession.state.outcome; i++) {
        host.step(1, host.currentSession.startId);
        coordinator.observeHostSession();
    }
    assert.ok(host.currentSession?.state.outcome);
    coordinator.observeHostSession();
    assert.equal(coordinator.getState().lifecycle, 'terminal');
    assert.ok(coordinator.getState().lastError);
    assert.equal(listPendingApplyEligibleReceipts(root).length, 0);

    allowWrite = true;
    coordinator.observeHostSession();
    assert.equal(coordinator.getState().lifecycle, 'receipt_pending');
    assert.equal(listPendingApplyEligibleReceipts(root).length, 1);
});

test('terminal without durable PENDING blocks a second startDebug', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lr-campaign-term-block-'));
    const host = new CombatCommandPlaytestHost({
        clock: { now: () => 0, setTimer: () => 1, clearTimer: () => undefined },
    });
    let allowWrite = false;
    const coordinator = new CampaignCombatSessionCoordinator(
        host,
        () => root,
        path.join(__dirname, '..'),
        undefined,
        (ws, receipt) => {
            if (!allowWrite) throw new Error('simulated pending write failure');
            return writePendingCombatOutcomeReceipt(ws, receipt);
        },
    );
    assert.equal(coordinator.startDebug({ autoRun: false }).ok, true);
    for (let i = 0; i < 4000 && host.currentSession && !host.currentSession.state.outcome; i++) {
        host.step(1, host.currentSession.startId);
        coordinator.observeHostSession();
    }
    coordinator.observeHostSession();
    assert.equal(coordinator.getState().lifecycle, 'terminal');
    const second = coordinator.startDebug({ autoRun: false });
    assert.equal(second.ok, false);
    assert.equal(second.error, 'TERMINAL_AWAITING_PENDING');
    assert.equal(listPendingApplyEligibleReceipts(root).length, 0);
});

test('host session startId mismatch does not write PENDING from foreign battle', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lr-campaign-mismatch-'));
    const host = new CombatCommandPlaytestHost({
        clock: { now: () => 0, setTimer: () => 1, clearTimer: () => undefined },
    });
    const coordinator = new CampaignCombatSessionCoordinator(
        host,
        () => root,
        path.join(__dirname, '..'),
    );
    assert.equal(coordinator.startDebug({ autoRun: false }).ok, true);
    const campaignStartId = host.currentSession?.startId;
    assert.ok(campaignStartId?.startsWith('campaign:'));

    // Simulate Combat Lab replacing the shared host session mid-campaign.
    const live = host.currentSession!;
    (host as unknown as { session: typeof live }).session = {
        ...live,
        startId: 'lab:foreign',
        state: { ...live.state, outcome: '勝利' as typeof live.state.outcome },
    };

    coordinator.observeHostSession();
    assert.equal(listPendingApplyEligibleReceipts(root).length, 0);
    assert.equal(coordinator.getState().lastError, 'HOST_SESSION_MISMATCH');
});

test('abort without workspace does not finalize', () => {
    const host = new CombatCommandPlaytestHost({
        clock: { now: () => 0, setTimer: () => 1, clearTimer: () => undefined },
    });
    const coordinator = new CampaignCombatSessionCoordinator(
        host,
        () => undefined,
        path.join(__dirname, '..'),
    );
    // start without workspace still runs host battle
    assert.equal(coordinator.startDebug({ autoRun: false }).ok, true);
    const abort = coordinator.abort('test');
    assert.equal(abort.ok, false);
    assert.equal(abort.error, 'NO_WORKSPACE');
    assert.notEqual(coordinator.getState().lifecycle, 'aborted');
    assert.ok(host.currentSession, 'host session must remain for retry');
});

test('meta write failure after PENDING does not allow abort closure to coexist', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lr-campaign-meta-fail-'));
    const host = new CombatCommandPlaytestHost({
        clock: { now: () => 0, setTimer: () => 1, clearTimer: () => undefined },
    });
    const coordinator = new CampaignCombatSessionCoordinator(
        host,
        () => root,
        path.join(__dirname, '..'),
        undefined,
        writePendingCombatOutcomeReceipt,
        () => {
            throw new Error('simulated meta/session artifact failure');
        },
    );

    assert.equal(coordinator.startDebug({ autoRun: false }).ok, true);
    for (let i = 0; i < 4000 && host.currentSession && !host.currentSession.state.outcome; i++) {
        host.step(1, host.currentSession.startId);
        coordinator.observeHostSession();
    }
    assert.ok(host.currentSession?.state.outcome);
    coordinator.observeHostSession();
    assert.equal(coordinator.getState().lifecycle, 'receipt_pending');
    assert.ok(coordinator.getState().lastError);
    assert.equal(listPendingApplyEligibleReceipts(root).length, 1);

    const abort = coordinator.abort('user');
    assert.equal(abort.ok, false);
    assert.ok(abort.error === 'ALREADY_FINALIZED' || abort.error === 'PENDING_ALREADY_EXISTS');
    const closuresDir = path.join(root, '.text-adventure', 'combat', 'closures');
    assert.equal(fs.existsSync(closuresDir) ? fs.readdirSync(closuresDir).length : 0, 0);
    assert.equal(listPendingApplyEligibleReceipts(root).length, 1);
});
