#!/usr/bin/env node
'use strict';

// NOAI-GAMEPLAY-SPINE-005B-PRE2: vehicle state document owner focused tests.

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const root = path.join(__dirname, '..');
const required = [
    'out/vehicleStateDocumentOwner.js',
    'out/vehicleStateDocumentCore.js',
    'out/vehicleTurnOpsCore.js',
    'out/mobileBaseTurnOpsCore.js',
    'out/vehicleOpsCore.js',
    'out/mobileBaseOpsCore.js',
    'out/vehicleCore.js',
    'out/vehicleViewCore.js',
    'out/gameplaySpineVehicleRepairPlanAdapterCore.js',
];
for (const rel of required) {
    if (!fs.existsSync(path.join(root, rel))) {
        console.error(`FAIL: ${rel} missing — run npm run compile first`);
        process.exit(1);
    }
}

const {
    readVehicleStateDocumentFreshWithDeps,
    readMechanicalVehicleStateFreshWithDeps,
    runSerializedVehicleStateDocumentMutationWithDeps,
} = require(path.join(root, 'out', 'vehicleStateDocumentOwner.js'));
const {
    parseVehicleStateDocument,
    projectVehicleStateDocumentMechanical,
    canonicalizeVehicleStateDocument,
} = require(path.join(root, 'out', 'vehicleStateDocumentCore.js'));
const { tryApplyVehicleTurnOpsWithDeps } = require(path.join(root, 'out', 'vehicleTurnOpsCore.js'));
const { tryApplyMobileBaseTurnOpsWithDeps } = require(path.join(root, 'out', 'mobileBaseTurnOpsCore.js'));
const { applyVehicleOps } = require(path.join(root, 'out', 'vehicleOpsCore.js'));
const { applyMobileBaseOps } = require(path.join(root, 'out', 'mobileBaseOpsCore.js'));
const { buildVehiclePromptBlock, parseVehicleState } = require(path.join(root, 'out', 'vehicleCore.js'));
const { buildVehicleGarageSnapshot } = require(path.join(root, 'out', 'vehicleViewCore.js'));
const {
    planVehicleRepairPreview,
} = require(path.join(root, 'out', 'gameplaySpineVehicleRepairPlanAdapterCore.js'));

function clone(v) { return JSON.parse(JSON.stringify(v)); }
function digestChar(c) { return c.repeat(64); }

const baseVehicle = {
    id: 'rust_wagon',
    name: 'Rust Wagon',
    kind: 'truck',
    owner: { type: 'party' },
    status: 'parked',
    locationId: 'outer_gate',
    capacity: { crewRequired: 1, crewCapacity: 2, passengerCapacity: 4, cargoCapacity: 30, currentCargoLoad: 12 },
    access: { sizeClass: 'large', accessTags: ['road', 'offroad', 'wide_gate'], blockedBy: ['stairs'] },
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
    capacity: { crewRequired: 2, crewCapacity: 8, passengerCapacity: 4, cargoCapacity: 40 },
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
    const doc = makeV1Doc(extraVehicles);
    doc.version = 2;
    doc.gameplayCommitReceipts = [clone(committedReceipt), clone(noopReceipt)];
    return doc;
}

function makeOwnerHarness(initialDoc) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lr-vehicle-owner-'));
    const statePath = path.join(dir, 'vehicle_state.json');
    const originalText = JSON.stringify(initialDoc, null, 2);
    fs.writeFileSync(statePath, originalText, 'utf-8');
    let writeCount = 0;
    let cacheClears = 0;
    let writeShouldFail = false;
    let lastQueueName = null;
    const queueCalls = [];

    const deps = {
        getVehicleStatePath: () => statePath,
        fileExists: (p) => fs.existsSync(p),
        readFileUtf8: (p) => fs.readFileSync(p, 'utf-8'),
        writeJsonAtomic: (p, doc) => {
            if (writeShouldFail) {
                throw new Error('forced write failure');
            }
            writeCount += 1;
            fs.writeFileSync(p, JSON.stringify(doc, null, 2), 'utf-8');
        },
        clearVehicleStateCache: () => { cacheClears += 1; },
        runSerializedMutation: (fn) => fn(),
    };

    return {
        dir,
        statePath,
        deps,
        originalText,
        get writeCount() { return writeCount; },
        get cacheClears() { return cacheClears; },
        setWriteFail(v) { writeShouldFail = v; },
        readRaw() { return JSON.parse(fs.readFileSync(statePath, 'utf-8')); },
        readText() { return fs.readFileSync(statePath, 'utf-8'); },
        vehicleTurnDeps() {
            return {
                isVehicleSystemEnabled: () => true,
                getVehicleStatePath: () => statePath,
                loadWorldTurn: () => 11,
                runSerializedVehicleStateDocumentMutation: (name, mutate) => {
                    queueCalls.push(name);
                    lastQueueName = name;
                    return runSerializedVehicleStateDocumentMutationWithDeps(deps, name, mutate);
                },
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
                runSerializedVehicleStateDocumentMutation: (name, mutate) => {
                    queueCalls.push(name);
                    lastQueueName = name;
                    return runSerializedVehicleStateDocumentMutationWithDeps(deps, name, mutate);
                },
            };
        },
        get queueCalls() { return queueCalls.slice(); },
        get lastQueueName() { return lastQueueName; },
        cleanup() { fs.rmSync(dir, { recursive: true, force: true }); },
    };
}

