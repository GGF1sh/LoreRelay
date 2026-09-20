// World Intent Core WI2: closed vehicle GameAction registry + vehicleOps adapter (no I/O).

import {
    applyVehicleOps,
    type DamageVehicleOp,
    MAX_VEHICLE_OP_AMOUNT,
    MAX_VEHICLE_REFUEL_AMOUNT,
    type MoveVehicleOp,
    type RefuelVehicleOp,
    type RepairVehicleOp,
    type SetActiveVehicleOp,
    type VehicleOp,
    V3_VEHICLE_OP_TYPES,
    type V3VehicleOpType,
} from './vehicleOpsCore';
import { parseVehicleState, type VehicleEntry, type VehicleState } from './vehicleCore';

export const WORLD_INTENT_VERSION = 1 as const;

export const MAX_WORLD_INTENTS = 8;
export const MAX_INTENT_ID_CHARS = 64;
export const MAX_INTENT_ACTION_CHARS = 64;
export const MAX_INTENT_PAYLOAD_BYTES = 4096;
export const MAX_INTENT_CORRELATION_CHARS = 64;
export const MAX_INTENT_SEED_CHARS = 64;

const ID_RE = /^[a-zA-Z0-9_-]{1,64}$/;

export const INTENT_SOURCES = [
    'gm',
    'agentic_referee',
    'player',
    'ui',
    'simulation',
    'mod',
    'debug',
] as const;
export type IntentSource = (typeof INTENT_SOURCES)[number];

export const INTENT_SUBSYSTEMS = [
    'world',
    'npc',
    'settlement',
    'vehicle',
    'mobile_base',
    'commerce',
    'campaign',
    'guild',
    'domain',
    'mod',
] as const;
export type IntentSubsystem = (typeof INTENT_SUBSYSTEMS)[number];

export const ENTITY_KINDS = [
    'player',
    'npc',
    'faction',
    'location',
    'region',
    'settlement',
    'vehicle',
    'mobile_base',
    'guild',
    'domain',
    'resource',
    'discovery',
    'quest',
    'mod_record',
    'world',
] as const;
export type EntityKind = (typeof ENTITY_KINDS)[number];

export type JsonValue =
    | null
    | boolean
    | number
    | string
    | JsonValue[]
    | { [key: string]: JsonValue };

export interface EntityRef {
    kind: EntityKind;
    id: string;
}

export interface ClockSnapshot {
    gmTurn?: number;
    worldTurn?: number;
    timestampIso?: string;
}

export interface WorldIntent {
    id: string;
    source: IntentSource;
    subsystem: IntentSubsystem;
    action: string;
    actor?: EntityRef;
    target?: EntityRef;
    payload: JsonValue;
    requestedAt?: ClockSnapshot;
    seed?: string;
    correlationId?: string;
}

export type WorldIntentQueryStatus =
    | 'allowed'
    | 'valid_noop'
    | 'blocked'
    | 'invalid'
    | 'unsupported';

export type WorldIntentExecuteStatus =
    | 'applied'
    | 'valid_noop'
    | 'blocked'
    | 'invalid'
    | 'unsupported'
    | 'failed';

export interface IntentPreview {
    subsystem: IntentSubsystem;
    action: string;
    vehicleId?: string;
}

export interface IntentQueryResult {
    ok: boolean;
    status: WorldIntentQueryStatus;
    reasonCode?: string;
    message?: string;
    preview?: IntentPreview;
    warnings?: string[];
}

export interface IntentExecuteResult {
    ok: boolean;
    applied: boolean;
    attempted: boolean;
    status: WorldIntentExecuteStatus;
    reasonCode?: string;
    message?: string;
    nextVehicleState?: VehicleState;
}

export interface WorldIntentQueryContext {
    gameRules?: {
        enableVehicleSystem?: boolean;
    };
    vehicleState?: VehicleState;
    worldTurn?: number;
}

/** Placeholder for WI4+ — not evaluated in WI1. */
export type RequirementOperator =
    | 'eq'
    | 'neq'
    | 'gt'
    | 'gte'
    | 'lt'
    | 'lte'
    | 'contains'
    | 'exists'
    | 'in';

