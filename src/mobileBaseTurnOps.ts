// Mobile Base System MB3: persist turn_result.mobileBaseOps to vehicle_state.json.

import type { TurnResult } from './types/TurnResult';
import { loadGameRules } from './gameRules';
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
    applyMobileBaseTurnOpsWithDeps,
    shouldAttemptMobileBasePersistCore,
    tryApplyMobileBaseTurnOpsWithDeps,
    type MobileBaseTurnOpsDeps,
} from './mobileBaseTurnOpsCore';

export type { MobileBaseTurnOpsDeps } from './mobileBaseTurnOpsCore';
export { applyMobileBaseTurnOpsWithDeps, tryApplyMobileBaseTurnOpsWithDeps } from './mobileBaseTurnOpsCore';

export function shouldAttemptMobileBasePersist(
    turnResult: Pick<TurnResult, 'mobileBaseOps'>
): boolean {
    return shouldAttemptMobileBasePersistCore(loadGameRules(), turnResult.mobileBaseOps);
}

const defaultDeps: MobileBaseTurnOpsDeps = {
    loadRuleFlags: () => loadGameRules(),
    getVehicleStatePath: () => getVehicleStatePath(),
    readVehicleStateFromDisk: (statePath) => readVehicleStateFromDisk(statePath),
    loadWorldTurn: () => loadWorldState()?.worldTurn,
    writeVehicleStateAtomic: (statePath, state) => writeJsonAtomic(statePath, state),
    clearVehicleStateCache: () => clearVehicleStateCache(),
    runSerializedMutation: (fn) => runSerializedVehicleStateMutation(fn),
};

export function applyMobileBaseTurnOps(
    turnResult: Pick<TurnResult, 'mobileBaseOps'>
): boolean {
    return applyMobileBaseTurnOpsWithDeps(turnResult, defaultDeps);
}

export function tryApplyMobileBaseTurnOps(
    turnResult: Pick<TurnResult, 'mobileBaseOps'>
): TurnLedgerApplyResult {
    const result = tryApplyMobileBaseTurnOpsWithDeps(turnResult, defaultDeps);
    return { ok: result.ok, applied: result.applied };
}