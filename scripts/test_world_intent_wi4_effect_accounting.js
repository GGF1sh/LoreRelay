#!/usr/bin/env node
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const root = path.join(__dirname, '..');
const accountingPath = path.join(root, 'out', 'worldIntentEffectAccountingCore.js');
const bridgeCorePath = path.join(root, 'out', 'vehicleWorldIntentBridgeCore.js');
const turnOpsCorePath = path.join(root, 'out', 'vehicleTurnOpsCore.js');
const vehicleCorePath = path.join(root, 'out', 'vehicleCore.js');
const vehicleOpsPath = path.join(root, 'out', 'vehicleOpsCore.js');

let failed = 0;
function fail(msg) { console.error(`FAIL: ${msg}`); failed++; }
function ok(msg) { console.log(`OK: ${msg}`); }

for (const p of [accountingPath, bridgeCorePath, turnOpsCorePath, vehicleCorePath, vehicleOpsPath]) {
    if (!fs.existsSync(p)) {
        fail(`${p} missing — run npm run compile`);
        process.exit(1);
    }
}

const {
    buildVehicleRefuelAccountingEntry,
    buildVehicleRefuelAccountingFromLegacyApply,
    buildVehicleRefuelAccountingEntriesForOps,
    EFFECT_ACCOUNTING_VERSION,
} = require(accountingPath);
const { runVehicleWorldIntentBridgeBatch } = require(bridgeCorePath);
const { tryApplyVehicleTurnOpsWithDeps } = require(turnOpsCorePath);
const { parseVehicleState } = require(vehicleCorePath);
const { applyVehicleOps } = require(vehicleOpsPath);

const VEHICLE_STATE = 'vehicle_state.json';

const baseVehicle = {
    id: 'rust_wagon',
    name: 'Rust Wagon',
    kind: 'truck',
    owner: { type: 'party' },
    status: 'parked',
    locationId: 'outer_gate',
    capacity: { crewRequired: 1, crewCapacity: 2, passengerCapacity: 4, cargoCapacity: 30 },
    access: { sizeClass: 'large', accessTags: ['road'] },
    mobility: { speedBand: 'normal', rangeBand: 'regional', terrainTags: ['road'] },
    durability: { hp: 42, maxHp: 60, armorBand: 'medium', condition: 'worn' },
    resources: { powerType: 'fuel', current: 3, max: 20 },
};

function makeState(extra = {}) {
    return parseVehicleState({
        version: 1,
        activeVehicleId: 'rust_wagon',
        updatedTurn: 7,
        vehicles: [baseVehicle, {
            ...baseVehicle,
            id: 'scout_bike',
            name: 'Scout Bike',
            kind: 'bike',
            status: 'available',
            locationId: 'market_square',
            resources: { powerType: 'none' },
        }],
        ...extra,
    });
}

function refuelOp(amount, vehicleId = 'rust_wagon', resourceType) {
    const op = { type: 'refuel_vehicle', vehicleId, amount };
    if (resourceType) { op.resourceType = resourceType; }
    return op;
}

function applyRefuel(state, amount, vehicleId = 'rust_wagon') {
    const pre = parseVehicleState(JSON.parse(JSON.stringify(state)));
    const post = applyVehicleOps(pre, [refuelOp(amount, vehicleId)], { worldTurn: 12 });
    return { pre, post };
}

// 1. partial refuel 2/10 + amount 3
{
    const state = makeState();
    state.vehicles.find((v) => v.id === 'rust_wagon').resources = { powerType: 'fuel', current: 2, max: 10 };
    const { pre, post } = applyRefuel(state, 3);
    const entry = buildVehicleRefuelAccountingEntry({
        op: refuelOp(3),
        preState: pre,
        postState: post,
    });
    if (!entry || entry.before !== 2 || entry.delta !== 3 || entry.after !== 5) {
        fail(`partial refuel accounting wrong: ${JSON.stringify(entry)}`);
    } else {
        ok('partial refuel produces before/delta/after entry');
    }
}

// 2. capped refuel 8/10 + amount 5 -> delta 2
{
    const state = makeState();
    state.vehicles.find((v) => v.id === 'rust_wagon').resources = { powerType: 'fuel', current: 8, max: 10 };
    const entry = buildVehicleRefuelAccountingFromLegacyApply(refuelOp(5), state);
    if (!entry || entry.delta !== 2 || entry.after !== 10) {
        fail(`capped refuel accounting wrong: ${JSON.stringify(entry)}`);
    } else {
        ok('capped refuel uses effective delta not requested amount');
    }
}

