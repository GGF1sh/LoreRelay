#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const dioramaPath = path.join(root, 'out', 'settlementDioramaCore.js');
const viewPath = path.join(root, 'out', 'settlementViewCore.js');
const settlementCorePath = path.join(root, 'out', 'settlementCore.js');

let failed = 0;
function fail(msg) { console.error(`FAIL: ${msg}`); failed++; }
function ok(msg) { console.log(`OK: ${msg}`); }

for (const p of [dioramaPath, viewPath, settlementCorePath]) {
    if (!fs.existsSync(p)) {
        fail(`${p} missing - run npm run compile first`);
        process.exit(1);
    }
}

const {
    buildSettlementDioramaSnapshot,
    pickSettlementDioramaBlockKeys,
    pickSettlementDioramaMarkerKeys,
    pickSettlementDioramaLabelKeys,
    pickSettlementDioramaSnapshotKeys,
    dioramaMaterialForTileCode,
    SETTLEMENT_DIORAMA_BLOCK_KEYS,
    SETTLEMENT_DIORAMA_MARKER_KEYS,
    SETTLEMENT_DIORAMA_LABEL_KEYS,
    SETTLEMENT_DIORAMA_SNAPSHOT_KEYS,
    MAX_DIORAMA_BLOCKS,
    MAX_DIORAMA_MARKERS,
    MAX_DIORAMA_LABELS,
    MAX_DIORAMA_LABEL_TEXT,
} = require(dioramaPath);
const { buildSettlementViewSnapshot } = require(viewPath);
const { parseSettlementState } = require(settlementCorePath);

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
        text: 'SECRET: hidden pump room flooded',
    }],
});

if (!baseState) {
    fail('fixture state should parse');
    process.exit(1);
}

const baseView = buildSettlementViewSnapshot({ state: baseState, selectedLayerId: 'z0' });
if (!baseView) {
    fail('fixture view should build');
    process.exit(1);
}

{
    const snap = buildSettlementDioramaSnapshot({});
    if (snap !== undefined) {
        fail('no view should return undefined');
    } else {
        ok('no view returns undefined');
    }
}

{
    const snap = buildSettlementDioramaSnapshot({ view: baseView });
    if (!snap) {
        fail('valid view should produce diorama snapshot');
    } else if (snap.version !== 1) {
        fail(`version should be 1: ${snap.version}`);
    } else if (!snap.blocks.length) {
        fail('blocks should be created from tiles');
    } else if (!snap.markers.length) {
        fail('markers should be created from view markers');
    } else if (snap.blocks.length > MAX_DIORAMA_BLOCKS) {
        fail(`blocks exceed default cap: ${snap.blocks.length}`);
    } else if (snap.markers.length > MAX_DIORAMA_MARKERS) {
        fail(`markers exceed default cap: ${snap.markers.length}`);
    } else if (!snap.revision || typeof snap.revision !== 'string') {
        fail(`revision required on snapshot: ${snap.revision}`);
    } else if (snap.camera.mode !== 'fixed_orbit') {
        fail('camera mode must be fixed_orbit');
    } else if (!Number.isFinite(snap.camera.distance)) {
        fail('camera distance must be finite');
    } else {
        ok('valid M3 snapshot creates bounded diorama snapshot');
    }
}

{
    const snapA = buildSettlementDioramaSnapshot({ view: baseView, options: { theme: 'fantasy' } });
    const snapB = buildSettlementDioramaSnapshot({ view: baseView, options: { theme: 'fantasy' } });
    if (!snapA || !snapB || JSON.stringify(snapA) !== JSON.stringify(snapB)) {
        fail('same inputs must produce identical diorama snapshots');
    } else {
        ok('deterministic diorama snapshot for same inputs');
    }
}

{
    const viewClone = JSON.parse(JSON.stringify(baseView));
    buildSettlementDioramaSnapshot({ view: viewClone, options: { includeLabels: true } });
    if (JSON.stringify(viewClone) !== JSON.stringify(baseView)) {
        fail('input view was mutated');
    } else {
        ok('input view is not mutated');
    }
}