/** Placeholder for WI4+ — not evaluated in WI1. */
export type RequirementExpr =
    | { all: RequirementExpr[] }
    | { any: RequirementExpr[] }
    | { not: RequirementExpr }
    | { subject: EntityKind; field: string; operator: RequirementOperator; value?: JsonValue };

export type WI2GameActionKey = `vehicle:${V3VehicleOpType}`;

export type VehicleWorldIntentBridgeMode = 'off' | 'shadow' | 'compare_only';

const VEHICLE_BRIDGE_MODES: readonly VehicleWorldIntentBridgeMode[] = ['off', 'shadow', 'compare_only'];

export interface GameActionResolution {
    query: IntentQueryResult;
    op?: VehicleOp;
    candidateNextVehicleState?: VehicleState;
}

interface VehicleGameAction {
    readonly subsystem: 'vehicle';
    readonly action: V3VehicleOpType;
    readonly key: WI2GameActionKey;
    query(intent: WorldIntent, context: WorldIntentQueryContext): GameActionResolution;
    execute(intent: WorldIntent, context: WorldIntentQueryContext, resolution: GameActionResolution): IntentExecuteResult;
}

function asId(raw: unknown): string {
    if (typeof raw !== 'string') { return ''; }
    const id = raw.trim();
    return ID_RE.test(id) ? id : '';
}

function clampText(raw: unknown, max: number): string | undefined {
    if (typeof raw !== 'string') { return undefined; }
    const t = raw.trim().replace(/\s+/g, ' ');
    return t ? t.slice(0, max) : undefined;
}

function pickUnion<T extends string>(raw: unknown, allowed: readonly T[], fallback: T): T {
    return typeof raw === 'string' && (allowed as readonly string[]).includes(raw) ? (raw as T) : fallback;
}

function parseEntityRef(raw: unknown): EntityRef | undefined {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) { return undefined; }
    const r = raw as Record<string, unknown>;
    if (typeof r.kind !== 'string' || !(ENTITY_KINDS as readonly string[]).includes(r.kind)) {
        return undefined;
    }
    const id = asId(r.id);
    if (!id) { return undefined; }
    return { kind: r.kind as EntityKind, id };
}

function isPlainJsonValue(value: unknown): value is JsonValue {
    if (value === null) { return true; }
    const t = typeof value;
    if (t === 'boolean' || t === 'string') { return true; }
    if (t === 'number') { return Number.isFinite(value as number); }
    if (Array.isArray(value)) {
        return value.every(isPlainJsonValue);
    }
    if (t === 'object') {
        const obj = value as Record<string, unknown>;
        if (
            Object.prototype.hasOwnProperty.call(obj, '__proto__')
            || Object.prototype.hasOwnProperty.call(obj, 'constructor')
            || Object.prototype.hasOwnProperty.call(obj, 'prototype')
        ) {
            return false;
        }
        return Object.keys(obj).every((k) => !k.startsWith('__') && isPlainJsonValue(obj[k]));
    }
    return false;
}

export function sanitizeIntentPayload(raw: unknown): JsonValue | undefined {
    if (!isPlainJsonValue(raw)) { return undefined; }
    let serialized: string;
    try {
        serialized = JSON.stringify(raw);
    } catch {
        return undefined;
    }
    if (serialized.length > MAX_INTENT_PAYLOAD_BYTES) { return undefined; }
    try {
        return JSON.parse(serialized) as JsonValue;
    } catch {
        return undefined;
    }
}

function parseClockSnapshot(raw: unknown): ClockSnapshot | undefined {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) { return undefined; }
    const r = raw as Record<string, unknown>;
    const out: ClockSnapshot = {};
    if (typeof r.gmTurn === 'number' && Number.isFinite(r.gmTurn)) {
        out.gmTurn = Math.max(0, Math.floor(r.gmTurn));
    }
    if (typeof r.worldTurn === 'number' && Number.isFinite(r.worldTurn)) {
        out.worldTurn = Math.max(0, Math.floor(r.worldTurn));
    }
    const timestampIso = clampText(r.timestampIso, 40);
    if (timestampIso) { out.timestampIso = timestampIso; }
    return Object.keys(out).length ? out : undefined;
}

