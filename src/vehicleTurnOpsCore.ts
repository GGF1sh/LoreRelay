// Vehicle System V3: persist turn_result.vehicleOps to vehicle_state.json.
// PRE2: normal writes go through the vehicle state document owner (version-preserving).

import type { VehicleState } from './vehicleCore';
import {
    applyVehicleOps,
    parseVehicleOps,
    shouldAttemptVehiclePersistCore,
} from './vehicleOpsCore';
import type { VehicleWorldIntentBridgeMode } from './worldIntentCore';
import type { VehicleRepairMode } from './gameplaySpineVehicleRepairCommitHost';
import {
    buildVehicleBridgeParityErrorReport,
    runVehicleWorldIntentBridgeBatch,
    type VehicleWorldIntentBridgeBatchReport,
} from './vehicleWorldIntentBridgeCore';
export { shouldAttemptVehiclePersistCore } from './vehicleOpsCore';

/** Result shape from vehicleStateDocumentOwner.runSerializedVehicleStateDocumentMutation. */
export interface VehicleDocumentMutationOutcome {
    ok: boolean;
    applied: boolean;
    attempted?: boolean;
    reason?: string;
}

export interface VehicleTurnOpsDeps {
    isVehicleSystemEnabled: () => boolean;
    getVehicleStatePath: () => string | undefined;
    loadWorldTurn: () => number | undefined;
    /** Document-aware owner path (v1/v2 preserving). Shared queue with mobile-base. */
    runSerializedVehicleStateDocumentMutation: (
        mutationName: string,
        mutateMechanicalState: (current: VehicleState) => VehicleState | undefined
    ) => VehicleDocumentMutationOutcome;
    getVehicleBridgeMode?: () => VehicleWorldIntentBridgeMode;
    emitVehicleBridgeDiagnostics?: (report: VehicleWorldIntentBridgeBatchReport) => void;
    /** In authoritative mode untracked legacy repair ops fail closed; other ops retain legacy ownership. */
    getVehicleRepairMode?: () => VehicleRepairMode;
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
    const allOps = parseVehicleOps(turnResult.vehicleOps);
    const repairMode = deps.getVehicleRepairMode?.() ?? 'off';
    // turn_result.vehicleOps has no durable request identity or confirmed EffectPlan.  It can
    // never become an untracked authoritative repair fallback.  Mixed batches keep unrelated
    // legacy operations, while repair entries are suppressed rather than double-applied.
    const ops = repairMode === 'authoritative'
        ? allOps.filter((op) => op.type !== 'repair_vehicle')
        : allOps;
    if (!ops.length) {
        return { ok: true, applied: false, attempted: false };
    }
    const statePath = deps.getVehicleStatePath();
    if (!statePath) {
        return { ok: true, applied: false, attempted: false };
    }

    const bridgeMode = deps.getVehicleBridgeMode?.() ?? 'off';
    const mutation = deps.runSerializedVehicleStateDocumentMutation(
        'vehicleOps',
        (current) => {
            const worldTurn = deps.loadWorldTurn();

            if (bridgeMode !== 'off') {
                try {
                    const batchReport = runVehicleWorldIntentBridgeBatch({
                        bridgeMode,
                        vehicleOps: ops,
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
                return undefined;
            }
            return next;
        }
    );

    return {
        ok: mutation.ok,
        applied: mutation.applied,
        attempted: true,
    };
}

export function applyVehicleTurnOpsWithDeps(
    turnResult: { vehicleOps?: unknown },
    deps: VehicleTurnOpsDeps
): boolean {
    return tryApplyVehicleTurnOpsWithDeps(turnResult, deps).applied;
}
