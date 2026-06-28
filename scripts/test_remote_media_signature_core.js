#!/usr/bin/env node
'use strict';

const {
    clampMediaUrlTtlSec,
    buildMediaSignPayload,
    computeMediaSignature,
    verifyMediaSignature,
    buildSignedMediaPath,
    buildSignedMediaQuery,
} = require('../out/remoteMediaSignatureCore');

let failed = 0;
function fail(msg) { console.error(`FAIL: ${msg}`); failed++; }
function ok(msg) { console.log(`OK: ${msg}`); }

const SECRET = 'test-session-token-abc123';
const FILE = 'images/scene.png';
const NOW = 1_700_000_000;

if (clampMediaUrlTtlSec(undefined) !== 300) { fail('clamp default ttl'); } else { ok('clamp default ttl'); }
if (clampMediaUrlTtlSec(10) !== 60) { fail('clamp min'); } else { ok('clamp min'); }
if (clampMediaUrlTtlSec(99999) !== 3600) { fail('clamp max'); } else { ok('clamp max'); }

const payload = buildMediaSignPayload(FILE, NOW + 300);
if (payload !== `${NOW + 300}:${FILE}`) {
    fail(`payload format: ${payload}`);
} else {
    ok('buildMediaSignPayload format');
}

const sig1 = computeMediaSignature(SECRET, FILE, NOW + 300);
const sig2 = computeMediaSignature(SECRET, FILE, NOW + 300);
if (sig1 !== sig2 || sig1.length !== 64) {
    fail(`signature unstable or wrong length: ${sig1}`);
} else {
    ok('computeMediaSignature stable hex');
}

const sigOther = computeMediaSignature('other-secret', FILE, NOW + 300);
if (sigOther === sig1) {
    fail('different secrets produced same signature');
} else {
    ok('computeMediaSignature secret sensitivity');
}

const valid = verifyMediaSignature(FILE, NOW + 300, sig1, SECRET, NOW);
if (!valid.ok) {
    fail('valid signature rejected');
} else {
    ok('verifyMediaSignature accepts valid sig');
}

const expired = verifyMediaSignature(FILE, NOW - 1, sig1, SECRET, NOW);
if (expired.ok || expired.reason !== 'expired') {
    fail('expired signature not detected');
} else {
    ok('verifyMediaSignature rejects expired');
}

const invalid = verifyMediaSignature(FILE, NOW + 300, 'deadbeef'.repeat(8), SECRET, NOW);
if (invalid.ok || invalid.reason !== 'invalid') {
    fail('invalid signature not detected');
} else {
    ok('verifyMediaSignature rejects invalid sig');
}

const missing = verifyMediaSignature('', NOW + 300, sig1, SECRET, NOW);
if (missing.ok || missing.reason !== 'missing') {
    fail('missing file not detected');
} else {
    ok('verifyMediaSignature rejects missing file');
}

const path = buildSignedMediaPath(FILE, SECRET, 300, NOW);
if (!path.startsWith('/media?file=') || !path.includes('&exp=') || !path.includes('&sig=')) {
    fail(`buildSignedMediaPath malformed: ${path}`);
} else {
    ok('buildSignedMediaPath structure');
}

const query = buildSignedMediaQuery(FILE, SECRET, 300, NOW);
const expMatch = query.match(/&exp=(\d+)/);
const sigMatch = query.match(/&sig=([^&]+)/);
if (!expMatch || !sigMatch) {
    fail('buildSignedMediaQuery missing exp/sig');
} else {
    const exp = Number.parseInt(expMatch[1], 10);
    const sig = decodeURIComponent(sigMatch[1]);
    const roundTrip = verifyMediaSignature(FILE, exp, sig, SECRET, NOW);
    if (!roundTrip.ok) {
        fail('round-trip query verification failed');
    } else {
        ok('buildSignedMediaQuery round-trip');
    }
}

if (failed > 0) {
    process.exit(1);
}
console.log('All remote media signature core tests passed.');