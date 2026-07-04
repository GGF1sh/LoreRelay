// Mobile Base System MB3: parse/apply turn_result.mobileBaseOps (vehicle_state only, pure).

import {
    mobileBaseSystemEnabled,
    parseMobileBaseLink,
    type MobileBaseMode,
    type MobileBaseRuleFlags,
} from './mobileBaseCore';
import {
    parseVehicleState,
    type VehicleEntry,
    type VehicleParkingKind,
    type VehicleState,
    type VehicleStatus,
} from './vehicleCore';

export const MAX_MOBILE_BASE_OPS = 8;
export const MAX_MOBILE_BASE_FUEL_CONSUME = 9999;

const ID_RE = /^[a-zA-Z0-9_-]{1,64}$/;

export const MB3_MOBILE_BASE_OP_TYPES = [
    'dock_mobile_base',
    'undock_mobile_base',
    'move_mobile_base',
    'consume_mobile_base_fuel',
] as const;

export type Mb3MobileBaseOpType = (typeof MB3_MOBILE_BASE_OP_TYPES)[number];

export interface DockMobileBaseOp {
    type: 'dock_mobile_base';
    vehicleId: string;
    locationId: string;
    parkingLocationId?: string;
}

export interface UndockMobileBaseOp {
    type: 'undock_mobile_base';
    vehicleId: string;
}

export interface MoveMobileBaseOp {
    type: 'move_mobile_base';
    vehicleId: string;
    locationId: string;
    parkingLocationId?: string;
}

export interface ConsumeMobileBaseFuelOp {
    type: 'consume_mobile_base_fuel';
    vehicleId: string;
    amount: number;
    reason?: string;
}

export type MobileBaseOp =
    | DockMobileBaseOp
    | UndockMobileBaseOp
    | MoveMobileBaseOp
    | ConsumeMobileBaseFuelOp;

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

function isMb3OpType(raw: unknown): raw is Mb3MobileBaseOpType {
    return typeof raw === 'string' && (MB3_MOBILE_BASE_OP_TYPES as readonly string[]).includes(raw);
}

function parseOp(raw: unknown): MobileBaseOp | undefined {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) { return undefined; }
    const r = raw as Record<string, unknown>;
    if (!isMb3OpType(r.type)) { return undefined; }

    const vehicleId = asId(r.vehicleId);
    if (!vehicleId) { return undefined; }

    switch (r.type) {
        case 'dock_mobile_base':
        case 'move_mobile_base': {
            const locationId = asId(r.locationId);
            if (!locationId) { return undefined; }
            const op: DockMobileBaseOp | MoveMobileBaseOp = {
                type: r.type,
                vehicleId,
                locationId,
            };
            const parkingLocationId = asId(r.parkingLocationId);
            if (parkingLocationId) { op.parkingLocationId = parkingLocationId; }
            return op;
        }
        case 'undock_mobile_base':
            return { type: 'undock_mobile_base', vehicleId };
        case 'consume_mobile_base_fuel': {
            const amount = clampPositiveAmount(r.amount, MAX_MOBILE_BASE_FUEL_CONSUME);
            if (amount === undefined) { return undefined; }
            const op: ConsumeMobileBaseFuelOp = { type: 'consume_mobile_base_fuel', vehicleId, amount };
            const reason = clampText(r.reason, 120);
            if (reason) { op.reason = reason; }
            return op;
        }
        default:
            return undefined;
    }
}

export function parseMobileBaseOps(raw: unknown): MobileBaseOp[] {
    if (!Array.isArray(raw)) { return []; }
    const out: MobileBaseOp[] = [];
    for (const item of raw.slice(0, MAX_MOBILE_BASE_OPS * 2)) {
        const op = parseOp(item);
        if (!op) { continue; }
        out.push(op);
        if (out.length >= MAX_MOBILE_BASE_OPS) { break; }
    }
    return out;
}

export function hasMobileBaseOps(raw: unknown): boolean {
    return parseMobileBaseOps(raw).length > 0;
}

export function shouldAttemptMobileBasePersistCore(
    rules: MobileBaseRuleFlags | undefined,
    mobileBaseOps: unknown
): boolean {
    if (!mobileBaseSystemEnabled(rules)) {
        return false;
    }
    return hasMobileBaseOps(mobileBaseOps);
}

function cloneState(state: VehicleState): VehicleState {
    return parseVehicleState(JSON.parse(JSON.stringify(state)));
}

function findVehicle(state: VehicleState, vehicleId: string): VehicleEntry | undefined {
    return state.vehicles.find((v) => v.id === vehicleId);
}

function isMobileBaseVehicle(vehicle: VehicleEntry | undefined): boolean {
    return Boolean(vehicle?.mobileBase && parseMobileBaseLink(vehicle.mobileBase));
}