export function parseWorldIntent(raw: unknown): WorldIntent | undefined {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) { return undefined; }
    const r = raw as Record<string, unknown>;
    const id = clampText(r.id, MAX_INTENT_ID_CHARS);
    if (!id || !ID_RE.test(id)) { return undefined; }
    if (typeof r.subsystem !== 'string' || !(INTENT_SUBSYSTEMS as readonly string[]).includes(r.subsystem)) {
        return undefined;
    }
    const action = clampText(r.action, MAX_INTENT_ACTION_CHARS);
    if (!action) { return undefined; }
    const payload = sanitizeIntentPayload(r.payload ?? {});
    if (payload === undefined) { return undefined; }

    const intent: WorldIntent = {
        id,
        source: pickUnion(r.source, INTENT_SOURCES, 'gm'),
        subsystem: r.subsystem as IntentSubsystem,
        action,
        payload,
    };
    const actor = parseEntityRef(r.actor);
    if (actor) { intent.actor = actor; }
    const target = parseEntityRef(r.target);
    if (target) { intent.target = target; }
    const requestedAt = parseClockSnapshot(r.requestedAt);
    if (requestedAt) { intent.requestedAt = requestedAt; }
    const seed = clampText(r.seed, MAX_INTENT_SEED_CHARS);
    if (seed) { intent.seed = seed; }
    const correlationId = clampText(r.correlationId, MAX_INTENT_CORRELATION_CHARS);
    if (correlationId) { intent.correlationId = correlationId; }
    return intent;
}

export function parseWorldIntentBatch(raw: unknown, max: number = MAX_WORLD_INTENTS): WorldIntent[] {
    if (!Array.isArray(raw)) { return []; }
    const cap = Math.max(0, Math.min(MAX_WORLD_INTENTS, Math.floor(max)));
    const out: WorldIntent[] = [];
    for (const item of raw.slice(0, cap * 2)) {
        const intent = parseWorldIntent(item);
        if (!intent) { continue; }
        out.push(intent);
        if (out.length >= cap) { break; }
    }
    return out;
}

function payloadRecord(payload: JsonValue): Record<string, JsonValue> | undefined {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) { return undefined; }
    return payload as Record<string, JsonValue>;
}

function invalidVehicleEntityKind(intent: WorldIntent): boolean {
    return intent.target !== undefined && intent.target.kind !== 'vehicle';
}

function vehicleIdFromIntent(intent: WorldIntent): string {
    if (intent.target?.kind === 'vehicle') {
        return asId(intent.target.id);
    }
    const rec = payloadRecord(intent.payload);
    return rec ? asId(rec.vehicleId) : '';
}

function clampPositiveAmount(raw: unknown, max: number): number | undefined {
    if (typeof raw !== 'number' || !Number.isFinite(raw) || raw <= 0) { return undefined; }
    return Math.min(max, Math.floor(raw));
}

export function vehicleOpFromWorldIntent(intent: WorldIntent): VehicleOp | undefined {
    if (intent.subsystem !== 'vehicle') { return undefined; }
    if (!VEHICLE_GAME_ACTION_REGISTRY.has(intent.action as V3VehicleOpType)) { return undefined; }
    if (invalidVehicleEntityKind(intent)) { return undefined; }

    const vehicleId = vehicleIdFromIntent(intent);
    if (!vehicleId) { return undefined; }
    const rec = payloadRecord(intent.payload) ?? {};
    const action = intent.action as V3VehicleOpType;

    switch (action) {
        case 'set_active_vehicle':
            return { type: 'set_active_vehicle', vehicleId };
        case 'move_vehicle': {
            const locationId = asId(rec.locationId);
            if (!locationId) { return undefined; }
            const op: MoveVehicleOp = { type: 'move_vehicle', vehicleId, locationId };
            const parkingLocationId = asId(rec.parkingLocationId);
            if (parkingLocationId) { op.parkingLocationId = parkingLocationId; }
            return op;
        }
        case 'damage_vehicle': {
            const amount = clampPositiveAmount(rec.amount, MAX_VEHICLE_OP_AMOUNT);
            if (amount === undefined) { return undefined; }
            const op: DamageVehicleOp = { type: 'damage_vehicle', vehicleId, amount };
            const reason = clampText(rec.reason, 120);
            if (reason) { op.reason = reason; }
            return op;
        }
        case 'repair_vehicle': {
            const amount = clampPositiveAmount(rec.amount, MAX_VEHICLE_OP_AMOUNT);
            if (amount === undefined) { return undefined; }
            const op: RepairVehicleOp = { type: 'repair_vehicle', vehicleId, amount };
            const reason = clampText(rec.reason, 120);
            if (reason) { op.reason = reason; }
            return op;
        }
        case 'refuel_vehicle': {
            const amount = clampPositiveAmount(rec.amount, MAX_VEHICLE_REFUEL_AMOUNT);
            if (amount === undefined) { return undefined; }
            const op: RefuelVehicleOp = { type: 'refuel_vehicle', vehicleId, amount };
            const resourceType = clampText(rec.resourceType, 32);
            if (resourceType) { op.resourceType = resourceType; }
            return op;
        }
        default:
            return undefined;
    }
}

