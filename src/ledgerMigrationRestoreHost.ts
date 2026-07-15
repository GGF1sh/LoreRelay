// World Intent WI7b: fs-only vehicle_state migration backup restore (testable, no vscode).

import * as fs from 'fs';
import * as path from 'path';
import {
    formatMigrationBackupTimestamp,
    VEHICLE_STATE_WRITEBACK_FILE,
} from './ledgerMigrationWritebackCore';
import {
    buildMigrationBackupDirRel,
    buildMigrationRestoreMeta,
    buildPreRestoreBackupPaths,
    documentsSemanticallyEqual,
    parseMigrationBackupMeta,
    sortMigrationBackupCandidates,
    validateRestoreSourceDocument,
    MIGRATION_RESTORE_BEFORE_FILE,
    type MigrationBackupCandidate,
    type MigrationRestoreMeta,
    type RestoreAbortReason,
    type RestoreOutcome,
} from './ledgerMigrationRestoreCore';
import { runSerializedVehicleStateMutation } from './workspaceStateQueue';

export interface VehicleStateRestoreResult {
    outcome: RestoreOutcome;
    reasonCode?: RestoreAbortReason;
    restoredFromRel?: string;
    preRestoreBackupRel?: string;
    preRestoreBackupCreated: boolean;
    restoredDocument?: unknown;
    cacheRefreshWarning?: 'cache_clear_failed_after_commit';
}

export interface VehicleStateRestoreHostDeps {
    exists?: (filePath: string) => boolean;
    readFile?: (filePath: string, encoding: BufferEncoding) => string;
    readdir?: (dirPath: string) => string[];
    mkdir?: (dirPath: string, options: fs.MakeDirectoryOptions) => void;
    copyFile?: (src: string, dest: string) => void;
    writeFile?: (filePath: string, data: string, encoding: BufferEncoding) => void;
    writeTextAtomic?: (filePath: string, text: string) => void;
    now?: () => Date;
    runSerializedVehicleStateMutation?: (fn: () => void) => void;
    clearVehicleStateCache?: () => void;
}

function clearVehicleStateCacheDefault(): void {
    // Lazy import preserves this host's fs-only focused-test surface (no vscode at module load).
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const vehicleState = require('./vehicleState') as typeof import('./vehicleState');
    vehicleState.clearVehicleStateCache();
}

function resolveWorkspaceRelativePath(wsPath: string, relativePath: string): string {
    const root = path.resolve(wsPath);
    const resolved = path.resolve(root, relativePath);
    if (resolved !== root && !resolved.startsWith(root + path.sep)) {
        throw new Error('Path escapes workspace root.');
    }
    return resolved;
}

function writeTextAtomicLocal(filePath: string, text: string): void {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
    const tmp = `${filePath}.${process.pid}.${Date.now()}.tmp`;
    fs.writeFileSync(tmp, text, 'utf-8');
    fs.renameSync(tmp, filePath);
}

function readJsonFile(
    filePath: string,
    deps: VehicleStateRestoreHostDeps
): { raw?: unknown; text?: string; error?: RestoreAbortReason } {
    const exists = deps.exists ?? fs.existsSync.bind(fs);
    const readFile = deps.readFile ?? ((p, enc) => fs.readFileSync(p, enc));
    if (!exists(filePath)) {
        return { error: 'missing_backup_file' };
    }
    try {
        const text = readFile(filePath, 'utf-8');
        return { raw: JSON.parse(text), text };
    } catch {
        return { error: 'backup_parse_error' };
    }
}

function loadBackupCandidate(
    wsPath: string,
    timestamp: string,
    deps: VehicleStateRestoreHostDeps
): { candidate?: MigrationBackupCandidate; reason?: RestoreAbortReason } {
    const backupDirRel = buildMigrationBackupDirRel(timestamp);
    if (!backupDirRel) {
        return { reason: 'invalid_timestamp' };
    }
    const backupFileRel = `${backupDirRel}/${VEHICLE_STATE_WRITEBACK_FILE}`;
    const metaFileRel = `${backupDirRel}/migration_meta.json`;
    const backupPath = resolveWorkspaceRelativePath(wsPath, backupFileRel);
    const metaPath = resolveWorkspaceRelativePath(wsPath, metaFileRel);
    const exists = deps.exists ?? fs.existsSync.bind(fs);
    if (!exists(backupPath)) {
        return { reason: 'missing_backup_file' };
    }
    if (!exists(metaPath)) {
        return { reason: 'missing_meta_file' };
    }

    const metaRead = readJsonFile(metaPath, deps);
    if (metaRead.error) {
        return { reason: 'meta_read_error' };
    }
    const meta = parseMigrationBackupMeta(metaRead.raw);
    if (!meta) {
        return { reason: 'invalid_meta' };
    }

    const backupRead = readJsonFile(backupPath, deps);
    if (backupRead.error) {
        return { reason: backupRead.error };
    }
    const validation = validateRestoreSourceDocument(backupRead.raw);
    if (!validation.ok) {
        return { reason: validation.reason };
    }

    return {
        candidate: {
            timestamp,
            backupDirRel,
            backupFileRel,
            metaFileRel,
            meta,
            sortKey: timestamp,
        },
    };
}

