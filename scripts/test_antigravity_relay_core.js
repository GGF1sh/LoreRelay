#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.join(__dirname, '..');
const corePath = path.join(root, 'out', 'gmPromptBuilderCore.js');
const bootstrapPath = path.join(root, 'webview', 'modules', '90-bootstrap.js');

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

    const bootstrap = fs.readFileSync(bootstrapPath, 'utf8');
    const match = bootstrap.match(/const controlsToHide = \[([\s\S]*?)\];/);
    assert(match, 'relay suppression list not found');
    const ids = [...match[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
    assert.deepStrictEqual(ids, [
        'img-btn',
        'mic-btn',
        'undo-btn',
        'regen-btn',
        'qr-undo',
        'qr-retry',
        'experience-profile-btn',
        'parlor-settings-btn',
    ]);
    assert(!ids.includes('image-prompt-btn'));
    ok("relay suppression IDs match accepted UI affordance list");
}

try {
    runTests();
    console.log("=> PASS");
    process.exit(0);
} catch (e) {
    fail(e.message);
    process.exit(1);
}
