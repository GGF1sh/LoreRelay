#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');

let failed = 0;
function fail(msg) { console.error(`FAIL: ${msg}`); failed++; }
function ok(msg) { console.log(`OK: ${msg}`); }

const corePath = path.join(root, 'out', 'gmPromptBuilderCore.js');
const settlementPath = path.join(root, 'out', 'settlementCore.js');

for (const p of [corePath, settlementPath]) {
    if (!fs.existsSync(p)) {
        fail(`${p} missing — run npm run compile`);
        process.exit(1);
    }
}

const { evictPromptChunksByBudget, resolvePromptChunkPriority } = require(corePath);
const { buildSettlementPromptBlock } = require(settlementPath);

const heavyState = {
    version: 1,
    settlementId: 'long_camp',
    name: 'Long Campaign Settlement',
    locationId: 'hub',
    worldTurn: 120,
    morale: 55,
    safety: 48,
    stocks: Array.from({ length: 40 }, (_, i) => ({ id: `stock_${i}`, amount: i % 5 })),
    structures: Array.from({ length: 30 }, (_, i) => ({
        id: `s${i}`,
        name: `Structure ${i}`,
        status: i % 3 === 0 ? 'damaged' : 'intact',
    })),
    residents: [],
    visitors: Array.from({ length: 8 }, (_, i) => ({
        npcId: `visitor_${i}`,
        untilWorldTurn: 130 + i,
        purpose: 'trade',
    })),
    merchants: [],
    incidents: Array.from({ length: 10 }, (_, i) => ({
        id: `inc${i}`,
        severity: 'warning',
        text: `Incident detail line ${i} `.repeat(4),
        resolved: i > 6,
    })),
    notes: [],
};

{
    const full = buildSettlementPromptBlock(heavyState, true);
    const summary = buildSettlementPromptBlock(heavyState, true, { summaryOnly: true });
    if (full.length <= summary.length) {
        fail('summary-only settlement prompt should be shorter than full block');
    } else if (!summary.includes('Layer expansion') || summary.includes('stock_39')) {
        fail('summary-only should omit per-stock lines');
    } else if (summary.length > 600) {
        fail(`summary-only should stay compact: ${summary.length}`);
    } else {
        ok('settlement summary-only mode compresses long-session state');
    }
}

{
    if (resolvePromptChunkPriority('settlement') >= resolvePromptChunkPriority('worldForge')) {
        fail('settlement should evict before worldForge');
    } else if (resolvePromptChunkPriority('settlement') >= resolvePromptChunkPriority('campaignKit')) {
        fail('settlement should evict before campaignKit');
    } else {
        ok('settlement chunk priority lowered for long-session eviction');
    }
}

{
    const settlementPad = buildSettlementPromptBlock(heavyState, true);
    const chunks = [
        { id: 'gameRules', text: 'SYSTEM: respect player agency', priority: 100 },
        { id: 'narrativeTime', text: 'TIME: evening', priority: 98 },
        { id: 'campaignKit', text: 'c'.repeat(3000), priority: 94 },
        { id: 'worldForge', text: 'w'.repeat(3000), priority: 65 },
        { id: 'settlement', text: settlementPad, priority: 58 },
        { id: 'livingWorldNpcBonds', text: 'b'.repeat(3000), priority: 62 },
    ];
    const kept = evictPromptChunksByBudget(chunks, 900);
    const joined = kept.join('\n');
    if (!joined.includes('SYSTEM:') || !joined.includes('TIME:')) {
        fail('Tier 0 chunks preserved in long-session budget squeeze');
    } else if (joined.includes('c'.repeat(2000))) {
        fail('campaignKit should evict before settlement under budget');
    } else if (joined.length > 1200) {
        fail(`budget should be enforced: ${joined.length}`);
    } else {
        ok('long-session eviction drops simulation chunks before Tier 0');
    }
}

if (failed > 0) {
    process.exit(1);
}
console.log('settlement prompt bloat long session: all tests passed.');