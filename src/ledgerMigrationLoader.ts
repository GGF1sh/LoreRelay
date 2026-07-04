// World Intent WI6b: read-only known ledger loader for migration preview (fs only).

import * as fs from 'fs';
import * as path from 'path';
import {
    migrateLedgerDocument,
    probeNumericVersion,
    type LedgerMigrationIssue,
    type LedgerMigrationLedger,
    type LedgerMigrationResult,
} from './ledgerMigrationCore';
import {
    buildWorkspaceMigrationPreviewReport,
    entryFromMigrationResult,
    KNOWN_WORKSPACE_MIGRATION_LEDGERS,
    makeMissingPreviewEntry,
    makeReadErrorPreviewEntry,
    type KnownWorkspaceMigrationLedger,
    type WorkspaceMigrationPreviewEntry,
    type WorkspaceMigrationPreviewReport,
} from './ledgerMigrationHostCore';
import { migrateVehicleStateDocument } from './vehicleMigrationCore';

export interface LedgerFileReadResult {
    ledger: LedgerMigrationLedger;
    fileName: string;
    relativePath: string;
    missing: boolean;
    readError: boolean;
    raw?: unknown;
}

function resolveLedgerPath(wsPath: string, relativePath: string): string {
    const root = path.resolve(wsPath);
    const resolved = path.resolve(root, relativePath);
    if (resolved !== root && !resolved.startsWith(root + path.sep)) {
        throw new Error('Ledger path escapes workspace root.');
    }
    return resolved;
}

function readLedgerJsonFile(filePath: string): { raw?: unknown; readError: boolean } {
    if (!fs.existsSync(filePath)) {
        return { readError: false };
    }
    try {
        const text = fs.readFileSync(filePath, 'utf-8');
        return { raw: JSON.parse(text), readError: false };
    } catch {
        return { readError: true };
    }
}

export function readKnownLedgerFile(
    wsPath: string,
    spec: KnownWorkspaceMigrationLedger
): LedgerFileReadResult {
    const filePath = resolveLedgerPath(wsPath, spec.relativePath);
    const { raw, readError } = readLedgerJsonFile(filePath);
    if (readError) {
        return {
            ledger: spec.ledger,
            fileName: spec.fileName,
            relativePath: spec.relativePath,
            missing: false,
            readError: true,
        };
    }
    if (raw === undefined) {
        return {
            ledger: spec.ledger,
            fileName: spec.fileName,
            relativePath: spec.relativePath,
            missing: true,
            readError: false,
        };
    }
    return {
        ledger: spec.ledger,
        fileName: spec.fileName,
        relativePath: spec.relativePath,
        missing: false,
        readError: false,
        raw,
    };
}

export function readKnownLedgerFiles(wsPath: string): LedgerFileReadResult[] {
    return KNOWN_WORKSPACE_MIGRATION_LEDGERS.map((spec) => readKnownLedgerFile(wsPath, spec));
}

function previewNonVehicleLedger(
    spec: KnownWorkspaceMigrationLedger,
    raw: unknown
): LedgerMigrationResult {
    const probe = probeNumericVersion(raw, spec.versionFields);
    const base = {
        version: 1 as const,
        ledger: spec.ledger,
        toVersion: spec.targetVersion,
        appliedSteps: [],
        migrated: undefined as unknown,
    };

    if (probe.status === 'invalid') {
        const issues: LedgerMigrationIssue[] = [{
            severity: 'error',
            code: probe.code,
            message: probe.message,
        }];
        return {
            ...base,
            status: 'invalid',
            changed: false,
            issues,
        };
    }

    const fromVersion = probe.status === 'missing' ? 0 : probe.value;
    if (fromVersion > spec.targetVersion) {
        return {
            ...base,
            status: 'unsupported',
            changed: false,
            fromVersion,
            issues: [{
                severity: 'error',
                code: 'unsupported_future_version',
                message: `Ledger version ${fromVersion} is newer than target ${spec.targetVersion}.`,
            }],
        };
    }

    if (fromVersion === spec.targetVersion) {
        return {
            ...base,
            status: 'up_to_date',
            changed: false,
            fromVersion,
            issues: [],
        };
    }

    return migrateLedgerDocument({
        ledger: spec.ledger,
        raw,
        targetVersion: spec.targetVersion,
        steps: [],
        versionFields: spec.versionFields,
        treatMissingVersionAs: 0,
    });
}

function previewLedgerMigration(
    spec: KnownWorkspaceMigrationLedger,
    raw: unknown
): WorkspaceMigrationPreviewEntry {
    const result = spec.ledger === 'vehicle_state'
        ? migrateVehicleStateDocument(raw)
        : previewNonVehicleLedger(spec, raw);
    return entryFromMigrationResult(spec.fileName, result);
}

export function buildWorkspaceMigrationPreview(
    wsPath: string,
    options?: { workspaceName?: string; generatedAt?: string }
): WorkspaceMigrationPreviewReport {
    const entries: WorkspaceMigrationPreviewEntry[] = [];
    for (const spec of KNOWN_WORKSPACE_MIGRATION_LEDGERS) {
        const read = readKnownLedgerFile(wsPath, spec);
        if (read.missing) {
            entries.push(makeMissingPreviewEntry(spec.ledger, spec.fileName, spec.targetVersion));
            continue;
        }
        if (read.readError) {
            entries.push(makeReadErrorPreviewEntry(spec.ledger, spec.fileName, spec.targetVersion));
            continue;
        }
        entries.push(previewLedgerMigration(spec, read.raw));
    }
    return buildWorkspaceMigrationPreviewReport(entries, options);
}