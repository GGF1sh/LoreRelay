/**
 * Unit tests for worldEventLogCore.ts (Living World — v1.4.0)
 * Pure Node.js — no stubs needed (zero vscode/fs imports in the module).
 */

'use strict';

// ---------------------------------------------------------------------------
// Minimal test harness
// ---------------------------------------------------------------------------

let passed = 0;
let failed = 0;

function assert(condition, label) {
    if (condition) {
        passed++;
    } else {
        failed++;
        console.error(`  FAIL: ${label}`);
    }
}

function assertEqual(a, b, label) {
    const ok = JSON.stringify(a) === JSON.stringify(b);
    if (ok) {
        passed++;
    } else {
        failed++;
        console.error(`  FAIL: ${label}\n    expected: ${JSON.stringify(b)}\n    got:      ${JSON.stringify(a)}`);
    }
}

function section(name) {
    console.log(`\n── ${name}`);
}

// ---------------------------------------------------------------------------
// Load module (compiled JS in out/)
// ---------------------------------------------------------------------------

const {
    isValidEventId,
    makeEventId,
    parseWorldChangeEvent,
    parseRecentChanges,
    pruneExpiredEvents,
    mergeRecentChanges,
    makeWorldChangeEvent,
    MAX_RECENT_CHANGES,
    MAX_EVENT_MESSAGE_LEN,
    MAX_EVENT_GM_HINT_LEN,
    MAX_NPC_IDS_PER_EVENT,
    MAX_ID_LEN,
} = require('../out/worldEventLogCore');

// ---------------------------------------------------------------------------
// isValidEventId
// ---------------------------------------------------------------------------

section('isValidEventId');

assert(isValidEventId('wce_1_faction_dark'),   'valid: letters + underscores + digits');
assert(isValidEventId('abc'),                  'valid: short alpha');
assert(isValidEventId('A-B-1'),                'valid: uppercase + hyphens');
assert(isValidEventId('x'.repeat(MAX_ID_LEN)), 'valid: exactly MAX_ID_LEN chars');

assert(!isValidEventId(''),                        'invalid: empty string');
assert(!isValidEventId('x'.repeat(MAX_ID_LEN + 1)),'invalid: over MAX_ID_LEN');
assert(!isValidEventId('has space'),               'invalid: space');
assert(!isValidEventId('has/slash'),               'invalid: slash');
assert(!isValidEventId(123),                       'invalid: number');
assert(!isValidEventId(null),                      'invalid: null');
assert(!isValidEventId(undefined),                 'invalid: undefined');

// ---------------------------------------------------------------------------
// makeEventId
// ---------------------------------------------------------------------------

section('makeEventId');

const id1 = makeEventId(12, 'region', 'Dark Moor');
assert(id1 === 'wce_12_region_dark_moor', `correct id: "${id1}"`);

const id2 = makeEventId(0, 'faction', '!!!Special!!!');
assert(typeof id2 === 'string' && id2.startsWith('wce_0_faction_'), `handles special chars: "${id2}"`);

const id3 = makeEventId(5, 'global', '');
assert(id3 === 'wce_5_global_evt', `empty suffix → "evt" fallback: "${id3}"`);

const longSuffix = 'a'.repeat(80);
const id4 = makeEventId(1, 'npc', longSuffix);
assert(id4.length <= 'wce_1_npc_'.length + 32, `long suffix is capped: "${id4}"`);

// ---------------------------------------------------------------------------
// parseWorldChangeEvent
// ---------------------------------------------------------------------------

section('parseWorldChangeEvent — valid');

const baseEvent = {
    id: 'wce_1_region_r1',
    worldTurn: 1,
    source: 'simulation',
    category: 'region',
    severity: 'warning',
    message: 'The dark moor grows more dangerous.',
};

const parsed = parseWorldChangeEvent(baseEvent);
assert(parsed !== undefined, 'base event parses');
assert(parsed?.id === baseEvent.id, 'id preserved');
assert(parsed?.category === 'region', 'category preserved');
assert(parsed?.severity === 'warning', 'severity preserved');
assert(parsed?.source === 'simulation', 'source preserved');
assert(parsed?.worldTurn === 1, 'worldTurn preserved');

section('parseWorldChangeEvent — optional fields');

const fullEvent = {
    ...baseEvent,
    factionId: 'undead',
    regionId: 'dark_moor',
    locationId: 'bone_citadel',
    npcIds: ['npc_a', 'npc_b'],
    gmHint: 'Undead forces are massing.',
    mapHighlight: true,
    expiresAfterTurns: 3,
};

