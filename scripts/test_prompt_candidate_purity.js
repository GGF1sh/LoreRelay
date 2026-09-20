#!/usr/bin/env node
'use strict';

/**
 * PROMPT-001A (Option C staging): verifies the explicit PURE candidate path used by
 * Inspector/Preview cannot advance Chronicle/World Change Summary durable markers or
 * clear chronicleSessionPending, while the explicit LEGACY production path preserves
 * current production consumption timing byte-for-byte.
 *
 * Covers the Task Packet's "Required Tests" for the staging implementation:
 *   - pure candidate path leaves both durable markers unchanged
 *   - repeated pure builds leave markers and chronicleSessionPending unchanged
 *   - Inspector/Preview isolation (buildGmPromptBreakdown is the payload builder
 *     behind postPromptContextToWebview)
 *   - production prompt output / marker parity with baseline
 *   - explicit-path structural check: no boolean/default authority switch,
 *     pure path is structurally unable to reach consume/mark/clear functions
 */

const os = require('os');
const fs = require('fs');
const path = require('path');
const Module = require('module');

const root = path.join(__dirname, '..');
const gmPromptBuilderPath = path.join(root, 'out', 'gmPromptBuilder.js');
const gmPromptBuilderSourcePath = path.join(root, 'src', 'gmPromptBuilder.ts');

let failed = 0;
function fail(msg) { console.error(`FAIL: ${msg}`); failed++; }
function ok(msg) { console.log(`OK: ${msg}`); }

if (!fs.existsSync(gmPromptBuilderPath)) {
    fail('out/gmPromptBuilder.js missing — run npm run compile first');
    process.exit(1);
}

// ---------------------------------------------------------------------------
// Section A — structural authority checks (source-text, matches the existing
// test_context_inspector_integration.js idiom for this same file).
// ---------------------------------------------------------------------------

const source = fs.readFileSync(gmPromptBuilderSourcePath, 'utf-8');

function extractFunctionBody(fnName) {
    const re = new RegExp(`function ${fnName}\\([\\s\\S]*?\\n\\}`, 'm');
    const m = source.match(re);
    return m ? m[0] : '';
}

function extractConstBody(constName) {
    const re = new RegExp(`const ${constName}[\\s\\S]*?\\n\\};`, 'm');
    const m = source.match(re);
    return m ? m[0] : '';
}

{
    if (!source.includes('buildGmPromptChunkSpecsWithMeta')) {
        fail('shared helper buildGmPromptChunkSpecsWithMeta must remain present (source-string compat)');
    } else {
        ok('shared helper identifier buildGmPromptChunkSpecsWithMeta preserved for compat');
    }
}

{
    // No boolean literal may be passed as an authority argument at any call site.
    const callSites = source.match(/buildGmPromptChunkSpecsWithMeta\([^)]*\)/g) || [];
    const booleanAuthorityCall = callSites.find((c) => /,\s*(true|false)\s*[,)]/.test(c));
    if (callSites.length === 0) {
        fail('expected at least one call to buildGmPromptChunkSpecsWithMeta');
    } else if (booleanAuthorityCall) {
        fail(`boolean/default authority argument found at call site: ${booleanAuthorityCall}`);
    } else {
        ok('no call site passes a boolean/default authority argument to buildGmPromptChunkSpecsWithMeta');
    }
}

{
    const pureBody = extractFunctionBody('buildPureCandidateSpecsWithMeta');
    const forbidden = [
        'consumeChronicleRecapContext',
        'consumeWorldChangeSummaryContext',
        'markChronicleInjected',
        'markWorldChangeSummaryInjected',
        'clearChronicleSessionPending',
    ];
    if (!pureBody) {
        fail('buildPureCandidateSpecsWithMeta not found');
    } else {
        const leaked = forbidden.filter((name) => pureBody.includes(name));
        if (leaked.length > 0) {
            fail(`buildPureCandidateSpecsWithMeta references forbidden consume/mark symbols: ${leaked.join(', ')}`);
        } else {
            ok('buildPureCandidateSpecsWithMeta is structurally unable to reach consume/mark/clear symbols');
        }
    }
}

