#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const corePath = path.join(root, 'out', 'debugTraceCore.js');
const hostPath = path.join(root, 'out', 'debugTraceHostCore.js');

let failed = 0;
function fail(msg) { console.error(`FAIL: ${msg}`); failed++; }
function ok(msg) { console.log(`OK: ${msg}`); }

for (const p of [corePath, hostPath]) {
    if (!fs.existsSync(p)) {
        console.error(`FAIL: ${p} missing — run npm run compile`);
        process.exit(1);
    }
}

const {
    appendDebugTraceEntries,
    createDebugTraceBuffer,
    traceEntryKey,
    validateDebugTraceLinks,
} = require(corePath);
const {
    beginDebugTraceSimulationRun,
    endDebugTraceSimulationRun,
    getActiveDebugTraceSimulationRunId,
    resetDebugTraceHostForTests,
} = require(hostPath);

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

// Same traceId in different runs is legal
{
    let buffer = createDebugTraceBuffer();
    buffer = appendDebugTraceEntries(buffer, [
        entry('sim_A', 'trace_step_10'),
        entry('sim_B', 'trace_step_10'),
    ]).buffer;
    const warnings = validateDebugTraceLinks(buffer);
    if (warnings.some((w) => w.code === 'duplicate_trace_id')) {
        fail(`cross-run same traceId should not duplicate-warn: ${JSON.stringify(warnings)}`);
    } else {
        ok('cross-run same traceId is legal');
    }
}

// Parent must be in the same run
{
    let buffer = createDebugTraceBuffer();
    buffer = appendDebugTraceEntries(buffer, [
        entry('sim_A', 'trace_step_10'),
        entry('sim_B', 'trace_child', 'trace_step_10'),
    ]).buffer;
    const warnings = validateDebugTraceLinks(buffer);
    if (!warnings.some((w) => w.code === 'missing_parent' && w.runId === 'sim_B')) {
        fail(`cross-run parent should warn missing_parent in child run: ${JSON.stringify(warnings)}`);
    } else {
        ok('cross-run parent is not accepted');
    }
}

// Same-run parent link is valid
{
    let buffer = createDebugTraceBuffer();
    buffer = appendDebugTraceEntries(buffer, [
        entry('sim_A', 'trace_step_10'),
        entry('sim_A', 'trace_child', 'trace_step_10'),
    ]).buffer;
    const warnings = validateDebugTraceLinks(buffer);
    if (warnings.some((w) => w.code === 'missing_parent' || w.code === 'duplicate_trace_id')) {
        fail(`same-run parent should link cleanly: ${JSON.stringify(warnings)}`);
    } else {
        ok('same-run parent link is valid');
    }
}

// traceEntryKey helper
{
    const key = traceEntryKey('sim_1', 'trace_step_42');
    if (key !== 'sim_1:trace_step_42') {
        fail(`traceEntryKey unexpected: ${key}`);
    } else {
        ok('traceEntryKey format');
    }
}

// Run lifecycle: end clears active
{
    resetDebugTraceHostForTests();
    const runA = beginDebugTraceSimulationRun(10);
    endDebugTraceSimulationRun(runA);
    if (getActiveDebugTraceSimulationRunId() !== undefined) {
        fail('endDebugTraceSimulationRun should clear active run');
    } else {
        ok('endDebugTraceSimulationRun clears active run');
    }
}

// Overlapping begins: latest wins, end only clears matching id
{
    resetDebugTraceHostForTests();
    const runA = beginDebugTraceSimulationRun(1);
    const runB = beginDebugTraceSimulationRun(2);
    if (getActiveDebugTraceSimulationRunId() !== runB) {
        fail('latest begin should own active run');
    }
    endDebugTraceSimulationRun(runA);
    if (getActiveDebugTraceSimulationRunId() !== runB) {
        fail('ending stale run id must not clear newer active run');
    } else {
        ok('end only clears matching active run');
    }
    endDebugTraceSimulationRun(runB);
    if (getActiveDebugTraceSimulationRunId() !== undefined) {
        fail('ending active run should clear marker');
    } else {
        ok('active run cleared after matching end');
    }
}

if (failed > 0) {
    console.error(`\n${failed} test(s) failed`);
    process.exit(1);
}
console.log('\nAll debug_trace_cross_run_identity tests passed');