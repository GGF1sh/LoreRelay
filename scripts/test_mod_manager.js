#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const fsp = require('fs/promises');
const os = require('os');
const path = require('path');
const Module = require('module');
const { createHash, randomUUID } = require('crypto');
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
const { createDeterministicWorkspaceMutationGate } = require('../out/deterministicWorkspaceMutationGate');

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

const controlHash = bytes => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
const compact = json => JSON.stringify(JSON.parse(json));

function controlPaths(workspace, id = randomUUID()) {
    const control = path.join(workspace, '.text-adventure');
    const staging = path.join(control, 'mod-control-staging');
    const transaction = path.join(staging, id);
    return { workspace, id, control, staging, transaction,
        profile: path.join(control, 'mod-profile.json'), lock: path.join(control, 'mod-lock.json'),
        journal: path.join(control, 'mod-control-transaction.json') };
}

function seedControlTransaction(temp, name, pair, options = {}) {
    const p = controlPaths(folder(path.join(temp, name)));
    folder(p.transaction);
    const files = {
        [p.profile]: pair.profileJson, [p.lock]: pair.lockJson,
        [path.join(p.transaction, 'mod-profile.json')]: pair.profileJson,
        [path.join(p.transaction, 'mod-lock.json')]: pair.lockJson,
        ...options,
    };
    // Named options make absent/published/backup states explicit at the call site.
    for (const [name, bytes] of Object.entries(options)) {
        if (name === 'profile') { files[p.profile] = bytes; delete files[name]; }
        if (name === 'lock') { files[p.lock] = bytes; delete files[name]; }
        if (['mod-profile.json', 'mod-lock.json', 'mod-profile.json.old', 'mod-lock.json.old', 'unknown.txt'].includes(name)) {
            files[path.join(p.transaction, name)] = bytes; delete files[name];
        }
    }
    for (const [filename, bytes] of Object.entries(files)) if (bytes !== null) fs.writeFileSync(filename, bytes);
    fs.writeFileSync(p.journal, JSON.stringify({
        format: 'lorerelay-mod-control-transaction/1', id: p.id,
        profileHash: controlHash(pair.profileJson), lockHash: controlHash(pair.lockJson),
        oldProfileHash: controlHash(compact(pair.profileJson)), oldLockHash: controlHash(compact(pair.lockJson)),
    }));
    return p;
}

function assertControlCommitted(p, pair, label) {
    eq(fs.readFileSync(p.profile, 'utf8'), pair.profileJson, `${label}: exact profile`);
    eq(fs.readFileSync(p.lock, 'utf8'), pair.lockJson, `${label}: exact lock`);
    eq(fs.existsSync(p.journal), false, `${label}: no journal`);
    eq(fs.existsSync(p.transaction), false, `${label}: no transaction residue`);
    eq(fs.existsSync(p.staging), false, `${label}: no staging residue`);
}

