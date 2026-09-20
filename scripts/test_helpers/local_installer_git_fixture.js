'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const NETWORK_REMOTE = /(?:https?:\/\/|ssh:\/\/|git@|github\.com)/i;

function fixtureEnv(extra = {}) {
    const env = { ...process.env, ...extra, GIT_TERMINAL_PROMPT: '0' };
    for (const key of ['HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY', 'http_proxy', 'https_proxy', 'all_proxy']) {
        delete env[key];
    }
    return env;
}

function run(command, args, options = {}) {
    return spawnSync(command, args, {
        cwd: options.cwd,
        encoding: 'utf8',
        input: options.input,
        env: fixtureEnv(options.env),
        timeout: options.timeoutMs || 120000,
    });
}

function git(args, options = {}) {
    const result = run('git', args, options);
    if (result.status !== 0) {
        throw new Error(`git ${args.join(' ')} failed\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`);
    }
    return result.stdout.trim();
}

function assertLocalRemotes(repository) {
    const lines = git(['-C', repository, 'remote', '-v']).split(/\r?\n/).filter(Boolean);
    assert(lines.length > 0, `${repository} must have at least one remote`);
    for (const line of lines) {
        const match = line.match(/^\S+\s+(.+?)\s+\((?:fetch|push)\)$/);
        assert(match, `unexpected git remote output: ${line}`);
        const remote = match[1];
        assert(!NETWORK_REMOTE.test(remote), `fixture remote must not be network-addressable: ${remote}`);
        assert(path.isAbsolute(remote), `fixture remote must be an absolute local path: ${remote}`);
    }
    return lines;
}

function createLocalInstallerGitFixture(testRoot) {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'lorerelay-installer-hermetic-'));
    const bareOrigin = path.join(tempRoot, 'origin.git');
    const source = path.join(tempRoot, 'source');
    const managedPath = path.join(tempRoot, 'managed-installer');
    const candidateSha = git(['-C', testRoot, 'rev-parse', 'HEAD']);

    git(['init', '--bare', bareOrigin]);
    git(['-C', bareOrigin, 'config', 'receive.shallowUpdate', 'true']);
    git(['-C', testRoot, 'push', bareOrigin, `${candidateSha}:refs/heads/main`]);
    git(['-C', bareOrigin, 'symbolic-ref', 'HEAD', 'refs/heads/main']);

    assert.strictEqual(git(['-C', bareOrigin, 'symbolic-ref', 'HEAD']), 'refs/heads/main', 'Bare origin HEAD resolves symbolically to refs/heads/main');
    assert.strictEqual(git(['-C', bareOrigin, 'rev-parse', 'refs/heads/main']), candidateSha, 'Bare origin refs/heads/main initially equals the exact fixture baseline SHA');

    git(['clone', bareOrigin, source]);
    
    assert.strictEqual(git(['-C', source, 'rev-parse', 'origin/main']), candidateSha, 'Source fixture origin/main equals the same baseline SHA');

    git(['-C', source, 'checkout', '--detach', candidateSha]);
    git(['-C', source, 'config', 'user.name', 'LoreRelay hermetic test']);
    git(['-C', source, 'config', 'user.email', 'installer-test@example.invalid']);

    const fixture = {
        tempRoot,
        bareOrigin,
        source,
        managedPath,
        candidateSha,
        batPath: path.join(source, 'install_extension_antigravity.bat'),
        run,
        git: (args, options = {}) => git(args, { cwd: source, ...options }),
        env: fixtureEnv,
        assertLocalRemotes: () => assertLocalRemotes(source),
        pushRemoteMainUpdate() {
            const updater = path.join(tempRoot, 'updater');
            git(['clone', bareOrigin, updater]);
            const oldMain = git(['-C', bareOrigin, 'rev-parse', 'refs/heads/main']);
            assert.strictEqual(git(['-C', updater, 'rev-parse', 'HEAD']), oldMain, 'Updater begins from the current fixture main');

            git(['-C', updater, 'config', 'user.name', 'LoreRelay hermetic updater']);
            git(['-C', updater, 'config', 'user.email', 'installer-test@example.invalid']);
            const marker = path.join(updater, 'installer-hermetic-fetch-marker.txt');
            fs.writeFileSync(marker, `${Date.now()}\n`, 'utf8');
            git(['-C', updater, 'add', path.basename(marker)]);
            git(['-C', updater, 'commit', '-m', 'test: local installer origin update']);
            const newSha = git(['-C', updater, 'rev-parse', 'HEAD']);
            assert.strictEqual(git(['-C', updater, 'rev-parse', 'HEAD^']), oldMain, 'The update commit has the former fixture main as its direct parent');

            git(['-C', updater, 'push', 'origin', 'HEAD:main']);
            assert.strictEqual(git(['-C', bareOrigin, 'rev-parse', 'refs/heads/main']), newSha, 'Pushing the update fast-forwards fixture main');

            fs.rmSync(updater, { recursive: true, force: true });
            assert.strictEqual(fs.existsSync(updater), false, 'No temporary updater process or directory remains after cleanup');
            return newSha;
        },
        withOfflineOrigin(action) {
            const offline = `${bareOrigin}-offline`;
            fs.renameSync(bareOrigin, offline);
            try { return action(); } finally { fs.renameSync(offline, bareOrigin); }
        },
        cleanup() {
            if (fs.existsSync(managedPath)) {
                run('git', ['-C', source, 'worktree', 'remove', '--force', managedPath]);
            }
            run('git', ['-C', source, 'worktree', 'prune']);
            fs.rmSync(tempRoot, { recursive: true, force: true });
        },
    };
    fixture.assertLocalRemotes();
    return fixture;
}

module.exports = { createLocalInstallerGitFixture, fixtureEnv, assertLocalRemotes };
