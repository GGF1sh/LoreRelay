import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import {
    buildCombatOutcomeReceipt,
    mapCombatTerminalLabel,
    computeSimulationResultHash,
} from './campaignCombatReceiptCore';
import { buildDebugCampaignCombatRequest } from './campaignCombatRequestCore';
import { compileCampaignCombatRequest, loadDefaultCombatLabCatalog } from './campaignCombatCompileCore';
import {
    createCombatState,
    createCombatStepContext,
} from './gambitCombatCore';
import { emptyCommandInputLog } from './combatRtsCommandInputCore';
import * as path from 'path';

test('mapCombatTerminalLabel maps Japanese and Timeout', () => {
    assert.equal(mapCombatTerminalLabel('勝利！ 敵を全滅させた'), 'ALLY_WIN');
    assert.equal(mapCombatTerminalLabel('敗北… 味方が全滅した'), 'ENEMY_WIN');
    assert.equal(mapCombatTerminalLabel('Timeout'), 'TIMEOUT');
    assert.equal(mapCombatTerminalLabel('weird'), null);
});

test('simulationResultHash is stable when session ids change; receiptHash is not', () => {
    const catalog = loadDefaultCombatLabCatalog(path.join(__dirname, '..'));
    const request = buildDebugCampaignCombatRequest({ requestId: 'req_a' });
    const compiled = compileCampaignCombatRequest(request, catalog);
    assert.equal(compiled.ok, true);
    if (!compiled.ok) return;
    const spec = compiled.compiled.battleSpec;
    const state = createCombatState(spec);
    // Force terminal-looking state for hashing only
    for (const id of createCombatStepContext(spec).participantOrder) {
        if (state.units[id].team === 1) {
            state.units[id].hp = 0;
            state.units[id]._dead = true;
        }
    }
    state.tick = 10;
    const log = emptyCommandInputLog(30);
    const h1 = computeSimulationResultHash({
        battleSpec: spec,
        commandLog: log,
        state,
        outcomeLabel: '勝利！ 敵を全滅させた',
        participantOrder: spec.participantOrder,
    });
    const h2 = computeSimulationResultHash({
        battleSpec: spec,
        commandLog: log,
        state,
        outcomeLabel: '勝利！ 敵を全滅させた',
        participantOrder: spec.participantOrder,
    });
    assert.equal(h1, h2);

    const r1 = buildCombatOutcomeReceipt({
        combatSessionId: 'session-aaa',
        request,
        effectiveMode: 'command',
        outcomeLabel: '勝利！ 敵を全滅させた',
        state,
        battleSpec: spec,
        commandLog: log,
        entityToUnitId: compiled.compiled.entityToUnitId,
    });
    const r2 = buildCombatOutcomeReceipt({
        combatSessionId: 'session-bbb',
        request,
        effectiveMode: 'command',
        outcomeLabel: '勝利！ 敵を全滅させた',
        state,
        battleSpec: spec,
        commandLog: log,
        entityToUnitId: compiled.compiled.entityToUnitId,
    });
    assert.ok(!('ok' in r1 && r1.ok === false));
    assert.ok(!('ok' in r2 && r2.ok === false));
    if ('simulationResultHash' in r1 && 'simulationResultHash' in r2) {
        assert.equal(r1.simulationResultHash, r2.simulationResultHash);
        assert.notEqual(r1.receiptHash, r2.receiptHash);
        assert.equal(r1.applyEligible, true);
    }
});
