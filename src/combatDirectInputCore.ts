/**
 * Direct-control input log schema: normalize, validate, quantize, serialize.
 *
 * Determinism rules:
 * - Total order is (tick, seq) only — never wall clock or draw FPS.
 * - Direction is quantized to 1/1000.
 * - tickRate is a required positive integer, preserved through round-trip.
 * - actorId is required on every event.
 * - No Math.random().
 * - Invalid action / negative tick / duplicate (tick,seq) / non-finite → reject.
 */

import { CombatSelectableMode, isCombatSelectableMode } from './combatModeContract';

export const DIRECT_INPUT_SCHEMA_VERSION = 'combat-direct-input-v1' as const;
export const DIRECTION_QUANTUM = 1000 as const;
/** Default tick rate for empty logs and callers that do not override. */
export const DIRECT_INPUT_DEFAULT_TICK_RATE = 30 as const;

/** Semantic actions — binding keys/buttons is a presentation concern, not this schema. */
export const DIRECT_SEMANTIC_ACTIONS = [
    'move',
    'light_attack',
    'heavy_attack',
    'use_ability',
    'guard',
    'parry',
    'dodge',
    'target_lock',
    'target_cycle',
    'companion_order',
    'switch_character',
    'pause',
    'tactical_order',
    'mode_switch',
] as const;

export type DirectSemanticAction = (typeof DIRECT_SEMANTIC_ACTIONS)[number];

export type DirectInputPhase = 'press' | 'release';

export const COMPANION_ORDERS = [
    'gather',
    'scatter',
    'focus',
    'retreat',
    'heal_priority',
] as const;

export type CompanionOrder = (typeof COMPANION_ORDERS)[number];

export interface QuantizedDirection {
    x: number;
    y: number;
}

export interface DirectInputEvent {
    tick: number;
    seq: number;
    /** Combatant this input drives (distinct from incoming attackerId/targetId). */
    actorId: string;
    action: DirectSemanticAction;
    phase?: DirectInputPhase;
    direction?: QuantizedDirection;
    targetId?: string;
    abilityId?: string;
    /** Companion order payload when action is `companion_order`. */
    order?: CompanionOrder;
    /** Mode switch target when action is `mode_switch`. */
    requestedMode?: CombatSelectableMode;
}

export interface DirectInputLog {
    schemaVersion: typeof DIRECT_INPUT_SCHEMA_VERSION;
    /** Positive finite integer ticks-per-second; required. */
    tickRate: number;
    events: DirectInputEvent[];
}

export type DirectInputNormalizeErrorCode =
    | 'INVALID_LOG'
    | 'INVALID_SCHEMA_VERSION'
    | 'INVALID_TICK_RATE'
    | 'INVALID_EVENT'
    | 'INVALID_ACTION'
    | 'INVALID_TICK'
    | 'INVALID_SEQ'
    | 'INVALID_ACTOR_ID'
    | 'DUPLICATE_SEQ'
    | 'NON_FINITE'
    | 'INVALID_PHASE'
    | 'INVALID_DIRECTION'
    | 'INVALID_TARGET_ID'
    | 'INVALID_ABILITY_ID'
    | 'INVALID_ORDER'
    | 'INVALID_REQUESTED_MODE';

export type DirectInputNormalizeResult =
    | { ok: true; log: DirectInputLog }
    | { ok: false; error: DirectInputNormalizeErrorCode; detail?: string };

const ACTION_SET: ReadonlySet<string> = new Set(DIRECT_SEMANTIC_ACTIONS);
const ORDER_SET: ReadonlySet<string> = new Set(COMPANION_ORDERS);
const PHASE_SET: ReadonlySet<string> = new Set(['press', 'release']);

function isFiniteNumber(value: unknown): value is number {
    return typeof value === 'number' && Number.isFinite(value);
}

/** Quantize a scalar to 1/1000 (round half away from zero via Math.round). */
export function quantizeScalar(value: number): number {
    return Math.round(value * DIRECTION_QUANTUM) / DIRECTION_QUANTUM;
}

/**
 * Quantize a direction vector component-wise to 1/1000.
 * Does not re-normalize length — callers that need unit length should normalize
 * before quantizing; foundation only guarantees quantization stability.
 */
export function quantizeDirection(x: number, y: number): QuantizedDirection {
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
        throw new Error('NON_FINITE_DIRECTION');
    }
    return { x: quantizeScalar(x), y: quantizeScalar(y) };
}

