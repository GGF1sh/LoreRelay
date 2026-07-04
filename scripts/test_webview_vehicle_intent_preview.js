#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.join(__dirname, '..');
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf-8');

console.log('Testing World Intent WI3a-1 Vehicle Preview (Tier 1) wiring...');

const previewModule = read('webview', 'modules', '89c-vehicle-intent-preview.js');
const vehiclesModule = read('webview', 'modules', '89-vehicles.js');
const bundle = read('webview', 'script.js');
const cssModule = read('webview', 'styles', '89-vehicles.css');
const bundleCss = read('webview', 'style.css');
const buildScript = read('scripts', 'build-webview.js');
const enLocale = JSON.parse(read('locales', 'en.json'));
const jaLocale = JSON.parse(read('locales', 'ja.json'));
const zhCnLocale = JSON.parse(read('locales', 'zh-CN.json'));
const zhTwLocale = JSON.parse(read('locales', 'zh-TW.json'));

// --- Build manifest wiring ---

assert(buildScript.includes("'89c-vehicle-intent-preview.js'"), 'build-webview.js must include 89c-vehicle-intent-preview.js');
assert(
    buildScript.indexOf("'89a-vehicle-labels.js'") < buildScript.indexOf("'89c-vehicle-intent-preview.js'")
        && buildScript.indexOf("'89c-vehicle-intent-preview.js'") < buildScript.indexOf("'89-vehicles.js'"),
    '89c-vehicle-intent-preview.js must bundle after labels and before the main vehicles module'
);
console.log('ok: build-webview manifest includes the Tier 1 preview module in the right order');

// --- Pure module contract: no host/query calls, no I/O, no vscode/fs imports ---

const forbiddenSymbols = ['queryWorldIntent', 'executeWorldIntent', 'require(', 'vscode', 'acquireVsCodeApi', 'postMessage'];
for (const symbol of forbiddenSymbols) {
    assert(!previewModule.includes(symbol), `89c-vehicle-intent-preview.js must not reference ${symbol}`);
}
console.log('ok: Tier 1 preview module has no host query / persistence / message surface');

// --- Registry closure: exactly the four player-facing actions, damage_vehicle excluded ---

const expectedActions = ['set_active_vehicle', 'move_vehicle', 'repair_vehicle', 'refuel_vehicle'];
for (const action of expectedActions) {
    assert(previewModule.includes(`'${action}'`), `89c-vehicle-intent-preview.js missing action ${action}`);
}
assert(!previewModule.includes("'damage_vehicle'"), 'damage_vehicle must not be a player-facing preview row (no player affordance)');
console.log('ok: Tier 1 preview covers exactly the four player-facing vehicle actions');

// --- Read-only contract: no buttons/inputs/listeners inside the preview block ---

const previewBlockMatch = vehiclesModule.match(/function renderIntentPreview[\s\S]*?\n {4}}\n/);
assert(previewBlockMatch, '89-vehicles.js must define renderIntentPreview()');
const previewBlockSrc = previewBlockMatch[0];
for (const forbidden of ['<button', '<input', 'addEventListener', 'onclick']) {
    assert(!previewBlockSrc.includes(forbidden), `renderIntentPreview() must not render/wire ${forbidden}`);
}
console.log('ok: renderIntentPreview() renders no interactive controls');

assert(vehiclesModule.includes('renderIntentPreview(item)'), '89-vehicles.js must call renderIntentPreview() from renderDetail()');
assert(bundle.includes('LR_vehicleIntentPreview'), 'script.js bundle must include LR_vehicleIntentPreview wiring');
console.log('ok: vehicle detail card wires the Tier 1 preview block');

// --- CSS: status is not color-only (dot + text + shape distinction for needs_input) ---

for (const status of ['valid_noop', 'allowed', 'blocked', 'needs_input']) {
    const selector = `[data-intent-status="${status}"]`;
    assert(cssModule.includes(selector), `89-vehicles.css missing style for ${selector}`);
    assert(bundleCss.includes(selector), `webview/style.css bundle missing ${selector}`);
}
assert(cssModule.includes('vehicle-intent-sr-only'), '89-vehicles.css must define a screen-reader-only utility for status text');
console.log('ok: preview status styling covers all four states and stays non-color-only');

// --- i18n: keys exist in all 4 locales, no raw status enum leaks into rendered text ---

