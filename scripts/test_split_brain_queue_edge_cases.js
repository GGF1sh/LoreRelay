#!/usr/bin/env node
'use strict';

/**
 * PR-C Split Brain edge cases — game_state / world_state independent FIFO queues.
 * Documents per-file merge contracts when cross-file writes are not atomic.
 * Circuit breaker not implemented yet — tests assert current merge outcomes only.
 */

const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const queuePath = path.join(root, 'out', 'workspaceStateQueue.js');
const corePath = path.join(root, 'out', 'workspaceStateQueueCore.js');

let failed = 0;
function fail(msg) { console.error(`FAIL: ${msg}`); failed++; }
function ok(msg) { console.log(`OK: ${msg}`); }

if (!fs.existsSync(queuePath) || !fs.existsSync(corePath)) {
    fail('compiled out modules missing — run npm run compile');
    process.exit(1);
}

const {
    runSerializedGameStateMutation,
    runSerializedWorldStateMutation,
    resetWorkspaceWriteQueueForTests,
} = require(queuePath);

const {
    mergeGameStateForPersist,
    mergeWorldStateForPersist,
} = require(corePath);

resetWorkspaceWriteQueueForTests();

// --- Queue independence (runtime) ---

{
    const log = [];
    runSerializedGameStateMutation(() => {
        log.push('g-start');
        runSerializedWorldStateMutation(() => log.push('w'));
        log.push('g-end');
    });
    if (log.join(',') !== 'g-start,w,g-end') {
        fail(`nested world inside game job: ${log.join(',')}`);
    } else {
        ok('nested world enqueue drains inside game job');
    }
}

{
    resetWorkspaceWriteQueueForTests();
    const log = [];
    runSerializedWorldStateMutation(() => {
        log.push('w-start');
        runSerializedGameStateMutation(() => log.push('g'));
        log.push('w-end');
    });
    if (log.join(',') !== 'w-start,g,w-end') {
        fail(`nested game inside world job: ${log.join(',')}`);
    } else {
        ok('nested game enqueue drains inside world job');
    }
}

{
    resetWorkspaceWriteQueueForTests();
    const log = [];
    runSerializedGameStateMutation(() => log.push('g1'));
    runSerializedWorldStateMutation(() => log.push('w1'));
    runSerializedGameStateMutation(() => log.push('g2'));
    runSerializedWorldStateMutation(() => log.push('w2'));
    const gIdx = (id) => log.indexOf(id);
    if (gIdx('g1') < 0 || gIdx('g2') < 0 || gIdx('w1') < 0 || gIdx('w2') < 0) {
        fail(`interleaved queues missing jobs: ${log.join(',')}`);
    } else if (gIdx('g1') >= gIdx('g2') || gIdx('w1') >= gIdx('w2')) {
        fail(`per-file fifo violated: ${log.join(',')}`);
    } else {
        ok(`interleaved game/world jobs preserve per-file fifo (${log.join(',')})`);
    }
}

{
    resetWorkspaceWriteQueueForTests();
    let gameSteps = 0;
    let worldSteps = 0;
    runSerializedWorldStateMutation(() => {
        worldSteps++;
        runSerializedGameStateMutation(() => { gameSteps++; });
        worldSteps++;
    });
    if (gameSteps !== 1 || worldSteps !== 2) {
        fail(`nested cross-queue completion: game=${gameSteps} world=${worldSteps}`);
    } else {
        ok('nested cross-queue jobs complete before outer job ends');
    }
}

// --- Living world commerce dual-write pattern (pure merge) ---

function simulateCommerceDualWrite(gameDisk, worldDisk, payload) {
    let game = gameDisk;
    let world = worldDisk;
    if (payload.commerce !== undefined && payload.gameState) {
        const incoming = { ...payload.gameState, commerce: payload.commerce };
        game = mergeGameStateForPersist(game, incoming, {
            baseRevision: payload.baseRevision,
            profile: 'commerce-ui',
        });
    }
    if (payload.markets !== undefined) {
        world = mergeWorldStateForPersist(world, { markets: payload.markets });
    }
    return { game, world };
}

{
    const gameDisk = {
        schemaVersion: 2,
        stateRevision: 3,
        entries: [{ id: 'u1', role: 'user', content: 'trade' }],
        commerce: { credits: 50, cargo: [{ commodityId: 'wheat', qty: 5 }] },
        status: { hp: { current: 10, max: 10 } },
    };
    const worldDisk = {
        revision: 2,
        worldTurn: 4,
        markets: { hub: { wheat: { stock: 20, priceIndex: 1.0 } } },
        questHooks: [],
    };
    const staleRead = {
        gameState: { ...gameDisk },
        baseRevision: 3,
        commerce: { credits: 80, cargo: [] },
        markets: { hub: { wheat: { stock: 15, priceIndex: 1.1 } } },
    };
    const result = simulateCommerceDualWrite(gameDisk, worldDisk, staleRead);
    if (result.game.commerce.credits !== 80 || (result.game.commerce.cargo ?? []).length !== 0) {
        fail(`dual-write commerce flush: ${JSON.stringify(result.game.commerce)}`);
    } else if (result.game.status.hp.current !== 10) {
        fail(`commerce-ui must not spread stale status: ${JSON.stringify(result.game.status)}`);
    } else if (result.world.markets.hub.wheat.stock !== 15) {
        fail(`dual-write world markets: ${result.world.markets.hub.wheat.stock}`);
    } else if (result.world.worldTurn !== 4) {
        fail(`markets-only world patch keeps worldTurn: ${result.world.worldTurn}`);
    } else if (result.game.stateRevision !== 4 || result.world.revision !== 3) {
        fail(`revisions advance independently: g=${result.game.stateRevision} w=${result.world.revision}`);
    } else {
        ok('commerce dual-write applies per-file merge independently');
    }
}

