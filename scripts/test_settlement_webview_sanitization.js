#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const corePath = path.join(root, 'out', 'settlementViewCore.js');

let failed = 0;
function fail(msg) { console.error(`FAIL: ${msg}`); failed++; }
function ok(msg) { console.log(`OK: ${msg}`); }

if (!fs.existsSync(corePath)) {
    fail('out/settlementViewCore.js missing — run npm run compile');
    process.exit(1);
}

const {
    SETTLEMENT_VIEW_SNAPSHOT_KEYS,
    SETTLEMENT_EXPANSION_PREVIEW_KEYS,
    sanitizeSettlementViewForWebview,
    sanitizeSettlementExpansionPreviewsForWebview,
} = require(corePath);

{
    const raw = {
        version: 1,
        settlementId: 'camp',
        name: 'Camp',
        layerId: 'z0',
        layers: [{ id: 'z0', label: 'Ground' }],
        width: 16,
        height: 16,
        tiles: [{
            x: 1,
            y: 2,
            z: 0,
            code: 'floor',
            label: 'Yard',
            tone: 'neutral',
            hiddenGmNotes: 'secret bunker',
            rawLayoutZone: { id: 'z1' },
        }],
        markers: [{
            id: 'm1',
            x: 3,
            y: 4,
            z: 0,
            kind: 'incident',
            label: 'Fire',
            tone: 'warning',
            detail: 'smoke',
            gmOnly: true,
        }],
        legend: ['floor'],
        warnings: ['low water'],
        __evil: 'leak',
        settlement_state_raw: { morale: 1 },
    };

    const safe = sanitizeSettlementViewForWebview(raw);
    if (!safe || safe.__evil || safe.settlement_state_raw) {
        fail('sanitize drops unknown settlement view roots');
    } else if (safe.tiles[0].hiddenGmNotes || safe.tiles[0].rawLayoutZone) {
        fail('sanitize strips unknown tile fields');
    } else if (safe.markers[0].gmOnly) {
        fail('sanitize strips unknown marker fields');
    } else if (!safe.tiles[0].label || safe.markers[0].kind !== 'incident') {
        fail('sanitize keeps allowed tile/marker fields');
    } else {
        ok('settlement view webview sanitization');
    }

    for (const key of SETTLEMENT_VIEW_SNAPSHOT_KEYS) {
        if (key === 'legend' || key === 'warnings') { continue; }
        if (safe[key] === undefined && raw[key] !== undefined && key !== 'tiles' && key !== 'markers') {
            fail(`expected snapshot key preserved: ${key}`);
        }
    }
    ok('settlement view keys align with whitelist');
}

{
    const previews = sanitizeSettlementExpansionPreviewsForWebview([{
        layerId: 'z-1',
        profile: 'cellar',
        tiles: [{ x: 0, y: 0, z: -1, code: 'wall', label: 'Wall', secret: true }],
        markers: [],
        warnings: ['draft'],
        internalSeed: 999,
    }]);
    if (!previews.length || previews[0].internalSeed) {
        fail('expansion preview sanitization drops internal fields');
    } else if (previews[0].tiles[0].secret) {
        fail('expansion preview tile fields whitelisted');
    } else {
        ok('expansion preview webview sanitization');
    }

    for (const key of SETTLEMENT_EXPANSION_PREVIEW_KEYS) {
        if (previews[0][key] === undefined && key !== 'warnings') {
            fail(`expected preview key: ${key}`);
        }
    }
    ok('expansion preview keys align with whitelist');
}

if (failed > 0) {
    process.exit(1);
}
console.log('settlement webview sanitization: all tests passed.');