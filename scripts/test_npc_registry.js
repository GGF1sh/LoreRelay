#!/usr/bin/env node
/**
 * Unit tests for npcRegistryCore.ts validators and npcRegistry.ts parsers.
 * Uses a vscode stub for npcRegistry.ts — requires: npm run compile.
 */
const path = require('path');
const Module = require('module');

// Stub vscode and file I/O for npcRegistry.ts import chain
const origRequire = Module.prototype.require;
Module.prototype.require = function (id) {
    if (id === 'vscode') {
        return { window: { showErrorMessage() {} } };
    }
    if (id === 'fs') {
        return {
            existsSync: () => false,
            readFileSync: () => '{}',
            statSync: () => ({ mtimeMs: 0 }),
            writeFileSync: () => {},
            mkdirSync: () => {}
        };
    }
    return origRequire.apply(this, arguments);
};

let npcRegistryCore, parseNpcMemoryUpdatesFromGameState, parseNpcRegistry;
try {
    npcRegistryCore = require('../out/npcRegistryCore');
    ({ parseNpcMemoryUpdatesFromGameState, parseNpcRegistry } = require('../out/npcRegistry'));
} finally {
    Module.prototype.require = origRequire;
}

const {
    isValidMood,
    isValidEmotionalWeight,
    isValidNeedType,
    clampDispositionValue,
    defaultDisposition
} = npcRegistryCore;

let failed = 0;

function fail(msg) {
    console.error(`FAIL: ${msg}`);
    failed++;
}

function ok(msg) {
    console.log(`OK: ${msg}`);
}

// ---------------------------------------------------------------------------
// isValidMood
// ---------------------------------------------------------------------------

const validMoods = ['happy', 'worried', 'angry', 'sad', 'neutral', 'excited', 'fearful'];
for (const m of validMoods) {
    if (!isValidMood(m)) { fail(`isValidMood("${m}") should be true`); } else { ok(`isValidMood("${m}")`); }
}

const invalidMoods = ['', 'content', 'ecstatic', null, 42, undefined];
for (const m of invalidMoods) {
    if (isValidMood(m)) { fail(`isValidMood(${JSON.stringify(m)}) should be false`); } else { ok(`isValidMood(${JSON.stringify(m)}) → false`); }
}

// ---------------------------------------------------------------------------
// isValidEmotionalWeight
// ---------------------------------------------------------------------------

const validWeights = ['positive', 'negative', 'neutral', 'suspicious'];
for (const w of validWeights) {
    if (!isValidEmotionalWeight(w)) { fail(`isValidEmotionalWeight("${w}") should be true`); } else { ok(`isValidEmotionalWeight("${w}")`); }
}

if (isValidEmotionalWeight('joyful')) { fail('isValidEmotionalWeight("joyful") should be false'); } else { ok('isValidEmotionalWeight("joyful") → false'); }

// ---------------------------------------------------------------------------
// isValidNeedType
// ---------------------------------------------------------------------------

const validNeedTypes = ['quest', 'emotional', 'material', 'information'];
for (const t of validNeedTypes) {
    if (!isValidNeedType(t)) { fail(`isValidNeedType("${t}") should be true`); } else { ok(`isValidNeedType("${t}")`); }
}

if (isValidNeedType('financial')) { fail('isValidNeedType("financial") should be false'); } else { ok('isValidNeedType("financial") → false'); }

// ---------------------------------------------------------------------------
// clampDispositionValue
// ---------------------------------------------------------------------------

if (clampDispositionValue(-10) !== 0) { fail('clamp below 0 → 0'); } else { ok('clamp below 0 → 0'); }
if (clampDispositionValue(110) !== 100) { fail('clamp above 100 → 100'); } else { ok('clamp above 100 → 100'); }
if (clampDispositionValue(50) !== 50) { fail('clamp in-range → same'); } else { ok('clamp in-range preserved'); }
if (clampDispositionValue(0) !== 0) { fail('clamp 0 → 0'); } else { ok('clamp 0 → 0'); }
if (clampDispositionValue(100) !== 100) { fail('clamp 100 → 100'); } else { ok('clamp 100 → 100'); }
if (clampDispositionValue(50.7) !== 51) { fail('clamp rounds to nearest'); } else { ok('clamp rounds to nearest integer'); }
if (clampDispositionValue('not_a_number', 30) !== 30) { fail('non-number → fallback'); } else { ok('non-number → fallback'); }
if (clampDispositionValue(NaN, 25) !== 25) { fail('NaN → fallback'); } else { ok('NaN → fallback'); }

