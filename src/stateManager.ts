import * as fs from 'fs';
import * as path from 'path';
import type { GameState } from './types/GameState';
import { getGameStatePath, writeJsonAtomic } from './workspacePaths';
import { validateGameState } from './validateGameState';
import {
    resolveGameStatePersistPlan,
    type CommitGameStateMode,
} from './stateManagerCore';
import {
    mergeGameStateForPersist,
    type GameStateMergeProfile,
} from './workspaceStateQueueCore';
import { isGameStateWriteCircuitOpen, runSerializedGameStateMutation } from './workspaceStateQueue';
import {
    RUNTIME_ACCEPTED_TURN_WITNESS_KEY,
    type AcceptedTurnWitness,
} from './acceptedTurnReplayGuardCore';

export type { CommitGameStateMode, GameStatePersistPlan } from './stateManagerCore';
export { resolveGameStatePersistPlan } from './stateManagerCore';

export type CommitGameStateResult =
    | { ok: true; action: 'write' }
    | { ok: false; action: 'skip' | 'quarantine'; reason: string[] };

export interface CommitGameStateOptions {
    createBackup?: boolean;
    mode?: CommitGameStateMode;
    /** Revision when the caller read game_state.json (optimistic concurrency). */
    baseRevision?: number;
    mergeProfile?: GameStateMergeProfile;
    runtimeAcceptedTurnWitness?: AcceptedTurnWitness;
    runtimeAcceptedTurnWitnessMode?: 'preserve' | 'install' | 'clear';
}

/**
 * Persists the game state to `game_state.json`.
 * This is the SINGLE CHOKE POINT for all writes to the game state.
 */
function readGameStateFromDisk(statePath: string): Record<string, unknown> | undefined {
    if (!fs.existsSync(statePath)) {
        return undefined;
    }
    try {
        return JSON.parse(fs.readFileSync(statePath, 'utf-8')) as Record<string, unknown>;
    } catch {
        return undefined;
    }
}

function writeGameStatePlan(
    statePath: string,
    state: Record<string, unknown>,
    options: CommitGameStateOptions
): CommitGameStateResult {
    const createBackup = options.createBackup ?? false;
    const mode = options.mode ?? 'salvage';
    const disk = readGameStateFromDisk(statePath);
    const merged = mergeGameStateForPersist(disk, state, {
        baseRevision: options.baseRevision,
        profile: options.mergeProfile,
    });
    const witnessOwned = applyRuntimeAcceptedTurnWitnessAuthority(merged, disk, options);

    const plan = resolveGameStatePersistPlan(witnessOwned, mode);
    if (plan.action === 'skip') {
        console.error(
            `[commitGameState] ${mode} mode: validation failed, not writing. Errors:`,
            plan.reason
        );
        return { ok: false, action: 'skip', reason: [plan.reason] };
    }
    if (plan.action === 'quarantine') {
        console.error(
            `[commitGameState] ${mode} mode: sanitized state still invalid; quarantining canonical file. Errors:`,
            plan.reason
        );
        quarantineInvalidState(statePath, plan.payload);
        return { ok: false, action: 'quarantine', reason: [plan.reason] };
    }

    if (mode === 'salvage' && validateGameState(witnessOwned).length > 0) {
        console.warn('[commitGameState] salvage mode: wrote sanitized state after raw validation failed.');
    }

    try {
        writeJsonAtomic(statePath, plan.payload, createBackup);
    } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        throw new Error(`game_state io write failed: ${msg}`);
    }
    return { ok: true, action: 'write' };
}

export function commitGameState(
    state: Record<string, unknown> | GameState,
    options: boolean | CommitGameStateOptions = {}
): CommitGameStateResult {
    const opts: CommitGameStateOptions = typeof options === 'boolean'
        ? { createBackup: options }
        : options;

    const statePath = getGameStatePath();
    if (!statePath) {
        return { ok: false, action: 'skip', reason: ['no workspace path'] };
    }
    if (isGameStateWriteCircuitOpen()) {
        return { ok: false, action: 'skip', reason: ['circuit open: game_state'] };
    }

    const raw = state as Record<string, unknown>;
    let result: CommitGameStateResult = { ok: false, action: 'skip', reason: ['queue aborted'] };
    let completed = false;
    runSerializedGameStateMutation(() => {
        result = writeGameStatePlan(statePath, raw, opts);
        completed = true;
    });
    if (!completed) {
        return { ok: false, action: 'skip', reason: ['game_state write failed'] };
    }
    return result;
}

function quarantineInvalidState(statePath: string, payload: Record<string, unknown>): void {
    const invalidPath = path.join(path.dirname(statePath), 'game_state.invalid.latest.json');
    try {
        writeJsonAtomic(invalidPath, payload);
    } catch (e) {
        console.error('[commitGameState] Failed to quarantine invalid state:', e);
    }
}

function applyRuntimeAcceptedTurnWitnessAuthority(
    merged: Record<string, unknown>,
    disk: Record<string, unknown> | undefined,
    options: CommitGameStateOptions
): Record<string, unknown> {
    const next = { ...merged };
    delete next[RUNTIME_ACCEPTED_TURN_WITNESS_KEY];

    if (options.runtimeAcceptedTurnWitnessMode === 'clear') {
        return next;
    }
    if (options.runtimeAcceptedTurnWitnessMode === 'install') {
        if (!options.runtimeAcceptedTurnWitness) {
            throw new Error('runtime accepted turn witness install requested without witness payload');
        }
        next[RUNTIME_ACCEPTED_TURN_WITNESS_KEY] = options.runtimeAcceptedTurnWitness;
        return next;
    }
    if (disk && Object.prototype.hasOwnProperty.call(disk, RUNTIME_ACCEPTED_TURN_WITNESS_KEY)) {
        next[RUNTIME_ACCEPTED_TURN_WITNESS_KEY] = disk[RUNTIME_ACCEPTED_TURN_WITNESS_KEY];
    }
    return next;
}