function dockStatusForMode(mode: MobileBaseMode): VehicleStatus {
    return mode === 'ship' || mode === 'airship' ? 'docked' : 'parked';
}

function parkingKindForMode(mode: MobileBaseMode): VehicleParkingKind {
    if (mode === 'ship') { return 'docked'; }
    if (mode === 'airship') { return 'landed'; }
    return 'parked';
}

function applyDockMobileBase(vehicle: VehicleEntry, op: DockMobileBaseOp): boolean {
    const link = parseMobileBaseLink(vehicle.mobileBase);
    if (!link) { return false; }
    if (vehicle.status === 'lost') { return false; }

    const dockAt = op.parkingLocationId || op.locationId;
    let changed = false;

    if (vehicle.locationId !== op.locationId) {
        vehicle.locationId = op.locationId;
        changed = true;
    }
    if (link.dockedAtLocationId !== dockAt) {
        link.dockedAtLocationId = dockAt;
        vehicle.mobileBase = { ...vehicle.mobileBase!, ...link };
        changed = true;
    }
    const kind = parkingKindForMode(link.mode);
    const parkedAt = {
        locationId: op.locationId,
        parkingLocationId: op.parkingLocationId,
        kind,
    };
    if (JSON.stringify(vehicle.parkedAt) !== JSON.stringify(parkedAt)) {
        vehicle.parkedAt = parkedAt;
        changed = true;
    }
    const nextStatus = dockStatusForMode(link.mode);
    if (vehicle.status !== nextStatus) {
        vehicle.status = nextStatus;
        changed = true;
    }
    return changed;
}

function applyUndockMobileBase(vehicle: VehicleEntry): boolean {
    const link = parseMobileBaseLink(vehicle.mobileBase);
    if (!link) { return false; }
    if (vehicle.status === 'lost') { return false; }

    let changed = false;
    if (link.dockedAtLocationId) {
        const nextLink = { ...link };
        delete nextLink.dockedAtLocationId;
        vehicle.mobileBase = nextLink;
        changed = true;
    }
    if (vehicle.parkedAt) {
        delete vehicle.parkedAt;
        changed = true;
    }
    if (vehicle.status === 'docked' || vehicle.status === 'parked') {
        vehicle.status = 'deployed';
        changed = true;
    }
    return changed;
}

function applyMoveMobileBase(vehicle: VehicleEntry, op: MoveMobileBaseOp): boolean {
    const link = parseMobileBaseLink(vehicle.mobileBase);
    if (!link) { return false; }
    if (vehicle.status === 'lost' || vehicle.status === 'disabled') { return false; }

    const dockAt = op.parkingLocationId || op.locationId;
    let changed = false;

    if (vehicle.locationId !== op.locationId) {
        vehicle.locationId = op.locationId;
        changed = true;
    }
    if (link.dockedAtLocationId !== dockAt) {
        link.dockedAtLocationId = dockAt;
        vehicle.mobileBase = { ...vehicle.mobileBase!, ...link };
        changed = true;
    }
    if (op.parkingLocationId) {
        const kind = parkingKindForMode(link.mode);
        const parkedAt = {
            locationId: op.locationId,
            parkingLocationId: op.parkingLocationId,
            kind,
        };
        if (JSON.stringify(vehicle.parkedAt) !== JSON.stringify(parkedAt)) {
            vehicle.parkedAt = parkedAt;
            changed = true;
        }
    }
    return changed;
}

function applyConsumeMobileBaseFuel(vehicle: VehicleEntry, op: ConsumeMobileBaseFuelOp): boolean {
    const resources = vehicle.resources;
    if (!resources || resources.powerType === 'none') { return false; }
    const before = resources.current ?? 0;
    const next = Math.max(0, before - op.amount);
    if (next === before) { return false; }
    resources.current = next;
    return true;
}

function applySingleOp(state: VehicleState, op: MobileBaseOp): boolean {
    const vehicle = findVehicle(state, op.vehicleId);
    if (!isMobileBaseVehicle(vehicle)) { return false; }

    switch (op.type) {
        case 'dock_mobile_base':
            return applyDockMobileBase(vehicle!, op);
        case 'undock_mobile_base':
            return applyUndockMobileBase(vehicle!);
        case 'move_mobile_base':
            return applyMoveMobileBase(vehicle!, op);
        case 'consume_mobile_base_fuel':
            return applyConsumeMobileBaseFuel(vehicle!, op);
        default:
            return false;
    }
}

/**
 * Apply MB3 mobile-base ops to vehicle_state only. Settlement ledger is never
 * written. Input is not mutated.
 */
export function applyMobileBaseOps(
    current: VehicleState | undefined,
    ops: MobileBaseOp[],
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