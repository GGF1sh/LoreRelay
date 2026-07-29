import * as assert from 'node:assert/strict';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { test } from 'node:test';
import {
    listPendingApplyEligibleReceipts,
    readCompiledSessionSnapshot,
    writeCampaignCombatSessionArtifacts,
    writeCombatSessionClosure,
    writePendingCombatOutcomeReceipt,
} from './campaignCombatPendingStore';
import { buildCombatSessionClosure } from './campaignCombatReceiptCore';
import { buildDebugCampaignCombatRequest } from './campaignCombatRequestCore';
import { compileCampaignCombatRequest, loadDefaultCombatLabCatalog } from './campaignCombatCompileCore';
import * as pathMod from 'path';

test('PENDING round-trip and closures excluded from apply list', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lr-combat-pending-'));
    const request = buildDebugCampaignCombatRequest({ requestId: 'r1' });
    const receipt = {
        schemaVersion: 'combat-outcome-receipt-v1' as const,
        applyEligible: true as const,
        combatSessionId: 'sess-1',
        encounterId: request.encounterId,
        requestId: request.requestId,
        campaignInstanceId: request.campaignInstanceId,
        timelineEpochId: request.timelineEpochId,
        sourceCampaignRevision: 0,
        requestedMode: 'command' as const,
        effectiveMode: 'command' as const,
        terminalOutcomeCode: 'ALLY_WIN' as const,
        finalTick: 3,
        participants: [],
        objective: { type: 'annihilate' as const, result: 'success' as const },
        simulationResultHash: 'sim',
        receiptHash: 'rec',
    };
    writePendingCombatOutcomeReceipt(root, receipt);
    const closure = buildCombatSessionClosure({
        combatSessionId: 'sess-2',
        request,
        reasonCode: 'ABORT',
    });
    writeCombatSessionClosure(root, closure);
    const list = listPendingApplyEligibleReceipts(root);
    assert.equal(list.length, 1);
    assert.equal(list[0].combatSessionId, 'sess-1');
    assert.equal(list[0].applyEligible, true);
});

test('session artifacts persist compiled battle-spec and roster hash', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lr-combat-compiled-'));
    const request = buildDebugCampaignCombatRequest({ requestId: 'r2' });
    const catalog = loadDefaultCombatLabCatalog(pathMod.join(__dirname, '..'));
    const compiled = compileCampaignCombatRequest(request, catalog);
    assert.equal(compiled.ok, true);
    if (!compiled.ok) return;
    writeCampaignCombatSessionArtifacts(
        root,
        'sess-compile',
        request,
        { lifecycle: 'running' },
        {
            battleSpec: compiled.compiled.battleSpec,
            rosterSnapshot: compiled.compiled.rosterSnapshot,
            entityToUnitId: compiled.compiled.entityToUnitId,
            compiledSnapshotHash: compiled.compiled.compiledSnapshotHash,
            fixtureId: compiled.compiled.fixtureId,
        },
    );
    const snap = readCompiledSessionSnapshot(root, 'sess-compile');
    assert.ok(snap);
    assert.equal(snap!.compiledSnapshotHash, compiled.compiled.compiledSnapshotHash);
    assert.deepEqual(
        (snap!.battleSpec as { participantOrder: string[] }).participantOrder,
        compiled.compiled.battleSpec.participantOrder,
    );
});
