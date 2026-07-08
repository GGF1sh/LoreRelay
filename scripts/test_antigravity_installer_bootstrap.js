#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const batPath = path.join(root, 'install_extension_antigravity.bat');

function run(cmd, args, options = {}) {
    const result = spawnSync(cmd, args, {
        cwd: options.cwd || root,
        encoding: 'utf8',
        env: options.env || process.env,
        timeout: options.timeoutMs || 120000,
    });
    return result;
}

function git(args, options = {}) {
    const result = run('git', args, options);
    if (result.status !== 0) {
        throw new Error(`git ${args.join(' ')} failed\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`);
    }
    return result.stdout.trim();
}

function ok(message) {
    console.log(`OK: ${message}`);
}

function runBootstrap(managedPath, ref) {
    return run('cmd.exe', ['/c', batPath], {
        cwd: root,
        env: {
            ...process.env,
            LORERELAY_INSTALLER_WORKTREE: managedPath,
            LORERELAY_INSTALLER_REF: ref,
            LORERELAY_BOOTSTRAP_PREPARE_ONLY: '1',
            LORERELAY_INSTALLER_NO_PAUSE: '1',
        },
        timeoutMs: 120000,
    });
}

function assertExit(result, expected, label) {
    assert.strictEqual(
        result.status,
        expected,
        `${label}\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`
    );
}

function cleanupWorktree(managedPath) {
    if (!fs.existsSync(managedPath)) {
        return;
    }
    const probe = run('git', ['-C', managedPath, 'rev-parse', '--show-toplevel']);
    if (probe.status === 0) {
        run('git', ['-C', root, 'worktree', 'remove', '--force', managedPath]);
    }
    fs.rmSync(managedPath, { recursive: true, force: true });
}

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'lorerelay-bootstrap-test-'));
const managedPath = path.join(tempRoot, 'managed-installer');
const wrongPath = path.join(tempRoot, 'not-a-worktree');
const invalidRefPath = path.join(tempRoot, 'invalid-ref-managed');

const branchBefore = git(['branch', '--show-current']);
const headBefore = git(['rev-parse', 'HEAD']);
const statusBefore = git(['status', '--short']);

try {
    const mainSha = git(['rev-parse', 'origin/main']);
    const headSha = git(['rev-parse', 'HEAD']);

    let result = runBootstrap(managedPath, 'origin/main');
    assertExit(result, 0, 'valid managed worktree creation should succeed');
    assert.match(result.stdout, /Antigravity installer bootstrap starting/);
    assert.match(result.stdout, /Desired installer checkout SHA:/);
    assert.match(result.stdout, /Prepare-only mode requested/);
    assert.strictEqual(git(['-C', managedPath, 'rev-parse', 'HEAD']), mainSha);
    ok('valid managed worktree is created at requested ref');

    result = runBootstrap(managedPath, 'HEAD');
    assertExit(result, 0, 'valid managed worktree update should succeed');
    assert.match(result.stdout, /Managed path identity validated/);
    assert.strictEqual(git(['-C', managedPath, 'rev-parse', 'HEAD']), headSha);
    ok('valid managed worktree updates to requested ref');

    fs.mkdirSync(wrongPath, { recursive: true });
    fs.writeFileSync(path.join(wrongPath, 'keep.txt'), 'do not delete', 'utf8');
    result = runBootstrap(wrongPath, 'HEAD');
    assert.notStrictEqual(result.status, 0, 'wrong unmanaged directory should fail');
    assert.match(result.stdout, /managed path exists but is not a Git worktree/);
    assert.strictEqual(fs.readFileSync(path.join(wrongPath, 'keep.txt'), 'utf8'), 'do not delete');
    ok('wrong unmanaged existing directory is refused without deletion');

    result = runBootstrap(invalidRefPath, 'refs/heads/definitely-not-a-real-ref-for-lorerelay');
    assert.notStrictEqual(result.status, 0, 'invalid ref should fail');
    assert.match(result.stdout, /installer ref could not be resolved/);
    assert.strictEqual(fs.existsSync(invalidRefPath), false);
    ok('invalid requested ref fails before install or worktree creation');

    assert.strictEqual(git(['branch', '--show-current']), branchBefore);
    assert.strictEqual(git(['rev-parse', 'HEAD']), headBefore);
    assert.strictEqual(git(['status', '--short']), statusBefore);
    ok('source worktree branch, HEAD, and dirty state are unchanged');

    console.log('Antigravity installer bootstrap tests passed.');
} finally {
    cleanupWorktree(managedPath);
    fs.rmSync(tempRoot, { recursive: true, force: true });
}