{
    const pureBuilders = extractConstBody('PURE_CANDIDATE_CONSUMABLE_BUILDERS');
    const forbidden = ['consumeChronicleRecapContext', 'consumeWorldChangeSummaryContext'];
    const leaked = forbidden.filter((name) => pureBuilders.includes(name));
    if (!pureBuilders) {
        fail('PURE_CANDIDATE_CONSUMABLE_BUILDERS not found');
    } else if (leaked.length > 0) {
        fail(`PURE_CANDIDATE_CONSUMABLE_BUILDERS references consume symbols: ${leaked.join(', ')}`);
    } else if (!pureBuilders.includes('buildChronicleRecapCandidate') || !pureBuilders.includes('buildWorldChangeSummaryCandidateFromWorldState')) {
        fail('PURE_CANDIDATE_CONSUMABLE_BUILDERS must use pure candidate builders for both consumables');
    } else {
        ok('PURE_CANDIDATE_CONSUMABLE_BUILDERS wires only pure candidate builders');
    }
}

{
    const legacyBuilders = extractConstBody('LEGACY_PRODUCTION_CONSUMABLE_BUILDERS');
    if (!legacyBuilders) {
        fail('LEGACY_PRODUCTION_CONSUMABLE_BUILDERS not found');
    } else if (!legacyBuilders.includes('consumeChronicleRecapContext') || !legacyBuilders.includes('consumeWorldChangeSummaryContext')) {
        fail('LEGACY_PRODUCTION_CONSUMABLE_BUILDERS must use consume* builders for both consumables');
    } else {
        ok('LEGACY_PRODUCTION_CONSUMABLE_BUILDERS wires only consume* builders (legacy authority preserved)');
    }
}

{
    // Inspector call-site ownership: buildGmPromptBreakdown must use the single-pass
    // Inspector assembly and must not rebuild via the pure/legacy/shared helpers.
    const breakdownBody = extractFunctionBody('buildGmPromptBreakdown');
    if (!breakdownBody) {
        fail('buildGmPromptBreakdown not found');
    } else if (!breakdownBody.includes('buildInspectorPromptAssembly(')) {
        fail('buildGmPromptBreakdown (Inspector/Preview) must call buildInspectorPromptAssembly');
    } else if (
        breakdownBody.includes('buildPureCandidateSpecsWithMeta(')
        || breakdownBody.includes('buildLegacyProductionSpecsWithMeta(')
        || /buildGmPromptChunkSpecsWithMeta\(playerAction,\s*policy\)/.test(breakdownBody)
    ) {
        fail('buildGmPromptBreakdown must not call the pure path, legacy path, or shared helper directly');
    } else {
        ok('buildGmPromptBreakdown (Inspector/Preview) uses the Inspector-local single-pass assembly only');
    }
}

{
    const inspectorBody = extractFunctionBody('buildInspectorPromptAssembly');
    const required = [
        'readWorldStateSnapshotReadOnly',
        'buildPartyPromptContextReadOnly',
        'buildPartyDirectorPromptContextReadOnly',
        'buildChronicleRecapContextWithWorldState(false, policy, inspectorWorldState)',
        "buildWorldChangeSummaryCandidateFromWorldState(inspectorWorldState)?.text ?? ''",
    ];
    const forbidden = [
        'loadWorldState(',
        'getCharactersDir(',
        'getPartyIds(',
        'loadDynamicProfiles(',
        'loadCharacterById(',
    ];
    if (!inspectorBody) {
        fail('buildInspectorPromptAssembly not found');
    } else {
        const missing = required.filter((name) => !inspectorBody.includes(name));
        const leaked = forbidden.filter((name) => inspectorBody.includes(name));
        if (missing.length > 0) {
            fail(`buildInspectorPromptAssembly missing required read-only hooks: ${missing.join(', ')}`);
        } else if (leaked.length > 0) {
            fail(`buildInspectorPromptAssembly references mutating read paths: ${leaked.join(', ')}`);
        } else {
            ok('buildInspectorPromptAssembly uses explicit read-only APIs only');
        }
    }
}

