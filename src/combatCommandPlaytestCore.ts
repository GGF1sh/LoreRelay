import { CombatLabCatalog, CombatLabScenario, battleSpecForCombatLab, isValidScenario } from './combatLabCore';
import { CombatSelectableMode } from './combatModeContract';
import {
    BattleSpec,
    CombatState,
    CommandReceipt,
    combatTerminalOutcome,
    createCombatState,
    createCombatStepContext,
    stepCombat,
} from './gambitCombatCore';
import {
    CommandInputEvent,
    CommandInputLog,
    emptyCommandInputLog,
    normalizeCommandInputLog,
} from './combatRtsCommandInputCore';

export type CombatCommandPlaytestMode = Extract<CombatSelectableMode, 'command' | 'spectator'>;

export interface CombatCommandPlaytestSession {
    scenarioId: string;
    mode: CombatCommandPlaytestMode;
    startId?: string;
    spec: BattleSpec;
    state: CombatState;
    commandLog: CommandInputLog;
    nextSeq: number;
    lastIssued?: CommandInputEvent;
    feedback: CommandReceipt[];
    bounds: CombatCommandPlaytestBounds;
}

export interface CombatCommandPlaytestBounds {
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
}

export interface CombatCommandPlaytestSnapshot {
    scenarioId: string;
    mode: CombatCommandPlaytestMode;
    startId?: string;
    tick: number;
    /** Canonical positive-integer simulation rate (Hz) for the host-owned session. */
    tickRate?: number;
    /** Host-owned automatic playback state. Subscribers restore UI from this flag. */
    running?: boolean;
    outcome: string;
    bounds: CombatCommandPlaytestBounds;
    units: Array<{
        id: string;
        team: 0 | 1;
        hp: number;
        maxHp: number;
        x: number;
        y: number;
        dead: boolean;
        order: string | null;
    }>;
    lastIssued?: CommandInputEvent;
    feedback: CommandReceipt[];
}

export type CombatCommandPlaytestResult<T> =
    | { ok: true; value: T }
    | { ok: false; error: string; detail?: string };

function playtestBounds(state: CombatState, context: ReturnType<typeof createCombatStepContext>): CombatCommandPlaytestBounds {
    const largestMargin = Math.max(0, ...context.participantOrder.map(id => state.units[id].radius + 2));
    return {
        minX: context.battleRect.x + largestMargin,
        maxX: context.battleRect.x + context.battleRect.w - largestMargin,
        minY: context.battleRect.y + largestMargin,
        maxY: context.battleRect.y + context.battleRect.h - largestMargin,
    };
}

function clampScalar(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
}

/**
 * Combat Lab scenarios are authored around the origin (allies at x≈−80,
 * enemies at x≈+80), while the interactive playtest viewport's battle
 * rectangle lives entirely in positive coordinates (~20..992, ~20..478 for
 * 1280×720). Without a translation, createCombatState preserves the lab
 * coordinates, the webview clamps markers to the left/bottom edges, and
 * ordered combat still walks those out-of-bounds positions.
 *
 * Centers the formation's bounding box on the playable rectangle, then clamps
 * each unit into the same bounds used by the pointer adapter. Relative layout
 * is preserved whenever the formation already fits.
 */
export function mapUnitsIntoPlaytestBounds(
    state: CombatState,
    bounds: CombatCommandPlaytestBounds,
    participantOrder: readonly string[],
): void {
    const living = participantOrder.filter(id => state.units[id]);
    if (living.length === 0) return;

    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const id of living) {
        const unit = state.units[id];
        // Defensive guard for direct/malformed input that bypassed Combat Lab validation.
        if (
            typeof unit.pos_x !== 'number'
            || !Number.isFinite(unit.pos_x)
            || typeof unit.pos_y !== 'number'
            || !Number.isFinite(unit.pos_y)
        ) {
            throw new Error(`Unit ${id} has invalid non-numeric starting position (${unit.pos_x}, ${unit.pos_y})`);
        }
        minX = Math.min(minX, unit.pos_x);
        maxX = Math.max(maxX, unit.pos_x);
        minY = Math.min(minY, unit.pos_y);
        maxY = Math.max(maxY, unit.pos_y);
    }

    const formationCx = (minX + maxX) / 2;
    const formationCy = (minY + maxY) / 2;
    const boundsCx = (bounds.minX + bounds.maxX) / 2;
    const boundsCy = (bounds.minY + bounds.maxY) / 2;
    const dx = boundsCx - formationCx;
    const dy = boundsCy - formationCy;

    for (const id of living) {
        const unit = state.units[id];
        unit.pos_x = clampScalar(unit.pos_x + dx, bounds.minX, bounds.maxX);
        unit.pos_y = clampScalar(unit.pos_y + dy, bounds.minY, bounds.maxY);
    }
}

