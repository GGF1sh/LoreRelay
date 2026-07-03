#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const corePath = path.join(root, 'out', 'settlementLayerExpansionCore.js');
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
    applyExpandLayerToLayout,
    createMinimalLayoutShell,
    deriveExpansionSeed,
    isValidExpandLayerId,
    pickLayoutV1Keys,
    LAYOUT_V1_KEYS,
    MAX_EXPANSION_ZONES_PER_OP,
    MAX_EXPANSION_MARKERS_PER_OP,
} = require(corePath);
const {
    parseSettlementOps,
    parseSettlementLayout,
    emptySettlementState,
    MAX_LAYOUT_LAYERS,
    MAX_LAYOUT_ZONES,
    MAX_LAYOUT_MARKERS,
    VALID_EXPANSION_PROFILES,
} = require(settlementCorePath);

const baseState = emptySettlementState('scrapbound_hub', 'Scrapbound Enclave');
baseState.safety = 30;
baseState.worldTurn = 12;

function expandOp(layerId, profile, extra = {}) {
    return { type: 'expand_layer', layerId, profile, ...extra };
}

{
    const ops = parseSettlementOps([
        { type: 'expand_layer', layerId: 'z-1', profile: 'cellar', reason: 'need storage' },
        { type: 'expand_layer', layerId: 'z-3', profile: 'cellar' },
        { type: 'expand_layer', layerId: 'z0', profile: 'bogus_profile' },
        { type: 'expand_layer', layerId: 'z1', seed: 42 },
    ]);
    if (ops.length !== 3) {
        fail(`expand_layer parser should accept 3 valid ops: ${ops.length}`);
    } else if (ops[0].layerId !== 'z-1' || ops[0].profile !== 'cellar') {
        fail(`first expand_layer op malformed: ${JSON.stringify(ops[0])}`);
    } else if (ops[1].profile !== undefined) {
        fail('invalid profile should be omitted');
    } else if (ops[2].seed !== 42) {
        fail('seed should parse');
    } else {
        ok('parseSettlementOps accepts expand_layer stub');
    }
}

{
    const result = applyExpandLayerToLayout(undefined, baseState, expandOp('bogus', 'cellar'));
    if (result.applied) {
        fail('invalid layer should not apply');
    } else if (!result.warnings.includes('invalid_layer_id')) {
        fail(`invalid layer warning expected: ${JSON.stringify(result.warnings)}`);
    } else if (!isValidExpandLayerId('z0') || isValidExpandLayerId('z-3')) {
        fail('isValidExpandLayerId helper incorrect');
    } else {
        ok('invalid layer ID rejected');
    }
}

{
    const layout = parseSettlementLayout({
        version: 1,
        settlementId: 'scrapbound_hub',
        layers: ['z0', 'z-1'],
        zones: [{ id: 'market_row', layerId: 'z0', label: 'Market Row', x: 4, y: 4 }],
        markers: [{ id: 'main_gate', layerId: 'z0', label: 'Main Gate', x: 5, y: 5 }],
    });
    const result = applyExpandLayerToLayout(layout, baseState, expandOp('z-1', 'cellar'));
    if (result.applied) {
        fail('existing layer should no-op');
    } else if (!result.warnings.includes('layer_already_exists')) {
        fail(`layer_already_exists warning expected: ${JSON.stringify(result.warnings)}`);
    } else if (result.layout.zones.length !== 1 || result.layout.markers.length !== 1) {
        fail('existing layout content should be preserved on no-op');
    } else {
        ok('existing layer is a no-op');
    }
}

