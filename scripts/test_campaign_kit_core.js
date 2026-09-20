#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const corePath = path.join(root, 'out', 'campaignKitCore.js');

let failed = 0;
function fail(msg) { console.error(`FAIL: ${msg}`); failed++; }
function ok(msg) { console.log(`OK: ${msg}`); }

if (!fs.existsSync(corePath)) {
    fail('out/campaignKitCore.js missing - run npm run compile first');
    process.exit(1);
}

const {
    buildCampaignKitPromptBlock,
    getCampaignKitPreset,
    hasCampaignKitPreset,
    inferCampaignKitIdFromTheme,
    listCampaignKitPresetIds,
    parseCampaignKitConfig,
} = require(corePath);

{
    if (inferCampaignKitIdFromTheme('space ruins derelict frontier') !== 'space_frontier') {
        fail('space ruins theme should infer space kit before post-apoc ruin keyword');
    } else if (inferCampaignKitIdFromTheme('post-apocalyptic scavenger ruins') !== 'postapoc_scavenger') {
        fail('post-apocalyptic theme should infer scavenger kit');
    } else if (inferCampaignKitIdFromTheme('space frontier starship') !== 'space_frontier') {
        fail('space theme should infer space kit');
    } else if (inferCampaignKitIdFromTheme('和風 武侠 sect') !== 'eastern_fantasy') {
        fail('eastern theme should infer eastern fantasy kit');
    } else if (inferCampaignKitIdFromTheme('modern occult ritual cult haunted') !== 'modern_occult') {
        fail('occult theme should infer modern occult kit');
    } else if (inferCampaignKitIdFromTheme('survival horror infected outbreak') !== 'survival_horror') {
        fail('horror theme should infer survival horror kit');
    } else if (inferCampaignKitIdFromTheme('haunted ritual site') !== 'modern_occult') {
        fail('haunted/ritual theme should prefer occult over bare-ruins post-apoc');
    } else {
        ok('theme inference');
    }
}

{
    if (inferCampaignKitIdFromTheme('\u548c\u98a8 \u6b66\u4fa0') !== 'eastern_fantasy') {
        fail('unicode eastern theme keywords should infer eastern fantasy kit');
    } else {
        ok('unicode eastern theme inference');
    }
}

{
    const kit = parseCampaignKitConfig({
        id: 'custom_loop',
        name: 'Custom Loop',
        genre: 'space',
        loop: {
            hubLabel: 'Orbital Bazaar',
            siteLabel: 'Derelict',
        },
        resources: [
            { id: 'fuel', name: 'Fuel' },
            { id: '../../bad', name: 'Bad' },
            { id: 'fuel', name: 'Duplicate fuel' },
        ],
        discoveryTypes: [
            { id: 'paydata', name: 'Paydata', kind: 'lore' },
            { id: 'bad kind', name: 'Bad' },
        ],
        gmGuidance: ['Use contracts.', 'x'.repeat(500)],
    }, getCampaignKitPreset('space_frontier'));
    if (!kit || kit.id !== 'custom_loop' || kit.loop.hubLabel !== 'Orbital Bazaar') {
        fail('custom kit should parse id/name/loop');
    } else if (kit.resources.some((r) => r.id.includes('..')) || kit.resources.length !== 1) {
        fail(`invalid/duplicate resources should be filtered: ${JSON.stringify(kit.resources)}`);
    } else if (kit.discoveryTypes[0].kind !== 'lore') {
        fail('valid discovery kind should be preserved');
    } else if (kit.gmGuidance[1].length > 240) {
        fail('guidance should be clamped');
    } else {
        ok('safe parser clamps and filters custom kit');
    }
}

{
    const block = buildCampaignKitPromptBlock(getCampaignKitPreset('postapoc_scavenger'));
    if (!block.includes('[Campaign Kit - Post-Apocalyptic Salvager]')) {
        fail('prompt block header missing');
    } else if (!block.includes('Settlement / Scrapyard Town') || !block.includes('Salvage')) {
        fail('prompt block should describe loop labels');
    } else if (!block.includes('Discovery ledger categories')) {
        fail('prompt block should include discovery categories');
    } else if (!block.includes('Existing Core systems remain canonical')) {
        fail('prompt block should preserve Core authority boundary');
    } else {
        ok('prompt block documents genre loop and Core boundary');
    }
}

{
    if (hasCampaignKitPreset('postapoc_scavenger') !== true || hasCampaignKitPreset('not_a_preset') !== false) {
        fail('hasCampaignKitPreset should validate known ids');
    } else if (parseCampaignKitConfig({ version: 2, id: 'x' }) !== undefined) {
        fail('unsupported version should reject parse');
    } else {
        ok('preset guard and version validation');
    }
}

{
    const ids = listCampaignKitPresetIds();
    const expected = ['postapoc_scavenger', 'classic_fantasy_guild', 'space_frontier', 'eastern_fantasy', 'cyberpunk_courier', 'modern_occult', 'survival_horror'];
    if (ids.length !== expected.length || !expected.every((id) => ids.includes(id))) {
        fail(`preset ids mismatch: ${JSON.stringify(ids)}`);
    } else {
        ok('listCampaignKitPresetIds exposes all built-in presets');
    }
}

{
    // Every non-generic genre in the enum should have at least one preset,
    // and every preset must expose the full six-kind discovery taxonomy.
    const genres = new Set(listCampaignKitPresetIds().map((id) => getCampaignKitPreset(id).genre));
    const requiredGenres = ['fantasy', 'postapocalypse', 'space', 'eastern_fantasy', 'cyberpunk', 'modern_occult', 'horror'];
    const missingGenre = requiredGenres.find((g) => !genres.has(g));
    const occult = getCampaignKitPreset('modern_occult');
    const occultKinds = new Set(occult.discoveryTypes.map((d) => d.kind));
    const requiredKinds = ['material', 'lore', 'social', 'route', 'threat', 'quest'];
    const missingKind = requiredKinds.find((k) => !occultKinds.has(k));
    const servicesBlock = buildCampaignKitPromptBlock(getCampaignKitPreset('survival_horror'));
    if (missingGenre) {
        fail(`no preset covers genre: ${missingGenre}`);
    } else if (missingKind) {
        fail(`modern_occult preset missing discovery kind: ${missingKind}`);
    } else if (!servicesBlock.includes('Services loop')) {
        fail('prompt block should document the services loop');
    } else {
        ok('all enum genres have presets, full discovery taxonomy, services loop guidance');
    }
}

if (failed > 0) {
    process.exit(1);
}
console.log('campaignKitCore: all tests passed.');
