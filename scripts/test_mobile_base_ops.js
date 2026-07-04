#!/usr/bin/env node
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const root = path.join(__dirname, '..');
const opsCorePath = path.join(root, 'out', 'mobileBaseOpsCore.js');
const turnOpsCorePath = path.join(root, 'out', 'mobileBaseTurnOpsCore.js');
const mbCorePath = path.join(root, 'out', 'mobileBaseCore.js');
const vehicleCorePath = path.join(root, 'out', 'vehicleCore.js');

let failed = 0;
function fail(msg) { console.error(`FAIL: ${msg}`); failed++; }
function ok(msg) { console.log(`OK: ${msg}`); }

for (const p of [opsCorePath, turnOpsCorePath, mbCorePath, vehicleCorePath]) {
    if (!fs.existsSync(p)) {
        fail(`${p} missing — run npm run compile`);
        process.exit(1);
    }
}

const {
    parseMobileBaseOps,
    applyMobileBaseOps,
    shouldAttemptMobileBasePersistCore,
    MAX_MOBILE_BASE_OPS,
} = require(opsCorePath);
const { tryApplyMobileBaseTurnOpsWithDeps } = require(turnOpsCorePath);
const { MOBILE_BASE_OPS_PERSIST_LINE } = require(mbCorePath);
const { parseVehicleState } = require(vehicleCorePath);

const VEHICLE_STATE = 'vehicle_state.json';

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

const plainVehicle = {
    id: 'rust_wagon',
    name: 'Rust Wagon',
    kind: 'truck',
    owner: { type: 'party' },
    status: 'parked',
    locationId: 'outer_gate',
    capacity: { crewRequired: 1, crewCapacity: 2, passengerCapacity: 4, cargoCapacity: 30 },
    access: { sizeClass: 'large', accessTags: ['road'] },
    mobility: { speedBand: 'normal', rangeBand: 'local', terrainTags: ['road'] },
    durability: { hp: 40, maxHp: 60, armorBand: 'medium', condition: 'worn' },
};

function makeState() {
    return parseVehicleState({
        version: 1,
        activeVehicleId: 'ashcrawler_hull',
        vehicles: [mobileBaseVehicle, plainVehicle],
    });
}

function clone(obj) {
    return JSON.parse(JSON.stringify(obj));
}

{
    const ops = parseMobileBaseOps([
        { type: 'dock_mobile_base', vehicleId: 'ashcrawler_hull', locationId: 'harbor_dock' },
        { type: 'undock_mobile_base', vehicleId: 'ashcrawler_hull' },
        { type: 'move_mobile_base', vehicleId: 'ashcrawler_hull', locationId: 'road_north' },
        { type: 'consume_mobile_base_fuel', vehicleId: 'ashcrawler_hull', amount: 3 },
        { type: 'set_mobile_base_mode', vehicleId: 'ashcrawler_hull', mode: 'caravan' },
        { type: 'mark_facility_damaged', settlementId: 'x', facilityId: 'y' },
        { type: 'dock_mobile_base', vehicleId: 'bad id!', locationId: 'x' },
    ]);
    if (ops.length !== 4) {
        fail(`parseMobileBaseOps should keep 4 MB3 ops, got ${ops.length}`);
    } else {
        ok('parseMobileBaseOps filters unsupported cross-ledger ops');
    }
}

{
    const many = Array.from({ length: 12 }, () => ({
        type: 'consume_mobile_base_fuel',
        vehicleId: 'ashcrawler_hull',
        amount: 1,
    }));
    if (parseMobileBaseOps(many).length !== MAX_MOBILE_BASE_OPS) {
        fail(`parseMobileBaseOps should cap at ${MAX_MOBILE_BASE_OPS}`);
    } else {
        ok(`parseMobileBaseOps caps at ${MAX_MOBILE_BASE_OPS}`);
    }
}

{
    const rulesOn = {
        enableVehicleSystem: true,
        enableSettlementMode: true,
        enableMobileBaseSystem: true,
    };
    if (!shouldAttemptMobileBasePersistCore(rulesOn, [{ type: 'undock_mobile_base', vehicleId: 'ashcrawler_hull' }])) {
        fail('shouldAttempt true when triple gate on and ops present');
    } else if (shouldAttemptMobileBasePersistCore({ ...rulesOn, enableMobileBaseSystem: false }, [{ type: 'undock_mobile_base', vehicleId: 'x' }])) {
        fail('shouldAttempt false when enableMobileBaseSystem off');
    } else {
        ok('shouldAttemptMobileBasePersistCore triple-gated');
    }
}

{
    const current = makeState();
    const before = clone(current);
    const next = applyMobileBaseOps(current, [
        { type: 'move_mobile_base', vehicleId: 'ashcrawler_hull', locationId: 'road_north', parkingLocationId: 'road_north_camp' },
        { type: 'consume_mobile_base_fuel', vehicleId: 'ashcrawler_hull', amount: 5 },
        { type: 'dock_mobile_base', vehicleId: 'rust_wagon', locationId: 'dock' },
    ], { worldTurn: 14 });
    if (JSON.stringify(before) !== JSON.stringify(current)) {
        fail('applyMobileBaseOps should not mutate input');
    } else {
        const hull = next?.vehicles.find((v) => v.id === 'ashcrawler_hull');
        if (!hull || hull.locationId !== 'road_north') {
            fail('move_mobile_base should update location');
        } else if (hull.mobileBase?.dockedAtLocationId !== 'road_north_camp') {
            fail('move_mobile_base should update dockedAtLocationId');
        } else if (hull.resources?.current !== 7) {
            fail(`consume_mobile_base_fuel should subtract fuel, got ${hull.resources?.current}`);
        } else if (next.updatedTurn !== 14) {
            fail('applyMobileBaseOps should stamp updatedTurn');
        } else {
            ok('applyMobileBaseOps move + fuel on mobile-base vehicle only');
        }
    }
}