const fullParsed = parseWorldChangeEvent(fullEvent);
assert(fullParsed?.factionId === 'undead', 'factionId preserved');
assert(fullParsed?.regionId === 'dark_moor', 'regionId preserved');
assert(fullParsed?.locationId === 'bone_citadel', 'locationId preserved');
assert(Array.isArray(fullParsed?.npcIds) && fullParsed.npcIds.length === 2, 'npcIds preserved');
assert(fullParsed?.mapHighlight === true, 'mapHighlight preserved');
assert(fullParsed?.expiresAfterTurns === 3, 'expiresAfterTurns preserved');
assert(typeof fullParsed?.gmHint === 'string', 'gmHint preserved');

section('parseWorldChangeEvent — invalid inputs');

assert(parseWorldChangeEvent(null) === undefined, 'null → undefined');
assert(parseWorldChangeEvent([]) === undefined, 'array → undefined');
assert(parseWorldChangeEvent({ ...baseEvent, id: '' }) === undefined, 'empty id → undefined');
assert(parseWorldChangeEvent({ ...baseEvent, id: 'has space' }) === undefined, 'id with space → undefined');
assert(parseWorldChangeEvent({ ...baseEvent, message: '' }) === undefined, 'empty message → undefined');
assert(parseWorldChangeEvent({ ...baseEvent, category: 'unknown' }) === undefined, 'invalid category → undefined');
assert(parseWorldChangeEvent({ ...baseEvent, severity: 'extreme' }) === undefined, 'invalid severity → undefined');

section('parseWorldChangeEvent — safety caps');

const longMsg = 'x'.repeat(500);
const cappedMsg = parseWorldChangeEvent({ ...baseEvent, message: longMsg });
assert(cappedMsg?.message.length === MAX_EVENT_MESSAGE_LEN, `message capped to ${MAX_EVENT_MESSAGE_LEN}`);

const longHint = 'h'.repeat(1000);
const cappedHint = parseWorldChangeEvent({ ...baseEvent, gmHint: longHint });
assert(cappedHint?.gmHint?.length === MAX_EVENT_GM_HINT_LEN, `gmHint capped to ${MAX_EVENT_GM_HINT_LEN}`);

// npcIds: over cap
const manyNpcs = Array.from({ length: 20 }, (_, i) => `npc_${i}`);
const cappedNpcs = parseWorldChangeEvent({ ...baseEvent, npcIds: manyNpcs });
assert(cappedNpcs?.npcIds?.length === MAX_NPC_IDS_PER_EVENT, `npcIds capped to ${MAX_NPC_IDS_PER_EVENT}`);

// invalid IDs inside npcIds are filtered out
const mixedNpcs = ['valid_npc', 'bad npc', '', 'also_valid'];
const filteredNpcs = parseWorldChangeEvent({ ...baseEvent, npcIds: mixedNpcs });
assert(filteredNpcs?.npcIds?.length === 2, 'invalid npcIds filtered: kept 2 of 4');

// invalid factionId is silently dropped
const badFaction = parseWorldChangeEvent({ ...baseEvent, factionId: 'has space' });
assert(badFaction?.factionId === undefined, 'invalid factionId dropped');

// source defaults to "simulation" when unknown
const unknownSource = parseWorldChangeEvent({ ...baseEvent, source: 'alien' });
assert(unknownSource?.source === 'simulation', 'unknown source falls back to simulation');

// ---------------------------------------------------------------------------
// parseRecentChanges
// ---------------------------------------------------------------------------

section('parseRecentChanges');

const raw = [baseEvent, { ...baseEvent, id: 'wce_2_faction_f1', category: 'faction' }, 'not-an-object'];
const parsed2 = parseRecentChanges(raw);
assert(parsed2.length === 2, 'non-object entries filtered');

assert(parseRecentChanges(null).length === 0, 'null → empty array');
assert(parseRecentChanges('string').length === 0, 'string → empty array');

// ---------------------------------------------------------------------------
// pruneExpiredEvents
// ---------------------------------------------------------------------------

section('pruneExpiredEvents');

const ev1 = { ...baseEvent, id: 'wce_1_region_r1', worldTurn: 1, expiresAfterTurns: 3 }; // expires at turn 4
const ev2 = { ...baseEvent, id: 'wce_2_region_r2', worldTurn: 1, expiresAfterTurns: 5 }; // expires at turn 6
const ev3 = { ...baseEvent, id: 'wce_3_global_g1', worldTurn: 1 };                        // no expiry, kept forever

const parsedEv1 = parseWorldChangeEvent(ev1);
const parsedEv2 = parseWorldChangeEvent(ev2);
const parsedEv3 = parseWorldChangeEvent(ev3);

// At turn 3: ev1 NOT expired (3 < 1+3=4), ev2 NOT expired, ev3 kept
const at3 = pruneExpiredEvents([parsedEv1, parsedEv2, parsedEv3], 3);
assert(at3.length === 3, 'turn 3: all 3 events kept');

