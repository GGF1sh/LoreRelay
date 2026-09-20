#!/usr/bin/env node
/**
 * Unit tests for tavernCardImporterCore.ts and related T4 hardening.
 * Tests PNG extraction, character book normalization, ID guard, and ReDoS guard.
 * No vscode dependency — uses compiled out/ files directly.
 */

const { extractJsonFromPng, normalizeCharacterBook, MAX_LOREBOOK_ENTRIES, MAX_LOREBOOK_CONTENT_LEN, MAX_LOREBOOK_KEY_LEN, MAX_KEYS_PER_ENTRY } = require('../out/tavernCardImporterCore');
const { matchEntriesAgainstText } = require('../out/lorebookMatcher');
const { isValidCharacterId, resolveCharacterJsonPath } = require('../out/characterId');
const path = require('path');
const os = require('os');

let failed = 0;

function fail(msg) {
    console.error(`FAIL: ${msg}`);
    failed++;
}

function ok(msg) {
    console.log(`OK: ${msg}`);
}

// ---------------------------------------------------------------------------
// PNG helper: builds a minimal PNG with a single chunk
// ---------------------------------------------------------------------------

function buildPngWithChunk(keyword, value, chunkType) {
    const sig = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);

    let chunkData;
    if (chunkType === 'tEXt') {
        const kw = Buffer.from(keyword, 'latin1');
        const sep = Buffer.from([0x00]);
        const val = Buffer.from(value, 'latin1');
        chunkData = Buffer.concat([kw, sep, val]);
    } else {
        // iTEXt: keyword \0 compFlag(0) compMethod(0) lang \0 translated \0 text
        const kw = Buffer.from(keyword, 'utf8');
        const header = Buffer.concat([kw, Buffer.from([0x00, 0x00, 0x00, 0x00, 0x00])]);
        const text = Buffer.from(value, 'utf8');
        chunkData = Buffer.concat([header, text]);
    }

    const lengthBuf = Buffer.allocUnsafe(4);
    lengthBuf.writeUInt32BE(chunkData.length, 0);
    const typeBuf = Buffer.from(chunkType, 'ascii');
    const crc = Buffer.from([0x00, 0x00, 0x00, 0x00]); // fake CRC
    return Buffer.concat([sig, Buffer.concat([lengthBuf, typeBuf, chunkData, crc])]);
}

// ---------------------------------------------------------------------------
// extractJsonFromPng
// ---------------------------------------------------------------------------

{
    const charJson = JSON.stringify({ name: 'Alice', spec: 'chara_card_v1' });
    const b64 = Buffer.from(charJson).toString('base64');
    const png = buildPngWithChunk('chara', b64, 'tEXt');
    const result = extractJsonFromPng(png);
    if (result !== charJson) {
        fail(`tEXt/chara: expected JSON, got: ${result}`);
    } else {
        ok('extractJsonFromPng: tEXt chunk with chara keyword');
    }
}

{
    const charJson = JSON.stringify({ spec: 'chara_card_v3', name: 'Bob' });
    const b64 = Buffer.from(charJson).toString('base64');
    const png = buildPngWithChunk('ccv3', b64, 'tEXt');
    const result = extractJsonFromPng(png);
    if (result !== charJson) {
        fail(`tEXt/ccv3: expected JSON, got: ${result}`);
    } else {
        ok('extractJsonFromPng: tEXt chunk with ccv3 keyword');
    }
}

{
    const png = buildPngWithChunk('other', Buffer.from('hello').toString('base64'), 'tEXt');
    const result = extractJsonFromPng(png);
    if (result !== null) {
        fail(`non-chara keyword should return null, got ${result}`);
    } else {
        ok('extractJsonFromPng: non-chara keyword returns null');
    }
}

{
    const result = extractJsonFromPng(Buffer.from('not a png'));
    if (result !== null) {
        fail('non-PNG should return null');
    } else {
        ok('extractJsonFromPng: non-PNG buffer returns null');
    }
}

{
    const result = extractJsonFromPng(Buffer.from([0x89, 0x50]));
    if (result !== null) {
        fail('short buffer should return null');
    } else {
        ok('extractJsonFromPng: too-short buffer returns null');
    }
}

{
    const result = extractJsonFromPng(Buffer.alloc(0));
    if (result !== null) {
        fail('empty buffer should return null');
    } else {
        ok('extractJsonFromPng: empty buffer returns null');
    }
}

// ---------------------------------------------------------------------------
// normalizeCharacterBook — caps and truncation (P1 fix)
// ---------------------------------------------------------------------------

