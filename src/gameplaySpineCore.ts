// NOAI-GAMEPLAY-SPINE-001: shared action lifecycle vocabulary (pure, no I/O).
// Design authority: docs/GAMEPLAY_SPINE_ARCHITECTURE.md
// This slice defines types only for commit vocabulary — no commit behavior.

/**
 * Structured action key: subsystem:action
 * Example: vehicle:repair_vehicle
 */
export type ActionKey = `${string}:${string}`;

/**
 * Admission / query-phase status for a structured action.
 * Distinct from mechanical outcome and from commit/persistence status.
 */
export type ActionAdmissionStatus =
    | 'ready'
    | 'valid_noop'
    | 'blocked'
    | 'invalid'
    | 'unsupported';

/**
 * How mechanical truth is resolved once admitted.
 * Slice 001 vehicle shadow uses 'automatic' only.
 */
export type ResolutionMode =
    | 'automatic'
    | 'spend_only'
    | 'check'
    | 'opposed_check'
    | 'subsystem'
    | 'project';

/**
 * Mechanical result of resolution (dice/subsystem truth).
 * Not the same as admission blocked or write_failed.
 */
export type MechanicalOutcome =
    | 'success'
    | 'partial'
    | 'failure';

/**
 * Persistence / mutation-gate commit status.
 * Vocabulary only in Slice 001 — no commit is performed by the shadow adapter.
 */
export type ActionCommitStatus =
    | 'committed'
    | 'committed_partial'
    | 'valid_noop'
    | 'rejected_stale'
    | 'rejected_busy'
    | 'write_failed';

/** Shadow-layer resolution status (no commit, candidate-only). */
export type ShadowResolutionStatus =
    | 'resolved'
    | 'valid_noop'
    | 'not_resolved'
    | 'adapter_failed';

export const REPAIR_VEHICLE_ACTION_KEY: ActionKey = 'vehicle:repair_vehicle';

export function isActionKey(value: unknown): value is ActionKey {
    return typeof value === 'string' && /^[a-zA-Z0-9_-]+:[a-zA-Z0-9_-]+$/.test(value);
}
