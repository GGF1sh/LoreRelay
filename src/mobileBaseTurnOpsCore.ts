// Mobile Base System MB3: persist turn_result.mobileBaseOps to vehicle_state.json.
// PRE2: normal writes go through the vehicle state document owner (version-preserving).

import type { MobileBaseRuleFlags } from './mobileBaseCore';
import { mobileBaseSystemEnabled } from './mobileBaseCore';
import type { VehicleState } from './vehicleCore';
import {
    applyMobileBaseOps,
    parseMobileBaseOps,
    shouldAttemptMobileBasePersistCore,
} from './mobileBaseOpsCore';
export { shouldAttemptMobileBasePersistCore } from './mobileBaseOpsCore';

/** Result shape from vehicleStateDocumentOwner.runSerializedVehicleStateDocumentMutation. */
export interface MobileBaseDocumentMutationOutcome {
    ok: boolean;
    applied: boolean;
    attempted?: boolean;
    reason?: string;
}

export interface MobileBaseTurnOpsDeps {
    loadRuleFlags: () => MobileBaseRuleFlags | undefined;
    getVehicleStatePath: () => string | undefined;
    loadWorldTurn: () => number | undefined;
    /** Document-aware owner path (v1/v2 preserving). Shared queue with vehicleOps. */
    runSerializedVehicleStateDocumentMutation: (
        mutationName: string,
        mutateMechanicalState: (current: VehicleState) => VehicleState | undefined
    ) => MobileBaseDocumentMutationOutcome;
}

export interface MobileBaseTurnOpsResult {
    ok: boolean;
    applied: boolean;
    attempted: boolean;
}

export function tryApplyMobileBaseTurnOpsWithDeps(
    turnResult: { mobileBaseOps?: unknown },
    deps: MobileBaseTurnOpsDeps
): MobileBaseTurnOpsResult {
    const rules = deps.loadRuleFlags();
    if (!mobileBaseSystemEnabled(rules)) {
        return { ok: true, applied: false, attempted: false };
    }
    const ops = parseMobileBaseOps(turnResult.mobileBaseOps);
    if (!ops.length) {
        return { ok: true, applied: false, attempted: false };
    }
    const statePath = deps.getVehicleStatePath();
    if (!statePath) {
        return { ok: true, applied: false, attempted: false };
    }

    const mutation = deps.runSerializedVehicleStateDocumentMutation(
        'mobileBaseOps',
        (current) => {
            const worldTurn = deps.loadWorldTurn();
            const next = applyMobileBaseOps(current, ops, { worldTurn });
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

export function applyMobileBaseTurnOpsWithDeps(
    turnResult: { mobileBaseOps?: unknown },
    deps: MobileBaseTurnOpsDeps
): boolean {
    return tryApplyMobileBaseTurnOpsWithDeps(turnResult, deps).applied;
}
