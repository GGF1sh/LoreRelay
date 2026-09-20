'use strict';
const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const { createActionRecorder, resolveRecordedActionTemplate } = require('../out/actionRecorderCore');
const { observeGameActionResults } = require('../out/gameActionService');
const { openActionFixture } = require('./action_scenario_fixture');
const { runScenario, loadScenario } = require('./run_action_scenario');
const action = (actionId, parameters, classification = 'committed') => ({ workspaceId: 'PRIVATE_WORKSPACE',
    principal: 'human-player', actionId, parameters, classification,
    result: { total: 9, secret: 'SECRET', confirmationToken: 'TOKEN', freeText: 'PRIVATE_TEXT' } });
const trade = action('commerce:trade', { op: 'buy', marketLocationId: 'north_farm', commodityId: 'wheat', qty: 1 });
const travel = action('commerce:travel', { destinationId: 'elda_shop' });
const day = action('commerce:end_day', {});
async function play(recording) {
    const fixture = await openActionFixture();
    const { service } = fixture.runtime;
    const recorder = createActionRecorder();
    let subscription;
    const human = service.createTrustedSession('human-player');
    try {
        if (recording) { recorder.start(); subscription = observeGameActionResults(value => recorder.observe(value)); }
        const brokenObserver = observeGameActionResults(() => { throw new Error('observer failure'); });
        try {
            for (const [index, input] of [trade, travel, day].entries()) {
                const preview = service.preview(human, { actionId: input.actionId, parameters: input.parameters });
                assert(preview.ok); assert(service.confirm(human, preview.confirmationToken, 'interactive'));
                const request = { actionId: input.actionId, parameters: input.parameters,
                    requestId: `human_request_${index}`, confirmationToken: preview.confirmationToken };
                const result = await service.execute(human, request);
                assert.equal(result.classification, 'committed');
                assert.deepEqual(await service.execute(human, request), result);
            }
        } finally { brokenObserver.dispose(); }
        assert.equal(recorder.status().count, recording ? 3 : 0, 'duplicate retransmission does not record twice');
        return { template: recorder.template(), view: service.readPlayerView(human) };
    } finally { subscription?.dispose(); fixture.close(); }
}
async function main() {
    const forge = JSON.parse(fs.readFileSync(path.join(__dirname, '../fixtures/action-scenarios/merchant_route_v1/world_forge.json'), 'utf8'));
    for (const market of forge.commerce.markets) {
        const recorder = createActionRecorder(); recorder.start();
        recorder.observe(action('commerce:travel', { destinationId: market.locationId }));
        assert.equal(resolveRecordedActionTemplate(recorder.template(), 'catalog_market').steps[0].parameters.destinationId, market.locationId);
    }
    for (const commodity of forge.commerce.commodities) {
        const recorder = createActionRecorder(); recorder.start();
        recorder.observe(action('commerce:trade', { ...trade.parameters, commodityId: commodity.id }));
        assert.equal(resolveRecordedActionTemplate(recorder.template(), 'catalog_commodity').steps[0].parameters.commodityId, commodity.id);
    }
    const baseline = await play(false);
    const recorded = await play(true);
    assert.deepEqual(recorded.view, baseline.view, 'Recorder and throwing observer do not change gameplay');
    const text = JSON.stringify(recorded.template);
    for (const secret of ['human_request_', 'confirmationToken', 'internalWitness', 'PRIVATE_WORKSPACE']) assert(!text.includes(secret));
    assert.throws(() => loadScenario('unregistered_recording'));
    const resolved = resolveRecordedActionTemplate(recorded.template, 'recorded_merchant_v1');
    assert.deepEqual(resolved, loadScenario('recorded_merchant_v1'), 'explicitly registered fixture is the sanitized template vocabulary');
    assert.equal((await runScenario('recorded_merchant_v1')).status, 'passed');
    const one = await runScenario('recorded_merchant_v1');
    const two = await runScenario('recorded_merchant_v1');
    assert.notEqual(one.steps.find(s => s.op === 'execute').result.requestId, two.steps.find(s => s.op === 'execute').result.requestId,
        'each replay gets fresh request IDs');
    assert.equal(one.gameplayDigest, two.gameplayDigest);
    const recorder = createActionRecorder();
    recorder.observe(trade); assert.equal(recorder.status().count, 0);
    recorder.start();
    recorder.observe({ ...trade, principal: 'qa-runner' });
    recorder.observe({ ...trade, principal: 'player-agent' });
    assert.equal(recorder.status().count, 0, 'only explicit human play is recorded');
    recorder.observe(trade); recorder.stop(); recorder.observe(day); assert.equal(recorder.status().count, 1);
    for (const secret of ['SECRET', 'TOKEN', 'PRIVATE_TEXT', 'PRIVATE_WORKSPACE']) assert(!JSON.stringify(recorder.template()).includes(secret));
    recorder.start(); recorder.observe(action('commerce:travel', { destinationId: 'unknown_campaign_id' }));
    assert(!JSON.stringify(recorder.template()).includes('unknown_campaign_id'));
    assert.throws(() => resolveRecordedActionTemplate(recorder.template(), 'resolved_candidate'), /unresolved/);
    assert(resolveRecordedActionTemplate(recorder.template(), 'resolved_candidate', { market_1: 'elda_shop' }));
    assert.throws(() => loadScenario('resolved_candidate'), 'resolution does not register an executable fixture');
    for (const classification of ['committed_partial', 'outcome_unknown', 'rejected_busy']) {
        recorder.start(); recorder.observe(action(day.actionId, {}, classification));
        assert.equal(recorder.template().steps.length, 0, 'uncertain result is never an automatic replay step');
        assert.throws(() => resolveRecordedActionTemplate(recorder.template(), 'unsafe_candidate'), /review_required/);
    }
    let notified = 0;
    const capped = createActionRecorder(() => { notified++; }); capped.start();
    for (let i = 0; i < 110; i++) capped.observe(day);
    assert.deepEqual(capped.status(), { recording: false, count: 100, limit: 100 }); assert.equal(notified, 1);
    assert.equal(resolveRecordedActionTemplate(capped.template(), 'large_candidate').steps.length, 400);
    assert.equal(createActionRecorder().status().recording, false, 'restart defaults to stopped');
    // Admission and completion subscriptions must both match, including stop/restart.
    const fixture = await openActionFixture();
    try {
        const service = fixture.runtime.service, human = service.createTrustedSession('human-player');
        const preview = service.preview(human, { actionId: day.actionId, parameters: {} });
        service.confirm(human, preview.confirmationToken, 'interactive');
        let early = 0, late = 0;
        const first = observeGameActionResults(() => { early++; });
        const pending = service.execute(human, { actionId: day.actionId, parameters: {}, requestId: 'admission_test', confirmationToken: preview.confirmationToken });
        first.dispose();
        const second = observeGameActionResults(() => { late++; });
        await pending; second.dispose();
        assert.equal(early, 0); assert.equal(late, 0);
    } finally { fixture.close(); }
    console.log('Action Recorder: explicit human recording, sanitization, registration, fresh replay, limits and observational equivalence passed.');
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