/** Clamps a command destination into the playtest rectangle (pointer adapter bounds). */
export function clampPlaytestPoint(
    point: { x: number; y: number },
    bounds: CombatCommandPlaytestBounds,
): { x: number; y: number } {
    return {
        x: clampScalar(point.x, bounds.minX, bounds.maxX),
        y: clampScalar(point.y, bounds.minY, bounds.maxY),
    };
}

export function createCombatCommandPlaytest(
    scenario: CombatLabScenario,
    catalog: CombatLabCatalog,
    requestedMode: unknown = 'command',
    startId?: string,
): CombatCommandPlaytestResult<CombatCommandPlaytestSession> {
    if (startId !== undefined && (typeof startId !== 'string' || startId.trim().length === 0 || startId.length > 128)) {
        return { ok: false, error: 'INVALID_START_ID', detail: 'startId must be a non-empty string <= 128 chars' };
    }
    const mode: CombatCommandPlaytestMode = requestedMode === undefined || requestedMode === 'command'
        ? 'command'
        : requestedMode === 'spectator'
            ? 'spectator'
            : 'command';
    if (requestedMode !== undefined && requestedMode !== 'command' && requestedMode !== 'spectator') {
        return { ok: false, error: 'INVALID_PLAYTEST_MODE' };
    }
    // Reject invalid coordinates / scenario shape with the Combat Lab contract before
    // battle-spec construction. apply/import/normalize share isValidScenario.
    if (!isValidScenario(scenario)) {
        return {
            ok: false,
            error: 'INVALID_COMBAT_LAB_SCENARIO',
            detail: 'scenario failed Combat Lab validation (including unit position.x/position.y finite numbers)',
        };
    }

    let spec: BattleSpec;
    try {
        spec = { ...battleSpecForCombatLab(scenario, catalog), selectableMode: mode };
    } catch (error) {
        return {
            ok: false,
            error: 'INVALID_COMBAT_BATTLE_SPEC',
            detail: error instanceof Error ? error.message : String(error),
        };
    }
    const baseContext = createCombatStepContext(spec, spec.viewport);
    const tickRate = 1 / baseContext.delta;
    if (!Number.isInteger(tickRate) || tickRate <= 0) {
        return { ok: false, error: 'UNSUPPORTED_COMBAT_TICK_RATE' };
    }
    const commandLog = emptyCommandInputLog(tickRate);
    const state = createCombatState(spec);
    const bounds = playtestBounds(state, baseContext);
    try {
        mapUnitsIntoPlaytestBounds(state, bounds, baseContext.participantOrder);
    } catch (error) {
        // Structured failure: never throw into host message handlers, never seed NaN positions.
        return {
            ok: false,
            error: 'INVALID_COMBAT_LAB_SCENARIO',
            detail: error instanceof Error ? error.message : String(error),
        };
    }
    return {
        ok: true,
        value: {
            scenarioId: scenario.id,
            mode,
            startId,
            spec,
            state,
            commandLog,
            nextSeq: 0,
            feedback: [],
            bounds,
        },
    };
}

function safeRead(value: object, key: PropertyKey): { ok: true; value: unknown } | { ok: false } {
    try {
        return { ok: true, value: Reflect.get(value, key) };
    } catch {
        return { ok: false };
    }
}

