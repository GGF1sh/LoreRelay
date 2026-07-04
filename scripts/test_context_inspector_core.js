#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const inspectorPath = path.join(root, 'out', 'contextInspectorCore.js');
const corePath = path.join(root, 'out', 'gmPromptBuilderCore.js');

let failed = 0;
function fail(msg) { console.error(`FAIL: ${msg}`); failed++; }
function ok(msg) { console.log(`OK: ${msg}`); }

for (const p of [inspectorPath, corePath]) {
    if (!fs.existsSync(p)) {
        fail(`${p} missing — run npm run compile`);
        process.exit(1);
    }
}

const {
    buildContextInspectorReport,
    MAX_CONTEXT_INSPECTOR_PREVIEW_CHARS,
} = require(inspectorPath);
const {
    applyPromptChunkBudgetRecords,
    evictPromptChunksByBudget,
    resolvePromptChunkPriority,
} = require(corePath);

function chunk(id, text, priority) {
    return { id, text, priority };
}

{
    const report = buildContextInspectorReport([], 1000, {
        orderedIds: ['settlement'],
        emptyIds: ['settlement'],
    });
    const item = report.items.find((i) => i.id === 'settlement');
    if (!item || item.decision !== 'skipped_empty') {
        fail(`empty chunk should be skipped_empty, got ${JSON.stringify(item)}`);
    } else {
        ok('empty chunk -> skipped_empty');
    }
}

{
    const chunks = [
        chunk('gameRules', 'SYSTEM RULES '.repeat(20), 100),
        chunk('lorebook', 'lore '.repeat(50), 40),
    ];
    const report = buildContextInspectorReport(chunks, 80, {
        orderedIds: ['gameRules', 'lorebook'],
    });
    const pinned = report.items.find((i) => i.id === 'gameRules');
    const evicted = report.items.find((i) => i.id === 'lorebook');
    if (!pinned || pinned.decision !== 'included_pinned') {
        fail(`pinned chunk should survive tiny budget: ${JSON.stringify(pinned)}`);
    } else if (!evicted || evicted.decision !== 'evicted_by_budget') {
        fail(`lower priority chunk should evict first: ${JSON.stringify(evicted)}`);
    } else {
        ok('pinned chunk survives tiny budget and lower priority evicts first');
    }
}

{
    const chunks = [
        chunk('gameRules', 'SYSTEM', 100),
        chunk('worldForge', 'w'.repeat(300), 65),
        chunk('lorebook', 'l'.repeat(300), 40),
    ];
    const report = buildContextInspectorReport(chunks, 220, {
        orderedIds: ['gameRules', 'worldForge', 'lorebook'],
    });
    const lore = report.items.find((i) => i.id === 'lorebook');
    const world = report.items.find((i) => i.id === 'worldForge');
    if (!lore || lore.decision !== 'evicted_by_budget') {
        fail(`lorebook should evict before worldForge: ${JSON.stringify(lore)}`);
    } else if (!world || world.finalChars === 0) {
        fail(`worldForge should survive after lorebook eviction: ${JSON.stringify(world)}`);
    } else if (world.priority <= lore.priority) {
        fail('worldForge priority should exceed lorebook priority in fixture');
    } else {
        ok('lower priority chunk evicted before higher priority chunk');
    }
}

{
    const chunks = [chunk('settlement', 's'.repeat(500), 58)];
    const report = buildContextInspectorReport(chunks, 120, {
        orderedIds: ['settlement'],
    });
    const item = report.items[0];
    if (!item || item.decision !== 'truncated_by_budget' || item.finalChars >= item.originalChars) {
        fail(`partial keep should truncate: ${JSON.stringify(item)}`);
    } else {
        ok('partially kept chunk is truncated_by_budget');
    }
}

{
    const chunks = [
        chunk('gameRules', 'RULES', 100),
        chunk('settlement', 'settlement '.repeat(40), 58),
        chunk('lorebook', 'lore '.repeat(40), 40),
    ];
    const target = 180;
    const evicted = evictPromptChunksByBudget(chunks, target);
    const records = applyPromptChunkBudgetRecords(chunks, target);
    const report = buildContextInspectorReport(chunks, target, {
        orderedIds: chunks.map((c) => c.id),
    });
    const recordTexts = records
        .filter((record) => record.finalText.length > 0)
        .map((record) => record.finalText);
    const reportTexts = report.items
        .filter((item) => item.finalChars > 0)
        .map((item) => records.find((record) => record.id === item.id)?.finalText ?? '');
    if (evicted.join('|||') !== recordTexts.join('|||')) {
        fail(`records must match eviction output: ${JSON.stringify({ evicted, recordTexts })}`);
    } else if (reportTexts.join('|||') !== recordTexts.join('|||')) {
        fail(`report finals must match eviction output: ${JSON.stringify({ reportTexts, recordTexts })}`);
    } else {
        ok('report final texts match evictPromptChunksByBudget output');
    }
}

{
    const chunks = [
        chunk('gameRules', 'A', 100),
        chunk('settlement', 'B', 58),
        chunk('lorebook', 'C', 40),
    ];
    const report = buildContextInspectorReport(chunks, 1000, {
        orderedIds: ['gameRules', 'settlement', 'lorebook'],
    });
    const ids = report.items.map((i) => i.id);
    if (ids.join(',') !== 'gameRules,settlement,lorebook') {
        fail(`deterministic order expected, got ${ids.join(',')}`);
    } else {
        ok('report items remain original chunk order');
    }
}

{
    const report = buildContextInspectorReport(
        [chunk('unknown_chunk_xyz', 'payload', undefined)],
        1000,
        { orderedIds: ['unknown_chunk_xyz'] }
    );
    const item = report.items[0];
    if (!item || item.category !== 'other') {
        fail(`unknown chunk should map to other: ${JSON.stringify(item)}`);
    } else if (item.priority !== resolvePromptChunkPriority('unknown_chunk_xyz')) {
        fail('unknown chunk priority fallback should remain stable');
    } else {
        ok('unknown chunk id maps to other with stable priority fallback');
    }
}

{
    const long = 'x'.repeat(MAX_CONTEXT_INSPECTOR_PREVIEW_CHARS + 80);
    const report = buildContextInspectorReport(
        [chunk('settlement', long, 58)],
        10_000,
        { orderedIds: ['settlement'] }
    );
    const item = report.items[0];
    if (!item || item.preview.length > MAX_CONTEXT_INSPECTOR_PREVIEW_CHARS + 4) {
        fail(`preview should be bounded: ${item?.preview?.length}`);
    } else {
        ok('long previews are truncated');
    }
}

{
    const report = buildContextInspectorReport([], 1000, {
        orderedIds: ['vehicles'],
        inactiveIds: ['vehicles'],
    });
    const item = report.items[0];
    if (!item || item.decision !== 'skipped_inactive' || item.preview) {
        fail(`inactive chunk must not fabricate preview: ${JSON.stringify(item)}`);
    } else {
        ok('omitted inactive candidates are not fabricated');
    }
}

if (failed > 0) {
    console.error(`\n${failed} test(s) failed.`);
    process.exit(1);
}
console.log('\nAll context_inspector_core tests passed.');