// World Intent WI7: pure vehicle_state write-back eligibility and reporting (no I/O).

import type {
    LedgerMigrationLedger,
    LedgerMigrationResult,
    LedgerMigrationStepRecord,
} from './ledgerMigrationCore';

export const MIGRATION_BACKUP_META_VERSION = 1 as const;
export const VEHICLE_STATE_WRITEBACK_LEDGER: LedgerMigrationLedger = 'vehicle_state';
export const VEHICLE_STATE_WRITEBACK_FILE = 'vehicle_state.json';
export const VEHICLE_STATE_WRITEBACK_FROM_VERSION = 0;
export const VEHICLE_STATE_WRITEBACK_TO_VERSION = 1;
export const MIGRATION_BACKUP_ROOT_REL = '.lorerelay/backups/migrations';

export type WritebackAbortReason =
    | 'missing_file'
    | 'read_error'
    | 'not_eligible'
    | 'wrong_ledger'
    | 'wrong_status'
    | 'wrong_version_range'
    | 'missing_migrated_payload'
    | 'validation_failed'
    | 'backup_failed'
    | 'write_failed'
    | 'post_write_validation_failed'
    | 'user_cancelled'
    | 'no_workspace';

export type WritebackOutcome = 'success' | 'aborted' | 'write_failed';

export interface MigrationBackupMeta {
    version: typeof MIGRATION_BACKUP_META_VERSION;
    createdAt: string;
    ledger: typeof VEHICLE_STATE_WRITEBACK_LEDGER;
    sourceFile: typeof VEHICLE_STATE_WRITEBACK_FILE;
    fromVersion: number;
    toVersion: number;
    appliedSteps: LedgerMigrationStepRecord[];
}

export interface WritebackEligibility {
    eligible: boolean;
    reasonCode?: WritebackAbortReason;
}

export interface MigrationBackupPaths {
    backupDirRel: string;
    backupFileRel: string;
    metaFileRel: string;
}

/** Compact UTC with optional milliseconds and collision suffix (_01.._99). */
const BACKUP_TIMESTAMP_RE = /^[0-9]{8}T[0-9]{6}(?:\.[0-9]{3})?Z(?:_\d{2})?$/;

export function formatMigrationBackupTimestamp(date: Date): string {
    return date.toISOString().replace(/[-:]/g, '');
}

export function isValidMigrationBackupTimestamp(timestamp: string): boolean {
    return BACKUP_TIMESTAMP_RE.test(timestamp);
}

/** Pick a backup dir name that does not collide with existing migration backups. */
export function allocateMigrationBackupTimestamp(
    baseTimestamp: string,
    existingTimestamps: Iterable<string>
): string | undefined {
    if (!isValidMigrationBackupTimestamp(baseTimestamp)) { return undefined; }
    const existing = new Set(existingTimestamps);
    if (!existing.has(baseTimestamp)) { return baseTimestamp; }
    const root = baseTimestamp.replace(/_\d{2}$/, '');
    for (let i = 1; i <= 99; i++) {
        const candidate = `${root}_${String(i).padStart(2, '0')}`;
        if (isValidMigrationBackupTimestamp(candidate) && !existing.has(candidate)) {
            return candidate;
        }
    }
    return undefined;
}

export function buildMigrationBackupPaths(timestamp: string): MigrationBackupPaths | undefined {
    if (!isValidMigrationBackupTimestamp(timestamp)) { return undefined; }
    const backupDirRel = `${MIGRATION_BACKUP_ROOT_REL}/${timestamp}`;
    return {
        backupDirRel,
        backupFileRel: `${backupDirRel}/${VEHICLE_STATE_WRITEBACK_FILE}`,
        metaFileRel: `${backupDirRel}/migration_meta.json`,
    };
}

export function assessVehicleStateWritebackEligibility(result: LedgerMigrationResult): WritebackEligibility {
    if (result.ledger !== VEHICLE_STATE_WRITEBACK_LEDGER) {
        return { eligible: false, reasonCode: 'wrong_ledger' };
    }
    if (result.status !== 'migrated') {
        return {
            eligible: false,
            reasonCode: result.status === 'up_to_date' ? 'not_eligible' : 'wrong_status',
        };
    }
    if (!result.changed) {
        return { eligible: false, reasonCode: 'not_eligible' };
    }
    if (result.fromVersion !== VEHICLE_STATE_WRITEBACK_FROM_VERSION
        || result.toVersion !== VEHICLE_STATE_WRITEBACK_TO_VERSION) {
        return { eligible: false, reasonCode: 'wrong_version_range' };
    }
    if (result.migrated === undefined) {
        return { eligible: false, reasonCode: 'missing_migrated_payload' };
    }
    return { eligible: true };
}

export function buildMigrationBackupMeta(
    result: LedgerMigrationResult,
    createdAt: string
): MigrationBackupMeta | undefined {
    const eligibility = assessVehicleStateWritebackEligibility(result);
    if (!eligibility.eligible) { return undefined; }
    return {
        version: MIGRATION_BACKUP_META_VERSION,
        createdAt,
        ledger: 'vehicle_state',
        sourceFile: VEHICLE_STATE_WRITEBACK_FILE,
        fromVersion: VEHICLE_STATE_WRITEBACK_FROM_VERSION,
        toVersion: VEHICLE_STATE_WRITEBACK_TO_VERSION,
        appliedSteps: result.appliedSteps.map((step) => ({
            fromVersion: step.fromVersion,
            toVersion: step.toVersion,
        })),
    };
}

export interface WritebackReportInput {
    workspaceName?: string;
    outcome: WritebackOutcome;
    reasonCode?: WritebackAbortReason;
    backupFileRel?: string;
    backupCreated?: boolean;
}

export function formatWritebackReportLines(input: WritebackReportInput): string[] {
    const lines: string[] = ['--- WI7 migration write-back ---'];
    if (input.workspaceName) {
        lines.push(`Workspace: ${input.workspaceName}`);
    }
    lines.push(`Ledger: ${VEHICLE_STATE_WRITEBACK_LEDGER}`);
    lines.push(`File: ${VEHICLE_STATE_WRITEBACK_FILE}`);
    lines.push(`Migration: ${VEHICLE_STATE_WRITEBACK_FROM_VERSION} -> ${VEHICLE_STATE_WRITEBACK_TO_VERSION}`);

    if (input.outcome === 'success') {
        if (input.backupFileRel) {
            lines.push(`Backup: ${input.backupFileRel}`);
        }
        lines.push('Result: success');
        return lines;
    }

    if (input.outcome === 'write_failed') {
        lines.push('Result: aborted');
        lines.push(`Reason: ${input.reasonCode ?? 'write_failed'}`);
        if (input.backupCreated) {
            lines.push('Backup was created before the write attempt.');
            if (input.backupFileRel) {
                lines.push(`Backup: ${input.backupFileRel}`);
            }
        }
        return lines;
    }

    lines.push('Result: aborted');
    lines.push(`Reason: ${input.reasonCode ?? 'not_eligible'}`);
    lines.push('No files were changed.');
    return lines;
}