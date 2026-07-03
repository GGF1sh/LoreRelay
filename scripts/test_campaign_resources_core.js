#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const corePath = path.join(root, 'out', 'campaignResourcesCore.js');
const kitCorePath = path.join(root, 'out', 'campaignKitCore.js');

let failed = 0;
function fail(msg) { console.error(`FAIL: ${msg}`); failed++; }
function ok(msg) { console.log(`OK: ${msg}`); }

for (const p of [corePath, kitCorePath]) {
    if (!fs.existsSync(p)) {
        fail(`${p} missing - run npm run compile first`);
        process.exit(1);
    }
}

const {
    parseCampaignResourcesDocument,
    defaultCampaignResourceQuantities,
    parseCampaignResourceOps,
    applyCampaignResourceOps,
    buildCampaignResourcesPromptBlock,
    MAX_RESOURCE_OPS,
    MAX_RESOURCE_DELTA_PER_OP,
} = require(corePath);
const { getCampaignKitPreset } = require(kitCorePath);

const kit = getCampaignKitPreset('postapoc_scavenger');

{
    const doc = parseCampaignResourcesDocument({
        version: 1,
        quantities: { food: 12, water: -5, 'bad id': 3, fuel: 'nope', ammo: 999999999 },
    });
    if (!doc || doc.quantities.food !== 12) {
        fail(`valid quantity should parse: ${JSON.stringify(doc)}`);
    } else if (doc.quantities.water !== undefined) {
        fail('negative quantity should be dropped');
    } else if (doc.quantities['bad id'] !== undefined) {
        fail('invalid resource id should be dropped');
    } else if (doc.quantities.fuel !== undefined) {
        fail('non-numeric quantity should be dropped');
    } else if (doc.quantities.ammo !== 999999) {
        fail(`quantity should clamp to MAX_RESOURCE_QTY: ${doc.quantities.ammo}`);
    } else {
        ok('parseCampaignResourcesDocument filters/clamps quantities');
    }
}

{
    if (parseCampaignResourcesDocument({ version: 2, quantities: {} }) !== undefined) {
        fail('unsupported version should reject parse');
    } else {
        ok('version validation');
    }
}

{
    const defaults = defaultCampaignResourceQuantities(kit);
    const expectedIds = kit.resources.map((r) => r.id);
    const gotIds = Object.keys(defaults);
    if (expectedIds.length !== gotIds.length || !expectedIds.every((id) => gotIds.includes(id))) {
        fail(`default quantities should cover every kit resource: ${JSON.stringify(defaults)}`);
    } else if (!Object.values(defaults).every((v) => v === 10)) {
        fail(`default starting quantity should be 10: ${JSON.stringify(defaults)}`);
    } else {
        ok('defaultCampaignResourceQuantities seeds every kit resource');
    }
}

{
    const ops = parseCampaignResourceOps([
        { op: 'delta', resourceId: 'food', amount: -3, reason: 'meal' },
        { op: 'set', resourceId: 'water', amount: 50 },
        { op: 'delta', resourceId: 'ammo', amount: 99999 },
        { op: 'bogus', resourceId: 'food', amount: 1 },
        { op: 'delta', resourceId: '../../bad', amount: 1 },
        { op: 'delta', resourceId: 'food' },
    ]);
    if (ops.length !== 3) {
        fail(`parseCampaignResourceOps should filter invalid ops: ${JSON.stringify(ops)}`);
    } else if (ops[0].amount !== -3 || ops[0].reason !== 'meal') {
        fail(`delta op should parse amount/reason: ${JSON.stringify(ops[0])}`);
    } else if (ops[1].amount !== 50) {
        fail(`set op should parse amount: ${JSON.stringify(ops[1])}`);
    } else if (Math.abs(ops[2].amount) > MAX_RESOURCE_DELTA_PER_OP) {
        fail(`delta amount should clamp to MAX_RESOURCE_DELTA_PER_OP: ${ops[2].amount}`);
    } else {
        ok('parseCampaignResourceOps filters invalid ops and clamps amounts');
    }
}

