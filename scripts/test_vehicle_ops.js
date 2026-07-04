#!/usr/bin/env node
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const root = path.join(__dirname, '..');
const opsCorePath = path.join(root, 'out', 'vehicleOpsCore.js');
const turnOpsCorePath = path.join(root, 'out', 'vehicleTurnOpsCore.js');
const vehicleCorePath = path.join(root, 'out', 'vehicleCore.js');

let failed = 0;
function fail(msg) { console.error(`FAIL: ${msg}`); failed++; }
function ok(msg) { console.log(`OK: ${msg}`); }

for (const p of [opsCorePath, turnOpsCorePath, vehicleCorePath]) {
    if (!fs.existsSync(p)) {
        fail(`${p} missing — run npm run compile`);
        process.exit(1);
    }
}

const {
    parseVehicleOps,
    applyVehicleOps,
    hasVehicleOps,
    shouldAttemptVehiclePersistCore,
    MAX_VEHICLE_OPS,
} = require(opsCorePath);
const {
    tryApplyVehicleTurnOpsWithDeps,
} = require(turnOpsCorePath);
const {
    parseVehicleState,
    VEHICLE_OPS_PERSIST_LINE,
} = require(vehicleCorePath);

const VEHICLE_STATE = 'vehicle_state.json';

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
            access: { sizeClass: 'small', accessTags: ['road', 'narrow_path'] },
            resources: { powerType: 'none' },
        }],
        ...extra,
    });
}

function clone(obj) {
    return JSON.parse(JSON.stringify(obj));
}

{
    const ops = parseVehicleOps([
        { type: 'set_active_vehicle', vehicleId: 'scout_bike' },
        { type: 'move_vehicle', vehicleId: 'rust_wagon', locationId: 'harbor_dock', parkingLocationId: 'dock_b' },
        { type: 'damage_vehicle', vehicleId: 'rust_wagon', amount: 10 },
        { type: 'repair_vehicle', vehicleId: 'rust_wagon', amount: 5 },
        { type: 'refuel_vehicle', vehicleId: 'rust_wagon', amount: 4 },
        { type: 'load_cargo', vehicleId: 'rust_wagon', itemId: 'scrap', amount: 1 },
        { type: 'install_module', vehicleId: 'rust_wagon', module: { id: 'x', slot: 'utility', name: 'X' } },
        { type: 'set_active_vehicle', vehicleId: 'bad id!' },
        { type: 'set_active_vehicle', vehicleId: 'also bad!' },
    ]);
    if (ops.length !== 5) {
        fail(`parseVehicleOps should keep 5 V3 ops, got ${ops.length}`);
    } else if (ops[0].type !== 'set_active_vehicle' || ops[1].type !== 'move_vehicle') {
        fail('parseVehicleOps order/types wrong');
    } else {
        ok('parseVehicleOps filters unsupported ops and caps at 8');
    }
}

{
    const many = Array.from({ length: 12 }, (_, i) => ({
        type: 'damage_vehicle',
        vehicleId: 'rust_wagon',
        amount: 1,
    }));
    if (parseVehicleOps(many).length !== MAX_VEHICLE_OPS) {
        fail(`parseVehicleOps should cap at ${MAX_VEHICLE_OPS}`);
    } else {
        ok(`parseVehicleOps caps at ${MAX_VEHICLE_OPS}`);
    }
}

{
    if (!shouldAttemptVehiclePersistCore(true, [{ type: 'move_vehicle', vehicleId: 'rust_wagon', locationId: 'dock' }])) {
        fail('shouldAttemptVehiclePersistCore true when flag on and ops present');
    } else if (shouldAttemptVehiclePersistCore(false, [{ type: 'move_vehicle', vehicleId: 'rust_wagon', locationId: 'dock' }])) {
        fail('shouldAttemptVehiclePersistCore false when flag off');
    } else if (hasVehicleOps([{ type: 'install_module', vehicleId: 'rust_wagon' }])) {
        fail('unsupported op types should not count as vehicle ops');
    } else {
        ok('shouldAttemptVehiclePersistCore gated by enableVehicleSystem');
    }
}

