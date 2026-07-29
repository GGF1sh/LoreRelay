import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import {
    buildCombatConsequencePlan,
    COMBAT_BATTLE_HISTORY_KEY,
    stateHasReceiptApplied,
    verifyReceiptHash,
} from './campaignCombatApplyCore';
import { CombatOutcomeReceipt, sha256Stable } from './campaignCombatReceiptCore';

function makeReceipt(overrides: Partial<CombatOutcomeReceipt> = {}): CombatOutcomeReceipt {
    const body: Omit<CombatOutcomeReceipt, 'receiptHash'> = {
        schemaVersion: 'combat-outcome-receipt-v1',
        applyEligible: true,
        combatSessionId: 'sess-apply',
        encounterId: 'enc',
        requestId: 'req',
        campaignInstanceId: 'camp',
        timelineEpochId: 'epoch',
        sourceCampaignRevision: 0,
        requestedMode: 'command',
        effectiveMode: 'command',
        terminalOutcomeCode: 'ALLY_WIN',
        finalTick: 12,
        participants: [
            {
                entityId: 'ally_1',
                unitId: 'ally_1',
                team: 0,
                finalHp: 7,
                maxHp: 20,
                alive: true,
                dead: false,
            },
        ],
        objective: { type: 'annihilate', result: 'success' },
        simulationResultHash: 'simhash',
        ...overrides,
    };
    // If overrides already has receiptHash for mismatch tests, keep structure
    if (overrides.receiptHash) {
        return { ...body, receiptHash: overrides.receiptHash } as CombatOutcomeReceipt;
    }
    const receiptHash = sha256Stable(body);
    return { ...body, receiptHash };
}

test('buildCombatConsequencePlan appends history and updates player HP for ally_1', () => {
    const receipt = makeReceipt();
    assert.equal(verifyReceiptHash(receipt), true);
    const state = {
        status: { hp: { current: 18, max: 20 }, condition: ['healthy'] },
    };
    const plan = buildCombatConsequencePlan(state, receipt);
    assert.equal(plan.historyAppended, true);
    assert.equal(plan.playerHpUpdated, true);
    assert.equal(plan.playerHpAfter, 7);
    const hist = (plan.nextState[COMBAT_BATTLE_HISTORY_KEY] as { receiptHash: string }[]);
    assert.equal(hist.length, 1);
    assert.equal(hist[0].receiptHash, receipt.receiptHash);
    assert.equal(stateHasReceiptApplied(plan.nextState, receipt.receiptHash), true);
});

test('buildCombatConsequencePlan is idempotent for same receiptHash', () => {
    const receipt = makeReceipt();
    const state = { status: { hp: { current: 18, max: 20 } } };
    const once = buildCombatConsequencePlan(state, receipt);
    const twice = buildCombatConsequencePlan(once.nextState, receipt);
    assert.equal(twice.alreadyPresent, true);
    assert.equal(twice.historyAppended, false);
    const hist = twice.nextState[COMBAT_BATTLE_HISTORY_KEY] as unknown[];
    assert.equal(hist.length, 1);
});
