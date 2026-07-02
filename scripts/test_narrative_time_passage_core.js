#!/usr/bin/env node
'use strict';

const {
    parseNarrativeTimePassage,
    clampElapsedWorldTurns,
} = require('../out/narrativeTimePassageCore');

const locs = [
    { id: 'elda_shop', name: 'エルダの店' },
    { id: 'plaza_center', name: '広場の中心' },
];

let failed = 0;
function fail(msg) { console.error(`FAIL: ${msg}`); failed++; }
function ok(msg) { console.log(`OK: ${msg}`); }

const rest = parseNarrativeTimePassage('宿で休む', locs);
if (!rest || rest.kind !== 'rest' || rest.steps !== 1 || !rest.healHp) {
    fail('parse rest', rest);
} else {
    ok('parse rest');
}

const travel = parseNarrativeTimePassage('3日かけてエルダの店へ旅する', locs);
if (!travel || travel.kind !== 'travel' || travel.steps !== 3 || travel.locationId !== 'elda_shop') {
    fail('parse travel', travel);
} else {
    ok('parse travel');
}

if (parseNarrativeTimePassage('町を歩く', locs) !== null) {
    fail('reject casual walk');
} else {
    ok('reject casual walk');
}

if (clampElapsedWorldTurns(5) !== 5 || clampElapsedWorldTurns(200) !== 100 || clampElapsedWorldTurns(0) !== 0) {
    fail('clampElapsedWorldTurns');
} else {
    ok('clampElapsedWorldTurns');
}

if (failed > 0) {
    process.exit(1);
}
console.log('All narrative time passage core tests passed.');