// ---------------------------------------------------------------------------
// defaultDisposition
// ---------------------------------------------------------------------------

const def = defaultDisposition();
if (def.playerTrust !== 50) { fail('defaultDisposition playerTrust = 50'); } else { ok('defaultDisposition playerTrust = 50'); }
if (def.playerRomance !== 0) { fail('defaultDisposition playerRomance = 0'); } else { ok('defaultDisposition playerRomance = 0'); }
if (def.playerFear !== 0) { fail('defaultDisposition playerFear = 0'); } else { ok('defaultDisposition playerFear = 0'); }
if (def.mood !== 'neutral') { fail('defaultDisposition mood = "neutral"'); } else { ok('defaultDisposition mood = "neutral"'); }
if (def.lastInteractionTurn !== 0) { fail('defaultDisposition lastInteractionTurn = 0'); } else { ok('defaultDisposition lastInteractionTurn = 0'); }

// ---------------------------------------------------------------------------
// parseNpcMemoryUpdatesFromGameState
// ---------------------------------------------------------------------------

const emptyResult = parseNpcMemoryUpdatesFromGameState(null);
if (!Array.isArray(emptyResult) || emptyResult.length !== 0) { fail('null input → []'); } else { ok('null input → []'); }

const arrayResult = parseNpcMemoryUpdatesFromGameState([]);
if (!Array.isArray(arrayResult) || arrayResult.length !== 0) { fail('empty array input → []'); } else { ok('empty array → []'); }

const withMissing = parseNpcMemoryUpdatesFromGameState([
    { npcId: 'elder', dispositionDelta: { playerTrust: 10 }, newMemory: { content: 'Player helped', emotionalWeight: 'positive', turn: 5, tags: ['trust'] } },
    { dispositionDelta: { playerTrust: 5 } },  // no npcId → drop
    null,                                        // null → drop
    { npcId: '' }                               // empty npcId → drop
]);

if (withMissing.length !== 1) {
    fail(`should parse 1 valid update, got ${withMissing.length}`);
} else {
    ok('drops updates without valid npcId');
}
if (withMissing[0].npcId !== 'elder') {
    fail('npcId preserved');
} else {
    ok('npcId preserved in update');
}
if (!withMissing[0].dispositionDelta || withMissing[0].dispositionDelta.playerTrust !== 10) {
    fail('dispositionDelta preserved');
} else {
    ok('dispositionDelta preserved');
}
if (!withMissing[0].newMemory || withMissing[0].newMemory.content !== 'Player helped') {
    fail('newMemory preserved');
} else {
    ok('newMemory preserved');
}

// needUpdates
const withNeeds = parseNpcMemoryUpdatesFromGameState([{
    npcId: 'guard',
    needUpdates: [{ id: 'need1', urgencyDelta: 10 }, { id: 'need2', resolved: true }]
}]);
if (!withNeeds[0].needUpdates || withNeeds[0].needUpdates.length !== 2) {
    fail('needUpdates array preserved');
} else {
    ok('needUpdates array preserved');
}

// ---------------------------------------------------------------------------
// parseNpcRegistry — portraitImagePath (Phase 5d)
// ---------------------------------------------------------------------------

{
    const reg = parseNpcRegistry({
        npcs: {
            guard: {
                name: 'Guard',
                disposition: { playerTrust: 50, playerRomance: 0, playerFear: 0, mood: 'neutral', lastInteractionTurn: 0 },
                needs: [],
                memories: [],
                portraitImagePath: 'C:\\ws\\portraits\\guard.png',
            },
        },
    });
    if (reg.npcs.guard?.portraitImagePath !== 'C:\\ws\\portraits\\guard.png') {
        fail('portraitImagePath should parse from registry JSON');
    } else {
        ok('portraitImagePath parsed');
    }
}

// ---------------------------------------------------------------------------
// Result
// ---------------------------------------------------------------------------

if (failed > 0) {
    process.exit(1);
}
console.log('All NPC registry tests passed.');
