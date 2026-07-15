#!/usr/bin/env node
'use strict';

// NOAI-GAMEPLAY-SPINE-005B-PRE3B: shared vehicle-state writer coordination tests.

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const root = path.join(__dirname, '..');
const required = [
    'out/vehicleStateDocumentOwner.js',
    'out/vehicleTurnOpsCore.js',
    'out/mobileBaseTurnOpsCore.js',
    'out/ledgerMigrationWritebackHost.js',
    'out/ledgerMigrationRestoreHost.js',
    'out/ledgerMigrationWritebackCore.js',
    'out/vehicleMigrationCore.js',
    'out/workspaceStateQueue.js',
    'out/stateOrchestratorDescriptorCore.js',
];
for (const rel of required) {
    if (!fs.existsSync(path.join(root, rel))) {
        console.error(`FAIL: ${rel} missing - run npm.cmd run compile first`);
        process.exit(1);
    }
}

const {
    runSerializedVehicleStateDocumentMutationWithDeps,
} = require(path.join(root, 'out', 'vehicleStateDocumentOwner.js'));
const {
    tryApplyVehicleTurnOpsWithDeps,
} = require(path.join(root, 'out', 'vehicleTurnOpsCore.js'));
const {
    tryApplyMobileBaseTurnOpsWithDeps,
} = require(path.join(root, 'out', 'mobileBaseTurnOpsCore.js'));
const {
    applyVehicleStateMigrationWriteback,
} = require(path.join(root, 'out', 'ledgerMigrationWritebackHost.js'));
const {
    restoreVehicleStateMigrationBackup,
} = require(path.join(root, 'out', 'ledgerMigrationRestoreHost.js'));
const {
    MIGRATION_BACKUP_META_VERSION,
} = require(path.join(root, 'out', 'ledgerMigrationWritebackCore.js'));
const {
    migrateVehicleStateDocument,
} = require(path.join(root, 'out', 'vehicleMigrationCore.js'));
const {
    getVehicleStateWriteQueueDepthForTests,
    resetWorkspaceWriteQueueForTests,
    runSerializedVehicleStateMutation,
} = require(path.join(root, 'out', 'workspaceStateQueue.js'));
const {
    KNOWN_LEDGER_QUEUE_NAMES,
    LEDGER_DESCRIPTORS,
} = require(path.join(root, 'out', 'stateOrchestratorDescriptorCore.js'));

function clone(value) {
    return JSON.parse(JSON.stringify(value));
}

function digestChar(value) {
    return value.repeat(64);
}

const baseVehicle = {
    id: 'rust_wagon',
    name: 'Rust Wagon',
    kind: 'truck',
    owner: { type: 'party' },
    status: 'parked',
    locationId: 'outer_gate',
    capacity: {
        crewRequired: 1,
        crewCapacity: 2,
        passengerCapacity: 4,
        cargoCapacity: 30,
    },
    access: { sizeClass: 'large', accessTags: ['road'] },
    mobility: { speedBand: 'normal', rangeBand: 'regional', terrainTags: ['road'] },
    durability: { hp: 42, maxHp: 60, armorBand: 'medium', condition: 'worn' },
    resources: { powerType: 'fuel', current: 3, max: 20 },
};

const mobileBaseVehicle = {
    id: 'ashcrawler_hull',
    name: 'Ashcrawler Hull',
    kind: 'mobile_base',
    owner: { type: 'party' },
    status: 'parked',
    locationId: 'outer_gate',
    capacity: {
        crewRequired: 2,
        crewCapacity: 8,
        passengerCapacity: 4,
        cargoCapacity: 40,
    },
    access: { sizeClass: 'huge', accessTags: ['road', 'wide_gate'] },
    mobility: { speedBand: 'slow', rangeBand: 'regional', terrainTags: ['road'] },
    durability: { hp: 64, maxHp: 90, armorBand: 'heavy', condition: 'worn' },
    resources: { powerType: 'fuel', current: 12, max: 30 },
    mobileBase: {
        settlementId: 'ashcrawler_home',
        mode: 'landship',
        layoutProfile: 'crawler',
        dockedAtLocationId: 'outer_gate',
    },
};

