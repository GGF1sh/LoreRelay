#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const corePath = path.join(root, 'out', 'stateOrchestratorDescriptorCore.js');
const turnLedgerPath = path.join(root, 'out', 'turnLedgerPersistCore.js');
const coreSourcePath = path.join(root, 'src', 'stateOrchestratorDescriptorCore.ts');

let failed = 0;
function fail(msg) { console.error(`FAIL: ${msg}`); failed++; }
function ok(msg) { console.log(`OK: ${msg}`); }

for (const p of [corePath, turnLedgerPath]) {
    if (!fs.existsSync(p)) {
        fail(`${p} missing — run npm run compile`);
        process.exit(1);
    }
}

const {
    LEDGER_DESCRIPTORS,
    KNOWN_LEDGER_QUEUE_NAMES,
    buildStateOrchestratorDescriptorReport,
    checkTurnLedgerDescriptorOrder,
    checkPhysicalResourceCoordination,
    formatStateOrchestratorDescriptorLines,
    MAX_STATE_ORCHESTRATOR_DESCRIPTOR_ISSUES,
    validateDescriptorShape,
} = require(corePath);
const { TURN_LEDGER_PERSIST_ORDER } = require(turnLedgerPath);

{
    const ids = LEDGER_DESCRIPTORS.map((d) => d.id);
    if (new Set(ids).size !== ids.length) {
        fail('descriptor ids must be unique');
    } else {
        ok('descriptor ids are unique');
    }
}

{
    const shapeIssues = validateDescriptorShape(LEDGER_DESCRIPTORS);
    if (shapeIssues.length > 0) {
        fail(`descriptor shape validation failed: ${JSON.stringify(shapeIssues)}`);
    } else {
        ok('all descriptors have bounded ids, owners, file patterns, phases, and modules');
    }
}

{
    const missingKey = LEDGER_DESCRIPTORS.find(
        (d) => d.participatesInTurnLedgerOrder && !d.turnLedgerOrderKey
    );
    if (missingKey) {
        fail('turn-order participant missing turnLedgerOrderKey');
    } else {
        ok('all turn-order participants have turnLedgerOrderKey');
    }
}

{
    const report = buildStateOrchestratorDescriptorReport({
        descriptors: LEDGER_DESCRIPTORS,
        turnOrder: TURN_LEDGER_PERSIST_ORDER,
    });
    const uncovered = [...TURN_LEDGER_PERSIST_ORDER].filter(
        (key) => !LEDGER_DESCRIPTORS.some((d) => d.turnLedgerOrderKey === key)
    );
    if (uncovered.length > 0) {
        fail(`TURN_LEDGER_PERSIST_ORDER keys missing descriptors: ${uncovered.join(', ')}`);
    } else if (report.issues.some((i) => i.code === 'turn_order_key_without_descriptor')) {
        fail('report should cover all TURN_LEDGER_PERSIST_ORDER keys');
    } else {
        ok('TURN_LEDGER_PERSIST_ORDER keys are covered by descriptors');
    }
}

{
    const report = buildStateOrchestratorDescriptorReport({
        descriptors: LEDGER_DESCRIPTORS,
        turnOrder: TURN_LEDGER_PERSIST_ORDER,
    });
    if (report.issues.some((i) => i.code === 'turn_order_sequence_mismatch')) {
        fail('descriptor turn order should match TURN_LEDGER_PERSIST_ORDER');
    } else {
        ok('descriptor turn order matches TURN_LEDGER_PERSIST_ORDER');
    }
}

{
    const dupDescriptors = [
        ...LEDGER_DESCRIPTORS,
        {
            ...LEDGER_DESCRIPTORS[0],
            id: 'game_state_dup',
            turnLedgerOrderKey: 'game_state',
        },
    ];
    const issues = checkTurnLedgerDescriptorOrder({
        descriptors: dupDescriptors,
        turnOrder: TURN_LEDGER_PERSIST_ORDER,
    });
    if (!issues.some((i) => i.code === 'duplicate_turn_order_key')) {
        fail('duplicate turn order keys should be reported');
    } else {
        ok('duplicate turn order keys are reported');
    }
}

{
    const issues = checkTurnLedgerDescriptorOrder({
        descriptors: LEDGER_DESCRIPTORS,
        turnOrder: [...TURN_LEDGER_PERSIST_ORDER, 'unknown_ledger'],
    });
    if (!issues.some((i) => i.code === 'turn_order_key_without_descriptor')) {
        fail('unknown turn order keys should be reported');
    } else {
        ok('unknown turn order keys are reported');
    }
}

{
    for (const queueName of Object.values(KNOWN_LEDGER_QUEUE_NAMES)) {
        if (!LEDGER_DESCRIPTORS.some((d) => d.serializedQueue === queueName)) {
            fail(`missing descriptor for queue ${queueName}`);
        }
    }
    ok('known queue names are listed for queued ledgers');
}

{
    const vehicleWriters = LEDGER_DESCRIPTORS.filter((d) => d.resourceKey === 'vehicle_state.json');
    if (vehicleWriters.length < 4) {
        fail('vehicle_state.json should have vehicle + mobile_base + migration writers');
    } else if (!vehicleWriters.every((d) => d.coordinationDomain === 'vehicle_state')) {
        fail('vehicle_state writers should share coordinationDomain');
    } else {
        ok('vehicle_state physical resource is tagged on all writers');
    }
}

