const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { PassThrough, Writable } = require('node:stream');
const cp = require('node:child_process');
const originalSpawn = cp.spawn;
let account = { type: 'chatgpt' }, respondToTurn = true, conflict = false;
let child, launch, requests;
let loginResponse = { type: 'chatgptDeviceCode', loginId: 'ours', verificationUrl: 'https://auth.openai.com/codex/device', userCode: 'TEST-1234' };
cp.spawn = (executable, args, options) => {
    launch = { executable, args, options }; requests = [];
    child = new EventEmitter();
    child.stdout = new PassThrough(); child.stderr = new PassThrough(); child.kill = () => true;
    child.stdin = new Writable({ write(chunk, _, done) {
        const m = JSON.parse(chunk.toString()); requests.push(m);
        queueMicrotask(() => {
            if (!('id' in m)) return;
            const result = m.method === 'account/read' ? { account }
                : m.method === 'account/login/start' ? loginResponse
                : m.method === 'thread/start' ? { thread: { id: 'thread' }, model: 'fixture-model' }
                : m.method === 'turn/start' ? { turn: { id: 'turn' } } : {};
            child.stdout.write(JSON.stringify({ id: m.id, result }) + '\n');
            if (m.method === 'turn/start' && respondToTurn) {
                for (const msg of [
                    { method: 'item/completed', params: { threadId: 'foreign', turnId: 'turn', item: { id: 'bad', type: 'agentMessage', text: 'foreign' } } },
                    { method: 'turn/started', params: { threadId: 'thread', turn: { id: 'turn' } } },
                    { method: 'item/completed', params: { threadId: 'thread', turnId: 'turn', item: { id: 'progress', type: 'agentMessage', phase: 'commentary', text: 'not the final candidate' } } },
                    { method: 'item/completed', params: { threadId: 'thread', turnId: 'turn', item: { id: 'answer', type: 'agentMessage', text: 'fixture reply' } } },
                    { method: 'item/completed', params: { threadId: 'thread', turnId: 'turn', item: { id: 'answer', type: 'agentMessage', text: conflict ? 'conflicting reply' : 'fixture reply' } } },
                    { method: 'turn/completed', params: { threadId: 'thread', turn: { id: 'turn', status: 'completed' } } },
                ]) child.stdout.write(JSON.stringify(msg) + '\n');
            }
        });
        done();
    } });
    return child;
};
const { CodexGmClient, resolveCodexExecutable } = require('../out/codexGmClient');
const create = () => new CodexGmClient({ executable: 'fixture', workingDirectory: 'isolated-work',
    profileDirectory: 'isolated-profile', model: 'fixture-model', timeoutMs: 1000 });
