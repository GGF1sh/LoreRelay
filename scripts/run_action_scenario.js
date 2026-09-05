#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const { openActionFixture } = require('./action_scenario_fixture');
const ROOT = path.resolve(__dirname, '..');
const CATALOG = Object.freeze({ merchant_route_v1: path.join(__dirname, 'action_scenarios', 'merchant_route_v1.json') });
const STEP_FIELDS = {
    read_player_view: ['id', 'op'], query_available: ['id', 'op'],
    preview: ['id', 'op', 'actionId', 'parameters', 'actionSetFrom'],
    execute: ['id', 'op', 'previewFrom', 'requestId', 'confirmed'],
    wait_receipt: ['id', 'op', 'requestFrom', 'timeoutMs'],
    assert_receipt: ['id', 'op', 'receiptFrom', 'classification'],
    assert_state: ['id', 'op', 'check', 'from', 'previewFrom'],
    expect_rejection: ['id', 'op', 'phase', 'request', 'previewFrom', 'classification'],
};
const CHECKS = new Set(['unchanged', 'trade_persisted', 'travel_persisted', 'end_day_persisted']);
function validObject(value, fields) {
    return value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).every(key => fields.includes(key));
}
function loadScenario(id) {
    if (!Object.hasOwn(CATALOG, id)) throw new Error('input');
    const file = CATALOG[id];
    if (!fs.lstatSync(file).isFile() || fs.lstatSync(file).isSymbolicLink() || fs.statSync(file).size > 64_000) throw new Error('input');
    const scenario = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!validObject(scenario, ['schemaVersion', 'id', 'fixtureId', 'seed', 'limits', 'steps']) || scenario.schemaVersion !== 1
        || scenario.id !== id || scenario.fixtureId !== 'merchant_route_v1' || scenario.seed !== 7
        || !validObject(scenario.limits, ['maxSteps', 'timeoutMs'])
        || !Number.isSafeInteger(scenario.limits.maxSteps) || scenario.limits.maxSteps < 1 || scenario.limits.maxSteps > 64
        || !Number.isSafeInteger(scenario.limits.timeoutMs) || scenario.limits.timeoutMs < 1 || scenario.limits.timeoutMs > 30_000
        || !Array.isArray(scenario.steps) || scenario.steps.length > scenario.limits.maxSteps) throw new Error('input');
    const seen = new Set();
    for (const step of scenario.steps) {
        if (!step || !Object.hasOwn(STEP_FIELDS, step.op) || !validObject(step, STEP_FIELDS[step.op])
            || typeof step.id !== 'string' || !/^[a-z][a-z0-9_]{0,63}$/.test(step.id) || seen.has(step.id)) throw new Error('input');
        for (const field of ['from', 'previewFrom', 'receiptFrom', 'requestFrom', 'actionSetFrom']) {
            if (step[field] !== undefined && !seen.has(step[field])) throw new Error('input');
        }
        if (step.op === 'execute' && (step.confirmed !== true || typeof step.requestId !== 'string'
            || !/^[A-Za-z0-9_-]{8,128}$/.test(step.requestId) || !step.previewFrom)) throw new Error('input');
        if (step.op === 'wait_receipt' && (!step.requestFrom || !Number.isSafeInteger(step.timeoutMs) || step.timeoutMs < 0 || step.timeoutMs > 30_000)) throw new Error('input');
        if (step.op === 'assert_state' && (!CHECKS.has(step.check) || !step.from)) throw new Error('input');
        if (step.op === 'expect_rejection' && (!['preview', 'execute'].includes(step.phase)
            || !step.request || !['rejected_invalid', 'rejected_forbidden', 'rejected_stale', 'rejected_busy', 'outcome_unknown'].includes(step.classification))) throw new Error('input');
        seen.add(step.id);
    }
    return scenario;
}
function digest(value) {
    const { hashGameActionValue } = require('../out/gameActionService');
    return hashGameActionValue(value);
}
function assert(condition) { if (!condition) throw new Error('assertion'); }
async function runScenario(id) {
    const scenario = loadScenario(id);
    const report = { schemaVersion: 1, scenarioId: id, fixtureId: scenario.fixtureId, seed: scenario.seed,
        codeSha: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8', windowsHide: true }).trim(),
        scenarioDigest: crypto.createHash('sha256').update(JSON.stringify(scenario)).digest('hex'), steps: [], status: 'running' };
    const session = await openActionFixture();
    const { service } = session.runtime;
    const context = session.context;
    const results = new Map();
    const snapshots = new Map();
    const pending = [];
    const started = Date.now();
    try {
        for (const step of scenario.steps) {
            if (Date.now() - started > scenario.limits.timeoutMs) throw new Error('timeout');
            let value;
            switch (step.op) {
            case 'read_player_view':
                value = service.readPlayerView(context);
                snapshots.set(step.id, service.inspect(context));
                break;
            case 'query_available': value = service.queryAvailable(context); break;
            case 'preview': {
                const before = digest(service.inspect(context));
                value = service.preview(context, { actionId: step.actionId, parameters: step.parameters,
                    ...(step.actionSetFrom ? { expectedActionSetHash: results.get(step.actionSetFrom).actionSetHash } : {}) });
                assert(value.ok && before === digest(service.inspect(context)));
                break;
            }
            case 'execute': {
                const preview = results.get(step.previewFrom);
                assert(preview?.ok);
                // Catalog + owned workspace + trusted QA context + one of the three
                // scripted-confirmation-enabled actions. No adult consent surface.
                assert(['commerce:trade', 'commerce:travel', 'commerce:end_day'].includes(preview.actionId));
                service.confirm(context, preview.confirmationToken, 'scripted');
                const promise = service.execute(context, { actionId: preview.actionId, requestId: step.requestId,
                    parameters: preview.parameters, confirmationToken: preview.confirmationToken });
                pending.push(promise);
                value = { requestId: step.requestId };
                break;
            }
            case 'wait_receipt':
                value = await service.waitReceipt(context, results.get(step.requestFrom).requestId,
                    Math.min(step.timeoutMs, Math.max(0, scenario.limits.timeoutMs - (Date.now() - started))));
                if (['outcome_unknown', 'committed_partial'].includes(value.classification)) throw new Error('timeout');
                break;
            case 'assert_receipt':
                assert(results.get(step.receiptFrom)?.classification === step.classification);
                value = { passed: true }; break;
            case 'assert_state': {
                const before = snapshots.get(step.from);
                const after = service.inspect(context);
                assert(before);
                const quote = step.previewFrom && results.get(step.previewFrom)?.quote;
                if (step.check === 'unchanged') assert(digest(before) === digest(after));
                if (step.check === 'trade_persisted') {
                    assert(quote && after.game.commerce.credits === before.game.commerce.credits - quote.total);
                    const held = snapshot => (snapshot.game.commerce.cargo.find(item => item.commodityId === quote.commodityId)?.qty ?? 0);
                    assert(held(after) === held(before) + quote.qty);
                    const loc = before.game.world.currentLocationId;
                    assert(after.world.markets[loc][quote.commodityId].stock === before.world.markets[loc][quote.commodityId].stock - quote.qty);
                }
                if (step.check === 'travel_persisted') {
                    assert(quote && after.game.world.currentLocationId === quote.destination.id);
                    assert(after.world.worldTurn === before.world.worldTurn && digest(after.game.commerce) === digest(before.game.commerce));
                }
                if (step.check === 'end_day_persisted') {
                    assert(after.world.worldTurn === before.world.worldTurn + 1);
                    assert(after.game.world.worldTurnAtLastSync === after.world.worldTurn);
                }
                value = { passed: true }; break;
            }
            case 'expect_rejection': {
                const before = digest(service.inspect(context));
                const preview = step.previewFrom && results.get(step.previewFrom);
                const request = { ...(preview ? { actionId: preview.actionId, parameters: preview.parameters,
                    confirmationToken: preview.confirmationToken } : {}), ...step.request };
                value = step.phase === 'preview' ? service.preview(context, request) : await service.execute(context, request);
                assert(value.classification === step.classification && before === digest(service.inspect(context)));
                break;
            }
            }
            results.set(step.id, value);
            // Tokens and internal state never enter the report, even for QA.
            const publicValue = { ...value };
            delete publicValue.confirmationToken;
            report.steps.push({ id: step.id, op: step.op, result: publicValue });
        }
        await Promise.all(pending);
        const final = service.inspect(context);
        report.gameplayDigest = digest({ commerce: final.game.commerce, location: final.game.world.currentLocationId,
            worldTurn: final.world.worldTurn, markets: final.world.markets });
        report.status = 'passed';
    } catch (error) {
        report.status = error.message === 'timeout' ? 'outcome_unknown' : 'failed';
        report.failure = { stepIndex: report.steps.length, code: error.message === 'assertion' ? 'ASSERTION_FAILED' : 'ACTION_NOT_CONFIRMED' };
    } finally {
        // No cancellation/forced gate release on timeout; finish admitted work first.
        await Promise.allSettled(pending);
        session.close();
    }
    return report;
}
async function main(argv) {
    const saved = { log: console.log, warn: console.warn, error: console.error };
    try {
        if (argv.length === 1 && argv[0] === '--list') return { status: 'catalog', scenarios: Object.keys(CATALOG) };
        if (argv.length === 2 && argv[0] === '--describe') return loadScenario(argv[1]);
        if (!(argv.length === 2 || (argv.length === 4 && argv[2] === '--format' && argv[3] === 'json')) || argv[0] !== '--scenario') throw new Error('input');
        // Canonical owners may emit diagnostics; their arbitrary error values are
        // intentionally not forwarded into JSON stdout or the safe runner report.
        console.log = console.warn = console.error = () => {};
        return await runScenario(argv[1]);
    } finally { Object.assign(console, saved); }
}
if (require.main === module) main(process.argv.slice(2)).then(report => {
    process.stdout.write(JSON.stringify(report) + '\n');
    process.exitCode = report.status === 'failed' ? 1 : report.status === 'outcome_unknown' ? 3 : 0;
}).catch(() => {
    process.stdout.write(JSON.stringify({ status: 'invalid', code: 'INPUT_OR_SETUP_INVALID' }) + '\n');
    process.exitCode = 2;
});
module.exports = { loadScenario, runScenario, main };
