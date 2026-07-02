#!/usr/bin/env node
'use strict';

const path = require('path');
const root = path.join(__dirname, '..');
const corePath = path.join(root, 'out', 'travelEncounterCore.js');

let failed = 0;
function fail(msg) { console.error(`FAIL: ${msg}`); failed++; }
function ok(msg) { console.log(`OK: ${msg}`); }

if (!require('fs').existsSync(corePath)) {
    fail('out/travelEncounterCore.js missing — run npm run compile first');
    process.exit(1);
}

const {
    findRegionPath,
    regionIdForTravelDay,
    rollTravelEncounters,
    buildTravelEncounterPromptLines,
} = require(corePath);

const regions = [
    { id: 'r_a', name: 'Alpha', connectedTo: ['r_b'], hazard: 'storm' },
    { id: 'r_b', name: 'Beta', connectedTo: ['r_a', 'r_c'] },
    { id: 'r_c', name: 'Gamma', connectedTo: ['r_b'], hazard: 'radiation' }
];

{
    const pathIds = findRegionPath(regions, 'r_a', 'r_c');
    if (!pathIds || pathIds.join(',') !== 'r_a,r_b,r_c') {
        fail(`findRegionPath: ${pathIds}`);
    } else {
        ok('findRegionPath BFS');
    }
}

{
    if (regionIdForTravelDay(['r_a', 'r_b', 'r_c'], 1, 3) !== 'r_a') {
        fail('regionIdForTravelDay start');
    } else if (regionIdForTravelDay(['r_a', 'r_b', 'r_c'], 3, 3) !== 'r_c') {
        fail('regionIdForTravelDay end');
    } else {
        ok('regionIdForTravelDay');
    }
}

{
    const input = {
        worldSeed: 'test-seed-42',
        regions,
        fromRegionId: 'r_a',
        toRegionId: 'r_c',
        travelDays: 5,
        density: 'high',
        regionNames: { r_a: 'Alpha', r_b: 'Beta', r_c: 'Gamma' }
    };
    const first = rollTravelEncounters(input);
    const second = rollTravelEncounters(input);
    const sig1 = first.map((e) => `${e.day}:${e.severity}:${e.templateId}`).join(';');
    const sig2 = second.map((e) => `${e.day}:${e.severity}:${e.templateId}`).join(';');
    if (sig1 !== sig2) {
        fail('deterministic roll mismatch');
    } else {
        ok('deterministic roll reproducibility');
    }
    const rad = first.find((e) => e.hazard === 'radiation' || e.regionId === 'r_c');
    if (first.length > 0 && !first[0].text.includes('Alpha') && !first[0].text.includes('Beta') && !first[0].text.includes('Gamma')) {
        fail('encounter text should include region name');
    } else {
        ok('encounter text uses region label');
    }
    void rad;
}

{
    const sparse = rollTravelEncounters({
        worldSeed: 'low-density',
        regions,
        fromRegionId: 'r_a',
        toRegionId: 'r_c',
        travelDays: 3,
        density: 'low'
    });
    const dense = rollTravelEncounters({
        worldSeed: 'low-density',
        regions,
        fromRegionId: 'r_a',
        toRegionId: 'r_c',
        travelDays: 3,
        density: 'high'
    });
    if (dense.length < sparse.length) {
        fail(`density should increase encounters: low=${sparse.length} high=${dense.length}`);
    } else {
        ok('density affects encounter count (same seed bucket)');
    }
}

{
    const line = buildTravelEncounterPromptLines([
        { day: 2, regionId: 'r_b', severity: 'notable', text: 'Storm hits Beta.', templateId: 'storm.notable.0' }
    ]);
    if (!line.startsWith('[Travel — Encounters]') || !line.includes('Day 2')) {
        fail(`buildTravelEncounterPromptLines: ${line}`);
    } else {
        ok('buildTravelEncounterPromptLines');
    }
}

if (failed > 0) {
    process.exit(1);
}
console.log('All travel encounter core tests passed.');