let failed = 0;
function ok(msg) { console.log(`OK: ${msg}`); }
function fail(msg) { console.error(`FAIL: ${msg}`); failed++; }

function receiptsFingerprint(doc) {
    if (!doc || !Array.isArray(doc.gameplayCommitReceipts)) {
        return doc && Object.prototype.hasOwnProperty.call(doc, 'gameplayCommitReceipts')
            ? JSON.stringify(doc.gameplayCommitReceipts)
            : '<absent>';
    }
    return JSON.stringify(doc.gameplayCommitReceipts);
}

// 1–3 fresh read
{
    const h = makeOwnerHarness(makeV1Doc());
    const fresh = readVehicleStateDocumentFreshWithDeps(h.deps);
    if (!fresh.ok || fresh.document.version !== 1) {
        fail('1. valid v1 fresh-read');
    } else if (fresh.mechanical.activeVehicleId !== 'rust_wagon') {
        fail('1. v1 mechanical projection wrong');
    } else {
        ok('1. valid v1 fresh-read returns mechanical state');
    }
    const mech = readMechanicalVehicleStateFreshWithDeps(h.deps);
    if (!mech || mech.version !== 1 || Object.prototype.hasOwnProperty.call(mech, 'gameplayCommitReceipts')) {
        fail('3. mechanical must not expose receipts (v1 path)');
    } else {
        ok('3. v1 mechanical has no receipt metadata');
    }
    h.cleanup();
}

{
    const h = makeOwnerHarness(makeV2Doc());
    const fresh = readVehicleStateDocumentFreshWithDeps(h.deps);
    if (!fresh.ok || fresh.document.version !== 2) {
        fail('2. valid v2 fresh-read document');
    } else {
        const projected = projectVehicleStateDocumentMechanical(fresh.document);
        if (JSON.stringify(projected) !== JSON.stringify(fresh.mechanical)) {
            fail('2. v2 mechanical projection mismatch');
        } else if (Object.prototype.hasOwnProperty.call(fresh.mechanical, 'gameplayCommitReceipts')) {
            fail('3. v2 mechanical leaked receipts');
        } else {
            ok('2. valid v2 fresh-read returns same mechanical projection');
            ok('3. v2 receipt metadata not exposed to mechanical consumers');
        }
    }
    h.cleanup();
}

// 4–6 vehicle op v1/v2
{
    const h = makeOwnerHarness(makeV1Doc());
    const result = tryApplyVehicleTurnOpsWithDeps({
        vehicleOps: [{ type: 'damage_vehicle', vehicleId: 'rust_wagon', amount: 3 }],
    }, h.vehicleTurnDeps());
    const raw = h.readRaw();
    if (!result.applied || !result.ok) {
        fail(`4 vehicle op apply failed: ${JSON.stringify(result)}`);
    } else if (raw.version !== 1) {
        fail(`4. successful vehicle op on v1 must write v1, got version=${raw.version}`);
    } else if (Object.prototype.hasOwnProperty.call(raw, 'gameplayCommitReceipts')) {
        fail('20. v1 silently upgraded / gained receipts');
    } else if (raw.vehicles[0].durability.hp !== 39) {
        fail(`23. vehicle mechanical result wrong hp=${raw.vehicles[0].durability.hp}`);
    } else {
        ok('4. successful vehicle op on v1 writes v1');
        ok('20. v1 is not silently upgraded');
        ok('23. vehicle operation results remain mechanically identical');
    }
    h.cleanup();
}