// 3-8. no entry cases
{
    const maxState = makeState();
    maxState.vehicles.find((v) => v.id === 'rust_wagon').resources.current = 20;
    if (buildVehicleRefuelAccountingFromLegacyApply(refuelOp(3), maxState) !== undefined) {
        fail('max fuel should produce no entry');
    }

    const noRes = makeState();
    delete noRes.vehicles.find((v) => v.id === 'rust_wagon').resources;
    if (buildVehicleRefuelAccountingFromLegacyApply(refuelOp(2), noRes) !== undefined) {
        fail('missing resources should produce no entry');
    }

    const noTank = makeState();
    if (buildVehicleRefuelAccountingFromLegacyApply(refuelOp(2, 'scout_bike'), noTank) !== undefined) {
        fail('powerType none should produce no entry');
    }

    if (buildVehicleRefuelAccountingFromLegacyApply(refuelOp(2, 'rust_wagon', 'battery'), makeState()) !== undefined) {
        fail('resource mismatch should produce no entry');
    }

    if (buildVehicleRefuelAccountingFromLegacyApply(refuelOp(2, 'ghost'), makeState()) !== undefined) {
        fail('missing vehicle should produce no entry');
    }

    const lostState = makeState();
    lostState.vehicles.find((v) => v.id === 'rust_wagon').status = 'lost';
    if (buildVehicleRefuelAccountingFromLegacyApply(refuelOp(2), lostState) !== undefined) {
        fail('lost vehicle with no canonical change should produce no entry');
    } else {
        ok('blocked/no-op refuel cases produce no accounting entry');
    }
}

// 9-10. non-refuel / malformed
{
    const state = makeState();
    const damage = applyVehicleOps(state, [{ type: 'damage_vehicle', vehicleId: 'rust_wagon', amount: 2 }]);
    const entries = buildVehicleRefuelAccountingEntriesForOps(
        [{ type: 'damage_vehicle', vehicleId: 'rust_wagon', amount: 2 }],
        state
    );
    if (entries.length !== 0) {
        fail('non-refuel ops must not produce accounting');
    }
    if (buildVehicleRefuelAccountingFromLegacyApply({ type: 'refuel_vehicle', vehicleId: '', amount: 2 }, state) !== undefined) {
        fail('malformed op should not produce accounting');
    } else {
        ok('non-refuel and malformed ops produce no accounting');
    }
}

// 11. input non-mutation
{
    const state = makeState();
    state.vehicles.find((v) => v.id === 'rust_wagon').resources.current = 4;
    const before = JSON.stringify(state);
    buildVehicleRefuelAccountingFromLegacyApply(refuelOp(2), state, { worldTurn: 9 });
    if (JSON.stringify(state) !== before) {
        fail('accounting helper mutated input state');
    } else {
        ok('accounting helpers do not mutate input vehicle state');
    }
}

// 12. closed unions
{
    const entry = buildVehicleRefuelAccountingFromLegacyApply(refuelOp(2), makeState());
    if (!entry ||
        entry.version !== EFFECT_ACCOUNTING_VERSION ||
        entry.ledger !== 'vehicle_state' ||
        entry.subsystem !== 'vehicle' ||
        entry.field !== 'resources.current' ||
        entry.opType !== 'refuel_vehicle') {
        fail(`closed union fields wrong: ${JSON.stringify(entry)}`);
    } else {
        ok('accounting entry uses closed ledger/subsystem/field/opType');
    }
}

// 13-14. intentId / worldTurn / label clamp
{
    const entry = buildVehicleRefuelAccountingFromLegacyApply(refuelOp(2), makeState(), {
        intentId: 'intent_refuel_rust',
        worldTurn: 42,
        cause: { type: 'gm_intent', label: 'x'.repeat(120) },
    });
    if (!entry || entry.intentId !== 'intent_refuel_rust' || entry.worldTurn !== 42) {
        fail('intentId/worldTurn not carried');
    } else if (!entry.cause.label || entry.cause.label.length > 64) {
        fail('cause label should be clamped to 64 chars');
    } else {
        ok('intentId, worldTurn, and label clamp are applied');
    }
}

