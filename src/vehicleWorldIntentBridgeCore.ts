// World Intent WI3b: pure vehicle bridge batch parity (no I/O).

import { parseVehicleOps } from './vehicleOpsCore';
import { parseVehicleState, type VehicleState } from './vehicleCore';
import {
    parseVehicleWorldIntentBridgeMode,
    type VehicleWorldIntentBridgeMode,
} from './worldIntentCore';
import {
    compareVehicleWorldIntentParity,
    type VehicleWorldIntentParityReport,
} from './worldIntentVehicleParityCore';

export const VEHICLE_BRIDGE_BATCH_VERSION = 1 as const;

export interface VehicleWorldIntentBridgeBatchInput {
    bridgeMode: VehicleWorldIntentBridgeMode;
    vehicleOps: unknown;
    preWriteVehicleState?: VehicleState;
    enableVehicleSystem: boolean;
    worldTurn?: number;
}

export interface VehicleWorldIntentBridgeBatchReport {
    version: typeof VEHICLE_BRIDGE_BATCH_VERSION;
    bridgeMode: VehicleWorldIntentBridgeMode;
    operationCount: number;
    reportCount: number;
    matchCount: number;
    mismatchCount: number;
    notComparableCount: number;
    exceptionCount: number;
    reports: VehicleWorldIntentParityReport[];
    parityError?: string;
}

function cloneVehicleState(state: VehicleState | undefined): VehicleState | undefined {
    if (!state) { return undefined; }
    return parseVehicleState(JSON.parse(JSON.stringify(state)));
}

function emptyBatchReport(
    bridgeMode: VehicleWorldIntentBridgeMode,
    operationCount: number
): VehicleWorldIntentBridgeBatchReport {
    return {
        version: VEHICLE_BRIDGE_BATCH_VERSION,
        bridgeMode,
        operationCount,
        reportCount: 0,
        matchCount: 0,
        mismatchCount: 0,
        notComparableCount: 0,
        exceptionCount: 0,
        reports: [],
    };
}

export function normalizeVehicleWorldIntentBridgeMode(raw: unknown): VehicleWorldIntentBridgeMode {
    return parseVehicleWorldIntentBridgeMode(raw) ?? 'off';
}

export function runVehicleWorldIntentBridgeBatch(
    input: VehicleWorldIntentBridgeBatchInput
): VehicleWorldIntentBridgeBatchReport {
    const bridgeMode = input.bridgeMode;
    const ops = parseVehicleOps(input.vehicleOps);
    if (bridgeMode === 'off' || !ops.length) {
        return emptyBatchReport(bridgeMode, ops.length);
    }

    const reports: VehicleWorldIntentParityReport[] = [];
    let exceptionCount = 0;

    for (const op of ops) {
        try {
            const report = compareVehicleWorldIntentParity({
                op,
                vehicleState: cloneVehicleState(input.preWriteVehicleState),
                enableVehicleSystem: input.enableVehicleSystem,
                worldTurn: input.worldTurn,
            });
            reports.push(report);
        } catch (e) {
            exceptionCount++;
            console.warn('[vehicleWorldIntentBridge] parity exception', e);
        }
    }

    return {
        version: VEHICLE_BRIDGE_BATCH_VERSION,
        bridgeMode,
        operationCount: ops.length,
        reportCount: reports.length,
        matchCount: reports.filter((r) => r.outcome === 'match').length,
        mismatchCount: reports.filter((r) => r.outcome === 'mismatch').length,
        notComparableCount: reports.filter((r) => r.outcome === 'not_comparable').length,
        exceptionCount,
        reports,
    };
}

export function buildVehicleBridgeParityErrorReport(
    bridgeMode: VehicleWorldIntentBridgeMode,
    operationCount: number,
    error: unknown
): VehicleWorldIntentBridgeBatchReport {
    const message = error instanceof Error ? error.message : String(error);
    return {
        ...emptyBatchReport(bridgeMode, operationCount),
        exceptionCount: 1,
        parityError: message,
    };
}