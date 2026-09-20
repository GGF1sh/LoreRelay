'use strict';

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { fingerprint, writeArtifacts } = require('./report');
const { assertPlanCurrent } = require('./planner');
const { TRUSTED_MARKER, lookupTrustedDefinition } = require('./trusted-commands');

function assertTrustedExecutable(command) {
    if (command[TRUSTED_MARKER] !== true) {
        throw new Error(
            `Refusing to execute command "${command.id}": it is not hydrated from the trusted command registry. ` +
            'A plan file cannot grant spawn authority by itself; only lib/trusted-commands.js (via lib/plan-trust.js) may produce executable definitions.'
        );
    }
    if (typeof command.executable !== 'string' || !command.executable) {
        throw new Error(`Refusing to execute command "${command.id}": missing executable.`);
    }
    if (/\.(cmd|bat)$/i.test(command.executable)) {
        throw new Error(
            `Refusing to execute command "${command.id}": .cmd/.bat executables are never allowed (shell execution is disabled). ` +
            'Route npm-script boundaries through the trusted npm JS CLI instead (see lib/trusted-commands.js).'
        );
    }
}

function timestamp() {
    return new Date().toISOString().replace(/[:.]/g, '-');
}

function safeId(id) {
    return id.replace(/[^a-z0-9._-]+/gi, '_');
}

function terminateChild(child) {
    if (!child || !child.pid) return;
    if (process.platform === 'win32') {
        const killer = spawn('taskkill.exe', ['/pid', String(child.pid), '/t', '/f'], { stdio: 'ignore', windowsHide: true });
        killer.unref();
    } else {
        try { child.kill('SIGTERM'); } catch (_) { /* already exited */ }
    }
}

function readRuns(root) {
    const runsRoot = path.join(root, '.test-runs');
    if (!fs.existsSync(runsRoot)) return [];
    const found = [];
    for (const name of fs.readdirSync(runsRoot)) {
        const file = path.join(runsRoot, name, 'results.json');
        try { found.push(JSON.parse(fs.readFileSync(file, 'utf8'))); } catch (_) { /* incomplete attempt */ }
    }
    return found;
}

function resumePasses(root, value) {
    const passes = new Set();
    for (const prior of readRuns(root).filter((run) => run.fingerprint === value)) {
        for (const command of prior.commands || []) {
            if (command.status === 'PASS' || command.status === 'REUSED_PASS') {
                const def = lookupTrustedDefinition(command.id);
                if (!def || (!def.workspaceWriter && !def.consumesCompiledOutput)) {
                    passes.add(command.id);
                }
            }
        }
    }
    return passes;
}

function fullSuiteAttempts(root, value) {
    return readRuns(root).filter((run) => run.fingerprint === value && (run.commands || []).some((item) => item.id === 'full-suite' && item.status !== 'SKIPPED'));
}

class ExecutionEngine {
    constructor(plan, preflight, options = {}) {
        this.plan = plan;
        this.preflight = preflight;
        this.concurrency = Math.max(1, Number(options.concurrency) || 1);
        this.onEvent = options.onEvent || (() => {});
        this.allowRepeatFullSuite = Boolean(options.allowRepeatFullSuite);
        this.repeatReason = String(options.repeatReason || '').trim();
        if (!options.skipIdentityCheck) assertPlanCurrent(plan);
        this.cancelled = false;
        this.children = new Set();
        this.fingerprint = fingerprint(plan, preflight);
        this.runDirectory = options.runDirectory || path.join(plan.repositoryRoot, '.test-runs', `${timestamp()}-${plan.headSha.slice(0, 8)}`);
    }

    cancel() {
        this.cancelled = true;
        for (const child of this.children) {
            terminateChild(child);
        }
        this.onEvent({ type: 'cancel-requested' });
    }

    async executeCommand(command) {
        const startedAt = new Date().toISOString();
        const started = Date.now();
        const basename = safeId(command.id);
        const stdoutLog = path.join(this.runDirectory, `${basename}.stdout.log`);
        const stderrLog = path.join(this.runDirectory, `${basename}.stderr.log`);
        const stdoutStream = fs.createWriteStream(stdoutLog, { flags: 'a' });
        const stderrStream = fs.createWriteStream(stderrLog, { flags: 'a' });
        assertTrustedExecutable(command);
        this.onEvent({ type: 'command-start', command });
        return new Promise((resolve) => {
            let timedOut = false;
            let settled = false;
            const child = spawn(command.executable, command.args, {
                cwd: this.plan.repositoryRoot,
                env: process.env,
                shell: false,
                windowsHide: true,
            });
            this.children.add(child);
            child.stdout.on('data', (chunk) => {
                stdoutStream.write(chunk);
                this.onEvent({ type: 'output', id: command.id, stream: 'stdout', text: chunk.toString('utf8') });
            });
            child.stderr.on('data', (chunk) => {
                stderrStream.write(chunk);
                this.onEvent({ type: 'output', id: command.id, stream: 'stderr', text: chunk.toString('utf8') });
            });
            const timer = setTimeout(() => {
                timedOut = true;
                terminateChild(child);
            }, command.timeoutMs);
            const finish = (exitCode, error) => {
                if (settled) return;
                settled = true;
                clearTimeout(timer);
                this.children.delete(child);
                stdoutStream.end();
                stderrStream.end();
                const status = timedOut ? 'TIMEOUT' : this.cancelled ? 'CANCELLED' : exitCode === 0 && !error ? 'PASS' : 'FAIL';
                const result = {
                    id: command.id,
                    command: command.command,
                    category: command.category,
                    phase: command.phase,
                    exclusiveGroup: command.exclusiveGroup || null,
                    reasons: command.reasons,
                    status,
                    exitCode: Number.isInteger(exitCode) ? exitCode : null,
                    error: error ? error.message : timedOut ? `timeout after ${command.timeoutMs}ms` : null,
                    startedAt,
                    endedAt: new Date().toISOString(),
                    durationMs: Date.now() - started,
                    stdoutLog,
                    stderrLog,
                };
                this.onEvent({ type: 'command-end', result });
                resolve(result);
            };
            child.on('error', (error) => finish(null, error));
            child.on('close', (code) => finish(code, null));
        });
    }

