'use strict';
const assert = require('assert/strict'), fs = require('fs'), os = require('os'), path = require('path'), Module = require('module');
const { narrativeDigest: hash } = require('../out/narrativeMemoryCore');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lr-memory-host-'));
let workspace = root, epoch = 1, failSave = false, latch = false, rules = { narrativeMemoryMode: 'auto' }, picks = [], inputs = [], commits = 0;
const file = path.join(root, 'game_state.json');
const g1 = { id: 'turn-1', role: 'gm', content: '納屋に縄が下がる。' }, g2 = { id: 'turn-2', role: 'gm', content: '港に来た。' };
const record = { id: 'nm1', person: { id: 'story:1', name: '納屋' }, kind: 'correction', content: '納屋には風鈴。', sourceId: g1.id, sourceHash: hash(g1.content), anchorId: g1.id, anchorHash: hash(g1.content), quote: g1.content, role: 'gm', origin: 'player', approval: 'accepted', status: 'open' };
const save = state => fs.writeFileSync(file, JSON.stringify(state));
const read = () => JSON.parse(fs.readFileSync(file));
save({ entries: [g1, g2], commerce: { credits: 42 }, world: { currentLocationId: 'port' }, narrativeMemory: { format: 1, records: [record] } });
const realLoad = Module._load;
Module._load = function(name, parent, isMain) {
    if (parent?.filename.endsWith('narrativeMemoryHost.js')) {
        const mocks = {
            vscode: { window: { showQuickPick: async () => picks.shift(), showInputBox: async () => { const v = inputs.shift(); return typeof v === 'function' ? v() : v; } } },
            './workspacePaths': { getWorkspacePath: () => workspace },
            './acceptedTurnReplayGuard': { loadExistingAcceptedTurnScope: () => ({ epoch }), getAcceptedTurnRestoreRepairLatchOutcome: () => latch },
            './stateManager': { commitGameState: state => { if (failSave) return { ok: false }; commits++; save(state); return { ok: true }; } },
            './gameRules': { loadGameRules: () => rules, saveGameRules: patch => { rules = { ...rules, ...patch }; return true; } },
            './npcRegistry': { loadNpcRegistry: () => ({ npcs: {} }) },
            './lorebookLoader': { loadLorebookForUi: () => ({ entries: [] }), saveLorebookFromUi: () => ({ ok: true }) },
            './worldState': { readWorldStateSnapshotReadOnly: () => ({ state: { worldTurn: 4 } }) },
            './chronicleLoader': { buildChronicleForWorkspace: () => [{ events: [
                { gmTurn: 1, kind: 'travel', text: 'arrived' }, { gmTurn: 2, kind: 'milestone', text: 'SECRET scene' },
                { gmTurn: 999, kind: 'travel', text: 'undone' }] }] },
            './i18n': { t: key => key },
        };
        if (Object.hasOwn(mocks, name)) return mocks[name];
    }
    return realLoad.call(this, name, parent, isMain);
};
const { handleNarrativeMemory: handle, narrativeMemoryView: view } = require('../out/narrativeMemoryHost');
Module._load = realLoad;
const messages = [], post = m => messages.push(m), gate = { run: async (_, __, fn) => { try { await fn(); return { status: 'completed' }; } catch (error) { return { status: 'failed', error }; } } };
const send = (action, extra = {}, token = view(root).token) => handle({ action, token, ...extra }, gate, post, async () => true);
(async () => {
    assert.deepEqual(view(root).resume.recent, ['arrived'], 'resume excludes hidden scenes and undone events');
    inputs.push('納屋には青い風鈴。');
    await send('edit', { id: 'nm1' });
    assert.equal(read().narrativeMemory.records[1].sourceId, g1.id, 'correction edit retains original target');
    assert.equal(read().narrativeMemory.records[1].anchorId, g2.id);
    assert.equal(read().commerce.credits, 42);
    const token = view(root).token; epoch++;
    await send('reject', { id: 'nm1' }, token);
    assert.match(messages.at(-1).error, /stale/);
    inputs.push(() => { workspace = 'another-world'; return 'late edit'; });
    await send('edit', { id: 'nm1' });
    assert.equal(commits, 1, 'world switch during dialog cannot save'); workspace = root;
    failSave = true; await send('reject', { id: 'nm1' });
    assert.equal(read().narrativeMemory.records[0].approval, 'accepted', 'failed save cannot claim success'); failSave = false;
    latch = true; await send('reject', { id: 'nm1' });
    assert.equal(commits, 1, 'repair latch blocks writes'); latch = false;
    await send('mode', { mode: 'review' }); assert.equal(rules.narrativeMemoryMode, 'review');
    await send('mode', { mode: 'auto' }); assert.equal(commits, 1, 'mode switch does not mutate pending records');
    console.log('PASS narrative Host: correction target, generation, switched world, save failure, repair latch, public resume');
})().catch(e => { console.error(e); process.exitCode = 1; }).finally(() => fs.rmSync(root, { recursive: true, force: true }));
