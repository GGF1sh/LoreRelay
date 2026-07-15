// NOAI-GAMEPLAY-SPINE-005B-PRE3A: durable host owner for normal vehicle_state.json mutations.
// Coordinates document read / mechanical mutation / version-preserving replacement.
// Does not create receipts, migrate v1→v2, or perform Gameplay Spine repair.
// Exceptional writers (ledger migration writeback/restore, SO executor, etc.) stay outside.

import * as fs from 'fs';
import * as path from 'path';
import {
    canonicalizeVehicleStateDocument,
    parseVehicleStateDocument,
    projectVehicleStateDocumentMechanical,
    rebuildVehicleStateDocumentWithMechanical,
    type VehicleStateDocument,
    type VehicleStateDocumentParseResult,
} from './vehicleStateDocumentCore';
import type { VehicleState } from './vehicleCore';

const VEHICLE_DOCUMENT_RENAME_ATTEMPTS = 5;
const VEHICLE_DOCUMENT_RENAME_RETRY_BASE_DELAY_MS = 12;
const VEHICLE_DOCUMENT_TEMP_BASENAME_MAX_LENGTH = 96;
const RETRYABLE_RENAME_ERROR_CODES = new Set([
    'EACCES',
    'EBUSY',
    'EEXIST',
    'ENOTEMPTY',
    'EPERM',
]);
const VEHICLE_DOCUMENT_TEMP_BASENAME = /^\.lorerelay-vehicle-state-\d+-\d+-\d+\.tmp$/;

let tempFileSequence = 0;

export type VehicleStateDocumentCommitState =
    | 'not_committed'
    | 'committed'
    | 'indeterminate';

export type VehicleStateDocumentDurabilityWarning =
    | 'directory_fsync_unsupported'
    | 'directory_fsync_failed';

export type VehicleStateDocumentRefreshWarning =
    | 'cache_clear_failed_after_commit';

export type VehicleStateDocumentFailureReason =
    | 'no_workspace'
    | 'missing'
    | 'empty_fleet'
    | 'invalid_document'
    | 'invalid_receipt_metadata'
    | 'unsupported_document_version'
    | 'unreadable'
    | 'mutation_failed'
    | 'serialization_failed'
    | 'write_failed_before_replace'
    | 'replace_failed'
    | 'reload_failed_after_replace'
    | 'reload_mismatch_after_replace'
    | 'no_change';

export type VehicleStateDocumentFreshRead =
    | {
        ok: true;
        statePath: string;
        document: VehicleStateDocument;
        mechanical: VehicleState;
    }
    | {
        ok: false;
        reason: VehicleStateDocumentFailureReason;
        statePath?: string;
        version?: number;
    };

export interface VehicleStateDocumentMutationResult {
    ok: boolean;
    applied: boolean;
    attempted: boolean;
    commitState: VehicleStateDocumentCommitState;
    reason?: VehicleStateDocumentFailureReason;
    reconciliationRequired?: boolean;
    refreshWarning?: VehicleStateDocumentRefreshWarning;
    durabilityWarning?: VehicleStateDocumentDurabilityWarning;
}

/**
 * Narrow complete-document replacement result.  Unlike the normal mechanical
 * writer this is used only by explicitly versioned callers which have already
 * constructed and validated a complete canonical document (for example the
 * Gameplay Spine repair receipt commit).  It deliberately shares the same
 * fresh-read, queue, durable replacement, reload, and cache rules.
 */
export interface VehicleStateDocumentReplacementResult {
    ok: boolean;
    applied: boolean;
    attempted: boolean;
    commitState: VehicleStateDocumentCommitState;
    reason?: VehicleStateDocumentFailureReason | string;
    reconciliationRequired?: boolean;
    refreshWarning?: VehicleStateDocumentRefreshWarning;
    durabilityWarning?: VehicleStateDocumentDurabilityWarning;
}

export interface VehicleStateDocumentReadDeps {
    getVehicleStatePath: () => string | undefined;
    fileExists: (filePath: string) => boolean;
    readFileUtf8: (filePath: string) => string;
}

