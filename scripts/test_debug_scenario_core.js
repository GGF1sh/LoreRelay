#!/usr/bin/env node
'use strict';

const path = require('path');
const {
    isDebugScenarioPack,
    parseDebugCommand,
    executeDebugCommand,
    buildHelpNarration,
} = require('../out/debugScenarioCore');

let failed = 0;
function fail(msg) { console.error(`FAIL: ${msg}`); failed++; }
function ok(msg) { console.log(`OK: ${msg}`); }

const ctx = {
    npcs: [
        { id: 'npc_elda', name: '商人エルダ', trust: 50 },
        { id: 'npc_aren', name: '衛兵アレン', trust: 40 },
    ],
    regions: [
        { id: 'harbor_plaza', name: '港の広場' },
        { id: 'market_lane', name: '市場通り' },
        { id: 'old_docks', name: '古い波止場' },
    ],
    worldTurn: 3,
    discoveredRegionIds: ['harbor_plaza'],
    rumoredRegionIds: [],
};

if (!isDebugScenarioPack({ tags: ['debug', 'sandbox'] })) {
    fail('isDebugScenarioPack positive');
} else {
    ok('isDebugScenarioPack positive');
}

if (isDebugScenarioPack({ tags: ['starter'] })) {
    fail('isDebugScenarioPack negative');
} else {
    ok('isDebugScenarioPack negative');
}

const help = parseDebugCommand('ヘルプ', ctx);
if (!help || help.kind !== 'help') {
    fail('parse help');
} else {
    ok('parse help');
}

const trustUp = parseDebugCommand('エルダの好感度を上げて', ctx);
if (!trustUp || trustUp.kind !== 'trust_delta' || trustUp.trustDelta !== 10) {
    fail('parse trust up default', trustUp);
} else {
    ok('parse trust up default');
}

const trustSet = parseDebugCommand('アレンの信頼を80に', ctx);
if (!trustSet || trustSet.kind !== 'trust_set' || trustSet.trustValue !== 80) {
    fail('parse trust set', trustSet);
} else {
    ok('parse trust set');
}

const fogAll = parseDebugCommand('地図の霧を晴らして', ctx);
if (!fogAll || fogAll.kind !== 'reveal_all') {
    fail('parse fog all', fogAll);
} else {
    ok('parse fog all');
}

const fogRegion = parseDebugCommand('市場通りを発見', ctx);
if (!fogRegion || fogRegion.kind !== 'reveal_region' || fogRegion.regionId !== 'market_lane') {
    fail('parse fog region', fogRegion);
} else {
    ok('parse fog region');
}

const sim = parseDebugCommand('5ターン経過', ctx);
if (!sim || sim.kind !== 'world_sim' || sim.worldSimSteps !== 5) {
    fail('parse world sim', sim);
} else {
    ok('parse world sim');
}

const ctxWithLocs = { ...ctx, locations: [{ id: 'elda_shop', name: 'エルダの店' }] };
const rest = parseDebugCommand('宿で休む', ctxWithLocs);
if (!rest || rest.kind !== 'narrative_rest' || rest.worldSimSteps !== 1) {
    fail('parse narrative rest', rest);
} else {
    ok('parse narrative rest');
}

const hp = parseDebugCommand('HPを全回復', { ...ctx, hp: { current: 5, max: 20 } });
if (!hp || hp.kind !== 'hp_full') {
    fail('parse hp full', hp);
} else {
    ok('parse hp full');
}

if (parseDebugCommand('普通に町を歩く', ctx) !== null) {
    fail('reject non-command');
} else {
    ok('reject non-command');
}

const trustOutcome = executeDebugCommand(trustUp, ctx);
if (!trustOutcome.npcUpdates || trustOutcome.npcUpdates.length !== 1) {
    fail('execute trust delta updates');
} else {
    ok('execute trust delta updates');
}

const fogOutcome = executeDebugCommand(fogAll, ctx);
if (!fogOutcome.cartographyReveal?.regions || fogOutcome.cartographyReveal.regions.length !== 3) {
    fail('execute reveal all regions');
} else {
    ok('execute reveal all regions');
}

if (!buildHelpNarration(ctx).includes('デバッグサンドボックス')) {
    fail('help narration');
} else {
    ok('help narration');
}

if (failed > 0) {
    process.exit(1);
}
console.log('All debug scenario core tests passed.');