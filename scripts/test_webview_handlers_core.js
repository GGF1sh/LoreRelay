#!/usr/bin/env node
/**
 * Unit tests for webviewHandlersCore.ts (requires npm run compile).
 */
'use strict';

const path = require('path');
const root = path.join(__dirname, '..');
const corePath = path.join(root, 'out', 'webviewHandlersCore.js');

let failed = 0;
function fail(msg) { console.error(`FAIL: ${msg}`); failed++; }
function ok(msg) { console.log(`OK: ${msg}`); }

if (!require('fs').existsSync(corePath)) {
    fail('out/webviewHandlersCore.js missing — run npm run compile first');
    process.exit(1);
}

const {
    normalizeWorldForgeSeed,
    normalizeWorldForgeTheme,
    normalizeMermaidTarget,
    normalizeMemoryBackend,
    sanitizeEquipmentNotifyFields,
    clampString,
    clampWorldGenCount,
    MAX_WORLD_FORGE_SEED_LEN
} = require(corePath);

if (normalizeWorldForgeSeed('  lost-catacombs  ') !== 'lost-catacombs') {
    fail('seed trim');
} else {
    ok('seed trim');
}

if (normalizeWorldForgeSeed('x'.repeat(100)).length !== MAX_WORLD_FORGE_SEED_LEN) {
    fail('seed max length');
} else {
    ok('seed max length');
}

if (normalizeWorldForgeTheme('cyberpunk') !== 'cyberpunk') {
    fail('theme allowlist hit');
} else {
    ok('theme allowlist hit');
}

if (normalizeWorldForgeTheme('evil-theme') !== 'default') {
    fail('unknown theme -> default');
} else {
    ok('unknown theme -> default');
}

if (normalizeMermaidTarget('relations') !== 'relations') {
    fail('mermaid target allowlist');
} else {
    ok('mermaid target allowlist');
}

if (normalizeMermaidTarget('inject-me') !== 'questFlow') {
    fail('unknown mermaid target -> questFlow');
} else {
    ok('unknown mermaid target -> questFlow');
}

if (normalizeMemoryBackend('ChromaDB') !== 'chromadb') {
    fail('memory backend normalize');
} else {
    ok('memory backend normalize');
}

if (normalizeMemoryBackend('redis') !== undefined) {
    fail('invalid memory backend rejected');
} else {
    ok('invalid memory backend rejected');
}

{
    const eq = sanitizeEquipmentNotifyFields({
        name: 'n'.repeat(300),
        weapon: 'sword',
        armor: '',
        accessory: ''
    });
    if (eq.name.length !== 100 || eq.weapon !== 'sword') {
        fail('equipment field clamp');
    } else {
        ok('equipment field clamp');
    }
}

if (clampString(42, 10) !== '') {
    fail('clampString rejects non-string');
} else {
    ok('clampString rejects non-string');
}

if (clampWorldGenCount(99, 3, 12, 5) !== 12) {
    fail('clampWorldGenCount caps high');
} else {
    ok('clampWorldGenCount caps high');
}

if (clampWorldGenCount('x', 3, 12, 5) !== 5) {
    fail('clampWorldGenCount falls back');
} else {
    ok('clampWorldGenCount falls back');
}

if (failed > 0) {
    process.exit(1);
}
console.log('\nwebviewHandlersCore tests passed.');