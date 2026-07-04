// Game QA Runner QA1: pure scenario parsing, mode filtering, report helpers, and safe path planning.
// No vscode, no LLM, no shell execution from scenario JSON.

import * as crypto from 'crypto';
import * as path from 'path';

export const GAME_QA_REPORT_SCHEMA_VERSION = 1 as const;
export const GAME_QA_SCENARIO_VERSION = 1 as const;
export const DEFAULT_GAME_QA_TEMP_ROOT = '.tmp/game_qa';

export const QA_RUN_MODES = ['quick', 'full', 'benchmark'] as const;
export type QaRunMode = (typeof QA_RUN_MODES)[number];

export const QA_STEP_TYPES = [
    'assert',
    'world_sim',
    'workspace_sanity',
    'state_orchestrator_plan',
    'snapshot',
] as const;
export type QaStepType = (typeof QA_STEP_TYPES)[number];

export const QA_CHECK_IDS = [
    'game_state_valid',
    'world_state_valid',
    'game_rules_valid',
    'workspace_sanity_ok',
    'transaction_plan_valid',
    'file_sizes_below_limit',
    'no_unhandled_exception',
    'no_json_parse_error',
] as const;
export type QaCheckId = (typeof QA_CHECK_IDS)[number];

export type QaFailureClass =
    | 'scenario_invalid'
    | 'setup_failed'
    | 'step_failed'
    | 'assert_failed'
    | 'timeout'
    | 'internal_error';

export type QaWorkspaceSource =
    | { source: 'empty' }
    | { source: 'sample'; sampleId: string }
    | { source: 'fixture'; fixturePath: string };

export interface QaScenarioLimits {
    timeoutMs?: number;
    maxSteps?: number;
    maxFileBytes?: number;
    maxReportEvents?: number;
}

export interface QaAssertStep {
    id: string;
    type: 'assert';
    checks: QaCheckId[];
}

export interface QaWorldSimStep {
    id: string;
    type: 'world_sim';
    steps: number;
    assertAfter?: QaCheckId[];
}

export interface QaWorkspaceSanityStep {
    id: string;
    type: 'workspace_sanity';
    assertAfter?: QaCheckId[];
}

export interface QaStateOrchestratorPlanStep {
    id: string;
    type: 'state_orchestrator_plan';
    turnResultFixture: string;
    assertAfter?: QaCheckId[];
}

export interface QaSnapshotStep {
    id: string;
    type: 'snapshot';
    label?: string;
}

export type QaStep =
    | QaAssertStep
    | QaWorldSimStep
    | QaWorkspaceSanityStep
    | QaStateOrchestratorPlanStep
    | QaSnapshotStep;

export interface QaScenarioDefinition {
    id: string;
    version: number;
    description: string;
    mode: QaRunMode;
    /** Optional extra run modes (e.g. quick + benchmark). Falls back to [mode]. */
    modes?: QaRunMode[];
    workspace: QaWorkspaceSource;
    limits?: QaScenarioLimits;
    steps: QaStep[];
}

export interface QaCheckResult {
    id: QaCheckId;
    ok: boolean;
    message?: string;
}

export interface QaStepReport {
    id: string;
    type: QaStepType;
    ok: boolean;
    durationMs: number;
    checks: QaCheckResult[];
    error?: string;
    failureClass?: QaFailureClass;
}

export interface QaRunSummary {
    steps: number;
    passedChecks: number;
    failedChecks: number;
    warnings: number;
}

export interface QaRunReport {
    schemaVersion: typeof GAME_QA_REPORT_SCHEMA_VERSION;
    runId: string;
    scenarioId: string;
    mode: QaRunMode;
    startedAt: string;
    finishedAt: string;
    ok: boolean;
    failureClass?: QaFailureClass;
    summary: QaRunSummary;
    steps: QaStepReport[];
    metrics: {
        fileBytes: Record<string, number>;
    };
}

