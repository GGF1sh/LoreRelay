const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { PassThrough, Writable } = require('node:stream');
const cp = require('node:child_process');
const originalSpawn = cp.spawn;
let mode = 'success', loggedIn = true, authMethod = 'claude.ai', child, launches = [], kills = 0;
cp.spawn = (exe, args, options) => {
    const current = child = new EventEmitter();
    current.stdout = new PassThrough(); current.stderr = new PassThrough();
    current.kill = () => { kills++; return true; };
    let input = '';
    const record = { exe, args, options, input: '' }; launches.push(record);
    current.stdin = new Writable({ write(chunk, _, done) { input += chunk.toString(); done(); }, final(done) {
        record.input = input;
        queueMicrotask(() => {
            if (args.includes('-p') && mode === 'pending') return;
            const emit = value => current.stdout.write(typeof value === 'string' ? value : JSON.stringify(value) + '\n');
            let code = 0;
            if (args.includes('--version')) emit('2.1.178 (Claude Code)');
            else if (args.includes('--help')) emit('--safe-mode --strict-mcp-config --tools --no-session-persistence --output-format');
            else if (args.includes('status')) { emit({ loggedIn, authMethod, apiProvider: 'firstParty' }); code = loggedIn ? 0 : 1; }
            else if (args.includes('login')) { loggedIn = true; authMethod = 'claude.ai'; }
            else {
                emit({ type: 'system', subtype: 'init', session_id: 'session', model: mode === 'wrong-model' ? 'other-model' : 'claude-fixture', tools: mode === 'tools' ? ['Bash'] : [] });
                if (mode === 'malformed') emit('not json\n');
                if (mode === 'quota') emit({ type: 'rate_limit_event', rate_limit_info: { status: 'rejected' } });
                emit({ type: 'stream_event', session_id: 'session', event: { delta: { type: 'text_delta', text: '下書き' } } });
                emit({ type: 'result', subtype: 'success', session_id: mode === 'foreign' ? 'other' : 'session', is_error: false, result: 'fixture narrative\n```json\n{}\n```' });
                if (mode === 'conflict') emit({ type: 'result', subtype: 'success', session_id: 'session', is_error: false, result: 'different' });
                if (mode === 'failed-exit') code = 1;
            }
            current.emit('close', code);
        });
        done();
    } });
    return current;
};
const { ClaudeGmClient } = require('../out/claudeGmClient');
const make = () => new ClaudeGmClient({ executable: 'fixture', profileDirectory: 'isolated-profile', workingDirectory: 'isolated-work', model: 'claude-fixture', timeoutMs: 50 });
(async () => {
    let client = make(); assert.equal(await client.initialize(), 'ready');
    let draft = ''; assert.match(await client.generate('game context', text => { draft += text; }), /fixture narrative/);
    assert.equal(draft, '下書き'); assert.equal(client.clientVersion, '2.1.178'); assert.equal(client.reportedModel, 'claude-fixture');
    const turn = launches.find(item => item.args.includes('-p'));
    assert.equal(turn.options.shell, false); assert.equal(turn.options.windowsHide, true);
    assert.equal(turn.options.env.CLAUDE_CONFIG_DIR, 'isolated-profile');
    assert.equal(turn.options.env.ANTHROPIC_API_KEY, undefined); assert.equal(turn.options.env.CLAUDE_CODE_OAUTH_TOKEN, undefined);
    assert.equal(turn.input, 'game context'); assert(!turn.args.includes('--bare'));
    assert(turn.args.includes('--safe-mode')); assert(turn.args.includes('--strict-mcp-config'));
    assert.equal(turn.args[turn.args.indexOf('--tools') + 1], '');
    assert.equal(turn.args[turn.args.indexOf('--disallowedTools') + 1], '*');
    assert(!turn.args.includes('--fallback-model')); assert(!turn.args.includes('--resume'));
    client.dispose();
    loggedIn = false; client = make(); assert.equal(await client.initialize(), 'login_required');
    await assert.rejects(client.generate('must not send', () => {}), /subscription_auth_required/);
    await client.login(); assert.equal(await client.checkAuthentication(), 'ready'); client.dispose();
    authMethod = 'api_key'; client = make(); await assert.rejects(client.initialize(), /subscription_auth_required/); client.dispose(); authMethod = 'claude.ai';
    for (mode of ['wrong-model', 'tools', 'malformed', 'foreign', 'conflict', 'failed-exit', 'quota']) {
        client = make(); await client.initialize(); await assert.rejects(client.generate('fixture', () => {})); client.dispose();
    }
    mode = 'pending'; client = make(); await client.initialize();
    const cancelled = assert.rejects(client.generate('fixture', () => {}), /cancelled/);
    client.dispose(); await cancelled; assert(kills > 0);
    client = make(); await client.initialize(); await assert.rejects(client.generate('fixture', () => {}), /timeout/); client.dispose();
    console.log('Claude GM fixture: isolated subscription auth, no tools/API fallback, structured stream, model/session identity, conflicts, cancellation and timeout passed. No actual model used.');
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => { cp.spawn = originalSpawn; });
