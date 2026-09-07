'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const filename = path.resolve(__dirname, '../out/gmConnectionHost.js');
const nativeRequire = createRequire(filename);
async function run(options = {}) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lorerelay-login-test-'));
    let workspace = root, client;
    const events = [], logs = [], updates = [], errors = [];
    class Client {
        constructor() { events.push('constructed'); client = this; }
        async initialize() { return 'login_required'; }
        async startDeviceLogin() { events.push('device'); return { loginId: 'device-id', userCode: 'TEST-1234', verificationUrl: 'https://auth.openai.com/codex/device' }; }
        async startLogin() { events.push('browser'); return { loginId: 'browser-id', authUrl: 'https://auth.openai.com/authorize?secret=PRIVATE' }; }
        async waitForLogin(id) {
            events.push('wait:' + id);
            if (this.disposed) throw new Error('codex_connection_closed');
            if (options.timeout) throw new Error('codex_login_timeout');
        }
        async checkAuthentication() { events.push('checked'); return 'ready'; }
        async listModels() {
            if (options.catalogFailure) throw new Error('catalog unavailable');
            return [{ model: 'fixture-model', displayName: 'Fixture' }, { model: 'another-model', displayName: 'Another' }];
        }
        generate() { throw new Error('LOGIN_MUST_NOT_CALL_MODEL'); }
        dispose() { this.disposed = true; }
    }
    const vscode = {
        ConfigurationTarget: { Workspace: 2 }, ProgressLocation: { Notification: 15 }, Uri: { parse: value => value },
        workspace: { onDidChangeWorkspaceFolders: () => ({}), onDidChangeConfiguration: () => ({}),
            getConfiguration: () => ({ update: async (...args) => updates.push(args) }) },
        env: { clipboard: { writeText: async value => { assert.equal(value, 'TEST-1234'); events.push('copied'); if (options.changeOnCopy) workspace += '-changed'; } },
            openExternal: async () => { events.push('opened'); return options.open !== false; } },
        window: {
            showWarningMessage: async () => '接続設定へ進む',
            showInputBox: async () => { if (options.changeWorkspace) workspace += '-changed'; return 'fixture-model'; },
            showQuickPick: async items => {
                if (items[0]?.mode) return items.find(item => item.mode === (options.mode ?? 'device'));
                if (options.cancelPicker) return undefined;
                if (options.changeOnPicker) workspace += '-changed';
                return items.find(item => item.model === (options.selectModel ?? ''));
            },
            showInformationMessage: async (_text, arg) => arg?.modal ? options.cancelCode ? undefined : 'コードをコピーしてブラウザーを開く' : undefined,
            showErrorMessage: async message => errors.push(message),
            withProgress: async (_, fn) => fn({}, { isCancellationRequested: Boolean(options.cancelProgress),
                onCancellationRequested: () => ({ dispose() {} }) }),
        },
    };
    const mocks = { vscode, './codexGmClient': { CodexGmClient: Client },
        './experience': { onExperienceProfileChanged: () => ({}) }, './workspacePaths': { getWorkspacePath: () => workspace },
        './checkpointSnapshot': { CHECKPOINT_MUTABLE_LEDGER_FILES: [] }, './acceptedTurnReplayGuard': {} };
    const exported = {};
    vm.runInNewContext(fs.readFileSync(filename, 'utf8'), { exports: exported,
        require: id => Object.hasOwn(mocks, id) ? mocks[id] : nativeRequire(id), console: { info: text => logs.push(text) }, Buffer, Error }, { filename });
    exported.initializeGmConnectionHost({ subscriptions: [], globalStorageUri: { fsPath: root },
        workspaceState: { get: () => ({ executable: 'fixture', model: 'fixture-model' }), update: async (...args) => updates.push(args) } }, {});
    await exported.configureCodexGm();
    assert(!JSON.stringify(logs).includes('TEST-1234'));
    assert(!JSON.stringify(logs).includes('PRIVATE'));
    assert(!JSON.stringify(logs).includes('https:'));
    assert.equal(exported.isGmConnectionBusy(), false);
    if (client) assert(client.disposed);
    return { events, logs, updates, errors };
}
async function main() {
    const device = await run();
    assert.deepEqual(device.events, ['constructed', 'device', 'copied', 'opened', 'wait:device-id', 'checked']);
    assert.equal(device.updates.length, 2);
    assert(device.logs.some(line => line.includes('authentication_confirmed')));
    const browser = await run({ mode: 'browser' });
    assert.deepEqual(browser.events, ['constructed', 'browser', 'opened', 'wait:browser-id', 'checked']);
    for (const options of [{ cancelCode: true }, { cancelProgress: true }, { timeout: true }, { open: false }, { changeWorkspace: true }, { changeOnCopy: true }]) {
        const result = await run(options);
        assert.equal(result.updates.length, 0);
        if (options.changeWorkspace) assert(result.events.includes('checked'));
        if (options.cancelCode) assert(!result.events.includes('copied') && !result.events.includes('opened'));
        if (options.changeOnCopy) assert(!result.events.includes('opened'));
        if (options.timeout) assert(result.logs.some(line => line.includes('timed_out')));
        if (options.cancelProgress) assert(result.logs.some(line => line.includes('connection_closed')));
    }
    const selected = await run({ selectModel: 'another-model' });
    assert.equal(selected.updates[0][1].model, 'another-model');
    const fallback = await run({ catalogFailure: true });
    assert.equal(fallback.updates[0][1].model, 'fixture-model');
    for (const options of [{ cancelPicker: true }, { changeOnPicker: true }]) {
        assert.equal((await run(options)).updates.length, 0);
    }
    console.log('Codex login Host: official device/browser choices, explicit code copy, completion, cancellation, timeout, stale setup and secret-free diagnostics passed. Authentication mocked.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
