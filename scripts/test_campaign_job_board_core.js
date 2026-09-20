#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const corePath = path.join(root, 'out', 'campaignJobBoardCore.js');

let failed = 0;
function fail(msg) { console.error(`FAIL: ${msg}`); failed++; }
function ok(msg) { console.log(`OK: ${msg}`); }

if (!fs.existsSync(corePath)) {
    fail('compiled modules missing — run npm run compile first');
    process.exit(1);
}

const {
    buildCampaignJobBoard,
    buildCampaignJobBoardPromptBlock,
    resolveCampaignHubLocation,
    MAX_JOB_BOARD_SIZE,
} = require(corePath);
const { getCampaignKitPreset } = require(path.join(root, 'out', 'campaignKitCore.js'));

const kit = getCampaignKitPreset('postapoc_scavenger');
const locations = [
    {
        id: 'scrapbound_market',
        name: 'Scrapbound Market Row',
        regionId: 'r_settlement',
        type: 'settlement',
        description: 'Hub with notice board',
    },
    {
        id: 'dead_factory_yard',
        name: 'Dead Factory Yard',
        regionId: 'r_industrial',
        type: 'ruins',
    },
    {
        id: 'north_metro',
        name: 'North Metro Entrance',
        regionId: 'r_transit',
        type: 'ruins',
    },
];
const regions = [
    { id: 'r_settlement', name: 'Enclave', type: 'urban' },
    { id: 'r_industrial', name: 'Industrial Belt', type: 'ruins', hazard: 'toxic' },
    { id: 'r_transit', name: 'Transit', type: 'dungeon', hazard: 'radiation' },
];

{
    const hub = resolveCampaignHubLocation(locations);
    if (!hub || hub.id !== 'scrapbound_market') {
        fail(`hub should prefer settlement, got ${hub?.id}`);
    } else {
        ok('resolveCampaignHubLocation prefers settlement hub');
    }
}

{
    const ctx = {
        kit,
        hubLocationId: 'scrapbound_market',
        hubLocationName: 'Scrapbound Market Row',
        locations,
        regions,
        worldSeed: 'scrapbound-demo',
        worldTurn: 3,
    };
    const boardA = buildCampaignJobBoard(ctx);
    const boardB = buildCampaignJobBoard(ctx);
    if (!boardA.length || boardA.length > MAX_JOB_BOARD_SIZE) {
        fail(`board size out of range: ${boardA.length}`);
    } else if (JSON.stringify(boardA) !== JSON.stringify(boardB)) {
        fail('board generation should be deterministic');
    } else if (!boardA.every((e) => e.id && e.title && e.summary && (e.kind === 'job' || e.kind === 'rumor'))) {
        fail(`invalid board entries: ${JSON.stringify(boardA)}`);
    } else if (!boardA.some((e) => e.siteId === 'dead_factory_yard' || e.siteId === 'north_metro')) {
        fail('board should reference expedition sites');
    } else {
        ok('deterministic job board generation');
    }
}

{
    const prompt = buildCampaignJobBoardPromptBlock(
        kit,
        buildCampaignJobBoard({
            kit,
            hubLocationId: 'scrapbound_market',
            hubLocationName: 'Scrapbound Market Row',
            locations,
            regions,
            worldSeed: 'scrapbound-demo',
            worldTurn: 1,
        }),
        'Scrapbound Market Row'
    );
    if (!prompt.includes('[Campaign') || !prompt.includes('optional hub prompts')) {
        fail('prompt block missing guidance');
    } else {
        ok('job board prompt block');
    }
}

if (failed > 0) {
    process.exit(1);
}
console.log('campaignJobBoardCore: all tests passed.');