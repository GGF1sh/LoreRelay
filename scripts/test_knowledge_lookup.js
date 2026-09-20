#!/usr/bin/env node
'use strict';

const assert = require('assert');
const { spawnSync } = require('child_process');
const path = require('path');
const knowledge = require('./knowledge_lookup');

const root = path.join(__dirname, '..');

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

function lookup(query) {
    return knowledge.runLookup(query);
}

run('knowledge lookup finds exact symbol', () => {
    const out = lookup('evaluateFoodCrisisEvent');
    assert(out.includes('evaluateFoodCrisisEvent'));
    assert(out.includes('kind=function'));
    assert(out.includes('source=src/livingWorldTypes.ts:'));
});

run('knowledge lookup supports partial case-insensitive query', () => {
    const out = lookup('relaywaitingstated');
    assert(out.includes('relayWaitingStateDone'));
    assert(out.includes('Protocol pairs:'));
});

run('knowledge lookup groups known host to webview paired protocol', () => {
    const out = lookup('relayWaitingStateDone');
    assert(out.includes('- relayWaitingStateDone | paired'));
    assert(out.includes('host-to-webview senders: src/gameStateSync.ts:'));
    assert(out.includes('receivers: webview/modules/90-bootstrap.js:'));
});

run('knowledge lookup groups known webview to host paired protocol', () => {
    const out = lookup('selectOption');
    assert(out.includes('- selectOption | paired'));
    assert(out.includes('webview-to-host senders: webview/modules/10-game-state.js:'));
    assert(out.includes('receivers: src/remotePlayServer.ts:'));
    assert(out.includes('src/webviewHandlers.ts:'));
});

run('protocol pairing reports sender-only message as unpaired', () => {
    const lines = knowledge.formatProtocolGroups([{
        name: 'senderOnlyMessage',
        kind: 'messageType',
        direction: 'host-to-webview',
        sourcePath: 'src/gameStateSync.ts',
        line: 10,
    }]);
    assert(lines.includes('- senderOnlyMessage | unpaired'));
});

run('protocol pairing rejects host sender with host-side receiver', () => {
    const lines = knowledge.formatProtocolGroups([
        {
            name: 'wrongSideHostMessage',
            kind: 'messageType',
            direction: 'host-to-webview',
            sourcePath: 'src/gameStateSync.ts',
            line: 10,
        },
        {
            name: 'wrongSideHostMessage',
            kind: 'messageType',
            direction: 'received',
            sourcePath: 'src/webviewHandlers.ts',
            line: 20,
        },
    ]);
    assert(lines.includes('- wrongSideHostMessage | unpaired'));
});

run('protocol pairing rejects webview sender with webview-side receiver', () => {
    const lines = knowledge.formatProtocolGroups([
        {
            name: 'wrongSideWebviewMessage',
            kind: 'messageType',
            direction: 'webview-to-host',
            sourcePath: 'webview/modules/10-game-state.js',
            line: 10,
        },
        {
            name: 'wrongSideWebviewMessage',
            kind: 'messageType',
            direction: 'received',
            sourcePath: 'webview/modules/90-bootstrap.js',
            line: 20,
        },
    ]);
    assert(lines.includes('- wrongSideWebviewMessage | unpaired'));
});

run('protocol pairing reports each bidirectional direction honestly', () => {
    const lines = knowledge.formatProtocolGroups([
        {
            name: 'bidirectionalMixedMessage',
            kind: 'messageType',
            direction: 'host-to-webview',
            sourcePath: 'src/gameStateSync.ts',
            line: 10,
        },
        {
            name: 'bidirectionalMixedMessage',
            kind: 'messageType',
            direction: 'webview-to-host',
            sourcePath: 'webview/modules/10-game-state.js',
            line: 20,
        },
        {
            name: 'bidirectionalMixedMessage',
            kind: 'messageType',
            direction: 'received',
            sourcePath: 'webview/modules/90-bootstrap.js',
            line: 30,
        },
    ]);
    assert(lines.includes('- bidirectionalMixedMessage | host-to-webview=paired; webview-to-host=unpaired'));
});

run('knowledge lookup finds configuration keys', () => {
    const out = lookup('textAdventure.antigravityRelay.enabled');
    assert(out.includes('textAdventure.antigravityRelay.enabled'));
    assert(out.includes('kind=configurationKey'));
    assert(out.includes('boundary=configuration'));
});

run('knowledge lookup searches terminology text', () => {
    const out = lookup('EntityKind Layer Ownership');
    assert(out.includes('Terminology Contract:'));
    assert(out.includes('EntityKind Layer Ownership'));
});

run('knowledge lookup reports no-result behavior', () => {
    const out = lookup('definitely_no_lorerelay_symbol_zzzz');
    assert(out.includes('Symbol Registry: no matches'));
    assert(out.includes('Curated docs: no matches'));
    assert(out.includes('No matches found.'));
});

run('knowledge lookup output stays compact', () => {
    const out = lookup('relay');
    const lines = out.split(/\r?\n/);
    assert(lines.length < 80, `output too long: ${lines.length} lines`);
    assert(!out.includes('"entries"'), 'must not dump full registry JSON');
});

run('knowledge CLI accepts a query argument', () => {
    const result = spawnSync(process.execPath, ['scripts/knowledge_lookup.js', 'textAdventure.antigravityRelay.enabled'], {
        cwd: root,
        encoding: 'utf8',
    });
    assert.strictEqual(result.status, 0, result.stdout + result.stderr);
    assert(result.stdout.includes('textAdventure.antigravityRelay.enabled'));
});

if (failed > 0) {
    process.exit(1);
}
console.log('knowledge lookup tests passed.');
