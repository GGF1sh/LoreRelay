#!/usr/bin/env node
'use strict';

/**
 * PR-D — cross-ledger partial failure after game_state commit.
 * Documents compensation policy: no game_state rollback; surface failed targets.
 */

const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const corePath = path.join(root, 'out', 'turnLedgerPersistCore.js');
const stateCorePath = path.join(root, 'out', 'stateManagerCore.js');
const commercePath = path.join(root, 'out', 'commerceCore.js');
const discoveryOpsPath = path.join(root, 'out', 'discoveryTurnOpsCore.js');

let failed = 0;
function fail(msg) { console.error(`FAIL: ${msg}`); failed++; }
function ok(msg) { console.log(`OK: ${msg}`); }

for (const p of [corePath, stateCorePath, commercePath, discoveryOpsPath]) {
    if (!fs.existsSync(p)) {
        fail(`${p} missing — run npm run compile`);
        process.exit(1);
    }
}

const {
    CROSS_LEDGER_COMPENSATION_POLICY,
    TURN_LEDGER_PERSIST_ORDER,
    persistTurnLedgersAfterCommit,
    shouldPersistTurnLedgersAfterCommit,
} = require(corePath);
const { resolveGameStatePersistPlan } = require(stateCorePath);
const { applyTradeOp } = require(commercePath);
const { applyDiscoveryOpsToLedger } = require(discoveryOpsPath);

// --- Contract ---

{
    if (!TURN_LEDGER_PERSIST_ORDER.includes('game_state')
        || TURN_LEDGER_PERSIST_ORDER[0] !== 'game_state') {
        fail(`persist order: ${TURN_LEDGER_PERSIST_ORDER.join(',')}`);
    } else if (TURN_LEDGER_PERSIST_ORDER[TURN_LEDGER_PERSIST_ORDER.length - 1] !== 'settlement_layout') {
        fail(`settlement_layout should be last in persist order: ${TURN_LEDGER_PERSIST_ORDER.join(',')}`);
    } else {
        ok('game_state is first and settlement_layout is last in turn ledger persist order');
    }
}

{
    if (CROSS_LEDGER_COMPENSATION_POLICY.rollbackGameStateOnLedgerFailure !== false) {
        fail('compensation must not rollback game_state on ledger failure');
    } else {
        ok('compensation policy retains game_state on ledger failure');
    }
}

// --- Commit gate (reinforces PR-3 / turn_artifact_commit_atomicity) ---

{
    if (shouldPersistTurnLedgersAfterCommit(false)) {
        fail('ledger persist should be gated on commit.ok');
    } else {
        ok('commit failure gates independent ledger writes');
    }
}

{
    const plan = resolveGameStatePersistPlan({
        schemaVersion: 2,
        entries: [{ id: 'bad id', role: 'gm', sender: 'GM', content: 'x' }],
    }, 'strict');
    if (shouldPersistTurnLedgersAfterCommit(plan.action === 'write')) {
        fail('strict skip should gate ledger writes');
    } else {
        ok('strict skip prevents ledger persist after failed commit plan');
    }
}

// --- persistTurnLedgersAfterCommit outcomes ---

{
    const outcome = persistTurnLedgersAfterCommit({
        discoveryOpsPresent: false,
        campaignResourceOpsPresent: false,
        settlementLayoutOpsPresent: false,
        applyDiscovery: () => { throw new Error('should not run'); },
        applyCampaignResources: () => { throw new Error('should not run'); },
        applySettlementLayout: () => { throw new Error('should not run'); },
    });
    if (!outcome.ok || outcome.partial || outcome.failedTargets.length !== 0) {
        fail(`no-op ledger persist: ${JSON.stringify(outcome)}`);
    } else {
        ok('no ledger ops — outcome ok without invoking apply fns');
    }
}

{
    const outcome = persistTurnLedgersAfterCommit({
        discoveryOpsPresent: true,
        campaignResourceOpsPresent: true,
        settlementLayoutOpsPresent: false,
        applyDiscovery: () => true,
        applyCampaignResources: () => true,
        applySettlementLayout: () => true,
    });
    if (!outcome.ok || outcome.partial || outcome.failedTargets.length !== 0) {
        fail(`both ledgers succeed: ${JSON.stringify(outcome)}`);
    } else {
        ok('both ledger writes succeed');
    }
}

{
    const outcome = persistTurnLedgersAfterCommit({
        discoveryOpsPresent: true,
        campaignResourceOpsPresent: true,
        settlementLayoutOpsPresent: false,
        applyDiscovery: () => true,
        applyCampaignResources: () => false,
        applySettlementLayout: () => true,
    });
    if (outcome.ok || !outcome.partial || outcome.failedTargets.join(',') !== 'campaignResources') {
        fail(`partial discovery ok / resources fail: ${JSON.stringify(outcome)}`);
    } else {
        ok('partial failure — discovery applied, campaign resources failed');
    }
}

