#!/usr/bin/env node
'use strict';

// NOAI-GAMEPLAY-SPINE-005B-PRE3A: durable normal vehicle document owner tests.

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const required = [
    'out/vehicleStateDocumentOwner.js',
    'out/vehicleStateDocumentCore.js',
    'out/vehicleTurnOpsCore.js',
    'out/mobileBaseTurnOpsCore.js',
    'out/vehicleOpsCore.js',
    'out/mobileBaseOpsCore.js',
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
    canonicalizeVehicleStateDocument,
    parseVehicleStateDocument,
    projectVehicleStateDocumentMechanical,
} = require(path.join(root, 'out', 'vehicleStateDocumentCore.js'));
const {
    tryApplyVehicleTurnOpsWithDeps,
} = require(path.join(root, 'out', 'vehicleTurnOpsCore.js'));
const {
    tryApplyMobileBaseTurnOpsWithDeps,
} = require(path.join(root, 'out', 'mobileBaseTurnOpsCore.js'));
const { applyVehicleOps } = require(path.join(root, 'out', 'vehicleOpsCore.js'));
const { applyMobileBaseOps } = require(path.join(root, 'out', 'mobileBaseOpsCore.js'));

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
        currentCargoLoad: 12,
    },
    access: {
        sizeClass: 'large',
        accessTags: ['road', 'offroad', 'wide_gate'],
        blockedBy: ['stairs'],
    },
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

const committedReceipt = {
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

const noopReceipt = {
    schemaVersion: 1,
    commitId: 'commit_2',
    requestId: 'request_2',
    resolutionId: 'resolution_2',
    planId: 'plan_2',
    actionKey: 'vehicle:repair_vehicle',
    actionVersion: 1,
    status: 'valid_noop',
    ledgerId: 'vehicle_state',
    effectIds: ['effect_2'],
    appliedEffectIds: [],
    skippedEffectIds: ['effect_2'],
    confirmationTokenDigest: digestChar('e'),
    effectPlanDigest: digestChar('f'),
    beforeLedgerDigest: digestChar('d'),
    afterLedgerDigest: digestChar('d'),
    target: { kind: 'vehicle', id: 'rust_wagon' },
    requestedRepair: 10,
    hpBefore: 100,
    hpAfter: 100,
    effectiveRepair: 0,
    clockSnapshot: [],
};

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
        gameplayCommitReceipts: [clone(committedReceipt), clone(noopReceipt)],
    };
}

function codedError(code, message) {
    const error = new Error(message ?? code);
    error.code = code;
    return error;
}

