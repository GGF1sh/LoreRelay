#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const emitPath = path.join(root, 'out', 'debugTraceEmitCore.js');
const agencyPath = path.join(root, 'out', 'npcAgencyCore.js');
const sourcePath = path.join(root, 'src', 'debugTraceEmitCore.ts');

let failed = 0;
function fail(msg) { console.error(`FAIL: ${msg}`); failed++; }
function ok(msg) { console.log(`OK: ${msg}`); }

for (const p of [emitPath, agencyPath]) {
    if (!fs.existsSync(p)) {
        fail(`${p} missing — run npm run compile`);
        process.exit(1);
    }
}

const {
    MAX_DEEP_EMIT_ENTRIES_PER_TICK,
    buildFoodCrisisAgencyTraceEntries,
    shouldEmitDeepDebugTrace,
} = require(emitPath);
const { reactNpcsToWorld } = require(agencyPath);

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

function baseInput(overrides = {}) {
    const worldTurn = overrides.worldTurn ?? 5;
    const stepEvents = overrides.stepEvents ?? [];
    const positions = overrides.positions ?? {};
    const reg = overrides.registry ?? registry;
    const agencyInput = {
        forge,
        markets,
        registry: reg,
        positions,
        worldTurn,
        stepEvents,
        maxNamedNpcCount: overrides.maxNamedNpcCount ?? 10,
    };
    const agencyResult = reactNpcsToWorld(agencyInput);
    return {
        runId: 'sim_test_1',
        worldTurn,
        parentTraceId: `trace_step_${worldTurn}`,
        stepEvents,
        agencyInput,
        agencyResult,
        ...overrides,
    };
}

function findEntry(entries, traceId) {
    return entries.find((e) => e.traceId === traceId);
}

// 1. Faction warning → gate_closed, no NPC/effect rows
{
    const entries = buildFoodCrisisAgencyTraceEntries(baseInput({
        worldTurn: 5,
        stepEvents: [{
            id: 'wce_5_faction_warn',
            worldTurn: 5,
            category: 'faction',
            severity: 'warning',
            message: 'Merchants and Smiths relations soured',
            factionId: 'faction_merchants',
        }],
    }));
    const gate = findEntry(entries, 'trace_fc_gate_t5');
    if (!gate || gate.decision !== 'gate_closed') {
        fail(`faction warning should gate_closed: ${JSON.stringify(gate)}`);
    } else if (entries.some((e) => e.traceId.startsWith('trace_fc_npc_'))) {
        fail('faction warning should not emit per-NPC rows');
    } else if (entries.some((e) => e.phase === 'effect')) {
        fail('faction warning should not emit effect rows');
    } else {
        ok('faction warning → gate_closed, no NPC/effect');
    }
}

// 2. Resource + food keyword → matched → move_scheduled → gm_safe effect
{
    const entries = buildFoodCrisisAgencyTraceEntries(baseInput({
        worldTurn: 6,
        stepEvents: [{
            id: 'wce_6_food',
            worldTurn: 6,
            category: 'resource',
            severity: 'warning',
            message: 'Merchants: 食料が底をついた',
            factionId: 'faction_merchants',
        }],
    }));
    const scan = findEntry(entries, 'trace_fc_scan_wce_6_food');
    const gate = findEntry(entries, 'trace_fc_gate_t6');
    const npc = findEntry(entries, 'trace_fc_npc_npc_elda_t6');
    const effect = findEntry(entries, 'trace_fc_effect_npc_elda_t6');
    if (!scan || scan.decision !== 'matched') {
        fail('food crisis scan should be matched');
    } else if (!gate || gate.decision !== 'gate_open') {
        fail('food crisis should gate_open');
    } else if (!npc || npc.decision !== 'move_scheduled') {
        fail(`food crisis NPC should move_scheduled: ${JSON.stringify(npc)}`);
    } else if (!effect || effect.audience !== 'gm_safe' || effect.phase !== 'effect') {
        fail(`food crisis effect should be gm_safe: ${JSON.stringify(effect)}`);
    } else {
        ok('resource + food keyword → matched → move_scheduled → gm_safe effect');
    }
}

