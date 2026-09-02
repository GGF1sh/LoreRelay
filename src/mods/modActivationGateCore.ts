import { canonicalizeModJson } from './modHashCore';
import type { ModLock } from './modProfileCore';
import { validateModLock } from './modProfileCore';
import type { ModOpenDecision } from './modSafeModeCore';

export type ModCheckpointRestoreDecision =
    | { allowed: true; code: 'UNMODDED_LEGACY_CHECKPOINT' | 'ACTIVE_LOCK_MATCH' }
    | {
        allowed: false;
        code:
            | 'ACTIVE_CAMPAIGN_SAFE_MODE'
            | 'ACTIVE_LOCK_UNAVAILABLE'
            | 'CHECKPOINT_LOCK_REQUIRED'
            | 'CHECKPOINT_MOD_FIELDS_INVALID'
            | 'CHECKPOINT_LOCK_MISMATCH'
            | 'MODDED_CHECKPOINT_REQUIRES_ACTIVE_LOCK';
    };

export interface ModCheckpointEvidence {
    format: string;
    modLockSnapshot?: unknown;
    modLockFingerprint?: unknown;
}

/**
 * Pure restore gate. A checkpoint can never select or replace the active loadout:
 * it may only prove that it was created under the already verified active lock.
 */
export function assessModCheckpointRestore(input: {
    activeDecision: ModOpenDecision;
    activeLock?: ModLock;
    checkpoint: ModCheckpointEvidence;
}): ModCheckpointRestoreDecision {
    if (input.activeDecision.mode === 'safe-required') {
        return { allowed: false, code: 'ACTIVE_CAMPAIGN_SAFE_MODE' };
    }

    const isModCheckpoint = input.checkpoint.format === 'text-adventure-checkpoint/1.2';
    if (!isModCheckpoint) {
        return input.activeDecision.mode === 'unmodded'
            ? { allowed: true, code: 'UNMODDED_LEGACY_CHECKPOINT' }
            : { allowed: false, code: 'CHECKPOINT_LOCK_REQUIRED' };
    }

    const fingerprint = input.checkpoint.modLockFingerprint;
    const lockValidation = validateModLock(input.checkpoint.modLockSnapshot);
    if (typeof fingerprint !== 'string'
        || !lockValidation.ok
        || fingerprint !== lockValidation.value.aggregateHash) {
        return { allowed: false, code: 'CHECKPOINT_MOD_FIELDS_INVALID' };
    }

    if (input.activeDecision.mode === 'unmodded') {
        return { allowed: false, code: 'MODDED_CHECKPOINT_REQUIRES_ACTIVE_LOCK' };
    }
    if (!input.activeLock || input.activeDecision.modContext.lockFingerprint !== input.activeLock.aggregateHash) {
        return { allowed: false, code: 'ACTIVE_LOCK_UNAVAILABLE' };
    }
    if (fingerprint !== input.activeLock.aggregateHash
        || canonicalizeModJson(lockValidation.value) !== canonicalizeModJson(input.activeLock)) {
        return { allowed: false, code: 'CHECKPOINT_LOCK_MISMATCH' };
    }
    return { allowed: true, code: 'ACTIVE_LOCK_MATCH' };
}
