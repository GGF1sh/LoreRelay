#!/usr/bin/env node
'use strict';

const path = require('path');
const root = path.join(__dirname, '..');
const corePath = path.join(root, 'out', 'npcVoiceCore.js');

let failed = 0;
function fail(msg) { console.error(`FAIL: ${msg}`); failed++; }
function ok(msg) { console.log(`OK: ${msg}`); }

if (!require('fs').existsSync(corePath)) {
    fail('out/npcVoiceCore.js missing — run npm run compile first');
    process.exit(1);
}

const {
    parseNpcVoiceProfile,
    clampVoiceRate,
    clampVoicePitch,
    applyMoodModifiers,
    isValidTtsProviderKind,
    sanitizeVoiceId,
} = require(corePath);

{
    const p = parseNpcVoiceProfile({
        provider: 'system',
        rate: 1.2,
        pitch: 0.1,
        moodAdaptive: true,
        label: 'Warm',
    });
    if (!p || p.rate !== 1.2 || !p.moodAdaptive) {
        fail('parse valid voice profile');
    } else {
        ok('parse valid voice profile');
    }
}

{
    const bad = parseNpcVoiceProfile({ provider: 'invalid', rate: 1.1 });
    if (!bad || bad.provider !== 'system' || bad.rate !== 1.1) {
        fail('invalid provider defaults to system');
    } else {
        ok('invalid provider defaults to system');
    }
}

{
    const empty = parseNpcVoiceProfile({ provider: 'invalid' });
    if (empty !== undefined) {
        fail('invalid-only provider yields empty profile');
    } else {
        ok('invalid-only provider yields empty profile');
    }
}

{
    if (clampVoiceRate(Infinity) !== 1.0 || clampVoiceRate(-5) !== 0.5) {
        fail('clampVoiceRate finite and bounds');
    } else {
        ok('clampVoiceRate finite and bounds');
    }
}

{
    if (sanitizeVoiceId('C:\\voices\\evil') !== undefined) {
        fail('reject path-like voiceId');
    } else {
        ok('reject path-like voiceId');
    }
}

{
    const mod = applyMoodModifiers(1, 0, 'sad');
    if (mod.rate >= 1 || mod.pitch > 0) {
        fail('sad mood slows and lowers pitch');
    } else {
        ok('sad mood slows and lowers pitch');
    }
}

{
    if (!isValidTtsProviderKind('local') || isValidTtsProviderKind('bogus')) {
        fail('isValidTtsProviderKind');
    } else {
        ok('isValidTtsProviderKind');
    }
}

if (failed > 0) {
    process.exit(1);
}
console.log('npcVoiceCore: all tests passed.');