// World Intent WI7b: pure migration backup restore helpers (no I/O).

import { probeNumericVersion } from './ledgerMigrationCore';
import {
    isValidMigrationBackupTimestamp,
    MIGRATION_BACKUP_ROOT_REL,
    MIGRATION_BACKUP_META_VERSION,
    VEHICLE_STATE_WRITEBACK_FILE,
    VEHICLE_STATE_WRITEBACK_FROM_VERSION,
    VEHICLE_STATE_WRITEBACK_LEDGER,
    VEHICLE_STATE_WRITEBACK_TO_VERSION,
    type MigrationBackupMeta,
} from './ledgerMigrationWritebackCore';

export const MIGRATION_RESTORE_META_VERSION = 1 as const;
export const MIGRATION_RESTORE_ROOT_REL = '.lorerelay/backups/migration-restores';
export const MIGRATION_RESTORE_BEFORE_FILE = 'vehicle_state.before_restore.json';
export const MIGRATION_RESTORE_META_FILE = 'restore_meta.json';

export type RestoreAbortReason =
    | 'no_workspace'
    | 'no_backups'
    | 'invalid_timestamp'
    | 'missing_backup_file'
    | 'missing_meta_file'
    | 'meta_read_error'
    | 'invalid_meta'
    | 'wrong_ledger'
    | 'wrong_source_file'
    | 'unsupported_version_range'
    | 'backup_read_error'
    | 'backup_parse_error'
    | 'backup_validation_failed'
    | 'future_version_backup'
    | 'pre_restore_backup_failed'
    | 'write_failed'
    | 'post_restore_validation_failed'
    | 'user_cancelled'
    | 'user_dismissed_selection';

export type RestoreOutcome = 'success' | 'aborted' | 'write_failed';

export interface MigrationRestoreMeta {
    version: typeof MIGRATION_RESTORE_META_VERSION;
    createdAt: string;
    ledger: typeof VEHICLE_STATE_WRITEBACK_LEDGER;
    restoredFrom: string;
    targetFile: typeof VEHICLE_STATE_WRITEBACK_FILE;
    currentBackupFile?: string;
    currentFileMissing?: boolean;
}

export interface MigrationBackupCandidate {
    timestamp: string;
    backupDirRel: string;
    backupFileRel: string;
    metaFileRel: string;
    meta: MigrationBackupMeta;
    sortKey: string;
}

export interface PreRestoreBackupPaths {
    restoreDirRel: string;
    beforeFileRel: string;
    metaFileRel: string;
}

export function buildMigrationBackupDirRel(timestamp: string): string | undefined {
    if (!isValidMigrationBackupTimestamp(timestamp)) { return undefined; }
    return `${MIGRATION_BACKUP_ROOT_REL}/${timestamp}`;
}

export function buildPreRestoreBackupPaths(timestamp: string): PreRestoreBackupPaths | undefined {
    if (!isValidMigrationBackupTimestamp(timestamp)) { return undefined; }
    const restoreDirRel = `${MIGRATION_RESTORE_ROOT_REL}/${timestamp}`;
    return {
        restoreDirRel,
        beforeFileRel: `${restoreDirRel}/${MIGRATION_RESTORE_BEFORE_FILE}`,
        metaFileRel: `${restoreDirRel}/${MIGRATION_RESTORE_META_FILE}`,
    };
}

export function parseMigrationBackupMeta(raw: unknown): MigrationBackupMeta | undefined {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) { return undefined; }
    const record = raw as Record<string, unknown>;
    if (record.version !== MIGRATION_BACKUP_META_VERSION) { return undefined; }
    if (typeof record.createdAt !== 'string' || !record.createdAt.trim()) { return undefined; }
    if (record.ledger !== VEHICLE_STATE_WRITEBACK_LEDGER) { return undefined; }
    if (record.sourceFile !== VEHICLE_STATE_WRITEBACK_FILE) { return undefined; }
    if (typeof record.fromVersion !== 'number' || !Number.isInteger(record.fromVersion) || record.fromVersion < 0) {
        return undefined;
    }
    if (typeof record.toVersion !== 'number' || !Number.isInteger(record.toVersion) || record.toVersion < 0) {
        return undefined;
    }
    if (record.fromVersion !== VEHICLE_STATE_WRITEBACK_FROM_VERSION
        || record.toVersion !== VEHICLE_STATE_WRITEBACK_TO_VERSION) {
        return undefined;
    }
    if (!Array.isArray(record.appliedSteps)) { return undefined; }
    const appliedSteps = record.appliedSteps
        .map((step) => {
            if (!step || typeof step !== 'object' || Array.isArray(step)) { return undefined; }
            const s = step as Record<string, unknown>;
            if (typeof s.fromVersion !== 'number' || !Number.isInteger(s.fromVersion) || s.fromVersion < 0) {
                return undefined;
            }
            if (typeof s.toVersion !== 'number' || !Number.isInteger(s.toVersion) || s.toVersion < 0) {
                return undefined;
            }
            return { fromVersion: s.fromVersion, toVersion: s.toVersion };
        })
        .filter((step): step is { fromVersion: number; toVersion: number } => step !== undefined);
    if (appliedSteps.length === 0) { return undefined; }
    return {
        version: MIGRATION_BACKUP_META_VERSION,
        createdAt: record.createdAt.trim(),
        ledger: 'vehicle_state',
        sourceFile: VEHICLE_STATE_WRITEBACK_FILE,
        fromVersion: record.fromVersion,
        toVersion: record.toVersion,
        appliedSteps,
    };
}

