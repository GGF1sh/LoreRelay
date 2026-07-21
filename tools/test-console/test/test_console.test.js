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

// TEST-IMPACT-COMBAT-SELECTION-001: a PR7-like Combat diff must plan complete,
// stay focused (no full-suite), select the relevant Combat group(s) plus the
// required boundaries, and select nothing from an unrelated test domain.
test('a PR7-like Combat diff plans complete, focused, and free of unrelated domains', () => {
    const plan = makePlan({
        root: fixture(),
        base: 'HEAD',
        head: 'HEAD',
        mode: 'verify',
        changedFiles: [
            'src/gambitCombatCore.ts',
            'src/combatRtsReplayHashDeterminismV1.test.ts',
            'scripts/combat_test_manifest.js',
            'docs/COMBAT_RTS_COMMAND_SPINE_DESIGN.md',
            'docs/generated/SYMBOL_REGISTRY.md',
            'docs/generated/symbol_registry.json',
        ],
    });
    assert.strictEqual(plan.complete, true);
    assert.deepStrictEqual(plan.unknownFiles, []);
    assert.strictEqual(plan.requiresFullSuite, false);

    const ids = plan.selectedCommands.map((item) => item.id);
    assert(ids.includes('test:combat:rts-replay-hash'), 'the changed Combat test file must select its owning Combat group');
    assert(ids.includes('boundary:compile'), 'compile boundary must be selected');
    assert(ids.includes('boundary:symbol-registry'), 'Symbol Registry boundary must be selected (generated Registry files changed)');
    assert(ids.includes('test:test_symbol_registry.js'), 'the Symbol Registry rule must recognize the real docs/generated/*symbol_registry* filenames');
    assert(ids.includes('test:test_combat_manifest_coverage.js'), 'Combat manifest coverage guard must be selected (manifest file changed)');
    assert(ids.includes('test:validate_utf8_docs.js'), 'UTF-8 documentation validation must be selected (Combat docs changed)');

    // No unrelated test domain: nothing installer/webview/economy/simulation/full-suite-flavored.
    assert(!ids.includes('full-suite'));
    for (const id of ids) {
        assert(!/installer|install_chain|webview|simulation|noai_soak/i.test(id), `unexpected unrelated command selected: ${id}`);
    }
});

test('a changed focused Combat test maps to its owning COMBAT_TEST_GROUPS group, not every group', () => {
    const plan = makePlan({
        root: fixture(),
        base: 'HEAD',
        head: 'HEAD',
        mode: 'focused',
        changedFiles: ['src/combatRtsAttackMoveV1.test.ts'],
    });
    const combatIds = plan.selectedCommands.map((item) => item.id).filter((id) => id.startsWith('test:combat:'));
    assert.deepStrictEqual(combatIds, ['test:combat:rts-attack-move']);
});

test('Combat group inference resolves a shared runtime file via its test sources’ own imports', () => {
    // Uses the real repository root (not the isolated fixture) so reference
    // inference reads real src/*.ts test sources on disk — this is the one
    // test in this file that intentionally exercises that live-repo path,
    // proving the mechanism functions end-to-end and not merely in theory.
    const plan = makePlan({
        base: 'HEAD',
        head: 'HEAD',
        mode: 'focused',
        changedFiles: ['src/gambitCombatCore.ts'],
    });
    const combatIds = plan.selectedCommands.map((item) => item.id).filter((id) => id.startsWith('test:combat:'));
    // gambitCombatCore.ts is imported by many Combat test sources across
    // several distinct groups (golden-master, rts-* groups, mechanics-
    // resolver, direct-mode, pr-regressions) — assert a defensible, non-
    // trivial subset without hard-coding the exact count, which would go
    // stale as new Combat groups are added.
    assert(combatIds.includes('test:combat:golden-master'));
    assert(combatIds.includes('test:combat:rts-replay-hash'));
    assert(combatIds.length >= 5, `expected several affected Combat groups, got: ${combatIds.join(', ')}`);
    // Never the whole manifest — combat:ability-validator's own test source
    // does not import gambitCombatCore, so it must not be swept in.
    assert(!combatIds.includes('test:combat:ability-validator'));
});

