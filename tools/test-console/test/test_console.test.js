'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { collectChangedFiles, makePlan } = require('../lib/planner');
const { ExecutionEngine, fullSuiteAttempts, resumePasses } = require('../lib/engine');
const { fingerprint } = require('../lib/report');
const { TRUSTED_MARKER, hydrateTrustedCommand } = require('../lib/trusted-commands');
const { loadTrustedPlan } = require('../lib/plan-trust');

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
    fs.writeFileSync(path.join(root, '.gitignore'), '.test-runs/\n');
    command('git', ['init'], root);
    command('git', ['config', 'user.email', 'fixture@example.invalid'], root);
    command('git', ['config', 'user.name', 'Fixture'], root);
    command('git', ['add', '.'], root);
    command('git', ['commit', '-m', 'fixture'], root);
    return root;
}

// A fixture with one real, uncommitted docs change so makePlan's real git-based detection
// (not the `changedFiles` override) selects a genuine command - needed for the plan-trust
// tests, which regenerate a canonical plan from real repository state.
function fixtureWithDirtyDocsChange() {
    const root = fixture();
    fs.writeFileSync(path.join(root, 'docs', 'base.md'), 'changed for command-trust tests\n');
    return root;
}

// A fixture with two real commits plus a dirty change on top, so a "move the base forward"
// tamper attempt has a genuine, existing commit to point at (not just a bogus SHA).
function fixtureWithBaseAndHeadCommits() {
    const root = fixture();
    const baseSha = command('git', ['rev-parse', 'HEAD'], root);
    fs.writeFileSync(path.join(root, 'docs', 'extra.md'), 'extra\n');
    command('git', ['add', '.'], root);
    command('git', ['commit', '-m', 'add extra doc'], root);
    fs.writeFileSync(path.join(root, 'docs', 'base.md'), 'changed for command-trust tests\n');
    return { root, baseSha };
}

function writePlanFile(root, plan) {
    const dir = path.join(root, '.test-runs', 'plans');
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, `plan-${Math.random().toString(36).slice(2)}.json`);
    fs.writeFileSync(file, JSON.stringify(plan, null, 2));
    return file;
}

function tamperedCopy(plan, mutate) {
    const clone = JSON.parse(JSON.stringify(plan));
    mutate(clone);
    return clone;
}

function assertPlanTamperRejected(root, basePlan, mutate, messagePattern) {
    const tampered = tamperedCopy(basePlan, mutate);
    const planPath = writePlanFile(root, tampered);
    assert.throws(() => loadTrustedPlan(planPath, { root }), messagePattern);
}

function fakePreflight(overrides = {}) {
    return { nodeVersion: process.version, npmVersion: '10', pythonVersion: '3', gitVersion: '2', powershellVersion: '7', ...overrides };
}

function commandPlan(root, commands, diff = 'same') {
    return {
        schemaVersion: 2, repository: 'fixture', repositoryRoot: root, baseSha: 'a'.repeat(40), headSha: 'b'.repeat(40),
        branch: 'fixture', version: '1.82.4', dirty: true, dirtyDiffHash: diff, mode: 'focused', complete: true,
        changedFiles: [], selectedCommands: commands, skippedDomains: [], unknownFiles: [], requiresFullSuite: false,
        humanSmoke: { status: 'NOT_PERFORMED', checklist: [] },
    };
}

