#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.join(__dirname, '..');
const corePath = path.join(root, 'out', 'gmPromptBuilderCore.js');

let failed = 0;
function fail(msg) { console.error(`FAIL: ${msg}`); failed++; }
function ok(msg) { console.log(`OK: ${msg}`); }

if (!fs.existsSync(corePath)) {
    fail(`${corePath} missing — run npm run compile`);
    process.exit(1);
}

const { buildAntigravityRelayPayload } = require(corePath);

function runTests() {
    console.log("--- test_antigravity_relay_core.js ---");

    const trimmed = "I open the door.";
    const availableOptions = ["Look around", "Go back"];
    const breakdown = { breakdown: true }; // stub

    const payload = buildAntigravityRelayPayload(trimmed, breakdown, availableOptions);

    assert.strictEqual(payload.kind, 'antigravity_relay_request');
    assert.strictEqual(payload.version, 1);
    assert.strictEqual(payload.playerAction, "I open the door.");
    assert.deepStrictEqual(payload.availableOptions, ["Look around", "Go back"]);
    assert.strictEqual(payload.targetOutput, 'turn_result.json');
    ok("production relay payload matches contract");
}

try {
    runTests();
    console.log("=> PASS");
    process.exit(0);
} catch (e) {
    fail(e.message);
    process.exit(1);
}