function compareTickSeq(a: { tick: number; seq: number }, b: { tick: number; seq: number }): number {
    if (a.tick !== b.tick) return a.tick - b.tick;
    return a.seq - b.seq;
}

function normalizeTickRate(value: unknown): { ok: true; tickRate: number } | { ok: false; error: DirectInputNormalizeErrorCode; detail?: string } {
    if (!isFiniteNumber(value)) {
        return { ok: false, error: 'INVALID_TICK_RATE', detail: String(value) };
    }
    if (!Number.isInteger(value) || value <= 0) {
        return { ok: false, error: 'INVALID_TICK_RATE', detail: String(value) };
    }
    return { ok: true, tickRate: value };
}

function normalizeEvent(raw: unknown, index: number): { ok: true; event: DirectInputEvent } | { ok: false; error: DirectInputNormalizeErrorCode; detail?: string } {
    if (!raw || typeof raw !== 'object') {
        return { ok: false, error: 'INVALID_EVENT', detail: `index ${index}` };
    }
    const e = raw as Record<string, unknown>;

    if (!isFiniteNumber(e.tick)) {
        return { ok: false, error: Number.isFinite(e.tick as number) ? 'INVALID_TICK' : 'NON_FINITE', detail: `tick at ${index}` };
    }
    if (!Number.isInteger(e.tick) || e.tick < 0) {
        return { ok: false, error: 'INVALID_TICK', detail: `tick at ${index}` };
    }
    if (!isFiniteNumber(e.seq)) {
        return { ok: false, error: Number.isFinite(e.seq as number) ? 'INVALID_SEQ' : 'NON_FINITE', detail: `seq at ${index}` };
    }
    if (!Number.isInteger(e.seq) || e.seq < 0) {
        return { ok: false, error: 'INVALID_SEQ', detail: `seq at ${index}` };
    }
    if (typeof e.actorId !== 'string' || e.actorId.length === 0) {
        return { ok: false, error: 'INVALID_ACTOR_ID', detail: `actorId at ${index}` };
    }
    // Reject legacy alias explicitly so callers migrate to mode_switch.
    if (e.action === 'mode_transition') {
        return { ok: false, error: 'INVALID_ACTION', detail: 'mode_transition' };
    }
    if (typeof e.action !== 'string' || !ACTION_SET.has(e.action)) {
        return { ok: false, error: 'INVALID_ACTION', detail: String(e.action) };
    }

    const event: DirectInputEvent = {
        tick: e.tick,
        seq: e.seq,
        actorId: e.actorId,
        action: e.action as DirectSemanticAction,
    };

    if (e.phase !== undefined) {
        if (typeof e.phase !== 'string' || !PHASE_SET.has(e.phase)) {
            return { ok: false, error: 'INVALID_PHASE', detail: String(e.phase) };
        }
        event.phase = e.phase as DirectInputPhase;
    }

    if (e.direction !== undefined) {
        if (!e.direction || typeof e.direction !== 'object') {
            return { ok: false, error: 'INVALID_DIRECTION' };
        }
        const d = e.direction as Record<string, unknown>;
        if (!isFiniteNumber(d.x) || !isFiniteNumber(d.y)) {
            return { ok: false, error: 'NON_FINITE', detail: 'direction' };
        }
        event.direction = quantizeDirection(d.x, d.y);
    }

    if (e.targetId !== undefined) {
        if (typeof e.targetId !== 'string') {
            return { ok: false, error: 'INVALID_TARGET_ID' };
        }
        event.targetId = e.targetId;
    }

    if (e.abilityId !== undefined) {
        if (typeof e.abilityId !== 'string') {
            return { ok: false, error: 'INVALID_ABILITY_ID' };
        }
        event.abilityId = e.abilityId;
    }

    if (e.order !== undefined) {
        if (typeof e.order !== 'string' || !ORDER_SET.has(e.order)) {
            return { ok: false, error: 'INVALID_ORDER', detail: String(e.order) };
        }
        event.order = e.order as CompanionOrder;
    }

    if (e.requestedMode !== undefined) {
        if (!isCombatSelectableMode(e.requestedMode)) {
            return { ok: false, error: 'INVALID_REQUESTED_MODE', detail: String(e.requestedMode) };
        }
        event.requestedMode = e.requestedMode;
    }

    return { ok: true, event };
}

