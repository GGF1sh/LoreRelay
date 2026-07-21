import { CombatLabCatalog, CombatLabScenario, battleSpecForCombatLab } from './combatLabCore';
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
    tick: number;
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

export function createCombatCommandPlaytest(
    scenario: CombatLabScenario,
    catalog: CombatLabCatalog,
    requestedMode: unknown = 'command',
): CombatCommandPlaytestResult<CombatCommandPlaytestSession> {
    const mode: CombatCommandPlaytestMode = requestedMode === undefined || requestedMode === 'command'
        ? 'command'
        : requestedMode === 'spectator'
            ? 'spectator'
            : 'command';
    if (requestedMode !== undefined && requestedMode !== 'command' && requestedMode !== 'spectator') {
        return { ok: false, error: 'INVALID_PLAYTEST_MODE' };
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
    return {
        ok: true,
        value: {
            scenarioId: scenario.id,
            mode,
            spec,
            state,
            commandLog,
            nextSeq: 0,
            feedback: [],
            bounds: playtestBounds(state, baseContext),
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

    const lastIssued = normalized.log.events[normalized.log.events.length - 1];
    return {
        ok: true,
        value: {
            ...session,
            commandLog: normalized.log,
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

export function combatCommandPlaytestSnapshot(session: CombatCommandPlaytestSession): CombatCommandPlaytestSnapshot {
    return {
        scenarioId: session.scenarioId,
        mode: session.mode,
        tick: session.state.tick,
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
