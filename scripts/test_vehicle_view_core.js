#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const corePath = path.join(root, 'out', 'vehicleViewCore.js');
const vehicleCorePath = path.join(root, 'out', 'vehicleCore.js');

let failed = 0;
function fail(msg) { console.error(`FAIL: ${msg}`); failed++; }
function ok(msg) { console.log(`OK: ${msg}`); }

for (const p of [corePath, vehicleCorePath]) {
    if (!fs.existsSync(p)) {
        fail(`${p} missing — run npm run compile`);
        process.exit(1);
    }
}

const {
    buildVehicleGarageSnapshot,
    pickVehicleGarageSnapshotKeys,
    pickVehicleGarageItemKeys,
    VEHICLE_GARAGE_SNAPSHOT_KEYS,
    VEHICLE_GARAGE_ITEM_KEYS,
    MAX_GARAGE_VEHICLES,
} = require(corePath);
const { parseVehicleState } = require(vehicleCorePath);

const baseVehicle = {
    id: 'rust_wagon',
    name: 'Rust Wagon',
    kind: 'truck',
    owner: { type: 'party' },
    status: 'parked',
    locationId: 'outer_gate',
    capacity: { crewRequired: 1, crewCapacity: 2, passengerCapacity: 4, cargoCapacity: 30, currentCargoLoad: 12 },
    access: { sizeClass: 'large', accessTags: ['road', 'wide_gate'], blockedBy: ['stairs', 'narrow_tunnel'] },
    mobility: { speedBand: 'normal', rangeBand: 'regional', terrainTags: ['road'] },
    durability: { hp: 42, maxHp: 60, armorBand: 'medium', condition: 'worn' },
    resources: { powerType: 'fuel', current: 2, max: 20 },
    modules: [{ id: 'mod_spot', slot: 'utility', name: 'Spotlight' }],
    parkedAt: { locationId: 'outer_gate', parkingLocationId: 'gate_yard', kind: 'parked' },
};

function makeState(extra = {}) {
    return parseVehicleState({
        version: 1,
        activeVehicleId: 'rust_wagon',
        vehicles: [
            baseVehicle,
            {
                ...baseVehicle,
                id: 'scout_bike',
                name: 'Scout Bike',
                kind: 'bike',
                status: 'available',
                locationId: 'market_square',
                access: { sizeClass: 'small', accessTags: ['road', 'narrow_path'] },
                resources: { powerType: 'none' },
                modules: undefined,
                parkedAt: undefined,
            },
        ],
        ...extra,
    });
}

{
    if (buildVehicleGarageSnapshot(undefined) !== undefined) {
        fail('empty state should return undefined');
    } else {
        ok('empty fleet returns undefined snapshot');
    }
}

{
    const state = makeState();
    const before = JSON.parse(JSON.stringify(state));
    const snap = buildVehicleGarageSnapshot(state, {
        currentLocationId: 'outer_gate',
        resolveLocationName: (id) => (id === 'outer_gate' ? 'Outer Gate' : id),
        locationAccess: { allowedVehicleSizeMax: 'medium', parkingLocationId: 'gate_yard' },
    });
    if (JSON.stringify(state) !== JSON.stringify(before)) {
        fail('buildVehicleGarageSnapshot mutated input');
    } else if (!snap || snap.vehicles.length !== 2) {
        fail('snapshot should include fleet vehicles');
    } else {
        const active = snap.vehicles.find((v) => v.id === 'rust_wagon');
        if (!active?.isActive || !active.atCurrentLocation) {
            fail('active vehicle should be flagged active and at current location');
        } else if (active.fuelBand !== 'low' || active.cargoLoad !== 12) {
            fail(`fuel/cargo bands wrong: ${JSON.stringify({ fuel: active.fuelBand, cargo: active.cargoLoad })}`);
        } else if (!active.accessWarning || active.parkingFallbackId !== 'gate_yard') {
            fail(`access warning missing: ${JSON.stringify(active)}`);
        } else if (!active.modules.length || active.accessRestrictions.length !== 2) {
            fail('modules and access restrictions should be included');
        } else if (snap.currentLocationLabel !== 'Outer Gate') {
            fail('current location label should resolve');
        } else {
            ok('garage snapshot summarizes active vehicle with access warning');
        }
    }
}

{
    const state = makeState();
    const snap = buildVehicleGarageSnapshot(state, { currentLocationId: 'outer_gate' });
    const first = snap?.vehicles[0];
    const keys = first ? Object.keys(pickVehicleGarageItemKeys(first)) : [];
    const extra = keys.filter((k) => !VEHICLE_GARAGE_ITEM_KEYS.includes(k));
    if (extra.length) {
        fail(`unexpected garage item keys: ${extra.join(',')}`);
    } else {
        ok('garage item keys stay within allow-list');
    }
}

{
    const many = Array.from({ length: 20 }, (_, i) => ({
        ...baseVehicle,
        id: `veh_${i}`,
        name: `Vehicle ${i}`,
    }));
    const state = parseVehicleState({ version: 1, vehicles: many });
    const snap = buildVehicleGarageSnapshot(state);
    if (!snap || snap.vehicles.length !== MAX_GARAGE_VEHICLES) {
        fail(`garage should cap vehicles at ${MAX_GARAGE_VEHICLES}`);
    } else if (snap.fleetCount !== 20) {
        fail('fleetCount should reflect full ledger size');
    } else {
        ok(`garage caps display vehicles at ${MAX_GARAGE_VEHICLES}`);
    }
}

{
    const state = makeState({
        vehicles: [
            { ...baseVehicle, carriedByVehicleId: 'rust_wagon' },
            {
                ...baseVehicle,
                id: 'carrier_ship',
                name: 'Carrier',
                hangar: { bayCapacity: 2, usedBays: 1, maxCarriedSize: 'small', carriedVehicleIds: ['rust_wagon'] },
            },
        ],
    });
    const snap = buildVehicleGarageSnapshot(state);
    const fleet = validateFleetIssues(snap);
    if (!snap?.warnings?.length) {
        fail('fleet validation issues should surface as warnings');
    } else {
        ok('fleet validation warnings included in snapshot');
    }
}

function validateFleetIssues(snap) {
    return snap && Array.isArray(snap.warnings) && snap.warnings.length > 0;
}

{
    const state = makeState();
    const snap = buildVehicleGarageSnapshot(state, { currentLocationId: 'outer_gate' });
    if (!snap) {
        fail('expected snapshot');
    } else {
        const picked = pickVehicleGarageSnapshotKeys(snap);
        const extra = Object.keys(picked).filter((k) => !VEHICLE_GARAGE_SNAPSHOT_KEYS.includes(k));
        if (extra.length) {
            fail(`unexpected garage snapshot keys: ${extra.join(',')}`);
        } else {
            ok('garage snapshot keys stay within allow-list');
        }
    }
}

if (failed > 0) {
    console.error(`\n${failed} test(s) failed`);
    process.exit(1);
}
console.log('\nAll vehicle view core tests passed');