{
    const shellA = createMinimalLayoutShell(baseState);
    const resultA = applyExpandLayerToLayout(undefined, baseState, expandOp('z-1', 'cellar', { seed: 7 }), { worldTurn: 12 });
    const resultB = applyExpandLayerToLayout(undefined, baseState, expandOp('z-1', 'cellar', { seed: 7 }), { worldTurn: 12 });
    if (!resultA.applied || !resultB.applied) {
        fail('absent layout should apply expansion');
    } else if (JSON.stringify(resultA.layout) !== JSON.stringify(resultB.layout)) {
        fail('absent layout expansion must be deterministic');
    } else if (!resultA.warnings.includes('layout_shell_created')) {
        fail(`layout_shell_created warning expected: ${JSON.stringify(resultA.warnings)}`);
    } else if (shellA.layers.join(',') !== 'z0') {
        fail(`minimal shell should start with z0: ${shellA.layers}`);
    } else if (!resultA.layout.layers.includes('z-1')) {
        fail('expansion should add target layer');
    } else if (resultA.layout.layers.length !== 2) {
        fail('one op should add at most one layer');
    } else {
        ok('absent layout creates deterministic shell and adds one layer');
    }
}

{
    const layout = parseSettlementLayout({
        version: 1,
        settlementId: 'scrapbound_hub',
        layers: ['z0'],
        zones: [{ id: 'plaza', layerId: 'z0', label: 'Plaza', x: 8, y: 8 }],
        markers: [{ id: 'well', layerId: 'z0', label: 'Well', x: 7, y: 7 }],
    });
    const layoutClone = JSON.parse(JSON.stringify(layout));
    const stateClone = JSON.parse(JSON.stringify(baseState));
    const op = expandOp('z1', 'watchtower', { seed: 99 });
    const opClone = JSON.parse(JSON.stringify(op));

    const result = applyExpandLayerToLayout(layout, baseState, op, { seed: 99 });
    if (!result.applied) {
        fail('watchtower expansion should apply');
    } else if (!result.layout.layers.includes('z1')) {
        fail('z1 should be added');
    } else if (!result.layout.zones.some((z) => z.layerId === 'z1')) {
        fail('profile should add z1 zones');
    } else if (!result.layout.markers.some((m) => m.layerId === 'z1')) {
        fail('profile should add z1 markers');
    } else if (result.layout.zones[0].id !== 'plaza' || result.layout.markers[0].id !== 'well') {
        fail('existing zones/markers must be preserved');
    } else if (JSON.stringify(layout) !== JSON.stringify(layoutClone)) {
        fail('input layout was mutated');
    } else if (JSON.stringify(baseState) !== JSON.stringify(stateClone)) {
        fail('input state was mutated');
    } else if (JSON.stringify(op) !== JSON.stringify(opClone)) {
        fail('input op was mutated');
    } else {
        ok('expansion preserves existing zones/markers and does not mutate inputs');
    }
}

{
    const profiles = ['cellar', 'waterworks', 'shelter', 'ruins', 'roof', 'watchtower', 'generic'];
    for (const profile of profiles) {
        if (!VALID_EXPANSION_PROFILES.includes(profile)) {
            fail(`missing profile in VALID_EXPANSION_PROFILES: ${profile}`);
            continue;
        }
        const layerId = profile === 'ruins' ? 'z-2'
            : profile === 'roof' || profile === 'watchtower' ? 'z1'
                : 'z-1';
        const state = { ...baseState, settlementId: `site_${profile}`, safety: 20 };
        const result = applyExpandLayerToLayout(undefined, state, expandOp(layerId, profile, { seed: 1 }));
        if (!result.applied) {
            fail(`profile ${profile} should apply`);
        } else if (result.layout.zones.length === 0) {
            fail(`profile ${profile} should add zones`);
        } else if (result.layout.zones.length > MAX_EXPANSION_ZONES_PER_OP) {
            fail(`profile ${profile} zone count exceeds per-op cap`);
        } else if (result.layout.markers.length > MAX_EXPANSION_MARKERS_PER_OP + 1) {
            fail(`profile ${profile} marker count exceeds per-op cap (+ hazard)`);
        }
    }
    ok('profile templates add bounded zones/markers');
}

{
    const lowSafety = { ...baseState, safety: 10 };
    const result = applyExpandLayerToLayout(undefined, lowSafety, expandOp('z-1', 'waterworks', { seed: 5 }));
    if (!result.layout.markers.some((m) => m.label === 'Water hazard')) {
        fail('waterworks with low safety should add hazard marker');
    } else {
        ok('waterworks profile reacts to low safety with hazard marker');
    }
}

