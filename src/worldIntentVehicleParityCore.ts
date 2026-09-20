// World Intent WI2: pure legacy↔WorldIntent vehicle shadow parity (no I/O).

import { applyVehicleOps, type VehicleOp, type V3VehicleOpType } from './vehicleOpsCore';
import { parseVehicleState, type VehicleEntry, type VehicleState } from './vehicleCore';
import {
    executeWorldIntent,
    queryWorldIntent,
    vehicleOpFromWorldIntent,
    worldIntentFromVehicleOp,
    type VehicleWorldIntentBridgeMode,
    type WorldIntentExecuteStatus,
    type WorldIntentQueryStatus,
} from './worldIntentCore';

export const VEHICLE_PARITY_REPORT_VERSION = 1 as const;

export type LegacyVehicleClass = 'changed' | 'unchanged_noop' | 'unchanged_blocked';

export type VehicleParityOutcome = 'match' | 'mismatch' | 'not_comparable';

export type VehicleParityMismatchCode =
    | 'adapter_roundtrip'
    | 'query_taxonomy'
    | 'execute_taxonomy'
    | 'applied_flag'
    | 'next_state'
    | 'updated_turn'
    | 'input_mutation'
    | 'unexpected_exception';

export interface VehicleWorldIntentParityInput {
    op: VehicleOp;
    vehicleState?: VehicleState;
    enableVehicleSystem?: boolean;
    worldTurn?: number;
}

export interface VehicleWorldIntentParityReport {
    version: typeof VEHICLE_PARITY_REPORT_VERSION;
    action: V3VehicleOpType;
    outcome: VehicleParityOutcome;
    expected: {
        legacyClass: LegacyVehicleClass;
        queryStatus: WorldIntentQueryStatus;
        executeStatus: WorldIntentExecuteStatus;
    };
    legacy: {
        attempted: boolean;
        changed: boolean;
        nextVehicleState?: VehicleState;
    };
    worldIntent: {
        queryStatus?: WorldIntentQueryStatus;
        executeStatus?: WorldIntentExecuteStatus;
        attempted?: boolean;
        applied?: boolean;
        nextVehicleState?: VehicleState;
    };
    mismatches: VehicleParityMismatchCode[];
}

const MISMATCH_ORDER: readonly VehicleParityMismatchCode[] = [
    'adapter_roundtrip',
    'query_taxonomy',
    'execute_taxonomy',
    'applied_flag',
    'next_state',
    'updated_turn',
    'input_mutation',
    'unexpected_exception',
];

function cloneVehicleState(state: VehicleState | undefined): VehicleState | undefined {
    if (!state) { return undefined; }
    return parseVehicleState(JSON.parse(JSON.stringify(state)));
}

function statesEqual(a: VehicleState | undefined, b: VehicleState | undefined): boolean {
    if (a === undefined && b === undefined) { return true; }
    if (a === undefined || b === undefined) { return false; }
    return JSON.stringify(a) === JSON.stringify(b);
}

function expectedFromLegacyClass(legacyClass: LegacyVehicleClass): {
    queryStatus: WorldIntentQueryStatus;
    executeStatus: WorldIntentExecuteStatus;
} {
    switch (legacyClass) {
        case 'changed':
            return { queryStatus: 'allowed', executeStatus: 'applied' };
        case 'unchanged_noop':
            return { queryStatus: 'valid_noop', executeStatus: 'valid_noop' };
        case 'unchanged_blocked':
            return { queryStatus: 'blocked', executeStatus: 'blocked' };
        default:
            return { queryStatus: 'blocked', executeStatus: 'blocked' };
    }
}

function findVehicle(state: VehicleState | undefined, vehicleId: string): VehicleEntry | undefined {
    return state?.vehicles.find((v) => v.id === vehicleId);
}

function classifyLegacyVehicleOp(
    op: VehicleOp,
    vehicleState: VehicleState | undefined,
    enableVehicleSystem: boolean | undefined,
    worldTurn: number | undefined
): { legacyClass: LegacyVehicleClass; attempted: boolean; changed: boolean; nextVehicleState?: VehicleState } {
    if (enableVehicleSystem === false) {
        return { legacyClass: 'unchanged_blocked', attempted: false, changed: false };
    }

    const state = vehicleState;
    const vehicle = findVehicle(state, op.vehicleId);
    if (!state || !vehicle) {
        return { legacyClass: 'unchanged_blocked', attempted: true, changed: false };
    }
    if (vehicle.status === 'lost') {
        return { legacyClass: 'unchanged_blocked', attempted: true, changed: false };
    }

    if (op.type === 'refuel_vehicle') {
        const resources = vehicle.resources;
        if (!resources || resources.powerType === 'none') {
            return { legacyClass: 'unchanged_blocked', attempted: true, changed: false };
        }
        if (op.resourceType && op.resourceType !== resources.powerType) {
            return { legacyClass: 'unchanged_blocked', attempted: true, changed: false };
        }
    }

    const before = state;
    const next = applyVehicleOps(before, [op], { worldTurn });
    if (next && next !== before) {
        return {
            legacyClass: 'changed',
            attempted: true,
            changed: true,
            nextVehicleState: cloneVehicleState(next),
        };
    }

    return { legacyClass: 'unchanged_noop', attempted: true, changed: false };
}

