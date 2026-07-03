#!/usr/bin/env node
'use strict';

const path = require('path');
const root = path.join(__dirname, '..');
const trustPath = path.join(root, 'out', 'npcWhereaboutsTrustCore.js');
const sanitizePath = path.join(root, 'out', 'gameStateWebviewSanitize.js');

let failed = 0;
function fail(msg) { console.error(`FAIL: ${msg}`); failed++; }
function ok(msg) { console.log(`OK: ${msg}`); }

const fs = require('fs');
if (!fs.existsSync(trustPath) || !fs.existsSync(sanitizePath)) {
    fail('compiled outputs missing — run npm run compile');
    process.exit(1);
}

const {
    sanitizeNpcAgencyOpsForWebview,
    TRUST_WHEREABOUTS_UNKNOWN_MAX,
    TRUST_WHEREABOUTS_EXACT_MIN,
} = require(trustPath);
const {
    sanitizeGameStateForWebview,
    sanitizeTurnResultForWebview,
} = require(sanitizePath);

const ops = [{
    npcId: 'elda',
    locationId: 'secret_base',
    arrivesTurn: 9,
    agenda: 'restock_wheat',
    reason: 'food_crisis',
}];

{
    const sanitized = sanitizeNpcAgencyOpsForWebview(ops, {
        readTrust: () => TRUST_WHEREABOUTS_UNKNOWN_MAX,
    });
    if (sanitized[0].locationId || sanitized[0].agenda || sanitized[0].precision !== 'unknown') {
        fail(`low trust hides location/agenda: ${JSON.stringify(sanitized)}`);
    } else {
        ok('low trust hides location/agenda');
    }
}

{
    const sanitized = sanitizeNpcAgencyOpsForWebview(ops, {
        readTrust: () => 50,
    });
    if (sanitized[0].locationId || sanitized[0].agenda || sanitized[0].precision !== 'approximate') {
        fail(`mid trust hides exact location: ${JSON.stringify(sanitized)}`);
    } else {
        ok('mid trust hides exact location');
    }
}

{
    const sanitized = sanitizeNpcAgencyOpsForWebview(ops, {
        readTrust: () => TRUST_WHEREABOUTS_EXACT_MIN,
    });
    if (
        sanitized[0].locationId !== 'secret_base'
        || sanitized[0].agenda !== 'restock_wheat'
        || sanitized[0].precision !== 'exact'
    ) {
        fail(`high trust keeps details: ${JSON.stringify(sanitized)}`);
    } else {
        ok('high trust keeps details');
    }
}

{
    const state = sanitizeGameStateForWebview({
        entries: [],
        hiddenState: { bossHp: 3 },
        director: { act: '1', notes: 'secret' },
        profileUpdates: [{ npcId: 'x' }],
    });
    if (
        state.hiddenState
        || state.profileUpdates
        || state.director
        || '__SECRET__' in state
    ) {
        fail(`game state webview sanitize: ${JSON.stringify(state)}`);
    } else if (!Array.isArray(state.entries)) {
        fail('game state whitelist keeps entries array');
    } else {
        ok('game state webview sanitize');
    }
}

{
    const turn = sanitizeTurnResultForWebview(
        { turnId: 't1', npcAgencyOps: ops },
        { readTrust: () => TRUST_WHEREABOUTS_UNKNOWN_MAX }
    );
    if (turn.npcAgencyOps[0].locationId || turn.turnId !== 't1') {
        fail(`turn result sanitize: ${JSON.stringify(turn)}`);
    } else {
        ok('turn result sanitize');
    }
}

if (failed > 0) {
    process.exit(1);
}
console.log('npc agency webview sanitize: all tests passed.');