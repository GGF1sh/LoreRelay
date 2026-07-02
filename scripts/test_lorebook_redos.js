#!/usr/bin/env node
'use strict';

const path = require('path');
const fs = require('fs');

const root = path.join(__dirname, '..');
const matcherPath = path.join(root, 'out', 'lorebookMatcher.js');
if (!fs.existsSync(matcherPath)) {
    console.error('FAIL: out/lorebookMatcher.js missing — run npm run compile');
    process.exit(1);
}

const { isPotentiallyEvilRegex, matchEntriesAgainstText } = require(matcherPath);

let failed = 0;
function fail(msg) { console.error(`FAIL: ${msg}`); failed++; }
function ok(msg) { console.log(`OK: ${msg}`); }

const EVIL_PATTERNS = [
    '(a+)+$',
    '(a|a)+$',
    '(a|aa)+$',
    '(a*)+$',
    '(a+)*',
    '(a{1,10}){1,10}',
    '(a|a){1,100}',
    '(.+)+',
    '(?:a+)+',
    '(a|b)*c',
    '([a-z]+)+',
    '(a+)+(?=b)',
    '(a|a)*$',
    '(x+)+y',
    '(a+){2,}',
    '(.*a){20}',
    '(a|a){5,10}',
    '(a|a){1,32}',
    '(.{1,32}){1,32}',
    '(a|aa){1,32}',
    '(\\w+)+',
    '(\\d+)+',
    '(\\s+)+',
    '.*.*.*.*.*',
];

const SAFE_PATTERNS = [
    'dragon',
    '^ancient',
    '/dragon/i',
    'drag(on|ons?)',
    '[a-z]+',
    '(?:foo|bar)',
    'foo.*bar',
    'a{1,3}',
];

for (const p of EVIL_PATTERNS) {
    if (!isPotentiallyEvilRegex(p)) {
        fail(`should flag evil pattern: ${p}`);
    } else {
        ok(`flags evil: ${p.slice(0, 40)}`);
    }
}

for (const p of SAFE_PATTERNS) {
    if (isPotentiallyEvilRegex(p)) {
        fail(`should allow safe pattern: ${p}`);
    } else {
        ok(`allows safe: ${p}`);
    }
}

{
    const entries = [{ keys: ['(\\w+)+'], content: 'evil', use_regex: true, enabled: true }];
    const t0 = Date.now();
    const result = matchEntriesAgainstText(entries, 'a'.repeat(8000), 5);
    const elapsed = Date.now() - t0;
    if (elapsed > 500) {
        fail(`(\\w+)+ match took ${elapsed}ms`);
    } else {
        ok(`(\\w+)+ completes quickly (${elapsed}ms)`);
    }
    if (result.length !== 0) {
        fail('(\\w+)+ should not substring-match repeated a');
    } else {
        ok('(\\w+)+ no false substring match');
    }
}

{
    const entries = [{ keys: ['(a|a){1,100}'], content: 'evil', use_regex: true, enabled: true }];
    const t0 = Date.now();
    matchEntriesAgainstText(entries, 'a'.repeat(8000), 5);
    const elapsed = Date.now() - t0;
    if (elapsed > 500) {
        fail(`(a|a){1,100} match took ${elapsed}ms`);
    } else {
        ok(`(a|a){1,100} completes quickly (${elapsed}ms)`);
    }
}

{
    const entries = [{ keys: ['/castle/i'], content: 'Castle', use_regex: true, enabled: true }];
    const hits = matchEntriesAgainstText(entries, 'The Castle stands tall', 5);
    if (hits.length !== 1) {
        fail('valid regex still matches after hardened guard');
    } else {
        ok('valid regex still matches after hardened guard');
    }
}

if (failed > 0) {
    process.exit(1);
}
console.log('All lorebook ReDoS tests passed.');