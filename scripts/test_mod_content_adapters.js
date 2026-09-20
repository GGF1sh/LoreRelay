#!/usr/bin/env node
'use strict';
const assert = require('assert');
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const os = require('os');
const Module = require('module');
const { createVscodeStub } = require('./test_helpers/vscode_stub');
const vscode = createVscodeStub();
vscode.workspace.isTrusted = true;
vscode.commands = { executeCommand: async () => undefined };
const originalRequire = Module.prototype.require;
Module.prototype.require = function(id) { return id === 'vscode' ? vscode : originalRequire.apply(this, arguments); };
const gate = require('../out/mods/modActivationGateHost');
const core = require('../out/mods/contributions/modContentCore');
const discovery = require('../out/mods/modDiscoveryHost');
const hash = require('../out/mods/modHashCore');
const profileCore = require('../out/mods/modProfileCore');
const resolver = require('../out/mods/modResolverCore');
const workspace = require('../out/workspacePaths');
const persona = require('../out/persona');
const presets = require('../out/personaPreset');
const personaCore = require('../out/personaCore');
const experience = require('../out/experience');
const stateManager = require('../out/stateManager');
const replay = require('../out/acceptedTurnReplayGuard');
const lorebook = require('../out/lorebookLoader');
let assertions = 0;
const eq = (actual, expected, message) => { assertions++; assert.deepStrictEqual(actual, expected, message); };
const ok = (value, message) => { assertions++; assert.ok(value, message); };
const throws = (fn, message) => { assertions++; assert.throws(fn, undefined, message); };
const clone = value => JSON.parse(JSON.stringify(value));

function boundary(relativeFile, mocks, append = '') {
    const filename = path.join(__dirname, '../out', relativeFile);
    const instance = new Module(filename, module);
    instance.filename = filename;
    instance.paths = Module._nodeModulePaths(path.dirname(filename));
    const noServices = new Proxy({}, { get: (_target, key) => key === '__esModule' ? true : () => undefined });
    const original = Module._load;
    Module._load = function(request, parent, isMain) {
        if (parent === instance) {
            if (Object.hasOwn(mocks, request)) return mocks[request];
            if (request.startsWith('.')) return noServices;
        }
        return original.call(this, request, parent, isMain);
    };
    try { instance._compile(fs.readFileSync(filename, 'utf8') + '\n' + append, filename); return instance.exports; }
    finally { Module._load = original; }
}