// 15. WI3b batch integration does not alter ledger result
{
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lr-wi4-bridge-'));
    const statePath = path.join(dir, VEHICLE_STATE);
    const state = makeState();
    state.vehicles.find((v) => v.id === 'rust_wagon').resources.current = 5;
    fs.writeFileSync(statePath, JSON.stringify(state, null, 2), 'utf-8');

    const batch = runVehicleWorldIntentBridgeBatch({
        bridgeMode: 'compare_only',
        vehicleOps: [{ type: 'refuel_vehicle', vehicleId: 'rust_wagon', amount: 3 }],
        preWriteVehicleState: state,
        enableVehicleSystem: true,
        worldTurn: 15,
    });
    if (batch.accountingEntryCount !== 1 || batch.accountingEntries[0].before !== 5) {
        fail(`bridge batch should include accounting: ${JSON.stringify(batch)}`);
    }

    let writeCount = 0;
    const deps = {
        isVehicleSystemEnabled: () => true,
        getVehicleStatePath: () => statePath,
        readVehicleStateFromDisk: () => parseVehicleState(JSON.parse(JSON.stringify(state))),
        loadWorldTurn: () => 15,
        writeVehicleStateAtomic: () => { writeCount++; },
        clearVehicleStateCache: () => {},
        runSerializedMutation: (fn) => fn(),
        getVehicleBridgeMode: () => 'compare_only',
        emitVehicleBridgeDiagnostics: () => {},
    };
    const result = tryApplyVehicleTurnOpsWithDeps({
        vehicleOps: [{ type: 'refuel_vehicle', vehicleId: 'rust_wagon', amount: 3 }],
    }, deps);
    if (!result.ok || !result.applied || writeCount !== 1) {
        fail('accounting integration must not change ledger apply result');
    } else {
        ok('WI3b batch carries accounting without changing ledger result');
    }
    fs.rmSync(dir, { recursive: true, force: true });
}

// off mode has no accounting
{
    const batch = runVehicleWorldIntentBridgeBatch({
        bridgeMode: 'off',
        vehicleOps: [{ type: 'refuel_vehicle', vehicleId: 'rust_wagon', amount: 2 }],
        preWriteVehicleState: makeState(),
        enableVehicleSystem: true,
    });
    if (batch.accountingEntryCount !== 0) {
        fail('off mode should not populate accounting entries');
    } else {
        ok('off bridge mode skips accounting batch fields');
    }
}

// disabled vehicle system skips batch accounting
{
    const disabled = runVehicleWorldIntentBridgeBatch({
        bridgeMode: 'compare_only',
        vehicleOps: [{ type: 'refuel_vehicle', vehicleId: 'rust_wagon', amount: 2 }],
        preWriteVehicleState: makeState(),
        enableVehicleSystem: false,
    });
    if (disabled.accountingEntryCount !== 0) {
        fail('disabled vehicle system should not produce batch accounting');
    } else {
        ok('enableVehicleSystem:false skips bridge accounting');
    }
}

// sequential refuel batch uses running legacy simulation
{
    const state = makeState();
    state.vehicles.find((v) => v.id === 'rust_wagon').resources = { powerType: 'fuel', current: 2, max: 10 };
    const entries = buildVehicleRefuelAccountingEntriesForOps([
        refuelOp(3),
        refuelOp(4),
    ], state);
    if (entries.length !== 2 || entries[0].before !== 2 || entries[0].after !== 5 ||
        entries[1].before !== 5 || entries[1].after !== 9) {
        fail(`sequential refuel batch wrong: ${JSON.stringify(entries)}`);
    } else {
        ok('batch accounting chains refuel ops on simulated legacy state');
    }
}

// inconsistent post state (after > max) produces no entry
{
    const state = makeState();
    const pre = parseVehicleState(JSON.parse(JSON.stringify(state)));
    const post = parseVehicleState(JSON.parse(JSON.stringify(state)));
    post.vehicles.find((v) => v.id === 'rust_wagon').resources = { powerType: 'fuel', current: 25, max: 20 };
    if (buildVehicleRefuelAccountingEntry({ op: refuelOp(2), preState: pre, postState: post }) !== undefined) {
        fail('after > max must not produce accounting entry');
    } else {
        ok('accounting rejects post state above resource max');
    }
}

// invalid cause type sanitizes to vehicle_op
{
    const entry = buildVehicleRefuelAccountingFromLegacyApply(refuelOp(1), makeState(), {
        cause: { type: 'bogus', label: 'test' },
    });
    if (!entry || entry.cause.type !== 'vehicle_op') {
        fail('invalid cause type should sanitize to vehicle_op');
    } else {
        ok('invalid cause type sanitizes safely');
    }
}

// forbidden imports static check
{
    const src = fs.readFileSync(path.join(root, 'src', 'worldIntentEffectAccountingCore.ts'), 'utf-8');
    if (/from ['"]vscode['"]|from ['"]fs['"]|statePatch|turnLedgerPersistCore/.test(src)) {
        fail('accounting core must remain pure');
    } else {
        ok('accounting core has no forbidden imports');
    }
}

if (failed > 0) {
    console.error(`\n${failed} WI4 accounting test(s) failed.`);
    process.exit(1);
}
console.log('\nAll world intent WI4 effect accounting tests passed (design §10)');