function makeHarness(initialDocument, options = {}) {
    const statePath = path.join('C:\\focused-workspace', 'vehicle_state.json');
    const tempPath = path.join(
        path.dirname(statePath),
        '.lorerelay-vehicle-state-123-456-1.tmp'
    );
    let canonicalText = typeof initialDocument === 'string'
        ? initialDocument
        : JSON.stringify(initialDocument, null, 2);
    let tempPayload;
    let tempExists = false;
    let replaceSucceeded = false;
    let cacheClears = 0;
    let cleanupCalls = 0;
    let queueCalls = 0;
    let renameAttempts = 0;
    const renamePlan = Array.isArray(options.renamePlan) ? options.renamePlan.slice() : [];
    const events = [];
    const diagnostics = [];

    const deps = {
        getVehicleStatePath: () => statePath,
        fileExists: (candidate) => {
            if (candidate === statePath) {
                return !(replaceSucceeded && options.reloadMissing);
            }
            return candidate === tempPath && tempExists;
        },
        readFileUtf8: (candidate) => {
            assert.strictEqual(candidate, statePath);
            if (!replaceSucceeded) {
                events.push('initial_read');
                return canonicalText;
            }
            events.push('reload');
            if (options.reloadReadFailure) {
                throw new Error('forced reload read failure');
            }
            if (options.reloadInvalid) {
                return '{invalid-json';
            }
            if (options.reloadMismatch) {
                const mismatched = JSON.parse(canonicalText);
                mismatched.vehicles[0].durability.hp -= 1;
                return JSON.stringify(mismatched);
            }
            if (options.reloadPrettyPrint) {
                return JSON.stringify(JSON.parse(canonicalText), null, 4);
            }
            return canonicalText;
        },
        allocateTempPath: (candidate) => {
            assert.strictEqual(candidate, statePath);
            events.push('allocate_temp');
            return tempPath;
        },
        openTempFile: (candidate) => {
            assert.strictEqual(candidate, tempPath);
            events.push('open_temp');
            if (options.openFailure) {
                throw new Error('forced temp open failure');
            }
            tempExists = true;
            return 17;
        },
        writeTempFileUtf8: (fd, payload) => {
            assert.strictEqual(fd, 17);
            events.push('write_temp');
            if (options.writeFailure) {
                throw new Error('forced temp write failure');
            }
            tempPayload = payload;
        },
        fsyncTempFile: (fd) => {
            assert.strictEqual(fd, 17);
            events.push('fsync_temp');
            if (options.fsyncFailure) {
                throw new Error('forced temp fsync failure');
            }
        },
        closeTempFile: (fd) => {
            assert.strictEqual(fd, 17);
            events.push('close_temp');
            if (options.closeFailure) {
                throw new Error('forced temp close failure');
            }
        },
        renameFile: (from, to) => {
            assert.strictEqual(from, tempPath);
            assert.strictEqual(to, statePath);
            events.push('rename');
            renameAttempts += 1;
            if (renamePlan.length > 0) {
                const code = renamePlan.shift();
                if (code) {
                    throw codedError(code, 'forced rename failure');
                }
            }
            canonicalText = tempPayload;
            tempExists = false;
            replaceSucceeded = true;
        },
        waitBeforeRenameRetry: () => events.push('rename_retry_wait'),
        cleanupTempFile: (candidate) => {
            assert.strictEqual(candidate, tempPath);
            events.push('cleanup_temp');
            cleanupCalls += 1;
            tempExists = false;
        },
        syncDirectoryBestEffort: (candidate) => {
            assert.strictEqual(candidate, path.dirname(statePath));
            events.push('fsync_directory');
            return options.directoryWarning;
        },
        clearVehicleStateCache: () => {
            events.push('cache_clear');
            cacheClears += 1;
            if (options.cacheClearFailure) {
                throw new Error('forced cache clear failure');
            }
        },
        runSerializedMutation: (fn) => {
            events.push('queue_start');
            queueCalls += 1;
            fn();
            events.push('queue_end');
        },
        reportDiagnostic: (message, error) => diagnostics.push({ message, error }),
    };

    return {
        deps,
        statePath,
        tempPath,
        events,
        diagnostics,
        get canonicalText() { return canonicalText; },
        get tempPayload() { return tempPayload; },
        get cacheClears() { return cacheClears; },
        get cleanupCalls() { return cleanupCalls; },
        get queueCalls() { return queueCalls; },
        get renameAttempts() { return renameAttempts; },
        get replaceSucceeded() { return replaceSucceeded; },
        readDocument() { return JSON.parse(canonicalText); },
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

function damageMechanical(current, amount = 1) {
    const next = clone(current);
    next.vehicles[0].durability.hp -= amount;
    next.updatedTurn += 1;
    return next;
}

function runMutation(harness, mutate = (current) => damageMechanical(current)) {
    return runSerializedVehicleStateDocumentMutationWithDeps(
        harness.deps,
        'durabilityTest',
        mutate
    );
}

function parsedDocument(raw) {
    const parsed = parseVehicleStateDocument(raw);
    assert.ok(parsed.kind === 'valid_v1' || parsed.kind === 'valid_v2');
    return parsed.document;
}

function mechanicalFromRaw(raw) {
    return projectVehicleStateDocumentMechanical(parsedDocument(raw));
}

const tests = [];
function test(name, fn) {
    tests.push({ name, fn });
}

test('successful v1 uses temp, fsync, replace, reload, then cache clear', () => {
    const h = makeHarness(makeV1Doc(), {
        directoryWarning: 'directory_fsync_unsupported',
    });
    const result = runMutation(h);
    assert.deepStrictEqual(h.events, [
        'queue_start',
        'initial_read',
        'allocate_temp',
        'open_temp',
        'write_temp',
        'fsync_temp',
        'close_temp',
        'rename',
        'fsync_directory',
        'reload',
        'cache_clear',
        'queue_end',
    ]);
    assert.strictEqual(result.commitState, 'committed');
    assert.strictEqual(result.applied, true);
    assert.strictEqual(result.durabilityWarning, 'directory_fsync_unsupported');
    assert.strictEqual(path.dirname(h.tempPath), path.dirname(h.statePath));
    assert.match(path.basename(h.tempPath), /^\.lorerelay-vehicle-state-\d+-\d+-\d+\.tmp$/);
    assert.strictEqual(
        h.tempPayload,
        `${canonicalizeVehicleStateDocument(parsedDocument(h.readDocument()))}\n`
    );
});

test('successful v2 preserves all receipts', () => {
    const before = makeV2Doc();
    const h = makeHarness(before);
    const result = runMutation(h);
    assert.strictEqual(result.commitState, 'committed');
    assert.deepStrictEqual(h.readDocument().gameplayCommitReceipts, before.gameplayCommitReceipts);
});

test('reload semantic equality ignores formatting differences', () => {
    const h = makeHarness(makeV2Doc(), { reloadPrettyPrint: true });
    const result = runMutation(h);
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.commitState, 'committed');
});

test('mechanical no-op performs zero filesystem write operations', () => {
    const h = makeHarness(makeV1Doc());
    const result = runMutation(h, (current) => clone(current));
    assert.strictEqual(result.reason, 'no_change');
    assert.strictEqual(result.commitState, 'not_committed');
    assert.deepStrictEqual(h.events, ['queue_start', 'initial_read', 'queue_end']);
});

test('corrupt document performs zero write operations', () => {
    const h = makeHarness('{corrupt-json');
    const result = runMutation(h);
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.reason, 'invalid_document');
    assert.deepStrictEqual(h.events, ['queue_start', 'initial_read', 'queue_end']);
});