test('a Combat manifest change selects the manifest coverage guard directly, without forcing full-suite', () => {
    const plan = makePlan({
        root: fixture(),
        base: 'HEAD',
        head: 'HEAD',
        mode: 'verify',
        changedFiles: ['scripts/combat_test_manifest.js'],
    });
    assert.strictEqual(plan.complete, true);
    assert.strictEqual(plan.requiresFullSuite, false);
    assert(plan.selectedCommands.some((item) => item.id === 'test:test_combat_manifest_coverage.js'));
    assert(!plan.selectedCommands.some((item) => item.id === 'full-suite'));
});

test('a genuinely unknown Combat-adjacent file still fails closed to full-suite', () => {
    // Not a .ts/.test.ts file, so none of the new combat-runtime patterns
    // match it — proves the broadened Combat rules did not widen the
    // fail-closed safety net. Deliberately outside src/** (already covered
    // by the pre-existing typescript-source rule for any extension) and
    // outside every other rule's patterns.
    const plan = makePlan({
        root: fixture(),
        base: 'HEAD',
        head: 'HEAD',
        mode: 'focused',
        changedFiles: ['extension/combat_mystery.bin'],
    });
    assert.strictEqual(plan.complete, false);
    assert.strictEqual(plan.requiresFullSuite, true);
    assert.deepStrictEqual(plan.unknownFiles, ['extension/combat_mystery.bin']);
    assert(plan.selectedCommands.some((item) => item.id === 'full-suite'));
});

test('dirty and untracked Combat files are collected and classified as known', () => {
    const root = fixture();
    fs.mkdirSync(path.join(root, 'src'), { recursive: true });
    fs.writeFileSync(path.join(root, 'src', 'combatFixtureRuntime.ts'), 'export const combatFixtureRuntime = true;\n');
    const files = collectChangedFiles(root, 'HEAD', 'HEAD');
    assert(files.includes('src/combatFixtureRuntime.ts'), 'untracked Combat source must be part of changed-file analysis');

    const plan = makePlan({ root, base: 'HEAD', head: 'HEAD', mode: 'focused' });
    assert.deepStrictEqual(plan.unknownFiles, []);
    assert.strictEqual(plan.requiresFullSuite, false);
    assert(plan.changedFiles.includes('src/combatFixtureRuntime.ts'));
});

// TEST-IMPACT-COMBAT-SELECTION-001 follow-up (PR #39 Codex review): compile
// must execute in an earlier `prereq` phase, strictly before any `focused`
// command that consumes compiled out/ output (inferred Combat node:test
// groups, test_combat_manifest_coverage.js). These four tests exercise the
// real ExecutionEngine's phase ordering directly — not just the planner's
// selectedCommands array order — using fake trusted stand-in commands (the
// same nodeCommand()/commandPlan() pattern already used elsewhere in this
// file) so they run in milliseconds without touching the real out/ directory.

test('prereq phase (compile) executes before the focused phase in the real ExecutionEngine', async () => {
    const root = fixture();
    const orderLog = path.join(root, 'order.log');
    const compileCmd = { ...nodeCommand('boundary:compile', `require('fs').appendFileSync(${JSON.stringify(orderLog)}, 'compile\\n')`), phase: 'prereq' };
    const combatCmd = { ...nodeCommand('test:combat:fake-group', `require('fs').appendFileSync(${JSON.stringify(orderLog)}, 'combat\\n')`), phase: 'focused' };
    // Selected out of order on purpose (combat before compile) - only phase
    // decides execution order, never array position.
    const plan = commandPlan(root, [combatCmd, compileCmd]);
    const engine = new ExecutionEngine(plan, fakePreflight(), { runDirectory: path.join(root, '.test-runs', 'order'), skipIdentityCheck: true });
    const record = await engine.run();
    assert.strictEqual(record.commands.find((c) => c.id === 'boundary:compile').status, 'PASS');
    assert.strictEqual(record.commands.find((c) => c.id === 'test:combat:fake-group').status, 'PASS');
    assert.deepStrictEqual(fs.readFileSync(orderLog, 'utf8').trim().split('\n'), ['compile', 'combat']);
});

