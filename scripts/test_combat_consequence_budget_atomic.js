#!/usr/bin/env node
'use strict';

/**
 * V1-C P2: combatConsequence must be all-or-nothing under prompt budget.
 * Truncation must drop the chunk (and never keep ackToken).
 */
const fs = require('fs');
const path = require('path');
const Module = require('module');

const root = path.join(__dirname, '..');
const gmPromptBuilderPath = path.join(root, 'out', 'gmPromptBuilder.js');

let failed = 0;
function fail(msg) { console.error(`FAIL: ${msg}`); failed++; }
function ok(msg) { console.log(`OK: ${msg}`); }

if (!fs.existsSync(gmPromptBuilderPath)) {
    fail(`${gmPromptBuilderPath} missing — compile first`);
    process.exit(1);
}

const mockVscode = {
    workspace: {
        isTrusted: true,
        workspaceFolders: [],
        getConfiguration: () => ({ get: (_k, d) => d, update: async () => undefined }),
        onDidChangeConfiguration: () => ({ dispose: () => {} }),
    },
    window: {
        createOutputChannel: () => ({ append: () => {}, appendLine: () => {}, clear: () => {}, show: () => {}, dispose: () => {} }),
        showWarningMessage: () => {},
        showErrorMessage: () => {},
        showInformationMessage: async () => undefined,
        setStatusBarMessage: () => {},
    },
    env: { language: 'en' },
    Uri: { file: (p) => ({ fsPath: p }) },
};

const originalLoad = Module._load;
Module._load = function patched(request, parent, isMain) {
    if (request === 'vscode') return mockVscode;
    return originalLoad.apply(this, arguments);
};

let buildSelectedPromptSpecsForTests;
try {
    ({ buildSelectedPromptSpecsForTests } = require(gmPromptBuilderPath));
} catch (e) {
    Module._load = originalLoad;
    fail(`load: ${e && e.stack || e}`);
    process.exit(1);
}

const fullBlock = [
    '[Authoritative Combat Consequence]',
    'Encounter: enc',
    'Outcome: ALLY_WIN',
    'Final tick: 4',
    'Player HP after: 7/20',
    'Receipt: abc',
    'Simulation result: sim',
    '',
    'These mechanics are fixed. Narrate their immediate consequences naturally.',
    'Do not change the winner, HP result, hashes, or apply combat state again.',
].join('\n');

const token = {
    tokenId: 'combatConsequence:abc',
    chunkId: 'combatConsequence',
    combatSessionId: 'sess',
    receiptHash: 'abc',
    sourceDigest: 'digest',
};

// Enough room for full block
{
    const selected = buildSelectedPromptSpecsForTests([
        { id: 'gameRules', text: 'rules', priority: 100 },
        { id: 'combatConsequence', text: fullBlock, priority: 88, ackToken: token },
    ], 10_000);
    const combat = selected.find((s) => s.id === 'combatConsequence');
    if (!combat) fail('full budget should keep combatConsequence');
    else if (!combat.ackToken) fail('full block must retain ackToken');
    else if (combat.text !== fullBlock) fail('full block text must be unchanged');
    else ok('full budget keeps combatConsequence + ackToken');
}

// Force truncation / eviction of combatConsequence by tiny budget with higher-priority noise
{
    const filler = 'X'.repeat(500);
    const selected = buildSelectedPromptSpecsForTests([
        { id: 'summary', text: filler, priority: 85 },
        { id: 'combatConsequence', text: fullBlock, priority: 88, ackToken: token },
    ], 200);
    const combat = selected.find((s) => s.id === 'combatConsequence');
    if (combat && combat.text !== fullBlock) {
        fail('truncated combatConsequence must not be selected at all');
    } else if (combat && combat.ackToken) {
        fail('truncated path must never retain ackToken');
    } else if (combat && combat.text === fullBlock) {
        // rare if budget still fit — acceptable if token kept
        ok('tight budget still fit full combatConsequence (kept intact)');
    } else {
        ok('tight budget drops combatConsequence entirely (all-or-nothing)');
    }
}

// Explicit partial text simulation: budget returns shorter finalText than original
// We simulate by calling with tiny budget where combat is truncated mid-evict.
// If combat survives truncated, builder must drop it.
{
    const selected = buildSelectedPromptSpecsForTests([
        { id: 'lorebook', text: 'L'.repeat(300), priority: 40 },
        { id: 'combatConsequence', text: fullBlock, priority: 88, ackToken: token },
    ], fullBlock.length - 20);
    const combat = selected.find((s) => s.id === 'combatConsequence');
    if (combat && combat.text.length < fullBlock.length) {
        fail('partial combatConsequence was selected');
    } else if (combat && combat.ackToken && combat.text !== fullBlock) {
        fail('partial combatConsequence kept ackToken');
    } else {
        ok('no partial combatConsequence delivery under squeeze budget');
    }
}

Module._load = originalLoad;
if (failed > 0) {
    console.error(`\n${failed} failure(s)`);
    process.exit(1);
}
console.log('\nAll combatConsequence budget atomicity tests passed.');
