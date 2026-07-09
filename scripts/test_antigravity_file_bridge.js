#!/usr/bin/env node
'use strict';

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const Module = require('module');
const os = require('os');
const path = require('path');

const root = path.join(__dirname, '..');
const bridgePath = path.join(root, 'out', 'antigravityRelayBridgeCore.js');
const bridgeHostPath = path.join(root, 'out', 'antigravityRelayBridgeHost.js');
const payloadPath = path.join(root, 'out', 'gmPromptBuilderCore.js');
const webviewHandlersPath = path.join(root, 'out', 'webviewHandlers.js');
const gameStateSyncPath = path.join(root, 'out', 'gameStateSync.js');
const acceptedGuardPath = path.join(root, 'out', 'acceptedTurnReplayGuard.js');
const acceptedCorePath = path.join(root, 'out', 'acceptedTurnReplayGuardCore.js');

let failed = 0;
function fail(msg) { console.error(`FAIL: ${msg}`); failed++; }
function ok(msg) { console.log(`OK: ${msg}`); }

if (
    !fs.existsSync(bridgePath)
    || !fs.existsSync(bridgeHostPath)
    || !fs.existsSync(payloadPath)
    || !fs.existsSync(webviewHandlersPath)
    || !fs.existsSync(gameStateSyncPath)
    || !fs.existsSync(acceptedGuardPath)
    || !fs.existsSync(acceptedCorePath)
) {
    fail('compiled relay bridge modules missing - run npm run compile first');
    process.exit(1);
}

const {
    ANTIGRAVITY_RELAY_EXPECTED_OUTPUT,
    buildAntigravityRelayRequest,
    buildAntigravityRelayRequestId,
    getAntigravityRelayRequestPath,
    parseAntigravityRelayRequest,
    validateTurnResultForPendingRelayRequest,
} = require(bridgePath);
const {
    clearPendingAntigravityRelayRequest,
    readPendingAntigravityRelayRequest,
} = require(bridgeHostPath);
const { buildAntigravityRelayPayload } = require(payloadPath);

function sha256(filePath) {
    return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function writeJson(filePath, value) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(value, null, 2), 'utf8');
}

function clearModuleCache(filePath) {
    try {
        delete require.cache[require.resolve(filePath)];
    } catch {
        // module not loaded
    }
}

function withMockedRequire(mocks, fn) {
    const originalLoad = Module._load;
    Module._load = function patchedLoad(request, parent, isMain) {
        if (Object.prototype.hasOwnProperty.call(mocks, request)) {
            return mocks[request];
        }
        return originalLoad.call(this, request, parent, isMain);
    };
    try {
        return fn();
    } finally {
        Module._load = originalLoad;
    }
}

function assertSkillStartupPriority() {
    const sourceSkill = path.join(root, 'antigravity-skill', 'text-adventure-gm', 'SKILL.md');
    const installedSkill = path.join(os.homedir(), '.gemini', 'config', 'skills', 'text-adventure-gm', 'SKILL.md');
    assert(fs.existsSync(sourceSkill), 'fresh checkout must contain repo-owned Antigravity skill source');
    const skillText = fs.readFileSync(sourceSkill, 'utf8');
    const marker = '## LoreRelay Antigravity Relay File Bridge (highest startup priority)';
    const markerIndex = skillText.indexOf(marker);
    assert(markerIndex >= 0, 'skill must document the relay file bridge startup path');
    assert(markerIndex < 1000, 'relay file bridge instructions must appear near the top before setup flow');
    assert(skillText.includes('.text-adventure/antigravity_relay_request.json'));
    assert(skillText.includes('workspacePath'));
    assert(skillText.includes('workspaceIdentity'));
    assert(skillText.includes('metadata.requestId'));
    assert(skillText.includes('Do not start the genre/protagonist/tone/image setup wizard'));
    assert(skillText.includes('/text-adventure-gm process pending LoreRelay request'));
    assert(skillText.includes('Slash-command selection alone'));
    if (fs.existsSync(installedSkill)) {
        assert.strictEqual(sha256(sourceSkill), sha256(installedSkill), 'installed skill must match repo-owned source when present');
    }
    const installer = fs.readFileSync(path.join(root, 'scripts', 'install_antigravity_skill.ps1'), 'utf8');
    assert(installer.includes("..\\antigravity-skill\\text-adventure-gm"), 'installer must use repo-owned skill source');
    assert(!installer.includes("..\\..\\TextAdventureGMSkill"), 'installer must not depend on sibling non-git source');
    ok('fresh checkout contains repo-owned skill source and installer uses it');
}

