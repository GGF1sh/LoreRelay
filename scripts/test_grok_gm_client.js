const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { PassThrough, Writable } = require('node:stream');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const cp = require('node:child_process'), originalSpawn = cp.spawn;
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lorerelay-grok-'));
let mode = 'success', kills = 0;
const launches = [];
cp.spawn = (exe, args, options) => {
    const child = new EventEmitter(); child.stdout = new PassThrough(); child.stderr = new PassThrough();
    child.kill = () => { kills++; queueMicrotask(() => child.emit('close', null)); return true; };
    const calls = []; launches.push({ args, options, calls });
    if (args[0] === 'models') {
        child.stdin = new PassThrough();
        queueMicrotask(() => {
            if (mode === 'catalog-pending') return;
            child.stdout.write(mode === 'catalog-large' ? 'x'.repeat(65537)
                : mode === 'catalog-invalid' ? 'Default model: should-not-be-a-candidate\n'
                    : 'You are not authenticated.\nDefault model: ignored\nAvailable models:\n  * grok-4.6 (default)\n  - grok-4.5\n  - grok-4.6\n  - bad;command\n');
            child.emit('close', mode === 'catalog-failed' ? 1 : 0);
        });
        return child;
    }
    const emit = value => child.stdout.write(JSON.stringify({ jsonrpc: '2.0', ...value }) + '\n');
    child.stdin = new Writable({ write(chunk, _, done) {
        const call = JSON.parse(chunk.toString()); calls.push(call); done();
        queueMicrotask(() => {
            if (call.method === 'initialize') emit({ id: call.id, result: { protocolVersion: 1 } });
            if (call.method === 'session/new') {
                if (mode === 'unauth') emit({ id: call.id, error: { code: -32000, message: 'Authentication required' } });
                else emit({ id: call.id, result: { sessionId: 's', models: { currentModelId: mode === 'wrong-model' ? 'other' : 'fixture' } } });
            }
            if (call.method === 'session/prompt' && mode !== 'pending') {
                emit({ method: 'session/update', params: { sessionId: 's', update: {
                    sessionUpdate: mode === 'tools' ? 'tool_call' : 'agent_message_chunk', content: { type: 'text', text: 'candidate' },
                } } });
                emit({ id: call.id, result: { stopReason: mode === 'partial' ? 'max_tokens' : 'end_turn' } });
            }
        });
    } });
    return child;
};
const { GrokGmClient } = require('../out/grokGmClient');
const make = () => new GrokGmClient({ executable: __filename, profileDirectory: path.join(root, 'profile'),
    workingDirectory: path.join(root, 'work'), model: 'fixture', timeoutMs: 50 });
(async () => {
    mode = 'catalog-success';
    let catalog = make();
    assert.deepEqual(await catalog.listModels(), [
        { model: 'grok-4.6', displayName: 'grok-4.6' }, { model: 'grok-4.5', displayName: 'grok-4.5' },
    ]);
    assert.deepEqual(launches.at(-1).args, ['models']);
    assert.equal(launches.at(-1).calls.length, 0);
    catalog.dispose();
    for (mode of ['catalog-invalid', 'catalog-large', 'catalog-failed', 'catalog-pending']) {
        catalog = make(); await assert.rejects(catalog.listModels(), /model_list_invalid|timeout/); catalog.dispose();
    }
    mode = 'catalog-pending'; catalog = make();
    const listing = catalog.listModels();
    await assert.rejects(catalog.listModels(), /busy_or_closed/);
    const listingCancelled = assert.rejects(listing, /cancelled/);
    catalog.dispose(); await listingCancelled;
    mode = 'success';
    let client = make(); assert.equal(await client.initialize(), 'ready');
    assert.equal(await client.generate('fixture context', () => {}), 'candidate');
    await assert.rejects(client.generate('duplicate', () => {}), /busy_or_closed/);
    const launch = launches.at(-1);
    assert.equal(launch.calls.filter(call => call.method === 'session/prompt').length, 1);
    assert.equal(launch.options.shell, false);
    assert.equal(launch.options.env.XAI_API_KEY, undefined);
    assert.equal(launch.options.env.GROK_HOME, path.join(root, 'profile'));
    assert.equal(launch.options.env.GROK_CLAUDE_MCPS_ENABLED, '0');
    assert.equal(launch.options.env.GROK_MEMORY, '0');
    const agentPath = launch.args[launch.args.indexOf('--agent') + 1];
    assert.equal(agentPath, path.join(root, 'profile', 'lorerelay-gm.md'));
    const agent = fs.readFileSync(agentPath, 'utf8');
    assert.match(agent, /toolConfig:\n  tools:\n    - id: "GrokBuild:read_file"/);
    assert.match(agent, /disallowedTools: \["GrokBuild:read_file"\]/);
    assert.match(fs.readFileSync(path.join(root, 'profile', 'config.toml'), 'utf8'), /\[agent\]\nname = "lorerelay-gm"/);
    for (const key of ['injectDefaultTools', 'discoverSkills', 'inheritSkills', 'agentsMd']) {
        assert.match(agent, new RegExp(`${key}: false`));
    }
    assert.equal(launch.args.includes('--tools'), false);
    assert.equal(launch.calls[0].params.clientCapabilities.terminal, false);
    client.dispose();
    mode = 'unauth'; client = make(); assert.equal(await client.initialize(), 'login_required');
    await assert.rejects(client.generate('never send', () => {}));
    assert(!launches.at(-1).calls.some(call => call.method === 'session/prompt')); client.dispose();
    mode = 'wrong-model'; client = make(); await assert.rejects(client.initialize(), /model_unverified/); client.dispose();
    for (mode of ['tools', 'partial']) {
        client = make(); await client.initialize(); await assert.rejects(client.generate('fixture', () => {})); client.dispose();
    }
    mode = 'pending'; client = make(); await client.initialize();
    const cancelled = assert.rejects(client.generate('fixture', () => {}), /cancelled/);
    client.dispose(); await cancelled;
    assert(launches.at(-1).calls.some(call => call.method === 'session/cancel'));
    client = make(); await client.initialize(); await assert.rejects(client.generate('fixture', () => {}), /timeout/); client.dispose();
    assert(kills > 0);
    console.log('Grok process isolation, readiness, one request, model mismatch, tools, partial, cancellation and timeout passed.');
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => { cp.spawn = originalSpawn; });