// At turn 4: ev1 expires (4 >= 1+3=4)
const at4 = pruneExpiredEvents([parsedEv1, parsedEv2, parsedEv3], 4);
assert(at4.length === 2, 'turn 4: ev1 pruned');
assert(!at4.some(e => e.id === parsedEv1.id), 'ev1 gone');

// At turn 10: ev1 and ev2 both expired; ev3 survives
const at10 = pruneExpiredEvents([parsedEv1, parsedEv2, parsedEv3], 10);
assert(at10.length === 1, 'turn 10: only no-expiry event survives');
assert(at10[0].id === parsedEv3.id, 'ev3 (no expiry) remains');

// Empty input
assert(pruneExpiredEvents([], 5).length === 0, 'empty input returns empty');

// ---------------------------------------------------------------------------
// mergeRecentChanges
// ---------------------------------------------------------------------------

section('mergeRecentChanges');

const a = parseWorldChangeEvent({ ...baseEvent, id: 'wce_1_region_r1' });
const b = parseWorldChangeEvent({ ...baseEvent, id: 'wce_2_faction_f1', category: 'faction' });
const c = parseWorldChangeEvent({ ...baseEvent, id: 'wce_3_global_g1', category: 'global' });

// basic merge
const merged = mergeRecentChanges([a], [b, c]);
assert(merged.length === 3, 'merge: 1 existing + 2 new = 3');

// dedup: same id in both arrays
const merged2 = mergeRecentChanges([a, b], [b, c]);
assert(merged2.length === 3, 'dedup: b appears once');

// FIFO cap
const many = Array.from({ length: 15 }, (_, i) =>
    parseWorldChangeEvent({ ...baseEvent, id: `wce_${i}_region_r${i}` })
);
const capped = mergeRecentChanges(many, [], 10);
assert(capped.length === 10, 'FIFO cap: trimmed to 10');
assert(capped[0].id === many[5].id, 'oldest dropped: first survivor is index 5');

// default cap is MAX_RECENT_CHANGES
const big = Array.from({ length: MAX_RECENT_CHANGES + 5 }, (_, i) =>
    parseWorldChangeEvent({ ...baseEvent, id: `wce_${i}_region_rx${i}` })
);
const capped2 = mergeRecentChanges(big, []);
assert(capped2.length === MAX_RECENT_CHANGES, `default cap: ${MAX_RECENT_CHANGES}`);

// empty merge
assert(mergeRecentChanges([], []).length === 0, 'empty + empty = empty');
assert(mergeRecentChanges([a], []).length === 1, 'existing only');
assert(mergeRecentChanges([], [a]).length === 1, 'incoming only');

// ---------------------------------------------------------------------------
// makeWorldChangeEvent
// ---------------------------------------------------------------------------

section('makeWorldChangeEvent');

const made = makeWorldChangeEvent({
    worldTurn: 5,
    category: 'resource',
    severity: 'warning',
    message: 'Food stores depleted.',
    factionId: 'undead',
    gmHint: 'Undead faction is starving.',
    mapHighlight: false,
    expiresAfterTurns: 4,
});

assert(made.id.startsWith('wce_5_resource_'), `id starts with wce_5_resource_: "${made.id}"`);
assert(made.source === 'simulation', 'default source: simulation');
assert(made.factionId === 'undead', 'factionId set');
assert(made.gmHint === 'Undead faction is starving.', 'gmHint set');
assert(made.mapHighlight === false, 'mapHighlight false');
assert(made.expiresAfterTurns === 4, 'expiresAfterTurns set');

// message clamp
const madeLong = makeWorldChangeEvent({
    worldTurn: 1, category: 'global', severity: 'info',
    message: 'x'.repeat(500),
});
assert(madeLong.message.length === MAX_EVENT_MESSAGE_LEN, 'message clamped by makeWorldChangeEvent');

// invalid factionId silently dropped
const madeBad = makeWorldChangeEvent({
    worldTurn: 1, category: 'faction', severity: 'info',
    message: 'Test.', factionId: 'bad id!',
});
assert(madeBad.factionId === undefined, 'invalid factionId dropped by makeWorldChangeEvent');

// npcIds filtered
const madeNpc = makeWorldChangeEvent({
    worldTurn: 1, category: 'npc', severity: 'info',
    message: 'NPC event.', npcIds: ['valid_npc', 'bad npc', 'also_valid'],
});
assert(madeNpc.npcIds?.length === 2, 'invalid npcIds filtered by makeWorldChangeEvent');

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

console.log(`\n${'─'.repeat(40)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) { process.exit(1); }
