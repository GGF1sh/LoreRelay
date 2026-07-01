import * as path from 'path';
import type { GameState } from './types/GameState';
import { getGameStatePath, writeJsonAtomic } from './workspacePaths';
import { validateGameState } from './validateGameState';
import {
    resolveGameStatePersistPlan,
    type CommitGameStateMode,
} from './stateManagerCore';

export type { CommitGameStateMode, GameStatePersistPlan } from './stateManagerCore';
export { resolveGameStatePersistPlan } from './stateManagerCore';

export interface CommitGameStateOptions {
    createBackup?: boolean;
    mode?: CommitGameStateMode;
}

/**
 * Persists the game state to `game_state.json`.
 * This is the SINGLE CHOKE POINT for all writes to the game state.
 */
export function commitGameState(
    state: Record<string, unknown> | GameState,
    options: boolean | CommitGameStateOptions = {}
): void {
    const opts: CommitGameStateOptions = typeof options === 'boolean'
        ? { createBackup: options }
        : options;
    const createBackup = opts.createBackup ?? false;
    const mode = opts.mode ?? 'salvage';

    const statePath = getGameStatePath();
    if (!statePath) {
        return;
    }

    const raw = state as Record<string, unknown>;
    const plan = resolveGameStatePersistPlan(raw, mode);
    if (plan.action === 'skip') {
        console.error(
            `[commitGameState] ${mode} mode: validation failed, not writing. Errors:`,
            plan.reason
        );
        return;
    }
    if (plan.action === 'quarantine') {
        console.error(
            `[commitGameState] ${mode} mode: sanitized state still invalid; quarantining canonical file. Errors:`,
            plan.reason
        );
        quarantineInvalidState(statePath, plan.payload);
        return;
    }

    if (mode === 'salvage' && validateGameState(raw).length > 0) {
        console.warn('[commitGameState] salvage mode: wrote sanitized state after raw validation failed.');
    }

    writeJsonAtomic(statePath, plan.payload, createBackup);
}

function quarantineInvalidState(statePath: string, payload: Record<string, unknown>): void {
    const invalidPath = path.join(path.dirname(statePath), 'game_state.invalid.latest.json');
    try {
        writeJsonAtomic(invalidPath, payload);
    } catch (e) {
        console.error('[commitGameState] Failed to quarantine invalid state:', e);
    }
}