#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const corePath = path.join(root, 'out', 'discoveryTurnOpsCore.js');

let failed = 0;
function fail(msg) { console.error(`FAIL: ${msg}`); failed++; }
function ok(msg) { console.log(`OK: ${msg}`); }

if (!fs.existsSync(corePath)) {
    fail('out/discoveryTurnOpsCore.js missing - run npm run compile');
    process.exit(1);
}

const {
    applyDiscoveryOpsToLedger,
    parseDiscoveryOps,
} = require(corePath);

{
    const ops = parseDiscoveryOps([
        { op: 'add', id: 'find_a', label: 'Warm shard', discoveryKind: 'material', siteId: 'metro' },
        { op: 'add', id: 'find_a', label: 'Duplicate' },
        { op: 'add', id: '../../bad', label: 'Bad' },
        { op: 'update', id: 'find_a', status: 'appraised', identifiedLabel: 'Old relay housing' },
    ]);
    if (ops.length !== 2) {
        fail(`parseDiscoveryOps should filter invalid/duplicate: ${ops.length}`);
    } else {
        ok('parseDiscoveryOps filters invalid ops');
    }
}

{
    const next = applyDiscoveryOpsToLedger({ version: 1, entries: [] }, [
        { op: 'add', id: 'find_a', label: 'Warm shard', discoveryKind: 'material' },
        { op: 'update', id: 'find_a', status: 'identified', identifiedLabel: 'Relay housing' },
    ], 5);
    if (next.entries.length !== 1 || next.entries[0].status !== 'identified') {
        fail(`apply should add then update: ${JSON.stringify(next.entries)}`);
    } else if (next.entries[0].acquiredWorldTurn !== 5) {
        fail('add op should stamp acquiredWorldTurn');
    } else {
        ok('applyDiscoveryOpsToLedger add + update');
    }
}

{
    const next = applyDiscoveryOpsToLedger({
        version: 1,
        entries: [{ id: 'old', kind: 'lore', label: 'Note', status: 'identified' }],
    }, [{ op: 'remove', id: 'old' }]);
    if (next.entries.length !== 0) {
        fail('remove op should delete entry');
    } else {
        ok('applyDiscoveryOpsToLedger remove');
    }
}

{
    const base = { version: 1, entries: [{ id: 'x', kind: 'material', label: 'A', status: 'unidentified' }] };
    const same = applyDiscoveryOpsToLedger(base, [{ op: 'update', id: 'missing', status: 'identified' }]);
    if (same.entries.length !== 1 || same.entries[0].status !== 'unidentified') {
        fail(`update on missing id should no-op: ${JSON.stringify(same.entries)}`);
    } else {
        ok('update on missing id is no-op');
    }
}

if (failed > 0) {
    process.exit(1);
}
console.log('discoveryTurnOpsCore: all tests passed.');