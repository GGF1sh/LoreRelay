#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const root = path.join(__dirname, '..');
for (const file of [
    'out/gameplaySpineVehicleRepairCommitHost.js',
    'out/gameplaySpineVehicleRepairPlanAdapterCore.js',
    'out/vehicleStateDocumentOwner.js',
]) {
    assert.ok(fs.existsSync(path.join(root, file)), `${file} missing; run npm run compile first`);
}

const { parseVehicleState } = require(path.join(root, 'out/vehicleCore.js'));
const { queryWorldIntent, executeWorldIntent } = require(path.join(root, 'out/worldIntentCore.js'));
const { planVehicleRepairPreview, buildVehicleRepairEffectPlan } = require(path.join(root, 'out/gameplaySpineVehicleRepairPlanAdapterCore.js'));
const { digestWholeVehicleStateDocument } = require(path.join(root, 'out/vehicleStateDocumentCore.js'));
const { createDeterministicWorkspaceMutationGate } = require(path.join(root, 'out/deterministicWorkspaceMutationGate.js'));
const {
    commitVehicleRepairEffectPlanWithDeps,
    reconcileVehicleRepairRequestWithDeps,
    upgradeVehicleStateForGameplaySpineWithDeps,
} = require(path.join(root, 'out/gameplaySpineVehicleRepairCommitHost.js'));

function state() {
    return parseVehicleState({ version: 1, activeVehicleId: 'v1', updatedTurn: 3, vehicles: [{
        id: 'v1', name: 'Test Vehicle', kind: 'land', status: 'damaged', locationId: 'loc1',
        durability: { hp: 50, maxHp: 100, condition: 'damaged', armorBand: 'none' },
        resources: { powerType: 'none', current: 0, max: 0 }, owner: { type: 'party' },
        capacity: { crewRequired: 1, crewCapacity: 4, passengerCapacity: 0, cargoCapacity: 0 },
        access: { sizeClass: 'medium', accessTags: ['road'] },
        mobility: { speedBand: 'normal', rangeBand: 'local', terrainTags: ['road'] },
        cargo: [], modules: [], crew: [], notes: [], tags: [],
    }] });
}

function harness(document) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lr-repair-commit-'));
    const statePath = path.join(dir, 'vehicle_state.json');
    fs.writeFileSync(statePath, JSON.stringify(document), 'utf8');
    let writes = 0;
    return {
        dir, statePath,
        deps: {
            getVehicleStatePath: () => statePath, fileExists: fs.existsSync,
            readFileUtf8: (p) => fs.readFileSync(p, 'utf8'),
            allocateTempPath: () => path.join(dir, `.lorerelay-vehicle-state-${process.pid}-${Date.now()}-${writes}.tmp`),
            openTempFile: (p) => fs.openSync(p, 'wx', 0o600),
            writeTempFileUtf8: (fd, text) => { writes++; fs.writeFileSync(fd, text, 'utf8'); },
            fsyncTempFile: fs.fsyncSync, closeTempFile: fs.closeSync, renameFile: fs.renameSync,
            waitBeforeRenameRetry: () => {}, cleanupTempFile: (p) => { try { fs.unlinkSync(p); } catch {} },
            syncDirectoryBestEffort: () => undefined, clearVehicleStateCache: () => {},
            runSerializedMutation: (fn) => fn(), reportDiagnostic: () => {},
        },
        read: () => JSON.parse(fs.readFileSync(statePath, 'utf8')),
        writes: () => writes,
        cleanup: () => fs.rmSync(dir, { recursive: true, force: true }),
    };
}

function planFor(current, id = 'repair_request_1', amount = 30) {
    const context = { vehicleState: current, worldTurn: 9 };
    const intent = { id, source: 'gm', subsystem: 'vehicle', action: 'repair_vehicle', target: { kind: 'vehicle', id: 'v1' }, payload: { amount } };
    const preview = planVehicleRepairPreview(intent, queryWorldIntent(intent, context), executeWorldIntent(intent, context), context);
    const built = buildVehicleRepairEffectPlan(preview, context);
    assert.strictEqual(built.status, 'available');
    return { plan: built.plan, context: { worldTurn: 9 } };
}

{
    const current = state();
    const h = harness({ ...current, version: 2, gameplayCommitReceipts: [] });
    const source = planFor(current);
    const input = { workspaceKey: h.dir, wholeDocumentDigest: digestWholeVehicleStateDocument(h.read()), ...source };
    const deps = { ownerDeps: h.deps, gate: createDeterministicWorkspaceMutationGate() };
    const committed = commitVehicleRepairEffectPlanWithDeps(input, deps);
    assert.strictEqual(committed.status, 'committed');
    assert.strictEqual(h.read().vehicles[0].durability.hp, 80);
    assert.strictEqual(h.read().gameplayCommitReceipts.length, 1);
    assert.strictEqual(h.writes(), 1, 'mechanics and receipt share one replacement');
    const reconciled = reconcileVehicleRepairRequestWithDeps({
        requestId: input.plan.requestId,
        target: { kind: 'vehicle', id: 'v1' }, requestedRepair: 30,
    }, h.deps);
    assert.strictEqual(reconciled.status, 'replayed', 'fresh disk reconciliation replays without a preview');
    assert.strictEqual(reconciled.result.commitId, committed.commitId);
    assert.strictEqual(reconciled.result.replayedPriorCommit, true);
    assert.strictEqual(reconcileVehicleRepairRequestWithDeps({
        requestId: input.plan.requestId,
        target: { kind: 'vehicle', id: 'v1' }, requestedRepair: 20,
    }, h.deps).result.reasonCode, 'request_id_conflict');
    assert.strictEqual(reconcileVehicleRepairRequestWithDeps({
        requestId: input.plan.requestId,
        target: { kind: 'vehicle', id: 'other_vehicle' }, requestedRepair: 30,
    }, h.deps).result.reasonCode, 'request_id_conflict');
    const replay = commitVehicleRepairEffectPlanWithDeps(input, deps);
    assert.strictEqual(replay.status, 'committed');
    assert.strictEqual(replay.replayedPriorCommit, true);
    assert.strictEqual(replay.commitId, committed.commitId);
    assert.strictEqual(h.read().vehicles[0].durability.hp, 80);
    assert.strictEqual(h.writes(), 1, 'duplicate does not replace the document');
    const conflicting = planFor(current, 'repair_request_1', 20);
    const conflict = commitVehicleRepairEffectPlanWithDeps({ ...input, ...conflicting }, deps);
    assert.strictEqual(conflict.reasonCode, 'request_id_conflict');
    h.cleanup();
}

{
    const current = state();
    const h = harness({ ...current, version: 1 });
    const deps = { ownerDeps: h.deps, gate: createDeterministicWorkspaceMutationGate() };
    const failed = upgradeVehicleStateForGameplaySpineWithDeps(h.dir, deps, () => false);
    assert.strictEqual(failed.reasonCode, 'backup_failed');
    assert.strictEqual(h.read().version, 1);
    const upgraded = upgradeVehicleStateForGameplaySpineWithDeps(h.dir, deps, () => true);
    assert.strictEqual(upgraded.status, 'migrated');
    assert.strictEqual(h.read().version, 2);
    assert.deepStrictEqual(h.read().gameplayCommitReceipts, []);
    assert.deepStrictEqual(h.read().vehicles, current.vehicles);
    h.cleanup();
}

console.log('gameplay spine authoritative vehicle repair commit tests passed');