{
    const outcome = persistTurnLedgersAfterCommit({
        discoveryOpsPresent: true,
        campaignResourceOpsPresent: true,
        settlementLayoutOpsPresent: false,
        applyDiscovery: () => false,
        applyCampaignResources: () => true,
        applySettlementLayout: () => true,
    });
    if (outcome.ok || !outcome.partial || outcome.failedTargets.join(',') !== 'discovery') {
        fail(`partial resources ok / discovery fail: ${JSON.stringify(outcome)}`);
    } else {
        ok('partial failure — campaign resources applied, discovery failed');
    }
}

{
    const outcome = persistTurnLedgersAfterCommit({
        discoveryOpsPresent: true,
        campaignResourceOpsPresent: true,
        settlementLayoutOpsPresent: false,
        applyDiscovery: () => false,
        applyCampaignResources: () => false,
        applySettlementLayout: () => true,
    });
    if (outcome.ok || outcome.partial || outcome.failedTargets.length !== 2) {
        fail(`total ledger failure: ${JSON.stringify(outcome)}`);
    } else {
        ok('both ledger writes fail — not partial, all targets failed');
    }
}

{
    const outcome = persistTurnLedgersAfterCommit({
        discoveryOpsPresent: true,
        campaignResourceOpsPresent: false,
        settlementLayoutOpsPresent: false,
        applyDiscovery: () => false,
        applyCampaignResources: () => true,
        applySettlementLayout: () => true,
    });
    if (outcome.ok || outcome.partial || outcome.failedTargets.join(',') !== 'discovery') {
        fail(`single discovery failure: ${JSON.stringify(outcome)}`);
    } else {
        ok('single-ledger failure is not classified as partial');
    }
}

{
    const outcome = persistTurnLedgersAfterCommit({
        discoveryOpsPresent: true,
        campaignResourceOpsPresent: false,
        settlementLayoutOpsPresent: true,
        applyDiscovery: () => true,
        applyCampaignResources: () => true,
        applySettlementLayout: () => false,
    });
    if (outcome.ok || !outcome.partial || outcome.failedTargets.join(',') !== 'settlementLayout') {
        fail(`partial discovery ok / settlement layout fail: ${JSON.stringify(outcome)}`);
    } else {
        ok('partial failure — discovery applied, settlement layout failed');
    }
}

{
    const outcome = persistTurnLedgersAfterCommit({
        discoveryOpsPresent: true,
        campaignResourceOpsPresent: true,
        settlementLayoutOpsPresent: true,
        applyDiscovery: () => ({ ok: true, applied: false }),
        applyCampaignResources: () => ({ ok: true, applied: false }),
        applySettlementLayout: () => ({ ok: true, applied: false }),
    });
    if (!outcome.ok || outcome.partial || outcome.failedTargets.length !== 0) {
        fail(`all ledger valid no-ops should succeed: ${JSON.stringify(outcome)}`);
    } else if (outcome.discoveryApplied || outcome.campaignResourcesApplied || outcome.settlementLayoutApplied) {
        fail('valid no-ops should not mark applied true');
    } else {
        ok('discovery, campaign resources, and settlement layout no-ops are handled');
    }
}

{
    const outcome = persistTurnLedgersAfterCommit({
        discoveryOpsPresent: true,
        campaignResourceOpsPresent: false,
        settlementLayoutOpsPresent: false,
        applyDiscovery: () => ({ ok: true, applied: false }),
        applyCampaignResources: () => true,
        applySettlementLayout: () => true,
    });
    if (!outcome.ok || outcome.partial || outcome.failedTargets.length !== 0) {
        fail(`discovery valid no-op alone: ${JSON.stringify(outcome)}`);
    } else {
        ok('discovery valid no-op is treated as handled, not failed');
    }
}

{
    const outcome = persistTurnLedgersAfterCommit({
        discoveryOpsPresent: false,
        campaignResourceOpsPresent: true,
        settlementLayoutOpsPresent: false,
        applyDiscovery: () => true,
        applyCampaignResources: () => ({ ok: true, applied: false }),
        applySettlementLayout: () => true,
    });
    if (!outcome.ok || outcome.partial || outcome.failedTargets.length !== 0) {
        fail(`campaign resources valid no-op alone: ${JSON.stringify(outcome)}`);
    } else {
        ok('campaign resources valid no-op is treated as handled, not failed');
    }
}