{
    const capped = parseCampaignResourceOps(
        Array.from({ length: MAX_RESOURCE_OPS + 5 }, (_, i) => ({ op: 'delta', resourceId: 'food', amount: i }))
    );
    if (capped.length !== MAX_RESOURCE_OPS) {
        fail(`ops should cap at MAX_RESOURCE_OPS: ${capped.length}`);
    } else {
        ok('parseCampaignResourceOps caps op count');
    }
}

{
    const current = { version: 1, quantities: { food: 10, water: 5 } };
    const next = applyCampaignResourceOps(current, [
        { op: 'delta', resourceId: 'food', amount: -3 },
        { op: 'set', resourceId: 'water', amount: 20 },
        { op: 'delta', resourceId: 'fuel', amount: 5 },
    ], kit);
    if (next.quantities.food !== 7) {
        fail(`delta should subtract from existing quantity: ${next.quantities.food}`);
    } else if (next.quantities.water !== 20) {
        fail(`set should pin absolute value: ${next.quantities.water}`);
    } else if (next.quantities.fuel !== 5) {
        fail(`unset resource should initialize from 0 via delta: ${next.quantities.fuel}`);
    } else {
        ok('applyCampaignResourceOps applies delta/set correctly');
    }
}

{
    // Ops for resource ids outside the active kit's vocabulary are ignored.
    const spaceKit = getCampaignKitPreset('space_frontier');
    const next = applyCampaignResourceOps(undefined, [
        { op: 'delta', resourceId: 'wheat', amount: 5 }, // not a space_frontier resource
        { op: 'delta', resourceId: 'fuel', amount: 5 }, // is a space_frontier resource
    ], spaceKit);
    if (next.quantities.wheat !== undefined) {
        fail(`resource id outside kit vocabulary should be ignored: ${JSON.stringify(next.quantities)}`);
    } else if (next.quantities.fuel !== 5) {
        fail(`resource id inside kit vocabulary should apply: ${JSON.stringify(next.quantities)}`);
    } else {
        ok('applyCampaignResourceOps gates by active kit vocabulary');
    }
}

{
    // Quantities never go negative even with a large negative delta.
    const next = applyCampaignResourceOps({ version: 1, quantities: { food: 2 } }, [
        { op: 'delta', resourceId: 'food', amount: -MAX_RESOURCE_DELTA_PER_OP },
    ], kit);
    if (next.quantities.food !== 0) {
        fail(`quantity should floor at 0: ${next.quantities.food}`);
    } else {
        ok('applyCampaignResourceOps floors quantities at 0');
    }
}

{
    const block = buildCampaignResourcesPromptBlock(
        { version: 1, quantities: { food: 0, water: 2, fuel: 8 } },
        kit
    );
    if (!block.includes('[Campaign Resources]')) {
        fail('prompt block header missing');
    } else if (!block.includes('(OUT)')) {
        fail(`zero quantity should be flagged OUT: ${block}`);
    } else if (!block.includes('(low)')) {
        fail(`low quantity should be flagged low: ${block}`);
    } else if (!block.includes('campaignResourceOps')) {
        fail('prompt block should document the ops mechanism');
    } else {
        ok('buildCampaignResourcesPromptBlock flags low/out supplies and documents ops');
    }
}

{
    const noKitBlock = buildCampaignResourcesPromptBlock({ version: 1, quantities: {} }, undefined);
    if (noKitBlock !== '') {
        fail(`prompt block should be empty without an active kit: ${noKitBlock}`);
    } else {
        ok('buildCampaignResourcesPromptBlock is empty without an active kit');
    }
}

if (failed > 0) {
    process.exit(1);
}
console.log('campaignResourcesCore: all tests passed.');
