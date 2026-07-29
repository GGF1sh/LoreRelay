import * as assert from 'node:assert/strict';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { test } from 'node:test';
import {
    applyCombatOutcomeReceiptOnce,
    applyAllPendingCombatOutcomes,
    sortPendingCombatReceiptsForApply,
} from './campaignCombatApplyHost';
import { COMBAT_BATTLE_HISTORY_KEY } from './campaignCombatApplyCore';
import { writePendingCombatOutcomeReceipt, readAppliedCombatOutcomeMarker } from './campaignCombatPendingStore';
import { CombatOutcomeReceipt, sha256Stable } from './campaignCombatReceiptCore';
import { readStateRevision } from './workspaceStateQueueCore';

function makeReceipt(sessionId: string, finalHp: number, revision = 0): CombatOutcomeReceipt {
    const body: Omit<CombatOutcomeReceipt, 'receiptHash'> = {
        schemaVersion: 'combat-outcome-receipt-v1',
        applyEligible: true,
        combatSessionId: sessionId,
        encounterId: 'enc',
        requestId: 'req',
        campaignInstanceId: 'camp',
        timelineEpochId: 'epoch',
        sourceCampaignRevision: revision,
        requestedMode: 'command',
        effectiveMode: 'command',
        terminalOutcomeCode: 'ALLY_WIN',
        finalTick: 5,
        participants: [{
            entityId: 'ally_1', unitId: 'ally_1', team: 0,
            finalHp, maxHp: 20, alive: finalHp > 0, dead: finalHp <= 0,
        }],
        objective: { type: 'annihilate', result: 'success' },
        simulationResultHash: 'sim',
    };
    return { ...body, receiptHash: sha256Stable(body) };
}

test('apply once writes history+HP, APPLIED marker, removes PENDING; second apply is no-op', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lr-apply-once-'));
    const statePath = path.join(root, 'game_state.json');
    fs.writeFileSync(statePath, JSON.stringify({
        status: { hp: { current: 18, max: 20 }, condition: ['healthy'] },
        entries: [],
    }, null, 2));
    const receipt = makeReceipt('sess-a', 9);
    writePendingCombatOutcomeReceipt(root, receipt);

    const first = applyCombatOutcomeReceiptOnce(root, receipt);
    assert.equal(first.ok, true);
    if (!first.ok) return;
    assert.equal(first.status, 'applied');
    assert.equal(first.playerHpUpdated, true);

    const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
    assert.equal(state.status.hp.current, 9);
    assert.equal((state[COMBAT_BATTLE_HISTORY_KEY] as unknown[]).length, 1);
    assert.ok(readAppliedCombatOutcomeMarker(root, 'sess-a'));
    assert.equal(fs.existsSync(path.join(root, '.text-adventure', 'combat', 'pending', 'sess-a.json')), false);

    // Restore pending to simulate re-observation; still no double apply
    writePendingCombatOutcomeReceipt(root, receipt);
    const second = applyCombatOutcomeReceiptOnce(root, receipt);
    assert.equal(second.ok, true);
    if (!second.ok) return;
    assert.equal(second.status, 'already_applied');
    const state2 = JSON.parse(fs.readFileSync(statePath, 'utf8'));
    assert.equal((state2[COMBAT_BATTLE_HISTORY_KEY] as unknown[]).length, 1);
    assert.equal(state2.status.hp.current, 9);
});

test('applyAllPending processes queue; crash repair via history receiptHash', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lr-apply-all-'));
    const statePath = path.join(root, 'game_state.json');
    const receipt = makeReceipt('sess-b', 4);
    // Pre-seed history as if game_state commit succeeded before APPLIED write
    fs.writeFileSync(statePath, JSON.stringify({
        status: { hp: { current: 4, max: 20 } },
        [COMBAT_BATTLE_HISTORY_KEY]: [{
            combatSessionId: 'sess-b',
            encounterId: 'enc',
            requestId: 'req',
            terminalOutcomeCode: 'ALLY_WIN',
            finalTick: 5,
            receiptHash: receipt.receiptHash,
            simulationResultHash: 'sim',
            sourceCampaignRevision: 0,
        }],
    }, null, 2));
    writePendingCombatOutcomeReceipt(root, receipt);

    const results = applyAllPendingCombatOutcomes(root);
    assert.equal(results.length, 1);
    assert.equal(results[0].ok, true);
    if (!results[0].ok) return;
    assert.equal(results[0].status, 'already_applied');
    assert.ok(readAppliedCombatOutcomeMarker(root, 'sess-b'));
});

test('apply bumps stateRevision for concurrent turn detection', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lr-apply-rev-'));
    const statePath = path.join(root, 'game_state.json');
    fs.writeFileSync(statePath, JSON.stringify({
        status: { hp: { current: 18, max: 20 } },
        stateRevision: 3,
    }, null, 2));
    const receipt = makeReceipt('sess-rev', 10);
    writePendingCombatOutcomeReceipt(root, receipt);
    const r = applyCombatOutcomeReceiptOnce(root, receipt);
    assert.equal(r.ok, true);
    const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
    assert.equal(readStateRevision(state), 4);
    assert.equal(state.status.hp.current, 10);
});

test('sortPendingCombatReceiptsForApply orders by campaign revision', () => {
    const a = makeReceipt('sess-z', 1, 2);
    const b = makeReceipt('sess-a', 1, 0);
    const c = makeReceipt('sess-m', 1, 1);
    const sorted = sortPendingCombatReceiptsForApply([a, b, c]);
    assert.deepEqual(sorted.map(r => r.sourceCampaignRevision), [0, 1, 2]);
});

