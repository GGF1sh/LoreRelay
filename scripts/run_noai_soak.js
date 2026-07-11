#!/usr/bin/env node
'use strict';

/**
 * NOAI-SOAK-001 — deterministic long-horizon gameplay/engine runner.
 *
 * Opt-in developer/test facility. NOT part of `npm test`.
 * Runs deterministic scenarios for hundreds/thousands of turns with:
 *   NO AI, NO VS Code UI, NO Antigravity, NO ComfyUI, NO network, NO human input.
 *
 * Usage:
 *   node scripts/run_noai_soak.js --list
 *   node scripts/run_noai_soak.js --mode quick
 *   node scripts/run_noai_soak.js --mode full
 *   node scripts/run_noai_soak.js --mode benchmark --keep-temp
 *   node scripts/run_noai_soak.js --scenario noai_observe_300
 *
 * Requires compiled output: npm run compile
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
// Scenario directory is fixed by default; NOAI_SOAK_SCENARIO_DIR is a test-only
// override so focused unit tests can exercise pass/fail cleanup without polluting
// the shipped scenario set. It is never consulted for normal runs.
const SCENARIO_DIR = process.env.NOAI_SOAK_SCENARIO_DIR
    ? path.resolve(process.env.NOAI_SOAK_SCENARIO_DIR)
    : path.join(__dirname, 'noai_soak_scenarios');
const DEFAULT_MODE = 'quick';

const corePath = path.join(ROOT, 'out', 'noaiSoakRunnerCore.js');
if (!fs.existsSync(corePath)) {
    console.error('FAIL: out/noaiSoakRunnerCore.js missing — run npm run compile');
    process.exit(1);
}

const core = require(corePath);
const {
    DEFAULT_NOAI_SOAK_TEMP_ROOT,
    NOAI_SOAK_RUN_MODES,
    buildPlayerTradeEvent,
    createEmptyNoaiSoakReport,
    createSoakRng,
    createTelemetryAccumulator,
    decideTradeIntents,
    evaluateInvariants,
    filterNoaiSoakScenariosByRunMode,
    finalizeTelemetry,
    formatNoaiSoakReportMarkdown,
    formatNoaiSoakRunId,
    isSafeQaTempDeletionTarget,
    mergePlayerEventsIntoRecentChanges,
    observeTurnState,
    parseNoaiSoakScenarioDocument,
    planNoaiSoakRunDirectories,
    recordAction,
    recordCadenceChunk,
    recordPlayerEventCategories,
    recordSimEvents,
    resolveRepoFixturePath,
} = core;

const {
    DETERMINISM_CANONICAL_FILES,
    DETERMINISM_PARSE_ERROR_SENTINEL,
    buildDeterminismSnapshot,
    compareDeterminismSnapshotStreams,
} = require(path.join(ROOT, 'out', 'determinismSpineCore.js'));

const hashCanonicalText = (text) => crypto.createHash('sha256').update(text, 'utf8').digest('hex');
const MAX_DETERMINISM_SNAPSHOTS = 25;

// ---------------------------------------------------------------------------
// Production core loading (vscode-shimmed, exactly like run_game_qa.js)
// ---------------------------------------------------------------------------

let executionModules;
function loadExecutionModules() {
    if (executionModules) {
        return executionModules;
    }
    const Module = require('module');
    const origRequire = Module.prototype.require;
    Module.prototype.require = function (id) {
        if (id === 'vscode') {
            return { window: { showErrorMessage() {}, showWarningMessage() {} } };
        }
        return origRequire.apply(this, arguments);
    };
    try {
        executionModules = {
            normalizeGameRules: require(path.join(ROOT, 'out', 'gameRulesCore.js')).normalizeGameRules,
            validateGameState: require(path.join(ROOT, 'out', 'validateGameState.js')).validateGameState,
            parseWorldStateWithWarnings: require(path.join(ROOT, 'out', 'worldStateCore.js')).parseWorldStateWithWarnings,
            parseWorldForge: require(path.join(ROOT, 'out', 'worldForgeCore.js')).parseWorldForge,
            runBulkWorldSimulation: require(path.join(ROOT, 'out', 'worldSimBulkCore.js')).runBulkWorldSimulation,
            parseNpcRegistry: require(path.join(ROOT, 'out', 'npcRegistry.js')).parseNpcRegistry,
            resolveCommerceForge: require(path.join(ROOT, 'out', 'livingWorldBridge.js')).resolveCommerceForge,
            initializeMarketState: require(path.join(ROOT, 'out', 'commerceCore.js')).initializeMarketState,
            applyTradeOp: require(path.join(ROOT, 'out', 'commerceCore.js')).applyTradeOp,
            tickMarketRecovery: require(path.join(ROOT, 'out', 'worldSimCommerceCore.js')).tickMarketRecovery,
        };
        return executionModules;
    } finally {
        Module.prototype.require = origRequire;
    }
}

// ---------------------------------------------------------------------------
// CLI / scenario loading
// ---------------------------------------------------------------------------

function parseArgs(argv) {
    const args = { list: false, mode: DEFAULT_MODE, scenarioId: undefined, keepTemp: false, noKeepFailed: false };
    for (let i = 2; i < argv.length; i++) {
        const token = argv[i];
        if (token === '--list') {
            args.list = true;
        } else if (token === '--keep-temp') {
            args.keepTemp = true;
        } else if (token === '--no-keep-failed') {
            args.noKeepFailed = true;
        } else if (token === '--mode') {
            const value = argv[++i];
            if (!NOAI_SOAK_RUN_MODES.includes(value)) {
                throw new Error(`unsupported --mode ${value}`);
            }
            args.mode = value;
        } else if (token === '--scenario') {
            args.scenarioId = argv[++i];
            if (!args.scenarioId) {
                throw new Error('--scenario requires an id');
            }
        } else {
            throw new Error(`unknown argument: ${token}`);
        }
    }
    return args;
}

function loadScenarioFiles() {
    if (!fs.existsSync(SCENARIO_DIR)) {
        return [];
    }
    return fs.readdirSync(SCENARIO_DIR)
        .filter((name) => name.endsWith('.json'))
        .sort()
        .map((name) => path.join(SCENARIO_DIR, name));
}

function loadAllScenarios() {
    const scenarios = [];
    const errors = [];
    for (const filePath of loadScenarioFiles()) {
        let raw;
        try {
            raw = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        } catch (err) {
            errors.push({ filePath, errors: [`JSON parse failed: ${err.message}`] });
            continue;
        }
        const parsed = parseNoaiSoakScenarioDocument(raw);
        if (!parsed.ok) {
            errors.push({ filePath, errors: parsed.errors });
            continue;
        }
        scenarios.push(parsed.scenario);
    }
    return { scenarios, errors };
}

function printScenarioList(scenarios) {
    console.log('LoreRelay NOAI Soak scenarios\n');
    for (const s of scenarios) {
        const modes = (s.modes && s.modes.length ? s.modes : [s.mode]).join('+');
        console.log(`  - ${s.id} [${modes}] policy=${s.policyId} turns=${s.horizon.turns} — ${s.description}`);
    }
    console.log(`\nTotal scenarios: ${scenarios.length}`);
}

// ---------------------------------------------------------------------------
// Filesystem helpers (safe temp root only)
// ---------------------------------------------------------------------------

function copyDirectoryRecursive(src, dest) {
    fs.mkdirSync(dest, { recursive: true });
    for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
        const srcPath = path.join(src, entry.name);
        const destPath = path.join(dest, entry.name);
        if (entry.isDirectory()) {
            copyDirectoryRecursive(srcPath, destPath);
        } else if (entry.isFile()) {
            fs.copyFileSync(srcPath, destPath);
        }
    }
}

function setupWorkspace(scenario, workspaceDir) {
    const source = scenario.workspace;
    fs.mkdirSync(workspaceDir, { recursive: true });
    if (source.source === 'empty') {
        return { ok: true };
    }
    if (source.source === 'sample') {
        const { resolveBundledSampleDir } = require(path.join(ROOT, 'out', 'scenarioPackCore.js'));
        const sampleDir = resolveBundledSampleDir(source.sampleId, ROOT);
        if (!sampleDir || !fs.existsSync(sampleDir)) {
            return { ok: false, error: `sample not found: ${source.sampleId}` };
        }
        copyDirectoryRecursive(sampleDir, workspaceDir);
        return { ok: true, sourcePath: sampleDir };
    }
    const fixturePath = resolveRepoFixturePath(ROOT, source.fixturePath);
    if (!fixturePath || !fs.existsSync(fixturePath)) {
        return { ok: false, error: `fixture not found or unsafe: ${source.fixturePath}` };
    }
    const stat = fs.statSync(fixturePath);
    if (stat.isDirectory()) {
        copyDirectoryRecursive(fixturePath, workspaceDir);
    } else {
        return { ok: false, error: `fixture must be a directory: ${source.fixturePath}` };
    }
    return { ok: true, sourcePath: fixturePath };
}

function removeDirectorySafe(targetPath, tempRoot) {
    if (!isSafeQaTempDeletionTarget(targetPath, tempRoot)) {
        throw new Error(`refusing to delete unsafe path: ${targetPath}`);
    }
    fs.rmSync(targetPath, { recursive: true, force: true });
}

function readJsonRaw(filePath) {
    if (!fs.existsSync(filePath)) {
        return { exists: false };
    }
    try {
        return { exists: true, data: JSON.parse(fs.readFileSync(filePath, 'utf-8')) };
    } catch (err) {
        return { exists: true, parseError: err.message };
    }
}

function writeJson(filePath, obj) {
    fs.writeFileSync(filePath, `${JSON.stringify(obj, null, 2)}\n`, 'utf-8');
}

function collectFileByteMetrics(workspaceDir) {
    const metrics = {};
    for (const name of DETERMINISM_CANONICAL_FILES) {
        const filePath = path.join(workspaceDir, name);
        if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
            metrics[name] = fs.statSync(filePath).size;
        }
    }
    return metrics;
}

function collectCanonicalFileInputs(workspaceDir) {
    const inputsByPath = {};
    for (const fileName of DETERMINISM_CANONICAL_FILES) {
        const filePath = path.join(workspaceDir, fileName);
        if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
            inputsByPath[fileName] = { path: fileName, exists: false };
            continue;
        }
        const bytes = fs.statSync(filePath).size;
        try {
            const parsed = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
            inputsByPath[fileName] = { path: fileName, exists: true, bytes, parsed };
        } catch {
            inputsByPath[fileName] = { path: fileName, exists: true, bytes, parseError: DETERMINISM_PARSE_ERROR_SENTINEL };
        }
    }
    return inputsByPath;
}

function captureSnapshot(workspaceDir, label, worldTurn) {
    return buildDeterminismSnapshot({
        label,
        worldTurn,
        inputsByPath: collectCanonicalFileInputs(workspaceDir),
        hashText: hashCanonicalText,
    });
}

function cargoUnitCount(cargo) {
    return (cargo || []).reduce((sum, c) => sum + (c.qty || 0), 0);
}

function writeReports(plan, report) {
    fs.mkdirSync(plan.runDir, { recursive: true });
    writeJson(plan.reportJsonPath, report);
    fs.writeFileSync(plan.reportMdPath, `${formatNoaiSoakReportMarkdown(report)}\n`, 'utf-8');
}

// ---------------------------------------------------------------------------
// Scenario execution
// ---------------------------------------------------------------------------

function runScenario(scenario, mode, options) {
    const mods = loadExecutionModules();
    const startedAt = new Date();
    const runId = formatNoaiSoakRunId(startedAt, crypto.randomBytes(3).toString('hex'));
    const plan = planNoaiSoakRunDirectories(ROOT, scenario.id, runId, DEFAULT_NOAI_SOAK_TEMP_ROOT, path.join, path.resolve);
    const report = createEmptyNoaiSoakReport(runId, scenario, mode, startedAt.toISOString());

    let keepTemp = options.keepTemp;
    const snapshots = [];
    const actionHasher = crypto.createHash('sha256');
    const t0 = Date.now();

    try {
        const setup = setupWorkspace(scenario, plan.workspaceDir);
        if (!setup.ok) {
            report.failureClass = 'setup_failed';
            report.warnings.push(setup.error);
            keepTemp = true;
            finishReport(report, t0, 0);
            persistAndMaybeClean(plan, report, keepTemp, options);
            return { report, plan, keepTemp, snapshots, actionStreamHash: actionHasher.digest('hex') };
        }

        const ws = plan.workspaceDir;
        const rulesRead = readJsonRaw(path.join(ws, 'game_rules.json'));
        const rules = mods.normalizeGameRules(rulesRead.exists && !rulesRead.parseError ? rulesRead.data : undefined);

        const forgeRead = readJsonRaw(path.join(ws, 'world_forge.json'));
        const stateRead = readJsonRaw(path.join(ws, 'world_state.json'));
        if (!forgeRead.exists || forgeRead.parseError || !stateRead.exists || stateRead.parseError) {
            report.failureClass = 'setup_failed';
            report.warnings.push('world_forge.json / world_state.json missing or invalid');
            keepTemp = true;
            finishReport(report, t0, 0);
            persistAndMaybeClean(plan, report, keepTemp, options);
            return { report, plan, keepTemp, snapshots, actionStreamHash: actionHasher.digest('hex') };
        }

        const forge = mods.parseWorldForge(forgeRead.data);
        const parsedState = mods.parseWorldStateWithWarnings(stateRead.data);
        if (!forge || !parsedState.state) {
            report.failureClass = 'setup_failed';
            report.warnings.push('world forge/state failed structural validation');
            keepTemp = true;
            finishReport(report, t0, 0);
            persistAndMaybeClean(plan, report, keepTemp, options);
            return { report, plan, keepTemp, snapshots, actionStreamHash: actionHasher.digest('hex') };
        }
        let worldState = parsedState.state;

        // Commerce forge (pure adapter) + market holder (managed outside the sim).
        const commerceForge = mods.resolveCommerceForge(forge, forgeRead.data);
        const commerceActive = scenario.policyId !== 'observe_only' && rules.enableCommerce === true && !!commerceForge;
        const marketHolder = {
            markets: (worldState.markets && Object.keys(worldState.markets).length)
                ? worldState.markets
                : (commerceForge ? mods.initializeMarketState(commerceForge) : {}),
        };

        // Player commerce state from game_state.json.
        const gameStateRead = readJsonRaw(path.join(ws, 'game_state.json'));
        const gameStateDoc = gameStateRead.exists && !gameStateRead.parseError ? gameStateRead.data : undefined;
        let commerce = commerceActive && gameStateDoc && gameStateDoc.commerce
            ? {
                credits: Number(gameStateDoc.commerce.credits) || 0,
                cargo: Array.isArray(gameStateDoc.commerce.cargo) ? gameStateDoc.commerce.cargo.map((c) => ({ ...c })) : [],
                transportId: gameStateDoc.commerce.transportId || (commerceForge && commerceForge.transportKinds[0] && commerceForge.transportKinds[0].id) || '',
                food: gameStateDoc.commerce.food,
                playerRole: gameStateDoc.commerce.playerRole,
            }
            : undefined;

        const registryRead = scenario.worldSim.enableNpcRegistry ? readJsonRaw(path.join(ws, 'npc_registry.json')) : { exists: false };
        let registry = registryRead.exists && !registryRead.parseError ? mods.parseNpcRegistry(registryRead.data) : undefined;

        const rng = createSoakRng(scenario.seed);
        const startWorldTurn = worldState.worldTurn || 0;
        const acc = createTelemetryAccumulator(scenario.telemetry, startWorldTurn);

        const persistState = () => {
            if (gameStateDoc) {
                if (commerce) {
                    gameStateDoc.commerce = {
                        credits: commerce.credits,
                        cargo: commerce.cargo,
                        transportId: commerce.transportId,
                        ...(commerce.food !== undefined ? { food: commerce.food } : {}),
                        ...(commerce.playerRole !== undefined ? { playerRole: commerce.playerRole } : {}),
                    };
                }
                writeJson(path.join(ws, 'game_state.json'), gameStateDoc);
            }
            worldState.markets = marketHolder.markets;
            writeJson(path.join(ws, 'world_state.json'), worldState);
            if (registry && scenario.worldSim.enableNpcRegistry) {
                writeJson(path.join(ws, 'npc_registry.json'), registry);
            }
        };

        // Initial persisted snapshot + hash.
        persistState();
        const initialSnap = captureSnapshot(ws, 'start', worldState.worldTurn || 0);
        snapshots.push(initialSnap);
        report.initialCanonicalHash = initialSnap.aggregateHash.value;
        let lastAggHash = initialSnap.aggregateHash.value;

        const limits = scenario.limits;
        const deadline = limits.timeoutMs ? t0 + limits.timeoutMs : undefined;
        let acceptedSeq = 0;
        let previousWorldTurn = worldState.worldTurn || 0;
        let firstFailure;
        let lastInvariantResults = [];

        const updateActionHash = (rec) => {
            actionHasher.update(JSON.stringify([
                rec.turn, rec.worldTurn, rec.type, rec.accepted,
                rec.rejectCode || '', rec.commodityId || '', rec.marketLocationId || '', rec.qty || 0, rec.eventId || '',
            ]));
        };

        for (let t = 1; t <= scenario.horizon.turns; t++) {
            if (deadline && Date.now() > deadline) {
                report.failureClass = 'timeout';
                firstFailure = { turn: t, detail: `scenario exceeded timeoutMs=${limits.timeoutMs}` };
                keepTemp = true;
                break;
            }

            // --- Player action phase ---
            if (scenario.policyId === 'observe_only' || !commerce) {
                const rec = { turn: t, worldTurn: worldState.worldTurn || 0, type: 'observe', accepted: true };
                recordAction(acc, rec);
                updateActionHash(rec);
            } else {
                const ctx = {
                    forge: commerceForge,
                    markets: marketHolder.markets,
                    commerce,
                    worldTurn: worldState.worldTurn || 0,
                    turnIndex: t,
                    rng,
                    maxOpsPerTurn: limits.maxOpsPerTurn,
                };
                const ops = decideTradeIntents(scenario.policyId, ctx);
                const playerEvents = [];
                if (ops.length === 0) {
                    const rec = { turn: t, worldTurn: worldState.worldTurn || 0, type: 'observe', accepted: true };
                    recordAction(acc, rec);
                    updateActionHash(rec);
                } else {
                    for (const op of ops) {
                        const res = mods.applyTradeOp(commerceForge, marketHolder.markets, commerce, op);
                        if (res.ok) {
                            marketHolder.markets = res.markets;
                            commerce = res.commerce;
                            acceptedSeq++;
                            const built = buildPlayerTradeEvent(worldState.worldTurn || 0, acceptedSeq, op, { accepted: true });
                            if (built.event) {
                                playerEvents.push(built.event);
                            }
                            const rec = {
                                turn: t, worldTurn: worldState.worldTurn || 0, type: op.op, accepted: true,
                                commodityId: op.commodityId, marketLocationId: op.marketLocationId, qty: op.qty,
                                eventId: built.event ? built.event.id : undefined,
                            };
                            recordAction(acc, rec);
                            updateActionHash(rec);
                        } else {
                            const rec = {
                                turn: t, worldTurn: worldState.worldTurn || 0, type: op.op, accepted: false,
                                rejectCode: res.error.code, commodityId: op.commodityId, marketLocationId: op.marketLocationId, qty: op.qty,
                            };
                            recordAction(acc, rec);
                            updateActionHash(rec);
                        }
                    }
                    if (playerEvents.length > 0) {
                        worldState.recentChanges = mergePlayerEventsIntoRecentChanges(
                            worldState.recentChanges || [], playerEvents, limits.maxRecentChanges);
                        recordPlayerEventCategories(acc, playerEvents);
                    }
                }
            }

            // --- World cadence phase ---
            if (t % scenario.worldSim.cadenceTurns === 0) {
                let chunkEvents = 0;
                const stepsPerCadence = scenario.worldSim.stepsPerCadence;
                const result = mods.runBulkWorldSimulation(forge, worldState, registry, {
                    steps: stepsPerCadence,
                    enableNpcRegistry: scenario.worldSim.enableNpcRegistry === true && !!registry,
                    maxSteps: Math.min(stepsPerCadence, limits.maxStepsPerChunk),
                    afterStep: (state, stepEvents) => {
                        recordSimEvents(acc, stepEvents);
                        chunkEvents += stepEvents.length;
                        if (commerceForge && marketHolder.markets && Object.keys(marketHolder.markets).length) {
                            const tick = mods.tickMarketRecovery(commerceForge, marketHolder.markets, {
                                worldTurn: state.worldTurn || 0,
                                recoveryPerTick: scenario.worldSim.recoveryPerTick,
                                stepEvents,
                            });
                            marketHolder.markets = tick.markets;
                        }
                        return state;
                    },
                });
                if (!result.ok) {
                    report.failureClass = 'crash_or_stall';
                    firstFailure = { turn: t, detail: `world simulation failed: ${result.reason}` };
                    keepTemp = true;
                    break;
                }
                worldState = result.state;
                if (result.registry) {
                    registry = result.registry;
                }

                persistState();
                const snap = captureSnapshot(ws, `turn_${t}`, worldState.worldTurn || 0);
                if (snapshots.length < MAX_DETERMINISM_SNAPSHOTS) {
                    snapshots.push(snap);
                }
                const canonicalChanged = snap.aggregateHash.value !== lastAggHash;
                lastAggHash = snap.aggregateHash.value;
                recordCadenceChunk(acc, chunkEvents, canonicalChanged);

                // Invariants at cadence boundary.
                const invCtx = buildInvariantContext(scenario, ws, worldState, marketHolder.markets, gameStateDoc, forgeRead.data, rulesRead, previousWorldTurn, stepsPerCadence, acc);
                lastInvariantResults = evaluateInvariants(scenario.invariants, invCtx);
                const failed = lastInvariantResults.find((r) => !r.ok);
                previousWorldTurn = worldState.worldTurn || 0;
                if (failed) {
                    report.failureClass = 'invariant_failed';
                    firstFailure = { turn: t, invariantId: failed.id, detail: failed.detail || 'invariant failed' };
                    keepTemp = true;
                    break;
                }
            }

            observeTurnState(acc, {
                turn: t,
                worldTurn: worldState.worldTurn || 0,
                credits: commerce ? commerce.credits : 0,
                cargoUnits: commerce ? cargoUnitCount(commerce.cargo) : 0,
                markets: marketHolder.markets,
                recentChangesLen: Array.isArray(worldState.recentChanges) ? worldState.recentChanges.length : 0,
            });
        }

        // Final persist + snapshot + invariants.
        persistState();
        const finalSnap = captureSnapshot(ws, 'finish', worldState.worldTurn || 0);
        if (snapshots.length < MAX_DETERMINISM_SNAPSHOTS) {
            snapshots.push(finalSnap);
        } else {
            snapshots[snapshots.length - 1] = finalSnap;
        }
        report.finalCanonicalHash = finalSnap.aggregateHash.value;

        const finalInvCtx = buildInvariantContext(scenario, ws, worldState, marketHolder.markets, gameStateDoc, forgeRead.data, rulesRead, worldState.worldTurn || 0, 0, acc);
        const finalInv = evaluateInvariants(scenario.invariants, finalInvCtx);
        // Merge: keep the cadence failure if present, otherwise use the final evaluation.
        report.invariantResults = firstFailure && firstFailure.invariantId ? lastInvariantResults : finalInv;
        report.failedInvariants = report.invariantResults.filter((r) => !r.ok).map((r) => r.id);
        if (!firstFailure) {
            const finalFailed = finalInv.find((r) => !r.ok);
            if (finalFailed) {
                report.failureClass = 'invariant_failed';
                firstFailure = { turn: scenario.horizon.turns, invariantId: finalFailed.id, detail: finalFailed.detail || 'invariant failed' };
                keepTemp = true;
            }
        }

        report.telemetry = finalizeTelemetry(acc);
        report.fileBytes = collectFileByteMetrics(ws);
        if (firstFailure) {
            report.firstFailure = firstFailure;
        }
        finishReport(report, t0, acc.turnsCompleted);

        // Performance budget (benchmark).
        if (report.ok && limits.performanceBudgetMs && report.runtimeMs > limits.performanceBudgetMs) {
            report.ok = false;
            report.failureClass = 'performance_budget_exceeded';
            report.warnings.push(`runtime ${report.runtimeMs}ms exceeded performanceBudgetMs ${limits.performanceBudgetMs}`);
            keepTemp = true;
        }
    } catch (err) {
        report.failureClass = 'internal_error';
        report.warnings.push(err instanceof Error ? `${err.message}\n${err.stack}` : String(err));
        report.firstFailure = { turn: report.turnsCompleted, detail: err instanceof Error ? err.message : String(err) };
        finishReport(report, t0, report.turnsCompleted);
        keepTemp = true;
    }

    persistAndMaybeClean(plan, report, keepTemp, options);
    return { report, plan, keepTemp: keepTemp || !report.ok, snapshots, actionStreamHash: actionHasher.digest('hex') };
}

function buildInvariantContext(scenario, ws, worldState, markets, gameStateDoc, forgeRawDoc, rulesRead, previousWorldTurn, expectedDelta, acc) {
    const canonicalDocs = {};
    if (gameStateDoc) {
        canonicalDocs['game_state.json'] = gameStateDoc;
    }
    const worldStateForCheck = { ...worldState, markets };
    canonicalDocs['world_state.json'] = worldStateForCheck;
    canonicalDocs['world_forge.json'] = forgeRawDoc;
    if (rulesRead.exists && !rulesRead.parseError) {
        canonicalDocs['game_rules.json'] = rulesRead.data;
    }
    return {
        canonicalDocs,
        parseErrors: [],
        markets,
        recentChangesLen: Array.isArray(worldState.recentChanges) ? worldState.recentChanges.length : 0,
        worldTurn: worldState.worldTurn || 0,
        previousWorldTurn,
        expectedWorldTurnDelta: expectedDelta,
        telemetry: acc,
        limits: scenario.limits,
        fileBytes: collectFileByteMetrics(ws),
    };
}

function finishReport(report, t0, turnsCompleted) {
    const runtimeMs = Date.now() - t0;
    report.finishedAt = new Date().toISOString();
    report.runtimeMs = runtimeMs;
    report.turnsCompleted = turnsCompleted;
    report.turnsPerSecond = runtimeMs > 0 ? (turnsCompleted / (runtimeMs / 1000)) : 0;
    if (report.failureClass === undefined) {
        report.ok = true;
    } else {
        report.ok = false;
    }
}

function persistAndMaybeClean(plan, report, keepTemp, options) {
    if (!report.ok) {
        keepTemp = true;
    }
    writeReports(plan, report);
    if (!keepTemp) {
        try {
            if (fs.existsSync(plan.runDir)) {
                removeDirectorySafe(plan.runDir, plan.tempRoot);
            }
        } catch (err) {
            console.error(`WARN: failed to delete temp run dir: ${err.message}`);
        }
    }
    if (!report.ok && options.noKeepFailed) {
        try {
            if (fs.existsSync(plan.runDir)) {
                removeDirectorySafe(plan.runDir, plan.tempRoot);
            }
        } catch (err) {
            console.error(`WARN: failed to delete failed temp run dir: ${err.message}`);
        }
    }
}

// ---------------------------------------------------------------------------
// Determinism (two-run comparison)
// ---------------------------------------------------------------------------

function applyDeterminismComparison(baseline, repeat, scenario) {
    const canonical = compareDeterminismSnapshotStreams(baseline.snapshots, repeat.snapshots);
    const canonicalMatch = canonical.ok;
    const actionStreamMatch = baseline.actionStreamHash === repeat.actionStreamHash;

    const det = {
        enabled: true,
        compareRuns: 2,
        baselineRunId: baseline.report.runId,
        canonicalMatch,
        actionStreamMatch,
        snapshotCount: repeat.snapshots.length,
    };
    if (!canonicalMatch) {
        const d = canonical;
        const fileDiff = d.fileDiffs && d.fileDiffs[0] ? ` firstFile=${d.fileDiffs[0].path}` : '';
        det.firstDifference = {
            kind: 'canonical',
            detail: `snapshot#${d.firstDifferentSnapshot.index} (${d.firstDifferentSnapshot.label}) left=${d.firstDifferentSnapshot.leftHash.slice(0, 12)} right=${d.firstDifferentSnapshot.rightHash.slice(0, 12)}${fileDiff}`,
        };
    } else if (!actionStreamMatch) {
        det.firstDifference = {
            kind: 'action_stream',
            detail: `action-stream hash mismatch: ${baseline.actionStreamHash.slice(0, 12)} vs ${repeat.actionStreamHash.slice(0, 12)}`,
        };
    }

    repeat.report.determinism = det;
    if ((!canonicalMatch || !actionStreamMatch) && scenario.determinism.failOnDrift) {
        repeat.report.ok = false;
        repeat.report.failureClass = 'determinism_drift';
        repeat.keepTemp = true;
        baseline.keepTemp = true;
        writeReports(repeat.plan, repeat.report);
    } else {
        writeReports(repeat.plan, repeat.report);
    }
    return det;
}

// ---------------------------------------------------------------------------
// Reporting
// ---------------------------------------------------------------------------

function printScenarioSummary(result) {
    const r = result.report;
    const status = r.ok ? 'PASS' : 'FAIL';
    console.log(`=> ${status} ${r.scenarioId} — ${r.turnsCompleted}/${r.turnsRequested} turns, ${r.runtimeMs}ms (${r.turnsPerSecond.toFixed(1)} t/s)`);
    if (!r.ok) {
        if (r.failureClass) {
            console.log(`   failureClass: ${r.failureClass}`);
        }
        if (r.firstFailure) {
            console.log(`   first failure @ turn ${r.firstFailure.turn}${r.firstFailure.invariantId ? ` [${r.firstFailure.invariantId}]` : ''}: ${r.firstFailure.detail}`);
        }
        for (const w of r.warnings) {
            console.log(`   warning: ${w.split('\n')[0]}`);
        }
    }
    if (r.determinism && r.determinism.enabled) {
        console.log(`   determinism: canonical=${r.determinism.canonicalMatch} actionStream=${r.determinism.actionStreamMatch}`);
        if (r.determinism.firstDifference) {
            console.log(`   first difference (${r.determinism.firstDifference.kind}): ${r.determinism.firstDifference.detail}`);
        }
    }
    if (result.keepTemp && fs.existsSync(result.plan.runDir)) {
        console.log(`   kept temp: ${result.plan.runDir}`);
        console.log(`   report: ${result.plan.reportJsonPath}`);
    }
}

function main() {
    let args;
    try {
        args = parseArgs(process.argv);
    } catch (err) {
        console.error(`FAIL: ${err.message}`);
        process.exit(1);
    }

    const loaded = loadAllScenarios();
    if (loaded.errors.length > 0) {
        for (const item of loaded.errors) {
            console.error(`FAIL: invalid scenario ${path.basename(item.filePath)}`);
            for (const e of item.errors) {
                console.error(`  - ${e}`);
            }
        }
        process.exit(1);
    }

    if (args.list) {
        printScenarioList(loaded.scenarios);
        return;
    }

    let scenarios;
    if (args.scenarioId) {
        scenarios = loaded.scenarios.filter((s) => s.id === args.scenarioId);
        if (scenarios.length === 0) {
            console.error(`FAIL: scenario not found: ${args.scenarioId}`);
            process.exit(1);
        }
    } else {
        scenarios = filterNoaiSoakScenariosByRunMode(loaded.scenarios, args.mode);
    }
    if (scenarios.length === 0) {
        console.error(`FAIL: no scenarios registered for mode ${args.mode}`);
        process.exit(1);
    }

    console.log('=== LoreRelay NOAI Soak Runner ===');
    console.log(`Mode: ${args.mode}`);
    console.log(`Scenarios: ${scenarios.map((s) => s.id).join(', ')}`);

    const results = [];
    for (const scenario of scenarios) {
        console.log(`\n--- [noai-soak] ${scenario.id} ---`);
        const runOptions = { keepTemp: args.keepTemp, noKeepFailed: args.noKeepFailed };
        if (scenario.determinism && scenario.determinism.enabled && scenario.determinism.compareRuns >= 2) {
            const baseline = runScenario(scenario, args.mode, { ...runOptions, keepTemp: true });
            const repeat = runScenario(scenario, args.mode, { ...runOptions, keepTemp: true });
            applyDeterminismComparison(baseline, repeat, scenario);
            if (repeat.report.ok && !runOptions.keepTemp) {
                for (const run of [baseline, repeat]) {
                    try {
                        if (fs.existsSync(run.plan.runDir)) {
                            removeDirectorySafe(run.plan.runDir, run.plan.tempRoot);
                        }
                    } catch (err) {
                        console.error(`WARN: failed to delete temp run dir: ${err.message}`);
                    }
                }
                repeat.keepTemp = false;
            }
            printScenarioSummary(repeat);
            results.push(repeat);
        } else {
            const result = runScenario(scenario, args.mode, runOptions);
            printScenarioSummary(result);
            results.push(result);
        }
    }

    const passed = results.filter((r) => r.report.ok).length;
    const failed = results.length - passed;
    console.log('\n=== NOAI Soak Summary ===');
    console.log(`Passed: ${passed}/${results.length}`);
    if (failed > 0) {
        console.log('Failed:');
        for (const r of results.filter((x) => !x.report.ok)) {
            console.log(`  - ${r.report.scenarioId} (${r.report.failureClass})`);
        }
        process.exit(1);
    }
}

main();