export function issueCombatCommand(
    session: CombatCommandPlaytestSession,
    raw: unknown,
): CombatCommandPlaytestResult<CombatCommandPlaytestSession> {
    let rawIsArray = false;
    try {
        rawIsArray = Array.isArray(raw);
    } catch {
        return { ok: false, error: 'INVALID_COMMAND_MESSAGE' };
    }
    if (!raw || typeof raw !== 'object' || rawIsArray) {
        return { ok: false, error: 'INVALID_COMMAND_MESSAGE' };
    }
    if (session.state.outcome) return { ok: false, error: 'COMBAT_ALREADY_COMPLETE' };

    const unitIds = safeRead(raw, 'unitIds');
    const command = safeRead(raw, 'command');
    const point = safeRead(raw, 'point');
    const targetId = safeRead(raw, 'targetId');
    if (!unitIds.ok || !command.ok || !point.ok || !targetId.ok) {
        return { ok: false, error: 'INVALID_COMMAND_MESSAGE' };
    }

    const event = {
        tick: session.state.tick + 1,
        seq: session.nextSeq,
        issuerTeam: 0,
        unitIds: unitIds.value,
        command: command.value,
        point: point.value,
        targetId: targetId.value,
    };
    const normalized = normalizeCommandInputLog({
        schemaVersion: session.commandLog.schemaVersion,
        tickRate: session.commandLog.tickRate,
        events: [...session.commandLog.events, event],
    }, session.commandLog.tickRate);
    if (!normalized.ok) return { ok: false, error: normalized.error, detail: normalized.detail };

    // normalizeCommandInputLog only quantizes coordinates; forged/direct webview
    // messages can still carry destinations outside session.bounds. move_to /
    // attack_move execution does not call clampToBattlefield on the destination,
    // so without this clamp a point like (-1000,-1000) walks units out of the
    // rendered rectangle indefinitely. Match the pointer adapter's bounds.
    const events = normalized.log.events.map(entry => {
        if (!entry.point) return entry;
        const clamped = clampPlaytestPoint(entry.point, session.bounds);
        if (clamped.x === entry.point.x && clamped.y === entry.point.y) return entry;
        return { ...entry, point: clamped };
    });
    const commandLog: CommandInputLog = { ...normalized.log, events };
    const lastIssued = events[events.length - 1];
    return {
        ok: true,
        value: {
            ...session,
            commandLog,
            nextSeq: session.nextSeq + 1,
            lastIssued,
            feedback: [],
        },
    };
}

export function advanceCombatCommandPlaytest(
    session: CombatCommandPlaytestSession,
    rawTicks: unknown = 1,
): CombatCommandPlaytestResult<CombatCommandPlaytestSession> {
    if (typeof rawTicks !== 'number' || !Number.isInteger(rawTicks) || rawTicks < 1 || rawTicks > 120) {
        return { ok: false, error: 'INVALID_STEP_COUNT' };
    }

    let state = session.state;
    const feedback: CommandReceipt[] = [];
    const spec = { ...session.spec, command: session.commandLog, selectableMode: session.mode };
    const context = createCombatStepContext(spec, spec.viewport);
    for (let index = 0; index < rawTicks && !state.outcome; index++) {
        if (state.tick > context.timeoutTicks) {
            state = { ...state, outcome: 'Timeout' };
            break;
        }
        const before = combatTerminalOutcome(state, context);
        if (before) {
            state = { ...state, outcome: before };
            break;
        }
        const stepped = stepCombat(state, context);
        state = stepped.state;
        feedback.push(...stepped.events.commandReceipts);
        const after = combatTerminalOutcome(state, context);
        if (after) state = { ...state, outcome: after };
        else if (state.tick > context.timeoutTicks) state = { ...state, outcome: 'Timeout' };
    }

    return { ok: true, value: { ...session, spec, state, feedback: feedback.slice(-40) } };
}

export function combatCommandPlaytestSnapshot(
    session: CombatCommandPlaytestSession,
    options?: { running?: boolean },
): CombatCommandPlaytestSnapshot {
    return {
        scenarioId: session.scenarioId,
        mode: session.mode,
        startId: session.startId,
        tick: session.state.tick,
        tickRate: session.commandLog.tickRate,
        running: options?.running,
        outcome: session.state.outcome,
        bounds: { ...session.bounds },
        units: session.spec.participantOrder.map(id => {
            const unit = session.state.units[id];
            return {
                id,
                team: unit.team as 0 | 1,
                hp: unit.hp,
                maxHp: unit.max_hp,
                x: unit.pos_x,
                y: unit.pos_y,
                dead: unit._dead || unit.hp <= 0,
                order: session.state.orders[id]?.command || null,
            };
        }),
        lastIssued: session.lastIssued ? structuredClone(session.lastIssued) : undefined,
        feedback: session.feedback.map(receipt => ({ ...receipt })),
    };
}
