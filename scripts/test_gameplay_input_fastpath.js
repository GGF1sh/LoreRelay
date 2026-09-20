#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const sampleDir = path.join(root, 'sample-scenarios', 'debug-sandbox');
const {
    normalizeDebugScenarioPlayerInput,
    parseDebugCommand,
} = require('../out/debugScenarioCore');
const { routeGameplayInput } = require('../out/gameplayInputRouteCore');
const {
    createDeterministicWorkspaceMutationGate,
    WORLD_MUTATION_IN_PROGRESS,
} = require('../out/deterministicWorkspaceMutationGate');

function readJson(name) {
    return JSON.parse(fs.readFileSync(path.join(sampleDir, name), 'utf8'));
}

const scenario = readJson('scenario.json');
const registry = readJson('npc_registry.json');
const forge = readJson('world_forge.json');
const worldState = readJson('world_state.json');
const options = scenario.opening.options;
const command = options[1];
const ctx = {
    npcs: Object.entries(registry.npcs).map(([id, npc]) => ({
        id,
        name: npc.name,
        trust: npc.disposition?.playerTrust ?? 50,
        romance: npc.disposition?.playerRomance ?? 0,
        fear: npc.disposition?.playerFear ?? 0,
    })),
    regions: forge.geography.regions.map((region) => ({ id: region.id, name: region.name })),
    locations: forge.geography.locations.map((location) => ({ id: location.id, name: location.name })),
    worldTurn: worldState.worldTurn ?? 0,
    discoveredRegionIds: [],
    rumoredRegionIds: [],
};

function assertRecognized(input, label) {
    const parsed = parseDebugCommand(input, ctx, options);
    assert(parsed, `${label} must be recognized`);
    assert.strictEqual(parsed.kind, 'trust_delta', `${label} must retain debug command meaning`);
}

async function assertRoute(input, relayEnabled, expectedKind) {
    const calls = { debug: 0, relay: 0, gm: 0 };
    const result = await routeGameplayInput(
        { playerAction: input, presentationOptions: options, relayEnabled },
        {
            async tryDebugFastPath(playerAction, presentationOptions) {
                const parsed = parseDebugCommand(playerAction, ctx, presentationOptions);
                if (!parsed) return false;
                calls.debug++;
                return true;
            },
            async dispatchRelay() { calls.relay++; },
            async dispatchGm() { calls.gm++; },
        }
    );
    assert.strictEqual(result.kind, expectedKind);
    return calls;
}

async function main() {
    assertRecognized(command, 'direct typed command');
    for (const [input, label] of [
        [`2. ${command}`, 'numbered option'],
        [`2.${command}`, 'numbered option without space'],
        [`2) ${command}`, 'ASCII parenthesis'],
        [`2）${command}`, 'full-width parenthesis'],
        [`２．${command}`, 'full-width numbering'],
        [`  ２．  ${command}`, 'leading whitespace'],
    ]) {
        assert.strictEqual(normalizeDebugScenarioPlayerInput(input, options), command, `${label} canonical form`);
        assertRecognized(input, label);
    }

    const numericGameplay = options[4];
    assert.strictEqual(
        normalizeDebugScenarioPlayerInput(numericGameplay, options),
        numericGameplay,
        'numeric gameplay command without a presentation marker is preserved'
    );
    assert.strictEqual(
        normalizeDebugScenarioPlayerInput('2026. 7. 13 at 3,4', options),
        '2026. 7. 13 at 3,4',
        'arbitrary numeric input is not stripped'
    );

    for (const relayEnabled of [false, true]) {
        assert.deepStrictEqual(
            await assertRoute(`2. ${command}`, relayEnabled, 'debug_fast_path'),
            { debug: 1, relay: 0, gm: 0 },
            `recognized command bypasses GM and Relay when Relay is ${relayEnabled ? 'ON' : 'OFF'}`
        );
    }
    assert.deepStrictEqual(
        await assertRoute('I ask about the weather.', false, 'gm'),
        { debug: 0, relay: 0, gm: 1 },
        'unknown input retains normal GM fallback'
    );
    assert.deepStrictEqual(
        await assertRoute('I ask about the weather.', true, 'relay'),
        { debug: 0, relay: 1, gm: 0 },
        'unknown input retains Relay gameplay fallback'
    );

    const gate = createDeterministicWorkspaceMutationGate();
    let accepted = 0;
    function accept(requestId) {
        const result = gate.acquire('workspace', { actionKind: 'gameplay_request', requestId });
        if (result.status === 'acquired') accepted++;
        return result;
    }
    const firstQuickClick = accept('quick-1');
    assert.strictEqual(firstQuickClick.status, 'acquired');
    assert.strictEqual(accept('quick-2').code, WORLD_MUTATION_IN_PROGRESS, 'second quick option is BUSY');
    assert.strictEqual(accept('free-1').code, WORLD_MUTATION_IN_PROGRESS, 'free input racing quick option is BUSY');
    assert.strictEqual(accepted, 1, 'only one player request is accepted while pending');
    assert.strictEqual(firstQuickClick.lease.release(), true, 'success releases busy state');
    const afterSuccess = accept('quick-3');
    assert.strictEqual(afterSuccess.status, 'acquired', 'input is accepted after success');
    assert.strictEqual(afterSuccess.lease.release(), true);
    const failed = accept('quick-failed');
    assert.strictEqual(failed.status, 'acquired');
    assert.strictEqual(failed.lease.release(), true, 'failure cleanup releases busy state');
    const afterFailure = accept('quick-after-failure');
    assert.strictEqual(afterFailure.status, 'acquired', 'input is accepted after failure');
    afterFailure.lease.release();

    console.log('gameplay input fast-path tests passed.');
}

main().catch((error) => {
    console.error(error.stack || error);
    process.exit(1);
});
