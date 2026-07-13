'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { collectChangedFiles, makePlan } = require('../lib/planner');
const { ExecutionEngine, fullSuiteAttempts, resumePasses } = require('../lib/engine');
const { fingerprint } = require('../lib/report');

let passed = 0;
const tests = [];
const TEMP_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'lorerelay-console-tests-'));
let fixtureNumber = 0;
function test(name, fn) { tests.push({ name, fn }); }

function command(program, args, cwd) {
    const result = spawnSync(program, args, { cwd, encoding: 'utf8', windowsHide: true });
    if (result.status !== 0) throw new Error(`${program} ${args.join(' ')}: ${result.stderr || result.stdout}`);
    return result.stdout.trim();
}

function fixture() {
    const root = path.join(TEMP_ROOT, `fixture-${++fixtureNumber}`);
    fs.mkdirSync(root, { recursive: true });
    fs.mkdirSync(path.join(root, 'docs'), { recursive: true });
    fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ version: '1.82.4', repository: { url: 'fixture' } }));
    fs.writeFileSync(path.join(root, 'package-lock.json'), '{}');
    fs.writeFileSync(path.join(root, 'docs', 'base.md'), 'base\n');
    command('git', ['init'], root);
    command('git', ['config', 'user.email', 'fixture@example.invalid'], root);
    command('git', ['config', 'user.name', 'Fixture'], root);
    command('git', ['add', '.'], root);
    command('git', ['commit', '-m', 'fixture'], root);
    return root;
}

function fakePreflight(overrides = {}) {
    return { nodeVersion: process.version, npmVersion: '10', pythonVersion: '3', gitVersion: '2', powershellVersion: '7', ...overrides };
}

function commandPlan(root, commands, diff = 'same') {
    return {
        schemaVersion: 1, repository: 'fixture', repositoryRoot: root, baseSha: 'a'.repeat(40), headSha: 'b'.repeat(40),
        branch: 'fixture', version: '1.82.4', dirty: true, dirtyDiffHash: diff, mode: 'focused', complete: true,
        changedFiles: [], selectedCommands: commands, skippedDomains: [], unknownFiles: [], requiresFullSuite: false,
        humanSmoke: { status: 'NOT_PERFORMED', checklist: [] },
    };
}

function nodeCommand(id, source, timeoutMs = 5000) {
    return { id, command: `node -e ${JSON.stringify(source)}`, executable: process.execPath, args: ['-e', source], category: 'unit', exclusiveGroup: null, timeoutMs, phase: 'focused', reasons: ['fixture'] };
}

test('changed-file collection includes dirty tracked and untracked files', () => {
    const root = fixture();
    fs.writeFileSync(path.join(root, 'docs', 'base.md'), 'changed\n');
    fs.writeFileSync(path.join(root, 'docs', 'new.md'), 'new\n');
    const files = collectChangedFiles(root, 'HEAD', 'HEAD');
    assert.deepStrictEqual(files, ['docs/base.md', 'docs/new.md']);
});

test('plan output is deterministic', () => {
    const root = fixture();
    const input = { root, base: 'HEAD', head: 'HEAD', mode: 'verify', changedFiles: ['webview/modules/a.js'] };
    assert.deepStrictEqual(makePlan(input), makePlan(input));
});

test('webview rules select parity tests with reasons', () => {
    const plan = makePlan({ root: fixture(), base: 'HEAD', head: 'HEAD', mode: 'verify', changedFiles: ['webview/modules/a.js'] });
    assert(plan.selectedCommands.some((item) => item.id === 'test:test_webview_bundle.js'));
    assert(plan.selectedCommands.every((item) => item.reasons.length > 0));
});

test('locale rules select i18n validation', () => {
    const plan = makePlan({ root: fixture(), base: 'HEAD', head: 'HEAD', mode: 'verify', changedFiles: ['locales/ja.json'] });
    assert(plan.selectedCommands.some((item) => item.id === 'test:check_i18n_keys.js'));
});

test('installer tests share the installer exclusive group', () => {
    const plan = makePlan({ root: fixture(), base: 'HEAD', head: 'HEAD', mode: 'focused', changedFiles: ['installer/setup.ps1'] });
    const installers = plan.selectedCommands.filter((item) => item.id.includes('installer') || item.id.includes('install_chain'));
    assert(installers.length >= 4);
    assert(installers.every((item) => item.exclusiveGroup === 'installer-worktree'));
});

test('docs-only plan stays focused and complete', () => {
    const plan = makePlan({ root: fixture(), base: 'HEAD', head: 'HEAD', mode: 'verify', changedFiles: ['docs/guide.md'] });
    assert.deepStrictEqual(plan.unknownFiles, []);
    assert.strictEqual(plan.requiresFullSuite, false);
    assert.deepStrictEqual(plan.selectedCommands.map((item) => item.id), ['test:validate_utf8_docs.js']);
});

test('unknown production file fails closed', () => {
    const plan = makePlan({ root: fixture(), base: 'HEAD', head: 'HEAD', mode: 'focused', changedFiles: ['extension/opaque.bin'] });
    assert.strictEqual(plan.complete, false);
    assert.strictEqual(plan.requiresFullSuite, true);
    assert.deepStrictEqual(plan.unknownFiles, ['extension/opaque.bin']);
    assert(plan.selectedCommands.some((item) => item.id === 'full-suite'));
});

