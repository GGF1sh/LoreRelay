// Vehicle System V3: parse/apply turn_result.vehicleOps (pure, no vscode/fs).

import {
    MAX_HP_VALUE,
    MAX_RESOURCE_VALUE,
    parseVehicleState,
    type VehicleCondition,
    type VehicleState,
    type VehicleStatus,
} from './vehicleCore';

export const MAX_VEHICLE_OPS = 8;
export const MAX_VEHICLE_OP_AMOUNT = MAX_HP_VALUE;
export const MAX_VEHICLE_REFUEL_AMOUNT = MAX_RESOURCE_VALUE;

const ID_RE = /^[a-zA-Z0-9_-]{1,64}$/;

export const V3_VEHICLE_OP_TYPES = [
    'set_active_vehicle',
    'move_vehicle',
    'damage_vehicle',
    'repair_vehicle',
    'refuel_vehicle',
] as const;

export type V3VehicleOpType = (typeof V3_VEHICLE_OP_TYPES)[number];

export interface SetActiveVehicleOp {
    type: 'set_active_vehicle';
    vehicleId: string;
}

export interface MoveVehicleOp {
    type: 'move_vehicle';
    vehicleId: string;
    locationId: string;
    parkingLocationId?: string;
}

export interface DamageVehicleOp {
    type: 'damage_vehicle';
    vehicleId: string;
    amount: number;
    reason?: string;
}

export interface RepairVehicleOp {
    type: 'repair_vehicle';
    vehicleId: string;
    amount: number;
    reason?: string;
}

export interface RefuelVehicleOp {
    type: 'refuel_vehicle';
    vehicleId: string;
    amount: number;
    resourceType?: string;
}

export type VehicleOp =
    | SetActiveVehicleOp
    | MoveVehicleOp
    | DamageVehicleOp
    | RepairVehicleOp
    | RefuelVehicleOp;

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

function clampPositiveAmount(raw: unknown, max: number): number | undefined {
    if (typeof raw !== 'number' || !Number.isFinite(raw) || raw <= 0) { return undefined; }
    return Math.min(max, Math.floor(raw));
}

function isV3OpType(raw: unknown): raw is V3VehicleOpType {
    return typeof raw === 'string' && (V3_VEHICLE_OP_TYPES as readonly string[]).includes(raw);
}

function parseOp(raw: unknown): VehicleOp | undefined {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) { return undefined; }
    const r = raw as Record<string, unknown>;
    if (!isV3OpType(r.type)) { return undefined; }

    const vehicleId = asId(r.vehicleId);
    if (!vehicleId) { return undefined; }

    switch (r.type) {
        case 'set_active_vehicle':
            return { type: 'set_active_vehicle', vehicleId };
        case 'move_vehicle': {
            const locationId = asId(r.locationId);
            if (!locationId) { return undefined; }
            const op: MoveVehicleOp = { type: 'move_vehicle', vehicleId, locationId };
            const parkingLocationId = asId(r.parkingLocationId);
            if (parkingLocationId) { op.parkingLocationId = parkingLocationId; }
            return op;
        }
        case 'damage_vehicle': {
            const amount = clampPositiveAmount(r.amount, MAX_VEHICLE_OP_AMOUNT);
            if (amount === undefined) { return undefined; }
            const op: DamageVehicleOp = { type: 'damage_vehicle', vehicleId, amount };
            const reason = clampText(r.reason, 120);
            if (reason) { op.reason = reason; }
            return op;
        }
        case 'repair_vehicle': {
            const amount = clampPositiveAmount(r.amount, MAX_VEHICLE_OP_AMOUNT);
            if (amount === undefined) { return undefined; }
            const op: RepairVehicleOp = { type: 'repair_vehicle', vehicleId, amount };
            const reason = clampText(r.reason, 120);
            if (reason) { op.reason = reason; }
            return op;
        }
        case 'refuel_vehicle': {
            const amount = clampPositiveAmount(r.amount, MAX_VEHICLE_REFUEL_AMOUNT);
            if (amount === undefined) { return undefined; }
            const op: RefuelVehicleOp = { type: 'refuel_vehicle', vehicleId, amount };
            const resourceType = clampText(r.resourceType, 32);
            if (resourceType) { op.resourceType = resourceType; }
            return op;
        }
        default:
            return undefined;
    }
}

export function parseVehicleOps(raw: unknown): VehicleOp[] {
    if (!Array.isArray(raw)) { return []; }
    const out: VehicleOp[] = [];
    for (const item of raw.slice(0, MAX_VEHICLE_OPS * 2)) {
        const op = parseOp(item);
        if (!op) { continue; }
        out.push(op);
        if (out.length >= MAX_VEHICLE_OPS) { break; }
    }
    return out;
}

export function hasVehicleOps(raw: unknown): boolean {
    return parseVehicleOps(raw).length > 0;
}

export function shouldAttemptVehiclePersistCore(
    enableVehicleSystem: boolean,
    vehicleOps: unknown
): boolean {
    if (!enableVehicleSystem) {
        return false;
    }
    return hasVehicleOps(vehicleOps);
}

function cloneState(state: VehicleState): VehicleState {
    return parseVehicleState(JSON.parse(JSON.stringify(state)));
}

function findVehicleIndex(state: VehicleState, vehicleId: string): number {
    return state.vehicles.findIndex((v) => v.id === vehicleId);
}

function conditionFromHp(hp: number, maxHp: number): VehicleCondition {
    if (hp <= 0) { return 'disabled'; }
    const ratio = hp / Math.max(1, maxHp);
    if (ratio <= 0.25) { return 'critical'; }
    if (ratio <= 0.5) { return 'damaged'; }
    if (ratio <= 0.85) { return 'worn'; }
    return 'pristine';
}

