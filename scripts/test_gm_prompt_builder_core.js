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
    resolveWorldChangeSummaryTurn,
    clampTextForPrompt,
    normalizePromptBudgetMode,
    resolvePromptBudgetPolicy,
    buildFogUnexploredPromptLine,
    MAX_HINT_TEXT_CHARS,
    MAX_WORLD_CHANGE_SUMMARY_LINES,
    MAX_FOG_PROMPT_CHARS,
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

{
    const events = [{
        id: 'wce_5_food',
        worldTurn: 5,
        source: 'simulation',
        category: 'resource',
        severity: 'warning',
        message: 'Food low'
    }];
    const first = buildWorldChangeSummaryFromChanges(events, 8);
    const repeat = buildWorldChangeSummaryFromChanges(events, 8, 5);
    if (!first.includes('Food low')) {
        fail('first summary should include event');
    } else if (repeat !== '') {
        fail('already-injected turn should return empty summary');
    } else if (resolveWorldChangeSummaryTurn(events, 8, 5) !== undefined) {
        fail('resolveWorldChangeSummaryTurn should respect lastInjected');
    } else {
        ok('world change summary inject-once guard');
    }
}

{
    const clipped = clampTextForPrompt('abcdef', 5);
    if (clipped !== 'ab...') {
        fail(`clampTextForPrompt should append ASCII ellipsis marker: ${clipped}`);
    } else if (clampTextForPrompt('abc', 5) !== 'abc') {
        fail('clampTextForPrompt should not modify short text');
    } else {
        ok('prompt text clamp');
    }
}

{
    if (normalizePromptBudgetMode('nonsense') !== 'auto') {
        fail('invalid prompt budget mode should normalize to auto');
    } else if (resolvePromptBudgetPolicy('auto', 'small').mode !== 'compact') {
        fail('auto prompt budget should use compact for small context');
    } else if (resolvePromptBudgetPolicy('auto', 'large').mode !== 'balanced') {
        fail('auto prompt budget should use balanced for large context');
    } else if (resolvePromptBudgetPolicy('expanded', 'small', 2222).targetTokens !== 2222) {
        fail('prompt budget target override should be respected');
    } else {
        ok('prompt budget policy resolution');
    }
}

{
    if (buildFogUnexploredPromptLine([]) !== '') { fail('empty fog line'); }
    else { ok('empty fog line'); }

    const line = buildFogUnexploredPromptLine(['Ashen Wastes', 'Sunless Deep']);
    if (!line.includes('Unexplored') || !line.includes('Ashen Wastes')) { fail('fog line content'); }
    else if (line.length > MAX_FOG_PROMPT_CHARS) { fail('fog line char cap'); }
    else { ok('buildFogUnexploredPromptLine'); }

    const many = buildFogUnexploredPromptLine(['A', 'B', 'C', 'D', 'E', 'F', 'G']);
    if (!many.includes('…and 2 more')) { fail('fog overflow suffix'); }
    else { ok('fog overflow suffix'); }
}

if (failed > 0) {
    process.exit(1);
}
console.log('\ngmPromptBuilderCore tests passed.');
