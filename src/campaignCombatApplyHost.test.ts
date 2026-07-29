import * as assert from 'node:assert/strict';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { test } from 'node:test';
import { applyCombatOutcomeReceiptOnce, applyAllPendingCombatOutcomes } from './campaignCombatApplyHost';
import { COMBAT_BATTLE_HISTORY_KEY } from './campaignCombatApplyCore';
import { writePendingCombatOutcomeReceipt, readAppliedCombatOutcomeMarker } from './campaignCombatPendingStore';
import { CombatOutcomeReceipt, sha256Stable } from './campaignCombatReceiptCore';

function makeReceipt(sessionId: string, finalHp: number): CombatOutcomeReceipt {
    const body: Omit<CombatOutcomeReceipt, 'receiptHash'> = {
        schemaVersion: 'combat-outcome-receipt-v1',
        applyEligible: true,
        combatSessionId: sessionId,
        encounterId: 'enc',
        requestId: 'req',
        campaignInstanceId: 'camp',
        timelineEpochId: 'epoch',
        sourceCampaignRevision: 0,
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
