#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const corePath = path.join(root, 'out', 'replayExportCore.js');

let failed = 0;
function fail(msg) { console.error(`FAIL: ${msg}`); failed++; }
function ok(msg) { console.log(`OK: ${msg}`); }

if (!fs.existsSync(corePath)) {
    fail('out/replayExportCore.js missing — run npm run compile');
    process.exit(1);
}

const {
    buildReplayMarkdown,
    snapshotReplayBuildInput,
} = require(corePath);

{
    const liveEntries = [
        { id: '1', role: 'user', sender: 'Alice', content: 'Before export' },
        { id: '2', role: 'gm', sender: 'GM', content: 'Original GM line' },
    ];
    const snapshot = snapshotReplayBuildInput({
        entries: liveEntries,
        options: { format: 'markdown', includeImages: false, includeGm: true, includeDice: false },
        title: 'Mutation Test',
    });

    liveEntries.push({ id: '3', role: 'user', sender: 'Alice', content: 'After mutation' });
    liveEntries[1].content = 'Mutated GM line';

    const md = buildReplayMarkdown(snapshot);
    if (md.includes('After mutation')) {
        fail('snapshot must not include entries added after snapshot');
    } else if (md.includes('Mutated GM line')) {
        fail('snapshot must not reflect in-place entry mutation');
    } else if (!md.includes('Before export') || !md.includes('Original GM line')) {
        fail('snapshot must preserve export-time content');
    } else {
        ok('replay snapshot isolates concurrent mutation');
    }
}

{
    const entries = [{ id: 'a', role: 'user', sender: 'Bob', content: 'Hi' }];
    const before = JSON.stringify(entries);
    snapshotReplayBuildInput({
        entries,
        options: { format: 'markdown', includeImages: true, includeGm: true, includeDice: true },
    });
    if (JSON.stringify(entries) !== before) {
        fail('snapshotReplayBuildInput must not mutate source entries array');
    } else {
        ok('snapshot does not mutate input');
    }
}

if (failed > 0) {
    console.error(`\n${failed} test(s) failed.`);
    process.exit(1);
}
console.log('\nAll replay_export_concurrent_mutation tests passed.');