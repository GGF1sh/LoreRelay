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
    const assert = require('assert/strict');
    for (const wrapped of [false, true]) {
        const commands = {
            tradeOps: [{ op: 'buy', marketLocationId: 'north_farm', commodityId: 'wheat', qty: 10 }],
            elapsedWorldTurns: 0,
            resolvedQuests: ['quest_supply', 'quest_supply', '../invalid'],
            reputationOps: [{ factionId: 'port_buyers', delta: 3 }],
        };
        const json = { entries: [{ content: 'Confirmed transaction.' }],
            ...(wrapped ? { turn_result: { ...commands, promptReceipt: { receiptId: 'untrusted' }, turnId: 'forged' } } : commands) };
        const candidate = buildVscodeLmTurnResult({ prev: {}, llmJson: json, narrative: '', turnId: 'turn-5', locale: 'ja',
            promptReceipt: { receiptId: 'host-receipt', provider: 'codex-app-server', assemblyDigest: 'host-digest' } });
        assert.deepEqual(candidate.tradeOps, commands.tradeOps);
        assert.equal(candidate.elapsedWorldTurns, 0);
        assert.deepEqual(candidate.resolvedQuests, ['quest_supply']);
        assert.equal(candidate.reputationOps[0].delta, 3);
        assert.equal(candidate.turnId, 'turn-5');
        assert.equal(candidate.promptReceipt.receiptId, 'host-receipt');
        const projection = mergeVscodeLmGameState({}, json, '', 'turn-5', 'ja');
        for (const key of ['tradeOps', 'elapsedWorldTurns', 'resolvedQuests', 'reputationOps', 'turn_result']) {
            assert.equal(key in projection, false, `${key} is a command, not game state`);
        }
        ok(`real GM command envelope preserved (${wrapped ? 'nested' : 'top-level'}) without authority injection`);
    }
    const invalidCommands = buildVscodeLmTurnResult({ prev: {}, llmJson: {
        turn_result: { elapsedWorldTurns: -4, tradeOps: [{op:'buy',qty:-1}], resolvedQuests:[null,'../path'], reputationOps:[{factionId:'port',delta:'3'}] }
    }, narrative: 'Talk.', turnId:'turn-6', locale:'ja' });
    assert.equal(invalidCommands.elapsedWorldTurns, 0);
    assert.equal(invalidCommands.tradeOps, undefined);
    assert.equal(invalidCommands.resolvedQuests, undefined);
    assert.equal(invalidCommands.reputationOps, undefined);
    const restCommand = buildVscodeLmTurnResult({prev:{},llmJson:{turn_result:{elapsedWorldTurns:1}},narrative:'Rest overnight.',turnId:'turn-7',locale:'ja'});
    assert.equal(restCommand.elapsedWorldTurns,1);
    ok('invalid commands filtered and explicit overnight time preserved');
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
            encounterOps: [{ op: 'start_combat', encounterId: 'cave_ambush' }],
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
        promptReceipt: {
            receiptId: 'receipt-vscode-test',
            provider: 'vscode-lm',
            assemblyDigest: 'digest-vscode-test',
        },
    });

    if (!turnResult.statePatch || turnResult.statePatch.length === 0) {
        fail('statePatch generated');
    } else {
        ok('statePatch generated');
    }

    if (turnResult.promptReceipt?.receiptId !== 'receipt-vscode-test' || turnResult.promptReceipt?.provider !== 'vscode-lm') {
        fail('buildVscodeLmTurnResult preserves trusted prompt receipt metadata');
    } else {
        ok('buildVscodeLmTurnResult preserves trusted prompt receipt metadata');
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
    const hasEncounterOpsPatch = turnResult.statePatch.some((p) => p.path === '/encounterOps');
    if (turnResult.encounterOps?.[0]?.encounterId !== 'cave_ambush' || hasEncounterOpsPatch) {
        fail('vscode-lm preserves validated encounterOps outside game_state projection');
    } else {
        ok('vscode-lm preserves validated encounterOps outside game_state projection');
    }

    const rejectedOutcome = buildVscodeLmTurnResult({
        prev,
        llmJson: {
            encounterOps: [{ op: 'start_combat', encounterId: 'bad', winner: 'player' }],
        },
        narrative: 'A fight threatens to begin.',
        turnId: 'turn-3',
        locale: 'en',
    });
    if (rejectedOutcome.encounterOps !== undefined) {
        fail('vscode-lm rejects outcome-authoritative encounterOps');
    } else {
        ok('vscode-lm rejects outcome-authoritative encounterOps');
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
