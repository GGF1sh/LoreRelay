import * as assert from 'node:assert/strict';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { test } from 'node:test';
import {
    listPendingApplyEligibleReceipts,
    readCompiledSessionSnapshot,
    scanPendingDirectoryForApply,
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

test('scanPendingDirectoryForApply fail-closes on malformed JSON', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lr-pending-malformed-'));
    const dir = path.join(root, '.text-adventure', 'combat', 'pending');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'broken.json'), '{not-json', 'utf8');
    // Also place a valid-looking newer receipt that must not be returned as ok list
    writePendingCombatOutcomeReceipt(root, {
        schemaVersion: 'combat-outcome-receipt-v1',
        applyEligible: true,
        combatSessionId: 'sess-valid',
        encounterId: 'enc',
        requestId: 'r',
        campaignInstanceId: 'c',
        timelineEpochId: 'e',
        sourceCampaignRevision: 1,
        requestedMode: 'command',
        effectiveMode: 'command',
        terminalOutcomeCode: 'ALLY_WIN',
        finalTick: 1,
        participants: [],
        objective: { type: 'annihilate', result: 'success' },
        simulationResultHash: 'sim',
        receiptHash: 'h',
    });
    const scan = scanPendingDirectoryForApply(root);
    assert.equal(scan.ok, false);
    if (scan.ok) return;
    assert.equal(scan.reason, 'INVALID_PENDING_RECEIPT');
    assert.equal(scan.fileName, 'broken.json');
});

test('scanPendingDirectoryForApply fail-closes on wrong schema / not apply-eligible', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lr-pending-schema-'));
    const dir = path.join(root, '.text-adventure', 'combat', 'pending');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'closure-shaped.json'), JSON.stringify({
        schemaVersion: 'combat-session-closure-v1',
        applyEligible: false,
        combatSessionId: 'sess-x',
    }), 'utf8');
    const scan = scanPendingDirectoryForApply(root);
    assert.equal(scan.ok, false);
    if (scan.ok) return;
    assert.equal(scan.reason, 'INVALID_PENDING_RECEIPT');
    assert.equal(scan.fileName, 'closure-shaped.json');
});

test('scanPendingDirectoryForApply ignores non-json files', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lr-pending-nonjson-'));
    const dir = path.join(root, '.text-adventure', 'combat', 'pending');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'readme.txt'), 'ignore me', 'utf8');
    writePendingCombatOutcomeReceipt(root, {
        schemaVersion: 'combat-outcome-receipt-v1',
        applyEligible: true,
        combatSessionId: 'sess-ok',
        encounterId: 'enc',
        requestId: 'r',
        campaignInstanceId: 'c',
        timelineEpochId: 'e',
        sourceCampaignRevision: 0,
        requestedMode: 'command',
        effectiveMode: 'command',
        terminalOutcomeCode: 'ALLY_WIN',
        finalTick: 1,
        participants: [],
        objective: { type: 'annihilate', result: 'success' },
        simulationResultHash: 'sim',
        receiptHash: 'h2',
    });
    const scan = scanPendingDirectoryForApply(root);
    assert.equal(scan.ok, true);
    if (!scan.ok) return;
    assert.equal(scan.receipts.length, 1);
    assert.equal(scan.receipts[0].combatSessionId, 'sess-ok');
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
