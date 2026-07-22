/**
 * Host-owned Combat Command Playtest session, multi-webview subscription, and
 * automatic playback. Webviews may request run/pause/step/commands; they must
 * not own the canonical advancement timer.
 *
 * Simulation advancement still goes only through advanceCombatCommandPlaytest
 * → stepCombat(). This module owns scheduling, subscriber fan-out, and
 * startId/session lifetime — not combat mechanics.
 */
import { CombatLabCatalog, CombatLabScenario } from './combatLabCore';
import {
    CombatCommandPlaytestResult,
    CombatCommandPlaytestSession,
    CombatCommandPlaytestSnapshot,
    advanceCombatCommandPlaytest,
    combatCommandPlaytestSnapshot,
    createCombatCommandPlaytest,
    issueCombatCommand,
} from './combatCommandPlaytestCore';

/** Default ceiling for catch-up work after a long stall (pathological pause). */
export const DEFAULT_MAX_PLAYBACK_TICKS_PER_PULSE = 120;

/** Default host pulse interval. Pure tests inject a clock and never wait on this. */
export const DEFAULT_PLAYBACK_PULSE_INTERVAL_MS = 50;

export type CombatCommandPlaytestPostMessage = (message: unknown) => void;

export interface ConsumePlaybackTicksInput {
    /** Canonical positive-integer simulation rate in Hz. */
    tickRate: number;
    /** Wall-clock milliseconds since the previous pulse (or start of run). */
    elapsedMs: number;
    /** Residual fractional milliseconds not yet converted into a whole tick. */
    carryMs: number;
    /** Hard cap on ticks advanced in one pulse (pathological catch-up). */
    maxTicksPerPulse?: number;
}

export interface ConsumePlaybackTicksResult {
    ticks: number;
    nextCarryMs: number;
}

/**
 * Drift-resistant elapsed-time → tick conversion.
 *
 * Uses totalMs * tickRate / 1000 so integer rates (10/24/25/30/60) accumulate
 * exactly over whole seconds. Fractional remainder is preserved in nextCarryMs.
 * When the catch-up cap fires, excess time is dropped so one stall cannot force
 * unbounded work on the next pulses.
 */
export function consumePlaybackTicks(input: ConsumePlaybackTicksInput): ConsumePlaybackTicksResult {
    const tickRate = input.tickRate;
    const elapsedMs = input.elapsedMs;
    const carryMs = Number.isFinite(input.carryMs) && input.carryMs > 0 ? input.carryMs : 0;
    if (!Number.isInteger(tickRate) || tickRate <= 0) {
        return { ticks: 0, nextCarryMs: carryMs };
    }
    if (!Number.isFinite(elapsedMs) || elapsedMs < 0) {
        return { ticks: 0, nextCarryMs: carryMs };
    }

    const maxTicks = Math.max(
        1,
        Math.trunc(input.maxTicksPerPulse ?? Math.max(DEFAULT_MAX_PLAYBACK_TICKS_PER_PULSE, tickRate * 2)),
    );
    const totalMs = carryMs + elapsedMs;
    const rawTicks = Math.floor((totalMs * tickRate) / 1000);
    if (rawTicks <= 0) {
        return { ticks: 0, nextCarryMs: totalMs };
    }
    if (rawTicks > maxTicks) {
        // Cap pathological catch-up and drop residual so the session resyncs to wall clock.
        return { ticks: maxTicks, nextCarryMs: 0 };
    }
    const consumedMs = (rawTicks * 1000) / tickRate;
    return {
        ticks: rawTicks,
        nextCarryMs: Math.max(0, totalMs - consumedMs),
    };
}

export interface CombatCommandPlaytestHostClock {
    now(): number;
    setTimer(callback: () => void, intervalMs: number): unknown;
    clearTimer(handle: unknown): void;
}

export interface CombatCommandPlaytestHostOptions {
    clock?: CombatCommandPlaytestHostClock;
    pulseIntervalMs?: number;
    maxTicksPerPulse?: number;
}

