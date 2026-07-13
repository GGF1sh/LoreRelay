#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const sharedPath = path.join(root, 'out', 'deterministicWorkspaceMutationGate.js');
const p2Path = path.join(root, 'out', 'shopkeeperRequestGate.js');
const p3Path = path.join(root, 'out', 'endDayRequestGate.js');
for (const file of [sharedPath, p2Path, p3Path]) assert(fs.existsSync(file), `${file} missing; run compile`);

const { createDeterministicWorkspaceMutationGate, WORLD_MUTATION_IN_PROGRESS } = require(sharedPath);
const { createShopkeeperRequestGate } = require(p2Path);
const { createEndDayRequestGate } = require(p3Path);

function deferred() {
    let resolve;
    const promise = new Promise((done) => { resolve = done; });
    return { promise, resolve };
}

function createHarness() {
    const shared = createDeterministicWorkspaceMutationGate();
    const p2Gate = createShopkeeperRequestGate(32);
    const p3Gate = createEndDayRequestGate(32);
    const states = new Map();
    const active = new Map();
    const maxActive = new Map();
    const reads = [];
    const writes = [];
    const executions = { p2: 0, p3: 0 };

    function stateFor(workspace) {
        if (!states.has(workspace)) {
            states.set(workspace, { credits: 100, cargo: 0, stock: 10, worldTurn: 0 });
        }
        return states.get(workspace);
    }

    async function protectedMutation(workspace, actionKind, requestId, options, mutate) {
        const result = await shared.run(workspace, { actionKind, requestId }, async () => {
            const count = (active.get(workspace) || 0) + 1;
            active.set(workspace, count);
            maxActive.set(workspace, Math.max(maxActive.get(workspace) || 0, count));
            reads.push(`${workspace}:${actionKind}`);
            const before = { ...stateFor(workspace) };
            try {
                if (options.entered) options.entered.resolve();
                if (options.hold) await options.hold.promise;
                if (options.throw) throw new Error(`${actionKind} threw`);
                if (options.persist === 'failed') {
                    return { ok: false, code: 'PERSIST_FAILED', persistence: { ok: false, partial: false } };
                }
                if (options.persist === 'partial') {
                    writes.push(`${workspace}:${actionKind}:game_state`);
                    return { ok: false, code: 'PARTIAL_PERSIST_FAILED', persistence: { ok: false, partial: true } };
                }
                const after = mutate(before);
                states.set(workspace, after);
                writes.push(`${workspace}:${actionKind}:game_state`, `${workspace}:${actionKind}:world_state`);
                return { ok: true, before, after };
            } finally {
                active.set(workspace, (active.get(workspace) || 1) - 1);
            }
        });
        if (result.status === 'busy') return { ok: false, code: result.code, owner: result.owner };
        if (result.status === 'failed') return { ok: false, code: 'EXECUTION_FAILED' };
        return result.value;
    }

    function runP2(workspace, requestId, options = {}) {
        return p2Gate.run(workspace, requestId, async () => {
            executions.p2++;
            const outcome = await protectedMutation(workspace, 'shopkeeper_trade', requestId, options, (before) => ({
                ...before,
                credits: before.credits - 10,
                cargo: before.cargo + 1,
                stock: before.stock - 1,
            }));
            return outcome.ok
                ? { type: 'shopkeeperDirectTradeResult', requestId, ok: true, receipt: outcome }
                : { type: 'shopkeeperDirectTradeResult', requestId, ok: false, rejection: outcome };
        });
    }

    function runP3(workspace, requestId, options = {}) {
        return p3Gate.run(workspace, requestId, async () => {
            executions.p3++;
            const outcome = await protectedMutation(workspace, 'end_day', requestId, options, (before) => ({
                ...before,
                worldTurn: before.worldTurn + 1,
                stock: before.stock + 2,
            }));
            return outcome.ok
                ? { type: 'endDayResult', requestId, ok: true, receipt: outcome }
                : { type: 'endDayResult', requestId, ok: false, failure: outcome };
        });
    }

    return { runP2, runP3, stateFor, reads, writes, maxActive, executions, shared, p2Gate, p3Gate };
}