// --- Cross-file interleave: observer tick + commerce flush ---

{
    let gameDisk = {
        schemaVersion: 2,
        stateRevision: 5,
        entries: [{ id: 'gm-1', role: 'gm', content: 'fresh' }],
        commerce: { credits: 100, cargo: [] },
        status: { hp: { current: 4, max: 10 } },
    };
    let worldDisk = {
        revision: 4,
        worldTurn: 6,
        questHooks: [{ id: 'qh_accept', status: 'active' }],
        markets: { hub: { wheat: { stock: 10, priceIndex: 1.0 } } },
    };

    const observerStale = {
        worldTurn: 7,
        questHooks: [{ id: 'qh_event', status: 'available' }],
        markets: { hub: { wheat: { stock: 6, priceIndex: 1.3 } } },
    };
    worldDisk = mergeWorldStateForPersist(worldDisk, observerStale);

    const lateTrade = {
        entries: [{ id: 'u1', role: 'user', content: 'old' }],
        commerce: { credits: 150, cargo: [{ commodityId: 'wheat', qty: 2 }] },
        status: { hp: { current: 9, max: 10 } },
    };
    gameDisk = mergeGameStateForPersist(gameDisk, lateTrade, {
        baseRevision: 4,
        profile: 'commerce-ui',
    });

    if (!worldDisk.questHooks.some((h) => h.id === 'qh_accept')) {
        fail(`observer merge lost accept hook: ${JSON.stringify(worldDisk.questHooks)}`);
    } else if (!worldDisk.questHooks.some((h) => h.id === 'qh_event')) {
        fail('observer merge missing event hook');
    } else if (gameDisk.commerce.credits !== 150) {
        fail(`late commerce flush: ${gameDisk.commerce.credits}`);
    } else if (gameDisk.entries[0]?.content !== 'fresh') {
        fail('commerce flush must keep disk GM entry');
    } else if (gameDisk.status.hp.current !== 4) {
        fail('commerce flush must keep disk status');
    } else {
        ok('observer tick + commerce flush interleave without cross-file bleed');
    }
}

// --- Turn commit + observer — split brain safe per-file ---

{
    let gameDisk = {
        schemaVersion: 2,
        stateRevision: 6,
        entries: [{ id: 'u1', role: 'user', content: 'wait' }],
        commerce: { credits: 200, cargo: [] },
        status: { hp: { current: 10, max: 10 } },
    };
    let worldDisk = {
        revision: 5,
        worldTurn: 8,
        markets: { hub: { wheat: { stock: 12, priceIndex: 1.0 } } },
        questHooks: [{ id: 'qh_keep', status: 'active' }],
    };

    const staleTurn = {
        entries: [
            { id: 'u1', role: 'user', content: 'wait' },
            { id: 'gm-2', role: 'gm', content: 'narration' },
        ],
        commerce: { credits: 50, cargo: [{ commodityId: 'wheat', qty: 10 }] },
        status: { hp: { current: 6, max: 10 } },
    };
    gameDisk = mergeGameStateForPersist(gameDisk, staleTurn, {
        baseRevision: 5,
        profile: 'turn',
    });

    const observer = {
        worldTurn: 9,
        markets: { hub: { wheat: { stock: 4, priceIndex: 1.5 } } },
    };
    worldDisk = mergeWorldStateForPersist(worldDisk, observer);

    if ((gameDisk.commerce?.cargo ?? []).length !== 0) {
        fail(`turn must keep disk commerce after conflict: ${JSON.stringify(gameDisk.commerce)}`);
    } else if (gameDisk.status.hp.current !== 6) {
        fail('turn should apply GM hp');
    } else if (gameDisk.entries.length !== 2) {
        fail('turn merges GM entry');
    } else if (worldDisk.worldTurn !== 9 || worldDisk.markets.hub.wheat.stock !== 4) {
        fail('world observer independent of game turn');
    } else if (!worldDisk.questHooks.some((h) => h.id === 'qh_keep')) {
        fail('world questHooks preserved');
    } else {
        ok('turn commit + observer tick — per-file merge contracts hold');
    }
}

// --- Domain turn + world observer (game revision advanced by commerce-ui) ---

