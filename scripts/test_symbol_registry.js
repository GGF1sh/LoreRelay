#!/usr/bin/env node
'use strict';

const assert = require('assert');
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const generator = require('./generate_symbol_registry');

let failed = 0;
function ok(msg) { console.log(`OK: ${msg}`); }
function fail(msg, err) {
    console.error(`FAIL: ${msg}`);
    if (err) {
        console.error(err.stack || err.message || String(err));
    }
    failed++;
}
function run(name, fn) {
    try {
        fn();
        ok(name);
    } catch (err) {
        fail(name, err);
    }
}

const registry = generator.buildRegistry();

function findEntry(predicate, label) {
    const entry = registry.entries.find(predicate);
    assert(entry, `missing registry entry: ${label}`);
    return entry;
}

run('registry has deterministic metadata and generated notice', () => {
    assert.strictEqual(registry.schemaVersion, 1);
    assert.strictEqual(registry.deterministic, true);
    assert(registry.notice.includes('DO NOT EDIT MANUALLY'));
    assert(generator.renderJson(registry).includes('DO NOT EDIT MANUALLY'));
    assert(generator.renderMarkdown(registry).includes('DO NOT EDIT MANUALLY'));
});

run('registry output is deterministic across rebuilds', () => {
    const again = generator.buildRegistry();
    assert.strictEqual(generator.renderJson(registry), generator.renderJson(again));
    assert.strictEqual(generator.renderMarkdown(registry), generator.renderMarkdown(again));
});

run('production TypeScript exports are indexed', () => {
    const fn = findEntry(
        (entry) => entry.name === 'evaluateFoodCrisisEvent'
            && entry.kind === 'function'
            && entry.sourcePath === 'src/livingWorldTypes.ts',
        'evaluateFoodCrisisEvent'
    );
    assert.strictEqual(fn.public, 'exported');
    assert.strictEqual(fn.boundary, 'pure-core');

    findEntry(
        (entry) => entry.name === 'WorldChangeEventLike'
            && entry.kind === 'interface'
            && entry.sourcePath === 'src/livingWorldTypes.ts',
        'WorldChangeEventLike'
    );
});

run('webview top-level functions and window APIs are indexed', () => {
    const render = findEntry(
        (entry) => entry.name === 'renderWorldView'
            && entry.kind === 'webviewFunction'
            && entry.sourcePath === 'webview/modules/85-world.js',
        'renderWorldView'
    );
    assert.strictEqual(render.boundary, 'webview');
    assert.strictEqual(render.public, 'module-top-level');
});

run('host-webview message types are indexed from real postMessage paths', () => {
    const worldView = findEntry(
        (entry) => entry.name === 'worldView'
            && entry.kind === 'messageType'
            && entry.sourcePath === 'src/worldView.ts',
        'worldView message type'
    );
    assert.strictEqual(worldView.boundary, 'host-webview');
    assert.strictEqual(worldView.public, 'protocol');

    findEntry(
        (entry) => entry.name === 'insertChatText'
            && entry.kind === 'messageType'
            && entry.sourcePath.startsWith('webview/modules/'),
        'insertChatText message type'
    );
});

run('package configuration keys are indexed', () => {
    const config = findEntry(
        (entry) => entry.name === 'textAdventure.gmBridge.provider'
            && entry.kind === 'configurationKey'
            && entry.sourcePath === 'package.json',
        'textAdventure.gmBridge.provider'
    );
    assert.strictEqual(config.boundary, 'configuration');
    assert.strictEqual(config.public, 'public');
});

run('registry excludes generated bundles and dependency outputs', () => {
    for (const entry of registry.entries) {
        assert(!entry.sourcePath.startsWith('out/'), `out/ leaked: ${entry.sourcePath}`);
        assert(!entry.sourcePath.includes('node_modules/'), `node_modules leaked: ${entry.sourcePath}`);
        assert.notStrictEqual(entry.sourcePath, 'webview/script.js');
    }
});

run('generated files are current under --check', () => {
    assert(fs.existsSync(generator.JSON_PATH), 'generated JSON missing');
    assert(fs.existsSync(generator.MD_PATH), 'generated Markdown missing');
    const result = spawnSync(process.execPath, ['scripts/generate_symbol_registry.js', '--check'], {
        cwd: root,
        encoding: 'utf8',
    });
    assert.strictEqual(result.status, 0, result.stdout + result.stderr);
});

run('registry counts expose useful slices', () => {
    assert(registry.counts.total > 100, `unexpectedly small registry: ${registry.counts.total}`);
    assert(registry.counts.byKind.function > 0, 'no function entries');
    assert(registry.counts.byKind.configurationKey > 0, 'no configuration key entries');
    assert(registry.counts.byKind.messageType > 0, 'no message type entries');
    assert(registry.counts.byCategory.configuration > 0, 'no configuration category count');
    assert(registry.counts.byCategory.webview > 0, 'no webview category count');
});

if (failed > 0) {
    process.exit(1);
}
console.log('symbol registry tests passed.');
