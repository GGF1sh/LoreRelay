import * as assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { initialCombatLabScenarios } from './combatLabCore';
import {
    CombatCommandPlaytestHost,
    CombatCommandPlaytestHostClock,
    consumePlaybackTicks,
} from './combatCommandPlaytestHost';

const catalog = { abilities: [], statuses: [] };

function scenarioAtRate(tickRate: number) {
    const scenario = structuredClone(initialCombatLabScenarios()[0]);
    scenario.deltaSeconds = 1 / tickRate;
    return scenario;
}

function fakeClock(): CombatCommandPlaytestHostClock & {
    nowMs: number;
    timers: Array<{ id: number; intervalMs: number; callback: () => void }>;
    nextId: number;
    fireAll(): void;
} {
    const state = {
        nowMs: 0,
        timers: [] as Array<{ id: number; intervalMs: number; callback: () => void }>,
        nextId: 1,
        now() {
            return state.nowMs;
        },
        setTimer(callback: () => void, intervalMs: number) {
            const id = state.nextId++;
            state.timers.push({ id, intervalMs, callback });
            return id;
        },
        clearTimer(handle: unknown) {
            state.timers = state.timers.filter(timer => timer.id !== handle);
        },
        fireAll() {
            for (const timer of [...state.timers]) timer.callback();
        },
    };
    return state;
}

describe('consumePlaybackTicks (host-owned rate conversion)', () => {
    test('10Hz advances 10 ticks per simulated wall-clock second', () => {
        const result = consumePlaybackTicks({ tickRate: 10, elapsedMs: 1000, carryMs: 0 });
        assert.equal(result.ticks, 10);
        assert.equal(result.nextCarryMs, 0);
    });

    test('24Hz advances 24 ticks per second, not 20', () => {
        const result = consumePlaybackTicks({ tickRate: 24, elapsedMs: 1000, carryMs: 0 });
        assert.equal(result.ticks, 24);
        assert.equal(result.nextCarryMs, 0);
    });

    test('25Hz advances 25 ticks per second, not 30', () => {
        const result = consumePlaybackTicks({ tickRate: 25, elapsedMs: 1000, carryMs: 0 });
        assert.equal(result.ticks, 25);
        assert.equal(result.nextCarryMs, 0);
    });

    test('30Hz advances 30 ticks per second', () => {
        const result = consumePlaybackTicks({ tickRate: 30, elapsedMs: 1000, carryMs: 0 });
        assert.equal(result.ticks, 30);
    });

    test('60Hz advances 60 ticks per second', () => {
        const result = consumePlaybackTicks({ tickRate: 60, elapsedMs: 1000, carryMs: 0 });
        assert.equal(result.ticks, 60);
    });

    test('fractional elapsed time carries into later scheduler calls', () => {
        // 24Hz → 1000/24 ms per tick. 20ms is less than one tick.
        const first = consumePlaybackTicks({ tickRate: 24, elapsedMs: 20, carryMs: 0 });
        assert.equal(first.ticks, 0);
        assert.ok(first.nextCarryMs > 0);
        // Remaining + enough to complete one tick: total ~41.666ms
        const second = consumePlaybackTicks({
            tickRate: 24,
            elapsedMs: 22,
            carryMs: first.nextCarryMs,
        });
        assert.equal(second.ticks, 1);
        assert.ok(second.nextCarryMs < 1000 / 24);
    });

    test('pathological catch-up is capped and residual is dropped', () => {
        const result = consumePlaybackTicks({
            tickRate: 30,
            elapsedMs: 60_000,
            carryMs: 0,
            maxTicksPerPulse: 120,
        });
        assert.equal(result.ticks, 120);
        assert.equal(result.nextCarryMs, 0);
    });
});