function sortMismatches(codes: VehicleParityMismatchCode[]): VehicleParityMismatchCode[] {
    const seen = new Set<VehicleParityMismatchCode>();
    const out: VehicleParityMismatchCode[] = [];
    for (const code of MISMATCH_ORDER) {
        if (codes.includes(code) && !seen.has(code)) {
            seen.add(code);
            out.push(code);
        }
    }
    return out;
}

function buildNotComparableReport(
    action: V3VehicleOpType,
    mismatches: VehicleParityMismatchCode[]
): VehicleWorldIntentParityReport {
    return {
        version: VEHICLE_PARITY_REPORT_VERSION,
        action,
        outcome: 'not_comparable',
        expected: {
            legacyClass: 'unchanged_blocked',
            queryStatus: 'blocked',
            executeStatus: 'blocked',
        },
        legacy: { attempted: false, changed: false },
        worldIntent: {},
        mismatches: sortMismatches(mismatches),
    };
}

export function compareVehicleWorldIntentParity(
    input: VehicleWorldIntentParityInput
): VehicleWorldIntentParityReport {
    const mismatches: VehicleParityMismatchCode[] = [];
    const action = input.op.type;

    const inputStateBefore = JSON.stringify(input.vehicleState);
    const legacyState = cloneVehicleState(input.vehicleState);
    const wiState = cloneVehicleState(input.vehicleState);

    let intent;
    try {
        intent = worldIntentFromVehicleOp(input.op, { id: `parity_${action}_${input.op.vehicleId}` });
        const roundTrip = vehicleOpFromWorldIntent(intent);
        if (!roundTrip || JSON.stringify(roundTrip) !== JSON.stringify(input.op)) {
            return buildNotComparableReport(action, ['adapter_roundtrip']);
        }
    } catch {
        return buildNotComparableReport(action, ['adapter_roundtrip', 'unexpected_exception']);
    }

    let legacy;
    try {
        legacy = classifyLegacyVehicleOp(
            input.op,
            legacyState,
            input.enableVehicleSystem,
            input.worldTurn
        );
    } catch {
        return buildNotComparableReport(action, ['unexpected_exception']);
    }

    const expected = expectedFromLegacyClass(legacy.legacyClass);

    let queryResult;
    let executeResult;
    try {
        const ctx = {
            gameRules: input.enableVehicleSystem === false
                ? { enableVehicleSystem: false as const }
                : undefined,
            vehicleState: wiState,
            worldTurn: input.worldTurn,
        };
        queryResult = queryWorldIntent(intent, ctx);
        executeResult = executeWorldIntent(intent, ctx);
    } catch {
        mismatches.push('unexpected_exception');
        return {
            version: VEHICLE_PARITY_REPORT_VERSION,
            action,
            outcome: 'mismatch',
            expected: { legacyClass: legacy.legacyClass, ...expected },
            legacy: {
                attempted: legacy.attempted,
                changed: legacy.changed,
                nextVehicleState: legacy.nextVehicleState,
            },
            worldIntent: {},
            mismatches: sortMismatches(mismatches),
        };
    }

    if (JSON.stringify(input.vehicleState) !== inputStateBefore) {
        mismatches.push('input_mutation');
    }

    if (queryResult.status !== expected.queryStatus) {
        mismatches.push('query_taxonomy');
    }
    if (executeResult.status !== expected.executeStatus) {
        mismatches.push('execute_taxonomy');
    }

    const expectedApplied = legacy.changed;
    if (executeResult.applied !== expectedApplied) {
        mismatches.push('applied_flag');
    }

    if (legacy.changed) {
        if (!statesEqual(executeResult.nextVehicleState, legacy.nextVehicleState)) {
            mismatches.push('next_state');
        }
        const legacyTurn = legacy.nextVehicleState?.updatedTurn;
        const wiTurn = executeResult.nextVehicleState?.updatedTurn;
        if (legacyTurn !== wiTurn) {
            mismatches.push('updated_turn');
        }
    } else if (executeResult.nextVehicleState !== undefined) {
        mismatches.push('next_state');
    }

    if (!legacy.changed && legacy.nextVehicleState === undefined && executeResult.nextVehicleState !== undefined) {
        const finiteTurn = typeof input.worldTurn === 'number' && Number.isFinite(input.worldTurn);
        const inputTurn = input.vehicleState?.updatedTurn;
        if (finiteTurn && executeResult.nextVehicleState.updatedTurn !== inputTurn) {
            mismatches.push('updated_turn');
        }
    }

    const outcome: VehicleParityOutcome = mismatches.length === 0 ? 'match' : 'mismatch';

    return {
        version: VEHICLE_PARITY_REPORT_VERSION,
        action,
        outcome,
        expected: { legacyClass: legacy.legacyClass, ...expected },
        legacy: {
            attempted: legacy.attempted,
            changed: legacy.changed,
            nextVehicleState: legacy.nextVehicleState,
        },
        worldIntent: {
            queryStatus: queryResult.status,
            executeStatus: executeResult.status,
            attempted: executeResult.attempted,
            applied: executeResult.applied,
            nextVehicleState: executeResult.nextVehicleState,
        },
        mismatches: sortMismatches(mismatches),
    };
}

export function isApprovedVehicleBridgeMode(mode: unknown): mode is VehicleWorldIntentBridgeMode {
    return mode === 'off' || mode === 'shadow' || mode === 'compare_only';
}