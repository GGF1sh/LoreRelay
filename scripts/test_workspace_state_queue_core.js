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
    mergeQuestHooks,
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
        fail(`default merge (no conflict): ${JSON.stringify(merged)}`);
    } else {
        ok('default merge when no baseRevision conflict');
    }
}

{
    const disk = {
        schemaVersion: 2,
        stateRevision: 2,
        entries: [],
        commerce: { credits: 5, cargo: [] },
        status: { hp: { current: 10, max: 10 } },
    };
    const incoming = {
        schemaVersion: 2,
        entries: [{ id: 'gm-1', role: 'gm', content: 'x' }],
        commerce: { credits: 1, cargo: [{ commodityId: 'wheat', qty: 3 }] },
        status: { hp: { current: 3, max: 10 } },
    };
    const merged = mergeGameStateForPersist(disk, incoming, { baseRevision: 1, profile: 'turn' });
    if (merged.commerce?.cargo?.length !== 0 || merged.status.hp.current !== 3) {
        fail(`turn profile conflict: ${JSON.stringify(merged)}`);
    } else {
        ok('turn profile keeps disk commerce on revision conflict');
    }
}

{
    const disk = {
        schemaVersion: 2,
        stateRevision: 9,
        entries: [
            { id: 'old-user', role: 'user', content: 'old campaign' },
            { id: 'old-gm', role: 'gm', content: 'old future' },
        ],
        status: { hp: { current: 1, max: 10 }, inventory: ['old relic'] },
        commerce: { credits: 999, cargo: [{ commodityId: 'wheat', qty: 3 }] },
        world: { currentLocationId: 'old-world' },
    };
    const incoming = {
        schemaVersion: 2,
        entries: [{ id: 'scenario-opening', role: 'gm', content: 'new world' }],
        status: { hp: { current: 10, max: 10 } },
        theme: 'fantasy',
    };
    const replaced = mergeGameStateForPersist(disk, incoming, { profile: 'replace' });
    if (
        replaced.entries.length !== 1
        || replaced.entries[0].id !== 'scenario-opening'
        || 'commerce' in replaced
        || 'world' in replaced
        || replaced.status.inventory
        || replaced.stateRevision !== 10
    ) {
        fail(`replace profile must not revive disk-only campaign state: ${JSON.stringify(replaced)}`);
    } else {
        ok('replace profile drops disk-only entries and roots');
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

{
    const acceptHook = { id: 'quest_campaign_a', title: 'A', source: 'campaign', status: 'active' };
    const observerHook = { id: 'quest_event_b', title: 'B', source: 'event', status: 'available' };
    const mergedHooks = mergeQuestHooks([acceptHook], [observerHook]);
    if (mergedHooks.length !== 2) {
        fail(`mergeQuestHooks union: ${JSON.stringify(mergedHooks)}`);
    } else {
        ok('mergeQuestHooks unions disk and incoming hooks');
    }
}

{
    const disk = { revision: 1, questHooks: [{ id: 'qh_keep', title: 'Keep', status: 'active' }] };
    const incoming = { worldTurn: 2, questHooks: [{ id: 'qh_new', title: 'New', status: 'available' }] };
    const merged = mergeWorldStateForPersist(disk, incoming);
    if (!merged.questHooks.some((h) => h.id === 'qh_keep')) {
        fail(`mergeWorldStateForPersist should keep disk-only questHooks: ${JSON.stringify(merged.questHooks)}`);
    } else {
        ok('mergeWorldStateForPersist preserves disk-only questHooks');
    }
}

if (failed > 0) {
    process.exit(1);
}
console.log('workspaceStateQueueCore: all tests passed.');
