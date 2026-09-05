'use strict';

// Internal trusted runner host. There is no caller-supplied workspace or module.
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');
const ROOT = path.resolve(__dirname, '..');
const FILES = ['game_state.json', 'world_state.json', 'world_forge.json', 'game_rules.json'];
const fixtureRoot = path.join(ROOT, 'fixtures', 'action-scenarios', 'merchant_route_v1');
let active;
let modules;
const vscode = {
    workspace: { workspaceFolders: [], isTrusted: true, getConfiguration: () => ({ get: (_key, fallback) => fallback }) },
    window: { showErrorMessage() {}, showWarningMessage() {}, showInformationMessage() {}, createOutputChannel: () => ({ appendLine() {}, dispose() {} }) },
    env: { language: 'en' }, Uri: { file: value => ({ fsPath: value, path: value }) },
    EventEmitter: class { event() { return { dispose() {} }; } fire() {} dispose() {} },
};
function loadModules() {
    if (modules) return modules;
    const original = Module._load;
    Module._load = function(request) {
        return request === 'vscode' ? vscode : original.apply(this, arguments);
    };
    try {
        modules = {
            createRuntime: require('../out/commerceActionRuntime').createCommerceActionRuntime,
            createGate: require('../out/deterministicWorkspaceMutationGate').createDeterministicWorkspaceMutationGate,
            createWebview: require('../out/commerceActionWebview').createCommerceActionWebviewAdapter,
            validateGameState: require('../out/validateGameState').validateGameState,
        };
        return modules;
    } finally { Module._load = original; }
}
async function openActionFixture() {
    if (active) throw new Error('fixture_already_active');
    const tempRoot = fs.realpathSync(os.tmpdir());
    const workspace = fs.mkdtempSync(path.join(tempRoot, 'lorerelay-action-'));
    const ownedRealPath = fs.realpathSync(workspace);
    active = workspace;
    function cleanup() {
        // Resolve and verify the absolute deletion target in this same process.
        const relative = path.relative(tempRoot, ownedRealPath);
        if (relative.startsWith('..') || path.isAbsolute(relative) || relative.includes(path.sep)
            || !relative.startsWith('lorerelay-action-') || fs.lstatSync(workspace).isSymbolicLink()
            || fs.realpathSync(workspace) !== ownedRealPath || active !== workspace) throw new Error('cleanup_ownership_failed');
        fs.rmSync(workspace, { recursive: true });
        active = undefined;
        vscode.workspace.workspaceFolders = [];
    }
    try {
        if (fs.lstatSync(fixtureRoot).isSymbolicLink()) throw new Error('invalid_fixture');
        for (const name of FILES) {
            const source = path.join(fixtureRoot, name);
            if (!fs.lstatSync(source).isFile() || fs.lstatSync(source).isSymbolicLink()
                || fs.statSync(source).size > 1_000_000) throw new Error('invalid_fixture');
            fs.copyFileSync(source, path.join(workspace, name));
        }
        vscode.workspace.workspaceFolders = [{ uri: vscode.Uri.file(workspace), name: 'Action fixture', index: 0 }];
        const loaded = loadModules();
        if (loaded.validateGameState(JSON.parse(fs.readFileSync(path.join(workspace, 'game_state.json'), 'utf8'))).length)
            throw new Error('invalid_fixture_state');
        const gate = loaded.createGate();
        const runtime = await loaded.createRuntime(gate);
        // QA authority is created only after the catalog copy and ownership checks.
        const context = runtime.service.createTrustedSession('qa-runner');
        return { workspace, gate, runtime, context, modules: loaded, close() {
            runtime.service.close(context);
            cleanup();
        } };
    } catch (error) { cleanup(); throw error; }
}
module.exports = { openActionFixture };