const defaultClock: CombatCommandPlaytestHostClock = {
    now: () => Date.now(),
    setTimer: (callback, intervalMs) => setInterval(callback, intervalMs),
    clearTimer: handle => {
        clearInterval(handle as ReturnType<typeof setInterval>);
    },
};

export interface CombatCommandPlaytestHostErrorMessage {
    type: 'combatCommandPlaytestError';
    error: string;
    detail?: string;
    operation?: string;
    scenarioId?: string;
    startId?: string;
}

/**
 * Single authoritative Combat Command Playtest host.
 * Exactly one session and one scheduler; many subscribers observe the same state.
 */
export class CombatCommandPlaytestHost {
    private session: CombatCommandPlaytestSession | undefined;
    private running = false;
    private carryMs = 0;
    private lastPulseAtMs: number | undefined;
    private timerHandle: unknown | undefined;
    private readonly subscribers = new Map<string, CombatCommandPlaytestPostMessage>();
    private readonly clock: CombatCommandPlaytestHostClock;
    private readonly pulseIntervalMs: number;
    private readonly maxTicksPerPulse: number;

    constructor(options: CombatCommandPlaytestHostOptions = {}) {
        this.clock = options.clock ?? defaultClock;
        this.pulseIntervalMs = Math.max(1, Math.trunc(options.pulseIntervalMs ?? DEFAULT_PLAYBACK_PULSE_INTERVAL_MS));
        this.maxTicksPerPulse = Math.max(
            1,
            Math.trunc(options.maxTicksPerPulse ?? DEFAULT_MAX_PLAYBACK_TICKS_PER_PULSE),
        );
    }

    get hasSession(): boolean {
        return this.session !== undefined;
    }

    get isRunning(): boolean {
        return this.running;
    }

    get subscriberCount(): number {
        return this.subscribers.size;
    }

    get currentSession(): CombatCommandPlaytestSession | undefined {
        return this.session;
    }

    /** Register a webview (or test) observer. Opening another subscriber must not restart battle. */
    subscribe(subscriberId: string, postMessage: CombatCommandPlaytestPostMessage): void {
        if (!subscriberId || typeof subscriberId !== 'string') return;
        this.subscribers.set(subscriberId, postMessage);
        if (this.session) {
            postMessage({
                type: 'combatCommandPlaytestState',
                state: this.snapshot(),
            });
        }
    }

    /**
     * Drop one observer. Closing/reloading a subscriber never destroys the host
     * session while any other valid subscriber remains (and we also keep the
     * session when the last subscriber closes until explicit clear/restart/dispose).
     */
    unsubscribe(subscriberId: string): void {
        this.subscribers.delete(subscriberId);
    }

    /**
     * Replace the host session exactly once. Stops any prior scheduler so a
     * restart cannot double-advance.
     *
     * A restart with a prior session first broadcasts state:null with
     * sessionEvent:'replaced' so every peer retires the old battle and may
     * adopt the following authoritative replacement snapshot (or start error).
     * Document clear uses a bare null without that event and must not prime
     * peers to adopt an unrelated later snapshot.
     *
     * If replacement creation fails after a prior session was retired, peers
     * already received the replaced-null; the caller fans out the structured
     * start error via {@link notifyError}.
     */
    start(
        scenario: CombatLabScenario,
        catalog: CombatLabCatalog,
        mode: unknown,
        startId: string,
        options?: { autoRun?: boolean },
    ): CombatCommandPlaytestResult<CombatCommandPlaytestSnapshot> {
        const hadPriorSession = this.session !== undefined;
        this.stopScheduler();
        this.session = undefined;
        this.running = false;
        this.carryMs = 0;
        this.lastPulseAtMs = undefined;

        if (hadPriorSession) {
            // Peers must drop old activeStartId before the replacement snapshot.
            this.broadcastState(null, { sessionEvent: 'replaced' });
        }

        const created = createCombatCommandPlaytest(scenario, catalog, mode, startId);
        if (!created.ok) {
            // Retire residual display when there was no prior session to replace.
            // When hadPriorSession, the replaced-null already cleared peers.
            if (!hadPriorSession) {
                this.broadcastState(null);
            }
            return created;
        }
        this.session = created.value;
        if (options?.autoRun && !this.session.state.outcome) {
            this.running = true;
            this.lastPulseAtMs = this.clock.now();
            this.ensureScheduler();
        }
        const snapshot = this.requireSnapshot();
        this.broadcastState(snapshot);
        return { ok: true, value: snapshot };
    }

