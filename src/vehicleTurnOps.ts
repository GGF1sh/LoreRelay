// Vehicle System V3: persist turn_result.vehicleOps to vehicle_state.json.

import type { TurnResult } from './types/TurnResult';
import { loadGameRules } from './gameRules';
import { vehicleModeEnabled } from './vehicleCore';
import { loadWorldState } from './worldState';
import { writeJsonAtomic } from './workspacePaths';
import { runSerializedVehicleStateMutation } from './workspaceStateQueue';
import type { TurnLedgerApplyResult } from './turnLedgerPersistCore';
import {
    clearVehicleStateCache,
    getVehicleStatePath,
    readVehicleStateFromDisk,
} from './vehicleState';
import {
    applyVehicleTurnOpsWithDeps,
    shouldAttemptVehiclePersistCore,
    tryApplyVehicleTurnOpsWithDeps,
    type VehicleTurnOpsDeps,
} from './vehicleTurnOpsCore';

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
    readVehicleStateFromDisk: (statePath) => readVehicleStateFromDisk(statePath),
    loadWorldTurn: () => loadWorldState()?.worldTurn,
    writeVehicleStateAtomic: (statePath, state) => writeJsonAtomic(statePath, state),
    clearVehicleStateCache: () => clearVehicleStateCache(),
    runSerializedMutation: (fn) => runSerializedVehicleStateMutation(fn),
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