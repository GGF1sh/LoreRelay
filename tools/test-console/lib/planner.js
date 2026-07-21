'use strict';

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { MANIFEST } = require('../../../scripts/run_all_tests');
const { lookupTrustedDefinition } = require('./trusted-commands');

const ROOT = path.resolve(__dirname, '../../..');
const RULES_PATH = path.join(ROOT, 'tools', 'test-console', 'test-impact-rules.json');
const PLAN_SCHEMA_VERSION = 2;
const PHASES = { focused: 0, boundary: 1, 'full-suite': 2 };

function sha256(value) {
    return crypto.createHash('sha256').update(value).digest('hex');
}

function run(command, args, options = {}) {
    const result = spawnSync(command, args, {
        cwd: options.cwd || ROOT,
        encoding: 'utf8',
        env: options.env || process.env,
        windowsHide: true,
        maxBuffer: 64 * 1024 * 1024,
    });
    if (!options.allowFailure && (result.error || result.status !== 0)) {
        const detail = result.error ? result.error.message : (result.stderr || result.stdout || `exit ${result.status}`);
        throw new Error(`${command} ${args.join(' ')} failed: ${String(detail).trim()}`);
    }
    return { status: result.status, stdout: result.stdout || '', stderr: result.stderr || '', error: result.error };
}

function git(args, root = ROOT, allowFailure = false) {
    return run('git', args, { cwd: root, allowFailure }).stdout.trim();
}

function splitZero(value) {
    return value.split('\0').filter(Boolean).map((file) => file.replace(/\\/g, '/'));
}

function globRegex(glob) {
    const marker = '__DOUBLE_STAR__';
    let source = glob.replace(/\\/g, '/').replace(/\*\*/g, marker);
    source = source.replace(/[.+^${}()|[\]\\]/g, '\\$&');
    source = source.replace(/\*/g, '[^/]*').replace(/\?/g, '[^/]');
    source = source.replace(new RegExp(marker, 'g'), '.*');
    return new RegExp(`^${source}$`, 'i');
}

function matches(file, patterns) {
    return patterns.some((pattern) => globRegex(pattern).test(file));
}

function collectChangedFiles(root, base, head) {
    const files = new Set();
    const add = (text) => splitZero(text).forEach((file) => files.add(file));
    add(run('git', ['diff', '--name-only', '-z', `${base}...${head}`], { cwd: root }).stdout);
    add(run('git', ['diff', '--name-only', '-z', 'HEAD'], { cwd: root }).stdout);
    add(run('git', ['diff', '--cached', '--name-only', '-z'], { cwd: root }).stdout);
    add(run('git', ['ls-files', '--others', '--exclude-standard', '-z'], { cwd: root }).stdout);
    return [...files].sort((a, b) => a.localeCompare(b));
}

function dirtyIdentity(root) {
    const status = run('git', ['status', '--porcelain=v1', '-z', '--untracked-files=all'], { cwd: root }).stdout;
    if (!status) return { dirty: false, dirtyDiffHash: sha256('clean') };
    const hash = crypto.createHash('sha256');
    hash.update(run('git', ['diff', '--binary', 'HEAD'], { cwd: root }).stdout);
    hash.update(run('git', ['diff', '--binary', '--cached'], { cwd: root }).stdout);
    const untracked = splitZero(run('git', ['ls-files', '--others', '--exclude-standard', '-z'], { cwd: root }).stdout).sort();
    for (const file of untracked) {
        hash.update(file);
        const absolute = path.join(root, file);
        if (fs.existsSync(absolute) && fs.statSync(absolute).isFile()) hash.update(fs.readFileSync(absolute));
    }
    return { dirty: true, dirtyDiffHash: hash.digest('hex') };
}

/**
 * A declarative selection descriptor: id, phase, category, reasons, and (when the rule
 * config forces one) an exclusiveGroup override. No executable/args/shell/cwd/env - those
 * are spawn authority and only ever come from the trusted-commands registry, looked up by
 * id at hydration time (see lib/trusted-commands.js and lib/plan-trust.js).
 */
function declareCommand(id, category, reason, phase = 'focused', exclusiveGroupOverride = null) {
    const definition = lookupTrustedDefinition(id);
    if (!definition) throw new Error(`Planner selected an unknown trusted command id: ${id}`);
    return {
        id,
        command: definition.command,
        category,
        exclusiveGroup: exclusiveGroupOverride || definition.exclusiveGroup || null,
        workspaceWriter: Boolean(definition.workspaceWriter),
        phase,
        reasons: [reason],
    };
}

function manifestCommand(entry, reason, phase = 'focused', exclusiveGroup = null) {
    return declareCommand(`test:${entry.file}`, entry.category, reason, phase, exclusiveGroup);
}

function addCommand(map, command) {
    const existing = map.get(command.id);
    if (!existing) {
        map.set(command.id, command);
        return;
    }
    existing.reasons = [...new Set([...existing.reasons, ...command.reasons])].sort();
    if (PHASES[command.phase] < PHASES[existing.phase]) existing.phase = command.phase;
    if (!existing.exclusiveGroup && command.exclusiveGroup) existing.exclusiveGroup = command.exclusiveGroup;
}