{
    const baseDomain = {
        enabled: true,
        controlledRegionId: 'riverhold',
        treasury: 300,
        food: 500,
        monthlyActionsRemaining: 2,
    };
    let gameDisk = {
        schemaVersion: 2,
        stateRevision: 9,
        entries: [{ id: 'u1', role: 'user', content: 'develop' }],
        commerce: { credits: 120, cargo: [] },
        domain: baseDomain,
    };
    let worldDisk = {
        revision: 7,
        worldTurn: 10,
        markets: { riverhold: { grain: { stock: 30, priceIndex: 1.0 } } },
    };

    const staleDomainTurn = {
        entries: [
            { id: 'u1', role: 'user', content: 'develop' },
            { id: 'gm-3', role: 'gm', content: 'domain event' },
        ],
        commerce: { credits: 40, cargo: [{ commodityId: 'grain', qty: 5 }] },
        domain: { ...baseDomain, treasury: 265, calendarMonth: 2 },
        status: { hp: { current: 8, max: 10 } },
    };
    gameDisk = mergeGameStateForPersist(gameDisk, staleDomainTurn, {
        baseRevision: 8,
        profile: 'turn',
    });

    const observer = {
        worldTurn: 11,
        markets: { riverhold: { grain: { stock: 22, priceIndex: 1.2 } } },
    };
    worldDisk = mergeWorldStateForPersist(worldDisk, observer);

    if (gameDisk.domain?.treasury !== 265 || gameDisk.domain?.calendarMonth !== 2) {
        fail(`domain turn authoritative after commerce bump: ${JSON.stringify(gameDisk.domain)}`);
    } else if ((gameDisk.commerce?.cargo ?? []).length !== 0) {
        fail(`domain turn keeps disk commerce: ${JSON.stringify(gameDisk.commerce)}`);
    } else if (worldDisk.markets.riverhold.grain.stock !== 22) {
        fail(`world observer markets independent: ${worldDisk.markets.riverhold.grain.stock}`);
    } else {
        ok('domain turn + world observer — no cross-file revision coupling');
    }
}

// --- Partial failure documentation: one file advances, other write skipped ---

{
    const worldDisk = { revision: 3, worldTurn: 5, markets: { a: { stock: 1 } } };
    const gameDisk = { stateRevision: 3, commerce: { credits: 10 } };

    const gameOnly = mergeGameStateForPersist(gameDisk, {
        commerce: { credits: 99 },
    }, { baseRevision: 3, profile: 'commerce-ui' });

    const worldAfter = worldDisk;
    const worldNext = mergeWorldStateForPersist(worldAfter, { worldTurn: 6 });

    if (gameOnly.commerce.credits !== 99 || gameOnly.stateRevision !== 4) {
        fail(`game-only advance: ${JSON.stringify(gameOnly)}`);
    } else if (worldAfter.revision !== 3) {
        fail('world unchanged when write skipped');
    } else if (worldNext.worldTurn !== 6 || worldNext.revision !== 4) {
        fail(`deferred world write merges fresh: ${JSON.stringify(worldNext)}`);
    } else if (worldNext.markets.a.stock !== 1) {
        fail('deferred world write keeps markets');
    } else {
        ok('partial dual-write skip — deferred world merge uses last persisted world');
    }
}

// --- Ordering: world first then game (livingWorldTurnOps + commerce flush pattern) ---

{
    let worldDisk = {
        revision: 2,
        worldTurn: 3,
        markets: { port: { spice: { stock: 40, priceIndex: 0.9 } } },
    };
    let gameDisk = {
        schemaVersion: 2,
        stateRevision: 2,
        commerce: { credits: 30, cargo: [{ commodityId: 'spice', qty: 2 }] },
        status: { hp: { current: 10, max: 10 } },
    };

    worldDisk = mergeWorldStateForPersist(worldDisk, {
        worldTurn: 4,
        markets: { port: { spice: { stock: 35, priceIndex: 1.0 } } },
    });

    gameDisk = mergeGameStateForPersist(gameDisk, {
        commerce: { credits: 55, cargo: [] },
        status: { hp: { current: 1, max: 10 } },
    }, { baseRevision: 2, profile: 'commerce-ui' });

    if (worldDisk.worldTurn !== 4 || worldDisk.markets.port.spice.stock !== 35) {
        fail(`world turn step: ${JSON.stringify(worldDisk)}`);
    } else if (gameDisk.commerce.credits !== 55 || (gameDisk.commerce.cargo ?? []).length !== 0) {
        fail(`game commerce after world step: ${JSON.stringify(gameDisk.commerce)}`);
    } else if (gameDisk.status.hp.current !== 10) {
        fail(`game commerce-ui keeps disk status: ${JSON.stringify(gameDisk.status)}`);
    } else if (gameDisk.stateRevision !== 3 || worldDisk.revision !== 3) {
        fail(`independent revision counters: g=${gameDisk.stateRevision} w=${worldDisk.revision}`);
    } else {
        ok('world turn then commerce flush — files advance on separate revision tracks');
    }
}

if (failed > 0) {
    process.exit(1);
}
console.log('split brain queue edge cases: all tests passed.');