#!/usr/bin/env node
/**
 * Unit tests for the lorebook matching engine (matchEntriesAgainstText).
 * No vscode dependency — loads out/lorebookMatcher.js directly.
 * Requires: npm run compile
 */
const path = require('path');
const fs = require('fs');

const root = path.join(__dirname, '..');
let failed = 0;

function fail(msg) {
    console.error(`FAIL: ${msg}`);
    failed++;
}

function ok(msg) {
    console.log(`OK: ${msg}`);
}

function assertEqual(actual, expected, label) {
    const a = JSON.stringify(actual);
    const e = JSON.stringify(expected);
    if (a !== e) {
        fail(`${label}: got ${a}, expected ${e}`);
        return false;
    }
    ok(label);
    return true;
}

const matcherPath = path.join(root, 'out', 'lorebookMatcher.js');
if (!fs.existsSync(matcherPath)) {
    fail('out/lorebookMatcher.js missing — run npm run compile first');
    process.exit(1);
}

const { matchEntriesAgainstText } = require(matcherPath);

// ──────────────────────────────────────────────
// Fixtures
// ──────────────────────────────────────────────
const entries = [
    {
        id: 'e1',
        keys: ['dragon'],
        content: 'Dragons are ancient beasts.',
        comment: 'Dragon lore',
        priority: 10,
        insertion_order: 10
    },
    {
        id: 'e2',
        keys: ['sword', 'blade'],
        content: 'The sword is magical.',
        comment: 'Sword lore',
        priority: 5,
        insertion_order: 5
    },
    {
        id: 'e3',
        keys: ['castle'],
        content: 'The castle is haunted.',
        comment: 'Castle lore',
        priority: 20,
        insertion_order: 20
    },
    {
        id: 'e4',
        keys: ['/^ancient/i'],
        content: 'Ancient ruins abound.',
        comment: 'Ancient ruins (regex)',
        use_regex: true,
        priority: 15,
        insertion_order: 15
    },
    {
        id: 'e5',
        keys: ['magic'],
        secondary_keys: ['scroll'],
        content: 'Magic scrolls are rare.',
        comment: 'Magic scroll (AND)',
        priority: 8,
        insertion_order: 8
    },
    {
        id: 'e6',
        keys: ['tavern'],
        content: 'The tavern is lively.',
        comment: 'Tavern lore',
        enabled: false,
        priority: 1,
        insertion_order: 1
    }
];

// ──────────────────────────────────────────────
// 1. Plain substring match
// ──────────────────────────────────────────────
{
    const result = matchEntriesAgainstText(entries, 'I see a dragon ahead.', 10);
    const ids = result.map((e) => e.id);
    if (!ids.includes('e1')) {
        fail('substring: dragon entry should match');
    } else {
        ok('substring: dragon matches');
    }
    if (ids.includes('e6')) {
        fail('substring: disabled entry e6 must not match (enabled:false should be pre-filtered)');
    } else {
        ok('substring: e6 (enabled:false) not in result (pre-filtered by caller)');
    }
}

// ──────────────────────────────────────────────
// 2. Multiple key OR match
// ──────────────────────────────────────────────
{
    const result = matchEntriesAgainstText(entries, 'I pick up the blade.', 10);
    const ids = result.map((e) => e.id);
    if (!ids.includes('e2')) {
        fail('OR keys: blade should match e2 (keys: ["sword","blade"])');
    } else {
        ok('OR keys: blade matches e2');
    }
}

// ──────────────────────────────────────────────
// 3. Case insensitivity (substring)
// ──────────────────────────────────────────────
{
    const result = matchEntriesAgainstText(entries, 'The DRAGON roars.', 10);
    const ids = result.map((e) => e.id);
    if (!ids.includes('e1')) {
        fail('case-insensitive: DRAGON should match dragon entry');
    } else {
        ok('case-insensitive: DRAGON matches');
    }
}

// ──────────────────────────────────────────────
// 4. Regex key match (use_regex: true)
// ──────────────────────────────────────────────
{
    const result = matchEntriesAgainstText(entries, 'Ancient temple discovered.', 10);
    const ids = result.map((e) => e.id);
    if (!ids.includes('e4')) {
        fail('regex: /^ancient/i should match "Ancient temple discovered."');
    } else {
        ok('regex: /^ancient/i matches at start');
    }
}

{
    const result = matchEntriesAgainstText(entries, 'The ancient ruins are nearby.', 10);
    const ids = result.map((e) => e.id);
    if (ids.includes('e4')) {
        fail('regex: /^ancient/i should NOT match mid-sentence "the ancient ruins"');
    } else {
        ok('regex: /^ancient/i does not match non-start position');
    }
}