{
    // Production call-site ownership: buildGmPromptContext must route through the
    // receipt-prep pure assembly and must not call the inspector builder or legacy path.
    const contextBody = extractFunctionBody('buildGmPromptContext');
    if (!contextBody) {
        fail('buildGmPromptContext not found');
    } else if (!contextBody.includes('buildProductionPromptAssembly(')) {
        fail('buildGmPromptContext (production) must call buildProductionPromptAssembly');
    } else if (contextBody.includes('buildContextInspectorReport')
        || contextBody.includes('buildLegacyProductionSpecs(')
        || contextBody.includes('evictPromptChunksByBudget')) {
        fail('buildGmPromptContext must not call inspector accounting, legacy production, or direct eviction');
    } else {
        ok('buildGmPromptContext (production) routes only through receipt-prep pure assembly');
    }
}

// ---------------------------------------------------------------------------
// Section B — behavioral checks against the compiled module with a mocked
// vscode host, proving the actual runtime effect (not just source shape).
// ---------------------------------------------------------------------------

const WS_PATH = fs.mkdtempSync(path.join(os.tmpdir(), 'lr-prompt-purity-'));

fs.writeFileSync(path.join(WS_PATH, 'game_rules.json'), JSON.stringify({
    enableEmergentSimulation: true,
    enableWorldObservatory: false,
}, null, 2));

// lastInjectedChronicleTurn is deliberately pre-set to the same value that the single
// state_journal.ndjson line below resolves to (sourceTurn = journalTurns.length = 1).
// With lastInjectedTurn === sourceTurn, shouldInjectChronicle(sourceTurn, lastInjected, pending)
// reduces to `pending` alone (the `lastInjectedTurn < sourceTurn` disjunct is false). This makes
// a second pure build's chronicle visibility a direct proof that chronicleSessionPending — which
// starts true at module load — was NOT cleared by the first pure build. (An unset
// lastInjectedChronicleTurn would let `-1 < sourceTurn` mask a wrongly-cleared pending on the
// second call, which is exactly the gap being closed here.)
fs.writeFileSync(path.join(WS_PATH, 'world_state.json'), JSON.stringify({
    worldTurn: 3,
    lastInjectedChronicleTurn: 1,
    recentChanges: [
        {
            id: 'wce_test_1',
            worldTurn: 3,
            source: 'simulation',
            category: 'faction',
            severity: 'warning',
            message: 'Test faction event for PROMPT-001A purity fixture',
        },
    ],
}, null, 2));

fs.writeFileSync(
    path.join(WS_PATH, 'state_journal.ndjson'),
    `${JSON.stringify({ turnId: 'turn_1', playerAction: 'Test action' })}\n`
);

const mockConfigStore = {
    'textAdventure.chronicle': { recapInPrompt: true },
    'textAdventure': { 'memory.backend': 'tfidf' },
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
        }),
        onDidChangeConfiguration: () => ({ dispose: () => {} }),
    },
    window: {
        createOutputChannel: () => ({ appendLine: () => {}, show: () => {}, dispose: () => {} }),
        showWarningMessage: () => {},
        showErrorMessage: () => {},
        setStatusBarMessage: () => {},
    },
    env: { language: 'en' },
    Uri: { file: (p) => ({ fsPath: p, toString: () => `file://${p}` }) },
};

const _origLoad = Module._load;
Module._load = function (request, parent, isMain) {
    if (request === 'vscode') {
        return mockVscode;
    }
    return _origLoad.apply(this, arguments);
};

let gmPromptBuilder;
try {
    gmPromptBuilder = require(gmPromptBuilderPath);
} catch (e) {
    Module._load = _origLoad;
    fail(`failed to load compiled gmPromptBuilder.js under vscode mock: ${e && e.stack || e}`);
    console.error(`\n${failed} test(s) failed.`);
    process.exit(1);
}

const { buildGmPromptBreakdown, buildGmPromptContext } = gmPromptBuilder;
const worldStatePath = path.join(WS_PATH, 'world_state.json');
const charactersDirPath = path.join(WS_PATH, 'characters');