export interface QaRunDirectoryPlan {
    qaTempRoot: string;
    scenarioDir: string;
    runDir: string;
    workspaceDir: string;
    reportJsonPath: string;
    reportMdPath: string;
    runId: string;
}

export type ParseQaScenarioResult =
    | { ok: true; scenario: QaScenarioDefinition }
    | { ok: false; errors: string[] };

function isNonEmptyString(value: unknown): value is string {
    return typeof value === 'string' && value.trim().length > 0;
}

function isQaRunMode(value: unknown): value is QaRunMode {
    return typeof value === 'string' && (QA_RUN_MODES as readonly string[]).includes(value);
}

function isQaCheckId(value: unknown): value is QaCheckId {
    return typeof value === 'string' && (QA_CHECK_IDS as readonly string[]).includes(value);
}

function parseCheckList(raw: unknown, field: string, errors: string[]): QaCheckId[] | undefined {
    if (raw === undefined) {
        return undefined;
    }
    if (!Array.isArray(raw)) {
        errors.push(`${field} must be an array`);
        return undefined;
    }
    const checks: QaCheckId[] = [];
    for (let i = 0; i < raw.length; i++) {
        const item = raw[i];
        if (!isQaCheckId(item)) {
            errors.push(`${field}[${i}] is not a supported check id`);
            continue;
        }
        checks.push(item);
    }
    return checks;
}

function parseWorkspace(raw: unknown, errors: string[]): QaWorkspaceSource | undefined {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
        errors.push('workspace must be an object');
        return undefined;
    }
    const doc = raw as Record<string, unknown>;
    const source = doc.source;
    if (source === 'empty') {
        return { source: 'empty' };
    }
    if (source === 'sample') {
        if (!isNonEmptyString(doc.sampleId)) {
            errors.push('workspace.sampleId is required for source:sample');
            return undefined;
        }
        return { source: 'sample', sampleId: doc.sampleId.trim() };
    }
    if (source === 'fixture') {
        if (!isNonEmptyString(doc.fixturePath)) {
            errors.push('workspace.fixturePath is required for source:fixture');
            return undefined;
        }
        return { source: 'fixture', fixturePath: doc.fixturePath.trim() };
    }
    errors.push('workspace.source must be empty, sample, or fixture');
    return undefined;
}

function parseStep(raw: unknown, index: number, errors: string[]): QaStep | undefined {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
        errors.push(`steps[${index}] must be an object`);
        return undefined;
    }
    const doc = raw as Record<string, unknown>;
    if (!isNonEmptyString(doc.id)) {
        errors.push(`steps[${index}].id is required`);
        return undefined;
    }
    const type = doc.type;
    if (!isNonEmptyString(type) || !(QA_STEP_TYPES as readonly string[]).includes(type)) {
        errors.push(`steps[${index}].type is not a supported QA1 step type`);
        return undefined;
    }

    switch (type) {
        case 'assert': {
            const checks = parseCheckList(doc.checks, `steps[${index}].checks`, errors);
            if (!checks || checks.length === 0) {
                errors.push(`steps[${index}].checks must include at least one check`);
                return undefined;
            }
            return { id: doc.id.trim(), type: 'assert', checks };
        }
        case 'world_sim': {
            const steps = doc.steps;
            if (typeof steps !== 'number' || !Number.isFinite(steps) || steps < 1) {
                errors.push(`steps[${index}].steps must be a positive number`);
                return undefined;
            }
            return {
                id: doc.id.trim(),
                type: 'world_sim',
                steps: Math.floor(steps),
                assertAfter: parseCheckList(doc.assertAfter, `steps[${index}].assertAfter`, errors),
            };
        }
        case 'workspace_sanity': {
            return {
                id: doc.id.trim(),
                type: 'workspace_sanity',
                assertAfter: parseCheckList(doc.assertAfter, `steps[${index}].assertAfter`, errors),
            };
        }
        case 'state_orchestrator_plan': {
            if (!isNonEmptyString(doc.turnResultFixture)) {
                errors.push(`steps[${index}].turnResultFixture is required`);
                return undefined;
            }
            return {
                id: doc.id.trim(),
                type: 'state_orchestrator_plan',
                turnResultFixture: doc.turnResultFixture.trim(),
                assertAfter: parseCheckList(doc.assertAfter, `steps[${index}].assertAfter`, errors),
            };
        }
        case 'snapshot': {
            return {
                id: doc.id.trim(),
                type: 'snapshot',
                label: isNonEmptyString(doc.label) ? doc.label.trim() : undefined,
            };
        }
        default:
            errors.push(`steps[${index}].type is unsupported`);
            return undefined;
    }
}