test('temp open failure returns not_committed', () => {
    const h = makeHarness(makeV1Doc(), { openFailure: true });
    const before = h.canonicalText;
    const result = runMutation(h);
    assert.strictEqual(result.reason, 'write_failed_before_replace');
    assert.strictEqual(result.commitState, 'not_committed');
    assert.strictEqual(h.canonicalText, before);
    assert.strictEqual(h.replaceSucceeded, false);
    assert.strictEqual(h.cleanupCalls, 0);
});

test('temp write failure is not_committed and cleans temp best effort', () => {
    const h = makeHarness(makeV1Doc(), { writeFailure: true });
    const result = runMutation(h);
    assert.strictEqual(result.commitState, 'not_committed');
    assert.strictEqual(result.reason, 'write_failed_before_replace');
    assert.strictEqual(h.cleanupCalls, 1);
    assert.strictEqual(h.replaceSucceeded, false);
});

test('temp fsync failure returns not_committed', () => {
    const h = makeHarness(makeV1Doc(), { fsyncFailure: true });
    const result = runMutation(h);
    assert.strictEqual(result.commitState, 'not_committed');
    assert.strictEqual(result.reason, 'write_failed_before_replace');
    assert.strictEqual(h.cleanupCalls, 1);
    assert.strictEqual(h.events.includes('rename'), false);
});

test('temp close failure before replace returns not_committed', () => {
    const h = makeHarness(makeV1Doc(), { closeFailure: true });
    const result = runMutation(h);
    assert.strictEqual(result.commitState, 'not_committed');
    assert.strictEqual(result.reason, 'write_failed_before_replace');
    assert.strictEqual(h.cleanupCalls, 1);
    assert.strictEqual(h.events.includes('rename'), false);
});

test('replace failure returns not_committed without deleting canonical', () => {
    const h = makeHarness(makeV1Doc(), { renamePlan: ['ENOENT'] });
    const before = h.canonicalText;
    const result = runMutation(h);
    assert.strictEqual(result.reason, 'replace_failed');
    assert.strictEqual(result.commitState, 'not_committed');
    assert.strictEqual(h.canonicalText, before);
    assert.strictEqual(h.cleanupCalls, 1);
});

test('retryable rename conflict uses bounded retry path', () => {
    const h = makeHarness(makeV1Doc(), { renamePlan: ['EPERM', null] });
    const result = runMutation(h);
    assert.strictEqual(result.commitState, 'committed');
    assert.strictEqual(h.renameAttempts, 2);
    assert.strictEqual(h.events.filter((event) => event === 'rename_retry_wait').length, 1);
});

test('rename retry exhaustion returns not_committed', () => {
    const h = makeHarness(makeV1Doc(), { renamePlan: Array(5).fill('EPERM') });
    const result = runMutation(h);
    assert.strictEqual(result.reason, 'replace_failed');
    assert.strictEqual(result.commitState, 'not_committed');
    assert.strictEqual(h.renameAttempts, 5);
    assert.strictEqual(h.events.filter((event) => event === 'rename_retry_wait').length, 4);
});

