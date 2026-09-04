#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const fsp = require('fs/promises');
const os = require('os');
const path = require('path');
const Module = require('module');
const { createVscodeStub } = require('./test_helpers/vscode_stub');

let dialogSelection;
let clipboard = '';
const warnings = [];
const vscode = createVscodeStub();
vscode.window.showOpenDialog = async () => dialogSelection;
vscode.window.showWarningMessage = async (...args) => {
    warnings.push(args[0]);
    const choices = args.filter(value => typeof value === 'string');
    return choices.at(-1);
};
vscode.env = { clipboard: { writeText: async value => { clipboard = value; } } };
const originalRequire = Module.prototype.require;
Module.prototype.require = function patchedRequire(id) {
    return id === 'vscode' ? vscode : originalRequire.apply(this, arguments);
};

const manager = require('../out/mods/modManagerHost');
const install = require('../out/mods/modInstallHost');
const profileCore = require('../out/mods/modProfileCore');

let assertions = 0;
const eq = (actual, expected, message) => { assertions += 1; assert.deepStrictEqual(actual, expected, message); };
const ok = (value, message) => { assertions += 1; assert.ok(value, message); };
async function rejects(action, code, message) {
    assertions += 1;
    await assert.rejects(action, error => error?.code === code, message);
}

function folder(root, files = {}) {
    fs.mkdirSync(root, { recursive: true });
    for (const [relative, bytes] of Object.entries(files)) {
        const filename = path.join(root, relative);
        fs.mkdirSync(path.dirname(filename), { recursive: true });
        fs.writeFileSync(filename, bytes);
    }
    return root;
}

function packageFiles(id, rating = 'general', name = id) {
    return {
        'lorerelay.mod.json': JSON.stringify({
            format: 'lorerelay-mod/1', id, version: '1.0.0', name, authors: ['test'],
            lorerelay: { minVersion: '1.84.32' }, contentRating: rating, contentTags: [],
            capabilities: ['persona'], dependencies: [], optionalDependencies: [], conflicts: [],
            entrypoints: { personas: [{ id: 'traveler', path: 'content/persona.json' }] },
        }),
        'content/persona.json': JSON.stringify({ version: 1, id: 'traveler', name: 'PRIVATE_PAYLOAD_SENTINEL' }),
    };
}

function profileFor(id, source = 'global') {
    return {
        format: 'lorerelay-mod-profile/1',
        enabled: id ? [{ id, version: '=1.0.0', source }] : [],
        selected: { campaignKit: null },
        adultContent: { allow: false, approvals: [] },
    };
}

function lastState(messages) {
    return [...messages].reverse().find(message => message.type === 'modManagerState');
}

async function resolvedPair(roots, profile) {
    const result = await install.resolveInstalledModProfile({
        ...roots, profile, loreRelayVersion: '1.84.32',
    });
    ok(result.ok, 'fixture profile resolves');
    return result;
}

