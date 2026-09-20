// World Intent WI7: fs-only vehicle_state migration write-back (testable, no vscode).

import * as fs from 'fs';
import * as path from 'path';
import type { LedgerMigrationResult } from './ledgerMigrationCore';
import {
    allocateMigrationBackupTimestamp,
    assessVehicleStateWritebackEligibility,
    buildMigrationBackupMeta,
    buildMigrationBackupPaths,
    formatMigrationBackupTimestamp,
    isValidMigrationBackupTimestamp,
    MIGRATION_BACKUP_ROOT_REL,
    VEHICLE_STATE_WRITEBACK_FILE,
    type MigrationBackupMeta,
    type WritebackAbortReason,
    type WritebackOutcome,
} from './ledgerMigrationWritebackCore';
import { migrateVehicleStateDocument } from './vehicleMigrationCore';
import { parseVehicleState, VEHICLE_STATE_VERSION } from './vehicleCore';
import { runSerializedVehicleStateMutation } from './workspaceStateQueue';

function writeJsonAtomicLocal(filePath: string, data: unknown): void {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
    const tmp = `${filePath}.${process.pid}.${Date.now()}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf-8');
    fs.renameSync(tmp, filePath);
}

export interface VehicleStateWritebackResult {
    outcome: WritebackOutcome;
    reasonCode?: WritebackAbortReason;
    backupFileRel?: string;
    metaFileRel?: string;
    backupCreated: boolean;
    migrationResult?: LedgerMigrationResult;
    cacheRefreshWarning?: 'cache_clear_failed_after_commit';
}

export interface VehicleStateWritebackHostDeps {
    exists?: (filePath: string) => boolean;
    readFile?: (filePath: string, encoding: BufferEncoding) => string;
    readdir?: (dirPath: string) => string[];
    mkdir?: (dirPath: string, options: fs.MakeDirectoryOptions) => void;
    copyFile?: (src: string, dest: string) => void;
    writeFile?: (filePath: string, data: string, encoding: BufferEncoding) => void;
    writeJsonAtomic?: (filePath: string, data: unknown) => void;
    migrate?: (raw: unknown) => LedgerMigrationResult;
    parse?: (raw: unknown) => { version: number };
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

export function listMigrationBackupTimestamps(
    wsPath: string,
    deps: VehicleStateWritebackHostDeps = {}
): string[] {
    const exists = deps.exists ?? fs.existsSync.bind(fs);
    const readdir = deps.readdir ?? ((dir) => fs.readdirSync(dir));
    const root = resolveWorkspaceRelativePath(wsPath, MIGRATION_BACKUP_ROOT_REL);
    if (!exists(root)) { return []; }
    try {
        return readdir(root).filter((name) => isValidMigrationBackupTimestamp(name));
    } catch {
        return [];
    }
}

function resolveWorkspaceRelativePath(wsPath: string, relativePath: string): string {
    const root = path.resolve(wsPath);
    const resolved = path.resolve(root, relativePath);
    if (resolved !== root && !resolved.startsWith(root + path.sep)) {
        throw new Error('Path escapes workspace root.');
    }
    return resolved;
}

function readVehicleStateRaw(
    sourcePath: string,
    deps: VehicleStateWritebackHostDeps
): { raw?: unknown; reason?: WritebackAbortReason } {
    const exists = deps.exists ?? fs.existsSync.bind(fs);
    const readFile = deps.readFile ?? ((p, enc) => fs.readFileSync(p, enc));
    if (!exists(sourcePath)) {
        return { reason: 'missing_file' };
    }
    try {
        const text = readFile(sourcePath, 'utf-8');
        return { raw: JSON.parse(text) };
    } catch {
        return { reason: 'read_error' };
    }
}

function validateMigratedPayload(
    migrated: unknown,
    parse: (raw: unknown) => { version: number }
): boolean {
    const parsed = parse(migrated);
    return parsed.version === VEHICLE_STATE_VERSION;
}

function createStrictBackup(
    wsPath: string,
    sourcePath: string,
    timestamp: string,
    meta: MigrationBackupMeta,
    deps: VehicleStateWritebackHostDeps
): { ok: true; backupFileRel: string; metaFileRel: string } | { ok: false } {
    const paths = buildMigrationBackupPaths(timestamp);
    if (!paths) { return { ok: false }; }

    const backupDir = resolveWorkspaceRelativePath(wsPath, paths.backupDirRel);
    const backupFile = resolveWorkspaceRelativePath(wsPath, paths.backupFileRel);
    const metaFile = resolveWorkspaceRelativePath(wsPath, paths.metaFileRel);
    const exists = deps.exists ?? fs.existsSync.bind(fs);
    const mkdir = deps.mkdir ?? fs.mkdirSync.bind(fs);
    const copyFile = deps.copyFile ?? fs.copyFileSync.bind(fs);
    const writeFile = deps.writeFile ?? fs.writeFileSync.bind(fs);

    try {
        const parentDir = path.dirname(backupDir);
        if (!exists(parentDir)) {
            mkdir(parentDir, { recursive: true });
        }
        if (exists(backupDir)) {
            return { ok: false };
        }
        mkdir(backupDir, { recursive: false });
        copyFile(sourcePath, backupFile);
        writeFile(metaFile, `${JSON.stringify(meta, null, 2)}\n`, 'utf-8');
        if (!exists(backupFile) || !exists(metaFile)) {
            return { ok: false };
        }
        return {
            ok: true,
            backupFileRel: paths.backupFileRel,
            metaFileRel: paths.metaFileRel,
        };
    } catch {
        return { ok: false };
    }
}

export function prepareVehicleStateWriteback(
    wsPath: string,
    deps: VehicleStateWritebackHostDeps = {}
): VehicleStateWritebackResult {
    const migrate = deps.migrate ?? migrateVehicleStateDocument;
    const parse = deps.parse ?? parseVehicleState;
    const sourcePath = resolveWorkspaceRelativePath(wsPath, VEHICLE_STATE_WRITEBACK_FILE);
    const read = readVehicleStateRaw(sourcePath, deps);
    if (read.reason) {
        return { outcome: 'aborted', reasonCode: read.reason, backupCreated: false };
    }

    const migrationResult = migrate(read.raw);
    const eligibility = assessVehicleStateWritebackEligibility(migrationResult);
    if (!eligibility.eligible) {
        return {
            outcome: 'aborted',
            reasonCode: eligibility.reasonCode ?? 'not_eligible',
            backupCreated: false,
            migrationResult,
        };
    }
    if (!validateMigratedPayload(migrationResult.migrated, parse)) {
        return {
            outcome: 'aborted',
            reasonCode: 'validation_failed',
            backupCreated: false,
            migrationResult,
        };
    }

    return {
        outcome: 'success',
        backupCreated: false,
        migrationResult,
    };
}

/** Apply vehicle_state v0 -> v1 after explicit user confirmation (host fs only). */
export function applyVehicleStateMigrationWriteback(
    wsPath: string,
    deps: VehicleStateWritebackHostDeps = {}
): VehicleStateWritebackResult {
    const prepared = prepareVehicleStateWriteback(wsPath, deps);
    if (prepared.outcome !== 'success' || !prepared.migrationResult?.migrated) {
        return prepared;
    }

    const runSerialized = deps.runSerializedVehicleStateMutation
        ?? runSerializedVehicleStateMutation;
    let queuedResult: VehicleStateWritebackResult | undefined;
    try {
        // PRE3B lock order: this host is the sole vehicle-queue acquisition layer.
        // Callers (including the command runner) must enter from outside the queue.
        // The existing synchronous queue releases through createSyncFileQueue.drain's finally.
        runSerialized(() => {
            try {
                queuedResult = applyPreparedVehicleStateMigrationWriteback(
                    wsPath,
                    prepared,
                    deps
                );
            } catch {
                queuedResult = {
                    outcome: 'write_failed',
                    reasonCode: 'write_failed',
                    backupCreated: false,
                    migrationResult: prepared.migrationResult,
                };
            }
        });
    } catch {
        return {
            outcome: 'write_failed',
            reasonCode: 'write_failed',
            backupCreated: false,
            migrationResult: prepared.migrationResult,
        };
    }
    return queuedResult ?? {
        outcome: 'write_failed',
        reasonCode: 'write_failed',
        backupCreated: false,
        migrationResult: prepared.migrationResult,
    };
}

/** Backup, canonical replacement, reload validation, and cache refresh; caller holds vehicle queue. */
function applyPreparedVehicleStateMigrationWriteback(
    wsPath: string,
    prepared: VehicleStateWritebackResult,
    deps: VehicleStateWritebackHostDeps
): VehicleStateWritebackResult {
    const migrationResult = prepared.migrationResult;
    const migrated = migrationResult?.migrated;
    if (!migrationResult || migrated === undefined) {
        return prepared;
    }

    const now = deps.now ?? (() => new Date());
    const existingTimestamps = listMigrationBackupTimestamps(wsPath, deps);
    const timestamp = allocateMigrationBackupTimestamp(
        formatMigrationBackupTimestamp(now()),
        existingTimestamps
    );
    if (!timestamp) {
        return {
            outcome: 'aborted',
            reasonCode: 'backup_failed',
            backupCreated: false,
            migrationResult,
        };
    }
    const createdAt = now().toISOString();
    const meta = buildMigrationBackupMeta(migrationResult, createdAt);
    if (!meta) {
        return {
            outcome: 'aborted',
            reasonCode: 'not_eligible',
            backupCreated: false,
            migrationResult,
        };
    }

    const sourcePath = resolveWorkspaceRelativePath(wsPath, VEHICLE_STATE_WRITEBACK_FILE);
    const backup = createStrictBackup(wsPath, sourcePath, timestamp, meta, deps);
    if (!backup.ok) {
        return {
            outcome: 'aborted',
            reasonCode: 'backup_failed',
            backupCreated: false,
            migrationResult,
        };
    }

    const writeJson = deps.writeJsonAtomic ?? writeJsonAtomicLocal;
    const parse = deps.parse ?? parseVehicleState;
    const readFile = deps.readFile ?? ((p, enc) => fs.readFileSync(p, enc));
    const exists = deps.exists ?? fs.existsSync.bind(fs);

    try {
        writeJson(sourcePath, migrated);
    } catch {
        return {
            outcome: 'write_failed',
            reasonCode: 'write_failed',
            backupFileRel: backup.backupFileRel,
            metaFileRel: backup.metaFileRel,
            backupCreated: true,
            migrationResult,
        };
    }

    try {
        if (!exists(sourcePath)) {
            throw new Error('missing after write');
        }
        const written = JSON.parse(readFile(sourcePath, 'utf-8'));
        if (!validateMigratedPayload(written, parse)) {
            throw new Error('post-write validation failed');
        }
    } catch {
        return {
            outcome: 'write_failed',
            reasonCode: 'post_write_validation_failed',
            backupFileRel: backup.backupFileRel,
            metaFileRel: backup.metaFileRel,
            backupCreated: true,
            migrationResult,
        };
    }

    const result: VehicleStateWritebackResult = {
        outcome: 'success',
        backupFileRel: backup.backupFileRel,
        metaFileRel: backup.metaFileRel,
        backupCreated: true,
        migrationResult,
    };
    try {
        (deps.clearVehicleStateCache ?? clearVehicleStateCacheDefault)();
    } catch {
        result.cacheRefreshWarning = 'cache_clear_failed_after_commit';
    }
    return result;
}
