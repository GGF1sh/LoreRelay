#!/usr/bin/env node
/**
 * Unit tests for vlmQueueCore.ts (Phase 5b hardening).
 */
'use strict';

const {
    sanitizeVlmDescription,
    resolvedImagePathsMatch,
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

console.log(`vlmQueueCore: ${passed} passed, ${failed} failed`);
if (failed > 0) { process.exit(1); }