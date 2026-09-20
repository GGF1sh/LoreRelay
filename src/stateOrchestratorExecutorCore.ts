// State Orchestrator SO3a: Pure Transaction Executor Logic (No FS).

import type { LedgerFailurePolicy } from './stateOrchestratorDescriptorCore';
import type { StateTransactionPlan } from './stateOrchestratorPlanCore';

export type ExecutorActionType = 'backup' | 'write_tmp' | 'commit_rename' | 'cleanup_bak';

export interface ExecutorAction {
    type: ExecutorActionType;
    ledgerId: string;
    /** The actual JSON filename from the descriptor, e.g., 'game_state.json' */
    resourceKey: string;
    /** The key the host uses to lookup the JSON string payload */
    payloadKey: string;
    failurePolicy: LedgerFailurePolicy;
    isPrimary: boolean;
}

export interface TransactionExecutionSequence {
    transactionId: string;
    /** Phase 1: Backup existing files and write .tmp files. Fully abortable. */
    prepareActions: ExecutorAction[];
    /** Phase 2: Rapidly rename .tmp to resourceKey. The point of no return. */
    commitActions: ExecutorAction[];
    /** Phase 3: Remove .bak files on success. */
    cleanupActions: ExecutorAction[];
}

/**
 * Transforms an SO2 pure transaction plan into a strict 2PC execution sequence.
 * Handles backup triggers based on step policies.
 *
 * @param plan The output of buildStateTransactionPlan
 * @param runId A unique identifier for this transaction execution run
 * @returns A deterministic sequence of IO-agnostic actions
 */
export function buildTransactionExecutionSequence(
    plan: StateTransactionPlan,
    runId: string
): TransactionExecutionSequence {
    const prepareActions: ExecutorAction[] = [];
    const commitActions: ExecutorAction[] = [];
    const cleanupActions: ExecutorAction[] = [];

    // The plan.steps array is already sorted by TURN_LEDGER_PERSIST_ORDER
    for (const step of plan.steps) {
        if (step.status !== 'planned') {
            continue;
        }

        const isPrimary = step.ledgerId === plan.primaryLedgerId;
        const resourceKey = step.fileNamePattern;
        const payloadKey = step.ledgerId;
        const failurePolicy = step.failurePolicy;

        // 1. Prepare: Backup
        if (step.backupPolicy !== 'none') {
            prepareActions.push({
                type: 'backup',
                ledgerId: step.ledgerId,
                resourceKey,
                payloadKey,
                failurePolicy,
                isPrimary,
            });

            // If we back it up, we should clean it up if commit succeeds fully
            cleanupActions.push({
                type: 'cleanup_bak',
                ledgerId: step.ledgerId,
                resourceKey,
                payloadKey,
                failurePolicy,
                isPrimary,
            });
        }

        // 2. Prepare: Write .tmp
        prepareActions.push({
            type: 'write_tmp',
            ledgerId: step.ledgerId,
            resourceKey,
            payloadKey,
            failurePolicy,
            isPrimary,
        });

        // 3. Commit: Rename .tmp -> canonical
        commitActions.push({
            type: 'commit_rename',
            ledgerId: step.ledgerId,
            resourceKey,
            payloadKey,
            failurePolicy,
            isPrimary,
        });
    }

    return {
        transactionId: runId,
        prepareActions,
        commitActions,
        cleanupActions,
    };
}

export type TransactionCommitStatus = 'committed' | 'rolled_back' | 'partial_commit_warn' | 'aborted_pre_commit';

export interface TransactionExecutionResult {
    status: TransactionCommitStatus;
    failedActions: ExecutorAction[];
    errorMessage?: string;
}

/**
 * Pure function to evaluate what the overall transaction status is, given which actions failed.
 * SO3b will expand this heavily, but for now we define the contract.
 */
export function evaluateTransactionCommitStatus(
    primaryCommitFailed: boolean,
    failedSecondaryLedgers: Array<{ ledgerId: string; policy: LedgerFailurePolicy }>
): TransactionCommitStatus {
    if (primaryCommitFailed) {
        // If the primary ledger fails during rename, it is a catastrophic rollback scenario.
        return 'rolled_back';
    }

    if (failedSecondaryLedgers.length === 0) {
        return 'committed';
    }

    const requiresRollback = failedSecondaryLedgers.some((f) => f.policy === 'abort_before_commit');
    if (requiresRollback) {
        return 'rolled_back';
    }

    return 'partial_commit_warn';
}

