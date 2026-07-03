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

{
    const next = applyDiscoveryOpsToLedger({
        version: 1,
        entries: [{ id: 'x', kind: 'material', label: 'A', status: 'appraised', identifiedLabel: 'Relic' }],
    }, [{ op: 'update', id: 'x', status: 'unidentified' }]);
    if (next.entries[0].status !== 'appraised') {
        fail(`backward status transition should be ignored: ${next.entries[0].status}`);
    } else {
        ok('backward status transition ignored');
    }
}

{
    const next = applyDiscoveryOpsToLedger({
        version: 1,
        entries: [{ id: 'y', kind: 'material', label: 'Vague shard', status: 'unidentified' }],
    }, [{ op: 'update', id: 'y', identifiedLabel: 'Relay housing' }]);
    if (next.entries[0].status !== 'identified' || next.entries[0].identifiedLabel !== 'Relay housing') {
        fail(`identifiedLabel should promote status: ${JSON.stringify(next.entries[0])}`);
    } else {
        ok('identifiedLabel auto-promotes status');
    }
}

{
    // Condition op on an unidentified find is ignored; on an identified find it applies.
    const base = {
        version: 1,
        entries: [{ id: 'x', kind: 'material', label: 'Warm shard', status: 'unidentified' }],
    };
    const stillUnidentified = applyDiscoveryOpsToLedger(base, [
        { op: 'update', id: 'x', condition: 'repaired', estValue: 200 },
    ]);
    if (stillUnidentified.entries[0].condition !== undefined) {
        fail(`condition on unidentified find should be ignored: ${stillUnidentified.entries[0].condition}`);
    } else if (stillUnidentified.entries[0].estValue !== 200) {
        fail('estValue should still apply even when condition is gated out');
    } else {
        ok('condition op ignored on unidentified find');
    }

    const identified = applyDiscoveryOpsToLedger(base, [
        { op: 'update', id: 'x', identifiedLabel: 'Relay housing', estValue: 150 },
        { op: 'update', id: 'x', condition: 'upgraded' },
    ]);
    if (identified.entries[0].status !== 'identified' || identified.entries[0].condition !== 'upgraded') {
        fail(`condition op should apply once identified: ${JSON.stringify(identified.entries[0])}`);
    } else {
        ok('condition op applies after identification');
    }
}

{
    // add op with an explicit serviceable status can set condition directly.
    const withAdd = applyDiscoveryOpsToLedger({ version: 1, entries: [] }, [
        { op: 'add', id: 'find_b', label: 'Scavenged rifle', discoveryKind: 'material', status: 'identified', identifiedLabel: 'Old rifle', condition: 'repaired', estValue: 300 },
    ]);
    if (withAdd.entries[0].condition !== 'repaired' || withAdd.entries[0].estValue !== 300) {
        fail(`add op should accept condition/estValue when status is serviceable: ${JSON.stringify(withAdd.entries[0])}`);
    } else {
        ok('add op accepts condition/estValue for a serviceable status');
    }
}

if (failed > 0) {
    process.exit(1);
}
console.log('discoveryTurnOpsCore: all tests passed.');