test('exact fingerprint resumes recorded passes', () => {
    const root = fixture();
    const plan = commandPlan(root, [nodeCommand('one', 'process.exit(0)')]);
    const value = fingerprint(plan, fakePreflight());
    const prior = path.join(root, '.test-runs', 'prior'); fs.mkdirSync(prior, { recursive: true });
    fs.writeFileSync(path.join(prior, 'results.json'), JSON.stringify({ fingerprint: value, commands: [{ id: 'one', status: 'PASS' }] }));
    assert.deepStrictEqual([...resumePasses(root, value)], ['one']);
});

test('changed fingerprint invalidates resume', () => {
    const root = fixture();
    const a = commandPlan(root, [nodeCommand('one', 'process.exit(0)')], 'a');
    const b = commandPlan(root, [nodeCommand('one', 'process.exit(0)')], 'b');
    const prior = path.join(root, '.test-runs', 'prior'); fs.mkdirSync(prior, { recursive: true });
    fs.writeFileSync(path.join(prior, 'results.json'), JSON.stringify({ fingerprint: fingerprint(a, fakePreflight()), commands: [{ id: 'one', status: 'PASS' }] }));
    assert.strictEqual(resumePasses(root, fingerprint(b, fakePreflight())).size, 0);
});

test('saved plan is rejected after the working tree changes', () => {
    const root = fixture();
    const plan = makePlan({ root, base: 'HEAD', head: 'HEAD', mode: 'focused', changedFiles: ['docs/base.md'] });
    fs.writeFileSync(path.join(root, 'docs', 'base.md'), 'changed after planning\n');
    assert.throws(() => new ExecutionEngine(plan, fakePreflight()), /Working tree changed after planning/);
});

test('full-suite repeat guard requires an explicit reason', async () => {
    const root = fixture();
    const full = { ...nodeCommand('full-suite', 'process.exit(0)'), phase: 'full-suite' };
    const plan = commandPlan(root, [full]); plan.requiresFullSuite = true;
    const engine = new ExecutionEngine(plan, fakePreflight(), { runDirectory: path.join(root, '.test-runs', 'next'), skipIdentityCheck: true });
    const prior = path.join(root, '.test-runs', 'prior'); fs.mkdirSync(prior, { recursive: true });
    fs.writeFileSync(path.join(prior, 'results.json'), JSON.stringify({ fingerprint: engine.fingerprint, commands: [{ id: 'full-suite', status: 'FAIL' }] }));
    assert.strictEqual(fullSuiteAttempts(root, engine.fingerprint).length, 1);
    await assert.rejects(() => engine.run(), /already attempted/);
});

test('command timeout preserves timeout result and artifacts', async () => {
    const root = fixture();
    const plan = commandPlan(root, [nodeCommand('slow', 'setTimeout(()=>{}, 5000)', 100)]);
    const result = await new ExecutionEngine(plan, fakePreflight(), { runDirectory: path.join(root, '.test-runs', 'timeout'), skipIdentityCheck: true }).run();
    assert.strictEqual(result.commands[0].status, 'TIMEOUT');
    assert(fs.existsSync(path.join(result.runDirectory, 'results.json')));
});

test('cancellation stops an active command', async () => {
    const root = fixture();
    const plan = commandPlan(root, [nodeCommand('cancel-me', 'setTimeout(()=>{}, 5000)', 10000)]);
    const engine = new ExecutionEngine(plan, fakePreflight(), { runDirectory: path.join(root, '.test-runs', 'cancel'), skipIdentityCheck: true });
    const promise = engine.run();
    setTimeout(() => engine.cancel(), 100);
    const result = await promise;
    assert.strictEqual(result.cancelled, true);
    assert(['CANCELLED', 'SKIPPED'].includes(result.commands[0].status));
});

test('result, HTML, logs, and AI summary are generated', async () => {
    const root = fixture();
    const plan = commandPlan(root, [nodeCommand('echo', "console.log('hello')")]);
    const result = await new ExecutionEngine(plan, fakePreflight(), { runDirectory: path.join(root, '.test-runs', 'report'), skipIdentityCheck: true }).run();
    for (const file of ['plan.json', 'results.json', 'summary.md', 'index.html', 'echo.stdout.log', 'echo.stderr.log']) assert(fs.existsSync(path.join(result.runDirectory, file)), file);
    assert(result.summary.startsWith('TEST_RUN_PASS'));
    assert(result.summary.includes('Human smoke: not performed'));
});

(async () => {
    for (const item of tests) {
        try { await item.fn(); passed++; console.log(`PASS ${item.name}`); }
        catch (error) { console.error(`FAIL ${item.name}\n${error.stack || error.message}`); process.exitCode = 1; }
    }
    console.log(`LoreRelay Test Console tests: ${passed}/${tests.length} passed`);
    fs.rmSync(TEMP_ROOT, { recursive: true, force: true });
    if (passed !== tests.length) process.exitCode = 1;
})().catch((error) => { console.error(error); process.exitCode = 1; });
