#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const corePath = path.join(root, 'out', 'debugTraceCore.js');
const hostPath = path.join(root, 'out', 'debugTraceHostCore.js');
const emitPath = path.join(root, 'out', 'debugTraceEmitCore.js');

let failed = 0;
function fail(msg) { console.error(`FAIL: ${msg}`); failed++; }
function ok(msg) { console.log(`OK: ${msg}`); }

for (const p of [corePath, hostPath, emitPath]) {
    if (!fs.existsSync(p)) {
        fail(`${p} missing — run npm run compile`);
        process.exit(1);
    }
}

const {
    DEFAULT_DEBUG_TRACE_BUFFER_ENTRIES,
    appendDebugTraceEntries,
    createDebugTraceBuffer,
    partitionDebugTraceStepBundles,
    trimDebugTraceRingBuffer,
    validateDebugTraceLinks,
} = require(corePath);
const {
    buildSimulationStepTraceEntries,
    appendDebugTraceHostEntries,
    resetDebugTraceHostForTests,
    getDebugTraceHostBuffer,
} = require(hostPath);
const { buildFoodCrisisAgencyTraceEntries } = require(emitPath);
const { buildCommercePriceBumpTraceEntries } = require(path.join(root, 'out', 'worldSimCommerceCore.js'));
const { buildFactionConflictTraceEntries } = require(path.join(root, 'out', 'npcRelationshipCore.js'));
const { buildNpcNeedDivergenceTraceEntries } = require(path.join(root, 'out', 'npcBridgeCore.js'));

function foodEvent(turn, id = `wce_${turn}_food`) {
    return {
        id,
        worldTurn: turn,
        source: 'simulator',
        category: 'resource',
        severity: 'critical',
        message: 'Wheat shortage threatens the region.',
    };
}

// 1. Phase A + P1a: no duplicate food_crisis_classifier in combined buffer
{
    resetDebugTraceHostForTests();
    const runId = 'sim_p2_dedup';
    const turn = 12;
    const stepEvents = [foodEvent(turn)];
    const phaseA = buildSimulationStepTraceEntries(runId, { worldTurn: turn }, stepEvents, {
        omitFoodCrisisShallowWhenDeepEmit: true,
    });
    const deep = buildFoodCrisisAgencyTraceEntries({
        runId,
        worldTurn: turn,
        parentTraceId: `trace_step_${turn}`,
        stepEvents,
        agencyInput: {
            forge: {
                commodities: [{ id: 'wheat', name: 'Wheat', basePrice: 10, weight: 1 }],
                markets: [{ locationId: 'farm', commodityIds: ['wheat'], targetStock: 20 }],
                transportKinds: [{ id: 'wagon', name: 'Wagon', capacity: 100, speed: 1 }],
            },
            markets: { farm: { wheat: { stock: 5, priceIndex: 1 } } },
            registry: {
                npc_a: { name: 'A', locationId: 'home', factionId: 'f1' },
            },
            positions: {},
            worldTurn: turn,
            stepEvents,
            maxNamedNpcCount: 10,
        },
        agencyResult: { moves: [], positions: {} },
    });
    appendDebugTraceHostEntries([...phaseA, ...deep]);
    const buf = getDebugTraceHostBuffer();
    const classifiers = buf.entries.filter((e) => e.ruleId === 'food_crisis_classifier');
    const fcScans = buf.entries.filter((e) => e.ruleId === 'isFoodCrisisEvent');
    if (classifiers.length > 0) {
        fail(`Phase A must not emit food_crisis_classifier when deep emit owns classification (${classifiers.length})`);
    } else if (fcScans.length < 1) {
        fail('P1a should emit isFoodCrisisEvent scan rows');
    } else if (!buf.entries.some((e) => e.traceId === `trace_step_${turn}`)) {
        fail('Phase A step anchor must remain');
    } else {
        ok('Phase A/P1a dedup — classifier only in P1a scan rows');
    }
}

// 2. Default buffer size bumped for bulk sim
{
    const buf = createDebugTraceBuffer();
    if (buf.maxEntries !== DEFAULT_DEBUG_TRACE_BUFFER_ENTRIES || buf.maxEntries < 512) {
        fail(`expected default buffer >= 512, got ${buf.maxEntries}`);
    } else {
        ok(`default debug trace buffer is ${buf.maxEntries}`);
    }
}

// 3. Step-bundle partition
{
    const entries = [
        { version: 1, runId: 'r', traceId: 'trace_step_1', subsystem: 'worldSim', phase: 'event', message: 's1', audience: 'internal' },
        { version: 1, runId: 'r', traceId: 'trace_a', parentTraceId: 'trace_step_1', subsystem: 'x', phase: 'event', message: 'a', audience: 'internal' },
        { version: 1, runId: 'r', traceId: 'trace_step_2', subsystem: 'worldSim', phase: 'event', message: 's2', audience: 'internal' },
        { version: 1, runId: 'r', traceId: 'trace_b', parentTraceId: 'trace_step_2', subsystem: 'x', phase: 'event', message: 'b', audience: 'internal' },
    ];
    const bundles = partitionDebugTraceStepBundles(entries);
    if (bundles.length !== 2 || bundles[0].length !== 2 || bundles[1].length !== 2) {
        fail(`step bundle partition: ${JSON.stringify(bundles.map((b) => b.length))}`);
    } else {
        ok('partitionDebugTraceStepBundles splits on trace_step anchors');
    }
}

