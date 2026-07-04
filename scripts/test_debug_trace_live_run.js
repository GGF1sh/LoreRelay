#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const hostPath = path.join(root, 'out', 'debugTraceHostCore.js');
const worldStepPath = path.join(root, 'out', 'debugTraceWorldStepHost.js');
let failed = 0;
function fail(msg) { console.error(`FAIL: ${msg}`); failed++; }
function ok(msg) { console.log(`OK: ${msg}`); }

if (!fs.existsSync(worldStepPath)) {
    console.error(`FAIL: ${worldStepPath} missing — run npm run compile`);
    process.exit(1);
}

for (const p of [hostPath]) {
    if (!fs.existsSync(p)) {
        console.error(`FAIL: ${p} missing — run npm run compile`);
        process.exit(1);
    }
}

const {
    beginDebugTraceSimulationRun,
    captureDebugTraceSimulationStep,
    clearDebugTraceLiveRun,
    endDebugTraceSimulationRun,
    ensureDebugTraceLiveRun,
    flushDebugTraceHostUpdate,
    getActiveDebugTraceSimulationRunId,
    getDebugTraceHostBuffer,
    resetDebugTraceHostForTests,
} = require(hostPath);

resetDebugTraceHostForTests();

// Live run begins when bulk sim is not active
{
    const runId = ensureDebugTraceLiveRun(42);
    if (!runId || !runId.startsWith('debug_live_')) {
        fail(`ensureDebugTraceLiveRun should return debug_live id: ${runId}`);
    } else if (getActiveDebugTraceSimulationRunId() !== runId) {
        fail('live run should be active');
    } else if (ensureDebugTraceLiveRun(99) !== runId) {
        fail('live run should persist across ticks');
    } else {
        ok('debug live run is stable across ticks');
    }
    clearDebugTraceLiveRun();
    if (getActiveDebugTraceSimulationRunId() !== undefined) {
        fail('clearDebugTraceLiveRun should drop live marker');
    } else {
        ok('clearDebugTraceLiveRun clears marker');
    }
}

// Bulk sim run takes precedence over live run
{
    resetDebugTraceHostForTests();
    ensureDebugTraceLiveRun(1);
    const bulkId = beginDebugTraceSimulationRun(10);
    if (ensureDebugTraceLiveRun(11) !== bulkId) {
        fail('bulk sim run should override live run');
    } else {
        ok('bulk sim run takes precedence');
    }
    endDebugTraceSimulationRun(bulkId);
}

// Step capture under live run (same path as captureWorldStepDebugTraceIfGated when gated)
{
    resetDebugTraceHostForTests();
    const runId = ensureDebugTraceLiveRun(7);
    captureDebugTraceSimulationStep(runId, { worldTurn: 7 }, []);
    flushDebugTraceHostUpdate();
    const buf = getDebugTraceHostBuffer();
    const step = buf.entries.find((e) => e.traceId === 'trace_step_7');
    if (!step || step.runId !== runId) {
        fail(`live capture should append trace_step_7: ${JSON.stringify(buf.entries)}`);
    } else {
        ok('single-tick capture appends step anchor under live run');
    }
}

// world step host module exists (wired from emergentSimulator)
{
    const source = fs.readFileSync(path.join(root, 'src', 'debugTraceWorldStepHost.ts'), 'utf-8');
    if (!/captureWorldStepDebugTraceIfGated/.test(source)) {
        fail('debugTraceWorldStepHost should export captureWorldStepDebugTraceIfGated');
    } else {
        ok('debugTraceWorldStepHost exports gated capture helper');
    }
}

if (failed > 0) {
    console.error(`\n${failed} test(s) failed`);
    process.exit(1);
}
console.log('\nAll debug_trace_live_run tests passed');