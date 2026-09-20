#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.join(__dirname, '..');
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf-8');

console.log('Testing Mobile Base MB5 interior view wiring...');

const indexHtml = read('webview', 'index.html');
const bundle = read('webview', 'script.js');
const panelModule = read('webview', 'modules', '89b-mobile-base-panel.js');
const isoModule = read('webview', 'modules', '86b-settlement-isometric.js');
const dioramaModule = read('webview', 'modules', '86c-settlement-diorama.js');
const worldModule = read('webview', 'modules', '85-world.js');
const bridgeSrc = read('src', 'mobileBaseBridge.ts');
const interiorCoreSrc = read('src', 'mobileBaseInteriorCore.ts');
const worldViewSrc = read('src', 'worldView.ts');

assert(indexHtml.includes('id="world-settlement-mobile-base-banner"'), 'index.html missing mobile base interior banner');
console.log('ok: settlement banner DOM exists');

const panelSymbols = [
    'mobileBaseInterior',
    'viewInteriorCanvas',
    'viewInteriorDiorama',
    'mb-interior-btn',
    'openMobileBaseInteriorView',
];
for (const symbol of panelSymbols) {
    assert(panelModule.includes(symbol), `89b-mobile-base-panel.js missing ${symbol}`);
    assert(bundle.includes(symbol), `script.js bundle missing ${symbol}`);
}
console.log('ok: mobile base panel interior actions bundled');

const isoSymbols = [
    'getMobileBaseInterior',
    'mobileBaseInterior',
    'renderMobileBaseInteriorBanner',
];
for (const symbol of isoSymbols) {
    assert(isoModule.includes(symbol), `86b-settlement-isometric.js missing ${symbol}`);
    assert(bundle.includes(symbol), `script.js bundle missing ${symbol}`);
}
console.log('ok: settlement canvas prefers mobileBaseInterior');

const dioramaSymbols = [
    'getMobileBaseInteriorDiorama',
    'mobileBaseInterior',
];
for (const symbol of dioramaSymbols) {
    assert(dioramaModule.includes(symbol), `86c-settlement-diorama.js missing ${symbol}`);
    assert(bundle.includes(symbol), `script.js bundle missing ${symbol}`);
}
console.log('ok: diorama prefers mobileBaseInterior');

assert(worldModule.includes('hasSettlementMapContent'), '85-world.js must gate settlement mode on mobile base interior');
assert(worldModule.includes('mobileBaseInterior'), '85-world.js must reference mobileBaseInterior');
console.log('ok: world map mode shows settlement when mobile base interior has canvas');

assert(interiorCoreSrc.includes('buildMobileBaseInteriorPayload'), 'mobileBaseInteriorCore must export builder');
assert(bridgeSrc.includes('buildMobileBaseInteriorWebviewPayload'), 'mobileBaseBridge must export interior payload');
assert(worldViewSrc.includes('mobileBaseInterior'), 'worldView must send mobileBaseInterior');
console.log('ok: host bridge wires mobileBaseInterior into worldView');

console.log('webview mobile base interior: all tests passed');