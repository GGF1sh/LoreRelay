// World Intent WI6: pure per-ledger migration planner (dry-run, no I/O).

export const LEDGER_MIGRATION_REPORT_VERSION = 1 as const;
export const MAX_LEDGER_MIGRATION_ISSUES = 32;
export const MAX_LEDGER_MIGRATION_MESSAGE_CHARS = 240;

export type LedgerMigrationLedger =
    | 'vehicle_state'
    | 'settlement_state'
    | 'settlement_layout'
    | 'campaign_resources'
    | 'discoveries'
    | 'world_state'
    | 'npc_registry'
    | 'mod_profile';

export type LedgerMigrationStatus =
    | 'up_to_date'
    | 'migrated'
    | 'blocked'
    | 'unsupported'
    | 'invalid';

export type LedgerMigrationSeverity = 'info' | 'warning' | 'error';

export interface LedgerMigrationIssue {
    severity: LedgerMigrationSeverity;
    code: string;
    message: string;
}

export interface LedgerMigrationStepRecord {
    fromVersion: number;
    toVersion: number;
}

export interface LedgerMigrationResult {
    version: typeof LEDGER_MIGRATION_REPORT_VERSION;
    ledger: LedgerMigrationLedger;
    status: LedgerMigrationStatus;
    changed: boolean;
    fromVersion?: number;
    toVersion: number;
    appliedSteps: LedgerMigrationStepRecord[];
    issues: LedgerMigrationIssue[];
    migrated?: unknown;
}

export interface LedgerMigrationStep {
    ledger: LedgerMigrationLedger;
    fromVersion: number;
    toVersion: number;
    migrate(raw: unknown): unknown;
}

export interface MigrateLedgerDocumentInput {
    ledger: LedgerMigrationLedger;
    raw: unknown;
    targetVersion: number;
    steps: readonly LedgerMigrationStep[];
    getVersion?: (raw: unknown) => number | undefined;
    versionFields?: readonly string[];
    treatMissingVersionAs?: number;
    validate?: (raw: unknown) => boolean;
}

export type NumericVersionProbe =
    | { status: 'missing' }
    | { status: 'valid'; value: number }
    | { status: 'invalid'; code: string; message: string };

function clampMessage(raw: string): string {
    const t = raw.trim().replace(/\s+/g, ' ');
    return t.length <= MAX_LEDGER_MIGRATION_MESSAGE_CHARS
        ? t
        : `${t.slice(0, MAX_LEDGER_MIGRATION_MESSAGE_CHARS - 3)}...`;
}

function makeIssue(
    severity: LedgerMigrationSeverity,
    code: string,
    message: string
): LedgerMigrationIssue {
    return { severity, code, message: clampMessage(message) };
}

function cloneRaw(raw: unknown): unknown {
    if (raw === undefined) { return undefined; }
    return JSON.parse(JSON.stringify(raw));
}

function deepEqual(a: unknown, b: unknown): boolean {
    return JSON.stringify(a) === JSON.stringify(b);
}

export function probeNumericVersion(
    raw: unknown,
    fields: readonly string[] = ['version', 'schemaVersion']
): NumericVersionProbe {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
        return { status: 'missing' };
    }
    const record = raw as Record<string, unknown>;
    let sawField = false;
    for (const field of fields) {
        if (!(field in record)) { continue; }
        sawField = true;
        const value = record[field];
        if (typeof value !== 'number' || !Number.isFinite(value) || !Number.isInteger(value)) {
            return {
                status: 'invalid',
                code: 'non_integer_version',
                message: `Ledger version field "${field}" must be a non-negative integer.`,
            };
        }
        if (value < 0) {
            return {
                status: 'invalid',
                code: 'negative_version',
                message: `Ledger version field "${field}" cannot be negative.`,
            };
        }
        return { status: 'valid', value };
    }
    return sawField ? { status: 'missing' } : { status: 'missing' };
}

export function getNumericVersion(
    raw: unknown,
    fields: readonly string[] = ['version', 'schemaVersion']
): number | undefined {
    const probe = probeNumericVersion(raw, fields);
    return probe.status === 'valid' ? probe.value : undefined;
}

