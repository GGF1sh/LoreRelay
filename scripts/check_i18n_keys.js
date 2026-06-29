#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'webview/index.html'), 'utf8');
const keys = new Set();

for (const m of html.matchAll(/data-i18n(?:-placeholder|-title)?="([^"]+)"/g)) {
  keys.add(m[1]);
}

const jsDir = path.join(ROOT, 'webview/modules');
for (const f of fs.readdirSync(jsDir).filter((x) => x.endsWith('.js'))) {
  const t = fs.readFileSync(path.join(jsDir, f), 'utf8');
  for (const m of t.matchAll(/data-i18n(?:-placeholder|-title)?="([^"]+)"/g)) keys.add(m[1]);
  for (const m of t.matchAll(/(?:t|i18n)\(['"](webview\.[^'"]+)['"]\)/g)) keys.add(m[1]);
}

const locales = ['ja', 'en', 'zh-CN', 'zh-TW'];
let anyMissing = false;

for (const loc of locales) {
  const data = JSON.parse(fs.readFileSync(path.join(ROOT, 'locales', `${loc}.json`), 'utf8'));
  const missing = [...keys].filter((k) => !(k in data)).sort();
  console.log(`${loc}: missing ${missing.length}`);
  for (const k of missing) console.log(`  ${k}`);
  if (missing.length) anyMissing = true;
}

process.exit(anyMissing ? 1 : 0);