const receipt = {
    schemaVersion: 1,
    commitId: 'commit_1',
    requestId: 'request_1',
    resolutionId: 'resolution_1',
    planId: 'plan_1',
    actionKey: 'vehicle:repair_vehicle',
    actionVersion: 1,
    status: 'committed',
    ledgerId: 'vehicle_state',
    effectIds: ['effect_1'],
    appliedEffectIds: ['effect_1'],
    skippedEffectIds: [],
    confirmationTokenDigest: digestChar('a'),
    effectPlanDigest: digestChar('b'),
    beforeLedgerDigest: digestChar('c'),
    afterLedgerDigest: digestChar('d'),
    target: { kind: 'vehicle', id: 'rust_wagon' },
    requestedRepair: 20,
    hpBefore: 40,
    hpAfter: 55,
    effectiveRepair: 15,
    updatedTurnBefore: 7,
    updatedTurnAfter: 8,
    clockSnapshot: [{ clock: 'world', value: 8 }],
};

const legacyRaw = { vehicles: [clone(baseVehicle)], updatedTurn: 4 };

function makeV1Doc(extraVehicles = []) {
    return {
        version: 1,
        activeVehicleId: 'rust_wagon',
        updatedTurn: 5,
        vehicles: [clone(baseVehicle), ...extraVehicles.map(clone)],
    };
}

function makeV2Doc(extraVehicles = []) {
    return {
        ...makeV1Doc(extraVehicles),
        version: 2,
        gameplayCommitReceipts: [clone(receipt)],
    };
}

function makeQueueSpy() {
    let calls = 0;
    let depth = 0;
    let maxDepth = 0;
    const events = [];
    return {
        events,
        run(fn) {
            calls += 1;
            depth += 1;
            maxDepth = Math.max(maxDepth, depth);
            events.push('queue_enter');
            try {
                fn();
            } finally {
                events.push('queue_exit');
                depth -= 1;
            }
        },
        get calls() { return calls; },
        get depth() { return depth; },
        get maxDepth() { return maxDepth; },
    };
}

function makeOwnerHarness(initialDocument, options = {}) {
    const statePath = path.join('C:\\focused-workspace', 'vehicle_state.json');
    let stateText = JSON.stringify(initialDocument, null, 2);
    let tempText;
    let tempSequence = 0;
    let cacheClears = 0;
    const queue = options.queue ?? makeQueueSpy();
    const deps = {
        getVehicleStatePath: () => statePath,
        fileExists: (candidate) => candidate === statePath,
        readFileUtf8: () => stateText,
        allocateTempPath: () => path.join(
            path.dirname(statePath),
            `.lorerelay-vehicle-state-123-456-${++tempSequence}.tmp`
        ),
        openTempFile: () => {
            if (options.openFailure) {
                throw new Error('forced open failure');
            }
            return 17;
        },
        writeTempFileUtf8: (fd, payload) => {
            assert.strictEqual(fd, 17);
            tempText = payload;
        },
        fsyncTempFile: () => {},
        closeTempFile: () => {},
        renameFile: () => { stateText = tempText; },
        waitBeforeRenameRetry: () => {},
        cleanupTempFile: () => {},
        syncDirectoryBestEffort: () => undefined,
        clearVehicleStateCache: () => { cacheClears += 1; },
        runSerializedMutation: (fn) => queue.run(fn),
        reportDiagnostic: () => {},
    };
    return {
        deps,
        queue,
        get cacheClears() { return cacheClears; },
        readDocument() { return JSON.parse(stateText); },
        vehicleTurnDeps() {
            return {
                isVehicleSystemEnabled: () => true,
                getVehicleStatePath: () => statePath,
                loadWorldTurn: () => 11,
                runSerializedVehicleStateDocumentMutation: (name, mutate) => (
                    runSerializedVehicleStateDocumentMutationWithDeps(deps, name, mutate)
                ),
            };
        },
        mobileTurnDeps() {
            return {
                loadRuleFlags: () => ({
                    enableVehicleSystem: true,
                    enableSettlementMode: true,
                    enableMobileBaseSystem: true,
                }),
                getVehicleStatePath: () => statePath,
                loadWorldTurn: () => 20,
                runSerializedVehicleStateDocumentMutation: (name, mutate) => (
                    runSerializedVehicleStateDocumentMutationWithDeps(deps, name, mutate)
                ),
            };
        },
    };
}

