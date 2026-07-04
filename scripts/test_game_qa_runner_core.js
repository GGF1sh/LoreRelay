#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const corePath = path.join(root, 'out', 'gameQaRunnerCore.js');

let failed = 0;
function fail(msg) { console.error(`FAIL: ${msg}`); failed++; }
function ok(msg) { console.log(`OK: ${msg}`); }

if (!fs.existsSync(corePath)) {
    fail('out/gameQaRunnerCore.js missing — run npm run compile');
    process.exit(1);
}

const {
    DEFAULT_GAME_QA_TEMP_ROOT,
    GAME_QA_SCENARIO_VERSION,
    filterScenariosByRunMode,
    formatQaRunId,
    formatQaRunReportMarkdown,
    isSafeQaTempDeletionTarget,
    parseQaScenarioDocument,
    planQaRunDirectories,
    resolveRepoFixturePath,
    resolveScenarioRunModes,
    finalizeQaRunReport,
    createEmptyQaRunReport,
} = require(corePath);

{
    const parsed = parseQaScenarioDocument({
        id: 'bad',
        version: 2,
        description: 'x',
        mode: 'quick',
        workspace: { source: 'empty' },
        steps: [],
    });
    if (parsed.ok) {
        fail('invalid version should fail parse');
    } else if (!parsed.errors.some((e) => e.includes('version'))) {
        fail(`expected version error, got ${parsed.errors.join('; ')}`);
    } else {
        ok('rejects unsupported scenario version');
    }
}

{
    const parsed = parseQaScenarioDocument({
        id: 'bad_step',
        version: GAME_QA_SCENARIO_VERSION,
        description: 'x',
        mode: 'quick',
        workspace: { source: 'empty' },
        steps: [{ id: 'x', type: 'player_input', command: 'rm -rf /' }],
    });
    if (parsed.ok) {
        fail('unsupported step type should fail parse');
    } else {
        ok('rejects unsupported step types');
    }
}

{
    const scenarioDir = path.join(__dirname, 'game_qa_scenarios');
    const files = fs.readdirSync(scenarioDir).filter((name) => name.endsWith('.json'));
    const scenarios = [];
    for (const file of files) {
        const raw = JSON.parse(fs.readFileSync(path.join(scenarioDir, file), 'utf-8'));
        const parsed = parseQaScenarioDocument(raw);
        if (!parsed.ok) {
            fail(`${file} failed parse: ${parsed.errors.join('; ')}`);
            continue;
        }
        scenarios.push(parsed.scenario);
        ok(`parses bundled scenario ${parsed.scenario.id}`);
    }

    const quick = filterScenariosByRunMode(scenarios, 'quick');
    if (quick.length < 2) {
        fail(`expected at least 2 quick scenarios, got ${quick.length}`);
    } else {
        ok(`quick mode includes ${quick.length} scenario(s)`);
    }

    const benchmark = filterScenariosByRunMode(scenarios, 'benchmark');
    if (benchmark.length < 1) {
        fail('benchmark mode should include qa_world_sim_smoke via modes[]');
    } else {
        ok(`benchmark mode includes ${benchmark.length} scenario(s)`);
    }

    const worldSim = scenarios.find((s) => s.id === 'qa_world_sim_smoke');
    if (!worldSim) {
        fail('qa_world_sim_smoke missing');
    } else {
        const modes = resolveScenarioRunModes(worldSim);
        if (!modes.includes('quick') || !modes.includes('benchmark')) {
            fail(`qa_world_sim_smoke modes expected quick+benchmark, got ${modes.join(',')}`);
        } else {
            ok('resolveScenarioRunModes honors optional modes[]');
        }
    }
}

{
    const runId = formatQaRunId(new Date('2026-07-05T01:02:03Z'), 'abc123');
    if (!/^qa_20260705_/.test(runId) || !runId.endsWith('abc123')) {
        fail(`unexpected run id format: ${runId}`);
    } else {
        ok('formatQaRunId produces stable prefix and suffix');
    }
}

{
    const plan = planQaRunDirectories(root, 'qa_world_sim_smoke', 'qa_test_run', DEFAULT_GAME_QA_TEMP_ROOT);
    if (!plan.workspaceDir.endsWith(path.join('qa_world_sim_smoke', 'qa_test_run', 'workspace'))) {
        fail(`unexpected workspace dir: ${plan.workspaceDir}`);
    } else {
        ok('planQaRunDirectories nests workspace and reports under qa temp root');
    }

    if (!isSafeQaTempDeletionTarget(plan.runDir, plan.qaTempRoot)) {
        fail('run dir should be safe to delete under qa temp root');
    } else {
        ok('isSafeQaTempDeletionTarget accepts run dir under root');
    }

    const outside = path.resolve(root, '..', 'outside-delete');
    if (isSafeQaTempDeletionTarget(outside, plan.qaTempRoot)) {
        fail('outside path must not be deletable');
    } else {
        ok('isSafeQaTempDeletionTarget rejects paths outside qa temp root');
    }
}

{
    const fixture = resolveRepoFixturePath(root, 'fixtures/qa/noop_turn_result.json');
    if (!fixture || !fs.existsSync(fixture)) {
        fail('repo fixture path should resolve for noop_turn_result.json');
    } else {
        ok('resolveRepoFixturePath resolves fixtures/qa/noop_turn_result.json');
    }

    const unsafe = resolveRepoFixturePath(root, '../outside.json');
    if (unsafe) {
        fail('resolveRepoFixturePath must reject traversal');
    } else {
        ok('resolveRepoFixturePath rejects traversal');
    }
}

{
    const report = createEmptyQaRunReport('qa_test', 'qa_smoke_beginner_adventure', 'quick', new Date().toISOString());
    report.steps.push({
        id: 'assert',
        type: 'assert',
        ok: true,
        durationMs: 1,
        checks: [{ id: 'game_state_valid', ok: true }],
    });
    finalizeQaRunReport(report, new Date().toISOString());
    const md = formatQaRunReportMarkdown(report);
    if (!md.includes('qa_smoke_beginner_adventure') || !md.includes('game_state_valid')) {
        fail('markdown report should include scenario id and check ids');
    } else {
        ok('formatQaRunReportMarkdown renders scenario and checks');
    }
}

if (failed > 0) {
    console.error(`\n${failed} test(s) failed`);
    process.exit(1);
}
console.log('\nAll gameQaRunnerCore tests passed.');