// 4. Ring trim evicts oldest whole steps — retained chain has no missing_parent
{
    let buffer = createDebugTraceBuffer(64);
    for (let turn = 1; turn <= 20; turn++) {
        const runId = 'sim_bulk';
        const parentTraceId = `trace_step_${turn}`;
        const batch = [
            {
                version: 1,
                runId,
                traceId: parentTraceId,
                worldTurn: turn,
                subsystem: 'worldSim',
                phase: 'event',
                message: `step ${turn}`,
                audience: 'internal',
            },
            {
                version: 1,
                runId,
                traceId: `trace_fc_gate_t${turn}`,
                parentTraceId,
                worldTurn: turn,
                subsystem: 'npcAgency',
                phase: 'decision',
                ruleId: 'food_crisis_gate',
                message: 'gate',
                audience: 'internal',
            },
            {
                version: 1,
                runId,
                traceId: `trace_fc_npc_npc_a_t${turn}`,
                parentTraceId: `trace_fc_gate_t${turn}`,
                worldTurn: turn,
                subsystem: 'npcAgency',
                phase: 'decision',
                message: 'npc',
                audience: 'internal',
            },
            {
                version: 1,
                runId,
                traceId: `trace_fc_effect_npc_a_t${turn}`,
                parentTraceId: `trace_fc_npc_npc_a_t${turn}`,
                worldTurn: turn,
                subsystem: 'npcAgency',
                phase: 'effect',
                message: 'effect',
                audience: 'gm_safe',
            },
        ];
        const result = appendDebugTraceEntries(buffer, batch);
        buffer = result.buffer;
    }
    if (buffer.entries.length > buffer.maxEntries) {
        fail(`buffer length ${buffer.entries.length} exceeds max ${buffer.maxEntries}`);
    }
    const warnings = validateDebugTraceLinks(buffer);
    const missing = warnings.filter((w) => w.code === 'missing_parent');
    if (missing.length > 0) {
        fail(`missing_parent after bulk trim: ${JSON.stringify(missing.slice(0, 3))}`);
    } else {
        ok('step-bundle ring trim retains linked chains (no missing_parent)');
    }
}

// 5. trimDebugTraceRingBuffer pure helper
{
    const entries = [];
    for (let i = 0; i < 10; i++) {
        entries.push({
            version: 1,
            runId: 'r',
            traceId: `trace_step_${i}`,
            subsystem: 'worldSim',
            phase: 'event',
            message: `s${i}`,
            audience: 'internal',
        });
        entries.push({
            version: 1,
            runId: 'r',
            traceId: `child_${i}`,
            parentTraceId: `trace_step_${i}`,
            subsystem: 'x',
            phase: 'event',
            message: `c${i}`,
            audience: 'internal',
        });
    }
    const trimmed = trimDebugTraceRingBuffer(entries, 6);
    if (trimmed.length > 6) {
        fail(`trimDebugTraceRingBuffer should respect limit (got ${trimmed.length})`);
    } else if (!trimmed.some((e) => e.traceId.startsWith('trace_step_'))) {
        fail('trim should keep recent step anchors');
    } else {
        ok('trimDebugTraceRingBuffer enforces limit with step-aware eviction');
    }
}

// 6. buildCommercePriceBumpTraceEntries
{
    const stepEvents = [foodEvent(13)];
    const forge = {
        markets: [{ locationId: 'farm' }]
    };
    const marketsBefore = { farm: { wheat: { priceIndex: 1.0 } } };
    const marketsAfter = { farm: { wheat: { priceIndex: 1.35 } } };

    const entries = buildCommercePriceBumpTraceEntries('run1', 13, forge, marketsBefore, marketsAfter, stepEvents);
    if (entries.length !== 1 || !entries[0].traceId.includes('wheat')) {
        fail('buildCommercePriceBumpTraceEntries failed to trace wheat price bump');
    } else {
        ok('buildCommercePriceBumpTraceEntries traces food crisis price shocks');
    }
}

// 7. buildFactionConflictTraceEntries
{
    const changes = [
        { factionA: 'f1', factionB: 'f2', delta: -10, value: -20, reason: 'faction_conflict', worldTurn: 14 },
        { factionA: 'f1', factionB: 'f1', delta: 5, value: 50, reason: 'faction_kinship', worldTurn: 14 }
    ];
    const names = { f1: { name: 'Faction 1' }, f2: { name: 'Faction 2' } };
    const entries = buildFactionConflictTraceEntries('run1', 14, changes, names);

    if (entries.length !== 2) {
        fail(`buildFactionConflictTraceEntries returned ${entries.length} instead of 2`);
    } else if (entries[0].ruleId !== 'faction_conflict' || entries[1].ruleId !== 'faction_kinship') {
        fail('buildFactionConflictTraceEntries rules do not match');
    } else {
        ok('buildFactionConflictTraceEntries correctly separates conflict and kinship');
    }
}

// 8. buildNpcNeedDivergenceTraceEntries
{
    const regBefore = { npcs: { n1: { name: 'Bob', needs: [{ id: 'need_1', urgency: 50 }] } } };
    const regAfter = { npcs: { n1: { name: 'Bob', needs: [{ id: 'need_1', urgency: 75, description: 'Hungry' }] } } };

    const entries = buildNpcNeedDivergenceTraceEntries('run1', 15, regBefore, regAfter, ['n1']);
    if (entries.length !== 1 || entries[0].decision !== 'need_escalated') {
        fail('buildNpcNeedDivergenceTraceEntries failed on escalated need');
    } else {
        ok('buildNpcNeedDivergenceTraceEntries correctly identifies escalated urgency');
    }
}

if (failed > 0) {
    process.exit(1);
}
console.log('debug trace emit P2: all tests passed.');
