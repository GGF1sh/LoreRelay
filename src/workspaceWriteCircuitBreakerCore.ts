// PR-C impl — cross-file write circuit breaker + dual-write orchestration (pure, no vscode/fs).

export type WorkspaceWriteTarget = 'game_state' | 'world_state';

export const DEFAULT_WRITE_RETRY_COUNT = 1;
export const DEFAULT_CIRCUIT_FAILURE_THRESHOLD = 3;

/**
 * Compensation aligned with PR-D: never rollback game_state when world_state fails.
 * Record split-brain risk for operator reconcile instead.
 */
export const CROSS_FILE_WRITE_COMPENSATION = {
    rollbackGameStateOnWorldFailure: false,
    recordSplitBrainRisk: true,
} as const;

export interface CircuitBreakerState {
    consecutiveFailures: number;
    open: boolean;
    openedAt?: string;
    lastFailureAt?: string;
    lastSuccessAt?: string;
}

export interface CrossFileDualWriteInput {
    gameAttempted: boolean;
    worldAttempted: boolean;
    writeGame: () => boolean;
    writeWorld: () => boolean;
}

export interface CrossFileDualWriteOutcome {
    ok: boolean;
    partial: boolean;
    splitBrainRisk: boolean;
    gameAttempted: boolean;
    gameOk: boolean;
    worldAttempted: boolean;
    worldOk: boolean;
    failedTargets: WorkspaceWriteTarget[];
}

export interface SplitBrainRiskEvent {
    at: string;
    failedTargets: WorkspaceWriteTarget[];
    gameOk: boolean;
    worldOk: boolean;
    source: string;
}

export function createCircuitBreakerState(): CircuitBreakerState {
    return { consecutiveFailures: 0, open: false };
}

export function isCircuitOpen(
    state: CircuitBreakerState,
    nowMs = Date.now()
): boolean {
    if (!state.open) {
        return false;
    }
    return true;
}

export function recordCircuitOutcome(
    state: CircuitBreakerState,
    success: boolean,
    options: {
        threshold?: number;
        nowMs?: number;
        nowIso?: string;
    } = {}
): CircuitBreakerState {
    const threshold = options.threshold ?? DEFAULT_CIRCUIT_FAILURE_THRESHOLD;
    const nowIso = options.nowIso ?? new Date(options.nowMs ?? Date.now()).toISOString();
    if (success) {
        return {
            consecutiveFailures: 0,
            open: false,
            openedAt: undefined,
            lastFailureAt: state.lastFailureAt,
            lastSuccessAt: nowIso,
        };
    }

    const consecutiveFailures = state.consecutiveFailures + 1;
    const open = consecutiveFailures >= threshold;
    return {
        consecutiveFailures,
        open: state.open || open,
        openedAt: state.openedAt ?? (open ? nowIso : undefined),
        lastFailureAt: nowIso,
        lastSuccessAt: state.lastSuccessAt,
    };
}

/** Run fn; on throw, retry up to retryCount additional times (1 = one retry). */
export function runWithWriteRetry(fn: () => void, retryCount = DEFAULT_WRITE_RETRY_COUNT): void {
    let lastError: unknown;
    const attempts = Math.max(0, Math.floor(retryCount)) + 1;
    for (let i = 0; i < attempts; i++) {
        try {
            fn();
            return;
        } catch (err) {
            lastError = err;
        }
    }
    throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

/**
 * Orchestrate game_state + world_state writes without cross-file rollback.
 * splitBrainRisk when one target succeeds and the other fails.
 */
export function executeCrossFileDualWrite(input: CrossFileDualWriteInput): CrossFileDualWriteOutcome {
    const failedTargets: WorkspaceWriteTarget[] = [];
    let gameOk = !input.gameAttempted;
    let worldOk = !input.worldAttempted;

    if (input.gameAttempted) {
        gameOk = input.writeGame();
        if (!gameOk) {
            failedTargets.push('game_state');
        }
    }

    if (input.worldAttempted) {
        worldOk = input.writeWorld();
        if (!worldOk) {
            failedTargets.push('world_state');
        }
    }

    const anyAttempted = input.gameAttempted || input.worldAttempted;
    const anySucceeded = (input.gameAttempted && gameOk) || (input.worldAttempted && worldOk);
    const partial = failedTargets.length > 0 && anySucceeded;
    const splitBrainRisk = input.gameAttempted
        && input.worldAttempted
        && ((gameOk && !worldOk) || (!gameOk && worldOk));

    return {
        ok: !anyAttempted || failedTargets.length === 0,
        partial,
        splitBrainRisk,
        gameAttempted: input.gameAttempted,
        gameOk,
        worldAttempted: input.worldAttempted,
        worldOk,
        failedTargets,
    };
}

export function buildSplitBrainRiskEvent(
    outcome: CrossFileDualWriteOutcome,
    source: string,
    nowIso = new Date().toISOString()
): SplitBrainRiskEvent | undefined {
    if (!outcome.splitBrainRisk) {
        return undefined;
    }
    return {
        at: nowIso,
        failedTargets: [...outcome.failedTargets],
        gameOk: outcome.gameOk,
        worldOk: outcome.worldOk,
        source,
    };
}