{
    const current = makeState();
    const docked = applyMobileBaseOps(current, [
        { type: 'dock_mobile_base', vehicleId: 'ashcrawler_hull', locationId: 'harbor_dock', parkingLocationId: 'dock_b' },
    ]);
    const hull = docked?.vehicles.find((v) => v.id === 'ashcrawler_hull');
    if (!hull || hull.status !== 'parked' || hull.mobileBase?.dockedAtLocationId !== 'dock_b') {
        fail(`dock_mobile_base state wrong: ${JSON.stringify({ status: hull?.status, dock: hull?.mobileBase?.dockedAtLocationId })}`);
    }

    const undocked = applyMobileBaseOps(docked, [
        { type: 'undock_mobile_base', vehicleId: 'ashcrawler_hull' },
    ]);
    const free = undocked?.vehicles.find((v) => v.id === 'ashcrawler_hull');
    if (!free || free.status !== 'deployed' || free.mobileBase?.dockedAtLocationId) {
        fail(`undock_mobile_base state wrong: ${JSON.stringify({ status: free?.status, dock: free?.mobileBase?.dockedAtLocationId })}`);
    } else if (free.parkedAt) {
        fail(`undock_mobile_base should clear parkedAt, got ${JSON.stringify(free.parkedAt)}`);
    } else {
        ok('dock_mobile_base and undock_mobile_base update docking state');
    }
}

{
    const current = makeState();
    const next = applyMobileBaseOps(current, [
        { type: 'consume_mobile_base_fuel', vehicleId: 'rust_wagon', amount: 2 },
    ]);
    if (next !== current) {
        fail('ops on non-mobile-base vehicle should no-op');
    } else {
        ok('non-mobile-base vehicles are skipped');
    }
}

{
    if (!MOBILE_BASE_OPS_PERSIST_LINE.includes('turn_result.mobileBaseOps')) {
        fail('MOBILE_BASE_OPS_PERSIST_LINE should document mobileBaseOps');
    } else if (MOBILE_BASE_OPS_PERSIST_LINE.includes('parse/apply gate not yet wired')) {
        fail('MOBILE_BASE_OPS_PERSIST_LINE should not say MB3 gate is unwired');
    } else {
        ok('mobile base prompt documents wired mobileBaseOps slice');
    }
}

{
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lr-mobile-base-ops-'));
    const statePath = path.join(dir, VEHICLE_STATE);
    const state = makeState();
    fs.writeFileSync(statePath, JSON.stringify(state, null, 2), 'utf-8');

    const deps = {
        loadRuleFlags: () => ({
            enableVehicleSystem: true,
            enableSettlementMode: true,
            enableMobileBaseSystem: true,
        }),
        getVehicleStatePath: () => statePath,
        readVehicleStateFromDisk: (p) => {
            const raw = JSON.parse(fs.readFileSync(p ?? statePath, 'utf-8'));
            const parsed = parseVehicleState(raw);
            return parsed.vehicles.length ? parsed : undefined;
        },
        loadWorldTurn: () => 20,
        writeVehicleStateAtomic: (p, doc) => {
            fs.writeFileSync(p, JSON.stringify(doc, null, 2), 'utf-8');
        },
        clearVehicleStateCache: () => {},
        runSerializedMutation: (fn) => fn(),
    };

    const off = tryApplyMobileBaseTurnOpsWithDeps({
        mobileBaseOps: [{ type: 'move_mobile_base', vehicleId: 'ashcrawler_hull', locationId: 'east_road' }],
    }, { ...deps, loadRuleFlags: () => ({ enableVehicleSystem: true, enableSettlementMode: true, enableMobileBaseSystem: false }) });
    if (off.attempted || off.applied) {
        fail('turn ops should not attempt when mobile base flag off');
    }

    const applied = tryApplyMobileBaseTurnOpsWithDeps({
        mobileBaseOps: [{ type: 'move_mobile_base', vehicleId: 'ashcrawler_hull', locationId: 'east_road' }],
    }, deps);
    const saved = parseVehicleState(JSON.parse(fs.readFileSync(statePath, 'utf-8')));
    const hull = saved.vehicles.find((v) => v.id === 'ashcrawler_hull');
    if (!applied.applied || !applied.ok || hull?.locationId !== 'east_road' || saved.updatedTurn !== 20) {
        fail(`disk persist failed: ${JSON.stringify({ applied, loc: hull?.locationId, turn: saved.updatedTurn })}`);
    } else {
        ok('mobileBaseTurnOps persists to vehicle_state.json');
    }

    fs.rmSync(dir, { recursive: true, force: true });
}

if (failed > 0) {
    console.error(`\n${failed} test(s) failed`);
    process.exit(1);
}
console.log('\nAll mobile base ops tests passed');