#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const corePath = path.join(root, 'out', 'debugTraceCore.js');

let failed = 0;
function fail(msg) { console.error(`FAIL: ${msg}`); failed++; }
function ok(msg) { console.log(`OK: ${msg}`); }

if (!fs.existsSync(corePath)) {
    console.error(`FAIL: ${corePath} missing — run npm run compile`);
    process.exit(1);
}

const {
    appendDebugTraceEntries,
    createDebugTraceBuffer,
    traceEntryKey,
    validateDebugTraceLinks,
} = require(corePath);

function entry(runId, traceId, parentTraceId) {
    return {
        version: 1,
        runId,
        traceId,
        parentTraceId,
        subsystem: 'worldSim',
        phase: 'event',
        message: `entry ${traceId}`,
        audience: 'internal',
    };
}

// Evicted parent → parent_evicted (not missing_parent)
{
    let buffer = createDebugTraceBuffer(4);
    buffer = appendDebugTraceEntries(buffer, [
        entry('sim_A', 'trace_step_10'),
        entry('sim_A', 'trace_child_old', 'trace_step_10'),
        entry('sim_A', 'trace_step_11'),
        entry('sim_A', 'trace_gate_11', 'trace_step_11'),
        entry('sim_A', 'trace_step_12'),
        entry('sim_A', 'trace_child_stale', 'trace_step_10'),
    ]).buffer;
    const warnings = validateDebugTraceLinks(buffer);
    const evicted = warnings.filter((w) => w.code === 'parent_evicted');
    const missing = warnings.filter((w) => w.code === 'missing_parent');
    if (!evicted.some((w) => w.traceId === 'trace_child_stale')) {
        fail(`expected parent_evicted for stale child: ${JSON.stringify(warnings)}`);
    } else if (missing.some((w) => w.traceId === 'trace_child_stale')) {
        fail('evicted parent must not be missing_parent');
    } else if (!buffer.evictedTraceKeys?.includes(traceEntryKey('sim_A', 'trace_step_10'))) {
        fail(`buffer should record evicted step anchor: ${JSON.stringify(buffer.evictedTraceKeys)}`);
    } else {
        ok('evicted parent surfaces parent_evicted warning');
    }
}

// Never-seen parent → missing_parent
{
    let buffer = createDebugTraceBuffer();
    buffer = appendDebugTraceEntries(buffer, [
        entry('sim_B', 'trace_orphan', 'trace_never_existed'),
    ]).buffer;
    const warnings = validateDebugTraceLinks(buffer);
    if (!warnings.some((w) => w.code === 'missing_parent')) {
        fail(`unknown parent should be missing_parent: ${JSON.stringify(warnings)}`);
    } else if (warnings.some((w) => w.code === 'parent_evicted')) {
        fail('unknown parent must not be parent_evicted');
    } else {
        ok('unknown parent stays missing_parent');
    }
}

if (failed > 0) {
    console.error(`\n${failed} test(s) failed`);
    process.exit(1);
}
console.log('\nAll debug_trace_ring_eviction tests passed');