// World Intent WI6b: pure workspace migration preview formatting (no I/O).

import type {
    LedgerMigrationIssue,
    LedgerMigrationLedger,
    LedgerMigrationResult,
    LedgerMigrationStatus,
    LedgerMigrationStepRecord,
} from './ledgerMigrationCore';

export const WORKSPACE_MIGRATION_PREVIEW_VERSION = 1 as const;
export const MAX_MIGRATION_PREVIEW_ISSUE_LINES = 20;
export const MIGRATION_PREVIEW_NO_FILES_CHANGED = 'No files were changed.';

export type WorkspaceMigrationPreviewStatus = LedgerMigrationStatus | 'missing' | 'read_error';

export interface WorkspaceMigrationPreviewIssueSummary {
    severity: 'info' | 'warning' | 'error';
    code: string;
}

export interface WorkspaceMigrationPreviewEntry {
    ledger: LedgerMigrationLedger;
    fileName: string;
    status: WorkspaceMigrationPreviewStatus;
    changed: boolean;
    fromVersion?: number;
    toVersion?: number;
    appliedSteps: LedgerMigrationStepRecord[];
    issueCount: number;
    issues: WorkspaceMigrationPreviewIssueSummary[];
}

export interface WorkspaceMigrationPreviewTotals {
    missing: number;
    upToDate: number;
    migratable: number;
    blocked: number;
    invalid: number;
    unsupported: number;
    readError: number;
}

export interface WorkspaceMigrationPreviewReport {
    version: typeof WORKSPACE_MIGRATION_PREVIEW_VERSION;
    generatedAt: string;
    workspaceName?: string;
    entries: WorkspaceMigrationPreviewEntry[];
    totals: WorkspaceMigrationPreviewTotals;
}

export interface KnownWorkspaceMigrationLedger {
    ledger: LedgerMigrationLedger;
    fileName: string;
    relativePath: string;
    versionFields: readonly string[];
    targetVersion: number;
}

export const KNOWN_WORKSPACE_MIGRATION_LEDGERS: readonly KnownWorkspaceMigrationLedger[] = [
    {
        ledger: 'vehicle_state',
        fileName: 'vehicle_state.json',
        relativePath: 'vehicle_state.json',
        versionFields: ['version'],
        targetVersion: 1,
    },
    {
        ledger: 'settlement_state',
        fileName: 'settlement_state.json',
        relativePath: 'settlement_state.json',
        versionFields: ['version'],
        targetVersion: 1,
    },
    {
        ledger: 'settlement_layout',
        fileName: 'settlement_layout.json',
        relativePath: 'settlement_layout.json',
        versionFields: ['version'],
        targetVersion: 1,
    },
    {
        ledger: 'campaign_resources',
        fileName: 'campaign_resources.json',
        relativePath: 'campaign_resources.json',
        versionFields: ['version'],
        targetVersion: 1,
    },
    {
        ledger: 'discoveries',
        fileName: 'discoveries.json',
        relativePath: 'discoveries.json',
        versionFields: ['version'],
        targetVersion: 1,
    },
    {
        ledger: 'world_state',
        fileName: 'world_state.json',
        relativePath: 'world_state.json',
        versionFields: ['version'],
        targetVersion: 1,
    },
    {
        ledger: 'npc_registry',
        fileName: 'npc_registry.json',
        relativePath: 'npc_registry.json',
        versionFields: ['version'],
        targetVersion: 1,
    },
    {
        ledger: 'mod_profile',
        fileName: '.lorerelay/mod_profile.json',
        relativePath: '.lorerelay/mod_profile.json',
        versionFields: ['profileVersion', 'version'],
        targetVersion: 1,
    },
];

function summarizeIssues(issues: LedgerMigrationIssue[]): WorkspaceMigrationPreviewIssueSummary[] {
    return issues.map((issue) => ({
        severity: issue.severity,
        code: issue.code,
    }));
}

export function entryFromMigrationResult(
    fileName: string,
    result: LedgerMigrationResult
): WorkspaceMigrationPreviewEntry {
    const issues = summarizeIssues(result.issues);
    return {
        ledger: result.ledger,
        fileName,
        status: result.status,
        changed: result.changed,
        fromVersion: result.fromVersion,
        toVersion: result.toVersion,
        appliedSteps: result.appliedSteps,
        issueCount: issues.length,
        issues,
    };
}

export function makeMissingPreviewEntry(
    ledger: LedgerMigrationLedger,
    fileName: string,
    targetVersion: number
): WorkspaceMigrationPreviewEntry {
    return {
        ledger,
        fileName,
        status: 'missing',
        changed: false,
        toVersion: targetVersion,
        appliedSteps: [],
        issueCount: 0,
        issues: [],
    };
}

