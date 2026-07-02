#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const keys = new Set();

function collectFromText(text) {
    for (const m of text.matchAll(/data-i18n(?:-placeholder|-title)?="([^"]+)"/g)) {
        keys.add(m[1]);
    }
    for (const m of text.matchAll(/(?:T|t|i18n)\(\s*['"]((?:webview|extension)\.[^'"]+)['"]/g)) {
        keys.add(m[1]);
    }
}

function walkTsFiles(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            walkTsFiles(full);
        } else if (entry.isFile() && entry.name.endsWith('.ts')) {
            collectFromText(fs.readFileSync(full, 'utf8'));
        }
    }
}

const html = fs.readFileSync(path.join(ROOT, 'webview/index.html'), 'utf8');
collectFromText(html);

const jsDir = path.join(ROOT, 'webview/modules');
for (const f of fs.readdirSync(jsDir).filter((x) => x.endsWith('.js'))) {
    collectFromText(fs.readFileSync(path.join(jsDir, f), 'utf8'));
}

walkTsFiles(path.join(ROOT, 'src'));

const locales = ['ja', 'en', 'zh-CN', 'zh-TW'];
let anyMissing = false;

console.log(`i18n keys referenced in webview + src: ${keys.size}`);

for (const loc of locales) {
    const data = JSON.parse(fs.readFileSync(path.join(ROOT, 'locales', `${loc}.json`), 'utf8'));
    const missing = [...keys].filter((k) => !(k in data)).sort();
    console.log(`${loc}: missing ${missing.length}`);
    for (const k of missing) {
        console.log(`  ${k}`);
    }
    if (missing.length) {
        anyMissing = true;
    }
}

process.exit(anyMissing ? 1 : 0);