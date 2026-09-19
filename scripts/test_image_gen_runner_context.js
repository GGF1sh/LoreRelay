// Host orchestration with a deferred subprocess: move, rewind, replace and cancel while work is in flight.
const assert = require('assert/strict');
const fs = require('fs'), path = require('path'), os = require('os'), Module = require('module');
const root = path.resolve(__dirname, '..');
const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'lr-image-context-'));
let currentWorkspace = workspace, scope = { campaignInstanceId: 'campaign-a', timelineEpochId: 'epoch-a' };
let location = 'harbor', turn = 1, history = [], messages = [], jobs = [], configuredScript = '', autoImageEnabled = false;
const forge = { meta: { worldName: 'Image test', worldSeed: 'image-test', generatedAt: '2026-09-19' }, geography: {
    regions: [{ id: 'river', name: 'River', x: 203.5, y: 211.5, connectedTo: [] }],
    locations: [{ id: 'harbor', name: 'Harbor', regionId: 'river', type: 'settlement' }] } };
fs.writeFileSync(path.join(workspace, 'world_forge.json'), JSON.stringify(forge));
const panel = { webview: { postMessage: m => messages.push(m), asWebviewUri: uri => ({ toString: () => uri.fsPath }) } };
const original = Module._load;
Module._load = function(request, parent, isMain) {
    if (request === 'vscode') return { workspace: { isTrusted: true, get workspaceFolders() { return [{ uri: { fsPath: currentWorkspace } }]; },
        getConfiguration: () => ({ get: (key, fallback) => key === 'skillPath' ? configuredScript : key === 'mediaAgent.autoImage' ? autoImageEnabled : fallback }) },
        window: { createOutputChannel: () => ({ append() {}, appendLine() {}, show() {} }), showWarningMessage() {}, showErrorMessage() {} },
        Uri: { file: fsPath => ({ fsPath }) } };
    if (parent?.filename === path.join(root, 'out/imageGenRunner.js')) {
        if (request === './gameStateSync') return { getGameEntryHistory: () => history, saveHistoryToDisk: () => true, safeImageUri: p => p };
        if (request === './acceptedTurnReplayGuard') return { loadExistingAcceptedTurnScope: () => scope };
        if (request === './vlmQueue') return { buildVlmMetaFromGameState: () => ({ locationId: location, worldTurn: turn }) };
        if (request === './stateManager') return { commitGameState: state => fs.writeFileSync(path.join(currentWorkspace, 'game_state.json'), JSON.stringify(state)) };
        if (request === './mediaCompatibility') return { preflightSceneGeneration: () => ({ ok: true, env: {} }), executeAfterMediaPreflight: (p, fn) => ({ executed: true, value: fn(p.env) }) };
        if (request === './spawnWithTimeout') return { spawnWithTimeout: (_python, _args, _options, callbacks) => {
            let complete; const result = new Promise(resolve => { complete = resolve; });
            const child = { kill() {} }; jobs.push({ child, callbacks, complete }); return { child, result };
        } };
    }
    return original.call(this, request, parent, isMain);
};
const runner = require('../out/imageGenRunner');
const candidates = require('../out/locationImageCandidates');
const { cartographyWorldKey } = require('../out/cartographyOverlayCore');
const viewWorldKey = cartographyWorldKey(require('../out/worldForgeCore').parseWorldForge(forge));
assert.notEqual(viewWorldKey, cartographyWorldKey(forge), 'fixture exercises raw versus normalized World View identity');
runner.initImageGenRunner({ extensionPath: root, getPanel: () => panel, subscriptions: [] });
const mediaAgent = require('../out/mediaAgent');
mediaAgent.initMediaAgent({ getPanel: () => panel, subscriptions: [] });
const settle = () => new Promise(resolve => setImmediate(resolve));
const png = path.join(workspace, 'generated.png');
fs.copyFileSync(path.join(root, 'docs/assets/screenshot-comfyui.png'), png);
function finish(job, code = 0, output = png) {
    // Deliberately split the output path across stream chunks.
    if (output) { const mid = Math.floor(output.length / 2); job.callbacks.stdout(output.slice(0, mid)); job.callbacks.stdout(output.slice(mid) + '\n'); }
    job.complete({ code, timedOut: false });
}
function entry(id = 'gm-1') { return { id, role: 'gm', sender: 'GM', content: 'At the harbor.' }; }
async function main() {
    assert.equal(require('../package.json').contributes.configuration.properties['textAdventure.skillPath'].default, '', 'packaged default must not prefer an old machine-specific script');
    assert.equal(runner.resolveComfyScript(workspace), path.join(root, 'antigravity-skill/text-adventure-gm/scripts/comfyui_generate.py'), 'fresh workspace uses packaged script');
    configuredScript = path.join(workspace, 'custom.py'); fs.writeFileSync(configuredScript, '# custom');
    assert.equal(runner.resolveComfyScript(workspace), configuredScript, 'explicit script remains authoritative'); configuredScript = '';
    autoImageEnabled = true;
    const newEntry = { ...entry('turn-auto'), imagePrompt: 'river harbor' };
    mediaAgent.dispatchStreamMediaHints({ entryId: newEntry.id, imagePrompt: newEntry.imagePrompt });
    assert.equal(jobs.length, 0, 'unsaved stream hint cannot submit generation');
    location = 'mountains';
    fs.writeFileSync(path.join(workspace, 'game_state.json'), JSON.stringify({ entries: [newEntry], world: { currentLocationId: 'harbor' } }));
    mediaAgent.handleTurnResultMedia({ turnId: newEntry.id, media: { imagePrompt: newEntry.imagePrompt } });
    assert.equal(jobs.length, 1, 'accepted canonical turn queues before the history watcher, without poisoned dedup');
    history = [{ ...newEntry }]; finish(jobs.at(-1)); await settle(); await settle();
    assert.equal(history[0].image, png); assert.equal(history[0].locationId, 'harbor', 'fresh canonical location wins over old cached state');
    mediaAgent.handleGameStateMedia({ entries: history }, () => true);
    assert.equal(jobs.length, 1, 'watcher cannot duplicate accepted media');
    mediaAgent.clearMediaAgentState(); autoImageEnabled = false; location = 'harbor'; messages = [];
    history = [entry()]; fs.writeFileSync(path.join(workspace, 'game_state.json'), JSON.stringify({ entries: history }));
    let result = runner.executeImageGeneration('harbor', 'illustrious', 'gm-1');
    location = 'mountains'; turn = 2; history.push(entry('gm-2'));
    finish(jobs.at(-1)); assert.equal(await result, true);
    const patch = messages.find(m => m.type === 'updateEntry');
    assert.equal(patch.entry.locationId, 'harbor'); assert.equal(patch.entry.worldTurn, 1);
    assert.equal(JSON.parse(fs.readFileSync(path.join(workspace, 'game_state.json'))).latestImage, undefined, 'older turn never becomes latest image');
    history = [entry()]; location = 'harbor';
    fs.writeFileSync(path.join(workspace, 'game_state.json'), JSON.stringify({ entries: history, world: { currentLocationId: 'harbor' } }));
    result = runner.executeImageGeneration('before travel without another GM turn', 'illustrious', 'gm-1');
    const moved = JSON.parse(fs.readFileSync(path.join(workspace, 'game_state.json'))); moved.world.currentLocationId = 'mountains';
    fs.writeFileSync(path.join(workspace, 'game_state.json'), JSON.stringify(moved)); finish(jobs.at(-1)); await result;
    assert.equal(JSON.parse(fs.readFileSync(path.join(workspace, 'game_state.json'))).latestImage, undefined, 'travel alone prevents old scenery from becoming the current background');

    result = runner.executeImageGeneration('location', 'illustrious', 'loc:harbor'); finish(jobs.at(-1)); assert.equal(await result, true);
    let saved = candidates.loadLocationImageCandidates(workspace, viewWorldKey, 'harbor'); assert.equal(saved.length, 1, 'result is readable using the actual World View identity');
    assert(!fs.existsSync(path.join(workspace, 'visual_memory.json')), 'location candidate never creates GM visual memory');
    assert.equal(candidates.loadLocationImageCandidates(workspace, 'another-world', 'harbor').length, 0);
    assert(messages.some(m => m.type === 'locationImageGenEnd' && m.success && m.locationId === 'harbor'));
    result = runner.executeImageGeneration('location variant', 'illustrious', 'loc:harbor'); finish(jobs.at(-1)); await result;
    assert.equal(candidates.loadLocationImageCandidates(workspace, viewWorldKey, 'harbor').length, 2, 'retry retains original candidate');

    for (const mutate of [() => { scope = { ...scope, timelineEpochId: 'epoch-b' }; }, () => { history[0].content = 'Edited scene'; }, () => { history[0].image = 'user-choice.png'; }]) {
        history = [entry()]; fs.writeFileSync(path.join(workspace, 'game_state.json'), JSON.stringify({ entries: history }));
        const before = messages.filter(m => m.type === 'updateEntry').length;
        result = runner.executeImageGeneration('late', 'illustrious', 'gm-1'); mutate(); finish(jobs.at(-1));
        assert.equal(await result, false); assert.equal(messages.filter(m => m.type === 'updateEntry').length, before);
    }
    assert.equal(runner.getImageGenCircuitState().consecutiveFailures, 0, 'stale work is not a backend failure');

    history = [{ ...entry(), locationId: 'harbor', worldTurn: 1 }]; location = 'mountains'; turn = 42;
    fs.writeFileSync(path.join(workspace, 'game_state.json'), JSON.stringify({ entries: history, world: { currentLocationId: location } }));
    result = runner.executeImageGeneration('regenerate old harbor', 'illustrious', 'gm-1'); finish(jobs.at(-1)); assert.equal(await result, true);
    assert.equal(history[0].locationId, 'harbor'); assert.equal(history[0].worldTurn, 1);
    assert.equal(JSON.parse(fs.readFileSync(path.join(workspace, 'game_state.json'))).latestImage, undefined, 'past entry regeneration never relabels it as the current scene');
    result = runner.executeImageGeneration('canonical edited before watcher', 'illustrious', 'gm-1');
    const edited = JSON.parse(fs.readFileSync(path.join(workspace, 'game_state.json'))); edited.entries[0].image = 'manual-choice.png';
    fs.writeFileSync(path.join(workspace, 'game_state.json'), JSON.stringify(edited)); finish(jobs.at(-1)); assert.equal(await result, false);
    assert.equal(JSON.parse(fs.readFileSync(path.join(workspace, 'game_state.json'))).entries[0].image, 'manual-choice.png');
    history = []; fs.writeFileSync(path.join(workspace, 'game_state.json'), JSON.stringify({ entries: [entry('turn-no-watcher')] }));
    result = runner.executeImageGeneration('no history adoption', 'illustrious', 'turn-no-watcher'); finish(jobs.at(-1)); assert.equal(await result, false, 'no false success before history can adopt');

    assert(runner.enqueueImageGeneration('queued', 'illustrious', 'loc:harbor'));
    runner.resetImageQueueDedup(); assert.equal(runner.enqueueImageGeneration('duplicate', 'illustrious', 'loc:harbor'), false);
    assert(runner.enqueueImageGeneration('next', 'illustrious', 'loc:mountains'));
    const count = jobs.length; scope = { ...scope, campaignInstanceId: 'campaign-b' }; finish(jobs.at(-1)); await settle(); await settle();
    assert.equal(jobs.length, count, 'queued old-world work is not submitted');
    assert.equal(runner.getImageQueueLength(), 0);

    result = runner.executeImageGeneration('cancel', 'illustrious', 'loc:harbor'); const old = jobs.at(-1);
    runner.killImageGenerationProcess(); const replacement = runner.executeImageGeneration('new', 'illustrious', 'loc:harbor');
    finish(old); assert.equal(await result, false); assert(runner.isImageGenerationBusy(), 'old completion cannot clear replacement');
    finish(jobs.at(-1)); assert.equal(await replacement, true);
    result = runner.executeImageGeneration('bad success', 'illustrious', 'loc:harbor'); finish(jobs.at(-1), 0, ''); assert.equal(await result, false);
    result = runner.executeImageGeneration('missing path', 'illustrious', 'loc:harbor'); finish(jobs.at(-1), 0, path.join(workspace, 'missing.png')); assert.equal(await result, false);
    history = [entry()]; fs.writeFileSync(path.join(workspace, 'game_state.json'), JSON.stringify({ entries: history }));
    const before = fs.readFileSync(path.join(workspace, 'game_state.json'));
    result = runner.executeImageGeneration('switch workspace', 'illustrious', 'gm-1'); currentWorkspace = workspace + '-other'; finish(jobs.at(-1)); assert.equal(await result, false);
    assert.deepEqual(fs.readFileSync(path.join(workspace, 'game_state.json')), before);
    currentWorkspace = workspace;
    console.log('PASS image runner: packaged script, stream framing, original scene metadata, location receipts, retry preservation, timeline/world/workspace changes, edit/replacement, dedup, cancellation and missing output');
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => { runner.killImageGenerationProcess(); Module._load = original; });