export function validateRestoreSourceDocument(raw: unknown): { ok: true } | { ok: false; reason: RestoreAbortReason } {
    const probe = probeNumericVersion(raw, ['version']);
    if (probe.status === 'invalid') {
        return { ok: false, reason: 'backup_validation_failed' };
    }
    if (probe.status === 'valid' && probe.value > VEHICLE_STATE_WRITEBACK_TO_VERSION) {
        return { ok: false, reason: 'future_version_backup' };
    }
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
        return { ok: false, reason: 'backup_validation_failed' };
    }
    const record = raw as Record<string, unknown>;
    if (!Array.isArray(record.vehicles)) {
        return { ok: false, reason: 'backup_validation_failed' };
    }
    return { ok: true };
}

export function sortMigrationBackupCandidates(
    candidates: MigrationBackupCandidate[]
): MigrationBackupCandidate[] {
    return [...candidates].sort((a, b) => b.sortKey.localeCompare(a.sortKey));
}

export function formatMigrationBackupQuickPickLabel(candidate: MigrationBackupCandidate): string {
    return `${candidate.timestamp}  vehicle_state ${candidate.meta.fromVersion} -> ${candidate.meta.toVersion}`;
}

export function buildMigrationRestoreMeta(input: {
    createdAt: string;
    restoredFrom: string;
    currentBackupFile?: string;
    currentFileMissing?: boolean;
}): MigrationRestoreMeta {
    return {
        version: MIGRATION_RESTORE_META_VERSION,
        createdAt: input.createdAt,
        ledger: VEHICLE_STATE_WRITEBACK_LEDGER,
        restoredFrom: input.restoredFrom,
        targetFile: VEHICLE_STATE_WRITEBACK_FILE,
        currentBackupFile: input.currentBackupFile,
        currentFileMissing: input.currentFileMissing,
    };
}

export function documentsSemanticallyEqual(a: unknown, b: unknown): boolean {
    return JSON.stringify(a) === JSON.stringify(b);
}

export interface RestoreReportInput {
    workspaceName?: string;
    outcome: RestoreOutcome;
    reasonCode?: RestoreAbortReason;
    restoredFromRel?: string;
    preRestoreBackupRel?: string;
    preRestoreBackupCreated?: boolean;
}

export function formatRestoreReportLines(input: RestoreReportInput): string[] {
    const lines: string[] = ['--- WI7b migration backup restore ---'];
    if (input.workspaceName) {
        lines.push(`Workspace: ${input.workspaceName}`);
    }
    lines.push(`Ledger: ${VEHICLE_STATE_WRITEBACK_LEDGER}`);

    if (input.outcome === 'success') {
        if (input.restoredFromRel) {
            lines.push(`Restored from: ${input.restoredFromRel}`);
        }
        if (input.preRestoreBackupRel) {
            lines.push(`Pre-restore backup: ${input.preRestoreBackupRel}`);
        }
        lines.push('Result: success');
        return lines;
    }

    if (input.outcome === 'write_failed') {
        lines.push('Result: aborted');
        lines.push(`Reason: ${input.reasonCode ?? 'write_failed'}`);
        if (input.preRestoreBackupCreated && input.preRestoreBackupRel) {
            lines.push('Pre-restore backup was created before the restore attempt.');
            lines.push(`Pre-restore backup: ${input.preRestoreBackupRel}`);
        }
        return lines;
    }

    lines.push('Result: aborted');
    lines.push(`Reason: ${input.reasonCode ?? 'invalid_meta'}`);
    lines.push('No files were changed.');
    return lines;
}