function resolveFromVersion(
    input: MigrateLedgerDocumentInput,
    issues: LedgerMigrationIssue[]
): number | undefined {
    if (input.getVersion) {
        const custom = input.getVersion(input.raw);
        if (custom !== undefined) {
            if (!Number.isInteger(custom) || custom < 0) {
                issues.push(makeIssue('error', 'invalid_version', 'Custom version resolver returned an invalid version.'));
                return undefined;
            }
            return custom;
        }
    }

    const probe = probeNumericVersion(input.raw, input.versionFields ?? ['version', 'schemaVersion']);
    if (probe.status === 'invalid') {
        issues.push(makeIssue('error', probe.code, probe.message));
        return undefined;
    }
    if (probe.status === 'missing') {
        if (input.treatMissingVersionAs !== undefined) {
            return input.treatMissingVersionAs;
        }
        issues.push(makeIssue('error', 'missing_version', 'Ledger version is missing and no default was configured.'));
        return undefined;
    }
    return probe.value;
}

function findStep(
    steps: readonly LedgerMigrationStep[],
    ledger: LedgerMigrationLedger,
    fromVersion: number,
    toVersion: number
): LedgerMigrationStep | undefined {
    return steps.find(
        (step) => step.ledger === ledger
            && step.fromVersion === fromVersion
            && step.toVersion === toVersion
    );
}

function baseResult(
    input: MigrateLedgerDocumentInput,
    partial: Pick<LedgerMigrationResult, 'status' | 'changed' | 'issues' | 'appliedSteps' | 'fromVersion' | 'migrated'>
): LedgerMigrationResult {
    return {
        version: LEDGER_MIGRATION_REPORT_VERSION,
        ledger: input.ledger,
        toVersion: input.targetVersion,
        appliedSteps: partial.appliedSteps,
        issues: partial.issues.slice(0, MAX_LEDGER_MIGRATION_ISSUES),
        status: partial.status,
        changed: partial.changed,
        fromVersion: partial.fromVersion,
        migrated: partial.migrated,
    };
}

export function migrateLedgerDocument(input: MigrateLedgerDocumentInput): LedgerMigrationResult {
    const issues: LedgerMigrationIssue[] = [];
    const fromVersion = resolveFromVersion(input, issues);
    if (fromVersion === undefined) {
        return baseResult(input, {
            status: 'invalid',
            changed: false,
            issues,
            appliedSteps: [],
            migrated: undefined,
        });
    }

    if (fromVersion > input.targetVersion) {
        issues.push(makeIssue(
            'error',
            'unsupported_future_version',
            `Ledger version ${fromVersion} is newer than target ${input.targetVersion}.`
        ));
        return baseResult(input, {
            status: 'unsupported',
            changed: false,
            issues,
            appliedSteps: [],
            fromVersion,
            migrated: undefined,
        });
    }

    if (fromVersion === input.targetVersion) {
        const current = cloneRaw(input.raw);
        if (input.validate && !input.validate(current)) {
            issues.push(makeIssue('error', 'validation_failed', 'Ledger document failed validation at target version.'));
            return baseResult(input, {
                status: 'invalid',
                changed: false,
                issues,
                appliedSteps: [],
                fromVersion,
                migrated: current,
            });
        }
        return baseResult(input, {
            status: 'up_to_date',
            changed: false,
            issues,
            appliedSteps: [],
            fromVersion,
            migrated: current,
        });
    }

    let current = cloneRaw(input.raw);
    const appliedSteps: LedgerMigrationStepRecord[] = [];
    let version = fromVersion;

    while (version < input.targetVersion) {
        const nextVersion = version + 1;
        const step = findStep(input.steps, input.ledger, version, nextVersion);
        if (!step) {
            issues.push(makeIssue(
                'error',
                'missing_migration_step',
                `No migration step registered for ${input.ledger} ${version} -> ${nextVersion}.`
            ));
            return baseResult(input, {
                status: 'blocked',
                changed: appliedSteps.length > 0,
                issues,
                appliedSteps,
                fromVersion,
                migrated: current,
            });
        }
        current = step.migrate(current);
        appliedSteps.push({ fromVersion: version, toVersion: nextVersion });
        version = nextVersion;
    }

    const changed = appliedSteps.length > 0 && !deepEqual(input.raw, current);
    if (input.validate && !input.validate(current)) {
        issues.push(makeIssue('error', 'validation_failed', 'Migrated ledger document failed validation.'));
        return baseResult(input, {
            status: 'invalid',
            changed,
            issues,
            appliedSteps,
            fromVersion,
            migrated: current,
        });
    }

    return baseResult(input, {
        status: changed ? 'migrated' : 'up_to_date',
        changed,
        issues,
        appliedSteps,
        fromVersion,
        migrated: current,
    });
}