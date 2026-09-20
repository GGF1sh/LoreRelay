#!/usr/bin/env node
'use strict';

/**
 * PR2 — valid ledger no-op vs write failure (discovery / campaign / settlement).
 */

const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const ledgerPath = path.join(root, 'out', 'turnLedgerPersistCore.js');
const discoveryCorePath = path.join(root, 'out', 'discoveryTurnOpsCore.js');
const campaignCorePath = path.join(root, 'out', 'campaignResourcesCore.js');

let failed = 0;
function fail(msg) { console.error(`FAIL: ${msg}`); failed++; }
function ok(msg) { console.log(`OK: ${msg}`); }

for (const p of [ledgerPath, discoveryCorePath, campaignCorePath]) {
    if (!fs.existsSync(p)) {
        fail(`${p} missing — run npm run compile`);
        process.exit(1);
    }
}

const {
    persistTurnLedgersAfterCommit,
    normalizeLedgerApplyResult,
} = require(ledgerPath);
const { applyDiscoveryOpsToLedger } = require(discoveryCorePath);
const {
    applyCampaignResourceOps,
    defaultCampaignResourceQuantities,
} = require(campaignCorePath);

const kit = {
    id: 'scrapbound',
    resources: [{ id: 'medicine', label: 'Medicine', initial: 10 }],
};

function ledgerInput(overrides = {}) {
    return {
        discoveryOpsPresent: false,
        campaignResourceOpsPresent: false,
        settlementLayoutOpsPresent: false,
        vehicleOpsPresent: false,
        applyDiscovery: () => ({ ok: true, applied: false }),
        applyCampaignResources: () => ({ ok: true, applied: false }),
        applySettlementLayout: () => ({ ok: true, applied: false }),
        applyVehicleState: () => ({ ok: true, applied: false }),
        ...overrides,
    };
}

{
    const normalized = normalizeLedgerApplyResult({ ok: true, applied: false });
    if (!normalized.ok || normalized.applied) {
        fail(`structured no-op normalize: ${JSON.stringify(normalized)}`);
    } else {
        ok('normalizeLedgerApplyResult preserves ok:true applied:false');
    }
}

{
    const outcome = persistTurnLedgersAfterCommit(ledgerInput({
        discoveryOpsPresent: true,
        applyDiscovery: () => ({ ok: true, applied: false }),
    }));
    if (!outcome.ok || outcome.partial || outcome.failedTargets.length !== 0 || outcome.discoveryApplied) {
        fail(`discovery valid no-op ledger: ${JSON.stringify(outcome)}`);
    } else {
        ok('discovery valid no-op is not a failed target');
    }
}

{
    const outcome = persistTurnLedgersAfterCommit(ledgerInput({
        campaignResourceOpsPresent: true,
        applyCampaignResources: () => ({ ok: true, applied: false }),
    }));
    if (!outcome.ok || outcome.partial || outcome.failedTargets.length !== 0 || outcome.campaignResourcesApplied) {
        fail(`campaign resources valid no-op ledger: ${JSON.stringify(outcome)}`);
    } else {
        ok('campaign resources valid no-op is not a failed target');
    }
}

{
    const outcome = persistTurnLedgersAfterCommit(ledgerInput({
        settlementLayoutOpsPresent: true,
        applySettlementLayout: () => ({ ok: true, applied: false }),
    }));
    if (!outcome.ok || outcome.partial || outcome.failedTargets.length !== 0 || outcome.settlementLayoutApplied) {
        fail(`settlement layout valid no-op ledger: ${JSON.stringify(outcome)}`);
    } else {
        ok('settlement layout valid no-op is not a failed target');
    }
}

{
    const outcome = persistTurnLedgersAfterCommit(ledgerInput({
        vehicleOpsPresent: true,
        applyVehicleState: () => ({ ok: true, applied: false }),
    }));
    if (!outcome.ok || outcome.partial || outcome.failedTargets.length !== 0 || outcome.vehicleStateApplied) {
        fail(`vehicle state valid no-op ledger: ${JSON.stringify(outcome)}`);
    } else {
        ok('vehicle state valid no-op is not a failed target');
    }
}

{
    const outcome = persistTurnLedgersAfterCommit(ledgerInput({
        discoveryOpsPresent: true,
        campaignResourceOpsPresent: true,
        settlementLayoutOpsPresent: true,
        applyDiscovery: () => ({ ok: false, applied: false }),
        applyCampaignResources: () => ({ ok: true, applied: false }),
        applySettlementLayout: () => ({ ok: true, applied: true }),
    }));
    if (outcome.ok || !outcome.partial || outcome.failedTargets.join(',') !== 'discovery') {
        fail(`discovery write failure with other ledgers: ${JSON.stringify(outcome)}`);
    } else {
        ok('discovery write failure remains failed while no-op/resources/layout succeed');
    }
}

{
    const soldLedger = {
        version: 1,
        entries: [{
            id: 'relic_a',
            kind: 'material',
            label: 'Shard',
            status: 'sold',
            identifiedLabel: 'Relay housing',
        }],
    };
    const next = applyDiscoveryOpsToLedger(
        soldLedger,
        [{ op: 'update', id: 'relic_a', status: 'sold' }],
        5
    );
    if (JSON.stringify(soldLedger) !== JSON.stringify(next)) {
        fail('discovery core should no-op on identical sold update');
    } else {
        ok('discovery core produces identical ledger for valid no-op update');
    }
}

{
    const current = {
        version: 1,
        quantities: defaultCampaignResourceQuantities(kit),
    };
    const next = applyCampaignResourceOps(
        current,
        [{ op: 'set', resourceId: 'medicine', amount: 10 }],
        kit
    );
    if (JSON.stringify(current) !== JSON.stringify(next)) {
        fail(`campaign resources core should no-op identical set: ${JSON.stringify(next)}`);
    } else {
        ok('campaign resources core produces identical doc for valid no-op set');
    }
}

if (failed > 0) {
    process.exit(1);
}
console.log('turn ledger valid no-op: all tests passed.');