#!/usr/bin/env node
'use strict';

const os = require('os');
const fs = require('fs');
const path = require('path');
const Module = require('module');

const root = path.join(__dirname, '..');
const domainBridge = path.join(root, 'out', 'domainBridge.js');
const guildBridge = path.join(root, 'out', 'guildBridge.js');
const campaignKitBridge = path.join(root, 'out', 'campaignKitBridge.js');

let failed = 0;
function fail(msg) { console.error(`FAIL: ${msg}`); failed++; }
function ok(msg) { console.log(`OK: ${msg}`); }

if (!fs.existsSync(domainBridge) || !fs.existsSync(guildBridge) || !fs.existsSync(campaignKitBridge)) {
    fail('compiled bridge modules missing — run npm run compile');
    process.exit(1);
}

const WS_PATH = path.join(os.tmpdir(), `lr-wv-test-${Date.now()}`);
fs.mkdirSync(WS_PATH, { recursive: true });

const mockVscode = {
    workspace: {
        isTrusted: true,
        workspaceFolders: [{ uri: { fsPath: WS_PATH }, name: 'test' }],
        getConfiguration: () => ({
            get: (_key, def) => def,
        }),
        onDidChangeConfiguration: () => ({ dispose: () => {} }),
    },
    window: {
        createOutputChannel: () => ({ appendLine: () => {}, show: () => {}, dispose: () => {} }),
    },
    env: { language: 'en' },
    Uri: { file: (p) => ({ fsPath: p, toString: () => `file://${p}` }) },
};

const _origLoad = Module._load;
Module._load = function (request, parent, isMain) {
    if (request === 'vscode') {
        return mockVscode;
    }
    return _origLoad.apply(this, arguments);
};

const { pickDomainForWebview } = require(domainBridge);
const { pickGuildForWebview } = require(guildBridge);
const { pickDiscoveriesForWebview, pickJobBoardForWebview } = require(campaignKitBridge);

{
    const domain = pickDomainForWebview({
        enabled: true,
        controlledRegionId: 'region_a',
        rank: 'baron',
        calendarMonth: 3,
        calendarYear: 1,
        treasury: 500,
        food: 200,
        troops: 120,
        publicOrder: 55,
        popularSupport: 50,
        agriculture: 40,
        commerce: 35,
        defense: 45,
        culture: 30,
        prestige: 25,
        monthlyActionsRemaining: 2,
        officers: [{ npcId: 'officer_a', role: 'steward' }],
        pendingEvents: ['tax_shortfall'],
        rival: {
            regionId: 'rival_b',
            trueStrength: 999,
            trueStance: 'hostile',
            disclosedStrength: 40,
            disclosedStance: 'neutral',
        },
        activeBattle: {
            opponentLabel: 'rival_b',
            rounds: [],
            maxRounds: 3,
            playerTroopsRemaining: 100,
            enemyTroopsRemaining: 80,
            secretTactic: 'flank',
        },
        flags: { secretAgenda: true },
    });
    if (!domain || domain.treasury !== 500) {
        fail('pickDomainForWebview basic fields');
    } else if (domain.rival?.trueStrength !== undefined || domain.rival?.disclosedStrength !== 40) {
        fail(`rival FoW leak: ${JSON.stringify(domain.rival)}`);
    } else if (domain.activeBattle?.secretTactic !== undefined) {
        fail('activeBattle should not expose secretTactic');
    } else if (domain.flags) {
        fail('domain flags should not be in webview payload');
    } else {
        ok('pickDomainForWebview FoW-safe rival/battle');
    }
}

{
    const guild = pickGuildForWebview({
        enabled: true,
        hallLocationId: 'tavern_hall',
        rank: 'chartered',
        calendarWeek: 2,
        calendarYear: 1,
        coffers: 250,
        supplies: 120,
        renown: 10,
        discipline: 55,
        townFavor: 50,
        facilities: 40,
        safety: 35,
        lore: 20,
        weeklyActionsRemaining: 2,
        adventurers: [{ npcId: 'hero_a', klass: 'warrior', skill: 60 }],
        pendingEvents: ['tavern_rumor'],
        pendingRequests: ['wolf_cull'],
        quests: [{
            id: 'wolf_cull',
            requestId: 'wolf_cull',
            questKind: 'hunt',
            difficulty: 30,
            rewardCoffers: 40,
            status: 'accepted',
        }],
        flags: { memberDiscontent: true },
        pendingEventsInternal: 'leak',
    });
    if (!guild || guild.coffers !== 250) {
        fail('pickGuildForWebview basic fields');
    } else if (guild.flags || guild.pendingEventsInternal) {
        fail(`guild internal fields leaked: ${JSON.stringify(guild)}`);
    } else if (!guild.pendingRequests?.[0]?.id || !guild.pendingRequests[0].summary) {
        fail('guild request board should expose catalog summaries');
    } else if (guild.adventurers[0].skill !== undefined) {
        fail('guild webview should not expose raw skill numbers');
    } else {
        ok('pickGuildForWebview public subset');
    }
}

{
    const discoveries = pickDiscoveriesForWebview({
        version: 1,
        entries: [{
            id: 'seed_shard',
            kind: 'material',
            label: 'Black shard',
            status: 'unidentified',
            siteId: 'north_metro',
            valueHint: 'secret gm hint',
        }],
    });
    if (!discoveries?.[0]?.label || discoveries[0].valueHint !== undefined) {
        fail('campaign discoveries webview must hide valueHint');
    } else {
        ok('pickDiscoveriesForWebview');
    }
}

{
    const board = pickJobBoardForWebview([{
        id: 'board_test',
        kind: 'rumor',
        title: 'Lights in the tunnels',
        summary: 'Travelers whisper about power.',
        siteName: 'North Metro Entrance',
    }]);
    if (!board?.[0]?.summary || board[0].internal) {
        fail('pickJobBoardForWebview subset');
    } else {
        ok('pickJobBoardForWebview');
    }
}

if (failed > 0) {
    process.exit(1);
}
console.log('world view simulation payload: all tests passed.');