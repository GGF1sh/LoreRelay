// Vehicle System V3: persist turn_result.vehicleOps to vehicle_state.json.

import type { VehicleState } from './vehicleCore';
import {
    applyVehicleOps,
    parseVehicleOps,
    shouldAttemptVehiclePersistCore,
} from './vehicleOpsCore';
import type { VehicleWorldIntentBridgeMode } from './worldIntentCore';
import {
    buildVehicleBridgeParityErrorReport,
    runVehicleWorldIntentBridgeBatch,
    type VehicleWorldIntentBridgeBatchReport,
} from './vehicleWorldIntentBridgeCore';

export { shouldAttemptVehiclePersistCore } from './vehicleOpsCore';

export interface VehicleTurnOpsDeps {
    isVehicleSystemEnabled: () => boolean;
    getVehicleStatePath: () => string | undefined;
    readVehicleStateFromDisk: (statePath?: string) => VehicleState | undefined;
    loadWorldTurn: () => number | undefined;
    writeVehicleStateAtomic: (statePath: string, state: VehicleState) => void;
    clearVehicleStateCache: () => void;
    runSerializedMutation: (fn: () => void) => void;
    getVehicleBridgeMode?: () => VehicleWorldIntentBridgeMode;
    emitVehicleBridgeDiagnostics?: (report: VehicleWorldIntentBridgeBatchReport) => void;
}

export interface VehicleTurnOpsResult {
    ok: boolean;
    applied: boolean;
    attempted: boolean;
}

export function tryApplyVehicleTurnOpsWithDeps(
    turnResult: { vehicleOps?: unknown },
    deps: VehicleTurnOpsDeps
): VehicleTurnOpsResult {
    if (!deps.isVehicleSystemEnabled()) {
        return { ok: true, applied: false, attempted: false };
    }
    const ops = parseVehicleOps(turnResult.vehicleOps);
    if (!ops.length) {
        return { ok: true, applied: false, attempted: false };
    }
    const statePath = deps.getVehicleStatePath();
    if (!statePath) {
        return { ok: true, applied: false, attempted: false };
    }

    const result: VehicleTurnOpsResult = { ok: true, applied: false, attempted: true };
    const bridgeMode = deps.getVehicleBridgeMode?.() ?? 'off';
    try {
        deps.runSerializedMutation(() => {
            const current = deps.readVehicleStateFromDisk(statePath);
            if (!current) {
                return;
            }
            const worldTurn = deps.loadWorldTurn();

            if (bridgeMode !== 'off') {
                try {
                    const batchReport = runVehicleWorldIntentBridgeBatch({
                        bridgeMode,
                        vehicleOps: turnResult.vehicleOps,
                        preWriteVehicleState: current,
                        enableVehicleSystem: deps.isVehicleSystemEnabled(),
                        worldTurn,
                    });
                    try {
                        deps.emitVehicleBridgeDiagnostics?.(batchReport);
                    } catch (emitErr) {
                        console.warn('[vehicleTurnOps] bridge diagnostics emit failed', emitErr);
                    }
                } catch (e) {
                    try {
                        deps.emitVehicleBridgeDiagnostics?.(
                            buildVehicleBridgeParityErrorReport(bridgeMode, ops.length, e)
                        );
                    } catch (emitErr) {
                        console.warn('[vehicleTurnOps] bridge diagnostics emit failed', emitErr);
                    }
                }
            }

            const next = applyVehicleOps(current, ops, { worldTurn });
            if (!next || JSON.stringify(current) === JSON.stringify(next)) {
                return;
            }
            try {
                deps.writeVehicleStateAtomic(statePath, next);
                deps.clearVehicleStateCache();
                result.applied = true;
            } catch (e) {
                result.ok = false;
                console.warn('[vehicleTurnOps] failed to save vehicle_state.json', e);
            }
        });
    } catch (e) {
        return { ok: false, applied: false, attempted: true };
    }
    return result;
}

export function applyVehicleTurnOpsWithDeps(
    turnResult: { vehicleOps?: unknown },
    deps: VehicleTurnOpsDeps
): boolean {
    return tryApplyVehicleTurnOpsWithDeps(turnResult, deps).applied;
}