/** Parse and validate a scenario JSON document. */
export function parseQaScenarioDocument(raw: unknown): ParseQaScenarioResult {
    const errors: string[] = [];
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
        return { ok: false, errors: ['scenario root must be an object'] };
    }
    const doc = raw as Record<string, unknown>;

    if (!isNonEmptyString(doc.id)) {
        errors.push('id is required');
    }
    if (doc.version !== GAME_QA_SCENARIO_VERSION) {
        errors.push(`version must be ${GAME_QA_SCENARIO_VERSION}`);
    }
    if (!isNonEmptyString(doc.description)) {
        errors.push('description is required');
    }
    if (!isQaRunMode(doc.mode)) {
        errors.push('mode must be quick, full, or benchmark');
    }

    const workspace = parseWorkspace(doc.workspace, errors);
    const stepsRaw = doc.steps;
    const steps: QaStep[] = [];
    if (!Array.isArray(stepsRaw) || stepsRaw.length === 0) {
        errors.push('steps must be a non-empty array');
    } else {
        const maxSteps = typeof doc.limits === 'object' && doc.limits !== null
            ? (doc.limits as QaScenarioLimits).maxSteps
            : undefined;
        if (typeof maxSteps === 'number' && stepsRaw.length > maxSteps) {
            errors.push(`steps length ${stepsRaw.length} exceeds limits.maxSteps ${maxSteps}`);
        }
        for (let i = 0; i < stepsRaw.length; i++) {
            const step = parseStep(stepsRaw[i], i, errors);
            if (step) {
                steps.push(step);
            }
        }
    }

    const modesRaw = doc.modes;
    let modes: QaRunMode[] | undefined;
    if (modesRaw !== undefined) {
        if (!Array.isArray(modesRaw)) {
            errors.push('modes must be an array when provided');
        } else {
            modes = [];
            for (let i = 0; i < modesRaw.length; i++) {
                if (!isQaRunMode(modesRaw[i])) {
                    errors.push(`modes[${i}] is not a supported run mode`);
                } else {
                    modes.push(modesRaw[i]);
                }
            }
        }
    }

    let limits: QaScenarioLimits | undefined;
    if (doc.limits !== undefined) {
        if (!doc.limits || typeof doc.limits !== 'object' || Array.isArray(doc.limits)) {
            errors.push('limits must be an object when provided');
        } else {
            const lim = doc.limits as Record<string, unknown>;
            limits = {};
            if (lim.timeoutMs !== undefined) {
                if (typeof lim.timeoutMs !== 'number' || lim.timeoutMs < 1) {
                    errors.push('limits.timeoutMs must be a positive number');
                } else {
                    limits.timeoutMs = Math.floor(lim.timeoutMs);
                }
            }
            if (lim.maxSteps !== undefined) {
                if (typeof lim.maxSteps !== 'number' || lim.maxSteps < 1) {
                    errors.push('limits.maxSteps must be a positive number');
                } else {
                    limits.maxSteps = Math.floor(lim.maxSteps);
                }
            }
            if (lim.maxFileBytes !== undefined) {
                if (typeof lim.maxFileBytes !== 'number' || lim.maxFileBytes < 1) {
                    errors.push('limits.maxFileBytes must be a positive number');
                } else {
                    limits.maxFileBytes = Math.floor(lim.maxFileBytes);
                }
            }
            if (lim.maxReportEvents !== undefined) {
                if (typeof lim.maxReportEvents !== 'number' || lim.maxReportEvents < 1) {
                    errors.push('limits.maxReportEvents must be a positive number');
                } else {
                    limits.maxReportEvents = Math.floor(lim.maxReportEvents);
                }
            }
        }
    }

    const scenarioId = isNonEmptyString(doc.id) ? doc.id.trim() : '';
    const scenarioDescription = isNonEmptyString(doc.description) ? doc.description.trim() : '';
    if (errors.length > 0 || !scenarioId || !scenarioDescription || !isQaRunMode(doc.mode) || !workspace || steps.length === 0) {
        return { ok: false, errors };
    }

    return {
        ok: true,
        scenario: {
            id: scenarioId,
            version: GAME_QA_SCENARIO_VERSION,
            description: scenarioDescription,
            mode: doc.mode,
            modes,
            workspace,
            limits,
            steps,
        },
    };
}