export interface VehicleStateDocumentOwnerDeps extends VehicleStateDocumentReadDeps {
    allocateTempPath: (statePath: string) => string;
    openTempFile: (tempPath: string) => number;
    writeTempFileUtf8: (fileDescriptor: number, payload: string) => void;
    fsyncTempFile: (fileDescriptor: number) => void;
    closeTempFile: (fileDescriptor: number) => void;
    renameFile: (fromPath: string, toPath: string) => void;
    waitBeforeRenameRetry: (attempt: number) => void;
    cleanupTempFile: (tempPath: string) => void;
    syncDirectoryBestEffort: (
        directoryPath: string
    ) => VehicleStateDocumentDurabilityWarning | undefined;
    clearVehicleStateCache: () => void;
    runSerializedMutation: (fn: () => void) => void;
    reportDiagnostic: (message: string, error?: unknown) => void;
}

function allocateVehicleDocumentTempPath(statePath: string): string {
    tempFileSequence += 1;
    return path.join(
        path.dirname(statePath),
        `.lorerelay-vehicle-state-${process.pid}-${Date.now()}-${tempFileSequence}.tmp`
    );
}

function waitBeforeRenameRetrySync(attempt: number): void {
    const waitUntil = Date.now() + VEHICLE_DOCUMENT_RENAME_RETRY_BASE_DELAY_MS * attempt;
    while (Date.now() < waitUntil) {
        // Deliberately bounded synchronous wait: this mirrors the existing workspace atomic writer.
    }
}

/**
 * File fsync requests that the OS flush the temp file before replacement; storage hardware and
 * unsupported filesystems can still weaken power-loss guarantees. Same-directory rename is the
 * repository-supported atomic replacement boundary. Directory fsync is additionally attempted
 * where Node supports it. On Windows, fsyncSync on an opened directory returns EPERM, so the
 * replacement remains committed but carries a bounded durability warning.
 */
function syncDirectoryBestEffortDefault(
    directoryPath: string
): VehicleStateDocumentDurabilityWarning | undefined {
    if (process.platform === 'win32') {
        return 'directory_fsync_unsupported';
    }

    let directoryFd: number | undefined;
    let warning: VehicleStateDocumentDurabilityWarning | undefined;
    try {
        directoryFd = fs.openSync(directoryPath, 'r');
        fs.fsyncSync(directoryFd);
    } catch {
        warning = 'directory_fsync_failed';
    } finally {
        if (directoryFd !== undefined) {
            try {
                fs.closeSync(directoryFd);
            } catch {
                warning = 'directory_fsync_failed';
            }
        }
    }
    return warning;
}

/** Lazy host defaults — keeps focused tests free of vscode when using WithDeps. */
export function createDefaultVehicleStateDocumentOwnerDeps(): VehicleStateDocumentOwnerDeps {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const vehicleState = require('./vehicleState') as typeof import('./vehicleState');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const queue = require('./workspaceStateQueue') as typeof import('./workspaceStateQueue');
    return {
        getVehicleStatePath: () => vehicleState.getVehicleStatePath(),
        fileExists: (filePath) => fs.existsSync(filePath),
        readFileUtf8: (filePath) => fs.readFileSync(filePath, 'utf-8'),
        allocateTempPath: allocateVehicleDocumentTempPath,
        openTempFile: (tempPath) => fs.openSync(tempPath, 'wx', 0o600),
        writeTempFileUtf8: (fileDescriptor, payload) => {
            fs.writeFileSync(fileDescriptor, payload, { encoding: 'utf-8' });
        },
        fsyncTempFile: (fileDescriptor) => fs.fsyncSync(fileDescriptor),
        closeTempFile: (fileDescriptor) => fs.closeSync(fileDescriptor),
        renameFile: (fromPath, toPath) => fs.renameSync(fromPath, toPath),
        waitBeforeRenameRetry: waitBeforeRenameRetrySync,
        cleanupTempFile: (tempPath) => {
            try {
                if (fs.existsSync(tempPath)) {
                    fs.unlinkSync(tempPath);
                }
            } catch {
                // Best effort only. Never delete or rewrite the canonical path as cleanup.
            }
        },
        syncDirectoryBestEffort: syncDirectoryBestEffortDefault,
        clearVehicleStateCache: () => vehicleState.clearVehicleStateCache(),
        runSerializedMutation: (fn) => queue.runSerializedVehicleStateMutation(fn),
        reportDiagnostic: (message, error) => console.warn(message, error),
    };
}

