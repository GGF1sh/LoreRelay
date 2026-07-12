#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');

const root = path.join(__dirname, '..');
const out = path.join(root, 'out');
const hostPath = path.join(out, 'endDayWorldProgression.js');
const gatePath = path.join(out, 'endDayRequestGate.js');
for (const file of [hostPath, gatePath]) assert(fs.existsSync(file), `${file} missing; run compile`);
const originalLoad = Module._load;
Module._load = function(request) {
    if (request === 'vscode') {
        return {
            workspace: { workspaceFolders: [], getConfiguration: () => ({ get: (_key, fallback) => fallback }) },
            window: {}, Uri: { file: (value) => ({ fsPath: value }) },
        };
    }
    return originalLoad.apply(this, arguments);
};
const { previewEndDay, executeEndDay } = require(hostPath);
Module._load = originalLoad;
const { createEndDayRequestGate } = require(gatePath);

function createHarness({ turn = 0, gameOk = true, worldOk = true, throwGame = false } = {}) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'noai-play-p3-'));
    const gamePath = path.join(dir, 'game_state.json');
    fs.writeFileSync(gamePath, JSON.stringify({ entries: [], world: { currentLocationId: 'market_a' }, commerce: { credits: 30, food: 10, cargo: [], transportId: 'wagon' } }));
    const state = { worldTurn: turn, factions: {}, regions: {}, recentChanges: [], markets: { market_a: { wheat: { stock: 10, priceIndex: 1.2 } } } };
    const calls = { bulk: 0, market: 0, game: 0, world: 0, npc: 0 };
    const deps = {
        loadGameRules: () => ({ enableEmergentSimulation: true, enableCommerce: true, enableNpcRegistry: false }),
        isWorldForgeEnabled: () => true,
        loadWorldForge: () => ({ id: 'forge' }),
        loadWorldForgeDocument: () => ({}),
        loadWorldState: () => state,
        saveWorldState: (next) => { calls.world++; return worldOk && next.worldTurn === turn + 1; },
        loadNpcRegistry: () => ({ format: 'lorerelay-npc-registry/1.0', npcs: {} }),
        saveNpcRegistry: () => { calls.npc++; },
        getGameStatePath: () => gamePath,
        commitGameState: () => { calls.game++; if (throwGame) throw new Error('writer threw'); return { ok: gameOk }; },
        readStateRevision: () => 1,
        runBulkWorldSimulation: (_forge, before, _registry, options) => {
            calls.bulk++;
            const stepped = { ...before, worldTurn: (before.worldTurn || 0) + 1 };
            const events = turn === 100 ? [{ category: 'resource', id: 'event_1' }] : [];
            const after = options.afterStep(stepped, events, undefined);
            return { ok: true, state: after, summary: { startWorldTurn: turn, endWorldTurn: turn + 1, stepsExecuted: 1, totalEventsEmitted: events.length } };
        },
        applyLivingWorldAfterSimulationStep: (_forge, stepped) => {
            calls.market++;
            return { ...stepped, markets: { market_a: { wheat: { stock: 12, priceIndex: 1.15 } } } };
        },
        recordSplitBrainRisk: () => {},
    };
    return { dir, deps, calls };
}

async function testGate() {
    const gate = createEndDayRequestGate(2);
    let count = 0; let release;
    const execute = () => new Promise((resolve) => { count++; release = () => resolve({ type: 'endDayResult', requestId: 'endday_001', ok: true }); });
    const first = gate.run('ws', 'endday_001', execute);
    const duplicate = gate.run('ws', 'endday_001', execute);
    const busy = await gate.run('ws', 'endday_002', async () => { throw new Error('must not run'); });
    assert.equal(busy.failure.code, 'BUSY');
    release();
    assert.deepEqual(await duplicate, await first); assert.equal(count, 1);
    await gate.run('ws', 'endday_001', async () => { throw new Error('must not replay'); });
    assert.equal(count, 1);
    const next = await gate.run('ws', 'endday_003', async () => { count++; return { type: 'endDayResult', requestId: 'endday_003', ok: true }; });
    assert.equal(next.ok, true); assert.equal(count, 2);
    gate.dispose();
}

async function main() {
    for (const turn of [0, 99, 100, 999999]) {
        const { deps, calls } = createHarness({ turn });
        const preview = previewEndDay(deps);
        assert.equal(preview.ok, true); assert.equal(preview.targetWorldTurn, turn + 1);
        assert.deepEqual(calls, { bulk: 0, market: 0, game: 0, world: 0, npc: 0 }, 'preview mutates nothing');
        const unconfirmed = executeEndDay('endday_unconfirmed', false, deps);
        assert.equal(unconfirmed.code, 'CONFIRMATION_REQUIRED'); assert.equal(calls.bulk, 0);
        const receipt = executeEndDay(`endday_${turn}`, true, deps);
        assert.equal(receipt.persisted, true); assert.deepEqual(receipt.worldTurn, { before: turn, after: turn + 1 });
        assert.equal(calls.bulk, 1); assert.equal(calls.market, 1); assert.equal(calls.game, 1); assert.equal(calls.world, 1);
        if (turn === 100) assert.deepEqual(receipt.eventCategories, ['resource']);
    }
    for (const opts of [{ gameOk: false }, { worldOk: false }, { gameOk: false, worldOk: false }, { throwGame: true }]) {
        const { deps } = createHarness(opts);
        const result = executeEndDay('endday_failure', true, deps);
        assert.equal(result.ok, false); assert(['PERSIST_FAILED', 'PARTIAL_PERSIST_FAILED'].includes(result.code));
    }
    await testGate();
    const ui = fs.readFileSync(path.join(root, 'webview', 'modules', '85-world.js'), 'utf8');
    const bundle = fs.readFileSync(path.join(root, 'webview', 'script.js'), 'utf8');
    const extension = fs.readFileSync(path.join(root, 'src', 'extension.ts'), 'utf8');
    assert(ui.includes("msg.requestId !== _endDayPendingRequestId"), 'stale response guard missing');
    assert(bundle.includes('endDayCommit') && bundle.includes('一日を終える'), 'shipped bundle lacks P3');
    assert(extension.includes('endDayRequestGate') && extension.includes('executeEndDay'));
    const hostSource = fs.readFileSync(path.join(root, 'src', 'endDayWorldProgression.ts'), 'utf8');
    assert(!/import .*?(Relay|agentic|gmBridge|imageGeneration|narration)/i.test(hostSource), 'P3 host must not import AI paths');
    console.log('end-day world progression tests passed.');
}

main().catch((error) => { console.error(error.stack || error); process.exit(1); });
