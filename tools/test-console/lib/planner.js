'use strict';

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { MANIFEST, DEFAULT_TIMEOUT_MS } = require('../../../scripts/run_all_tests');

const ROOT = path.resolve(__dirname, '../../..');
const RULES_PATH = path.join(ROOT, 'tools', 'test-console', 'test-impact-rules.json');
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

function commandDisplay(executable, args) {
    return [executable, ...args].map((part) => /[\s"]/u.test(part) ? JSON.stringify(part) : part).join(' ');
}

function defaultExclusiveGroup(file) {
    if (/installer|install_chain/i.test(file)) return 'installer-worktree';
    if (/remote_play|ws_functionality/i.test(file)) return 'fixed-port';
    if (/simulation|noai_soak/i.test(file)) return 'simulation-stress';
    if (/writer|write_queue|race|interleave|atomicity/i.test(file)) return 'writer-race';
    return null;
}

function manifestCommand(entry, reason, phase = 'focused', exclusiveGroup = null) {
    const executable = entry.runner === 'python' ? 'python' : process.execPath;
    const args = [path.join(ROOT, 'scripts', entry.file)];
    return {
        id: `test:${entry.file}`,
        command: commandDisplay(entry.runner === 'python' ? 'python' : 'node', [`scripts/${entry.file}`]),
        executable,
        args,
        category: entry.category,
        exclusiveGroup: exclusiveGroup || defaultExclusiveGroup(entry.file),
        timeoutMs: entry.timeoutMs || DEFAULT_TIMEOUT_MS,
        phase,
        reasons: [reason],
    };
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

    if (mode !== 'focused') {
        for (const [boundary, reasons] of [...boundaryReasons.entries()].sort()) {
            const definition = config.boundaries[boundary];
            if (!definition) continue;
            if (definition.test) {
                const entry = manifestByFile.get(definition.test);
                if (entry) addCommand(selected, manifestCommand(entry, `Verify boundary ${boundary}: ${reasons.join(' ')}`, 'boundary', definition.exclusiveGroup || null));
            } else {
                addCommand(selected, {
                    ...definition,
                    executable: process.platform === 'win32' && definition.executable === 'npm' ? 'npm.cmd' : definition.executable,
                    phase: 'boundary',
                    reasons: [`Verify boundary ${boundary}: ${reasons.join(' ')}`],
                });
            }
        }
    }

    const unknownFiles = changedFiles.filter((file) => !matchedFiles.has(file));
    if (unknownFiles.length) requiresFullSuite = true;
    if (mode === 'integration' || mode === 'release') requiresFullSuite = true;
    if (requiresFullSuite) {
        addCommand(selected, {
            id: 'full-suite',
            command: 'npm test',
            executable: process.platform === 'win32' ? 'npm.cmd' : 'npm',
            args: ['test'],
            category: 'integration',
            exclusiveGroup: 'full-suite',
            timeoutMs: 60 * 60 * 1000,
            phase: 'full-suite',
            reasons: unknownFiles.length
                ? [`Fail-closed full suite for unknown files: ${unknownFiles.join(', ')}`]
                : [`${mode} mode requires a final full-manifest gate.`],
        });
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
        schemaVersion: 1,
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
    assertPlanCurrent,
    collectChangedFiles,
    defaultConcurrency,
    dirtyIdentity,
    globRegex,
    loadRules,
    makePlan,
    matches,
    run,
    sha256,
};
