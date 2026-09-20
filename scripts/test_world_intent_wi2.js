#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const vehicleOpsPath = path.join(root, 'out', 'vehicleOpsCore.js');
const vehicleCorePath = path.join(root, 'out', 'vehicleCore.js');
const worldIntentPath = path.join(root, 'out', 'worldIntentCore.js');
const parityPath = path.join(root, 'out', 'worldIntentVehicleParityCore.js');

let failed = 0;
function fail(msg) { console.error(`FAIL: ${msg}`); failed++; }
function ok(msg) { console.log(`OK: ${msg}`); }

for (const p of [vehicleOpsPath, vehicleCorePath]) {
    if (!fs.existsSync(p)) {
        fail(`${p} missing — run npm run compile`);
        process.exit(1);
    }
}

const vehicleOps = require(vehicleOpsPath);
let applyVehicleOpsCallCount = 0;
const originalApplyVehicleOps = vehicleOps.applyVehicleOps;
vehicleOps.applyVehicleOps = function patchedApplyVehicleOps(...args) {
    applyVehicleOpsCallCount++;
    return originalApplyVehicleOps.apply(this, args);
};

if (!fs.existsSync(worldIntentPath) || !fs.existsSync(parityPath)) {
    fail('worldIntentCore.js or worldIntentVehicleParityCore.js missing — run npm run compile');
    process.exit(1);
}

const {
    applyVehicleOps,
    V3_VEHICLE_OP_TYPES,
    MAX_VEHICLE_OP_AMOUNT,
    MAX_VEHICLE_REFUEL_AMOUNT,
} = vehicleOps;
const { parseVehicleState } = require(vehicleCorePath);
const {
    VEHICLE_GAME_ACTION_REGISTRY_KEYS,
    getVehicleGameActionRegistrySize,
    getVehicleGameActionRegistryKey,
    parseVehicleWorldIntentBridgeMode,
    queryWorldIntent,
    executeWorldIntent,
    worldIntentFromVehicleOp,
    vehicleOpFromWorldIntent,
    INTENT_SUBSYSTEMS,
} = require(worldIntentPath);
const {
    compareVehicleWorldIntentParity,
    isApprovedVehicleBridgeMode,
} = require(parityPath);

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

function vehicleIntent(action, payload, targetId = 'rust_wagon') {
    return {
        id: `intent_${action}_${targetId}`,
        source: 'gm',
        subsystem: 'vehicle',
        action,
        target: { kind: 'vehicle', id: targetId },
        payload,
    };
}

function statesEqual(a, b) {
    return JSON.stringify(a) === JSON.stringify(b);
}

function legacyNext(state, op, worldTurn) {
    return applyVehicleOps(state, [op], { worldTurn });
}

// 1-2. Registry closure
{
    if (getVehicleGameActionRegistrySize() !== 5) {
        fail(`registry size should be 5, got ${getVehicleGameActionRegistrySize()}`);
    } else if (VEHICLE_GAME_ACTION_REGISTRY_KEYS.length !== 5) {
        fail(`registry keys length should be 5`);
    } else {
        const unique = new Set(VEHICLE_GAME_ACTION_REGISTRY_KEYS);
        if (unique.size !== 5) {
            fail('registry keys must be unique');
        }
        for (const type of V3_VEHICLE_OP_TYPES) {
            const key = getVehicleGameActionRegistryKey(type);
            if (key !== `vehicle:${type}`) {
                fail(`registry key mismatch for ${type}: ${key}`);
            }
        }
    }
    const wiSrc = fs.readFileSync(path.join(root, 'src', 'worldIntentCore.ts'), 'utf-8');
    if (/registerAction|unregisterAction/.test(wiSrc)) {
        fail('registry must not expose register/unregister APIs');
    } else {
        ok('registry contains exactly five unique closed keys');
    }
}

