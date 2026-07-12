#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const Module = require('module');
const path = require('path');
const root = path.join(__dirname, '..');
const out = path.join(root, 'out');
const gatePath = path.join(out, 'shopkeeperRequestGate.js');
const corePath = path.join(out, 'shopkeeperDirectTradeCore.js');
const persistPath = path.join(out, 'livingWorldCommercePersist.js');
for (const file of [gatePath, corePath, persistPath]) assert(fs.existsSync(file), `${file} missing; run compile`);

function loadPersist(gameOk, worldOk) {
    delete require.cache[require.resolve(persistPath)];
    const original = Module._load;
    Module._load = function(request) {
        if (request === './stateManager') return { commitGameState() { return { ok: gameOk }; } };
        if (request === './worldState') return {
            loadWorldState() { return { worldTurn: 1, markets: {} }; },
            saveWorldState() { return worldOk; },
        };
        if (request === './workspaceWriteHealth') return { recordSplitBrainRisk() {} };
        return original.apply(this, arguments);
    };
    try { return require(persistPath); } finally { Module._load = original; }
}

async function main() {
    const { createShopkeeperRequestGate } = require(gatePath);
    const gate = createShopkeeperRequestGate(2);
    let executions = 0;
    let release;
    const firstExecution = () => new Promise((resolve) => { executions++; release = () => resolve({ type: 'shopkeeperDirectTradeResult', requestId: 'request_001', ok: true, receipt: { persisted: true } }); });
    const first = gate.run('workspace-a', 'request_001', firstExecution);
    const duplicatePending = gate.run('workspace-a', 'request_001', firstExecution);
    const busy = await gate.run('workspace-a', 'request_002', async () => { executions++; throw new Error('must not execute'); });
    assert.strictEqual(busy.ok, false); assert.strictEqual(busy.rejection.code, 'TRADE_IN_PROGRESS'); assert.strictEqual(executions, 1);
    release();
    const [one, same] = await Promise.all([first, duplicatePending]);
    assert.deepStrictEqual(same, one); assert.strictEqual(executions, 1, 'same pending request applies once');
    const replay = await gate.run('workspace-a', 'request_001', async () => { executions++; throw new Error('must not replay'); });
    assert.deepStrictEqual(replay, one); assert.strictEqual(executions, 1, 'completed replay applies no second trade');
    const next = await gate.run('workspace-a', 'request_003', async () => { executions++; return { type: 'shopkeeperDirectTradeResult', requestId: 'request_003', ok: true }; });
    assert.strictEqual(next.ok, true); assert.strictEqual(executions, 2, 'new request after completion executes');
    gate.clearWorkspace('workspace-a'); gate.dispose();

    for (const [gameOk, worldOk, expectedOk, expectedPartial] of [
        [true, true, true, false], [false, false, false, false], [true, false, false, true], [false, true, false, true],
    ]) {
        const persist = loadPersist(gameOk, worldOk); persist.resetCommercePersistForTests();
        persist.scheduleCommercePersist({ gameState: { entries: [] }, commerce: { credits: 1, cargo: [], transportId: 'wagon' }, markets: { m: {} } });
        const result = persist.flushScheduledCommercePersist();
        assert.strictEqual(result.ok, expectedOk); assert.strictEqual(result.partial, expectedPartial);
        assert.strictEqual(result.gameOk, gameOk); assert.strictEqual(result.worldOk, worldOk);
    }

    const { parseShopkeeperIntent } = require(corePath);
    const valid = { op: 'buy', marketLocationId: 'market', commodityId: 'wheat' };
    assert(parseShopkeeperIntent({ ...valid, qty: 1 }));
    for (const qty of [1.5, NaN, Infinity, -1, 0, 1000, '1']) assert.strictEqual(parseShopkeeperIntent({ ...valid, qty }), undefined);

    const ui = fs.readFileSync(path.join(root, 'webview', 'modules', '85-world.js'), 'utf8');
    const bundle = fs.readFileSync(path.join(root, 'webview', 'script.js'), 'utf8');
    const extension = fs.readFileSync(path.join(root, 'src', 'extension.ts'), 'utf8');
    const report = fs.readFileSync(path.join(root, 'docs', 'ai-tasks', 'NOAI-PLAY-P2-SHOPKEEPER-DIRECT-TRADE.md'), 'utf8');
    assert(ui.includes("msg.requestId !== _shopkeeperPendingRequestId"), 'stale response correlation guard missing');
    assert(bundle.includes('shopkeeperDirectTrade') && bundle.includes('暮らす'), 'committed shipped bundle lacks repair');
    assert(![ui, bundle, report].some((text) => text.includes('証らす')), 'old copy remains');
    assert(extension.includes('persistence.gameAttempted') && extension.includes('persistence.worldAttempted'));
    assert(!/ok:\s*true[\s\S]{0,300}persisted:\s*true[\s\S]{0,100}flushScheduledCommercePersist/.test(extension));
    console.log('shopkeeper repair tests passed.');
}

main().catch((error) => { console.error(error.stack || error); process.exit(1); });