/** Return the run modes a scenario participates in. */
export function resolveScenarioRunModes(scenario: QaScenarioDefinition): QaRunMode[] {
    if (scenario.modes && scenario.modes.length > 0) {
        return [...new Set(scenario.modes)];
    }
    return [scenario.mode];
}

/** Filter scenarios for a requested CLI run mode. */
export function filterScenariosByRunMode(
    scenarios: QaScenarioDefinition[],
    requestedMode: QaRunMode
): QaScenarioDefinition[] {
    return scenarios.filter((scenario) => {
        const modes = resolveScenarioRunModes(scenario);
        if (requestedMode === 'quick') {
            return modes.includes('quick');
        }
        if (requestedMode === 'full') {
            return modes.includes('quick') || modes.includes('full');
        }
        return modes.includes('benchmark');
    });
}

/** Build a short random suffix for run directories. */
export function createQaRunSuffix(): string {
    return crypto.randomBytes(3).toString('hex');
}

/** Format run id: qa_YYYYMMDD_HHMMSS_abc123 */
export function formatQaRunId(now: Date, suffix: string): string {
    const pad = (n: number) => String(n).padStart(2, '0');
    const stamp = [
        now.getFullYear(),
        pad(now.getMonth() + 1),
        pad(now.getDate()),
    ].join('');
    const time = [
        pad(now.getHours()),
        pad(now.getMinutes()),
        pad(now.getSeconds()),
    ].join('');
    return `qa_${stamp}_${time}_${suffix}`;
}

/** Plan run directories under the QA temp root. */
export function planQaRunDirectories(
    repoRoot: string,
    scenarioId: string,
    runId: string,
    qaTempRoot = DEFAULT_GAME_QA_TEMP_ROOT
): QaRunDirectoryPlan {
    const qaTempRootAbs = path.resolve(repoRoot, qaTempRoot);
    const scenarioDir = path.join(qaTempRootAbs, scenarioId);
    const runDir = path.join(scenarioDir, runId);
    return {
        qaTempRoot: qaTempRootAbs,
        scenarioDir,
        runDir,
        workspaceDir: path.join(runDir, 'workspace'),
        reportJsonPath: path.join(runDir, 'report.json'),
        reportMdPath: path.join(runDir, 'report.md'),
        runId,
    };
}

/** Verify a candidate path stays under the QA temp root before deletion. */
export function isSafeQaTempDeletionTarget(candidatePath: string, qaTempRoot: string): boolean {
    const resolvedCandidate = path.resolve(candidatePath);
    const resolvedRoot = path.resolve(qaTempRoot);
    const relative = path.relative(resolvedRoot, resolvedCandidate);
    if (relative === '' || relative.startsWith('..') || path.isAbsolute(relative)) {
        return false;
    }
    return true;
}

