#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.join(__dirname, '..');
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf-8');

console.log('Testing Vehicle Garage Webview wiring...');

const indexHtml = read('webview', 'index.html');
const bundle = read('webview', 'script.js');
const moduleJs = read('webview', 'modules', '89-vehicles.js');
const buildScript = read('scripts', 'build-webview.js');
const worldViewSrc = read('src', 'worldView.ts');
const bridgeSrc = read('src', 'vehicleBridge.ts');

const htmlSymbols = [
    'id="pane-vehicles"',
    'id="tab-btn-vehicles"',
    'id="vehicles-list"',
    'id="vehicles-detail"',
    'id="vehicles-content"',
    'id="vehicles-empty"',
];
for (const symbol of htmlSymbols) {
    assert(indexHtml.includes(symbol), `index.html missing ${symbol}`);
}
assert(indexHtml.includes('vehicleOps'), 'index.html hint should mention vehicleOps');
console.log('ok: Vehicles tab DOM exists');

const moduleSymbols = [
    'enableVehicleSystem',
    'vehicleGarage',
    'renderGarage',
    'setTabVisible',
    'vehicle-list-item',
    'vehicle-detail-card',
];
for (const symbol of moduleSymbols) {
    assert(moduleJs.includes(symbol), `89-vehicles.js missing ${symbol}`);
    assert(bundle.includes(symbol), `script.js bundle missing ${symbol}`);
}
console.log('ok: vehicle garage module bundled');

assert(
    buildScript.includes("'89-vehicles.js'"),
    'build-webview.js must include 89-vehicles.js'
);
assert(
    buildScript.includes("'89-vehicles.css'"),
    'build-webview.js must include 89-vehicles.css'
);
assert(
    buildScript.indexOf("'88-world-observatory.js'") < buildScript.indexOf("'89-vehicles.js'"),
    '89-vehicles.js must bundle after observatory'
);
console.log('ok: build-webview manifest includes vehicle garage assets');

assert(worldViewSrc.includes('buildVehicleGarageWebviewPayload'), 'worldView.ts must wire vehicleBridge');
assert(worldViewSrc.includes('enableVehicleSystem'), 'worldView.ts must send enableVehicleSystem');
assert(worldViewSrc.includes('vehicleGarage'), 'worldView.ts must send vehicleGarage');
assert(bridgeSrc.includes('buildVehicleGarageSnapshot'), 'vehicleBridge.ts must use vehicleViewCore');
console.log('ok: host bridge wires vehicleGarage into worldView');

console.log('webview vehicle garage: all tests passed');