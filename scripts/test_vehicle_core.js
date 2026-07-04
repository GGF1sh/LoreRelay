#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const corePath = path.join(root, 'out', 'vehicleCore.js');

let failed = 0;
function fail(msg) { console.error(`FAIL: ${msg}`); failed++; }
function ok(msg) { console.log(`OK: ${msg}`); }

if (!fs.existsSync(corePath)) {
    fail('out/vehicleCore.js missing - run npm run compile first');
    process.exit(1);
}

const {
    parseVehicleState,
    canVehicleAccessLocation,
    validateVehicleFleet,
    buildVehiclePromptLines,
    MAX_VEHICLES,
    MAX_VEHICLE_MODULES,
    MAX_PROMPT_LINE_CHARS,
} = require(corePath);

function clone(obj) {
    return JSON.parse(JSON.stringify(obj));
}

const baseVehicle = {
    id: 'rust_wagon',
    name: 'Rust Wagon',
    kind: 'truck',
    owner: { type: 'party' },
    status: 'parked',
    locationId: 'outer_gate',
    capacity: { crewRequired: 1, crewCapacity: 2, passengerCapacity: 4, cargoCapacity: 30, currentCargoLoad: 18 },
    access: { sizeClass: 'large', accessTags: ['road', 'offroad', 'wide_gate'], blockedBy: ['stairs', 'narrow_tunnel'] },
    mobility: { speedBand: 'normal', rangeBand: 'regional', terrainTags: ['road', 'offroad'] },
    durability: { hp: 42, maxHp: 60, armorBand: 'medium', condition: 'worn' },
    resources: { powerType: 'fuel', current: 3, max: 20 },
    modules: [{ id: 'mod_spot', slot: 'utility', name: 'Spotlight' }],
};

{
    const empty = parseVehicleState(null);
    if (empty.vehicles.length !== 0) {
        fail('null input should yield empty fleet');
    } else {
        ok('missing/invalid state parses to empty ledger');
    }
}

{
    const raw = {
        version: 1,
        vehicles: [baseVehicle, { ...baseVehicle, id: 'scout_bike', name: 'Scout Bike', kind: 'bike', access: { sizeClass: 'small', accessTags: ['road', 'narrow_path'] } }],
        activeVehicleId: 'rust_wagon',
        updatedTurn: 12,
    };
    const before = clone(raw);
    const state = parseVehicleState(raw);
    if (JSON.stringify(raw) !== JSON.stringify(before)) {
        fail('parseVehicleState mutated input');
    } else if (state.vehicles.length !== 2 || state.activeVehicleId !== 'rust_wagon') {
        fail('valid state should preserve safe vehicle fields');
    } else {
        ok('valid state preserves fields and does not mutate input');
    }
}

{
    const state = parseVehicleState({
        version: 1,
        vehicles: [
            { ...baseVehicle, id: 'bad id!', name: 'X' },
            { ...baseVehicle, id: 'ok_vehicle', name: 'OK' },
        ],
    });
    if (state.vehicles.length !== 1 || state.vehicles[0].id !== 'ok_vehicle') {
        fail('invalid IDs should be rejected');
    } else {
        ok('invalid IDs are rejected');
    }
}

{
    const many = Array.from({ length: 30 }, (_, i) => ({
        ...baseVehicle,
        id: `v_${i}`,
        name: `Vehicle ${i}`,
    }));
    const state = parseVehicleState({ version: 1, vehicles: many });
    if (state.vehicles.length !== MAX_VEHICLES) {
        fail(`vehicle array should cap at ${MAX_VEHICLES}`);
    } else {
        ok('vehicle arrays are capped');
    }
}

{
    const state = parseVehicleState({
        version: 1,
        vehicles: [{
            ...baseVehicle,
            modules: Array.from({ length: 20 }, (_, i) => ({ id: `m${i}`, slot: 'other', name: `Mod ${i}` })),
            cargo: Array.from({ length: 30 }, (_, i) => ({ id: `c${i}`, amount: 1 })),
            crew: Array.from({ length: 20 }, (_, i) => ({ npcId: `npc_${i}` })),
            notes: Array.from({ length: 20 }, (_, i) => ({ text: `note ${i}` })),
            capacity: { crewRequired: -2, crewCapacity: 1, passengerCapacity: -1, cargoCapacity: 5, currentCargoLoad: 99 },
        }],
    });
    const v = state.vehicles[0];
    if (!v || v.modules.length > MAX_VEHICLE_MODULES || v.cargo.length > 24) {
        fail('nested arrays should cap');
    } else if (v.capacity.crewRequired !== 0 || v.capacity.currentCargoLoad > v.capacity.cargoCapacity) {
        fail('negative capacity and cargo overflow should clamp');
    } else {
        ok('modules/cargo/crew/notes capped and capacity clamped');
    }
}

{
    const state = parseVehicleState({
        version: 1,
        vehicles: [{
            ...baseVehicle,
            modules: [{
                id: 'radar',
                slot: 'utility',
                name: 'Radar',
                tags: ['sensor', 'long_range', 'military', 'truck'],
            }],
        }],
    });
    const mod = state.vehicles[0]?.modules?.[0];
    if (!mod?.tags?.includes('sensor') || !mod.tags.includes('long_range')) {
        fail(`module tags should preserve free-form labels, got ${JSON.stringify(mod?.tags)}`);
    } else if (!mod.tags.includes('truck')) {
        fail('module tags should still accept vehicle-kind labels when present');
    } else {
        ok('module tags accept free-form sanitized strings');
    }
}