describe('CombatCommandPlaytestHost session, scheduler, and subscribers', () => {
    test('two subscribers do not double advancement', () => {
        const clock = fakeClock();
        const host = new CombatCommandPlaytestHost({ clock, maxTicksPerPulse: 1000 });
        const a: unknown[] = [];
        const b: unknown[] = [];
        host.subscribe('a', message => a.push(message));
        host.subscribe('b', message => b.push(message));
        const started = host.start(scenarioAtRate(30), catalog, 'command', 's1', { autoRun: true });
        assert.equal(started.ok, true);
        a.length = 0;
        b.length = 0;
        clock.nowMs = 1000;
        host.pulse(clock.nowMs);
        assert.equal(host.currentSession?.state.tick, 30);
        const aStates = a.filter((m): m is { type: string; state: { tick: number } } =>
            !!m && typeof m === 'object' && (m as { type?: string }).type === 'combatCommandPlaytestState');
        const bStates = b.filter((m): m is { type: string; state: { tick: number } } =>
            !!m && typeof m === 'object' && (m as { type?: string }).type === 'combatCommandPlaytestState');
        assert.equal(aStates.length, 1);
        assert.equal(bStates.length, 1);
        assert.equal(aStates[0].state.tick, 30);
        assert.equal(bStates[0].state.tick, 30);
        host.dispose();
    });

    test('pausing prevents automatic advancement', () => {
        const clock = fakeClock();
        const host = new CombatCommandPlaytestHost({ clock });
        host.start(scenarioAtRate(30), catalog, 'command', 's1', { autoRun: true });
        assert.equal(host.setRunning(false, 's1').ok, true);
        const tick = host.currentSession!.state.tick;
        clock.nowMs = 5000;
        host.pulse(clock.nowMs);
        assert.equal(host.currentSession!.state.tick, tick);
        host.dispose();
    });

    test('manual step remains exactly one tick', () => {
        const host = new CombatCommandPlaytestHost({ clock: fakeClock() });
        host.start(scenarioAtRate(30), catalog, 'command', 's1');
        const stepped = host.step(1, 's1');
        assert.equal(stepped.ok, true);
        assert.equal(host.currentSession!.state.tick, 1);
        host.step(1, 's1');
        assert.equal(host.currentSession!.state.tick, 2);
        host.dispose();
    });

    test('terminal outcome stops scheduling', () => {
        const clock = fakeClock();
        const host = new CombatCommandPlaytestHost({ clock });
        host.start(scenarioAtRate(30), catalog, 'command', 's1', { autoRun: true });
        // Force a terminal outcome via the timeout path used by advanceCombatCommandPlaytest.
        const session = host.currentSession!;
        session.state = { ...session.state, tick: 3600 };
        clock.nowMs = 100;
        host.pulse(clock.nowMs);
        assert.ok(host.currentSession!.state.outcome);
        assert.equal(host.isRunning, false);
        assert.equal(clock.timers.length, 0);
        const tickAfter = host.currentSession!.state.tick;
        clock.nowMs = 5000;
        host.pulse(clock.nowMs);
        assert.equal(host.currentSession!.state.tick, tickAfter);
        host.dispose();
    });

    test('restart replaces the scheduler/session exactly once', () => {
        const clock = fakeClock();
        const host = new CombatCommandPlaytestHost({ clock });
        host.start(scenarioAtRate(30), catalog, 'command', 'old', { autoRun: true });
        host.step(5, 'old');
        assert.equal(host.currentSession!.state.tick, 5);
        const timersBeforeRestart = clock.timers.length;
        assert.ok(timersBeforeRestart === 1, 'exactly one automatic timer while running');
        host.start(scenarioAtRate(24), catalog, 'command', 'new', { autoRun: true });
        assert.equal(host.currentSession!.startId, 'new');
        assert.equal(host.currentSession!.state.tick, 0);
        assert.equal(host.currentSession!.commandLog.tickRate, 24);
        assert.equal(clock.timers.length, 1, 'restart must not stack timers');
        host.dispose();
    });

    test('stale messages cannot mutate the replacement session', () => {
        const host = new CombatCommandPlaytestHost({ clock: fakeClock() });
        host.start(scenarioAtRate(30), catalog, 'command', 'new');
        const staleStep = host.step(1, 'old');
        assert.equal(staleStep.ok, false);
        if (!staleStep.ok) assert.equal(staleStep.error, 'INVALID_START_ID');
        assert.equal(host.currentSession!.state.tick, 0);
        const staleRun = host.setRunning(true, 'old');
        assert.equal(staleRun.ok, false);
        assert.equal(host.isRunning, false);
        const staleIssue = host.issue({ unitIds: ['ally_1'], command: 'stop' }, 'old');
        assert.equal(staleIssue.ok, false);
        host.dispose();
    });

    test('document replacement clears the old scheduler/session', () => {
        const clock = fakeClock();
        const host = new CombatCommandPlaytestHost({ clock });
        const messages: unknown[] = [];
        host.subscribe('a', message => messages.push(message));
        host.start(scenarioAtRate(30), catalog, 'command', 's1', { autoRun: true });
        assert.equal(clock.timers.length, 1);
        host.clear();
        assert.equal(host.hasSession, false);
        assert.equal(host.isRunning, false);
        assert.equal(clock.timers.length, 0);
        const last = messages[messages.length - 1] as { type: string; state: null };
        assert.deepEqual(last, { type: 'combatCommandPlaytestState', state: null });
        host.dispose();
    });

    test('closing one subscriber leaves the other functional', () => {
        const clock = fakeClock();
        const host = new CombatCommandPlaytestHost({ clock });
        const a: unknown[] = [];
        const b: unknown[] = [];
        host.subscribe('a', message => a.push(message));
        host.subscribe('b', message => b.push(message));
        host.start(scenarioAtRate(30), catalog, 'command', 's1');
        host.unsubscribe('a');
        a.length = 0;
        b.length = 0;
        host.step(1, 's1');
        assert.equal(a.length, 0);
        assert.equal(b.length, 1);
        assert.equal(host.currentSession!.state.tick, 1);
        host.dispose();
    });

    test('reopening receives the current tick and running state', () => {
        const clock = fakeClock();
        const host = new CombatCommandPlaytestHost({ clock });
        host.subscribe('a', () => { /* primary */ });
        host.start(scenarioAtRate(30), catalog, 'command', 's1', { autoRun: true });
        host.step(7, 's1');
        // Keep running after manual step
        assert.equal(host.isRunning, true);
        const restored: unknown[] = [];
        host.subscribe('reopened', message => restored.push(message));
        assert.equal(restored.length, 1);
        const snapshot = (restored[0] as { state: { tick: number; running: boolean; startId: string } }).state;
        assert.equal(snapshot.tick, 7);
        assert.equal(snapshot.running, true);
        assert.equal(snapshot.startId, 's1');
        host.dispose();
    });

    test('24Hz host pulse over one simulated second advances 24 ticks', () => {
        const clock = fakeClock();
        const host = new CombatCommandPlaytestHost({ clock, maxTicksPerPulse: 1000 });
        host.start(scenarioAtRate(24), catalog, 'command', 's1', { autoRun: true });
        clock.nowMs = 1000;
        host.pulse(clock.nowMs);
        assert.equal(host.currentSession!.state.tick, 24);
        host.dispose();
    });

    test('ensureScheduler never stacks duplicate timers', () => {
        const clock = fakeClock();
        const host = new CombatCommandPlaytestHost({ clock });
        host.start(scenarioAtRate(30), catalog, 'command', 's1', { autoRun: true });
        assert.equal(clock.timers.length, 1);
        host.setRunning(true, 's1');
        host.setRunning(true, 's1');
        assert.equal(clock.timers.length, 1);
        host.dispose();
    });

    test('failed restart broadcasts state:null to all subscribers and leaves no session/timer', () => {
        const clock = fakeClock();
        const host = new CombatCommandPlaytestHost({ clock });
        const a: unknown[] = [];
        const b: unknown[] = [];
        host.subscribe('a', message => a.push(message));
        host.subscribe('b', message => b.push(message));

        const started = host.start(scenarioAtRate(30), catalog, 'command', 'old', { autoRun: true });
        assert.equal(started.ok, true);
        assert.equal(clock.timers.length, 1);
        a.length = 0;
        b.length = 0;

        const invalid = scenarioAtRate(30);
        (invalid.allies[0] as { position: unknown }).position = {};
        const failed = host.start(invalid, catalog, 'command', 'new-fail');
        assert.equal(failed.ok, false);
        if (!failed.ok) {
            assert.equal(failed.error, 'INVALID_COMBAT_LAB_SCENARIO');
        }
        assert.equal(host.hasSession, false);
        assert.equal(host.isRunning, false);
        assert.equal(clock.timers.length, 0);

        const nullMsg = { type: 'combatCommandPlaytestState', state: null };
        assert.deepEqual(a, [nullMsg]);
        assert.deepEqual(b, [nullMsg]);

        // Production path: extension fans structured start error through host notifyError.
        host.notifyError(
            failed.ok ? 'UNEXPECTED' : failed.error,
            failed.ok ? undefined : failed.detail,
            'start',
            invalid.id,
            'new-fail',
        );
        const errorMsg = {
            type: 'combatCommandPlaytestError',
            error: 'INVALID_COMBAT_LAB_SCENARIO',
            detail: failed.ok ? undefined : failed.detail,
            operation: 'start',
            scenarioId: invalid.id,
            startId: 'new-fail',
        };
        assert.deepEqual(a[1], errorMsg);
        assert.deepEqual(b[1], errorMsg);
        assert.equal(a.length, 2);
        assert.equal(b.length, 2);

        // Neither subscriber receives a stale snapshot of the retired battle afterward.
        host.pulse(clock.nowMs + 1000);
        assert.equal(a.length, 2);
        assert.equal(b.length, 2);
        host.dispose();
    });

    test('operation errors fan out to every subscriber with stable fields', () => {
        const host = new CombatCommandPlaytestHost({ clock: fakeClock() });
        const a: unknown[] = [];
        const b: unknown[] = [];
        host.subscribe('a', message => a.push(message));
        host.subscribe('b', message => b.push(message));
        host.start(scenarioAtRate(30), catalog, 'command', 'live');
        a.length = 0;
        b.length = 0;

        const cases: Array<{
            result: { ok: false; error: string; detail?: string };
            operation: string;
            startId: string;
        }> = [
            {
                result: host.setRunning(true, 'stale') as { ok: false; error: string; detail?: string },
                operation: 'run',
                startId: 'stale',
            },
            {
                result: host.step(1, 'stale') as { ok: false; error: string; detail?: string },
                operation: 'step',
                startId: 'stale',
            },
            {
                result: host.issue({ unitIds: ['ally_1'], command: 'stop' }, 'stale') as {
                    ok: false; error: string; detail?: string;
                },
                operation: 'issue',
                startId: 'stale',
            },
        ];

        for (const entry of cases) {
            assert.equal(entry.result.ok, false);
            assert.equal(entry.result.error, 'INVALID_START_ID');
            a.length = 0;
            b.length = 0;
            host.notifyError(
                entry.result.error,
                entry.result.detail,
                entry.operation,
                host.currentSession?.scenarioId,
                entry.startId,
            );
            const expected = {
                type: 'combatCommandPlaytestError',
                error: 'INVALID_START_ID',
                detail: entry.result.detail,
                operation: entry.operation,
                scenarioId: host.currentSession?.scenarioId,
                startId: entry.startId,
            };
            assert.deepEqual(a, [expected], entry.operation);
            assert.deepEqual(b, [expected], entry.operation);
            assert.equal(a.length, 1, `${entry.operation} must not double-send`);
        }

        // COMBAT_PLAYTEST_NOT_STARTED when no session.
        host.clear();
        a.length = 0;
        b.length = 0;
        const missing = host.step(1, 'live');
        assert.equal(missing.ok, false);
        if (!missing.ok) {
            assert.equal(missing.error, 'COMBAT_PLAYTEST_NOT_STARTED');
            host.notifyError(missing.error, missing.detail, 'step', undefined, 'live');
        }
        assert.deepEqual(a, [{
            type: 'combatCommandPlaytestError',
            error: 'COMBAT_PLAYTEST_NOT_STARTED',
            detail: undefined,
            operation: 'step',
            scenarioId: undefined,
            startId: 'live',
        }]);
        assert.deepEqual(b, a);
        host.dispose();
    });
});