    /**
     * Fan-out a structured Combat Command Playtest error to every valid subscriber.
     * Extension handlers must use this instead of posting only to the main panel.
     */
    notifyError(
        error: string,
        detail?: string,
        operation?: string,
        scenarioId?: string,
        startId?: string,
    ): void {
        this.broadcastError({
            type: 'combatCommandPlaytestError',
            error,
            detail,
            operation,
            scenarioId,
            startId,
        });
    }

    setRunning(running: unknown, startId?: unknown): CombatCommandPlaytestResult<CombatCommandPlaytestSnapshot> {
        if (!this.session) {
            return { ok: false, error: 'COMBAT_PLAYTEST_NOT_STARTED' };
        }
        const stale = this.rejectStaleStartId(startId, 'run');
        if (stale) return stale;
        if (typeof running !== 'boolean') {
            return { ok: false, error: 'INVALID_PLAYTEST_RUNNING' };
        }
        if (this.session.state.outcome) {
            this.running = false;
            this.stopScheduler();
            const snapshot = this.requireSnapshot();
            this.broadcastState(snapshot);
            return { ok: true, value: snapshot };
        }
        if (running) {
            if (!this.running) {
                this.running = true;
                this.lastPulseAtMs = this.clock.now();
                this.carryMs = 0;
                this.ensureScheduler();
            }
        } else {
            this.running = false;
            this.stopScheduler();
            this.carryMs = 0;
            this.lastPulseAtMs = undefined;
        }
        const snapshot = this.requireSnapshot();
        this.broadcastState(snapshot);
        return { ok: true, value: snapshot };
    }

    issue(raw: unknown, startId?: unknown): CombatCommandPlaytestResult<CombatCommandPlaytestSnapshot> {
        if (!this.session) {
            return { ok: false, error: 'COMBAT_PLAYTEST_NOT_STARTED' };
        }
        const stale = this.rejectStaleStartId(startId, 'issue');
        if (stale) return stale;
        const issued = issueCombatCommand(this.session, raw);
        if (!issued.ok) return issued;
        this.session = issued.value;
        const snapshot = this.requireSnapshot();
        this.broadcastState(snapshot);
        return { ok: true, value: snapshot };
    }

    /**
     * Manual one-tick (or multi-tick) step. Does not depend on the automatic
     * scheduler. Preserves deterministic advanceCombatCommandPlaytest semantics.
     */
    step(ticks: unknown = 1, startId?: unknown): CombatCommandPlaytestResult<CombatCommandPlaytestSnapshot> {
        if (!this.session) {
            return { ok: false, error: 'COMBAT_PLAYTEST_NOT_STARTED' };
        }
        const stale = this.rejectStaleStartId(startId, 'step');
        if (stale) return stale;
        const stepped = advanceCombatCommandPlaytest(this.session, ticks);
        if (!stepped.ok) return stepped;
        this.session = stepped.value;
        if (this.session.state.outcome) {
            this.running = false;
            this.stopScheduler();
            this.carryMs = 0;
            this.lastPulseAtMs = undefined;
        }
        const snapshot = this.requireSnapshot();
        this.broadcastState(snapshot);
        return { ok: true, value: snapshot };
    }