async function main() {
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'lorerelay-mod-content-'));
    const globalStorageRoot = path.join(temp, 'global');
    const createdWorkspaces = [];
    const installed = [];
    function campaign(name, profile, lock) {
        const ws = path.join(temp, name);
        fs.mkdirSync(path.join(ws, '.text-adventure'), { recursive: true });
        fs.writeFileSync(path.join(ws, '.text-adventure/mod-profile.json'), profileCore.serializeModProfile(profile));
        fs.writeFileSync(path.join(ws, '.text-adventure/mod-lock.json'), profileCore.serializeModLock(lock));
        createdWorkspaces.push(ws);
        return ws;
    }
    function use(ws) {
        vscode.workspace.workspaceFolders = [{ uri: { fsPath: ws } }];
        experience.clearExperienceCache();
    }
    const input = ws => ({ workspaceRoot: ws, globalStorageRoot, currentLoreRelayVersion: '1.84.32', adultSessionAllowed: false });
    async function install(id, rating = 'general', dependencies = []) {
        const root = path.join(globalStorageRoot, 'mods/packages', id, '1.0.0');
        fs.mkdirSync(root, { recursive: true });
        const manifest = {
            format: 'lorerelay-mod/1', id, version: '1.0.0', name: id, authors: ['test'],
            lorerelay: { minVersion: '1.84.32' }, contentRating: rating, contentTags: [],
            capabilities: ['lorebook', 'persona', 'scenario'], dependencies, optionalDependencies: [], conflicts: [],
            entrypoints: { scenarios: [{ id: 'arrival', path: 'scenario.json' }], lorebooks: [{ id: 'book', path: 'lore.json' }], personas: [{ id: 'traveler', path: 'persona.json' }] },
        };
        const docs = {
            'scenario.json': { format: 'text-adventure-scenario/1.0', meta: { title: id }, setup: { theme: 'fantasy' }, opening: { narrative: `Opening sentinel ${id}`, options: ['Explore'] } },
            'lore.json': { format: 'text-adventure-lorebook/1.0', entries: [{ id: 'town', comment: 'Town', keys: ['harbor'], content: `Lore sentinel ${id}`, pinned: id === 'a.story' }] },
            'persona.json': { version: 1, id: 'traveler', name: `Traveler ${id}`, description: `Persona sentinel ${id}` },
        };
        fs.writeFileSync(path.join(root, 'lorerelay.mod.json'), JSON.stringify(manifest));
        for (const [name, doc] of Object.entries(docs)) fs.writeFileSync(path.join(root, name), JSON.stringify(doc));
        const hashed = await discovery.hashDiscoveredModPackage({ globalStorageRoot, source: 'global', id, version: '1.0.0', expectedManifestHash: hash.hashCanonicalModJson(manifest), allowAdultContentRead: true, includeContentFiles: true });
        ok(hashed.candidate, `fixture hashes ${id}`);
        const result = { ...hashed.candidate, files: hashed.contentFiles, root, docs };
        installed.push(result);
        return result;
    }
    function resolve(packages, adult = false) {
        const profile = { format: 'lorerelay-mod-profile/1', enabled: packages.map(pkg => ({ id: pkg.manifest.id, version: '1.0.0', source: 'global' })), selected: { campaignKit: null }, adultContent: { allow: adult, approvals: adult ? packages.filter(pkg => pkg.manifest.contentRating === 'adult').map(pkg => ({ id: pkg.manifest.id, version: '1.0.0', manifestHash: pkg.manifestHash, contentHash: pkg.contentHash })) : [] } };
        const resolved = resolver.resolveModProfile(profile, installed, '1.84.32');
        ok(resolved.ok, 'fixture resolves');
        return { profile, lock: resolved.lock };
    }
    try {
        const first = await install('a.story', 'general', [{ id: 'z.foundation', version: '1.0.0' }]);
        const dependency = await install('z.foundation');
        const inactive = await install('inactive.book');
        const adult = await install('adult.book', 'adult');
        const { profile, lock } = resolve([first]);
        const pure = core.buildModContentRegistry(lock, [first, dependency]);
        eq(pure, core.buildModContentRegistry(lock, [dependency, inactive, first]), 'inactive packages and input enumeration do not affect registry');
        eq(pure.scenarios.map(entry => entry.id), ['z.foundation:arrival', 'a.story:arrival'], 'dependency order, namespaced IDs');
        eq(pure.lorebooks.map(entry => entry.id), ['z.foundation:town', 'a.story:town'], 'same local lore IDs cannot replace another package');
        eq(pure.personas[1].value.id, 'a.story:traveler', 'persona keeps canonical selection identity');
        function changed(docName, mutate) {
            const pkg = { ...first, files: first.files.map(file => ({ ...file, bytes: Buffer.from(file.bytes) })) };
            const file = pkg.files.find(item => item.path === docName);
            const doc = JSON.parse(Buffer.from(file.bytes).toString());
            mutate(doc);
            file.bytes = Buffer.from(JSON.stringify(doc));
            return () => core.buildModContentRegistry(lock, [dependency, pkg]);
        }
        for (const mutate of [d => d.opening.bgm = 'sound.mp3', d => d.opening.status = { hp: 900 }, d => d.setup.playerCharacter = {}, d => d.director = {}, d => d.format = 'future', d => d.opening.options = [4], d => d.opening.narrative = '![image](file:///secret)', d => d.opening.narrative = '<img src=x>', d => d.opening.narrative = 'x'.repeat(32769)]) throws(changed('scenario.json', mutate), 'strict scenario rejects out-of-scope authority/media/schema');
        for (const mutate of [d => d.entries[0].use_regex = true, d => d.entries[0].priority = 101, d => d.entries[0].id = 'base:town', d => d.entries.push(clone(d.entries[0])), d => d.entries[0].content = 'x'.repeat(8193), d => d.entries[0].keys = [], d => d.entries[0].replace = true]) throws(changed('lore.json', mutate), 'strict lore rejects collision/regex/replacement/budget');
        for (const mutate of [d => d.id = 'different', d => d.name = 'x'.repeat(81), d => d.meta = { source: 'character-copy' }, d => d.speakingStyle = 42, d => d.version = 2]) throws(changed('persona.json', mutate), 'strict persona rejects schema rather than coercing or truncating');
        const duplicateKeys = { ...first, files: first.files.map(file => file.path !== 'persona.json' ? file : { ...file, bytes: Buffer.from('{"version":1,"id":"traveler","name":"A","name":"B"}') }) };
        throws(() => core.buildModContentRegistry(lock, [dependency, duplicateKeys]), 'duplicate JSON keys reject');
        throws(() => core.buildModContentRegistry(lock, [first]), 'missing dependency content rejects');
        const ws = campaign('active', profile, lock); use(ws);
        const opened = [];
        const originalOpen = fsp.open;
        fsp.open = async function(file, ...args) { opened.push(String(file)); return originalOpen.call(this, file, ...args); };
        try { eq((await gate.evaluateModActivationGate(input(ws))).contentActivationAllowed, true, 'active content enabled only after strict registry validation'); }
        finally { fsp.open = originalOpen; }
        for (const pkg of [inactive, adult]) eq(opened.filter(file => file.startsWith(pkg.root) && !file.endsWith('lorerelay.mod.json')), [], 'inactive/adult payloads not opened');
        eq(gate.getActiveModContributions(ws), pure, 'host registry uses exact hashed package buffers');
        const exposed = gate.getActiveModContributions(ws); exposed.personas[0].value.name = 'forged';
        eq(gate.getActiveModContributions(ws), pure, 'consumer mutation cannot poison cached registry');
        eq(lorebook.loadLorebookForUi().entries, [], 'MOD lore never enters mutable editor/save list');
        eq(lorebook.loadLorebookForUi(true).entries.length, 2, 'prompt-only loader appends MOD lore');
        eq(fs.existsSync(path.join(ws, 'lorebook.json')), false, 'MOD lore does not overwrite local file');
        eq(presets.listPlayerPersonaPresets().length, 2, 'persona consumer exposes only active presets');
        eq(presets.getPlayerPersonaPreset('inactive.book:traveler'), undefined, 'direct inactive selection cannot bypass registry');
        throws(() => presets.updatePlayerPersonaPreset('a.story:traveler', { version: 1, name: 'overwritten' }), 'MOD preset updates are forbidden');
        const bridge = boundary('parlorBridge.js', { './persona': persona, './personaCore': personaCore, './personaPreset': presets, './personaPresetCore': require('../out/personaPresetCore'), './experience': experience, './i18n': { t: x => x } }, 'sendParlorSettingsToWebview = () => undefined;');
        bridge.handleSelectParlorPersonaPreset('a.story:traveler');
        eq(experience.loadExperienceConfig().parlor.activePersonaId, 'a.story:traveler', 'explicit selection persists canonical ID');
        eq(persona.loadPlayerPersona().description, 'Persona sentinel a.story', 'real persona prompt consumer resolves active reference');
        eq(fs.existsSync(path.join(ws, 'persona.json')), false, 'MOD persona text is never copied into local persona');
        const gm = boundary('gmPromptBuilder.js', { './workspacePaths': workspace, './mods/modActivationGateHost': gate, './lorebookMatcher': require('../out/lorebookMatcher') });
        ok(gm.getTriggeredLoreLabels('harbor').some(label => label.includes('a.story:town')), 'real GM matcher consumes namespaced lore');
        for (const file of ['parlorPromptBuilder.js', 'inWorldPromptBuilder.js']) {
            const consumer = boundary(file, { './lorebookLoader': lorebook }, 'exports.resolveLoreSnippetsForTest = loreLabelsToSnippets;');
            const snippets = consumer.resolveLoreSnippetsForTest(gm.getTriggeredLoreLabels('harbor'));
            ok(snippets.includes('Lore sentinel a.story'), `${file}: pinned decorated label resolves to MOD content`);
            ok(snippets.includes('Lore sentinel z.foundation'), `${file}: unpinned MOD content remains intact`);
            eq(snippets.some(value => value.startsWith('📌')), false, `${file}: no label-only fallback for valid pinned entry`);
        }
        const unchanged = fs.readFileSync(path.join(first.root, 'persona.json'));
        fs.writeFileSync(path.join(first.root, 'persona.json'), '{}');
        eq(gate.getActiveModContributions(ws), undefined, 'package drift revokes all cached content');
        eq(persona.loadPlayerPersona(), { version: 1 }, 'inactive reference cannot leak cached persona body');
        eq(lorebook.loadLorebookForUi(true).entries, [], 'drift removes lore before prompt composition');
        fs.writeFileSync(path.join(first.root, 'persona.json'), unchanged);
        eq((await gate.evaluateModActivationGate(input(ws))).decision.mode, 'normal', 'restored exact package revalidates');
        const adultProfile = resolve([adult], true);
        const adultWs = campaign('adult', adultProfile.profile, adultProfile.lock);
        eq((await gate.evaluateModActivationGate(input(adultWs))).decision.mode, 'safe-required', 'adult opt-in/session permission remain separate');
        eq(gate.getActiveModContributions(adultWs), undefined, 'adult session-off exposes no content');
        eq((await gate.evaluateModActivationGate({
            ...input(adultWs),
            adultSessionAllowed: true,
            adultSessionApprovals: adultProfile.profile.adultContent.approvals,
        })).contentActivationAllowed, true, 'exact approved adult package uses same adapters');
        eq((await gate.evaluateModActivationGate({ ...input(adultWs), adultSessionAllowed: true })).decision.mode, 'safe-required', 'adult session boolean alone does not authorize package payload reads');
        adultProfile.profile.adultContent.approvals = [];
        const forged = { ...adultProfile.lock, profileHash: profileCore.computeModProfileHash(adultProfile.profile) };
        delete forged.aggregateHash; forged.aggregateHash = hash.hashCanonicalModJson(forged);
        const unapprovedWs = campaign('unapproved', adultProfile.profile, forged);
        const adultReads = [];
        fsp.open = async function(file, ...args) { adultReads.push(String(file)); return originalOpen.call(this, file, ...args); };
        try { eq((await gate.evaluateModActivationGate({ ...input(unapprovedWs), adultSessionAllowed: true })).decision.mode, 'safe-required', 'unapproved adult blocked even with self-consistent control files'); }
        finally { fsp.open = originalOpen; }
        eq(adultReads.filter(file => file.startsWith(adult.root) && !file.endsWith('lorerelay.mod.json')), [], 'unapproved adult payload is never opened');

        for (const mode of ['success', 'existing', 'mismatch', 'history-denied', 'queued-existing']) {
            const scenarioWs = campaign(`scenario-${mode}`, profile, lock); use(scenarioWs);
            await gate.evaluateModActivationGate(input(scenarioWs));
            let history = [];
            const services = {
                './mods/modActivationGateHost': gate, './workspacePaths': workspace, './stateManager': stateManager,
                './acceptedTurnReplayGuard': mode !== 'queued-existing' ? replay : { runAcceptedTurnTimelineRestoreTransaction: async (...args) => { fs.writeFileSync(path.join(scenarioWs, 'game_state.json'), '{"sentinel":true}'); return replay.runAcceptedTurnTimelineRestoreTransaction(...args); } },
                './i18n': { t: x => x },
                './gameStateSync': { setGameEntryHistoryWithSeenIds: entries => { history = entries; }, saveHistoryToDisk: () => { if (mode === 'history-denied') return false; fs.writeFileSync(path.join(scenarioWs, 'game_history.json'), JSON.stringify(history)); return true; }, sendCurrentState: async () => undefined },
            };
            const scenario = boundary('scenarioPack.js', services);
            if (mode === 'existing') fs.writeFileSync(path.join(scenarioWs, 'game_state.json'), '{}');
            const success = await scenario.loadActiveModScenario('a.story:arrival', mode === 'mismatch' ? 'sha256:' + '0'.repeat(64) : lock.aggregateHash);
            eq(success, mode === 'success', `new-campaign restriction and guarded writes: ${mode}`);
            if (mode === 'success') {
                const state = JSON.parse(fs.readFileSync(path.join(scenarioWs, 'game_state.json')));
                eq(state.entries[0].content, 'Opening sentinel a.story', 'real canonical commit receives strict opening');
                eq(history[0].modContext.lockFingerprint, lock.aggregateHash, 'opening persists lock provenance');
                eq(history[0].modContext.adultActive, false, 'opening classification is derived, not authored');
                eq(fs.existsSync(path.join(scenarioWs, 'scenario.json')), false, 'raw scenario file/optional siblings never copied');
                eq(await scenario.loadActiveModScenario('a.story:arrival', lock.aggregateHash), false, 'cannot reset existing modded campaign');
            }
            if (mode === 'existing') eq(fs.readFileSync(path.join(scenarioWs, 'game_state.json'), 'utf8'), '{}', 'existing state untouched');
            if (mode === 'queued-existing') eq(fs.readFileSync(path.join(scenarioWs, 'game_state.json'), 'utf8'), '{"sentinel":true}', 'recheck after transaction queue prevents reset');
            if (['history-denied', 'queued-existing'].includes(mode)) ok(replay.getAcceptedTurnRestoreRepairLatchOutcome(scenarioWs), 'failed transaction enters real repair latch');
        }
        for (const handler of ['handleParlorPlayerInput', 'handleInWorldPlayerInput']) {
            const chatWs = campaign(`collision-${handler}`, profile, lock); use(chatWs);
            await gate.evaluateModActivationGate(input(chatWs));
            const savedRoles = [];
            const session = { messages: [] };
            const save = (value, message) => { savedRoles.push(message.role); return value; };
            let allowPrompt = false;
            const collide = () => allowPrompt ? 'prompt' : gate.appendActiveModLorebookEntries(chatWs, [{ id: 'a.story:town', content: 'imported collision' }]);
            const chat = boundary('parlorBridge.js', {
                './workspacePaths': workspace, './mods/modActivationGateHost': gate, './mods/modHashCore': hash,
                './characterManager': { getActiveCharacterProfile: () => ({ id: 'npc', name: 'NPC' }) },
                './gmBridgeRunner': { isParlorBridgeBusy: () => false },
                './connectionProfile': { getActiveParlorConnectionProfile: () => ({ provider: 'test' }) },
                './parlorSession': { getOrCreateParlorSession: () => session, appendAndSaveParlorMessage: save },
                './inWorldSession': { getOrCreateInWorldSession: () => session, appendAndSaveInWorldMessage: save },
                './parlorPromptBuilder': { buildParlorUserPrompt: collide }, './inWorldPromptBuilder': { buildInWorldChatPrompt: collide },
                './experience': { isParlorMode: () => true, isInWorldMode: () => true },
                './i18n': { t: x => x, getConfiguredLocale: () => 'en' },
            }, 'exports.providerCalls = 0; invokeParlorByProfile = async () => { exports.providerCalls++; exports.onInvoke?.(); return { ok: true, text: "reply" }; }; sendParlorSessionToWebview = () => undefined; sendInWorldSessionToWebview = () => undefined;');
            await chat[handler]('harbor');
            eq(gate.getModActivationGateResult(chatWs).decision.mode, 'safe-required', `${handler}: collision revokes activation`);
            eq(chat.providerCalls, 0, `${handler}: no provider call after blocking collision`);
            eq(savedRoles, ['user'], `${handler}: no post-collision response/session write`);
            await chat[handler]('blocked retry');
            eq(savedRoles, ['user'], `${handler}: Safe Mode retry cannot append another user message`);
            eq(chat.providerCalls, 0, `${handler}: Safe Mode retry cannot invoke provider`);
            await gate.evaluateModActivationGate(input(chatWs));
            savedRoles.length = 0;
            allowPrompt = true;
            chat.onInvoke = () => fs.appendFileSync(path.join(chatWs, '.text-adventure/mod-lock.json'), '\n');
            await chat[handler]('drift during provider request');
            eq(chat.providerCalls, 1, `${handler}: permitted request begins before drift`);
            eq(savedRoles, ['user'], `${handler}: response cannot persist after lock drift`);
        }
        use(ws);
        const local = { version: 1, id: 'local', name: 'Local persona' };
        const ordinary = path.join(temp, 'ordinary'); fs.mkdirSync(path.join(ordinary, 'personas'), { recursive: true });
        fs.writeFileSync(path.join(ordinary, 'personas/local.json'), JSON.stringify(local)); use(ordinary);
        eq(presets.listPlayerPersonaPresets(), [local], 'unmodded persona behavior preserved');
        eq(lorebook.loadLorebookForUi(true).entries, [], 'unmodded lore behavior preserved');
        console.log(`MOD content adapter focused tests passed (${assertions} assertions)`);
    } finally {
        for (const ws of createdWorkspaces) replay.releaseAcceptedTurnWriterLeaseForTests(ws);
        gate.clearModActivationGateRuntime();
        Module.prototype.require = originalRequire;
        fs.rmSync(temp, { recursive: true, force: true });
    }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
