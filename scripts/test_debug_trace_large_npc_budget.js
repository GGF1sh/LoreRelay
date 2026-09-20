#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const emitPath = path.join(root, 'out', 'debugTraceEmitCore.js');
const agencyPath = path.join(root, 'out', 'npcAgencyCore.js');

let failed = 0;
function fail(msg) { console.error(`FAIL: ${msg}`); failed++; }
function ok(msg) { console.log(`OK: ${msg}`); }

for (const p of [emitPath, agencyPath]) {
    if (!fs.existsSync(p)) {
        console.error(`FAIL: ${p} missing — run npm run compile`);
        process.exit(1);
    }
}

const {
    MAX_DEEP_EMIT_ENTRIES_PER_TICK,
    buildFoodCrisisAgencyTraceEntries,
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

const bigRegistry = {};
for (let i = 0; i < 5000; i++) {
    bigRegistry[`npc_${i}`] = {
        name: `Npc${i}`,
        locationId: 'home',
        factionId: 'faction_merchants',
    };
}

const stepEvents = [{
    id: 'wce_food_mass',
    worldTurn: 20,
    category: 'resource',
    severity: 'warning',
    message: 'Regional food crisis — wheat reserves depleted',
    factionId: 'faction_merchants',
}];

const agencyInput = {
    forge,
    markets,
    registry: bigRegistry,
    positions: {},
    worldTurn: 20,
    stepEvents,
    maxNamedNpcCount: 5000,
};
const agencyResult = reactNpcsToWorld(agencyInput);

const entries = buildFoodCrisisAgencyTraceEntries({
    runId: 'sim_large',
    worldTurn: 20,
    parentTraceId: 'trace_step_20',
    stepEvents,
    agencyInput,
    agencyResult,
    maxNpcTraces: 5000,
});

if (entries.length > MAX_DEEP_EMIT_ENTRIES_PER_TICK) {
    fail(`entry count ${entries.length} exceeds cap ${MAX_DEEP_EMIT_ENTRIES_PER_TICK}`);
} else {
    ok(`large NPC registry stays within ${MAX_DEEP_EMIT_ENTRIES_PER_TICK} entries`);
}

const effects = entries.filter((e) => e.phase === 'effect');
if (agencyResult.moves.some((m) => m.reason === 'food_crisis_buy_wheat') && effects.length === 0) {
    fail('actual food-crisis effects must survive budget when moves exist');
} else if (effects.length > 0) {
    ok('effect rows preserved under large NPC budget');
} else {
    ok('no effect rows when agency produced no food-crisis moves');
}

const decisions = entries.filter((e) => e.phase === 'decision' && e.traceId.startsWith('trace_fc_npc_'));
if (decisions.length > 10) {
    fail(`decision rows should be capped (got ${decisions.length})`);
} else {
    ok('decision rows capped despite 5000 NPC registry');
}

if (failed > 0) {
    console.error(`\n${failed} test(s) failed`);
    process.exit(1);
}
console.log('\nAll debug_trace_large_npc_budget tests passed');