test('replace success plus reload read failure is indeterminate', () => {
    const h = makeHarness(makeV1Doc(), { reloadReadFailure: true });
    const result = runMutation(h);
    assert.strictEqual(h.replaceSucceeded, true);
    assert.strictEqual(result.reason, 'reload_failed_after_replace');
    assert.strictEqual(result.commitState, 'indeterminate');
    assert.strictEqual(result.reconciliationRequired, true);
    assert.strictEqual(result.applied, false);
    assert.strictEqual(h.cacheClears, 0);
});

test('replace success plus invalid reload document is indeterminate', () => {
    const h = makeHarness(makeV1Doc(), { reloadInvalid: true });
    const result = runMutation(h);
    assert.strictEqual(result.reason, 'reload_failed_after_replace');
    assert.strictEqual(result.commitState, 'indeterminate');
    assert.strictEqual(h.cacheClears, 0);
});

test('replace success plus semantic mismatch is indeterminate', () => {
    const h = makeHarness(makeV2Doc(), { reloadMismatch: true });
    const result = runMutation(h);
    assert.strictEqual(result.reason, 'reload_mismatch_after_replace');
    assert.strictEqual(result.commitState, 'indeterminate');
    assert.strictEqual(h.cacheClears, 0);
});

test('indeterminate result never attempts rollback', () => {
    const h = makeHarness(makeV1Doc(), { reloadMismatch: true });
    const result = runMutation(h);
    assert.strictEqual(result.commitState, 'indeterminate');
    assert.strictEqual(h.events.filter((event) => event === 'write_temp').length, 1);
    assert.strictEqual(h.events.filter((event) => event === 'rename').length, 1);
    assert.strictEqual(h.cleanupCalls, 0);
});

test('cache clear failure remains committed with warning', () => {
    const h = makeHarness(makeV1Doc(), { cacheClearFailure: true });
    const result = runMutation(h);
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.applied, true);
    assert.strictEqual(result.commitState, 'committed');
    assert.strictEqual(result.refreshWarning, 'cache_clear_failed_after_commit');
});

test('verified commit clears cache exactly once', () => {
    const h = makeHarness(makeV1Doc());
    const result = runMutation(h);
    assert.strictEqual(result.commitState, 'committed');
    assert.strictEqual(h.cacheClears, 1);
    assert.ok(h.events.indexOf('reload') < h.events.indexOf('cache_clear'));
});

test('v1 input remains v1', () => {
    const h = makeHarness(makeV1Doc());
    runMutation(h);
    const raw = h.readDocument();
    assert.strictEqual(raw.version, 1);
    assert.strictEqual(Object.hasOwn(raw, 'gameplayCommitReceipts'), false);
});

test('v2 input remains v2', () => {
    const h = makeHarness(makeV2Doc());
    runMutation(h);
    assert.strictEqual(h.readDocument().version, 2);
});

test('receipt order and every value remain identical', () => {
    const before = makeV2Doc();
    const h = makeHarness(before);
    runMutation(h);
    const after = h.readDocument();
    assert.strictEqual(after.gameplayCommitReceipts.length, 2);
    assert.deepStrictEqual(after.gameplayCommitReceipts, before.gameplayCommitReceipts);
});

test('owner serialization queue contract remains unchanged', () => {
    const h = makeHarness(makeV1Doc());
    runMutation(h);
    assert.strictEqual(h.queueCalls, 1);
    assert.strictEqual(h.events[0], 'queue_start');
    assert.strictEqual(h.events[h.events.length - 1], 'queue_end');
    const queueSource = fs.readFileSync(path.join(root, 'src', 'workspaceStateQueue.ts'), 'utf-8');
    assert.match(queueSource, /runSerializedVehicleStateMutation/);
});

test('vehicleOps normal writer uses the hardened owner', () => {
    const h = makeHarness(makeV1Doc());
    const result = tryApplyVehicleTurnOpsWithDeps({
        vehicleOps: [{ type: 'damage_vehicle', vehicleId: 'rust_wagon', amount: 3 }],
    }, h.vehicleTurnDeps());
    assert.strictEqual(result.applied, true);
    assert.strictEqual(h.readDocument().vehicles[0].durability.hp, 39);
    assert.ok(h.events.includes('fsync_temp'));
    assert.ok(h.events.includes('reload'));
});

test('mobileBaseOps normal writer uses the hardened owner', () => {
    const h = makeHarness(makeV1Doc([mobileBaseVehicle]));
    const result = tryApplyMobileBaseTurnOpsWithDeps({
        mobileBaseOps: [{
            type: 'move_mobile_base',
            vehicleId: 'ashcrawler_hull',
            locationId: 'east_road',
        }],
    }, h.mobileTurnDeps());
    const hull = h.readDocument().vehicles.find((vehicle) => vehicle.id === 'ashcrawler_hull');
    assert.strictEqual(result.applied, true);
    assert.strictEqual(hull.locationId, 'east_road');
    assert.ok(h.events.includes('fsync_temp'));
    assert.ok(h.events.includes('reload'));
});

