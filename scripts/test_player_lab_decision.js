'use strict';
const assert = require('node:assert/strict');
const { parsePlayerLabDecision, runPlayerLabDecision } = require('../out/playerLabDecisionCore');
const day = { actionId: 'commerce:end_day', parameters: {} };
function fake() {
    const calls = [], prompts = [];
    let result = { actionId: day.actionId, classification: 'committed', commitStatus: 'committed' };
    const api = { dispose() {}, async call(tool, args) {
        calls.push({ tool, args });
        if (tool === 'read_player_view') return { worldTurn: 1 };
        if (tool === 'query_available') return { actionSetHash: 'hash', actions: [{ actionId: day.actionId, available: true }] };
        if (tool === 'preview') return { ok: true, ...day, quote: { targetWorldTurn: 2 }, actionSetHash: 'hash', confirmationToken: 'SECRET_HANDLE' };
        return result;
    } };
    return { api, calls, prompts, setResult(value) { result = value; }, async ask(prompt) {
        prompts.push(prompt); return JSON.stringify(prompts.length === 1 ? day : { accept: true });
    } };
}
async function main() {
    assert.deepEqual(parsePlayerLabDecision(JSON.stringify(day)), day);
    for (const raw of [{ ...day, principal: 'qa-runner' }, { actionId: 'checkpoint:restore', parameters: {} },
        { ...day, parameters: { confirmationToken: 'foreign' } }, { stop: true, reason: 'private text' },
        { actionId: 'commerce:trade', parameters: { op: 'buy', marketLocationId: 'a', commodityId: 'b', qty: 0 } }]) {
        assert.throws(() => parsePlayerLabDecision(JSON.stringify(raw)), /invalid_decision/);
    }
    assert.throws(() => parsePlayerLabDecision('x'.repeat(16385)), /invalid_decision/);
    const normal = fake();
    const outcome = await runPlayerLabDecision(normal.api, normal.ask, 'fixture task');
    assert.equal(outcome.status, 'executed');
    assert.deepEqual(normal.calls.map(c => c.tool), ['read_player_view', 'query_available', 'preview', 'execute', 'wait_receipt']);
    assert.equal(normal.prompts.length, 2);
    assert(normal.prompts[1].includes('targetWorldTurn'));
    assert(!normal.prompts.join('').includes('SECRET_HANDLE'));
    assert(!JSON.stringify(outcome).includes('SECRET_HANDLE'));
    const execution = normal.calls.find(c => c.tool === 'execute').args;
    assert.match(execution.requestId, /^[a-f0-9-]{36}$/);
    assert.equal(execution.confirmationToken, 'SECRET_HANDLE');
    const stopped = fake();
    assert.equal((await runPlayerLabDecision(stopped.api, async () => '{"stop":true}', 'task')).status, 'stopped');
    assert(!stopped.calls.some(c => c.tool === 'preview'));
    const decline = fake(); let asked = 0;
    assert.equal((await runPlayerLabDecision(decline.api, async () => JSON.stringify(++asked === 1 ? day : { accept: false }), 'task')).status, 'stopped');
    assert(!decline.calls.some(c => c.tool === 'execute'));
    const cancelled = fake(), controller = new AbortController(); asked = 0;
    const cancelledResult = await runPlayerLabDecision(cancelled.api, async () => {
        if (++asked === 2) controller.abort();
        return JSON.stringify(asked === 1 ? day : { accept: true });
    }, 'task', controller.signal);
    assert.equal(cancelledResult.status, 'cancelled');
    assert(!cancelled.calls.some(c => c.tool === 'execute'));
    for (const [classification, commitStatus] of [['committed_partial', 'partial'], ['outcome_unknown', 'unknown']]) {
        const uncertain = fake(); uncertain.setResult({ classification, commitStatus });
        assert.equal((await runPlayerLabDecision(uncertain.api, uncertain.ask, 'task')).status, 'uncertain');
        assert.equal(uncertain.calls.filter(c => c.tool === 'execute').length, 1);
        assert.equal(uncertain.prompts.length, 2);
    }
    const lost = fake(), originalCall = lost.api.call;
    lost.api.call = async (tool, args) => { if (tool === 'execute') throw new Error('PRIVATE_PROVIDER_TEXT'); return originalCall(tool, args); };
    const unknown = await runPlayerLabDecision(lost.api, lost.ask, 'task');
    assert.equal(unknown.status, 'uncertain');
    assert.equal(unknown.commitStatus, 'unknown');
    assert(!JSON.stringify(unknown).includes('PRIVATE_PROVIDER_TEXT'));

    // Actual Shared Game Action Service and production persistence in the existing fixed fixture.
    // Only the model response is scripted; this is not real-model or real-Extension-Host evidence.
    const { openActionFixture } = require('./action_scenario_fixture');
    const fixture = await openActionFixture('merchant_route_v1');
    const { createPlayerDelegation } = require('../out/playerDelegationCore');
    const api = createPlayerDelegation({ service: fixture.runtime.service, scope: fixture.runtime.scope,
        current: fixture.runtime.authorized }, ['commerce:end_day'], 1);
    try {
        const before = await api.call('read_player_view', {}); asked = 0;
        const actual = await runPlayerLabDecision(api, async () => JSON.stringify(++asked === 1 ? day : { accept: true }), 'Wait one world turn.');
        assert.equal(actual.status, 'executed'); assert.equal(actual.receiptVerified, true);
        const after = await api.call('read_player_view', {});
        assert.equal(after.worldTurn, before.worldTurn + 1);
        assert.equal((await api.call('query_available', {})).delegation.remaining, 0);
    } finally { api.dispose(); fixture.close(); }
    console.log('Player Lab decision: quote approval, restricted parameters, cancellation, unknown/no retry, production fixture end day passed. No real model used.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
