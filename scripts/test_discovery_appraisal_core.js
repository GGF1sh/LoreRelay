#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const corePath = path.join(root, 'out', 'discoveryAppraisalCore.js');

let failed = 0;
function fail(msg) { console.error(`FAIL: ${msg}`); failed++; }
function ok(msg) { console.log(`OK: ${msg}`); }

if (!fs.existsSync(corePath)) {
    fail('out/discoveryAppraisalCore.js missing - run npm run compile');
    process.exit(1);
}

const {
    isAllowedDiscoveryTransition,
    resolveDiscoveryStatusAfterPatch,
    finalizeDiscoveryEntry,
} = require(corePath);

{
    if (!isAllowedDiscoveryTransition('unidentified', 'identified')) {
        fail('unidentified → identified should be allowed');
    } else if (isAllowedDiscoveryTransition('appraised', 'unidentified')) {
        fail('appraised → unidentified should be blocked');
    } else if (!isAllowedDiscoveryTransition('appraised', 'sold')) {
        fail('appraised → sold should be allowed');
    } else {
        ok('transition rules');
    }
}

{
    const entry = { id: 'a', kind: 'material', label: 'Warm shard', status: 'unidentified' };
    const next = resolveDiscoveryStatusAfterPatch(entry, { identifiedLabel: 'Relay housing' });
    if (next !== 'identified') {
        fail(`identifiedLabel should auto-promote to identified: ${next}`);
    } else {
        ok('auto-promote on identifiedLabel');
    }
}

{
    const entry = { id: 'a', kind: 'material', label: 'Warm shard', status: 'appraised', identifiedLabel: 'Housing' };
    const finalized = finalizeDiscoveryEntry({ ...entry, status: 'unidentified' }, 'appraised');
    if (finalized.status !== 'appraised') {
        fail(`illegal backward transition should be reverted: ${finalized.status}`);
    } else {
        ok('finalizeDiscoveryEntry blocks backward transition');
    }
}

if (failed > 0) {
    process.exit(1);
}
console.log('discoveryAppraisalCore: all tests passed.');