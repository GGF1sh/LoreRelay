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
 *
 * Adversarial boundary (COMBAT-RTS-COMMAND-INPUT-ADVERSARIAL-HARDENING-001):
 * untrusted property reads and length captures are try/catch-isolated so
 * throwing getters, Proxy traps, and revoked Proxies become explicit
 * rejections rather than uncaught exceptions. Error details never invoke
 * caller toString / valueOf / Symbol.toPrimitive / toJSON on untrusted values.
 * Captured lengths are validated before any `new Array(n)`.
 */

import { quantizeScalar } from './combatDirectInputCore';

export const COMMAND_INPUT_SCHEMA_VERSION = 'combat-command-input-v1';

/**
 * Basis for the event-count cap. Matches `COMBAT_TIMEOUT_TICKS` in
 * `gambitCombatCore` (3600). Duplicated here so this pure schema module does
 * not import the combat runtime.
 */
const COMMAND_TIMEOUT_TICKS_BASIS = 3600;

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

/**
 * Hard cap on events in one command log.
 *
 * Derived from `COMMAND_TIMEOUT_TICKS_BASIS` (3600 = combat timeout ticks) × 16
 * commands/tick — a generous ceiling above any realistic player input rate, but
 * still finite so a hostile `length` cannot force multi-gigabyte allocations.
 * There is no tighter authoritative event budget in the RTS design yet.
 */
export const MAX_COMMAND_INPUT_EVENTS = COMMAND_TIMEOUT_TICKS_BASIS * 16;

/**
 * Hard cap on unitIds per command.
 *
 * Skirmish rosters and engagement tables are far smaller; 1024 is an explicit
 * defensive bound so drag-select cannot be used as a length-DoS vector, and so
 * `new Array(untrustedLength)` is never attempted with hostile values.
 */
export const MAX_COMMAND_UNIT_IDS = 1_024;

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

/**
 * Array.isArray throws on a revoked Proxy. Treat that as "not a usable array"
 * so the normalizer can reject instead of propagating.
 */