{
    const snap = buildSettlementDioramaSnapshot({
        view: baseView,
        options: { includeLabels: true, theme: 'scifi' },
    });
    if (!snap) {
        fail('snapshot required for allow-list test');
    } else {
        for (const block of snap.blocks) {
            const keys = Object.keys(block);
            const allowed = new Set(SETTLEMENT_DIORAMA_BLOCK_KEYS);
            if (keys.some((k) => !allowed.has(k))) {
                fail(`extra block keys: ${keys.join(',')}`);
            }
            if (!Number.isFinite(block.x) || !Number.isFinite(block.y) || !Number.isFinite(block.z)) {
                fail('block coordinates must be finite');
            }
            if (!Number.isFinite(block.w) || !Number.isFinite(block.d) || !Number.isFinite(block.h)) {
                fail('block dimensions must be finite');
            }
            const picked = pickSettlementDioramaBlockKeys(block);
            if (Object.keys(picked).some((k) => !allowed.has(k))) {
                fail('pickSettlementDioramaBlockKeys leaked keys');
            }
        }
        for (const marker of snap.markers) {
            const keys = Object.keys(marker);
            const allowed = new Set(SETTLEMENT_DIORAMA_MARKER_KEYS);
            if (keys.some((k) => !allowed.has(k))) {
                fail(`extra marker keys: ${keys.join(',')}`);
            }
            if (marker.label.length > MAX_DIORAMA_LABEL_TEXT) {
                fail('marker label exceeds cap');
            }
            const picked = pickSettlementDioramaMarkerKeys(marker);
            if (Object.keys(picked).some((k) => !allowed.has(k))) {
                fail('pickSettlementDioramaMarkerKeys leaked keys');
            }
        }
        if (snap.labels) {
            for (const label of snap.labels) {
                const keys = Object.keys(label);
                const allowed = new Set(SETTLEMENT_DIORAMA_LABEL_KEYS);
                if (keys.some((k) => !allowed.has(k))) {
                    fail(`extra label keys: ${keys.join(',')}`);
                }
                const picked = pickSettlementDioramaLabelKeys(label);
                if (Object.keys(picked).some((k) => !allowed.has(k))) {
                    fail('pickSettlementDioramaLabelKeys leaked keys');
                }
            }
        }
        const topKeys = Object.keys(snap);
        const allowedTop = new Set(SETTLEMENT_DIORAMA_SNAPSHOT_KEYS);
        if (topKeys.some((k) => !allowedTop.has(k))) {
            fail(`extra snapshot keys: ${topKeys.join(',')}`);
        }
        const pickedTop = pickSettlementDioramaSnapshotKeys(snap);
        if (Object.keys(pickedTop).some((k) => !allowedTop.has(k))) {
            fail('pickSettlementDioramaSnapshotKeys leaked keys');
        }
        ok('block/marker/label/snapshot key allow-lists enforced');
    }
}

{
    const dirtyView = JSON.parse(JSON.stringify(baseView));
    dirtyView.tiles[0].label = 'Dirty\x00Label\x01Here';
    const snap = buildSettlementDioramaSnapshot({
        view: dirtyView,
        options: { includeLabels: true },
    });
    const dirtyLabel = snap?.labels?.find((l) => l.text.includes('Dirty'));
    if (!dirtyLabel) {
        fail('expected a label from dirty tile');
    } else if (dirtyLabel.text.includes('\x00') || dirtyLabel.text.includes('\x01')) {
        fail('control characters should be stripped from label text');
    } else if (dirtyLabel.text.length > MAX_DIORAMA_LABEL_TEXT) {
        fail('label text should be clamped');
    } else {
        ok('labels are clamped and control characters removed');
    }
}

{
    const tileCodes = [
        'floor', 'wall', 'gate', 'market', 'workshop', 'stockpile', 'quarters',
        'clinic', 'barracks', 'shrine', 'water', 'ruins', 'hazard', 'empty', 'unknown',
    ];
    const materials = new Set();
    for (const code of tileCodes) {
        const material = dioramaMaterialForTileCode(code);
        materials.add(material);
        const miniView = {
            ...baseView,
            tiles: [{ x: 1, y: 1, z: 0, code, label: code, tone: 'neutral' }],
            markers: [],
        };
        const snap = buildSettlementDioramaSnapshot({ view: miniView });
        if (code === 'empty') {
            if (snap?.blocks.length) {
                fail('empty tiles should not create blocks');
            }
            continue;
        }
        if (!snap?.blocks[0] || snap.blocks[0].material !== material) {
            fail(`material mapping mismatch for ${code}: ${snap?.blocks[0]?.material} vs ${material}`);
        }
    }
    if (materials.size < 6) {
        fail('material mapping should cover multiple materials');
    } else {
        ok('tile code to material mapping is closed and deterministic');
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
    const view = buildSettlementViewSnapshot({
        state,
        options: { maxTiles: 30, maxMarkers: 25 },
    });
    const snap = buildSettlementDioramaSnapshot({
        view,
        options: { maxBlocks: 10, maxMarkers: 5, maxLabels: 3, includeLabels: true },
    });
    if (!snap) {
        fail('capped diorama should build');
    } else if (snap.blocks.length > 10) {
        fail(`block cap failed: ${snap.blocks.length}`);
    } else if (snap.markers.length > 5) {
        fail(`marker cap failed: ${snap.markers.length}`);
    } else if (snap.labels && snap.labels.length > 3) {
        fail(`label cap failed: ${snap.labels.length}`);
    } else if (!snap.warnings?.includes('block_cap_reached') || !snap.warnings?.includes('marker_cap_reached')) {
        fail(`cap warnings expected: ${JSON.stringify(snap.warnings)}`);
    } else {
        ok('caps are enforced with warnings');
    }
}

{
    const snap = buildSettlementDioramaSnapshot({ view: baseView });
    if (!snap) {
        fail('snapshot required for leak test');
    } else {
        const serialized = JSON.stringify(snap);
        if (serialized.includes('SECRET') || serialized.includes('classified')) {
            fail('diorama must not leak secret incident text');
        }
        if (snap.markers.some((m) => m.kind === 'stock_low' && /\b\d+\b/.test(m.label))) {
            fail('stock_low markers must not expose raw quantities');
        }
        if (serialized.includes('settlement_state') || serialized.includes('settlement_layout')) {
            fail('diorama must not include raw canonical JSON keys');
        }
        ok('no raw stock quantities or unexpected fields leak');
    }
}

if (failed > 0) {
    console.error(`\n${failed} test(s) failed`);
    process.exit(1);
}
console.log('\nAll settlement diorama core tests passed');