#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const hostPath = path.join(root, 'out', 'stateOrchestratorPlanHostCore.js');
const planPath = path.join(root, 'out', 'stateOrchestratorPlanCore.js');
const turnLedgerPath = path.join(root, 'out', 'turnLedgerPersistCore.js');
const hostSourcePath = path.join(root, 'src', 'stateOrchestratorPlanHostCore.ts');

let failed = 0;
function fail(msg) { console.error(`FAIL: ${msg}`); failed++; }
function ok(msg) { console.log(`OK: ${msg}`); }

for (const p of [hostPath, planPath, turnLedgerPath]) {
    if (!fs.existsSync(p)) {
        fail(`${p} missing — run npm run compile`);
        process.exit(1);
    }
}

const {
    buildGmTurnPlanRequestFromTurnResult,
    buildGmTurnTransactionPlanFromTurnResult,
} = require(hostPath);
const {
    resolvePlannedLedgerAttempts,
} = require(planPath);
const {
    persistTurnLedgersAfterCommit,
} = require(turnLedgerPath);

const rulesAllOn = {
    enableSettlementMode: true,
    enableVehicleSystem: true,
    enableMobileBaseSystem: true,
};

const rulesAllOff = {
    enableSettlementMode: false,
    enableVehicleSystem: false,
    enableMobileBaseSystem: false,
};

{
    const turnResult = {};
    const request = buildGmTurnPlanRequestFromTurnResult(turnResult, rulesAllOn);
    if (!request.commitGameStatePlanned || request.kind !== 'gm_turn') {
        fail(`default request should be gm_turn with commit planned: ${JSON.stringify(request)}`);
    } else if (request.discoveryOpsPresent || request.campaignResourceOpsPresent
        || request.settlementLayoutOpsPresent || request.vehicleOpsPresent) {
        fail(`empty turn_result should have no side ops: ${JSON.stringify(request)}`);
    } else {
        ok('empty turn_result yields primary-only request flags');
    }
}

{
    const turnResult = {
        discoveryOps: [{ op: 'add', id: 'find_1', label: 'Rusty key' }],
        campaignResourceOps: [{ op: 'delta', resourceId: 'rations', amount: -1 }],
        settlementOps: [{ type: 'expand_layer', layerId: 'z1', profile: 'cellar' }],
        vehicleOps: [{ type: 'refuel_vehicle', vehicleId: 'wagon_a', amount: 5 }],
    };
    const request = buildGmTurnPlanRequestFromTurnResult(turnResult, rulesAllOn);
    if (!request.discoveryOpsPresent || !request.campaignResourceOpsPresent
        || !request.settlementLayoutOpsPresent || !request.vehicleOpsPresent) {
        fail(`all side ops should be present with rules on: ${JSON.stringify(request)}`);
    } else {
        ok('all side ops detected when game rules enable subsystems');
    }
}

{
    const turnResult = {
        discoveryOps: [{ op: 'add', id: 'find_1' }],
        settlementOps: [{ type: 'expand_layer', layerId: 'z1', profile: 'cellar' }],
        vehicleOps: [{ type: 'move_vehicle', vehicleId: 'wagon_a', locationId: 'dock' }],
        mobileBaseOps: [{ type: 'undock_mobile_base', vehicleId: 'ashcrawler_hull' }],
    };
    const requestOff = buildGmTurnPlanRequestFromTurnResult(turnResult, rulesAllOff);
    if (requestOff.settlementLayoutOpsPresent || requestOff.vehicleOpsPresent) {
        fail(`gated ops should be false when rules off: ${JSON.stringify(requestOff)}`);
    } else if (!requestOff.discoveryOpsPresent) {
        fail('discoveryOps should not be gated by settlement/vehicle rules');
    } else {
        ok('settlement/vehicle/mobileBase flags respect game_rules gates');
    }

    const requestOn = buildGmTurnPlanRequestFromTurnResult(turnResult, rulesAllOn);
    if (!requestOn.vehicleOpsPresent) {
        fail('vehicleOpsPresent should be true when vehicle or mobileBase ops present');
    } else {
        ok('vehicleOpsPresent true when vehicleOps or mobileBaseOps present');
    }
}

