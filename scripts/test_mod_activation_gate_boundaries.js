#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');
const activation = require('../out/mods/modActivationGateHost');
const discovery = require('../out/mods/modDiscoveryHost');
const hashes = require('../out/mods/modHashCore');
const profiles = require('../out/mods/modProfileCore');
const resolver = require('../out/mods/modResolverCore');
const restoreCore = require('../out/mods/modActivationGateCore');
const { createVscodeStub, installVscodeStub } = require('./test_helpers/vscode_stub');
const restoreVscode = installVscodeStub();
const checkpoint = require('../out/checkpoint');
restoreVscode();

let assertions = 0;
function equal(actual, expected, message) {
    assertions++;
    assert.deepStrictEqual(actual, expected, message);
}
function check(value, message) {
    assertions++;
    assert.ok(value, message);
}

/** Load the real compiled boundary with side-effect services replaced, never the gate itself. */
function loadBoundary(relativeFile, mocks, append = '') {
    const filename = path.join(__dirname, '..', 'out', relativeFile);
    const instance = new Module(filename, module);
    instance.filename = filename;
    instance.paths = Module._nodeModulePaths(path.dirname(filename));
    const noServices = new Proxy({}, { get: (_target, key) => key === '__esModule' ? true : () => undefined });
    const originalLoad = Module._load;
    Module._load = function(request, parent, isMain) {
        if (parent === instance) {
            if (Object.prototype.hasOwnProperty.call(mocks, request)) return mocks[request];
            if (request.startsWith('.')) return noServices;
        }
        return originalLoad.call(this, request, parent, isMain);
    };
    try {
        instance._compile(fs.readFileSync(filename, 'utf8') + '\n' + append, filename);
        return instance.exports;
    } finally {
        Module._load = originalLoad;
    }
}

function stateEntry(id, role = 'gm', modContext) {
    return { id, role, sender: role === 'user' ? 'Player' : 'Game Master', content: id, ...(modContext ? { modContext } : {}) };
}

