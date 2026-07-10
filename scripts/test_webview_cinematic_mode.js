#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.join(__dirname, '..');
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf-8');

console.log('Testing Cinematic Play Mode (PLAY-UX-001) wiring...');

const indexHtml = read('webview', 'index.html');
const moduleCss = read('webview', 'styles', '9a-cinematic-mode.css');
const moduleJs = read('webview', 'modules', '89d-cinematic-mode.js');
const bundleCss = read('webview', 'style.css');
const bundleJs = read('webview', 'script.js');
const buildScript = read('scripts', 'build-webview.js');

// --- DOM contract: toggle button + floating topbar with strip/tools/exit ---
for (const id of [
    'cinematic-mode-btn',
    'cinematic-topbar',
    'cinematic-status-strip',
    'cin-stat-location',
    'cin-stat-time',
    'cin-stat-funds',
    'cinematic-tools-btn',
    'cinematic-exit-btn'
]) {
    assert(indexHtml.includes(`id="${id}"`), `index.html missing #${id}`);
}
console.log('ok: cinematic DOM (toggle, topbar, status strip, tools, exit) exists');

// --- Bundle manifest: CSS after 89-vehicles, before 9b-genre-chrome (which must stay last);
//     JS before 90-bootstrap so listeners exist when bootstrap fires initial state. ---
assert(buildScript.includes("'9a-cinematic-mode.css'"), 'build-webview.js must register 9a-cinematic-mode.css');
assert(
    buildScript.indexOf("'89-vehicles.css'") < buildScript.indexOf("'9a-cinematic-mode.css'"),
    '9a-cinematic-mode.css must come after 89-vehicles.css'
);
assert(
    buildScript.indexOf("'9a-cinematic-mode.css'") < buildScript.indexOf("'9b-genre-chrome.css'"),
    '9a-cinematic-mode.css must come before 9b-genre-chrome.css (genre chrome stays the final CSS module)'
);
assert(buildScript.includes("'89d-cinematic-mode.js'"), 'build-webview.js must register 89d-cinematic-mode.js');
assert(
    buildScript.indexOf("'89d-cinematic-mode.js'") < buildScript.indexOf("'90-bootstrap.js'"),
    '89d-cinematic-mode.js must come before 90-bootstrap.js'
);
console.log('ok: build-webview manifest ordering (CSS before genre chrome, JS before bootstrap)');

// --- Bundles actually contain the mode (guards against stale generated files) ---
assert(bundleCss.includes('data-play-mode="cinematic"'), 'style.css bundle missing cinematic rules — run npm run build:webview');
assert(bundleJs.includes('CINEMATIC_MODE_STORAGE_KEY'), 'script.js bundle missing cinematic module — run npm run build:webview');
console.log('ok: generated bundles include the cinematic mode');

// --- Presentation-only contract: the module must never write game state ---
assert(!moduleJs.includes('vscode.postMessage'), '89d-cinematic-mode.js must stay presentation-only (no postMessage to the host)');
console.log('ok: module is presentation-only (no host messages)');

// --- The mode is opt-in via a body attribute; base layout must be untouched ---
assert(moduleCss.match(/body\[data-play-mode="cinematic"\]/g).length >= 10,
    'cinematic CSS must scope its rules under body[data-play-mode="cinematic"]');
const unscopedHide = moduleCss.split('\n').some(line =>
    /^#(status-area|chat-header|resizer|quick-reply-bar)\b/.test(line.trim()));
assert(!unscopedHide, 'cinematic CSS must not restyle console elements outside the mode scope');
console.log('ok: all console overrides are scoped to the cinematic body attribute');

// --- Motion & accessibility ---
assert(moduleCss.includes('prefers-reduced-motion'), 'cinematic CSS missing prefers-reduced-motion guard');
assert(indexHtml.includes('aria-pressed'), 'toggle button missing aria-pressed');
assert(indexHtml.includes('aria-expanded'), 'tools button missing aria-expanded');
assert(moduleJs.includes("e.key !== 'Escape'") || moduleJs.includes('Escape'), 'module missing Escape-to-exit handler');
assert(moduleJs.includes('isComposing'), 'Escape handler must ignore IME composition');
console.log('ok: reduced-motion guard, ARIA states, Esc-to-exit (IME-safe)');

// --- i18n: all four locales carry the cinematic keys ---
const CINEMATIC_KEYS = [
    'webview.cinematic.enter',
    'webview.cinematic.exit',
    'webview.cinematic.exitLabel',
    'webview.cinematic.tools'
];
for (const locale of ['ja', 'en', 'zh-CN', 'zh-TW']) {
    const dict = JSON.parse(read('locales', `${locale}.json`));
    for (const key of CINEMATIC_KEYS) {
        assert(typeof dict[key] === 'string' && dict[key].length > 0, `${locale}.json missing ${key}`);
    }
}
console.log('ok: cinematic i18n keys present in all 4 locales');

console.log('Cinematic Play Mode smoke test passed.');