function inferSourceTests(root, changedFiles) {
    const selected = [];
    const scriptFiles = MANIFEST.filter((entry) => entry.file.startsWith('test_') && entry.file.endsWith('.js'));
    for (const file of changedFiles.filter((name) => name.startsWith('src/'))) {
        const stem = path.basename(file, path.extname(file))
            .replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase();
        const exact = scriptFiles.filter((entry) => entry.file === `test_${stem}.js`);
        if (exact.length) {
            for (const entry of exact) selected.push({ entry, reason: `Filename inference: ${file} maps to ${entry.file}.` });
            continue;
        }
        const normalized = file.replace(/\\/g, '/');
        for (const entry of scriptFiles) {
            const testPath = path.join(root, 'scripts', entry.file);
            let content = '';
            try { content = fs.readFileSync(testPath, 'utf8').replace(/\\/g, '/'); } catch (_) { continue; }
            if (content.includes(normalized) || content.includes(path.basename(file))) {
                selected.push({ entry, reason: `Reference inference: ${entry.file} references ${file}.` });
            }
        }
    }
    return selected.slice(0, 24);
}

/**
 * Maps a changed `src/*` file to the COMBAT_TEST_GROUPS entry(ies) it
 * belongs to or affects — the grouped Combat manifest entries whose `file`
 * is a group id (e.g. "combat:rts-replay-hash"), not an individual compiled
 * `*.test.js` filename (COMBAT_MANIFEST_ENTRIES in scripts/run_all_tests.js).
 * A static rule pattern cannot express "which one specific group" the way
 * inferSourceTests' filename inference does for flat scripts/test_*.js
 * files, so this mirrors that same two-tier approach for combat groups
 * instead: exact filename match first, then a content-reference fallback
 * for shared runtime files (e.g. src/gambitCombatCore.ts) that many test
 * sources import but which is not itself a test file in any group.
 *
 * Exact match needs no file I/O (pure string comparison against the
 * already-known compiled filenames each group owns), so it works
 * unconditionally — including against a bare fixture root that has no real
 * src/ files on disk. Reference match reads each candidate group's own
 * `.ts` test source(s) under `<root>/src/` and looks for a relative-import
 * reference to the changed file's stem; if those sources are not present on
 * disk (e.g. an isolated test fixture) it silently finds nothing for that
 * file, exactly like inferSourceTests' own reference-inference does today.
 */
function inferCombatTests(root, changedFiles) {
    const selected = [];
    const combatGroups = MANIFEST.filter((entry) => entry.runner === 'node-test');
    if (!combatGroups.length) return selected;

    for (const file of changedFiles.filter((name) => name.startsWith('src/'))) {
        const basename = path.basename(file);
        const stem = path.basename(file, path.extname(file));

        for (const entry of combatGroups) {
            const sourceFiles = (entry.files || []).map((compiled) => compiled.replace(/\.js$/, '.ts'));

            if (sourceFiles.includes(basename)) {
                selected.push({ entry, reason: `Filename inference: ${file} is a test source in Combat group ${entry.file}.` });
                continue;
            }

            for (const sourceFile of sourceFiles) {
                let content = '';
                try { content = fs.readFileSync(path.join(root, 'src', sourceFile), 'utf8'); } catch (_) { continue; }
                if (content.includes(`'./${stem}'`) || content.includes(`"./${stem}"`)) {
                    selected.push({ entry, reason: `Reference inference: Combat group ${entry.file} (via ${sourceFile}) references ${file}.` });
                    break;
                }
            }
        }
    }
    return selected.slice(0, 24);
}

function loadRules(rulesPath = RULES_PATH) {
    return JSON.parse(fs.readFileSync(rulesPath, 'utf8'));
}