test('applyAllPending stops after APPLIED marker write failure', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lr-apply-stop-'));
    const statePath = path.join(root, 'game_state.json');
    fs.writeFileSync(statePath, JSON.stringify({
        status: { hp: { current: 18, max: 20 } },
        stateRevision: 1,
    }, null, 2));
    const first = makeReceipt('sess-first', 9, 0);
    const second = makeReceipt('sess-second', 5, 1);
    writePendingCombatOutcomeReceipt(root, first);
    writePendingCombatOutcomeReceipt(root, second);

    // Force applied/ directory to be a file so marker write fails after state write.
    const appliedDir = path.join(root, '.text-adventure', 'combat', 'applied');
    fs.mkdirSync(path.dirname(appliedDir), { recursive: true });
    fs.writeFileSync(appliedDir, 'not-a-directory');

    const results = applyAllPendingCombatOutcomes(root);
    assert.equal(results.length, 1, 'batch must stop after first marker failure');
    assert.equal(results[0].ok, false);
    if (results[0].ok) return;
    assert.equal(results[0].reason, 'APPLIED_MARKER_WRITE_FAILED');
    // Second receipt still pending
    assert.ok(fs.existsSync(path.join(root, '.text-adventure', 'combat', 'pending', 'sess-second.json')));
});

test('applyAllPending fail-closes when incomplete receipt would sort after a valid one', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lr-apply-incomplete-barrier-'));
    const statePath = path.join(root, 'game_state.json');
    fs.writeFileSync(statePath, JSON.stringify({
        status: { hp: { current: 18, max: 20 } },
        stateRevision: 2,
    }, null, 2));
    // Valid lower revision — would apply first if scan only checked discriminators
    const validLower = makeReceipt('sess-valid-low', 11, 0);
    writePendingCombatOutcomeReceipt(root, validLower);
    // Incomplete higher revision: schema + applyEligible only
    const pendingDir = path.join(root, '.text-adventure', 'combat', 'pending');
    fs.writeFileSync(path.join(pendingDir, 'incomplete-high.json'), JSON.stringify({
        schemaVersion: 'combat-outcome-receipt-v1',
        applyEligible: true,
        combatSessionId: 'sess-incomplete-high',
        sourceCampaignRevision: 9,
        // no receiptHash / participants / etc.
    }), 'utf8');

    const results = applyAllPendingCombatOutcomes(root);
    assert.equal(results.length, 1);
    assert.equal(results[0].ok, false);
    if (results[0].ok) return;
    assert.equal(results[0].reason, 'INVALID_PENDING_RECEIPT');
    const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
    assert.equal(state.status.hp.current, 18, 'valid lower must not apply before barrier');
    assert.equal(state.stateRevision, 2);
    assert.equal(
        fs.existsSync(path.join(root, '.text-adventure', 'combat', 'applied', 'sess-valid-low.json')),
        false,
    );
    assert.equal(fs.existsSync(path.join(pendingDir, 'sess-valid-low.json')), true);
});

test('applyAllPending fail-closes on corrupt pending JSON without applying newer HP', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lr-apply-corrupt-barrier-'));
    const statePath = path.join(root, 'game_state.json');
    fs.writeFileSync(statePath, JSON.stringify({
        status: { hp: { current: 18, max: 20 } },
        stateRevision: 1,
    }, null, 2));
    const newer = makeReceipt('sess-newer-valid', 5, 1);
    writePendingCombatOutcomeReceipt(root, newer);
    const pendingDir = path.join(root, '.text-adventure', 'combat', 'pending');
    fs.writeFileSync(path.join(pendingDir, 'older-corrupt.json'), '{broken', 'utf8');

    const results = applyAllPendingCombatOutcomes(root);
    assert.equal(results.length, 1);
    assert.equal(results[0].ok, false);
    if (results[0].ok) return;
    assert.equal(results[0].reason, 'INVALID_PENDING_RECEIPT');
    assert.equal(fs.existsSync(path.join(pendingDir, 'sess-newer-valid.json')), true);
    const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
    assert.equal(state.status.hp.current, 18);
    assert.equal(state.stateRevision, 1);
    assert.equal(
        fs.existsSync(path.join(root, '.text-adventure', 'combat', 'applied', 'sess-newer-valid.json')),
        false,
    );
});

test('applyAllPending stops on any failure so newer absolute HP cannot leapfrog', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lr-apply-stop-hash-'));
    const statePath = path.join(root, 'game_state.json');
    fs.writeFileSync(statePath, JSON.stringify({
        status: { hp: { current: 18, max: 20 } },
        stateRevision: 1,
    }, null, 2));
    const goodNewer = makeReceipt('sess-newer', 5, 1);
    const badOlder = makeReceipt('sess-older', 9, 0);
    // Corrupt older receipt hash after writing a valid-looking pending file
    writePendingCombatOutcomeReceipt(root, { ...badOlder, receiptHash: 'deadbeef'.repeat(8) });
    writePendingCombatOutcomeReceipt(root, goodNewer);

    const results = applyAllPendingCombatOutcomes(root);
    assert.equal(results.length, 1, 'must stop after older failure');
    assert.equal(results[0].ok, false);
    if (results[0].ok) return;
    assert.equal(results[0].reason, 'RECEIPT_HASH_MISMATCH');
    // Newer must not have been applied
    assert.equal(fs.existsSync(path.join(root, '.text-adventure', 'combat', 'pending', 'sess-newer.json')), true);
    const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
    assert.equal(state.status.hp.current, 18, 'HP must stay pre-combat until older succeeds');
});
