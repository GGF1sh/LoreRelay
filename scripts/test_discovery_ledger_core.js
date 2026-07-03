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

if (failed > 0) {
    process.exit(1);
}
console.log('discoveryLedgerCore: all tests passed.');