async function main() {
    // Manual leases let accepted gameplay retain the same shared authority
    // through Relay completion without introducing a competing pending system.
    {
        const gate = createDeterministicWorkspaceMutationGate();
        const acquired = gate.acquire('same', { actionKind: 'gameplay_request', requestId: 'player_lease_001' });
        assert.equal(acquired.status, 'acquired');
        const busy = gate.acquire('same', { actionKind: 'shopkeeper_trade', requestId: 'trade_lease_001' });
        assert.equal(busy.status, 'busy');
        assert.equal(busy.code, WORLD_MUTATION_IN_PROGRESS);
        assert.equal(busy.owner.actionKind, 'gameplay_request');
        assert.equal(acquired.lease.release(), true);
        assert.equal(acquired.lease.release(), false, 'lease release is idempotent');
        const later = gate.acquire('same', { actionKind: 'shopkeeper_trade', requestId: 'trade_lease_002' });
        assert.equal(later.status, 'acquired');
        later.lease.release();
    }

    // A: pending P2 excludes P3 before its canonical read or write.
    {
        const h = createHarness(); const hold = deferred(); const entered = deferred();
        const p2 = h.runP2('same', 'p2_buy_001', { hold, entered }); await entered.promise;
        const p3 = await h.runP3('same', 'p3_day_001');
        assert.equal(p3.failure.code, WORLD_MUTATION_IN_PROGRESS);
        assert.deepEqual(h.stateFor('same'), { credits: 100, cargo: 0, stock: 10, worldTurn: 0 });
        assert.deepEqual(h.reads, ['same:shopkeeper_trade']); assert.deepEqual(h.writes, []);
        hold.resolve(); assert.equal((await p2).ok, true);
    }

    // B: pending P3 excludes P2; the rejected sell performs no authority read/mutation.
    {
        const h = createHarness(); const hold = deferred(); const entered = deferred();
        const p3 = h.runP3('same', 'p3_day_002', { hold, entered }); await entered.promise;
        const p2 = await h.runP2('same', 'p2_sell_002');
        assert.equal(p2.rejection.code, WORLD_MUTATION_IN_PROGRESS);
        assert.deepEqual(h.reads, ['same:end_day']); assert.deepEqual(h.writes, []);
        hold.resolve(); const completed = await p3;
        assert.equal(completed.receipt.after.worldTurn, 1);
        assert.deepEqual(h.stateFor('same'), { credits: 100, cargo: 0, stock: 12, worldTurn: 1 });
    }

    // C/F/lost-update proof: one near-simultaneous winner, then a new other-action request preserves its update.
    {
        const h = createHarness(); const hold = deferred(); const entered = deferred();
        const p2 = h.runP2('same', 'p2_buy_003', { hold, entered }); await entered.promise;
        const p3Busy = await h.runP3('same', 'p3_day_003');
        assert.equal(p3Busy.failure.code, WORLD_MUTATION_IN_PROGRESS);
        hold.resolve(); assert.equal((await p2).ok, true);
        const p3 = await h.runP3('same', 'p3_day_004'); assert.equal(p3.ok, true);
        assert.deepEqual(h.stateFor('same'), { credits: 90, cargo: 1, stock: 11, worldTurn: 1 });
        assert.equal(h.maxActive.get('same'), 1);
        assert.deepEqual(h.writes, [
            'same:shopkeeper_trade:game_state', 'same:shopkeeper_trade:world_state',
            'same:end_day:game_state', 'same:end_day:world_state',
        ]);
    }

    // D/E: a BUSY result is terminal and deterministic for duplicate request IDs.
    {
        const h = createHarness(); const hold = deferred(); const entered = deferred();
        const p3 = h.runP3('same', 'p3_owner_005', { hold, entered }); await entered.promise;
        const first = await h.runP2('same', 'p2_duplicate_005');
        const replay = await h.runP2('same', 'p2_duplicate_005');
        assert.deepEqual(replay, first); assert.equal(h.executions.p2, 1); assert.equal(first.rejection.code, WORLD_MUTATION_IN_PROGRESS);
        hold.resolve(); await p3;
    }
    {
        const h = createHarness(); const hold = deferred(); const entered = deferred();
        const p2 = h.runP2('same', 'p2_owner_006', { hold, entered }); await entered.promise;
        const first = await h.runP3('same', 'p3_duplicate_006');
        const replay = await h.runP3('same', 'p3_duplicate_006');
        assert.deepEqual(replay, first); assert.equal(h.executions.p3, 1); assert.equal(first.failure.code, WORLD_MUTATION_IN_PROGRESS);
        hold.resolve(); await p2;
    }

    // Existing same-action pending coalescing and completed replay remain one execution.
    for (const kind of ['p2', 'p3']) {
        const h = createHarness(); const hold = deferred(); const entered = deferred();
        const run = kind === 'p2' ? h.runP2 : h.runP3;
        const id = `${kind}_same_request_007`;
        const first = run('same', id, { hold, entered }); await entered.promise;
        const duplicate = run('same', id, { hold, entered });
        hold.resolve(); const one = await first; assert.deepEqual(await duplicate, one);
        assert.deepEqual(await run('same', id), one); assert.equal(h.executions[kind], 1);
    }

    // G: separate workspaces overlap while each workspace remains single-flight.
    {
        const h = createHarness(); const holdA = deferred(); const holdB = deferred(); const enteredA = deferred(); const enteredB = deferred();
        const a = h.runP2('workspace-a', 'p2_space_008', { hold: holdA, entered: enteredA });
        const b = h.runP3('workspace-b', 'p3_space_008', { hold: holdB, entered: enteredB });
        await Promise.all([enteredA.promise, enteredB.promise]);
        assert.equal(h.maxActive.get('workspace-a'), 1); assert.equal(h.maxActive.get('workspace-b'), 1);
        holdA.resolve(); holdB.resolve(); assert((await a).ok && (await b).ok);
    }

    // H and persistence truth: throws, complete failures, and partial failures all release without false success.
    for (const [kind, mode] of [['p2', 'throw'], ['p2', 'failed'], ['p2', 'partial'], ['p3', 'throw'], ['p3', 'failed'], ['p3', 'partial']]) {
        const h = createHarness(); const run = kind === 'p2' ? h.runP2 : h.runP3;
        const failed = await run('same', `${kind}_${mode}_009`, mode === 'throw' ? { throw: true } : { persist: mode });
        assert.equal(failed.ok, false); assert.notEqual((failed.rejection || failed.failure).code, undefined);
        const later = await (kind === 'p2' ? h.runP3('same', 'p3_later_010') : h.runP2('same', 'p2_later_010'));
        assert.equal(later.ok, true, `${kind} ${mode} did not release shared gate`);
    }

    const extension = fs.readFileSync(path.join(root, 'src', 'extension.ts'), 'utf8');
    const ui = fs.readFileSync(path.join(root, 'webview', 'modules', '85-world.js'), 'utf8');
    const bundle = fs.readFileSync(path.join(root, 'webview', 'script.js'), 'utf8');
    const report = fs.readFileSync(path.join(root, 'docs', 'ai-tasks', 'NOAI-PLAY-P3-END-DAY-WORLD-PROGRESSION.md'), 'utf8');
    assert(extension.includes("{ actionKind: 'shopkeeper_trade', requestId }") && extension.includes("{ actionKind: 'end_day', requestId }"));
    assert(extension.indexOf("actionKind: 'shopkeeper_trade'") < extension.indexOf('executeLivingWorldDirectTrade(intent)'));
    assert(extension.indexOf("actionKind: 'end_day'") < extension.indexOf('executeEndDay(requestId, confirmed)'));
    assert(!extension.slice(extension.indexOf('panel.onDidDispose'), extension.indexOf('disposeGameStateWatcher')).includes('deterministicWorkspaceMutationGate.dispose'));
    assert(ui.includes("reject.code === 'WORLD_MUTATION_IN_PROGRESS'") && ui.includes("failure.code === 'WORLD_MUTATION_IN_PROGRESS'"));
    assert(bundle.includes('WORLD_MUTATION_IN_PROGRESS'), 'shipped script.js lacks shared BUSY handling');
    assert(!report.includes('network-only installer dependency') && report.includes('fatal: detected dubious ownership'));
    assert(!/import .*?(Relay|agentic|gmBridge|imageGeneration|narration|ComfyUI)/i.test(fs.readFileSync(path.join(root, 'src', 'deterministicWorkspaceMutationGate.ts'), 'utf8')));

    console.log('deterministic workspace mutation gate tests passed.');
}

main().catch((error) => { console.error(error.stack || error); process.exit(1); });
