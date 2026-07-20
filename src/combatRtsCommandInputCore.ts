/**
 * RTS command input schema and normalization (COMBAT-RTS-COMMAND-INPUT-SCHEMA-001).
 *
 * PR2 of docs/COMBAT_RTS_COMMAND_SPINE_DESIGN.md: the wire format for player
 * commands, and the one function that turns untrusted input into a canonical log.
 * Nothing here touches the combat runtime — `resolveCombat` and `stepCombat` do
 * not read commands yet. This module is pure data: no clock, no randomness, no
 * I/O, no DOM, no VS Code API.
 *
 * The discipline mirrors `combatDirectInputCore`, which already proved it: a
 * total order of (tick, seq), quantized coordinates, and explicit rejection
 * instead of silent defaults. A replay is only reproducible if two logs that
 * mean the same thing serialize to the same bytes, so normalization produces a
 * canonical form rather than echoing whatever it was handed.
 */

import { quantizeScalar } from './combatDirectInputCore';

export const COMMAND_INPUT_SCHEMA_VERSION = 'combat-command-input-v1';

/**
 * The five verbs the RTS spine understands.
 *
 * `move_to` / `attack_move` carry a destination; `attack_target` carries a
 * target; `stop` / `resume_gambit` carry neither.
 */
export const RTS_COMMANDS = [
    'move_to',
    'attack_move',
    'attack_target',
    'stop',
    'resume_gambit',
] as const;

export type RtsCommand = typeof RTS_COMMANDS[number];

/** Commands that require a destination point. */
const POINT_COMMANDS: ReadonlySet<string> = new Set(['move_to', 'attack_move']);
/** Commands that require a target unit. */
const TARGET_COMMANDS: ReadonlySet<string> = new Set(['attack_target']);
const COMMAND_SET: ReadonlySet<string> = new Set(RTS_COMMANDS);

/** A destination in battlefield space, quantized to 1/1000. */
export interface CommandPoint {
    x: number;
    y: number;
}

/**
 * One player command. `unitIds` is the selection as the player made it — a drag
 * select lands here verbatim. Application order is decided later by
 * participantOrder (PR6), not by this array.
 */
export interface CommandInputEvent {
    /** Non-negative integer tick this command applies to. */
    tick: number;
    /** Order within a tick. (tick, seq) is unique across the log. */
    seq: number;
    /** 0 or 1. Blocks issuing commands to the other side. */
    issuerTeam: number;
    /** Non-empty. Original order preserved. */
    unitIds: string[];
    command: RtsCommand;
    /** Present only for `move_to` / `attack_move`. */
    point?: CommandPoint;
    /** Present only for `attack_target`. */
    targetId?: string;
}

export interface CommandInputLog {
    schemaVersion: typeof COMMAND_INPUT_SCHEMA_VERSION;
    /** Positive integer. Must agree with the battle's tick rate. */
    tickRate: number;
    /** Sorted by (tick, seq). */
    events: CommandInputEvent[];
}

export type CommandInputNormalizeErrorCode =
    | 'INVALID_LOG'
    | 'INVALID_SCHEMA_VERSION'
    | 'INVALID_TICK_RATE'
    | 'INVALID_EVENT'
    | 'INVALID_COMMAND'
    | 'INVALID_TICK'
    | 'INVALID_SEQ'
    | 'DUPLICATE_SEQ'
    | 'INVALID_UNIT_IDS'
    | 'INVALID_TEAM'
    | 'INVALID_POINT'
    | 'INVALID_TARGET_ID'
    | 'NON_FINITE';

export type CommandInputNormalizeResult =
    | { ok: true; log: CommandInputLog }
    | { ok: false; error: CommandInputNormalizeErrorCode; detail?: string };

export const DEFAULT_COMMAND_TICK_RATE = 30;

export function emptyCommandInputLog(tickRate: number = DEFAULT_COMMAND_TICK_RATE): CommandInputLog {
    return { schemaVersion: COMMAND_INPUT_SCHEMA_VERSION, tickRate, events: [] };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
    return typeof value === 'number' && Number.isFinite(value);
}

function isNonNegativeInteger(value: unknown): value is number {
    return isFiniteNumber(value) && Number.isInteger(value) && value >= 0;
}

function isNonEmptyString(value: unknown): value is string {
    return typeof value === 'string' && value.length > 0;
}

function fail(error: CommandInputNormalizeErrorCode, detail?: string): CommandInputNormalizeResult {
    return { ok: false, error, detail };
}

/**
 * Quantizes a coordinate and folds -0 into 0.
 *
 * `Math.round` yields -0 for small negatives (-0.0004 → -0), and JSON has no
 * negative zero: a round trip turns it back into 0. Leaving it would give the
 * same battlefield position two in-memory representations, which breaks the
 * uniqueness the canonical form is supposed to guarantee.
 */
