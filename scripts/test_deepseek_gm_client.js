const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { PassThrough, Writable } = require('node:stream');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const cp = require('node:child_process'), originalSpawn = cp.spawn;
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lorerelay-deepseek-'));
let mode = 'success', kills = 0, usageReports = 0;
const launches = [];
cp.spawn = (exe, args, options) => {
    const child = new EventEmitter(); child.stdout = new PassThrough(); child.stderr = new PassThrough();
    child.kill = () => { kills++; return true; };
    const launch = { args, options, input: '' }; launches.push(launch);
    child.stdin = new Writable({ write(chunk, _, done) { launch.input += chunk; done(); }, final(done) {
        queueMicrotask(() => {
            const request = JSON.parse(launch.input);
            let reply;
            if (mode === 'unauth') reply = { error: 'deepseek_http_error', status: 401 };
            else if (request.operation === 'models') reply = { result: { data: [{ id: 'deepseek-v4-flash' }] } };
            else if (mode === 'pending') return;
            else if (mode === 'rate-limit') reply = { error: 'deepseek_http_error', status: 429 };
            else reply = { result: { model: 'deepseek-v4-flash', choices: [{ finish_reason: mode === 'partial' ? 'length' : 'stop',
                message: { role: 'assistant', content: 'candidate' } }], usage: { prompt_tokens: 10, completion_tokens: 20 } } };
            child.stdout.write(mode === 'bad-json' ? 'invalid' : JSON.stringify(reply));
            child.emit('close', reply.error || mode === 'nonzero' ? 1 : 0);
        }); done();
    } });
    return child;
};
const { DeepSeekGmClient } = require('../out/deepSeekGmClient');
const make = (extra = {}) => new DeepSeekGmClient({ executable: 'python', script: 'owned-script', workingDirectory: root,
    model: 'deepseek-v4-flash', maxTokens: 2048, getApiKey: async () => 'fixture-key', timeoutMs: 50,
    onUsage: () => usageReports++, ...extra });
(async () => {
    let client = make(); assert.equal(await client.initialize(), 'ready');
    assert.equal(await client.generate('fixture context', () => {}), 'candidate');
    await assert.rejects(client.generate('duplicate', () => {}), /busy_or_closed/);
    const launch = launches.at(-1);
    assert.equal(launch.options.shell, false);
    assert(!launch.args.some(arg => arg.includes('fixture-key')));
    assert(!Object.values(launch.options.env).includes('fixture-key'));
    assert.equal(JSON.parse(launch.input).maxTokens, 2048);
    assert.equal(usageReports, 1); client.dispose();
    mode = 'unauth'; client = make(); assert.equal(await client.initialize(), 'login_required');
    await assert.rejects(client.generate('never send', () => {})); client.dispose();
    for (const failure of ['partial', 'rate-limit', 'nonzero', 'bad-json']) {
        mode = 'success'; client = make(); await client.initialize(); mode = failure;
        await assert.rejects(client.generate('fixture', () => {})); client.dispose();
    }
    assert.equal(usageReports, 2, 'Valid partial response still reports billed usage');
    mode = 'success'; client = make(); await client.initialize(); mode = 'pending';
    const pending = client.generate('fixture', () => {});
    const cancelled = assert.rejects(pending, /cancelled/); client.dispose(); await cancelled;
    mode = 'success'; client = make(); await client.initialize(); mode = 'pending';
    await assert.rejects(client.generate('fixture', () => {}), /timeout/); client.dispose();
    let release;
    client = make({ getApiKey: () => new Promise(resolve => { release = resolve; }) });
    const keyWait = assert.rejects(client.initialize(), /cancelled/);
    await assert.rejects(client.initialize(), /busy_or_closed/);
    const count = launches.length; client.dispose(); release('fixture-key'); await keyWait;
    assert.equal(launches.length, count, 'Cancellation during SecretStorage read cannot launch a process');
    assert(kills > 0);
    console.log('DeepSeek process: key boundary, readiness, finality, usage, cancellation, timeout and no retry passed.');
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => { cp.spawn = originalSpawn; });
