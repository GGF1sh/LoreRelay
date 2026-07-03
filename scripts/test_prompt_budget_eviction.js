#!/usr/bin/env node
'use strict';

const path = require('path');
const root = path.join(__dirname, '..');
const corePath = path.join(root, 'out', 'gmPromptBuilderCore.js');

let failed = 0;
function fail(msg) { console.error(`FAIL: ${msg}`); failed++; }
function ok(msg) { console.log(`OK: ${msg}`); }

if (!require('fs').existsSync(corePath)) {
    fail('out/gmPromptBuilderCore.js missing — run npm run compile first');
    process.exit(1);
}

const { evictPromptChunksByBudget, resolvePromptChunkPriority } = require(corePath);

if (resolvePromptChunkPriority('gameRules') <= resolvePromptChunkPriority('vision')) {
    fail('gameRules priority should exceed vision');
} else {
    ok('priority ordering');
}

if (resolvePromptChunkPriority('worldState') <= resolvePromptChunkPriority('livingWorldNpcBonds')) {
    fail('worldState priority should exceed livingWorldNpcBonds');
} else if (resolvePromptChunkPriority('livingWorldNpcBonds') <= resolvePromptChunkPriority('livingWorldPlayerBonds')) {
    fail('livingWorldNpcBonds priority should exceed livingWorldPlayerBonds');
} else {
    ok('LW bond chunk priorities below worldState');
}

{
    const chunks = [
        { id: 'gameRules', text: 'rules', priority: 100 },
        { id: 'vision', text: 'v'.repeat(5000), priority: 35 },
        { id: 'lorebook', text: 'l'.repeat(5000), priority: 40 },
    ];
    const kept = evictPromptChunksByBudget(chunks, 6000);
    const joined = kept.join('\n');
    if (!joined.includes('rules')) {
        fail('high-priority gameRules preserved');
    } else {
        ok('high-priority gameRules preserved');
    }
    if (joined.includes('v'.repeat(4000))) {
        fail('low-priority vision evicted or truncated first');
    } else {
        ok('low-priority vision evicted or truncated first');
    }
}

{
    const bondPad = 'b'.repeat(4000);
    const chunks = [
        { id: 'gameRules', text: 'rules', priority: 100 },
        { id: 'worldState', text: 'world-core', priority: 68 },
        { id: 'livingWorldNpcBonds', text: bondPad, priority: 62 },
        { id: 'livingWorldPlayerBonds', text: bondPad, priority: 61 },
    ];
    const kept = evictPromptChunksByBudget(chunks, 200);
    const joined = kept.join('\n');
    if (!joined.includes('rules') || !joined.includes('world-core')) {
        fail(`core chunks preserved under budget: ${joined.length}`);
    } else if (joined.includes(bondPad)) {
        fail('LW bond chunks should evict before worldState');
    } else {
        ok('LW bond chunks evicted before worldState under tight budget');
    }
}

if (failed > 0) {
    process.exit(1);
}
console.log('prompt budget eviction: all tests passed.');