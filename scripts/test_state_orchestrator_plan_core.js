#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const planPath = path.join(root, 'out', 'stateOrchestratorPlanCore.js');
const descriptorPath = path.join(root, 'out', 'stateOrchestratorDescriptorCore.js');
const turnLedgerPath = path.join(root, 'out', 'turnLedgerPersistCore.js');
const planSourcePath = path.join(root, 'src', 'stateOrchestratorPlanCore.ts');

let failed = 0;
function fail(msg) { console.error(`FAIL: ${msg}`); failed++; }
function ok(msg) { console.log(`OK: ${msg}`); }

for (const p of [planPath, descriptorPath, turnLedgerPath]) {
    if (!fs.existsSync(p)) {
        fail(`${p} missing — run npm run compile`);
        process.exit(1);
    }
}

const {
    buildStateTransactionPlan,
    formatStateTransactionPlanLines,
    resolvePlannedLedgerAttempts,
    MAX_STATE_TRANSACTION_PLAN_WARNINGS,
} = require(planPath);
const { LEDGER_DESCRIPTORS } = require(descriptorPath);
const {
    TURN_LEDGER_PERSIST_ORDER,
    persistTurnLedgersAfterCommit,
} = require(turnLedgerPath);

function gmTurnRequest(overrides = {}) {
    return {
        kind: 'gm_turn',
        commitGameStatePlanned: true,
        ...overrides,
    };
}

{
    const plan = buildStateTransactionPlan(gmTurnRequest());
    const gameState = plan.steps.find((s) => s.turnLedgerOrderKey === 'game_state');
    const side = plan.steps.filter((s) => s.turnLedgerOrderKey !== 'game_state');
    if (!gameState || gameState.status !== 'planned') {
        fail(`game_state should be planned on no-op turn: ${JSON.stringify(gameState)}`);
    } else if (!side.every((s) => s.status === 'skipped_no_ops')) {
        fail(`side ledgers should be skipped_no_ops on no-op turn: ${JSON.stringify(side)}`);
    } else {
        ok('no-op gm turn plans primary only; side ledgers skipped_no_ops');
    }
}

{
    const plan = buildStateTransactionPlan(gmTurnRequest({
        discoveryOpsPresent: true,
        campaignResourceOpsPresent: true,
        settlementLayoutOpsPresent: true,
        vehicleOpsPresent: true,
    }));
    const keys = plan.steps.map((s) => s.turnLedgerOrderKey);
    if (keys.join('|') !== TURN_LEDGER_PERSIST_ORDER.join('|')) {
        fail(`step order must match TURN_LEDGER_PERSIST_ORDER: ${keys.join('|')}`);
    } else if (!plan.steps.every((s) => s.status === 'planned')) {
        fail(`all steps should be planned when flags true: ${JSON.stringify(plan.steps)}`);
    } else {
        ok('all side flags true produce five planned steps in turn order');
    }
}

{
    const plan = buildStateTransactionPlan(gmTurnRequest({
        commitGameStatePlanned: false,
        discoveryOpsPresent: true,
        vehicleOpsPresent: true,
    }));
    const gameState = plan.steps.find((s) => s.turnLedgerOrderKey === 'game_state');
    const side = plan.steps.filter((s) => s.turnLedgerOrderKey !== 'game_state');
    if (!gameState || gameState.status !== 'skipped_no_ops') {
        fail(`game_state should be skipped when commit not planned: ${JSON.stringify(gameState)}`);
    } else if (!side.every((s) => s.status === 'blocked_by_primary_failure')) {
        fail(`side ledgers should block when primary not planned: ${JSON.stringify(side)}`);
    } else if (side.some((s) => s.status === 'planned')) {
        fail('no side ledger should be planned when primary commit is false');
    } else {
        ok('commitGameStatePlanned:false blocks all side ledgers');
    }
}