function withTempDir(prefix, fn) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
    try {
        return fn(dir);
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
}

function seedLegacyWorkspace(dir) {
    fs.writeFileSync(
        path.join(dir, 'vehicle_state.json'),
        JSON.stringify(legacyRaw, null, 2),
        'utf-8'
    );
}

function validMigrationMeta(overrides = {}) {
    return {
        version: MIGRATION_BACKUP_META_VERSION,
        createdAt: '2026-07-04T15:30:12.000Z',
        ledger: 'vehicle_state',
        sourceFile: 'vehicle_state.json',
        fromVersion: 0,
        toVersion: 1,
        appliedSteps: [{ fromVersion: 0, toVersion: 1 }],
        ...overrides,
    };
}

function seedMigrationBackup(dir, timestamp, document, metaOverrides = {}) {
    const backupDir = path.join(dir, '.lorerelay', 'backups', 'migrations', timestamp);
    fs.mkdirSync(backupDir, { recursive: true });
    fs.writeFileSync(
        path.join(backupDir, 'vehicle_state.json'),
        JSON.stringify(document, null, 2),
        'utf-8'
    );
    fs.writeFileSync(
        path.join(backupDir, 'migration_meta.json'),
        JSON.stringify(validMigrationMeta(metaOverrides), null, 2),
        'utf-8'
    );
}

const fixedWritebackTime = () => new Date('2026-07-04T15:30:12.000Z');
const fixedRestoreTime = () => new Date('2026-07-04T17:00:00.000Z');

const tests = [];
function test(name, fn) {
    tests.push({ name, fn });
}

test('normal vehicle writer enters the vehicle queue', () => {
    const queue = makeQueueSpy();
    const h = makeOwnerHarness(makeV1Doc(), { queue });
    const result = tryApplyVehicleTurnOpsWithDeps({
        vehicleOps: [{ type: 'damage_vehicle', vehicleId: 'rust_wagon', amount: 2 }],
    }, h.vehicleTurnDeps());
    assert.strictEqual(result.applied, true);
    assert.strictEqual(queue.calls, 1);
    assert.strictEqual(queue.maxDepth, 1);
});

test('normal mobile-base writer enters the same vehicle queue contract', () => {
    const queue = makeQueueSpy();
    const h = makeOwnerHarness(makeV1Doc([mobileBaseVehicle]), { queue });
    const result = tryApplyMobileBaseTurnOpsWithDeps({
        mobileBaseOps: [{
            type: 'move_mobile_base',
            vehicleId: 'ashcrawler_hull',
            locationId: 'east_road',
        }],
    }, h.mobileTurnDeps());
    assert.strictEqual(result.applied, true);
    assert.strictEqual(queue.calls, 1);
    assert.strictEqual(queue.maxDepth, 1);
});

test('migration writeback targeting vehicle_state enters the shared queue', () => {
    withTempDir('lr-pre3b-writeback-queue-', (dir) => {
        seedLegacyWorkspace(dir);
        const queue = makeQueueSpy();
        const result = applyVehicleStateMigrationWriteback(dir, {
            now: fixedWritebackTime,
            runSerializedVehicleStateMutation: (fn) => queue.run(fn),
            clearVehicleStateCache: () => {},
        });
        assert.strictEqual(result.outcome, 'success');
        assert.strictEqual(queue.calls, 1);
        assert.strictEqual(queue.maxDepth, 1);
    });
});

