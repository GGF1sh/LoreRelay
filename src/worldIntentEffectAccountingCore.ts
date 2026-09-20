// World Intent WI4: pure refuel effect accounting (no I/O).

import {
    applyVehicleOps,
    type RefuelVehicleOp,
    type VehicleOp,
} from './vehicleOpsCore';
import { parseVehicleState, type VehicleEntry, type VehicleState } from './vehicleCore';

export const EFFECT_ACCOUNTING_VERSION = 1 as const;
export const MAX_EFFECT_CAUSE_LABEL_CHARS = 64;

export type EffectLedger = 'vehicle_state';
export type EffectSubsystem = 'vehicle';
export type EffectField = 'resources.current';
export type EffectAccountingOpType = 'refuel_vehicle';

export type EffectCauseType =
    | 'vehicle_op'
    | 'world_intent_shadow'
    | 'gm_intent'
    | 'simulation'
    | 'debug';

export interface EffectCause {
    type: EffectCauseType;
    id?: string;
    label?: string;
}

export interface EffectAccountingEntry {
    version: typeof EFFECT_ACCOUNTING_VERSION;
    ledger: EffectLedger;
    subsystem: EffectSubsystem;
    entity: { kind: 'vehicle'; id: string };
    field: EffectField;
    resourceType?: string;
    before: number;
    delta: number;
    after: number;
    cause: EffectCause;
    intentId?: string;
    opType: EffectAccountingOpType;
    worldTurn?: number;
}

export interface BuildVehicleRefuelAccountingInput {
    op: RefuelVehicleOp;
    preState: VehicleState;
    postState: VehicleState;
    intentId?: string;
    worldTurn?: number;
    cause?: EffectCause;
}

function cloneVehicleState(state: VehicleState): VehicleState {
    return parseVehicleState(JSON.parse(JSON.stringify(state)));
}

function findVehicle(state: VehicleState, vehicleId: string): VehicleEntry | undefined {
    return state.vehicles.find((v) => v.id === vehicleId);
}

function finiteNonNegativeInt(value: unknown): number | undefined {
    if (typeof value !== 'number' || !Number.isFinite(value)) { return undefined; }
    const n = Math.floor(value);
    return n >= 0 ? n : undefined;
}

function clampCauseLabel(raw: unknown): string | undefined {
    if (typeof raw !== 'string') { return undefined; }
    const t = raw.trim().replace(/\s+/g, ' ');
    return t ? t.slice(0, MAX_EFFECT_CAUSE_LABEL_CHARS) : undefined;
}

function sanitizeCause(cause: EffectCause | undefined): EffectCause {
    const type = cause?.type ?? 'vehicle_op';
    const allowed: EffectCauseType[] = [
        'vehicle_op',
        'world_intent_shadow',
        'gm_intent',
        'simulation',
        'debug',
    ];
    const safeType = allowed.includes(type) ? type : 'vehicle_op';
    const out: EffectCause = { type: safeType };
    if (typeof cause?.id === 'string' && cause.id.trim()) {
        out.id = cause.id.trim().slice(0, 64);
    }
    const label = clampCauseLabel(cause?.label);
    if (label) { out.label = label; }
    return out;
}

function isRefuelVehicleOp(op: VehicleOp): op is RefuelVehicleOp {
    return op.type === 'refuel_vehicle';
}

export function buildVehicleRefuelAccountingEntry(
    input: BuildVehicleRefuelAccountingInput
): EffectAccountingEntry | undefined {
    const { op, preState, postState } = input;
    const preVehicle = findVehicle(preState, op.vehicleId);
    const postVehicle = findVehicle(postState, op.vehicleId);
    if (!preVehicle || !postVehicle) { return undefined; }

    const preResources = preVehicle.resources;
    const postResources = postVehicle.resources;
    if (!preResources || !postResources) { return undefined; }
    if (preResources.powerType === 'none' || postResources.powerType === 'none') {
        return undefined;
    }
    if (op.resourceType && op.resourceType !== preResources.powerType) {
        return undefined;
    }
    if (postResources.powerType !== preResources.powerType) {
        return undefined;
    }

    const before = finiteNonNegativeInt(preResources.current);
    const after = finiteNonNegativeInt(postResources.current);
    const max = finiteNonNegativeInt(postResources.max);
    if (before === undefined || after === undefined) { return undefined; }
    if (after <= before) { return undefined; }
    if (max !== undefined && after > max) { return undefined; }
    if (max !== undefined && before > max) { return undefined; }

    const delta = after - before;
    if (max !== undefined && before + delta !== after) { return undefined; }
    const entry: EffectAccountingEntry = {
        version: EFFECT_ACCOUNTING_VERSION,
        ledger: 'vehicle_state',
        subsystem: 'vehicle',
        entity: { kind: 'vehicle', id: op.vehicleId },
        field: 'resources.current',
        resourceType: preResources.powerType,
        before,
        delta,
        after,
        cause: sanitizeCause(input.cause ?? { type: 'vehicle_op', label: 'refuel_vehicle' }),
        opType: 'refuel_vehicle',
    };

    if (typeof input.intentId === 'string' && input.intentId.trim()) {
        entry.intentId = input.intentId.trim().slice(0, 64);
    }
    if (typeof input.worldTurn === 'number' && Number.isFinite(input.worldTurn)) {
        entry.worldTurn = Math.max(0, Math.floor(input.worldTurn));
    }

    return entry;
}

export function buildVehicleRefuelAccountingFromLegacyApply(
    op: RefuelVehicleOp,
    preState: VehicleState,
    options?: {
        intentId?: string;
        worldTurn?: number;
        cause?: EffectCause;
    }
): EffectAccountingEntry | undefined {
    const pre = cloneVehicleState(preState);
    const post = applyVehicleOps(pre, [op], { worldTurn: options?.worldTurn });
    if (!post || post === pre) { return undefined; }
    return buildVehicleRefuelAccountingEntry({
        op,
        preState: pre,
        postState: post,
        intentId: options?.intentId,
        worldTurn: options?.worldTurn,
        cause: options?.cause,
    });
}

export function buildVehicleRefuelAccountingEntriesForOps(
    ops: VehicleOp[],
    preWriteState: VehicleState,
    options?: {
        intentId?: string;
        worldTurn?: number;
        cause?: EffectCause;
    }
): EffectAccountingEntry[] {
    const entries: EffectAccountingEntry[] = [];
    let running = cloneVehicleState(preWriteState);

    for (const op of ops) {
        if (!isRefuelVehicleOp(op)) { continue; }
        const pre = cloneVehicleState(running);
        const next = applyVehicleOps(running, [op], { worldTurn: options?.worldTurn });
        if (!next || next === running) { continue; }
        const entry = buildVehicleRefuelAccountingEntry({
            op,
            preState: pre,
            postState: next,
            intentId: options?.intentId,
            worldTurn: options?.worldTurn,
            cause: options?.cause,
        });
        if (entry) { entries.push(entry); }
        running = next;
    }

    return entries;
}