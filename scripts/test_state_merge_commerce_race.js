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

const { mergeGameStateForPersist } = require(modPath);

const wheatCargo = { commodityId: 'wheat', qty: 5 };
const emptyCargo = [];

{
    const disk = {
        schemaVersion: 2,
        stateRevision: 2,
        entries: [{ id: 'u1', role: 'user', content: 'wait' }],
        commerce: { credits: 100, food: 30, transportId: 'wagon', playerRole: 'merchant', cargo: emptyCargo },
        status: { hp: { current: 10, max: 10 } },
    };
    const staleTurn = {
        schemaVersion: 2,
        stateRevision: 1,
        entries: [
            { id: 'u1', role: 'user', content: 'wait' },
            { id: 'gm-1', role: 'gm', sender: 'GM', content: 'done' },
        ],
        commerce: { credits: 80, food: 30, transportId: 'wagon', playerRole: 'merchant', cargo: [wheatCargo] },
        status: { hp: { current: 8, max: 10 } },
    };
    const merged = mergeGameStateForPersist(disk, staleTurn, {
        baseRevision: 1,
        profile: 'turn',
    });
    const cargo = merged.commerce?.cargo ?? [];
    if (cargo.length !== 0) {
        fail(`turn commit must not revive sold cargo: ${JSON.stringify(cargo)}`);
    } else {
        ok('turn commit keeps disk commerce after UI sell');
    }
    if (merged.status?.hp?.current !== 8) {
        fail(`turn status should apply from incoming: ${JSON.stringify(merged.status)}`);
    } else {
        ok('turn commit applies GM status on conflict');
    }
    if (merged.entries.length !== 2) {
        fail(`entries merged by id: ${merged.entries.length}`);
    } else {
        ok('turn commit merges GM entry');
    }
}

{
    const disk = {
        schemaVersion: 2,
        stateRevision: 3,
        entries: [],
        commerce: { credits: 50, food: 30, transportId: 'wagon', playerRole: 'merchant', cargo: [wheatCargo] },
    };
    const uiWrite = {
        schemaVersion: 2,
        entries: [],
        commerce: { credits: 120, food: 30, transportId: 'wagon', playerRole: 'merchant', cargo: emptyCargo },
    };
    const merged = mergeGameStateForPersist(disk, uiWrite, {
        baseRevision: 3,
        profile: 'commerce-ui',
    });
    const cargo = merged.commerce?.cargo ?? [];
    if (cargo.length !== 0 || merged.commerce?.credits !== 120) {
        fail(`commerce-ui profile should win: ${JSON.stringify(merged.commerce)}`);
    } else {
        ok('commerce-ui profile applies sell on commit');
    }
}

{
    const disk = {
        schemaVersion: 2,
        stateRevision: 4,
        entries: [{ id: 'a', role: 'user', content: 'hi' }],
        commerce: { credits: 10, food: 30, transportId: 'wagon', playerRole: 'merchant', cargo: emptyCargo },
        status: { hp: { current: 5, max: 10 } },
    };
    const playerAppend = {
        schemaVersion: 2,
        entries: [
            { id: 'a', role: 'user', content: 'hi' },
            { id: 'b', role: 'user', content: 'new' },
        ],
        commerce: { credits: 99, food: 30, transportId: 'wagon', playerRole: 'merchant', cargo: [wheatCargo] },
        status: { hp: { current: 1, max: 10 } },
    };
    const merged = mergeGameStateForPersist(disk, playerAppend, {
        baseRevision: 4,
        profile: 'entries-only',
    });
    if (merged.entries.length !== 2 || merged.commerce?.credits !== 10) {
        fail(`entries-only keeps disk fields: ${JSON.stringify(merged)}`);
    } else {
        ok('entries-only append preserves commerce');
    }
}

if (failed > 0) {
    process.exit(1);
}
console.log('state merge commerce race: all tests passed.');