{
    // Entry count cap
    const entries = Array.from({ length: MAX_LOREBOOK_ENTRIES + 50 }, (_, i) => ({
        id: i,
        keys: ['key'],
        content: 'text',
        enabled: true,
    }));
    const result = normalizeCharacterBook({ entries });
    if (result.length !== MAX_LOREBOOK_ENTRIES) {
        fail(`P1: entry count should be capped at ${MAX_LOREBOOK_ENTRIES}, got ${result.length}`);
    } else {
        ok(`P1: normalizeCharacterBook caps entries at ${MAX_LOREBOOK_ENTRIES}`);
    }
}

{
    // Content length cap
    const longContent = 'x'.repeat(MAX_LOREBOOK_CONTENT_LEN + 500);
    const result = normalizeCharacterBook({ entries: [{ id: 0, keys: ['k'], content: longContent, enabled: true }] });
    if (result.length !== 1 || result[0].content.length !== MAX_LOREBOOK_CONTENT_LEN) {
        fail(`P1: content should be capped at ${MAX_LOREBOOK_CONTENT_LEN}, got ${result[0]?.content?.length}`);
    } else {
        ok(`P1: normalizeCharacterBook caps content at ${MAX_LOREBOOK_CONTENT_LEN} chars`);
    }
}

{
    // Key length cap
    const longKey = 'k'.repeat(MAX_LOREBOOK_KEY_LEN + 100);
    const result = normalizeCharacterBook({ entries: [{ id: 0, keys: [longKey], content: 'text', enabled: true }] });
    if (!result[0] || result[0].keys[0].length !== MAX_LOREBOOK_KEY_LEN) {
        fail(`P1: key should be capped at ${MAX_LOREBOOK_KEY_LEN}, got ${result[0]?.keys[0]?.length}`);
    } else {
        ok(`P1: normalizeCharacterBook caps key length at ${MAX_LOREBOOK_KEY_LEN}`);
    }
}

{
    // Keys per entry cap
    const manyKeys = Array.from({ length: MAX_KEYS_PER_ENTRY + 10 }, (_, i) => `key${i}`);
    const result = normalizeCharacterBook({ entries: [{ id: 0, keys: manyKeys, content: 'text', enabled: true }] });
    if (!result[0] || result[0].keys.length !== MAX_KEYS_PER_ENTRY) {
        fail(`P1: keys per entry should be capped at ${MAX_KEYS_PER_ENTRY}, got ${result[0]?.keys?.length}`);
    } else {
        ok(`P1: normalizeCharacterBook caps keys per entry at ${MAX_KEYS_PER_ENTRY}`);
    }
}

{
    // Object-form entries (keyed by numeric string) are also normalized
    const entries = { '0': { id: 0, keys: ['dragon'], content: 'Dragon lore', enabled: true } };
    const result = normalizeCharacterBook({ entries });
    if (result.length !== 1 || result[0].keys[0] !== 'dragon') {
        fail(`object-form entries should be normalized (got ${result.length} entries)`);
    } else {
        ok('normalizeCharacterBook: object-form entries normalized');
    }
}

{
    // use_regex field preserved
    const result = normalizeCharacterBook({ entries: [{ id: 0, keys: ['/dragon/i'], content: 'Dragon', enabled: true, use_regex: true }] });
    if (!result[0] || result[0].use_regex !== true) {
        fail('use_regex field should be preserved');
    } else {
        ok('normalizeCharacterBook: use_regex field preserved');
    }
}

{
    // insertion_order fallback
    const result = normalizeCharacterBook({ entries: [{ id: 0, keys: ['k'], content: 'c', enabled: true }] });
    if (!result[0] || result[0].insertion_order !== 100) {
        fail(`insertion_order default should be 100, got ${result[0]?.insertion_order}`);
    } else {
        ok('normalizeCharacterBook: insertion_order defaults to 100');
    }
}

// ---------------------------------------------------------------------------
// characterId — meta file ID blocklist (P0 fix)
// ---------------------------------------------------------------------------

{
    const fakeCharDir = path.join(os.tmpdir(), 'chars');
    const reservedIds = ['party', 'dynamic_profiles', 'party_director', 'active_character'];
    for (const id of reservedIds) {
        const result = resolveCharacterJsonPath(fakeCharDir, id);
        if (result !== undefined) {
            fail(`P0: reserved ID "${id}" should be blocked (got ${result})`);
        } else {
            ok(`P0: reserved meta ID "${id}" is blocked by resolveCharacterJsonPath`);
        }
    }
}

