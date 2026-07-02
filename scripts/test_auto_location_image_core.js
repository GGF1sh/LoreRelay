#!/usr/bin/env node
'use strict';

const {
    isComfyUiConfigured,
    countGmTurns,
    normalizeAutoImageCooldownTurns,
    shouldTriggerAutoLocationImage,
    buildAutoImageWorldTrackingPatch,
} = require('../out/autoLocationImageCore');

let failed = 0;
function fail(msg) { console.error(`FAIL: ${msg}`); failed++; }
function ok(msg) { console.log(`OK: ${msg}`); }

{
    if (!isComfyUiConfigured('http://127.0.0.1:8188', undefined)) { fail('comfy url'); }
    else if (!isComfyUiConfigured('', { checkpoint: 'model.safetensors' })) { fail('checkpoint'); }
    else if (isComfyUiConfigured('', undefined)) { fail('unconfigured'); }
    else { ok('isComfyUiConfigured'); }
}

{
    const turns = countGmTurns([
        { role: 'gm', content: 'a' },
        { role: 'user', content: 'b' },
        { role: 'gm', content: 'c' },
    ]);
    if (turns !== 2) { fail(`countGmTurns ${turns}`); }
    else { ok('countGmTurns'); }
}

{
    if (normalizeAutoImageCooldownTurns(99) !== 20) { fail('cooldown cap'); }
    else if (normalizeAutoImageCooldownTurns(-1) !== 0) { fail('cooldown floor'); }
    else { ok('normalizeAutoImageCooldownTurns'); }
}

const base = {
    enabled: true,
    comfyConfigured: true,
    cooldownTurns: 3,
    prevLocationId: 'port_a',
    newLocationId: 'camp',
    currentGmTurn: 5,
};

{
    if (!shouldTriggerAutoLocationImage(base)) { fail('should trigger base'); }
    else { ok('should trigger on location change'); }

    if (shouldTriggerAutoLocationImage({ ...base, enabled: false })) { fail('disabled'); }
    else if (shouldTriggerAutoLocationImage({ ...base, comfyConfigured: false })) { fail('no comfy'); }
    else if (shouldTriggerAutoLocationImage({ ...base, newLocationId: 'port_a' })) { fail('same loc'); }
    else if (shouldTriggerAutoLocationImage({ ...base, lastGeneratedLocationId: 'camp' })) { fail('dup loc'); }
    else if (shouldTriggerAutoLocationImage({ ...base, lastAutoImageGmTurn: 4, currentGmTurn: 6 })) { fail('cooldown'); }
    else if (!shouldTriggerAutoLocationImage({ ...base, lastAutoImageGmTurn: 2, currentGmTurn: 5 })) { fail('cooldown elapsed'); }
    else { ok('shouldTrigger guards'); }
}

{
    const patch = buildAutoImageWorldTrackingPatch({}, 'camp', 7);
    if (patch.lastGeneratedLocationId !== 'camp' || patch.lastAutoImageGmTurn !== 7) {
        fail('tracking patch');
    } else { ok('buildAutoImageWorldTrackingPatch'); }
}

if (failed > 0) {
    console.error(`\n${failed} test(s) failed.`);
    process.exit(1);
}
console.log('\nAll autoLocationImageCore tests passed.');