/**
 * Validate and normalize a direct input log.
 * - Requires positive integer tickRate
 * - Requires non-empty actorId on every event
 * - Sorts by (tick, seq)
 * - Quantizes directions
 * - Rejects duplicates of (tick, seq) and mode_transition
 */
export function normalizeDirectInputLog(raw: unknown): DirectInputNormalizeResult {
    if (raw === undefined || raw === null) {
        return { ok: true, log: emptyDirectInputLog() };
    }
    if (typeof raw !== 'object') {
        return { ok: false, error: 'INVALID_LOG' };
    }
    const obj = raw as Record<string, unknown>;
    if (obj.schemaVersion !== DIRECT_INPUT_SCHEMA_VERSION) {
        return { ok: false, error: 'INVALID_SCHEMA_VERSION', detail: String(obj.schemaVersion) };
    }
    const tr = normalizeTickRate(obj.tickRate);
    if (!tr.ok) return tr;
    if (!Array.isArray(obj.events)) {
        return { ok: false, error: 'INVALID_LOG', detail: 'events' };
    }

    const events: DirectInputEvent[] = [];
    for (let i = 0; i < obj.events.length; i++) {
        const n = normalizeEvent(obj.events[i], i);
        if (!n.ok) return n;
        events.push(n.event);
    }

    events.sort(compareTickSeq);

    const seen = new Set<string>();
    for (const event of events) {
        const key = `${event.tick}:${event.seq}`;
        if (seen.has(key)) {
            return { ok: false, error: 'DUPLICATE_SEQ', detail: key };
        }
        seen.add(key);
    }

    return {
        ok: true,
        log: {
            schemaVersion: DIRECT_INPUT_SCHEMA_VERSION,
            tickRate: tr.tickRate,
            events,
        },
    };
}

export function emptyDirectInputLog(tickRate: number = DIRECT_INPUT_DEFAULT_TICK_RATE): DirectInputLog {
    const tr = normalizeTickRate(tickRate);
    return {
        schemaVersion: DIRECT_INPUT_SCHEMA_VERSION,
        tickRate: tr.ok ? tr.tickRate : DIRECT_INPUT_DEFAULT_TICK_RATE,
        events: [],
    };
}

/**
 * Stable JSON serialization after normalize.
 * Key order is fixed; no whitespace variance beyond JSON.stringify defaults.
 */
export function serializeDirectInputLog(log: DirectInputLog): string {
    const normalized = normalizeDirectInputLog(log);
    if (!normalized.ok) {
        throw new Error(`serializeDirectInputLog: ${normalized.error}`);
    }
    const payload = {
        schemaVersion: normalized.log.schemaVersion,
        tickRate: normalized.log.tickRate,
        events: normalized.log.events.map(eventToJsonObject),
    };
    return JSON.stringify(payload);
}

function eventToJsonObject(event: DirectInputEvent): Record<string, unknown> {
    const out: Record<string, unknown> = {
        tick: event.tick,
        seq: event.seq,
        actorId: event.actorId,
        action: event.action,
    };
    if (event.phase !== undefined) out.phase = event.phase;
    if (event.direction !== undefined) {
        out.direction = { x: event.direction.x, y: event.direction.y };
    }
    if (event.targetId !== undefined) out.targetId = event.targetId;
    if (event.abilityId !== undefined) out.abilityId = event.abilityId;
    if (event.order !== undefined) out.order = event.order;
    if (event.requestedMode !== undefined) out.requestedMode = event.requestedMode;
    return out;
}

/** Parse JSON text into a normalized log (rejects invalid). */
export function parseDirectInputLogJson(json: string): DirectInputNormalizeResult {
    let parsed: unknown;
    try {
        parsed = JSON.parse(json);
    } catch {
        return { ok: false, error: 'INVALID_LOG', detail: 'json_parse' };
    }
    return normalizeDirectInputLog(parsed);
}

/**
 * Normalize twice and compare serialized bytes. True iff deterministic.
 */
export function directInputLogIsStable(raw: unknown): boolean {
    const first = normalizeDirectInputLog(raw);
    if (!first.ok) return false;
    const a = serializeDirectInputLog(first.log);
    const second = normalizeDirectInputLog(JSON.parse(a));
    if (!second.ok) return false;
    const b = serializeDirectInputLog(second.log);
    return a === b;
}
