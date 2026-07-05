#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const hostPath = path.join(__dirname, '..', 'out', 'stateOrchestratorExecutorHost.js');

if (!fs.existsSync(hostPath)) {
    console.error(`FAIL: ${hostPath} missing — run npm run compile`);
    process.exit(1);
}

const { executeTransactionSequenceHost } = require(hostPath);

let failed = 0;
function fail(msg) { console.error(`FAIL: ${msg}`); failed++; }
function ok(msg) { console.log(`OK: ${msg}`); }

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lrtx-'));
const payloads = {
    'game_state': '{"turn": 2}',
    'vehicle_state': '{"vehicles": []}'
};

// Setup initial files
fs.writeFileSync(path.join(tmpDir, 'game_state.json'), '{"turn": 1}', 'utf8');

const sequence = {
    transactionId: 'tx_test_1',
    prepareActions: [
        { type: 'backup', ledgerId: 'game_state', resourceKey: 'game_state.json', payloadKey: 'game_state', failurePolicy: 'abort_before_commit', isPrimary: true },
        { type: 'write_tmp', ledgerId: 'game_state', resourceKey: 'game_state.json', payloadKey: 'game_state', failurePolicy: 'abort_before_commit', isPrimary: true },
        { type: 'write_tmp', ledgerId: 'vehicle_state', resourceKey: 'vehicle_state.json', payloadKey: 'vehicle_state', failurePolicy: 'retain_primary_report_partial', isPrimary: false }
    ],
    commitActions: [
        { type: 'commit_rename', ledgerId: 'game_state', resourceKey: 'game_state.json', payloadKey: 'game_state', failurePolicy: 'abort_before_commit', isPrimary: true },
        { type: 'commit_rename', ledgerId: 'vehicle_state', resourceKey: 'vehicle_state.json', payloadKey: 'vehicle_state', failurePolicy: 'retain_primary_report_partial', isPrimary: false }
    ],
    cleanupActions: [
        { type: 'cleanup_bak', ledgerId: 'game_state', resourceKey: 'game_state.json', payloadKey: 'game_state', failurePolicy: 'abort_before_commit', isPrimary: true }
    ]
};

const result = executeTransactionSequenceHost(tmpDir, sequence, payloads);

if (result.status !== 'committed') {
    fail(`Expected committed, got ${result.status}`);
} else {
    ok('Host executed successful 2PC commit');
}

const gsContent = fs.readFileSync(path.join(tmpDir, 'game_state.json'), 'utf8');
const vsContent = fs.readFileSync(path.join(tmpDir, 'vehicle_state.json'), 'utf8');

if (gsContent !== payloads['game_state']) {
    fail('game_state did not update correctly');
} else {
    ok('game_state committed correctly');
}

if (vsContent !== payloads['vehicle_state']) {
    fail('vehicle_state did not update correctly');
} else {
    ok('vehicle_state committed correctly');
}

if (fs.existsSync(path.join(tmpDir, 'game_state.json.bak'))) {
    fail('.bak file was not cleaned up');
} else {
    ok('.bak file cleaned up successfully');
}

// Cleanup tmpDir
fs.rmSync(tmpDir, { recursive: true, force: true });

if (failed > 0) {
    process.exit(1);
}
console.log('stateOrchestratorExecutorHost: all tests passed.');
