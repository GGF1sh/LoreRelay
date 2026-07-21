'use strict';

const fs = require('fs');
const path = require('path');
const { MANIFEST, DEFAULT_TIMEOUT_MS } = require('../../../scripts/run_all_tests');

const ROOT = path.resolve(__dirname, '../../..');

// Non-serializable trust marker: a JSON plan can never produce a real Symbol,
// so a hand-edited plan cannot forge this the way it could forge a `"trusted": true` field.
const TRUSTED_MARKER = Symbol('lorerelay-test-console-trusted-command');

const MANIFEST_BY_FILE = new Map(MANIFEST.map((entry) => [entry.file, entry]));

// Test files that a boundary check maps onto (they are already ordinary manifest entries).
const BOUNDARY_TEST_ALIASES = {
    'boundary:webview-parity': 'test_webview_bundle.js',
    'boundary:i18n': 'check_i18n_keys.js',
    'boundary:version-consistency': 'check_version_consistency.js',
    'boundary:utf8-docs': 'validate_utf8_docs.js',
};

// The only boundary checks that historically ran through `npm run <script>` instead of a
// direct `node scripts/*.js` invocation. Hydrated via the trusted npm JS CLI, never npm.cmd/shell.
const NPM_SCRIPT_BOUNDARIES = {
    'boundary:compile': { npmArgs: ['run', 'compile'], category: 'validate', timeoutMs: 240000, exclusiveGroup: 'generated-output', workspaceWriter: true },
    'boundary:symbol-registry': { npmArgs: ['run', 'check:symbol-registry'], category: 'validate', timeoutMs: 120000, exclusiveGroup: 'generated-output' },
};

function defaultExclusiveGroup(file) {
    if (/installer|install_chain/i.test(file)) return 'installer-worktree';
    if (/remote_play|ws_functionality/i.test(file)) return 'fixed-port';
    if (/simulation|noai_soak/i.test(file)) return 'simulation-stress';
    if (/writer|write_queue|race|interleave|atomicity/i.test(file)) return 'writer-race';
    return null;
}