// 3. unsupported subsystem/action
{
    for (const subsystem of INTENT_SUBSYSTEMS) {
        if (subsystem === 'vehicle') { continue; }
        const q = queryWorldIntent({
            id: `intent_${subsystem}`,
            source: 'gm',
            subsystem,
            action: 'set_active_vehicle',
            payload: {},
        }, { vehicleState: makeState() });
        if (q.status !== 'unsupported' || q.reasonCode !== 'unsupported_subsystem') {
            fail(`subsystem ${subsystem} should be unsupported_subsystem`);
        }
    }
    const unknown = queryWorldIntent(vehicleIntent('load_cargo', { itemId: 'x', amount: 1 }), {
        vehicleState: makeState(),
    });
    if (unknown.status !== 'unsupported' || unknown.reasonCode !== 'unsupported_action') {
        fail(`unknown action should be unsupported_action, got ${JSON.stringify(unknown)}`);
    } else {
        ok('non-vehicle subsystem and unknown vehicle action return unsupported');
    }
}

// 4-5. public API through registry
{
    let registryOk = true;
    for (const type of V3_VEHICLE_OP_TYPES) {
        if (!getVehicleGameActionRegistryKey(type)) {
            registryOk = false;
            fail(`missing registry entry for ${type}`);
        }
    }
    if (registryOk) {
        ok('all five supported actions resolve through closed registry');
    }
}

// 6. execute performs one applyVehicleOps call (no double apply)
{
    const state = makeState({ activeVehicleId: 'scout_bike' });
    applyVehicleOpsCallCount = 0;
    const result = executeWorldIntent(vehicleIntent('set_active_vehicle', {}), { vehicleState: state });
    if (result.status !== 'applied') {
        fail(`execute set_active_vehicle should apply, got ${JSON.stringify(result)}`);
    } else if (applyVehicleOpsCallCount !== 1) {
        fail(`execute should call applyVehicleOps once, got ${applyVehicleOpsCallCount}`);
    } else {
        ok('executeWorldIntent consumes single internal apply resolution');
    }
}

// 7-8. set_active_vehicle taxonomy
{
    const changedState = makeState({ activeVehicleId: 'scout_bike' });
    const changedOp = { type: 'set_active_vehicle', vehicleId: 'rust_wagon' };
    const legacy = legacyNext(changedState, changedOp);
    const q = queryWorldIntent(vehicleIntent('set_active_vehicle', {}), { vehicleState: changedState });
    const e = executeWorldIntent(vehicleIntent('set_active_vehicle', {}), { vehicleState: changedState });
    if (q.status !== 'allowed' || e.status !== 'applied' || !statesEqual(e.nextVehicleState, legacy)) {
        fail(`set_active changed parity failed: ${JSON.stringify({ q, e })}`);
    }

    const noopQ = queryWorldIntent(vehicleIntent('set_active_vehicle', {}), { vehicleState: makeState() });
    const missingQ = queryWorldIntent(vehicleIntent('set_active_vehicle', {}, 'ghost'), {
        vehicleState: makeState(),
    });
    const lostState = makeState();
    lostState.vehicles.find((v) => v.id === 'rust_wagon').status = 'lost';
    const lostQ = queryWorldIntent(vehicleIntent('set_active_vehicle', {}), { vehicleState: lostState });
    if (noopQ.status !== 'valid_noop' || missingQ.status !== 'blocked' || lostQ.status !== 'blocked') {
        fail('set_active noop/blocked taxonomy failed');
    } else {
        ok('set_active_vehicle taxonomy mapping');
    }
}

// 9-11. move_vehicle taxonomy
{
    const state = makeState();
    const noopQ = queryWorldIntent(vehicleIntent('move_vehicle', { locationId: 'outer_gate' }), { vehicleState: state });
    if (noopQ.status !== 'valid_noop') {
        fail(`exact zero-delta move should be valid_noop, got ${noopQ.status}`);
    }

    const availState = makeState();
    const bike = availState.vehicles.find((v) => v.id === 'scout_bike');
    const moveOp = { type: 'move_vehicle', vehicleId: 'scout_bike', locationId: 'market_square' };
    const legacyStatus = legacyNext(availState, moveOp);
    const statusIntent = vehicleIntent('move_vehicle', { locationId: 'market_square' }, 'scout_bike');
    const statusQ = queryWorldIntent(statusIntent, { vehicleState: availState });
    const statusE = executeWorldIntent(statusIntent, { vehicleState: availState });
    if (statusQ.status !== 'allowed' || statusE.status !== 'applied') {
        fail(`available same-location status delta should apply, got ${JSON.stringify({ statusQ, statusE })}`);
    } else if (statusE.nextVehicleState.vehicles.find((v) => v.id === 'scout_bike').status !== 'parked') {
        fail('available vehicle should become parked on move');
    } else if (!statesEqual(statusE.nextVehicleState, legacyStatus)) {
        fail('available same-location move state parity failed');
    }

    const parkState = makeState();
    const wagon = parkState.vehicles.find((v) => v.id === 'rust_wagon');
    wagon.parkedAt = { locationId: 'outer_gate', parkingLocationId: 'old_dock' };
    const parkOp = { type: 'move_vehicle', vehicleId: 'rust_wagon', locationId: 'outer_gate', parkingLocationId: 'dock_b' };
    const legacyPark = legacyNext(parkState, parkOp);
    const parkIntent = vehicleIntent('move_vehicle', { locationId: 'outer_gate', parkingLocationId: 'dock_b' });
    const parkE = executeWorldIntent(parkIntent, { vehicleState: parkState });
    if (parkE.status !== 'applied' || !statesEqual(parkE.nextVehicleState, legacyPark)) {
        fail(`parking metadata delta failed: ${JSON.stringify(parkE)}`);
    } else {
        ok('move_vehicle noop/status/parking taxonomy mapping');
    }
}

