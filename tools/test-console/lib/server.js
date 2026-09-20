'use strict';

const fs = require('fs');
const http = require('http');
const path = require('path');
const { spawn } = require('child_process');
const { ExecutionEngine } = require('./engine');
const { makePlan, defaultConcurrency, ROOT } = require('./planner');
const { collectPreflight } = require('./preflight');
const { hydrateOwnPlan } = require('./plan-trust');

const PUBLIC = path.join(ROOT, 'tools', 'test-console', 'public');

function json(response, status, value) {
    response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    response.end(JSON.stringify(value));
}

function body(request) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        let size = 0;
        request.on('data', (chunk) => {
            size += chunk.length;
            if (size > 1024 * 1024) { reject(new Error('request body too large')); request.destroy(); return; }
            chunks.push(chunk);
        });
        request.on('end', () => {
            try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}); }
            catch (error) { reject(error); }
        });
        request.on('error', reject);
    });
}

function mime(file) {
    if (file.endsWith('.html')) return 'text/html; charset=utf-8';
    if (file.endsWith('.js')) return 'text/javascript; charset=utf-8';
    if (file.endsWith('.css')) return 'text/css; charset=utf-8';
    if (file.endsWith('.json')) return 'application/json; charset=utf-8';
    if (file.endsWith('.md') || file.endsWith('.log')) return 'text/plain; charset=utf-8';
    return 'application/octet-stream';
}

function safeServe(response, base, relative) {
    const file = path.resolve(base, relative);
    const baseResolved = path.resolve(base);
    if (file !== baseResolved && !file.startsWith(`${baseResolved}${path.sep}`)) { json(response, 403, { error: 'forbidden' }); return; }
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) { json(response, 404, { error: 'not found' }); return; }
    response.writeHead(200, { 'Content-Type': mime(file), 'Cache-Control': 'no-store' });
    fs.createReadStream(file).pipe(response);
}

function createServer(options = {}) {
    const state = {
        status: 'idle',
        plan: null,
        preflight: null,
        results: null,
        error: null,
        concurrency: defaultConcurrency(),
        progress: { completed: 0, total: 0, current: [] },
        counts: { passed: 0, failed: 0, skipped: 0 },
        startedAt: null,
        logs: {},
    };
    let engine = null;
    const emit = (event) => {
        if (event.type === 'command-start') {
            state.progress.current.push(event.command.id);
        } else if (event.type === 'command-end') {
            state.progress.current = state.progress.current.filter((id) => id !== event.result.id);
            state.progress.completed++;
            if (event.result.status === 'PASS') state.counts.passed++;
            else if (event.result.status === 'FAIL' || event.result.status === 'TIMEOUT') state.counts.failed++;
        } else if (event.type === 'command-reused') {
            state.progress.completed++;
            state.counts.passed++;
        } else if (event.type === 'output') {
            const log = state.logs[event.id] || { stdout: '', stderr: '' };
            log[event.stream] = (log[event.stream] + event.text).slice(-500000);
            state.logs[event.id] = log;
        } else if (event.type === 'run-end') {
            state.status = event.results.cancelled ? 'cancelled' : 'complete';
            state.results = event.results;
            state.counts.skipped = event.results.commands.filter((item) => item.status === 'SKIPPED').length;
        }
    };
    const server = http.createServer(async (request, response) => {
        const url = new URL(request.url, 'http://127.0.0.1');
        try {
            if (request.method === 'GET' && url.pathname === '/api/state') { json(response, 200, state); return; }
            if (request.method === 'POST' && url.pathname === '/api/plan') {
                if (state.status === 'running') { json(response, 409, { error: 'a run is active' }); return; }
                const input = await body(request);
                state.status = 'planning'; state.error = null; state.results = null; state.logs = {};
                state.plan = makePlan({ root: options.root || ROOT, base: input.base || 'origin/main', head: input.head || 'HEAD', mode: input.mode || 'verify' });
                state.preflight = collectPreflight(state.plan);
                state.concurrency = Math.max(1, Math.min(32, Number(input.concurrency) || defaultConcurrency()));
                state.progress = { completed: 0, total: state.plan.selectedCommands.length, current: [] };
                state.counts = { passed: 0, failed: 0, skipped: 0 }; state.startedAt = null;
                state.status = 'planned';
                json(response, 200, { ok: true }); return;
            }
            if (request.method === 'POST' && url.pathname === '/api/run') {
                if (!state.plan) { json(response, 409, { error: 'create a plan first' }); return; }
                if (state.status === 'running') { json(response, 409, { error: 'a run is active' }); return; }
                const input = await body(request);
                state.status = 'running'; state.error = null; state.results = null; state.logs = {};
                state.progress = { completed: 0, total: state.plan.selectedCommands.length, current: [] };
                state.counts = { passed: 0, failed: 0, skipped: 0 }; state.startedAt = new Date().toISOString();
                // Same validation/hydration boundary as the CLI (lib/plan-trust.js): the
                // in-memory plan is declarative until hydrated from the trusted registry.
                const hydratedPlan = hydrateOwnPlan(state.plan);
                engine = new ExecutionEngine(hydratedPlan, state.preflight, {
                    concurrency: Math.max(1, Math.min(32, Number(input.concurrency) || state.concurrency)),
                    allowRepeatFullSuite: Boolean(input.allowRepeatFullSuite),
                    repeatReason: input.repeatReason,
                    onEvent: emit,
                });
                engine.run().catch((error) => { state.status = 'error'; state.error = error.stack || error.message; });
                json(response, 202, { ok: true }); return;
            }
            if (request.method === 'POST' && url.pathname === '/api/stop') {
                if (engine && state.status === 'running') engine.cancel();
                json(response, 200, { ok: true }); return;
            }
            if (request.method === 'GET' && url.pathname.startsWith('/runs/')) {
                safeServe(response, path.join(options.root || ROOT, '.test-runs'), decodeURIComponent(url.pathname.slice('/runs/'.length))); return;
            }
            if (request.method === 'GET') {
                const relative = url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname.slice(1));
                safeServe(response, PUBLIC, relative); return;
            }
            json(response, 404, { error: 'not found' });
        } catch (error) {
            state.status = 'error'; state.error = error.stack || error.message;
            json(response, 500, { error: error.message });
        }
    });
    return { server, state };
}

async function listen(options = {}) {
    const instance = createServer(options);
    const requestedPort = Number(options.port) || 3219;
    await new Promise((resolve, reject) => {
        instance.server.once('error', (error) => {
            if (error.code === 'EADDRINUSE' && requestedPort !== 0) {
                instance.server.listen(0, '127.0.0.1', resolve);
            } else reject(error);
        });
        instance.server.listen(requestedPort, '127.0.0.1', resolve);
    });
    const address = instance.server.address();
    const url = `http://127.0.0.1:${address.port}/`;
    if (options.open) {
        if (process.platform === 'win32') spawn('cmd.exe', ['/d', '/s', '/c', 'start', '', url], { detached: true, stdio: 'ignore', windowsHide: true }).unref();
        else spawn(process.platform === 'darwin' ? 'open' : 'xdg-open', [url], { detached: true, stdio: 'ignore' }).unref();
    }
    return { ...instance, url };
}

module.exports = { createServer, listen };