function assertHostLifecycleWiring() {
    const extensionText = fs.readFileSync(path.join(root, 'src', 'extension.ts'), 'utf8');
    assert(extensionText.includes("config.update('antigravityRelay.enabled', enabled"), 'Relay toggle must update the real VS Code setting');
    assert(extensionText.includes("clearRelayRequestForCurrentWorkspace('relay-mode-off')"), 'Relay OFF must clear pending requests');
    assert(extensionText.includes("clearRelayRequestForCurrentWorkspace('scenario-load')"), 'scenario loads must clear pending requests');
    assert(extensionText.includes("clearRelayRequestForCurrentWorkspace('session-transition')"), 'session transitions must clear pending requests');
    ok('extension host wires Relay OFF and scenario/session transitions to stale request cleanup');
}

async function assertRelayToggleRoutesToSettingHandler() {
    const originalLoad = Module._load;
    Module._load = function patchedLoad(request, parent, isMain) {
        if (request === 'vscode') {
            return {
                window: {
                    showWarningMessage: async () => undefined,
                },
            };
        }
        return originalLoad.call(this, request, parent, isMain);
    };
    try {
        const { handleWebviewMessage } = require(webviewHandlersPath);
        const calls = [];
        await handleWebviewMessage(
            { type: 'setAntigravityRelayMode', enabled: true },
            { handleSetAntigravityRelayMode: async (enabled) => calls.push(enabled) }
        );
        await handleWebviewMessage(
            { type: 'setAntigravityRelayMode', enabled: false },
            { handleSetAntigravityRelayMode: async (enabled) => calls.push(enabled) }
        );
        assert.deepStrictEqual(calls, [true, false]);
    ok('Relay toggle webview message routes to the real setting handler seam');
    } finally {
        Module._load = originalLoad;
    }
}

