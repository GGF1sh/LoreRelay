#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');

const corePath = path.join(__dirname, '..', 'out', 'genreWorldPresetCore.js');
const { reproductionAvailabilityOf } = require(corePath);

const provenance = {
    presetId: 'fantasy-temperate',
    presetVersion: 1,
    resolvedFrom: 'default',
    regionCount: 5,
    factionCount: 3,
    npcCount: 6,
};

function forge(meta = {}) {
    return {
        meta: {
            worldName: 'Availability Test World',
            worldSeed: 'availability-test-seed',
            theme: 'fantasy',
            generationProvenance: provenance,
            ...meta,
        },
    };
}

function forgeWithout(field) {
    const value = forge();
    delete value.meta[field];
    return value;
}

function assertUnavailable(forgeValue, label) {
    assert.deepEqual(reproductionAvailabilityOf(forgeValue), {
        available: false,
        reason: 'missing-reproduction-input',
    }, label);
}

for (const [label, forgeValue] of [
    ['missing worldSeed', forgeWithout('worldSeed')],
    ['empty worldSeed', forge({ worldSeed: '' })],
    ['whitespace worldSeed', forge({ worldSeed: ' \t\n' })],
    ['missing theme', forgeWithout('theme')],
    ['empty theme', forge({ theme: '' })],
    ['whitespace theme', forge({ theme: ' \t\n' })],
]) {
    assertUnavailable(forgeValue, label);
    console.log(`OK: ${label}`);
}

const complete = reproductionAvailabilityOf(forge());
assert.equal(complete.available, true, 'complete reproduction key should remain available');
console.log('OK: complete reproduction key remains available');

assert.deepEqual(reproductionAvailabilityOf({ meta: { worldName: 'Legacy World' } }), {
    available: false,
    reason: 'missing-provenance',
});
console.log('OK: missing provenance reason remains unchanged');

assert.deepEqual(reproductionAvailabilityOf(forge({
    generationProvenance: { ...provenance, presetVersion: 999 },
})), {
    available: false,
    reason: 'preset-version-unavailable',
});
console.log('OK: unavailable preset-version reason remains unchanged');

console.log('genreWorldPresetCore reproduction availability: all tests passed.');