test('clean checkout: the focused Combat step only succeeds once the prereq compile step creates the compiled artifact', async () => {
    const root = fixture();
    const artifact = path.join(root, 'out-marker.txt');
    assert.strictEqual(fs.existsSync(artifact), false, 'fixture starts with no compiled artifact, like a clean checkout with no out/');
    const compileCmd = { ...nodeCommand('boundary:compile', `require('fs').writeFileSync(${JSON.stringify(artifact)}, 'built')`), phase: 'prereq' };
    const combatCmd = { ...nodeCommand('test:combat:fake-group', `if (!require('fs').existsSync(${JSON.stringify(artifact)})) process.exit(1)`), phase: 'focused' };
    const plan = commandPlan(root, [combatCmd, compileCmd]);
    const engine = new ExecutionEngine(plan, fakePreflight(), { runDirectory: path.join(root, '.test-runs', 'clean'), skipIdentityCheck: true });
    const record = await engine.run();
    assert.strictEqual(record.commands.find((c) => c.id === 'boundary:compile').status, 'PASS');
    assert.strictEqual(record.commands.find((c) => c.id === 'test:combat:fake-group').status, 'PASS');
});

test('stale worktree: the focused Combat step observes the freshly compiled artifact, never the stale one', async () => {
    const root = fixture();
    const artifact = path.join(root, 'out-marker.txt');
    fs.writeFileSync(artifact, 'stale');
    const compileCmd = { ...nodeCommand('boundary:compile', `require('fs').writeFileSync(${JSON.stringify(artifact)}, 'fresh')`), phase: 'prereq' };
    const observed = path.join(root, 'observed.txt');
    const combatCmd = { ...nodeCommand('test:combat:fake-group', `
        const fs = require('fs');
        const content = fs.readFileSync(${JSON.stringify(artifact)}, 'utf8');
        fs.writeFileSync(${JSON.stringify(observed)}, content);
        if (content !== 'fresh') process.exit(1);
    `), phase: 'focused' };
    const plan = commandPlan(root, [combatCmd, compileCmd]);
    const engine = new ExecutionEngine(plan, fakePreflight(), { runDirectory: path.join(root, '.test-runs', 'stale'), skipIdentityCheck: true });
    const record = await engine.run();
    assert.strictEqual(record.commands.find((c) => c.id === 'test:combat:fake-group').status, 'PASS');
    assert.strictEqual(fs.readFileSync(observed, 'utf8'), 'fresh', 'must observe the artifact compile just wrote, never the pre-existing stale one');
});

test('a failing prereq compile step prevents dependent focused Combat commands from running at all', async () => {
    const root = fixture();
    const combatRan = path.join(root, 'combat-ran.txt');
    const compileCmd = { ...nodeCommand('boundary:compile', 'process.exit(1)'), phase: 'prereq' };
    const combatCmd = { ...nodeCommand('test:combat:fake-group', `require('fs').writeFileSync(${JSON.stringify(combatRan)}, 'ran')`), phase: 'focused' };
    const plan = commandPlan(root, [combatCmd, compileCmd]);
    const engine = new ExecutionEngine(plan, fakePreflight(), { runDirectory: path.join(root, '.test-runs', 'fail'), skipIdentityCheck: true });
    const record = await engine.run();
    assert.strictEqual(record.commands.find((c) => c.id === 'boundary:compile').status, 'FAIL');
    assert.strictEqual(record.commands.find((c) => c.id === 'test:combat:fake-group').status, 'SKIPPED');
    assert.strictEqual(fs.existsSync(combatRan), false, 'the dependent Combat command must never have actually run');
});

