'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const provider = require('./player_lab_provider');
let decisions = 0;
provider.createPlayerLabModel = () => ({ dispose() {}, async ask(prompt) {
    assert(!prompt.includes('confirmationToken'));
    if (prompt.startsWith('Review this public quote')) return '{"accept":true}';
    const data = JSON.parse(prompt.slice(prompt.indexOf('\n') + 1));
    const action = ['commerce:trade', 'commerce:travel', 'commerce:end_day'][decisions++];
    if (!action) return '{"stop":true}';
    const available = data.available.actions.find(item => item.actionId === action && item.available);
    assert(available, `Fixture must offer ${action}`);
    const p = available.parameters.properties;
    const parameters = action === 'commerce:trade' ? { op: 'buy', marketLocationId: p.marketLocationId.enum[0],
        commodityId: p.commodityId.enum[0], qty: 1 } : action === 'commerce:travel' ? { destinationId: p.destinationId.enum[0] } : {};
    return JSON.stringify({ actionId: action, parameters });
}, evidence() { return { provider: 'codex', role: 'player', calls: [], testModel: 'scripted_not_real' }; } });
process.argv = [process.execPath, __filename, 'codex', 'fixture', '--send-fixture-context'];
const log = console.log;
let resultFile;
console.log = value => { try { resultFile = JSON.parse(value).resultFile ?? resultFile; } catch {} log(value); };
require('./run_connected_player_lab').main().then(() => {
    const result = JSON.parse(fs.readFileSync(resultFile, 'utf8'));
    assert.equal(result.complete, false);
    assert.equal(result.steps.length, 3);
    assert.deepEqual(result.steps.map(step => step.action), ['commerce:trade', 'commerce:travel', 'commerce:end_day']);
    assert(result.steps.every(step => step.commitStatus === 'committed' && step.parameters));
    assert(result.decisions.slice(0, 3).every(step => step.receiptVerified));
    assert.equal(result.decisions.at(-1).status, 'stopped');
    assert(!JSON.stringify(result).includes('confirmationToken'));
    log('Connected Player Lab: scripted public-only trade, travel, end day and stop through production fixture service passed. No real model or real Host claim.');
}).catch(error => { console.error(error); process.exitCode = 1; }).finally(() => { console.log = log; });
