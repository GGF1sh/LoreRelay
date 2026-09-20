#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { createLocalInstallerGitFixture } = require('./test_helpers/local_installer_git_fixture');

if (process.platform !== 'win32') {
    console.log('SKIP: Antigravity install-chain test exercises install_extension_antigravity.bat.');
    process.exit(0);
}

const root = path.resolve(__dirname, '..');
const fixture = createLocalInstallerGitFixture(root);
const TEMP_REF = 'refs/lorerelay-test/install-chain';
const managedPath = fixture.managedPath;
const markerDir = path.join(fixture.tempRoot, 'markers');
const failedFetchPath = path.join(fixture.tempRoot, 'failed-fetch-managed');

const EXT_STUB = `param([string]$Target)
$markerDir = $env:LORERELAY_TEST_MARKER_DIR
if ($markerDir) { New-Item -ItemType Directory -Path $markerDir -Force | Out-Null; Set-Content -LiteralPath (Join-Path $markerDir 'ext_invoked.txt') -Value "target=$Target;root=$PSScriptRoot" -Encoding UTF8 }
if ($env:LORERELAY_TEST_EXT_EXIT) { exit [int]$env:LORERELAY_TEST_EXT_EXIT }
exit 0
`;
const SKILL_STUB = `param([string]$ProjectDir = $PSScriptRoot)
$markerDir = $env:LORERELAY_TEST_MARKER_DIR
if ($markerDir) { New-Item -ItemType Directory -Path $markerDir -Force | Out-Null; Set-Content -LiteralPath (Join-Path $markerDir 'skill_invoked.txt') -Value "projectDir=$ProjectDir;root=$PSScriptRoot" -Encoding UTF8 }
if ($env:LORERELAY_TEST_SKILL_EXIT) { exit [int]$env:LORERELAY_TEST_SKILL_EXIT }
exit 0
`;

function ok(message) { console.log(`OK: ${message}`); }
function git(args, options = {}) { return fixture.git(args, options); }
function createStubInstallerCommit() {
    const head = git(['rev-parse', 'HEAD']);
    const index = path.join(fixture.tempRoot, 'stub-index');
    const env = { GIT_INDEX_FILE: index };
    git(['read-tree', 'HEAD^{tree}'], { env });
    const ext = git(['hash-object', '-w', '--stdin'], { env, input: EXT_STUB });
    const skill = git(['hash-object', '-w', '--stdin'], { env, input: SKILL_STUB });
    git(['update-index', '--add', '--cacheinfo', `100644,${ext},scripts/install_vscode_extension.ps1`], { env });
    git(['update-index', '--add', '--cacheinfo', `100644,${skill},scripts/install_antigravity_skill.ps1`], { env });
    const tree = git(['write-tree'], { env });
    const sha = git(['commit-tree', tree, '-p', head, '-m', 'test: fixture-only installer stubs'], { env });
    git(['update-ref', TEMP_REF, sha]);
    return sha;
}
function runBat(env) {
    return fixture.run('cmd.exe', ['/c', fixture.batPath], {
        cwd: fixture.source,
        env: { LORERELAY_INSTALLER_NO_PAUSE: '1', ...env },
        timeoutMs: 180000,
    });
}
function assertExit(result, expected, label) {
    assert.strictEqual(result.status, expected, `${label}\n${result.stdout}\n${result.stderr}`);
}
const extMarker = () => path.join(markerDir, 'ext_invoked.txt');
const skillMarker = () => path.join(markerDir, 'skill_invoked.txt');
function clearMarkers() { fs.rmSync(markerDir, { recursive: true, force: true }); fs.mkdirSync(markerDir, { recursive: true }); }