function createRelayImportHarness(workspace) {
    const postMessages = [];
    const outputLines = [];
    const showErrors = [];
    let processCalls = 0;

    const workspacePaths = {
        getActiveWorkspaceFolder: () => ({ uri: { fsPath: workspace } }),
        writeJsonAtomic,
        getGameStatePath: () => path.join(workspace, 'game_state.json'),
        getWorkspacePath: () => workspace,
        getHistoryPath: () => path.join(workspace, 'game_history.json'),
    };

    function writeJsonAtomic(filePath, value) {
        writeJson(filePath, value);
    }

    const vscodeStub = {
        window: {
            showErrorMessage: async (message) => {
                showErrors.push(message);
                return undefined;
            },
            showWarningMessage: async () => undefined,
            showInformationMessage: async () => undefined,
            createOutputChannel: () => ({ append() {}, appendLine() {}, clear() {}, show() {} }),
        },
        workspace: {
            getConfiguration: () => ({ get: () => undefined, update: async () => undefined }),
            workspaceFolders: [{ uri: { fsPath: workspace } }],
            createFileSystemWatcher: () => ({ onDidChange() {}, onDidCreate() {}, dispose() {} }),
        },
        RelativePattern: function RelativePattern() {},
        Uri: { file: (filePath) => ({ fsPath: filePath }) },
    };

    const mocks = {
        vscode: vscodeStub,
        './workspacePaths': workspacePaths,
        './stateManager': {
            commitGameStateAtPathForRuntimeAuthority: () => ({ ok: true, action: 'write', reason: [] }),
        },
        './statePatch': {
            processTurnResult(turnResult, acceptedTurnContext) {
                processCalls++;
                if (acceptedTurnContext) {
                    const { buildAcceptedTurnWitness } = require(acceptedCorePath);
                    const statePath = path.join(workspace, 'game_state.json');
                    const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
                    state.runtimeAcceptedTurn = buildAcceptedTurnWitness(acceptedTurnContext);
                    writeJson(statePath, state);
                    require(acceptedGuardPath).recordAcceptedTurnAfterCommit(workspace, acceptedTurnContext);
                }
                return turnResult;
            },
            takeAutoLocationImageRequest() { return undefined; },
        },
        './npcRegistry': {
            applyNpcMemoryUpdates() {},
            parseNpcMemoryUpdatesFromGameState() { return []; },
            loadNpcRegistry() { return { npcs: {} }; },
        },
        './gameRules': { loadGameRules() { return { enableNpcRegistry: false }; } },
        './entryId': { isValidEntryId(id) { return typeof id === 'string' && id.length > 0; } },
        './validateGameState': { validateGameState() { return []; } },
        './gameStateSanitize': { salvageGameStateFromUnknown() { return undefined; } },
        './migrateGameState': {
            migrateGameState(state) { return { state, migrated: false, fromVersion: 2 }; },
            CURRENT_SCHEMA_VERSION: 2,
        },
        './turnResultFallback': {
            markTurnResultHandled() {},
        },
        './autoLocationImageRunner': { queueAutoLocationImageSilent() {} },
        './mediaAgent': { handleGameStateMedia() {}, handleTurnResultMedia() {} },
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
        './protagonistBootstrap': { scheduleProtagonistBootstrap() {} },
        './npcWhereaboutsTrustCore': { readNpcPlayerTrust(value) { return value; } },
        './gameStateWebviewSanitize': {
            sanitizeGameStateForWebview(value) { return value; },
            sanitizeTurnResultForWebview(value) { return value; },
        },
    };

    clearModuleCache(gameStateSyncPath);
    clearModuleCache(acceptedGuardPath);
    clearModuleCache(acceptedCorePath);
    const gameStateSync = withMockedRequire(mocks, () => require(gameStateSyncPath));
    gameStateSync.resetTurnResultProcessingStateForTests();
    gameStateSync.initGameStateSync({
        getPanel: () => ({
            webview: {
                postMessage(payload) {
                    postMessages.push(payload);
                },
            },
        }),
        getGameStatePath: workspacePaths.getGameStatePath,
        getWorkspacePath: workspacePaths.getWorkspacePath,
        getSkillDir: () => undefined,
        getHistoryPath: workspacePaths.getHistoryPath,
        processProfileUpdates() {},
        maybeSuggestArchive() {},
        appendGmBridgeLog(line) {
            outputLines.push(line);
        },
    });

    return {
        postMessages,
        outputLines,
        showErrors,
        get processCalls() { return processCalls; },
        processFile(filePath = path.join(workspace, 'turn_result.json')) {
            return gameStateSync.processTurnResultFileAtForTests(filePath);
        },
        checkPending() {
            return gameStateSync.checkPendingTurnResultFile();
        },
    };
}

async function assertFreshRelayImportRecovery() {
    const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'lorerelay-agr-import-'));
    writeJson(path.join(workspace, 'game_state.json'), {
        schemaVersion: 2,
        entries: [{ id: 'user-1', role: 'user', sender: 'Player', content: 'Begin.' }],
        options: [],
        status: {},
    });

    const createdAt = '2026-07-09T07:41:26.072Z';
    const requestId = buildAntigravityRelayRequestId({
        workspacePath: workspace,
        playerAction: 'Begin.',
        createdAt,
        turnIndex: 1,
    });
    const request = buildAntigravityRelayRequest({
        requestId,
        createdAt,
        workspacePath: workspace,
        workspaceIdentity: path.resolve(workspace),
        playerAction: 'Begin.',
        minimalContext: { promptContext: { sections: [] } },
        availableOptions: [],
    });
    writeJson(getAntigravityRelayRequestPath(workspace), request);
    writeJson(path.join(workspace, 'turn_result.json'), {
        turnId: 'turn-1',
        playerAction: 'Begin.',
        narration: 'The first relay result arrives.',
        metadata: { requestId },
        statePatch: [{ op: 'replace', path: '/options', value: ['Continue'] }],
    });

    const scopePath = path.join(workspace, '.text-adventure', 'runtime', 'accepted_turn_scope.json');
    assert(!fs.existsSync(scopePath), 'fresh empty workspace starts without accepted-turn scope');

    const harness = createRelayImportHarness(workspace);
    const outcome = await harness.checkPending();
    assert.strictEqual(outcome.kind, 'newlyAccepted');
    assert.strictEqual(harness.processCalls, 1);
    assert(fs.existsSync(scopePath), 'verified first Relay result initializes accepted-turn scope');
    assert(fs.existsSync(path.join(workspace, '.text-adventure', 'runtime', 'accepted_turn_ledger.json')));
    assert(!fs.existsSync(getAntigravityRelayRequestPath(workspace)), 'matching accepted result clears pending request');
    assert(harness.postMessages.some((msg) => msg.type === 'gameStateUpdate' && msg.turnResult?.turnId === 'turn-1'));
    assert.strictEqual(harness.showErrors.length, 0);

    const duplicate = await harness.processFile();
    assert.strictEqual(duplicate.kind, 'alreadyAccepted');
    assert.strictEqual(harness.processCalls, 1, 'duplicate observation applies once');
    ok('fresh empty workspace first matching Relay result imports and duplicate observation is idempotent');
}