export function worldIntentFromVehicleOp(op: VehicleOp, meta?: Partial<WorldIntent>): WorldIntent {
    const payload: Record<string, JsonValue> = {};
    switch (op.type) {
        case 'set_active_vehicle':
            break;
        case 'move_vehicle':
            payload.locationId = op.locationId;
            if (op.parkingLocationId) { payload.parkingLocationId = op.parkingLocationId; }
            break;
        case 'damage_vehicle':
            payload.amount = op.amount;
            if (op.reason) { payload.reason = op.reason; }
            break;
        case 'repair_vehicle':
            payload.amount = op.amount;
            if (op.reason) { payload.reason = op.reason; }
            break;
        case 'refuel_vehicle':
            payload.amount = op.amount;
            if (op.resourceType) { payload.resourceType = op.resourceType; }
            break;
        default:
            break;
    }

    const intent: WorldIntent = {
        id: meta?.id ?? `vehicle_${op.type}_${op.vehicleId}`,
        source: meta?.source ?? 'gm',
        subsystem: 'vehicle',
        action: op.type,
        target: { kind: 'vehicle', id: op.vehicleId },
        payload,
    };
    if (meta?.actor) { intent.actor = meta.actor; }
    if (meta?.correlationId) { intent.correlationId = meta.correlationId; }
    if (meta?.seed) { intent.seed = meta.seed; }
    if (meta?.requestedAt) { intent.requestedAt = meta.requestedAt; }
    return intent;
}

function vehiclePreview(intent: WorldIntent, vehicleId: string): IntentPreview {
    return { subsystem: 'vehicle', action: intent.action, vehicleId };
}

function findVehicle(state: VehicleState | undefined, vehicleId: string): VehicleEntry | undefined {
    return state?.vehicles.find((v) => v.id === vehicleId);
}

function vehicleSystemBlocked(ctx: WorldIntentQueryContext): boolean {
    return ctx.gameRules?.enableVehicleSystem === false;
}

function cloneVehicleState(state: VehicleState): VehicleState {
    return parseVehicleState(JSON.parse(JSON.stringify(state)));
}

function noopReasonForAction(action: V3VehicleOpType): string {
    switch (action) {
        case 'set_active_vehicle':
            return 'already_active';
        case 'move_vehicle':
            return 'already_at_location';
        case 'damage_vehicle':
        case 'repair_vehicle':
            return 'no_hp_change';
        case 'refuel_vehicle':
            return 'no_fuel_change';
        default:
            return 'no_effective_delta';
    }
}

type VehicleQueryOptions = {
    earlyNoop?: (
        op: VehicleOp,
        vehicle: VehicleEntry,
        state: VehicleState
    ) => IntentQueryResult | undefined;
    oracleNoopReason?: string;
};

