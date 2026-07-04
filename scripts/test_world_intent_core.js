#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const corePath = path.join(root, 'out', 'worldIntentCore.js');
const opsCorePath = path.join(root, 'out', 'vehicleOpsCore.js');
const vehicleCorePath = path.join(root, 'out', 'vehicleCore.js');
const srcPath = path.join(root, 'src', 'worldIntentCore.ts');

let failed = 0;
function fail(msg) { console.error(`FAIL: ${msg}`); failed++; }
function ok(msg) { console.log(`OK: ${msg}`); }

for (const p of [corePath, opsCorePath, vehicleCorePath]) {
    if (!fs.existsSync(p)) {
        fail(`${p} missing — run npm run compile`);
        process.exit(1);
    }
}

const {
    parseWorldIntent,
    parseWorldIntentBatch,
    sanitizeIntentPayload,
    worldIntentFromVehicleOp,
    vehicleOpFromWorldIntent,
    queryWorldIntent,
    executeWorldIntent,
    INTENT_SUBSYSTEMS,
} = require(corePath);
const { V3_VEHICLE_OP_TYPES: V3_OPS } = require(opsCorePath);
const { parseVehicleState } = require(vehicleCorePath);

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

// 1. parse rejects bad shapes
{
    if (parseWorldIntent(null) !== undefined) {
        fail('null intent rejected');
    } else if (parseWorldIntent([]) !== undefined) {
        fail('array intent rejected');
    } else if (parseWorldIntent({
        id: 'bad id!',
        source: 'gm',
        subsystem: 'vehicle',
        action: 'move_vehicle',
        target: { kind: 'vehicle', id: 'rust_wagon' },
        payload: { locationId: 'dock' },
    }) !== undefined) {
        fail('bad intent id rejected');
    } else if (parseWorldIntent({
        id: 'intent_1',
        source: 'gm',
        subsystem: 'vehicle',
        action: 'move_vehicle',
        target: { kind: 'npc', id: 'n1' },
        payload: { locationId: 'dock' },
    }) === undefined) {
        fail('intent with npc target should still parse');
    } else {
        ok('parseWorldIntent rejects non-objects and malformed ids');
    }
}

// 2. payload sanitizer caps size and blocks prototype pollution
{
    const polluted = JSON.parse('{"amount":1,"__proto__":{"polluted":true}}');
    const clean = sanitizeIntentPayload(polluted);
    if (clean && Object.prototype.hasOwnProperty.call(clean, '__proto__')) {
        fail('payload sanitizer must not preserve __proto__ keys');
    }
    const huge = { data: 'x'.repeat(5000) };
    if (sanitizeIntentPayload(huge) !== undefined) {
        fail('oversized payload should be rejected');
    } else {
        ok('payload sanitizer caps size and strips prototype pollution');
    }
}

// 3. batch caps count
{
    const many = Array.from({ length: 20 }, (_, i) => ({
        id: `intent_batch_${i}`,
        source: 'gm',
        subsystem: 'vehicle',
        action: 'damage_vehicle',
        target: { kind: 'vehicle', id: 'rust_wagon' },
        payload: { amount: 1 },
    }));
    const batch = parseWorldIntentBatch(many, 3);
    if (batch.length !== 3) {
        fail(`parseWorldIntentBatch should cap at 3, got ${batch.length}`);
    } else if (parseWorldIntentBatch([null, { id: 'bad!', subsystem: 'x' }]).length !== 0) {
        fail('batch should drop invalid items');
    } else {
        ok('parseWorldIntentBatch caps and filters');
    }
}

// 4. non-vehicle subsystems unsupported
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
        if (q.status !== 'unsupported') {
            fail(`subsystem ${subsystem} should be unsupported, got ${q.status}`);
        }
    }
    ok('non-vehicle subsystems return unsupported');
}

// 5. unsupported vehicle actions
{
    const q = queryWorldIntent(vehicleIntent('load_cargo', { itemId: 'scrap', amount: 1 }), {
        vehicleState: makeState(),
    });
    if (q.status !== 'unsupported') {
        fail(`load_cargo should be unsupported, got ${q.status}`);
    } else {
        ok('unsupported vehicle actions return unsupported');
    }
}

// 6. enableVehicleSystem false -> blocked
{
    const q = queryWorldIntent(vehicleIntent('damage_vehicle', { amount: 5 }), {
        gameRules: { enableVehicleSystem: false },
        vehicleState: makeState(),
    });
    if (q.status !== 'blocked' || q.reasonCode !== 'vehicle_system_disabled') {
        fail(`disabled vehicle system should block, got ${JSON.stringify(q)}`);
    } else {
        ok('enableVehicleSystem:false returns blocked');
    }
}

