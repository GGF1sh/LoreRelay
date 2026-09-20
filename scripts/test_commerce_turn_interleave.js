#!/usr/bin/env node
'use strict';

/**
 * Integration smoke: commerce debounce flush interleaved with GM turn merge profiles.
 * Simulates processTurnResult ordering (flush commerce → turn commit) without vscode/fs.
 */

const path = require('path');
const root = path.join(__dirname, '..');
const mergePath = path.join(root, 'out', 'workspaceStateQueueCore.js');
const debouncePath = path.join(root, 'out', 'livingWorldCommercePersistCore.js');

let failed = 0;
function fail(msg) { console.error(`FAIL: ${msg}`); failed++; }
function ok(msg) { console.log(`OK: ${msg}`); }

const fs = require('fs');
if (!fs.existsSync(mergePath) || !fs.existsSync(debouncePath)) {
    fail('compiled out modules missing — run npm run compile');
    process.exit(1);
}

const { mergeGameStateForPersist } = require(mergePath);
const { createCommercePersistScheduler } = require(debouncePath);

const wheatCargo = { commodityId: 'wheat', qty: 5 };
const emptyCargo = [];

function applyCommerceFlush(disk, staleSnapshot, baseRevision) {
    return mergeGameStateForPersist(disk, staleSnapshot, {
        baseRevision,
        profile: 'commerce-ui',
    });
}

function applyTurnCommit(disk, staleTurn, baseRevision) {
    return mergeGameStateForPersist(disk, staleTurn, {
        baseRevision,
        profile: 'turn',
    });
}

{
    let disk = {
        schemaVersion: 2,
        stateRevision: 5,
        entries: [{ id: 'u1', role: 'user', content: 'wait' }],
        commerce: { credits: 100, food: 30, transportId: 'wagon', playerRole: 'merchant', cargo: [wheatCargo] },
        status: { hp: { current: 10, max: 10 } },
    };
    const staleTradeRead = {
        schemaVersion: 2,
        entries: [{ id: 'u1', role: 'user', content: 'wait' }],
        commerce: { credits: 100, food: 30, transportId: 'wagon', playerRole: 'merchant', cargo: [wheatCargo] },
        status: { hp: { current: 10, max: 10 } },
    };
    const sellSnapshot = {
        ...staleTradeRead,
        commerce: { credits: 130, food: 30, transportId: 'wagon', playerRole: 'merchant', cargo: emptyCargo },
    };

    disk = applyCommerceFlush(disk, sellSnapshot, 5);
    if ((disk.commerce?.cargo ?? []).length !== 0) {
        fail(`flush-before-turn sell: ${JSON.stringify(disk.commerce)}`);
    } else {
        ok('flush-before-turn applies debounced sell');
    }

    const staleTurn = {
        schemaVersion: 2,
        entries: [
            { id: 'u1', role: 'user', content: 'wait' },
            { id: 'gm-1', role: 'gm', sender: 'GM', content: 'done' },
        ],
        commerce: { credits: 80, food: 30, transportId: 'wagon', playerRole: 'merchant', cargo: [wheatCargo] },
        status: { hp: { current: 7, max: 10 } },
    };
    disk = applyTurnCommit(disk, staleTurn, 5);
    if ((disk.commerce?.cargo ?? []).length !== 0) {
        fail(`turn after sell must not revive cargo: ${JSON.stringify(disk.commerce)}`);
    } else if (disk.status?.hp?.current !== 7) {
        fail(`turn should apply GM hp: ${JSON.stringify(disk.status)}`);
    } else if (disk.entries.length !== 2) {
        fail(`turn should merge GM entry: ${disk.entries.length}`);
    } else {
        ok('turn commit after commerce flush keeps sold cargo and GM fields');
    }
}

{
    const flushed = [];
    const scheduler = createCommercePersistScheduler(
        (payload) => flushed.push(payload),
        80,
        (fn) => fn,
        () => {}
    );

    scheduler.schedule({ baseRevision: 4, commerce: { credits: 10, cargo: [wheatCargo] } });
    scheduler.schedule({ baseRevision: 4, commerce: { credits: 99, cargo: emptyCargo } });
    scheduler.flush();

    if (flushed.length !== 1 || flushed[0].commerce.credits !== 99) {
        fail(`rapid trades coalesce before flush: ${JSON.stringify(flushed)}`);
    } else {
        ok('rapid trade coalesce before simulated turn flush');
    }

    let disk = {
        schemaVersion: 2,
        stateRevision: 4,
        entries: [{ id: 'u1', role: 'user', content: 'hi' }],
        commerce: { credits: 50, food: 30, transportId: 'wagon', playerRole: 'merchant', cargo: [wheatCargo] },
        status: { hp: { current: 10, max: 10 } },
    };
    const staleHost = {
        schemaVersion: 2,
        entries: [{ id: 'u1', role: 'user', content: 'hi' }],
        commerce: flushed[0].commerce,
        status: { hp: { current: 1, max: 10 } },
    };
    disk = applyCommerceFlush(disk, staleHost, 4);
    if (disk.commerce?.credits !== 99 || (disk.commerce?.cargo ?? []).length !== 0) {
        fail(`coalesced flush merge: ${JSON.stringify(disk.commerce)}`);
    } else if (disk.status?.hp?.current !== 10) {
        fail(`coalesced flush must not spread stale status: ${JSON.stringify(disk.status)}`);
    } else {
        ok('coalesced commerce flush with commerce-only merge');
    }
}

{
    let disk = {
        schemaVersion: 2,
        stateRevision: 6,
        entries: [
            { id: 'u1', role: 'user', content: 'wait' },
            { id: 'gm-1', role: 'gm', sender: 'GM', content: 'fresh' },
        ],
        commerce: { credits: 200, food: 30, transportId: 'wagon', playerRole: 'merchant', cargo: emptyCargo },
        status: { hp: { current: 4, max: 10 } },
    };
    const lateStaleTrade = {
        schemaVersion: 2,
        entries: [{ id: 'u1', role: 'user', content: 'wait' }],
        commerce: { credits: 150, food: 30, transportId: 'wagon', playerRole: 'merchant', cargo: [wheatCargo] },
        status: { hp: { current: 9, max: 10 } },
    };
    disk = applyCommerceFlush(disk, lateStaleTrade, 5);
    if (disk.commerce?.credits !== 150) {
        fail(`late trade should apply commerce on conflict: ${JSON.stringify(disk.commerce)}`);
    } else if ((disk.commerce?.cargo ?? []).length !== 1) {
        fail(`late trade commerce payload should apply: ${JSON.stringify(disk.commerce)}`);
    } else if (disk.entries[1]?.content !== 'fresh') {
        fail(`late trade flush must keep disk GM entry: ${JSON.stringify(disk.entries)}`);
    } else if (disk.status?.hp?.current !== 4) {
        fail(`late trade flush must keep disk status: ${JSON.stringify(disk.status)}`);
    } else {
        ok('late debounced flush after revision advance updates commerce only');
    }
}

if (failed > 0) {
    process.exit(1);
}
console.log('commerce turn interleave: all tests passed.');