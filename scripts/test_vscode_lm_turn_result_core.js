#!/usr/bin/env node
'use strict';

const path = require('path');
const fs = require('fs');

const root = path.join(__dirname, '..');
const corePath = path.join(root, 'out', 'vscodeLmTurnResultCore.js');
if (!fs.existsSync(corePath)) {
    console.error('FAIL: out/vscodeLmTurnResultCore.js missing — run npm run compile');
    process.exit(1);
}

const { installVscodeStub } = require('./test_helpers/vscode_stub');
const restore = installVscodeStub();

let failed = 0;
function fail(msg) { console.error(`FAIL: ${msg}`); failed++; }
function ok(msg) { console.log(`OK: ${msg}`); }

const {
    buildVscodeLmTurnResult,
    extractVscodeLmJsonBlock,
    mergeVscodeLmGameState,
    nextVscodeLmTurnIdFromEntries,
    substituteDiceMarkersWithLedger,
    substituteDiceMarkersSimple,
} = require(corePath);
const { applyStatePatch, mergeGmEntryFromTurn } = require(path.join(root, 'out', 'statePatch.js'));

try {
    const prev = {
        status: { location: 'town', hp: { current: 20, max: 20 } },
        options: ['look'],
        theme: 'fantasy',
        entries: [{ id: 'turn-1', role: 'gm', sender: 'Game Master', content: 'Hello.' }],
    };

    const raw = [
        'You enter the cave.',
        '```json',
        JSON.stringify({
            status: { location: 'cave entrance' },
            options: ['go deeper', 'turn back'],
            mood: 'tense',
            entries: [{ content: 'You enter the cave.', imagePrompt: 'dark cave mouth' }],
        }),
        '```',
    ].join('\n');

    const llmJson = extractVscodeLmJsonBlock(raw);
    if (!llmJson || !llmJson.mood) {
        fail('extractVscodeLmJsonBlock');
    } else {
        ok('extractVscodeLmJsonBlock');
    }

    const turnResult = buildVscodeLmTurnResult({
        prev,
        llmJson,
        narrative: 'You enter the cave.',
        turnId: 'turn-2',
        locale: 'en',
        playerAction: 'enter cave',
    });

    if (!turnResult.statePatch || turnResult.statePatch.length === 0) {
        fail('statePatch generated');
    } else {
        ok('statePatch generated');
    }

    const hasMood = turnResult.statePatch.some((p) => p.path === '/mood');
    const hasEntriesPatch = turnResult.statePatch.some((p) => p.path === '/entries');
    if (!hasMood) {
        fail('statePatch includes mood');
    } else {
        ok('statePatch includes mood');
    }
    if (hasEntriesPatch) {
        fail('statePatch must not include /entries');
    } else {
        ok('statePatch excludes /entries');
    }

    let state = JSON.parse(JSON.stringify(prev));
    state = applyStatePatch(state, turnResult.statePatch);
    state = mergeGmEntryFromTurn(state, turnResult);

    if (state.mood !== 'tense') {
        fail('pipeline applies mood');
    } else {
        ok('pipeline applies mood');
    }
    const gm = state.entries.find((e) => e.id === 'turn-2');
    if (!gm || gm.content !== 'You enter the cave.') {
        fail('pipeline merges gm entry');
    } else {
        ok('pipeline merges gm entry');
    }

    const diceText = substituteDiceMarkersSimple('Roll {{DICE:1d6}} now');
    if (!/\d/.test(diceText) || diceText.includes('{{DICE')) {
        fail('substituteDiceMarkersSimple');
    } else {
        ok('substituteDiceMarkersSimple');
    }

    const diceReceipt = substituteDiceMarkersWithLedger('GM rolls {{DICE:2d6}}.');
    if (diceReceipt.diceLedger.length !== 1 || diceReceipt.diceLedger[0].formula !== '2d6' || diceReceipt.diceLedger[0].rolls.length !== 2) {
        fail(`substituteDiceMarkersWithLedger records GM dice: ${JSON.stringify(diceReceipt)}`);
    } else {
        ok('substituteDiceMarkersWithLedger records GM dice');
    }

    const nextTurn = nextVscodeLmTurnIdFromEntries([
        { id: 'turn-1' },
        { id: 'user-1780000000000' },
        { id: 'turn-7' },
        { id: 'user-1780000000001' },
    ]);
    if (nextTurn !== 'turn-8') {
        fail(`nextVscodeLmTurnIdFromEntries scans max GM turn: ${nextTurn}`);
    } else {
        ok('nextVscodeLmTurnIdFromEntries scans max GM turn');
    }

    const merged = mergeVscodeLmGameState(prev, null, 'fallback narrative', 'turn-2', 'ja');
    if (!Array.isArray(merged.options) || merged.options.length === 0) {
        fail('default options when llmJson missing');
    } else {
        ok('default options when llmJson missing');
    }
} finally {
    restore();
}

if (failed > 0) {
    process.exit(1);
}
console.log('All vscode-lm turn result core tests passed.');