{
    const allowed = canVehicleAccessLocation(
        { ...baseVehicle, access: { sizeClass: 'small', accessTags: ['road', 'dungeon_entry'] } },
        { allowedVehicleSizeMax: 'large', requiredAccessTags: ['road'] }
    );
    if (!allowed.allowed || allowed.reason !== 'ok') {
        fail('suitable vehicle/location should be allowed');
    } else {
        ok('access check allows suitable vehicle');
    }
}

{
    const denied = canVehicleAccessLocation(baseVehicle, {
        allowedVehicleSizeMax: 'medium',
        parkingLocationId: 'outer_gate',
    });
    if (denied.allowed || denied.reason !== 'vehicle_too_large' || denied.parkingLocationId !== 'outer_gate') {
        fail('too-large vehicle should deny with parking fallback');
    } else {
        ok('access check rejects oversized vehicle with parking');
    }
}

{
    const denied = canVehicleAccessLocation(
        { ...baseVehicle, access: { sizeClass: 'medium', accessTags: ['road'] } },
        { requiredAccessTags: ['dock'] }
    );
    if (denied.allowed || denied.reason !== 'missing_required_access') {
        fail('missing required access tag should deny');
    } else {
        ok('access check rejects missing required tag');
    }
}

{
    const denied = canVehicleAccessLocation(
        { ...baseVehicle, access: { sizeClass: 'medium', accessTags: ['road'], blockedBy: ['stairs'] } },
        { blockedVehicleTags: ['stairs'] }
    );
    if (denied.allowed || denied.reason !== 'blocked_by_location') {
        fail('blocked vehicle tag should deny');
    } else {
        ok('access check rejects blocked-by-location');
    }
}

{
    const denied = canVehicleAccessLocation(
        { ...baseVehicle, status: 'disabled' },
        { allowedVehicleSizeMax: 'colossal' }
    );
    if (denied.allowed || denied.reason !== 'vehicle_disabled') {
        fail('disabled vehicle should be denied');
    } else {
        ok('disabled vehicle access denied');
    }
}

{
    const state = parseVehicleState({
        version: 1,
        vehicles: [
            {
                ...baseVehicle,
                id: 'carrier',
                name: 'Iron Gull',
                kind: 'ship',
                hangar: { bayCapacity: 6, maxCarriedSize: 'medium', carriedVehicleIds: ['scout_mech', 'launch_boat', 'carrier'] },
            },
            { ...baseVehicle, id: 'scout_mech', name: 'Scout Mech', access: { sizeClass: 'small', accessTags: ['road'] }, carriedByVehicleId: 'carrier' },
            { ...baseVehicle, id: 'launch_boat', name: 'Launch Boat', access: { sizeClass: 'small', accessTags: ['water'] }, carriedByVehicleId: 'carrier' },
            { ...baseVehicle, id: 'oversize_child', name: 'Huge Mech', access: { sizeClass: 'huge', accessTags: ['road'] }, carriedByVehicleId: 'carrier' },
        ],
    });
    const result = validateVehicleFleet(state);
    if (result.ok) {
        fail('fleet validation should report self-carry and oversize child');
    } else if (!result.issues.some((i) => i.includes('itself'))) {
        fail('self-carry should be reported');
    } else if (!result.issues.some((i) => i.includes('exceeds carrier'))) {
        fail('oversize carried vehicle should be reported');
    } else {
        ok('validateVehicleFleet detects self-carry and oversize child');
    }
}

{
    const state = parseVehicleState({
        version: 1,
        vehicles: [
            { ...baseVehicle, id: 'a', hangar: { bayCapacity: 2, maxCarriedSize: 'large', carriedVehicleIds: ['b'] } },
            { ...baseVehicle, id: 'b', hangar: { bayCapacity: 2, maxCarriedSize: 'large', carriedVehicleIds: ['a'] } },
        ],
    });
    const result = validateVehicleFleet(state);
    if (result.ok || !result.issues.some((i) => i.includes('cycle'))) {
        fail('carrier cycle should be rejected');
    } else {
        ok('validateVehicleFleet detects carrier cycle');
    }
}

{
    const state = parseVehicleState({
        version: 1,
        activeVehicleId: 'rust_wagon',
        vehicles: [
            baseVehicle,
            { ...baseVehicle, id: 'scout_bike', name: 'Scout Bike', locationId: 'hub_market', access: { sizeClass: 'small', accessTags: ['road'] } },
            { ...baseVehicle, id: 'far_truck', name: 'Far Truck', locationId: 'distant_port' },
        ],
    });
    const lines = buildVehiclePromptLines(state, { currentLocationId: 'outer_gate', maxVehicles: 2 });
    const joined = lines.join('\n');
    if (!joined.includes('Rust Wagon') || joined.includes('Far Truck')) {
        fail('prompt should prefer active/nearby vehicles');
    } else if (lines.some((l) => l.length > MAX_PROMPT_LINE_CHARS + 1)) {
        fail('prompt lines should be bounded');
    } else if (joined.includes('Mod 0') || joined.includes('cargo item 0')) {
        fail('prompt should not dump cargo/module lists');
    } else {
        ok('buildVehiclePromptLines caps and summarizes fleet');
    }
}

{
    const state = parseVehicleState({
        version: 1,
        activeVehicleId: 'rust_wagon',
        vehicles: [baseVehicle],
    });
    const lines = buildVehiclePromptLines(state);
    if (!lines.some((l) => l.includes('Access limits'))) {
        fail('active vehicle prompt should mention access restrictions when blockedBy present');
    } else {
        ok('prompt includes access restriction line for active vehicle');
    }
}

if (failed > 0) {
    console.error(`\n${failed} test(s) failed`);
    process.exit(1);
}
console.log('\nAll vehicle core tests passed');