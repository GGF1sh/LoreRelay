// NOAI-GAMEPLAY-SPINE-005B: narrow authoritative vehicle repair commit host.
// It owns one EffectPlan family only and replaces one vehicle_state document atomically.

import * as fs from 'fs';
import * as path from 'path';
import { createDeterministicWorkspaceMutationGate, type DeterministicWorkspaceMutationGate } from './deterministicWorkspaceMutationGate';
import { REPAIR_VEHICLE_ACTION_KEY } from './gameplaySpineCore';
import { digestCanonicalValue, type CanonicalJsonValue } from './gameplaySpinePreviewCore';
import {
    REPAIR_VEHICLE_ACTION_VERSION,
    REPAIR_VEHICLE_EFFECT_PLAN_VERSION,
    REPAIR_VEHICLE_PREVIEW_VERSION,
    validateVehicleRepairPreviewWitness,
    type VehicleRepairEffectPlan,
} from './gameplaySpineVehicleRepairPlanAdapterCore';
import {
    MAX_VEHICLE_GAMEPLAY_COMMIT_RECEIPTS,
    VEHICLE_STATE_DOCUMENT_V2_VERSION,
    deriveVehicleRepairReceiptIdentity,
    digestVehicleRepairConfirmationToken,
    digestVehicleRepairEffectPlanFacts,
    digestWholeVehicleStateDocument,
    rebuildVehicleStateDocumentWithMechanical,
    type VehicleRepairActionCommitReceipt,
    type VehicleStateDocument,
} from './vehicleStateDocumentCore';
import {
    createDefaultVehicleStateDocumentOwnerDeps,
    runSerializedVehicleStateDocumentReplacementWithDeps,
    type VehicleStateDocumentOwnerDeps,
} from './vehicleStateDocumentOwner';
import { applyVehicleOps, type RepairVehicleOp } from './vehicleOpsCore';
import { parseVehicleState, type VehicleState } from './vehicleCore';
import { executeWorldIntent, queryWorldIntent, type WorldIntentQueryContext } from './worldIntentCore';

export type VehicleRepairMode = 'off' | 'shadow' | 'authoritative';

export interface VehicleRepairCommitResult {
    type: 'vehicleRepairCommitResult';
    requestId: string;
    status: 'committed' | 'rejected_stale' | 'rejected_busy' | 'write_failed';
    reasonCode?: string;
    commitState: 'not_committed' | 'committed' | 'indeterminate';
    commitId?: string;
    resolutionId?: string;
    planId?: string;
    committedLedgerId?: 'vehicle_state';
    target?: { kind: 'vehicle'; id: string };
    hpBefore?: number;
    hpAfter?: number;
    effectiveRepair?: number;
    updatedTurn?: number;
    replayedPriorCommit?: boolean;
    retryWithSameRequestId?: boolean;
    refreshWarning?: string;
}

export interface VehicleRepairCommitInput {
    workspaceKey: string;
    /** Complete versioned-document witness captured with the confirmed preview. */
    wholeDocumentDigest: string;
    plan: VehicleRepairEffectPlan;
    context: Omit<WorldIntentQueryContext, 'vehicleState'>;
}

export interface VehicleRepairCommitDeps {
    ownerDeps: VehicleStateDocumentOwnerDeps;
    gate: DeterministicWorkspaceMutationGate;
}

export interface VehicleStateGameplaySpineUpgradeResult {
    status: 'migrated' | 'already_current' | 'failed' | 'busy';
    reasonCode?: string;
}

const defaultGate = createDeterministicWorkspaceMutationGate();

function cloneState(value: VehicleState): VehicleState {
    return parseVehicleState(JSON.parse(JSON.stringify(value)));
}

function mechanicalDigest(value: VehicleState): string {
    return digestCanonicalValue(value as unknown as CanonicalJsonValue);
}

function resultFromReceipt(receipt: VehicleRepairActionCommitReceipt, replayedPriorCommit: boolean): VehicleRepairCommitResult {
    return {
        type: 'vehicleRepairCommitResult',
        requestId: receipt.requestId,
        status: 'committed',
        commitState: 'committed',
        commitId: receipt.commitId,
        resolutionId: receipt.resolutionId,
        planId: receipt.planId,
        committedLedgerId: 'vehicle_state',
        target: { ...receipt.target },
        hpBefore: receipt.hpBefore,
        hpAfter: receipt.hpAfter,
        effectiveRepair: receipt.effectiveRepair,
        updatedTurn: receipt.updatedTurnAfter,
        ...(replayedPriorCommit ? { replayedPriorCommit: true } : {}),
    };
}

