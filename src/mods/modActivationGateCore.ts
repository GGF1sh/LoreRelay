import { canonicalizeModJson } from './modHashCore';
import type { ModLock } from './modProfileCore';
import { validateModLock } from './modProfileCore';
import { parseModContext, type ModOpenDecision } from './modSafeModeCore';

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
    stateSnapshot?: unknown;
}

function collectSnapshotModEvidence(value: unknown): {
    present: boolean;
    invalid: boolean;
    fingerprints: string[];
} {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return { present: false, invalid: false, fingerprints: [] };
    }
    const snapshot = value as Record<string, unknown>;
    const gameState = snapshot.gameState;
    if (!gameState || typeof gameState !== 'object' || Array.isArray(gameState)) {
        return { present: false, invalid: false, fingerprints: [] };
    }
    const entries = (gameState as Record<string, unknown>).entries;
    if (!Array.isArray(entries)) return { present: false, invalid: false, fingerprints: [] };
    const fingerprints = new Set<string>();
    let present = false;
    let invalid = false;
    for (const entry of entries) {
        if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
        const record = entry as Record<string, unknown>;
        if (!Object.prototype.hasOwnProperty.call(record, 'modContext')) continue;
        present = true;
        const context = parseModContext(record.modContext);
        if (context) fingerprints.add(context.lockFingerprint);
        else invalid = true;
    }
    return { present, invalid, fingerprints: [...fingerprints].sort() };
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

    const hasModFields = input.checkpoint.modLockSnapshot !== undefined
        || input.checkpoint.modLockFingerprint !== undefined;
    const snapshotEvidence = input.checkpoint.format === 'text-adventure-checkpoint/1.3'
        ? collectSnapshotModEvidence(input.checkpoint.stateSnapshot)
        : { present: false, invalid: false, fingerprints: [] };
    const isModCheckpoint = input.checkpoint.format === 'text-adventure-checkpoint/1.2'
        || (input.checkpoint.format === 'text-adventure-checkpoint/1.3' && (hasModFields || snapshotEvidence.present));
    if (!isModCheckpoint) {
        return input.activeDecision.mode === 'unmodded'
            ? { allowed: true, code: 'UNMODDED_LEGACY_CHECKPOINT' }
            : { allowed: false, code: 'CHECKPOINT_LOCK_REQUIRED' };
    }

    const fingerprint = input.checkpoint.modLockFingerprint;
    const lockValidation = validateModLock(input.checkpoint.modLockSnapshot);
    if (typeof fingerprint !== 'string'
        || !lockValidation.ok
        || fingerprint !== lockValidation.value.aggregateHash
        || snapshotEvidence.invalid
        || snapshotEvidence.fingerprints.some(value => value !== fingerprint)) {
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
