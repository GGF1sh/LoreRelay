#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.join(__dirname, '..');
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf-8');

console.log('Testing Vehicle System V5 map overlay wiring...');

const bundle = read('webview', 'script.js');
const overmapModule = read('webview', 'modules', '86-tile-overmap.js');
const bridgeSrc = read('src', 'mapOverlayBridgeCore.ts');
const integrationSrc = read('src', 'vehicleIntegrationCore.ts');
const vehicleStateSrc = read('src', 'vehicleState.ts');
const overlayCoreSrc = read('src', 'mapOverlayCore.ts');

const symbols = [
    'vehicle_parking',
    'overlayLegendVehicle',
    'overlayLegendVehicleParking',
    "glyph: 'V'",
    "glyph: 'P'",
];
for (const symbol of symbols) {
    assert(overmapModule.includes(symbol), `86-tile-overmap.js missing ${symbol}`);
    assert(bundle.includes(symbol), `script.js bundle missing ${symbol}`);
}
console.log('ok: vehicle overlay legend + glyphs bundled');

assert(overlayCoreSrc.includes("'vehicle'"), 'mapOverlayCore must define vehicle marker kind');
assert(overlayCoreSrc.includes('buildVehicleMarkers'), 'mapOverlayCore must build vehicle markers');
assert(bridgeSrc.includes('vehicleState'), 'mapOverlayBridgeCore must pass vehicleState');
assert(integrationSrc.includes('buildVehicleIntegrationPromptLines'), 'vehicleIntegrationCore must export prompt helpers');
assert(vehicleStateSrc.includes('buildVehicleIntegrationPromptLines'), 'vehicleState must append integration prompt lines');
console.log('ok: host wires vehicle map + prompt integration');

console.log('webview vehicle integration: all tests passed');