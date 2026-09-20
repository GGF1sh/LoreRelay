#!/usr/bin/env node
'use strict';

const path = require('path');
const root = path.join(__dirname, '..');
const corePath = path.join(root, 'out', 'ttsProviderCore.js');

let failed = 0;
function fail(msg) { console.error(`FAIL: ${msg}`); failed++; }
function ok(msg) { console.log(`OK: ${msg}`); }

if (!require('fs').existsSync(corePath)) {
    fail('out/ttsProviderCore.js missing — run npm run compile first');
    process.exit(1);
}

const {
    resolveTtsPlan,
    findNpcVoiceForSender,
    buildNpcTtsCatalog,
    clampTtsText,
} = require(corePath);

const catalog = [
    { id: 'npc_a', name: 'Alice', locationId: 'loc_town', mood: 'happy', voice: { rate: 1.1 } },
    { id: 'npc_b', name: 'Alice', locationId: 'loc_cave', mood: 'worried', voice: { rate: 0.9 } },
    { id: 'npc_c', name: 'Bob', locationId: 'loc_town', mood: 'neutral', voice: {} },
];

{
    const plan = resolveTtsPlan({
        text: '  Hello   world  ',
        locale: 'en',
        globalSpeed: 1,
        globalVolume: 0.8,
        voiceProfile: { rate: 1.2, provider: 'external' },
        dispositionMood: 'happy',
    }, { externalEnabled: false });
    if (plan.provider !== 'system' || plan.fallbackFrom !== 'external') {
        fail('external falls back when disabled');
    } else {
        ok('external falls back when disabled');
    }
}

{
    const plan = resolveTtsPlan({
        text: 'x',
        locale: 'ja',
        globalSpeed: 1,
        globalVolume: 1,
        voiceProfile: { moodAdaptive: true, provider: 'local' },
        dispositionMood: 'excited',
    }, { localAvailable: true });
    if (plan.lang !== 'ja-JP' || plan.rate <= 1 || plan.provider !== 'local') {
        fail('mood adaptive and locale lang');
    } else {
        ok('mood adaptive and locale lang');
    }
}

{
    const plan = resolveTtsPlan({
        text: 'x',
        locale: 'en',
        globalSpeed: 1,
        globalVolume: 1,
        voiceProfile: { provider: 'local' },
    });
    if (plan.provider !== 'system' || plan.fallbackFrom !== 'local') {
        fail('local falls back when bridge unavailable');
    } else {
        ok('local falls back when bridge unavailable');
    }
}

{
    const long = 'a'.repeat(5000);
    if (clampTtsText(long).length !== 4000) {
        fail('clampTtsText cap');
    } else {
        ok('clampTtsText cap');
    }
}

{
    const match = findNpcVoiceForSender(catalog, 'Bob', 'loc_town');
    if (!match || match.id !== 'npc_c') {
        fail('unique sender match');
    } else {
        ok('unique sender match');
    }

    const ambiguous = findNpcVoiceForSender(catalog, 'Alice', null);
    if (ambiguous !== undefined) {
        fail('duplicate name without location is ambiguous');
    } else {
        ok('duplicate name without location is ambiguous');
    }

    const resolved = findNpcVoiceForSender(catalog, 'Alice', 'loc_town');
    if (!resolved || resolved.id !== 'npc_a') {
        fail('duplicate name resolved by location');
    } else {
        ok('duplicate name resolved by location');
    }
}

{
    const built = buildNpcTtsCatalog({
        format: 'lorerelay-npc-registry/1.0',
        npcs: {
            zed: { name: 'Zed', disposition: { playerTrust: 50, playerRomance: 0, playerFear: 0, mood: 'neutral', lastInteractionTurn: 0 }, needs: [], memories: [], voice: { label: 'Deep' } },
        },
    });
    if (built.length !== 1 || built[0].voice.label !== 'Deep') {
        fail('buildNpcTtsCatalog');
    } else {
        ok('buildNpcTtsCatalog');
    }
}

if (failed > 0) {
    process.exit(1);
}
console.log('ttsProviderCore: all tests passed.');