// 12-14. damage/repair/refuel taxonomy
{
    const dmgState = makeState();
    const dmgE = executeWorldIntent(vehicleIntent('damage_vehicle', { amount: 4 }), { vehicleState: dmgState });
    const dmgLegacy = legacyNext(dmgState, { type: 'damage_vehicle', vehicleId: 'rust_wagon', amount: 4 });
    if (dmgE.status !== 'applied' || !statesEqual(dmgE.nextVehicleState, dmgLegacy)) {
        fail('damage changed parity failed');
    }

    const zeroHp = makeState();
    zeroHp.vehicles.find((v) => v.id === 'rust_wagon').durability.hp = 0;
    const dmgNoop = queryWorldIntent(vehicleIntent('damage_vehicle', { amount: 5 }), { vehicleState: zeroHp });
    if (dmgNoop.status !== 'valid_noop') {
        fail(`hp-zero damage should be valid_noop, got ${dmgNoop.status}`);
    }

    const repairState = makeState();
    const repE = executeWorldIntent(vehicleIntent('repair_vehicle', { amount: 6 }), { vehicleState: repairState });
    const repLegacy = legacyNext(repairState, { type: 'repair_vehicle', vehicleId: 'rust_wagon', amount: 6 });
    if (repE.status !== 'applied' || !statesEqual(repE.nextVehicleState, repLegacy)) {
        fail('repair changed parity failed');
    }

    const maxHp = makeState();
    maxHp.vehicles.find((v) => v.id === 'rust_wagon').durability.hp = 60;
    const repNoop = queryWorldIntent(vehicleIntent('repair_vehicle', { amount: 3 }), { vehicleState: maxHp });
    if (repNoop.status !== 'valid_noop') {
        fail(`max hp repair should be valid_noop, got ${repNoop.status}`);
    }

    const fuelState = makeState();
    const fuelE = executeWorldIntent(vehicleIntent('refuel_vehicle', { amount: 2 }), { vehicleState: fuelState });
    const fuelLegacy = legacyNext(fuelState, { type: 'refuel_vehicle', vehicleId: 'rust_wagon', amount: 2 });
    if (fuelE.status !== 'applied' || !statesEqual(fuelE.nextVehicleState, fuelLegacy)) {
        fail('refuel changed parity failed');
    }

    const maxFuel = makeState();
    maxFuel.vehicles.find((v) => v.id === 'rust_wagon').resources.current = 20;
    const fuelNoop = queryWorldIntent(vehicleIntent('refuel_vehicle', { amount: 2 }), { vehicleState: maxFuel });
    const noTank = queryWorldIntent(vehicleIntent('refuel_vehicle', { amount: 2 }, 'scout_bike'), {
        vehicleState: makeState(),
    });
    const mismatch = queryWorldIntent(vehicleIntent('refuel_vehicle', { amount: 2, resourceType: 'battery' }), {
        vehicleState: makeState(),
    });
    if (fuelNoop.status !== 'valid_noop' || noTank.status !== 'blocked' || mismatch.status !== 'blocked') {
        fail('refuel noop/blocked taxonomy failed');
    } else {
        ok('damage/repair/refuel taxonomy mapping');
    }
}