function quantizeCoordinate(value: number): number {
    const quantized = quantizeScalar(value);
    return quantized === 0 ? 0 : quantized;
}

/**
 * Validates and canonicalizes a command log.
 *
 * `expectedTickRate` is the battle's tick rate. When supplied, a log recorded at
 * a different rate is rejected rather than silently reinterpreted — the same
 * (tick, seq) means a different moment at a different rate, so accepting it
 * would corrupt the replay.
 *
 * The returned log is canonical: events are sorted by (tick, seq), coordinates
 * are quantized, and fields a command does not use are dropped. Dropping rather
 * than preserving them is deliberate — it guarantees that two logs expressing
 * the same commands serialize identically, which is what makes replay
 * comparison meaningful. The input is never mutated.
 */
export function normalizeCommandInputLog(
    raw: unknown,
    expectedTickRate?: number,
): CommandInputNormalizeResult {
    if (!isPlainObject(raw)) {
        return fail('INVALID_LOG', 'log must be an object');
    }
    if (raw.schemaVersion !== COMMAND_INPUT_SCHEMA_VERSION) {
        return fail('INVALID_SCHEMA_VERSION', String(raw.schemaVersion));
    }

    const tickRate = raw.tickRate;
    if (!isFiniteNumber(tickRate) || !Number.isInteger(tickRate) || tickRate <= 0) {
        return fail('INVALID_TICK_RATE', String(tickRate));
    }
    if (expectedTickRate !== undefined && tickRate !== expectedTickRate) {
        return fail('INVALID_TICK_RATE', `expected ${expectedTickRate}, got ${tickRate}`);
    }

    if (!Array.isArray(raw.events)) {
        return fail('INVALID_LOG', 'events must be an array');
    }

    const events: CommandInputEvent[] = [];
    const seen = new Set<string>();

    for (let index = 0; index < raw.events.length; index++) {
        const source = raw.events[index];
        if (!isPlainObject(source)) {
            return fail('INVALID_EVENT', `events[${index}] must be an object`);
        }

        const { tick, seq, issuerTeam, unitIds, command, point, targetId } = source;

        if (!isNonNegativeInteger(tick)) {
            return fail('INVALID_TICK', `events[${index}].tick=${String(tick)}`);
        }
        if (!isNonNegativeInteger(seq)) {
            return fail('INVALID_SEQ', `events[${index}].seq=${String(seq)}`);
        }

        const key = `${tick}:${seq}`;
        if (seen.has(key)) {
            return fail('DUPLICATE_SEQ', `tick=${tick} seq=${seq}`);
        }
        seen.add(key);

        if (issuerTeam !== 0 && issuerTeam !== 1) {
            return fail('INVALID_TEAM', `events[${index}].issuerTeam=${String(issuerTeam)}`);
        }

        if (!Array.isArray(unitIds) || unitIds.length === 0) {
            return fail('INVALID_UNIT_IDS', `events[${index}].unitIds must be a non-empty array`);
        }
        for (let u = 0; u < unitIds.length; u++) {
            if (!isNonEmptyString(unitIds[u])) {
                return fail('INVALID_UNIT_IDS', `events[${index}].unitIds[${u}]=${String(unitIds[u])}`);
            }
        }

        if (typeof command !== 'string' || !COMMAND_SET.has(command)) {
            return fail('INVALID_COMMAND', `events[${index}].command=${String(command)}`);
        }

        const normalized: CommandInputEvent = {
            tick,
            seq,
            issuerTeam,
            // Copied, so the caller's array is neither shared nor reordered.
            unitIds: unitIds.slice(),
            command: command as RtsCommand,
        };

        if (POINT_COMMANDS.has(command)) {
            if (!isPlainObject(point)) {
                return fail('INVALID_POINT', `events[${index}]: ${command} requires a point`);
            }
            if (!isFiniteNumber(point.x) || !isFiniteNumber(point.y)) {
                return fail('NON_FINITE', `events[${index}].point=(${String(point.x)}, ${String(point.y)})`);
            }
            normalized.point = { x: quantizeCoordinate(point.x), y: quantizeCoordinate(point.y) };
        }

        if (TARGET_COMMANDS.has(command)) {
            if (!isNonEmptyString(targetId)) {
                return fail('INVALID_TARGET_ID', `events[${index}]: ${command} requires a targetId`);
            }
            normalized.targetId = targetId;
        }

        // Anything else the caller attached (a point on `stop`, a stray field) is
        // dropped here rather than carried, keeping the canonical form unique.
        events.push(normalized);
    }

    events.sort((a, b) => (a.tick !== b.tick ? a.tick - b.tick : a.seq - b.seq));

    return { ok: true, log: { schemaVersion: COMMAND_INPUT_SCHEMA_VERSION, tickRate, events } };
}