async function assertRelayMismatchSurfacesErrorBeforeMutation() {
    const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'lorerelay-agr-reject-'));
    writeJson(path.join(workspace, 'game_state.json'), {
        schemaVersion: 2,
        entries: [{ id: 'user-1', role: 'user', sender: 'Player', content: 'Begin.' }],
        options: [],
        status: {},
    });
    const request = buildAntigravityRelayRequest({
        requestId: 'agr-expected',
        createdAt: '2026-07-09T00:00:00.000Z',
        workspacePath: workspace,
        workspaceIdentity: path.resolve(workspace),
        playerAction: 'Begin.',
        minimalContext: { promptContext: { sections: [] } },
        availableOptions: [],
    });
    writeJson(getAntigravityRelayRequestPath(workspace), request);
    writeJson(path.join(workspace, 'turn_result.json'), {
        turnId: 'turn-1',
        narration: 'Wrong request.',
        metadata: { requestId: 'agr-wrong' },
    });

    const harness = createRelayImportHarness(workspace);
    const outcome = await harness.processFile();
    assert.strictEqual(outcome.kind, 'rejected');
    assert.strictEqual(harness.processCalls, 0, 'mismatched requestId is rejected before mutation');
    assert(fs.existsSync(getAntigravityRelayRequestPath(workspace)), 'rejected request remains pending for diagnosis/retry');
    assert(!fs.existsSync(path.join(workspace, '.text-adventure', 'runtime', 'accepted_turn_scope.json')));
    assert(harness.postMessages.some((msg) => msg.type === 'relayWaitingStateError' && String(msg.reason).includes('requestId mismatch')));
    assert(harness.outputLines.some((line) => line.includes('Antigravity Relay result was not imported')));
    assert(harness.showErrors.some((line) => line.includes('Antigravity Relay result was not imported')));
    ok('mismatched Relay result is rejected before mutation and ends visible waiting state');
}

