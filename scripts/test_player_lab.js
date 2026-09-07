'use strict';
const assert = require('assert/strict');
const { recordPlayerLabSession, comparePlayerLabRuns } = require('../out/playerLabCore');
async function main() {
    const conditions = { fixtureDigest: 'same-fixture', initialPublicDigest: 'same-view', taskDigest: 'a'.repeat(64), maximum: 10,
        allowedActions: ['commerce:trade', 'commerce:travel', 'commerce:end_day'] };
    let calls = 0;
    const api = { dispose() {}, async call() { calls++; return { actionId: 'commerce:trade',
        classification: 'outcome_unknown', commitStatus: 'unknown', result: { secret: 'must-not-export' } }; } };
    const recorder = recordPlayerLabSession(api, 'fixture-client', 'fixture-model', conditions);
    const request = { requestId: 'private-request', confirmationToken: 'private-confirmation' };
    await recorder.connection.call('execute', request);
    await recorder.connection.call('execute', request);
    assert.equal(calls, 2, 'wrapper must leave authoritative replay handling to service');
    const result = recorder.result(true);
    assert.equal(result.steps.length, 1, 'identical retry must not inflate action counts');
    assert(!JSON.stringify(result).includes('private-'));
    assert(!JSON.stringify(result).includes('must-not-export'));
    const comparison = comparePlayerLabRuns([result, result]);
    assert.equal(comparison.comparable, true);
    assert.equal(comparison.runs[0].committed, 0);
    assert.equal(comparison.runs[0].partialOrUnknown, 1);
    assert.equal(comparePlayerLabRuns([result, recorder.result(false)]).comparable, false);
    assert.equal(comparePlayerLabRuns([result, { ...result, conditions: { ...conditions, maximum: 11 } }]).comparable, false);
    assert.equal(comparePlayerLabRuns([result, { ...result, conditions: { ...conditions, taskDigest: 'b'.repeat(64) } }]).comparable, false);
    assert.equal(comparePlayerLabRuns([{ ...result, conditions: { ...conditions, taskDigest: undefined } }]).comparable, false);
    conditions.maximum = 20;
    assert.equal(recorder.result().conditions.maximum, 10);
    recorder.connection.dispose();
    assert.equal((await recorder.connection.call('execute', {})).classification, 'rejected_forbidden');
    let finish;
    const delayed = recordPlayerLabSession({ dispose() {}, call: () => new Promise(resolve => { finish = resolve; }) },
        'fixture-client', 'fixture-model', conditions);
    const inflight = delayed.connection.call('execute', request);
    let closed = false;
    const closing = delayed.close().then(() => { closed = true; });
    await Promise.resolve();
    assert.equal(closed, false, 'fixture must remain while accepted execution is pending');
    assert.equal((await delayed.connection.call('execute', {})).classification, 'rejected_forbidden');
    finish({ actionId: 'commerce:trade', classification: 'committed', commitStatus: 'committed' });
    await inflight;
    await closing;
    assert.equal(delayed.result().steps[0].commitStatus, 'committed');
    let tradeIndex = 0;
    const trading = recordPlayerLabSession({ dispose() {}, async call() {
        return { actionId: 'commerce:trade', classification: 'committed', commitStatus: 'committed',
            result: { op: tradeIndex++ ? 'sell' : 'buy', commodityId: 'grain', qty: 2, total: 8,
                secret: 'not-for-export', diagnostic: { witness: 'private' } } };
    } }, 'fixture-client', 'fixture-model', conditions);
    await trading.connection.call('execute', { requestId: 'trade-1' });
    await trading.connection.call('execute', { requestId: 'trade-2' });
    const aggregate = comparePlayerLabRuns([trading.result(true)]).runs[0];
    assert.equal(aggregate.recordedTradeCashFlow, 0);
    assert.equal(aggregate.tradeDetailsComplete, true);
    assert.deepEqual(aggregate.trades.map(trade => trade.op), ['buy', 'sell']);
    assert(!JSON.stringify(aggregate).includes('not-for-export'));
    await trading.close();
    const failure = new Error('private-transport-diagnostic');
    let failedCalls = 0;
    const failing = recordPlayerLabSession({ dispose() {}, async call() {
        failedCalls++;
        throw failure;
    } }, 'fixture-client', 'fixture-model', conditions);
    const failedRequest = { actionId: 'commerce:end_day', requestId: 'private-failed-request' };
    await assert.rejects(failing.connection.call('execute', failedRequest), error => error === failure);
    await assert.rejects(failing.connection.call('execute', failedRequest), error => error === failure);
    await assert.rejects(failing.connection.call('read_player_view', {}), error => error === failure);
    assert.equal(failedCalls, 3, 'recorder does not retry or suppress the original failure');
    assert.deepEqual(failing.result().steps, [{ action: 'commerce:end_day', classification: 'outcome_unknown', commitStatus: 'unknown' }]);
    assert.equal(comparePlayerLabRuns([failing.result()]).runs[0].partialOrUnknown, 1);
    assert(!JSON.stringify(failing.result()).includes('private-'));
    await failing.close();
    console.log('Player Lab aggregation: conditions, incomplete runs, replay count, unknown outcomes, privacy and disposal passed.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
