// Campaign P0 PR3 — per-file FIFO mutex for game_state.json / world_state.json.

import { createSyncFileQueue } from './syncFileQueueCore';

const gameStateQueue = createSyncFileQueue();
const worldStateQueue = createSyncFileQueue();

/** Serialize mutations to game_state.json only. */
export function runSerializedGameStateMutation(fn: () => void): void {
    gameStateQueue.enqueue(fn);
}

/** Serialize mutations to world_state.json only. */
export function runSerializedWorldStateMutation(fn: () => void): void {
    worldStateQueue.enqueue(fn);
}

/**
 * @deprecated Prefer commitGameState / saveWorldState (separate per-file queues).
 * Runs fn directly; nested writes route to game/world queues independently.
 */
export function runSerializedWorkspaceMutation(fn: () => void): void {
    fn();
}

/** Test hook — reset both queues. */
export function resetWorkspaceWriteQueueForTests(): void {
    gameStateQueue.reset();
    worldStateQueue.reset();
}

/** Test hooks — inspect queue depth. */
export function getGameStateWriteQueueDepthForTests(): number {
    return gameStateQueue.getPendingCount() + (gameStateQueue.isBusy() ? 1 : 0);
}

export function getWorldStateWriteQueueDepthForTests(): number {
    return worldStateQueue.getPendingCount() + (worldStateQueue.isBusy() ? 1 : 0);
}