function stale(requestId: string, reasonCode: string): VehicleRepairCommitResult {
    return { type: 'vehicleRepairCommitResult', requestId, status: 'rejected_stale', reasonCode, commitState: 'not_committed' };
}

function writeFailed(requestId: string, reasonCode: string, commitState: 'not_committed' | 'indeterminate' = 'not_committed'): VehicleRepairCommitResult {
    return {
        type: 'vehicleRepairCommitResult', requestId, status: 'write_failed', reasonCode, commitState,
        ...(commitState === 'indeterminate' ? { retryWithSameRequestId: true } : {}),
    };
}

function validatePlanShape(plan: VehicleRepairEffectPlan): string | undefined {
    const effect = plan?.effects?.[0];
    if (!plan || plan.planVersion !== REPAIR_VEHICLE_EFFECT_PLAN_VERSION
        || plan.actionKey !== REPAIR_VEHICLE_ACTION_KEY
        || plan.actionVersion !== REPAIR_VEHICLE_ACTION_VERSION
        || plan.sourcePreview?.previewVersion !== REPAIR_VEHICLE_PREVIEW_VERSION
        || plan.internal?.sourcePreviewVersion !== REPAIR_VEHICLE_PREVIEW_VERSION) {
        return 'invalid_effect_plan_version';
    }
    if (!Array.isArray(plan.effects) || plan.effects.length !== 1 || !effect
        || effect.order !== 0 || effect.effectType !== 'repair_vehicle'
        || effect.ledgerId !== 'vehicle_state' || effect.target?.kind !== 'vehicle'
        || !Number.isSafeInteger(effect.amount) || effect.amount < 1) {
        return 'invalid_effect_plan_shape';
    }
    if (plan.touchedLedgers.length !== 1 || plan.touchedLedgers[0] !== 'vehicle_state'
        || plan.potentialExpansionLedgers.length !== 0) {
        return 'invalid_effect_plan_ledgers';
    }
    return undefined;
}

function planFacts(plan: VehicleRepairEffectPlan): {
    effectPlanDigest: string; confirmationTokenDigest: string; beforeDigest: string; afterDigest: string;
    identity: ReturnType<typeof deriveVehicleRepairReceiptIdentity>;
} {
    const summary = plan.publicSummary;
    const beforeDigest = plan.internal.previewWitness.vehicleState.parsedCanonicalLedgerDigest;
    const afterDigest = mechanicalDigest(plan.internal.candidateEvidence.vehicle_state);
    const confirmationTokenDigest = digestVehicleRepairConfirmationToken(plan.sourcePreview.confirmationToken);
    const effectPlanDigest = digestVehicleRepairEffectPlanFacts({
        requestId: plan.requestId,
        resolutionId: plan.correlationId,
        target: { kind: 'vehicle', id: summary.vehicleId },
        requestedRepair: plan.effects[0].amount,
        hpBefore: summary.hpBefore,
        hpAfter: summary.hpAfter,
        effectiveRepair: summary.effectiveRepair,
        confirmationTokenDigest,
        beforeLedgerDigest: beforeDigest,
        afterLedgerDigest: afterDigest,
    });
    return {
        effectPlanDigest, confirmationTokenDigest, beforeDigest, afterDigest,
        identity: deriveVehicleRepairReceiptIdentity({
            requestId: plan.requestId,
            resolutionId: plan.correlationId,
            effectPlanDigest,
            confirmationTokenDigest,
            beforeLedgerDigest: beforeDigest,
            afterLedgerDigest: afterDigest,
            status: 'committed',
            target: { kind: 'vehicle', id: summary.vehicleId },
            requestedRepair: plan.effects[0].amount,
            hpBefore: summary.hpBefore,
            hpAfter: summary.hpAfter,
            effectiveRepair: summary.effectiveRepair,
        }),
    };
}

function sameReceiptAction(receipt: VehicleRepairActionCommitReceipt, plan: VehicleRepairEffectPlan, effectPlanDigest: string, planId: string): boolean {
    return receipt.actionKey === plan.actionKey
        && receipt.actionVersion === plan.actionVersion
        && receipt.planId === planId
        && receipt.effectPlanDigest === effectPlanDigest;
}

