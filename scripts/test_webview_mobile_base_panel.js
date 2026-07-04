#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.join(__dirname, '..');
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf-8');

console.log('Testing Mobile Base MB4 Webview panel wiring...');

const indexHtml = read('webview', 'index.html');
const bundle = read('webview', 'script.js');
const moduleJs = read('webview', 'modules', '89b-mobile-base-panel.js');
const buildScript = read('scripts', 'build-webview.js');
const bridgeSrc = read('src', 'mobileBaseBridge.ts');
const worldViewSrc = read('src', 'worldView.ts');

const htmlSymbols = [
    'id="vehicles-mobile-base-section"',
    'id="vehicles-mobile-base-panel"',
    'webview.mobileBase.sectionTitle',
];
for (const symbol of htmlSymbols) {
    assert(indexHtml.includes(symbol), `index.html missing ${symbol}`);
}
console.log('ok: Mobile base panel DOM exists in Vehicles tab');

const moduleSymbols = [
    'enableMobileBaseSystem',
    'mobileBasePanel',
    'renderMobileBasePanel',
    'mobile-base-panel-card',
    'mb-facility-chip',
    'mobileBaseOps',
];
for (const symbol of moduleSymbols) {
    assert(moduleJs.includes(symbol), `89b-mobile-base-panel.js missing ${symbol}`);
    assert(bundle.includes(symbol), `script.js bundle missing ${symbol}`);
}
console.log('ok: mobile base panel module bundled');

assert(buildScript.includes("'89b-mobile-base-panel.js'"), 'build-webview.js must include 89b-mobile-base-panel.js');
assert(
    buildScript.indexOf("'89-vehicles.js'") < buildScript.indexOf("'89b-mobile-base-panel.js'"),
    '89b-mobile-base-panel.js must bundle after 89-vehicles.js'
);
console.log('ok: build-webview manifest includes mobile base panel module');

assert(bridgeSrc.includes('buildMobileBasePanelWebviewPayload'), 'mobileBaseBridge must export panel payload');
assert(worldViewSrc.includes('enableMobileBaseSystem'), 'worldView must send enableMobileBaseSystem');
assert(worldViewSrc.includes('mobileBasePanel'), 'worldView must send mobileBasePanel');
console.log('ok: host bridge wires mobileBasePanel into worldView');

console.log('webview mobile base panel: all tests passed');