test('migration restore targeting vehicle_state enters the shared queue', () => {
    withTempDir('lr-pre3b-restore-queue-', (dir) => {
        seedMigrationBackup(dir, '20260704T153012Z', legacyRaw);
        fs.writeFileSync(path.join(dir, 'vehicle_state.json'), JSON.stringify(makeV1Doc()), 'utf-8');
        const queue = makeQueueSpy();
        const result = restoreVehicleStateMigrationBackup(dir, '20260704T153012Z', {
            now: fixedRestoreTime,
            runSerializedVehicleStateMutation: (fn) => queue.run(fn),
            clearVehicleStateCache: () => {},
        });
        assert.strictEqual(result.outcome, 'success');
        assert.strictEqual(queue.calls, 1);
        assert.strictEqual(queue.maxDepth, 1);
    });
});

test('migration result for another ledger does not enter the vehicle queue', () => {
    withTempDir('lr-pre3b-wrong-ledger-', (dir) => {
        seedLegacyWorkspace(dir);
        const queue = makeQueueSpy();
        const result = applyVehicleStateMigrationWriteback(dir, {
            migrate: (raw) => ({ ...migrateVehicleStateDocument(raw), ledger: 'world_state' }),
            runSerializedVehicleStateMutation: (fn) => queue.run(fn),
            clearVehicleStateCache: () => {},
        });
        assert.strictEqual(result.outcome, 'aborted');
        assert.strictEqual(result.reasonCode, 'wrong_ledger');
        assert.strictEqual(queue.calls, 0);
    });
});

test('restore metadata for another ledger does not enter the vehicle queue', () => {
    withTempDir('lr-pre3b-restore-wrong-ledger-', (dir) => {
        seedMigrationBackup(dir, '20260704T153012Z', legacyRaw, { ledger: 'world_state' });
        const queue = makeQueueSpy();
        const result = restoreVehicleStateMigrationBackup(dir, '20260704T153012Z', {
            runSerializedVehicleStateMutation: (fn) => queue.run(fn),
            clearVehicleStateCache: () => {},
        });
        assert.strictEqual(result.outcome, 'aborted');
        assert.strictEqual(result.reasonCode, 'invalid_meta');
        assert.strictEqual(queue.calls, 0);
    });
});

test('queued operations execute sequentially', () => {
    resetWorkspaceWriteQueueForTests();
    const events = [];
    runSerializedVehicleStateMutation(() => {
        events.push('first_start');
        runSerializedVehicleStateMutation(() => events.push('second'));
        events.push('first_end');
    });
    assert.deepStrictEqual(events, ['first_start', 'first_end', 'second']);
    assert.strictEqual(getVehicleStateWriteQueueDepthForTests(), 0);
});

test('queue is released after normal success', () => {
    resetWorkspaceWriteQueueForTests();
    const h = makeOwnerHarness(makeV1Doc(), {
        queue: { run: runSerializedVehicleStateMutation },
    });
    const result = tryApplyVehicleTurnOpsWithDeps({
        vehicleOps: [{ type: 'damage_vehicle', vehicleId: 'rust_wagon', amount: 1 }],
    }, h.vehicleTurnDeps());
    let nextRan = false;
    runSerializedVehicleStateMutation(() => { nextRan = true; });
    assert.strictEqual(result.applied, true);
    assert.strictEqual(nextRan, true);
    assert.strictEqual(getVehicleStateWriteQueueDepthForTests(), 0);
});