function queryVehicleGameAction(
    intent: WorldIntent,
    ctx: WorldIntentQueryContext,
    options: VehicleQueryOptions = {}
): GameActionResolution {
    const vehicleId = vehicleIdFromIntent(intent);
    const preview = vehiclePreview(intent, vehicleId);

    if (invalidVehicleEntityKind(intent)) {
        return { query: { ok: false, status: 'invalid', reasonCode: 'invalid_entity_kind', preview } };
    }

    const op = vehicleOpFromWorldIntent(intent);
    if (!op) {
        return { query: { ok: false, status: 'invalid', reasonCode: 'invalid_vehicle_payload', preview } };
    }

    if (vehicleSystemBlocked(ctx)) {
        return { query: { ok: false, status: 'blocked', reasonCode: 'vehicle_system_disabled', preview } };
    }

    const state = ctx.vehicleState;
    const vehicle = findVehicle(state, op.vehicleId);
    if (!vehicle) {
        return { query: { ok: false, status: 'blocked', reasonCode: 'vehicle_not_found', preview } };
    }
    if (vehicle.status === 'lost') {
        return { query: { ok: false, status: 'blocked', reasonCode: 'vehicle_lost', preview } };
    }

    if (op.type === 'refuel_vehicle') {
        const resources = vehicle.resources;
        if (!resources || resources.powerType === 'none') {
            return { query: { ok: false, status: 'blocked', reasonCode: 'no_fuel_tank', preview } };
        }
        if (op.resourceType && op.resourceType !== resources.powerType) {
            return { query: { ok: false, status: 'blocked', reasonCode: 'fuel_type_mismatch', preview } };
        }
    }

    if (state && options.earlyNoop) {
        const early = options.earlyNoop(op, vehicle, state);
        if (early) {
            return { query: early, op };
        }
    }

    if (!state) {
        return { query: { ok: false, status: 'blocked', reasonCode: 'vehicle_not_found', preview } };
    }

    const candidate = applyVehicleOps(state, [op], { worldTurn: ctx.worldTurn });
    if (!candidate || candidate === state) {
        return {
            query: {
                ok: true,
                status: 'valid_noop',
                reasonCode: options.oracleNoopReason ?? noopReasonForAction(op.type),
                preview,
            },
            op,
        };
    }

    return {
        query: { ok: true, status: 'allowed', preview },
        op,
        candidateNextVehicleState: cloneVehicleState(candidate),
    };
}

function executeFromGameActionResolution(resolution: GameActionResolution): IntentExecuteResult {
    const base = {
        reasonCode: resolution.query.reasonCode,
        message: resolution.query.message,
    };

    switch (resolution.query.status) {
        case 'unsupported':
            return { ok: false, applied: false, attempted: false, status: 'unsupported', ...base };
        case 'invalid':
            return { ok: false, applied: false, attempted: false, status: 'invalid', ...base };
        case 'blocked':
            return { ok: false, applied: false, attempted: false, status: 'blocked', ...base };
        case 'valid_noop':
            return { ok: true, applied: false, attempted: true, status: 'valid_noop', ...base };
        case 'allowed':
            if (!resolution.candidateNextVehicleState) {
                return {
                    ok: false,
                    applied: false,
                    attempted: true,
                    status: 'failed',
                    reasonCode: 'execute_precondition_failed',
                };
            }
            return {
                ok: true,
                applied: true,
                attempted: true,
                status: 'applied',
                ...base,
                nextVehicleState: cloneVehicleState(resolution.candidateNextVehicleState),
            };
        default:
            return {
                ok: false,
                applied: false,
                attempted: true,
                status: 'failed',
                reasonCode: 'execute_precondition_failed',
            };
    }
}

function createVehicleGameAction(action: V3VehicleOpType, options: VehicleQueryOptions = {}): VehicleGameAction {
    const key = `vehicle:${action}` as WI2GameActionKey;
    return {
        subsystem: 'vehicle',
        action,
        key,
        query(intent, context) {
            return queryVehicleGameAction(intent, context, options);
        },
        execute(_intent, _context, resolution) {
            return executeFromGameActionResolution(resolution);
        },
    };
}

