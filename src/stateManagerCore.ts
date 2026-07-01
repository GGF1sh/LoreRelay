import { validateGameState } from './validateGameState';
import { sanitizeGameStateForPersist } from './gameStateSanitize';

export type CommitGameStateMode = 'strict' | 'salvage';

export type GameStatePersistPlan =
    | { action: 'write'; payload: Record<string, unknown> }
    | { action: 'skip'; reason: string }
    | { action: 'quarantine'; payload: Record<string, unknown>; reason: string };

/** Pure decision logic for commitGameState (testable without VS Code workspace). */
export function resolveGameStatePersistPlan(
    state: Record<string, unknown>,
    mode: CommitGameStateMode = 'salvage'
): GameStatePersistPlan {
    const rawErrors = validateGameState(state);

    if (mode === 'strict') {
        if (rawErrors.length > 0) {
            return { action: 'skip', reason: rawErrors.join('; ') };
        }
        return { action: 'write', payload: sanitizeGameStateForPersist(state) };
    }

    if (rawErrors.length === 0) {
        return { action: 'write', payload: sanitizeGameStateForPersist(state) };
    }

    const sanitized = sanitizeGameStateForPersist(state);
    const salvageErrors = validateGameState(sanitized);
    if (salvageErrors.length === 0) {
        return { action: 'write', payload: sanitized };
    }

    return {
        action: 'quarantine',
        payload: sanitized,
        reason: salvageErrors.join('; '),
    };
}