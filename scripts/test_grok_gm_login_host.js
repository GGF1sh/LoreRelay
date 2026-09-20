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
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lorerelay-grok-picker-'));
    let workspace = root;
    const events = [], updates = [], errors = [], clients = [];
    class Client {
        constructor(config) { this.config = config; clients.push(this); }
        async listModels() {
            events.push('catalog');
            if (options.catalogFailure) throw new Error('unavailable');
            return [{ model: 'grok-4.6', displayName: 'grok-4.6' }, { model: 'grok-4.5', displayName: 'grok-4.5' }];
        }
        async initialize() {
            events.push('authenticate:' + this.config.model);
            if (options.authFailure) throw new Error('grok_model_mismatch');
            return 'ready';
        }
        generate() { throw new Error('PICKER_MUST_NOT_GENERATE'); }
        dispose() { this.disposed = true; }
    }
    const vscode = {
        ConfigurationTarget: { Workspace: 2 },
        workspace: { onDidChangeWorkspaceFolders: () => ({}), onDidChangeConfiguration: () => ({}),
            getConfiguration: () => ({ update: async (...args) => updates.push(args) }) },
        window: {
            showWarningMessage: async () => 'GMとして接続',
            showQuickPick: async items => {
                assert.equal(updates.length, 0);
                assert(!events.some(event => event.startsWith('authenticate:')));
                if (!options.catalogFailure) assert.equal(items[0].model, 'grok-4.5');
                if (options.cancel) return undefined;
                if (options.changeWorkspace) workspace += '-changed';
                return items.find(item => item.model === (options.manual || options.catalogFailure ? '' : 'grok-4.6'));
            },
            showInputBox: async () => { events.push('manual'); return options.cancelManual ? undefined : 'grok-custom'; },
            showInformationMessage: async () => {},
            showErrorMessage: async message => errors.push(message),
        },
    };
    const mocks = { vscode, './grokGmClient': { GrokGmClient: Client },
        './experience': { onExperienceProfileChanged: () => ({}) }, './workspacePaths': { getWorkspacePath: () => workspace },
        './checkpointSnapshot': { CHECKPOINT_MUTABLE_LEDGER_FILES: [] }, './acceptedTurnReplayGuard': {} };
    const exported = {};
    vm.runInNewContext(fs.readFileSync(filename, 'utf8'), { exports: exported,
        require: id => Object.hasOwn(mocks, id) ? mocks[id] : nativeRequire(id), console, Buffer, Error }, { filename });
    exported.initializeGmConnectionHost({ subscriptions: [], globalStorageUri: { fsPath: root },
        workspaceState: { get: () => ({ executable: 'fixture', model: 'grok-4.5' }), update: async (...args) => updates.push(args) } }, {});
    await exported.configureGrokGm();
    assert.equal(exported.isGmConnectionBusy(), false);
    assert(clients.every(client => client.disposed));
    return { events, updates, errors };
}
(async () => {
    const selected = await run();
    assert.deepEqual(selected.events, ['catalog', 'authenticate:grok-4.6']);
    assert.equal(selected.updates[0][1].model, 'grok-4.6');
    assert.equal(selected.updates.length, 2);
    for (const options of [{ manual: true }, { catalogFailure: true }]) {
        assert.equal((await run(options)).updates[0][1].model, 'grok-custom');
    }
    for (const options of [{ cancel: true }, { changeWorkspace: true }, { manual: true, cancelManual: true }, { authFailure: true }]) {
        assert.equal((await run(options)).updates.length, 0);
    }
    console.log('Grok picker: catalog, current selection, explicit manual fallback, cancellation, stale scope and authentication-gated persistence passed. Host UI mocked.');
})().catch(error => { console.error(error); process.exitCode = 1; });