export function listVehicleStateMigrationBackups(
    wsPath: string,
    deps: VehicleStateRestoreHostDeps = {}
): { candidates: MigrationBackupCandidate[]; invalidTimestamps: string[] } {
    const migrationsRootRel = '.lorerelay/backups/migrations';
    const migrationsRoot = resolveWorkspaceRelativePath(wsPath, migrationsRootRel);
    const exists = deps.exists ?? fs.existsSync.bind(fs);
    const readdir = deps.readdir ?? ((dir) => fs.readdirSync(dir, { withFileTypes: false }) as string[]);

    if (!exists(migrationsRoot)) {
        return { candidates: [], invalidTimestamps: [] };
    }

    const candidates: MigrationBackupCandidate[] = [];
    const invalidTimestamps: string[] = [];
    for (const entry of readdir(migrationsRoot)) {
        const timestamp = path.basename(entry);
        const loaded = loadBackupCandidate(wsPath, timestamp, deps);
        if (loaded.candidate) {
            candidates.push(loaded.candidate);
        } else {
            invalidTimestamps.push(timestamp);
        }
    }
    return { candidates: sortMigrationBackupCandidates(candidates), invalidTimestamps };
}

function createPreRestoreBackup(
    wsPath: string,
    timestamp: string,
    restoredFromRel: string,
    currentSourcePath: string,
    currentExists: boolean,
    deps: VehicleStateRestoreHostDeps
): { ok: true; beforeFileRel?: string; metaFileRel: string; meta: MigrationRestoreMeta }
    | { ok: false } {
    const paths = buildPreRestoreBackupPaths(timestamp);
    if (!paths) { return { ok: false }; }

    const restoreDir = resolveWorkspaceRelativePath(wsPath, paths.restoreDirRel);
    const metaFile = resolveWorkspaceRelativePath(wsPath, paths.metaFileRel);
    const mkdir = deps.mkdir ?? fs.mkdirSync.bind(fs);
    const copyFile = deps.copyFile ?? fs.copyFileSync.bind(fs);
    const writeFile = deps.writeFile ?? fs.writeFileSync.bind(fs);
    const exists = deps.exists ?? fs.existsSync.bind(fs);
    const now = deps.now ?? (() => new Date());
    const createdAt = now().toISOString();

    let beforeFileRel: string | undefined;
    try {
        mkdir(restoreDir, { recursive: true });
        if (currentExists) {
            const beforeFile = resolveWorkspaceRelativePath(wsPath, paths.beforeFileRel);
            copyFile(currentSourcePath, beforeFile);
            if (!exists(beforeFile)) {
                return { ok: false };
            }
            beforeFileRel = paths.beforeFileRel;
        }
        const meta = buildMigrationRestoreMeta({
            createdAt,
            restoredFrom: restoredFromRel,
            currentBackupFile: beforeFileRel ? MIGRATION_RESTORE_BEFORE_FILE : undefined,
            currentFileMissing: !currentExists,
        });
        writeFile(metaFile, `${JSON.stringify(meta, null, 2)}\n`, 'utf-8');
        if (!exists(metaFile)) {
            return { ok: false };
        }
        return { ok: true, beforeFileRel, metaFileRel: paths.metaFileRel, meta };
    } catch {
        return { ok: false };
    }
}