/** Resolve a repo-relative fixture path and ensure it stays inside repoRoot. */
export function resolveRepoFixturePath(repoRoot: string, fixturePath: string): string | undefined {
    const normalized = fixturePath.replace(/\\/g, '/');
    if (path.isAbsolute(normalized) || normalized.includes('..')) {
        return undefined;
    }
    const resolved = path.resolve(repoRoot, normalized);
    const relative = path.relative(path.resolve(repoRoot), resolved);
    if (relative.startsWith('..') || path.isAbsolute(relative)) {
        return undefined;
    }
    return resolved;
}

export function createEmptyQaRunReport(
    runId: string,
    scenarioId: string,
    mode: QaRunMode,
    startedAt: string
): QaRunReport {
    return {
        schemaVersion: GAME_QA_REPORT_SCHEMA_VERSION,
        runId,
        scenarioId,
        mode,
        startedAt,
        finishedAt: startedAt,
        ok: false,
        summary: {
            steps: 0,
            passedChecks: 0,
            failedChecks: 0,
            warnings: 0,
        },
        steps: [],
        metrics: { fileBytes: {} },
    };
}

export function createQaStepReport(
    step: QaStep,
    startedMs: number,
    checks: QaCheckResult[] = []
): QaStepReport {
    return {
        id: step.id,
        type: step.type,
        ok: true,
        durationMs: Math.max(0, Date.now() - startedMs),
        checks,
    };
}

export function finalizeQaRunReport(report: QaRunReport, finishedAt: string): QaRunReport {
    let passedChecks = 0;
    let failedChecks = 0;
    let warnings = 0;
    for (const step of report.steps) {
        for (const check of step.checks) {
            if (check.ok) {
                passedChecks++;
            } else {
                failedChecks++;
            }
        }
        if (!step.ok && step.error && !step.failureClass) {
            warnings++;
        }
    }
    report.finishedAt = finishedAt;
    report.summary = {
        steps: report.steps.length,
        passedChecks,
        failedChecks,
        warnings,
    };
    report.ok = failedChecks === 0 && report.steps.every((step) => step.ok);
    return report;
}

/** Render a short markdown summary for operators and AI handoff. */
export function formatQaRunReportMarkdown(report: QaRunReport): string {
    const lines: string[] = [];
    lines.push(`# Game QA Report — ${report.scenarioId}`);
    lines.push('');
    lines.push(`- Run ID: \`${report.runId}\``);
    lines.push(`- Mode: \`${report.mode}\``);
    lines.push(`- Result: **${report.ok ? 'PASS' : 'FAIL'}**`);
    if (report.failureClass) {
        lines.push(`- Failure class: \`${report.failureClass}\``);
    }
    lines.push(`- Started: ${report.startedAt}`);
    lines.push(`- Finished: ${report.finishedAt}`);
    lines.push('');
    lines.push('## Summary');
    lines.push('');
    lines.push(`- Steps: ${report.summary.steps}`);
    lines.push(`- Passed checks: ${report.summary.passedChecks}`);
    lines.push(`- Failed checks: ${report.summary.failedChecks}`);
    lines.push(`- Warnings: ${report.summary.warnings}`);
    lines.push('');
    lines.push('## Steps');
    lines.push('');
    for (const step of report.steps) {
        const status = step.ok ? 'PASS' : 'FAIL';
        lines.push(`### ${step.id} (${step.type}) — ${status} (${step.durationMs}ms)`);
        if (step.error) {
            lines.push(`- Error: ${step.error}`);
        }
        if (step.checks.length > 0) {
            lines.push('- Checks:');
            for (const check of step.checks) {
                const mark = check.ok ? 'ok' : 'FAIL';
                const msg = check.message ? ` — ${check.message}` : '';
                lines.push(`  - \`${check.id}\`: ${mark}${msg}`);
            }
        }
        lines.push('');
    }
    const fileEntries = Object.entries(report.metrics.fileBytes);
    if (fileEntries.length > 0) {
        lines.push('## File sizes');
        lines.push('');
        for (const [name, bytes] of fileEntries.sort(([a], [b]) => a.localeCompare(b))) {
            lines.push(`- ${name}: ${bytes} bytes`);
        }
        lines.push('');
    }
    return lines.join('\n');
}