async function main() {
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'lorerelay-mod-manager-'));
    const globalStorageRoot = folder(path.join(temp, 'global'));
    const installedRoot = path.join(globalStorageRoot, 'mods/packages');
    folder(path.join(installedRoot, 'general.manager/1.0.0'), packageFiles('general.manager', 'general', 'General manager sentinel'));
    folder(path.join(installedRoot, 'adult.manager/1.0.0'), packageFiles('adult.manager', 'adult', 'Adult metadata sentinel'));
    try {
        const pairWorkspace = folder(path.join(temp, 'pair-workspace'));
        const pair = await resolvedPair({ globalStorageRoot, workspaceRoot: pairWorkspace }, profileFor('general.manager'));
        await manager.commitModControlPair(pairWorkspace, pair.profileJson, pair.lockJson);
        eq(fs.readFileSync(path.join(pairWorkspace, '.text-adventure/mod-profile.json'), 'utf8'), pair.profileJson, 'normal commit publishes exact profile');
        eq(fs.readFileSync(path.join(pairWorkspace, '.text-adventure/mod-lock.json'), 'utf8'), pair.lockJson, 'normal commit publishes exact lock');
        eq(fs.existsSync(path.join(pairWorkspace, '.text-adventure/mod-control-transaction.json')), false, 'normal commit removes journal');

        const crashWorkspace = folder(path.join(temp, 'crash-workspace'));
        const crashPair = await resolvedPair({ globalStorageRoot, workspaceRoot: crashWorkspace }, profileFor('general.manager'));
        const nativeRename = fsp.rename;
        const finalProfile = path.join(crashWorkspace, '.text-adventure/mod-profile.json');
        let interrupted = false;
        fsp.rename = async function crashAfterProfile(from, to) {
            const result = await nativeRename.call(this, from, to);
            if (!interrupted && String(to) === finalProfile) {
                interrupted = true;
                throw Object.assign(new Error('simulated process interruption'), { code: 'SIMULATED_CRASH' });
            }
            return result;
        };
        try {
            await rejects(() => manager.commitModControlPair(crashWorkspace, crashPair.profileJson, crashPair.lockJson), 'SIMULATED_CRASH', 'mid-publish interruption propagates');
        } finally { fsp.rename = nativeRename; }
        ok(fs.existsSync(path.join(crashWorkspace, '.text-adventure/mod-control-transaction.json')), 'interrupted commit retains recovery journal');
        await manager.recoverPendingModControlCommit(crashWorkspace);
        eq(fs.readFileSync(path.join(crashWorkspace, '.text-adventure/mod-profile.json'), 'utf8'), crashPair.profileJson, 'recovery keeps exact new profile');
        eq(fs.readFileSync(path.join(crashWorkspace, '.text-adventure/mod-lock.json'), 'utf8'), crashPair.lockJson, 'recovery completes exact new lock');
        eq(fs.existsSync(path.join(crashWorkspace, '.text-adventure/mod-control-transaction.json')), false, 'recovery removes journal only after pair validates');

        const concurrentWorkspace = folder(path.join(temp, 'concurrent-workspace'));
        await manager.commitModControlPair(concurrentWorkspace, pair.profileJson, pair.lockJson);
        const emptyPair = await resolvedPair({ globalStorageRoot, workspaceRoot: concurrentWorkspace }, profileFor());
        const concurrentLock = '{"foreign":true}\n';
        const concurrentProfilePath = path.join(concurrentWorkspace, '.text-adventure/mod-profile.json');
        const concurrentLockPath = path.join(concurrentWorkspace, '.text-adventure/mod-lock.json');
        let changed = false;
        fsp.rename = async function changeLockAfterProfile(from, to) {
            const result = await nativeRename.call(this, from, to);
            if (!changed && String(to) === concurrentProfilePath) {
                changed = true;
                fs.writeFileSync(concurrentLockPath, concurrentLock);
            }
            return result;
        };
        try {
            await rejects(() => manager.commitModControlPair(concurrentWorkspace, emptyPair.profileJson, emptyPair.lockJson), 'MOD_CONTROL_CONCURRENT_CHANGE', 'unexpected concurrent control change fails closed');
        } finally { fsp.rename = nativeRename; }
        eq(fs.readFileSync(concurrentLockPath, 'utf8'), concurrentLock, 'concurrent file is never overwritten');
        await rejects(() => manager.recoverPendingModControlCommit(concurrentWorkspace), 'MOD_CONTROL_CONCURRENT_CHANGE', 'recovery also refuses unexpected concurrent file');

        const generalManifestBytes = fs.readFileSync(path.join(installedRoot, 'general.manager/1.0.0/lorerelay.mod.json'));
        const generalAuth = await install.authorizeInstalledModPackageRead({
            globalStorageRoot, source: 'global', id: 'general.manager', version: '1.0.0',
            expectedManifestHash: require('../out/mods/modHashCore').hashCanonicalModJson(JSON.parse(generalManifestBytes)),
        });
        eq(generalAuth, { ok: false, code: 'ADULT_CONTENT_READ_NOT_REQUIRED' }, 'installed read authority is adult-only');

        const state = new Map();
        const globalState = {
            get: (key, defaultValue) => state.has(key) ? state.get(key) : defaultValue,
            update: async (key, value) => { state.set(key, value); },
        };
        let workspaceRoot = folder(path.join(temp, 'ui-empty'));
        let messages = [];
        const panel = { webview: { postMessage: message => { messages.push(message); return Promise.resolve(true); } } };
        const context = { globalStorageUri: { fsPath: globalStorageRoot }, globalState };
        const host = manager.createModManagerHost({
            context, getPanel: () => panel, getWorkspacePath: () => workspaceRoot,
            currentLoreRelayVersion: () => '1.84.32',
        });
        eq(host.handles('commitGameState'), false, 'manager allowlist cannot bypass arbitrary canonical writes');
        eq(await host.handleMessage({ type: 'commitGameState' }), false, 'unknown manager message is not handled');
        await host.handleMessage({ type: 'requestModManagerState' });
        let uiState = lastState(messages);
        eq(uiState.campaignEmpty, true, 'empty campaign is eligible');
        ok(uiState.packages.some(item => item.id === 'general.manager'), 'general metadata is listed');
        ok(!JSON.stringify(uiState).includes('adult.manager'), 'hidden adult id is absent from UI state');
        ok(!JSON.stringify(uiState).includes('Adult metadata sentinel'), 'hidden adult name is absent from UI state');
        ok(!JSON.stringify(uiState).includes('PRIVATE_PAYLOAD_SENTINEL'), 'UI state contains no package payload text');

        const arbitrarySource = folder(path.join(temp, 'arbitrary-source'), packageFiles('must.not.install'));
        dialogSelection = undefined;
        await host.handleMessage({ type: 'installModPackage', kind: 'folder', destination: 'global', filename: arbitrarySource });
        eq(fs.existsSync(path.join(installedRoot, 'must.not.install/1.0.0')), false, 'webview-supplied source path is ignored');

        await host.handleMessage({ type: 'setModEnabled', id: 'general.manager', version: '1.0.0', source: 'global', enabled: true });
        await host.handleMessage({ type: 'resolveModProfilePreview' });
        uiState = lastState(messages);
        eq(uiState.preview.packages, [{ id: 'general.manager', version: '1.0.0', source: 'global' }], 'resolve preview exposes only canonical metadata');
        eq(uiState.canCommit, true, 'resolved empty campaign can commit');
        await host.handleMessage({ type: 'commitModProfile' });
        eq(profileCore.parseModProfileBytes(fs.readFileSync(path.join(workspaceRoot, '.text-adventure/mod-profile.json'))).ok, true, 'manager commits strict profile');
        eq(profileCore.parseModLockBytes(fs.readFileSync(path.join(workspaceRoot, '.text-adventure/mod-lock.json'))).ok, true, 'manager commits strict lock');

        const existingWorkspace = folder(path.join(temp, 'ui-existing'), { 'game_state.json': '{}' });
        workspaceRoot = existingWorkspace;
        messages = [];
        await host.handleMessage({ type: 'requestModManagerState' });
        eq(lastState(messages).campaignEmpty, false, 'existing campaign requires fork');
        await host.handleMessage({ type: 'setModEnabled', id: 'general.manager', version: '1.0.0', source: 'global', enabled: true });
        await host.handleMessage({ type: 'resolveModProfilePreview' });
        eq(lastState(messages).canCommit, false, 'existing campaign preview cannot commit');
        await host.handleMessage({ type: 'commitModProfile' });
        eq(fs.existsSync(path.join(existingWorkspace, '.text-adventure/mod-profile.json')), false, 'existing campaign profile is untouched');
        eq(fs.readFileSync(path.join(existingWorkspace, 'game_state.json'), 'utf8'), '{}', 'existing campaign state is untouched');

        workspaceRoot = folder(path.join(temp, 'ui-adult'));
        messages = [];
        await host.handleMessage({ type: 'setModAdultVisibility', visible: true });
        uiState = lastState(messages);
        ok(uiState.packages.some(item => item.id === 'adult.manager'), 'adult metadata appears only after visibility confirmation');
        eq(host.adultSessionApprovals(workspaceRoot), [], 'metadata visibility does not authorize adult reads');
        const warningCount = warnings.length;
        await host.handleMessage({ type: 'authorizeAdultMod', id: 'adult.manager', version: '1.0.0', source: 'global' });
        ok(warnings.length >= warningCount + 2, 'adult session read and adult enable use separate confirmations');
        const approval = host.adultSessionApprovals(workspaceRoot)[0];
        eq(Object.keys(approval).sort(), ['contentHash', 'id', 'manifestHash', 'version'], 'session approval is bound to all four identity values');
        await host.handleMessage({ type: 'resolveModProfilePreview' });
        await host.handleMessage({ type: 'commitModProfile' });
        const adultProfile = profileCore.parseModProfileBytes(fs.readFileSync(path.join(workspaceRoot, '.text-adventure/mod-profile.json')));
        ok(adultProfile.ok, 'adult profile parses');
        eq(JSON.parse(JSON.stringify(adultProfile.value.adultContent.approvals)), [approval], 'persisted consent uses exact installed content identity');

        const restarted = manager.createModManagerHost({
            context, getPanel: () => panel, getWorkspacePath: () => workspaceRoot,
            currentLoreRelayVersion: () => '1.84.32',
        });
        eq(restarted.adultSessionApprovals(workspaceRoot), [], 'adult package read authorization is process-local');
        messages = [];
        await restarted.handleMessage({ type: 'requestModManagerState' });
        eq(lastState(messages).safeMode, true, 'restart leaves adult campaign in Safe Mode pending reauthorization');
        await restarted.handleMessage({ type: 'authorizeAdultMod', id: 'adult.manager', version: '1.0.0', source: 'global' });
        eq(restarted.adultSessionApprovals(workspaceRoot).length, 1, 'explicit restart confirmation restores exact session authority');
        messages = [];
        await restarted.handleMessage({ type: 'requestModManagerState' });
        eq(lastState(messages).safeMode, false, 'reauthorized unchanged adult campaign exits Safe Mode');

        await restarted.handleMessage({ type: 'setModAdultVisibility', visible: false });
        eq(restarted.adultSessionApprovals(workspaceRoot), [], 'hiding adult metadata revokes session authority');
        uiState = lastState(messages);
        ok(!JSON.stringify(uiState).includes('adult.manager'), 'hiding adult metadata removes adult id from replacement state');
        ok(!JSON.stringify(uiState).includes('Adult metadata sentinel'), 'hiding adult metadata removes adult name from replacement state');

        clipboard = '';
        await restarted.handleMessage({ type: 'exportModDiagnostics' });
        ok(!clipboard.includes(temp), 'diagnostics omit absolute paths');
        ok(!clipboard.includes('Adult metadata sentinel') && !clipboard.includes('adult.manager'), 'hidden adult metadata is absent from diagnostics');
        const report = JSON.parse(clipboard);
        eq(report.format, 'lorerelay-mod-diagnostics/1', 'diagnostics use bounded machine-readable schema');

        const html = fs.readFileSync(path.join(__dirname, '../webview/index.html'), 'utf8');
        const webview = fs.readFileSync(path.join(__dirname, '../webview/modules/80d-mod-manager.js'), 'utf8');
        ok(html.includes('id="mod-manager-panel"') && html.includes('id="mod-manager-btn"'), 'MOD Manager launcher and panel are present');
        eq(webview.includes('innerHTML'), false, 'manager renderer never uses HTML injection');
        ok(webview.includes("case 'modManagerState'") && webview.includes('replaceChildren'), 'host state replaces visible package DOM');
        for (const locale of ['en', 'ja', 'zh-CN', 'zh-TW']) {
            const strings = JSON.parse(fs.readFileSync(path.join(__dirname, `../locales/${locale}.json`), 'utf8'));
            for (const key of ['webview.modManager.title', 'webview.modManager.adultVisible', 'webview.modManager.resolve', 'webview.modManager.commit', 'webview.modManager.forkRequired']) {
                ok(typeof strings[key] === 'string' && strings[key].length > 0, `${locale} includes ${key}`);
            }
        }
        const extension = fs.readFileSync(path.join(__dirname, '../src/extension.ts'), 'utf8');
        ok(extension.includes('modManagerHost?.handles(message.type)'), 'only manager allowlist is routed around the canonical-write dispatcher');
        ok(extension.includes('await modManagerHost?.recoverCurrentWorkspace()'), 'recovery precedes activation reads');

        console.log(`MOD Manager 3B1: ${assertions} assertions passed.`);
    } finally {
        assert.ok(path.dirname(temp) === os.tmpdir() && path.basename(temp).startsWith('lorerelay-mod-manager-'));
        fs.rmSync(temp, { recursive: true, force: true });
        Module.prototype.require = originalRequire;
    }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
