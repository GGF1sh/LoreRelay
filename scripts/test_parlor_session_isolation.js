#!/usr/bin/env node
'use strict';

// Regression: opening character B must never reuse character A's Parlor file.

const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');

const root = path.join(__dirname, '..');
const outSessionPath = path.join(root, 'out', 'parlorSession.js');
if (!fs.existsSync(outSessionPath)) {
    console.error('FAIL: out/parlorSession.js missing — run npm run compile first');
    process.exit(1);
}

const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'parlor-session-isolation-'));
const originalLoad = Module._load;
Module._load = function mockVscode(request, parent, isMain) {
    if (request === 'vscode') {
        return {
            workspace: {
                workspaceFolders: [{ uri: { fsPath: workspace }, name: 'session-test' }],
                getConfiguration: () => ({ get: (_key, fallback) => fallback }),
            },
        };
    }
    return originalLoad.call(this, request, parent, isMain);
};

const {
    loadParlorSession,
    getOrCreateParlorSession,
} = require(outSessionPath);

let failed = 0;
function ok(message) { console.log(`OK: ${message}`); }
function fail(message) { console.error(`FAIL: ${message}`); failed++; }

// Represent an existing session for A in the old shared path, then activate B.
const legacyPath = path.join(workspace, 'parlor_session.json');
fs.writeFileSync(legacyPath, JSON.stringify({
    version: 1,
    activeCharacterId: 'alice',
    messages: [{ id: 'a-greeting', role: 'assistant', content: 'Hello from Alice', createdAt: '2026-01-01T00:00:00.000Z' }],
    updatedAt: '2026-01-01T00:00:00.000Z',
}), 'utf-8');

const a = loadParlorSession('alice');
const beforeB = loadParlorSession('bob');
const b = getOrCreateParlorSession('bob');
const afterB = loadParlorSession('bob');
const aAfterB = loadParlorSession('alice');

if (!a || a.activeCharacterId !== 'alice' || a.messages[0]?.content !== 'Hello from Alice') {
    fail('A legacy session should remain available to Alice');
} else if (beforeB !== undefined) {
    fail('A history must not load before B session creation');
} else if (b.activeCharacterId !== 'bob' || b.messages.length !== 0) {
    fail('B must receive a fresh character-owned session');
} else if (!fs.existsSync(path.join(workspace, 'parlor_session.bob.json'))) {
    fail('B session must persist to its character-owned file');
} else if (!afterB || afterB.activeCharacterId !== 'bob' || afterB.messages.length !== 0) {
    fail('reopened B session must remain B-owned and empty');
} else if (!aAfterB || aAfterB.activeCharacterId !== 'alice' || aAfterB.messages[0]?.content !== 'Hello from Alice') {
    fail('creating B must not overwrite A history');
} else {
    ok('A and B Parlor sessions remain isolated through import/activation/open');
}

if (failed > 0) {
    process.exit(1);
}
console.log('All Parlor session isolation tests passed.');