// 3. Resource without food keyword → not_matched
{
    const entries = buildFoodCrisisAgencyTraceEntries(baseInput({
        worldTurn: 7,
        stepEvents: [{
            id: 'wce_7_mana',
            worldTurn: 7,
            category: 'resource',
            severity: 'warning',
            message: 'Mana reserves low',
        }],
    }));
    const scan = findEntry(entries, 'trace_fc_scan_wce_7_mana');
    const gate = findEntry(entries, 'trace_fc_gate_t7');
    if (!scan || scan.decision !== 'not_matched') {
        fail('mana low should not_matched scan');
    } else if (!gate || gate.decision !== 'gate_closed') {
        fail('mana low should gate_closed');
    } else {
        ok('resource without food keyword → not_matched');
    }
}

// 4. NPC in transit → skipped_in_transit
{
    const entries = buildFoodCrisisAgencyTraceEntries(baseInput({
        worldTurn: 8,
        positions: {
            npc_elda: { locationId: 'away', arrivesTurn: 99, reason: 'in_transit' },
        },
        stepEvents: [{
            id: 'wce_8_food',
            worldTurn: 8,
            category: 'resource',
            severity: 'warning',
            message: 'food depleted',
        }],
    }));
    const npc = findEntry(entries, 'trace_fc_npc_npc_elda_t8');
    if (!npc || npc.decision !== 'skipped_in_transit') {
        fail(`in transit NPC should skipped_in_transit: ${JSON.stringify(npc)}`);
    } else if (entries.some((e) => e.traceId === 'trace_fc_effect_npc_elda_t8')) {
        fail('in transit NPC should not have effect row');
    } else {
        ok('NPC in transit → skipped_in_transit');
    }
}

// 5. NPC without factionId → skipped_no_faction
{
    const entries = buildFoodCrisisAgencyTraceEntries(baseInput({
        worldTurn: 9,
        registry: {
            npc_wanderer: { name: 'Wanderer', locationId: 'home' },
        },
        stepEvents: [{
            id: 'wce_9_food',
            worldTurn: 9,
            category: 'resource',
            severity: 'warning',
            message: 'wheat shortage',
        }],
    }));
    const npc = findEntry(entries, 'trace_fc_npc_npc_wanderer_t9');
    if (!npc || npc.decision !== 'skipped_no_faction') {
        fail(`no faction NPC should skipped_no_faction: ${JSON.stringify(npc)}`);
    } else {
        ok('NPC without factionId → skipped_no_faction');
    }
}

// 6. Duplicate event id in stepEvents → single scan row
{
    const ev = {
        id: 'wce_dup',
        worldTurn: 10,
        category: 'faction',
        severity: 'warning',
        message: 'diplomatic tension',
    };
    const entries = buildFoodCrisisAgencyTraceEntries(baseInput({
        worldTurn: 10,
        stepEvents: [ev, ev],
    }));
    const scans = entries.filter((e) => e.traceId === 'trace_fc_scan_wce_dup');
    if (scans.length !== 1) {
        fail(`duplicate event id should produce one scan row (got ${scans.length})`);
    } else {
        ok('duplicate event id → single scan row');
    }
}

// 7. Empty stepEvents → gate_closed, no scan rows
{
    const entries = buildFoodCrisisAgencyTraceEntries(baseInput({
        worldTurn: 11,
        stepEvents: [],
    }));
    const gate = findEntry(entries, 'trace_fc_gate_t11');
    if (entries.some((e) => e.phase === 'query')) {
        fail('empty stepEvents should not emit scan rows');
    } else if (!gate || gate.decision !== 'gate_closed') {
        fail('empty stepEvents should gate_closed');
    } else {
        ok('empty stepEvents → gate_closed, no scans');
    }
}

// 8. Source must not reference recentChanges
{
    const source = fs.readFileSync(sourcePath, 'utf-8');
    if (/\brecentChanges\b/.test(source)) {
        fail('debugTraceEmitCore must not reference recentChanges');
    } else if (/\bmessageHasFoodKeyword\b/.test(source)) {
        fail('debugTraceEmitCore must use evaluateFoodCrisisEvent canonical helper');
    } else {
        ok('emit core uses canonical food crisis evaluation');
    }
}