async function controlCleanupRegressions(temp, pair) {
    const originalRename = fsp.rename;
    for (const [label, oldProfile, oldLock, published] of [
        ['fresh', null, null, ['mod-profile.json', 'mod-lock.json']],
        ['identical', pair.profileJson, pair.lockJson, []],
        ['profile-identical', pair.profileJson, compact(pair.lockJson), ['mod-lock.json']],
        ['lock-identical', compact(pair.profileJson), pair.lockJson, ['mod-profile.json']],
        ['neither-identical', compact(pair.profileJson), compact(pair.lockJson), ['mod-profile.json', 'mod-lock.json']],
    ]) {
        const p = controlPaths(folder(path.join(temp, `r5-${label}`)));
        folder(p.control);
        if (oldProfile !== null) fs.writeFileSync(p.profile, oldProfile);
        if (oldLock !== null) fs.writeFileSync(p.lock, oldLock);
        const before = [p.profile, p.lock].map(filename => fs.existsSync(filename) ? fs.statSync(filename) : undefined);
        const writes = [];
        fsp.rename = async function (from, to) {
            if ([p.profile, p.lock].includes(to)) writes.push(path.basename(to));
            return originalRename.call(this, from, to);
        };
        try { await manager.commitModControlPair(p.workspace, pair.profileJson, pair.lockJson); }
        finally { fsp.rename = originalRename; }
        assertControlCommitted(p, pair, label);
        eq(writes, published, `${label}: publishes only changed sides`);
        for (const [index, filename] of [p.profile, p.lock].entries()) {
            if (before[index] && !published.includes(path.basename(filename))) {
                const after = fs.statSync(filename);
                eq([after.ino, after.mtimeMs], [before[index].ino, before[index].mtimeMs], `${label}: identical final retains identity`);
            }
        }
    }

    for (const [label, options] of [
        ['both-staged', {}],
        ['both-published', { 'mod-profile.json': null, 'mod-lock.json': null }],
        ['profile-published', { 'mod-profile.json': null, lock: compact(pair.lockJson), 'mod-profile.json.old': compact(pair.profileJson) }],
        ['lock-published', { 'mod-lock.json': null, profile: compact(pair.profileJson), 'mod-lock.json.old': compact(pair.lockJson) }],
        ['both-backups', { 'mod-profile.json': null, 'mod-lock.json': null, 'mod-profile.json.old': compact(pair.profileJson), 'mod-lock.json.old': compact(pair.lockJson) }],
    ]) {
        const p = seedControlTransaction(temp, `r5-recover-${label}`, pair, options);
        await manager.recoverPendingModControlCommit(p.workspace);
        assertControlCommitted(p, pair, label);
        await manager.recoverPendingModControlCommit(p.workspace);
        assertControlCommitted(p, pair, `${label} repeated`);
    }

    for (const [label, filename, bytes] of [
        ['tampered-stage', 'mod-profile.json', 'foreign staged content'],
        ['tampered-backup', 'mod-lock.json.old', 'foreign backup content'],
        ['unknown-residue', 'unknown.txt', 'keep unknown evidence'],
        ['oversized-stage', 'mod-profile.json', Buffer.alloc(256 * 1024 + 1)],
    ]) {
        const p = seedControlTransaction(temp, `r5-${label}`, pair, { [filename]: bytes });
        for (let attempt = 0; attempt < 2; attempt++) {
            assertions++;
            await assert.rejects(() => manager.recoverPendingModControlCommit(p.workspace), error =>
                error.code === 'MOD_CONTROL_COMMITTED_CLEANUP_BLOCKED' && error.committed === true);
            eq(fs.readFileSync(p.profile, 'utf8'), pair.profileJson, `${label}: committed profile preserved`);
            eq(fs.readFileSync(p.lock, 'utf8'), pair.lockJson, `${label}: committed lock preserved`);
            eq(fs.readFileSync(path.join(p.transaction, filename)), Buffer.from(bytes), `${label}: evidence preserved`);
            ok(fs.existsSync(p.journal), `${label}: recovery journal retained`);
        }
    }
    const linked = seedControlTransaction(temp, 'r5-hardlinked-stage', pair);
    fs.linkSync(path.join(linked.transaction, 'mod-profile.json'), path.join(linked.workspace, 'foreign-link'));
    assertions++;
    await assert.rejects(() => manager.recoverPendingModControlCommit(linked.workspace), error =>
        error.code === 'MOD_CONTROL_COMMITTED_CLEANUP_BLOCKED' && error.cause.code === 'MOD_CONTROL_UNSAFE_FILE');
    eq(fs.statSync(path.join(linked.workspace, 'foreign-link')).nlink, 2, 'hardlinked staged evidence retained');

    // Actual interruptions after each irreversible cleanup operation. The journal
    // must survive all directory removals and recovery must tolerate missing artifacts.
    for (const boundary of ['unlink-stage', 'unlink-backup', 'rmdir-transaction', 'rmdir-staging', 'unlink-journal']) {
        const p = seedControlTransaction(temp, `r5-crash-${boundary}`, pair, { 'mod-profile.json.old': compact(pair.profileJson) });
        const method = boundary.startsWith('rmdir') ? 'rmdir' : 'unlink';
        const target = boundary === 'unlink-stage' ? path.join(p.transaction, 'mod-profile.json')
            : boundary === 'unlink-backup' ? path.join(p.transaction, 'mod-profile.json.old')
            : boundary === 'rmdir-transaction' ? p.transaction : boundary === 'rmdir-staging' ? p.staging : p.journal;
        const original = fsp[method];
        let interrupted = false;
        fsp[method] = async function (filename, ...args) {
            if (method === 'rmdir') ok(fs.existsSync(p.journal), `${boundary}: journal outlives directory cleanup`);
            const result = await original.call(this, filename, ...args);
            if (filename === target && !interrupted) {
                interrupted = true;
                throw Object.assign(new Error('simulated cleanup interruption'), { code: 'SIMULATED_CRASH' });
            }
            return result;
        };
        try { await rejects(() => manager.recoverPendingModControlCommit(p.workspace), 'MOD_CONTROL_COMMITTED_CLEANUP_BLOCKED', boundary); }
        finally { fsp[method] = original; }
        ok(interrupted, `${boundary}: actual filesystem boundary reached`);
        await manager.recoverPendingModControlCommit(p.workspace);
        assertControlCommitted(p, pair, boundary);
        await manager.recoverPendingModControlCommit(p.workspace);
    }
    const missing = seedControlTransaction(temp, 'r5-missing-stage-directory-foreign-final', pair, { 'mod-profile.json': null, 'mod-lock.json': null, profile: 'foreign final' });
    fs.rmdirSync(missing.transaction);
    await rejects(() => manager.recoverPendingModControlCommit(missing.workspace), 'MOD_CONTROL_COMMIT_FAILED', 'absent staging cannot authorize a different canonical pair');
    eq(fs.readFileSync(missing.profile, 'utf8'), 'foreign final', 'missing-directory recovery preserves concurrent final');
    ok(fs.existsSync(missing.journal), 'unproven commit retains journal');
    console.log('R5 cleanup: equality matrix, repeated recovery, tamper preservation and cleanup interruption boundaries passed.');
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
        await controlCleanupRegressions(temp, pair);
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
        const mutationGate = createDeterministicWorkspaceMutationGate();
        const host = manager.createModManagerHost({
            context, getPanel: () => panel, getWorkspacePath: () => workspaceRoot,
            currentLoreRelayVersion: () => '1.84.32',
            mutationGate,
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

        const raceWorkspace = folder(path.join(temp, 'ui-race'));
        workspaceRoot = raceWorkspace;
        messages = [];
        await host.handleMessage({ type: 'setModEnabled', id: 'general.manager', version: '1.0.0', source: 'global', enabled: true });
        await host.handleMessage({ type: 'resolveModProfilePreview' });
        const competingMutation = mutationGate.acquire(
            raceWorkspace,
            { actionKind: 'test_competing_canonical_write', requestId: 'test-competing-canonical-write' },
        );
        eq(competingMutation.status, 'acquired', 'test competing canonical write owns the shared workspace mutation gate');
        await host.handleMessage({ type: 'commitModProfile' });
        eq(lastState(messages).notice, 'WORLD_MUTATION_IN_PROGRESS', 'profile commit is serialized behind the shared canonical mutation gate');
        eq(fs.existsSync(path.join(raceWorkspace, '.text-adventure/mod-profile.json')), false, 'busy shared mutation gate prevents profile publication');
        if (competingMutation.status === 'acquired') competingMutation.lease.release();
        const nativeResolve = install.resolveInstalledModProfile;
        install.resolveInstalledModProfile = async options => {
            const result = await nativeResolve(options);
            fs.writeFileSync(path.join(raceWorkspace, 'game_state.json'), '{}');
            return result;
        };
        try {
            await host.handleMessage({ type: 'commitModProfile' });
        } finally { install.resolveInstalledModProfile = nativeResolve; }
        eq(fs.existsSync(path.join(raceWorkspace, '.text-adventure/mod-profile.json')), false, 'campaign state created during resolve blocks profile publication');
        eq(fs.existsSync(path.join(raceWorkspace, '.text-adventure/mod-lock.json')), false, 'campaign state created during resolve blocks lock publication');
        eq(lastState(messages).notice, 'MOD_MANAGER_CAMPAIGN_FORK_REQUIRED', 'resolve race reports fork requirement');

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
            mutationGate,
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

        await restarted.handleMessage({ type: 'setModEnabled', id: 'adult.manager', version: '1.0.0', source: 'global', enabled: false });
        uiState = lastState(messages);
        eq(uiState.packages.find(item => item.id === 'adult.manager').enabled, false, 'authorized adult MOD can be disabled without a new consent prompt');
        const disabledWarningCount = warnings.length;
        await restarted.handleMessage({ type: 'resolveModProfilePreview' });
        eq(warnings.length, disabledWarningCount, 'adult disable and resolve require no new adult confirmation');
        eq(lastState(messages).preview.packages, [], 'adult disable removes the package from resolve preview');
        await restarted.handleMessage({ type: 'commitModProfile' });
        const disabledAdultProfile = profileCore.parseModProfileBytes(fs.readFileSync(path.join(workspaceRoot, '.text-adventure/mod-profile.json')));
        ok(disabledAdultProfile.ok, 'disabled adult profile parses');
        eq(disabledAdultProfile.value.enabled, [], 'adult disable removes the enabled draft entry');
        eq(JSON.parse(JSON.stringify(disabledAdultProfile.value.adultContent)), { allow: false, approvals: [] }, 'adult disable removes persisted approval and allow flag');

        await restarted.handleMessage({ type: 'authorizeAdultMod', id: 'adult.manager', version: '1.0.0', source: 'global' });
        await restarted.handleMessage({ type: 'resolveModProfilePreview' });
        await restarted.handleMessage({ type: 'commitModProfile' });

        await restarted.handleMessage({ type: 'setModAdultVisibility', visible: false });
        eq(restarted.adultSessionApprovals(workspaceRoot), [], 'hiding adult metadata revokes session authority');
        uiState = lastState(messages);
        ok(!JSON.stringify(uiState).includes('adult.manager'), 'hiding adult metadata removes adult id from replacement state');
        ok(!JSON.stringify(uiState).includes('Adult metadata sentinel'), 'hiding adult metadata removes adult name from replacement state');

        const adultPackageRoot = path.join(installedRoot, 'adult.manager/1.0.0');
        const missingAdultPackageRoot = path.join(installedRoot, 'adult.manager/1.0.0.missing');
        fs.renameSync(adultPackageRoot, missingAdultPackageRoot);
        try {
            messages = [];
            await restarted.handleMessage({ type: 'requestModManagerState' });
            uiState = lastState(messages);
            ok(uiState.safeMode, 'missing locked adult package enters Safe Mode');
            ok(!JSON.stringify(uiState).includes('adult.manager'), 'hidden locked adult id is absent when its package is missing');
            clipboard = '';
            await restarted.handleMessage({ type: 'exportModDiagnostics' });
            ok(!clipboard.includes('adult.manager'), 'hidden locked adult id is absent from exported missing-package diagnostics');
        } finally { fs.renameSync(missingAdultPackageRoot, adultPackageRoot); }

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
        ok(webview.includes("message.type === 'modManagerState'") && webview.includes('packagesEl.replaceChildren()'), 'host state replaces visible package DOM');
        ok(webview.includes('if (item.enabled)') && webview.includes("{ type: 'setModEnabled'") && webview.includes('enabled: false'), 'adult enabled card exposes the ordinary disable message');
        for (const locale of ['en', 'ja', 'zh-CN', 'zh-TW']) {
            const strings = JSON.parse(fs.readFileSync(path.join(__dirname, `../locales/${locale}.json`), 'utf8'));
            for (const key of ['webview.modManager.title', 'webview.modManager.showAdult', 'webview.modManager.resolve', 'webview.modManager.commit', 'webview.modManager.forkRequired']) {
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