const MOVABLE_VEHICLE_STATUSES = new Set<VehicleStatus>([
    'available',
    'parked',
    'docked',
    'stabled',
    'deployed',
]);

function statusAfterDamage(prev: VehicleStatus, hp: number): VehicleStatus {
    if (hp <= 0) { return 'disabled'; }
    if (MOVABLE_VEHICLE_STATUSES.has(prev)) { return 'damaged'; }
    return prev;
}

function statusAfterRepair(prev: VehicleStatus, hp: number, maxHp: number): VehicleStatus {
    if (hp <= 0) { return 'disabled'; }
    if (prev === 'disabled' || prev === 'damaged') {
        return hp >= maxHp ? 'available' : 'damaged';
    }
    return prev;
}

function applySetActiveVehicle(state: VehicleState, op: SetActiveVehicleOp): boolean {
    const idx = findVehicleIndex(state, op.vehicleId);
    if (idx < 0) { return false; }
    const vehicle = state.vehicles[idx];
    if (vehicle.status === 'lost') { return false; }
    if (state.activeVehicleId === op.vehicleId) { return false; }
    state.activeVehicleId = op.vehicleId;
    return true;
}

function applyMoveVehicle(state: VehicleState, op: MoveVehicleOp): boolean {
    const idx = findVehicleIndex(state, op.vehicleId);
    if (idx < 0) { return false; }
    const vehicle = state.vehicles[idx];
    if (vehicle.status === 'lost') { return false; }

    let changed = false;
    if (vehicle.locationId !== op.locationId) {
        vehicle.locationId = op.locationId;
        changed = true;
    }
    if (op.parkingLocationId) {
        const parkedAt = { ...(vehicle.parkedAt ?? {}), parkingLocationId: op.parkingLocationId };
        if (vehicle.parkedAt?.locationId !== op.locationId) {
            parkedAt.locationId = op.locationId;
        }
        if (JSON.stringify(vehicle.parkedAt) !== JSON.stringify(parkedAt)) {
            vehicle.parkedAt = parkedAt;
            changed = true;
        }
    }
    if (vehicle.status === 'available' || vehicle.status === 'deployed') {
        vehicle.status = 'parked';
        changed = true;
    }
    return changed;
}

function applyDamageVehicle(state: VehicleState, op: DamageVehicleOp): boolean {
    const idx = findVehicleIndex(state, op.vehicleId);
    if (idx < 0) { return false; }
    const vehicle = state.vehicles[idx];
    if (vehicle.status === 'lost') { return false; }

    const beforeHp = vehicle.durability.hp;
    const nextHp = Math.max(0, beforeHp - op.amount);
    if (nextHp === beforeHp) { return false; }

    vehicle.durability.hp = nextHp;
    vehicle.durability.condition = conditionFromHp(nextHp, vehicle.durability.maxHp);
    vehicle.status = statusAfterDamage(vehicle.status, nextHp);
    return true;
}

function applyRepairVehicle(state: VehicleState, op: RepairVehicleOp): boolean {
    const idx = findVehicleIndex(state, op.vehicleId);
    if (idx < 0) { return false; }
    const vehicle = state.vehicles[idx];
    if (vehicle.status === 'lost') { return false; }

    const beforeHp = vehicle.durability.hp;
    const nextHp = Math.min(vehicle.durability.maxHp, beforeHp + op.amount);
    if (nextHp === beforeHp) { return false; }

    vehicle.durability.hp = nextHp;
    vehicle.durability.condition = conditionFromHp(nextHp, vehicle.durability.maxHp);
    vehicle.status = statusAfterRepair(vehicle.status, nextHp, vehicle.durability.maxHp);
    return true;
}

function applyRefuelVehicle(state: VehicleState, op: RefuelVehicleOp): boolean {
    const idx = findVehicleIndex(state, op.vehicleId);
    if (idx < 0) { return false; }
    const vehicle = state.vehicles[idx];
    if (vehicle.status === 'lost') { return false; }
    const resources = vehicle.resources;
    if (!resources || resources.powerType === 'none') { return false; }
    if (op.resourceType && op.resourceType !== resources.powerType) { return false; }

    const max = resources.max ?? 0;
    const before = resources.current ?? 0;
    const next = Math.min(max, before + op.amount);
    if (next === before) { return false; }
    resources.current = next;
    return true;
}

function applySingleOp(state: VehicleState, op: VehicleOp): boolean {
    switch (op.type) {
        case 'set_active_vehicle':
            return applySetActiveVehicle(state, op);
        case 'move_vehicle':
            return applyMoveVehicle(state, op);
        case 'damage_vehicle':
            return applyDamageVehicle(state, op);
        case 'repair_vehicle':
            return applyRepairVehicle(state, op);
        case 'refuel_vehicle':
            return applyRefuelVehicle(state, op);
        default:
            return false;
    }
}

/**
 * Apply V3 vehicle ops to a vehicle ledger. Unknown vehicle ids and unsupported
 * op shapes are skipped. Input is not mutated.
 */
export function applyVehicleOps(
    current: VehicleState | undefined,
    ops: VehicleOp[],
    options?: { worldTurn?: number }
): VehicleState | undefined {
    if (!current || !ops.length) { return current; }

    const next = cloneState(current);
    let anyApplied = false;
    for (const op of ops) {
        if (applySingleOp(next, op)) {
            anyApplied = true;
        }
    }
    if (!anyApplied) { return current; }

    if (typeof options?.worldTurn === 'number' && Number.isFinite(options.worldTurn)) {
        next.updatedTurn = Math.max(0, Math.floor(options.worldTurn));
    }
    return next;
}