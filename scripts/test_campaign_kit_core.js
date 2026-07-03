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
    inferCampaignKitIdFromTheme,
    listCampaignKitPresetIds,
    parseCampaignKitConfig,
} = require(corePath);

{
    if (inferCampaignKitIdFromTheme('post-apocalyptic scavenger ruins') !== 'postapoc_scavenger') {
        fail('post-apocalyptic theme should infer scavenger kit');
    } else if (inferCampaignKitIdFromTheme('space frontier starship') !== 'space_frontier') {
        fail('space theme should infer space kit');
    } else if (inferCampaignKitIdFromTheme('和風 武侠 sect') !== 'eastern_fantasy') {
        fail('eastern theme should infer eastern fantasy kit');
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
    const ids = listCampaignKitPresetIds();
    const expected = ['postapoc_scavenger', 'classic_fantasy_guild', 'space_frontier', 'eastern_fantasy', 'cyberpunk_courier'];
    if (ids.length !== 5 || !expected.every((id) => ids.includes(id))) {
        fail(`preset ids mismatch: ${JSON.stringify(ids)}`);
    } else {
        ok('listCampaignKitPresetIds exposes all built-in presets');
    }
}

if (failed > 0) {
    process.exit(1);
}
console.log('campaignKitCore: all tests passed.');