{
    const current = makeState();
    const before = clone(current);
    const next = applyVehicleOps(current, [
        { type: 'set_active_vehicle', vehicleId: 'scout_bike' },
        { type: 'move_vehicle', vehicleId: 'rust_wagon', locationId: 'harbor_dock', parkingLocationId: 'dock_b' },
        { type: 'damage_vehicle', vehicleId: 'rust_wagon', amount: 10 },
        { type: 'refuel_vehicle', vehicleId: 'rust_wagon', amount: 4 },
    ], { worldTurn: 9 });
    if (JSON.stringify(before) !== JSON.stringify(current)) {
        fail('applyVehicleOps should not mutate input state');
    } else if (!next || next.activeVehicleId !== 'scout_bike') {
        fail('set_active_vehicle should update activeVehicleId');
    } else {
        const wagon = next.vehicles.find((v) => v.id === 'rust_wagon');
        if (!wagon || wagon.locationId !== 'harbor_dock' || wagon.parkedAt?.parkingLocationId !== 'dock_b') {
            fail('move_vehicle should update location and parking');
        } else if (wagon.durability.hp !== 32) {
            fail(`damage_vehicle should reduce hp, got ${wagon.durability.hp}`);
        } else if (wagon.resources.current !== 7) {
            fail(`refuel_vehicle should increase fuel, got ${wagon.resources.current}`);
        } else if (next.updatedTurn !== 9) {
            fail('applyVehicleOps should stamp updatedTurn');
        } else {
            ok('applyVehicleOps applies active/move/damage/refuel');
        }
    }
}

{
    const current = makeState();
    const wagon = current.vehicles.find((v) => v.id === 'rust_wagon');
    wagon.durability.hp = 5;
    wagon.durability.condition = 'critical';
    wagon.status = 'damaged';
    const next = applyVehicleOps(current, [{ type: 'repair_vehicle', vehicleId: 'rust_wagon', amount: 20 }]);
    const repaired = next?.vehicles.find((v) => v.id === 'rust_wagon');
    if (!repaired || repaired.durability.hp !== 25) {
        fail(`repair_vehicle should clamp to maxHp progression, got hp=${repaired?.durability.hp}`);
    } else if (repaired.durability.condition !== 'damaged') {
        fail(`repair_vehicle should update condition band, got ${repaired.durability.condition}`);
    } else {
        ok('applyVehicleOps repair updates hp and condition');
    }
}

{
    const current = makeState();
    const wagon = current.vehicles.find((v) => v.id === 'rust_wagon');
    wagon.durability.hp = 60;
    wagon.durability.condition = 'pristine';
    wagon.status = 'parked';
    const next = applyVehicleOps(current, [{ type: 'damage_vehicle', vehicleId: 'rust_wagon', amount: 59 }]);
    const hit = next?.vehicles.find((v) => v.id === 'rust_wagon');
    if (!hit || hit.durability.hp !== 1) {
        fail(`damage_vehicle should leave 1 hp, got ${hit?.durability.hp}`);
    } else if (hit.durability.condition !== 'critical') {
        fail(`damage_vehicle should set critical condition, got ${hit.durability.condition}`);
    } else if (hit.status !== 'damaged') {
        fail(`damage_vehicle should move parked -> damaged, got ${hit.status}`);
    } else {
        ok('damage_vehicle updates status from parked to damaged');
    }
}

{
    const current = makeState();
    const wagon = current.vehicles.find((v) => v.id === 'rust_wagon');
    wagon.durability.hp = 5;
    wagon.durability.condition = 'critical';
    wagon.status = 'damaged';
    const next = applyVehicleOps(current, [{ type: 'repair_vehicle', vehicleId: 'rust_wagon', amount: 55 }]);
    const repaired = next?.vehicles.find((v) => v.id === 'rust_wagon');
    if (!repaired || repaired.durability.hp !== 60) {
        fail(`full repair should restore maxHp, got ${repaired?.durability.hp}`);
    } else if (repaired.durability.condition !== 'pristine') {
        fail(`full repair should set pristine condition, got ${repaired.durability.condition}`);
    } else if (repaired.status !== 'available') {
        fail(`full repair should move damaged -> available, got ${repaired.status}`);
    } else {
        ok('repair_vehicle updates status from damaged to available when fully repaired');
    }
}