{
    const turnResult = {
        mobileBaseOps: [{ type: 'dock_mobile_base', vehicleId: 'ashcrawler_hull', locationId: 'dock' }],
    };
    const request = buildGmTurnPlanRequestFromTurnResult(turnResult, rulesAllOn);
    if (!request.vehicleOpsPresent) {
        fail('mobileBaseOps alone should set vehicleOpsPresent when triple mobile-base gate is on');
    } else {
        ok('mobileBaseOps sets vehicleOpsPresent under vehicle+settlement+mobileBase flags');
    }
}

{
    const turnResult = {
        discoveryOps: [{ op: 'update', id: 'find_1', status: 'sold' }],
        vehicleOps: [{ type: 'repair_vehicle', vehicleId: 'wagon_a', amount: 10 }],
    };
    const request = buildGmTurnPlanRequestFromTurnResult(turnResult, rulesAllOn, {
        commitGameStatePlanned: false,
    });
    if (request.commitGameStatePlanned) {
        fail('commitGameStatePlanned:false option should propagate');
    } else {
        ok('commitGameStatePlanned option propagates to request');
    }
}

{
    const turnResult = {
        discoveryOps: [{ op: 'add', id: 'find_1' }],
        campaignResourceOps: [{ op: 'set', resourceId: 'gold', amount: 100 }],
        settlementOps: [{ type: 'expand_layer', layerId: 'z2', profile: 'attic' }],
        vehicleOps: [{ type: 'damage_vehicle', vehicleId: 'wagon_a', amount: 5 }],
    };
    const request = buildGmTurnPlanRequestFromTurnResult(turnResult, rulesAllOn);
    const plan = buildGmTurnTransactionPlanFromTurnResult(turnResult, rulesAllOn);
    const planned = resolvePlannedLedgerAttempts(plan);
    const runtime = persistTurnLedgersAfterCommit({
        discoveryOpsPresent: request.discoveryOpsPresent,
        campaignResourceOpsPresent: request.campaignResourceOpsPresent,
        settlementLayoutOpsPresent: request.settlementLayoutOpsPresent,
        vehicleOpsPresent: request.vehicleOpsPresent,
        applyDiscovery: () => ({ ok: true, applied: true }),
        applyCampaignResources: () => ({ ok: true, applied: true }),
        applySettlementLayout: () => ({ ok: true, applied: true }),
        applyVehicleState: () => ({ ok: true, applied: true }),
    });
    if (planned.discoveryAttempted !== runtime.discoveryAttempted
        || planned.campaignResourcesAttempted !== runtime.campaignResourcesAttempted
        || planned.settlementLayoutAttempted !== runtime.settlementLayoutAttempted
        || planned.vehicleStateAttempted !== runtime.vehicleStateAttempted) {
        fail(`plan parity mismatch planned=${JSON.stringify(planned)} runtime=${JSON.stringify(runtime)}`);
    } else {
        ok('planned ledger attempts match persistTurnLedgersAfterCommit input flags');
    }
}

{
    const source = fs.readFileSync(hostSourcePath, 'utf-8');
    const forbidden = [
        'writeJsonAtomic',
        'vscode',
        'discoveryTurnOps',
        'vehicleTurnOps',
        'mobileBaseTurnOps',
        'gameRules.ts',
    ];
    for (const token of forbidden) {
        if (source.includes(token)) {
            fail(`host core must not import or call forbidden token: ${token}`);
        }
    }
    if (/\bfs\b/.test(source)) {
        fail('host core must not import fs');
    } else {
        ok('host core is pure with no host write imports');
    }
}

if (failed > 0) {
    console.error(`\n${failed} test(s) failed`);
    process.exit(1);
}
console.log('\nAll state orchestrator plan host core tests passed');