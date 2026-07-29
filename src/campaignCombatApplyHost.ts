/**
 * Bridge V1-B host apply: PENDING → validate → exactly-once game_state mutation → APPLIED.
 * High-risk path: no double apply across restart/duplicate observation.
 */
import * as fs from 'fs';
import * as path from 'path';
import {
    appliedReceiptPath,
    listPendingApplyEligibleReceipts,
    pendingReceiptPath,
    readAppliedCombatOutcomeMarker,
    writeAppliedCombatOutcomeMarker,
} from './campaignCombatPendingStore';
import { CombatOutcomeReceipt } from './campaignCombatReceiptCore';
import {
    buildAppliedMarker,
    buildCombatConsequencePlan,
    isApplyEligibleReceipt,
    stateHasReceiptApplied,
    verifyReceiptHash,
    CombatApplyBlockedReason,
} from './campaignCombatApplyCore';
import { writeJsonAtomicNoVscode } from './campaignCombatAtomicWriteCore';
import {
    mergeGameStateForPersist,
    readStateRevision,
} from './workspaceStateQueueCore';

export type CombatApplyResult =
    | {
        ok: true;
        status: 'applied' | 'already_applied';
        combatSessionId: string;
        receiptHash: string;
        historyAppended: boolean;
        playerHpUpdated: boolean;
        appliedPath: string;
    }
    | {
        ok: false;
        status: 'blocked' | 'error';
        reason: CombatApplyBlockedReason | string;
        detail?: string;
        combatSessionId?: string;
    };

function readGameStateFile(statePath: string): Record<string, unknown> | undefined {
    if (!fs.existsSync(statePath)) return undefined;
    try {
        const raw = JSON.parse(fs.readFileSync(statePath, 'utf8'));
        if (raw && typeof raw === 'object' && !Array.isArray(raw)) return raw as Record<string, unknown>;
    } catch {
        return undefined;
    }
    return undefined;
}

function gameStatePath(workspacePath: string): string {
    return path.join(workspacePath, 'game_state.json');
}

/**
 * Campaign-order sort: lower sourceCampaignRevision first, then session id for stability.
 * Absolute HP outcomes depend on applying older battles before newer ones.
 */
export function sortPendingCombatReceiptsForApply(
    receipts: CombatOutcomeReceipt[],
): CombatOutcomeReceipt[] {
    return [...receipts].sort((a, b) => {
        const ra = typeof a.sourceCampaignRevision === 'number' && Number.isFinite(a.sourceCampaignRevision)
            ? a.sourceCampaignRevision
            : 0;
        const rb = typeof b.sourceCampaignRevision === 'number' && Number.isFinite(b.sourceCampaignRevision)
            ? b.sourceCampaignRevision
            : 0;
        if (ra !== rb) return ra - rb;
        return String(a.combatSessionId).localeCompare(String(b.combatSessionId));
    });
}

/**
 * Apply one receipt exactly once.
 * Order: APPLIED check → validate → history/HP plan → revisioned game_state write → APPLIED → remove PENDING.
 * If game_state already contains receiptHash, only repair APPLIED marker.
 */