function makePlan(options = {}) {
    const root = path.resolve(options.root || ROOT);
    const mode = options.mode || 'verify';
    if (!['focused', 'verify', 'integration', 'release'].includes(mode)) throw new Error(`Unsupported mode: ${mode}`);
    const baseRef = options.base || 'origin/main';
    const headRef = options.head || 'HEAD';
    const baseSha = git(['rev-parse', baseRef], root);
    const headSha = git(['rev-parse', headRef], root);
    const branch = git(['branch', '--show-current'], root) || '(detached)';
    const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
    const repository = typeof packageJson.repository === 'string' ? packageJson.repository : packageJson.repository?.url || root;
    const changedFiles = options.changedFiles ? [...options.changedFiles].sort() : collectChangedFiles(root, baseSha, headSha);
    const dirty = dirtyIdentity(root);
    const config = loadRules(options.rulesPath);
    const manifestByFile = new Map(MANIFEST.map((entry) => [entry.file, entry]));
    const selected = new Map();
    const matchedFiles = new Set();
    const boundaryReasons = new Map();
    let requiresFullSuite = false;

    for (const rule of config.rules) {
        const hits = changedFiles.filter((file) => matches(file, rule.patterns));
        if (!hits.length) continue;
        hits.forEach((file) => matchedFiles.add(file));
        const reason = `${rule.reason} [${rule.id}: ${hits.join(', ')}]`;
        const tests = [...(rule.tests || [])];
        if (rule.testsFromChangedFiles) {
            for (const file of hits) {
                const basename = path.basename(file);
                if (manifestByFile.has(basename)) tests.push(basename);
            }
        }
        for (const test of tests) {
            const entry = manifestByFile.get(test);
            if (entry) addCommand(selected, manifestCommand(entry, reason, 'focused', rule.exclusiveGroup || null));
        }
        for (const boundary of rule.boundaries || []) {
            const reasons = boundaryReasons.get(boundary) || [];
            reasons.push(reason);
            boundaryReasons.set(boundary, reasons);
        }
        if (rule.fullSuite) requiresFullSuite = true;
    }

    for (const inferred of inferSourceTests(root, changedFiles)) {
        addCommand(selected, manifestCommand(inferred.entry, inferred.reason));
    }

    for (const inferred of inferCombatTests(root, changedFiles)) {
        addCommand(selected, manifestCommand(inferred.entry, inferred.reason));
    }

    if (mode !== 'focused') {
        for (const [boundary, reasons] of [...boundaryReasons.entries()].sort()) {
            const definition = config.boundaries[boundary];
            if (!definition) continue;
            const reasonText = `Verify boundary ${boundary}: ${reasons.join(' ')}`;
            if (definition.test) {
                const entry = manifestByFile.get(definition.test);
                if (entry) addCommand(selected, manifestCommand(entry, reasonText, 'boundary', definition.exclusiveGroup || null));
            } else if (definition.id) {
                addCommand(selected, declareCommand(definition.id, definition.category || 'validate', reasonText, 'boundary'));
            }
        }
    }

    const unknownFiles = changedFiles.filter((file) => !matchedFiles.has(file));
    if (unknownFiles.length) requiresFullSuite = true;
    if (mode === 'integration' || mode === 'release') requiresFullSuite = true;
    if (requiresFullSuite) {
        const reasonText = unknownFiles.length
            ? `Fail-closed full suite for unknown files: ${unknownFiles.join(', ')}`
            : `${mode} mode requires a final full-manifest gate.`;
        addCommand(selected, declareCommand('full-suite', 'integration', reasonText, 'full-suite'));
    }

    const manifestIndex = new Map(MANIFEST.map((entry, index) => [`test:${entry.file}`, index]));
    const selectedCommands = [...selected.values()].sort((a, b) => {
        const phase = PHASES[a.phase] - PHASES[b.phase];
        if (phase) return phase;
        return (manifestIndex.get(a.id) ?? 10000) - (manifestIndex.get(b.id) ?? 10000) || a.id.localeCompare(b.id);
    });
    const domains = new Set(config.rules.map((rule) => rule.id));
    for (const file of matchedFiles) {
        for (const rule of config.rules) if (matches(file, rule.patterns)) domains.delete(rule.id);
    }

    return {
        schemaVersion: PLAN_SCHEMA_VERSION,
        repository,
        repositoryRoot: root,
        baseSha,
        headSha,
        branch,
        version: packageJson.version,
        dirty: dirty.dirty,
        dirtyDiffHash: dirty.dirtyDiffHash,
        mode,
        complete: unknownFiles.length === 0,
        changedFiles,
        selectedCommands,
        skippedDomains: [...domains].sort(),
        unknownFiles,
        requiresFullSuite,
        humanSmoke: mode === 'release' ? {
            status: 'NOT_PERFORMED',
            checklist: ['package/install refresh', 'installed-extension identity', 'real VS Code human smoke', 'user-data/live-world safety'],
        } : { status: 'NOT_PERFORMED', checklist: [] },
    };
}

function defaultConcurrency() {
    return Math.max(1, Math.min(4, (os.availableParallelism ? os.availableParallelism() : os.cpus().length) - 1));
}

function assertPlanCurrent(plan) {
    const currentHead = git(['rev-parse', 'HEAD'], plan.repositoryRoot);
    if (currentHead !== plan.headSha) throw new Error(`Plan head ${plan.headSha} does not match current HEAD ${currentHead}. Create a new plan.`);
    const identity = dirtyIdentity(plan.repositoryRoot);
    if (identity.dirtyDiffHash !== plan.dirtyDiffHash || identity.dirty !== plan.dirty) {
        throw new Error('Working tree changed after planning. Create a new plan so the fingerprint and impact selection are current.');
    }
    const currentVersion = JSON.parse(fs.readFileSync(path.join(plan.repositoryRoot, 'package.json'), 'utf8')).version;
    if (currentVersion !== plan.version) throw new Error(`Plan version ${plan.version} does not match package version ${currentVersion}.`);
}

module.exports = {
    ROOT,
    RULES_PATH,
    PLAN_SCHEMA_VERSION,
    assertPlanCurrent,
    collectChangedFiles,
    defaultConcurrency,
    dirtyIdentity,
    git,
    globRegex,
    loadRules,
    makePlan,
    matches,
    run,
    sha256,
};
