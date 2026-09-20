#!/usr/bin/env node
'use strict';

/**
 * PR-C impl — circuit breaker + cross-file dual-write orchestration.
 */

const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const corePath = path.join(root, 'out', 'workspaceWriteCircuitBreakerCore.js');
const queuePath = path.join(root, 'out', 'workspaceStateQueue.js');
const healthPath = path.join(root, 'out', 'workspaceWriteHealth.js');

let failed = 0;
function fail(msg) { console.error(`FAIL: ${msg}`); failed++; }
function ok(msg) { console.log(`OK: ${msg}`); }

for (const p of [corePath, queuePath, healthPath]) {
    if (!fs.existsSync(p)) {
        fail(`${p} missing — run npm run compile`);
        process.exit(1);
    }
}

const {
    CROSS_FILE_WRITE_COMPENSATION,
    DEFAULT_CIRCUIT_FAILURE_THRESHOLD,
    createCircuitBreakerState,
    recordCircuitOutcome,
    isCircuitOpen,
    runWithWriteRetry,
    executeCrossFileDualWrite,
    buildSplitBrainRiskEvent,
} = require(corePath);
const {
    runSerializedGameStateMutation,
    runSerializedWorldStateMutation,
    runSerializedSettlementLayoutMutation,
    resetWorkspaceWriteQueueForTests,
    isGameStateWriteCircuitOpen,
    isWorldStateWriteCircuitOpen,
    getGameStateCircuitForTests,
    getWorldStateCircuitForTests,
    getSettlementLayoutWriteQueueDepthForTests,
} = require(queuePath);
const {
    recordSplitBrainRisk,
    getLastSplitBrainRiskForTests,
    getSplitBrainRiskCountForTests,
    resetWorkspaceWriteHealthForTests,
} = require(healthPath);

resetWorkspaceWriteQueueForTests();
resetWorkspaceWriteHealthForTests();

// --- Pure core ---

{
    if (CROSS_FILE_WRITE_COMPENSATION.rollbackGameStateOnWorldFailure !== false) {
        fail('compensation must not rollback game_state');
    } else {
        ok('cross-file compensation retains game_state');
    }
}

{
    let state = createCircuitBreakerState();
    for (let i = 0; i < DEFAULT_CIRCUIT_FAILURE_THRESHOLD - 1; i++) {
        state = recordCircuitOutcome(state, false, { nowIso: `fail-${i}` });
    }
    if (isCircuitOpen(state)) {
        fail('circuit should stay closed below threshold');
    } else {
        ok('circuit opens only after threshold failures');
    }
    state = recordCircuitOutcome(state, false, { nowIso: 'fail-final' });
    if (!isCircuitOpen(state)) {
        fail('circuit should open at threshold');
    } else {
        ok('circuit opens at consecutive failure threshold');
    }
    state = recordCircuitOutcome(state, true, { nowIso: 'ok' });
    if (isCircuitOpen(state) || state.consecutiveFailures !== 0) {
        fail(`success should reset circuit: ${JSON.stringify(state)}`);
    } else {
        ok('successful write resets circuit breaker');
    }
}

{
    let attempts = 0;
    try {
        runWithWriteRetry(() => {
            attempts++;
            if (attempts < 2) {
                throw new Error('transient');
            }
        }, 1);
    } catch (e) {
        fail(`retry should succeed on second attempt: ${e}`);
    }
    if (attempts !== 2) {
        fail(`expected 2 attempts, got ${attempts}`);
    } else {
        ok('runWithWriteRetry retries once on transient failure');
    }
}

{
    const outcome = executeCrossFileDualWrite({
        gameAttempted: true,
        worldAttempted: true,
        writeGame: () => true,
        writeWorld: () => false,
    });
    if (!outcome.splitBrainRisk || !outcome.gameOk || outcome.worldOk || !outcome.partial) {
        fail(`split-brain outcome: ${JSON.stringify(outcome)}`);
    } else {
        ok('dual-write detects split-brain when game ok and world fails');
    }
    const event = buildSplitBrainRiskEvent(outcome, 'test');
    if (!event || event.failedTargets[0] !== 'world_state') {
        fail(`split-brain event: ${JSON.stringify(event)}`);
    } else {
        ok('buildSplitBrainRiskEvent captures failed target');
    }
}

{
    const recorded = recordSplitBrainRisk({
        ok: false,
        partial: true,
        splitBrainRisk: true,
        gameAttempted: true,
        gameOk: true,
        worldAttempted: true,
        worldOk: false,
        failedTargets: ['world_state'],
    }, 'unit-test');
    if (!recorded || getSplitBrainRiskCountForTests() !== 1) {
        fail('recordSplitBrainRisk increments counter');
    } else if (!getLastSplitBrainRiskForTests()?.source) {
        fail('last split-brain risk stored');
    } else {
        ok('recordSplitBrainRisk stores health event');
    }
}

// --- Queue integration ---

{
    resetWorkspaceWriteQueueForTests();
    let calls = 0;
    runSerializedGameStateMutation(() => {
        calls++;
        throw new Error('disk full');
    });
    if (calls !== 2) {
        fail(`job should run twice (initial + 1 retry): calls=${calls}`);
    } else if (getGameStateCircuitForTests().consecutiveFailures !== 1) {
        fail(`failure recorded: ${JSON.stringify(getGameStateCircuitForTests())}`);
    } else {
        ok('guarded game queue records write failure after retry');
    }
}

{
    resetWorkspaceWriteQueueForTests();
    let state = getGameStateCircuitForTests();
    for (let i = 0; i < DEFAULT_CIRCUIT_FAILURE_THRESHOLD; i++) {
        runSerializedGameStateMutation(() => { throw new Error('io'); });
        state = getGameStateCircuitForTests();
    }
    if (!isGameStateWriteCircuitOpen()) {
        fail('game circuit should be open');
    } else {
        ok('game circuit opens after repeated failures');
    }

    let skipped = false;
    runSerializedGameStateMutation(() => { skipped = true; });
    if (skipped) {
        fail('open circuit should skip mutation body');
    } else {
        ok('open circuit skips new game_state mutations');
    }
}

{
    resetWorkspaceWriteQueueForTests();
    runSerializedWorldStateMutation(() => { throw new Error('io'); });
    if (getWorldStateCircuitForTests().consecutiveFailures !== 1) {
        fail('world failure isolated from game circuit');
    } else if (isGameStateWriteCircuitOpen()) {
        fail('game circuit should remain closed');
    } else {
        ok('game and world circuits are independent');
    }
}

{
    resetWorkspaceWriteQueueForTests();
    const log = [];
    runSerializedGameStateMutation(() => {
        log.push('g');
        runSerializedWorldStateMutation(() => log.push('w'));
    });
    if (log.join(',') !== 'g,w') {
        fail(`nested guarded queues: ${log.join(',')}`);
    } else {
        ok('nested guarded queues still drain');
    }
}

{
    resetWorkspaceWriteQueueForTests();
    const log = [];
    runSerializedSettlementLayoutMutation(() => log.push('layout-1'));
    runSerializedSettlementLayoutMutation(() => log.push('layout-2'));
    if (log.join(',') !== 'layout-1,layout-2') {
        fail(`settlement layout queue serializes: ${log.join(',')}`);
    } else if (getSettlementLayoutWriteQueueDepthForTests() !== 0) {
        fail('settlement layout queue should drain');
    } else {
        ok('settlement_layout writes use serialized queue (M4b)');
    }
}

if (failed > 0) {
    process.exit(1);
}
console.log('workspace write circuit breaker: all tests passed.');