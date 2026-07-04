// Mobile Base System MB3: persist turn_result.mobileBaseOps to vehicle_state.json.

import type { MobileBaseRuleFlags } from './mobileBaseCore';
import { mobileBaseSystemEnabled } from './mobileBaseCore';
import type { VehicleState } from './vehicleCore';
import {
    applyMobileBaseOps,
    parseMobileBaseOps,
    shouldAttemptMobileBasePersistCore,
} from './mobileBaseOpsCore';

export { shouldAttemptMobileBasePersistCore } from './mobileBaseOpsCore';

export interface MobileBaseTurnOpsDeps {
    loadRuleFlags: () => MobileBaseRuleFlags | undefined;
    getVehicleStatePath: () => string | undefined;
    readVehicleStateFromDisk: (statePath?: string) => VehicleState | undefined;
    loadWorldTurn: () => number | undefined;
    writeVehicleStateAtomic: (statePath: string, state: VehicleState) => void;
    clearVehicleStateCache: () => void;
    runSerializedMutation: (fn: () => void) => void;
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

    const result: MobileBaseTurnOpsResult = { ok: true, applied: false, attempted: true };
    try {
        deps.runSerializedMutation(() => {
            const current = deps.readVehicleStateFromDisk(statePath);
            if (!current) {
                return;
            }
            const worldTurn = deps.loadWorldTurn();
            const next = applyMobileBaseOps(current, ops, { worldTurn });
            if (!next || JSON.stringify(current) === JSON.stringify(next)) {
                return;
            }
            try {
                deps.writeVehicleStateAtomic(statePath, next);
                deps.clearVehicleStateCache();
                result.applied = true;
            } catch (e) {
                result.ok = false;
                console.warn('[mobileBaseTurnOps] failed to save vehicle_state.json', e);
            }
        });
    } catch {
        return { ok: false, applied: false, attempted: true };
    }
    return result;
}

export function applyMobileBaseTurnOpsWithDeps(
    turnResult: { mobileBaseOps?: unknown },
    deps: MobileBaseTurnOpsDeps
): boolean {
    return tryApplyMobileBaseTurnOpsWithDeps(turnResult, deps).applied;
}