/**
 * Unit tests for visualMemoryCore.ts (Phase 5a — Visual Memory foundation).
 * Pure Node.js — no vscode stubs needed.
 */
'use strict';

let passed = 0;
let failed = 0;

function assert(condition, label) {
    if (condition) { passed++; }
    else { failed++; console.error(`  FAIL: ${label}`); }
}
function assertEqual(a, b, label) {
    const ok = JSON.stringify(a) === JSON.stringify(b);
    if (ok) { passed++; }
    else { failed++; console.error(`  FAIL: ${label}\n    expected: ${JSON.stringify(b)}\n    got:      ${JSON.stringify(a)}`); }
}
function section(name) { console.log(`\n── ${name}`); }

const {
    isValidImageHash,
    makeImageHashKey,
    parseVisualMemoryEntry,
    parseVisualMemory,
    upsertVisualMemoryEntry,
    makeVisualMemoryEntry,
    buildVisualContextSnippet,
    IMAGE_HASH_LENGTH,
    MAX_DESCRIPTION_CHARS,
    MAX_PROMPT_CHARS,
    MAX_TAGS_PER_ENTRY,
    MAX_ENTRIES,
    VISUAL_MEMORY_FORMAT,
} = require('../out/visualMemoryCore');

// ---------------------------------------------------------------------------
// isValidImageHash
// ---------------------------------------------------------------------------

section('isValidImageHash');

assert(isValidImageHash('abcdef0123456789'), 'valid: 16 lower hex chars');
assert(isValidImageHash('0'.repeat(16)),      'valid: all zeros');
assert(isValidImageHash('f'.repeat(16)),      'valid: all f');

assert(!isValidImageHash(''),                 'invalid: empty');
assert(!isValidImageHash('abc'),              'invalid: too short');
assert(!isValidImageHash('a'.repeat(17)),     'invalid: 17 chars');
assert(!isValidImageHash('ABCDEF01234567890'),'invalid: uppercase + too long');
assert(!isValidImageHash('abcdef012345678g'), 'invalid: non-hex char g');
assert(!isValidImageHash(null),               'invalid: null');
assert(!isValidImageHash(12345678),           'invalid: number');

// ---------------------------------------------------------------------------
// makeImageHashKey
// ---------------------------------------------------------------------------

section('makeImageHashKey');

const fullSha = 'e3b0c44298fc1c14' + '9afbf4c8996fb924' + '27ae41e4649b934c' + 'a495991b7852b855';
const key = makeImageHashKey(fullSha);
assert(key === 'e3b0c44298fc1c14', `first 16 chars: "${key}"`);
assert(key.length === IMAGE_HASH_LENGTH, 'length equals IMAGE_HASH_LENGTH');

// ---------------------------------------------------------------------------
// parseVisualMemoryEntry
// ---------------------------------------------------------------------------

section('parseVisualMemoryEntry — valid');

const baseEntry = {
    imageHash: 'abcdef0123456789',
    imagePath: '/ws/output/img001.png',
    description: 'A dark dungeon corridor with flickering torches.',
    analyzedAt: '2026-06-28T00:00:00.000Z',
};

const parsed = parseVisualMemoryEntry(baseEntry);
assert(parsed !== undefined, 'base entry parses');
assertEqual(parsed?.imageHash, baseEntry.imageHash, 'imageHash preserved');
assertEqual(parsed?.imagePath, baseEntry.imagePath, 'imagePath preserved');
assertEqual(parsed?.description, baseEntry.description, 'description preserved');
assertEqual(parsed?.analyzedAt, baseEntry.analyzedAt, 'analyzedAt preserved');

section('parseVisualMemoryEntry — optional fields');

const fullEntry = {
    ...baseEntry,
    worldTurn: 7,
    locationId: 'dark_moor',
    generationPrompt: 'dungeon corridor, dark fantasy',
    tags: ['generated', 'location'],
};

const fullParsed = parseVisualMemoryEntry(fullEntry);
assert(fullParsed?.worldTurn === 7, 'worldTurn preserved');
assertEqual(fullParsed?.locationId, 'dark_moor', 'locationId preserved');
assert(typeof fullParsed?.generationPrompt === 'string', 'generationPrompt preserved');
assert(Array.isArray(fullParsed?.tags), 'tags preserved');
assert(fullParsed?.tags?.length === 2, 'both tags kept');