/** Gate -> shared queue -> fresh disk read -> duplicate/stale/commit. */
export function commitVehicleRepairEffectPlanWithDeps(
    input: VehicleRepairCommitInput,
    deps: VehicleRepairCommitDeps
): VehicleRepairCommitResult {
    const requestId = input?.plan?.requestId ?? '';
    const shapeError = validatePlanShape(input?.plan);
    if (shapeError) { return stale(requestId, shapeError); }
    let facts: ReturnType<typeof planFacts>;
    try {
        facts = planFacts(input.plan);
    } catch {
        return stale(requestId, 'invalid_effect_plan_identity');
    }
    const acquired = deps.gate.acquire(input.workspaceKey, {
        actionKind: 'vehicle:repair_vehicle', requestId,
    });
    if (acquired.status === 'busy') {
        return { type: 'vehicleRepairCommitResult', requestId, status: 'rejected_busy', reasonCode: 'WORLD_MUTATION_IN_PROGRESS', commitState: 'not_committed' };
    }

    let outcome: VehicleRepairCommitResult = writeFailed(requestId, 'commit_not_started');
    try {
        const replacement = runSerializedVehicleStateDocumentReplacementWithDeps(
            deps.ownerDeps,
            'gameplaySpineVehicleRepair',
            (read) => {
                if (read.document.version !== VEHICLE_STATE_DOCUMENT_V2_VERSION) {
                    outcome = stale(requestId, 'vehicle_state_v2_required');
                    return undefined;
                }
                const duplicate = (read.document.gameplayCommitReceipts ?? []).find(
                    (receipt) => receipt.requestId === requestId
                );
                if (duplicate) {
                    outcome = sameReceiptAction(duplicate, input.plan, facts.effectPlanDigest, facts.identity.planId)
                        ? resultFromReceipt(duplicate, true)
                        : stale(requestId, 'request_id_conflict');
                    return undefined;
                }
                if (digestWholeVehicleStateDocument(read.document) !== input.wholeDocumentDigest) {
                    outcome = stale(requestId, 'stale_vehicle_ledger');
                    return undefined;
                }
                const freshContext: WorldIntentQueryContext = { ...input.context, vehicleState: read.mechanical };
                const witness = validateVehicleRepairPreviewWitness(
                    input.plan.internal.previewWitness,
                    input.plan.sourcePreview.confirmationToken,
                    freshContext
                );
                if (!witness.valid) {
                    outcome = stale(requestId, witness.code);
                    return undefined;
                }
                const effect = input.plan.effects[0];
                const intent = {
                    id: requestId, source: 'gm' as const, subsystem: 'vehicle' as const,
                    action: 'repair_vehicle', target: { kind: 'vehicle' as const, id: effect.target.id },
                    payload: { amount: effect.amount },
                };
                const query = queryWorldIntent(intent, freshContext);
                const executed = executeWorldIntent(intent, freshContext);
                const direct = applyVehicleOps(read.mechanical, [{ type: 'repair_vehicle', vehicleId: effect.target.id, amount: effect.amount } as RepairVehicleOp], {
                    worldTurn: freshContext.worldTurn,
                });
                const evidence = input.plan.internal.candidateEvidence.vehicle_state;
                if (query.status !== 'allowed' || executed.status !== 'applied' || !executed.nextVehicleState || !direct
                    || mechanicalDigest(executed.nextVehicleState) !== mechanicalDigest(direct)
                    || mechanicalDigest(executed.nextVehicleState) !== mechanicalDigest(evidence)) {
                    outcome = stale(requestId, 'candidate_parity_failed');
                    return undefined;
                }
                const candidate = cloneState(executed.nextVehicleState);
                const target = candidate.vehicles.find((vehicle) => vehicle.id === effect.target.id);
                const before = read.mechanical.vehicles.find((vehicle) => vehicle.id === effect.target.id);
                if (!target || !before || target.durability.hp !== input.plan.publicSummary.hpAfter
                    || before.durability.hp !== input.plan.publicSummary.hpBefore) {
                    outcome = stale(requestId, 'candidate_parity_failed');
                    return undefined;
                }
                const receipts = [...(read.document.gameplayCommitReceipts ?? [])];
                const receipt: VehicleRepairActionCommitReceipt = {
                    schemaVersion: 1,
                    commitId: facts.identity.commitId,
                    requestId,
                    resolutionId: input.plan.correlationId,
                    planId: facts.identity.planId,
                    actionKey: REPAIR_VEHICLE_ACTION_KEY,
                    actionVersion: REPAIR_VEHICLE_ACTION_VERSION,
                    status: 'committed', ledgerId: 'vehicle_state',
                    effectIds: [facts.identity.effectId], appliedEffectIds: [facts.identity.effectId], skippedEffectIds: [],
                    confirmationTokenDigest: facts.confirmationTokenDigest,
                    effectPlanDigest: facts.effectPlanDigest,
                    beforeLedgerDigest: facts.beforeDigest,
                    afterLedgerDigest: facts.afterDigest,
                    target: { kind: 'vehicle', id: effect.target.id },
                    requestedRepair: effect.amount,
                    hpBefore: before.durability.hp, hpAfter: target.durability.hp,
                    effectiveRepair: target.durability.hp - before.durability.hp,
                    ...(read.mechanical.updatedTurn === undefined ? {} : { updatedTurnBefore: read.mechanical.updatedTurn }),
                    ...(candidate.updatedTurn === undefined ? {} : { updatedTurnAfter: candidate.updatedTurn }),
                    clockSnapshot: typeof freshContext.worldTurn === 'number' && Number.isFinite(freshContext.worldTurn)
                        ? [{ clock: 'world', value: freshContext.worldTurn }] : [],
                };
                receipts.push(receipt);
                const retained = receipts.length > MAX_VEHICLE_GAMEPLAY_COMMIT_RECEIPTS
                    ? receipts.slice(receipts.length - MAX_VEHICLE_GAMEPLAY_COMMIT_RECEIPTS) : receipts;
                const mechanicalDocument = rebuildVehicleStateDocumentWithMechanical(read.document, candidate);
                const outDocument: VehicleStateDocument = { ...mechanicalDocument, version: VEHICLE_STATE_DOCUMENT_V2_VERSION, gameplayCommitReceipts: retained };
                outcome = resultFromReceipt(receipt, false);
                return outDocument;
            }
        );
        if (!replacement.ok) {
            return writeFailed(requestId, String(replacement.reason ?? 'write_failed'), replacement.commitState === 'indeterminate' ? 'indeterminate' : 'not_committed');
        }
        if (!replacement.applied) { return outcome; }
        if (replacement.refreshWarning && outcome.status === 'committed') {
            return { ...outcome, refreshWarning: replacement.refreshWarning };
        }
        return outcome;
    } finally {
        acquired.lease.release();
    }
}