{
    const h = makeOwnerHarness(makeV2Doc());
    const beforeReceipts = receiptsFingerprint(h.readRaw());
    const beforeCanonical = canonicalizeVehicleStateDocument(
        parseVehicleStateDocument(h.readRaw()).document
    );
    const result = tryApplyVehicleTurnOpsWithDeps({
        vehicleOps: [{ type: 'damage_vehicle', vehicleId: 'rust_wagon', amount: 3 }],
    }, h.vehicleTurnDeps());
    const raw = h.readRaw();
    const afterReceipts = receiptsFingerprint(raw);
    if (!result.applied || raw.version !== 2) {
        fail(`5. successful vehicle op on v2 writes v2: ${JSON.stringify({ result, v: raw.version })}`);
    } else if (afterReceipts !== beforeReceipts) {
        fail('6. v2 vehicle op must preserve every receipt and order');
    } else if (raw.gameplayCommitReceipts.length !== 2) {
        fail('19. receipts appended or evicted');
    } else {
        ok('5. successful vehicle op on v2 writes v2');
        ok('6. v2 vehicle op preserves every receipt and receipt order');
        ok('19. no receipt is appended or evicted');
    }
    // mechanical digest changed but receipts same
    const afterDoc = parseVehicleStateDocument(raw);
    if (afterDoc.kind !== 'valid_v2') {
        fail('5. output not valid v2');
    } else if (canonicalizeVehicleStateDocument(afterDoc.document) === beforeCanonical) {
        // whole document should change due to hp
        fail('5. whole document should change mechanically');
    }
    h.cleanup();
}

// 7–9 mobile-base op
{
    const h = makeOwnerHarness(makeV1Doc([mobileBaseVehicle]));
    const result = tryApplyMobileBaseTurnOpsWithDeps({
        mobileBaseOps: [{ type: 'move_mobile_base', vehicleId: 'ashcrawler_hull', locationId: 'east_road' }],
    }, h.mobileTurnDeps());
    const raw = h.readRaw();
    const hull = raw.vehicles.find((v) => v.id === 'ashcrawler_hull');
    if (!result.applied || raw.version !== 1 || hull?.locationId !== 'east_road') {
        fail(`7. mobile-base v1 write failed: ${JSON.stringify({ result, loc: hull?.locationId, v: raw.version })}`);
    } else {
        ok('7. successful mobile-base op on v1 writes v1');
        ok('24. mobile-base operation results remain mechanically identical');
    }
    h.cleanup();
}

{
    const v2 = makeV2Doc([mobileBaseVehicle]);
    // retarget receipt target is fine as-is
    const h = makeOwnerHarness(v2);
    const beforeReceipts = receiptsFingerprint(h.readRaw());
    const result = tryApplyMobileBaseTurnOpsWithDeps({
        mobileBaseOps: [{ type: 'move_mobile_base', vehicleId: 'ashcrawler_hull', locationId: 'east_road' }],
    }, h.mobileTurnDeps());
    const raw = h.readRaw();
    if (!result.applied || raw.version !== 2) {
        fail(`8. mobile-base v2 write failed: ${JSON.stringify(result)}`);
    } else if (receiptsFingerprint(raw) !== beforeReceipts) {
        fail('9. v2 mobile-base op must preserve receipts');
    } else {
        ok('8. successful mobile-base op on v2 writes v2');
        ok('9. v2 mobile-base op preserves every receipt and receipt order');
    }
    h.cleanup();
}

// 10–11 no-op
{
    const h = makeOwnerHarness(makeV1Doc());
    const writesBefore = h.writeCount;
    const result = tryApplyVehicleTurnOpsWithDeps({
        vehicleOps: [{ type: 'set_active_vehicle', vehicleId: 'rust_wagon' }],
    }, h.vehicleTurnDeps());
    if (result.applied || h.writeCount !== writesBefore) {
        fail('10. no-op vehicle mutation must not write');
    } else {
        ok('10. no-op vehicle mutation performs no write');
    }
    h.cleanup();
}

{
    const h = makeOwnerHarness(makeV1Doc([mobileBaseVehicle]));
    const writesBefore = h.writeCount;
    const result = tryApplyMobileBaseTurnOpsWithDeps({
        mobileBaseOps: [{ type: 'move_mobile_base', vehicleId: 'ashcrawler_hull', locationId: 'outer_gate' }],
    }, h.mobileTurnDeps());
    if (result.applied || h.writeCount !== writesBefore) {
        fail('11. no-op mobile-base mutation must not write');
    } else {
        ok('11. no-op mobile-base mutation performs no write');
    }
    h.cleanup();
}

