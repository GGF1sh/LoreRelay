#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.join(__dirname, '..');
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf-8');

console.log('Testing Genre Chrome (Graphics Upgrade Track 3) wiring...');

const indexHtml = read('webview', 'index.html');
const bundleCss = read('webview', 'style.css');
const moduleCss = read('webview', 'styles', '9b-genre-chrome.css');
const buildScript = read('scripts', 'build-webview.js');

assert(indexHtml.includes('id="genre-fx-overlay"'), 'index.html missing #genre-fx-overlay');
console.log('ok: genre-fx-overlay DOM exists');

assert(buildScript.includes("'9b-genre-chrome.css'"), 'build-webview.js must register 9b-genre-chrome.css');
assert(
    buildScript.indexOf("'89-vehicles.css'") < buildScript.indexOf("'9b-genre-chrome.css'"),
    '9b-genre-chrome.css must be bundled last so it can layer decoration on top of every other module'
);
console.log('ok: build-webview manifest includes genre chrome as the final CSS module');

// This file must reuse the existing manual body[data-ui-theme] system, not invent a second
// automatic genre attribute (see the design-deviation note in the module header comment).
assert(!moduleCss.includes('data-genre'), '9b-genre-chrome.css must key off data-ui-theme, not a new data-genre attribute');
const themeSelectors = ['cyberpunk', 'scifi', 'horror', 'postapoc', 'steampunk', 'eastern'];
for (const theme of themeSelectors) {
    const selector = `body[data-ui-theme="${theme}"]`;
    assert(moduleCss.includes(selector), `9b-genre-chrome.css missing rules for ${selector}`);
    assert(bundleCss.includes(selector), `webview/style.css bundle missing ${selector}`);
}
console.log('ok: genre chrome covers all 6 non-default theme buttons');

assert(moduleCss.includes('--cyber-glow') && moduleCss.includes('--glass-glow'), 'genre chrome should wire up the previously-unused glow variables');
assert(!moduleCss.includes('@keyframes'), 'genre chrome must stay static (no animation) so prefers-reduced-motion needs no special handling');
console.log('ok: genre chrome is static-only and reuses existing accent glow variables');

console.log('Genre Chrome smoke test passed.');
