#!/usr/bin/env node
/**
 * Unit tests for vlmQueueCore.ts (Phase 5b hardening).
 */
'use strict';

const {
    sanitizeVlmDescription,
    resolvedImagePathsMatch,
    imagePathsLooselyMatch,
    normalizePathForCompare,
    MAX_VLM_DESCRIPTION_CHARS,
} = require('../out/vlmQueueCore');

let passed = 0;
let failed = 0;

function assert(condition, label) {
    if (condition) { passed++; }
    else { failed++; console.error(`FAIL: ${label}`); }
}

assert(sanitizeVlmDescription('  hello   world  ') === 'hello world', 'whitespace normalized');
assert(sanitizeVlmDescription('') === undefined, 'empty → undefined');
assert(sanitizeVlmDescription(null) === undefined, 'null → undefined');
assert(sanitizeVlmDescription('x'.repeat(2000)).length === MAX_VLM_DESCRIPTION_CHARS, 'length capped');

assert(resolvedImagePathsMatch('/a/img.png', '/a/img.png') === true, 'same resolved path');
assert(resolvedImagePathsMatch('/a/img.png', '/b/img.png') === false, 'different paths');
assert(resolvedImagePathsMatch(undefined, '/a/img.png') === false, 'undefined latest');

assert(normalizePathForCompare('C:\\foo\\bar.png') === 'c:/foo/bar.png', 'normalize windows path');
assert(imagePathsLooselyMatch('C:\\ws\\a.png', 'c:/ws/a.png') === true, 'loose match across separators');
assert(imagePathsLooselyMatch('/ws/a.png', '/other/a.png') === false, 'different paths no match');

console.log(`vlmQueueCore: ${passed} passed, ${failed} failed`);
if (failed > 0) { process.exit(1); }