#!/usr/bin/env node
'use strict';

/**
 * Observer tick vs acceptCampaignJob concurrent world_state writes.
 * Pure merge tests — no vscode/fs (simulates saveWorldState read-merge-write).
 */

const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const corePath = path.join(root, 'out', 'workspaceStateQueueCore.js');

let failed = 0;
function fail(msg) { console.error(`FAIL: ${msg}`); failed++; }
function ok(msg) { console.log(`OK: ${msg}`); }

if (!fs.existsSync(corePath)) {
    fail('out/workspaceStateQueueCore.js missing - run npm run compile first');
    process.exit(1);
}

const { mergeQuestHooks, mergeWorldStateForPersist } = require(corePath);

const acceptHook = {
    id: 'quest_campaign_scrap_run',
    title: 'Scrap run',
    description: 'Recover parts from the metro.',
    source: 'campaign',
    relatedId: 'scrap_run',
    status: 'active',
    turnGenerated: 5,
};

const observerGeneratedHook = {
    id: 'quest_event_food_crisis',
    title: 'Food crisis',
    description: 'Stabilize supplies.',
    source: 'event',
    relatedId: 'wce_food',
    status: 'available',
    turnGenerated: 6,
};

{
    const merged = mergeQuestHooks(
        [acceptHook],
        [observerGeneratedHook]
    );
    if (merged.length !== 2) {
        fail(`mergeQuestHooks should union by id: ${JSON.stringify(merged)}`);
    } else if (!merged.some((h) => h.id === acceptHook.id)) {
        fail('accept hook should survive observer merge');
    } else if (!merged.some((h) => h.id === observerGeneratedHook.id)) {
        fail('observer hook should be present after merge');
    } else {
        ok('mergeQuestHooks unions accept + observer hooks');
    }
}

{
    // Observer tick saves a stale snapshot (read before accept) without the new campaign hook.
    const diskAfterAccept = {
        worldTurn: 5,
        revision: 3,
        questHooks: [acceptHook],
        markets: { hub: { wheat: { stock: 12, priceIndex: 1.1 } } },
    };
    const staleObserverSnapshot = {
        worldTurn: 6,
        questHooks: [observerGeneratedHook],
        markets: { hub: { wheat: { stock: 8, priceIndex: 1.2 } } },
    };
    const merged = mergeWorldStateForPersist(diskAfterAccept, staleObserverSnapshot);
    if (!merged.questHooks.some((h) => h.id === acceptHook.id)) {
        fail(`accept hook lost after observer save: ${JSON.stringify(merged.questHooks)}`);
    } else if (!merged.questHooks.some((h) => h.id === observerGeneratedHook.id)) {
        fail(`observer hook missing after merge: ${JSON.stringify(merged.questHooks)}`);
    } else if (merged.markets.hub.wheat.stock !== 8) {
        fail(`observer market update should apply: ${merged.markets.hub.wheat.stock}`);
    } else if (merged.worldTurn !== 6) {
        fail(`observer worldTurn should win: ${merged.worldTurn}`);
    } else {
        ok('observer stale snapshot merge keeps accept questHooks');
    }
}

{
    // acceptCampaignJob patch: only questHooks in incoming — must not clobber observer markets.
    const diskAfterObserver = {
        worldTurn: 6,
        revision: 4,
        questHooks: [observerGeneratedHook],
        markets: { hub: { wheat: { stock: 8, priceIndex: 1.2 } } },
    };
    const acceptPatch = {
        questHooks: [observerGeneratedHook, acceptHook],
    };
    const merged = mergeWorldStateForPersist(diskAfterObserver, acceptPatch);
    if (merged.markets.hub.wheat.stock !== 8) {
        fail(`accept patch should not reset observer markets: ${merged.markets.hub.wheat.stock}`);
    } else if (merged.worldTurn !== 6) {
        fail(`accept patch should not reset worldTurn: ${merged.worldTurn}`);
    } else if (!merged.questHooks.some((h) => h.id === acceptHook.id)) {
        fail(`accept hook missing after patch merge: ${JSON.stringify(merged.questHooks)}`);
    } else {
        ok('accept questHooks-only patch preserves observer world fields');
    }
}

{
    // Incoming wins on same id (status promotion).
    const disk = {
        questHooks: [{ ...acceptHook, status: 'available' }],
    };
    const incoming = {
        questHooks: [{ ...acceptHook, status: 'active' }],
    };
    const merged = mergeQuestHooks(disk.questHooks, incoming.questHooks);
    if (merged[0].status !== 'active') {
        fail(`incoming should win on hook id collision: ${merged[0].status}`);
    } else {
        ok('mergeQuestHooks incoming wins on same id');
    }
}

if (failed > 0) {
    process.exit(1);
}
console.log('world_state quest accept observer race: all tests passed.');