// 12 invalid receipt metadata
{
    const bad = makeV2Doc();
    bad.gameplayCommitReceipts[0].status = 'failed';
    const h = makeOwnerHarness(bad);
    const before = h.readText();
    const result = tryApplyVehicleTurnOpsWithDeps({
        vehicleOps: [{ type: 'damage_vehicle', vehicleId: 'rust_wagon', amount: 1 }],
    }, h.vehicleTurnDeps());
    if (result.ok || result.applied || h.writeCount !== 0 || h.readText() !== before || h.cacheClears !== 0) {
        fail(`12. invalid receipts must fail closed: ${JSON.stringify(result)} writes=${h.writeCount}`);
    } else {
        ok('12. invalid receipt metadata performs no write');
    }
    h.cleanup();
}

// 13 unsupported version
{
    const bad = makeV1Doc();
    bad.version = 99;
    const h = makeOwnerHarness(bad);
    const before = h.readText();
    const result = tryApplyVehicleTurnOpsWithDeps({
        vehicleOps: [{ type: 'damage_vehicle', vehicleId: 'rust_wagon', amount: 1 }],
    }, h.vehicleTurnDeps());
    if (result.ok || result.applied || h.readText() !== before) {
        fail('13. unsupported version must not write');
    } else {
        ok('13. unsupported version performs no write');
    }
    h.cleanup();
}

// 14 invalid root
{
    const h = makeOwnerHarness(makeV1Doc());
    fs.writeFileSync(h.statePath, 'null', 'utf-8');
    const before = h.readText();
    const result = tryApplyVehicleTurnOpsWithDeps({
        vehicleOps: [{ type: 'damage_vehicle', vehicleId: 'rust_wagon', amount: 1 }],
    }, h.vehicleTurnDeps());
    if (result.ok || result.applied || h.readText() !== before) {
        fail('14. invalid root must not write');
    } else {
        ok('14. invalid root document performs no write');
    }
    h.cleanup();
}

// 15–16 write failure
{
    const h = makeOwnerHarness(makeV1Doc());
    const before = h.readText();
    h.setWriteFail(true);
    const result = runSerializedVehicleStateDocumentMutationWithDeps(
        h.deps,
        'vehicleOps',
        (current) => applyVehicleOps(current, [{ type: 'damage_vehicle', vehicleId: 'rust_wagon', amount: 2 }], { worldTurn: 3 })
    );
    if (result.ok || result.applied || h.readText() !== before || h.cacheClears !== 0) {
        fail(`15/16 write failure handling wrong: ${JSON.stringify(result)} clears=${h.cacheClears}`);
    } else {
        ok('15. write failure leaves canonical input untouched');
        ok('16. write failure does not clear cache');
    }
    h.cleanup();
}

// 17 successful write clears cache
{
    const h = makeOwnerHarness(makeV1Doc());
    const result = tryApplyVehicleTurnOpsWithDeps({
        vehicleOps: [{ type: 'damage_vehicle', vehicleId: 'rust_wagon', amount: 1 }],
    }, h.vehicleTurnDeps());
    if (!result.applied || h.cacheClears < 1) {
        fail(`17. successful write should clear cache: ${JSON.stringify(result)} clears=${h.cacheClears}`);
    } else {
        ok('17. successful write clears cache');
    }
    h.cleanup();
}

// 18 same owner/queue for vehicle + mobile-base
{
    const h = makeOwnerHarness(makeV1Doc([mobileBaseVehicle]));
    tryApplyVehicleTurnOpsWithDeps({
        vehicleOps: [{ type: 'damage_vehicle', vehicleId: 'rust_wagon', amount: 1 }],
    }, h.vehicleTurnDeps());
    tryApplyMobileBaseTurnOpsWithDeps({
        mobileBaseOps: [{ type: 'move_mobile_base', vehicleId: 'ashcrawler_hull', locationId: 'east_road' }],
    }, h.mobileTurnDeps());
    if (h.queueCalls[0] !== 'vehicleOps' || h.queueCalls[1] !== 'mobileBaseOps') {
        fail(`18. expected shared owner path names, got ${JSON.stringify(h.queueCalls)}`);
    } else {
        ok('18. vehicle and mobile-base normal writers use the same owner/queue');
    }
    h.cleanup();
}