test('mechanical results remain identical to pure operation cores', () => {
    const vehicleOps = [{ type: 'repair_vehicle', vehicleId: 'rust_wagon', amount: 5 }];
    const vehicleBefore = mechanicalFromRaw(makeV1Doc());
    const pureVehicle = applyVehicleOps(vehicleBefore, vehicleOps, { worldTurn: 9 });
    const vehicleHarness = makeHarness(makeV1Doc());
    runMutation(
        vehicleHarness,
        (current) => applyVehicleOps(current, vehicleOps, { worldTurn: 9 })
    );
    assert.deepStrictEqual(mechanicalFromRaw(vehicleHarness.readDocument()), pureVehicle);

    const mobileOps = [{
        type: 'move_mobile_base',
        vehicleId: 'ashcrawler_hull',
        locationId: 'ridge',
    }];
    const mobileBefore = mechanicalFromRaw(makeV1Doc([mobileBaseVehicle]));
    const pureMobile = applyMobileBaseOps(mobileBefore, mobileOps, { worldTurn: 4 });
    const mobileHarness = makeHarness(makeV1Doc([mobileBaseVehicle]));
    runMutation(
        mobileHarness,
        (current) => applyMobileBaseOps(current, mobileOps, { worldTurn: 4 })
    );
    assert.deepStrictEqual(mechanicalFromRaw(mobileHarness.readDocument()), pureMobile);
});

test('PRE1 and PRE2 focused regression contracts remain registered', () => {
    const runAll = fs.readFileSync(path.join(root, 'scripts', 'run_all_tests.js'), 'utf-8');
    assert.match(runAll, /test_vehicle_state_document_v2_core\.js/);
    assert.match(runAll, /test_vehicle_state_document_owner\.js/);
    assert.strictEqual(typeof canonicalizeVehicleStateDocument, 'function');
    assert.strictEqual(typeof runSerializedVehicleStateDocumentMutationWithDeps, 'function');
});

test('migration and restore sources remain outside the normal owner', () => {
    const exceptionalSources = [
        'ledgerMigrationWritebackCore.ts',
        'ledgerMigrationWritebackHost.ts',
        'ledgerMigrationWritebackRunner.ts',
        'ledgerMigrationRestoreCore.ts',
        'ledgerMigrationRestoreHost.ts',
        'ledgerMigrationRestoreRunner.ts',
    ];
    for (const file of exceptionalSources) {
        const source = fs.readFileSync(path.join(root, 'src', file), 'utf-8');
        assert.doesNotMatch(source, /vehicleStateDocumentOwner|PRE3A/);
    }
    const ownerSource = fs.readFileSync(
        path.join(root, 'src', 'vehicleStateDocumentOwner.ts'),
        'utf-8'
    );
    assert.doesNotMatch(ownerSource, /ledgerMigration(?:Writeback|Restore)/);
});

test('normal owner creates no Gameplay receipt', () => {
    const v1 = makeHarness(makeV1Doc());
    runMutation(v1);
    assert.strictEqual(Object.hasOwn(v1.readDocument(), 'gameplayCommitReceipts'), false);
    const before = makeV2Doc();
    const v2 = makeHarness(before);
    runMutation(v2);
    assert.deepStrictEqual(v2.readDocument().gameplayCommitReceipts, before.gameplayCommitReceipts);
});

test('no generic transaction layer is introduced', () => {
    const ownerSource = fs.readFileSync(
        path.join(root, 'src', 'vehicleStateDocumentOwner.ts'),
        'utf-8'
    );
    assert.doesNotMatch(ownerSource, /workspacePaths|StateOrchestrator|generic transaction/i);
    assert.match(ownerSource, /replaceVehicleStateDocumentDurably/);
    assert.match(ownerSource, /renameFile\(tempPath, statePath\)/);
    assert.doesNotMatch(ownerSource, /unlinkSync\(statePath\)|rmSync\(statePath\)/);
});

assert.strictEqual(tests.length, 29, 'durability test count must remain exactly 29');

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
    console.error(`\n${failed} vehicle document durability test(s) failed`);
    process.exit(1);
}

console.log('\nAll 29 vehicle document durability tests passed.');
