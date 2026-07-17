#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const world = fs.readFileSync(path.join(root, 'webview', 'modules', '85-world.js'), 'utf8');
const diorama = fs.readFileSync(path.join(root, 'webview', 'modules', '86c-settlement-diorama.js'), 'utf8');

function functionSource(source, name, nextName) {
    const start = source.indexOf(`function ${name}`);
    const end = source.indexOf(`function ${nextName}`, start + 1);
    assert.ok(start >= 0 && end > start, `unable to isolate ${name}`);
    return source.slice(start, end);
}

const settlementSync = functionSource(world, 'syncSettlementMapModeUi', 'syncDioramaMapModeUi');
const dioramaSync = functionSource(world, 'syncDioramaMapModeUi', 'setWorldMapMode');
const setMode = functionSource(world, 'setWorldMapMode', 'applyWorldMapModeVisibility');

assert.ok(settlementSync.includes('enableSettlementMode'));
assert.ok(settlementSync.includes('enableMobileBaseSystem'));
assert.ok(!settlementSync.includes("setWorldMapMode('mermaid')"));
assert.ok(dioramaSync.includes('enableSettlementDiorama'));
assert.ok(!dioramaSync.includes("setWorldMapMode('mermaid')"));
assert.ok(setMode.includes("'diorama'"));
assert.ok(setMode.includes("'settlement'"));
assert.ok(!setMode.includes('targetBtn.classList.contains'));

assert.ok(diorama.includes('webview.world.dioramaNoDataLocation'));
assert.ok(diorama.includes('disposeSettlementDioramaRenderer'));
assert.ok(diorama.includes("stage.classList.add('hidden')"));

for (const locale of ['en', 'ja', 'zh-CN', 'zh-TW']) {
    const messages = JSON.parse(fs.readFileSync(path.join(root, 'locales', `${locale}.json`), 'utf8'));
    assert.ok(messages['webview.world.dioramaNoDataLocation'], `${locale} missing Diorama no-data copy`);
}

console.log('world mode persistence: all tests passed');