function mapParseFailure(
    parsed: Exclude<
        VehicleStateDocumentParseResult,
        { kind: 'valid_v1' } | { kind: 'valid_v2' }
    >
): VehicleStateDocumentFailureReason {
    if (parsed.kind === 'invalid_receipt_metadata') {
        return 'invalid_receipt_metadata';
    }
    if (parsed.kind === 'unsupported_document_version') {
        return 'unsupported_document_version';
    }
    return 'invalid_document';
}

function mechanicalHasFleet(mechanical: VehicleState): boolean {
    return Array.isArray(mechanical.vehicles) && mechanical.vehicles.length > 0;
}

function mechanicalUnchanged(before: VehicleState, after: VehicleState): boolean {
    return JSON.stringify(before) === JSON.stringify(after);
}

function reportDiagnosticBestEffort(
    deps: VehicleStateDocumentOwnerDeps,
    message: string,
    error?: unknown
): void {
    try {
        deps.reportDiagnostic(message, error);
    } catch {
        // Diagnostics must never change the document outcome.
    }
}

/** Fresh document read (no cache). Fail-closed for corrupt / unsupported documents. */
export function readVehicleStateDocumentFreshWithDeps(
    deps: VehicleStateDocumentReadDeps,
    statePath?: string
): VehicleStateDocumentFreshRead {
    const resolved = statePath ?? deps.getVehicleStatePath();
    if (!resolved) {
        return { ok: false, reason: 'no_workspace' };
    }
    try {
        if (!deps.fileExists(resolved)) {
            return { ok: false, reason: 'missing', statePath: resolved };
        }
    } catch {
        return { ok: false, reason: 'unreadable', statePath: resolved };
    }
    let rawText: string;
    try {
        rawText = deps.readFileUtf8(resolved);
    } catch {
        return { ok: false, reason: 'unreadable', statePath: resolved };
    }
    let raw: unknown;
    try {
        raw = JSON.parse(rawText);
    } catch {
        return { ok: false, reason: 'invalid_document', statePath: resolved };
    }
    const parsed = parseVehicleStateDocument(raw);
    if (parsed.kind === 'valid_v1' || parsed.kind === 'valid_v2') {
        const mechanical = projectVehicleStateDocumentMechanical(parsed.document);
        if (!mechanicalHasFleet(mechanical)) {
            return { ok: false, reason: 'empty_fleet', statePath: resolved };
        }
        return {
            ok: true,
            statePath: resolved,
            document: parsed.document,
            mechanical,
        };
    }
    if (parsed.kind === 'unsupported_document_version') {
        return {
            ok: false,
            reason: 'unsupported_document_version',
            statePath: resolved,
            version: parsed.version,
        };
    }
    return {
        ok: false,
        reason: mapParseFailure(parsed),
        statePath: resolved,
    };
}

export function readVehicleStateDocumentFresh(
    statePath?: string
): VehicleStateDocumentFreshRead {
    return readVehicleStateDocumentFreshWithDeps(
        createDefaultVehicleStateDocumentOwnerDeps(),
        statePath
    );
}

/** Fresh mechanical projection only (receipt metadata never included). */
export function readMechanicalVehicleStateFreshWithDeps(
    deps: VehicleStateDocumentReadDeps,
    statePath?: string
): VehicleState | undefined {
    const read = readVehicleStateDocumentFreshWithDeps(deps, statePath);
    return read.ok ? read.mechanical : undefined;
}

export function readMechanicalVehicleStateFresh(
    statePath?: string
): VehicleState | undefined {
    return readMechanicalVehicleStateFreshWithDeps(
        createDefaultVehicleStateDocumentOwnerDeps(),
        statePath
    );
}