const branchBefore = git(['branch', '--show-current']);
const headBefore = git(['rev-parse', 'HEAD']);
const statusBefore = git(['status', '--short']);
try {
    console.log(`Local fixture origin: ${fixture.bareOrigin}`);
    fixture.assertLocalRemotes();
    fs.mkdirSync(markerDir, { recursive: true });
    const stubSha = createStubInstallerCommit();
    const baseEnv = { LORERELAY_INSTALLER_WORKTREE: managedPath, LORERELAY_INSTALLER_REF: stubSha, LORERELAY_TEST_MARKER_DIR: markerDir };

    fixture.withOfflineOrigin(() => {
        const failed = runBat({ ...baseEnv, LORERELAY_INSTALLER_WORKTREE: failedFetchPath, LORERELAY_BOOTSTRAP_PREPARE_ONLY: '1' });
        assert.notStrictEqual(failed.status, 0);
        assert.match(failed.stdout, /git fetch origin failed/);
        assert.strictEqual(fs.existsSync(failedFetchPath), false);
        assert.ok(!fs.existsSync(extMarker()) && !fs.existsSync(skillMarker()));
    });
    ok('local-origin fetch failure skips both installers and creates no managed worktree');

    let result = runBat({ ...baseEnv, LORERELAY_BOOTSTRAP_PREPARE_ONLY: '1' });
    assertExit(result, 0, 'prepare-only should exit 0');
    assert.match(result.stdout, /Prepare-only mode requested/);
    assert.ok(!fs.existsSync(extMarker()) && !fs.existsSync(skillMarker()));
    ok('prepare-only invokes neither installer');

    const tscStub = path.join(managedPath, 'node_modules', 'typescript', 'bin', 'tsc');
    fs.mkdirSync(path.dirname(tscStub), { recursive: true });
    fs.writeFileSync(tscStub, '// fixture dependency-presence probe\n', 'utf8');

    clearMarkers();
    result = runBat(baseEnv);
    assertExit(result, 0, 'both-success chain should exit 0');
    assert.ok(fs.existsSync(extMarker()) && fs.existsSync(skillMarker()));
    assert.match(result.stdout, /GM Skill installed and SHA-256 verified from managed checkout/);
    ok('extension success invokes Skill afterward and both success exits 0');

    const skillInfo = fs.readFileSync(skillMarker(), 'utf8');
    const managedScripts = path.join(managedPath, 'scripts');
    assert.ok(skillInfo.includes(`root=${managedScripts}`) && skillInfo.includes(`projectDir=${managedScripts}`));
    assert.ok(!skillInfo.includes(`root=${path.join(fixture.source, 'scripts')}`));
    ok('Skill installer runs from the managed checkout');

    clearMarkers();
    result = runBat({ ...baseEnv, LORERELAY_TEST_EXT_EXIT: '3' });
    assertExit(result, 3, 'extension failure must propagate');
    assert.ok(fs.existsSync(extMarker()) && !fs.existsSync(skillMarker()));
    assert.match(result.stdout, /Skipping Antigravity GM Skill installation/);
    ok('extension failure skips Skill and propagates its exit code');

    clearMarkers();
    result = runBat({ ...baseEnv, LORERELAY_TEST_SKILL_EXIT: '5' });
    assertExit(result, 5, 'Skill failure must propagate');
    assert.ok(fs.existsSync(extMarker()) && fs.existsSync(skillMarker()));
    assert.match(result.stdout, /GM Skill installation\/verification failed/);
    ok('Skill failure propagates its exit code');

    const productionBat = fs.readFileSync(path.join(root, 'install_extension_antigravity.bat'), 'utf8');
    const productionSkill = fs.readFileSync(path.join(root, 'scripts', 'install_antigravity_skill.ps1'), 'utf8');
    assert.ok(productionBat.includes('set "INSTALLER_REF=origin/main"'));
    assert.ok(productionBat.includes('git -C "%SOURCE_DIR%" fetch origin'));
    assert.ok(productionBat.includes('%MANAGED_PATH%\\scripts\\install_antigravity_skill.ps1'));
    assert.ok(productionSkill.includes('Assert-InstalledSkillMatchesSource'));
    ok('production BAT default ref, real fetch, and SHA-256 authority remain unchanged');

    assert.strictEqual(git(['branch', '--show-current']), branchBefore);
    assert.strictEqual(git(['rev-parse', 'HEAD']), headBefore);
    assert.strictEqual(git(['status', '--short']), statusBefore);
    ok('fixture source branch, HEAD, and dirty state remain unchanged');
    console.log('Antigravity canonical install chain tests passed.');
} finally {
    fixture.run('git', ['-C', fixture.source, 'update-ref', '-d', TEMP_REF]);
    fixture.cleanup();
}
