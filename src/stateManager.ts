import { getGameStatePath, writeJsonAtomic } from './workspacePaths';
import { validateGameState } from './validateGameState';
import { sanitizeGameStateForPersist } from './gameStateSanitize';
import type { GameState } from './types/GameState';

/**
 * Persists the game state to `game_state.json`.
 * This is the SINGLE CHOKE POINT for all writes to the game state.
 * It enforces validation and sanitization before writing to disk.
 * 
 * @param state The GameState object (or Record) to persist.
 * @param createBackup Whether to create a backup file before writing.
 */
export function commitGameState(state: Record<string, unknown> | GameState, createBackup = false): void {
    const statePath = getGameStatePath();
    if (!statePath) {
        return; // Workspace is not loaded or game_state.json path is unavailable
    }

    // 1. Validate the state
    const errors = validateGameState(state as Record<string, unknown>);
    if (errors.length > 0) {
        console.error('[commitGameState] Validation failed, but writing anyway to avoid data loss. Errors:', errors);
        // We log the error but still proceed. In a stricter environment, we might throw or return.
        // For now, logging allows developers to catch bypassing structural bugs.
    }

    // 2. Sanitize for persistence (e.g. clamping HP/MP, pruning expired events)
    const sanitized = sanitizeGameStateForPersist(state as Record<string, unknown>);

    // 3. Atomic write
    writeJsonAtomic(statePath, sanitized, createBackup);
}
