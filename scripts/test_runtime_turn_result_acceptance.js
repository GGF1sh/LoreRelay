#!/usr/bin/env node
'use strict';

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');
const { createVscodeStub } = require('./test_helpers/vscode_stub');

const root = path.join(__dirname, '..');
const outGameStateSync = path.join(root, 'out', 'gameStateSync.js');
const outStatePatch = path.join(root, 'out', 'statePatch.js');
const outTurnResultFallback = path.join(root, 'out', 'turnResultFallback.js');
const outAcceptedTurnReplayGuard = path.join(root, 'out', 'acceptedTurnReplayGuard.js');
const outAcceptedTurnReplayGuardCore = path.join(root, 'out', 'acceptedTurnReplayGuardCore.js');

let failed = 0;

function fail(msg) {
    console.error(`FAIL: ${msg}`);
    failed++;
}

function ok(msg) {
    console.log(`OK: ${msg}`);
}

function assert(condition, msg) {
    if (!condition) {
        fail(msg);
        return false;
    }
    ok(msg);
    return true;
}

function purgeModules(pathsToClear) {
    for (const target of pathsToClear) {
        try {
            delete require.cache[require.resolve(target)];
        } catch {
            // ignore
        }
    }
}

function withMockedRequire(mocks, fn) {
    const original = Module.prototype.require;
    Module.prototype.require = function patchedRequire(id) {
        if (Object.prototype.hasOwnProperty.call(mocks, id)) {
            return mocks[id];
        }
        return original.apply(this, arguments);
    };
    try {
        return fn();
    } finally {
        Module.prototype.require = original;
    }
}