// ──────────────────────────────────────────────
// 5. Regex — bare pattern (no /slashes/)
// ──────────────────────────────────────────────
{
    const bareRegexEntries = [
        {
            id: 'rx1',
            keys: ['drag(on|ons?)'],
            content: 'Dragons lore',
            use_regex: true
        }
    ];
    const r1 = matchEntriesAgainstText(bareRegexEntries, 'Three dragons appeared.', 5);
    if (!r1.map((e) => e.id).includes('rx1')) {
        fail('bare regex: drag(on|ons?) should match "dragons"');
    } else {
        ok('bare regex: drag(on|ons?) matches');
    }
    const r2 = matchEntriesAgainstText(bareRegexEntries, 'A wizard appeared.', 5);
    if (r2.length > 0) {
        fail('bare regex: should not match unrelated text');
    } else {
        ok('bare regex: no false positive');
    }
}

// ──────────────────────────────────────────────
// 6. Malformed regex falls back to substring
// ──────────────────────────────────────────────
{
    const badRegexEntries = [
        {
            id: 'bad',
            keys: ['[invalid regex('],
            content: 'Bad pattern',
            use_regex: true
        }
    ];
    // Should not throw; fallback to substring
    let threw = false;
    try {
        const result = matchEntriesAgainstText(badRegexEntries, '[invalid regex(', 5);
        if (!result.map((e) => e.id).includes('bad')) {
            fail('malformed regex fallback: substring fallback should still match literal text');
        } else {
            ok('malformed regex fallback: no throw, matches literal');
        }
    } catch (e) {
        threw = true;
        fail(`malformed regex: threw exception — ${e.message}`);
    }
    if (!threw) {
        // already reported above
    }
}

// ──────────────────────────────────────────────
// 7. Secondary keys — AND logic
// ──────────────────────────────────────────────
{
    // primary="magic" AND secondary="scroll" → match
    const hit = matchEntriesAgainstText(entries, 'A magic scroll lies here.', 10);
    if (!hit.map((e) => e.id).includes('e5')) {
        fail('secondary keys: magic+scroll should match e5');
    } else {
        ok('secondary keys: magic+scroll matches e5');
    }

    // primary="magic" but secondary="scroll" absent → no match for e5
    const miss = matchEntriesAgainstText(entries, 'A magic potion here.', 10);
    if (miss.map((e) => e.id).includes('e5')) {
        fail('secondary keys: magic without scroll should NOT match e5');
    } else {
        ok('secondary keys: magic without scroll does not match e5');
    }
}

// ──────────────────────────────────────────────
// 8. insertion_order sorting (descending)
// ──────────────────────────────────────────────
{
    // Text triggers dragon(10), sword(5), castle(20), ancient(15) → order: castle(20), ancient(15), dragon(10), sword(5)
    const result = matchEntriesAgainstText(
        entries,
        'Ancient dragon near the castle with a sword.',
        10
    );
    const ids = result.map((e) => e.id);
    const castleIdx = ids.indexOf('e3'); // insertion_order 20
    const ancientIdx = ids.indexOf('e4'); // insertion_order 15
    const dragonIdx = ids.indexOf('e1'); // insertion_order 10
    const swordIdx = ids.indexOf('e2');  // insertion_order 5

    if (castleIdx < ancientIdx && ancientIdx < dragonIdx && dragonIdx < swordIdx) {
        ok('insertion_order: sorted descending (castle > ancient > dragon > sword)');
    } else {
        fail(`insertion_order: expected castle>ancient>dragon>sword, got [${ids.join(',')}]`);
    }
}

// ──────────────────────────────────────────────
// 9. maxEntries limit
// ──────────────────────────────────────────────
{
    const result = matchEntriesAgainstText(
        entries,
        'Ancient dragon near the castle with a sword.',
        2
    );
    assertEqual(result.length, 2, 'maxEntries=2 limits result');
    // top 2 by insertion_order: castle(20), ancient(15)
    assertEqual(result.map((e) => e.id), ['e3', 'e4'], 'maxEntries=2 returns top 2');
}

// ──────────────────────────────────────────────
// 10. No match
// ──────────────────────────────────────────────
{
    const result = matchEntriesAgainstText(entries, 'It was a quiet evening.', 10);
    assertEqual(result.length, 0, 'no match returns empty array');
}

// ──────────────────────────────────────────────
// 11. Empty entries list
// ──────────────────────────────────────────────
{
    const result = matchEntriesAgainstText([], 'dragon castle sword', 5);
    assertEqual(result.length, 0, 'empty entries returns empty array');
}

// ──────────────────────────────────────────────
if (failed > 0) {
    process.exit(1);
}
console.log('\nlorebook matching tests passed.');
