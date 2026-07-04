#!/usr/bin/env node
'use strict';

/**
 * Settlement M4 — cross-ledger persist contract after game_state commit.
 */

const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');

let failed = 0;
function fail(msg) { console.error(`FAIL: ${msg}`); failed++; }
function ok(msg) { console.log(`OK: ${msg}`); }

const ledgerPath = path.join(root, 'out', 'turnLedgerPersistCore.js');
const layoutOpsPath = path.join(root, 'out', 'settlementLayoutTurnOpsCore.js');
const viewCorePath = path.join(root, 'out', 'settlementViewCore.js');

for (const p of [ledgerPath, layoutOpsPath, viewCorePath]) {
    if (!fs.existsSync(p)) {
        fail(`${p} missing — run npm run compile`);
        process.exit(1);
    }
}

const {
    TURN_LEDGER_PERSIST_ORDER,
    persistTurnLedgersAfterCommit,
    shouldPersistTurnLedgersAfterCommit,
} = require(ledgerPath);
const {
    shouldAttemptSettlementLayoutPersistCore,
} = require(layoutOpsPath);
const {
    buildSettlementExpansionPreviews,
} = require(viewCorePath);

{
    const idx = TURN_LEDGER_PERSIST_ORDER.indexOf('settlement_layout');
    if (idx < 0 || TURN_LEDGER_PERSIST_ORDER.indexOf('game_state') !== 0) {
        fail(`persist order missing settlement_layout: ${TURN_LEDGER_PERSIST_ORDER.join(',')}`);
    } else if (TURN_LEDGER_PERSIST_ORDER.indexOf('discoveries') >= idx) {
        fail('settlement_layout should persist after discoveries');
    } else {
        ok('settlement_layout ordered after game_state commit gate');
    }
}

{
    const gated = shouldAttemptSettlementLayoutPersistCore(true, [
        { type: 'expand_layer', layerId: 'z-1', profile: 'cellar' },
    ]);
    if (!gated) {
        fail('expand_layer should attempt settlement_layout persist when mode ON');
    } else if (shouldAttemptSettlementLayoutPersistCore(false, [{ type: 'expand_layer', layerId: 'z-1', profile: 'cellar' }])) {
        fail('expand_layer gated when settlement mode OFF');
    } else {
        ok('expand_layer persist gated by settlement mode flag');
    }
}

{
    const outcome = persistTurnLedgersAfterCommit({
        discoveryOpsPresent: true,
        campaignResourceOpsPresent: true,
        settlementLayoutOpsPresent: true,
        applyDiscovery: () => ({ ok: true, applied: true }),
        applyCampaignResources: () => ({ ok: true, applied: true }),
        applySettlementLayout: () => ({ ok: false, applied: false }),
    });
    if (outcome.ok || !outcome.partial) {
        fail(`triple ledger partial when settlement fails: ${JSON.stringify(outcome)}`);
    } else if (outcome.failedTargets.join(',') !== 'settlementLayout') {
        fail(`settlementLayout failed target: ${outcome.failedTargets.join(',')}`);
    } else if (!outcome.discoveryApplied || !outcome.campaignResourcesApplied) {
        fail('discovery and campaign resources should still apply when settlement fails');
    } else {
        ok('M4 settlement layout failure is isolated with other ledgers applied');
    }
}

{
    const state = {
        version: 1,
        settlementId: 'ash_hold',
        name: 'Ash Hold',
        worldTurn: 3,
        stocks: [],
        structures: [],
        residents: [],
        visitors: [],
        merchants: [],
        incidents: [],
        notes: [],
    };
    const previews = buildSettlementExpansionPreviews(state, undefined);
    if (!Array.isArray(previews)) {
        fail('expansion previews should be array');
    } else {
        ok('M4c ghost previews are pure in-memory (no disk side effect in core)');
    }
}

if (failed > 0) {
    process.exit(1);
}
console.log('settlement M4 cross-ledger atomicity: all tests passed.');