// Campaign P0 PR3 — per-file FIFO mutex for workspace canonical JSON files.

import { createSyncFileQueue } from './syncFileQueueCore';

const gameStateQueue = createSyncFileQueue();
const worldStateQueue = createSyncFileQueue();
const discoveryLedgerQueue = createSyncFileQueue();
const campaignResourcesQueue = createSyncFileQueue();

/** Serialize mutations to game_state.json only. */
export function runSerializedGameStateMutation(fn: () => void): void {
    gameStateQueue.enqueue(fn);
}

/** Serialize mutations to world_state.json only. */
export function runSerializedWorldStateMutation(fn: () => void): void {
    worldStateQueue.enqueue(fn);
}

/** Serialize mutations to discoveries.json only. */
export function runSerializedDiscoveryMutation(fn: () => void): void {
    discoveryLedgerQueue.enqueue(fn);
}

/** Serialize mutations to campaign_resources.json only. */
export function runSerializedCampaignResourcesMutation(fn: () => void): void {
    campaignResourcesQueue.enqueue(fn);
}

/**
 * @deprecated Prefer commitGameState / saveWorldState (separate per-file queues).
 * Runs fn directly; nested writes route to game/world queues independently.
 */
export function runSerializedWorkspaceMutation(fn: () => void): void {
    fn();
}

/** Test hook — reset all workspace write queues. */
export function resetWorkspaceWriteQueueForTests(): void {
    gameStateQueue.reset();
    worldStateQueue.reset();
    discoveryLedgerQueue.reset();
    campaignResourcesQueue.reset();
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