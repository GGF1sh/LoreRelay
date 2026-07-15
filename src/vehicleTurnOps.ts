// Vehicle System V3: persist turn_result.vehicleOps to vehicle_state.json.

import type { TurnResult } from './types/TurnResult';
import { loadGameRules } from './gameRules';
import { vehicleModeEnabled } from './vehicleCore';
import { loadWorldState } from './worldState';
import type { TurnLedgerApplyResult } from './turnLedgerPersistCore';
import { getVehicleStatePath } from './vehicleState';
import { runSerializedVehicleStateDocumentMutation } from './vehicleStateDocumentOwner';
import {
    applyVehicleTurnOpsWithDeps,
    shouldAttemptVehiclePersistCore,
    tryApplyVehicleTurnOpsWithDeps,
    type VehicleTurnOpsDeps,
} from './vehicleTurnOpsCore';
import {
    emitVehicleWorldIntentBridgeDiagnostics,
    getVehicleWorldIntentBridgeMode,
} from './vehicleWorldIntentBridge';

export type { VehicleTurnOpsDeps } from './vehicleTurnOpsCore';
export { applyVehicleTurnOpsWithDeps, tryApplyVehicleTurnOpsWithDeps } from './vehicleTurnOpsCore';

export function shouldAttemptVehiclePersist(
    turnResult: Pick<TurnResult, 'vehicleOps'>
): boolean {
    return shouldAttemptVehiclePersistCore(
        vehicleModeEnabled(loadGameRules()),
        turnResult.vehicleOps
    );
}

const defaultDeps: VehicleTurnOpsDeps = {
    isVehicleSystemEnabled: () => vehicleModeEnabled(loadGameRules()),
    getVehicleStatePath: () => getVehicleStatePath(),
    loadWorldTurn: () => loadWorldState()?.worldTurn,
    runSerializedVehicleStateDocumentMutation: (mutationName, mutate) =>
        runSerializedVehicleStateDocumentMutation(mutationName, mutate),
    getVehicleBridgeMode: () => getVehicleWorldIntentBridgeMode(),
    emitVehicleBridgeDiagnostics: (report) => emitVehicleWorldIntentBridgeDiagnostics(report),
};

export function applyVehicleTurnOps(
    turnResult: Pick<TurnResult, 'vehicleOps'>
): boolean {
    return applyVehicleTurnOpsWithDeps(turnResult, defaultDeps);
}

export function tryApplyVehicleTurnOps(
    turnResult: Pick<TurnResult, 'vehicleOps'>
): TurnLedgerApplyResult {
    const result = tryApplyVehicleTurnOpsWithDeps(turnResult, defaultDeps);
    return { ok: result.ok, applied: result.applied };
}
