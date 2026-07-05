#!/usr/bin/env node
'use strict';

const path = require('path');
const fs = require('fs');
const corePath = path.join(__dirname, '..', 'out', 'stateOrchestratorExecutorCore.js');

if (!fs.existsSync(corePath)) {
    console.error(`FAIL: ${corePath} missing — run npm run compile`);
    process.exit(1);
}

const {
    buildTransactionExecutionSequence,
    evaluateTransactionCommitStatus,
} = require(corePath);

let failed = 0;
function fail(msg) { console.error(`FAIL: ${msg}`); failed++; }
function ok(msg) { console.log(`OK: ${msg}`); }

// Test 1: Sequence generation
{
    const plan = {
        version: 1,
        kind: 'gm_turn',
        orderSource: 'TURN_LEDGER_PERSIST_ORDER',
        primaryLedgerId: 'game_state',
        steps: [
            {
                order: 1,
                ledgerId: 'game_state',
                fileNamePattern: 'game_state.json',
                backupPolicy: 'optional_bak',
                failurePolicy: 'abort_before_commit',
                status: 'planned'
            },
            {
                order: 2,
                ledgerId: 'vehicle_state',
                fileNamePattern: 'vehicle_state.json',
                backupPolicy: 'none',
                failurePolicy: 'retain_primary_report_partial',
                status: 'planned'
            },
            {
                order: 3,
                ledgerId: 'npc_registry',
                status: 'skipped_no_ops'
            }
        ],
        outOfScopeDescriptorIds: [],
        warnings: []
    };

    const seq = buildTransactionExecutionSequence(plan, 'tx_1');
    if (seq.prepareActions.length !== 3) {
        fail(`Expected 3 prepare actions, got ${seq.prepareActions.length}`);
    } else {
        ok('prepareActions counts match (backup + write_tmp)');
    }

    if (seq.commitActions.length !== 2) {
        fail(`Expected 2 commit actions, got ${seq.commitActions.length}`);
    } else {
        ok('commitActions matches planned steps');
    }

    if (seq.cleanupActions.length !== 1 || seq.cleanupActions[0].ledgerId !== 'game_state') {
        fail('cleanupActions should only contain game_state');
    } else {
        ok('cleanupActions correctly mirrors backup requests');
    }
}

// Test 2: Commit Evaluation
{
    if (evaluateTransactionCommitStatus(true, []) !== 'rolled_back') {
        fail('Primary failure should trigger rollback');
    } else {
        ok('Primary failure causes rollback');
    }

    if (evaluateTransactionCommitStatus(false, []) !== 'committed') {
        fail('No failures should mean committed');
    } else {
        ok('No failures means committed');
    }

    if (evaluateTransactionCommitStatus(false, [{ ledgerId: 'a', policy: 'abort_before_commit'}]) !== 'rolled_back') {
        fail('Secondary failure with abort_before_commit should rollback');
    } else {
        ok('Strict secondary failure causes rollback');
    }

    if (evaluateTransactionCommitStatus(false, [{ ledgerId: 'b', policy: 'retain_primary_report_partial'}]) !== 'partial_commit_warn') {
        fail('Secondary failure with retain_primary_report_partial should warn');
    } else {
        ok('Lenient secondary failure causes partial commit warn');
    }
}

if (failed > 0) {
    process.exit(1);
}
console.log('stateOrchestratorExecutorCore: all tests passed.');