function errorCode(error: unknown): string | undefined {
    if (!error || typeof error !== 'object' || !('code' in error)) {
        return undefined;
    }
    const code = (error as { code?: unknown }).code;
    return typeof code === 'string' ? code : undefined;
}

function isSafeSameDirectoryTempPath(statePath: string, tempPath: string): boolean {
    const stateDirectory = path.resolve(path.dirname(statePath));
    const tempDirectory = path.resolve(path.dirname(tempPath));
    const basename = path.basename(tempPath);
    return stateDirectory === tempDirectory
        && basename.length <= VEHICLE_DOCUMENT_TEMP_BASENAME_MAX_LENGTH
        && VEHICLE_DOCUMENT_TEMP_BASENAME.test(basename);
}

function replaceWithBoundedRetry(
    deps: VehicleStateDocumentOwnerDeps,
    tempPath: string,
    statePath: string
): void {
    for (let attempt = 1; attempt <= VEHICLE_DOCUMENT_RENAME_ATTEMPTS; attempt += 1) {
        try {
            deps.renameFile(tempPath, statePath);
            return;
        } catch (error) {
            const retryable = RETRYABLE_RENAME_ERROR_CODES.has(errorCode(error) ?? '');
            if (!retryable || attempt === VEHICLE_DOCUMENT_RENAME_ATTEMPTS) {
                throw error;
            }
            deps.waitBeforeRenameRetry(attempt);
        }
    }
}

function cleanupTempFileBestEffort(
    deps: VehicleStateDocumentOwnerDeps,
    tempPath: string
): void {
    try {
        deps.cleanupTempFile(tempPath);
    } catch {
        // Cleanup cannot change a canonical-path outcome.
    }
}

type DurableReplacementResult =
    | {
        ok: true;
        commitState: 'committed';
        durabilityWarning?: VehicleStateDocumentDurabilityWarning;
    }
    | {
        ok: false;
        commitState: 'not_committed' | 'indeterminate';
        reason: Extract<
            VehicleStateDocumentFailureReason,
            | 'write_failed_before_replace'
            | 'replace_failed'
            | 'reload_failed_after_replace'
            | 'reload_mismatch_after_replace'
        >;
        error?: unknown;
        durabilityWarning?: VehicleStateDocumentDurabilityWarning;
    };

/**
 * Replaces the canonical document without ever deleting it first. File fsync completes before
 * same-directory rename; a fresh strict reload and PRE1 canonical projection establish success.
 */