export function applyCombatOutcomeReceiptOnce(
    workspacePath: string,
    receipt: CombatOutcomeReceipt,
): CombatApplyResult {
    if (!isApplyEligibleReceipt(receipt)) {
        return { ok: false, status: 'blocked', reason: 'NOT_APPLY_ELIGIBLE', combatSessionId: (receipt as { combatSessionId?: string })?.combatSessionId };
    }
    if (!verifyReceiptHash(receipt)) {
        return {
            ok: false,
            status: 'blocked',
            reason: 'RECEIPT_HASH_MISMATCH',
            combatSessionId: receipt.combatSessionId,
        };
    }

    const appliedPath = appliedReceiptPath(workspacePath, receipt.combatSessionId);
    const existingApplied = readAppliedCombatOutcomeMarker(workspacePath, receipt.combatSessionId);
    if (existingApplied && existingApplied.receiptHash === receipt.receiptHash) {
        // Ensure PENDING cleaned up on restart after successful apply
        try {
            const p = pendingReceiptPath(workspacePath, receipt.combatSessionId);
            if (fs.existsSync(p)) fs.unlinkSync(p);
        } catch { /* ignore */ }
        return {
            ok: true,
            status: 'already_applied',
            combatSessionId: receipt.combatSessionId,
            receiptHash: receipt.receiptHash,
            historyAppended: existingApplied.historyAppended,
            playerHpUpdated: existingApplied.playerHpUpdated,
            appliedPath,
        };
    }

    const statePath = gameStatePath(workspacePath);
    const state = readGameStateFile(statePath);
    if (!state) {
        return {
            ok: false,
            status: 'blocked',
            reason: 'NO_GAME_STATE',
            combatSessionId: receipt.combatSessionId,
        };
    }

    // Repair path: consequence already in state, APPLIED missing
    if (stateHasReceiptApplied(state, receipt.receiptHash)) {
        const plan = buildCombatConsequencePlan(state, receipt);
        const marker = buildAppliedMarker(receipt, { ...plan, alreadyPresent: true, historyAppended: true });
        try {
            writeAppliedCombatOutcomeMarker(workspacePath, marker);
        } catch (e) {
            return {
                ok: false,
                status: 'error',
                reason: 'APPLIED_MARKER_WRITE_FAILED',
                detail: e instanceof Error ? e.message : String(e),
                combatSessionId: receipt.combatSessionId,
            };
        }
        try {
            const p = pendingReceiptPath(workspacePath, receipt.combatSessionId);
            if (fs.existsSync(p)) fs.unlinkSync(p);
        } catch { /* ignore */ }
        return {
            ok: true,
            status: 'already_applied',
            combatSessionId: receipt.combatSessionId,
            receiptHash: receipt.receiptHash,
            historyAppended: true,
            playerHpUpdated: marker.playerHpUpdated,
            appliedPath,
        };
    }

    const plan = buildCombatConsequencePlan(state, receipt);
    const baseRevision = readStateRevision(state);
    // Revisioned persist so concurrent GM turn commits observe combat mutation (stateRevision bump).
    const payload = mergeGameStateForPersist(state, plan.nextState, {
        baseRevision,
        profile: 'default',
    });
    try {
        writeJsonAtomicNoVscode(statePath, payload);
    } catch (e) {
        return {
            ok: false,
            status: 'error',
            reason: 'GAME_STATE_WRITE_FAILED',
            detail: e instanceof Error ? e.message : String(e),
            combatSessionId: receipt.combatSessionId,
        };
    }

    const marker = buildAppliedMarker(receipt, plan);
    try {
        writeAppliedCombatOutcomeMarker(workspacePath, marker);
    } catch (e) {
        // State may already include history — next call repairs APPLIED via stateHasReceiptApplied.
        // Callers of applyAllPending must STOP the batch after this failure (history eviction risk).
        return {
            ok: false,
            status: 'error',
            reason: 'APPLIED_MARKER_WRITE_FAILED',
            detail: e instanceof Error ? e.message : String(e),
            combatSessionId: receipt.combatSessionId,
        };
    }

    try {
        const p = pendingReceiptPath(workspacePath, receipt.combatSessionId);
        if (fs.existsSync(p)) fs.unlinkSync(p);
    } catch {
        // non-fatal; already_applied path cleans later
    }

    return {
        ok: true,
        status: 'applied',
        combatSessionId: receipt.combatSessionId,
        receiptHash: receipt.receiptHash,
        historyAppended: plan.historyAppended,
        playerHpUpdated: plan.playerHpUpdated,
        appliedPath,
    };
}

/**
 * Scan pending/ and apply each apply-eligible receipt once, in campaign order.
 * Stops after APPLIED_MARKER_WRITE_FAILED so later applies cannot evict unrecovered history hashes.
 */
export function applyAllPendingCombatOutcomes(workspacePath: string): CombatApplyResult[] {
    const pending = sortPendingCombatReceiptsForApply(
        listPendingApplyEligibleReceipts(workspacePath),
    );
    const results: CombatApplyResult[] = [];
    for (const receipt of pending) {
        const result = applyCombatOutcomeReceiptOnce(workspacePath, receipt);
        results.push(result);
        if (!result.ok && result.reason === 'APPLIED_MARKER_WRITE_FAILED') {
            break;
        }
    }
    return results;
}
