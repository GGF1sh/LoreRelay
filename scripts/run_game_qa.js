#!/usr/bin/env node
'use strict';

/**
 * LoreRelay deterministic Game QA runner (QA1).
 *
 * Usage:
 *   node scripts/run_game_qa.js --list
 *   node scripts/run_game_qa.js --mode quick
 *   node scripts/run_game_qa.js --scenario qa_world_sim_smoke
 *   node scripts/run_game_qa.js --mode benchmark --keep-temp
 *
 * Requires compiled output:
 *   npm run compile
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SCENARIO_DIR = path.join(__dirname, 'game_qa_scenarios');
const DEFAULT_MODE = 'quick';

const corePath = path.join(ROOT, 'out', 'gameQaRunnerCore.js');
if (!fs.existsSync(corePath)) {
    console.error('FAIL: out/gameQaRunnerCore.js missing — run npm run compile');
    process.exit(1);
}

const {
    DEFAULT_GAME_QA_TEMP_ROOT,
    QA_RUN_MODES,
    createEmptyQaRunReport,
    createQaRunSuffix,
    createQaStepReport,
    filterScenariosByRunMode,
    finalizeQaRunReport,
    formatQaRunId,
    formatQaRunReportMarkdown,
    isSafeQaTempDeletionTarget,
    parseQaScenarioDocument,
    planQaRunDirectories,
    resolveRepoFixturePath,
} = require(corePath);

const { resolveBundledSampleDir } = require(path.join(ROOT, 'out', 'scenarioPackCore.js'));

let executionModules;
function loadExecutionModules() {
    if (executionModules) {
        return executionModules;
    }

    const Module = require('module');
    const origRequire = Module.prototype.require;
    Module.prototype.require = function (id) {
        if (id === 'vscode') {
            return { window: { showErrorMessage() {}, showWarningMessage() {} } };
        }
        return origRequire.apply(this, arguments);
    };

    try {
        executionModules = {
            validateGameState: require(path.join(ROOT, 'out', 'validateGameState.js')).validateGameState,
            normalizeGameRules: require(path.join(ROOT, 'out', 'gameRulesCore.js')).normalizeGameRules,
            parseWorldStateWithWarnings: require(path.join(ROOT, 'out', 'worldStateCore.js')).parseWorldStateWithWarnings,
            parseWorldForge: require(path.join(ROOT, 'out', 'worldForgeCore.js')).parseWorldForge,
            runBulkWorldSimulation: require(path.join(ROOT, 'out', 'worldSimBulkCore.js')).runBulkWorldSimulation,
            parseNpcRegistry: require(path.join(ROOT, 'out', 'npcRegistry.js')).parseNpcRegistry,
            runWorkspaceSanityCheckFromSnapshot: require(path.join(ROOT, 'out', 'worldIntentSanityHostCore.js')).runWorkspaceSanityCheckFromSnapshot,
            readWorkspaceSanitySnapshot: require(path.join(ROOT, 'out', 'worldIntentSanityLoader.js')).readWorkspaceSanitySnapshot,
            buildGmTurnTransactionPlanFromTurnResult: require(path.join(ROOT, 'out', 'stateOrchestratorPlanHostCore.js')).buildGmTurnTransactionPlanFromTurnResult,
            STATE_TRANSACTION_PLAN_VERSION: require(path.join(ROOT, 'out', 'stateOrchestratorPlanCore.js')).STATE_TRANSACTION_PLAN_VERSION,
        };
        return executionModules;
    } finally {
        Module.prototype.require = origRequire;
    }
}

const CANONICAL_JSON_FILES = [
    'game_state.json',
    'world_state.json',
    'game_rules.json',
    'game_history.json',
    'vehicle_state.json',
    'settlement_state.json',
    'discoveries.json',
    'campaign_kit.json',
    'npc_registry.json',
    'world_forge.json',
];

function parseArgs(argv) {
    const args = {
        list: false,
        mode: DEFAULT_MODE,
        scenarioId: undefined,
        keepTemp: false,
        noKeepFailed: false,
    };
    for (let i = 2; i < argv.length; i++) {
        const token = argv[i];
        if (token === '--list') {
            args.list = true;
        } else if (token === '--keep-temp') {
            args.keepTemp = true;
        } else if (token === '--no-keep-failed') {
            args.noKeepFailed = true;
        } else if (token === '--mode') {
            const value = argv[++i];
            if (!QA_RUN_MODES.includes(value)) {
                throw new Error(`unsupported --mode ${value}`);
            }
            args.mode = value;
        } else if (token === '--scenario') {
            args.scenarioId = argv[++i];
            if (!args.scenarioId) {
                throw new Error('--scenario requires an id');
            }
        } else {
            throw new Error(`unknown argument: ${token}`);
        }
    }
    return args;
}

function loadScenarioFiles() {
    if (!fs.existsSync(SCENARIO_DIR)) {
        return [];
    }
    return fs.readdirSync(SCENARIO_DIR)
        .filter((name) => name.endsWith('.json'))
        .sort()
        .map((name) => path.join(SCENARIO_DIR, name));
}

function loadScenarioFromFile(filePath) {
    let raw;
    try {
        raw = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    } catch (err) {
        return { ok: false, filePath, errors: [`JSON parse failed: ${err.message}`] };
    }
    const parsed = parseQaScenarioDocument(raw);
    if (!parsed.ok) {
        return { ok: false, filePath, errors: parsed.errors };
    }
    return { ok: true, filePath, scenario: parsed.scenario };
}

function loadAllScenarios() {
    const files = loadScenarioFiles();
    const scenarios = [];
    const errors = [];
    for (const filePath of files) {
        const loaded = loadScenarioFromFile(filePath);
        if (!loaded.ok) {
            errors.push({ filePath, errors: loaded.errors });
            continue;
        }
        scenarios.push(loaded.scenario);
    }
    return { scenarios, errors };
}

function printScenarioList(scenarios) {
    console.log('LoreRelay Game QA scenarios\n');
    for (const scenario of scenarios) {
        console.log(`  - ${scenario.id} [${scenario.mode}] — ${scenario.description}`);
    }
    console.log(`\nTotal scenarios: ${scenarios.length}`);
}

function copyDirectoryRecursive(src, dest) {
    fs.mkdirSync(dest, { recursive: true });
    for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
        const srcPath = path.join(src, entry.name);
        const destPath = path.join(dest, entry.name);
        if (entry.isDirectory()) {
            copyDirectoryRecursive(srcPath, destPath);
        } else if (entry.isFile()) {
            fs.copyFileSync(srcPath, destPath);
        }
    }
}

function setupWorkspace(scenario, workspaceDir) {
    const source = scenario.workspace;
    fs.mkdirSync(workspaceDir, { recursive: true });

    if (source.source === 'empty') {
        return { ok: true };
    }

    if (source.source === 'sample') {
        const sampleDir = resolveBundledSampleDir(source.sampleId, ROOT);
        if (!sampleDir || !fs.existsSync(sampleDir)) {
            return { ok: false, error: `sample not found: ${source.sampleId}` };
        }
        copyDirectoryRecursive(sampleDir, workspaceDir);
        return { ok: true, sourcePath: sampleDir };
    }

    const fixturePath = resolveRepoFixturePath(ROOT, source.fixturePath);
    if (!fixturePath || !fs.existsSync(fixturePath)) {
        return { ok: false, error: `fixture not found or unsafe: ${source.fixturePath}` };
    }
    const stat = fs.statSync(fixturePath);
    if (stat.isDirectory()) {
        copyDirectoryRecursive(fixturePath, workspaceDir);
    } else if (stat.isFile()) {
        fs.copyFileSync(fixturePath, path.join(workspaceDir, path.basename(fixturePath)));
    } else {
        return { ok: false, error: `fixture is not a file or directory: ${source.fixturePath}` };
    }
    return { ok: true, sourcePath: fixturePath };
}

function readJsonIfExists(filePath) {
    if (!fs.existsSync(filePath)) {
        return { exists: false };
    }
    try {
        const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        return { exists: true, data };
    } catch (err) {
        return { exists: true, parseError: err.message };
    }
}

function collectFileByteMetrics(workspaceDir) {
    const metrics = {};
    for (const name of CANONICAL_JSON_FILES) {
        const filePath = path.join(workspaceDir, name);
        if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
            metrics[name] = fs.statSync(filePath).size;
        }
    }
    return metrics;
}

function createCheckContext(workspaceDir, scenario, runtime, mods) {
    return {
        workspaceDir,
        scenario,
        runtime,
        mods,
    };
}

function runChecks(checkIds, ctx) {
    const results = [];
    for (const checkId of checkIds) {
        results.push(runSingleCheck(checkId, ctx));
    }
    return results;
}

function runSingleCheck(checkId, ctx) {
    switch (checkId) {
        case 'game_state_valid':
            return checkGameStateValid(ctx);
        case 'world_state_valid':
            return checkWorldStateValid(ctx);
        case 'game_rules_valid':
            return checkGameRulesValid(ctx);
        case 'workspace_sanity_ok':
            return checkWorkspaceSanityOk(ctx);
        case 'transaction_plan_valid':
            return checkTransactionPlanValid(ctx);
        case 'file_sizes_below_limit':
            return checkFileSizesBelowLimit(ctx);
        case 'no_unhandled_exception':
            return {
                id: checkId,
                ok: !ctx.runtime.hadUnhandledException,
                message: ctx.runtime.hadUnhandledException
                    ? ctx.runtime.lastUnhandledException
                    : undefined,
            };
        case 'no_json_parse_error':
            return checkNoJsonParseError(ctx);
        default:
            return { id: checkId, ok: false, message: `unsupported check: ${checkId}` };
    }
}

function checkGameStateValid(ctx) {
    const filePath = path.join(ctx.workspaceDir, 'game_state.json');
    const read = readJsonIfExists(filePath);
    if (!read.exists) {
        return { id: 'game_state_valid', ok: true, message: 'absent (skipped)' };
    }
    if (read.parseError) {
        ctx.runtime.jsonParseErrors.push('game_state.json');
        return { id: 'game_state_valid', ok: false, message: read.parseError };
    }
    const errors = ctx.mods.validateGameState(read.data);
    if (errors.length > 0) {
        return { id: 'game_state_valid', ok: false, message: errors.slice(0, 3).join('; ') };
    }
    return { id: 'game_state_valid', ok: true };
}

function checkWorldStateValid(ctx) {
    const filePath = path.join(ctx.workspaceDir, 'world_state.json');
    const read = readJsonIfExists(filePath);
    if (!read.exists) {
        return { id: 'world_state_valid', ok: true, message: 'absent (skipped)' };
    }
    if (read.parseError) {
        ctx.runtime.jsonParseErrors.push('world_state.json');
        return { id: 'world_state_valid', ok: false, message: read.parseError };
    }
    const { state, warnings } = ctx.mods.parseWorldStateWithWarnings(read.data);
    if (!state) {
        return { id: 'world_state_valid', ok: false, message: 'structural validation failed' };
    }
    const overflow = warnings.filter((w) => w.code === 'parse_cap_exceeded');
    if (overflow.length > 0) {
        return {
            id: 'world_state_valid',
            ok: false,
            message: `${overflow.length} parse cap exceeded warning(s)`,
        };
    }
    return { id: 'world_state_valid', ok: true };
}

function checkGameRulesValid(ctx) {
    const filePath = path.join(ctx.workspaceDir, 'game_rules.json');
    const read = readJsonIfExists(filePath);
    if (!read.exists) {
        ctx.mods.normalizeGameRules(undefined);
        return { id: 'game_rules_valid', ok: true, message: 'absent (defaults applied)' };
    }
    if (read.parseError) {
        ctx.runtime.jsonParseErrors.push('game_rules.json');
        return { id: 'game_rules_valid', ok: false, message: read.parseError };
    }
    ctx.mods.normalizeGameRules(read.data);
    return { id: 'game_rules_valid', ok: true };
}

function checkWorkspaceSanityOk(ctx) {
    const snapshot = ctx.mods.readWorkspaceSanitySnapshot(ctx.workspaceDir);
    const report = ctx.mods.runWorkspaceSanityCheckFromSnapshot(snapshot);
    if (!report.ok || report.errorCount > 0) {
        const first = report.issues.find((issue) => issue.severity === 'error');
        return {
            id: 'workspace_sanity_ok',
            ok: false,
            message: first
                ? `${first.domain}/${first.code}: ${first.message}`
                : `errors=${report.errorCount}`,
        };
    }
    return { id: 'workspace_sanity_ok', ok: true };
}

function checkTransactionPlanValid(ctx) {
    if (!ctx.runtime.lastTransactionPlan) {
        return {
            id: 'transaction_plan_valid',
            ok: false,
            message: 'no transaction plan was built in this run',
        };
    }
    const plan = ctx.runtime.lastTransactionPlan;
    if (plan.version !== ctx.mods.STATE_TRANSACTION_PLAN_VERSION || plan.kind !== 'gm_turn') {
        return {
            id: 'transaction_plan_valid',
            ok: false,
            message: 'unexpected plan shape',
        };
    }
    const primary = plan.steps.find((step) => step.ledgerId === 'game_state' && step.status === 'planned');
    if (!primary) {
        return {
            id: 'transaction_plan_valid',
            ok: false,
            message: 'primary game_state step not planned',
        };
    }
    return { id: 'transaction_plan_valid', ok: true };
}

function checkFileSizesBelowLimit(ctx) {
    const limit = ctx.scenario.limits?.maxFileBytes ?? 1_000_000;
    const metrics = collectFileByteMetrics(ctx.workspaceDir);
    for (const [name, bytes] of Object.entries(metrics)) {
        if (bytes > limit) {
            return {
                id: 'file_sizes_below_limit',
                ok: false,
                message: `${name} is ${bytes} bytes (> ${limit})`,
            };
        }
    }
    return { id: 'file_sizes_below_limit', ok: true };
}

function checkNoJsonParseError(ctx) {
    if (ctx.runtime.jsonParseErrors.length > 0) {
        return {
            id: 'no_json_parse_error',
            ok: false,
            message: ctx.runtime.jsonParseErrors.join(', '),
        };
    }
    for (const name of CANONICAL_JSON_FILES) {
        const read = readJsonIfExists(path.join(ctx.workspaceDir, name));
        if (read.exists && read.parseError) {
            return {
                id: 'no_json_parse_error',
                ok: false,
                message: `${name}: ${read.parseError}`,
            };
        }
    }
    return { id: 'no_json_parse_error', ok: true };
}

function executeAssertStep(step, ctx) {
    const checks = runChecks(step.checks, ctx);
    const ok = checks.every((check) => check.ok);
    return { ok, checks };
}

function executeWorldSimStep(step, ctx) {
    const forgePath = path.join(ctx.workspaceDir, 'world_forge.json');
    const statePath = path.join(ctx.workspaceDir, 'world_state.json');
    const forgeRead = readJsonIfExists(forgePath);
    const stateRead = readJsonIfExists(statePath);

    if (!forgeRead.exists || forgeRead.parseError || !forgeRead.data) {
        return {
            ok: false,
            checks: [],
            error: 'world_forge.json missing or invalid',
            failureClass: 'step_failed',
        };
    }
    if (!stateRead.exists || stateRead.parseError || !stateRead.data) {
        return {
            ok: false,
            checks: [],
            error: 'world_state.json missing or invalid',
            failureClass: 'step_failed',
        };
    }

    const forge = ctx.mods.parseWorldForge(forgeRead.data);
    const { state } = ctx.mods.parseWorldStateWithWarnings(stateRead.data);
    if (!forge || !state) {
        return {
            ok: false,
            checks: [],
            error: 'world forge/state failed structural validation',
            failureClass: 'step_failed',
        };
    }

    const rulesRead = readJsonIfExists(path.join(ctx.workspaceDir, 'game_rules.json'));
    const rules = ctx.mods.normalizeGameRules(rulesRead.exists && !rulesRead.parseError ? rulesRead.data : undefined);
    const registryPath = path.join(ctx.workspaceDir, 'npc_registry.json');
    const registryRead = readJsonIfExists(registryPath);
    const registry = registryRead.exists && !registryRead.parseError
        ? ctx.mods.parseNpcRegistry(registryRead.data)
        : undefined;

    const result = ctx.mods.runBulkWorldSimulation(forge, state, registry, {
        steps: step.steps,
        enableNpcRegistry: rules.enableNpcRegistry === true && Boolean(registry),
        maxSteps: ctx.scenario.limits?.maxSteps ?? 50,
    });

    if (!result.ok) {
        return {
            ok: false,
            checks: [],
            error: `world simulation failed: ${result.reason}`,
            failureClass: 'step_failed',
        };
    }

    fs.writeFileSync(statePath, `${JSON.stringify(result.state, null, 2)}\n`, 'utf-8');
    if (result.registry && rules.enableNpcRegistry === true) {
        fs.writeFileSync(registryPath, `${JSON.stringify(result.registry, null, 2)}\n`, 'utf-8');
    }

    const checks = step.assertAfter ? runChecks(step.assertAfter, ctx) : [];
    const ok = checks.length === 0 || checks.every((check) => check.ok);
    return { ok, checks };
}

function executeWorkspaceSanityStep(step, ctx) {
    const checks = step.assertAfter ? runChecks(step.assertAfter, ctx) : [];
    if (checks.length === 0) {
        const implicit = runChecks(['workspace_sanity_ok'], ctx);
        return { ok: implicit.every((check) => check.ok), checks: implicit };
    }
    return { ok: checks.every((check) => check.ok), checks };
}

function executeStateOrchestratorPlanStep(step, ctx) {
    const fixturePath = resolveRepoFixturePath(ROOT, step.turnResultFixture);
    if (!fixturePath || !fs.existsSync(fixturePath)) {
        return {
            ok: false,
            checks: [],
            error: `turn result fixture not found: ${step.turnResultFixture}`,
            failureClass: 'step_failed',
        };
    }
    const fixtureRead = readJsonIfExists(fixturePath);
    if (!fixtureRead.exists || fixtureRead.parseError || !fixtureRead.data) {
        return {
            ok: false,
            checks: [],
            error: `turn result fixture invalid: ${step.turnResultFixture}`,
            failureClass: 'step_failed',
        };
    }

    const rulesRead = readJsonIfExists(path.join(ctx.workspaceDir, 'game_rules.json'));
    const rules = ctx.mods.normalizeGameRules(rulesRead.exists && !rulesRead.parseError ? rulesRead.data : undefined);
    const plan = ctx.mods.buildGmTurnTransactionPlanFromTurnResult(fixtureRead.data, rules);
    ctx.runtime.lastTransactionPlan = plan;

    const checks = step.assertAfter ? runChecks(step.assertAfter, ctx) : [];
    const ok = checks.length === 0 || checks.every((check) => check.ok);
    return { ok, checks };
}

function executeSnapshotStep(step, ctx) {
    ctx.runtime.snapshots.push({
        id: step.id,
        label: step.label,
        metrics: collectFileByteMetrics(ctx.workspaceDir),
        at: new Date().toISOString(),
    });
    return { ok: true, checks: [] };
}

function executeStep(step, ctx) {
    switch (step.type) {
        case 'assert':
            return executeAssertStep(step, ctx);
        case 'world_sim':
            return executeWorldSimStep(step, ctx);
        case 'workspace_sanity':
            return executeWorkspaceSanityStep(step, ctx);
        case 'state_orchestrator_plan':
            return executeStateOrchestratorPlanStep(step, ctx);
        case 'snapshot':
            return executeSnapshotStep(step, ctx);
        default:
            return {
                ok: false,
                checks: [],
                error: `unsupported step type: ${step.type}`,
                failureClass: 'scenario_invalid',
            };
    }
}

function removeDirectorySafe(targetPath, qaTempRoot) {
    if (!isSafeQaTempDeletionTarget(targetPath, qaTempRoot)) {
        throw new Error(`refusing to delete unsafe path: ${targetPath}`);
    }
    fs.rmSync(targetPath, { recursive: true, force: true });
}

function writeReports(plan, report) {
    fs.mkdirSync(plan.runDir, { recursive: true });
    fs.writeFileSync(plan.reportJsonPath, `${JSON.stringify(report, null, 2)}\n`, 'utf-8');
    fs.writeFileSync(plan.reportMdPath, `${formatQaRunReportMarkdown(report)}\n`, 'utf-8');
}

function runScenario(scenario, mode, options) {
    const startedAt = new Date();
    const runId = formatQaRunId(startedAt, createQaRunSuffix());
    const plan = planQaRunDirectories(ROOT, scenario.id, runId, DEFAULT_GAME_QA_TEMP_ROOT);
    const report = createEmptyQaRunReport(runId, scenario.id, mode, startedAt.toISOString());

    const runtime = {
        hadUnhandledException: false,
        lastUnhandledException: undefined,
        jsonParseErrors: [],
        lastTransactionPlan: undefined,
        snapshots: [],
    };

    let keepTemp = options.keepTemp;
    let scenarioFailed = false;
    const mods = loadExecutionModules();

    try {
        const setup = setupWorkspace(scenario, plan.workspaceDir);
        if (!setup.ok) {
            report.failureClass = 'setup_failed';
            report.steps.push({
                id: 'setup',
                type: 'assert',
                ok: false,
                durationMs: 0,
                checks: [],
                error: setup.error,
                failureClass: 'setup_failed',
            });
            scenarioFailed = true;
            keepTemp = true;
        } else {

            const ctx = createCheckContext(plan.workspaceDir, scenario, runtime, mods);
            const timeoutMs = scenario.limits?.timeoutMs;
            const deadline = timeoutMs ? Date.now() + timeoutMs : undefined;

            for (const step of scenario.steps) {
                if (deadline && Date.now() > deadline) {
                    report.failureClass = 'timeout';
                    report.steps.push({
                        id: step.id,
                        type: step.type,
                        ok: false,
                        durationMs: 0,
                        checks: [],
                        error: `scenario exceeded timeoutMs=${timeoutMs}`,
                        failureClass: 'timeout',
                    });
                    scenarioFailed = true;
                    break;
                }

                const startedMs = Date.now();
                let outcome;
                try {
                    outcome = executeStep(step, ctx);
                } catch (err) {
                    runtime.hadUnhandledException = true;
                    runtime.lastUnhandledException = err instanceof Error ? err.message : String(err);
                    outcome = {
                        ok: false,
                        checks: [],
                        error: runtime.lastUnhandledException,
                        failureClass: 'step_failed',
                    };
                }

                const stepReport = createQaStepReport(step, startedMs, outcome.checks);
                stepReport.ok = outcome.ok;
                if (outcome.error) {
                    stepReport.error = outcome.error;
                }
                if (outcome.failureClass) {
                    stepReport.failureClass = outcome.failureClass;
                }
                if (!outcome.ok && !outcome.failureClass) {
                    stepReport.failureClass = 'assert_failed';
                }
                report.steps.push(stepReport);

                if (!outcome.ok) {
                    report.failureClass = stepReport.failureClass ?? 'assert_failed';
                    scenarioFailed = true;
                    break;
                }
            }
        }
    } catch (err) {
        report.failureClass = 'internal_error';
        report.steps.push({
            id: 'runner',
            type: 'assert',
            ok: false,
            durationMs: 0,
            checks: [],
            error: err instanceof Error ? err.message : String(err),
            failureClass: 'internal_error',
        });
        scenarioFailed = true;
        keepTemp = true;
    }

    if (fs.existsSync(plan.workspaceDir)) {
        report.metrics.fileBytes = collectFileByteMetrics(plan.workspaceDir);
    }
    finalizeQaRunReport(report, new Date().toISOString());

    if (scenarioFailed) {
        keepTemp = true;
    }

    if (fs.existsSync(plan.runDir) || !scenarioFailed) {
        writeReports(plan, report);
    }

    if (!keepTemp) {
        try {
            if (fs.existsSync(plan.runDir)) {
                removeDirectorySafe(plan.runDir, plan.qaTempRoot);
            }
        } catch (err) {
            console.error(`WARN: failed to delete temp run dir: ${err.message}`);
            keepTemp = true;
        }
    }

    if (scenarioFailed && options.noKeepFailed) {
        try {
            if (fs.existsSync(plan.runDir)) {
                removeDirectorySafe(plan.runDir, plan.qaTempRoot);
                keepTemp = false;
            }
        } catch (err) {
            console.error(`WARN: failed to delete failed temp run dir: ${err.message}`);
        }
    }

    return { report, plan, keepTemp };
}

function printScenarioSummary(result) {
    const status = result.report.ok ? 'PASS' : 'FAIL';
    console.log(`=> ${status} ${result.report.scenarioId} (${result.report.summary.passedChecks}/${result.report.summary.passedChecks + result.report.summary.failedChecks} checks)`);
    if (!result.report.ok) {
        const failedStep = result.report.steps.find((step) => !step.ok);
        if (failedStep?.error) {
            console.log(`   ${failedStep.id}: ${failedStep.error}`);
        }
        for (const step of result.report.steps) {
            for (const check of step.checks) {
                if (!check.ok) {
                    console.log(`   check ${check.id}: ${check.message ?? 'failed'}`);
                }
            }
        }
    }
    if (result.keepTemp && fs.existsSync(result.plan.runDir)) {
        console.log(`   kept temp: ${result.plan.runDir}`);
    }
}

function main() {
    let args;
    try {
        args = parseArgs(process.argv);
    } catch (err) {
        console.error(`FAIL: ${err.message}`);
        process.exit(1);
    }

    const loaded = loadAllScenarios();
    if (loaded.errors.length > 0) {
        for (const item of loaded.errors) {
            console.error(`FAIL: invalid scenario ${path.basename(item.filePath)}`);
            for (const err of item.errors) {
                console.error(`  - ${err}`);
            }
        }
        process.exit(1);
    }

    if (args.list) {
        printScenarioList(loaded.scenarios);
        return;
    }

    let scenarios = filterScenariosByRunMode(loaded.scenarios, args.mode);
    if (args.scenarioId) {
        scenarios = scenarios.filter((scenario) => scenario.id === args.scenarioId);
        if (scenarios.length === 0) {
            console.error(`FAIL: scenario not found for mode ${args.mode}: ${args.scenarioId}`);
            process.exit(1);
        }
    }

    if (scenarios.length === 0) {
        console.error(`FAIL: no scenarios registered for mode ${args.mode}`);
        process.exit(1);
    }

    console.log('=== LoreRelay Game QA Runner ===');
    console.log(`Mode: ${args.mode}`);
    console.log(`Scenarios: ${scenarios.map((s) => s.id).join(', ')}`);

    const results = [];
    for (const scenario of scenarios) {
        console.log(`\n--- [game-qa] ${scenario.id} ---`);
        const result = runScenario(scenario, args.mode, {
            keepTemp: args.keepTemp,
            noKeepFailed: args.noKeepFailed,
        });
        printScenarioSummary(result);
        results.push(result);
    }

    const passed = results.filter((r) => r.report.ok).length;
    const failed = results.length - passed;

    console.log('\n=== Game QA Summary ===');
    console.log(`Passed: ${passed}/${results.length}`);
    if (failed > 0) {
        console.log('Failed:');
        for (const result of results.filter((r) => !r.report.ok)) {
            console.log(`  - ${result.report.scenarioId}`);
        }
        process.exit(1);
    }
}

main();