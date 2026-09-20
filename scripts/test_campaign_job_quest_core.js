#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const corePath = path.join(root, 'out', 'campaignJobQuestCore.js');

let failed = 0;
function fail(msg) { console.error(`FAIL: ${msg}`); failed++; }
function ok(msg) { console.log(`OK: ${msg}`); }

if (!fs.existsSync(corePath)) {
    fail('out/campaignJobQuestCore.js missing - run npm run compile');
    process.exit(1);
}

const {
    createQuestHookFromBoardEntry,
    filterJobBoardByQuestHooks,
    questIdFromBoardEntry,
    upsertCampaignQuestHook,
} = require(corePath);

const sampleEntry = {
    id: 'board_salvage_contract_north_metro_0',
    kind: 'job',
    title: 'Salvage contract: North Metro',
    summary: 'Paid run into the tunnels.',
    siteId: 'north_metro',
    siteName: 'North Metro Entrance',
    rewardHint: 'credits',
};

{
    const hook = createQuestHookFromBoardEntry(sampleEntry, 3, 'active');
    if (!hook || hook.source !== 'campaign' || hook.status !== 'active') {
        fail(`createQuestHookFromBoardEntry: ${JSON.stringify(hook)}`);
    } else if (hook.relatedId !== sampleEntry.id) {
        fail('relatedId should be board entry id');
    } else if (!questIdFromBoardEntry(sampleEntry.id).startsWith('quest_campaign_')) {
        fail('quest id prefix');
    } else {
        ok('createQuestHookFromBoardEntry');
    }
}

{
    const filtered = filterJobBoardByQuestHooks([sampleEntry], [{
        id: questIdFromBoardEntry(sampleEntry.id),
        title: sampleEntry.title,
        description: sampleEntry.summary,
        source: 'campaign',
        relatedId: sampleEntry.id,
        status: 'active',
        turnGenerated: 3,
    }]);
    if (filtered.length !== 0) {
        fail('accepted campaign hook should hide board row');
    } else {
        ok('filterJobBoardByQuestHooks');
    }
}

{
    const { hooks, changed } = upsertCampaignQuestHook([], sampleEntry, 5);
    if (!changed || hooks.length !== 1 || hooks[0].status !== 'active') {
        fail(`upsertCampaignQuestHook insert: ${JSON.stringify(hooks)}`);
    } else {
        ok('upsertCampaignQuestHook insert');
    }
}

if (failed > 0) {
    process.exit(1);
}
console.log('campaignJobQuestCore: all tests passed.');