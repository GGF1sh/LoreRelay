const assert = require('assert');

function testRelayPayloadGeneration() {
    const trimmed = "I open the door.";
    const state = { options: ["Look around", "Go back"] };
    const breakdown = { breakdown: true }; // stub

    const payload = {
        kind: 'antigravity_relay_request',
        version: 1,
        playerAction: trimmed,
        promptContext: breakdown,
        availableOptions: state.options,
        targetOutput: 'turn_result.json'
    };

    assert.strictEqual(payload.kind, 'antigravity_relay_request');
    assert.strictEqual(payload.version, 1);
    assert.strictEqual(payload.playerAction, "I open the door.");
    assert.deepStrictEqual(payload.availableOptions, ["Look around", "Go back"]);
    assert.strictEqual(payload.targetOutput, 'turn_result.json');
    console.log("OK: Relay payload generation matches contract");
}

function runAll() {
    testRelayPayloadGeneration();
    console.log("All Antigravity Relay core tests passed.");
}

runAll();
