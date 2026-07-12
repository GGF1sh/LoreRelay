#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { createLocalInstallerGitFixture } = require('./test_helpers/local_installer_git_fixture');

const root = path.resolve(__dirname, '..');
const fixture = createLocalInstallerGitFixture(root);
const managedPath = fixture.managedPath;
const wrongPath = path.join(fixture.tempRoot, 'not-a-worktree');
const invalidRefPath = path.join(fixture.tempRoot, 'invalid-ref-managed');
const failedFetchPath = path.join(fixture.tempRoot, 'failed-fetch-managed');

function ok(message) { console.log(`OK: ${message}`); }
function git(args) { return fixture.git(args); }
function runBootstrap(target, ref) {
    return fixture.run('cmd.exe', ['/c', fixture.batPath], {
        cwd: fixture.source,
        env: {
            LORERELAY_INSTALLER_WORKTREE: target,
            LORERELAY_INSTALLER_REF: ref,
            LORERELAY_BOOTSTRAP_PREPARE_ONLY: '1',
            LORERELAY_INSTALLER_NO_PAUSE: '1',
        },
        timeoutMs: 120000,
    });
}
function assertExit(result, expected, label) {
    assert.strictEqual(result.status, expected, `${label}\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`);
}

const branchBefore = git(['branch', '--show-current']);
const headBefore = git(['rev-parse', 'HEAD']);
const statusBefore = git(['status', '--short']);
try {
    console.log(`Local fixture origin: ${fixture.bareOrigin}`);
    fixture.assertLocalRemotes();
    const mainSha = git(['rev-parse', 'origin/main']);

    let result = runBootstrap(managedPath, 'origin/main');
    assertExit(result, 0, 'valid managed worktree creation should succeed');
    assert.match(result.stdout, /Fetching origin in source repository/);
    assert.strictEqual(git(['-C', managedPath, 'rev-parse', 'HEAD']), mainSha);
    ok('local origin/main fetch creates the managed worktree at the requested ref');

    const updatedMainSha = fixture.pushRemoteMainUpdate();
    result = runBootstrap(managedPath, 'origin/main');
    assertExit(result, 0, 'local remote update should be fetched');
    assert.strictEqual(git(['rev-parse', 'origin/main']), updatedMainSha);
    assert.strictEqual(git(['-C', managedPath, 'rev-parse', 'HEAD']), updatedMainSha);
    ok('real fetch observes a new commit pushed to the local bare origin');

    result = runBootstrap(managedPath, 'HEAD');
    assertExit(result, 0, 'valid managed worktree update should succeed');
    assert.match(result.stdout, /Managed path identity validated/);
    assert.strictEqual(git(['-C', managedPath, 'rev-parse', 'HEAD']), headBefore);
    ok('existing managed worktree updates to the source HEAD');

    fs.mkdirSync(wrongPath, { recursive: true });
    fs.writeFileSync(path.join(wrongPath, 'keep.txt'), 'do not delete', 'utf8');
    result = runBootstrap(wrongPath, 'HEAD');
    assert.notStrictEqual(result.status, 0);
    assert.match(result.stdout, /managed path exists but is not a Git worktree/);
    assert.strictEqual(fs.readFileSync(path.join(wrongPath, 'keep.txt'), 'utf8'), 'do not delete');
    ok('unmanaged directory is refused without deletion');

    result = runBootstrap(invalidRefPath, 'refs/heads/definitely-not-a-real-ref-for-lorerelay');
    assert.notStrictEqual(result.status, 0);
    assert.match(result.stdout, /installer ref could not be resolved/);
    assert.strictEqual(fs.existsSync(invalidRefPath), false);
    ok('invalid ref fails before worktree creation');

    fixture.withOfflineOrigin(() => {
        result = runBootstrap(failedFetchPath, 'origin/main');
        assert.notStrictEqual(result.status, 0);
        assert.match(result.stdout, /git fetch origin failed/);
        assert.strictEqual(fs.existsSync(failedFetchPath), false);
    });
    ok('local-origin fetch failure fails before a managed worktree is created');

    assert.strictEqual(git(['branch', '--show-current']), branchBefore);
    assert.strictEqual(git(['rev-parse', 'HEAD']), headBefore);
    assert.strictEqual(git(['status', '--short']), statusBefore);
    ok('fixture source branch, HEAD, and dirty state remain unchanged');
    console.log('Antigravity installer bootstrap tests passed.');
} finally {
    fixture.cleanup();
}