const VEHICLE_GAME_ACTION_REGISTRY: ReadonlyMap<V3VehicleOpType, VehicleGameAction> = new Map([
    ['set_active_vehicle', createVehicleGameAction('set_active_vehicle', {
        earlyNoop: (op, _vehicle, state) => {
            if (state.activeVehicleId === op.vehicleId) {
                return {
                    ok: true,
                    status: 'valid_noop',
                    reasonCode: 'already_active',
                    preview: { subsystem: 'vehicle', action: 'set_active_vehicle', vehicleId: op.vehicleId },
                };
            }
            return undefined;
        },
    })],
    ['move_vehicle', createVehicleGameAction('move_vehicle', { oracleNoopReason: 'already_at_location' })],
    ['damage_vehicle', createVehicleGameAction('damage_vehicle', {
        earlyNoop: (op, vehicle) => {
            if (vehicle.durability.hp <= 0) {
                return {
                    ok: true,
                    status: 'valid_noop',
                    reasonCode: 'hp_already_zero',
                    preview: { subsystem: 'vehicle', action: 'damage_vehicle', vehicleId: op.vehicleId },
                };
            }
            return undefined;
        },
    })],
    ['repair_vehicle', createVehicleGameAction('repair_vehicle', {
        earlyNoop: (_op, vehicle) => {
            if (vehicle.durability.hp >= vehicle.durability.maxHp) {
                return {
                    ok: true,
                    status: 'valid_noop',
                    reasonCode: 'hp_already_max',
                    preview: { subsystem: 'vehicle', action: 'repair_vehicle', vehicleId: vehicle.id },
                };
            }
            return undefined;
        },
    })],
    ['refuel_vehicle', createVehicleGameAction('refuel_vehicle', {
        earlyNoop: (_op, vehicle) => {
            const resources = vehicle.resources;
            const max = resources?.max ?? 0;
            const current = resources?.current ?? 0;
            if (current >= max) {
                return {
                    ok: true,
                    status: 'valid_noop',
                    reasonCode: 'fuel_already_max',
                    preview: { subsystem: 'vehicle', action: 'refuel_vehicle', vehicleId: vehicle.id },
                };
            }
            return undefined;
        },
        oracleNoopReason: 'no_fuel_change',
    })],
]);

export const VEHICLE_GAME_ACTION_REGISTRY_KEYS: readonly WI2GameActionKey[] = V3_VEHICLE_OP_TYPES.map(
    (action) => `vehicle:${action}` as WI2GameActionKey
);

export function getVehicleGameActionRegistrySize(): number {
    return VEHICLE_GAME_ACTION_REGISTRY.size;
}

export function getVehicleGameActionRegistryKey(action: V3VehicleOpType): WI2GameActionKey | undefined {
    return VEHICLE_GAME_ACTION_REGISTRY.get(action)?.key;
}

export function parseVehicleWorldIntentBridgeMode(raw: unknown): VehicleWorldIntentBridgeMode | undefined {
    if (typeof raw !== 'string') { return undefined; }
    return (VEHICLE_BRIDGE_MODES as readonly string[]).includes(raw)
        ? (raw as VehicleWorldIntentBridgeMode)
        : undefined;
}

function resolveVehicleGameAction(intent: WorldIntent): VehicleGameAction | undefined {
    if (intent.subsystem !== 'vehicle') { return undefined; }
    return VEHICLE_GAME_ACTION_REGISTRY.get(intent.action as V3VehicleOpType);
}

function unsupportedVehicleActionResult(intent: WorldIntent): IntentQueryResult {
    const vehicleId = vehicleIdFromIntent(intent);
    return {
        ok: false,
        status: 'unsupported',
        reasonCode: 'unsupported_action',
        preview: vehiclePreview(intent, vehicleId),
    };
}

export function queryWorldIntent(intent: WorldIntent, context: WorldIntentQueryContext): IntentQueryResult {
    if (intent.subsystem !== 'vehicle') {
        return {
            ok: false,
            status: 'unsupported',
            reasonCode: 'unsupported_subsystem',
            preview: { subsystem: intent.subsystem, action: intent.action },
        };
    }

    const entry = resolveVehicleGameAction(intent);
    if (!entry) {
        return unsupportedVehicleActionResult(intent);
    }
    return entry.query(intent, context).query;
}

export function executeWorldIntent(intent: WorldIntent, context: WorldIntentQueryContext): IntentExecuteResult {
    try {
        if (intent.subsystem !== 'vehicle') {
            return {
                ok: false,
                applied: false,
                attempted: false,
                status: 'unsupported',
                reasonCode: 'unsupported_subsystem',
            };
        }

        const entry = resolveVehicleGameAction(intent);
        if (!entry) {
            const unsupported = unsupportedVehicleActionResult(intent);
            return {
                ok: false,
                applied: false,
                attempted: false,
                status: 'unsupported',
                reasonCode: unsupported.reasonCode,
            };
        }

        const resolution = entry.query(intent, context);
        return entry.execute(intent, context, resolution);
    } catch {
        return {
            ok: false,
            applied: false,
            attempted: true,
            status: 'failed',
            reasonCode: 'execute_exception',
        };
    }
}