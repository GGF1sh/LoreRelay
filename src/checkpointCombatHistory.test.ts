import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import {
    attachCombatBattleHistoryToSnapshot,
    extractCombatBattleHistoryForCheckpoint,
} from './checkpointCombatCore';
import { COMBAT_BATTLE_HISTORY_KEY } from './campaignCombatApplyCore';

test('extract and attach combatBattleHistory for checkpoint restore', () => {
    const history = [{
        combatSessionId: 'sess-1',
        encounterId: 'enc',
        requestId: 'req',
        terminalOutcomeCode: 'ALLY_WIN',
        finalTick: 3,
        receiptHash: 'abc123',
        simulationResultHash: 'sim',
        sourceCampaignRevision: 0,
        playerHpAfter: 9,
        playerMaxHp: 20,
    }];
    const state = {
        entries: [],
        [COMBAT_BATTLE_HISTORY_KEY]: history,
        status: { hp: { current: 9, max: 20 } },
    };
    const extracted = extractCombatBattleHistoryForCheckpoint(state);
    assert.ok(extracted);
    assert.equal(extracted!.length, 1);
    assert.equal(extracted![0].receiptHash, 'abc123');

    // Simulates buildStateFromGmEntry output (no combat history).
    const gmShell = {
        entries: [{ id: 'turn-1', role: 'gm', content: 'hello' }],
        status: { hp: { current: 18, max: 20 } },
        options: [] as string[],
        theme: 'fantasy',
    };
    assert.equal((gmShell as { combatBattleHistory?: unknown }).combatBattleHistory, undefined);

    const restored = attachCombatBattleHistoryToSnapshot(gmShell, extracted);
    assert.equal(restored.combatBattleHistory?.[0].receiptHash, 'abc123');
    assert.equal(restored.combatBattleHistory?.[0].playerHpAfter, 9);
    // Round-trip: extract again after attach
    const again = extractCombatBattleHistoryForCheckpoint(restored as Record<string, unknown>);
    assert.equal(again?.[0].receiptHash, 'abc123');
});

test('extract returns undefined when history empty', () => {
    assert.equal(extractCombatBattleHistoryForCheckpoint({ entries: [] }), undefined);
    assert.equal(extractCombatBattleHistoryForCheckpoint(undefined), undefined);
});