test('a Combat manifest change selects compile (prereq) ahead of the manifest coverage guard (focused), with no full-suite', () => {
    const plan = makePlan({ root: fixture(), base: 'HEAD', head: 'HEAD', mode: 'verify', changedFiles: ['scripts/combat_test_manifest.js'] });
    assert.strictEqual(plan.requiresFullSuite, false);
    const compile = plan.selectedCommands.find((c) => c.id === 'boundary:compile');
    const coverage = plan.selectedCommands.find((c) => c.id === 'test:test_combat_manifest_coverage.js');
    assert.ok(compile, 'compile must be selected for a manifest-only change (the coverage guard reads compiled out/ files)');
    assert.ok(coverage, 'the coverage guard must be selected');
    assert.strictEqual(compile.phase, 'prereq');
    assert.strictEqual(coverage.phase, 'focused');
});

test('a multi-runtime Combat diff selects every genuinely affected group, deduplicated, with none lost to the old raw-match cap', () => {
    // Real repository root (not the isolated fixture) so reference inference
    // reads real src/*.ts test sources. This exact 9-file combination
    // reproduces the drop Codex found: under the pre-fix design (one raw
    // match pushed per (changed file, group) pair, sliced to the first 24
    // BEFORE addCommand's own id-based dedup), combat:rts-replay-hash's
    // first raw occurrence fell at index 24 - one past the cap - and was
    // silently discarded while the plan still reported complete: true.
    const changedFiles = [
        'src/combatAbilityValidator.ts',
        'src/combatAbilityWorkshopCore.ts',
        'src/combatDirectHeadlessCore.ts',
        'src/combatDirectInputCore.ts',
        'src/combatLabCore.ts',
        'src/combatLoadoutUiCore.ts',
        'src/combatMechanicsResolver.ts',
        'src/combatModeContract.ts',
        'src/gambitCombatCore.ts',
    ];
    const plan = makePlan({ base: 'HEAD', head: 'HEAD', mode: 'verify', changedFiles });
    const combatIds = plan.selectedCommands.map((item) => item.id).filter((id) => id.startsWith('test:combat:'));
    assert.strictEqual(new Set(combatIds).size, combatIds.length, 'no duplicate Combat group commands');
    for (const required of ['test:combat:golden-master', 'test:combat:rts-multi-unit-supersede', 'test:combat:rts-replay-hash']) {
        assert(combatIds.includes(required), `expected ${required} to be selected; got: ${combatIds.join(', ')}`);
    }
    assert.strictEqual(plan.complete, true, 'complete must only be true when no affected group was actually omitted');
    const again = makePlan({ base: 'HEAD', head: 'HEAD', mode: 'verify', changedFiles });
    assert.deepStrictEqual(again.selectedCommands.map((c) => c.id), plan.selectedCommands.map((c) => c.id), 'selection order must be deterministic across repeated runs');
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

test('full-suite triggers compile prereq on docs-only integration plan', () => {
    const root = fixtureWithDirtyDocsChange();
    const plan = makePlan({ root, base: 'HEAD', head: 'HEAD', mode: 'integration' });
    assert.strictEqual(plan.requiresFullSuite, true);
    const compile = plan.selectedCommands.filter((c) => c.id === 'boundary:compile');
    assert.strictEqual(compile.length, 1);
    assert.strictEqual(compile[0].phase, 'prereq');
    assert.ok(plan.selectedCommands.find((c) => c.id === 'full-suite'));
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

test('focused Combat source plan injects compile prereq exactly once', () => {
    const root = fixture();
    fs.mkdirSync(path.join(root, 'src'), { recursive: true });
    fs.writeFileSync(path.join(root, 'src', 'combatRtsAttackMoveV1.test.ts'), '// changed');
    const plan = makePlan({ root, base: 'HEAD', head: 'HEAD', mode: 'focused', changedFiles: ['src/combatRtsAttackMoveV1.test.ts'] });
    assert.strictEqual(plan.requiresFullSuite, false);
    const compile = plan.selectedCommands.filter((c) => c.id === 'boundary:compile');
    assert.strictEqual(compile.length, 1);
    assert.strictEqual(compile[0].phase, 'prereq');
    const focused = plan.selectedCommands.filter((c) => c.id.startsWith('test:combat:'));
    assert(focused.length > 0);
    assert.strictEqual(focused[0].phase, 'focused');
    const otherBoundaries = plan.selectedCommands.filter((c) => c.phase === 'boundary');
    assert.strictEqual(otherBoundaries.length, 0);
});

test('focused manifest-only plan injects compile exactly once without full-suite', () => {
    const root = fixture();
    fs.mkdirSync(path.join(root, 'scripts'), { recursive: true });
    fs.writeFileSync(path.join(root, 'scripts', 'combat_test_manifest.js'), '// changed');
    const plan = makePlan({ root, base: 'HEAD', head: 'HEAD', mode: 'focused', changedFiles: ['scripts/combat_test_manifest.js'] });
    assert.strictEqual(plan.requiresFullSuite, false);
    const compile = plan.selectedCommands.filter((c) => c.id === 'boundary:compile');
    assert.strictEqual(compile.length, 1);
    assert.strictEqual(compile[0].phase, 'prereq');
    const coverage = plan.selectedCommands.find((c) => c.id === 'test:test_combat_manifest_coverage.js');
    assert.ok(coverage);
    assert.strictEqual(coverage.phase, 'focused');
});

test('resume/reuse regression and mixed reuse: compile is never REUSED_PASS, safe read-only is reused', async () => {
    const root = fixture();
    const artifact = path.join(root, 'out-marker.txt');
    const safeCmd = { ...nodeCommand('safe', 'process.exit(0)'), workspaceWriter: false };
    const compileCmd = { ...nodeCommand('boundary:compile', `require('fs').writeFileSync(${JSON.stringify(artifact)}, 'fresh')`), workspaceWriter: true, phase: 'prereq' };
    const observed = path.join(root, 'observed.txt');
    const combatCmd = { ...nodeCommand('test:combat:rts-attack-move', `
        const fs = require('fs');
        const content = fs.readFileSync(${JSON.stringify(artifact)}, 'utf8');
        fs.writeFileSync(${JSON.stringify(observed)}, content);
        if (content !== 'fresh') process.exit(1);
    `), phase: 'focused' };
    
    const plan = commandPlan(root, [safeCmd, compileCmd, combatCmd]);
    const preflight = fakePreflight();
    
    // First run
    const engine1 = new ExecutionEngine(plan, preflight, { runDirectory: path.join(root, '.test-runs', 'prior'), skipIdentityCheck: true });
    const record1 = await engine1.run();
    assert.strictEqual(record1.commands.find((c) => c.id === 'safe').status, 'PASS');
    assert.strictEqual(record1.commands.find((c) => c.id === 'boundary:compile').status, 'PASS');
    assert.strictEqual(record1.commands.find((c) => c.id === 'test:combat:rts-attack-move').status, 'PASS');
    
    // Mutate ignored out/ marker without changing repository fingerprint
    fs.writeFileSync(artifact, 'stale');
    
    // Resumed exact-fingerprint run
    const engine2 = new ExecutionEngine(plan, preflight, { runDirectory: path.join(root, '.test-runs', 'next'), skipIdentityCheck: true });
    const record2 = await engine2.run();
    
    assert.strictEqual(record2.commands.find((c) => c.id === 'safe').status, 'REUSED_PASS', 'safe read-only command is reused');
    assert.strictEqual(record2.commands.find((c) => c.id === 'boundary:compile').status, 'PASS', 'workspaceWriter is executed again, not REUSED_PASS');
    assert.strictEqual(record2.commands.find((c) => c.id === 'test:combat:rts-attack-move').status, 'PASS', 'focused command sees fresh output and passes');
    assert.strictEqual(fs.readFileSync(observed, 'utf8'), 'fresh', 'focused command observed the new fresh output, not the stale one');
});
