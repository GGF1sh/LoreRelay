// Mobile Base System MB3: persist turn_result.mobileBaseOps to vehicle_state.json.

import type { TurnResult } from './types/TurnResult';
import { loadGameRules } from './gameRules';
import { loadWorldState } from './worldState';
import type { TurnLedgerApplyResult } from './turnLedgerPersistCore';
import { getVehicleStatePath } from './vehicleState';
import { runSerializedVehicleStateDocumentMutation } from './vehicleStateDocumentOwner';
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
    loadWorldTurn: () => loadWorldState()?.worldTurn,
    runSerializedVehicleStateDocumentMutation: (mutationName, mutate) =>
        runSerializedVehicleStateDocumentMutation(mutationName, mutate),
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