// 9. Matched events prioritized in scan budget when many events exist
{
    const manyEvents = [];
    for (let i = 0; i < 12; i++) {
        manyEvents.push({
            id: `wce_noise_${i}`,
            worldTurn: 14,
            category: 'faction',
            severity: 'warning',
            message: 'diplomatic tension',
        });
    }
    manyEvents.push({
        id: 'wce_real_food',
        worldTurn: 14,
        category: 'resource',
        severity: 'warning',
        message: 'wheat shortage',
    });
    const entries = buildFoodCrisisAgencyTraceEntries(baseInput({
        worldTurn: 14,
        stepEvents: manyEvents,
    }));
    const scan = findEntry(entries, 'trace_fc_scan_wce_real_food');
    const gate = findEntry(entries, 'trace_fc_gate_t14');
    if (!scan || scan.decision !== 'matched') {
        fail('matched food event beyond first 8 should appear in scan budget');
    } else if (!gate?.conditions?.some((c) => c.label.includes('omitted'))) {
        fail('gate should report omitted scan count when events overflow budget');
    } else {
        ok('matched events prioritized; omitted count surfaced on gate');
    }
}

// 10. Per-tick entry count ≤ 24
{
    const manyEvents = [];
    for (let i = 0; i < 20; i++) {
        manyEvents.push({
            id: `wce_bulk_${i}`,
            worldTurn: 12,
            category: i % 2 === 0 ? 'resource' : 'faction',
            severity: 'warning',
            message: i % 2 === 0 ? 'food crisis wheat' : 'faction tension',
        });
    }
    const bigRegistry = {};
    for (let i = 0; i < 15; i++) {
        bigRegistry[`npc_${i}`] = { name: `Npc${i}`, locationId: 'home', factionId: 'faction_a' };
    }
    const entries = buildFoodCrisisAgencyTraceEntries(baseInput({
        worldTurn: 12,
        stepEvents: manyEvents,
        registry: bigRegistry,
        maxNpcTraces: 15,
    }));
    if (entries.length > MAX_DEEP_EMIT_ENTRIES_PER_TICK) {
        fail(`entry count ${entries.length} exceeds cap ${MAX_DEEP_EMIT_ENTRIES_PER_TICK}`);
    } else {
        ok('per-tick entry count stays bounded');
    }
}

// 11. Deterministic order
{
    const input = baseInput({
        worldTurn: 13,
        stepEvents: [{
            id: 'wce_13_food',
            worldTurn: 13,
            category: 'resource',
            severity: 'warning',
            message: 'food shortage',
        }],
    });
    const a = JSON.stringify(buildFoodCrisisAgencyTraceEntries(input));
    const b = JSON.stringify(buildFoodCrisisAgencyTraceEntries(input));
    if (a !== b) {
        fail('identical inputs should produce identical entry arrays');
    } else {
        ok('deterministic entry order');
    }
}

// 12. Malformed input → [], no throw
{
    const badInputs = [null, undefined, {}, { runId: '' }, { runId: 'x', worldTurn: NaN }];
    let threw = false;
    for (const bad of badInputs) {
        try {
            const result = buildFoodCrisisAgencyTraceEntries(bad);
            if (!Array.isArray(result)) {
                fail('malformed input should return array');
                break;
            }
        } catch {
            threw = true;
            break;
        }
    }
    if (threw) {
        fail('malformed input should not throw');
    } else {
        ok('malformed input → [], no throw');
    }
}

// 13. No forbidden imports in source
{
    const source = fs.readFileSync(sourcePath, 'utf-8');
    const forbidden = ['vscode', 'writeJsonAtomic', 'statePatch'];
    for (const token of forbidden) {
        if (new RegExp(`\\b${token}\\b`).test(source)) {
            fail(`debugTraceEmitCore must not reference forbidden token: ${token}`);
        }
    }
    if (/\bimport\b.*\bfs\b/.test(source) || /\brequire\s*\(\s*['"]fs['"]\s*\)/.test(source)) {
        fail('debugTraceEmitCore must not import fs');
    } else {
        ok('emit core has no forbidden imports');
    }
}

// shouldEmitDeepDebugTrace helper
{
    if (!shouldEmitDeepDebugTrace({ bulkWorldSimDebug: false, debugScenarioActive: false })) {
        ok('shouldEmitDeepDebugTrace false when both flags off');
    } else {
        fail('shouldEmitDeepDebugTrace should be false when both off');
    }
    if (shouldEmitDeepDebugTrace({ bulkWorldSimDebug: true, debugScenarioActive: false })
        && shouldEmitDeepDebugTrace({ bulkWorldSimDebug: false, debugScenarioActive: true })) {
        ok('shouldEmitDeepDebugTrace true when either flag on');
    } else {
        fail('shouldEmitDeepDebugTrace should be true when either flag on');
    }
}

if (failed > 0) {
    console.error(`\n${failed} test(s) failed`);
    process.exit(1);
}
console.log('\nAll debug_trace_emit_core tests passed');