#!/usr/bin/env node
'use strict';

const path = require('path');
const root = path.join(__dirname, '..');
const modPath = path.join(root, 'out', 'workspaceStateQueueCore.js');

let failed = 0;
function fail(msg) { console.error(`FAIL: ${msg}`); failed++; }
function ok(msg) { console.log(`OK: ${msg}`); }

if (!require('fs').existsSync(modPath)) {
    fail('out/workspaceStateQueueCore.js missing — run npm run compile');
    process.exit(1);
}

const {
    mergeGameStateEntries,
    mergeGameStateForPersist,
    mergeWorldStateForPersist,
} = require(modPath);

{
    const merged = mergeGameStateEntries(
        [{ id: 'a', role: 'user', content: 'old' }],
        [{ id: 'a', role: 'user', content: 'new' }, { id: 'b', role: 'gm', content: 'hi' }]
    );
    if (merged.length !== 2 || merged[0].content !== 'new' || merged[1].id !== 'b') {
        fail(`entry merge by id: ${JSON.stringify(merged)}`);
    } else {
        ok('entry merge by id');
    }
}

{
    const disk = { schemaVersion: 2, entries: [{ id: 'u1', role: 'user', content: 'disk' }], status: { hp: 1 } };
    const incoming = {
        schemaVersion: 2,
        entries: [{ id: 'g1', role: 'gm', content: 'gm' }],
        status: { hp: 2 },
    };
    const merged = mergeGameStateForPersist(disk, incoming);
    if (merged.entries.length !== 2 || merged.status.hp !== 2 || merged.stateRevision !== 1) {
        fail(`game state merge: ${JSON.stringify(merged)}`);
    } else {
        ok('game state merge preserves disk-only entries');
    }
}

{
    const disk = {
        worldTurn: 1,
        factions: { f1: { playerReputation: 10 } },
        markets: { m1: { stock: 5 } },
        revision: 2,
    };
    const incoming = {
        worldTurn: 1,
        factions: { f2: { playerReputation: 20 } },
        markets: { m1: { stock: 1 } },
    };
    const merged = mergeWorldStateForPersist(disk, incoming);
    if (
        merged.factions.f1.playerReputation !== 10
        || merged.factions.f2.playerReputation !== 20
        || merged.markets.m1.stock !== 1
        || merged.revision !== 3
    ) {
        fail(`world state map merge: ${JSON.stringify(merged)}`);
    } else {
        ok('world state map merge');
    }
}

if (failed > 0) {
    process.exit(1);
}
console.log('workspaceStateQueueCore: all tests passed.');