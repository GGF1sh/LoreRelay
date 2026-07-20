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
 * Folds -0 to +0.
 *
 * `-0 === 0` is true in JS, so equality checks (`tick === 0`, `issuerTeam !== 1`)
 * cannot see the sign and happily accept -0 as a valid non-negative integer or
 * team id. JSON has no negative zero either — `JSON.stringify(-0)` is `"0"` — so
 * an accepted -0 would sit in memory as one value and come back from a round
 * trip as another, which is exactly the kind of two-representations-for-one-
 * value bug a canonical form exists to rule out. Any non-zero value, including
 * ordinary positive integers, passes through unchanged.
 */
function foldNegativeZero(value: number): number {
    return value === 0 ? 0 : value;
}

/**
 * Quantizes a coordinate and folds -0 into 0.
 *
 * `Math.round` yields -0 for small negatives (-0.0004 → -0); see
 * `foldNegativeZero` for why that has to be normalized away.
 *
 * Can return a non-finite value: a finite input near the double range's edge
 * (e.g. 1e306) overflows to Infinity once multiplied by DIRECTION_QUANTUM inside
 * quantizeScalar. Callers MUST re-check the result with isFiniteNumber — the
 * pre-quantization finite check on the raw input is not enough, since the input
 * being finite does not guarantee the quantized output is.
 */
function quantizeCoordinate(value: number): number {
    return foldNegativeZero(quantizeScalar(value));
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

    // Read `raw.events` exactly once. It can itself be a getter on a hostile
    // `raw` object, and re-fetching it for the array check, the length, and
    // each index — as the old code did — would let it hand back a different
    // value (or a different "array") on each access.
    const rawEvents = raw.events;
    if (!Array.isArray(rawEvents)) {
        return fail('INVALID_LOG', 'events must be an array');
    }
    const eventCount = rawEvents.length;

    const events: CommandInputEvent[] = [];
    const seen = new Set<string>();

    for (let index = 0; index < eventCount; index++) {
        const source = rawEvents[index];
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

        if (!Array.isArray(unitIds)) {
            return fail('INVALID_UNIT_IDS', `events[${index}].unitIds must be a non-empty array`);
        }
        // `unitIds.length` is read exactly once, into `unitIdCount`, and that
        // one binding drives the non-empty check, the copy's allocation size,
        // and the iteration bound below. The old code read `.length` a second
        // time to size the copy after already reading it once for the
        // non-empty check — a hostile length getter/Proxy trap can answer 1
        // the first time (passing "non-empty") and 0 the second, producing an
        // empty copy that should have been rejected outright.
        const unitIdCount = unitIds.length;
        if (unitIdCount === 0) {
            return fail('INVALID_UNIT_IDS', `events[${index}].unitIds must be a non-empty array`);
        }
        // Built by index assignment into a fresh, ordinary array — never
        // `unitIds.slice()`. `.slice()` (or any Array.prototype method) would
        // read every index a second time and would consult the input's own
        // `constructor`/`Symbol.species` to decide what to construct; on a
        // hostile input either of those can differ from what validation just
        // saw. Each element below is read into `candidate` exactly once, that
        // same binding is what gets validated AND what gets copied — a getter
        // that returns something else on a second access never gets a second
        // access to return it from.
        const copiedUnitIds: string[] = new Array(unitIdCount);
        for (let u = 0; u < unitIdCount; u++) {
            const candidate = unitIds[u];
            if (!isNonEmptyString(candidate)) {
                return fail('INVALID_UNIT_IDS', `events[${index}].unitIds[${u}]=${String(candidate)}`);
            }
            copiedUnitIds[u] = candidate;
        }

        if (typeof command !== 'string' || !COMMAND_SET.has(command)) {
            return fail('INVALID_COMMAND', `events[${index}].command=${String(command)}`);
        }

        const normalized: CommandInputEvent = {
            tick: foldNegativeZero(tick),
            seq: foldNegativeZero(seq),
            issuerTeam: foldNegativeZero(issuerTeam),
            unitIds: copiedUnitIds,
            command: command as RtsCommand,
        };

        if (POINT_COMMANDS.has(command)) {
            if (!isPlainObject(point)) {
                return fail('INVALID_POINT', `events[${index}]: ${command} requires a point`);
            }
            // point.x / point.y read exactly once each, into rawX/rawY. The old
            // code read them once for the finite check and again as the
            // quantizeCoordinate arguments — two separate property accesses a
            // getter could answer differently, e.g. a valid finite number for
            // the check and something else entirely for the value actually used.
            const rawX = point.x;
            const rawY = point.y;
            if (!isFiniteNumber(rawX) || !isFiniteNumber(rawY)) {
                return fail('NON_FINITE', `events[${index}].point=(${String(rawX)}, ${String(rawY)})`);
            }
            const quantizedX = quantizeCoordinate(rawX);
            const quantizedY = quantizeCoordinate(rawY);
            // The raw values passed the finite check above, but quantization itself
            // can overflow a large-but-finite coordinate to +/-Infinity. Re-checking
            // here is what keeps a non-finite value from ever reaching an ok:true log.
            if (!isFiniteNumber(quantizedX) || !isFiniteNumber(quantizedY)) {
                return fail('NON_FINITE', `events[${index}].point quantized to (${quantizedX}, ${quantizedY})`);
            }
            normalized.point = { x: quantizedX, y: quantizedY };
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