function readWorldState() {
    return JSON.parse(fs.readFileSync(worldStatePath, 'utf-8'));
}

try {
    const before = readWorldState();
    if (before.lastInjectedWorldChangeSummaryTurn !== undefined) {
        fail('fixture setup invalid: worldChangeSummary marker should start unset');
    } else if (before.lastInjectedChronicleTurn !== 1) {
        fail(`fixture setup invalid: lastInjectedChronicleTurn should start at 1 (got ${JSON.stringify(before.lastInjectedChronicleTurn)})`);
    } else {
        ok('fixture starts with lastInjectedChronicleTurn === sourceTurn (1) and worldChangeSummary marker unset');
    }
    if (fs.existsSync(charactersDirPath)) {
        fail('fixture setup invalid: characters/ must not exist before Inspector read-only test');
    } else {
        ok('fixture starts without characters/ so Inspector lazy-init regressions are observable');
    }

    // --- pure candidate path (Inspector) must not advance durable markers ---
    const breakdown1 = buildGmPromptBreakdown('look around');
    const afterPure1 = readWorldState();
    if (afterPure1.lastInjectedWorldChangeSummaryTurn !== undefined) {
        fail('pure candidate path (buildGmPromptBreakdown) advanced lastInjectedWorldChangeSummaryTurn');
    } else if (afterPure1.lastInjectedChronicleTurn !== 1) {
        fail(`pure candidate path (buildGmPromptBreakdown) changed lastInjectedChronicleTurn (got ${JSON.stringify(afterPure1.lastInjectedChronicleTurn)})`);
    } else {
        ok('pure candidate path (buildGmPromptBreakdown) leaves durable markers unchanged');
    }
    if (fs.existsSync(charactersDirPath)) {
        fail('pure candidate path (buildGmPromptBreakdown) created characters/ via lazy-init regression');
    } else {
        ok('pure candidate path (buildGmPromptBreakdown) does not create characters/');
    }

    // Sanity: the pure path must actually have seen the consumables, otherwise the
    // marker-unchanged assertion above would be vacuously true (chunks inactive).
    const sections1 = breakdown1.sections || [];
    const worldChangesSection = sections1.find((s) => s.id === 'worldChangeSummary');
    const chronicleSection1 = sections1.find((s) => s.id === 'chronicle');
    if (!worldChangesSection || !worldChangesSection.text.includes('Since Last Visit')) {
        fail('fixture invalid: worldChangeSummary section absent from pure breakdown (purity test would be vacuous)');
    } else {
        ok('pure breakdown includes worldChangeSummary content (purity test is not vacuous)');
    }
    if (!chronicleSection1 || !chronicleSection1.text.includes('[Previously]')) {
        fail('fixture invalid: chronicle section absent from pure breakdown (purity test would be vacuous)');
    } else {
        ok('pure breakdown includes chronicle content (purity test is not vacuous)');
    }
    {
        const inspectorItems1 = breakdown1.contextInspector?.items || [];
        let mismatch;
        for (const section of sections1) {
            const item = inspectorItems1.find((candidate) => candidate.id === section.id);
            if (!item) {
                mismatch = `contextInspector missing item for displayed section ${section.id}`;
                break;
            }
            if (item.originalChars !== section.charCount) {
                mismatch = `contextInspector originalChars mismatch for ${section.id}: section=${section.charCount}, inspector=${item.originalChars}`;
                break;
            }
        }
        if (mismatch) {
            fail(mismatch);
        } else {
            ok('display sections and contextInspector accounting share the same section text lengths');
        }
    }

    // --- repeated pure builds must leave markers and chronicleSessionPending unchanged ---
    // With lastInjectedChronicleTurn === sourceTurn (1) in the fixture, shouldInjectChronicle's
    // `lastInjectedTurn < sourceTurn` disjunct is false, so this second call's chronicle
    // visibility depends entirely on chronicleSessionPending still being true. If the first pure
    // build had wrongly cleared it, this second call would see no chronicle section at all —
    // making its presence a direct proof of pending isolation, not just an unchanged marker value.
    const breakdown2 = buildGmPromptBreakdown('look around again');
    const afterPure2 = readWorldState();
    if (afterPure2.lastInjectedWorldChangeSummaryTurn !== undefined) {
        fail('repeated pure candidate builds advanced lastInjectedWorldChangeSummaryTurn');
    } else if (afterPure2.lastInjectedChronicleTurn !== 1) {
        fail(`repeated pure candidate builds changed lastInjectedChronicleTurn (got ${JSON.stringify(afterPure2.lastInjectedChronicleTurn)})`);
    } else {
        ok('repeated pure candidate builds leave durable markers unchanged');
    }
    const chronicleSection2 = (breakdown2.sections || []).find((s) => s.id === 'chronicle');
    if (!chronicleSection2 || !chronicleSection2.text.includes('[Previously]')) {
        fail('second pure build lost chronicle content — with lastInjectedChronicleTurn already === sourceTurn, this proves chronicleSessionPending was cleared by the first pure build (regression)');
    } else {
        ok('second pure build still surfaces chronicle content despite lastInjectedChronicleTurn === sourceTurn — direct proof chronicleSessionPending was not cleared by the pure path');
    }

    if (JSON.stringify(breakdown1.contextInspector || null) !== JSON.stringify(breakdown2.contextInspector || null)) {
        fail('repeated pure candidate builds changed contextInspector accounting despite identical read-only fixture');
    } else {
        ok('repeated pure candidate builds produce stable contextInspector accounting');
    }

    // --- Inspector/Preview isolation: buildGmPromptBreakdown is the exact payload
    // builder behind postPromptContextToWebview, already exercised above. Assert
    // idempotence explicitly (no hidden one-time side effect on first call).
    const afterPure3 = readWorldState();
    if (afterPure3.lastInjectedWorldChangeSummaryTurn !== undefined || afterPure3.lastInjectedChronicleTurn !== 1) {
        fail('Inspector/Preview payload builder advanced durable markers across repeated calls');
    } else {
        ok('Inspector/Preview payload builder (buildGmPromptBreakdown) is consumption-isolated across repeated calls');
    }

    // --- production path is now pure: it still surfaces eligible content but must not
    // consume Chronicle/WCS before Accepted correlation. ---
    const prodOutput1 = buildGmPromptContext('look around');
    const afterProd1 = readWorldState();
    if (afterProd1.lastInjectedWorldChangeSummaryTurn !== undefined) {
        fail('production pure path advanced lastInjectedWorldChangeSummaryTurn before Accepted');
    } else if (afterProd1.lastInjectedChronicleTurn !== 1) {
        fail(`production pure path changed lastInjectedChronicleTurn before Accepted (got ${JSON.stringify(afterProd1.lastInjectedChronicleTurn)})`);
    } else {
        ok('production pure path leaves durable markers unchanged before Accepted');
    }
    if (!prodOutput1.includes('Since Last Visit') || !prodOutput1.includes('[Previously]')) {
        fail('production pure prompt output missing expected worldChangeSummary/chronicle content');
    } else {
        ok('production pure prompt output contains expected worldChangeSummary/chronicle content');
    }

    // Repeated production builds remain side-effect free until Accepted.
    const prodOutput2 = buildGmPromptContext('look around once more');
    const afterProd2 = readWorldState();
    if (afterProd2.lastInjectedWorldChangeSummaryTurn !== undefined || afterProd2.lastInjectedChronicleTurn !== 1) {
        fail('second production pure build unexpectedly changed durable markers before Accepted');
    } else {
        ok('second production pure build leaves durable markers unchanged before Accepted');
    }
    if (!prodOutput2.includes('Since Last Visit') || !prodOutput2.includes('[Previously]')) {
        fail('second production pure build lost eligible worldChangeSummary/chronicle content before Accepted');
    } else {
        ok('second production pure build still surfaces eligible content before Accepted');
    }
} finally {
    Module._load = _origLoad;
    fs.rmSync(WS_PATH, { recursive: true, force: true });
}

if (failed > 0) {
    console.error(`\n${failed} test(s) failed.`);
    process.exit(1);
}
console.log('\nAll prompt_candidate_purity tests passed.');