export function commitVehicleRepairEffectPlan(input: VehicleRepairCommitInput): VehicleRepairCommitResult {
    return commitVehicleRepairEffectPlanWithDeps(input, {
        ownerDeps: createDefaultVehicleStateDocumentOwnerDeps(), gate: defaultGate,
    });
}

/** Explicit-only v1 -> v2 upgrade; reads and normal vehicle writers never call this. */
export function upgradeVehicleStateForGameplaySpineWithDeps(
    workspaceKey: string,
    deps: VehicleRepairCommitDeps,
    createStrictBackup: (statePath: string) => boolean
): VehicleStateGameplaySpineUpgradeResult {
    const acquired = deps.gate.acquire(workspaceKey, { actionKind: 'vehicle_state:upgrade_gameplay_spine', requestId: 'vehicle_state_v2_upgrade' });
    if (acquired.status === 'busy') { return { status: 'busy', reasonCode: 'WORLD_MUTATION_IN_PROGRESS' }; }
    let result: VehicleStateGameplaySpineUpgradeResult = { status: 'failed', reasonCode: 'not_started' };
    try {
        const replacement = runSerializedVehicleStateDocumentReplacementWithDeps(deps.ownerDeps, 'upgradeVehicleStateForGameplaySpine', (read) => {
            if (read.document.version === VEHICLE_STATE_DOCUMENT_V2_VERSION) {
                result = { status: 'already_current' };
                return undefined;
            }
            if (!createStrictBackup(read.statePath)) {
                result = { status: 'failed', reasonCode: 'backup_failed' };
                return undefined;
            }
            result = { status: 'migrated' };
            return { ...rebuildVehicleStateDocumentWithMechanical(read.document, read.mechanical), version: VEHICLE_STATE_DOCUMENT_V2_VERSION, gameplayCommitReceipts: [] };
        });
        if (!replacement.ok && result.reasonCode !== 'backup_failed') {
            return { status: 'failed', reasonCode: String(replacement.reason ?? 'write_failed') };
        }
        return result;
    } finally {
        acquired.lease.release();
    }
}

export function upgradeVehicleStateForGameplaySpine(workspaceKey: string): VehicleStateGameplaySpineUpgradeResult {
    return upgradeVehicleStateForGameplaySpineWithDeps(workspaceKey, {
        ownerDeps: createDefaultVehicleStateDocumentOwnerDeps(), gate: defaultGate,
    }, (statePath) => {
        try {
            fs.copyFileSync(statePath, path.join(path.dirname(statePath), `${path.basename(statePath)}.gameplay-spine-v1.bak`), fs.constants.COPYFILE_EXCL);
            return true;
        } catch { return false; }
    });
}
