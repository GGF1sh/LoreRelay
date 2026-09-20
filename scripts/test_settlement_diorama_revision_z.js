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
    deriveDioramaRevision,
    normalizeDioramaCap,
} = require(dioramaPath);
const { buildSettlementViewSnapshot } = require(viewPath);
const { parseSettlementState } = require(settlementCorePath);

const baseState = parseSettlementState({
    version: 1,
    settlementId: 'scrapbound_hub',
    name: 'Scrapbound Enclave',
    morale: 55,
    safety: 40,
    stocks: [{ id: 'food', amount: 5 }],
    structures: [
        { id: 'market_hall', name: 'Market Hall', status: 'intact', layerId: 'z0' },
        { id: 'cellar_store', name: 'Cellar Store', status: 'intact', layerId: 'z-1' },
    ],
    residents: [{ npcId: 'resident_1', role: 'guard' }],
    visitors: [],
    merchants: [],
    incidents: [],
});

if (!baseState) {
    fail('fixture state should parse');
    process.exit(1);
}

{
    const view = buildSettlementViewSnapshot({ state: baseState, selectedLayerId: 'z0' });
    const snapA = buildSettlementDioramaSnapshot({ view });
    const viewMore = buildSettlementViewSnapshot({
        state: { ...baseState, residents: [...baseState.residents, { npcId: 'resident_2' }] },
        selectedLayerId: 'z0',
    });
    const snapB = buildSettlementDioramaSnapshot({ view: viewMore });
    if (!snapA?.revision || !snapB?.revision) {
        fail('revision field required on snapshot');
    } else if (snapA.revision === snapB.revision) {
        fail('revision should change when marker content changes');
    } else if (snapA.settlementId !== snapB.settlementId || snapA.layerId !== snapB.layerId) {
        fail('revision test should keep settlementId/layerId constant');
    } else {
        ok('revision changes when same-layer content changes');
    }
}

{
    const layers = ['z1', 'z0', 'z-1', 'z-2'];
    for (const layerId of layers) {
        const view = buildSettlementViewSnapshot({ state: baseState, selectedLayerId: layerId });
        const snap = buildSettlementDioramaSnapshot({ view });
        if (!snap || !snap.blocks.length) {
            fail(`expected blocks for layer ${layerId}`);
            continue;
        }
        const floorBlocks = snap.blocks.filter((b) => b.code !== 'wall');
        if (floorBlocks.some((b) => b.z < -0.01)) {
            fail(`layer ${layerId} has blocks below local ground: ${JSON.stringify(floorBlocks.map((b) => b.z))}`);
        } else if (snap.markers.some((m) => m.z < 0)) {
            fail(`layer ${layerId} has markers below local ground`);
        } else {
            ok(`layer ${layerId} localizes Z to scene base`);
        }
    }
}

{
    if (normalizeDioramaCap(-5, 10) !== 0) {
        fail('negative cap should clamp to 0');
    } else if (normalizeDioramaCap(3.7, 10) !== 3) {
        fail('fractional cap should floor');
    } else if (normalizeDioramaCap(Number.NaN, 10) !== 10) {
        fail('NaN cap should use max');
    } else {
        ok('normalizeDioramaCap hardens invalid caps');
    }
}

{
    const blocks = [{ id: 'a', x: 1, y: 1, z: 0, w: 1, d: 1, h: 1, code: 'floor', material: 'neutral' }];
    const markers = [{ id: 'm1', x: 1, y: 1, z: 0.35, kind: 'resident', material: 'light', label: 'A' }];
    const palette = { theme: 'default', background: '#111', ambient: '#222', ground: '#333', accent: '#444' };
    const camera = { mode: 'fixed_orbit', target: { x: 1, y: 1, z: 0 }, distance: 10, yaw: 45, pitch: 35, minDistance: 5, maxDistance: 20 };
    const r1 = deriveDioramaRevision({ blocks, markers, palette, camera });
    const r2 = deriveDioramaRevision({ blocks, markers, palette, camera });
    if (r1 !== r2) {
        fail('deriveDioramaRevision should be deterministic');
    } else {
        ok('deriveDioramaRevision is deterministic');
    }
}

if (failed > 0) {
    console.error(`\n${failed} test(s) failed`);
    process.exit(1);
}
console.log('\nAll settlement diorama revision/z tests passed');