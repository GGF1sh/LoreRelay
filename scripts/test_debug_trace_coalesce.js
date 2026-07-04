#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const hostPath = path.join(root, 'out', 'debugTraceHostCore.js');

let failed = 0;
function fail(msg) { console.error(`FAIL: ${msg}`); failed++; }
function ok(msg) { console.log(`OK: ${msg}`); }

if (!fs.existsSync(hostPath)) {
    console.error(`FAIL: ${hostPath} missing — run npm run compile`);
    process.exit(1);
}

const {
    appendDebugTraceHostEntries,
    flushDebugTraceHostUpdate,
    resetDebugTraceHostForTests,
    setDebugTraceHostUpdateListener,
} = require(hostPath);

function validEntry(traceId) {
    return {
        version: 1,
        runId: 'sim_coalesce',
        traceId,
        subsystem: 'test',
        phase: 'event',
        message: `entry ${traceId}`,
        audience: 'internal',
    };
}

resetDebugTraceHostForTests();

// Multiple appends in one turn coalesce to one listener fire until flush
{
    let notified = 0;
    setDebugTraceHostUpdateListener(() => { notified += 1; });
    appendDebugTraceHostEntries([validEntry('a')]);
    appendDebugTraceHostEntries([validEntry('b')]);
    if (notified !== 0) {
        fail(`listener should not fire synchronously (got ${notified})`);
    } else {
        ok('append schedules coalesced notify');
    }

    flushDebugTraceHostUpdate();
    if (notified !== 1) {
        fail(`flush should deliver one update (got ${notified})`);
    } else {
        ok('flush delivers single coalesced update');
    }
    setDebugTraceHostUpdateListener(undefined);
}

if (failed > 0) {
    console.error(`\n${failed} test(s) failed`);
    process.exit(1);
}
console.log('\nAll debug_trace_coalesce tests passed');