// 7. vehicle adapter round-trip
{
    for (const type of V3_OPS) {
        let op;
        switch (type) {
            case 'set_active_vehicle':
                op = { type, vehicleId: 'scout_bike' };
                break;
            case 'move_vehicle':
                op = { type, vehicleId: 'rust_wagon', locationId: 'harbor', parkingLocationId: 'dock_b' };
                break;
            case 'damage_vehicle':
                op = { type, vehicleId: 'rust_wagon', amount: 4 };
                break;
            case 'repair_vehicle':
                op = { type, vehicleId: 'rust_wagon', amount: 6 };
                break;
            case 'refuel_vehicle':
                op = { type, vehicleId: 'rust_wagon', amount: 2, resourceType: 'fuel' };
                break;
            default:
                continue;
        }
        const intent = worldIntentFromVehicleOp(op);
        const back = vehicleOpFromWorldIntent(intent);
        if (!back || JSON.stringify(back) !== JSON.stringify(op)) {
            fail(`round-trip failed for ${type}: ${JSON.stringify({ intent, back })}`);
        }
    }
    ok('vehicle adapter round-trips all V3 vehicle ops');
}

// 8. query distinguishes allowed vs valid_noop
{
    const state = makeState();
    const activeNoop = queryWorldIntent(vehicleIntent('set_active_vehicle', {}), { vehicleState: state });
    if (activeNoop.status !== 'valid_noop') {
        fail(`already active should be valid_noop, got ${activeNoop.status}`);
    }

    const moveNoop = queryWorldIntent(vehicleIntent('move_vehicle', { locationId: 'outer_gate' }), {
        vehicleState: state,
    });
    if (moveNoop.status !== 'valid_noop') {
        fail(`same location move should be valid_noop, got ${moveNoop.status}`);
    }

    const fullRepairState = makeState();
    const wagon = fullRepairState.vehicles.find((v) => v.id === 'rust_wagon');
    wagon.durability.hp = 60;
    const repairNoop = queryWorldIntent(vehicleIntent('repair_vehicle', { amount: 5 }), {
        vehicleState: fullRepairState,
    });
    if (repairNoop.status !== 'valid_noop') {
        fail(`full repair should be valid_noop, got ${repairNoop.status}`);
    }

    const maxFuelState = makeState();
    const fuelWagon = maxFuelState.vehicles.find((v) => v.id === 'rust_wagon');
    fuelWagon.resources.current = 20;
    const refuelNoop = queryWorldIntent(vehicleIntent('refuel_vehicle', { amount: 3 }), {
        vehicleState: maxFuelState,
    });
    if (refuelNoop.status !== 'valid_noop') {
        fail(`max refuel should be valid_noop, got ${refuelNoop.status}`);
    }

    const zeroHpState = makeState();
    zeroHpState.vehicles.find((v) => v.id === 'rust_wagon').durability.hp = 0;
    const damageNoop = queryWorldIntent(vehicleIntent('damage_vehicle', { amount: 5 }), {
        vehicleState: zeroHpState,
    });
    if (damageNoop.status !== 'valid_noop') {
        fail(`hp-zero damage should be valid_noop, got ${damageNoop.status}`);
    }

    const allowed = queryWorldIntent(vehicleIntent('set_active_vehicle', {}), {
        vehicleState: makeState({ activeVehicleId: 'scout_bike' }),
    });
    if (allowed.status !== 'allowed') {
        fail(`switch active vehicle should be allowed, got ${allowed.status}`);
    } else {
        ok('queryWorldIntent distinguishes allowed vs valid_noop');
    }
}

// 9. query blocked cases
{
    const missing = queryWorldIntent(vehicleIntent('damage_vehicle', { amount: 2 }, 'missing_ship'), {
        vehicleState: makeState(),
    });
    if (missing.status !== 'blocked') {
        fail(`missing vehicle should be blocked, got ${missing.status}`);
    }

    const lostState = makeState();
    lostState.vehicles.find((v) => v.id === 'rust_wagon').status = 'lost';
    const lost = queryWorldIntent(vehicleIntent('damage_vehicle', { amount: 2 }), { vehicleState: lostState });
    if (lost.status !== 'blocked') {
        fail(`lost vehicle should be blocked, got ${lost.status}`);
    }

    const noTank = queryWorldIntent(vehicleIntent('refuel_vehicle', { amount: 2 }, 'scout_bike'), {
        vehicleState: makeState({ activeVehicleId: 'scout_bike' }),
    });
    if (noTank.status !== 'blocked' || noTank.reasonCode !== 'no_fuel_tank') {
        fail(`no fuel tank should be blocked, got ${JSON.stringify(noTank)}`);
    }

    const mismatch = queryWorldIntent(vehicleIntent('refuel_vehicle', { amount: 2, resourceType: 'battery' }), {
        vehicleState: makeState(),
    });
    if (mismatch.status !== 'blocked' || mismatch.reasonCode !== 'fuel_type_mismatch') {
        fail(`fuel type mismatch should be blocked, got ${JSON.stringify(mismatch)}`);
    } else {
        ok('queryWorldIntent returns blocked for missing/lost/no tank/mismatch');
    }
}

