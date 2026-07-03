#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const corePath = path.join(root, 'out', 'settlementViewCore.js');
const settlementCorePath = path.join(root, 'out', 'settlementCore.js');

let failed = 0;
function fail(msg) { console.error(`FAIL: ${msg}`); failed++; }
function ok(msg) { console.log(`OK: ${msg}`); }

for (const p of [corePath, settlementCorePath]) {
    if (!fs.existsSync(p)) {
        fail(`${p} missing - run npm run compile first`);
        process.exit(1);
    }
}

const {
    buildSettlementViewSnapshot,
    resolveSelectedLayerId,
    layerIdToZ,
    pickSettlementViewTileKeys,
    pickSettlementViewMarkerKeys,
    pickSettlementViewSnapshotKeys,
    SETTLEMENT_VIEW_TILE_KEYS,
    SETTLEMENT_VIEW_MARKER_KEYS,
    SETTLEMENT_VIEW_SNAPSHOT_KEYS,
    MAX_VIEW_TILES,
    MAX_VIEW_MARKERS,
    MAX_VIEW_LABEL,
    MAX_VIEW_DETAIL,
} = require(corePath);
const { parseSettlementState, parseSettlementLayout } = require(settlementCorePath);

const baseState = parseSettlementState({
    version: 1,
    settlementId: 'scrapbound_hub',
    name: 'Scrapbound Enclave',
    morale: 55,
    safety: 40,
    stocks: [
        { id: 'food', amount: 0 },
        { id: 'parts', amount: 2 },
        { id: 'water', amount: 10 },
    ],
    structures: [
        { id: 'market_hall', name: 'Market Hall', status: 'intact', layerId: 'z0' },
        { id: 'workshop_a', name: 'Workshop', status: 'damaged', layerId: 'z0', note: 'Needs repair' },
        { id: 'cellar_store', name: 'Cellar Store', status: 'intact', layerId: 'z-1' },
    ],
    residents: [{ npcId: 'resident_1', role: 'guard' }],
    visitors: [{ npcId: 'visitor_1', untilWorldTurn: 20, purpose: 'trade' }],
    merchants: [{ npcId: 'trader_1', untilWorldTurn: 25, wares: ['parts', 'food'] }],
    incidents: [{
        id: 'inc_pump',
        worldTurn: 5,
        kind: 'shortage',
        severity: 'warning',
        resolved: false,
        text: 'SECRET: hidden pump room flooded with classified details',
    }],
});

if (!baseState) {
    fail('fixture state should parse');
    process.exit(1);
}

{
    const snap = buildSettlementViewSnapshot({});
    if (snap !== undefined) {
        fail('no state should return undefined');
    } else {
        ok('no state returns undefined');
    }
}

{
    const snap = buildSettlementViewSnapshot({ state: baseState });
    if (!snap) {
        fail('state should produce snapshot');
    } else if (!Array.isArray(snap.warnings) || !snap.warnings.includes('layout_fallback')) {
        fail(`fallback layout should warn layout_fallback: ${JSON.stringify(snap?.warnings)}`);
    } else if (snap.tiles.length < 4) {
        fail(`fallback should emit tiles: ${snap.tiles.length}`);
    } else if (!snap.markers.some((m) => m.kind === 'incident')) {
        fail('fallback should include incident marker');
    } else if (snap.markers.some((m) => m.label.includes('SECRET') || m.detail?.includes('SECRET'))) {
        fail('incident marker must not leak full secret text');
    } else if (!snap.markers.some((m) => m.kind === 'stock_low')) {
        fail('low/depleted stocks should become stock_low markers');
    } else if (snap.markers.some((m) => /\b\d+\b/.test(m.label) && m.kind === 'stock_low')) {
        fail('stock_low markers must not expose raw quantities');
    } else {
        ok('fallback layout is deterministic and sanitized');
    }
}

{
    const snapA = buildSettlementViewSnapshot({ state: baseState, selectedLayerId: 'z0' });
    const snapB = buildSettlementViewSnapshot({ state: baseState, selectedLayerId: 'z0' });
    if (!snapA || !snapB || JSON.stringify(snapA) !== JSON.stringify(snapB)) {
        fail('same inputs must produce identical snapshots');
    } else {
        ok('deterministic snapshot for same inputs');
    }
}