function replaceVehicleStateDocumentDurably(
    deps: VehicleStateDocumentOwnerDeps,
    statePath: string,
    outDocument: VehicleStateDocument
): DurableReplacementResult {
    let tempPath: string;
    let payload: string;
    try {
        tempPath = deps.allocateTempPath(statePath);
        if (!isSafeSameDirectoryTempPath(statePath, tempPath)) {
            throw new Error('unsafe vehicle document temp path');
        }
        payload = `${canonicalizeVehicleStateDocument(outDocument)}\n`;
    } catch (error) {
        return {
            ok: false,
            commitState: 'not_committed',
            reason: 'write_failed_before_replace',
            error,
        };
    }

    let fileDescriptor: number | undefined;
    let tempCreated = false;
    let closeAttempted = false;
    try {
        fileDescriptor = deps.openTempFile(tempPath);
        tempCreated = true;
        deps.writeTempFileUtf8(fileDescriptor, payload);
        deps.fsyncTempFile(fileDescriptor);
        closeAttempted = true;
        deps.closeTempFile(fileDescriptor);
        fileDescriptor = undefined;
    } catch (error) {
        if (fileDescriptor !== undefined && !closeAttempted) {
            try {
                deps.closeTempFile(fileDescriptor);
            } catch {
                // Best effort; the canonical path has not been touched.
            }
        }
        if (tempCreated) {
            cleanupTempFileBestEffort(deps, tempPath);
        }
        return {
            ok: false,
            commitState: 'not_committed',
            reason: 'write_failed_before_replace',
            error,
        };
    }

    try {
        replaceWithBoundedRetry(deps, tempPath, statePath);
    } catch (error) {
        cleanupTempFileBestEffort(deps, tempPath);
        return {
            ok: false,
            commitState: 'not_committed',
            reason: 'replace_failed',
            error,
        };
    }

    let durabilityWarning: VehicleStateDocumentDurabilityWarning | undefined;
    try {
        durabilityWarning = deps.syncDirectoryBestEffort(path.dirname(statePath));
    } catch {
        durabilityWarning = 'directory_fsync_failed';
    }

    let reloaded: VehicleStateDocumentFreshRead;
    try {
        reloaded = readVehicleStateDocumentFreshWithDeps(deps, statePath);
    } catch (error) {
        return {
            ok: false,
            commitState: 'indeterminate',
            reason: 'reload_failed_after_replace',
            error,
            durabilityWarning,
        };
    }
    if (!reloaded.ok) {
        return {
            ok: false,
            commitState: 'indeterminate',
            reason: 'reload_failed_after_replace',
            durabilityWarning,
        };
    }

    let documentsMatch = false;
    try {
        documentsMatch = canonicalizeVehicleStateDocument(outDocument)
            === canonicalizeVehicleStateDocument(reloaded.document);
    } catch (error) {
        return {
            ok: false,
            commitState: 'indeterminate',
            reason: 'reload_failed_after_replace',
            error,
            durabilityWarning,
        };
    }
    if (!documentsMatch) {
        return {
            ok: false,
            commitState: 'indeterminate',
            reason: 'reload_mismatch_after_replace',
            durabilityWarning,
        };
    }
    return { ok: true, commitState: 'committed', durabilityWarning };
}

/** The sole vehicle-queue acquisition layer for normal and authoritative document writers. */
function runVehicleDocumentSerialized(
    deps: VehicleStateDocumentOwnerDeps,
    fn: () => void
): void {
    deps.runSerializedMutation(fn);
}

/**
 * Serialized normal mutation path for vehicleOps / mobileBaseOps.
 * v1→v1, v2→v2 with receipts preserved; invalid documents never write or clear cache.
 */
export function runSerializedVehicleStateDocumentMutationWithDeps(
    deps: VehicleStateDocumentOwnerDeps,
    mutationName: string,
    mutateMechanicalState: (current: VehicleState) => VehicleState | undefined
): VehicleStateDocumentMutationResult {
    const result: VehicleStateDocumentMutationResult = {
        ok: true,
        applied: false,
        attempted: true,
        commitState: 'not_committed',
    };
    try {
        runVehicleDocumentSerialized(deps, () => {
            const read = readVehicleStateDocumentFreshWithDeps(deps);
            if (!read.ok) {
                // Missing / empty fleet: soft no-op (matches prior turn-ops behavior).
                if (read.reason === 'missing'
                    || read.reason === 'empty_fleet'
                    || read.reason === 'no_workspace') {
                    result.reason = read.reason;
                    return;
                }
                // Corrupt / unsupported: fail closed, leave file and cache untouched.
                result.ok = false;
                result.reason = read.reason;
                return;
            }

            let nextMechanical: VehicleState | undefined;
            try {
                nextMechanical = mutateMechanicalState(read.mechanical);
            } catch (error) {
                result.ok = false;
                result.reason = 'mutation_failed';
                reportDiagnosticBestEffort(
                    deps,
                    `[vehicleStateDocumentOwner] ${mutationName} mutate failed`,
                    error
                );
                return;
            }

            if (!nextMechanical || mechanicalUnchanged(read.mechanical, nextMechanical)) {
                result.reason = 'no_change';
                return;
            }

            const outDocument = rebuildVehicleStateDocumentWithMechanical(
                read.document,
                nextMechanical
            );
            const replacement = replaceVehicleStateDocumentDurably(
                deps,
                read.statePath,
                outDocument
            );
            result.commitState = replacement.commitState;
            result.durabilityWarning = replacement.durabilityWarning;
            if (!replacement.ok) {
                result.ok = false;
                result.applied = false;
                result.reason = replacement.reason;
                result.reconciliationRequired = replacement.commitState === 'indeterminate';
                reportDiagnosticBestEffort(
                    deps,
                    `[vehicleStateDocumentOwner] ${mutationName} ${replacement.reason}`,
                    replacement.error
                );
                return;
            }

            result.applied = true;
            result.reason = undefined;
            try {
                deps.clearVehicleStateCache();
            } catch (error) {
                result.refreshWarning = 'cache_clear_failed_after_commit';
                reportDiagnosticBestEffort(
                    deps,
                    `[vehicleStateDocumentOwner] ${mutationName} cache clear failed after commit`,
                    error
                );
            }
        });
    } catch (error) {
        reportDiagnosticBestEffort(
            deps,
            `[vehicleStateDocumentOwner] ${mutationName} serialization failed`,
            error
        );
        if (result.commitState !== 'not_committed') {
            return result;
        }
        return {
            ok: false,
            applied: false,
            attempted: true,
            commitState: 'not_committed',
            reason: 'serialization_failed',
        };
    }
    return result;
}

