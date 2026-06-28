#!/usr/bin/env node
/**
 * Unit tests for gmPromptBuilderCore.ts (requires npm run compile).
 */
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

const {
    buildHintTextFromContents,
    buildWorldChangeSummaryFromChanges,
    MAX_HINT_TEXT_CHARS,
    MAX_WORLD_CHANGE_SUMMARY_LINES
} = require(corePath);

{
    const hint = buildHintTextFromContents(['line one', 'line two'], 'player acts');
    if (hint !== 'line one\nline two\nplayer acts') {
        fail(`hint join failed: ${hint}`);
    } else {
        ok('hint joins recent + action');
    }
}

{
    const longRecent = 'a'.repeat(MAX_HINT_TEXT_CHARS);
    const hint = buildHintTextFromContents([longRecent], 'action');
    if (hint.length > MAX_HINT_TEXT_CHARS) {
        fail('hint should respect max chars');
    } else if (!hint.endsWith('action')) {
        fail('hint should preserve player action suffix');
    } else {
        ok('hint truncates history but keeps action');
    }
}

{
    const summary = buildWorldChangeSummaryFromChanges([], 5);
    if (summary !== '') {
        fail('empty changes should return empty summary');
    } else {
        ok('empty changes => empty summary');
    }
}

{
    const events = [
        {
            id: 'wce_3_food',
            worldTurn: 3,
            source: 'simulation',
            category: 'resource',
            severity: 'warning',
            message: 'Food reserves are low'
        },
        {
            id: 'wce_3_info',
            worldTurn: 3,
            source: 'simulation',
            category: 'resource',
            severity: 'info',
            message: 'ignored info'
        },
        {
            id: 'wce_2_old',
            worldTurn: 2,
            source: 'simulation',
            category: 'region',
            severity: 'critical',
            message: 'old event'
        }
    ];
    const summary = buildWorldChangeSummaryFromChanges(events, 3);
    if (!summary.includes('World Turn 3')) {
        fail('summary should target latest turn only');
    } else if (!summary.includes('Food reserves are low')) {
        fail('summary should include warning event');
    } else if (summary.includes('old event')) {
        fail('summary should exclude prior turn events');
    } else if (summary.includes('ignored info')) {
        fail('summary should exclude info severity');
    } else {
        ok('world change summary filters latest non-info step');
    }
}

{
    const events = Array.from({ length: MAX_WORLD_CHANGE_SUMMARY_LINES + 3 }, (_, i) => ({
        id: `wce_4_${i}`,
        worldTurn: 4,
        source: 'simulation',
        category: 'region',
        severity: 'warning',
        message: `event ${i}`
    }));
    const summary = buildWorldChangeSummaryFromChanges(events, 4);
    const bulletLines = summary.split('\n').filter((line) => line.startsWith('🟡'));
    if (bulletLines.length !== MAX_WORLD_CHANGE_SUMMARY_LINES) {
        fail(`summary should cap bullet lines to ${MAX_WORLD_CHANGE_SUMMARY_LINES}`);
    } else {
        ok('world change summary line cap');
    }
}

if (failed > 0) {
    process.exit(1);
}
console.log('\ngmPromptBuilderCore tests passed.');