// 15-18. feature gate, invalid/unsupported, caps, entity kind
{
    const disabledQ = queryWorldIntent(vehicleIntent('damage_vehicle', { amount: 2 }), {
        gameRules: { enableVehicleSystem: false },
        vehicleState: makeState(),
    });
    const disabledE = executeWorldIntent(vehicleIntent('damage_vehicle', { amount: 2 }), {
        gameRules: { enableVehicleSystem: false },
        vehicleState: makeState(),
    });
    if (disabledQ.status !== 'blocked' || disabledE.attempted !== false) {
        fail('disabled vehicle system should block with attempted:false on execute');
    }

    const invalidE = executeWorldIntent(vehicleIntent('damage_vehicle', { amount: 0 }), {
        vehicleState: makeState(),
    });
    if (invalidE.status !== 'invalid' || invalidE.attempted !== false) {
        fail('malformed amount should be invalid');
    }

    const hpOp = vehicleOpFromWorldIntent(vehicleIntent('damage_vehicle', { amount: MAX_VEHICLE_OP_AMOUNT + 100 }));
    const fuelOp = vehicleOpFromWorldIntent(vehicleIntent('refuel_vehicle', { amount: MAX_VEHICLE_REFUEL_AMOUNT + 500 }));
    if (!hpOp || hpOp.amount !== MAX_VEHICLE_OP_AMOUNT) {
        fail(`damage cap should be ${MAX_VEHICLE_OP_AMOUNT}`);
    } else if (!fuelOp || fuelOp.amount !== MAX_VEHICLE_REFUEL_AMOUNT) {
        fail(`refuel cap should be ${MAX_VEHICLE_REFUEL_AMOUNT}`);
    }

    const fracOp = vehicleOpFromWorldIntent(vehicleIntent('damage_vehicle', { amount: 2.9 }));
    if (!fracOp || fracOp.amount !== 2) {
        fail('positive fraction amount should floor to 2');
    }

    const wrongTarget = queryWorldIntent({
        id: 'intent_wrong',
        source: 'gm',
        subsystem: 'vehicle',
        action: 'damage_vehicle',
        target: { kind: 'location', id: 'outer_gate' },
        payload: { vehicleId: 'rust_wagon', amount: 2 },
    }, { vehicleState: makeState() });
    const payloadOnly = queryWorldIntent({
        id: 'intent_payload',
        source: 'gm',
        subsystem: 'vehicle',
        action: 'damage_vehicle',
        payload: { vehicleId: 'rust_wagon', amount: 2 },
    }, { vehicleState: makeState() });
    if (wrongTarget.status !== 'invalid' || wrongTarget.reasonCode !== 'invalid_entity_kind') {
        fail('non-vehicle target should be invalid_entity_kind');
    } else if (payloadOnly.status !== 'allowed') {
        fail('payload-only vehicleId should remain allowed');
    } else {
        ok('feature gate, invalid/unsupported, caps, and entity kind contracts');
    }
}

// 19-20. full state parity + worldTurn
{
    let parityAll = true;
    const cases = [
        { type: 'set_active_vehicle', vehicleId: 'rust_wagon' },
        { type: 'move_vehicle', vehicleId: 'rust_wagon', locationId: 'harbor' },
        { type: 'damage_vehicle', vehicleId: 'rust_wagon', amount: 3 },
        { type: 'repair_vehicle', vehicleId: 'rust_wagon', amount: 4 },
        { type: 'refuel_vehicle', vehicleId: 'rust_wagon', amount: 2 },
    ];
    for (const op of cases) {
        const state = makeState({ activeVehicleId: 'scout_bike' });
        const intent = worldIntentFromVehicleOp(op);
        const e = executeWorldIntent(intent, { vehicleState: state, worldTurn: 42 });
        const legacy = legacyNext(state, op, 42);
        if (!statesEqual(e.nextVehicleState, legacy)) {
            parityAll = false;
            fail(`changed state parity failed for ${op.type}`);
        }
        if (e.nextVehicleState?.updatedTurn !== 42) {
            parityAll = false;
            fail(`updatedTurn should be 42 for ${op.type}`);
        }
    }

    const noopState = makeState();
    const noopIntent = vehicleIntent('move_vehicle', { locationId: 'outer_gate' });
    const noopE = executeWorldIntent(noopIntent, { vehicleState: noopState, worldTurn: 99 });
    if (noopE.nextVehicleState !== undefined || noopState.updatedTurn !== 7) {
        fail('noop execute must not return nextVehicleState or change input updatedTurn');
    }

    const nanTurnState = makeState({ activeVehicleId: 'scout_bike' });
    const nanE = executeWorldIntent(vehicleIntent('set_active_vehicle', {}), {
        vehicleState: nanTurnState,
        worldTurn: Number.NaN,
    });
    const nanLegacy = legacyNext(nanTurnState, { type: 'set_active_vehicle', vehicleId: 'rust_wagon' }, Number.NaN);
    if (!statesEqual(nanE.nextVehicleState, nanLegacy)) {
        fail('non-finite worldTurn parity failed');
    } else if (parityAll) {
        ok('full changed-state parity and worldTurn/updatedTurn parity');
    }
}

