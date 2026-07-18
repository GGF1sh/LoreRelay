#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const modulePath = path.join(root, 'webview', 'modules', '86b-settlement-isometric.js');
const source = fs.readFileSync(modulePath, 'utf8');
const start = source.indexOf('function getMobileBaseInterior');
const end = source.indexOf('/** M4c:', start);
assert.ok(start >= 0 && end > start, 'Mobile Base visual helpers not found');
let selectedSource = 'mobile_base';
const context = {
    Number,
    Math,
    Set,
    resolveSettlementRenderSource: () => ({ source: selectedSource }),
};
vm.runInNewContext(source.slice(start, end), context, { filename: modulePath });

const msg = {
    enableMobileBaseSystem: true,
    mobileBaseInterior: {
        settlementId: 'barge',
        mode: 'ship',
        hasCanvas: true,
        interiorBlocked: false,
    },
};
const view = {
    settlementId: 'barge',
    layerId: 'z0',
    layers: [{ id: 'z0', label: 'Ground' }, { id: 'z1', label: 'Upper deck' }],
    tiles: [{ x: 0, y: 0, z: 0, code: 'wall' }, { x: 2, y: 1, z: 0, code: 'stockpile' }],
    markers: [{ id: 'captain', x: 7, y: 4, z: 0 }],
};
const footprint = context.deriveMobileBaseStructuralFootprint(msg, view);
assert.ok(footprint.length > 0);
assert.ok(footprint.every((cell) => cell.decorative === true && cell.visualKind === 'ship'));
assert.ok(!footprint.some((cell) => cell.x === 0 && cell.y === 0 && cell.z === 0));
assert.ok(Math.max(...footprint.map((cell) => cell.x)) - Math.min(...footprint.map((cell) => cell.x)) < 10,
    'fallback marker coordinates must not inflate a sparse ship into a giant square');
assert.strictEqual(
    JSON.stringify(context.deriveMobileBaseStructuralFootprint(msg, view)),
    JSON.stringify(footprint),
    'footprint must be deterministic'
);
const visual = context.buildSettlementVisualView(msg, view);
assert.strictEqual(visual.tiles.length, view.tiles.length + footprint.length);
assert.strictEqual(view.tiles.length, 2, 'authoritative view must remain unchanged');
assert.deepStrictEqual(view.markers, [{ id: 'captain', x: 7, y: 4, z: 0 }],
    'authoritative marker positions must remain unchanged');
const visualXs = visual.tiles.map((cell) => cell.x);
const visualYs = visual.tiles.map((cell) => cell.y);
assert.ok(visual.markers.every((marker) => (
    marker.x >= Math.min(...visualXs) && marker.x <= Math.max(...visualXs)
    && marker.y >= Math.min(...visualYs) && marker.y <= Math.max(...visualYs)
)), 'visual markers should remain spatially associated with the structural footprint');
assert.strictEqual(context.mobileBaseLayerSemanticLabel(msg.mobileBaseInterior, 'z0', view.layers[0]), 'Hold');
assert.strictEqual(context.mobileBaseLayerSemanticLabel({ mode: 'other', vehicleKind: 'wagon' }, 'z0', view.layers[0]), 'Cabin');
const wagonMsg = {
    ...msg,
    mobileBaseInterior: { ...msg.mobileBaseInterior, mode: 'other', vehicleKind: 'wagon' },
};
assert.ok(context.deriveMobileBaseStructuralFootprint(wagonMsg, view)
    .every((cell) => cell.visualKind === 'wagon'));

selectedSource = 'fixed';
assert.strictEqual(context.deriveMobileBaseStructuralFootprint(msg, view).length, 0);
selectedSource = 'mobile_base';
assert.strictEqual(context.deriveMobileBaseStructuralFootprint(msg, { ...view, tiles: [], markers: [] }).length, 0);

assert.ok(source.includes('if (tile.decorative === true)'));
assert.ok(source.includes('drawMobileBaseFootprintCell'));
assert.ok(source.includes('continue;'));
assert.ok(source.includes('btn.hidden = !known'));
assert.ok(source.includes('btn.textContent = btn.dataset.defaultLabel'));

console.log('mobile base footprint: all tests passed');