test('queue is released after normal write failure', () => {
    resetWorkspaceWriteQueueForTests();
    const h = makeOwnerHarness(makeV1Doc(), {
        queue: { run: runSerializedVehicleStateMutation },
        openFailure: true,
    });
    const result = tryApplyVehicleTurnOpsWithDeps({
        vehicleOps: [{ type: 'damage_vehicle', vehicleId: 'rust_wagon', amount: 1 }],
    }, h.vehicleTurnDeps());
    let nextRan = false;
    runSerializedVehicleStateMutation(() => { nextRan = true; });
    assert.strictEqual(result.ok, false);
    assert.strictEqual(nextRan, true);
    assert.strictEqual(getVehicleStateWriteQueueDepthForTests(), 0);
});

test('queue is released after migration backup failure', () => {
    withTempDir('lr-pre3b-backup-fail-', (dir) => {
        resetWorkspaceWriteQueueForTests();
        seedLegacyWorkspace(dir);
        const result = applyVehicleStateMigrationWriteback(dir, {
            now: fixedWritebackTime,
            copyFile: () => { throw new Error('forced backup failure'); },
            runSerializedVehicleStateMutation,
            clearVehicleStateCache: () => {},
        });
        let nextRan = false;
        runSerializedVehicleStateMutation(() => { nextRan = true; });
        assert.strictEqual(result.reasonCode, 'backup_failed');
        assert.strictEqual(nextRan, true);
        assert.strictEqual(getVehicleStateWriteQueueDepthForTests(), 0);
    });
});

test('queue is released after migration replace failure', () => {
    withTempDir('lr-pre3b-replace-fail-', (dir) => {
        resetWorkspaceWriteQueueForTests();
        seedLegacyWorkspace(dir);
        const result = applyVehicleStateMigrationWriteback(dir, {
            now: fixedWritebackTime,
            writeJsonAtomic: () => { throw new Error('forced replace failure'); },
            runSerializedVehicleStateMutation,
            clearVehicleStateCache: () => {},
        });
        let nextRan = false;
        runSerializedVehicleStateMutation(() => { nextRan = true; });
        assert.strictEqual(result.reasonCode, 'write_failed');
        assert.strictEqual(nextRan, true);
        assert.strictEqual(getVehicleStateWriteQueueDepthForTests(), 0);
    });
});

test('queue is released after restore validation failure', () => {
    withTempDir('lr-pre3b-restore-validation-', (dir) => {
        resetWorkspaceWriteQueueForTests();
        seedMigrationBackup(dir, '20260704T153012Z', legacyRaw);
        fs.writeFileSync(path.join(dir, 'vehicle_state.json'), JSON.stringify(makeV1Doc()), 'utf-8');
        const result = restoreVehicleStateMigrationBackup(dir, '20260704T153012Z', {
            now: fixedRestoreTime,
            writeTextAtomic: (target) => {
                fs.writeFileSync(target, JSON.stringify({ version: 99, vehicles: [] }), 'utf-8');
            },
            runSerializedVehicleStateMutation,
            clearVehicleStateCache: () => {},
        });
        let nextRan = false;
        runSerializedVehicleStateMutation(() => { nextRan = true; });
        assert.strictEqual(result.reasonCode, 'post_restore_validation_failed');
        assert.strictEqual(nextRan, true);
        assert.strictEqual(getVehicleStateWriteQueueDepthForTests(), 0);
    });
});