export function makeReadErrorPreviewEntry(
    ledger: LedgerMigrationLedger,
    fileName: string,
    targetVersion: number
): WorkspaceMigrationPreviewEntry {
    return {
        ledger,
        fileName,
        status: 'read_error',
        changed: false,
        toVersion: targetVersion,
        appliedSteps: [],
        issueCount: 1,
        issues: [{ severity: 'error', code: 'read_error' }],
    };
}

export function computeWorkspaceMigrationPreviewTotals(
    entries: WorkspaceMigrationPreviewEntry[]
): WorkspaceMigrationPreviewTotals {
    const totals: WorkspaceMigrationPreviewTotals = {
        missing: 0,
        upToDate: 0,
        migratable: 0,
        blocked: 0,
        invalid: 0,
        unsupported: 0,
        readError: 0,
    };
    for (const entry of entries) {
        switch (entry.status) {
            case 'missing':
                totals.missing++;
                break;
            case 'up_to_date':
                totals.upToDate++;
                break;
            case 'migrated':
                totals.migratable++;
                break;
            case 'blocked':
                totals.blocked++;
                break;
            case 'invalid':
                totals.invalid++;
                break;
            case 'unsupported':
                totals.unsupported++;
                break;
            case 'read_error':
                totals.readError++;
                break;
            default:
                break;
        }
    }
    return totals;
}

export function buildWorkspaceMigrationPreviewReport(
    entries: WorkspaceMigrationPreviewEntry[],
    options?: { workspaceName?: string; generatedAt?: string }
): WorkspaceMigrationPreviewReport {
    return {
        version: WORKSPACE_MIGRATION_PREVIEW_VERSION,
        generatedAt: options?.generatedAt ?? new Date(0).toISOString(),
        workspaceName: options?.workspaceName,
        entries,
        totals: computeWorkspaceMigrationPreviewTotals(entries),
    };
}

function displayStatus(status: WorkspaceMigrationPreviewStatus): string {
    return status === 'migrated' ? 'migratable' : status;
}

function formatVersionSegment(entry: WorkspaceMigrationPreviewEntry): string {
    if (entry.status === 'migrated' && entry.fromVersion !== undefined) {
        return `${entry.fromVersion} -> ${entry.toVersion}`;
    }
    if (entry.status === 'up_to_date' && entry.fromVersion !== undefined) {
        return String(entry.fromVersion);
    }
    if (entry.fromVersion !== undefined && entry.status !== 'missing' && entry.status !== 'read_error') {
        return String(entry.fromVersion);
    }
    return '';
}

function formatStepsSegment(entry: WorkspaceMigrationPreviewEntry): string {
    if (!entry.appliedSteps.length) { return ''; }
    const steps = entry.appliedSteps.map((step) => `${step.fromVersion}->${step.toVersion}`).join(',');
    return `steps: ${steps}`;
}

export function formatWorkspaceMigrationPreviewEntryLine(entry: WorkspaceMigrationPreviewEntry): string {
    const fileCol = entry.fileName.padEnd(28);
    const statusCol = displayStatus(entry.status).padEnd(12);
    const versionCol = formatVersionSegment(entry);
    const stepsCol = formatStepsSegment(entry);
    return `${fileCol}${statusCol}${versionCol}${stepsCol ? `   ${stepsCol}` : ''}`.trimEnd();
}

export function formatWorkspaceMigrationPreviewLines(
    report: WorkspaceMigrationPreviewReport
): string[] {
    const lines: string[] = ['LoreRelay Workspace Migration Preview'];
    if (report.workspaceName) {
        lines.push(`Workspace: ${report.workspaceName}`);
    }
    lines.push('');
    for (const entry of report.entries) {
        lines.push(formatWorkspaceMigrationPreviewEntryLine(entry));
    }
    lines.push('');

    let issueLines = 0;
    for (const entry of report.entries) {
        for (const issue of entry.issues) {
            if (issueLines >= MAX_MIGRATION_PREVIEW_ISSUE_LINES) { break; }
            lines.push(`${entry.ledger} ${issue.severity} ${issue.code}`);
            issueLines++;
        }
        if (issueLines >= MAX_MIGRATION_PREVIEW_ISSUE_LINES) { break; }
    }

    if (issueLines > 0) {
        lines.push('');
    }
    lines.push(MIGRATION_PREVIEW_NO_FILES_CHANGED);
    return lines;
}