{
    const layout = {
        version: 1,
        settlementId: 'scrapbound_hub',
        layers: ['z0', 'z1', 'z-1', 'z-2'],
        zones: [],
        markers: [],
    };
    const result = applyExpandLayerToLayout(layout, baseState, expandOp('z-2', 'ruins'));
    if (result.applied) {
        fail('should not apply when layer cap already reached');
    } else if (!result.warnings.includes('layer_already_exists') && !result.warnings.includes('layer_cap_reached')) {
        fail(`expected layer cap or exists warning: ${JSON.stringify(result.warnings)}`);
    } else {
        ok('layer cap / duplicate layer enforced');
    }
}

{
    const manyZones = Array.from({ length: MAX_LAYOUT_ZONES }, (_, i) => ({
        id: `zone_${i}`,
        layerId: 'z0',
        label: `Zone ${i}`,
        x: i % 12,
        y: i % 12,
    }));
    const layout = {
        version: 1,
        settlementId: 'scrapbound_hub',
        layers: ['z0'],
        zones: manyZones,
        markers: [],
    };
    const result = applyExpandLayerToLayout(layout, baseState, expandOp('z1', 'roof', { seed: 3 }));
    if (!result.applied) {
        fail('layer should still be added when only zones are capped');
    } else if (result.layout.zones.length > MAX_LAYOUT_ZONES) {
        fail(`zones should cap at ${MAX_LAYOUT_ZONES}`);
    } else if (!result.warnings.includes('zone_cap_reached')) {
        fail('zone_cap_reached warning expected');
    } else if (result.layout.layers.includes('z1')) {
        ok('zone cap reached with layer still added');
    } else {
        fail('z1 layer should be present');
    }
}

{
    const result = applyExpandLayerToLayout(undefined, baseState, expandOp('z-2', 'ruins', { seed: 11 }));
    const keys = Object.keys(result.layout);
    const allowed = new Set(LAYOUT_V1_KEYS);
    if (keys.some((k) => !allowed.has(k))) {
        fail(`layout contains extra keys: ${keys.join(',')}`);
    } else if ('tiles' in result.layout || 'tileRows' in result.layout) {
        fail('layout must not contain tile arrays');
    } else {
        const picked = pickLayoutV1Keys(result.layout);
        if (Object.keys(picked).some((k) => !allowed.has(k))) {
            fail('pickLayoutV1Keys leaked keys');
        }
        ok('output layout has allow-listed keys only (no tile array)');
    }
}

{
    const seedA = deriveExpansionSeed(baseState, expandOp('z-1', 'cellar'), { worldTurn: 5 });
    const seedB = deriveExpansionSeed(baseState, expandOp('z-1', 'cellar'), { worldTurn: 5 });
    const seedC = deriveExpansionSeed(baseState, expandOp('z-1', 'cellar'), { worldTurn: 6 });
    if (seedA !== seedB || seedA === seedC) {
        fail('seed derivation should be deterministic and turn-sensitive');
    } else {
        ok('deterministic seed derivation');
    }
}

{
    const layout = parseSettlementLayout({
        version: 1,
        settlementId: 'other_site',
        layers: ['z0'],
        zones: [],
        markers: [],
    });
    const result = applyExpandLayerToLayout(layout, baseState, expandOp('z-1', 'cellar', { seed: 2 }));
    if (!result.warnings.includes('layout_settlement_mismatch')) {
        fail('settlementId mismatch should warn');
    } else if (!result.applied) {
        fail('mismatch should still apply to fresh shell');
    } else if (result.layout.settlementId !== 'scrapbound_hub') {
        fail('shell should use state settlementId');
    } else {
        ok('layout/state settlementId mismatch handled');
    }
}

if (failed > 0) {
    console.error(`\n${failed} test(s) failed.`);
    process.exit(1);
}
console.log('settlement layer expansion core: all tests passed.');