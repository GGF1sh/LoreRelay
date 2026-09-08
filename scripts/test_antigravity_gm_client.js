const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { PassThrough, Writable } = require('node:stream');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const cp = require('node:child_process'), originalSpawn = cp.spawn;
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lorerelay-agy-'));
let loggedIn = true, mode = 'success', kills = 0, launches = [], loginFlow = false;
cp.spawn = (exe, args, options) => {
    const child = new EventEmitter(); child.stdout = new PassThrough(); child.stderr = new PassThrough();
    child.kill = () => { kills++; return true; };
    const record = { args, options, input: '' }; launches.push(record);
    if (args.includes('--input-format')) queueMicrotask(() => {
        const init = JSON.stringify({ event: 'init', conversation_id: 's',
            init: { model: 'fixture', tools: mode === 'tools' ? ['run_command'] : [] } }) + '\n';
        child.stdout.write(mode === 'duplicate-init' ? init + init : init);
    });
    if (loginFlow && args.includes('/usage')) queueMicrotask(() => {
        child.stderr.write('Authentication required.\nhttps://accounts.google.com/o/oauth2/auth?redirect_uri=https%3A%2F%2Fantigravity.google');
        setImmediate(() => child.stderr.write('%2Foauth-callback&state=fixture\n'));
    });
    child.stdin = new Writable({ write(chunk, _, done) { record.input += chunk.toString(); done(); }, final(done) {
        queueMicrotask(() => {
            if (args.includes('--help')) { child.stderr.write('--input-format --output-format --disable-slash-commands --agent --model'); child.emit('close', 0); }
            else if (args.includes('/usage')) {
                if (loginFlow && record.input === 'fixture-code\n') { loggedIn = true; loginFlow = false; }
                if (!loggedIn) child.stderr.write('Authentication required.\n');
                else { child.stdout.write('Usage: available'); child.emit('close', 0); }
            } else if (mode !== 'pending') {
                if (!record.input) { child.emit('close', 0); return; }
                const emit = e => child.stdout.write(JSON.stringify(e) + '\n');
                emit({ event: 'result', result: { conversation_id: 's', status: 'SUCCESS', response: 'candidate', num_turns: 1 } });
                child.emit('close', mode === 'failed-exit' ? 1 : 0);
            }
        }); done();
    } });
    return child;
};
const { AntigravityGmClient } = require('../out/antigravityGmClient');
const make = () => new AntigravityGmClient({ executable: __filename, profileDirectory: path.join(root, 'profile'), workingDirectory: path.join(root, 'work'), model: 'fixture', timeoutMs: 50 });
(async () => {
    let client = make(); assert.equal(await client.initialize(), 'ready');
    assert.equal(await client.generate('fixture prompt', () => {}), 'candidate');
    const launch = launches.at(-1);
    assert.equal(JSON.parse(launch.input).message.content, 'fixture prompt');
    assert.equal(launch.options.shell, false);
    assert.equal(launch.options.env.USERPROFILE, path.join(root, 'profile'));
    assert.equal(launch.options.env.GEMINI_API_KEY, undefined);
    assert(launch.args.includes('--disable-slash-commands'));
    assert(!launch.args.includes('--continue')); assert(!launch.args.includes('--dangerously-skip-permissions'));
    const settings = JSON.parse(fs.readFileSync(path.join(root, 'profile/.gemini/antigravity-cli/settings.json')));
    assert.equal(settings.useG1Credits, false); assert(settings.permissions.deny.includes('mcp(*)'));
    client.dispose();
    loggedIn = false; client = make(); assert.equal(await client.initialize(), 'login_required');
    const before = launches.length; await assert.rejects(client.generate('do not transmit', () => {})); assert.equal(launches.length, before); client.dispose();
    loginFlow = true; client = make(); let prompts = 0;
    await client.login(async url => { prompts++; assert.equal(new URL(url).searchParams.get('redirect_uri'), 'https://antigravity.google/oauth-callback'); return 'fixture-code'; });
    assert.equal(prompts, 1); client.dispose();
    loginFlow = true; loggedIn = false; client = make();
    await assert.rejects(client.login(async () => undefined), /cancelled/); client.dispose(); loginFlow = false;
    loggedIn = true;
    mode = 'success'; client = make(); await client.initialize(); mode = 'tools';
    await assert.rejects(client.generate('private GM context must stay in Host', () => {}), /antigravity_identity_or_tools/);
    assert.equal(launches.at(-1).input, '', 'unsafe init must be rejected before sending context'); client.dispose();
    client = make(); await assert.rejects(client.initialize(), /antigravity_identity_or_tools/);
    assert.equal(launches.at(-1).input, '', 'readiness probe never sends a model prompt'); client.dispose();
    mode = 'success'; client = make(); await client.initialize(); mode = 'duplicate-init';
    await assert.rejects(client.generate('fixture', () => {}), /antigravity_identity_or_tools/);
    assert.equal(launches.at(-1).input.split('\n').filter(Boolean).length, 1, 'duplicate init never resends context'); client.dispose();
    mode = 'failed-exit'; client = make(); await client.initialize(); await assert.rejects(client.generate('fixture', () => {})); client.dispose();
    mode = 'success'; client = make(); await client.initialize(); mode = 'pending';
    const cancelled = assert.rejects(client.generate('fixture', () => {}), /cancelled/); client.dispose(); await cancelled;
    mode = 'success'; client = make(); await client.initialize(); mode = 'pending'; await assert.rejects(client.generate('fixture', () => {}), /timeout/); client.dispose(); assert(kills > 0);
    console.log('Antigravity process: isolated auth detection, stdin, tools, failed exit, cancellation and timeout passed; no model used');
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => { cp.spawn = originalSpawn; });
