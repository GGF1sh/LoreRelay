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

let failed = 0;
function fail(msg) { console.error(`FAIL: ${msg}`); failed++; }
function ok(msg) { console.log(`OK: ${msg}`); }

if (!fs.existsSync(bridgePath) || !fs.existsSync(bridgeHostPath) || !fs.existsSync(payloadPath) || !fs.existsSync(webviewHandlersPath)) {
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
