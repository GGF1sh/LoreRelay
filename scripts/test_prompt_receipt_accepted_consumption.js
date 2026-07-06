#!/usr/bin/env node
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');

const root = path.join(__dirname, '..');
const gmPromptBuilderPath = path.join(root, 'out', 'gmPromptBuilder.js');
const worldStatePath = path.join(root, 'out', 'worldState.js');
const turnResultFallbackPath = path.join(root, 'out', 'turnResultFallback.js');
const promptReceiptCorePath = path.join(root, 'out', 'promptReceiptCore.js');
const gmPromptBuilderSourcePath = path.join(root, 'src', 'gmPromptBuilder.ts');

let failed = 0;
function fail(msg) { console.error(`FAIL: ${msg}`); failed++; }
function ok(msg) { console.log(`OK: ${msg}`); }

for (const required of [gmPromptBuilderPath, worldStatePath, turnResultFallbackPath, promptReceiptCorePath]) {
    if (!fs.existsSync(required)) {
        fail(`${required} missing - run npm run compile first`);
    }
}
if (failed > 0) {
    process.exit(1);
}

const source = fs.readFileSync(gmPromptBuilderSourcePath, 'utf-8');
function extractFunctionBody(fnName) {
    const re = new RegExp(`function ${fnName}\\([\\s\\S]*?\\n\\}`, 'm');
    const m = source.match(re);
    return m ? m[0] : '';
}

{
    const contextBody = extractFunctionBody('buildGmPromptContext');
    if (!contextBody) {
        fail('buildGmPromptContext not found');
    } else if (!contextBody.includes('buildProductionPromptAssembly(')) {
        fail('buildGmPromptContext must route through buildProductionPromptAssembly');
    } else if (contextBody.includes('buildLegacyProductionSpecs(')) {
        fail('buildGmPromptContext must not route through buildLegacyProductionSpecs');
    } else {
        ok('buildGmPromptContext routes through buildProductionPromptAssembly only');
    }
}

{
    const assemblyBody = extractFunctionBody('buildProductionPromptAssembly');
    if (!assemblyBody) {
        fail('buildProductionPromptAssembly not found');
    } else if (!assemblyBody.includes('buildPureCandidateSpecsWithMeta(')) {
        fail('buildProductionPromptAssembly must use pure candidate specs');
    } else if (!assemblyBody.includes('buildSelectedPromptSpecs(')) {
        fail('buildProductionPromptAssembly must select by budget before receipt creation');
    } else if (!assemblyBody.includes('createPromptDeliveryReceipt(')) {
        fail('buildProductionPromptAssembly must create immutable receipt');
    } else {
        ok('buildProductionPromptAssembly uses pure candidates -> budget -> immutable receipt');
    }
}

const WS_PATH = fs.mkdtempSync(path.join(os.tmpdir(), 'lr-prompt-receipt-'));
const worldStateFile = path.join(WS_PATH, 'world_state.json');
const journalPath = path.join(WS_PATH, 'state_journal.ndjson');
const gameStateFile = path.join(WS_PATH, 'game_state.json');

fs.writeFileSync(path.join(WS_PATH, 'game_rules.json'), JSON.stringify({
    enableEmergentSimulation: true,
    enableWorldObservatory: false,
}, null, 2));

