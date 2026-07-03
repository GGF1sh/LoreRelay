// Settlement Mode M4b: persist turn_result.settlementOps.expand_layer to settlement_layout.json.

import type { TurnResult } from './types/TurnResult';
import { loadGameRules } from './gameRules';
import { settlementModeEnabled } from './settlementCore';
import {
    clearSettlementLayoutCache,
    getSettlementLayoutPath,
    readSettlementLayoutFromDisk,
    readSettlementStateFromDisk,
} from './settlementState';
import { loadWorldState } from './worldState';
import { writeJsonAtomic } from './workspacePaths';
import { runSerializedSettlementLayoutMutation } from './workspaceStateQueue';
import type { TurnLedgerApplyResult } from './turnLedgerPersistCore';
import {
    applySettlementLayoutTurnOpsWithDeps,
    shouldAttemptSettlementLayoutPersistCore,
    tryApplySettlementLayoutTurnOpsWithDeps,
    type SettlementLayoutTurnOpsDeps,
    type SettlementLayoutTurnOpsResult,
} from './settlementLayoutTurnOpsCore';

export type { SettlementLayoutTurnOpsDeps, SettlementLayoutTurnOpsResult } from './settlementLayoutTurnOpsCore';
export { applySettlementLayoutTurnOpsWithDeps, tryApplySettlementLayoutTurnOpsWithDeps } from './settlementLayoutTurnOpsCore';

export function shouldAttemptSettlementLayoutPersist(
    turnResult: Pick<TurnResult, 'settlementOps'>
): boolean {
    return shouldAttemptSettlementLayoutPersistCore(
        settlementModeEnabled(loadGameRules()),
        turnResult.settlementOps
    );
}

const defaultDeps: SettlementLayoutTurnOpsDeps = {
    isSettlementModeEnabled: () => settlementModeEnabled(loadGameRules()),
    getLayoutPath: () => getSettlementLayoutPath(),
    readLayoutFromDisk: (layoutPath) => readSettlementLayoutFromDisk(layoutPath),
    readStateFromDisk: () => readSettlementStateFromDisk(),
    loadWorldTurn: () => loadWorldState()?.worldTurn,
    writeLayoutAtomic: (layoutPath, layout) => writeJsonAtomic(layoutPath, layout),
    clearLayoutCache: () => clearSettlementLayoutCache(),
    runSerializedMutation: (fn) => runSerializedSettlementLayoutMutation(fn),
};

export function applySettlementLayoutTurnOps(
    turnResult: Pick<TurnResult, 'settlementOps'>
): boolean {
    return applySettlementLayoutTurnOpsWithDeps(turnResult, defaultDeps);
}

export function tryApplySettlementLayoutTurnOps(
    turnResult: Pick<TurnResult, 'settlementOps'>
): TurnLedgerApplyResult {
    const result = tryApplySettlementLayoutTurnOpsWithDeps(turnResult, defaultDeps);
    return { ok: result.ok, applied: result.applied };
}

export function tryApplySettlementLayoutTurnOpsDetailed(
    turnResult: Pick<TurnResult, 'settlementOps'>
): SettlementLayoutTurnOpsResult {
    return tryApplySettlementLayoutTurnOpsWithDeps(turnResult, defaultDeps);
}
