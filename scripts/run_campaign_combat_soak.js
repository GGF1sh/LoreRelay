#!/usr/bin/env node
'use strict';

/**
 * CAMPAIGN-COMBAT-SOAK-001 — story-combat spectator soak.
 *
 * Opt-in. NOT part of `npm test` (except the short unit script).
 * NO AI / Webview timers / ComfyUI / network.
 *
 *   node scripts/run_campaign_combat_soak.js --list
 *   node scripts/run_campaign_combat_soak.js --mode quick
 *   node scripts/run_campaign_combat_soak.js --scenario ccs_quick_story_spectator
 *
 * Requires compiled output: npm run compile
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const Module = require('module');

const ROOT = path.join(__dirname, '..');
const SCENARIO_DIR = process.env.CCS_SOAK_SCENARIO_DIR
    ? path.resolve(process.env.CCS_SOAK_SCENARIO_DIR)
    : path.join(__dirname, 'campaign_combat_soak_scenarios');
const DEFAULT_MODE = 'quick';

const corePath = path.join(ROOT, 'out', 'campaignCombatSoakCore.js');
if (!fs.existsSync(corePath)) {
    console.error('FAIL: out/campaignCombatSoakCore.js missing — run npm run compile');
    process.exit(1);
}

const core = require(corePath);
const {
    DEFAULT_CAMPAIGN_COMBAT_SOAK_TEMP_ROOT,
    CCS_RUN_MODES,
    evaluateCcsInvariants,
    filterCcsScenariosByRunMode,
    formatCcsRunId,
    isSafeQaTempDeletionTarget,
    parseCampaignCombatSoakScenario,
    summarizeCcsReport,
} = core;

function installVscodeStub() {
    const origLoad = Module._load;
    Module._load = function (request) {
        if (request === 'vscode') {
            return {
                window: { showErrorMessage() {}, showWarningMessage() {} },
                workspace: { workspaceFolders: [], getConfiguration: () => ({ get: (_k, fb) => fb }) },
                Uri: { file: (value) => ({ fsPath: value }) },
            };
        }
        return origLoad.apply(this, arguments);
    };
    return () => { Module._load = origLoad; };
}

function parseArgs(argv) {
    const args = { list: false, mode: DEFAULT_MODE, scenarioId: undefined, keepTemp: false };
    for (let i = 2; i < argv.length; i++) {
        const token = argv[i];
        if (token === '--list') args.list = true;
        else if (token === '--keep-temp') args.keepTemp = true;
        else if (token === '--mode') {
            const value = argv[++i];
            if (!CCS_RUN_MODES.includes(value)) throw new Error(`unsupported --mode ${value}`);
            args.mode = value;
        } else if (token === '--scenario') {
            args.scenarioId = argv[++i];
            if (!args.scenarioId) throw new Error('--scenario requires an id');
        } else {
            throw new Error(`unknown argument: ${token}`);
        }
    }
    return args;
}

function loadScenarios() {
    if (!fs.existsSync(SCENARIO_DIR)) return { scenarios: [], errors: [] };
    const scenarios = [];
    const errors = [];
    for (const name of fs.readdirSync(SCENARIO_DIR).filter((n) => n.endsWith('.json')).sort()) {
        const filePath = path.join(SCENARIO_DIR, name);
        let raw;
        try { raw = JSON.parse(fs.readFileSync(filePath, 'utf-8')); }
        catch (err) { errors.push({ filePath, errors: [`JSON parse failed: ${err.message}`] }); continue; }
        const parsed = parseCampaignCombatSoakScenario(raw);
        if (!parsed.ok) errors.push({ filePath, errors: parsed.errors });
        else scenarios.push(parsed.scenario);
    }
    return { scenarios, errors };
}

function removeDirectorySafe(targetPath, tempRoot) {
    if (!isSafeQaTempDeletionTarget(targetPath, tempRoot)) {
        throw new Error(`refusing to delete unsafe path: ${targetPath}`);
    }
    fs.rmSync(targetPath, { recursive: true, force: true });
}

function writeJson(filePath, obj) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, `${JSON.stringify(obj, null, 2)}\n`, 'utf-8');
}

function readJson(filePath) {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
}

function hpFromState(state) {
    const hp = state && state.status && state.status.hp ? state.status.hp : {};
    return {
        current: typeof hp.current === 'number' ? hp.current : NaN,
        max: typeof hp.max === 'number' ? hp.max : NaN,
    };
}

function runBattle(battle, limits, workspaceDir, mods) {
    writeJson(path.join(workspaceDir, 'game_state.json'), {
        status: {
            hp: { current: battle.startingHp, max: battle.maxHp },
            condition: [],
        },
        stateRevision: Math.max(1, battle.sourceCampaignRevision + 1),
        combatBattleHistory: [],
    });

    const host = new mods.CombatCommandPlaytestHost({
        clock: { now: () => 0, setTimer: () => 1, clearTimer: () => undefined },
    });
    const coordinator = new mods.CampaignCombatSessionCoordinator(
        host,
        () => workspaceDir,
        ROOT,
    );
    host.setSessionObserver(() => coordinator.observeHostSession());

    const parsedOps = mods.parseEncounterTurnOps([{
        op: 'start_combat',
        encounterId: `enc_${battle.id}`,
        fixtureId: battle.fixtureId,
        mode: 'spectator',
        reason: 'campaign combat soak',
    }]);
    if (!parsedOps.ok || parsedOps.ops.length !== 1) {
        return { ok: false, observation: baseObs(battle), error: parsedOps.error || 'op parse failed' };
    }
    const requestId = mods.encounterRequestId(`turn_${battle.seed}`, parsedOps.ops[0].encounterId);
    const built = mods.buildCampaignCombatRequestFromEncounterOp(
        parsedOps.ops[0],
        {
            campaignInstanceId: `camp_${battle.seed}`,
            timelineEpochId: `epoch_${battle.seed}`,
            acceptedTurnId: `turn_${battle.seed}`,
            sourceCampaignRevision: battle.sourceCampaignRevision,
        },
        requestId,
        battle.partyEntityIds,
        battle.protagonistEntityId,
    );
    if (!built.ok) {
        return { ok: false, observation: baseObs(battle), error: built.error };
    }
    const request = built.request;
    request.presentation = { ...(request.presentation || {}), openBattleView: false };

    const started = coordinator.startFromRequest(request, { autoRun: false });
    if (!started.ok) {
        return { ok: false, observation: baseObs(battle), error: started.error };
    }

    const startId = host.currentSession && host.currentSession.startId;
    let ticksAdvanced = 0;
    while (host.currentSession && !host.currentSession.state.outcome && ticksAdvanced < limits.maxTicks) {
        const batch = Math.min(limits.stepBatch, limits.maxTicks - ticksAdvanced);
        host.step(batch, startId);
        ticksAdvanced += batch;
        coordinator.observeHostSession();
    }
    coordinator.observeHostSession();

    const session = host.currentSession;
    const outcome = session && session.state && session.state.outcome;
    const commandEventCount = session && session.commandLog && Array.isArray(session.commandLog.events)
        ? session.commandLog.events.length
        : -1;
    const coordState = coordinator.getState();
    const pendingReceipts = mods.listPendingApplyEligibleReceipts(workspaceDir);
    const pendingBefore = pendingReceipts.length;

    const applyResults = mods.applyAllPendingCombatOutcomes(workspaceDir);
    const applyStatuses = applyResults.map((r) => r.status);
    const appliedOkCount = applyResults.filter((r) => r.ok).length;

    const stateAfter = readJson(path.join(workspaceDir, 'game_state.json'));
    const hp = hpFromState(stateAfter);
    const history = mods.listBattleHistory(stateAfter);
    const hashes = history.map((h) => h.receiptHash).filter(Boolean);
    const distinctReceiptHashes = new Set(hashes).size;

    let consequenceFirstAck;
    let consequenceRepeatAck;
    const last = history[history.length - 1];
    if (last && last.receiptHash && last.combatSessionId) {
        const applied = mods.readAppliedCombatOutcomeMarker(workspaceDir, last.combatSessionId);
        const fact = mods.tryBuildCombatConsequenceFact(last, applied);
        if (fact) {
            const sourceDigest = mods.sha256Stable(fact);
            const token = {
                combatSessionId: fact.combatSessionId,
                receiptHash: fact.receiptHash,
                sourceDigest,
            };
            consequenceFirstAck = mods.ackCombatConsequenceInjectedMarker(workspaceDir, token);
            consequenceRepeatAck = mods.ackCombatConsequenceInjectedMarker(workspaceDir, token);
        }
    }

    const reloadResults = pendingReceipts.map((receipt) => mods.applyCombatOutcomeReceiptOnce(workspaceDir, receipt));
    const reloadApplyStatuses = reloadResults.map((r) => r.status);

    if (typeof host.dispose === 'function') {
        host.dispose();
    } else {
        host.clear();
    }

    const observation = {
        battleId: battle.id,
        fixtureId: battle.fixtureId,
        seed: battle.seed,
        combatSessionId: coordState.combatSessionId,
        lifecycle: coordState.lifecycle,
        outcome: outcome || undefined,
        ticksAdvanced,
        commandEventCount,
        pendingBeforeApply: pendingBefore,
        appliedOkCount,
        applyStatuses,
        reloadApplyStatuses,
        historyLength: history.length,
        distinctReceiptHashes,
        hpBefore: battle.startingHp,
        hpAfter: hp.current,
        hpMax: hp.max,
        consequenceFirstAck,
        consequenceRepeatAck,
        simulationResultHash: last && last.simulationResultHash,
        terminalReached: Boolean(outcome),
    };
    return { ok: true, observation };
}

function baseObs(battle) {
    return {
        battleId: battle.id,
        fixtureId: battle.fixtureId,
        seed: battle.seed,
        ticksAdvanced: 0,
        commandEventCount: -1,
        pendingBeforeApply: 0,
        appliedOkCount: 0,
        applyStatuses: [],
        reloadApplyStatuses: [],
        historyLength: 0,
        distinctReceiptHashes: 0,
        hpBefore: battle.startingHp,
        hpAfter: battle.startingHp,
        hpMax: battle.maxHp,
        terminalReached: false,
    };
}

function runScenario(scenario, mode, options) {
    const restore = installVscodeStub();
    let mods;
    try {
        mods = {
            CombatCommandPlaytestHost: require(path.join(ROOT, 'out', 'combatCommandPlaytestHost.js')).CombatCommandPlaytestHost,
            CampaignCombatSessionCoordinator: require(path.join(ROOT, 'out', 'campaignCombatSessionCoordinator.js')).CampaignCombatSessionCoordinator,
            parseEncounterTurnOps: require(path.join(ROOT, 'out', 'combatEncounterTurnOpsCore.js')).parseEncounterTurnOps,
            buildCampaignCombatRequestFromEncounterOp: require(path.join(ROOT, 'out', 'combatEncounterTurnOpsCore.js')).buildCampaignCombatRequestFromEncounterOp,
            encounterRequestId: require(path.join(ROOT, 'out', 'combatEncounterTurnOpsCore.js')).encounterRequestId,
            applyAllPendingCombatOutcomes: require(path.join(ROOT, 'out', 'campaignCombatApplyHost.js')).applyAllPendingCombatOutcomes,
            applyCombatOutcomeReceiptOnce: require(path.join(ROOT, 'out', 'campaignCombatApplyHost.js')).applyCombatOutcomeReceiptOnce,
            listBattleHistory: require(path.join(ROOT, 'out', 'campaignCombatApplyCore.js')).listBattleHistory,
            listPendingApplyEligibleReceipts: require(path.join(ROOT, 'out', 'campaignCombatPendingStore.js')).listPendingApplyEligibleReceipts,
            readAppliedCombatOutcomeMarker: require(path.join(ROOT, 'out', 'campaignCombatPendingStore.js')).readAppliedCombatOutcomeMarker,
            ackCombatConsequenceInjectedMarker: require(path.join(ROOT, 'out', 'campaignCombatPendingStore.js')).ackCombatConsequenceInjectedMarker,
            tryBuildCombatConsequenceFact: require(path.join(ROOT, 'out', 'campaignCombatConsequenceCore.js')).tryBuildCombatConsequenceFact,
            sha256Stable: require(path.join(ROOT, 'out', 'campaignCombatReceiptCore.js')).sha256Stable,
        };
    } finally {
        restore();
    }

    const startedAt = new Date();
    const runId = formatCcsRunId(startedAt, crypto.randomBytes(3).toString('hex'));
    const tempRoot = path.resolve(ROOT, DEFAULT_CAMPAIGN_COMBAT_SOAK_TEMP_ROOT);
    const runDir = path.join(tempRoot, scenario.id, runId);
    fs.mkdirSync(runDir, { recursive: true });
    const t0 = Date.now();
    const warnings = [];
    const battles = [];
    let keepTemp = options.keepTemp;

    try {
        for (const battle of scenario.battles) {
            const workspaceDir = path.join(runDir, 'workspace', battle.id);
            fs.mkdirSync(workspaceDir, { recursive: true });
            const result = runBattle(battle, scenario.limits, workspaceDir, mods);
            const observation = result.observation;
            if (!result.ok) {
                warnings.push(`${battle.id}: ${result.error}`);
            }
            const invariantResults = evaluateCcsInvariants(scenario.invariants, observation);
            const ok = result.ok && invariantResults.every((r) => r.ok);
            battles.push({ observation, invariantResults, ok });
            if (!ok) keepTemp = true;
        }
    } catch (err) {
        warnings.push(err instanceof Error ? err.message : String(err));
        keepTemp = true;
    }

    const report = {
        schemaVersion: 1,
        scenarioId: scenario.id,
        mode,
        ok: battles.length === scenario.battles.length && battles.every((b) => b.ok) && warnings.length === 0,
        battles,
        runtimeMs: Date.now() - t0,
        warnings,
    };
    writeJson(path.join(runDir, 'report.json'), report);
    fs.writeFileSync(path.join(runDir, 'report.md'), `${summarizeCcsReport(report)}\n`, 'utf-8');

    if (!keepTemp && report.ok) {
        removeDirectorySafe(runDir, tempRoot);
        const scenarioDir = path.join(tempRoot, scenario.id);
        if (fs.existsSync(scenarioDir) && fs.readdirSync(scenarioDir).length === 0) {
            removeDirectorySafe(scenarioDir, tempRoot);
        }
    }
    return { report, runDir, keepTemp: keepTemp || !report.ok };
}

function main() {
    let args;
    try { args = parseArgs(process.argv); }
    catch (err) {
        console.error(`FAIL: ${err.message}`);
        process.exit(1);
    }
    const { scenarios, errors } = loadScenarios();
    if (errors.length) {
        for (const e of errors) console.error(`FAIL scenario ${e.filePath}: ${e.errors.join('; ')}`);
        process.exit(1);
    }
    if (args.list) {
        console.log('LoreRelay Campaign Combat Soak scenarios\n');
        for (const s of scenarios) {
            const modes = (s.modes && s.modes.length ? s.modes : [s.mode]).join('+');
            console.log(`  - ${s.id} [${modes}] battles=${s.battles.length} — ${s.description}`);
        }
        console.log(`\nTotal scenarios: ${scenarios.length}`);
        return;
    }
    const selected = args.scenarioId
        ? scenarios.filter((s) => s.id === args.scenarioId)
        : filterCcsScenariosByRunMode(scenarios, args.mode);
    if (args.scenarioId && selected.length === 0) {
        console.error(`FAIL: unknown scenario ${args.scenarioId}`);
        process.exit(1);
    }
    console.log('=== LoreRelay Campaign Combat Soak ===');
    console.log(`Mode: ${args.mode}`);
    console.log(`Scenarios: ${selected.map((s) => s.id).join(', ')}\n`);
    let failed = 0;
    for (const scenario of selected) {
        console.log(`--- [ccs] ${scenario.id} ---`);
        const { report, runDir, keepTemp } = runScenario(scenario, args.mode, args);
        if (report.ok) {
            console.log(`=> PASS ${scenario.id} — ${report.battles.length} battles, ${report.runtimeMs}ms`);
        } else {
            failed++;
            console.log(`=> FAIL ${scenario.id}`);
            for (const warning of report.warnings) console.log(`   ${warning}`);
            for (const battle of report.battles.filter((b) => !b.ok)) {
                const bad = battle.invariantResults.filter((r) => !r.ok).map((r) => r.id).join(',');
                console.log(`   ${battle.observation.battleId}: ${bad || battle.observation.lifecycle}`);
            }
        }
        if (keepTemp) console.log(`   kept temp: ${runDir}`);
    }
    console.log(`\n=== Campaign Combat Soak Summary ===\nPassed: ${selected.length - failed}/${selected.length}`);
    process.exit(failed ? 1 : 0);
}

if (require.main === module) {
    main();
}

module.exports = { runScenario, runBattle, parseArgs };