section('parseVisualMemoryEntry — invalid inputs');

assert(parseVisualMemoryEntry(null) === undefined, 'null → undefined');
assert(parseVisualMemoryEntry([]) === undefined, 'array → undefined');
assert(parseVisualMemoryEntry({ ...baseEntry, imageHash: 'bad' }) === undefined, 'bad hash → undefined');
assert(parseVisualMemoryEntry({ ...baseEntry, imageHash: 'UPPERCASE1234567' }) === undefined, 'uppercase hash → undefined');
assert(parseVisualMemoryEntry({ ...baseEntry, imagePath: '' }) === undefined, 'empty imagePath → undefined');
assert(parseVisualMemoryEntry({ ...baseEntry, description: '' }) === undefined, 'empty description → undefined');
assert(parseVisualMemoryEntry({ ...baseEntry, analyzedAt: 123 }) === undefined, 'non-string analyzedAt → undefined');
assert(parseVisualMemoryEntry({ ...baseEntry, analyzedAt: '' }) === undefined, 'empty analyzedAt → undefined');
assert(parseVisualMemoryEntry({ ...baseEntry, locationId: 'bad id' }) === undefined
    || parseVisualMemoryEntry({ ...baseEntry, locationId: 'bad id' })?.locationId === undefined,
    'invalid locationId (space) not kept');

section('parseVisualMemoryEntry — safety caps');

const longDesc = 'x'.repeat(2000);
const cappedDesc = parseVisualMemoryEntry({ ...baseEntry, description: longDesc });
assert(cappedDesc?.description.length === MAX_DESCRIPTION_CHARS, `description capped to ${MAX_DESCRIPTION_CHARS}`);

const longPrompt = 'p'.repeat(1000);
const cappedPrompt = parseVisualMemoryEntry({ ...baseEntry, generationPrompt: longPrompt });
assert(cappedPrompt?.generationPrompt?.length === MAX_PROMPT_CHARS, `prompt capped to ${MAX_PROMPT_CHARS}`);

// invalid tags filtered
const mixedTags = ['generated', 'invalid_tag', 'location', 'unknown'];
const filteredTags = parseVisualMemoryEntry({ ...baseEntry, tags: mixedTags });
assert(filteredTags?.tags?.length === 2, 'invalid tags filtered: kept 2 of 4');
assert(!filteredTags?.tags?.includes('invalid_tag'), 'invalid_tag not kept');

// over-limit tags
const manyTags = ['generated', 'imported', 'location', 'npc', 'scene', 'other', 'generated'];
const cappedTags = parseVisualMemoryEntry({ ...baseEntry, tags: manyTags });
assert((cappedTags?.tags?.length ?? 0) <= MAX_TAGS_PER_ENTRY, `tags capped to ${MAX_TAGS_PER_ENTRY}`);

// ---------------------------------------------------------------------------
// parseVisualMemory
// ---------------------------------------------------------------------------

section('parseVisualMemory');

const rawMem = {
    format: 'lorerelay-visual-memory/1.0',
    entries: {
        'abcdef0123456789': baseEntry,
        '1234567890abcdef': { ...baseEntry, imageHash: '1234567890abcdef', imagePath: '/img002.png' },
        'BAD_KEY!!!!!!!!': baseEntry,          // invalid key → skipped
        'abc': { ...baseEntry, imageHash: 'abc' }, // invalid entry → skipped
    }
};

const mem = parseVisualMemory(rawMem);
assert(mem.format === VISUAL_MEMORY_FORMAT, 'format normalized');
assert(Object.keys(mem.entries).length === 2, '2 valid entries kept, 2 invalid skipped');

assert(parseVisualMemory(null).entries !== undefined, 'null → empty entries');
assert(parseVisualMemory('string').entries !== undefined, 'string → empty entries');
assert(Object.keys(parseVisualMemory({}).entries).length === 0, '{} → empty entries');

// ---------------------------------------------------------------------------
// upsertVisualMemoryEntry
// ---------------------------------------------------------------------------

section('upsertVisualMemoryEntry');

const e1 = parseVisualMemoryEntry(baseEntry);
const e2 = parseVisualMemoryEntry({ ...baseEntry, imageHash: '1234567890abcdef', imagePath: '/img2.png' });

