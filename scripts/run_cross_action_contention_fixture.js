#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createDeterministicWorkspaceMutationGate, WORLD_MUTATION_IN_PROGRESS } = require('../out/deterministicWorkspaceMutationGate');

function deferred() {
    let resolve;
    const promise = new Promise((done) => { resolve = done; });
    return { promise, resolve };
}

async function runOnce(dir) {
    const gamePath = path.join(dir, 'game_state.json');
    const worldPath = path.join(dir, 'world_state.json');
    fs.writeFileSync(gamePath, JSON.stringify({ credits: 100, cargo: 0, worldTurnAtLastSync: 0 }));
    fs.writeFileSync(worldPath, JSON.stringify({ stock: 10, worldTurn: 0 }));

    const gate = createDeterministicWorkspaceMutationGate();
    const hold = deferred(); const entered = deferred();
    let active = 0; let maxActive = 0; let tradeCount = 0; let dayCount = 0;
    const writes = [];
    const trade = gate.run(dir, { actionKind: 'shopkeeper_trade', requestId: 'fixture_trade_001' }, async () => {
        active++; maxActive = Math.max(maxActive, active);
        const game = JSON.parse(fs.readFileSync(gamePath, 'utf8'));
        const world = JSON.parse(fs.readFileSync(worldPath, 'utf8'));
        entered.resolve(); await hold.promise;
        game.credits -= 10; game.cargo += 1; world.stock -= 1; tradeCount++;
        fs.writeFileSync(gamePath, JSON.stringify(game)); writes.push('trade:game_state');
        fs.writeFileSync(worldPath, JSON.stringify(world)); writes.push('trade:world_state');
        active--;
        return { ok: true };
    });
    await entered.promise;
    const day = await gate.run(dir, { actionKind: 'end_day', requestId: 'fixture_day_001' }, async () => {
        dayCount++;
        throw new Error('busy end-day must not execute');
    });
    assert.equal(day.status, 'busy'); assert.equal(day.code, WORLD_MUTATION_IN_PROGRESS);
    hold.resolve(); assert.equal((await trade).status, 'completed');

    const game = JSON.parse(fs.readFileSync(gamePath, 'utf8'));
    const world = JSON.parse(fs.readFileSync(worldPath, 'utf8'));
    const evidence = { winner: 'shopkeeper_trade', loser: day.code, tradeCount, dayCount, maxActive, writes, game, world };
    assert.deepEqual(evidence, {
        winner: 'shopkeeper_trade', loser: 'WORLD_MUTATION_IN_PROGRESS', tradeCount: 1, dayCount: 0, maxActive: 1,
        writes: ['trade:game_state', 'trade:world_state'],
        game: { credits: 90, cargo: 1, worldTurnAtLastSync: 0 }, world: { stock: 9, worldTurn: 0 },
    });
    return evidence;
}

(async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'noai-p3-contention-'));
    try {
        const first = await runOnce(dir);
        const rerun = await runOnce(dir);
        assert.deepEqual(rerun, first, 'reset and rerun evidence must be deterministic');
        console.log(JSON.stringify({ id: 'cross_action_contention', isolated: true, resettable: true, deterministic: true, evidence: first }));
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
})().catch((error) => { console.error(error.stack || error); process.exit(1); });
