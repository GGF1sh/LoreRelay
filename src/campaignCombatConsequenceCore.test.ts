import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import {
    COMBAT_BATTLE_HISTORY_KEY,
    buildCombatConsequencePlan,
} from './campaignCombatApplyCore';
import {
    formatCombatConsequencePromptBlock,
    selectOldestUninjectedCombatConsequenceFact,
    tryBuildCombatConsequenceFact,
} from './campaignCombatConsequenceCore';
import { CombatOutcomeReceipt, sha256Stable } from './campaignCombatReceiptCore';

function makeReceipt(overrides: Partial<CombatOutcomeReceipt> = {}): CombatOutcomeReceipt {
    const body: Omit<CombatOutcomeReceipt, 'receiptHash'> = {
        schemaVersion: 'combat-outcome-receipt-v1',
        applyEligible: true,
        combatSessionId: 'sess-c',
        encounterId: 'enc-c',
        requestId: 'req-c',
        campaignInstanceId: 'camp',
        timelineEpochId: 'epoch',
        sourceCampaignRevision: 1,
        requestedMode: 'command',
        effectiveMode: 'command',
        terminalOutcomeCode: 'ALLY_WIN',
        finalTick: 9,
        participants: [{
            entityId: 'ally_1', unitId: 'ally_1', team: 0,
            finalHp: 6, maxHp: 20, alive: true, dead: false,
        }],
        objective: { type: 'annihilate', result: 'success' },
        simulationResultHash: 'sim-c',
        ...overrides,
    };
    if (overrides.receiptHash) {
        return { ...body, receiptHash: overrides.receiptHash } as CombatOutcomeReceipt;
    }
    return { ...body, receiptHash: sha256Stable(body) };
}

test('history entry stores optional player combat-end snapshot for V1-C', () => {
    const receipt = makeReceipt();
    const plan = buildCombatConsequencePlan(
        { status: { hp: { current: 18, max: 20 }, condition: [] } },
        receipt,
    );
    const hist = plan.nextState[COMBAT_BATTLE_HISTORY_KEY] as {
        playerHpBefore?: number;
        playerHpAfter?: number;
        playerMaxHp?: number;
        playerIncapacitated?: boolean;
    }[];
    assert.equal(hist.length, 1);
    assert.equal(hist[0].playerHpBefore, 18);
    assert.equal(hist[0].playerHpAfter, 6);
    assert.equal(hist[0].playerMaxHp, 20);
    assert.equal(hist[0].playerIncapacitated, false);
});

test('tryBuildCombatConsequenceFact requires matching APPLIED receiptHash', () => {
    const receipt = makeReceipt();
    const plan = buildCombatConsequencePlan(
        { status: { hp: { current: 18, max: 20 } } },
        receipt,
    );
    const entry = (plan.nextState[COMBAT_BATTLE_HISTORY_KEY] as import('./campaignCombatApplyCore').CombatBattleHistoryEntry[])[0];
    const ok = tryBuildCombatConsequenceFact(entry, {
        combatSessionId: entry.combatSessionId,
        receiptHash: entry.receiptHash,
    });
    assert.ok(ok);
    assert.equal(ok!.terminalOutcomeCode, 'ALLY_WIN');
    assert.equal(ok!.playerHpAfter, 6);

    const mismatch = tryBuildCombatConsequenceFact(entry, {
        combatSessionId: entry.combatSessionId,
        receiptHash: 'other',
    });
    assert.equal(mismatch, undefined);

    const missing = tryBuildCombatConsequenceFact(entry, undefined);
    assert.equal(missing, undefined);
});

test('selectOldestUninjected skips injected and APPLIED mismatches', () => {
    const r1 = makeReceipt({ combatSessionId: 's1', encounterId: 'e1' });
    const r2Body: Omit<CombatOutcomeReceipt, 'receiptHash'> = {
        schemaVersion: 'combat-outcome-receipt-v1',
        applyEligible: true,
        combatSessionId: 's2',
        encounterId: 'e2',
        requestId: 'req2',
        campaignInstanceId: 'camp',
        timelineEpochId: 'epoch',
        sourceCampaignRevision: 1,
        requestedMode: 'command',
        effectiveMode: 'command',
        terminalOutcomeCode: 'ENEMY_WIN',
        finalTick: 3,
        participants: [{
            entityId: 'ally_1', unitId: 'ally_1', team: 0,
            finalHp: 0, maxHp: 20, alive: false, dead: true,
        }],
        objective: { type: 'annihilate', result: 'failure' },
        simulationResultHash: 'sim-2',
    };
    const r2 = { ...r2Body, receiptHash: sha256Stable(r2Body) };

    let state: Record<string, unknown> = { status: { hp: { current: 18, max: 20 } } };
    state = buildCombatConsequencePlan(state, r1).nextState;
    state = buildCombatConsequencePlan(state, r2).nextState;

    const applied = new Map([
        ['s1', { combatSessionId: 's1', receiptHash: r1.receiptHash }],
        ['s2', { combatSessionId: 's2', receiptHash: r2.receiptHash }],
    ]);
    const injected = new Set<string>([r1.receiptHash]);

    const fact = selectOldestUninjectedCombatConsequenceFact(
        state,
        (id) => applied.get(id),
        (hash) => injected.has(hash),
    );
    assert.ok(fact);
    assert.equal(fact!.combatSessionId, 's2');
    assert.equal(fact!.terminalOutcomeCode, 'ENEMY_WIN');
});

test('prompt block is bounded and forbids re-deciding mechanics', () => {
    const text = formatCombatConsequencePromptBlock({
        schemaVersion: 'combat-consequence-fact-v1',
        combatSessionId: 's',
        encounterId: 'enc',
        requestId: 'r',
        terminalOutcomeCode: 'ALLY_WIN',
        finalTick: 4,
        receiptHash: 'abc',
        simulationResultHash: 'sim',
        sourceCampaignRevision: 0,
        playerHpAfter: 7,
        playerMaxHp: 20,
    });
    assert.match(text, /Authoritative Combat Consequence/);
    assert.match(text, /Outcome: ALLY_WIN/);
    assert.match(text, /Player HP after: 7\/20/);
    assert.match(text, /Do not change the winner/);
    assert.equal(text.includes('Game Master'), false);
});
