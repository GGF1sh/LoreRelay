#!/usr/bin/env node
'use strict';

/**
 * Settlement layout layer normalization — effective layer union, ID dedupe,
 * orphan zone/marker layer promotion (ChatGPT PR3).
 */

const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const settlementCorePath = path.join(root, 'out', 'settlementCore.js');
const viewCorePath = path.join(root, 'out', 'settlementViewCore.js');

let failed = 0;
function fail(msg) { console.error(`FAIL: ${msg}`); failed++; }
function ok(msg) { console.log(`OK: ${msg}`); }

for (const p of [settlementCorePath, viewCorePath]) {
    if (!fs.existsSync(p)) {
        fail(`${p} missing — run npm run compile first`);
        process.exit(1);
    }
}

const {
    parseSettlementLayout,
    deriveEffectiveSettlementLayers,
    parseSettlementState,
} = require(settlementCorePath);
const { buildSettlementExpansionPreviews, buildSettlementViewSnapshot } = require(viewCorePath);

const baseState = parseSettlementState({
    version: 1,
    settlementId: 'scrapbound_hub',
    name: 'Scrapbound Enclave',
    stocks: [],
    structures: [],
    residents: [],
    visitors: [],
    merchants: [],
    incidents: [],
});

if (!baseState) {
    fail('fixture state should parse');
    process.exit(1);
}

{
    const layout = parseSettlementLayout({
        version: 1,
        settlementId: 'scrapbound_hub',
        layers: ['z0'],
        zones: [{ id: 'cellar', layerId: 'z-1', label: 'Storage cellar', x: 4, y: 4 }],
        markers: [],
    });
    if (!layout) {
        fail('orphan zone layout should parse');
    } else if (!layout.layers.includes('z-1')) {
        fail(`orphan zone layer should promote z-1 into layers: ${layout.layers.join(',')}`);
    } else if (layout.layers.join(',') !== 'z0,z-1') {
        fail(`layers should stay in canonical order: ${layout.layers.join(',')}`);
    } else {
        ok('orphan zone layer is normalized into effective layers');
    }
}

{
    const layout = parseSettlementLayout({
        version: 1,
        settlementId: 'scrapbound_hub',
        layers: ['z0'],
        zones: [],
        markers: [{ id: 'roof_post', layerId: 'z1', label: 'Watch post', x: 6, y: 6 }],
    });
    if (!layout?.layers.includes('z1')) {
        fail(`orphan marker layer should promote z1: ${JSON.stringify(layout?.layers)}`);
    } else {
        ok('orphan marker layer is normalized into effective layers');
    }
}

{
    const layout = parseSettlementLayout({
        version: 1,
        settlementId: 'scrapbound_hub',
        layers: ['z0'],
        zones: [
            { id: 'dup_zone', layerId: 'z0', label: 'First label', x: 1, y: 1 },
            { id: 'dup_zone', layerId: 'z0', label: 'Second label', x: 2, y: 2 },
        ],
        markers: [
            { id: 'dup_pin', layerId: 'z0', label: 'First pin', x: 3, y: 3 },
            { id: 'dup_pin', layerId: 'z0', label: 'Second pin', x: 4, y: 4 },
        ],
    });
    if (!layout || layout.zones.length !== 1 || layout.markers.length !== 1) {
        fail(`duplicate zone/marker IDs should dedupe: ${JSON.stringify(layout)}`);
    } else if (layout.zones[0].label !== 'Second label' || layout.markers[0].label !== 'Second pin') {
        fail('duplicate IDs should use last-wins semantics');
    } else {
        ok('zone and marker IDs dedupe with last-wins');
    }
}

{
    const raw = {
        version: 1,
        settlementId: 'scrapbound_hub',
        layers: ['z0'],
        zones: [{ id: 'cellar', layerId: 'z-1', label: 'Storage cellar', x: 4, y: 4 }],
        markers: [],
    };
    const layout = parseSettlementLayout(raw);
    const previews = buildSettlementExpansionPreviews(baseState, layout);
    const zNeg1Previews = previews.filter((p) => p.layerId === 'z-1');
    if (zNeg1Previews.length) {
        fail('z-1 should not be missing when orphan zone already exists');
    } else if (!previews.some((p) => p.layerId === 'z1')) {
        fail('z1 should still be missing and offer previews');
    } else {
        ok('expansion previews respect effective layers (no false missing-layer CTA)');
    }
}

{
    const layout = parseSettlementLayout({
        version: 1,
        settlementId: 'scrapbound_hub',
        layers: ['z0'],
        zones: [{ id: 'cellar', layerId: 'z-1', label: 'Storage cellar', x: 4, y: 4 }],
        markers: [],
    });
    const snap = buildSettlementViewSnapshot({
        state: baseState,
        layout,
        selectedLayerId: 'z-1',
    });
    const layerIds = (snap?.layers ?? []).map((l) => l.id);
    if (!layerIds.includes('z-1')) {
        fail(`layer summaries should include orphan zone layer: ${layerIds.join(',')}`);
    } else if (!snap?.tiles.some((t) => t.label === 'Storage cellar')) {
        fail('z-1 snapshot should render orphan zone tiles');
    } else {
        ok('layer summaries and view use effective layer union');
    }
}

{
    const effective = deriveEffectiveSettlementLayers({
        layers: ['bogus', 'z0'],
        zones: [{ id: 'z', layerId: 'z-2', label: 'Deep', x: 1, y: 1 }],
        markers: [],
    });
    if (!effective.includes('z0') || !effective.includes('z-2') || effective.includes('bogus')) {
        fail(`deriveEffectiveSettlementLayers should filter invalid ids: ${effective.join(',')}`);
    } else {
        ok('deriveEffectiveSettlementLayers unions declared, zone, and marker layers');
    }
}

if (failed > 0) {
    console.error(`\n${failed} test(s) failed.`);
    process.exit(1);
}
console.log('settlement layout layer normalization: all tests passed.');