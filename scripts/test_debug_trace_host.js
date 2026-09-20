#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const hostPath = path.join(root, 'out', 'debugTraceHostCore.js');
const sourcePath = path.join(root, 'src', 'debugTraceHostCore.ts');

let failed = 0;
function fail(msg) { console.error(`FAIL: ${msg}`); failed++; }
function ok(msg) { console.log(`OK: ${msg}`); }

if (!fs.existsSync(hostPath)) {
    console.error(`FAIL: ${hostPath} missing — run npm run compile`);
    process.exit(1);
}

const {
    DEBUG_TRACE_UPDATE_MESSAGE_TYPE,
    appendDebugTraceHostEntries,
    beginDebugTraceSimulationRun,
    endDebugTraceSimulationRun,
    flushDebugTraceHostUpdate,
    getActiveDebugTraceSimulationRunId,
    buildDebugTraceUpdateMessage,
    buildSimulationStepTraceEntries,
    captureDebugTraceSimulationStep,
    getDebugTraceHostBuffer,
    resetDebugTraceHostForTests,
    setDebugTraceHostUpdateListener,
} = require(hostPath);

resetDebugTraceHostForTests();

{
    let notified = 0;
    setDebugTraceHostUpdateListener(() => { notified += 1; });
    appendDebugTraceHostEntries([{
        version: 1,
        runId: 'sim_1',
        traceId: 'trace_a',
        subsystem: 'test',
        phase: 'event',
        message: 'hello',
        audience: 'internal',
    }]);
    if (notified !== 0) {
        fail(`append should coalesce notify until flush (got ${notified})`);
    }
    flushDebugTraceHostUpdate();
    if (notified !== 1) {
        fail(`listener should fire once after flush (got ${notified})`);
    } else {
        ok('append coalesces then flush notifies update listener');
    }
    setDebugTraceHostUpdateListener(undefined);
}

{
    resetDebugTraceHostForTests();
    appendDebugTraceHostEntries([{ traceId: 'bad' }]);
    const buf = getDebugTraceHostBuffer();
    if (buf.entries.length !== 0) {
        fail('invalid entry should be rejected without throwing');
    } else {
        ok('invalid append never throws and rejects entry');
    }
}

{
    resetDebugTraceHostForTests();
    const runA = beginDebugTraceSimulationRun(10);
    const runB = beginDebugTraceSimulationRun(10);
    if (runA === runB) {
        fail('simulation run ids should be unique');
    } else if (getActiveDebugTraceSimulationRunId() !== runB) {
        fail('active simulation run id should track latest begin');
    } else {
        ok('simulation run ids are unique');
    }
    endDebugTraceSimulationRun(runB);
    if (getActiveDebugTraceSimulationRunId() !== undefined) {
        fail('endDebugTraceSimulationRun should clear active id');
    } else {
        ok('endDebugTraceSimulationRun clears active id');
    }
}

{
    resetDebugTraceHostForTests();
    const runId = beginDebugTraceSimulationRun(42);
    const entries = buildSimulationStepTraceEntries(runId, { worldTurn: 43 }, [
        {
            id: 'wce_43_faction_warn',
            worldTurn: 43,
            source: 'simulator',
            category: 'faction',
            severity: 'warning',
            factionId: 'merchants',
            message: 'Merchants warn of trade disruption.',
        },
        {
            id: 'wce_43_food',
            worldTurn: 43,
            source: 'simulator',
            category: 'resource',
            severity: 'critical',
            message: 'Wheat shortage threatens the region.',
        },
        {
            id: 'wce_43_info',
            worldTurn: 43,
            source: 'simulator',
            category: 'weather',
            severity: 'info',
            message: 'Light rain.',
        },
    ]);
    if (entries.length !== 3) {
        fail(`expected step summary + 2 notable events, got ${entries.length}`);
    } else {
        ok('step trace includes summary and notable events only');
    }
    const food = entries.find((e) => e.traceId === 'trace_ev_wce_43_food');
    if (!food || food.ruleId !== 'notable_event' || food.conditions?.length) {
        fail('food crisis shallow row should be slim notable_event without classifier conditions');
    } else {
        ok('food crisis shallow row is slim notable_event (classifier owned by P1a)');
    }
    const faction = entries.find((e) => e.traceId === 'trace_ev_wce_43_faction_warn');
    if (!faction || faction.parentTraceId !== 'trace_step_43') {
        fail('notable events should parent to step trace');
    } else {
        ok('notable events link to parent step trace');
    }
}