{
    const current = makeState();
    const next = applyVehicleOps(current, [
        { type: 'refuel_vehicle', vehicleId: 'rust_wagon', amount: 4, resourceType: 'battery' },
        { type: 'move_vehicle', vehicleId: 'missing_vehicle', locationId: 'dock' },
    ]);
    if (next !== current) {
        fail('unsupported resourceType and unknown vehicle should no-op entire batch');
    } else {
        ok('applyVehicleOps no-op when all ops are ineffective');
    }
}

{
    if (!VEHICLE_OPS_PERSIST_LINE.includes('turn_result.vehicleOps')) {
        fail('VEHICLE_OPS_PERSIST_LINE should document vehicleOps channel');
    } else if (VEHICLE_OPS_PERSIST_LINE.includes('parse/apply gate not yet wired')) {
        fail('VEHICLE_OPS_PERSIST_LINE should not say V3 gate is unwired');
    } else {
        ok('vehicle prompt documents wired vehicleOps slice');
    }
}

{
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lr-vehicle-ops-'));
    const statePath = path.join(dir, VEHICLE_STATE);
    const state = makeState();
    fs.writeFileSync(statePath, JSON.stringify(state, null, 2), 'utf-8');

    const deps = {
        isVehicleSystemEnabled: () => true,
        getVehicleStatePath: () => statePath,
        readVehicleStateFromDisk: (p) => {
            const raw = JSON.parse(fs.readFileSync(p ?? statePath, 'utf-8'));
            const parsed = parseVehicleState(raw);
            return parsed.vehicles.length ? parsed : undefined;
        },
        loadWorldTurn: () => 11,
        writeVehicleStateAtomic: (p, doc) => {
            fs.writeFileSync(p, JSON.stringify(doc, null, 2), 'utf-8');
        },
        clearVehicleStateCache: () => {},
        runSerializedMutation: (fn) => fn(),
    };

    const off = tryApplyVehicleTurnOpsWithDeps({
        vehicleOps: [{ type: 'set_active_vehicle', vehicleId: 'scout_bike' }],
    }, { ...deps, isVehicleSystemEnabled: () => false });
    if (off.attempted || off.applied) {
        fail('turn ops should not attempt when vehicle system disabled');
    }

    const applied = tryApplyVehicleTurnOpsWithDeps({
        vehicleOps: [{ type: 'set_active_vehicle', vehicleId: 'scout_bike' }],
    }, deps);
    const saved = parseVehicleState(JSON.parse(fs.readFileSync(statePath, 'utf-8')));
    if (!applied.applied || !applied.ok || saved.activeVehicleId !== 'scout_bike' || saved.updatedTurn !== 11) {
        fail(`disk persist failed: ${JSON.stringify({ applied, active: saved.activeVehicleId, turn: saved.updatedTurn })}`);
    } else {
        ok('vehicleTurnOps persists set_active_vehicle to vehicle_state.json');
    }

    const noop = tryApplyVehicleTurnOpsWithDeps({
        vehicleOps: [{ type: 'set_active_vehicle', vehicleId: 'scout_bike' }],
    }, deps);
    if (!noop.ok || noop.applied) {
        fail('identical vehicle op should be valid no-op');
    } else {
        ok('vehicleTurnOps valid no-op returns ok without applied');
    }

    fs.rmSync(dir, { recursive: true, force: true });
}

if (failed > 0) {
    console.error(`\n${failed} test(s) failed`);
    process.exit(1);
}
console.log('\nAll vehicle ops tests passed');