/** Restore vehicle_state.json from a WI7 migration backup (host fs only). */
export function restoreVehicleStateMigrationBackup(
    wsPath: string,
    timestamp: string,
    deps: VehicleStateRestoreHostDeps = {}
): VehicleStateRestoreResult {
    const loaded = loadBackupCandidate(wsPath, timestamp, deps);
    if (!loaded.candidate) {
        return {
            outcome: 'aborted',
            reasonCode: loaded.reason ?? 'invalid_meta',
            preRestoreBackupCreated: false,
        };
    }

    const candidate = loaded.candidate;
    const backupPath = resolveWorkspaceRelativePath(wsPath, candidate.backupFileRel);
    const readFile = deps.readFile ?? ((p, enc) => fs.readFileSync(p, enc));

    let backupText: string;
    let backupRaw: unknown;
    try {
        backupText = readFile(backupPath, 'utf-8');
        backupRaw = JSON.parse(backupText);
    } catch {
        return {
            outcome: 'aborted',
            reasonCode: 'backup_read_error',
            preRestoreBackupCreated: false,
        };
    }

    const validation = validateRestoreSourceDocument(backupRaw);
    if (!validation.ok) {
        return {
            outcome: 'aborted',
            reasonCode: validation.reason,
            preRestoreBackupCreated: false,
        };
    }

    const runSerialized = deps.runSerializedVehicleStateMutation
        ?? runSerializedVehicleStateMutation;
    let queuedResult: VehicleStateRestoreResult | undefined;
    try {
        // PRE3B lock order: this host is the sole vehicle-queue acquisition layer.
        // Candidate selection/validation is read-only and occurs before acquisition. The current
        // canonical backup, replacement, reload validation, and cache refresh all remain queued.
        // createSyncFileQueue.drain's existing finally is the release boundary for every outcome.
        runSerialized(() => {
            try {
                queuedResult = restoreValidatedVehicleStateMigrationBackup(
                    wsPath,
                    candidate,
                    backupText,
                    backupRaw,
                    deps
                );
            } catch {
                queuedResult = {
                    outcome: 'write_failed',
                    reasonCode: 'write_failed',
                    restoredFromRel: candidate.backupFileRel,
                    preRestoreBackupCreated: false,
                };
            }
        });
    } catch {
        return {
            outcome: 'write_failed',
            reasonCode: 'write_failed',
            restoredFromRel: candidate.backupFileRel,
            preRestoreBackupCreated: false,
        };
    }
    return queuedResult ?? {
        outcome: 'write_failed',
        reasonCode: 'write_failed',
        restoredFromRel: candidate.backupFileRel,
        preRestoreBackupCreated: false,
    };
}

/** Current backup, replacement, validation, and cache refresh; caller holds vehicle queue. */
function restoreValidatedVehicleStateMigrationBackup(
    wsPath: string,
    candidate: MigrationBackupCandidate,
    backupText: string,
    backupRaw: unknown,
    deps: VehicleStateRestoreHostDeps
): VehicleStateRestoreResult {
    const targetPath = resolveWorkspaceRelativePath(wsPath, VEHICLE_STATE_WRITEBACK_FILE);
    const readFile = deps.readFile ?? ((p, enc) => fs.readFileSync(p, enc));
    const exists = deps.exists ?? fs.existsSync.bind(fs);

    const restoreTimestamp = formatMigrationBackupTimestamp((deps.now ?? (() => new Date()))());
    const currentExists = exists(targetPath);
    const preRestore = createPreRestoreBackup(
        wsPath,
        restoreTimestamp,
        candidate.backupFileRel,
        targetPath,
        currentExists,
        deps
    );
    if (!preRestore.ok) {
        return {
            outcome: 'aborted',
            reasonCode: 'pre_restore_backup_failed',
            preRestoreBackupCreated: false,
        };
    }

    const writeText = deps.writeTextAtomic ?? writeTextAtomicLocal;
    try {
        writeText(targetPath, backupText.endsWith('\n') ? backupText : `${backupText}\n`);
    } catch {
        return {
            outcome: 'write_failed',
            reasonCode: 'write_failed',
            restoredFromRel: candidate.backupFileRel,
            preRestoreBackupRel: preRestore.beforeFileRel,
            preRestoreBackupCreated: true,
        };
    }

    try {
        const restoredText = readFile(targetPath, 'utf-8');
        const restoredRaw = JSON.parse(restoredText);
        if (!documentsSemanticallyEqual(restoredRaw, backupRaw)) {
            throw new Error('semantic mismatch');
        }
        const postValidation = validateRestoreSourceDocument(restoredRaw);
        if (!postValidation.ok) {
            throw new Error('post validation failed');
        }
    } catch {
        return {
            outcome: 'write_failed',
            reasonCode: 'post_restore_validation_failed',
            restoredFromRel: candidate.backupFileRel,
            preRestoreBackupRel: preRestore.beforeFileRel,
            preRestoreBackupCreated: true,
        };
    }

    const result: VehicleStateRestoreResult = {
        outcome: 'success',
        restoredFromRel: candidate.backupFileRel,
        preRestoreBackupRel: preRestore.beforeFileRel,
        preRestoreBackupCreated: true,
        restoredDocument: backupRaw,
    };
    try {
        (deps.clearVehicleStateCache ?? clearVehicleStateCacheDefault)();
    } catch {
        result.cacheRefreshWarning = 'cache_clear_failed_after_commit';
    }
    return result;
}
