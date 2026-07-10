#!/usr/bin/env node
'use strict';

// MEDIA-M1.1 canonical install chain: the single human-facing BAT
// (install_extension_antigravity.bat) must install the Antigravity extension AND then the
// repo-owned GM Skill from the SAME managed checkout, failing overall if either step fails.
//
// This exercises the real BAT end-to-end without installing anything: a throwaway commit is
// built with git plumbing whose scripts/install_vscode_extension.ps1 and
// scripts/install_antigravity_skill.ps1 are stubs that record invocation and return a
// caller-chosen exit code. The BAT resets its managed worktree to that commit, so the BAT's
// real orchestration (ordering, conditional skip, exit-code propagation, managed-checkout
// source) is observed directly.

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const batPath = path.join(root, 'install_extension_antigravity.bat');
const TEMP_REF = 'refs/lorerelay-test/install-chain';

function ok(message) { console.log(`OK: ${message}`); }

function git(args, options = {}) {
    const result = spawnSync('git', args, {
        cwd: root,
        encoding: 'utf8',
        input: options.input,
        env: options.env || process.env,
    });
    if (result.status !== 0) {
        throw new Error(`git ${args.join(' ')} failed\n${result.stdout}\n${result.stderr}`);
    }
    return result.stdout.trim();
}

const EXT_STUB = `param([string]$Target)
$markerDir = $env:LORERELAY_TEST_MARKER_DIR
if ($markerDir) {
    New-Item -ItemType Directory -Path $markerDir -Force | Out-Null
    Set-Content -LiteralPath (Join-Path $markerDir 'ext_invoked.txt') -Value "target=$Target;root=$PSScriptRoot" -Encoding UTF8
}
if ($env:LORERELAY_TEST_EXT_EXIT) { exit [int]$env:LORERELAY_TEST_EXT_EXIT }
exit 0
`;

const SKILL_STUB = `param([string]$ProjectDir = $PSScriptRoot)
$markerDir = $env:LORERELAY_TEST_MARKER_DIR
if ($markerDir) {
    New-Item -ItemType Directory -Path $markerDir -Force | Out-Null
    Set-Content -LiteralPath (Join-Path $markerDir 'skill_invoked.txt') -Value "projectDir=$ProjectDir;root=$PSScriptRoot" -Encoding UTF8
}
if ($env:LORERELAY_TEST_SKILL_EXIT) { exit [int]$env:LORERELAY_TEST_SKILL_EXIT }
exit 0
`;

/** Build a dangling commit identical to HEAD except the two managed installer scripts are stubs. */
function createStubInstallerCommit(tempDir) {
    const headSha = git(['rev-parse', 'HEAD']);
    const baseTree = git(['rev-parse', 'HEAD^{tree}']);
    const indexFile = path.join(tempDir, 'stub-index');
    const env = { ...process.env, GIT_INDEX_FILE: indexFile };

    git(['read-tree', baseTree], { env });
    const extBlob = git(['hash-object', '-w', '--stdin'], { input: EXT_STUB });
    const skillBlob = git(['hash-object', '-w', '--stdin'], { input: SKILL_STUB });
    git(['update-index', '--add', '--cacheinfo', `100644,${extBlob},scripts/install_vscode_extension.ps1`], { env });
    git(['update-index', '--add', '--cacheinfo', `100644,${skillBlob},scripts/install_antigravity_skill.ps1`], { env });
    const stubTree = git(['write-tree'], { env });
    const stubSha = git(['commit-tree', stubTree, '-p', headSha, '-m', 'test: stub managed installers (throwaway)']);
    // Keep it reachable for the duration of the test.
    git(['update-ref', TEMP_REF, stubSha]);
    return stubSha;
}

function runBat(env) {
    return spawnSync('cmd.exe', ['/c', batPath], {
        cwd: root,
        encoding: 'utf8',
        env: { ...process.env, LORERELAY_INSTALLER_NO_PAUSE: '1', ...env },
        timeout: 180000,
    });
}

function cleanupWorktree(managedPath) {
    if (!fs.existsSync(managedPath)) { return; }
    const probe = spawnSync('git', ['-C', managedPath, 'rev-parse', '--show-toplevel'], { encoding: 'utf8' });
    if (probe.status === 0) {
        spawnSync('git', ['-C', root, 'worktree', 'remove', '--force', managedPath], { encoding: 'utf8' });
    }
    fs.rmSync(managedPath, { recursive: true, force: true });
}

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'lorerelay-chain-test-'));
const managedPath = path.join(tempRoot, 'managed');
const markerDir = path.join(tempRoot, 'markers');

const branchBefore = git(['branch', '--show-current']);
const headBefore = git(['rev-parse', 'HEAD']);
const statusBefore = git(['status', '--short']);

const extMarker = () => path.join(markerDir, 'ext_invoked.txt');
const skillMarker = () => path.join(markerDir, 'skill_invoked.txt');
const clearMarkers = () => { fs.rmSync(markerDir, { recursive: true, force: true }); fs.mkdirSync(markerDir, { recursive: true }); };