// Shaped exactly like a command hydrated by lib/trusted-commands.js: real executable/args plus
// the non-serializable TRUSTED_MARKER. Legitimate here because this test file is trusted,
// version-controlled code exercising ExecutionEngine's own scheduling/lifecycle behavior
// directly, independent of the planner/registry.
function nodeCommand(id, source, timeoutMs = 5000) {
    return {
        id,
        command: `node -e ${JSON.stringify(source)}`,
        executable: process.execPath,
        args: ['-e', source],
        category: 'unit',
        exclusiveGroup: null,
        workspaceWriter: false,
        timeoutMs,
        phase: 'focused',
        reasons: ['fixture'],
        [TRUSTED_MARKER]: true,
    };
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

// --- Command-trust repair: registry, hydration, and engine defense in depth ---

test('trusted-commands registry rejects an unknown command id', () => {
    assert.throws(
        () => hydrateTrustedCommand({ id: 'test:does-not-exist.js', phase: 'focused', category: 'unit', reasons: ['x'] }),
        /Unknown trusted command id/
    );
});

test('hydrateTrustedCommand carries planner-provided scheduling metadata and stamps the trust marker', () => {
    const hydrated = hydrateTrustedCommand({
        id: 'test:validate_utf8_docs.js', phase: 'boundary', category: 'validate', reasons: ['x'],
        exclusiveGroup: 'custom-group', workspaceWriter: true,
    });
    assert.strictEqual(hydrated.exclusiveGroup, 'custom-group');
    assert.strictEqual(hydrated.workspaceWriter, true);
    assert.strictEqual(hydrated.category, 'validate');
    assert.strictEqual(hydrated.phase, 'boundary');
    assert.strictEqual(hydrated[TRUSTED_MARKER], true);
    assert.strictEqual(hydrated.executable, process.execPath);
});

test('engine rejects a .cmd executable even when marked trusted', async () => {
    const root = fixture();
    const cmdFile = path.join(root, 'probe.cmd');
    fs.writeFileSync(cmdFile, '@echo off\r\necho ran\r\n');
    const command2 = { id: 'fake-cmd', command: 'probe.cmd', executable: cmdFile, args: [], category: 'unit', exclusiveGroup: null, workspaceWriter: false, timeoutMs: 5000, phase: 'focused', reasons: ['fixture'], [TRUSTED_MARKER]: true };
    const plan = commandPlan(root, [command2]);
    const engine = new ExecutionEngine(plan, fakePreflight(), { runDirectory: path.join(root, '.test-runs', 'cmd-reject'), skipIdentityCheck: true });
    await assert.rejects(() => engine.run(), /\.cmd\/\.bat executables are never allowed/);
});

test('engine rejects a .bat executable even when marked trusted', async () => {
    const root = fixture();
    const batFile = path.join(root, 'probe.bat');
    fs.writeFileSync(batFile, '@echo off\r\necho ran\r\n');
    const command2 = { id: 'fake-bat', command: 'probe.bat', executable: batFile, args: [], category: 'unit', exclusiveGroup: null, workspaceWriter: false, timeoutMs: 5000, phase: 'focused', reasons: ['fixture'], [TRUSTED_MARKER]: true };
    const plan = commandPlan(root, [command2]);
    const engine = new ExecutionEngine(plan, fakePreflight(), { runDirectory: path.join(root, '.test-runs', 'bat-reject'), skipIdentityCheck: true });
    await assert.rejects(() => engine.run(), /\.cmd\/\.bat executables are never allowed/);
});

test('engine rejects a forged plain "trusted" field (not the real marker)', async () => {
    const root = fixture();
    const command2 = {
        id: 'forged', command: 'node -e ...', executable: process.execPath, args: ['-e', 'process.exit(0)'],
        category: 'unit', exclusiveGroup: null, workspaceWriter: false, timeoutMs: 5000, phase: 'focused', reasons: ['fixture'],
        trusted: true,
    };
    const plan = commandPlan(root, [command2]);
    const engine = new ExecutionEngine(plan, fakePreflight(), { runDirectory: path.join(root, '.test-runs', 'forged-trusted'), skipIdentityCheck: true });
    await assert.rejects(() => engine.run(), /not hydrated from the trusted command registry/);
});

test('argv is preserved exactly for shell metacharacters and unicode (shell:false)', async () => {
    const root = fixture();
    const outFile = path.join(root, 'argv-capture.json');
    const probeScript = path.join(root, 'argv-probe.js');
    fs.writeFileSync(probeScript, `require('fs').writeFileSync(${JSON.stringify(outFile)}, JSON.stringify(process.argv.slice(2)));`);
    const dangerousArgs = [
        'plain text with spaces',
        'quoted "like this"',
        'unicode 日本語 テスト',
        'path with spaces/and/slashes',
        'ampersand & echo SECOND> SENTINEL.txt',
        'and-and && echo SECOND2 > SENTINEL2.txt',
        'pipe | echo THIRD',
        'or-or || echo FOURTH',
        'redirect > REDIRECT_POISON.txt',
        'input < REDIRECT_SOURCE.txt',
        'caret ^ literal',
        'percent %PATH% expansion',
        'parens (a) (b)',
    ];
    const probeCommand = {
        id: 'argv-probe', command: 'node argv-probe.js', executable: process.execPath,
        args: [probeScript, ...dangerousArgs],
        category: 'unit', exclusiveGroup: null, workspaceWriter: false, timeoutMs: 10000, phase: 'focused', reasons: ['fixture'],
        [TRUSTED_MARKER]: true,
    };
    const plan = commandPlan(root, [probeCommand]);
    const result = await new ExecutionEngine(plan, fakePreflight(), { runDirectory: path.join(root, '.test-runs', 'argv-probe'), skipIdentityCheck: true }).run();
    assert.strictEqual(result.commands[0].status, 'PASS');
    const captured = JSON.parse(fs.readFileSync(outFile, 'utf8'));
    assert.deepStrictEqual(captured, dangerousArgs);
    assert(!fs.existsSync(path.join(root, 'SENTINEL.txt')), 'no second command should have run via &');
    assert(!fs.existsSync(path.join(root, 'SENTINEL2.txt')), 'no second command should have run via &&');
    assert(!fs.existsSync(path.join(root, 'REDIRECT_POISON.txt')), 'no redirection should have been performed via >');
});

// --- Command-trust repair: plan-trust validation, canonical regeneration, and tamper rejection ---

test('loadTrustedPlan accepts an untampered, freshly regenerated plan', () => {
    const root = fixtureWithDirtyDocsChange();
    const plan = makePlan({ root, base: 'HEAD', head: 'HEAD', mode: 'verify' });
    const planPath = writePlanFile(root, plan);
    const hydrated = loadTrustedPlan(planPath, { root });
    assert(hydrated.selectedCommands.some((item) => item.id === 'test:validate_utf8_docs.js'));
    assert(hydrated.selectedCommands.every((item) => item[TRUSTED_MARKER] === true));
});

test('loadTrustedPlan rejects a stale schemaVersion-1 plan with authoritative executable fields', () => {
    const root = fixtureWithDirtyDocsChange();
    const plan = makePlan({ root, base: 'HEAD', head: 'HEAD', mode: 'verify' });
    const stale = tamperedCopy(plan, (p) => {
        p.schemaVersion = 1;
        p.selectedCommands = p.selectedCommands.map((c) => ({ ...c, executable: 'npm.cmd', args: ['test'] }));
    });
    const planPath = writePlanFile(root, stale);
    assert.throws(() => loadTrustedPlan(planPath, { root }), /schemaVersion.*not supported/);
});

test('plan tamper rejection: injected executable field on a selected command', () => {
    const root = fixtureWithDirtyDocsChange();
    const plan = makePlan({ root, base: 'HEAD', head: 'HEAD', mode: 'verify' });
    assertPlanTamperRejected(root, plan, (p) => { p.selectedCommands[0].executable = 'npm.cmd'; }, /carries a "executable" field/);
});

test('plan tamper rejection: injected args field on a selected command', () => {
    const root = fixtureWithDirtyDocsChange();
    const plan = makePlan({ root, base: 'HEAD', head: 'HEAD', mode: 'verify' });
    assertPlanTamperRejected(root, plan, (p) => { p.selectedCommands[0].args = ['test']; }, /carries a "args" field/);
});

test('plan tamper rejection: swapped command id', () => {
    const root = fixtureWithDirtyDocsChange();
    const plan = makePlan({ root, base: 'HEAD', head: 'HEAD', mode: 'verify' });
    assertPlanTamperRejected(root, plan, (p) => { p.selectedCommands[0].id = 'test:check_version_consistency.js'; }, /does not match a freshly regenerated canonical plan/);
});

test('plan tamper rejection: changed phase', () => {
    const root = fixtureWithDirtyDocsChange();
    const plan = makePlan({ root, base: 'HEAD', head: 'HEAD', mode: 'verify' });
    assertPlanTamperRejected(root, plan, (p) => { p.selectedCommands[0].phase = 'boundary'; }, /does not match a freshly regenerated canonical plan/);
});

test('plan tamper rejection: changed category', () => {
    const root = fixtureWithDirtyDocsChange();
    const plan = makePlan({ root, base: 'HEAD', head: 'HEAD', mode: 'verify' });
    assertPlanTamperRejected(root, plan, (p) => { p.selectedCommands[0].category = 'integration'; }, /does not match a freshly regenerated canonical plan/);
});

test('plan tamper rejection: base SHA moved forward to hide a changed file', () => {
    const { root, baseSha } = fixtureWithBaseAndHeadCommits();
    const plan = makePlan({ root, base: baseSha, head: 'HEAD', mode: 'verify' });
    assert(plan.changedFiles.includes('docs/extra.md'));
    const currentHeadSha = command('git', ['rev-parse', 'HEAD'], root);
    assertPlanTamperRejected(root, plan, (p) => { p.baseSha = currentHeadSha; }, /does not match a freshly regenerated canonical plan/);
});

test('plan tamper rejection: head SHA no longer matches current HEAD', () => {
    const root = fixtureWithDirtyDocsChange();
    const plan = makePlan({ root, base: 'HEAD', head: 'HEAD', mode: 'verify' });
    assertPlanTamperRejected(root, plan, (p) => { p.headSha = '1'.repeat(40); }, /does not match current HEAD/);
});

test('plan tamper rejection: injected changed-files entry', () => {
    const root = fixtureWithDirtyDocsChange();
    const plan = makePlan({ root, base: 'HEAD', head: 'HEAD', mode: 'verify' });
    assertPlanTamperRejected(root, plan, (p) => { p.changedFiles.push('docs/injected.md'); }, /does not match a freshly regenerated canonical plan/);
});

test('plan tamper rejection: injected unknown-files entry', () => {
    const root = fixtureWithDirtyDocsChange();
    const plan = makePlan({ root, base: 'HEAD', head: 'HEAD', mode: 'verify' });
    assertPlanTamperRejected(root, plan, (p) => { p.unknownFiles.push('docs/injected.md'); p.requiresFullSuite = true; }, /does not match a freshly regenerated canonical plan/);
});

test('plan tamper rejection: changed mode', () => {
    const root = fixtureWithDirtyDocsChange();
    const plan = makePlan({ root, base: 'HEAD', head: 'HEAD', mode: 'verify' });
    assertPlanTamperRejected(root, plan, (p) => { p.mode = 'focused'; }, /does not match a freshly regenerated canonical plan/);
});

test('plan tamper rejection: changed version', () => {
    const root = fixtureWithDirtyDocsChange();
    const plan = makePlan({ root, base: 'HEAD', head: 'HEAD', mode: 'verify' });
    assertPlanTamperRejected(root, plan, (p) => { p.version = '9.9.9'; }, /does not match package version/);
});

test('plan tamper rejection: changed dirty diff hash', () => {
    const root = fixtureWithDirtyDocsChange();
    const plan = makePlan({ root, base: 'HEAD', head: 'HEAD', mode: 'verify' });
    assertPlanTamperRejected(root, plan, (p) => { p.dirtyDiffHash = 'f'.repeat(64); }, /Working tree changed after planning/);
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
