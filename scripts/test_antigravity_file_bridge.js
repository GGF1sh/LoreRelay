#!/usr/bin/env node
'use strict';

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

const root = path.join(__dirname, '..');
const bridgePath = path.join(root, 'out', 'antigravityRelayBridgeCore.js');
const payloadPath = path.join(root, 'out', 'gmPromptBuilderCore.js');

let failed = 0;
function fail(msg) { console.error(`FAIL: ${msg}`); failed++; }
function ok(msg) { console.log(`OK: ${msg}`); }

if (!fs.existsSync(bridgePath) || !fs.existsSync(payloadPath)) {
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
const { buildAntigravityRelayPayload } = require(payloadPath);

function sha256(filePath) {
    return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function assertSkillStartupPriorityIfPresent() {
    const sourceSkill = 'C:\\AI\\TextAdventureGMSkill\\SKILL.md';
    const installedSkill = path.join(os.homedir(), '.gemini', 'config', 'skills', 'text-adventure-gm', 'SKILL.md');
    if (!fs.existsSync(sourceSkill) || !fs.existsSync(installedSkill)) {
        console.log('SKIP: local Antigravity skill source or installed skill not present');
        return;
    }
    assert.strictEqual(sha256(sourceSkill), sha256(installedSkill), 'installed skill must match local source');
    const skillText = fs.readFileSync(sourceSkill, 'utf8');
    const marker = '## LoreRelay Antigravity Relay File Bridge (highest startup priority)';
    const markerIndex = skillText.indexOf(marker);
    assert(markerIndex >= 0, 'skill must document the relay file bridge startup path');
    assert(markerIndex < 1000, 'relay file bridge instructions must appear near the top before setup flow');
    assert(skillText.includes('.text-adventure/antigravity_relay_request.json'));
    assert(skillText.includes('metadata.requestId'));
    assert(skillText.includes('Do not start the genre/protagonist/tone/image setup wizard'));
    ok('live Antigravity skill source and installed copy prioritize the relay file bridge');
}

function runTests() {
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
        playerAction: 'Open the bronze gate.',
        minimalContext: { promptContext: { sections: [] } },
        availableOptions: ['Look around', 'Wait', 123],
    });
    assert.strictEqual(
        getAntigravityRelayRequestPath(workspace),
        path.join(workspace, '.text-adventure', 'antigravity_relay_request.json')
    );
    assert.deepStrictEqual(parseAntigravityRelayRequest(request), request);
    assert.strictEqual(request.expectedOutputPath, ANTIGRAVITY_RELAY_EXPECTED_OUTPUT);
    assert.deepStrictEqual(request.availableOptions, ['Look around', 'Wait']);
    ok('request file shape parses and stays workspace-local');

    const payload = buildAntigravityRelayPayload(
        request.playerAction,
        request.minimalContext.promptContext,
        request.availableOptions,
        { requestId, createdAt, targetOutput: ANTIGRAVITY_RELAY_EXPECTED_OUTPUT }
    );
    assert.strictEqual(payload.requestId, requestId);
    assert.strictEqual(payload.createdAt, createdAt);
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

    assertSkillStartupPriorityIfPresent();
}

try {
    runTests();
    console.log('=> PASS');
    process.exit(0);
} catch (e) {
    fail(e.stack || e.message);
    process.exit(1);
}
