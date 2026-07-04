#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const corePath = path.join(root, 'out', 'regionHazardPromptCore.js');

let failed = 0;
function fail(msg) { console.error(`FAIL: ${msg}`); failed++; }
function ok(msg) { console.log(`OK: ${msg}`); }

if (!fs.existsSync(corePath)) {
    fail('out/regionHazardPromptCore.js missing — run npm run compile');
    process.exit(1);
}

const { buildRegionHazardPromptLine } = require(corePath);

{
    if (buildRegionHazardPromptLine(undefined) !== undefined) {
        fail('undefined region should return undefined');
    } else {
        ok('undefined region returns undefined');
    }
}

{
    const line = buildRegionHazardPromptLine({
        id: 'r_waste',
        name: 'Ash Barrens',
        type: 'wasteland',
        hazard: 'radiation',
    });
    if (!line || !line.includes('Ash Barrens') || !line.includes('radiation')) {
        fail(`expected radiation hazard line, got ${line}`);
    } else if (line.split('\n').length > 1) {
        fail('hazard prompt must be a single line');
    } else {
        ok('radiation hazard emits one GM line');
    }
}

{
    const line = buildRegionHazardPromptLine({
        id: 'r_plain',
        name: 'Quiet Plains',
        type: 'wilderness',
    });
    if (line !== undefined) {
        fail('region without hazard should not emit line');
    } else {
        ok('no hazard tag means no line');
    }
}

if (failed) {
    process.exit(1);
}
console.log('\nAll region hazard prompt core tests passed');