test('product writers do not nest or reacquire the vehicle queue', () => {
    const owner = fs.readFileSync(path.join(root, 'src', 'vehicleStateDocumentOwner.ts'), 'utf-8');
    const writeback = fs.readFileSync(path.join(root, 'src', 'ledgerMigrationWritebackHost.ts'), 'utf-8');
    const restore = fs.readFileSync(path.join(root, 'src', 'ledgerMigrationRestoreHost.ts'), 'utf-8');
    const writeRunner = fs.readFileSync(path.join(root, 'src', 'ledgerMigrationWritebackRunner.ts'), 'utf-8');
    const restoreRunner = fs.readFileSync(path.join(root, 'src', 'ledgerMigrationRestoreRunner.ts'), 'utf-8');
    assert.strictEqual((owner.match(/deps\.runSerializedMutation\(/g) || []).length, 1);
    assert.strictEqual((writeback.match(/runSerialized\(\(\) =>/g) || []).length, 1);
    assert.strictEqual((restore.match(/runSerialized\(\(\) =>/g) || []).length, 1);
    assert.doesNotMatch(writeRunner, /runSerializedVehicleStateMutation/);
    assert.doesNotMatch(restoreRunner, /runSerializedVehicleStateMutation/);
});

test('vehicle queue is the only lock and introduces no lock-order inversion', () => {
    const sources = ['ledgerMigrationWritebackHost.ts', 'ledgerMigrationRestoreHost.ts']
        .map((file) => fs.readFileSync(path.join(root, 'src', file), 'utf-8'))
        .join('\n');
    assert.doesNotMatch(sources, /runSerialized(?:Game|World|Workspace|Discovery|Campaign|Settlement)/);
    assert.doesNotMatch(sources, /stateOrchestrator|lockFile|mutex/i);
    assert.match(sources, /sole vehicle-queue acquisition layer/);
    assert.match(sources, /createSyncFileQueue\.drain's (?:finally|existing finally)/);
});

test('successful migration vehicle write clears vehicle cache', () => {
    withTempDir('lr-pre3b-write-cache-', (dir) => {
        seedLegacyWorkspace(dir);
        let clears = 0;
        const result = applyVehicleStateMigrationWriteback(dir, {
            now: fixedWritebackTime,
            runSerializedVehicleStateMutation: (fn) => fn(),
            clearVehicleStateCache: () => { clears += 1; },
        });
        assert.strictEqual(result.outcome, 'success');
        assert.strictEqual(clears, 1);
    });
});

test('successful vehicle restore clears vehicle cache', () => {
    withTempDir('lr-pre3b-restore-cache-', (dir) => {
        seedMigrationBackup(dir, '20260704T153012Z', legacyRaw);
        fs.writeFileSync(path.join(dir, 'vehicle_state.json'), JSON.stringify(makeV1Doc()), 'utf-8');
        let clears = 0;
        const result = restoreVehicleStateMigrationBackup(dir, '20260704T153012Z', {
            now: fixedRestoreTime,
            runSerializedVehicleStateMutation: (fn) => fn(),
            clearVehicleStateCache: () => { clears += 1; },
        });
        assert.strictEqual(result.outcome, 'success');
        assert.strictEqual(clears, 1);
    });
});

test('cache is not cleared before a failed replacement', () => {
    withTempDir('lr-pre3b-no-early-cache-', (dir) => {
        seedLegacyWorkspace(dir);
        let clears = 0;
        const failed = applyVehicleStateMigrationWriteback(dir, {
            now: fixedWritebackTime,
            writeJsonAtomic: () => { throw new Error('forced failure'); },
            runSerializedVehicleStateMutation: (fn) => fn(),
            clearVehicleStateCache: () => { clears += 1; },
        });
        assert.strictEqual(failed.reasonCode, 'write_failed');
        assert.strictEqual(clears, 0);

        seedMigrationBackup(dir, '20260704T153013Z', legacyRaw);
        const restoreFailed = restoreVehicleStateMigrationBackup(dir, '20260704T153013Z', {
            now: fixedRestoreTime,
            writeTextAtomic: () => { throw new Error('forced restore failure'); },
            runSerializedVehicleStateMutation: (fn) => fn(),
            clearVehicleStateCache: () => { clears += 1; },
        });
        assert.strictEqual(restoreFailed.reasonCode, 'write_failed');
        assert.strictEqual(clears, 0);
    });
});

test('normal v2 receipts remain preserved by the normal owner', () => {
    const before = makeV2Doc();
    const h = makeOwnerHarness(before);
    const result = tryApplyVehicleTurnOpsWithDeps({
        vehicleOps: [{ type: 'damage_vehicle', vehicleId: 'rust_wagon', amount: 2 }],
    }, h.vehicleTurnDeps());
    assert.strictEqual(result.applied, true);
    assert.deepStrictEqual(h.readDocument().gameplayCommitReceipts, before.gameplayCommitReceipts);
});

test('migration writeback output remains equivalent to previous behavior', () => {
    withTempDir('lr-pre3b-equivalent-write-', (dir) => {
        seedLegacyWorkspace(dir);
        const expected = migrateVehicleStateDocument(legacyRaw).migrated;
        const result = applyVehicleStateMigrationWriteback(dir, {
            now: fixedWritebackTime,
            runSerializedVehicleStateMutation: (fn) => fn(),
            clearVehicleStateCache: () => {},
        });
        const text = fs.readFileSync(path.join(dir, 'vehicle_state.json'), 'utf-8');
        assert.strictEqual(result.outcome, 'success');
        assert.strictEqual(text, JSON.stringify(expected, null, 2));
        assert.deepStrictEqual(JSON.parse(text), expected);
    });
});

test('restore writes the selected complete document without receipt merging', () => {
    withTempDir('lr-pre3b-complete-restore-', (dir) => {
        const selected = { version: 1, vehicles: [clone(baseVehicle)], updatedTurn: 2 };
        seedMigrationBackup(dir, '20260704T153012Z', selected);
        fs.writeFileSync(path.join(dir, 'vehicle_state.json'), JSON.stringify(makeV2Doc()), 'utf-8');
        const result = restoreVehicleStateMigrationBackup(dir, '20260704T153012Z', {
            now: fixedRestoreTime,
            runSerializedVehicleStateMutation: (fn) => fn(),
            clearVehicleStateCache: () => {},
        });
        const restored = JSON.parse(fs.readFileSync(path.join(dir, 'vehicle_state.json'), 'utf-8'));
        assert.strictEqual(result.outcome, 'success');
        assert.deepStrictEqual(restored, selected);
        assert.strictEqual(Object.hasOwn(restored, 'gameplayCommitReceipts'), false);
    });
});

test('migration and restore statuses and reason codes remain unchanged', () => {
    withTempDir('lr-pre3b-statuses-', (dir) => {
        seedLegacyWorkspace(dir);
        const backupFailure = applyVehicleStateMigrationWriteback(dir, {
            now: fixedWritebackTime,
            copyFile: () => { throw new Error('forced backup failure'); },
            runSerializedVehicleStateMutation: (fn) => fn(),
            clearVehicleStateCache: () => {},
        });
        assert.deepStrictEqual(
            [backupFailure.outcome, backupFailure.reasonCode, backupFailure.backupCreated],
            ['aborted', 'backup_failed', false]
        );

        seedMigrationBackup(dir, '20260704T153012Z', legacyRaw);
        const restoreFailure = restoreVehicleStateMigrationBackup(dir, '20260704T153012Z', {
            now: fixedRestoreTime,
            writeTextAtomic: () => { throw new Error('forced write failure'); },
            runSerializedVehicleStateMutation: (fn) => fn(),
            clearVehicleStateCache: () => {},
        });
        assert.deepStrictEqual(
            [restoreFailure.outcome, restoreFailure.reasonCode, restoreFailure.preRestoreBackupCreated],
            ['write_failed', 'write_failed', true]
        );
    });

    withTempDir('lr-pre3b-cache-warning-', (dir) => {
        seedLegacyWorkspace(dir);
        const queue = makeQueueSpy();
        const cacheFailure = applyVehicleStateMigrationWriteback(dir, {
            now: fixedWritebackTime,
            runSerializedVehicleStateMutation: (fn) => queue.run(fn),
            clearVehicleStateCache: () => { throw new Error('forced cache clear failure'); },
        });
        assert.strictEqual(cacheFailure.outcome, 'success');
        assert.strictEqual(
            cacheFailure.cacheRefreshWarning,
            'cache_clear_failed_after_commit'
        );
        assert.strictEqual(queue.depth, 0);
    });
});

test('State Orchestrator remains a non-product potential bypass', () => {
    const executorSource = fs.readFileSync(
        path.join(root, 'src', 'stateOrchestratorExecutorHost.ts'),
        'utf-8'
    );
    const productionCallers = fs.readdirSync(path.join(root, 'src'))
        .filter((file) => file.endsWith('.ts') && file !== 'stateOrchestratorExecutorHost.ts')
        .filter((file) => fs.readFileSync(path.join(root, 'src', file), 'utf-8')
            .includes('executeTransactionSequenceHost'));
    assert.deepStrictEqual(productionCallers, []);
    assert.match(executorSource, /fs\.renameSync\(tmpPath, canonicalPath\)/);
    const migrationDescriptors = LEDGER_DESCRIPTORS.filter((descriptor) => (
        descriptor.id === 'migration_vehicle_writeback'
        || descriptor.id === 'migration_vehicle_restore'
    ));
    assert.strictEqual(migrationDescriptors.length, 2);
    assert.ok(migrationDescriptors.every((descriptor) => (
        descriptor.serializedQueue === KNOWN_LEDGER_QUEUE_NAMES.vehicle_state
        && !descriptor.coordinationExempt
    )));
});

test('coordination creates no Gameplay receipt', () => {
    withTempDir('lr-pre3b-no-receipt-', (dir) => {
        seedLegacyWorkspace(dir);
        applyVehicleStateMigrationWriteback(dir, {
            now: fixedWritebackTime,
            runSerializedVehicleStateMutation: (fn) => fn(),
            clearVehicleStateCache: () => {},
        });
        const migrated = JSON.parse(fs.readFileSync(path.join(dir, 'vehicle_state.json'), 'utf-8'));
        assert.strictEqual(Object.hasOwn(migrated, 'gameplayCommitReceipts'), false);
    });
    const sources = ['ledgerMigrationWritebackHost.ts', 'ledgerMigrationRestoreHost.ts']
        .map((file) => fs.readFileSync(path.join(root, 'src', file), 'utf-8'))
        .join('\n');
    assert.doesNotMatch(sources, /GameplayCommitReceipt|appendReceipt|createReceipt/);
});

test('coordination performs no v1 to v2 migration', () => {
    withTempDir('lr-pre3b-no-v2-', (dir) => {
        seedLegacyWorkspace(dir);
        applyVehicleStateMigrationWriteback(dir, {
            now: fixedWritebackTime,
            runSerializedVehicleStateMutation: (fn) => fn(),
            clearVehicleStateCache: () => {},
        });
        assert.strictEqual(
            JSON.parse(fs.readFileSync(path.join(dir, 'vehicle_state.json'), 'utf-8')).version,
            1
        );
    });
});

test('PRE3A durability regressions remain registered for separate execution', () => {
    const runAll = fs.readFileSync(path.join(root, 'scripts', 'run_all_tests.js'), 'utf-8');
    assert.match(runAll, /test_vehicle_state_document_owner_durability\.js/);
    const ownerSource = fs.readFileSync(path.join(root, 'src', 'vehicleStateDocumentOwner.ts'), 'utf-8');
    assert.match(ownerSource, /write_failed_before_replace/);
    assert.match(ownerSource, /reload_mismatch_after_replace/);
    assert.match(ownerSource, /cache_clear_failed_after_commit/);
});

assert.strictEqual(tests.length, 25, 'coordination test count must remain exactly 25');

let failed = 0;
tests.forEach(({ name, fn }, index) => {
    try {
        fn();
        console.log(`OK: ${index + 1}. ${name}`);
    } catch (error) {
        failed += 1;
        console.error(`FAIL: ${index + 1}. ${name}`);
        console.error(error && error.stack ? error.stack : error);
    }
});

if (failed > 0) {
    console.error(`\n${failed} vehicle writer coordination test(s) failed`);
    process.exit(1);
}

console.log('\nAll 25 vehicle writer coordination tests passed.');