{
    const brokenDescriptors = LEDGER_DESCRIPTORS.filter((d) => d.turnLedgerOrderKey !== 'vehicle_state');
    const plan = buildStateTransactionPlan(gmTurnRequest(), {
        descriptors: brokenDescriptors,
        turnOrder: TURN_LEDGER_PERSIST_ORDER,
    });
    if (!plan.warnings.some((w) => w.code === 'missing_descriptor')) {
        fail('missing descriptor should produce warning');
    } else if (plan.steps.some((s) => s.turnLedgerOrderKey === 'vehicle_state')) {
        fail('missing descriptor should omit step');
    } else {
        ok('missing descriptor produces bounded missing_descriptor warning');
    }
}

{
    const dupDescriptors = [
        ...LEDGER_DESCRIPTORS,
        {
            ...LEDGER_DESCRIPTORS.find((d) => d.id === 'discoveries'),
            id: 'discoveries_dup',
        },
    ];
    const plan = buildStateTransactionPlan(gmTurnRequest({ discoveryOpsPresent: true }), {
        descriptors: dupDescriptors,
    });
    if (plan.steps.filter((s) => s.turnLedgerOrderKey === 'discoveries').length !== 1) {
        fail('duplicate turn-order descriptors should not duplicate plan steps');
    } else {
        ok('duplicate descriptor keys do not duplicate gm turn steps');
    }
}

{
    const plan = buildStateTransactionPlan(gmTurnRequest());
    const stepIds = plan.steps.map((s) => s.ledgerId);
    if (stepIds.includes('world_state') || stepIds.includes('npc_registry')) {
        fail(`non-turn descriptors must not appear in gm turn steps: ${stepIds.join(',')}`);
    } else if (!plan.outOfScopeDescriptorIds.includes('world_state')) {
        fail('world_state should be listed as out of scope');
    } else if (!plan.outOfScopeDescriptorIds.includes('migration_vehicle_writeback')) {
        fail('migration writeback should be listed as out of scope');
    } else {
        ok('non-turn descriptors stay out of gm turn plan');
    }
}

{
    const plan = buildStateTransactionPlan(gmTurnRequest({
        discoveryOpsPresent: true,
        vehicleOpsPresent: true,
    }));
    for (const step of plan.steps) {
        const descriptor = LEDGER_DESCRIPTORS.find((d) => d.id === step.ledgerId);
        if (!descriptor) {
            fail(`descriptor missing for step ${step.ledgerId}`);
            continue;
        }
        if (step.failurePolicy !== descriptor.failurePolicy) {
            fail(`failure policy must come from descriptor for ${step.ledgerId}`);
        }
        if (step.backupPolicy !== descriptor.backupPolicy) {
            fail(`backup policy must come from descriptor for ${step.ledgerId}`);
        }
    }
    ok('failure and backup policies come from descriptors');
}

{
    const reqA = gmTurnRequest({ discoveryOpsPresent: true });
    const reqB = {
        vehicleOpsPresent: undefined,
        campaignResourceOpsPresent: undefined,
        settlementLayoutOpsPresent: undefined,
        discoveryOpsPresent: true,
        commitGameStatePlanned: true,
        kind: 'gm_turn',
    };
    const planA = buildStateTransactionPlan(reqA);
    const planB = buildStateTransactionPlan(reqB);
    if (JSON.stringify(planA) !== JSON.stringify(planB)) {
        fail('plan builder must be deterministic across input object key order');
    } else {
        ok('plan report is deterministic across input key order');
    }
}

{
    const source = fs.readFileSync(planSourcePath, 'utf-8');
    const forbidden = [
        'statePatch',
        'writeJsonAtomic',
        'vscode',
        'discoveryTurnOps',
        'vehicleTurnOps',
        'persistTurnLedgersAfterCommit',
    ];
    for (const token of forbidden) {
        if (source.includes(token)) {
            fail(`plan core must not import or call forbidden token: ${token}`);
        }
    }
    if (/\bfs\b/.test(source)) {
        fail('plan core must not import fs');
    } else {
        ok('plan builder is pure with no host write imports');
    }
}

