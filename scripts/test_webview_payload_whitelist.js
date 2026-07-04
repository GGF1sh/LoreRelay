#!/usr/bin/env node
'use strict';

const path = require('path');
const root = path.join(__dirname, '..');
const corePath = path.join(root, 'out', 'gameStateWebviewSanitizeCore.js');
const sanitizePath = path.join(root, 'out', 'gameStateWebviewSanitize.js');

let failed = 0;
function fail(msg) { console.error(`FAIL: ${msg}`); failed++; }
function ok(msg) { console.log(`OK: ${msg}`); }

const fs = require('fs');
if (!fs.existsSync(corePath) || !fs.existsSync(sanitizePath)) {
    fail('compiled outputs missing — run npm run compile');
    process.exit(1);
}

const {
    pickGameStateForWebview,
    pickTurnResultForWebview,
    sanitizeStatePatchForWebview,
    WEBVIEW_GAME_STATE_ROOT_KEYS,
} = require(corePath);
const {
    sanitizeGameStateForWebview,
    sanitizeTurnResultForWebview,
} = require(sanitizePath);
const { TRUST_WHEREABOUTS_UNKNOWN_MAX } = require(path.join(root, 'out', 'npcWhereaboutsTrustCore.js'));

{
    const raw = {
        entries: [{ id: 'e1', role: 'gm', sender: 'GM', content: 'hi', __evil: true }],
        status: { hp: { current: 5, max: 10 } },
        options: ['A'],
        hiddenState: { bossHp: 1 },
        director: { act: '1', notes: 'secret' },
        commerce: { credits: 99, secretLedger: ['no'] },
        world: { currentLocationId: 'loc_a', secretRoute: 'no' },
        profileUpdates: [{ npcId: 'x' }],
        __SECRET_TEST_DATA__: 'leak',
        stateRevision: 7,
    };
    const picked = pickGameStateForWebview(raw);
    if (
        picked.__SECRET_TEST_DATA__
        || picked.hiddenState
        || picked.profileUpdates
        || picked.stateRevision
        || picked.director
    ) {
        fail(`unknown/secret roots stripped: ${JSON.stringify(picked)}`);
    } else {
        ok('game state whitelist drops unknown and GM-only roots');
    }
    if (!picked.status || !picked.entries?.[0]?.content || picked.entries[0].__evil) {
        fail(`allowed fields preserved: ${JSON.stringify(picked)}`);
    } else {
        ok('game state whitelist keeps allowed fields');
    }
    if (picked.commerce?.credits !== 99 || picked.world?.currentLocationId !== 'loc_a') {
        fail(`commerce/world public roots preserved: ${JSON.stringify(picked)}`);
    } else if (picked.commerce.secretLedger || picked.world.secretRoute) {
        fail(`commerce/world private fields stripped: ${JSON.stringify(picked)}`);
    } else {
        ok('game state whitelist keeps commerce/world public roots');
    }
}

{
    const viaSanitize = sanitizeGameStateForWebview({
        entries: [{
            id: 'e2',
            role: 'gm',
            sender: 'GM',
            content: 'scene',
            rawImagePath: 'C:\\\\Users\\\\secret\\\\scene.png',
        }],
        latestImageRawPath: 'I:\\\\AI\\\\output\\\\latest.png',
        status: { hp: { current: 1, max: 1 } },
    });
    const entry = viaSanitize.entries?.[0];
    if (entry?.rawImagePath || viaSanitize.latestImageRawPath) {
        fail(`absolute media paths stripped from webview payload: ${JSON.stringify(viaSanitize)}`);
    } else {
        ok('absolute media paths stripped from webview payload');
    }
    const safe = sanitizeGameStateForWebview({
        entries: [{
            id: 'e3',
            role: 'gm',
            sender: 'GM',
            content: 'ok',
            rawImagePath: 'output/scene.png',
        }],
        latestImageRawPath: 'output/latest.png',
    });
    if (safe.entries?.[0]?.rawImagePath !== 'output/scene.png' || safe.latestImageRawPath !== 'output/latest.png') {
        fail(`safe relative media refs preserved: ${JSON.stringify(safe)}`);
    } else {
        ok('safe relative media refs preserved');
    }
}

