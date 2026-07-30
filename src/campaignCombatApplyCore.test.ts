import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import {
    buildCombatConsequencePlan,
    COMBAT_BATTLE_HISTORY_KEY,
    isApplyEligibleReceipt,
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

test('isApplyEligibleReceipt validates the complete receipt and participant shape', () => {
    const valid = makeReceipt({
        sourceAcceptedTurnId: 'turn-1',
        requestedMode: 'spectator',
        effectiveMode: 'spectator',
        terminalOutcomeLabel: 'Ally Win',
        compiledSnapshotHash: 'compiled',
        commandReplayHash: 'replay',
    });
    assert.equal(isApplyEligibleReceipt(valid), true);

    const requiredTopLevelFields: (keyof CombatOutcomeReceipt)[] = [
        'schemaVersion',
        'applyEligible',
        'combatSessionId',
        'encounterId',
        'requestId',
        'campaignInstanceId',
        'timelineEpochId',
        'sourceCampaignRevision',
        'requestedMode',
        'effectiveMode',
        'terminalOutcomeCode',
        'finalTick',
        'participants',
        'objective',
        'simulationResultHash',
        'receiptHash',
    ];
    for (const field of requiredTopLevelFields) {
        const raw = { ...valid } as Record<string, unknown>;
        delete raw[field];
        assert.equal(isApplyEligibleReceipt(raw), false, `missing ${field} must be rejected`);
    }

    const invalidTopLevel: [string, unknown][] = [
        ['sourceCampaignRevision', Number.NaN],
        ['sourceCampaignRevision', Number.POSITIVE_INFINITY],
        ['requestedMode', 'direct'],
        ['effectiveMode', 'direct'],
        ['terminalOutcomeCode', 'DRAW'],
        ['finalTick', Number.NEGATIVE_INFINITY],
        ['objective', null],
        ['objective', { type: 'capture', result: 'success' }],
        ['objective', { type: 'annihilate', result: 'draw' }],
        ['participants', [null]],
    ];
    for (const [field, value] of invalidTopLevel) {
        assert.equal(
            isApplyEligibleReceipt({ ...valid, [field]: value }),
            false,
            `invalid ${field} must be rejected`,
        );
    }

    for (const field of [
        'sourceAcceptedTurnId',
        'terminalOutcomeLabel',
        'compiledSnapshotHash',
        'commandReplayHash',
    ] as const) {
        assert.equal(
            isApplyEligibleReceipt({ ...valid, [field]: 123 }),
            false,
            `invalid optional ${field} must be rejected`,
        );
    }

    for (const field of [
        'entityId',
        'unitId',
        'team',
        'finalHp',
        'maxHp',
        'alive',
        'dead',
    ] as const) {
        const participant = { ...valid.participants[0] } as Record<string, unknown>;
        delete participant[field];
        assert.equal(
            isApplyEligibleReceipt({ ...valid, participants: [participant] }),
            false,
            `participant missing ${field} must be rejected`,
        );
    }
    assert.equal(
        isApplyEligibleReceipt({
            ...valid,
            participants: [{ ...valid.participants[0], team: 2 }],
        }),
        false,
    );
    assert.equal(
        isApplyEligibleReceipt({
            ...valid,
            participants: [{ ...valid.participants[0], finalHp: Number.NaN }],
        }),
        false,
    );
});

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
