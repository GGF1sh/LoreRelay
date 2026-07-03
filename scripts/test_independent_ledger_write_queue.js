#!/usr/bin/env node
'use strict';

/**
 * discoveries.json / campaign_resources.json per-file write queues.
 */

const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const queuePath = path.join(root, 'out', 'workspaceStateQueue.js');

let failed = 0;
function fail(msg) { console.error(`FAIL: ${msg}`); failed++; }
function ok(msg) { console.log(`OK: ${msg}`); }

if (!fs.existsSync(queuePath)) {
    fail('out/workspaceStateQueue.js missing - run npm run compile first');
    process.exit(1);
}

const {
    runSerializedDiscoveryMutation,
    runSerializedCampaignResourcesMutation,
    runSerializedGameStateMutation,
    resetWorkspaceWriteQueueForTests,
} = require(queuePath);

resetWorkspaceWriteQueueForTests();

{
    const log = [];
    runSerializedDiscoveryMutation(() => log.push('d1'));
    runSerializedDiscoveryMutation(() => log.push('d2'));
    if (log.join(',') !== 'd1,d2') {
        fail(`discovery queue fifo: ${log.join(',')}`);
    } else {
        ok('discovery queue fifo order');
    }
}

{
    const log = [];
    runSerializedCampaignResourcesMutation(() => log.push('r1'));
    runSerializedCampaignResourcesMutation(() => log.push('r2'));
    if (log.join(',') !== 'r1,r2') {
        fail(`campaign resources queue fifo: ${log.join(',')}`);
    } else {
        ok('campaign resources queue fifo order');
    }
}

{
    const log = [];
    runSerializedDiscoveryMutation(() => {
        log.push('d-start');
        runSerializedCampaignResourcesMutation(() => log.push('r'));
        log.push('d-end');
    });
    if (log.join(',') !== 'd-start,r,d-end') {
        fail(`independent discovery vs resources queues: ${log.join(',')}`);
    } else {
        ok('discovery and campaign resources queues are independent');
    }
}

{
    resetWorkspaceWriteQueueForTests();
    let qty = 10;
    runSerializedCampaignResourcesMutation(() => {
        const cur = qty;
        qty = cur - 1;
    });
    runSerializedCampaignResourcesMutation(() => {
        const cur = qty;
        qty = cur - 1;
    });
    if (qty !== 8) {
        fail(`serialized mutations should not lose updates: qty=${qty}`);
    } else {
        ok('serialized campaign resource mutations apply sequentially');
    }
}

{
    resetWorkspaceWriteQueueForTests();
    const log = [];
    runSerializedGameStateMutation(() => log.push('g'));
    runSerializedDiscoveryMutation(() => log.push('d'));
    runSerializedCampaignResourcesMutation(() => log.push('r'));
    const sorted = [...log].sort().join(',');
    if (sorted !== 'd,g,r') {
        fail(`all four queues should drain independently: ${log.join(',')}`);
    } else {
        ok('ledger queues are independent from game_state queue');
    }
}

if (failed > 0) {
    process.exit(1);
}
console.log('independent ledger write queue: all tests passed.');