{
    const viaSanitize = sanitizeGameStateForWebview({
        entries: [],
        __FUTURE_HIDDEN_FIELD__: { x: 1 },
        hiddenState: { y: 2 },
    });
    if (viaSanitize.__FUTURE_HIDDEN_FIELD__ || viaSanitize.hiddenState) {
        fail(`sanitizeGameStateForWebview whitelist: ${JSON.stringify(viaSanitize)}`);
    } else {
        ok('sanitizeGameStateForWebview uses whitelist');
    }
}

{
    const patches = sanitizeStatePatchForWebview([
        { op: 'replace', path: '/status/hp/current', value: 3 },
        { op: 'add', path: '/hiddenState/secret', value: true },
        { op: 'replace', path: '/futureSecret/x', value: 'nope' },
        { op: 'replace', path: '/director', value: { act: '2', notes: 'nope' } },
        { op: 'replace', path: '/director/notes', value: 'still secret' },
        { op: 'replace', path: '/commerce', value: { credits: 5, hiddenMargin: 999 } },
        { op: 'replace', path: '/world', value: { currentLocationId: 'loc_b', secretRoute: true } },
    ]);
    if (patches.length !== 4) {
        fail(`statePatch filter count: ${JSON.stringify(patches)}`);
    } else if (patches[1].value?.notes) {
        fail(`director patch should strip notes: ${JSON.stringify(patches[1])}`);
    } else if (patches.some((p) => JSON.stringify(p).includes('hiddenMargin') || JSON.stringify(p).includes('secretRoute'))) {
        fail(`commerce/world root patches should be sanitized: ${JSON.stringify(patches)}`);
    } else {
        ok('statePatch allowlist filters unknown/sensitive paths');
    }
}

{
    const turn = pickTurnResultForWebview({
        turnId: 't1',
        narration: 'secret prose',
        playerAction: 'do thing',
        agentic: { mode: 'referee-narrator', refereeOk: true, narratorOk: true },
        reputationOps: [{ factionId: 'f1', delta: 1 }],
        statePatch: [{ op: 'replace', path: '/hiddenState/x', value: 1 }],
        triggeredLore: ['Lore A'],
        __SECRET__: 'no',
    });
    if (
        turn.narration
        || turn.playerAction
        || turn.agentic
        || turn.reputationOps
        || turn.__SECRET__
        || (turn.statePatch && turn.statePatch.length > 0)
    ) {
        fail(`turn result whitelist: ${JSON.stringify(turn)}`);
    } else if (turn.turnId !== 't1' || !turn.triggeredLore) {
        fail(`turn result allowed fields: ${JSON.stringify(turn)}`);
    } else {
        ok('turn result whitelist');
    }
}

{
    const keys = new Set(WEBVIEW_GAME_STATE_ROOT_KEYS);
    if (!keys.has('entries') || keys.has('hiddenState')) {
        fail('WEBVIEW_GAME_STATE_ROOT_KEYS manifest');
    } else {
        ok('WEBVIEW_GAME_STATE_ROOT_KEYS manifest');
    }
}

{
    const turn = sanitizeTurnResultForWebview(
        {
            turnId: 't2',
            narration: 'x',
            npcAgencyOps: [{
                npcId: 'elda',
                locationId: 'secret',
                arrivesTurn: 3,
            }],
        },
        { readTrust: () => TRUST_WHEREABOUTS_UNKNOWN_MAX }
    );
    if (turn.narration || turn.npcAgencyOps?.[0]?.locationId) {
        fail(`sanitizeTurnResult combines whitelist + trust: ${JSON.stringify(turn)}`);
    } else {
        ok('sanitizeTurnResult whitelist + trust');
    }
}

if (failed > 0) {
    process.exit(1);
}
console.log('webview payload whitelist: all tests passed.');