{
    const z0 = buildSettlementViewSnapshot({ state: baseState, selectedLayerId: 'z0' });
    const zNeg1 = buildSettlementViewSnapshot({ state: baseState, selectedLayerId: 'z-1' });
    if (!z0 || !zNeg1) {
        fail('layer snapshots should build');
    } else if (z0.tiles.some((t) => t.label === 'Cellar Store')) {
        fail('z0 snapshot should not include z-1 structure tiles');
    } else if (!zNeg1.tiles.some((t) => t.label === 'Cellar Store')) {
        fail('z-1 snapshot should include cellar structure tile');
    } else if (z0.layerId !== 'z0' || zNeg1.layerId !== 'z-1') {
        fail('snapshot layerId should match selection');
    } else {
        ok('selected layer filters tiles');
    }
}

{
    const snap = buildSettlementViewSnapshot({ state: baseState, selectedLayerId: 'invalid' });
    if (!snap || snap.layerId !== 'z0') {
        fail(`invalid layer should fall back to z0: ${snap?.layerId}`);
    } else if (resolveSelectedLayerId('bogus') !== 'z0') {
        fail('resolveSelectedLayerId should fall back');
    } else if (layerIdToZ('z1') !== 1 || layerIdToZ('z-2') !== -2) {
        fail('layerIdToZ mapping incorrect');
    } else {
        ok('invalid layer falls back safely');
    }
}

{
    const layout = parseSettlementLayout({
        version: 1,
        settlementId: 'scrapbound_hub',
        layers: ['z0', 'z-1'],
        zones: [
            { id: 'zone_market', layerId: 'z0', label: 'Central Market', x: 8, y: 8 },
            { id: 'zone_cellar', layerId: 'z-1', label: 'Water Channel', x: 4, y: 4 },
        ],
        markers: [
            { id: 'pin_trader', layerId: 'z0', label: 'Merchant post', x: 9, y: 8 },
        ],
    });
    const snap = buildSettlementViewSnapshot({ state: baseState, layout, selectedLayerId: 'z0' });
    if (!snap) {
        fail('layout snapshot should build');
    } else if (snap.warnings?.includes('layout_fallback')) {
        fail('explicit layout should not use fallback warning');
    } else if (!snap.tiles.some((t) => t.code === 'market')) {
        fail('layout zone should expand to market tiles');
    } else if (!snap.markers.some((m) => m.id === 'layout_pin_trader')) {
        fail('layout marker should appear in snapshot');
    } else {
        ok('layout zones and markers are projected');
    }
}

{
    const layout = parseSettlementLayout({
        version: 1,
        settlementId: 'other_site',
        layers: ['z0'],
        zones: [{ id: 'zone_a', layerId: 'z0', label: 'Plaza', x: 2, y: 2 }],
        markers: [],
    });
    const snap = buildSettlementViewSnapshot({ state: baseState, layout });
    if (!snap?.warnings?.includes('layout_mismatch')) {
        fail('mismatched layout id should warn and use fallback');
    } else if (!snap.warnings.includes('layout_fallback')) {
        fail('mismatched layout should still fallback');
    } else {
        ok('layout settlementId mismatch handled safely');
    }
}

{
    const dirtyLabel = 'Hello\x00world\nsecret';
    const dirtyDetail = 'Detail\x7fwith\x01control';
    const state = {
        ...baseState,
        structures: [{
            id: 'note_struct',
            name: dirtyLabel,
            status: 'intact',
            layerId: 'z0',
            note: dirtyDetail,
        }],
        incidents: [],
        residents: [],
        visitors: [],
        merchants: [],
        stocks: [],
    };
    const snap = buildSettlementViewSnapshot({ state });
    const noteMarker = snap?.markers.find((m) => m.id === 'note_note_struct');
    if (!noteMarker) {
        fail('structure note marker expected');
    } else if (noteMarker.label.includes('\x00') || noteMarker.detail?.includes('\x01')) {
        fail('control characters should be stripped from labels/details');
    } else if (noteMarker.label.length > MAX_VIEW_LABEL) {
        fail('label should be clamped');
    } else {
        ok('labels and details are clamped and control characters removed');
    }
}