function safeIsArray(value: unknown): value is unknown[] {
    try {
        return Array.isArray(value);
    } catch {
        return false;
    }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !safeIsArray(value);
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
 * One property read of untrusted input, isolated so throwing getters / Proxy
 * traps / revoked Proxies become a soft failure instead of an uncaught throw.
 * Never used for trusted, internally-built values.
 */
function safeGet(target: object, key: PropertyKey): { ok: true; value: unknown } | { ok: false } {
    try {
        return { ok: true, value: Reflect.get(target, key) };
    } catch {
        return { ok: false };
    }
}

/**
 * Stable, side-effect-free description of an untrusted value for error details.
 *
 * Must not invoke caller-controlled `toString` / `valueOf` / `Symbol.toPrimitive`
 * / `toJSON` / `constructor`. Primitive numbers and short strings are rendered
 * directly (JSON-compatible input keeps the same detail bytes as before for
 * plain values); objects and functions collapse to type labels only.
 */
export function describeUntrusted(value: unknown): string {
    if (value === null) return 'null';
    if (value === undefined) return 'undefined';
    const kind = typeof value;
    if (kind === 'string') {
        // Cap detail size so a multi-megabyte string cannot bloat error paths.
        // Short strings (schema versions, unit ids) keep their exact text so
        // existing rejection details stay stable for ordinary JSON inputs.
        const text = value as string;
        if (text.length > 64) return `string(len=${text.length})`;
        return text;
    }
    if (kind === 'number') {
        const n = value as number;
        if (Number.isNaN(n)) return 'NaN';
        if (n === Infinity) return 'Infinity';
        if (n === -Infinity) return '-Infinity';
        // Template of a finite number never calls user code.
        return Object.is(n, -0) ? '0' : `${n}`;
    }
    if (kind === 'boolean') return value ? 'true' : 'false';
    if (kind === 'bigint') return 'bigint';
    if (kind === 'symbol') return 'symbol';
    if (kind === 'function') return 'function';
    if (safeIsArray(value)) return 'array';
    return 'object';
}

/**
 * Capture and validate an untrusted array length before any allocation or
 * iteration. Rejects non-numbers, non-integers, non-finite values, negatives,
 * and values above `max` (and below `min`).
 */
function captureArrayLength(
    array: object,
    min: number,
    max: number,
): { ok: true; length: number } | { ok: false } {
    const read = safeGet(array, 'length');
    if (!read.ok) return { ok: false };
    const length = read.value;
    if (typeof length !== 'number' || !Number.isFinite(length) || !Number.isInteger(length)) {
        return { ok: false };
    }
    if (length < min || length > max) return { ok: false };
    // Fold -0 (=== 0) so length bindings stay ordinary.
    return { ok: true, length: length === 0 ? 0 : length };
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
 *
 * Untrusted property access is isolated: a throw from a getter or Proxy trap
 * becomes an explicit `{ ok: false }` at the matching hierarchy, never an
 * uncaught exception. Internal logic after values are captured is not wrapped
 * in a blanket catch — implementation bugs must still surface.
 */
export function normalizeCommandInputLog(
    raw: unknown,
    expectedTickRate?: number,
): CommandInputNormalizeResult {
    if (!isPlainObject(raw)) {
        return fail('INVALID_LOG', 'log must be an object');
    }

    // ---- top-level fields: one safe read each ----
    const schemaVersionRead = safeGet(raw, 'schemaVersion');
    if (!schemaVersionRead.ok) {
        return fail('INVALID_SCHEMA_VERSION', 'schemaVersion unreadable');
    }
    const schemaVersion = schemaVersionRead.value;
    if (schemaVersion !== COMMAND_INPUT_SCHEMA_VERSION) {
        return fail('INVALID_SCHEMA_VERSION', describeUntrusted(schemaVersion));
    }

    const tickRateRead = safeGet(raw, 'tickRate');
    if (!tickRateRead.ok) {
        return fail('INVALID_TICK_RATE', 'tickRate unreadable');
    }
    const tickRate = tickRateRead.value;
    if (!isFiniteNumber(tickRate) || !Number.isInteger(tickRate) || tickRate <= 0) {
        return fail('INVALID_TICK_RATE', describeUntrusted(tickRate));
    }
    if (expectedTickRate !== undefined && tickRate !== expectedTickRate) {
        // expectedTickRate is caller-supplied trusted; tickRate is a validated number.
        return fail('INVALID_TICK_RATE', `expected ${expectedTickRate}, got ${tickRate}`);
    }

    const eventsRead = safeGet(raw, 'events');
    if (!eventsRead.ok) {
        return fail('INVALID_LOG', 'events unreadable');
    }
    const rawEvents = eventsRead.value;
    if (!safeIsArray(rawEvents)) {
        return fail('INVALID_LOG', 'events must be an array');
    }

    const eventCountCaptured = captureArrayLength(rawEvents, 0, MAX_COMMAND_INPUT_EVENTS);
    if (!eventCountCaptured.ok) {
        return fail('INVALID_LOG', 'events length is invalid');
    }
    const eventCount = eventCountCaptured.length;

    const events: CommandInputEvent[] = [];
    const seen = new Set<string>();

    for (let index = 0; index < eventCount; index++) {
        const sourceRead = safeGet(rawEvents, index);
        if (!sourceRead.ok) {
            return fail('INVALID_EVENT', `events[${index}] unreadable`);
        }
        const source = sourceRead.value;
        if (!isPlainObject(source)) {
            return fail('INVALID_EVENT', `events[${index}] must be an object`);
        }

        // Field reads are individual safe gets — never destructure untrusted objects.
        const tickRead = safeGet(source, 'tick');
        if (!tickRead.ok) {
            return fail('INVALID_TICK', `events[${index}].tick unreadable`);
        }
        const tick = tickRead.value;
        if (!isNonNegativeInteger(tick)) {
            return fail('INVALID_TICK', `events[${index}].tick=${describeUntrusted(tick)}`);
        }

        const seqRead = safeGet(source, 'seq');
        if (!seqRead.ok) {
            return fail('INVALID_SEQ', `events[${index}].seq unreadable`);
        }
        const seq = seqRead.value;
        if (!isNonNegativeInteger(seq)) {
            return fail('INVALID_SEQ', `events[${index}].seq=${describeUntrusted(seq)}`);
        }

        const key = `${tick}:${seq}`;
        if (seen.has(key)) {
            return fail('DUPLICATE_SEQ', `tick=${tick} seq=${seq}`);
        }
        seen.add(key);

        const issuerTeamRead = safeGet(source, 'issuerTeam');
        if (!issuerTeamRead.ok) {
            return fail('INVALID_TEAM', `events[${index}].issuerTeam unreadable`);
        }
        const issuerTeam = issuerTeamRead.value;
        if (issuerTeam !== 0 && issuerTeam !== 1) {
            return fail('INVALID_TEAM', `events[${index}].issuerTeam=${describeUntrusted(issuerTeam)}`);
        }

        const unitIdsRead = safeGet(source, 'unitIds');
        if (!unitIdsRead.ok) {
            return fail('INVALID_UNIT_IDS', `events[${index}].unitIds unreadable`);
        }
        const unitIds = unitIdsRead.value;
        if (!safeIsArray(unitIds)) {
            return fail('INVALID_UNIT_IDS', `events[${index}].unitIds must be a non-empty array`);
        }

        // Length is captured and validated *before* any allocation or iteration.
        const unitIdCountCaptured = captureArrayLength(unitIds, 1, MAX_COMMAND_UNIT_IDS);
        if (!unitIdCountCaptured.ok) {
            return fail('INVALID_UNIT_IDS', `events[${index}].unitIds length is invalid`);
        }
        const unitIdCount = unitIdCountCaptured.length;

        // Built by index assignment into a fresh, ordinary array — never
        // `unitIds.slice()`. Each element is read into `candidate` exactly once
        // via safeGet so a throwing index trap cannot escape, and a getter that
        // returns something else on a second access never gets a second access.
        const copiedUnitIds: string[] = new Array(unitIdCount);
        for (let u = 0; u < unitIdCount; u++) {
            const candidateRead = safeGet(unitIds, u);
            if (!candidateRead.ok) {
                return fail('INVALID_UNIT_IDS', `events[${index}].unitIds[${u}] unreadable`);
            }
            const candidate = candidateRead.value;
            if (!isNonEmptyString(candidate)) {
                return fail('INVALID_UNIT_IDS', `events[${index}].unitIds[${u}]=${describeUntrusted(candidate)}`);
            }
            copiedUnitIds[u] = candidate;
        }

        const commandRead = safeGet(source, 'command');
        if (!commandRead.ok) {
            return fail('INVALID_COMMAND', `events[${index}].command unreadable`);
        }
        const command = commandRead.value;
        if (typeof command !== 'string' || !COMMAND_SET.has(command)) {
            return fail('INVALID_COMMAND', `events[${index}].command=${describeUntrusted(command)}`);
        }

        const normalized: CommandInputEvent = {
            tick: foldNegativeZero(tick),
            seq: foldNegativeZero(seq),
            issuerTeam: foldNegativeZero(issuerTeam),
            unitIds: copiedUnitIds,
            command: command as RtsCommand,
        };

        if (POINT_COMMANDS.has(command)) {
            const pointRead = safeGet(source, 'point');
            if (!pointRead.ok) {
                return fail('INVALID_POINT', `events[${index}]: ${command} point unreadable`);
            }
            const point = pointRead.value;
            if (!isPlainObject(point)) {
                return fail('INVALID_POINT', `events[${index}]: ${command} requires a point`);
            }
            const rawXRead = safeGet(point, 'x');
            const rawYRead = safeGet(point, 'y');
            if (!rawXRead.ok || !rawYRead.ok) {
                return fail('NON_FINITE', `events[${index}].point unreadable`);
            }
            const rawX = rawXRead.value;
            const rawY = rawYRead.value;
            if (!isFiniteNumber(rawX) || !isFiniteNumber(rawY)) {
                return fail(
                    'NON_FINITE',
                    `events[${index}].point=(${describeUntrusted(rawX)}, ${describeUntrusted(rawY)})`,
                );
            }
            const quantizedX = quantizeCoordinate(rawX);
            const quantizedY = quantizeCoordinate(rawY);
            // The raw values passed the finite check above, but quantization itself
            // can overflow a large-but-finite coordinate to +/-Infinity. Re-checking
            // here is what keeps a non-finite value from ever reaching an ok:true log.
            // quantizedX/Y are our own numbers — safe to embed.
            if (!isFiniteNumber(quantizedX) || !isFiniteNumber(quantizedY)) {
                return fail('NON_FINITE', `events[${index}].point quantized to (${quantizedX}, ${quantizedY})`);
            }
            normalized.point = { x: quantizedX, y: quantizedY };
        }

        if (TARGET_COMMANDS.has(command)) {
            const targetIdRead = safeGet(source, 'targetId');
            if (!targetIdRead.ok) {
                return fail('INVALID_TARGET_ID', `events[${index}]: ${command} targetId unreadable`);
            }
            const targetId = targetIdRead.value;
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
