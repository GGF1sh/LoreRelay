#!/usr/bin/env node
/**
 * Unit tests for diceRoller.ts (requires npm run compile).
 */
'use strict';

const path = require('path');
const root = path.join(__dirname, '..');
const dicePath = path.join(root, 'out', 'diceRoller.js');

let failed = 0;
function fail(msg) { console.error(`FAIL: ${msg}`); failed++; }
function ok(msg) { console.log(`OK: ${msg}`); }

if (!require('fs').existsSync(dicePath)) {
    fail('out/diceRoller.js missing — run npm run compile first');
    process.exit(1);
}

const {
    processDiceMacros,
    MAX_DICE_MACROS_PER_TEXT,
    MAX_DICE_REASON_LEN,
    MAX_DICE_DC
} = require(dicePath);

{
    const { text, ledger } = processDiceMacros('Attack {{roll 1d20+3 dc=15 reason="strike"}}');
    if (!text.includes('[System Roll:')) {
        fail('basic dice macro should expand');
    } else {
        ok('basic dice macro expands');
    }
    if (ledger.length !== 1 || ledger[0].formula !== '1d20+3') {
        fail('ledger should capture formula');
    } else {
        ok('ledger captures formula');
    }
    if (ledger[0].dc !== 15 || ledger[0].success !== ledger[0].total >= 15) {
        fail('dc and success should be recorded');
    } else {
        ok('dc and success recorded');
    }
}

{
    const longReason = 'x'.repeat(300);
    const { ledger } = processDiceMacros(`{{roll 1d6 reason="${longReason}"}}`);
    if (!ledger[0].reason || ledger[0].reason.length !== MAX_DICE_REASON_LEN) {
        fail(`reason should clamp to ${MAX_DICE_REASON_LEN}`);
    } else {
        ok('reason length clamped');
    }
}

{
    const { ledger } = processDiceMacros('{{roll 1d20 dc=999999}}');
    if (ledger[0].dc !== MAX_DICE_DC) {
        fail(`dc should clamp to ${MAX_DICE_DC}`);
    } else {
        ok('dc clamped to max');
    }
}

{
    const macros = Array.from({ length: MAX_DICE_MACROS_PER_TEXT + 5 }, () => '{{roll 1d6}}').join(' ');
    const { ledger } = processDiceMacros(macros);
    if (ledger.length !== MAX_DICE_MACROS_PER_TEXT) {
        fail(`should process at most ${MAX_DICE_MACROS_PER_TEXT} macros`);
    } else {
        ok('macro count capped');
    }
}

{
    const { text, ledger } = processDiceMacros('{{roll not-valid!!!}} stays');
    if (ledger.length !== 0) {
        fail('invalid macro should not add ledger entry');
    } else {
        ok('invalid macro leaves text unchanged');
    }
    if (!text.includes('{{roll not-valid!!!}}')) {
        fail('invalid macro text should remain');
    } else {
        ok('invalid macro preserved in output');
    }
}

if (failed > 0) {
    process.exit(1);
}
console.log('\ndiceRoller tests passed.');