function commandDisplay(executable, args) {
    return [executable, ...args].map((part) => (/[\s"]/u.test(part) ? JSON.stringify(part) : part)).join(' ');
}

let cachedNpmCli = null;
function resolveNpmCli() {
    if (cachedNpmCli) return cachedNpmCli;
    const candidates = [];
    if (process.env.npm_execpath && /npm-cli\.js$/i.test(process.env.npm_execpath)) candidates.push(process.env.npm_execpath);
    candidates.push(path.join(path.dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js'));
    for (const candidate of candidates) {
        if (candidate && fs.existsSync(candidate)) {
            cachedNpmCli = candidate;
            return cachedNpmCli;
        }
    }
    throw new Error(
        `Trusted npm JavaScript CLI entrypoint could not be resolved (tried: ${candidates.join(', ')}). ` +
        'Refusing to fall back to npm.cmd or shell execution.'
    );
}

function manifestExecutableDefinition(entry) {
    if (entry.runner === 'python') {
        return {
            executable: 'python',
            args: [path.join(ROOT, 'scripts', entry.file)],
            command: commandDisplay('python', [`scripts/${entry.file}`]),
            timeoutMs: entry.timeoutMs || DEFAULT_TIMEOUT_MS,
        };
    }
    if (entry.runner === 'node-test') {
        // Combat groups (COMBAT_TEST_GROUPS, merged into MANIFEST by
        // scripts/run_all_tests.js as COMBAT_MANIFEST_ENTRIES): `entry.file`
        // is the group id (e.g. "combat:rts-replay-hash"), not a real path
        // under scripts/ — there is no scripts/<group id> to spawn. The real
        // invocation, mirrored exactly from run_all_tests.js's own
        // runNodeTestGroup, is `node --test out/<compiled file>...` over
        // every compiled suite in entry.files.
        const relativeFiles = (entry.files || []).map((file) => path.join('out', file));
        return {
            executable: process.execPath,
            args: ['--test', ...relativeFiles.map((file) => path.join(ROOT, file))],
            command: commandDisplay('node', ['--test', ...relativeFiles]),
            timeoutMs: entry.timeoutMs || DEFAULT_TIMEOUT_MS,
        };
    }
    return {
        executable: process.execPath,
        args: [path.join(ROOT, 'scripts', entry.file)],
        command: commandDisplay('node', [`scripts/${entry.file}`]),
        timeoutMs: entry.timeoutMs || DEFAULT_TIMEOUT_MS,
    };
}

function baseDefinitionForId(id) {
    if (id === 'full-suite') {
        return {
            executable: process.execPath,
            args: [path.join(ROOT, 'scripts', 'run_all_tests.js')],
            command: commandDisplay('node', ['scripts/run_all_tests.js']),
            timeoutMs: 60 * 60 * 1000,
            exclusiveGroup: 'full-suite',
            consumesCompiledOutput: true,
        };
    }

    const manifestFile = id.startsWith('test:') ? id.slice('test:'.length) : BOUNDARY_TEST_ALIASES[id];
    if (manifestFile) {
        const entry = MANIFEST_BY_FILE.get(manifestFile);
        if (!entry) return null;
        return {
            ...manifestExecutableDefinition(entry),
            exclusiveGroup: defaultExclusiveGroup(entry.file),
            consumesCompiledOutput: Boolean(entry.consumesCompiledOutput),
        };
    }

    const npmBoundary = NPM_SCRIPT_BOUNDARIES[id];
    if (npmBoundary) {
        const npmCli = resolveNpmCli();
        return {
            executable: process.execPath,
            args: [npmCli, ...npmBoundary.npmArgs],
            command: commandDisplay('npm', npmBoundary.npmArgs),
            timeoutMs: npmBoundary.timeoutMs,
            exclusiveGroup: npmBoundary.exclusiveGroup,
            workspaceWriter: Boolean(npmBoundary.workspaceWriter),
        };
    }

    return null;
}

/**
 * Look up the trusted, version-controlled executable definition for a command ID.
 * Returns null for unknown IDs; callers must fail closed on null.
 */
function lookupTrustedDefinition(id) {
    if (typeof id !== 'string' || !id) return null;
    return baseDefinitionForId(id);
}

/**
 * Build the fully hydrated, executable command for a plan entry. `descriptor` fields
 * (phase/category/reasons/exclusiveGroup/workspaceWriter) come only from planner code that
 * has already been re-derived from the live repository (never from a loaded plan file
 * directly) - they carry scheduling/display metadata, not spawn authority. The spawn
 * authority (executable/args) always comes from this registry, keyed by `id` alone.
 */
function hydrateTrustedCommand(descriptor) {
    const definition = lookupTrustedDefinition(descriptor.id);
    if (!definition) throw new Error(`Unknown trusted command id: ${descriptor.id}`);
    if (/\.(cmd|bat)$/i.test(definition.executable)) {
        throw new Error(`Trusted command registry refuses to hydrate a .cmd/.bat executable for id: ${descriptor.id}`);
    }
    return {
        id: descriptor.id,
        command: definition.command,
        executable: definition.executable,
        args: definition.args,
        category: descriptor.category,
        phase: descriptor.phase,
        exclusiveGroup: descriptor.exclusiveGroup !== undefined ? descriptor.exclusiveGroup : (definition.exclusiveGroup || null),
        workspaceWriter: Boolean(descriptor.workspaceWriter !== undefined ? descriptor.workspaceWriter : definition.workspaceWriter),
        timeoutMs: definition.timeoutMs,
        reasons: descriptor.reasons,
        [TRUSTED_MARKER]: true,
    };
}

module.exports = {
    ROOT,
    TRUSTED_MARKER,
    BOUNDARY_TEST_ALIASES,
    NPM_SCRIPT_BOUNDARIES,
    defaultExclusiveGroup,
    commandDisplay,
    resolveNpmCli,
    lookupTrustedDefinition,
    hydrateTrustedCommand,
};