    /**
     * Drive automatic playback once. Tests inject a clock and call this directly
     * instead of waiting on wall-clock timers.
     */
    pulse(nowMs?: number): void {
        if (!this.session || !this.running || this.session.state.outcome) {
            if (this.session?.state.outcome && this.running) {
                this.running = false;
                this.stopScheduler();
                this.broadcastState(this.snapshot());
            }
            return;
        }
        const now = typeof nowMs === 'number' && Number.isFinite(nowMs) ? nowMs : this.clock.now();
        const last = this.lastPulseAtMs ?? now;
        const elapsedMs = Math.max(0, now - last);
        this.lastPulseAtMs = now;
        const tickRate = this.session.commandLog.tickRate;
        const { ticks, nextCarryMs } = consumePlaybackTicks({
            tickRate,
            elapsedMs,
            carryMs: this.carryMs,
            maxTicksPerPulse: this.maxTicksPerPulse,
        });
        this.carryMs = nextCarryMs;
        if (ticks <= 0) return;
        const stepped = advanceCombatCommandPlaytest(this.session, ticks);
        if (!stepped.ok) {
            this.broadcastError({
                type: 'combatCommandPlaytestError',
                error: stepped.error,
                detail: stepped.detail,
                operation: 'playback',
                scenarioId: this.session.scenarioId,
                startId: this.session.startId,
            });
            return;
        }
        this.session = stepped.value;
        if (this.session.state.outcome) {
            this.running = false;
            this.stopScheduler();
            this.carryMs = 0;
            this.lastPulseAtMs = undefined;
        }
        this.broadcastState(this.snapshot());
    }

    /** Document replacement / explicit clear: drop session and stop scheduler. */
    clear(): void {
        this.stopScheduler();
        this.session = undefined;
        this.running = false;
        this.carryMs = 0;
        this.lastPulseAtMs = undefined;
        this.broadcastState(null);
    }

    /** Extension deactivation: stop timers, drop session and all subscribers. */
    dispose(): void {
        this.stopScheduler();
        this.session = undefined;
        this.running = false;
        this.carryMs = 0;
        this.lastPulseAtMs = undefined;
        this.subscribers.clear();
    }

    snapshot(): CombatCommandPlaytestSnapshot | null {
        if (!this.session) return null;
        return this.requireSnapshot();
    }

    private requireSnapshot(): CombatCommandPlaytestSnapshot {
        if (!this.session) {
            throw new Error('COMBAT_PLAYTEST_NOT_STARTED');
        }
        return combatCommandPlaytestSnapshot(this.session, { running: this.running });
    }

    private rejectStaleStartId(
        startId: unknown,
        _operation: string,
    ): CombatCommandPlaytestResult<CombatCommandPlaytestSnapshot> | undefined {
        if (!this.session) return { ok: false, error: 'COMBAT_PLAYTEST_NOT_STARTED' };
        // When the active session carries a startId, mismatched or empty caller
        // identifiers must not mutate the newer session.
        if (this.session.startId === undefined) return undefined;
        if (typeof startId !== 'string' || startId.length === 0) {
            return {
                ok: false,
                error: 'INVALID_START_ID',
                detail: 'startId is required for the active playtest session',
            };
        }
        if (startId !== this.session.startId) {
            return {
                ok: false,
                error: 'INVALID_START_ID',
                detail: 'stale startId rejected',
            };
        }
        return undefined;
    }

    private ensureScheduler(): void {
        if (this.timerHandle !== undefined) return;
        if (!this.running || !this.session || this.session.state.outcome) return;
        this.timerHandle = this.clock.setTimer(() => {
            this.pulse();
        }, this.pulseIntervalMs);
    }

    private stopScheduler(): void {
        if (this.timerHandle === undefined) return;
        this.clock.clearTimer(this.timerHandle);
        this.timerHandle = undefined;
    }

    private broadcastState(
        state: CombatCommandPlaytestSnapshot | null,
        extras?: { sessionEvent?: 'replaced' | 'cleared' },
    ): void {
        const message: {
            type: 'combatCommandPlaytestState';
            state: CombatCommandPlaytestSnapshot | null;
            sessionEvent?: 'replaced' | 'cleared';
        } = { type: 'combatCommandPlaytestState', state };
        if (extras?.sessionEvent) message.sessionEvent = extras.sessionEvent;
        for (const post of this.subscribers.values()) {
            try {
                post(message);
            } catch {
                // One broken subscriber must not block the others.
            }
        }
    }

    private broadcastError(message: CombatCommandPlaytestHostErrorMessage): void {
        for (const post of this.subscribers.values()) {
            try {
                post(message);
            } catch {
                // ignore
            }
        }
    }
}
