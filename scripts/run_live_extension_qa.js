'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const net = require('net');
const assert = require('assert/strict');
const { randomBytes, randomUUID, createHash } = require('crypto');
const { downloadAndUnzipVSCode } = require('@vscode/test-electron');
const { spawn } = require('child_process');
const ROOT = path.resolve(__dirname, '..');

async function terminateUnconnectedHost(child) {
    if (!child.pid || child.exitCode !== null || child.signalCode !== null) return;
    if (process.platform === 'win32') {
        const code = await new Promise(resolve => {
            const killer = spawn(path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'taskkill.exe'),
                ['/PID', String(child.pid), '/T', '/F'], { shell: false, windowsHide: true, stdio: 'ignore' });
            killer.once('error', () => resolve(-1)); killer.once('exit', resolve);
        });
        if (code !== 0 && child.exitCode === null && child.signalCode === null) child.kill('SIGTERM');
    } else {
        try { process.kill(-child.pid, 'SIGTERM'); } catch { child.kill('SIGTERM'); }
    }
}
// Injected functions are test-process dependencies, never CLI/request fields.
async function runLifecycle(testDeps = {}) {
    const temp = fs.realpathSync(os.tmpdir());
    const owned = fs.mkdtempSync(path.join(temp, 'lorerelay-live-qa-'));
    const workspace = path.join(owned, 'workspace');
    const secret = randomBytes(32).toString('hex');
    const endpoint = process.platform === 'win32' ? `\\\\.\\pipe\\lorerelay-qa-${randomUUID()}` : path.join(owned, 'bridge.sock');
    fs.mkdirSync(workspace);
    fs.writeFileSync(path.join(workspace, '.lorerelay-qa-fixture.json'), JSON.stringify({ fixtureId: 'lifecycle_v1' }));
    for (const file of ['game_state.json', 'world_state.json', 'game_rules.json', 'world_forge.json']) {
        fs.copyFileSync(path.join(ROOT, 'fixtures/action-scenarios/merchant_route_v1', file), path.join(workspace, file));
    }
    const gamePath = path.join(workspace, 'game_state.json');
    const game = JSON.parse(fs.readFileSync(gamePath, 'utf8'));
    game.entries = [{ id: 'qa-gm-1', role: 'gm', sender: 'GM', content: 'Catalog-owned QA opening.' }];
    fs.writeFileSync(gamePath, JSON.stringify(game));
    fs.writeFileSync(path.join(workspace, 'game_history.json'), JSON.stringify(game.entries));
    const profile = path.join(owned, 'user-data');
    fs.mkdirSync(path.join(profile, 'User'), { recursive: true });
    fs.writeFileSync(path.join(profile, 'User/settings.json'), JSON.stringify({
        'telemetry.telemetryLevel': 'off', 'update.mode': 'none', 'extensions.autoUpdate': false,
        'workbench.startupEditor': 'none', 'security.workspace.trust.enabled': false,
    }));
    fs.writeFileSync(path.join(owned, 'owner.json'), JSON.stringify({ fixtureId: 'lifecycle_v1', endpoint,
        secretHash: createHash('sha256').update(secret).digest('hex') }), { mode: 0o600 });
    let connection; let session; let nextHost;
    let hello = new Promise(resolve => { nextHost = resolve; });
    const pending = new Map();
    const sockets = new Set();
    const server = net.createServer(socket => {
        sockets.add(socket); let buffer = ''; let authenticated = false;
        socket.setEncoding('utf8');
        socket.on('error', () => {});
        socket.on('close', () => { sockets.delete(socket); });
        socket.on('data', chunk => {
            buffer += chunk;
            if (Buffer.byteLength(buffer) > 2_000_000) { socket.destroy(); return; }
            let index;
            while ((index = buffer.indexOf('\n')) >= 0) {
                const line = buffer.slice(0, index); buffer = buffer.slice(index + 1);
                let message;
                try { message = JSON.parse(line); } catch { socket.destroy(); return; }
                if (!authenticated) {
                    if (message.type !== 'hello' || message.secret !== secret || typeof message.workspace !== 'string'
                        || path.relative(message.workspace, workspace) !== ''
                        || message.fixtureId !== 'lifecycle_v1' || typeof message.session !== 'string') { socket.destroy(); return; }
                    authenticated = true; connection = socket; session = message.session;
                    socket.write(JSON.stringify({ type: 'ready', secret, session }) + '\n');
                    nextHost(session); continue;
                }
                if (message.session !== session) continue;
                const entry = pending.get(message.id);
                if (entry) { clearTimeout(entry.timer); pending.delete(message.id); entry.resolve(message); }
            }
        });
    });
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(endpoint, resolve); });
    const deadline = (promise, ms, label) => {
        let timer;
        return Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(label)), ms); })])
            .finally(() => clearTimeout(timer));
    };
    const request = async (op, args = {}) => {
        console.error(`QA operation: ${op}`);
        const id = randomUUID();
        const response = await new Promise((resolve, reject) => {
            const timer = setTimeout(() => { pending.delete(id); reject(new Error(`qa_timeout_${op}`)); }, 30000);
            pending.set(id, { timer, resolve });
            connection.write(JSON.stringify({ id, session, op, args }) + '\n');
        });
        assert.equal(response.ok, true, JSON.stringify(response));
        return response.result;
    };
    let exited = false;
    let child;
    let test;
    try {
    const executable = await (testDeps.resolveExecutable || (() => process.env.LORERELAY_QA_VSCODE
        || downloadAndUnzipVSCode({ version: '1.136.1' })))();
    child = (testDeps.spawnHost || spawn)(executable, [workspace, `--extensionDevelopmentPath=${ROOT}`, `--user-data-dir=${profile}`,
        `--extensions-dir=${path.join(owned, 'extensions')}`, '--disable-extensions', '--skip-welcome',
        '--skip-release-notes', '--disable-gpu', '--disable-workspace-trust', '--no-sandbox'], {
        windowsHide: true, detached: process.platform !== 'win32', shell: false, env: { ...process.env, ELECTRON_RUN_AS_NODE: undefined,
            VSCODE_IPC_HOOK_CLI: undefined, LORERELAY_QA_SECRET: secret, LORERELAY_QA_ENDPOINT: endpoint },
    });
    child.stdout.on('data', bytes => process.stderr.write(bytes));
    child.stderr.on('data', bytes => process.stderr.write(bytes));
    test = new Promise((resolve, reject) => {
        child.once('error', reject);
        child.once('exit', code => code === 0 ? resolve() : reject(new Error(`qa_host_exit_${code}`)));
    }).finally(() => { exited = true; });
    // Avoid an unhandled rejection while awaiting an IPC response/startup deadline.
    void test.catch(() => {});
        await deadline(Promise.race([hello, test.then(() => { throw new Error('qa_host_exited_before_hello'); })]), testDeps.startTimeoutMs || 90000, 'qa_host_start_timeout');
        await request('reopen');
        const initial = await request('inspect');
        const checkpoint = await request('checkpoint_save');
        assert(checkpoint?.id, 'real checkpoint save must return its persisted identity');
        const available = await request('query_available');
        assert.equal(available.actions.length, 3);
        const preview = await request('preview', { actionId: 'commerce:trade', parameters: {
            op: 'buy', marketLocationId: 'north_farm', commodityId: 'wheat', qty: 1 } });
        assert(preview.ok);
        assert.deepEqual(await request('inspect'), initial, 'preview is read-only');
        const execute = { actionId: preview.actionId, parameters: preview.parameters,
            confirmationToken: preview.confirmationToken, requestId: randomUUID() };
        assert.equal((await request('execute', execute)).classification, 'committed');
        assert.equal((await request('execute', execute)).classification, 'committed');
        assert.equal((await request('inspect'))['game_state.json'].value.commerce.credits, 11);
        for (const [actionId, parameters] of [['commerce:travel', { destinationId: 'elda_shop' }], ['commerce:end_day', {}]]) {
            const quote = await request('preview', { actionId, parameters });
            assert(quote.ok);
            assert.equal((await request('execute', { actionId, parameters, requestId: randomUUID(), confirmationToken: quote.confirmationToken })).classification, 'committed');
        }
        const advanced = await request('inspect');
        assert.equal(advanced['world_state.json'].value.worldTurn, 1);
        const stale = await request('preview', { actionId: 'commerce:end_day', parameters: {} });
        assert.equal(await request('checkpoint_restore', { checkpointId: checkpoint.id }), true);
        const restored = await request('inspect');
        assert.equal(restored['game_state.json'].value.stateRevision, advanced['game_state.json'].value.stateRevision + 1,
            'restore is a new canonical publication, not a rollback of the concurrency revision');
        const restoredContent = structuredClone(restored);
        const initialContent = structuredClone(initial);
        delete restoredContent['game_state.json'].value.stateRevision;
        delete initialContent['game_state.json'].value.stateRevision;
        assert.deepEqual(restoredContent, initialContent, 'checkpoint 1.3 restores complete game content and seven ledgers');
        assert.notEqual((await request('execute', { actionId: stale.actionId, parameters: {}, requestId: randomUUID(), confirmationToken: stale.confirmationToken })).commitStatus, 'committed');
        await request('reopen');
        assert.deepEqual(await request('inspect'), restored, 'panel reopen preserves restored state and revision');
        const beforeReload = session;
        hello = new Promise(resolve => { nextHost = resolve; });
        await request('reload');
        await deadline(hello, 90000, 'qa_reload_timeout');
        assert.notEqual(session, beforeReload, 'reload must use a new Host session');
        await request('reopen');
        assert.deepEqual(await request('inspect'), restored, 'window reload preserves restored state and revision');
        assert.notEqual((await request('execute', execute)).commitStatus, 'committed', 'restart never implies safe retry');
        await request('stop');
        await deadline(test, 30000, 'qa_shutdown_timeout');
        return { status: 'passed', fixtureId: 'lifecycle_v1', checks: ['real Host commerce', 'readonly preview',
            'duplicate receipt', 'checkpoint complete restore', 'stale epoch', 'panel reopen', 'window reload', 'restart handle rejection'] };
    } finally {
        // Before any authenticated session, no QA mutation could have been admitted.
        if (child && !exited && !session) {
            await terminateUnconnectedHost(child);
            try { await deadline(test, 10000, 'qa_unconnected_shutdown_timeout'); } catch { /* preserve unconfirmed ownership */ }
        }
        if (!exited && connection && !connection.destroyed) {
            try { await request('stop'); await deadline(test, 30000, 'qa_shutdown_timeout'); } catch { /* retain ownership artifacts on failure */ }
        }
        for (const entry of pending.values()) clearTimeout(entry.timer);
        for (const socket of sockets) socket.destroy();
        await new Promise(resolve => server.close(resolve));
        if ((!child || exited) && fs.realpathSync(owned) === owned && path.dirname(owned) === temp
            && path.basename(owned).startsWith('lorerelay-live-qa-') && !fs.lstatSync(owned).isSymbolicLink()) {
            fs.rmSync(owned, { recursive: true });
        } else {
            // A connected timeout is not cancellation; retain its fixture and Host.
            child?.unref(); child?.stdout.destroy(); child?.stderr.destroy();
            console.error(`QA environment retained; Host exit was not confirmed: ${owned}`);
        }
    }
}
async function main() {
    if (process.argv.slice(2).join(' ') !== '--scenario lifecycle_v1') {
        console.log(JSON.stringify({ status: 'invalid', allowed: '--scenario lifecycle_v1' })); process.exitCode = 2; return;
    }
    try { console.log(JSON.stringify(await runLifecycle())); }
    catch (error) { console.error(error.stack); console.log(JSON.stringify({ status: 'failed' })); process.exitCode = 1; }
}
if (require.main === module) void main();
module.exports = { runLifecycle };