const mockConfigStore = {
    'textAdventure.chronicle': { recapInPrompt: true },
    'textAdventure': {
        'memory.backend': 'tfidf',
        'promptBudget.mode': 'manual',
        'promptBudget.maxTokens': 4096,
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
    if (request === 'vscode') {
        return mockVscode;
    }
    return originalLoad.apply(this, arguments);
};

let gmPromptBuilder;
let worldState;
let turnResultFallback;
let promptReceiptCore;
try {
    gmPromptBuilder = require(gmPromptBuilderPath);
    worldState = require(worldStatePath);
    turnResultFallback = require(turnResultFallbackPath);
    promptReceiptCore = require(promptReceiptCorePath);
} catch (e) {
    Module._load = originalLoad;
    fail(`failed to load compiled modules under vscode mock: ${e && e.stack || e}`);
    process.exit(1);
}

const {
    buildProductionPromptAssembly,
    buildGmPromptContext,
    buildGmPromptBreakdown,
    acknowledgePromptReceiptAfterAccepted,
    resetPromptReceiptStateForTests,
    peekPromptAckCompensationQueueForTests,
    peekChronicleSessionPendingGenerationForTests,
    resetChronicleSessionPending,
} = gmPromptBuilder;
const {
    buildTurnResultPromptReceiptMeta,
    attachTurnResultPromptReceipt,
} = promptReceiptCore;

function writeFixture(options = {}) {
    const message = options.message || 'Test faction event for PROMPT-001C receipt fixture';
    const journalContent = options.journalContent || 'Test action';
    fs.writeFileSync(worldStateFile, JSON.stringify({
        format: 'lorerelay-world-state/1.1',
        worldTurn: 3,
        lastInjectedChronicleTurn: options.lastInjectedChronicleTurn,
        lastInjectedChronicleDigest: options.lastInjectedChronicleDigest,
        lastInjectedWorldChangeSummaryTurn: options.lastInjectedWorldChangeSummaryTurn,
        lastInjectedWorldChangeSummaryDigest: options.lastInjectedWorldChangeSummaryDigest,
        recentChanges: options.recentChanges || [{
            id: 'wce_test_1',
            worldTurn: 3,
            source: 'simulation',
            category: 'faction',
            severity: 'warning',
            message,
        }],
        factions: {},
        regions: {},
        globalEvents: [],
    }, null, 2));
    fs.writeFileSync(journalPath, `${JSON.stringify({ turnId: 'turn_1', playerAction: journalContent })}\n`);
    fs.writeFileSync(gameStateFile, JSON.stringify({
        schemaVersion: 2,
        entries: [],
        options: ['Wait'],
        ...(options.summary ? { summary: options.summary } : {}),
    }, null, 2));
    worldState.clearWorldStateCache();
    resetPromptReceiptStateForTests();
    if (typeof turnResultFallback.resetTurnResultFallbackForTests === 'function') {
        turnResultFallback.resetTurnResultFallbackForTests();
    }
}

function readWorldState() {
    worldState.clearWorldStateCache();
    return JSON.parse(fs.readFileSync(worldStateFile, 'utf-8'));
}

function acceptedTurnForReceipt(receipt) {
    return attachTurnResultPromptReceipt({
        turnId: 'turn-accepted',
        narration: 'Accepted narration',
    }, buildTurnResultPromptReceiptMeta(receipt));
}

try {
    writeFixture();

    const before = readWorldState();
    const context = buildGmPromptContext('look around');
    const afterContext = readWorldState();
    if (afterContext.lastInjectedChronicleTurn !== before.lastInjectedChronicleTurn
        || afterContext.lastInjectedWorldChangeSummaryTurn !== before.lastInjectedWorldChangeSummaryTurn) {
        fail('buildGmPromptContext must not eagerly consume Chronicle/WCS markers');
    } else if (!context.includes('Since Last Visit') || !context.includes('[Previously]')) {
        fail('pure production prompt should still include eligible Chronicle and WCS content');
    } else {
        ok('buildGmPromptContext is pure and still surfaces eligible Chronicle/WCS');
    }

    const breakdown = buildGmPromptBreakdown('look around');
    if (!Array.isArray(breakdown.sections) || breakdown.sections.length === 0) {
        fail('Inspector breakdown should remain available');
    } else {
        ok('Inspector remains read-only and available');
    }

    const assembly = buildProductionPromptAssembly('look around', 'grok');
    const selectedTokenKinds = assembly.receipt.selectedTokens.map((token) => token.chunkId).sort().join(',');
    if (selectedTokenKinds !== 'chronicle,worldChangeSummary') {
        fail(`expected chronicle + WCS selected tokens, got ${selectedTokenKinds || '(none)'}`);
    } else {
        ok('exact-match receipt contains Chronicle and WCS tokens after budget selection');
    }

    const exactAck = acknowledgePromptReceiptAfterAccepted(assembly.receipt, acceptedTurnForReceipt(assembly.receipt));
    const afterAck = readWorldState();
    if (!exactAck.correlated) {
        fail('exact-match Accepted receipt should correlate');
    } else if (afterAck.lastInjectedChronicleTurn !== 1 || afterAck.lastInjectedWorldChangeSummaryTurn !== 3) {
        fail(`exact-match ACK should advance bounded markers: ${JSON.stringify(afterAck)}`);
    } else if (peekChronicleSessionPendingGenerationForTests() < 1) {
        fail('chronicle pending generation should remain well-defined after ACK');
    } else {
        ok('exact-match Accepted ACK advances bounded Chronicle/WCS markers');
    }

    const repeatBefore = JSON.stringify(readWorldState());
    const repeatAck = acknowledgePromptReceiptAfterAccepted(assembly.receipt, acceptedTurnForReceipt(assembly.receipt));
    const repeatAfter = JSON.stringify(readWorldState());
    if (!repeatAck.correlated || repeatBefore !== repeatAfter) {
        fail('repeated token application must be idempotent');
    } else {
        ok('repeated token application is idempotent');
    }

    writeFixture();
    const missingAck = acknowledgePromptReceiptAfterAccepted(assembly.receipt, {
        turnId: 'turn-no-receipt',
        narration: 'Accepted but external root-only metadata missing',
    });
    const afterMissing = readWorldState();
    if (missingAck.correlated || afterMissing.lastInjectedChronicleTurn !== undefined || afterMissing.lastInjectedWorldChangeSummaryTurn !== undefined) {
        fail('missing trusted correlation must consume nothing');
    } else {
        ok('missing trusted correlation consumes nothing');
    }

    writeFixture();
    const wrongReceipt = attachTurnResultPromptReceipt({
        turnId: 'turn-mismatch',
        narration: 'Mismatched receipt',
    }, {
        receiptId: 'wrong',
        provider: 'grok',
        assemblyDigest: 'wrong-digest',
    });
    const mismatchAck = acknowledgePromptReceiptAfterAccepted(assembly.receipt, wrongReceipt);
    const afterMismatch = readWorldState();
    if (mismatchAck.correlated || afterMismatch.lastInjectedChronicleTurn !== undefined || afterMismatch.lastInjectedWorldChangeSummaryTurn !== undefined) {
        fail('mismatched trusted correlation must consume nothing');
    } else {
        ok('mismatched trusted correlation consumes nothing');
    }

    writeFixture();
    const callbackResults = [];
    const delayedA = buildProductionPromptAssembly('action A', 'grok');
    const delayedB = buildProductionPromptAssembly('action B', 'grok');
    turnResultFallback.beginGmRun((acceptedTurn) => {
        callbackResults.push(['A', acknowledgePromptReceiptAfterAccepted(delayedA.receipt, acceptedTurn)]);
    });
    turnResultFallback.beginGmRun((acceptedTurn) => {
        callbackResults.push(['B', acknowledgePromptReceiptAfterAccepted(delayedB.receipt, acceptedTurn)]);
    });
    turnResultFallback.markTurnResultHandled(acceptedTurnForReceipt(delayedA.receipt));
    const delayedState = readWorldState();
    if (callbackResults.length !== 1 || callbackResults[0][0] !== 'B' || callbackResults[0][1].correlated || delayedState.lastInjectedChronicleTurn !== undefined) {
        fail(`delayed A must not consume current B receipt: ${JSON.stringify(callbackResults)}`);
    } else {
        ok('delayed A result cannot consume current B receipt');
    }

    writeFixture();
    const olderChronicle = buildProductionPromptAssembly('chronicle-old', 'grok');
    const generationA = peekChronicleSessionPendingGenerationForTests();
    resetChronicleSessionPending();
    const generationB = peekChronicleSessionPendingGenerationForTests();
    acknowledgePromptReceiptAfterAccepted(olderChronicle.receipt, acceptedTurnForReceipt(olderChronicle.receipt));
    const afterOldChronicle = readWorldState();
    const stillEligible = buildProductionPromptAssembly('chronicle-new', 'grok');
    const hasChronicleAfterOld = stillEligible.receipt.selectedTokens.some((token) => token.chunkId === 'chronicle');
    if (!(generationB > generationA) || !hasChronicleAfterOld || afterOldChronicle.lastInjectedChronicleTurn !== 1) {
        fail('old Chronicle token must not clear newer pending generation');
    } else {
        ok('old Chronicle token cannot clear newer pending generation');
    }

    writeFixture({
        lastInjectedChronicleTurn: 1,
        lastInjectedChronicleDigest: 'old-digest',
    });
    fs.writeFileSync(journalPath, `${JSON.stringify({ turnId: 'turn_1', playerAction: 'Revised action' })}\n`);
    worldState.clearWorldStateCache();
    resetPromptReceiptStateForTests();
    const chronicleNewer = buildProductionPromptAssembly('chronicle-revised', 'grok');
    if (!chronicleNewer.receipt.selectedTokens.some((token) => token.chunkId === 'chronicle')) {
        fail('newer Chronicle content with same sourceTurn must remain eligible');
    } else {
        ok('newer Chronicle content remains eligible when same-turn digest changes');
    }

    writeFixture({
        lastInjectedWorldChangeSummaryTurn: 3,
        lastInjectedWorldChangeSummaryDigest: 'old-wcs-digest',
        recentChanges: [{
            id: 'wce_test_1',
            worldTurn: 3,
            source: 'simulation',
            category: 'faction',
            severity: 'warning',
            message: 'Revised WCS content for same turn',
        }],
    });
    worldState.clearWorldStateCache();
    resetPromptReceiptStateForTests();
    const wcsNewer = buildProductionPromptAssembly('wcs-revised', 'grok');
    if (!wcsNewer.receipt.selectedTokens.some((token) => token.chunkId === 'worldChangeSummary')) {
        fail('newer WCS content with same turn must remain eligible');
    } else {
        ok('newer WCS content remains eligible when same-turn digest changes');
    }

    writeFixture({
        message: 'W'.repeat(6000),
        journalContent: 'J'.repeat(6000),
        summary: 'S'.repeat(5000),
    });
    mockConfigStore['textAdventure']['promptBudget.maxTokens'] = 1000;
    const evicted = buildProductionPromptAssembly('tiny-budget', 'grok');
    mockConfigStore['textAdventure']['promptBudget.maxTokens'] = 4096;
    const selectedIds = new Set(evicted.selectedSpecs.map((spec) => spec.id));
    const evictedTokenKinds = new Set(evicted.receipt.selectedTokens.map((token) => token.chunkId));
    const evictedChronicle = !selectedIds.has('chronicle');
    const evictedWcs = !selectedIds.has('worldChangeSummary');
    if (!evictedChronicle && !evictedWcs) {
        fail('fixture invalid: expected at least one consumable chunk to be evicted under budget pressure');
    } else if ((evictedChronicle && evictedTokenKinds.has('chronicle')) || (evictedWcs && evictedTokenKinds.has('worldChangeSummary'))) {
        fail('evicted Chronicle/WCS chunks must not become receipt tokens');
    } else {
        const evictedAck = acknowledgePromptReceiptAfterAccepted(evicted.receipt, acceptedTurnForReceipt(evicted.receipt));
        const afterEvicted = readWorldState();
        if (!evictedAck.correlated) {
            fail('evicted receipt should still correlate at Accepted boundary');
        } else if (evictedChronicle && afterEvicted.lastInjectedChronicleTurn !== undefined) {
            fail('evicted Chronicle chunk must not consume Chronicle marker');
        } else if (evictedWcs && afterEvicted.lastInjectedWorldChangeSummaryTurn !== undefined) {
            fail('evicted WCS chunk must not consume WCS marker');
        } else {
            ok('evicted Chronicle/WCS chunks are not tokenized and do not consume their markers');
        }
    }

    writeFixture();
    const partialReceipt = buildProductionPromptAssembly('partial-failure', 'grok');
    const partialAccepted = acceptedTurnForReceipt(partialReceipt.receipt);
    const chronicleThrow = acknowledgePromptReceiptAfterAccepted(partialReceipt.receipt, partialAccepted, {
        applyChronicleToken() {
            throw new Error('chronicle boom');
        },
    });
    const afterChronicleThrow = readWorldState();
    if (!chronicleThrow.correlated || chronicleThrow.failedTokenIds.length !== 1 || afterChronicleThrow.lastInjectedWorldChangeSummaryTurn !== 3) {
        fail('Chronicle ACK throw must not block WCS ACK');
    } else if (peekPromptAckCompensationQueueForTests().length === 0) {
        fail('Chronicle ACK throw should retain failed token in compensation queue');
    } else {
        ok('Chronicle ACK throw does not block WCS ACK');
    }

    writeFixture();
    const wcsThrowReceipt = buildProductionPromptAssembly('wcs-failure', 'grok');
    const wcsThrow = acknowledgePromptReceiptAfterAccepted(wcsThrowReceipt.receipt, acceptedTurnForReceipt(wcsThrowReceipt.receipt), {
        applyWorldChangeSummaryToken() {
            throw new Error('wcs boom');
        },
    });
    const afterWcsThrow = readWorldState();
    if (!wcsThrow.correlated || wcsThrow.failedTokenIds.length !== 1 || afterWcsThrow.lastInjectedChronicleTurn !== 1) {
        fail('WCS ACK throw must not revoke Accepted Chronicle ACK');
    } else if (peekPromptAckCompensationQueueForTests().length === 0) {
        fail('WCS ACK throw should retain failed token in compensation queue');
    } else {
        ok('WCS ACK throw does not revoke Accepted');
    }

    writeFixture();
    let acceptedCallbackCount = 0;
    const launchFailureReceipt = buildProductionPromptAssembly('launch-failure', 'grok');
    const prevState = turnResultFallback.beginGmRun((acceptedTurn) => {
        acceptedCallbackCount += 1;
        acknowledgePromptReceiptAfterAccepted(launchFailureReceipt.receipt, acceptedTurn);
    });
    turnResultFallback.finishGmRun(prevState, 'launch-failure', false);
    const afterLaunchFailure = readWorldState();
    if (acceptedCallbackCount !== 0 || afterLaunchFailure.lastInjectedChronicleTurn !== undefined || afterLaunchFailure.lastInjectedWorldChangeSummaryTurn !== undefined) {
        fail('provider launch failure must consume nothing');
    } else {
        ok('provider launch failure consumes nothing');
    }
} finally {
    Module._load = originalLoad;
    fs.rmSync(WS_PATH, { recursive: true, force: true });
}

if (failed > 0) {
    console.error(`\n${failed} test(s) failed.`);
    process.exit(1);
}
console.log('\nAll prompt receipt Accepted consumption tests passed.');
