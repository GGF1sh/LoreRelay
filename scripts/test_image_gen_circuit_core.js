#!/usr/bin/env node
'use strict';

const path = require('path');
const root = path.join(__dirname, '..');
const corePath = path.join(root, 'out', 'imageGenCircuitCore.js');

let failed = 0;
function fail(msg) { console.error(`FAIL: ${msg}`); failed++; }
function ok(msg) { console.log(`OK: ${msg}`); }

if (!require('fs').existsSync(corePath)) {
    fail('out/imageGenCircuitCore.js missing — run npm run compile first');
    process.exit(1);
}

const {
    createImageGenCircuitState,
    isImageGenCircuitOpen,
    recordImageGenFailure,
    recordImageGenSuccess,
    IMAGE_GEN_CIRCUIT_FAILURE_THRESHOLD,
    IMAGE_GEN_CIRCUIT_COOLDOWN_MS,
} = require(corePath);

{
    let state = createImageGenCircuitState();
    if (isImageGenCircuitOpen(state, 1000)) {
        fail('fresh circuit should be closed');
    } else {
        ok('fresh circuit closed');
    }
    state = recordImageGenSuccess(state);
    const first = recordImageGenFailure(state, 1000);
    if (first.circuitOpened || first.state.consecutiveFailures !== 1) {
        fail(`first failure should not open circuit: ${JSON.stringify(first)}`);
    } else {
        ok('first failure increments only');
    }
    let s = first.state;
    for (let i = 0; i < IMAGE_GEN_CIRCUIT_FAILURE_THRESHOLD - 2; i++) {
        s = recordImageGenFailure(s, 2000 + i).state;
    }
    const opened = recordImageGenFailure(s, 5000);
    if (!opened.circuitOpened) {
        fail('threshold should open circuit');
    } else if (!isImageGenCircuitOpen(opened.state, 5000)) {
        fail('circuit should be open immediately');
    } else if (isImageGenCircuitOpen(opened.state, 5000 + IMAGE_GEN_CIRCUIT_COOLDOWN_MS)) {
        fail('circuit should close after cooldown');
    } else {
        ok('circuit opens at threshold and respects cooldown');
    }
    const reset = recordImageGenSuccess(opened.state);
    if (reset.consecutiveFailures !== 0 || isImageGenCircuitOpen(reset, 6000)) {
        fail(`success should reset circuit: ${JSON.stringify(reset)}`);
    } else {
        ok('success resets circuit');
    }
}

if (failed > 0) {
    process.exit(1);
}
console.log('image gen circuit core: all tests passed.');