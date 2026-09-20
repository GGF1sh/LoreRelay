#!/usr/bin/env node
'use strict';

/**
 * Bridge V1-C: combatConsequence chunk candidate + Accepted ACK inject-once.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');

const root = path.join(__dirname, '..');
const gmPromptBuilderPath = path.join(root, 'out', 'gmPromptBuilder.js');
const promptReceiptCorePath = path.join(root, 'out', 'promptReceiptCore.js');
const applyCorePath = path.join(root, 'out', 'campaignCombatApplyCore.js');
const receiptCorePath = path.join(root, 'out', 'campaignCombatReceiptCore.js');
const pendingPath = path.join(root, 'out', 'campaignCombatPendingStore.js');

let failed = 0;
function fail(msg) { console.error(`FAIL: ${msg}`); failed++; }
function ok(msg) { console.log(`OK: ${msg}`); }

for (const required of [gmPromptBuilderPath, promptReceiptCorePath, applyCorePath, receiptCorePath, pendingPath]) {
    if (!fs.existsSync(required)) {
        fail(`${required} missing - run npm run compile first`);
    }
}
if (failed > 0) process.exit(1);

const WS_PATH = fs.mkdtempSync(path.join(os.tmpdir(), 'lr-v1c-prompt-'));
fs.writeFileSync(path.join(WS_PATH, 'game_rules.json'), JSON.stringify({
    enableEmergentSimulation: true,
    enableWorldObservatory: false,
}, null, 2));

const mockConfigStore = {
    'textAdventure.chronicle': { recapInPrompt: false },
    'textAdventure': {
        'memory.backend': 'tfidf',
        'promptBudget.mode': 'manual',
        'promptBudget.maxTokens': 8192,
        'gmBridge.openRouter.model': '',
        'gmBridge.vscodeLm.vendor': '',
        'gmBridge.vscodeLm.family': '',
        'gmBridge.vscodeLm.model': '',
    },
};

const mockVscode = {
    workspace: {
        isTrusted: true,
        workspaceFolders: [{ uri: { fsPath: WS_PATH }, name: 'test' }],
        getConfiguration: (section) => ({
            get: (key, def) => {
                const bucket = mockConfigStore[section];
                if (bucket && Object.prototype.hasOwnProperty.call(bucket, key)) {
                    return bucket[key];
                }
                return def;
            },
            update: async () => undefined,
        }),
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
    Uri: { file: (p) => ({ fsPath: p, toString: () => `file://${p}` }) },
};

const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
    if (request === 'vscode') return mockVscode;
    return originalLoad.apply(this, arguments);
};

let gmPromptBuilder;
let promptReceiptCore;
let applyCore;
let receiptCore;
let pendingStore;
try {
    gmPromptBuilder = require(gmPromptBuilderPath);
    promptReceiptCore = require(promptReceiptCorePath);
    applyCore = require(applyCorePath);
    receiptCore = require(receiptCorePath);
    pendingStore = require(pendingPath);
} catch (e) {
    Module._load = originalLoad;
    fail(`load: ${e && e.stack || e}`);
    process.exit(1);
}

const {
    buildProductionPromptAssembly,
    buildGmPromptBreakdown,
    acknowledgePromptReceiptAfterAccepted,
    resetPromptReceiptStateForTests,
} = gmPromptBuilder;
const { buildTurnResultPromptReceiptMeta, attachTurnResultPromptReceipt } = promptReceiptCore;
const { buildCombatConsequencePlan, COMBAT_BATTLE_HISTORY_KEY } = applyCore;
const { sha256Stable } = receiptCore;

function makeReceipt() {
    const body = {
        schemaVersion: 'combat-outcome-receipt-v1',
        applyEligible: true,
        combatSessionId: 'sess-v1c',
        encounterId: 'enc-v1c',
        requestId: 'req-v1c',
        campaignInstanceId: 'camp',
        timelineEpochId: 'epoch',
        sourceCampaignRevision: 0,
        requestedMode: 'command',
        effectiveMode: 'command',
        terminalOutcomeCode: 'ALLY_WIN',
        finalTick: 12,
        participants: [{
            entityId: 'ally_1', unitId: 'ally_1', team: 0,
            finalHp: 8, maxHp: 20, alive: true, dead: false,
        }],
        objective: { type: 'annihilate', result: 'success' },
        simulationResultHash: 'sim-v1c',
    };
    return { ...body, receiptHash: sha256Stable(body) };
}

function seedAppliedFact() {
    const receipt = makeReceipt();
    const plan = buildCombatConsequencePlan(
        { status: { hp: { current: 15, max: 20 }, condition: [] }, entries: [] },
        receipt,
    );
    fs.writeFileSync(path.join(WS_PATH, 'game_state.json'), JSON.stringify(plan.nextState, null, 2));
    pendingStore.writeAppliedCombatOutcomeMarker(WS_PATH, {
        schemaVersion: 'combat-outcome-applied-v1',
        combatSessionId: receipt.combatSessionId,
        receiptHash: receipt.receiptHash,
        simulationResultHash: receipt.simulationResultHash,
        campaignInstanceId: receipt.campaignInstanceId,
        timelineEpochId: receipt.timelineEpochId,
        historyAppended: true,
        playerHpUpdated: true,
    });
    return receipt;
}

function acceptedTurnForReceipt(receipt) {
    return attachTurnResultPromptReceipt(
        { turnId: 't1', narration: 'ok' },
        buildTurnResultPromptReceiptMeta(receipt),
    );
}

resetPromptReceiptStateForTests();
const receipt = seedAppliedFact();

// Inspector / breakdown must not create inject markers
const beforeInjectDir = path.join(WS_PATH, '.text-adventure', 'combat', 'injected');
const breakdown = buildGmPromptBreakdown('look around after battle');
const combatSection = (breakdown.sections || []).find((s) => s.id === 'combatConsequence')
    || (breakdown.contextInspector && breakdown.contextInspector.chunks
        ? null
        : null);
// breakdown structure may nest differently — check inject dir empty after inspector
if (fs.existsSync(beforeInjectDir) && fs.readdirSync(beforeInjectDir).length > 0) {
    fail('Inspector must not write inject markers');
} else {
    ok('Inspector/preview does not write inject markers');
}

const assembly = buildProductionPromptAssembly('narrate the battle outcome', 'command');
const combatSpec = assembly.selectedSpecs.find((s) => s.id === 'combatConsequence');
if (!combatSpec || !String(combatSpec.text).includes('Authoritative Combat Consequence')) {
    fail('production assembly missing combatConsequence chunk');
} else {
    ok('production assembly includes combatConsequence fact block');
}
const combatToken = assembly.receipt.selectedTokens.find((t) => t.chunkId === 'combatConsequence');
if (!combatToken || combatToken.receiptHash !== receipt.receiptHash) {
    fail('production receipt missing combatConsequence ACK token');
} else {
    ok('production receipt binds combatConsequence token by receiptHash');
}

// No ACK yet → inject marker absent
if (pendingStore.readCombatConsequenceInjectedMarker(WS_PATH, receipt.receiptHash)) {
    fail('token selection must not inject before Accepted ACK');
} else {
    ok('candidate selection does not consume inject ACK');
}

const firstAck = acknowledgePromptReceiptAfterAccepted(
    assembly.receipt,
    acceptedTurnForReceipt(assembly.receipt),
);
if (!firstAck.correlated || !firstAck.succeededTokenIds.includes(combatToken.tokenId)) {
    fail(`first ACK should apply combat token: ${JSON.stringify(firstAck)}`);
} else {
    ok('Accepted-correlated ACK applies combatConsequence inject marker');
}
const marker = pendingStore.readCombatConsequenceInjectedMarker(WS_PATH, receipt.receiptHash);
if (!marker || marker.sourceDigest !== combatToken.sourceDigest) {
    fail('inject marker missing or digest mismatch');
} else {
    ok('inject marker persisted under receiptHash');
}

const secondAck = acknowledgePromptReceiptAfterAccepted(
    assembly.receipt,
    acceptedTurnForReceipt(assembly.receipt),
);
if (!secondAck.alreadySatisfiedTokenIds.includes(combatToken.tokenId)) {
    fail(`second ACK should be alreadySatisfied: ${JSON.stringify(secondAck)}`);
} else {
    ok('exact-duplicate ACK is alreadySatisfied no-op');
}

// After inject, next production assembly should not re-offer same fact
const assembly2 = buildProductionPromptAssembly('continue', 'command');
const combatSpec2 = assembly2.selectedSpecs.find((s) => s.id === 'combatConsequence');
if (combatSpec2) {
    fail('injected fact should not reappear in next assembly');
} else {
    ok('after ACK, combatConsequence chunk is not re-selected');
}

// Uncorrelated ACK does nothing for a fresh fact setup would be heavy — missing correlation already covered in PROMPT-001C suite.

// Game state history length unchanged by ACK
const state = JSON.parse(fs.readFileSync(path.join(WS_PATH, 'game_state.json'), 'utf8'));
const hist = state[COMBAT_BATTLE_HISTORY_KEY] || [];
if (hist.length !== 1) {
    fail('ACK must not re-apply combat history');
} else if (state.status?.hp?.current !== 8) {
    fail('ACK must not mutate HP');
} else {
    ok('ACK does not re-apply HP or history');
}

Module._load = originalLoad;
if (failed > 0) {
    console.error(`\n${failed} failure(s)`);
    process.exit(1);
}
console.log('\nAll V1-C combat consequence prompt tests passed.');