{
    const runId = 'sim_omit_test';
    const omitEntries = buildSimulationStepTraceEntries(runId, { worldTurn: 43 }, [
        {
            id: 'wce_43_food',
            worldTurn: 43,
            source: 'simulator',
            category: 'resource',
            severity: 'critical',
            message: 'Wheat shortage threatens the region.',
        },
        {
            id: 'wce_43_faction_warn',
            worldTurn: 43,
            source: 'simulator',
            category: 'faction',
            severity: 'warning',
            factionId: 'merchants',
            message: 'Merchants warn of trade disruption.',
        },
    ], { omitFoodCrisisShallowWhenDeepEmit: true });
    if (omitEntries.length !== 2) {
        fail(`deep emit on should omit food crisis shallow row (got ${omitEntries.length})`);
    } else if (omitEntries.some((e) => e.traceId === 'trace_ev_wce_43_food')) {
        fail('food crisis shallow row should be omitted when deep emit is active');
    } else {
        ok('deep emit on omits food crisis shallow Phase A row');
    }
}

{
    resetDebugTraceHostForTests();
    const runId = beginDebugTraceSimulationRun(5);
    captureDebugTraceSimulationStep(runId, { worldTurn: 6 }, []);
    const msg = buildDebugTraceUpdateMessage();
    if (msg.type !== DEBUG_TRACE_UPDATE_MESSAGE_TYPE) {
        fail(`message type should be ${DEBUG_TRACE_UPDATE_MESSAGE_TYPE}`);
    } else if (!msg.buffer || !Array.isArray(msg.buffer.entries) || msg.buffer.entries.length !== 1) {
        fail(`update message should include captured buffer entries: ${JSON.stringify(msg)}`);
    } else if (!Array.isArray(msg.linkWarnings)) {
        fail('update message should include linkWarnings array');
    } else {
        ok('debugTraceUpdate payload shape is correct');
    }
}

{
    resetDebugTraceHostForTests();
    const entries = [];
    for (let i = 0; i < 300; i++) {
        entries.push({
            version: 1,
            runId: 'sim_overflow',
            traceId: `trace_${i}`,
            subsystem: 'test',
            phase: 'event',
            message: `entry ${i}`,
            audience: 'internal',
        });
    }
    appendDebugTraceHostEntries(entries);
    const buf = getDebugTraceHostBuffer();
    if (buf.entries.length > buf.maxEntries) {
        fail(`buffer should respect maxEntries (${buf.entries.length} > ${buf.maxEntries})`);
    } else {
        ok('host buffer stays bounded under bulk append');
    }
}

{
    const source = fs.readFileSync(sourcePath, 'utf-8');
    const forbidden = ['vscode', 'writeJsonAtomic', 'statePatch'];
    for (const token of forbidden) {
        if (new RegExp(`\\b${token}\\b`).test(source)) {
            fail(`debugTraceHostCore must not reference forbidden token: ${token}`);
        }
    }
    if (/\bimport\b.*\bfs\b/.test(source) || /\brequire\s*\(\s*['"]fs['"]\s*\)/.test(source)) {
        fail('debugTraceHostCore must not import fs');
    } else {
        ok('debugTraceHostCore has no host-forbidden imports');
    }
}

if (failed > 0) {
    console.error(`\n${failed} test(s) failed`);
    process.exit(1);
}
console.log('\nAll debug_trace_host tests passed');