    async runPhase(commands, reused, results) {
        const pending = [...commands];
        const running = new Map();
        const canStart = (command) => {
            if (command.workspaceWriter) return running.size === 0;
            if ([...running.values()].some((item) => item.command.workspaceWriter)) return false;
            if (!command.exclusiveGroup) return true;
            return ![...running.values()].some((item) => item.command.exclusiveGroup === command.exclusiveGroup);
        };
        while (pending.length || running.size) {
            if (this.cancelled) {
                while (pending.length) {
                    const command = pending.shift();
                    results.push({ ...command, status: 'SKIPPED', exitCode: null, durationMs: 0, error: 'cancelled before start' });
                }
            }
            let launched = false;
            for (let index = 0; index < pending.length && running.size < this.concurrency;) {
                const command = pending[index];
                if (reused.has(command.id)) {
                    pending.splice(index, 1);
                    results.push({ ...command, status: 'REUSED_PASS', exitCode: 0, durationMs: 0, error: null });
                    this.onEvent({ type: 'command-reused', command });
                    launched = true;
                    continue;
                }
                if (!canStart(command)) { index++; continue; }
                pending.splice(index, 1);
                const promise = this.executeCommand(command).then((result) => {
                    results.push(result);
                    running.delete(command.id);
                });
                running.set(command.id, { command, promise });
                launched = true;
                if (command.workspaceWriter) break;
            }
            if (running.size) await Promise.race([...running.values()].map((item) => item.promise));
            else if (!launched && pending.length) throw new Error(`Scheduler deadlock: ${pending.map((item) => item.id).join(', ')}`);
        }
    }

    async run() {
        fs.mkdirSync(this.runDirectory, { recursive: true });
        fs.writeFileSync(path.join(this.runDirectory, 'plan.json'), `${JSON.stringify(this.plan, null, 2)}\n`);
        const reused = resumePasses(this.plan.repositoryRoot, this.fingerprint);
        const priorFull = fullSuiteAttempts(this.plan.repositoryRoot, this.fingerprint);
        const hasFull = this.plan.selectedCommands.some((command) => command.id === 'full-suite');
        if (hasFull && !reused.has('full-suite') && priorFull.length && (!this.allowRepeatFullSuite || !this.repeatReason)) {
            throw new Error(`Full suite already attempted ${priorFull.length} time(s) for fingerprint ${this.fingerprint}. Use --allow-repeat-full-suite --reason <text>.`);
        }
        const results = [];
        const startedAt = new Date().toISOString();
        for (const phase of ['prereq', 'focused', 'boundary', 'full-suite']) {
            if (this.cancelled) break;
            await this.runPhase(this.plan.selectedCommands.filter((command) => command.phase === phase), reused, results);
            if (results.some((item) => ['FAIL', 'TIMEOUT', 'CANCELLED'].includes(item.status))) break;
        }
        for (const command of this.plan.selectedCommands) {
            if (!results.some((item) => item.id === command.id)) results.push({ ...command, status: 'SKIPPED', exitCode: null, durationMs: 0, error: 'not reached' });
        }
        const order = new Map(this.plan.selectedCommands.map((command, index) => [command.id, index]));
        results.sort((a, b) => order.get(a.id) - order.get(b.id));
        const record = {
            schemaVersion: 1,
            fingerprint: this.fingerprint,
            runDirectory: this.runDirectory,
            startedAt,
            endedAt: new Date().toISOString(),
            cancelled: this.cancelled,
            concurrency: this.concurrency,
            repeatOverride: priorFull.length ? { reason: this.repeatReason, priorAttempts: priorFull.length } : null,
            preflight: this.preflight,
            commands: results,
        };
        record.summary = writeArtifacts(this.runDirectory, this.plan, this.preflight, record);
        this.onEvent({ type: 'run-end', results: record });
        return record;
    }
}

module.exports = { ExecutionEngine, fullSuiteAttempts, readRuns, resumePasses };