async function main() {
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'lorerelay-mod-boundaries-'));
    try {
        const workspaceRoot = path.join(temp, 'campaign');
        const globalStorageRoot = path.join(temp, 'global');
        const packageRoot = path.join(globalStorageRoot, 'mods', 'packages', 'gate.test', '1.0.0');
        fs.mkdirSync(packageRoot, { recursive: true });
        const manifest = {
            format: 'lorerelay-mod/1', id: 'gate.test', version: '1.0.0', name: 'Gate test', authors: ['test'],
            lorerelay: { minVersion: '1.84.32', maxVersionExclusive: '2.0.0' },
            contentRating: 'general', contentTags: [], capabilities: [], dependencies: [],
            optionalDependencies: [], conflicts: [], entrypoints: {},
        };
        fs.writeFileSync(path.join(packageRoot, 'lorerelay.mod.json'), JSON.stringify(manifest));
        fs.writeFileSync(path.join(packageRoot, 'README.md'), 'original');
        const hashed = await discovery.hashDiscoveredModPackage({
            globalStorageRoot, workspaceRoot, source: 'global', id: manifest.id, version: manifest.version,
            expectedManifestHash: hashes.hashCanonicalModJson(manifest), allowAdultContentRead: false,
        });
        const profile = {
            format: 'lorerelay-mod-profile/1', enabled: [{ id: manifest.id, version: manifest.version, source: 'global' }],
            selected: { campaignKit: null }, adultContent: { allow: false, approvals: [] },
        };
        const resolved = resolver.resolveModProfile(profile, [hashed.candidate], '1.84.32');
        check(resolved.ok, 'boundary fixture resolves');
        const campaignDir = path.join(workspaceRoot, '.text-adventure');
        fs.mkdirSync(campaignDir, { recursive: true });
        const profilePath = path.join(campaignDir, 'mod-profile.json');
        fs.writeFileSync(profilePath, profiles.serializeModProfile(profile));
        fs.writeFileSync(path.join(campaignDir, 'mod-lock.json'), profiles.serializeModLock(resolved.lock));
        const input = { workspaceRoot, globalStorageRoot, currentLoreRelayVersion: '1.84.32', adultSessionAllowed: false };
        const evaluate = () => activation.evaluateModActivationGate(input);
        equal((await evaluate()).decision.mode, 'normal', 'boundary fixture activates without content loading');

        for (const mutation of ['add', 'delete', 'modify']) {
            if (mutation === 'add') fs.writeFileSync(path.join(packageRoot, 'LICENSE'), 'added');
            if (mutation === 'delete') fs.unlinkSync(path.join(packageRoot, 'README.md'));
            if (mutation === 'modify') fs.writeFileSync(path.join(packageRoot, 'README.md'), 'modified');
            equal(activation.areModCanonicalWritesAllowed(workspaceRoot), false, `${mutation} after startup revokes the synchronous write gate`);
            if (mutation === 'add') fs.unlinkSync(path.join(packageRoot, 'LICENSE'));
            fs.writeFileSync(path.join(packageRoot, 'README.md'), 'original');
            equal((await evaluate()).decision.mode, 'normal', `${mutation} repair requires exact re-evaluation`);
        }

        const counterpartRoot = path.join(campaignDir, 'mods', manifest.id, manifest.version);
        fs.mkdirSync(counterpartRoot, { recursive: true });
        fs.writeFileSync(path.join(counterpartRoot, 'lorerelay.mod.json'), JSON.stringify(manifest));
        fs.writeFileSync(path.join(counterpartRoot, 'README.md'), 'different workspace variant');
        equal(activation.areModCanonicalWritesAllowed(workspaceRoot), false, 'new counterpart package revokes direct writes before async discovery');
        equal((await evaluate()).decision.mode, 'safe-required', 'new cross-scope variant fails exact re-evaluation');
        fs.renameSync(counterpartRoot, path.join(temp, 'detached-counterpart'));
        equal((await evaluate()).decision.mode, 'normal', 'removing counterpart requires exact re-evaluation before writes resume');

        const safeRoot = path.join(temp, 'safe-campaign');
        fs.mkdirSync(path.join(safeRoot, '.text-adventure'), { recursive: true });
        fs.writeFileSync(path.join(safeRoot, '.text-adventure', 'mod-profile.json'), '{');
        const statePath = path.join(safeRoot, 'game_state.json');
        const state = { schemaVersion: 2, entries: [], status: {}, options: [] };
        fs.writeFileSync(statePath, JSON.stringify(state));
        equal((await activation.evaluateModActivationGate({ ...input, workspaceRoot: safeRoot })).decision.mode, 'safe-required', 'malformed profile is Safe Mode, not unmodded');
        let canonicalWrites = 0;
        const manager = loadBoundary('stateManager.js', {
            './mods/modActivationGateHost': activation,
            './workspacePaths': { getGameStatePath: () => statePath, writeJsonAtomic: () => canonicalWrites++ },
            './workspaceStateQueue': { isGameStateWriteCircuitOpen: () => false, runSerializedGameStateMutation: fn => fn() },
            './workspaceStateQueueCore': { mergeGameStateForPersist: (_disk, value) => value },
            './stateManagerCore': { resolveGameStatePersistPlan: value => ({ action: 'write', payload: value }) },
            './validateGameState': { validateGameState: () => [] },
            './acceptedTurnReplayGuardCore': { RUNTIME_ACCEPTED_TURN_WITNESS_KEY: 'runtimeAcceptedTurn' },
        });
        equal(manager.commitGameState(state).ok, false, 'direct commitGameState rejects Safe Mode');
        equal(manager.commitGameStateAtPathForRuntimeAuthority(statePath, state, {}).ok, false, 'direct runtime-authority commit rejects Safe Mode');
        equal(canonicalWrites, 0, 'state-manager rejection performs zero writes');

        const commands = new Map();
        let commandMutations = 0;
        const commandModule = loadBoundary('extension/commands.js', {
            vscode: { commands: { registerCommand: (id, callback) => { commands.set(id, callback); return {}; } } },
            '../scenarioPack': { loadScenarioPack: () => commandMutations++ },
            '../tavernCardImporter': { importTavernCard: () => commandMutations++ },
        });
        commandModule.registerCoreCommands({ subscriptions: [] }, () => commandMutations++, async () => !!(await activation.acquireModCanonicalAuthorization(safeRoot)));
        for (const id of ['textadventure.loadScenario', 'textadventure.importStCharacter', 'textadventure.importStLorebook']) await commands.get(id)();
        equal(commandMutations, 0, 'direct registered commands cannot bypass Safe Mode');

        const vscode = createVscodeStub();
        const webview = loadBoundary('webviewHandlers.js', {
            vscode,
            './workspacePaths': { getWorkspacePath: () => safeRoot },
            './mods/modActivationGateHost': activation,
        });
        let webviewMutations = 0;
        let aborts = 0;
        const webviewDeps = {
            handlePlayerInput: async () => webviewMutations++,
            handleSaveCheckpoint: async () => webviewMutations++,
            loadScenarioPack: async () => webviewMutations++,
            handleEditEntry: async () => webviewMutations++,
            cancelGmTurn: () => aborts++,
        };
        for (const message of [
            { type: 'freeInput', text: 'test' }, { type: 'saveCheckpoint' },
            { type: 'loadScenario' }, { type: 'editEntry', id: 'test', content: 'changed' },
        ]) await webview.handleWebviewMessage(message, webviewDeps);
        await webview.handleWebviewMessage({ type: 'cancelGmTurn' }, webviewDeps);
        equal(webviewMutations, 0, 'direct webview handler rejects every tested mutation before routing');
        equal(aborts, 1, 'Safe Mode still permits cancelling an in-flight provider request');

        let scenarioWrites = 0;
        const scenario = loadBoundary('scenarioPack.js', {
            vscode,
            './workspacePaths': { getWorkspacePath: () => safeRoot, getGameStatePath: () => statePath, writeJsonAtomic: () => scenarioWrites++ },
            './mods/modActivationGateHost': activation,
            './gameStateSync': { setGameEntryHistoryWithSeenIds: () => scenarioWrites++, saveHistoryToDisk: () => scenarioWrites++ },
            './stateManager': { commitGameState: () => { scenarioWrites++; return { ok: true }; } },
        }, 'module.exports.loadScenarioBoundaryForTest = loadScenarioPackFromDir;');
        await scenario.loadScenarioBoundaryForTest(path.join(temp, 'unread-scenario'));
        equal(scenarioWrites, 0, 'direct scenario loader rejects before reading/resetting/copying campaign content');
        equal(checkpoint.saveCheckpointFile(safeRoot, [stateEntry('gm')]), undefined, 'direct checkpoint save rejects Safe Mode');
        check(!fs.existsSync(path.join(safeRoot, '.text-adventure', 'checkpoints')), 'rejected checkpoint save creates no checkpoint directory');

        const auth = await activation.acquireModCanonicalAuthorization(workspaceRoot);
        equal(checkpoint.saveCheckpointFile(workspaceRoot, [stateEntry('gm')]), undefined, 'modded checkpoint cannot downgrade to legacy format without a lease');
        fs.appendFileSync(profilePath, ' ');
        equal(checkpoint.saveCheckpointFile(workspaceRoot, [stateEntry('gm', 'gm', auth.modContext)], 'stale', { modAuthorization: auth }), undefined, 'stale lease rejects checkpoint save before write');
        fs.writeFileSync(profilePath, profiles.serializeModProfile(profile));
        await evaluate();

        const otherLock = JSON.parse(JSON.stringify(resolved.lock));
        otherLock.packages[0].contentHash = hashes.sha256ModBytes(Buffer.from('different-content'));
        const { aggregateHash: _oldHash, ...otherBody } = otherLock;
        otherLock.aggregateHash = profiles.computeModLockAggregateHash(otherBody);
        const cp = {
            format: 'text-adventure-checkpoint/1.2',
            meta: { id: 'cp-1', label: 'test', createdAt: '2026-09-03T00:00:00Z', turnId: 'gm', turnLabel: 'gm' },
            history: [stateEntry('gm')], modLockSnapshot: otherLock, modLockFingerprint: otherLock.aggregateHash,
        };
        let restoreWrites = 0;
        let restoreTransactions = 0;
        const checkpointHandlers = loadBoundary('checkpointHandlers.js', {
            vscode,
            './workspacePaths': { getWorkspacePath: () => workspaceRoot, getGameStatePath: () => path.join(workspaceRoot, 'game_state.json'), writeJsonAtomic: () => restoreWrites++ },
            './checkpoint': { loadCheckpointFile: () => cp },
            './mods/modActivationGateHost': activation,
            './mods/modActivationGateCore': restoreCore,
            './gameStateSync': { setGameEntryHistoryWithSeenIds: () => restoreWrites++, saveHistoryToDisk: () => restoreWrites++ },
            './stateManager': { commitGameState: () => { restoreWrites++; return { ok: true }; } },
            './acceptedTurnReplayGuard': { runAcceptedTurnTimelineRestoreTransaction: async () => { restoreTransactions++; return {}; } },
        });
        await checkpointHandlers.handleRestoreCheckpoint('cp-1');
        equal(restoreTransactions, 0, 'lock mismatch restore stops before timeline rotation/restore transaction');
        equal(restoreWrites, 0, 'lock mismatch restore performs zero history/state writes');
        const legacy = { ...cp, format: 'text-adventure-checkpoint/1.0' };
        delete legacy.modLockSnapshot;
        delete legacy.modLockFingerprint;
        check(checkpoint.parseCheckpointFile(legacy), 'checkpoint 1.0 remains readable');
        check(checkpoint.parseCheckpointFile({ ...legacy, format: 'text-adventure-checkpoint/1.1', combatBattleHistory: [] }), 'checkpoint 1.1 remains readable');
        equal(checkpoint.parseCheckpointFile({ ...cp, modLockFingerprint: resolved.lock.aggregateHash }), undefined, 'checkpoint 1.2 rejects inconsistent snapshot evidence');

        const trustedContext = (await activation.acquireModCanonicalAuthorization(workspaceRoot)).modContext;
        const forgedContext = { ...trustedContext, lockFingerprint: hashes.sha256ModBytes(Buffer.from('forged')) };
        const syncStatePath = path.join(workspaceRoot, 'game_state.json');
        fs.writeFileSync(syncStatePath, JSON.stringify({
            schemaVersion: 2, status: {}, options: [],
            entries: [stateEntry('existing', 'gm', forgedContext), stateEntry('new', 'gm', forgedContext), stateEntry('user', 'user', forgedContext), stateEntry('accepted', 'gm', forgedContext)],
        }));
        const savedHistory = [];
        const sync = loadBoundary('gameStateSync.js', {
            vscode,
            './workspacePaths': { writeJsonAtomic: (file, value) => { if (file.endsWith('game_history.json')) savedHistory.push(JSON.parse(JSON.stringify(value))); } },
            './mods/modActivationGateHost': activation,
            './entryId': { isValidEntryId: value => typeof value === 'string' && value.length > 0 },
            './validateGameState': { validateGameState: () => [] },
            './migrateGameState': { migrateGameState: value => ({ state: value, migrated: false }), CURRENT_SCHEMA_VERSION: 2 },
            './gameRules': { loadGameRules: () => ({ enableNpcRegistry: false }) },
            './npcRegistry': { loadNpcRegistry: () => ({ npcs: {} }) },
            './gameStateWebviewSanitize': { sanitizeGameStateForWebview: value => value },
        }, 'module.exports.issueAcceptedContextForTest = (id, context) => trustedAcceptedModContextByEntryId.set(id, context);');
        sync.initGameStateSync({
            getPanel: () => ({ webview: { postMessage() {} } }), getGameStatePath: () => syncStatePath,
            getWorkspacePath: () => workspaceRoot, getHistoryPath: () => path.join(workspaceRoot, 'game_history.json'),
            getSkillDir: () => undefined, processProfileUpdates() {}, maybeSuggestArchive() {}, appendGmBridgeLog() {},
        });
        sync.setGameEntryHistoryWithSeenIds([stateEntry('existing', 'gm', trustedContext)]);
        sync.issueAcceptedContextForTest('accepted', trustedContext);
        sync.issueAcceptedContextForTest('user', trustedContext);
        await sync.sendCurrentState(0, true);
        const history = sync.getGameEntryHistory();
        equal(history.find(entry => entry.id === 'existing').modContext, trustedContext, 'external state cannot replace existing history provenance');
        equal(history.find(entry => entry.id === 'new').modContext, undefined, 'external new GM entry cannot author provenance');
        equal(history.find(entry => entry.id === 'user').modContext, undefined, 'user-authored entry never receives MOD provenance');
        equal(history.find(entry => entry.id === 'accepted').modContext, trustedContext, 'host Accepted-entry witness supplies exact provenance');
        check(savedHistory.length > 0, 'provenance rules are verified on the saved history payload');

        const malformedCheckpointRoot = path.join(temp, 'malformed-checkpoint');
        fs.mkdirSync(path.join(malformedCheckpointRoot, '.text-adventure', 'checkpoints'), { recursive: true });
        fs.writeFileSync(path.join(malformedCheckpointRoot, '.text-adventure', 'checkpoints', 'cp-1.json'), '{"format":"text-adventure-checkpoint/1.2","modLockFingerprint":"invalid"}');
        equal(activation.areModCanonicalWritesAllowed(malformedCheckpointRoot), false, 'direct write sink detects malformed checkpoint evidence even before startup evaluation');
        equal((await activation.evaluateModActivationGate({ ...input, workspaceRoot: malformedCheckpointRoot })).decision.mode, 'safe-required', 'malformed checkpoint evidence is never unmodded');
    } finally {
        activation.clearModActivationGateRuntime();
        const target = path.resolve(temp);
        check(target.startsWith(path.resolve(os.tmpdir()) + path.sep), 'test cleanup is contained in the unique OS temp directory');
        fs.rmSync(target, { recursive: true, force: true });
    }
    console.log(`MOD activation gate direct boundary tests passed (${assertions} assertions)`);
}

main().catch(error => { console.error(error); process.exitCode = 1; });