// 21–22 prompt/view no receipts
{
    const doc = makeV2Doc();
    const parsed = parseVehicleStateDocument(doc);
    assert.strictEqual(parsed.kind, 'valid_v2');
    const mechanical = projectVehicleStateDocumentMechanical(parsed.document);
    const prompt = buildVehiclePromptBlock(mechanical, true, { currentLocationId: 'outer_gate' });
    const garage = buildVehicleGarageSnapshot(mechanical, { currentLocationId: 'outer_gate' });
    const blob = JSON.stringify({ prompt, garage, mechanical });
    if (/gameplayCommitReceipts|commit_1|beforeLedgerDigest|effectPlanDigest/.test(blob)) {
        fail('21/22 receipt metadata leaked into prompt/view/mechanical');
    } else {
        ok('21. receipt metadata remains absent from prompt output');
        ok('22. receipt metadata remains absent from garage/view output');
    }
}

// 25 PRE1 parser/digest regression (smoke)
{
    const v2 = makeV2Doc();
    const parsed = parseVehicleStateDocument(v2);
    assert.strictEqual(parsed.kind, 'valid_v2');
    const again = parseVehicleStateDocument(JSON.parse(canonicalizeVehicleStateDocument(parsed.document)));
    assert.strictEqual(again.kind, 'valid_v2');
    assert.strictEqual(
        canonicalizeVehicleStateDocument(parsed.document),
        canonicalizeVehicleStateDocument(again.document)
    );
    ok('25. PRE1 parser/digest regression passes');
}

// 26 Gameplay Spine vehicle-repair plan remains pure
{
    const planSrc = fs.readFileSync(
        path.join(root, 'src', 'gameplaySpineVehicleRepairPlanAdapterCore.ts'),
        'utf-8'
    );
    if (/vehicleStateDocumentOwner|writeJsonAtomic|runSerialized/.test(planSrc)) {
        fail('26. repair plan adapter must stay pure / unchanged by owner wiring');
    } else {
        // ensure module still loads
        assert.strictEqual(typeof planVehicleRepairPreview, 'function');
        ok('26. Gameplay Spine vehicle-repair plan remains pure and unchanged');
    }
}

// mechanical parity applyVehicleOps vs owner path
{
    const state = parseVehicleState(makeV1Doc());
    const pureNext = applyVehicleOps(state, [{ type: 'repair_vehicle', vehicleId: 'rust_wagon', amount: 5 }], { worldTurn: 9 });
    const h = makeOwnerHarness(makeV1Doc());
    tryApplyVehicleTurnOpsWithDeps({
        vehicleOps: [{ type: 'repair_vehicle', vehicleId: 'rust_wagon', amount: 5 }],
    }, {
        ...h.vehicleTurnDeps(),
        loadWorldTurn: () => 9,
    });
    const disk = parseVehicleState(h.readRaw());
    if (JSON.stringify(pureNext) !== JSON.stringify(disk)) {
        fail('23b. pure applyVehicleOps vs owner-written mechanical mismatch');
    } else {
        ok('23b. owner write matches pure applyVehicleOps mechanical result');
    }
    h.cleanup();
}

{
    const state = parseVehicleState(makeV1Doc([mobileBaseVehicle]));
    const pureNext = applyMobileBaseOps(
        state,
        [{ type: 'move_mobile_base', vehicleId: 'ashcrawler_hull', locationId: 'ridge' }],
        { worldTurn: 4 }
    );
    const h = makeOwnerHarness(makeV1Doc([mobileBaseVehicle]));
    tryApplyMobileBaseTurnOpsWithDeps({
        mobileBaseOps: [{ type: 'move_mobile_base', vehicleId: 'ashcrawler_hull', locationId: 'ridge' }],
    }, {
        ...h.mobileTurnDeps(),
        loadWorldTurn: () => 4,
    });
    const disk = parseVehicleState(h.readRaw());
    if (JSON.stringify(pureNext) !== JSON.stringify(disk)) {
        fail('24b. pure applyMobileBaseOps vs owner-written mechanical mismatch');
    } else {
        ok('24b. owner write matches pure applyMobileBaseOps mechanical result');
    }
    h.cleanup();
}

if (failed > 0) {
    console.error(`\n${failed} vehicle state document owner test(s) failed`);
    process.exit(1);
}
console.log('\nAll vehicle state document owner tests passed');