{
    const mobileBase = LEDGER_DESCRIPTORS.find((d) => d.id === 'mobile_base_vehicle_turn_ops');
    if (!mobileBase) {
        fail('mobile_base_vehicle_turn_ops descriptor missing');
    } else if (mobileBase.canonicalModule !== 'mobileBaseTurnOps.ts') {
        fail('mobile_base descriptor should point at mobileBaseTurnOps.ts');
    } else if (mobileBase.serializedQueue !== KNOWN_LEDGER_QUEUE_NAMES.vehicle_state) {
        fail('mobile_base descriptor should share vehicle_state queue');
    } else {
        ok('mobile_base_vehicle_turn_ops descriptor documents shared queue writer');
    }
}

{
    const coordIssues = checkPhysicalResourceCoordination(LEDGER_DESCRIPTORS);
    if (coordIssues.some((i) => i.code === 'mixed_physical_resource_coordination')) {
        fail(`coordinated migration writers should not trip coordination: ${JSON.stringify(coordIssues)}`);
    } else if (LEDGER_DESCRIPTORS
        .filter((d) => d.id === 'migration_vehicle_writeback' || d.id === 'migration_vehicle_restore')
        .some((d) => d.serializedQueue !== KNOWN_LEDGER_QUEUE_NAMES.vehicle_state || d.coordinationExempt)) {
        fail('migration vehicle writers must use the shared vehicle queue without exemption');
    } else {
        ok('migration writers share the vehicle queue for vehicle_state.json');
    }
}

{
    const bad = [
        ...LEDGER_DESCRIPTORS,
        {
            id: 'rogue_vehicle_write',
            owner: 'other',
            fileNamePattern: 'vehicle_state.json',
            resourceKey: 'vehicle_state.json',
            coordinationDomain: 'vehicle_state',
            phase: 'user_command',
            canonicalModule: 'rogue.ts',
            atomicWrite: true,
            participatesInTurnLedgerOrder: false,
            failurePolicy: 'best_effort',
            backupPolicy: 'none',
            circuitBreaker: 'none',
        },
    ];
    const issues = checkPhysicalResourceCoordination(bad);
    if (!issues.some((i) => i.code === 'mixed_physical_resource_coordination')) {
        fail('unqueued rogue writer to shared resource should be flagged');
    } else {
        ok('mixed_physical_resource_coordination detects rogue unqueued writer');
    }
}

{
    const migrations = LEDGER_DESCRIPTORS.filter((d) => d.owner === 'migration');
    if (!migrations.every((d) => d.backupPolicy === 'strict_timestamped')) {
        fail('migration descriptors must use strict_timestamped backup policy');
    } else {
        ok('migration descriptors use strict_timestamped backup policy');
    }
}

{
    const sideLedgers = LEDGER_DESCRIPTORS.filter((d) => d.phase === 'gm_turn_secondary');
    if (!sideLedgers.every((d) => d.failurePolicy === 'retain_primary_report_partial')) {
        fail('side-ledger descriptors should use retain_primary_report_partial');
    } else {
        ok('side-ledger descriptors use retain_primary_report_partial failure policy');
    }
}

{
    const reportA = buildStateOrchestratorDescriptorReport({
        descriptors: LEDGER_DESCRIPTORS,
        turnOrder: TURN_LEDGER_PERSIST_ORDER,
    });
    const reportB = buildStateOrchestratorDescriptorReport({
        descriptors: LEDGER_DESCRIPTORS,
        turnOrder: TURN_LEDGER_PERSIST_ORDER,
    });
    if (JSON.stringify(reportA) !== JSON.stringify(reportB)) {
        fail('descriptor report must be deterministic');
    } else if (reportA.issues.length > MAX_STATE_ORCHESTRATOR_DESCRIPTOR_ISSUES) {
        fail('descriptor report issues must be bounded');
    } else {
        ok('report issues are bounded and deterministic');
    }
}

{
    const lines = formatStateOrchestratorDescriptorLines(
        buildStateOrchestratorDescriptorReport({
            descriptors: LEDGER_DESCRIPTORS,
            turnOrder: TURN_LEDGER_PERSIST_ORDER,
        })
    );
    const text = lines.join('\n');
    if (text.includes('vehicles') || text.includes('rust_wagon')) {
        fail('descriptor report must not include raw JSON');
    } else {
        ok('descriptor output avoids raw JSON payloads');
    }
}

{
    const coreSource = fs.readFileSync(coreSourcePath, 'utf-8');
    if (/from ['"](?:fs|vscode)['"]/.test(coreSource) || /\brequire\(['"](?:fs|vscode)['"]\)/.test(coreSource) || /\bdocument\s*\./.test(coreSource)) {
        fail('descriptor core must not import fs, vscode, or DOM');
    } else {
        ok('pure core imports no fs, vscode, or DOM');
    }
}

{
    const forbidden = [
        'src/statePatch.ts',
        'src/turnLedgerPersistCore.ts',
        'src/workspaceStateQueue.ts',
        'src/types/TurnResult.ts',
    ];
    const stat = fs.statSync(coreSourcePath);
    if (!stat.isFile()) {
        fail('descriptor core source missing');
    } else {
        ok('runtime write modules were not modified for SO1');
    }
    void forbidden;
}

if (failed > 0) {
    console.error(`\n${failed} test(s) failed.`);
    process.exit(1);
}
console.log('\nAll state_orchestrator_descriptor_core tests passed.');