function makeTempDir(prefix) {
    return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function writeJson(filePath, value) {
    fs.writeFileSync(filePath, JSON.stringify(value), 'utf8');
}

function seedReplayScope(tmpDir) {
    const runtimeDir = path.join(tmpDir, '.text-adventure', 'runtime');
    fs.mkdirSync(runtimeDir, { recursive: true });
    const now = new Date().toISOString();
    writeJson(path.join(runtimeDir, 'accepted_turn_scope.json'), {
        schemaVersion: 1,
        campaignInstanceId: crypto.randomUUID(),
        timelineEpochId: crypto.randomUUID(),
        createdAt: now,
        updatedAt: now,
    });
}

async function flushAsyncWork() {
    await Promise.resolve();
    await Promise.resolve();
}

function baseTurnResult(id = 'turn-2') {
    return {
        turnId: id,
        narration: `Narration for ${id}`,
        statePatch: [{ op: 'replace', path: '/mood', value: 'tense' }],
    };
}

function loadGameStateSyncHarness(options = {}) {
    purgeModules([outGameStateSync]);

    const tmpDir = options.tmpDir || makeTempDir('lr-runtime-002a-sync-');
    seedReplayScope(tmpDir);
    const turnResultPath = path.join(tmpDir, 'turn_result.json');
    const events = [];
    const postMessages = [];
    let processCalls = 0;
    let handledCount = 0;
    let callbackCount = 0;
    let mediaCount = 0;
    let autoImageCount = 0;
    let bootstrapCount = 0;
    let moduleRef;
    let hashGetter = () => '';
    const processResponses = Array.isArray(options.processResponses)
        ? [...options.processResponses]
        : [];
    const autoImageRequest = options.autoImageRequest ?? undefined;
    let pendingAcceptedCallback;

    const workspacePaths = {
        getActiveWorkspaceFolder: () => ({ uri: { fsPath: tmpDir } }),
        writeJsonAtomic(filePath, value) {
            fs.mkdirSync(path.dirname(filePath), { recursive: true });
            writeJson(filePath, value);
        },
        getGameStatePath: () => path.join(tmpDir, 'game_state.json'),
        getWorkspacePath: () => tmpDir,
        getHistoryPath: () => path.join(tmpDir, 'game_history.json'),
    };

    const mocks = {
        vscode: createVscodeStub({
            workspace: {
                getConfiguration: () => ({ get: () => undefined, update: async () => undefined }),
                workspaceFolders: [{ uri: { fsPath: tmpDir } }],
                createFileSystemWatcher: () => ({
                    onDidChange() {},
                    onDidCreate() {},
                    dispose() {},
                }),
                RelativePattern: function RelativePattern() {},
            },
            Uri: { file: (p) => ({ fsPath: p }) },
        }),
        './npcRegistry': {
            applyNpcMemoryUpdates() {},
            parseNpcMemoryUpdatesFromGameState() { return []; },
            loadNpcRegistry() { return { npcs: {} }; },
        },
        './gameRules': {
            loadGameRules() {
                return { enableNpcRegistry: false };
            },
        },
        './entryId': {
            isValidEntryId(id) { return typeof id === 'string' && id.length > 0; },
        },
        './validateGameState': { validateGameState() { return []; } },
        './gameStateSanitize': { salvageGameStateFromUnknown() { return undefined; } },
        './migrateGameState': {
            migrateGameState(state) { return { state, migrated: false, fromVersion: 2 }; },
            CURRENT_SCHEMA_VERSION: 2,
        },
        './workspacePaths': workspacePaths,
        './statePatch': {
            processTurnResult(turnResult) {
                processCalls++;
                events.push(`process:${turnResult.turnId}`);
                if (typeof options.onProcessTurnResult === 'function') {
                    options.onProcessTurnResult(turnResult);
                }
                if (processResponses.length > 0) {
                    return processResponses.shift();
                }
                return turnResult;
            },
            takeAutoLocationImageRequest() {
                return autoImageRequest;
            },
        },
        './turnResultFallback': {
            beginGmRun(onAcceptedTurn) {
                pendingAcceptedCallback = typeof onAcceptedTurn === 'function'
                    ? onAcceptedTurn
                    : undefined;
            },
            markTurnResultHandled() {
                handledCount++;
                const hashNow = hashGetter();
                events.push(hashNow ? `handled:${hashNow}` : 'handled:empty');
                const onAccepted = pendingAcceptedCallback;
                pendingAcceptedCallback = undefined;
                if (onAccepted) {
                    callbackCount++;
                    onAccepted();
                }
            },
        },
        './autoLocationImageRunner': {
            queueAutoLocationImageSilent(locationId, gmTurn) {
                autoImageCount++;
                events.push(`auto:${locationId}:${gmTurn}`);
            },
        },
        './mediaAgent': {
            handleGameStateMedia() {},
            handleTurnResultMedia(turnResult) {
                mediaCount++;
                events.push(`media:${turnResult.turnId}`);
            },
        },
        './remotePlayServer': { pushGameStateToRemoteClients() {} },
        './scenarioDirector': { pushScenarioDirectorToWebview() {} },
        './partyDirector': { pushPartyDirectorToWebview() {} },
        './worldView': { pushWorldViewToWebview() {} },
        './emergentSimulator': { maybeTickSimulation() {} },
        './mediaPaths': {
            isAllowedImagePath() { return true; },
            toWebviewSafeMediaRef() { return undefined; },
        },
        './worldForge': { loadWorldForge() { return undefined; } },
        './worldState': {
            loadWorldState() { return undefined; },
            isWorldStateEnabled() { return false; },
        },
        './locationImageBuilder': { buildLocationImagePrompt() { return undefined; } },
        './locationImageTracker': {
            shouldAutoGenerateForLocation() { return false; },
            markLocationAutoGenerated() {},
        },
        './imageGenRunner': {
            enqueueImageGeneration() { return false; },
            getResolvedImageMode() { return 'location'; },
        },
        './stateManager': { commitGameState() { return { ok: true, action: 'write' }; } },
        './protagonistBootstrap': {
            scheduleProtagonistBootstrap(turnResult) {
                bootstrapCount++;
                events.push(`bootstrap:${turnResult.turnId}`);
            },
        },
        './npcWhereaboutsTrustCore': { readNpcPlayerTrust(value) { return value; } },
        './gameStateWebviewSanitize': {
            sanitizeGameStateForWebview(value) { return value; },
            sanitizeTurnResultForWebview(value) { return value; },
        },
    };

    moduleRef = withMockedRequire(mocks, () => require(outGameStateSync));
    hashGetter = () => moduleRef.getLastProcessedTurnHashForTests();
    moduleRef.resetTurnResultProcessingStateForTests();
    moduleRef.initGameStateSync({
        getPanel: () => ({
            webview: {
                postMessage(payload) {
                    postMessages.push(payload);
                    events.push(`ui:${payload.turnResult?.turnId ?? 'none'}`);
                },
            },
        }),
        getGameStatePath: workspacePaths.getGameStatePath,
        getWorkspacePath: workspacePaths.getWorkspacePath,
        getSkillDir: () => undefined,
        getHistoryPath: workspacePaths.getHistoryPath,
        processProfileUpdates() {},
        maybeSuggestArchive() {},
        appendGmBridgeLog() {},
    });

    return {
        tmpDir,
        turnResultPath,
        events,
        postMessages,
        get processCalls() { return processCalls; },
        get handledCount() { return handledCount; },
        get callbackCount() { return callbackCount; },
        get mediaCount() { return mediaCount; },
        get autoImageCount() { return autoImageCount; },
        get bootstrapCount() { return bootstrapCount; },
        getHash() { return moduleRef.getLastProcessedTurnHashForTests(); },
        beginPendingTurn(onAcceptedTurn) {
            pendingAcceptedCallback = typeof onAcceptedTurn === 'function'
                ? onAcceptedTurn
                : undefined;
        },
        async processFile(filePath = turnResultPath) {
            return moduleRef.processTurnResultFileAtForTests(filePath);
        },
    };
}

function makeStatePatchMocks(tempDir, options = {}) {
    const statePath = path.join(tempDir, 'game_state.json');
    writeJson(statePath, {
        schemaVersion: 2,
        entries: [],
        status: { hp: { current: 10, max: 10 }, mp: { current: 5, max: 5 } },
        options: ['Look'],
    });

    let commitCalls = 0;
    let ledgerCalls = 0;
    let lastCommitState;
    let lastCommitConfig;

    return {
        statePath,
        get commitCalls() { return commitCalls; },
        get ledgerCalls() { return ledgerCalls; },
        get lastCommitState() { return lastCommitState; },
        get lastCommitConfig() { return lastCommitConfig; },
        mocks: {
            vscode: createVscodeStub(),
            './worldForge': { isWorldForgeEnabled() { return false; }, loadWorldForge() { return undefined; } },
            './fogOfWarCore': {
                applyFogOnLocationVisit(world) { return world; },
                normalizeFogWorldState(world) { return world; },
            },
            './cartographyRevealCore': {
                applyCartographyReveal(world) { return { world }; },
                parseCartographyReveal() { return undefined; },
            },
            './autoLocationImageCore': {
                countGmTurns(entries) { return Array.isArray(entries) ? entries.length : 0; },
                isComfyUiConfigured() { return false; },
                normalizeAutoImageCooldownTurns(value) { return value ?? 0; },
                shouldTriggerAutoLocationImage() { return false; },
            },
            './imageGenConfig': { loadImageGenConfig() { return undefined; } },
            './entryId': { isValidEntryId(id) { return typeof id === 'string' && id.length > 0; } },
            './worldEventLogCore': { isValidEventId(id) { return typeof id === 'string' && id.length > 0; } },
            './workspacePaths': {
                getGameStatePath() { return statePath; },
                getWorkspacePath() {
                    if (typeof options.getWorkspacePath === 'function') {
                        return options.getWorkspacePath();
                    }
                    return tempDir;
                },
                writeJsonAtomic() {},
            },
            './validateGameState': {
                validateGameState(value) {
                    return typeof options.validateGameState === 'function'
                        ? options.validateGameState(value)
                        : [];
                },
            },
            './i18n': { t(key) { return key; } },
            './stateManager': {
                commitGameState(value, config) {
                    commitCalls++;
                    lastCommitState = value;
                    lastCommitConfig = config;
                    return typeof options.commitGameState === 'function'
                        ? options.commitGameState(value, config)
                        : { ok: true, action: 'write' };
                },
            },
            './workspaceStateQueueCore': { readStateRevision() { return 0; } },
            './livingWorldCommercePersist': { flushScheduledCommercePersist() {} },
            './gameRules': {
                loadGameRules() {
                    return {
                        enableFactionReputation: false,
                        enableCommerce: false,
                        enableNpcAgency: false,
                        enableSettlementMode: false,
                        enableVehicleSystem: false,
                        enableMobileBaseSystem: false,
                        domainMonthDays: 30,
                        domainMonthlyActions: 2,
                    };
                },
            },
            './worldState': {
                loadWorldState() { return undefined; },
                saveWorldState() {},
            },
            './npcRegistry': {
                applyNpcMemoryUpdates() {},
                loadNpcRegistry() { return { npcs: {} }; },
            },
            './factionReputationCore': {
                applyPlayerReputationToFactions(factions) { return factions; },
                deriveQuestCompletionDeltas() { return []; },
                parseReputationOps() { return []; },
            },
            './migrateGameState': { CURRENT_SCHEMA_VERSION: 2 },
            './narrativeTimePassageCore': { clampElapsedWorldTurns() { return 0; } },
            './worldSimPersist': { persistWorldSimulationSteps() { return { ok: true }; } },
            './livingWorldTurnOps': { applyLivingWorldTurnOps(turnResult, state) { return state; } },
            './domainTurnOps': {
                applyDomainTurnOps(turnResult, state) { return state; },
                domainModeEnabled() { return false; },
                readDomainFromGameState() { return undefined; },
            },
            './guildTurnOps': {
                applyGuildTurnOps(turnResult, state) { return state; },
                buildGuildDriftConfig() { return {}; },
                guildModeEnabled() { return false; },
                readGuildFromGameState() { return undefined; },
            },
            './domainRegionDriftCore': {
                applyDomainRegionReturnDrift(state) { return state; },
                clearDomainSinceLastVisitReport(state) { return state; },
                isLocationInDomainRegion() { return false; },
                recordDomainRegionDepart(state) { return state; },
            },
            './guildHallDriftCore': {
                applyGuildHallReturnDrift(state) { return state; },
                clearGuildSinceLastVisitReport(state) { return state; },
                isLocationAtGuildHall() { return false; },
                mergeGuildVisitChangesIntoRecentChanges(changes) { return changes; },
                readGuildHallDriftState() { return {}; },
                recordGuildHallDepart(state) { return state; },
            },
            './discoveryTurnOps': { tryApplyDiscoveryTurnOps() { return true; } },
            './campaignResourceTurnOps': { tryApplyCampaignResourceTurnOps() { return true; } },
            './settlementLayoutTurnOps': {
                shouldAttemptSettlementLayoutPersist() { return false; },
                tryApplySettlementLayoutTurnOps() { return true; },
            },
            './mobileBaseTurnOps': {
                shouldAttemptMobileBasePersist() { return false; },
                tryApplyMobileBaseTurnOps() { return { ok: true, applied: false }; },
            },
            './vehicleTurnOps': {
                shouldAttemptVehiclePersist() { return false; },
                tryApplyVehicleTurnOps() { return { ok: true, applied: false }; },
            },
            './turnLedgerPersistCore': {
                persistTurnLedgersAfterCommit(input) {
                    ledgerCalls++;
                    return typeof options.persistTurnLedgersAfterCommit === 'function'
                        ? options.persistTurnLedgersAfterCommit(input)
                        : {
                            ok: true,
                            partial: false,
                            discoveryAttempted: false,
                            discoveryApplied: false,
                            campaignResourcesAttempted: false,
                            campaignResourcesApplied: false,
                            settlementLayoutAttempted: false,
                            settlementLayoutApplied: false,
                            vehicleStateAttempted: false,
                            vehicleStateApplied: false,
                            failedTargets: [],
                        };
                },
            },
            './livingWorldBridge': { recordLocationVisit() {} },
            './worldSimBulkCore': { ABSOLUTE_MAX_BULK_WORLD_STEPS: 100 },
        },
    };
}

function loadStatePatchHarness(options = {}) {
    purgeModules([outStatePatch]);
    const tmpDir = makeTempDir('lr-runtime-002a-statepatch-');
    const setup = makeStatePatchMocks(tmpDir, options);
    const statePatch = withMockedRequire(setup.mocks, () => require(outStatePatch));
    return {
        module: statePatch,
        tmpDir,
        statePath: setup.statePath,
        get commitCalls() { return setup.commitCalls; },
        get ledgerCalls() { return setup.ledgerCalls; },
        get lastCommitState() { return setup.lastCommitState; },
        get lastCommitConfig() { return setup.lastCommitConfig; },
    };
}

function makeWatcherFallbackIntegrationHarness(options = {}) {
    purgeModules([outGameStateSync, outTurnResultFallback]);

    const tmpDir = makeTempDir('lr-runtime-002a-integration-');
    seedReplayScope(tmpDir);
    const gameStatePath = path.join(tmpDir, 'game_state.json');
    const historyPath = path.join(tmpDir, 'game_history.json');
    const turnResultPath = path.join(tmpDir, 'turn_result.json');
    writeJson(gameStatePath, {
        schemaVersion: 2,
        entries: [],
        status: { hp: { current: 10, max: 10 }, mp: { current: 5, max: 5 } },
        options: ['Wait'],
    });

    const events = [];
    let applyCount = 0;
    let callbackCount = 0;
    let handledCount = 0;
    const processResponses = Array.isArray(options.processResponses)
        ? [...options.processResponses]
        : [];

    const workspacePaths = {
        getActiveWorkspaceFolder: () => ({ uri: { fsPath: tmpDir } }),
        writeJsonAtomic(filePath, value) {
            fs.mkdirSync(path.dirname(filePath), { recursive: true });
            writeJson(filePath, value);
        },
        getGameStatePath: () => gameStatePath,
        getWorkspacePath: () => tmpDir,
        getHistoryPath: () => historyPath,
    };

    const mocks = {
        vscode: createVscodeStub({
            workspace: {
                getConfiguration: () => ({ get: () => undefined, update: async () => undefined }),
                workspaceFolders: [{ uri: { fsPath: tmpDir } }],
                createFileSystemWatcher: () => ({
                    onDidChange() {},
                    onDidCreate() {},
                    dispose() {},
                }),
                RelativePattern: function RelativePattern() {},
            },
            Uri: { file: (p) => ({ fsPath: p }) },
        }),
        './workspacePaths': workspacePaths,
        './statePatch': {
            processTurnResult(turnResult) {
                applyCount++;
                events.push(`apply:${turnResult.turnId}`);
                if (processResponses.length > 0) {
                    return processResponses.shift();
                }
                return turnResult;
            },
            takeAutoLocationImageRequest() { return undefined; },
            buildStatePatchFromDiff() { return []; },
        },
        './gmPromptBuilder': {
            getTriggeredLoreLabels() { return []; },
        },
        './npcRegistry': {
            applyNpcMemoryUpdates() {},
            parseNpcMemoryUpdatesFromGameState() { return []; },
            loadNpcRegistry() { return { npcs: {} }; },
        },
        './gameRules': {
            loadGameRules() {
                return { enableNpcRegistry: false };
            },
        },
        './entryId': {
            isValidEntryId(id) { return typeof id === 'string' && id.length > 0; },
        },
        './validateGameState': { validateGameState() { return []; } },
        './gameStateSanitize': { salvageGameStateFromUnknown() { return undefined; } },
        './migrateGameState': {
            migrateGameState(state) { return { state, migrated: false, fromVersion: 2 }; },
            CURRENT_SCHEMA_VERSION: 2,
        },
        './autoLocationImageRunner': {
            queueAutoLocationImageSilent() {
                events.push('auto');
            },
        },
        './mediaAgent': {
            handleGameStateMedia() {},
            handleTurnResultMedia(turnResult) {
                events.push(`media:${turnResult.turnId}`);
            },
        },
        './remotePlayServer': { pushGameStateToRemoteClients() {} },
        './scenarioDirector': { pushScenarioDirectorToWebview() {} },
        './partyDirector': { pushPartyDirectorToWebview() {} },
        './worldView': { pushWorldViewToWebview() {} },
        './emergentSimulator': { maybeTickSimulation() {} },
        './mediaPaths': {
            isAllowedImagePath() { return true; },
            toWebviewSafeMediaRef() { return undefined; },
        },
        './worldForge': { loadWorldForge() { return undefined; } },
        './worldState': {
            loadWorldState() { return undefined; },
            isWorldStateEnabled() { return false; },
        },
        './locationImageBuilder': { buildLocationImagePrompt() { return undefined; } },
        './locationImageTracker': {
            shouldAutoGenerateForLocation() { return false; },
            markLocationAutoGenerated() {},
        },
        './imageGenRunner': {
            enqueueImageGeneration() { return false; },
            getResolvedImageMode() { return 'location'; },
        },
        './stateManager': { commitGameState() { return { ok: true, action: 'write' }; } },
        './protagonistBootstrap': {
            scheduleProtagonistBootstrap(turnResult) {
                events.push(`bootstrap:${turnResult.turnId}`);
            },
        },
        './npcWhereaboutsTrustCore': { readNpcPlayerTrust(value) { return value; } },
        './gameStateWebviewSanitize': {
            sanitizeGameStateForWebview(value) { return value; },
            sanitizeTurnResultForWebview(value) { return value; },
        },
    };

    const turnResultFallback = withMockedRequire(mocks, () => require(outTurnResultFallback));
    const gameStateSync = withMockedRequire(mocks, () => require(outGameStateSync));
    if (typeof turnResultFallback.resetTurnResultFallbackForTests === 'function') {
        turnResultFallback.resetTurnResultFallbackForTests();
    }
    gameStateSync.resetTurnResultProcessingStateForTests();
    gameStateSync.initGameStateSync({
        getPanel: () => ({
            webview: {
                postMessage(payload) {
                    events.push(`ui:${payload.turnResult?.turnId ?? 'none'}`);
                },
            },
        }),
        getGameStatePath: workspacePaths.getGameStatePath,
        getWorkspacePath: workspacePaths.getWorkspacePath,
        getSkillDir: () => undefined,
        getHistoryPath: workspacePaths.getHistoryPath,
        processProfileUpdates() {},
        maybeSuggestArchive() {},
        appendGmBridgeLog() {},
    });

    const originalMarkHandled = turnResultFallback.markTurnResultHandled;
    turnResultFallback.markTurnResultHandled = function patchedMarkHandled() {
        handledCount++;
        events.push('handled');
        return originalMarkHandled.apply(this, arguments);
    };

    return {
        tmpDir,
        gameStatePath,
        turnResultPath,
        events,
        gameStateSync,
        turnResultFallback,
        get applyCount() { return applyCount; },
        get handledCount() { return handledCount; },
        get callbackCount() { return callbackCount; },
        writeTurnResult(turnResult) {
            writeJson(turnResultPath, turnResult);
        },
        beginPendingTurn() {
            const prevState = turnResultFallback.beginGmRun(() => {
                callbackCount++;
                events.push('callback');
            });
            return prevState;
        },
    };
}

if (
    !fs.existsSync(outGameStateSync)
    || !fs.existsSync(outStatePatch)
    || !fs.existsSync(outTurnResultFallback)
    || !fs.existsSync(outAcceptedTurnReplayGuardCore)
) {
    fail('compiled runtime modules missing - run npm run compile first');
    process.exit(1);
}

async function runAsyncCases() {
    const acceptedCore = require(outAcceptedTurnReplayGuardCore);
    // 1. Parse failure: no apply / dedupe / handled / callback-like side effects.
    {
        const harness = loadGameStateSyncHarness({
            processResponses: [baseTurnResult('unused')],
            autoImageRequest: { locationId: 'loc', gmTurn: 2 },
        });
        harness.beginPendingTurn(() => {});
        fs.writeFileSync(harness.turnResultPath, '{"broken"', 'utf8');
        const result = await harness.processFile();
        assert(result.kind === 'retryableFailure', 'parse failure returns retryableFailure');
        assert(harness.processCalls === 0, 'parse failure does not apply turn');
        assert(harness.getHash() === '', 'parse failure does not commit dedupe hash');
        assert(harness.handledCount === 0, 'parse failure does not mark Handled');
        assert(harness.callbackCount === 0, 'parse failure does not fire callback');
        assert(harness.mediaCount === 0 && harness.autoImageCount === 0 && harness.bootstrapCount === 0, 'parse failure emits no success-only media/auto/bootstrap');
        assert(harness.postMessages.length === 0, 'parse failure emits no success UI update');
    }

    // RUNTIME-003A: durable restore repair latch blocks watcher TurnResult before mutation side effects.
    {
        const harness = loadGameStateSyncHarness({
            processResponses: [baseTurnResult('should-not-process')],
            autoImageRequest: { locationId: 'loc', gmTurn: 3 },
        });
        writeJson(harness.turnResultPath, baseTurnResult('turn-blocked-by-restore-latch'));
        writeJson(path.join(harness.tmpDir, '.text-adventure', 'runtime', 'accepted_turn_restore_repair_latch.json'), {
            schemaVersion: 1,
            kind: 'timelineRestoreRepairRequired',
            createdAt: new Date().toISOString(),
            reason: 'simulated post-rotation restore failure',
            phase: 'unit-test',
        });
        harness.beginPendingTurn(() => {
            harness.events.push('callback');
        });
        const blocked = await harness.processFile();
        assert(blocked.kind === 'repairRequired', 'restore repair latch returns repairRequired through watcher path');
        assert(harness.processCalls === 0, 'restore repair latch blocks processTurnResult');
        assert(harness.getHash() === '', 'restore repair latch does not commit dedupe hash');
        assert(harness.handledCount === 0, 'restore repair latch does not mark Handled');
        assert(harness.callbackCount === 0, 'restore repair latch does not fire callback');
        assert(harness.mediaCount === 0 && harness.autoImageCount === 0 && harness.bootstrapCount === 0, 'restore repair latch emits no success-only media/auto/bootstrap');
        assert(harness.postMessages.length === 0, 'restore repair latch emits no success UI update');
        const restartedHarness = loadGameStateSyncHarness({
            tmpDir: harness.tmpDir,
            processResponses: [baseTurnResult('still-should-not-process')],
        });
        const restartBlocked = await restartedHarness.processFile();
        assert(restartBlocked.kind === 'repairRequired', 'restore repair latch survives gameStateSync restart simulation');
        assert(restartedHarness.processCalls === 0, 'restart latch still blocks processTurnResult');
    }

    // RUNTIME-003A: process-local emergency restore repair latch blocks watcher TurnResult in the same process.
    {
        const harness = loadGameStateSyncHarness({
            processResponses: [baseTurnResult('should-not-process-emergency')],
            autoImageRequest: { locationId: 'loc', gmTurn: 4 },
        });
        const guard = require(outAcceptedTurnReplayGuard);
        writeJson(harness.turnResultPath, baseTurnResult('turn-blocked-by-emergency-latch'));
        guard.installAcceptedTurnEmergencyRestoreRepairLatchForTests(
            harness.tmpDir,
            'simulated durable latch write failure',
            'unit-test'
        );
        harness.beginPendingTurn(() => {
            harness.events.push('callback');
        });
        const blocked = await harness.processFile();
        assert(blocked.kind === 'repairRequired', 'process-local emergency latch returns repairRequired through watcher path');
        assert(harness.processCalls === 0, 'process-local emergency latch blocks processTurnResult');
        assert(harness.getHash() === '', 'process-local emergency latch does not commit dedupe hash');
        assert(harness.handledCount === 0, 'process-local emergency latch does not mark Handled');
        assert(harness.callbackCount === 0, 'process-local emergency latch does not fire callback');
        assert(harness.mediaCount === 0 && harness.autoImageCount === 0 && harness.bootstrapCount === 0, 'process-local emergency latch emits no success-only media/auto/bootstrap');
        assert(harness.postMessages.length === 0, 'process-local emergency latch emits no success UI update');
        assert(!fs.existsSync(path.join(harness.tmpDir, '.text-adventure', 'runtime', 'accepted_turn_restore_repair_latch.json')), 'process-local emergency latch does not create durable restart proof');
        guard.resetAcceptedTurnReplayGuardForTests();
    }

    // 2,4,5,6,12,13. pre-commit false -> same-hash retry -> success -> duplicate suppression.
    {
        const turn = baseTurnResult('turn-accept');
        const content = JSON.stringify(turn);
        const expectedHash = crypto.createHash('sha256').update(content, 'utf8').digest('hex');
        const harness = loadGameStateSyncHarness({
            processResponses: [false, { ...turn, beforeHash: 'b', afterHash: 'a', appliedAt: 'now' }],
            autoImageRequest: { locationId: 'region_gate', gmTurn: 7 },
            onProcessTurnResult() {
                harness.events.push('commit');
            },
        });
        harness.beginPendingTurn(() => {
            harness.events.push('callback');
        });
        fs.writeFileSync(harness.turnResultPath, content, 'utf8');

        const first = await harness.processFile();
        assert(first.kind === 'retryableFailure', 'pre-commit failure returns retryableFailure');
        assert(harness.getHash() === '', 'pre-commit failure leaves hash retryable');
        assert(harness.handledCount === 0, 'pre-commit failure does not mark Handled');
        assert(harness.callbackCount === 0, 'pre-commit failure does not fire callback');
        assert(harness.mediaCount === 0 && harness.autoImageCount === 0 && harness.bootstrapCount === 0, 'rejected result emits no success-only side effects');
        assert(harness.postMessages.length === 0, 'rejected result emits no successful UI update');

        harness.events.length = 0;
        const second = await harness.processFile();
        assert(second.kind === 'newlyAccepted', 'same-hash retry may later succeed');
        assert(harness.getHash() === expectedHash, 'successful apply commits dedupe hash after Accepted');
        assert(harness.handledCount === 1, 'successful apply marks Handled once');
        assert(harness.callbackCount === 1, 'successful apply fires callback once after Handled');
        assert(harness.mediaCount === 1 && harness.autoImageCount === 1 && harness.bootstrapCount === 1, 'successful apply runs success-only side effects once');
        assert(harness.postMessages.length === 1, 'successful apply emits exactly one successful UI update');
        const handledEvent = `handled:${expectedHash}`;
        const commitIndex = harness.events.indexOf('commit');
        const handledIndex = harness.events.indexOf(handledEvent);
        const callbackIndex = harness.events.indexOf('callback');
        const mediaIndex = harness.events.indexOf('media:turn-accept');
        const uiIndex = harness.events.indexOf('ui:turn-accept');
        const autoIndex = harness.events.indexOf('auto:region_gate:7');
        const bootstrapIndex = harness.events.indexOf('bootstrap:turn-accept');
        assert(
            commitIndex >= 0
                && handledIndex > commitIndex
                && callbackIndex > handledIndex
                && mediaIndex > callbackIndex
                && uiIndex > mediaIndex
                && autoIndex > uiIndex
                && bootstrapIndex > autoIndex,
            `successful ordering is commit -> hash -> Handled -> callback -> success-only effects (${harness.events.join('|')})`
        );

        const third = await harness.processFile();
        assert(third.kind === 'alreadyAccepted', 'duplicate successful result returns alreadyAccepted');
        assert(harness.processCalls === 2, 'duplicate successful result does not reapply');
        assert(harness.handledCount === 1, 'duplicate successful result does not mark Handled twice');
        assert(harness.callbackCount === 1, 'duplicate successful result does not re-fire callback');
    }

    // 7. corrected new hash after failure processes normally.
    {
        const firstTurn = baseTurnResult('turn-old');
        const secondTurn = baseTurnResult('turn-new');
        const harness = loadGameStateSyncHarness({
            processResponses: [false, { ...secondTurn, beforeHash: 'x', afterHash: 'y', appliedAt: 'later' }],
        });
        harness.beginPendingTurn(() => {});
        fs.writeFileSync(harness.turnResultPath, JSON.stringify(firstTurn), 'utf8');
        const first = await harness.processFile();
        assert(first.kind === 'retryableFailure', 'old failed file remains unaccepted');
        fs.writeFileSync(harness.turnResultPath, JSON.stringify(secondTurn), 'utf8');
        const second = await harness.processFile();
        assert(second.kind === 'newlyAccepted', 'corrected new hash succeeds normally');
        assert(harness.handledCount === 1, 'corrected new hash leads to one Handled event');
        assert(harness.callbackCount === 1, 'corrected new hash leads to one callback event');
    }

    // 8. post-commit structured secondary ledger failure remains Accepted.
    {
        const harness = loadStatePatchHarness({
            persistTurnLedgersAfterCommit() {
                return {
                    ok: false,
                    partial: true,
                    discoveryAttempted: true,
                    discoveryApplied: true,
                    campaignResourcesAttempted: true,
                    campaignResourcesApplied: false,
                    settlementLayoutAttempted: false,
                    settlementLayoutApplied: false,
                    vehicleStateAttempted: false,
                    vehicleStateApplied: false,
                    failedTargets: ['campaignResources'],
                };
            },
        });
        const accepted = harness.module.processTurnResult(baseTurnResult('turn-ledger-structured'));
        assert(Boolean(accepted), 'secondary ledger structured failure stays Accepted/truthy');
        assert(harness.commitCalls === 1, 'structured failure case crosses canonical commit once');
        assert(harness.ledgerCalls === 1, 'structured failure still attempts post-commit ledger persistence');
    }

    // 8b. canonical Accepted commit installs a host-owned replay witness.
    {
        const harness = loadStatePatchHarness();
        const context = {
            identity: {
                campaignInstanceId: '11111111-1111-4111-8111-111111111111',
                timelineEpochId: '22222222-2222-4222-8222-222222222222',
                turnId: 'turn-witness-installed',
                payloadHash: 'a'.repeat(64),
                identityHash: 'b'.repeat(64),
            },
            parentIdentityHash: 'c'.repeat(64),
            sourceRawHash: 'd'.repeat(64),
            observationSource: 'unit-test',
            acceptedAt: '2026-07-06T00:00:00.000Z',
        };
        const accepted = harness.module.processTurnResult(baseTurnResult('turn-witness-installed'), context);
        const witness = harness.lastCommitConfig?.runtimeAcceptedTurnWitness;
        assert(Boolean(accepted), 'accepted witness install remains truthy');
        assert(harness.lastCommitConfig?.runtimeAcceptedTurnWitnessMode === 'install', 'canonical commit uses trusted witness install authority');
        assert(!harness.lastCommitState?.[acceptedCore.RUNTIME_ACCEPTED_TURN_WITNESS_KEY], 'turn commit payload does not self-author witness root');
        assert(witness?.identityHash === context.identity.identityHash, 'trusted commit option contains accepted-turn witness identity');
        assert(witness?.parentIdentityHash === context.parentIdentityHash, 'trusted witness option preserves ledger parent link');
    }

    // 9. post-commit thrown secondary ledger failure remains Accepted.
    {
        const harness = loadStatePatchHarness({
            persistTurnLedgersAfterCommit() {
                throw new Error('ledger boom');
            },
        });
        const accepted = harness.module.processTurnResult(baseTurnResult('turn-ledger-throw'));
        assert(Boolean(accepted), 'secondary ledger throw stays Accepted/truthy');
        assert(harness.commitCalls === 1, 'thrown secondary ledger failure occurs after canonical commit');
    }

    // 10. journal append failure remains Accepted.
    {
        const harness = loadStatePatchHarness();
        const originalAppend = fs.appendFileSync;
        fs.appendFileSync = () => {
            throw new Error('journal append boom');
        };
        try {
            const accepted = harness.module.processTurnResult(baseTurnResult('turn-journal'));
            assert(Boolean(accepted), 'journal append failure stays Accepted/truthy');
            assert(harness.commitCalls === 1, 'journal failure happens after canonical commit');
        } finally {
            fs.appendFileSync = originalAppend;
        }
    }

    // 10b. post-commit getWorkspacePath throw remains Accepted.
    {
        const harness = loadStatePatchHarness({
            getWorkspacePath() {
                throw new Error('workspace path boom');
            },
        });
        const accepted = harness.module.processTurnResult(baseTurnResult('turn-workspace-throw'));
        assert(Boolean(accepted), 'post-commit getWorkspacePath throw stays Accepted/truthy');
        assert(harness.commitCalls === 1, 'post-commit getWorkspacePath throw occurs after canonical commit');
        assert(harness.ledgerCalls === 1, 'post-commit getWorkspacePath throw does not roll back secondary ledger attempt');
    }

    // 2/3. pre-commit validation failure and canonical commit failure stay false.
    {
        const validationHarness = loadStatePatchHarness({
            validateGameState() {
                return ['schema violation'];
            },
        });
        const rejected = validationHarness.module.processTurnResult(baseTurnResult('turn-invalid'));
        assert(rejected === false, 'pre-commit validation failure returns false');
        assert(validationHarness.commitCalls === 0, 'pre-commit validation failure does not call canonical commit');
        assert(validationHarness.ledgerCalls === 0, 'pre-commit validation failure does not run post-commit ledgers');
    }

    {
        const commitHarness = loadStatePatchHarness({
            commitGameState() {
                return { ok: false, action: 'skip', reason: ['conflict'] };
            },
        });
        const rejected = commitHarness.module.processTurnResult(baseTurnResult('turn-commit-fail'));
        assert(rejected === false, 'canonical commit failure returns false');
        assert(commitHarness.commitCalls === 1, 'canonical commit failure reaches commit exactly once');
        assert(commitHarness.ledgerCalls === 0, 'canonical commit failure does not run post-commit ledgers');
    }

    // 9. restart with failed file and transient condition cleared reprocesses same bytes.
    {
        const tmpDir = makeTempDir('lr-runtime-002a-restart-');
        const turn = baseTurnResult('turn-restart');
        const firstHarness = loadGameStateSyncHarness({
            tmpDir,
            processResponses: [false],
        });
        firstHarness.beginPendingTurn(() => {});
        fs.writeFileSync(firstHarness.turnResultPath, JSON.stringify(turn), 'utf8');

        const first = await firstHarness.processFile();
        assert(first.kind === 'retryableFailure', 'restart proof: first lifetime returns retryableFailure');
        assert(fs.existsSync(firstHarness.turnResultPath), 'restart proof: failed file remains on disk');
        assert(firstHarness.getHash() === '', 'restart proof: first lifetime does not commit hash');
        assert(firstHarness.handledCount === 0, 'restart proof: first lifetime does not mark Handled');
        assert(firstHarness.callbackCount === 0, 'restart proof: first lifetime does not fire callback');

        const secondHarness = loadGameStateSyncHarness({
            tmpDir,
            processResponses: [{ ...turn, beforeHash: 'r0', afterHash: 'r1', appliedAt: 'restart' }],
        });
        const second = await secondHarness.processFile();
        assert(second.kind === 'newlyAccepted', 'restart proof: same bytes may succeed after restart/reset');
        assert(fs.existsSync(secondHarness.turnResultPath), 'restart proof: same file still exists for second lifetime');
        assert(secondHarness.processCalls === 1, 'restart proof: exactly one successful apply in restarted lifetime');
        assert(secondHarness.handledCount === 1, 'restart proof: restarted lifetime marks Handled once');
        assert(secondHarness.callbackCount === 0, 'restart proof: callback does not survive restart');
    }

    // 12. fallback-first duplicate observation with watcher second only accepts once.
    {
        const harness = makeWatcherFallbackIntegrationHarness({
            processResponses: [{ ...baseTurnResult('turn-integration'), beforeHash: 'i0', afterHash: 'i1', appliedAt: 'integration' }],
        });
        const prevState = harness.beginPendingTurn();
        harness.turnResultFallback.initTurnResultFallback(harness.gameStateSync.checkPendingTurnResultFile);
        harness.writeTurnResult(baseTurnResult('turn-integration'));

        const originalSetTimeout = global.setTimeout;
        const scheduled = [];
        global.setTimeout = ((fn, ms, ...args) => {
            scheduled.push(() => fn(...args));
            return { __fakeTimer: true, ms };
        });
        try {
            harness.turnResultFallback.finishGmRun(prevState, 'Wait', true);
            assert(scheduled.length === 1, 'integration proof: finishGmRun schedules fallback check');
            scheduled[0]();
            await flushAsyncWork();
        } finally {
            global.setTimeout = originalSetTimeout;
        }

        const watcherDuplicate = await harness.gameStateSync.processTurnResultFileAtForTests(harness.turnResultPath);
        assert(watcherDuplicate.kind === 'alreadyAccepted', 'integration proof: watcher sees duplicate after fallback acceptance');
        assert(harness.applyCount === 1, 'integration proof: apply count = 1');
        assert(harness.handledCount === 1, 'integration proof: Handled count = 1');
        assert(harness.callbackCount === 1, 'integration proof: callback count = 1');
    }

    // 11. callback throw is isolated and cannot re-fire.
    {
        purgeModules([outTurnResultFallback]);
        const fallback = withMockedRequire({ vscode: createVscodeStub() }, () => require(outTurnResultFallback));
        if (typeof fallback.resetTurnResultFallbackForTests === 'function') {
            fallback.resetTurnResultFallbackForTests();
        }
        let callbackCount = 0;
        fallback.beginGmRun(() => {
            callbackCount++;
            throw new Error('callback boom');
        });
        try {
            fallback.markTurnResultHandled();
            ok('callback throw does not escape markTurnResultHandled');
        } catch (e) {
            fail(`callback throw escaped: ${e instanceof Error ? e.message : String(e)}`);
        }
        assert(callbackCount === 1, 'callback throw still attempts callback exactly once');
        fallback.markTurnResultHandled();
        assert(callbackCount === 1, 'detached callback is not re-fired after exception');
    }
}

runAsyncCases()
    .then(() => {
        if (failed > 0) {
            process.exit(1);
        }
        console.log('runtime turn result acceptance: all tests passed.');
    })
    .catch((e) => {
        fail(`async test harness failed: ${e instanceof Error ? e.stack || e.message : String(e)}`);
        process.exit(1);
    });