const requiredKeys = [
    'webview.vehicles.intentPreview.title',
    'webview.vehicles.intentPreview.ariaLabel',
    'webview.vehicles.intentPreview.action.setActive',
    'webview.vehicles.intentPreview.action.move',
    'webview.vehicles.intentPreview.action.repair',
    'webview.vehicles.intentPreview.action.refuel',
    'webview.vehicles.intentPreview.status.alreadyActive',
    'webview.vehicles.intentPreview.status.availableActivate',
    'webview.vehicles.intentPreview.status.alreadyMaxHp',
    'webview.vehicles.intentPreview.status.repairable',
    'webview.vehicles.intentPreview.status.alreadyFull',
    'webview.vehicles.intentPreview.status.refuelable',
    'webview.vehicles.intentPreview.status.needsDestination',
    'webview.vehicles.intentPreview.status.blockedPrefix',
    'webview.vehicles.intentPreview.reason.systemDisabled',
    'webview.vehicles.intentPreview.reason.vehicleLost',
    'webview.vehicles.intentPreview.reason.noFuelTank',
    'webview.vehicles.intentPreview.srStatusPrefix',
];
for (const [locName, locData] of [['en', enLocale], ['ja', jaLocale], ['zh-CN', zhCnLocale], ['zh-TW', zhTwLocale]]) {
    for (const key of requiredKeys) {
        assert(key in locData, `${locName}.json missing i18n key ${key}`);
    }
}
console.log('ok: all Tier 1 preview i18n keys exist in ja/en/zh-CN/zh-TW');

// `statusClass` values are internal classification codes consumed only via the
// `data-intent-status` attribute (styled by CSS); the visible text must always
// route through T(row.textKey / row.reasonKey), never a raw interpolation of
// row.statusClass or row.action into the rendered label/status spans.
const visibleTextLines = [
    previewBlockSrc.match(/vehicle-intent-action">\$\{[^}]*\}/)?.[0],
    previewBlockSrc.match(/vehicle-intent-status-text">\$\{[^}]*\}/)?.[0],
];
for (const line of visibleTextLines) {
    assert(line, 'renderIntentPreview() must render both an action label and a status text span');
    assert(!line.includes('row.statusClass'), `visible text must not directly interpolate the raw status code: ${line}`);
    assert(!/\$\{row\.action\}/.test(line), `visible text must not directly interpolate the raw action key: ${line}`);
}
console.log('ok: no raw WorldIntent status/action enum leaks as display text (mapped via i18n keys)');

// --- Functional: computeRows() taxonomy for representative states ---
// Load the browser-global IIFE into an isolated sandbox (no eval, no global pollution).

const sandboxWindow = {};
const runPreviewModule = new Function('window', previewModule);
runPreviewModule(sandboxWindow);
const { computeRows } = sandboxWindow.LR_vehicleIntentPreview;

function statusOf(rows, action) {
    return rows.find((r) => r.action === action)?.statusClass;
}

// System disabled blocks everything regardless of vehicle state.
{
    const rows = computeRows({ status: 'available', isActive: false, hp: 5, maxHp: 10, powerType: 'fuel', fuelCurrent: 1, fuelMax: 10 }, false);
    for (const action of expectedActions) {
        assert.strictEqual(statusOf(rows, action), 'blocked', `${action} should be blocked when vehicle system disabled`);
    }
}

// Lost vehicle blocks everything even when system enabled.
{
    const rows = computeRows({ status: 'lost', isActive: false, hp: 5, maxHp: 10, powerType: 'fuel', fuelCurrent: 1, fuelMax: 10 }, true);
    for (const action of expectedActions) {
        assert.strictEqual(statusOf(rows, action), 'blocked', `${action} should be blocked when vehicle is lost`);
    }
}

// Already-active / already-max-hp / already-full collapse to valid_noop.
{
    const rows = computeRows({ status: 'available', isActive: true, hp: 10, maxHp: 10, powerType: 'fuel', fuelCurrent: 10, fuelMax: 10 }, true);
    assert.strictEqual(statusOf(rows, 'set_active_vehicle'), 'valid_noop');
    assert.strictEqual(statusOf(rows, 'repair_vehicle'), 'valid_noop');
    assert.strictEqual(statusOf(rows, 'refuel_vehicle'), 'valid_noop');
    assert.strictEqual(statusOf(rows, 'move_vehicle'), 'needs_input', 'move_vehicle must never claim allowed/valid_noop without a destination');
}

// Damaged/low-fuel/inactive vehicle surfaces "allowed" (generic, payload-free) rows.
{
    const rows = computeRows({ status: 'available', isActive: false, hp: 4, maxHp: 10, powerType: 'fuel', fuelCurrent: 2, fuelMax: 10 }, true);
    assert.strictEqual(statusOf(rows, 'set_active_vehicle'), 'allowed');
    assert.strictEqual(statusOf(rows, 'repair_vehicle'), 'allowed');
    assert.strictEqual(statusOf(rows, 'refuel_vehicle'), 'allowed');
}

// No fuel tank (powerType undefined, e.g. a beast/cart) blocks refuel specifically.
{
    const rows = computeRows({ status: 'available', isActive: false, hp: 10, maxHp: 10 }, true);
    assert.strictEqual(statusOf(rows, 'refuel_vehicle'), 'blocked');
    const refuelRow = rows.find((r) => r.action === 'refuel_vehicle');
    assert.strictEqual(refuelRow.reasonKey, 'webview.vehicles.intentPreview.reason.noFuelTank');
}

console.log('ok: computeRows() taxonomy matches expected Tier 1 behavior for all sampled states');

console.log('World Intent WI3a-1 vehicle preview: all tests passed');
