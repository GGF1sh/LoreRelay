#!/usr/bin/env node
'use strict';

const path = require('path');
const root = path.join(__dirname, '..');
const rolePath = path.join(root, 'out', 'livingWorldPlayerRoleCore.js');
const promptPath = path.join(root, 'out', 'livingWorldPromptCore.js');

let failed = 0;
function fail(msg) { console.error(`FAIL: ${msg}`); failed++; }
function ok(msg) { console.log(`OK: ${msg}`); }

for (const p of [rolePath, promptPath]) {
    if (!require('fs').existsSync(p)) {
        fail(`${p} missing — run npm run compile`);
        process.exit(1);
    }
}

const { buildPlayerRoleMotivationLine, resolvePlayerRoleForPrompt } = require(rolePath);
const { buildCaravanPromptLines, buildLivingWorldPromptBlocks } = require(promptPath);

{
    const line = buildPlayerRoleMotivationLine('smith');
    if (!line.includes('Smith') || !line.includes('raw materials')) {
        fail(`smith motivation: ${line}`);
    } else {
        ok('smith motivation line');
    }
}

{
    if (resolvePlayerRoleForPrompt('bogus') !== 'merchant') {
        fail('invalid role falls back to merchant');
    } else {
        ok('invalid role fallback');
    }
}

{
    const lines = buildCaravanPromptLines(
        { commodities: [], markets: [], transportKinds: [] },
        {
            credits: 500,
            food: 30,
            transportId: 'wagon',
            cargo: [],
            playerRole: 'adventurer',
        }
    );
    if (!lines[0].includes('Adventurer') || !lines.some((l) => l.includes('Credits: 500'))) {
        fail(`caravan with role: ${lines.join(' | ')}`);
    } else {
        ok('caravan prompt includes role');
    }
}

{
    const assert = require('assert/strict');
    const world = require('../sample-scenarios/trade-routes/world_forge.json');
    const forge = world.commerce;
    const blocks = buildLivingWorldPromptBlocks({forge,markets:{north_farm:{wheat:{stock:30,priceIndex:1}}},
        registry:{},npcPositions:{},worldTurn:11,commerceEnabled:true,agencyEnabled:false,
        playerLocationId:'north_farm',locationNames:{north_farm:'North Farm'},
        playerCommerce:{credits:415,food:30,transportId:'wagon',cargo:[{commodityId:'wheat',qty:10}]}});
    assert(blocks.combined.some(line=>line.includes('currentLocationId=north_farm')));
    assert(blocks.commerce.some(line=>line.includes('marketLocationId=north_farm; commodityId=wheat')));
    assert(blocks.caravan.some(line=>line.includes('commodityId=wheat')));
    ok('real trading context provides canonical location and commodity IDs alongside labels');
}

if (failed > 0) {
    process.exit(1);
}
console.log('livingWorldPlayerRoleCore: all tests passed.');
