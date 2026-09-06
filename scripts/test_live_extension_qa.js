'use strict';
const assert = require('assert/strict');
const { parseLiveQaRequest, LIVE_QA_OPERATIONS } = require('../out/liveExtensionQaCore');
const base = { id: 'request_0001', session: 'host_session', op: 'inspect', args: {} };
assert(parseLiveQaRequest(base));
for (const op of ['eval', 'shell', 'read_file', 'authorizeAdultMod', 'set_role']) assert.equal(parseLiveQaRequest({ ...base, op }), undefined);
for (const args of [{ path: 'game_state.json' }, { role: 'qa-runner' }, { workspace: 'C:/user' }, { command: 'reload' }])
    assert.equal(parseLiveQaRequest({ ...base, args }), undefined);
assert.equal(parseLiveQaRequest({ ...base, principal: 'qa-runner' }), undefined);
assert.equal(parseLiveQaRequest({ ...base, op: 'checkpoint_restore', args: { checkpointId: '../outside' } }), undefined);
assert(parseLiveQaRequest({ ...base, op: 'checkpoint_restore', args: { checkpointId: 'cp-123' } }));
assert.equal(LIVE_QA_OPERATIONS.length, 16);
assert.equal(parseLiveQaRequest({ ...base, op: 'ui_action', args: { controlId: 'mod-manager-show-adult', event: 'click' } }), undefined);
assert.equal(parseLiveQaRequest({ ...base, op: 'ui_action', args: { controlId: 'mod-manager-resolve', event: 'eval' } }), undefined);
assert(parseLiveQaRequest({ ...base, op: 'ui_action', args: { controlId: 'mod-manager-resolve', event: 'click' } }));
console.log('Live QA closed protocol: action, authority and path injection rejected.');

async function failureWorker() {
    const fs = require('fs');
    const os = require('os');
    const { spawn } = require('child_process');
    const { runLifecycle } = require('./run_live_extension_qa');
    const ownedDirectories = () => fs.readdirSync(os.tmpdir()).filter(name => name.startsWith('lorerelay-live-qa-')).sort();
    const Module = require('module');
    const original = Module.prototype.require;
    Module.prototype.require = function(id) { return id === 'vscode' ? {} : original.apply(this, arguments); };
    const { createLiveQaProbe } = require('../out/liveQaProbeHost');
    Module.prototype.require = original;
    let panel, callback, sent, revision = 'revision-one', disposed = false;
    const probe = createLiveQaProbe('session-one', () => panel, () => ({ semanticRevision: revision }));
    assert.deepEqual(await probe(), { confirmed: false, reason: 'panel_absent' });
    panel = { webview: {
        onDidReceiveMessage: cb => { callback = cb; return { dispose: () => { disposed = true; } }; },
        postMessage: message => { sent = message; return Promise.resolve(true); },
    } };
    const reply = (overrides = {}) => callback({ type: 'liveQaProbeResult', session: sent.session,
        generation: sent.generation, probeId: sent.probeId,
        rendered: { visible: true, ready: true, revision: 'revision-one' }, ...overrides });
    let waiting = probe();
    reply({ session: 'wrong' }); assert.equal(disposed, false);
    reply({ generation: 'old-panel' }); assert.equal(disposed, false);
    reply({ probeId: 'old-probe' }); assert.equal(disposed, false);
    reply(); assert.equal((await waiting).confirmed, true);
    disposed = false; waiting = probe(); revision = 'revision-two'; reply();
    assert.equal((await waiting).confirmed, false, 'concurrent Host publication is not rendered evidence');
    waiting = probe(); panel = {}; reply();
    assert.equal((await waiting).reason, 'panel_replaced');
    const before = ownedDirectories();
    await assert.rejects(runLifecycle({ listen: () => { throw new Error('fixture_listen_failure'); } }), /fixture_listen_failure/);
    assert.deepEqual(ownedDirectories(), before, 'listener startup failure removes its owned fixture');
    await assert.rejects(runLifecycle({ resolveExecutable: async () => { throw new Error('fixture_download_failure'); } }), /fixture_download_failure/);
    assert.deepEqual(ownedDirectories(), before, 'download failure closes server and removes its owned fixture');
    let child;
    await assert.rejects(runLifecycle({ resolveExecutable: async () => process.execPath, startTimeoutMs: 100,
        spawnHost: (_executable, _args, options) => {
            child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], options);
            return child;
        },
    }), /qa_host_start_timeout/);
    assert(child.exitCode !== null || child.signalCode !== null, 'unconnected owned Host must exit');
    assert.deepEqual(ownedDirectories(), before, 'startup failure removes fixture only after child exit');
    console.log('Download failure and unconnected Host cleanup passed.');
}
if (process.argv[2] === '--failure-worker') {
    void failureWorker().catch(error => { console.error(error); process.exitCode = 1; });
} else {
    const { spawnSync } = require('child_process');
    const child = spawnSync(process.execPath, [__filename, '--failure-worker'], { encoding: 'utf8', timeout: 15000, windowsHide: true });
    assert.equal(child.status, 0, child.error?.message || child.stderr || child.stdout);
    console.log('Failure worker exits promptly with no retained IPC handles.');
}
