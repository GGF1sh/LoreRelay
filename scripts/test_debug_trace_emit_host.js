#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const hostPath = path.join(root, 'out', 'debugTraceEmitHost.js');
const traceHostPath = path.join(root, 'out', 'debugTraceHostCore.js');
const sourcePath = path.join(root, 'src', 'debugTraceEmitHost.ts');

let failed = 0;
function fail(msg) { console.error(`FAIL: ${msg}`); failed++; }
function ok(msg) { console.log(`OK: ${msg}`); }

for (const p of [hostPath, traceHostPath]) {
    if (!fs.existsSync(p)) {
        fail(`${p} missing — run npm run compile`);
        process.exit(1);
    }
}

const {
    captureFoodCrisisAgencyDeepTrace,
} = require(hostPath);
const {
    beginDebugTraceSimulationRun,
    getActiveDebugTraceSimulationRunId,
    getDebugTraceHostBuffer,
    resetDebugTraceHostForTests,
} = require(traceHostPath);

const forge = {
    commodities: [{ id: 'wheat', name: 'Wheat', basePrice: 10, weight: 1 }],
    markets: [{
        locationId: 'cheap_farm',
        commodityIds: ['wheat'],
        targetStock: 30,
    }],
    transportKinds: [{ id: 'wagon', name: 'Wagon', capacity: 100, speed: 1 }],
};
const markets = { cheap_farm: { wheat: { stock: 10, priceIndex: 1 } } };
const registry = {
    npc_elda: { name: 'Elda', locationId: 'home', factionId: 'faction_merchants' },
};

function foodCrisisParams(worldTurn = 6) {
    return {
        worldTurn,
        stepEvents: [{
            id: 'wce_6_food',
            worldTurn,
            category: 'resource',
            severity: 'warning',
            message: 'Merchants: 食料が底をついた',
            factionId: 'faction_merchants',
        }],
        commerceForge: forge,
        markets,
        registry,
        npcPositionsBeforeTick: {},
        npcMoves: [{
            npcId: 'npc_elda',
            locationId: 'cheap_farm',
            arrivesTurn: worldTurn + 3,
            agenda: 'restock_wheat',
            reason: 'food_crisis_buy_wheat',
        }],
        npcPositionsAfterTick: {
            npc_elda: {
                locationId: 'home',
                arrivesTurn: worldTurn + 3,
                agenda: 'restock_wheat',
                reason: 'food_crisis_buy_wheat',
            },
        },
        maxNamedNpcCount: 10,
    };
}

resetDebugTraceHostForTests();

// 13. Gate off → no deep trace rows appended
{
    resetDebugTraceHostForTests();
    beginDebugTraceSimulationRun(5);
    captureFoodCrisisAgencyDeepTrace(
        { bulkWorldSimDebug: false, debugScenarioActive: false },
        foodCrisisParams()
    );
    const buf = getDebugTraceHostBuffer();
    if (buf.entries.some((e) => e.traceId.startsWith('trace_fc_'))) {
        fail('gated off should not append deep trace rows');
    } else {
        ok('gate off → no deep trace append');
    }
}

// Active runId required
{
    resetDebugTraceHostForTests();
    captureFoodCrisisAgencyDeepTrace(
        { bulkWorldSimDebug: true, debugScenarioActive: false },
        foodCrisisParams()
    );
    const buf = getDebugTraceHostBuffer();
    if (buf.entries.length !== 0) {
        fail('capture without active runId should not append');
    } else {
        ok('no active runId → no append');
    }
}

// Gate on + runId → deep trace rows in buffer
{
    resetDebugTraceHostForTests();
    const runId = beginDebugTraceSimulationRun(6);
    if (getActiveDebugTraceSimulationRunId() !== runId) {
        fail('beginDebugTraceSimulationRun should set active run id');
    }
    captureFoodCrisisAgencyDeepTrace(
        { bulkWorldSimDebug: true, debugScenarioActive: false },
        foodCrisisParams(6)
    );
    const buf = getDebugTraceHostBuffer();
    const gate = buf.entries.find((e) => e.traceId === 'trace_fc_gate_t6');
    const effect = buf.entries.find((e) => e.traceId === 'trace_fc_effect_npc_elda_t6');
    if (!gate || gate.decision !== 'gate_open') {
        fail(`gated on should append gate row: ${JSON.stringify(gate)}`);
    } else if (!effect || effect.audience !== 'gm_safe') {
        fail(`gated on should append gm_safe effect: ${JSON.stringify(effect)}`);
    } else if (buf.entries.some((e) => e.runId !== runId)) {
        fail('deep trace rows should use active simulation runId');
    } else {
        ok('gate on + runId → deep trace appended to host buffer');
    }
}

// capture never throws on garbage
{
    resetDebugTraceHostForTests();
    beginDebugTraceSimulationRun(1);
    try {
        captureFoodCrisisAgencyDeepTrace(
            { bulkWorldSimDebug: true, debugScenarioActive: true },
            null
        );
        ok('capture swallows malformed params');
    } catch {
        fail('capture must not throw on malformed params');
    }
}

{
    const source = fs.readFileSync(sourcePath, 'utf-8');
    if (/\brecentChanges\b/.test(source)) {
        fail('debugTraceEmitHost must not reference recentChanges');
    } else {
        ok('emit host has no recentChanges reference');
    }
}

if (failed > 0) {
    console.error(`\n${failed} test(s) failed`);
    process.exit(1);
}
console.log('\nAll debug_trace_emit_host tests passed');