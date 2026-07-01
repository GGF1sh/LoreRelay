#!/usr/bin/env node
'use strict';

const path = require('path');
const root = path.join(__dirname, '..');
const corePath = path.join(root, 'out', 'ttsBridgeCore.js');

let failed = 0;
function fail(msg) { console.error(`FAIL: ${msg}`); failed++; }
function ok(msg) { console.log(`OK: ${msg}`); }

if (!require('fs').existsSync(corePath)) {
    fail('out/ttsBridgeCore.js missing — run npm run compile first');
    process.exit(1);
}

const {
    normalizeExternalProvider,
    resolveOpenAiVoice,
    rateToEdgeTtsPercent,
    parseTtsLocalStdout,
    isSafeTtsOutputPath,
    sanitizeTtsBridgePayload,
    isValidTtsRequestId,
} = require(corePath);

{
    if (normalizeExternalProvider('openai') !== 'openai' || normalizeExternalProvider('bogus') !== '') {
        fail('normalizeExternalProvider');
    } else {
        ok('normalizeExternalProvider');
    }
}

{
    if (resolveOpenAiVoice('nova', 'alloy') !== 'nova' || resolveOpenAiVoice('evil', 'shimmer') !== 'shimmer') {
        fail('resolveOpenAiVoice');
    } else {
        ok('resolveOpenAiVoice');
    }
}

{
    if (rateToEdgeTtsPercent(1.1) !== '+10%' || rateToEdgeTtsPercent(0.9) !== '-10%') {
        fail('rateToEdgeTtsPercent');
    } else {
        ok('rateToEdgeTtsPercent');
    }
}

{
    const parsed = parseTtsLocalStdout('log\n{"ok":true,"audioPath":"C:/x/a.mp3","mimeType":"audio/mpeg"}\n');
    if (!parsed.ok || parsed.audioPath !== 'C:/x/a.mp3') {
        fail('parseTtsLocalStdout success');
    } else {
        ok('parseTtsLocalStdout success');
    }
    const bad = parseTtsLocalStdout('not json');
    if (bad.ok) {
        fail('parseTtsLocalStdout failure');
    } else {
        ok('parseTtsLocalStdout failure');
    }
}

{
    const ws = path.join(root, 'workspace-demo');
    const safe = path.join(ws, '.text-adventure', 'tts', 'utt-123.mp3');
    const evil = path.join(ws, 'evil.mp3');
    if (!isSafeTtsOutputPath(safe, ws) || isSafeTtsOutputPath(evil, ws)) {
        fail('isSafeTtsOutputPath');
    } else {
        ok('isSafeTtsOutputPath');
    }
}

{
    const payload = sanitizeTtsBridgePayload({
        requestId: 'tts-req-12345678',
        provider: 'local',
        text: '  hello  ',
        lang: 'ja-JP',
        rate: 1.2,
        volume: 0.5,
        pitch: 0,
    });
    if (!payload || payload.text !== 'hello' || payload.provider !== 'local') {
        fail('sanitizeTtsBridgePayload');
    } else {
        ok('sanitizeTtsBridgePayload');
    }
}

{
    if (!isValidTtsRequestId('tts-abc12345') || isValidTtsRequestId('bad')) {
        fail('isValidTtsRequestId');
    } else {
        ok('isValidTtsRequestId');
    }
}

if (failed > 0) {
    process.exit(1);
}
console.log('ttsBridgeCore: all tests passed.');