#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const corePath = path.join(root, 'out', 'discoveryLedgerCore.js');

let failed = 0;
function fail(msg) { console.error(`FAIL: ${msg}`); failed++; }
function ok(msg) { console.log(`OK: ${msg}`); }

if (!fs.existsSync(corePath)) {
    fail('out/discoveryLedgerCore.js missing - run npm run compile');
    process.exit(1);
}

const {
    parseDiscoveryLedger,
    buildDiscoveryLedgerPromptBlock,
    computeSuggestedSellValue,
} = require(corePath);

{
    const ledger = parseDiscoveryLedger({
        version: 1,
        entries: [
            {
                id: 'find_a',
                kind: 'material',
                label: 'Black shard',
                status: 'unidentified',
                siteId: 'metro',
                valueHint: 'electronics',
            },
            {
                id: 'find_a',
                kind: 'lore',
                label: 'Duplicate',
                status: 'identified',
            },
            {
                id: '../../bad',
                label: 'Bad id',
                status: 'identified',
            },
            {
                id: 'sold_item',
                kind: 'material',
                label: 'Old wire',
                status: 'sold',
            },
        ],
    });
    if (!ledger || ledger.entries.length !== 2) {
        fail(`duplicate and invalid ids filtered: ${ledger?.entries.length}`);
    } else if (ledger.entries[0].siteId !== 'metro') {
        fail('valid entry should parse siteId');
    } else {
        ok('parseDiscoveryLedger filters invalid/duplicate entries');
    }
}

{
    const block = buildDiscoveryLedgerPromptBlock({
        version: 1,
        entries: [
            {
                id: 'r1',
                kind: 'quest',
                label: 'Lights in metro',
                status: 'identified',
                identifiedLabel: 'Rumor: power in tunnel B',
            },
            {
                id: 's1',
                kind: 'material',
                label: 'Warm shard',
                status: 'sold',
            },
        ],
    });
    if (!block.includes('[Campaign Discoveries]')) {
        fail('prompt block header missing');
    } else if (!block.includes('Rumor: power in tunnel B')) {
        fail('identified label should appear');
    } else if (block.includes('Warm shard')) {
        fail('sold entries should be omitted from active prompt');
    } else if (!block.includes('do not invent new discovery IDs')) {
        fail('prompt should state canonical boundary');
    } else {
        ok('buildDiscoveryLedgerPromptBlock active subset + boundary');
    }
}

{
    const standard = computeSuggestedSellValue({ estValue: 100 });
    const repaired = computeSuggestedSellValue({ estValue: 100, condition: 'repaired' });
    const upgraded = computeSuggestedSellValue({ estValue: 100, condition: 'upgraded' });
    const damaged = computeSuggestedSellValue({ estValue: 100, condition: 'damaged' });
    const missing = computeSuggestedSellValue({});
    if (standard !== 100 || repaired !== 130 || upgraded !== 160 || damaged !== 60) {
        fail(`condition multipliers wrong: ${standard}/${repaired}/${upgraded}/${damaged}`);
    } else if (missing !== undefined) {
        fail('missing estValue should yield undefined suggested value');
    } else {
        ok('computeSuggestedSellValue applies condition multipliers');
    }
}

{
    // parseDiscoveryLedger should drop condition set on an unidentified entry (defense in depth).
    const ledger = parseDiscoveryLedger({
        version: 1,
        entries: [
            { id: 'u1', kind: 'material', label: 'Warm shard', status: 'unidentified', condition: 'repaired', estValue: 200 },
            { id: 'i1', kind: 'material', label: 'Old radio', status: 'identified', identifiedLabel: 'Radio', condition: 'upgraded', estValue: 150 },
        ],
    });
    const u1 = ledger.entries.find((e) => e.id === 'u1');
    const i1 = ledger.entries.find((e) => e.id === 'i1');
    if (u1.condition !== undefined) {
        fail(`unidentified entry should not carry a condition: ${u1.condition}`);
    } else if (u1.estValue !== 200) {
        fail('estValue should still parse even when condition is dropped');
    } else if (i1.condition !== 'upgraded') {
        fail(`identified entry condition should parse: ${i1.condition}`);
    } else {
        ok('parseDiscoveryLedger gates condition by status');
    }
}

{
    // Prompt block must stay vague pre-appraisal: no condition/value leak on unidentified finds.
    const block = buildDiscoveryLedgerPromptBlock({
        version: 1,
        entries: [
            { id: 'u1', kind: 'material', label: 'Warm shard', status: 'unidentified', estValue: 500 },
            { id: 'a1', kind: 'material', label: 'Old radio', identifiedLabel: 'Field radio', status: 'appraised', condition: 'repaired', estValue: 100 },
        ],
    });
    if (block.includes('500') || block.includes('~500')) {
        fail('unidentified entry should not leak suggested value');
    } else if (!block.includes('[repaired]') || !block.includes('~130')) {
        fail(`appraised entry should show condition and suggested value: ${block}`);
    } else {
        ok('buildDiscoveryLedgerPromptBlock reveals condition/value only post-identification');
    }
}

if (failed > 0) {
    process.exit(1);
}
console.log('discoveryLedgerCore: all tests passed.');