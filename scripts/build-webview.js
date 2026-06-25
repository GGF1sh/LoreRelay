/**
 * Concatenates webview/modules/*.js → webview/script.js
 */
const fs = require('fs');
const path = require('path');

const MODULE_ORDER = [
    '00-core.js',
    '10-game-state.js',
    '20-input-audio-prep.js',
    '30-bgm-sfx.js',
    '40-dice-calc-tabs.js',
    '50-character-saga.js',
    '60-tts-quickreply-imagegen.js',
    '90-bootstrap.js'
];

const modulesDir = path.join(__dirname, '..', 'webview', 'modules');
const outPath = path.join(__dirname, '..', 'webview', 'script.js');

let out = [
    '// AUTO-GENERATED from webview/modules/*.js — run: npm run build:webview',
    '// @ts-nocheck',
    '// LoreRelay - Webview Script',
    ''
].join('\n');

for (const file of MODULE_ORDER) {
    const p = path.join(modulesDir, file);
    if (!fs.existsSync(p)) {
        console.error('Missing module:', p);
        process.exit(1);
    }
    out += `\n// --- ${file} ---\n`;
    out += fs.readFileSync(p, 'utf-8').trimEnd() + '\n';
}

fs.writeFileSync(outPath, out, 'utf-8');
const lineCount = out.split('\n').length;
console.log(`Built webview/script.js (${lineCount} lines) from ${MODULE_ORDER.length} modules`);