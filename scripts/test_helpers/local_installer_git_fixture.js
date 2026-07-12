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

    git(['clone', '--bare', testRoot, bareOrigin]);
    git(['clone', bareOrigin, source]);
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
            git(['-C', updater, 'config', 'user.name', 'LoreRelay hermetic updater']);
            git(['-C', updater, 'config', 'user.email', 'installer-test@example.invalid']);
            const marker = path.join(updater, 'installer-hermetic-fetch-marker.txt');
            fs.writeFileSync(marker, `${Date.now()}\n`, 'utf8');
            git(['-C', updater, 'add', path.basename(marker)]);
            git(['-C', updater, 'commit', '-m', 'test: local installer origin update']);
            git(['-C', updater, 'push', 'origin', 'HEAD:main']);
            const sha = git(['-C', updater, 'rev-parse', 'HEAD']);
            fs.rmSync(updater, { recursive: true, force: true });
            return sha;
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
