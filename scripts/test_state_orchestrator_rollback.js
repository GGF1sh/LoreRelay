#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const hostPath = path.join(__dirname, '..', 'out', 'stateOrchestratorExecutorHost.js');

if (!fs.existsSync(hostPath)) {
    console.error(`FAIL: ${hostPath} missing 窶・run npm run compile`);
    process.exit(1);
}

const { executeTransactionSequenceHost } = require(hostPath);

let failed = 0;
function fail(msg) { console.error(`FAIL: ${msg}`); failed++; }
function ok(msg) { console.log(`OK: ${msg}`); }

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lrtx-rb-'));
const payloads = {
    'game_state': '{"turn": 2}',
    'vehicle_state': '{"vehicles": []}'
};

// Setup initial files
fs.writeFileSync(path.join(tmpDir, 'game_state.json'), '{"turn": 1}', 'utf8');
fs.writeFileSync(path.join(tmpDir, 'vehicle_state.json'), '{"vehicles": [1]}', 'utf8');

const sequence = {
    transactionId: 'tx_test_rollback',
    prepareActions: [
        { type: 'backup', ledgerId: 'game_state', resourceKey: 'game_state.json', payloadKey: 'game_state', failurePolicy: 'abort_before_commit', isPrimary: true },
        { type: 'write_tmp', ledgerId: 'game_state', resourceKey: 'game_state.json', payloadKey: 'game_state', failurePolicy: 'abort_before_commit', isPrimary: true },

        { type: 'backup', ledgerId: 'vehicle_state', resourceKey: 'vehicle_state.json', payloadKey: 'vehicle_state', failurePolicy: 'abort_before_commit', isPrimary: false },
        { type: 'write_tmp', ledgerId: 'vehicle_state', resourceKey: 'vehicle_state.json', payloadKey: 'vehicle_state', failurePolicy: 'abort_before_commit', isPrimary: false }
    ],
    commitActions: [
        { type: 'commit_rename', ledgerId: 'game_state', resourceKey: 'game_state.json', payloadKey: 'game_state', failurePolicy: 'abort_before_commit', isPrimary: true },
        { type: 'commit_rename', ledgerId: 'vehicle_state', resourceKey: 'vehicle_state.json', payloadKey: 'vehicle_state', failurePolicy: 'abort_before_commit', isPrimary: false }
    ],
    cleanupActions: [
        { type: 'cleanup_bak', ledgerId: 'game_state', resourceKey: 'game_state.json', payloadKey: 'game_state', failurePolicy: 'abort_before_commit', isPrimary: true },
        { type: 'cleanup_bak', ledgerId: 'vehicle_state', resourceKey: 'vehicle_state.json', payloadKey: 'vehicle_state', failurePolicy: 'abort_before_commit', isPrimary: false }
    ]
};

// Mock fs.renameSync to fail on vehicle_state
const originalRenameSync = fs.renameSync;
fs.renameSync = function(oldPath, newPath) {
    if (newPath.includes('vehicle_state.json')) {
        throw new Error('Simulated rename failure on secondary ledger');
    }
    return originalRenameSync(oldPath, newPath);
};

const result = executeTransactionSequenceHost(tmpDir, sequence, payloads);

// Restore mock
fs.renameSync = originalRenameSync;

if (result.status !== 'rolled_back') {
    fail(`Expected rolled_back, got ${result.status}`);
} else {
    ok('Host executed rollback upon simulated commit failure');
}

const gsContent = fs.readFileSync(path.join(tmpDir, 'game_state.json'), 'utf8');
const vsContent = fs.readFileSync(path.join(tmpDir, 'vehicle_state.json'), 'utf8');

if (gsContent !== '{"turn": 1}') {
    fail(`game_state was not restored to original backup (got: ${gsContent})`);
} else {
    ok('game_state correctly rolled back');
}

if (vsContent !== '{"vehicles": [1]}') {
    fail(`vehicle_state was not restored to original backup (got: ${vsContent})`);
} else {
    ok('vehicle_state correctly rolled back');
}

// Cleanup tmpDir
fs.rmSync(tmpDir, { recursive: true, force: true });

if (failed > 0) {
    process.exit(1);
}
console.log('stateOrchestratorExecutorHost (Rollback): all tests passed.');