{
    const fakeCharDir = path.join(os.tmpdir(), 'chars');
    const result = resolveCharacterJsonPath(fakeCharDir, 'alice');
    if (!result || !result.endsWith('alice.json')) {
        fail(`normal ID "alice" should resolve to alice.json path, got ${result}`);
    } else {
        ok('resolveCharacterJsonPath: normal ID resolves correctly');
    }
}

{
    const fakeCharDir = path.join(os.tmpdir(), 'chars');
    const result = resolveCharacterJsonPath(fakeCharDir, '../game_state');
    if (result !== undefined) {
        fail('path traversal ID should be rejected');
    } else {
        ok('resolveCharacterJsonPath: path traversal ID rejected');
    }
}

// ---------------------------------------------------------------------------
// isValidCharacterId
// ---------------------------------------------------------------------------

{
    const valids = ['alice', 'char_001', 'MyChar-2', 'a'.repeat(64)];
    for (const id of valids) {
        if (!isValidCharacterId(id)) {
            fail(`isValidCharacterId("${id.slice(0, 20)}") should be true`);
        } else {
            ok(`isValidCharacterId valid: "${id.slice(0, 20)}"`);
        }
    }
}

{
    const invalids = ['', 'a'.repeat(65), 'has space', 'dot.name', null, undefined, 42];
    for (const id of invalids) {
        if (isValidCharacterId(id)) {
            fail(`isValidCharacterId("${String(id).slice(0, 20)}") should be false`);
        } else {
            ok(`isValidCharacterId invalid: "${String(id).slice(0, 20)}"`);
        }
    }
}

// ---------------------------------------------------------------------------
// lorebookMatcher — ReDoS guard (P1 fix)
// ---------------------------------------------------------------------------

{
    // Over-length regex pattern: guard must prevent hang even with worst-case input
    const longPattern = '(a+)+'.repeat(50); // 250 chars — over the 200-char limit
    const entries = [{ keys: [longPattern], content: 'DoS test', enabled: true, use_regex: true }];
    const start = Date.now();
    // 'aaaaaaaaa' does NOT contain the literal pattern string, so no match is expected
    const hitsNoMatch = matchEntriesAgainstText(entries, 'aaaaaaaaa', 10);
    const elapsed = Date.now() - start;
    if (elapsed > 1000) {
        fail(`P1 ReDoS guard: over-length regex took ${elapsed}ms (should be <1000ms)`);
    } else {
        ok(`P1 ReDoS guard: over-length regex completes in ${elapsed}ms (no hang)`);
    }
    if (hitsNoMatch.length !== 0) {
        fail(`P1 ReDoS guard: text without literal pattern should not match (got ${hitsNoMatch.length})`);
    } else {
        ok('P1 ReDoS guard: no match when text lacks literal pattern (correct fallback)');
    }

    // Substring fallback matches when text contains the literal key
    const plainLongKey = 'dragon'.repeat(40); // 240 chars — over limit, but still a simple substring
    const entries2 = [{ keys: [plainLongKey], content: 'Long key match', enabled: true, use_regex: true }];
    const hitsMatch = matchEntriesAgainstText(entries2, 'X' + plainLongKey + 'Y', 10);
    if (hitsMatch.length !== 1) {
        fail(`P1 ReDoS guard: substring fallback should match literal key (got ${hitsMatch.length})`);
    } else {
        ok('P1 ReDoS guard: substring fallback matches when text contains literal key');
    }
}

{
    const entries = [{ keys: ['/dragon/i'], content: 'Dragon lore', enabled: true, use_regex: true }];
    const hits = matchEntriesAgainstText(entries, 'A Dragon appears!', 5);
    if (hits.length !== 1) {
        fail(`short valid regex should match (got ${hits.length})`);
    } else {
        ok('valid regex still matches after ReDoS guard');
    }
}

{
    const entries = [{ keys: ['[invalid'], content: 'Fallback', enabled: true, use_regex: true }];
    const hits = matchEntriesAgainstText(entries, 'matching [invalid bracket text', 5);
    if (hits.length !== 1) {
        fail(`invalid regex fallback should match via substring (got ${hits.length})`);
    } else {
        ok('invalid regex falls back to substring match');
    }
}

// ---------------------------------------------------------------------------
// Result
// ---------------------------------------------------------------------------

if (failed > 0) {
    console.error(`\n${failed} test(s) failed.`);
    process.exit(1);
}
console.log('All tavern card importer tests passed.');