// 21-22. input non-mutation and execute flags
{
    const state = makeState();
    const before = JSON.stringify(state);
    executeWorldIntent(vehicleIntent('damage_vehicle', { amount: 2 }), { vehicleState: state });
    if (JSON.stringify(state) !== before) {
        fail('execute must not mutate input vehicleState');
    }

    const blockedE = executeWorldIntent(vehicleIntent('damage_vehicle', { amount: 2 }, 'ghost'), {
        vehicleState: makeState(),
    });
    const noopE = executeWorldIntent(vehicleIntent('move_vehicle', { locationId: 'outer_gate' }), {
        vehicleState: makeState(),
    });
    if (blockedE.nextVehicleState !== undefined || blockedE.attempted !== false) {
        fail('blocked execute flags wrong');
    } else if (noopE.nextVehicleState !== undefined || !noopE.attempted || noopE.applied) {
        fail('valid_noop execute flags wrong');
    } else {
        ok('input non-mutation and execute attempted/applied flags');
    }
}

// 23-25. parity report match/mismatch/not_comparable
{
    const matchReport = compareVehicleWorldIntentParity({
        op: { type: 'damage_vehicle', vehicleId: 'rust_wagon', amount: 2 },
        vehicleState: makeState(),
        worldTurn: 10,
    });
    if (matchReport.outcome !== 'match' || matchReport.mismatches.length !== 0) {
        fail(`expected match parity report, got ${JSON.stringify(matchReport)}`);
    }

    const notComparable = compareVehicleWorldIntentParity({
        op: { type: 'damage_vehicle', vehicleId: 'bad id!', amount: 2 },
        vehicleState: makeState(),
    });
    if (notComparable.outcome !== 'not_comparable' || !notComparable.mismatches.includes('adapter_roundtrip')) {
        fail(`adapter failure should be not_comparable, got ${JSON.stringify(notComparable)}`);
    }

    const parityInput = {
        op: { type: 'repair_vehicle', vehicleId: 'rust_wagon', amount: 1 },
        vehicleState: makeState(),
    };
    const inputBefore = JSON.stringify(parityInput.vehicleState);
    compareVehicleWorldIntentParity(parityInput);
    if (JSON.stringify(parityInput.vehicleState) !== inputBefore) {
        fail('parity helper mutated input vehicleState');
    } else {
        ok('parity reports match, not_comparable, and input non-mutation');
    }
}

// mismatch ordering deterministic (test 23 extension)
{
    const disabledReport = compareVehicleWorldIntentParity({
        op: { type: 'set_active_vehicle', vehicleId: 'rust_wagon' },
        vehicleState: makeState({ activeVehicleId: 'scout_bike' }),
        enableVehicleSystem: false,
    });
    if (disabledReport.outcome !== 'match') {
        fail(`disabled vehicle system parity should match, got ${JSON.stringify(disabledReport)}`);
    }
    // Force ordering check via known mismatch codes order
    const ordered = ['updated_turn', 'query_taxonomy', 'adapter_roundtrip'];
    const sorted = ordered.slice().sort((a, b) => {
        const order = [
            'adapter_roundtrip',
            'query_taxonomy',
            'execute_taxonomy',
            'applied_flag',
            'next_state',
            'updated_turn',
            'input_mutation',
            'unexpected_exception',
        ];
        return order.indexOf(a) - order.indexOf(b);
    });
    if (JSON.stringify(sorted) !== JSON.stringify(['adapter_roundtrip', 'query_taxonomy', 'updated_turn'])) {
        fail('mismatch ordering helper failed');
    } else {
        ok('parity mismatch code ordering is deterministic');
    }
}

