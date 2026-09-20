#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const corePath = path.join(root, 'out', 'settlementLayoutTurnOpsCore.js');
const settlementCorePath = path.join(root, 'out', 'settlementCore.js');
const expansionCorePath = path.join(root, 'out', 'settlementLayerExpansionCore.js');

let failed = 0;
function fail(msg) { console.error(`FAIL: ${msg}`); failed++; }
function ok(msg) { console.log(`OK: ${msg}`); }

for (const p of [corePath, settlementCorePath, expansionCorePath]) {
    if (!fs.existsSync(p)) {
        fail(`${p} missing — run npm run compile`);
        process.exit(1);
    }
}

const {
    filterExpandLayerOps,
    hasExpandLayerOps,
    applyExpandLayerOpsToLayout,
} = require(corePath);
const {
    parseSettlementOps,
    emptySettlementState,
} = require(settlementCorePath);

const baseState = emptySettlementState('scrapbound_hub', 'Scrapbound Enclave');
baseState.worldTurn = 12;

function expandOp(layerId, profile, extra = {}) {
    return { type: 'expand_layer', layerId, profile, ...extra };
}

{
    const ops = parseSettlementOps([
        { type: 'expand_layer', layerId: 'z-1', profile: 'cellar' },
        { type: 'set_score', key: 'morale', value: 50 },
        { type: 'expand_layer', layerId: 'z1', profile: 'roof' },
    ]);
    const filtered = filterExpandLayerOps(ops);
    if (filtered.length !== 2 || filtered[0].layerId !== 'z-1' || filtered[1].layerId !== 'z1') {
        fail(`filterExpandLayerOps should keep expand_layer only: ${JSON.stringify(filtered)}`);
    } else {
        ok('filterExpandLayerOps drops non-expand_layer ops');
    }
}

{
    if (!hasExpandLayerOps([{ type: 'set_score', key: 'morale', value: 1 }])) {
        ok('hasExpandLayerOps false when no expand_layer');
    } else {
        fail('hasExpandLayerOps should be false for non-expand ops');
    }
    if (!hasExpandLayerOps([{ type: 'expand_layer', layerId: 'z-1', profile: 'cellar' }])) {
        fail('hasExpandLayerOps should be true for valid expand_layer');
    } else {
        ok('hasExpandLayerOps true for expand_layer');
    }
}

{
    const first = applyExpandLayerOpsToLayout(
        undefined,
        baseState,
        [expandOp('z-1', 'cellar', { seed: 9 })],
        { worldTurn: 12 }
    );
    const second = applyExpandLayerOpsToLayout(
        undefined,
        baseState,
        [expandOp('z-1', 'cellar', { seed: 9 })],
        { worldTurn: 12 }
    );
    if (!first.anyApplied || !second.anyApplied) {
        fail('single expand_layer should apply');
    } else if (JSON.stringify(first.layout) !== JSON.stringify(second.layout)) {
        fail('applyExpandLayerOpsToLayout must be deterministic');
    } else if (!first.layout.layers.includes('z-1')) {
        fail('applied layout should include new layer');
    } else {
        ok('applyExpandLayerOpsToLayout single op deterministic apply');
    }
}

{
    const layout = {
        version: 1,
        settlementId: 'scrapbound_hub',
        layers: ['z0', 'z-1'],
        zones: [{ id: 'market_row', layerId: 'z0', label: 'Market Row', x: 4, y: 4 }],
        markers: [{ id: 'main_gate', layerId: 'z0', label: 'Main Gate', x: 5, y: 5 }],
    };
    const onlyExisting = applyExpandLayerOpsToLayout(
        layout,
        baseState,
        [expandOp('z-1', 'cellar')],
        { worldTurn: 12 }
    );
    if (onlyExisting.anyApplied) {
        fail('existing layer only should no-op');
    } else if (onlyExisting.layout.zones.length !== 1) {
        fail('no-op fold should preserve zones');
    } else {
        ok('applyExpandLayerOpsToLayout preserves layout on no-op');
    }

    const withRoof = applyExpandLayerOpsToLayout(
        layout,
        baseState,
        [expandOp('z-1', 'cellar'), expandOp('z1', 'roof', { seed: 3 })],
        { worldTurn: 12 }
    );
    if (!withRoof.anyApplied || !withRoof.layout.layers.includes('z1')) {
        fail(`second op in fold should apply roof layer: ${JSON.stringify(withRoof.layout.layers)}`);
    } else if (!withRoof.layout.zones.some((z) => z.id === 'market_row')) {
        fail('fold apply should preserve existing zones');
    } else {
        ok('applyExpandLayerOpsToLayout folds multiple ops in order');
    }
}

{
    const layout = {
        version: 1,
        settlementId: 'scrapbound_hub',
        layers: ['z0'],
        zones: [],
        markers: [],
    };
    const before = JSON.parse(JSON.stringify(layout));
    applyExpandLayerOpsToLayout(layout, baseState, [expandOp('z-1', 'cellar', { seed: 1 })], { worldTurn: 3 });
    if (JSON.stringify(layout) !== JSON.stringify(before)) {
        fail('input layout must not be mutated');
    } else {
        ok('applyExpandLayerOpsToLayout does not mutate input layout');
    }
}

if (failed > 0) {
    process.exit(1);
}
console.log('settlementLayoutTurnOpsCore: all tests passed.');