(async () => {
    if (process.platform === 'win32') {
        const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gm native codex '));
        const triple = process.arch === 'arm64' ? 'aarch64-pc-windows-msvc' : 'x86_64-pc-windows-msvc';
        const binary = path.join(root, 'node_modules', '@openai', `codex-win32-${process.arch === 'arm64' ? 'arm64' : 'x64'}`,
            'vendor', triple, 'bin', 'codex.exe');
        fs.mkdirSync(path.dirname(binary), { recursive: true }); fs.writeFileSync(binary, 'fixture; never executed');
        fs.writeFileSync(path.join(root, 'codex.cmd'), 'fixture shell wrapper; never executed');
        const oldPath = process.env.PATH, oldAppData = process.env.APPDATA;
        try {
            process.env.PATH = root; process.env.APPDATA = root;
            assert.equal(resolveCodexExecutable('codex'), binary);
        } finally {
            if (oldPath === undefined) delete process.env.PATH; else process.env.PATH = oldPath;
            if (oldAppData === undefined) delete process.env.APPDATA; else process.env.APPDATA = oldAppData;
        }
    }
    const client = create();
    assert.equal(await client.initialize(), 'ready');
    assert.equal(await client.generate('fixture input', () => {}), 'fixture reply');
    assert.equal(launch.options.shell, false);
    assert.equal(launch.options.windowsHide, true);
    assert.equal(launch.options.env.CODEX_HOME, 'isolated-profile');
    assert.equal(launch.options.env.OPENAI_API_KEY, undefined);
    const thread = requests.find(m => m.method === 'thread/start');
    assert.deepEqual(thread.params.environments, []);
    assert.equal(thread.params.ephemeral, true);
    assert.equal(thread.params.sandbox, 'read-only');
    client.dispose();
    conflict = true;
    const conflicting = create(); await conflicting.initialize();
    await assert.rejects(conflicting.generate('fixture input', () => {}), /candidate_conflict/);
    conflicting.dispose(); conflict = false;
    account = null;
    const unauthenticated = create();
    assert.equal(await unauthenticated.initialize(), 'login_required');
    assert.deepEqual(await unauthenticated.startDeviceLogin(), { loginId: 'ours', verificationUrl: loginResponse.verificationUrl, userCode: 'TEST-1234' });
    assert.deepEqual(requests.find(m => m.method === 'account/login/start').params, { type: 'chatgptDeviceCode' });
    const validLogin = loginResponse;
    for (const invalid of [
        { verificationUrl: 'http://localhost:1455/auth/callback' },
        { verificationUrl: 'https://auth.openai.com.attacker.invalid/codex/device' },
        { verificationUrl: 'https://user:password@auth.openai.com/codex/device' },
        { verificationUrl: 'not a URL' }, { userCode: 'code\nSECRET' }, { loginId: '' }, { type: 'apiKey' },
    ]) {
        loginResponse = { ...validLogin, ...invalid };
        await assert.rejects(unauthenticated.startDeviceLogin(), /codex_login_(origin|response)_invalid/);
    }
    loginResponse = validLogin;
    assert.equal(requests.some(m => m.method === 'turn/start'), false);
    let loginDone = false;
    const login = unauthenticated.waitForLogin('ours', 1000).then(() => { loginDone = true; });
    child.stdout.write(JSON.stringify({ method: 'account/login/completed', params: { loginId: 'foreign', success: true } }) + '\n');
    await new Promise(resolve => setImmediate(resolve)); assert.equal(loginDone, false);
    child.stdout.write(JSON.stringify({ method: 'account/login/completed', params: { loginId: 'ours', success: true } }) + '\n');
    await login;
    await unauthenticated.waitForLogin('ours', 20); // completion may precede UI progress creation
    await assert.rejects(unauthenticated.waitForLogin('missing', 10), /login_timeout/);
    const pendingLogin = unauthenticated.waitForLogin('pending', 1000);
    const cancelledLogin = assert.rejects(pendingLogin, /connection_closed/);
    unauthenticated.dispose(); await cancelledLogin;
    assert.equal(requests.some(m => m.method === 'turn/start'), false, 'Login completion does not submit a prompt');
    unauthenticated.dispose();
    account = { type: 'apiKey' };
    const wrongBilling = create();
    await assert.rejects(wrongBilling.initialize(), /subscription_auth_required/);
    wrongBilling.dispose();
    account = { type: 'chatgpt' }; respondToTurn = false;
    const cancelled = create(); await cancelled.initialize();
    const pending = cancelled.generate('fixture input', () => {});
    const rejected = assert.rejects(pending, /cancelled/);
    await new Promise(resolve => setImmediate(resolve));
    cancelled.dispose(); await rejected;
    assert.ok(requests.some(m => m.method === 'turn/interrupt' && m.params.threadId === 'thread' && m.params.turnId === 'turn'));
    await new Promise(resolve => setImmediate(resolve));
    console.log('Codex GM client fixture process: isolated configuration, subscription auth, correlated reply and cancellation passed. No actual model used.');
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => { cp.spawn = originalSpawn; });
