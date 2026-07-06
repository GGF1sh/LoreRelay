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
    const assemblyBody = extractFunctionBody('buildProductionPromptAssemblyInternal')
        || extractFunctionBody('buildProductionPromptAssembly');
    if (!assemblyBody) {
        fail('buildProductionPromptAssembly core not found');
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
    combinePromptReceiptAckOutcomesForTests,
    rearmChronicleSessionPendingSameGenerationForTests,
} = gmPromptBuilder;
const {
    buildTurnResultPromptReceiptMeta,
    attachTurnResultPromptReceipt,
    withPromptReceiptDiagnostics,
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

    // SR-001-R1 truth table: genuine failure must dominate a compound Chronicle outcome.
    {
        const cases = [
            ['failed', 'applied', 'failed'],
            ['applied', 'failed', 'failed'],
            ['applied', 'alreadySatisfied', 'applied'],
            ['alreadySatisfied', 'applied', 'applied'],
            ['alreadySatisfied', 'alreadySatisfied', 'alreadySatisfied'],
            ['failed', 'alreadySatisfied', 'failed'],
            ['alreadySatisfied', 'failed', 'failed'],
            ['failed', 'failed', 'failed'],
        ];
        let allOk = true;
        for (const [a, b, expected] of cases) {
            const got = combinePromptReceiptAckOutcomesForTests(a, b);
            if (got !== expected) {
                allOk = false;
                fail(`combine(${a}, ${b}) should be ${expected}, got ${got}`);
            }
        }
        if (allOk) {
            ok('SR-001-R1 truth table: failed > applied > alreadySatisfied precedence holds for all 8 combinations');
        }
    }

    writeFixture();
    {
        // marker applied (fresh, never recorded) + generation failed (mismatch) -> failed.
        const genA = buildProductionPromptAssembly('sr001-r1-marker-applied-gen-failed', 'grok');
        resetChronicleSessionPending();
        const accepted = acceptedTurnForReceipt(genA.receipt);
        const ack = acknowledgePromptReceiptAfterAccepted(genA.receipt, accepted);
        const chronicleTokenId = genA.receipt.selectedTokens.find((t) => t.chunkId === 'chronicle').tokenId;
        if (!ack.correlated
            || !ack.failedTokenIds.includes(chronicleTokenId)
            || ack.alreadySatisfiedTokenIds.includes(chronicleTokenId)
            || ack.succeededTokenIds.includes(chronicleTokenId)
            || !peekPromptAckCompensationQueueForTests().some((f) => f.tokenId === chronicleTokenId)) {
            fail(`marker applied + generation failed must combine to failed with compensation retained: ${JSON.stringify(ack)}`);
        } else {
            ok('marker applied + generation failed combines to failed; compensation retained');
        }
    }

    writeFixture();
    {
        // marker failed (already stale, currentTurn advanced past token) + generation applied -> failed.
        const staleMarker = buildProductionPromptAssembly('sr001-r1-marker-failed-gen-applied', 'grok');
        const chronicleToken = staleMarker.receipt.selectedTokens.find((t) => t.chunkId === 'chronicle');
        worldState.markChronicleInjected(chronicleToken.sourceTurn + 1, 'advanced-past-token-digest');
        worldState.clearWorldStateCache();
        const accepted = acceptedTurnForReceipt(staleMarker.receipt);
        const ack = acknowledgePromptReceiptAfterAccepted(staleMarker.receipt, accepted);
        if (!ack.correlated
            || !ack.failedTokenIds.includes(chronicleToken.tokenId)
            || ack.alreadySatisfiedTokenIds.includes(chronicleToken.tokenId)
            || ack.succeededTokenIds.includes(chronicleToken.tokenId)
            || !peekPromptAckCompensationQueueForTests().some((f) => f.tokenId === chronicleToken.tokenId)) {
            fail(`marker failed + generation applied must combine to failed with compensation retained: ${JSON.stringify(ack)}`);
        } else {
            ok('marker failed + generation applied combines to failed; compensation retained');
        }
    }

    writeFixture();
    {
        // marker applied (fresh, distinct sourceTurn) + generation alreadySatisfied (same
        // generation, already cleared by an earlier token) -> applied.
        const firstGenToken = buildProductionPromptAssembly('sr001-r1-first-in-generation', 'grok');
        acknowledgePromptReceiptAfterAccepted(firstGenToken.receipt, acceptedTurnForReceipt(firstGenToken.receipt));
        // Append a second journal entry (without calling writeFixture/resetPromptReceiptStateForTests,
        // which would bump the generation) so the next Chronicle candidate has a genuinely new,
        // never-recorded sourceTurn while remaining in the SAME (already-cleared) generation.
        fs.appendFileSync(journalPath, `${JSON.stringify({ turnId: 'turn_2', playerAction: 'Second distinct action in same generation' })}\n`);
        worldState.clearWorldStateCache();
        const secondGenToken = buildProductionPromptAssembly('sr001-r1-second-in-same-generation', 'grok');
        const chronicleToken = secondGenToken.receipt.selectedTokens.find((t) => t.chunkId === 'chronicle');
        const accepted = acceptedTurnForReceipt(secondGenToken.receipt);
        const ack = acknowledgePromptReceiptAfterAccepted(secondGenToken.receipt, accepted);
        if (!ack.correlated
            || !ack.succeededTokenIds.includes(chronicleToken.tokenId)
            || ack.failedTokenIds.includes(chronicleToken.tokenId)
            || ack.alreadySatisfiedTokenIds.includes(chronicleToken.tokenId)) {
            fail(`marker applied + generation alreadySatisfied must combine to applied: ${JSON.stringify({ ack, chronicleToken })}`);
        } else {
            ok('marker applied + generation alreadySatisfied combines to applied');
        }
    }

    writeFixture();
    {
        // marker alreadySatisfied (exact duplicate) + generation applied -> applied. First ACK
        // establishes the marker; reset just the compensation bookkeeping (not the generation) is
        // not applicable here, so instead we simulate by re-running the SAME token twice within the
        // SAME generation but forcing the marker sub-outcome via an override is not needed: the
        // second exact ACK naturally yields marker=alreadySatisfied + generation=alreadySatisfied
        // (already covered by the exact-duplicate test above). To isolate marker=alreadySatisfied +
        // generation=applied specifically, force the generation to look freshly-clearable by
        // resetting pending (not generation) via a second exact token after a manual re-arm.
        const base = buildProductionPromptAssembly('sr001-r1-marker-satisfied-gen-applied', 'grok');
        const chronicleToken = base.receipt.selectedTokens.find((t) => t.chunkId === 'chronicle');
        const accepted = acceptedTurnForReceipt(base.receipt);
        acknowledgePromptReceiptAfterAccepted(base.receipt, accepted);
        // Re-arm pending for the SAME generation (no reset -> no generation bump) so the next ACK
        // of the same exact token yields generation=applied while the marker is already satisfied.
        rearmChronicleSessionPendingSameGenerationForTests();
        const ack = acknowledgePromptReceiptAfterAccepted(base.receipt, accepted);
        if (!ack.correlated
            || !ack.succeededTokenIds.includes(chronicleToken.tokenId)
            || ack.failedTokenIds.includes(chronicleToken.tokenId)
            || ack.alreadySatisfiedTokenIds.includes(chronicleToken.tokenId)) {
            fail(`marker alreadySatisfied + generation applied must combine to applied: ${JSON.stringify(ack)}`);
        } else {
            ok('marker alreadySatisfied + generation applied combines to applied');
        }
    }

    writeFixture();
    {
        // SR-001-R2: an old-generation token must not become alreadySatisfied merely because a
        // NEWER generation has already been cleared by a different (current) token.
        const oldGenToken = buildProductionPromptAssembly('sr001-r2-old-generation', 'grok');
        const oldGenAccepted = acceptedTurnForReceipt(oldGenToken.receipt);
        resetChronicleSessionPending();
        const newGenToken = buildProductionPromptAssembly('sr001-r2-old-generation', 'grok');
        acknowledgePromptReceiptAfterAccepted(newGenToken.receipt, acceptedTurnForReceipt(newGenToken.receipt));
        // Newer generation is now genuinely cleared (pending=false) for generation B. The old
        // generation-A token's marker is now also already satisfied (same source turn/digest as
        // the newer token), so a correct implementation must still report `failed` because the
        // generation itself is stale, not `alreadySatisfied`.
        const oldChronicleToken = oldGenToken.receipt.selectedTokens.find((t) => t.chunkId === 'chronicle');
        const oldAck = acknowledgePromptReceiptAfterAccepted(oldGenToken.receipt, oldGenAccepted);
        if (!oldAck.correlated
            || !oldAck.failedTokenIds.includes(oldChronicleToken.tokenId)
            || oldAck.alreadySatisfiedTokenIds.includes(oldChronicleToken.tokenId)
            || oldAck.succeededTokenIds.includes(oldChronicleToken.tokenId)
            || !peekPromptAckCompensationQueueForTests().some((f) => f.tokenId === oldChronicleToken.tokenId)) {
            fail(`old generation after newer generation already cleared must remain failed, not alreadySatisfied: ${JSON.stringify(oldAck)}`);
        } else {
            ok('old generation after newer generation already cleared is failed, not alreadySatisfied; compensation retained');
        }
    }

    writeFixture();
    {
        // Mixed token outcomes: Chronicle forced failed + WCS naturally alreadySatisfied (exact
        // duplicate) must be reported independently.
        const mixed = buildProductionPromptAssembly('sr001-mixed-failed-satisfied', 'grok');
        const accepted = acceptedTurnForReceipt(mixed.receipt);
        acknowledgePromptReceiptAfterAccepted(mixed.receipt, accepted);
        const chronicleToken = mixed.receipt.selectedTokens.find((t) => t.chunkId === 'chronicle');
        const wcsToken = mixed.receipt.selectedTokens.find((t) => t.chunkId === 'worldChangeSummary');
        const ack = acknowledgePromptReceiptAfterAccepted(mixed.receipt, accepted, {
            applyChronicleToken: () => 'failed',
        });
        if (!ack.correlated
            || !ack.failedTokenIds.includes(chronicleToken.tokenId)
            || !ack.alreadySatisfiedTokenIds.includes(wcsToken.tokenId)
            || ack.failedTokenIds.includes(wcsToken.tokenId)
            || !peekPromptAckCompensationQueueForTests().some((f) => f.tokenId === chronicleToken.tokenId)) {
            fail(`mixed Chronicle-failed + WCS-alreadySatisfied outcomes must be independent: ${JSON.stringify(ack)}`);
        } else {
            ok('mixed token outcomes (Chronicle failed, WCS alreadySatisfied) remain independent');
        }
    }

    writeFixture();
    {
        // Mixed token outcomes: Chronicle naturally alreadySatisfied (exact duplicate) + WCS forced
        // applied must be reported independently.
        const mixed = buildProductionPromptAssembly('sr001-mixed-satisfied-applied', 'grok');
        const accepted = acceptedTurnForReceipt(mixed.receipt);
        acknowledgePromptReceiptAfterAccepted(mixed.receipt, accepted);
        const chronicleToken = mixed.receipt.selectedTokens.find((t) => t.chunkId === 'chronicle');
        const wcsToken = mixed.receipt.selectedTokens.find((t) => t.chunkId === 'worldChangeSummary');
        const ack = acknowledgePromptReceiptAfterAccepted(mixed.receipt, accepted, {
            applyWorldChangeSummaryToken: () => 'applied',
        });
        if (!ack.correlated
            || !ack.alreadySatisfiedTokenIds.includes(chronicleToken.tokenId)
            || !ack.succeededTokenIds.includes(wcsToken.tokenId)
            || ack.failedTokenIds.includes(chronicleToken.tokenId)
            || ack.failedTokenIds.includes(wcsToken.tokenId)) {
            fail(`mixed Chronicle-alreadySatisfied + WCS-applied outcomes must be independent: ${JSON.stringify(ack)}`);
        } else {
            ok('mixed token outcomes (Chronicle alreadySatisfied, WCS applied) remain independent');
        }
    }

    writeFixture();
    {
        // Exact retry after prior compensation history: a genuinely-failed attempt is recorded as
        // compensation, then a later real ACK of the same receipt/token that truthfully reaches
        // applied/alreadySatisfied must clear that stale compensation entry and report the truthful
        // current outcome (not the stale failure).
        const retry = buildProductionPromptAssembly('sr001-retry-after-compensation', 'grok');
        const accepted = acceptedTurnForReceipt(retry.receipt);
        const chronicleToken = retry.receipt.selectedTokens.find((t) => t.chunkId === 'chronicle');
        const firstAck = acknowledgePromptReceiptAfterAccepted(retry.receipt, accepted, {
            applyChronicleToken: () => 'failed',
        });
        const hadCompensationAfterFirst = peekPromptAckCompensationQueueForTests().some((f) => f.tokenId === chronicleToken.tokenId);
        const secondAck = acknowledgePromptReceiptAfterAccepted(retry.receipt, accepted);
        const hasCompensationAfterSecond = peekPromptAckCompensationQueueForTests().some((f) => f.tokenId === chronicleToken.tokenId);
        if (!firstAck.correlated || !hadCompensationAfterFirst
            || !secondAck.correlated
            || !secondAck.succeededTokenIds.includes(chronicleToken.tokenId)
            || secondAck.failedTokenIds.includes(chronicleToken.tokenId)
            || hasCompensationAfterSecond) {
            fail(`exact retry after prior compensation history must report the truthful current outcome and clear stale compensation: ${JSON.stringify({ firstAck, secondAck })}`);
        } else {
            ok('exact retry after prior compensation history reports truthful outcome and clears stale compensation');
        }
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
    const mutationReceipt = buildProductionPromptAssembly('mutation-sanity', 'grok');
    const capturedAccepted = acceptedTurnForReceipt(mutationReceipt.receipt);
    const originalTokenIds = mutationReceipt.receipt.selectedTokens.map((token) => token.tokenId).slice().sort();
    let mutationThrew = false;
    try {
        mutationReceipt.receipt.selectedTokens.push({
            tokenId: 'injected-token',
            chunkId: 'worldChangeSummary',
            summaryTurn: 999,
            sourceDigest: 'injected-digest',
        });
    } catch (e) {
        mutationThrew = true;
    }
    for (const token of mutationReceipt.receipt.selectedTokens) {
        try {
            token.sourceTurn = -1;
            token.summaryTurn = -1;
            token.sourceDigest = 'tampered';
        } catch (e) {
            mutationThrew = true;
        }
    }
    if (!mutationThrew) {
        fail('mutating a frozen receipt/token in strict mode should throw TypeError');
    } else {
        ok('receipt authority is frozen: post-capture mutation attempts throw instead of silently applying');
    }
    const mutationAck = acknowledgePromptReceiptAfterAccepted(mutationReceipt.receipt, capturedAccepted);
    const afterMutation = readWorldState();
    const ackedTokenIds = mutationAck.succeededTokenIds.slice().sort();
    if (!mutationAck.correlated
        || ackedTokenIds.join(',') !== originalTokenIds.join(',')
        || mutationReceipt.receipt.selectedTokens.length !== originalTokenIds.length
        || afterMutation.lastInjectedChronicleTurn !== 1
        || afterMutation.lastInjectedWorldChangeSummaryTurn !== 3) {
        fail(`post-capture mutation must not alter ACK authority: ${JSON.stringify({ ackedTokenIds, originalTokenIds, afterMutation })}`);
    } else {
        ok('mutating original receipt/token arrays after callback capture cannot alter ACK authority');
    }

    writeFixture();
    const chronicleFalseReceipt = buildProductionPromptAssembly('chronicle-false-return', 'grok');
    const chronicleFalseAck = acknowledgePromptReceiptAfterAccepted(
        chronicleFalseReceipt.receipt,
        acceptedTurnForReceipt(chronicleFalseReceipt.receipt),
        { applyChronicleToken: () => 'failed' }
    );
    const afterChronicleFalse = readWorldState();
    if (!chronicleFalseAck.correlated
        || !chronicleFalseAck.failedTokenIds.some((id) => chronicleFalseReceipt.receipt.selectedTokens.some((t) => t.tokenId === id && t.chunkId === 'chronicle'))
        || chronicleFalseAck.alreadySatisfiedTokenIds.length !== 0
        || afterChronicleFalse.lastInjectedChronicleTurn !== undefined
        || afterChronicleFalse.lastInjectedWorldChangeSummaryTurn !== 3
        || peekPromptAckCompensationQueueForTests().length === 0) {
        fail(`Chronicle ACK genuine-failure outcome must be treated as failure and not block WCS: ${JSON.stringify({ chronicleFalseAck, afterChronicleFalse })}`);
    } else {
        ok('Chronicle ACK genuine-failure outcome is a failure with a compensation entry; WCS ACK still attempted and Chronicle remains failed');
    }

    writeFixture();
    const wcsFalseReceipt = buildProductionPromptAssembly('wcs-false-return', 'grok');
    const wcsFalseAcceptedTurn = acceptedTurnForReceipt(wcsFalseReceipt.receipt);
    const wcsFalseAck = acknowledgePromptReceiptAfterAccepted(
        wcsFalseReceipt.receipt,
        wcsFalseAcceptedTurn,
        { applyWorldChangeSummaryToken: () => 'failed' }
    );
    const afterWcsFalse = readWorldState();
    if (!wcsFalseAck.correlated
        || !wcsFalseAck.failedTokenIds.some((id) => wcsFalseReceipt.receipt.selectedTokens.some((t) => t.tokenId === id && t.chunkId === 'worldChangeSummary'))
        || wcsFalseAck.alreadySatisfiedTokenIds.length !== 0
        || afterWcsFalse.lastInjectedChronicleTurn !== 1
        || afterWcsFalse.lastInjectedWorldChangeSummaryTurn !== undefined
        || peekPromptAckCompensationQueueForTests().length === 0) {
        fail(`WCS ACK genuine-failure outcome must be treated as failure without revoking Accepted: ${JSON.stringify({ wcsFalseAck, afterWcsFalse })}`);
    } else {
        ok('WCS ACK genuine-failure outcome is a failure with a compensation entry; Accepted remains true and WCS remains failed');
    }

    writeFixture();
    const exactDupChronicleReceipt = buildProductionPromptAssembly('exact-duplicate-chronicle', 'grok');
    const exactDupChronicleAccepted = acceptedTurnForReceipt(exactDupChronicleReceipt.receipt);
    const firstChronicleAck = acknowledgePromptReceiptAfterAccepted(exactDupChronicleReceipt.receipt, exactDupChronicleAccepted);
    const secondChronicleAck = acknowledgePromptReceiptAfterAccepted(exactDupChronicleReceipt.receipt, exactDupChronicleAccepted);
    const chronicleToken = exactDupChronicleReceipt.receipt.selectedTokens.find((t) => t.chunkId === 'chronicle');
    if (!firstChronicleAck.correlated || !secondChronicleAck.correlated
        || !secondChronicleAck.alreadySatisfiedTokenIds.includes(chronicleToken.tokenId)
        || secondChronicleAck.failedTokenIds.includes(chronicleToken.tokenId)
        || peekPromptAckCompensationQueueForTests().some((f) => f.tokenId === chronicleToken.tokenId)) {
        fail(`exact duplicate Chronicle ACK must be a truthful no-op, not a failure: ${JSON.stringify({ firstChronicleAck, secondChronicleAck })}`);
    } else {
        ok('exact duplicate Chronicle ACK is a truthful no-op: not a failure, no compensation entry');
    }

    writeFixture();
    const exactDupWcsReceipt = buildProductionPromptAssembly('exact-duplicate-wcs', 'grok');
    const exactDupWcsAccepted = acceptedTurnForReceipt(exactDupWcsReceipt.receipt);
    const firstWcsAck = acknowledgePromptReceiptAfterAccepted(exactDupWcsReceipt.receipt, exactDupWcsAccepted);
    const secondWcsAck = acknowledgePromptReceiptAfterAccepted(exactDupWcsReceipt.receipt, exactDupWcsAccepted);
    const wcsToken = exactDupWcsReceipt.receipt.selectedTokens.find((t) => t.chunkId === 'worldChangeSummary');
    if (!firstWcsAck.correlated || !secondWcsAck.correlated
        || !secondWcsAck.alreadySatisfiedTokenIds.includes(wcsToken.tokenId)
        || secondWcsAck.failedTokenIds.includes(wcsToken.tokenId)
        || peekPromptAckCompensationQueueForTests().some((f) => f.tokenId === wcsToken.tokenId)) {
        fail(`exact duplicate WCS ACK must be a truthful no-op, not a failure: ${JSON.stringify({ firstWcsAck, secondWcsAck })}`);
    } else {
        ok('exact duplicate WCS ACK is a truthful no-op: not a failure, no compensation entry');
    }

    writeFixture();
    const diagnosticsReceiptBase = buildProductionPromptAssembly('diagnostics-wrap', 'grok');
    const diagnosticsWrappedReceipt = withPromptReceiptDiagnostics(diagnosticsReceiptBase.receipt, {
        transportPayloadHash: 'redacted-transport-hash',
    });
    if (!Object.isFrozen(diagnosticsWrappedReceipt)
        || !Object.isFrozen(diagnosticsWrappedReceipt.selectedTokens)
        || !diagnosticsWrappedReceipt.selectedTokens.every((token) => Object.isFrozen(token))
        || !Object.isFrozen(diagnosticsWrappedReceipt.selectedChunks)
        || !diagnosticsWrappedReceipt.selectedChunks.every((chunk) => Object.isFrozen(chunk))
        || !Object.isFrozen(diagnosticsWrappedReceipt.diagnostics)) {
        fail('diagnostics-wrapped provider-bound receipt must remain fully frozen (top-level, chunks, tokens, diagnostics)');
    } else {
        ok('diagnostics-wrapped provider receipt is frozen at every authority level');
    }

    const diagnosticsAccepted = acceptedTurnForReceipt(diagnosticsWrappedReceipt);
    const originalDiagnosticsTokenIds = diagnosticsWrappedReceipt.selectedTokens.map((t) => t.tokenId).slice().sort();
    let diagnosticsMutationThrew = false;
    try {
        diagnosticsWrappedReceipt.receiptId = 'tampered-receipt-id';
    } catch (e) { diagnosticsMutationThrew = true; }
    try {
        diagnosticsWrappedReceipt.selectedTokens.push({
            tokenId: 'injected', chunkId: 'worldChangeSummary', summaryTurn: 999, sourceDigest: 'injected',
        });
    } catch (e) { diagnosticsMutationThrew = true; }
    for (const token of diagnosticsWrappedReceipt.selectedTokens) {
        try {
            token.sourceTurn = -1;
            token.summaryTurn = -1;
            token.sourceDigest = 'tampered';
        } catch (e) { diagnosticsMutationThrew = true; }
    }
    if (!diagnosticsMutationThrew) {
        fail('mutating a diagnostics-wrapped provider-bound receipt in strict mode should throw TypeError');
    } else {
        ok('post-provider-binding mutation attempts on the diagnostics-wrapped receipt throw instead of silently applying');
    }
    const diagnosticsAck = acknowledgePromptReceiptAfterAccepted(diagnosticsWrappedReceipt, diagnosticsAccepted);
    const afterDiagnosticsAck = readWorldState();
    const diagnosticsAckedIds = diagnosticsAck.succeededTokenIds.slice().sort();
    if (!diagnosticsAck.correlated
        || diagnosticsAckedIds.join(',') !== originalDiagnosticsTokenIds.join(',')
        || diagnosticsWrappedReceipt.selectedTokens.length !== originalDiagnosticsTokenIds.length
        || afterDiagnosticsAck.lastInjectedChronicleTurn !== 1
        || afterDiagnosticsAck.lastInjectedWorldChangeSummaryTurn !== 3) {
        fail(`mutation attempts after provider binding must not alter ACK authority: ${JSON.stringify({ diagnosticsAckedIds, originalDiagnosticsTokenIds, afterDiagnosticsAck })}`);
    } else {
        ok('mutation attempts after provider binding cannot alter ACK authority for the diagnostics-wrapped receipt');
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
