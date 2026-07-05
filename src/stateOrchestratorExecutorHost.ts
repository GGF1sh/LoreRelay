// State Orchestrator SO3a: Host Transaction Executor (File System Integration).

import * as fs from 'fs';
import * as path from 'path';
import {
    type ExecutorAction,
    type TransactionExecutionSequence,
    type TransactionCommitStatus,
    type TransactionExecutionResult,
    evaluateTransactionCommitStatus
} from './stateOrchestratorExecutorCore';
import { enqueueLedgerRetry } from './workspaceStateQueue';

/**
 * Executes a TransactionExecutionSequence against the local file system.
 * Implements a naive 2PC (Two-Phase Commit).
 *
 * @param workspaceRoot Absolute path to the game workspace
 * @param sequence The execution sequence planned by SO3a Core
 * @param payloads A dictionary of raw JSON strings keyed by ledgerId
 */
export function executeTransactionSequenceHost(
    workspaceRoot: string,
    sequence: TransactionExecutionSequence,
    payloads: Record<string, string>
): TransactionExecutionResult {
    const failedActions: ExecutorAction[] = [];

    // Phase 1: Prepare (.tmp writes and .bak creation)
    for (const action of sequence.prepareActions) {
        const canonicalPath = path.join(workspaceRoot, action.resourceKey);

        try {
            if (action.type === 'backup') {
                const bakPath = `${canonicalPath}.bak`;
                if (fs.existsSync(canonicalPath)) {
                    fs.copyFileSync(canonicalPath, bakPath);
                }
            } else if (action.type === 'write_tmp') {
                const tmpPath = `${canonicalPath}.tmp`;
                const payload = payloads[action.payloadKey];
                if (payload === undefined) {
                    throw new Error(`Payload missing for ledgerId: ${action.payloadKey}`);
                }
                fs.writeFileSync(tmpPath, payload, 'utf8');
            }
        } catch (e) {
            failedActions.push(action);
            // If preparation fails, we abort before commit.
            // SO3b will implement the cleanup of already-created tmp/bak files here.
            return {
                status: 'aborted_pre_commit',
                failedActions,
                errorMessage: `Prepare failed on ${action.resourceKey}: ${e instanceof Error ? e.message : String(e)}`
            };
        }
    }

    // Phase 2: Commit (Rename .tmp to canonical)
    let primaryCommitFailed = false;
    for (const action of sequence.commitActions) {
        if (action.type !== 'commit_rename') {
            continue;
        }

        const canonicalPath = path.join(workspaceRoot, action.resourceKey);
        const tmpPath = `${canonicalPath}.tmp`;

        try {
            fs.renameSync(tmpPath, canonicalPath);
        } catch (e) {
            failedActions.push(action);
            if (action.isPrimary) {
                primaryCommitFailed = true;
                // If primary fails, stop committing remaining secondaries to limit damage
                break;
            }
        }
    }

    const failedSecondaryLedgers = failedActions
        .filter((a) => a.type === 'commit_rename' && !a.isPrimary)
        .map((a) => ({ ledgerId: a.ledgerId, policy: a.failurePolicy }));

    const status = evaluateTransactionCommitStatus(primaryCommitFailed, failedSecondaryLedgers);

    if (status === 'rolled_back') {
        // Rollback Phase: Restore all canonical files from their .bak backups
        for (const action of sequence.commitActions) {
            if (action.type !== 'commit_rename') {
                continue;
            }

            const canonicalPath = path.join(workspaceRoot, action.resourceKey);
            const bakPath = `${canonicalPath}.bak`;

            try {
                if (fs.existsSync(bakPath)) {
                    fs.copyFileSync(bakPath, canonicalPath);
                }
            } catch (e) {
                console.error(`[SO3 Rollback] CATASTROPHIC FAILURE: Could not restore ${canonicalPath} from backup!`, e);
            }
        }

        return {
            status,
            failedActions,
            errorMessage: 'Rollback required due to commit failure. Canonical files restored from backup.'
        };
    }

    // Phase 3: Cleanup .bak on success or partial failure
    for (const action of sequence.cleanupActions) {
        if (action.type !== 'cleanup_bak') {
            continue;
        }

        const canonicalPath = path.join(workspaceRoot, action.resourceKey);
        const bakPath = `${canonicalPath}.bak`;

        try {
            if (fs.existsSync(bakPath)) {
                fs.unlinkSync(bakPath);
            }
        } catch (e) {
            console.warn(`[SO3 Cleanup] Failed to cleanup ${bakPath}`);
        }
    }

    // Phase 4: Enqueue Retries
    const retryLedgers = failedSecondaryLedgers.filter((f) => f.policy === 'queue_retry');
    for (const retry of retryLedgers) {
        const action = sequence.commitActions.find((a) => a.ledgerId === retry.ledgerId);
        if (action) {
            const canonicalPath = path.join(workspaceRoot, action.resourceKey);
            const payload = payloads[action.payloadKey];
            if (payload !== undefined) {
                enqueueLedgerRetry(retry.ledgerId, () => {
                    fs.writeFileSync(canonicalPath, payload, 'utf8');
                });
            }
        }
    }

    return { status, failedActions };
}