/**
 * Pure function to generate a Mermaid graph flowchart representing the transaction plan steps.
 * Nodes are color-coded based on their execution results.
 */
export function generateStateOrchestratorMermaid(
    plan: StateTransactionPlan,
    lastResult?: TransactionExecutionResult
): string {
    let mmd = 'flowchart TD\n';

    // Build nodes
    const steps = plan.steps.filter((s) => s.status === 'planned');
    if (steps.length === 0) {
        mmd += '  NoPlannedSteps["No planned steps"]\n';
        return mmd;
    }

    const nodes: string[] = [];

    // Prepare nodes
    steps.forEach((step) => {
        const id_prep = `prep_${step.ledgerId}`;
        const label_prep = `"[Prepare] ${step.fileNamePattern}"`;
        mmd += `  ${id_prep}[${label_prep}]\n`;
        nodes.push(id_prep);
    });

    // Commit nodes
    steps.forEach((step) => {
        const id_commit = `commit_${step.ledgerId}`;
        const label_commit = `"[Commit] ${step.fileNamePattern}"`;
        mmd += `  ${id_commit}[${label_commit}]\n`;
        nodes.push(id_commit);
    });

    // Draw arrows sequentially:
    // All prepares first, then link last prepare to first commit, then all commits.
    for (let i = 0; i < steps.length - 1; i++) {
        mmd += `  prep_${steps[i].ledgerId} --> prep_${steps[i+1].ledgerId}\n`;
    }
    if (steps.length > 0) {
        mmd += `  prep_${steps[steps.length - 1].ledgerId} --> commit_${steps[0].ledgerId}\n`;
    }
    for (let i = 0; i < steps.length - 1; i++) {
        mmd += `  commit_${steps[i].ledgerId} --> commit_${steps[i+1].ledgerId}\n`;
    }

    // Class styles
    mmd += '  classDef planned fill:#6a737d,stroke:#586069,color:#fff;\n';
    mmd += '  classDef success fill:#2ea44f,stroke:#22863a,color:#fff;\n';
    mmd += '  classDef failed fill:#d73a49,stroke:#cb2431,color:#fff;\n';

    const plannedNodes = [...nodes];
    const successNodes: string[] = [];
    const failedNodes: string[] = [];

    if (lastResult) {
        const failedKeys = new Set(lastResult.failedActions.map((a) => `${a.type}_${a.ledgerId}`));

        steps.forEach((step) => {
            const prepKey = `write_tmp_${step.ledgerId}`;
            const commitKey = `commit_rename_${step.ledgerId}`;

            // Prepare node style
            if (failedKeys.has(prepKey) || lastResult.status === 'aborted_pre_commit') {
                failedNodes.push(`prep_${step.ledgerId}`);
            } else {
                successNodes.push(`prep_${step.ledgerId}`);
            }

            // Commit node style
            if (lastResult.status === 'rolled_back' || failedKeys.has(commitKey)) {
                failedNodes.push(`commit_${step.ledgerId}`);
            } else if (lastResult.status === 'committed' || lastResult.status === 'partial_commit_warn') {
                const isFailedSecondary = lastResult.failedActions.some((a) => a.ledgerId === step.ledgerId);
                if (isFailedSecondary) {
                    failedNodes.push(`commit_${step.ledgerId}`);
                } else {
                    successNodes.push(`commit_${step.ledgerId}`);
                }
            }
        });
    }

    if (successNodes.length > 0) {
        mmd += `  class ${successNodes.join(',')} success;\n`;
    }
    if (failedNodes.length > 0) {
        mmd += `  class ${failedNodes.join(',')} failed;\n`;
    }

    const remainingPlanned = plannedNodes.filter((n) => !successNodes.includes(n) && !failedNodes.includes(n));
    if (remainingPlanned.length > 0) {
        mmd += `  class ${remainingPlanned.join(',')} planned;\n`;
    }

    return mmd;
}
