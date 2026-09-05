'use strict';
const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { openActionFixture } = require('./action_scenario_fixture');
const { runScenario, loadScenario } = require('./run_action_scenario');
const ROOT = path.resolve(__dirname, '..');
const trade = { actionId: 'commerce:trade', parameters: { op: 'buy', marketLocationId: 'north_farm', commodityId: 'wheat', qty: 1 } };
const travel = { actionId: 'commerce:travel', parameters: { destinationId: 'elda_shop' } };
const day = { actionId: 'commerce:end_day', parameters: {} };
let count = 0;
function nextId() { return `test_request_${++count}`; }
function request(preview, requestId = nextId()) {
    return { actionId: preview.actionId, parameters: preview.parameters, confirmationToken: preview.confirmationToken, requestId };
}
async function withFixture(fn) {
    const fixture = await openActionFixture();
    try { await fn(fixture, fixture.runtime.service, fixture.context); } finally { fixture.close(); }
}
function preview(service, context, input) {
    const result = service.preview(context, input);
    assert.equal(result.ok, true, JSON.stringify(result));
    return result;
}
async function commit(service, context, input) {
    const quote = preview(service, context, input);
    assert(service.confirm(context, quote.confirmationToken, context.principal === 'qa-runner' ? 'scripted' : 'interactive'));
    const raw = request(quote);
    const result = await service.execute(context, raw);
    assert.equal(result.classification, 'committed', JSON.stringify(result));
    return { quote, raw, result };
}
async function main() {
    const first = await runScenario('merchant_route_v1');
    const second = await runScenario('merchant_route_v1');
    assert.equal(first.status, 'passed', JSON.stringify(first.failure));
    assert.equal(second.status, 'passed');
    assert.equal(first.gameplayDigest, second.gameplayDigest);
    assert(!JSON.stringify(first).includes('confirmationToken'));
    assert.equal(first.steps.find(step => step.id === 'insufficient_funds').result.code, 'INSUFFICIENT_CREDITS');
    assert.throws(() => loadScenario('../../anything'));
    for (const args of [['--workspace', ROOT], ['--scenario', 'merchant_route_v1', '--eval', 'process.exit(0)'], ['--script', 'x'], ['--describe', '../x']]) {
        const child = spawnSync(process.execPath, [path.join(__dirname, 'run_action_scenario.js'), ...args], { encoding: 'utf8', windowsHide: true });
        assert.equal(child.status, 2); assert.equal(JSON.parse(child.stdout).status, 'invalid');
    }
    await withFixture(async (fixture, service, qa) => {
        const agent = service.createTrustedSession('player-agent', true);
        const human = service.createTrustedSession('human-player');
        const readOnlyAgent = service.createTrustedSession('player-agent');
        const before = service.inspect(qa);
        const files = ['game_state.json', 'world_state.json', 'world_forge.json', 'game_rules.json'];
        const bytes = () => files.map(name => fs.readFileSync(path.join(fixture.workspace, name), 'utf8'));
        const originalBytes = bytes();
        for (const input of [trade, travel, day]) preview(service, agent, input);
        assert.deepEqual(bytes(), originalBytes, 'preview wrote canonical files');
        const publicActions = service.queryAvailable(agent);
        assert(!JSON.stringify(publicActions).includes('south_port'), 'hidden destination leaked');
        assert.throws(() => service.inspect(agent), /rejected_forbidden/);
        const forged = JSON.parse(JSON.stringify(qa));
        assert.throws(() => service.queryAvailable(forged), /rejected_forbidden/);
        assert.equal((await service.execute(forged, { ...trade, requestId: nextId() })).classification, 'rejected_forbidden');
        assert.equal((await service.execute(readOnlyAgent, { ...trade, requestId: nextId() })).classification, 'rejected_forbidden');
        for (const key of ['principal', 'capabilities', 'workspaceId', 'internalWitness', 'omniscient']) {
            assert.equal(service.preview(agent, { ...trade, [key]: 'forged' }).classification, 'rejected_invalid');
            assert.equal((await service.execute(agent, { ...trade, requestId: nextId(), [key]: 'forged' })).classification, 'rejected_invalid');
        }
        const quote = preview(service, agent, trade);
        assert.equal((await service.execute(agent, request(quote))).classification, 'rejected_forbidden', 'preview became consent');
        assert.equal(service.confirm(human, quote.confirmationToken, 'interactive'), false);
        assert.equal(service.confirm(agent, quote.confirmationToken, 'scripted'), false);
        assert.equal((await service.execute(human, request(quote))).classification, 'rejected_forbidden');
        assert(service.confirm(agent, quote.confirmationToken, 'interactive'));
        const raw = request(quote);
        const [one, duplicate] = await Promise.all([service.execute(agent, raw), service.execute(agent, raw)]);
        assert.equal(one.classification, 'committed'); assert.deepEqual(duplicate, one);
        const after = service.inspect(qa);
        assert.equal(after.game.commerce.credits, before.game.commerce.credits - quote.quote.total);
        assert.equal(after.world.markets.north_farm.wheat.stock, before.world.markets.north_farm.wheat.stock - 1);
        assert.deepEqual(await service.execute(agent, raw), one);
        assert.equal((await service.execute(agent, { ...raw, parameters: { ...raw.parameters, qty: 2 } })).classification, 'rejected_invalid');
        assert.equal((await service.waitReceipt(human, raw.requestId, 1)).classification, 'outcome_unknown');
        assert(!JSON.stringify(one).includes('eventCount'));
        const originalHash = service.queryAvailable(agent).actionSetHash;
        const old = preview(service, agent, day);
        const worldFile = path.join(fixture.workspace, 'world_state.json');
        const hiddenChanged = JSON.parse(fs.readFileSync(worldFile, 'utf8'));
        hiddenChanged.markets.south_port.spice.stock += 1;
        fs.writeFileSync(worldFile, JSON.stringify(hiddenChanged)); // adversarial fixture only, never a DSL operation
        assert.equal(service.queryAvailable(agent).actionSetHash, originalHash);
        service.confirm(agent, old.confirmationToken, 'interactive');
        assert.equal((await service.execute(agent, request(old))).classification, 'rejected_stale');
        const travelResult = await commit(service, agent, travel);
        const afterTravel = service.inspect(qa);
        assert.equal(afterTravel.game.world.currentLocationId, 'elda_shop');
        assert.equal(afterTravel.world.worldTurn, before.world.worldTurn);
        assert.deepEqual(afterTravel.game.commerce, after.game.commerce);
        assert.deepEqual(await service.execute(agent, travelResult.raw), travelResult.result);
        assert.deepEqual(service.inspect(qa), afterTravel);
        const staleDay = preview(service, agent, day);
        await commit(service, human, day);
        service.confirm(agent, staleDay.confirmationToken, 'interactive');
        assert.equal((await service.execute(agent, request(staleDay))).classification, 'rejected_stale');
        const busyQuote = preview(service, agent, day);
        service.confirm(agent, busyQuote.confirmationToken, 'interactive');
        const lease = fixture.gate.acquire(fixture.workspace, { actionKind: 'human_test', requestId: 'human_owner' });
        assert.equal(lease.status, 'acquired');
        const busy = await service.execute(agent, request(busyQuote));
        assert.equal(busy.classification, 'rejected_busy');
        assert.throws(() => service.inspect(qa), /rejected_busy/);
        lease.lease.release();
        const epochQuote = preview(service, agent, day);
        service.confirm(agent, epochQuote.confirmationToken, 'interactive');
        require('../out/acceptedTurnReplayGuard').rotateAcceptedTurnTimelineEpoch(fixture.workspace);
        assert.equal((await service.execute(agent, request(epochQuote))).classification, 'rejected_stale');
        const restarted = await fixture.modules.createRuntime(fixture.modules.createGate());
        const restartedCaller = restarted.service.createTrustedSession('player-agent', true);
        assert.equal((await restarted.service.execute(restartedCaller, request(epochQuote))).classification, 'outcome_unknown');
        service.close(agent);
        assert.equal((await service.execute(agent, raw)).classification, 'rejected_forbidden');
    });
    await withFixture(async (fixture, service, qa) => {
        let release;
        const hold = new Promise(resolve => { release = resolve; });
        const originalRun = fixture.gate.run;
        fixture.gate.run = (ws, identity, execute) => originalRun(ws, identity, async () => { await hold; return execute(); });
        const quoted = preview(service, qa, day);
        service.confirm(qa, quoted.confirmationToken, 'scripted');
        const raw = request(quoted);
        const running = service.execute(qa, raw);
        const timedOut = await service.waitReceipt(qa, raw.requestId, 1);
        assert.equal(timedOut.classification, 'outcome_unknown');
        assert.equal(fixture.gate.acquire(fixture.workspace, { actionKind: 'timeout_probe', requestId: 'timeout_probe' }).status, 'busy');
        release();
        assert.equal((await running).classification, 'committed');
        assert.equal((await service.waitReceipt(qa, raw.requestId, 1)).classification, 'committed');
    });
    await withFixture(async (fixture, service, qa) => {
        const world = require('../out/worldState');
        const originalSave = world.saveWorldState;
        const quote = preview(service, qa, trade);
        const raw = request(quote);
        service.confirm(qa, quote.confirmationToken, 'scripted');
        world.saveWorldState = () => false;
        try {
            const result = await service.execute(qa, raw);
            assert.equal(result.classification, 'committed_partial');
            const after = service.inspect(qa);
            assert.equal(after.game.commerce.credits, quote.quote.creditsAfter);
            assert.deepEqual(await service.execute(qa, raw), result);
            assert.deepEqual(service.inspect(qa), after);
        } finally { world.saveWorldState = originalSave; require('../out/workspaceStateQueue').resetWorkspaceWriteQueueForTests(); }
    });
    await withFixture(async (fixture, service, qa) => {
        const persistence = require('../out/livingWorldCommercePersist');
        const original = persistence.flushScheduledCommercePersist;
        persistence.flushScheduledCommercePersist = () => { original(); throw new Error('post-commit interruption'); };
        const quote = preview(service, qa, trade);
        service.confirm(qa, quote.confirmationToken, 'scripted');
        const raw = request(quote);
        try {
            const result = await service.execute(qa, raw);
            assert.equal(result.classification, 'outcome_unknown');
            assert.equal(service.inspect(qa).game.commerce.credits, quote.quote.creditsAfter);
            assert.deepEqual(await service.execute(qa, raw), result);
        } finally { persistence.flushScheduledCommercePersist = original; }
    });
    // Real human adapter calls the very same service and persistence owners.
    await withFixture(async (fixture, service, qa) => {
        const messages = [];
        const adapter = fixture.modules.createWebview(fixture.gate, value => messages.push(value), () => { throw new Error('refresh fixture'); });
        await adapter.preview('commerce:trade', { type: 'shopkeeperTradePreview', previewId: 'preview_0001', ...trade.parameters });
        const quote = messages.pop(); assert.equal(quote.ok, true);
        await adapter.execute('commerce:trade', { type: 'shopkeeperDirectTrade', requestId: 'webview_0001', confirmationToken: quote.confirmationToken, ...trade.parameters });
        const response = messages.pop();
        assert.equal(response.ok, true); assert.equal(response.classification, 'committed_with_warning');
        assert.equal(service.inspect(qa).game.commerce.credits, quote.creditsAfter);
        adapter.dispose();
    });
    // Expiry and bounded replay retention are independent of gameplay clocks.
    const { createGameActionService } = require('../out/gameActionService');
    const { createDeterministicWorkspaceMutationGate } = require('../out/deterministicWorkspaceMutationGate');
    let time = 0; let changes = 0;
    const bounded = createGameActionService({ mutationGate: createDeterministicWorkspaceMutationGate(), now: () => time,
        scope: () => ({ workspaceId: 'fixture', campaignId: 'fixture', timelineEpoch: 'epoch', authorizationGeneration: 1 }),
        authorized: () => true, read: () => changes, playerView: () => ({}),
        actions: () => [{ actionId: 'commerce:end_day', version: 1, available: true, parameters: {}, estimate: {} }],
        quote: () => ({ ok: true, quote: {} }), witness: String,
        execute: () => { changes++; return { classification: 'committed', result: {} }; }, inspect: () => ({ changes }),
    });
    const caller = bounded.createTrustedSession('qa-runner');
    const expiring = preview(bounded, caller, day); bounded.confirm(caller, expiring.confirmationToken, 'scripted');
    time = 120001;
    assert.equal((await bounded.execute(caller, request(expiring))).classification, 'rejected_stale');
    const saved = await commit(bounded, caller, day);
    for (let i = 0; i < 33; i++) await commit(bounded, caller, day);
    assert.equal((await bounded.execute(caller, saved.raw)).classification, 'outcome_unknown');
    assert.equal(changes, 34);
    for (let i = 34; i < 1024; i++) {
        time += 120001; // expire confirmation handles while retaining request tombstones
        await commit(bounded, caller, day);
    }
    const capped = preview(bounded, caller, day);
    bounded.confirm(caller, capped.confirmationToken, 'scripted');
    assert.equal((await bounded.execute(caller, request(capped))).classification, 'outcome_unknown');
    const otherCaller = bounded.createTrustedSession('human-player');
    await commit(bounded, otherCaller, day); // one caller's cap must not starve another
    bounded.close(caller);
    const reopened = bounded.createTrustedSession('qa-runner');
    await commit(bounded, reopened, day);
    assert.equal((await bounded.execute(caller, saved.raw)).classification, 'rejected_forbidden');
    assert.equal(changes, 1026);
    const extension = fs.readFileSync(path.join(ROOT, 'src/extension.ts'), 'utf8');
    assert(!extension.includes('executeLivingWorldDirectTrade'), 'Webview transport must not reach the lower trade owner directly');
    console.log('Commerce Action Driver: production persistence, trust, privacy, replay, stale, busy, timeout and fixture CLI passed.');
}
main().catch(error => { console.error(error.stack); process.exitCode = 1; });