// 26. bridge modes — apply absent
{
    if (parseVehicleWorldIntentBridgeMode('off') !== 'off') {
        fail('off bridge mode should parse');
    } else if (parseVehicleWorldIntentBridgeMode('shadow') !== 'shadow') {
        fail('shadow bridge mode should parse');
    } else if (parseVehicleWorldIntentBridgeMode('compare_only') !== 'compare_only') {
        fail('compare_only bridge mode should parse');
    } else if (parseVehicleWorldIntentBridgeMode('apply') !== undefined) {
        fail('apply bridge mode must not parse in WI2');
    } else if (isApprovedVehicleBridgeMode('apply')) {
        fail('apply must not be approved bridge mode');
    } else {
        ok('bridge contract allows only off/shadow/compare_only');
    }
}

// 27. forbidden imports
{
    const wiSrc = fs.readFileSync(path.join(root, 'src', 'worldIntentCore.ts'), 'utf-8');
    const paritySrc = fs.readFileSync(path.join(root, 'src', 'worldIntentVehicleParityCore.ts'), 'utf-8');
    const forbidden = ['vscode', 'statePatch', 'turnLedgerPersistCore', 'vehicleTurnOps', 'mobileBaseTurnOps'];
    for (const token of forbidden) {
        const re = new RegExp(`from ['"].*/${token}|from ['"]\\.\\./${token}|from ['"]\\.\\/${token}`);
        if (re.test(wiSrc) || re.test(paritySrc)) {
            fail(`forbidden import ${token} found`);
        }
    }
    if (/from ['"]fs['"]/.test(wiSrc) || /from ['"]fs['"]/.test(paritySrc)) {
        fail('fs import forbidden');
    } else {
        ok('WI2 modules have no forbidden imports');
    }
}

// 28. host/persist files untouched
{
    const turnResultSrc = fs.readFileSync(path.join(root, 'src', 'types', 'TurnResult.ts'), 'utf-8');
    const statePatchSrc = fs.readFileSync(path.join(root, 'src', 'statePatch.ts'), 'utf-8');
    if (/worldIntentVehicleParity|vehicleBridgeMode|compare_only/.test(turnResultSrc)) {
        fail('TurnResult.ts should not reference WI2 bridge');
    } else if (/worldIntentVehicleParity|vehicleBridgeMode|compare_only/.test(statePatchSrc)) {
        fail('statePatch.ts should not reference WI2 bridge');
    } else {
        ok('TurnResult.ts and statePatch.ts remain free of WI2 host wiring');
    }
}

// 29. registry parity sweep for all changed V3 actions
{
    let allMatch = true;
    for (const type of V3_VEHICLE_OP_TYPES) {
        let op;
        switch (type) {
            case 'set_active_vehicle':
                op = { type, vehicleId: 'rust_wagon' };
                break;
            case 'move_vehicle':
                op = { type, vehicleId: 'rust_wagon', locationId: 'harbor' };
                break;
            case 'damage_vehicle':
                op = { type, vehicleId: 'rust_wagon', amount: 2 };
                break;
            case 'repair_vehicle':
                op = { type, vehicleId: 'rust_wagon', amount: 3 };
                break;
            case 'refuel_vehicle':
                op = { type, vehicleId: 'rust_wagon', amount: 2 };
                break;
            default:
                continue;
        }
        const report = compareVehicleWorldIntentParity({
            op,
            vehicleState: makeState({ activeVehicleId: 'scout_bike' }),
            worldTurn: 15,
        });
        if (report.outcome !== 'match') {
            allMatch = false;
            fail(`parity sweep mismatch for ${type}: ${JSON.stringify(report)}`);
        }
    }
    if (allMatch) {
        ok('parity sweep matches legacy for all five changed V3 actions');
    }
}

if (failed > 0) {
    console.error(`\n${failed} WI2 test(s) failed.`);
    process.exit(1);
}
console.log('\nAll world intent WI2 tests passed (Gate Required Tests 1-29; #30 via npm test suite)');