const memEmpty = { format: VISUAL_MEMORY_FORMAT, entries: {} };
const mem1 = upsertVisualMemoryEntry(memEmpty, e1);
assert(Object.keys(mem1.entries).length === 1, 'upsert into empty: 1 entry');
assert(mem1 !== memEmpty, 'original not mutated');

const mem2 = upsertVisualMemoryEntry(mem1, e2);
assert(Object.keys(mem2.entries).length === 2, 'upsert 2nd entry: 2 entries');
assert(mem1 !== mem2, 'each upsert returns new object');

// update existing key
const updated = { ...e1, description: 'Updated description.' };
const mem3 = upsertVisualMemoryEntry(mem2, updated);
assert(mem3.entries[e1.imageHash].description === 'Updated description.', 'existing entry updated');
assert(Object.keys(mem3.entries).length === 2, 'count unchanged after update');

// eviction at MAX_ENTRIES
const bigMem = { format: VISUAL_MEMORY_FORMAT, entries: {} };
for (let i = 0; i < MAX_ENTRIES; i++) {
    const padded = i.toString(16).padStart(IMAGE_HASH_LENGTH, '0');
    bigMem.entries[padded] = {
        imageHash: padded, imagePath: `/img${i}.png`,
        description: 'desc', analyzedAt: `2026-01-01T00:00:0${(i % 60).toString().padStart(2, '0')}.000Z`,
    };
}
assert(Object.keys(bigMem.entries).length === MAX_ENTRIES, `pre-condition: ${MAX_ENTRIES} entries`);
const evicted = upsertVisualMemoryEntry(bigMem, { ...e2, imageHash: 'aabbccddeeff0011' });
assert(Object.keys(evicted.entries).length === MAX_ENTRIES, 'count stays at MAX_ENTRIES after eviction');

// ---------------------------------------------------------------------------
// makeVisualMemoryEntry
// ---------------------------------------------------------------------------

section('makeVisualMemoryEntry');

const made = makeVisualMemoryEntry({
    imageHash: 'abcdef0123456789',
    imagePath: '/img.png',
    description: 'A vivid scene.',
    worldTurn: 3,
    locationId: 'town_square',
    generationPrompt: 'fantasy town',
    tags: ['generated', 'location'],
});

assert(made.imageHash === 'abcdef0123456789', 'imageHash set');
assert(typeof made.analyzedAt === 'string' && made.analyzedAt.length > 0, 'analyzedAt auto-set');
assert(made.worldTurn === 3, 'worldTurn set');
assert(made.locationId === 'town_square', 'locationId set');

const madeBadLoc = makeVisualMemoryEntry({
    imageHash: 'abcdef0123456789', imagePath: '/img.png',
    description: 'scene', locationId: 'invalid id',
});
assert(madeBadLoc.locationId === undefined, 'invalid locationId omitted by makeVisualMemoryEntry');
assert(made.tags?.includes('generated'), 'tag generated kept');

// description clamped
const madeLong = makeVisualMemoryEntry({
    imageHash: 'abcdef0123456789', imagePath: '/img.png',
    description: 'x'.repeat(2000),
});
assert(madeLong.description.length === MAX_DESCRIPTION_CHARS, 'description clamped by makeVisualMemoryEntry');

// ---------------------------------------------------------------------------
// buildVisualContextSnippet
// ---------------------------------------------------------------------------

section('buildVisualContextSnippet');

const snippet1 = buildVisualContextSnippet(e1);
assert(snippet1.startsWith('[Scene]:'), 'no locationId → no @ suffix');
assert(snippet1.includes(baseEntry.description.slice(0, 50)), 'description included');

const e1WithLoc = { ...e1, locationId: 'dark_moor' };
const snippet2 = buildVisualContextSnippet(e1WithLoc);
assert(snippet2.startsWith('[Scene @dark_moor]:'), 'locationId → @ suffix');

// long description clamped
const longDescEntry = { ...e1, description: 'x'.repeat(500) };
const snippet3 = buildVisualContextSnippet(longDescEntry);
assert(snippet3.length < 400, 'snippet length bounded');

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

console.log(`\n${'─'.repeat(40)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) { process.exit(1); }