export function runSerializedVehicleStateDocumentMutation(
    mutationName: string,
    mutateMechanicalState: (current: VehicleState) => VehicleState | undefined
): VehicleStateDocumentMutationResult {
    return runSerializedVehicleStateDocumentMutationWithDeps(
        createDefaultVehicleStateDocumentOwnerDeps(),
        mutationName,
        mutateMechanicalState
    );
}

/**
 * Perform one complete document replacement under the shared vehicle queue.
 * The caller receives the fresh parsed document while already serialized and
 * may return a fully formed v1/v2 document or `undefined` for a factual
 * no-write result.  This is intentionally not a generic JSON writer.
 */
export function runSerializedVehicleStateDocumentReplacementWithDeps(
    deps: VehicleStateDocumentOwnerDeps,
    mutationName: string,
    buildReplacement: (read: Extract<VehicleStateDocumentFreshRead, { ok: true }>) =>
        VehicleStateDocument | undefined
): VehicleStateDocumentReplacementResult {
    const result: VehicleStateDocumentReplacementResult = {
        ok: true,
        applied: false,
        attempted: true,
        commitState: 'not_committed',
    };
    try {
        runVehicleDocumentSerialized(deps, () => {
            const read = readVehicleStateDocumentFreshWithDeps(deps);
            if (!read.ok) {
                result.ok = false;
                result.reason = read.reason;
                return;
            }
            let replacementDocument: VehicleStateDocument | undefined;
            try {
                replacementDocument = buildReplacement(read);
            } catch (error) {
                result.ok = false;
                result.reason = 'mutation_failed';
                reportDiagnosticBestEffort(deps, `[vehicleStateDocumentOwner] ${mutationName} build failed`, error);
                return;
            }
            if (!replacementDocument) {
                result.reason = 'no_change';
                return;
            }
            const replacement = replaceVehicleStateDocumentDurably(
                deps,
                read.statePath,
                replacementDocument
            );
            result.commitState = replacement.commitState;
            result.durabilityWarning = replacement.durabilityWarning;
            if (!replacement.ok) {
                result.ok = false;
                result.reason = replacement.reason;
                result.reconciliationRequired = replacement.commitState === 'indeterminate';
                reportDiagnosticBestEffort(
                    deps,
                    `[vehicleStateDocumentOwner] ${mutationName} ${replacement.reason}`,
                    replacement.error
                );
                return;
            }
            result.applied = true;
            try {
                deps.clearVehicleStateCache();
            } catch (error) {
                result.refreshWarning = 'cache_clear_failed_after_commit';
                reportDiagnosticBestEffort(
                    deps,
                    `[vehicleStateDocumentOwner] ${mutationName} cache clear failed after commit`,
                    error
                );
            }
        });
    } catch (error) {
        reportDiagnosticBestEffort(deps, `[vehicleStateDocumentOwner] ${mutationName} serialization failed`, error);
        return {
            ok: false,
            applied: false,
            attempted: true,
            commitState: 'not_committed',
            reason: 'serialization_failed',
        };
    }
    return result;
}
