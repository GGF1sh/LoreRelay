#!/usr/bin/env node
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');

const root = path.join(__dirname, '..');
const gmPromptBuilderPath = path.join(root, 'out', 'gmPromptBuilder.js');
const gmPromptBuilderSourcePath = path.join(root, 'src', 'gmPromptBuilder.ts');

let failed = 0;
function fail(msg) { console.error(`FAIL: ${msg}`); failed++; }
function ok(msg) { console.log(`OK: ${msg}`); }

if (!fs.existsSync(gmPromptBuilderPath)) {
    fail('out/gmPromptBuilder.js missing - run npm run compile first');
}
if (!fs.existsSync(gmPromptBuilderSourcePath)) {
    fail('src/gmPromptBuilder.ts missing');
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

if (source.includes('lastShadowReport')) {
    fail('PROMPT-001D2 must not use module-level lastShadowReport authority');
} else {
    ok('shadow report authority is not cached in a module-level latest-report variable');
}

{
    const breakdownBody = extractFunctionBody('buildGmPromptBreakdown');
    if (!breakdownBody) {
        fail('buildGmPromptBreakdown not found');
    } else if (breakdownBody.includes('buildProductionPromptAssembly(')) {
        fail('Inspector reads must not trigger production assembly');
    } else if (!breakdownBody.includes('buildCategoryBudgetShadowReport(')) {
        fail('buildGmPromptBreakdown must thread an explicit shadow report from its own local assembly');
    } else {
        ok('Inspector breakdown computes its own shadow report without calling production assembly');
    }
}

{
    const productionBody = extractFunctionBody('buildProductionPromptAssemblyInternal');
    if (!productionBody) {
        fail('buildProductionPromptAssemblyInternal not found');
    } else {
        const selectedIdx = productionBody.indexOf('const selectedSpecs = buildSelectedPromptSpecs');
        const shadowIdx = productionBody.indexOf('const shadowReport =');
        const receiptIdx = productionBody.indexOf('const receipt = createPromptDeliveryReceipt');
        if (selectedIdx < 0 || shadowIdx < 0 || receiptIdx < 0) {
            fail('production assembly must compute selectedSpecs, then shadow report, then receipt');
        } else if (!(selectedIdx < shadowIdx && shadowIdx < receiptIdx)) {
            fail('shadow report must run after production selection is fixed and before receipt creation');
        } else {
            ok('production assembly isolates shadow evaluation after selection and before receipt creation');
        }
    }
}

const WS_PATH = fs.mkdtempSync(path.join(os.tmpdir(), 'lr-prompt-d2-'));
const worldStateFile = path.join(WS_PATH, 'world_state.json');
const journalPath = path.join(WS_PATH, 'state_journal.ndjson');
const gameRulesPath = path.join(WS_PATH, 'game_rules.json');

fs.writeFileSync(gameRulesPath, JSON.stringify({
    enableEmergentSimulation: true,
    enableWorldObservatory: false,
}, null, 2));

fs.writeFileSync(worldStateFile, JSON.stringify({
    worldTurn: 3,
    lastInjectedChronicleTurn: 1,
    recentChanges: [
        {
            id: 'wce_test_1',
            worldTurn: 3,
            source: 'simulation',
            category: 'faction',
            severity: 'warning',
            message: 'Test faction event for PROMPT-001D2 fixture',
        },
    ],
}, null, 2));

fs.writeFileSync(
    journalPath,
    `${JSON.stringify({ turnId: 'turn_1', playerAction: 'Test action' })}\n`
);

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
try {
    gmPromptBuilder = require(gmPromptBuilderPath);
} catch (e) {
    Module._load = originalLoad;
    fail(`failed to load compiled gmPromptBuilder.js under vscode mock: ${e && e.stack || e}`);
    process.exit(1);
}

const {
    buildProductionPromptAssembly,
    buildProductionPromptAssemblyWithoutShadowForTests,
    buildProductionPromptAssemblyWithShadowAllocatorForTests,
    buildCategoryBudgetShadowReportForTests,
    buildGmPromptBreakdown,
} = gmPromptBuilder;

function readWorldState() {
    return JSON.parse(fs.readFileSync(worldStateFile, 'utf-8'));
}

function estimateTokens(text) {
    return Math.ceil(String(text || '').length / 4);
}

function sumValues(record) {
    return Object.values(record || {}).reduce((sum, value) => sum + Number(value || 0), 0);
}

function assertProductionUnchanged(candidate, baseline, label) {
    const candidateIds = candidate.selectedSpecs.map((spec) => spec.id);
    const baselineIds = baseline.selectedSpecs.map((spec) => spec.id);
    if (JSON.stringify(candidateIds) !== JSON.stringify(baselineIds)) {
        fail(`${label}: production selected IDs changed`);
        return false;
    }
    if (candidate.promptText !== baseline.promptText) {
        fail(`${label}: promptText changed`);
        return false;
    }
    if (candidate.receipt.assemblyDigest !== baseline.receipt.assemblyDigest) {
        fail(`${label}: receipt assemblyDigest changed`);
        return false;
    }
    if (JSON.stringify(candidate.receipt.selectedTokens) !== JSON.stringify(baseline.receipt.selectedTokens)) {
        fail(`${label}: receipt selectedTokens changed`);
        return false;
    }
    return true;
}

function normalizeReportIds(report) {
    if (!report || report.status !== 'ok') {
        return null;
    }
    return {
        overlapIds: [...report.overlapIds].sort(),
        productionOnlyIds: [...report.productionOnlyIds].sort(),
        shadowOnlyIds: [...report.shadowOnlyIds].sort(),
    };
}

try {
    const before = readWorldState();
    const enabled = buildProductionPromptAssembly('look around', 'grok');
    const baseline = buildProductionPromptAssemblyWithoutShadowForTests('look around', 'grok');
    const after = readWorldState();

    const enabledIds = enabled.selectedSpecs.map((spec) => spec.id);
    const baselineIds = baseline.selectedSpecs.map((spec) => spec.id);
    if (JSON.stringify(enabledIds) !== JSON.stringify(baselineIds)) {
        fail(`shadow altered production selected IDs: enabled=${JSON.stringify(enabledIds)} baseline=${JSON.stringify(baselineIds)}`);
    } else {
        ok('shadow cannot alter production selected IDs');
    }

    if (enabled.promptText !== baseline.promptText) {
        fail('shadow altered final prompt payload');
    } else {
        ok('shadow cannot alter final prompt payload');
    }

    if (enabled.receipt.assemblyDigest !== baseline.receipt.assemblyDigest) {
        fail(`shadow altered receipt assemblyDigest: enabled=${enabled.receipt.assemblyDigest} baseline=${baseline.receipt.assemblyDigest}`);
    } else {
        ok('shadow cannot alter receipt assemblyDigest');
    }

    if (after.lastInjectedChronicleTurn !== before.lastInjectedChronicleTurn
        || after.lastInjectedWorldChangeSummaryTurn !== before.lastInjectedWorldChangeSummaryTurn) {
        fail('shadow evaluation consumed Chronicle/WCS markers during production assembly');
    } else {
        ok('shadow cannot consume Chronicle/WCS during production assembly');
    }

    if (!enabled.shadowReport || enabled.shadowReport.status !== 'ok') {
        fail(`expected successful shadow report in production assembly, got ${JSON.stringify(enabled.shadowReport)}`);
    } else {
        const report = enabled.shadowReport;
        const prodIds = new Set(enabled.selectedSpecs.map((spec) => spec.id));
        const overlap = new Set(report.overlapIds);
        const prodOnly = new Set(report.productionOnlyIds);
        const shadowOnly = new Set(report.shadowOnlyIds);
        const shadowIds = [...report.overlapIds, ...report.shadowOnlyIds];

        if (sumValues(report.perCategoryCandidateCounts) !== report.totalCandidateCount) {
            fail('perCategoryCandidateCounts does not sum to totalCandidateCount');
        } else if (sumValues(report.perCategoryProductionSelectedCounts) !== report.productionSelectedCount) {
            fail('perCategoryProductionSelectedCounts does not sum to productionSelectedCount');
        } else if (sumValues(report.perCategoryShadowSelectedCounts) !== report.shadowSelectedCount) {
            fail('perCategoryShadowSelectedCounts does not sum to shadowSelectedCount');
        } else {
            ok('category counts are truthful');
        }

        const allPartitionIds = [...report.overlapIds, ...report.productionOnlyIds, ...report.shadowOnlyIds];
        const uniquePartitionIds = new Set(allPartitionIds);
        if (uniquePartitionIds.size !== allPartitionIds.length) {
            fail(`partition contains duplicate ids: ${JSON.stringify(allPartitionIds)}`);
        } else if (report.overlapIds.some((id) => !prodIds.has(id)) || report.productionOnlyIds.some((id) => !prodIds.has(id))) {
            fail('production partition contains ids that are not actually production-selected');
        } else if ([...overlap, ...shadowOnly].length !== shadowIds.length) {
            fail('shadow partition is internally inconsistent');
        } else if (report.overlapIds.length + report.productionOnlyIds.length !== report.productionSelectedCount) {
            fail('overlap + production-only does not reconstruct productionSelectedCount');
        } else if (report.overlapIds.length + report.shadowOnlyIds.length !== report.shadowSelectedCount) {
            fail('overlap + shadow-only does not reconstruct shadowSelectedCount');
        } else {
            ok('overlap / production-only / shadow-only form a complete, non-overlapping partition');
        }

        const expectedProdTokens = enabled.selectedSpecs.reduce((sum, spec) => sum + estimateTokens(spec.text), 0);
        const expectedShadowTokens = baseline.selectedSpecs
            .filter((spec) => report.overlapIds.includes(spec.id) || report.shadowOnlyIds.includes(spec.id))
            .reduce((sum, spec) => sum + estimateTokens(spec.text), 0);
        if (report.productionTokenEstimate !== expectedProdTokens) {
            fail(`productionTokenEstimate mismatch: report=${report.productionTokenEstimate} expected=${expectedProdTokens}`);
        } else if (report.shadowTokenEstimate <= 0) {
            fail('shadowTokenEstimate must be derived from actual selected shadow items, not a fake empty success');
        } else {
            ok('token estimates are derived from actual compared selections');
        }
    }

    const failing = buildProductionPromptAssemblyWithShadowAllocatorForTests(
        'look around',
        'grok',
        () => { throw new Error('shadow boom'); }
    );
    if (failing.promptText !== baseline.promptText || failing.receipt.assemblyDigest !== baseline.receipt.assemblyDigest) {
        fail('shadow failure altered production payload or receipt');
    } else if (!failing.shadowReport || failing.shadowReport.status !== 'failed') {
        fail(`failed shadow evaluation must be reported explicitly as failure: ${JSON.stringify(failing.shadowReport)}`);
    } else if (!String(failing.shadowReport.failureMessage || '').includes('shadow boom')) {
        fail(`failed shadow evaluation must retain the thrown message: ${JSON.stringify(failing.shadowReport)}`);
    } else {
        ok('shadow failure cannot block production and is explicitly reported as failure');
    }

    const radicallyDivergent = buildProductionPromptAssemblyWithShadowAllocatorForTests(
        'look around',
        'grok',
        (categories) => categories.map((category, idx) => ({
            categoryId: category.categoryId,
            allocatedTokens: category.candidates.length ? 1 : 0,
            items: category.candidates.length && idx % 2 === 0
                ? [{
                    id: category.candidates[0].id,
                    lod: 0,
                    text: '',
                    tokenCost: 1,
                }]
                : [],
        }))
    );
    if (assertProductionUnchanged(radicallyDivergent, baseline, 'divergent allocator')) {
        ok('radically divergent valid allocator leaves production IDs / payload / digest unchanged');
    }
    if (!radicallyDivergent.shadowReport || radicallyDivergent.shadowReport.status !== 'ok') {
        fail(`radically divergent valid allocator should still produce a valid success report: ${JSON.stringify(radicallyDivergent.shadowReport)}`);
    }

    const emptyTopLevel = buildProductionPromptAssemblyWithShadowAllocatorForTests(
        'look around',
        'grok',
        () => []
    );
    if (assertProductionUnchanged(emptyTopLevel, baseline, 'empty top-level allocator')) {
        ok('empty top-level allocator leaves production unchanged');
    }
    if (!emptyTopLevel.shadowReport || emptyTopLevel.shadowReport.status !== 'failed') {
        fail(`empty top-level allocator must produce explicit failed report: ${JSON.stringify(emptyTopLevel.shadowReport)}`);
    } else if (!String(emptyTopLevel.shadowReport.failureMessage || '').trim()) {
        fail('empty top-level allocator failed report must include non-empty failureMessage');
    } else if (!Object.isFrozen(emptyTopLevel.shadowReport)) {
        fail('empty top-level allocator failed report must be frozen');
    } else {
        ok('empty top-level allocator returns frozen failed report with failureMessage');
    }

    const invalidTopLevel = buildProductionPromptAssemblyWithShadowAllocatorForTests(
        'look around',
        'grok',
        () => ({ nope: true })
    );
    if (assertProductionUnchanged(invalidTopLevel, baseline, 'invalid top-level allocator')) {
        ok('invalid top-level allocator leaves production unchanged');
    }
    if (!invalidTopLevel.shadowReport || invalidTopLevel.shadowReport.status !== 'failed') {
        fail(`invalid top-level allocator must produce explicit failed report: ${JSON.stringify(invalidTopLevel.shadowReport)}`);
    } else if (!String(invalidTopLevel.shadowReport.failureMessage || '').trim()) {
        fail('invalid top-level allocator failed report must include non-empty failureMessage');
    } else {
        ok('invalid top-level allocator produces explicit failed report');
    }

    const validZeroSelection = buildProductionPromptAssemblyWithShadowAllocatorForTests(
        'look around',
        'grok',
        (categories) => categories.map((category) => ({
            categoryId: category.categoryId,
            allocatedTokens: 0,
            items: [],
        }))
    );
    if (assertProductionUnchanged(validZeroSelection, baseline, 'valid zero-selection allocator')) {
        ok('valid zero-selection allocator leaves production unchanged');
    }
    if (!validZeroSelection.shadowReport || validZeroSelection.shadowReport.status !== 'ok') {
        fail(`valid zero-selection allocator must remain successful if category results are valid: ${JSON.stringify(validZeroSelection.shadowReport)}`);
    } else if (validZeroSelection.shadowReport.shadowSelectedCount !== 0) {
        fail(`valid zero-selection allocator should report zero selected items: ${JSON.stringify(validZeroSelection.shadowReport)}`);
    } else {
        ok('valid allocator output with zero selected items remains a valid success');
    }

    const syntheticCandidatesA = [
        { id: 'worldState', text: 'world state chunk', priority: 8 },
        { id: 'memory', text: 'memory chunk', priority: 10 },
        { id: 'lorebook', text: 'lore chunk', priority: 7 },
    ];
    const syntheticProductionA = [syntheticCandidatesA[0], syntheticCandidatesA[2]];
    const syntheticCandidatesB = [
        syntheticCandidatesA[2],
        syntheticCandidatesA[1],
        syntheticCandidatesA[0],
    ];
    const syntheticProductionB = [syntheticCandidatesB[2], syntheticCandidatesB[0]];
    const reportA = buildCategoryBudgetShadowReportForTests(syntheticCandidatesA, syntheticProductionA, 120);
    const reportB = buildCategoryBudgetShadowReportForTests(syntheticCandidatesB, syntheticProductionB, 120);
    if (JSON.stringify(normalizeReportIds(reportA)) !== JSON.stringify(normalizeReportIds(reportB))) {
        fail(`shadow comparison must key by stable chunk IDs, not array position: A=${JSON.stringify(normalizeReportIds(reportA))} B=${JSON.stringify(normalizeReportIds(reportB))}`);
    } else {
        ok('comparison uses stable IDs instead of array-position identity');
    }

    const breakdown1 = buildGmPromptBreakdown('look around');
    const shadowSnapshot1 = JSON.stringify(breakdown1.shadowReport || null);
    const breakdown2 = buildGmPromptBreakdown('look around');
    if (JSON.stringify(breakdown2.shadowReport || null) !== shadowSnapshot1) {
        fail('repeated identical Inspector input changed the shadow report');
    } else {
        ok('repeated identical input yields identical shadow report');
    }

    const stateAfterInspector = readWorldState();
    if (stateAfterInspector.lastInjectedChronicleTurn !== before.lastInjectedChronicleTurn
        || stateAfterInspector.lastInjectedWorldChangeSummaryTurn !== before.lastInjectedWorldChangeSummaryTurn) {
        fail('Inspector read reintroduced rebuild/mutation side effects');
    } else {
        ok('Inspector read has no rebuild/mutation side effect');
    }

    fs.writeFileSync(gameRulesPath, JSON.stringify({
        enableEmergentSimulation: false,
        enableWorldObservatory: false,
    }, null, 2));
    const breakdown3 = buildGmPromptBreakdown('look around after rule change');
    const shadowSnapshot3 = JSON.stringify(breakdown3.shadowReport || null);
    if (shadowSnapshot3 === shadowSnapshot1) {
        fail('turn A and turn B reports should differ after input change in the fixture');
    } else if (JSON.stringify(breakdown1.shadowReport || null) !== shadowSnapshot1) {
        fail('earlier breakdown shadow report was overwritten by a later Inspector read');
    } else {
        ok('turn A report cannot be mistaken for turn B report');
    }
} finally {
    Module._load = originalLoad;
    fs.rmSync(WS_PATH, { recursive: true, force: true });
}

if (failed > 0) {
    console.error(`\n${failed} test(s) failed.`);
    process.exit(1);
}

console.log('\nAll prompt_budget_shadow_integration tests passed.');