try {
    const stubSha = createStubInstallerCommit(tempRoot);
    fs.mkdirSync(markerDir, { recursive: true });

    const baseEnv = {
        LORERELAY_INSTALLER_WORKTREE: managedPath,
        LORERELAY_INSTALLER_REF: stubSha,
        LORERELAY_TEST_MARKER_DIR: markerDir,
    };

    // F. Prepare-only stops before BOTH installations.
    let result = runBat({ ...baseEnv, LORERELAY_BOOTSTRAP_PREPARE_ONLY: '1' });
    assert.strictEqual(result.status, 0, `prepare-only should exit 0\n${result.stdout}\n${result.stderr}`);
    assert.match(result.stdout, /Prepare-only mode requested/);
    assert.ok(!fs.existsSync(extMarker()), 'prepare-only must not invoke the extension installer');
    assert.ok(!fs.existsSync(skillMarker()), 'prepare-only must not invoke the Skill installer');
    ok('F: prepare-only mode invokes neither the extension nor the Skill installer');

    // Skip the slow `npm ci` in the managed checkout: the BAT reuses node_modules when present,
    // and `git clean` in the BAT explicitly excludes node_modules.
    const tscStub = path.join(managedPath, 'node_modules', 'typescript', 'bin', 'tsc');
    fs.mkdirSync(path.dirname(tscStub), { recursive: true });
    fs.writeFileSync(tscStub, '// stub for dependency-presence probe\n');

    // A + D + G. Extension success -> Skill installer invoked; both succeed -> BAT exits 0.
    clearMarkers();
    result = runBat(baseEnv);
    assert.strictEqual(result.status, 0, `both-success chain should exit 0\n${result.stdout}\n${result.stderr}`);
    assert.ok(fs.existsSync(extMarker()), 'extension installer must be invoked');
    assert.ok(fs.existsSync(skillMarker()), 'Skill installer must be invoked after extension success');
    ok('A: extension success invokes the Skill installer');
    ok('D: both installers succeeding exits the root BAT with 0');
    ok('G: one human action (install_extension_antigravity.bat) performs both installations');

    // E. Skill source comes from the managed checkout, not the source working tree.
    const skillInfo = fs.readFileSync(skillMarker(), 'utf8');
    const managedScripts = path.join(managedPath, 'scripts');
    assert.ok(skillInfo.includes(`root=${managedScripts}`),
        `Skill installer must run from the managed checkout scripts dir. marker: ${skillInfo}`);
    assert.ok(skillInfo.includes(`projectDir=${managedScripts}`),
        `Skill installer must receive the managed checkout as -ProjectDir. marker: ${skillInfo}`);
    assert.ok(!skillInfo.includes(`root=${path.join(root, 'scripts')}`),
        'Skill installer must not run from the source working tree');
    assert.match(result.stdout, /GM Skill installed and SHA-256 verified from managed checkout/);
    ok('E: Skill installer runs from the managed checkout SHA, not the source working tree');

    // B. Extension failure -> Skill installer is never invoked; overall failure.
    clearMarkers();
    result = runBat({ ...baseEnv, LORERELAY_TEST_EXT_EXIT: '3' });
    assert.strictEqual(result.status, 3, `extension failure must propagate\n${result.stdout}\n${result.stderr}`);
    assert.ok(fs.existsSync(extMarker()), 'extension installer should have been attempted');
    assert.ok(!fs.existsSync(skillMarker()), 'Skill installer must NOT run when the extension install fails');
    assert.match(result.stdout, /Skipping Antigravity GM Skill installation/);
    ok('B: extension failure skips the Skill installer and fails the root BAT');

    // C. Skill failure (e.g. hash verification) -> overall root BAT failure.
    clearMarkers();
    result = runBat({ ...baseEnv, LORERELAY_TEST_SKILL_EXIT: '5' });
    assert.strictEqual(result.status, 5, `Skill failure must propagate\n${result.stdout}\n${result.stderr}`);
    assert.ok(fs.existsSync(extMarker()), 'extension installer runs first');
    assert.ok(fs.existsSync(skillMarker()), 'Skill installer runs after extension success');
    assert.match(result.stdout, /GM Skill installation\/verification failed/);
    assert.doesNotMatch(result.stdout, /GM Skill installed and SHA-256 verified/);
    ok('C: Skill install/verification failure fails the root BAT overall');

    // The real (non-stub) BAT + installer wiring must still reference the mandatory authority.
    const batText = fs.readFileSync(batPath, 'utf8');
    assert.ok(batText.includes('scripts\\install_antigravity_skill.ps1'),
        'root BAT must invoke the managed Skill installer');
    assert.ok(batText.includes('%MANAGED_PATH%\\scripts\\install_antigravity_skill.ps1'),
        'root BAT must take the Skill installer from the managed checkout');
    const skillPs1 = fs.readFileSync(path.join(root, 'scripts', 'install_antigravity_skill.ps1'), 'utf8');
    assert.ok(skillPs1.includes('Assert-InstalledSkillMatchesSource'),
        'SHA-256 authority must remain inside install_antigravity_skill.ps1');
    ok('mandatory SHA-256 authority remains in install_antigravity_skill.ps1');

    // Source worktree must be untouched by the whole exercise.
    assert.strictEqual(git(['branch', '--show-current']), branchBefore);
    assert.strictEqual(git(['rev-parse', 'HEAD']), headBefore);
    assert.strictEqual(git(['status', '--short']), statusBefore);
    ok('source worktree branch, HEAD, and dirty state are unchanged');

    console.log('Antigravity canonical install chain tests passed.');
} finally {
    cleanupWorktree(managedPath);
    spawnSync('git', ['update-ref', '-d', TEMP_REF], { cwd: root, encoding: 'utf8' });
    fs.rmSync(tempRoot, { recursive: true, force: true });
}
