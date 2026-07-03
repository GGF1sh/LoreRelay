// Campaign P0 PR3 — per-file FIFO mutex for workspace canonical JSON files.
// PR-C — circuit breaker on game_state / world_state cross-file writes.

import { createSyncFileQueue } from './syncFileQueueCore';
import {
    createCircuitBreakerState,
    DEFAULT_CIRCUIT_FAILURE_THRESHOLD,
    DEFAULT_WRITE_RETRY_COUNT,
    isCircuitOpen,
    recordCircuitOutcome,
    runWithWriteRetry,
    type CircuitBreakerState,
    type WorkspaceWriteTarget,
} from './workspaceWriteCircuitBreakerCore';

const gameStateQueue = createSyncFileQueue();
const worldStateQueue = createSyncFileQueue();
const discoveryLedgerQueue = createSyncFileQueue();
const campaignResourcesQueue = createSyncFileQueue();
const settlementLayoutQueue = createSyncFileQueue();

let gameCircuit: CircuitBreakerState = createCircuitBreakerState();
let worldCircuit: CircuitBreakerState = createCircuitBreakerState();

function enqueueGuarded(
    queue: ReturnType<typeof createSyncFileQueue>,
    target: WorkspaceWriteTarget,
    circuit: CircuitBreakerState,
    setCircuit: (next: CircuitBreakerState) => void,
    fn: () => void
): void {
    queue.enqueue(() => {
        if (isCircuitOpen(circuit)) {
            console.error(`[workspaceQueue] circuit open — skipping ${target} write`);
            return;
        }
        try {
            runWithWriteRetry(fn, DEFAULT_WRITE_RETRY_COUNT);
            setCircuit(recordCircuitOutcome(circuit, true));
        } catch (err) {
            setCircuit(recordCircuitOutcome(circuit, false, {
                threshold: DEFAULT_CIRCUIT_FAILURE_THRESHOLD,
            }));
            console.error(`[workspaceQueue] ${target} write failed after retry:`, err);
        }
    });
}

/** Serialize mutations to game_state.json only. */
export function runSerializedGameStateMutation(fn: () => void): void {
    enqueueGuarded(gameStateQueue, 'game_state', gameCircuit, (next) => { gameCircuit = next; }, fn);
}

/** Serialize mutations to world_state.json only. */
export function runSerializedWorldStateMutation(fn: () => void): void {
    enqueueGuarded(worldStateQueue, 'world_state', worldCircuit, (next) => { worldCircuit = next; }, fn);
}

/** Serialize mutations to discoveries.json only. */
export function runSerializedDiscoveryMutation(fn: () => void): void {
    discoveryLedgerQueue.enqueue(fn);
}

/** Serialize mutations to campaign_resources.json only. */
export function runSerializedCampaignResourcesMutation(fn: () => void): void {
    campaignResourcesQueue.enqueue(fn);
}

/** Serialize mutations to settlement_layout.json only. */
export function runSerializedSettlementLayoutMutation(fn: () => void): void {
    settlementLayoutQueue.enqueue(fn);
}

/**
 * @deprecated Prefer commitGameState / saveWorldState (separate per-file queues).
 * Runs fn directly; nested writes route to game/world queues independently.
 */
export function runSerializedWorkspaceMutation(fn: () => void): void {
    fn();
}

export function isGameStateWriteCircuitOpen(): boolean {
    return isCircuitOpen(gameCircuit);
}

export function isWorldStateWriteCircuitOpen(): boolean {
    return isCircuitOpen(worldCircuit);
}

/** Test hook — reset all workspace write queues and circuit breakers. */
export function resetWorkspaceWriteQueueForTests(): void {
    gameStateQueue.reset();
    worldStateQueue.reset();
    discoveryLedgerQueue.reset();
    campaignResourcesQueue.reset();
    settlementLayoutQueue.reset();
    gameCircuit = createCircuitBreakerState();
    worldCircuit = createCircuitBreakerState();
}

/** Test hooks — inspect queue depth. */
export function getGameStateWriteQueueDepthForTests(): number {
    return gameStateQueue.getPendingCount() + (gameStateQueue.isBusy() ? 1 : 0);
}

export function getWorldStateWriteQueueDepthForTests(): number {
    return worldStateQueue.getPendingCount() + (worldStateQueue.isBusy() ? 1 : 0);
}

export function getDiscoveryWriteQueueDepthForTests(): number {
    return discoveryLedgerQueue.getPendingCount() + (discoveryLedgerQueue.isBusy() ? 1 : 0);
}

export function getCampaignResourcesWriteQueueDepthForTests(): number {
    return campaignResourcesQueue.getPendingCount() + (campaignResourcesQueue.isBusy() ? 1 : 0);
}

export function getSettlementLayoutWriteQueueDepthForTests(): number {
    return settlementLayoutQueue.getPendingCount() + (settlementLayoutQueue.isBusy() ? 1 : 0);
}

/** Test hooks — circuit breaker snapshots. */
export function getGameStateCircuitForTests(): CircuitBreakerState {
    return { ...gameCircuit };
}

export function getWorldStateCircuitForTests(): CircuitBreakerState {
    return { ...worldCircuit };
}