// 10. execute does not mutate input vehicleState
{
    const state = makeState();
    const before = JSON.stringify(state);
    executeWorldIntent(vehicleIntent('damage_vehicle', { amount: 3 }), { vehicleState: state });
    if (JSON.stringify(state) !== before) {
        fail('executeWorldIntent mutated input vehicleState');
    } else {
        ok('executeWorldIntent does not mutate input vehicleState');
    }
}

// 11. execute returns in-memory next state for allowed actions
{
    const state = makeState({ activeVehicleId: 'scout_bike' });
    const result = executeWorldIntent(vehicleIntent('set_active_vehicle', {}), { vehicleState: state });
    if (result.status !== 'applied' || !result.nextVehicleState) {
        fail(`allowed execute should apply, got ${JSON.stringify(result)}`);
    } else if (result.nextVehicleState.activeVehicleId !== 'rust_wagon') {
        fail('nextVehicleState should reflect active vehicle change');
    } else {
        ok('executeWorldIntent returns in-memory next state when allowed');
    }
}

// 12. execute attempted:false for blocked/invalid/unsupported
{
    const blocked = executeWorldIntent(vehicleIntent('damage_vehicle', { amount: 2 }, 'ghost'), {
        vehicleState: makeState(),
    });
    if (blocked.attempted !== false || blocked.status !== 'blocked') {
        fail(`blocked execute attempted flag wrong: ${JSON.stringify(blocked)}`);
    }

    const invalid = executeWorldIntent(vehicleIntent('damage_vehicle', { amount: 0 }), {
        vehicleState: makeState(),
    });
    if (invalid.attempted !== false || invalid.status !== 'invalid') {
        fail(`invalid execute attempted flag wrong: ${JSON.stringify(invalid)}`);
    }

    const unsupported = executeWorldIntent({
        id: 'intent_settlement',
        source: 'gm',
        subsystem: 'settlement',
        action: 'expand_layer',
        payload: {},
    }, { vehicleState: makeState() });
    if (unsupported.attempted !== false || unsupported.status !== 'unsupported') {
        fail(`unsupported execute attempted flag wrong: ${JSON.stringify(unsupported)}`);
    } else {
        ok('executeWorldIntent returns attempted:false for blocked/invalid/unsupported');
    }
}

// 13. static assertion: forbidden imports in worldIntentCore.ts
{
    const src = fs.readFileSync(srcPath, 'utf-8');
    const forbidden = ['vscode', 'statePatch', 'turnLedgerPersistCore', 'vehicleTurnOps', 'mobileBaseTurnOps'];
    for (const token of forbidden) {
        if (new RegExp(`from ['"].*/${token}|from ['"]\\.\\/${token}`).test(src)) {
            fail(`worldIntentCore.ts must not import ${token}`);
        }
    }
    if (/require\(['"]fs['"]\)/.test(src) || /from ['"]fs['"]/.test(src)) {
        fail('worldIntentCore.ts must not import fs');
    } else {
        ok('worldIntentCore.ts has no forbidden imports');
    }
}

// 14. WI1 does not require TurnResult/statePatch changes (no worldIntent wiring there yet)
{
    const turnResultSrc = fs.readFileSync(path.join(root, 'src', 'types', 'TurnResult.ts'), 'utf-8');
    const statePatchSrc = fs.readFileSync(path.join(root, 'src', 'statePatch.ts'), 'utf-8');
    if (/worldIntent/i.test(turnResultSrc)) {
        fail('TurnResult.ts should not reference worldIntent in WI1');
    } else if (/worldIntent/i.test(statePatchSrc)) {
        fail('statePatch.ts should not reference worldIntent in WI1');
    } else {
        ok('TurnResult.ts and statePatch.ts remain free of worldIntent wiring');
    }
}

if (failed > 0) {
    console.error(`\n${failed} test(s) failed.`);
    process.exit(1);
}
console.log('\nAll world intent core tests passed');