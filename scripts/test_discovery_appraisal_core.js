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
    isServiceableStatus,
    resolveDiscoveryConditionAfterPatch,
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

{
    if (isServiceableStatus('unidentified') || isServiceableStatus('sold') || isServiceableStatus('consumed')) {
        fail('unidentified/sold/consumed should not be serviceable');
    } else if (!isServiceableStatus('identified') || !isServiceableStatus('appraised')) {
        fail('identified/appraised should be serviceable');
    } else {
        ok('isServiceableStatus gates by status');
    }
}

{
    const unidentified = { status: 'unidentified', condition: undefined };
    const kept = resolveDiscoveryConditionAfterPatch(unidentified, 'unidentified', 'repaired');
    const identified = { status: 'identified', condition: undefined };
    const applied = resolveDiscoveryConditionAfterPatch(identified, 'identified', 'repaired');
    const unchanged = resolveDiscoveryConditionAfterPatch(identified, 'identified', undefined);
    if (kept !== undefined) {
        fail(`condition change on unidentified entry should be dropped: ${kept}`);
    } else if (applied !== 'repaired') {
        fail(`condition change on identified entry should apply: ${applied}`);
    } else if (unchanged !== undefined) {
        fail(`no patch condition should leave entry condition untouched: ${unchanged}`);
    } else {
        ok('resolveDiscoveryConditionAfterPatch gates on serviceable status');
    }
}

if (failed > 0) {
    process.exit(1);
}
console.log('discoveryAppraisalCore: all tests passed.');