async function runTests() {
    console.log('--- test_antigravity_file_bridge.js ---');

    const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'lorerelay-agr-'));
    const createdAt = '2026-07-09T00:00:00.000Z';
    const requestId = buildAntigravityRelayRequestId({
        workspacePath: workspace,
        playerAction: 'Open the bronze gate.',
        createdAt,
        turnIndex: 7,
    });
    assert.strictEqual(
        requestId,
        buildAntigravityRelayRequestId({
            workspacePath: workspace,
            playerAction: 'Open the bronze gate.',
            createdAt,
            turnIndex: 7,
        })
    );
    assert.notStrictEqual(
        requestId,
        buildAntigravityRelayRequestId({
            workspacePath: workspace,
            playerAction: 'Open the bronze gate.',
            createdAt: '2026-07-09T00:00:01.000Z',
            turnIndex: 7,
        })
    );
    ok('requestId is deterministic for one request and distinct for another');

    const request = buildAntigravityRelayRequest({
        requestId,
        createdAt,
        workspacePath: workspace,
        workspaceIdentity: path.resolve(workspace),
        playerAction: 'Open the bronze gate.',
        minimalContext: { promptContext: { sections: [] } },
        availableOptions: ['Look around', 'Wait', 123],
    });
    assert.strictEqual(
        getAntigravityRelayRequestPath(workspace),
        path.join(workspace, '.text-adventure', 'antigravity_relay_request.json')
    );
    assert.deepStrictEqual(parseAntigravityRelayRequest(request), request);
    assert.strictEqual(request.workspacePath, path.resolve(workspace));
    assert.strictEqual(request.workspaceIdentity, path.resolve(workspace));
    assert.strictEqual(request.expectedOutputPath, ANTIGRAVITY_RELAY_EXPECTED_OUTPUT);
    assert.deepStrictEqual(request.availableOptions, ['Look around', 'Wait']);
    ok('request file shape parses and stays workspace-local');

    const payload = buildAntigravityRelayPayload(
        request.playerAction,
        request.minimalContext.promptContext,
        request.availableOptions,
        {
            requestId,
            createdAt,
            targetOutput: ANTIGRAVITY_RELAY_EXPECTED_OUTPUT,
            workspacePath: request.workspacePath,
            workspaceIdentity: request.workspaceIdentity,
        }
    );
    assert.strictEqual(payload.requestId, requestId);
    assert.strictEqual(payload.createdAt, createdAt);
    assert.strictEqual(payload.workspacePath, request.workspacePath);
    assert.strictEqual(payload.workspaceIdentity, request.workspaceIdentity);
    assert.strictEqual(payload.targetOutput, 'turn_result.json');
    ok('clipboard fallback payload carries the same request correlation');

    const matchingTurn = { turnId: 'turn-7', narration: 'The gate opens.', metadata: { requestId } };
    assert.deepStrictEqual(
        validateTurnResultForPendingRelayRequest(request, matchingTurn),
        { ok: true, requestId }
    );
    assert.deepStrictEqual(
        validateTurnResultForPendingRelayRequest(request, matchingTurn),
        { ok: true, requestId }
    );
    assert.strictEqual(
        validateTurnResultForPendingRelayRequest(request, {
            turnId: 'turn-7',
            narration: 'Wrong session.',
            metadata: { requestId: 'agr-stale' },
        }).ok,
        false
    );
    assert.strictEqual(
        validateTurnResultForPendingRelayRequest(request, {
            turnId: 'turn-7',
            narration: 'Missing metadata.',
        }).ok,
        false
    );
    assert.strictEqual(validateTurnResultForPendingRelayRequest(undefined, matchingTurn).ok, true);
    ok('pending relay import accepts matching duplicates and rejects stale or missing requestIds');

    const requestPath = getAntigravityRelayRequestPath(workspace);
    fs.mkdirSync(path.dirname(requestPath), { recursive: true });
    fs.writeFileSync(requestPath, JSON.stringify(request, null, 2), 'utf8');
    assert.strictEqual(readPendingAntigravityRelayRequest(workspace).requestId, requestId);
    assert.strictEqual(clearPendingAntigravityRelayRequest(workspace, 'accepted-result', 'wrong-id'), false);
    assert(fs.existsSync(requestPath), 'wrong expected requestId must not clear active pending request');
    assert.strictEqual(clearPendingAntigravityRelayRequest(workspace, 'relay-mode-off'), true);
    assert(!fs.existsSync(requestPath), 'Relay OFF must clear stale request');
    fs.writeFileSync(requestPath, JSON.stringify(request, null, 2), 'utf8');
    assert.strictEqual(readPendingAntigravityRelayRequest(workspace).requestId, requestId);
    assert.strictEqual(validateTurnResultForPendingRelayRequest(readPendingAntigravityRelayRequest(workspace), matchingTurn).ok, true);
    assert(fs.existsSync(requestPath), 'ordinary sync/validation must not clear active pending request');
    assert.strictEqual(clearPendingAntigravityRelayRequest(workspace, 'scenario-load'), true);
    assert(!fs.existsSync(requestPath), 'new scenario/session transition must clear stale request');
    ok('pending request clears on Relay OFF and scenario/session transition but not ordinary validation');

    assertSkillStartupPriority();
    assertHostLifecycleWiring();
    await assertRelayToggleRoutesToSettingHandler();
    await assertFreshRelayImportRecovery();
    await assertRelayMismatchSurfacesErrorBeforeMutation();
}

try {
    Promise.resolve(runTests()).then(() => {
    console.log('=> PASS');
    process.exit(0);
    }).catch((e) => {
        fail(e.stack || e.message);
        process.exit(1);
    });
} catch (e) {
    fail(e.stack || e.message);
    process.exit(1);
}