{
    const manyStructures = Array.from({ length: 40 }, (_, i) => ({
        id: `struct_${i}`,
        name: `Building ${i}`,
        status: 'intact',
        layerId: 'z0',
    }));
    const state = {
        ...baseState,
        structures: manyStructures,
        residents: Array.from({ length: 50 }, (_, i) => ({ npcId: `npc_${i}` })),
        visitors: [],
        merchants: [],
        incidents: [],
        stocks: [],
    };
    const snap = buildSettlementViewSnapshot({
        state,
        options: { maxTiles: 20, maxMarkers: 10 },
    });
    if (!snap) {
        fail('capped snapshot should build');
    } else if (snap.tiles.length > 20) {
        fail(`tile cap failed: ${snap.tiles.length}`);
    } else if (snap.markers.length > 10) {
        fail(`marker cap failed: ${snap.markers.length}`);
    } else if (!snap.warnings?.includes('tile_cap_reached') || !snap.warnings?.includes('marker_cap_reached')) {
        fail(`cap warnings expected: ${JSON.stringify(snap.warnings)}`);
    } else {
        ok('caps are enforced with warnings');
    }
}

{
    const snap = buildSettlementViewSnapshot({ state: baseState });
    if (!snap) {
        fail('snapshot required for allow-list test');
    } else {
        for (const tile of snap.tiles) {
            const keys = Object.keys(tile);
            const allowed = new Set(SETTLEMENT_VIEW_TILE_KEYS);
            if (keys.some((k) => !allowed.has(k))) {
                fail(`extra tile keys: ${keys.join(',')}`);
            }
            const picked = pickSettlementViewTileKeys(tile);
            if (Object.keys(picked).some((k) => !allowed.has(k))) {
                fail('pickSettlementViewTileKeys leaked keys');
            }
        }
        for (const marker of snap.markers) {
            const keys = Object.keys(marker);
            const allowed = new Set(SETTLEMENT_VIEW_MARKER_KEYS);
            if (keys.some((k) => !allowed.has(k))) {
                fail(`extra marker keys: ${keys.join(',')}`);
            }
            if (marker.detail && marker.detail.length > MAX_VIEW_DETAIL) {
                fail('detail exceeds cap');
            }
            const picked = pickSettlementViewMarkerKeys(marker);
            if (Object.keys(picked).some((k) => !allowed.has(k))) {
                fail('pickSettlementViewMarkerKeys leaked keys');
            }
        }
        const topKeys = Object.keys(snap);
        const allowedTop = new Set(SETTLEMENT_VIEW_SNAPSHOT_KEYS);
        if (topKeys.some((k) => !allowedTop.has(k))) {
            fail(`extra snapshot keys: ${topKeys.join(',')}`);
        }
        const pickedTop = pickSettlementViewSnapshotKeys(snap);
        if (Object.keys(pickedTop).some((k) => !allowedTop.has(k))) {
            fail('pickSettlementViewSnapshotKeys leaked keys');
        }
        ok('tile/marker/snapshot key allow-lists enforced');
    }
}

{
    const stateClone = JSON.parse(JSON.stringify(baseState));
    const layoutClone = JSON.parse(JSON.stringify(parseSettlementLayout({
        version: 1,
        settlementId: 'scrapbound_hub',
        layers: ['z0'],
        zones: [{ id: 'zone_a', layerId: 'z0', label: 'Market', x: 3, y: 3 }],
        markers: [],
    })));
    buildSettlementViewSnapshot({ state: stateClone, layout: layoutClone, selectedLayerId: 'z0' });
    if (JSON.stringify(stateClone) !== JSON.stringify(baseState)) {
        fail('input state was mutated');
    } else if (JSON.stringify(layoutClone) !== JSON.stringify(parseSettlementLayout({
        version: 1,
        settlementId: 'scrapbound_hub',
        layers: ['z0'],
        zones: [{ id: 'zone_a', layerId: 'z0', label: 'Market', x: 3, y: 3 }],
        markers: [],
    }))) {
        fail('input layout was mutated');
    } else {
        ok('input state and layout are not mutated');
    }
}

if (failed > 0) {
    console.error(`\n${failed} test(s) failed.`);
    process.exit(1);
}
console.log('settlement view core: all tests passed.');