{
    const plan = buildStateTransactionPlan({ kind: 'diagnostic', commitGameStatePlanned: true });
    if (plan.steps.length !== 0 || !plan.warnings.some((w) => w.code === 'unknown_kind')) {
        fail('unsupported plan kinds should warn and return no steps');
    } else {
        ok('unsupported plan kind returns unknown_kind warning');
    }
}

{
    const plan = buildStateTransactionPlan(gmTurnRequest({
        commitGameStatePlanned: false,
        discoveryOpsPresent: true,
        campaignResourceOpsPresent: true,
        settlementLayoutOpsPresent: true,
        vehicleOpsPresent: true,
    }));
    if (plan.warnings.length > MAX_STATE_TRANSACTION_PLAN_WARNINGS) {
        fail(`warnings must be bounded to ${MAX_STATE_TRANSACTION_PLAN_WARNINGS}, got ${plan.warnings.length}`);
    } else {
        ok('warnings are bounded');
    }
}

{
    const flagCombos = [
        {},
        { discoveryOpsPresent: true },
        { campaignResourceOpsPresent: true },
        { settlementLayoutOpsPresent: true },
        { vehicleOpsPresent: true },
        {
            discoveryOpsPresent: true,
            campaignResourceOpsPresent: true,
            settlementLayoutOpsPresent: true,
            vehicleOpsPresent: true,
        },
    ];

    for (const flags of flagCombos) {
        const request = gmTurnRequest(flags);
        const plan = buildStateTransactionPlan(request);
        const planned = resolvePlannedLedgerAttempts(plan);
        const outcome = persistTurnLedgersAfterCommit({
            discoveryOpsPresent: request.discoveryOpsPresent === true,
            campaignResourceOpsPresent: request.campaignResourceOpsPresent === true,
            settlementLayoutOpsPresent: request.settlementLayoutOpsPresent === true,
            vehicleOpsPresent: request.vehicleOpsPresent === true,
            applyDiscovery: () => ({ ok: true, applied: false }),
            applyCampaignResources: () => ({ ok: true, applied: false }),
            applySettlementLayout: () => ({ ok: true, applied: false }),
            applyVehicleState: () => ({ ok: true, applied: false }),
        });

        if (planned.discoveryAttempted !== outcome.discoveryAttempted) {
            fail(`discovery parity mismatch for ${JSON.stringify(flags)}`);
        } else if (planned.campaignResourcesAttempted !== outcome.campaignResourcesAttempted) {
            fail(`campaign resources parity mismatch for ${JSON.stringify(flags)}`);
        } else if (planned.settlementLayoutAttempted !== outcome.settlementLayoutAttempted) {
            fail(`settlement layout parity mismatch for ${JSON.stringify(flags)}`);
        } else if (planned.vehicleStateAttempted !== outcome.vehicleStateAttempted) {
            fail(`vehicle state parity mismatch for ${JSON.stringify(flags)}`);
        }
    }
    ok('planned side-ledger attempts match persistTurnLedgersAfterCommit when primary commit is planned');
}

{
    const blockedPlan = buildStateTransactionPlan(gmTurnRequest({
        commitGameStatePlanned: false,
        discoveryOpsPresent: true,
    }));
    const blocked = resolvePlannedLedgerAttempts(blockedPlan);
    if (blocked.discoveryAttempted || blocked.vehicleStateAttempted) {
        fail('blocked primary commit must plan zero side attempts');
    } else {
        ok('blocked primary commit plans zero side ledger attempts');
    }
}

{
    const lines = formatStateTransactionPlanLines(buildStateTransactionPlan(gmTurnRequest({
        discoveryOpsPresent: true,
    })));
    const text = lines.join('\n');
    if (!text.includes('game_state') || text.includes('{"')) {
        fail('formatted plan lines should be human-readable without raw JSON payloads');
    } else {
        ok('formatted plan output avoids raw JSON payloads');
    }
}

if (failed > 0) {
    console.error(`\n${failed} test(s) failed.`);
    process.exit(1);
}
console.log('\nAll state_orchestrator_plan_core tests passed.');