{
    const outcome = persistTurnLedgersAfterCommit({
        discoveryOpsPresent: true,
        campaignResourceOpsPresent: false,
        settlementLayoutOpsPresent: true,
        applyDiscovery: () => true,
        applyCampaignResources: () => true,
        applySettlementLayout: () => ({ ok: false, applied: false }),
    });
    if (outcome.ok || !outcome.partial || outcome.failedTargets.join(',') !== 'settlementLayout') {
        fail(`structured settlement layout failure should be failed target: ${JSON.stringify(outcome)}`);
    } else {
        ok('structured settlement layout failure remains a failed target');
    }
}

// --- sell_discovery + discoveryOps split-brain scenario (pure) ---

const forge = {
    commodities: [{ id: 'relic', name: 'Relic', basePrice: 100, weight: 1 }],
    markets: [{ locationId: 'hub', commodityIds: ['relic'], supplyBias: 1 }],
    transportKinds: [{ id: 'wagon', name: 'Wagon', capacity: 20, speed: 1, foodPerDay: 1 }],
};

{
    const commerceBefore = { credits: 100, cargo: [], transportId: 'wagon', food: 10 };
    const ledgerBefore = {
        version: 1,
        entries: [{
            id: 'relic_a',
            kind: 'material',
            label: 'Shard',
            status: 'appraised',
            estValue: 200,
        }],
    };
    const trade = applyTradeOp(
        forge,
        { hub: { relic: { stock: 5, priceIndex: 1 } } },
        commerceBefore,
        { op: 'sell_discovery', discoveryId: 'relic_a', value: 200 },
        ledgerBefore
    );
    if (!trade.ok || trade.commerce.credits !== 300) {
        fail(`sell_discovery commerce apply: ${JSON.stringify(trade)}`);
    } else {
        ok('sell_discovery increases game_state commerce credits in-memory');
    }

    const ledgerAfterFailedWrite = ledgerBefore;
    const discoveryOpApplied = applyDiscoveryOpsToLedger(
        ledgerAfterFailedWrite,
        [{ op: 'update', id: 'relic_a', status: 'sold' }],
        5
    );
    const simulatedPersist = () => ({ ok: false, applied: false });
    const outcome = persistTurnLedgersAfterCommit({
        discoveryOpsPresent: true,
        campaignResourceOpsPresent: false,
        settlementLayoutOpsPresent: false,
        applyDiscovery: simulatedPersist,
        applyCampaignResources: () => true,
        applySettlementLayout: () => true,
    });

    if (ledgerAfterFailedWrite.entries[0].status !== 'appraised') {
        fail('disk ledger unchanged when write fails');
    } else if (discoveryOpApplied.entries[0].status !== 'sold') {
        fail('in-memory merge would mark sold even when persist fails');
    } else if (outcome.ok || outcome.failedTargets[0] !== 'discovery') {
        fail(`sell_discovery persist failure outcome: ${JSON.stringify(outcome)}`);
    } else if (trade.commerce.credits !== 300) {
        fail('game_state credits remain committed despite discovery persist failure');
    } else {
        ok('sell_discovery split: credits committed, discovery disk stale — compensation logs failure');
    }
}

// --- Simulated turn pipeline ordering ---

function simulateTurnPipeline(commitOk, discoveryWriter, resourceWriter) {
    if (!shouldPersistTurnLedgersAfterCommit(commitOk)) {
        return { phase: 'gated', gameStateCommitted: false, ledgerOutcome: null };
    }
    const gameStateCommitted = true;
    const ledgerOutcome = persistTurnLedgersAfterCommit({
        discoveryOpsPresent: true,
        campaignResourceOpsPresent: true,
        settlementLayoutOpsPresent: false,
        applyDiscovery: discoveryWriter,
        applyCampaignResources: resourceWriter,
        applySettlementLayout: () => true,
    });
    return { phase: 'post-commit', gameStateCommitted, ledgerOutcome };
}

{
    const result = simulateTurnPipeline(false, () => true, () => true);
    if (result.phase !== 'gated' || result.gameStateCommitted) {
        fail(`pipeline gated on commit fail: ${JSON.stringify(result)}`);
    } else {
        ok('turn pipeline skips ledger phase when commit fails');
    }
}

{
    const result = simulateTurnPipeline(true, () => true, () => false);
    if (!result.gameStateCommitted || result.ledgerOutcome?.ok || !result.ledgerOutcome?.partial) {
        fail(`pipeline partial after commit: ${JSON.stringify(result)}`);
    } else {
        ok('turn pipeline keeps game_state committed on partial ledger failure');
    }
}

if (failed > 0) {
    process.exit(1);
}
console.log('cross ledger partial failure: all tests passed.');
