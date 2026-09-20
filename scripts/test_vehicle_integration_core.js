#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const integrationPath = path.join(root, 'out', 'vehicleIntegrationCore.js');
const vehicleCorePath = path.join(root, 'out', 'vehicleCore.js');
const overlayPath = path.join(root, 'out', 'mapOverlayCore.js');
const forgeCorePath = path.join(root, 'out', 'worldForgeCore.js');

let failed = 0;
function fail(msg) { console.error(`FAIL: ${msg}`); failed++; }
function ok(msg) { console.log(`OK: ${msg}`); }

for (const p of [integrationPath, vehicleCorePath, overlayPath, forgeCorePath]) {
    if (!fs.existsSync(p)) {
        fail(`${p} missing — run npm run compile`);
        process.exit(1);
    }
}

const {
    buildVehicleIntegrationPromptLines,
    resolveLocationVehicleAccess,
    MAX_VEHICLE_INTEGRATION_LINES,
} = require(integrationPath);
const { parseVehicleState, parseLocationVehicleAccess } = require(vehicleCorePath);
const { buildMapOverlaySnapshot } = require(overlayPath);

const forge = {
    format: 'lorerelay-world-forge/1.0',
    meta: { worldName: 'Test', theme: 'test', worldSeed: 'seed-1' },
    geography: {
        regions: [
            { id: 'r_gate', name: 'Gate', type: 'urban', x: 400, y: 500 },
            { id: 'r_bunker', name: 'Bunker', type: 'dungeon', x: 700, y: 420 },
        ],
        locations: [
            {
                id: 'outer_gate',
                name: 'Outer Gate',
                regionId: 'r_gate',
                type: 'settlement',
                services: ['repair', 'refuel'],
            },
            {
                id: 'bunker_entry',
                name: 'Bunker Entry',
                regionId: 'r_bunker',
                type: 'dungeon',
                services: ['repair'],
                vehicleAccess: {
                    allowedVehicleSizeMax: 'small',
                    parkingLocationId: 'outer_gate',
                    blockedVehicleTags: ['narrow_tunnel'],
                },
            },
        ],
    },
    factions: [],
};

const vehicleState = parseVehicleState({
    version: 1,
    activeVehicleId: 'rust_truck',
    vehicles: [{
        id: 'rust_truck',
        name: 'Rust Truck',
        kind: 'truck',
        owner: { type: 'party' },
        status: 'parked',
        locationId: 'outer_gate',
        parkedAt: { locationId: 'bunker_entry', parkingLocationId: 'outer_gate' },
        capacity: { crewRequired: 1, crewCapacity: 2, passengerCapacity: 4, cargoCapacity: 28 },
        access: {
            sizeClass: 'large',
            accessTags: ['road', 'wide_gate'],
            blockedBy: ['narrow_tunnel'],
        },
        mobility: { speedBand: 'fast', rangeBand: 'regional', terrainTags: ['road'] },
        durability: { hp: 20, maxHp: 60, armorBand: 'medium', condition: 'damaged' },
        resources: { powerType: 'fuel', current: 1, max: 30 },
    }],
});

{
    const access = resolveLocationVehicleAccess(forge, 'bunker_entry');
    if (!access?.parkingLocationId) {
        fail('resolveLocationVehicleAccess should read forge vehicleAccess');
    } else {
        ok('resolveLocationVehicleAccess reads world_forge vehicleAccess');
    }
}

{
    const parsed = parseLocationVehicleAccess({
        allowedVehicleSizeMax: 'huge',
        parkingLocationId: 'outer_gate',
        requiredAccessTags: ['road'],
    });
    if (!parsed || parsed.allowedVehicleSizeMax !== 'huge' || parsed.parkingLocationId !== 'outer_gate') {
        fail('parseLocationVehicleAccess should normalize profile');
    } else {
        ok('parseLocationVehicleAccess parses compact profile');
    }
}

{
    const lines = buildVehicleIntegrationPromptLines({
        state: vehicleState,
        currentLocationId: 'bunker_entry',
        location: forge.geography.locations[1],
        locationAccess: forge.geography.locations[1].vehicleAccess,
    });
    if (!lines.length) {
        fail('integration prompt should emit cannot-enter helper');
    } else if (!lines[0].includes('Cannot enter bunker_entry')) {
        fail(`expected cannot-enter line, got ${lines[0]}`);
    } else if (!lines.some((l) => l.includes('repair_vehicle') || l.includes('Services:'))) {
        fail('integration prompt should mention service hooks when damaged + repair service');
    } else if (lines.length > MAX_VEHICLE_INTEGRATION_LINES) {
        fail('integration lines must be capped');
    } else {
        ok('integration prompt emits access + service hooks');
    }
}

{
    const snapOff = buildMapOverlaySnapshot({
        forge,
        fog: { discoveredRegionIds: ['r_gate', 'r_bunker'], rumoredRegionIds: [] },
        enableNpcAgency: false,
        enableNpcRegistry: false,
        enableSettlementMode: false,
        enableCampaignKit: false,
        enableVehicleSystem: false,
        vehicleState,
    });
    if (snapOff.markers.some((m) => m.kind === 'vehicle' || m.kind === 'vehicle_parking')) {
        fail('vehicle overlay markers must be gated off when enableVehicleSystem is false');
    } else {
        ok('vehicle overlay respects enableVehicleSystem gate');
    }
}

{
    const snap = buildMapOverlaySnapshot({
        forge,
        fog: { discoveredRegionIds: ['r_gate', 'r_bunker'], rumoredRegionIds: [] },
        enableNpcAgency: false,
        enableNpcRegistry: false,
        enableSettlementMode: false,
        enableCampaignKit: false,
        enableVehicleSystem: true,
        vehicleState,
        currentLocationId: 'bunker_entry',
    });
    const vehicles = snap.markers.filter((m) => m.kind === 'vehicle');
    const parking = snap.markers.filter((m) => m.kind === 'vehicle_parking');
    if (!vehicles.length) {
        fail('vehicle markers should appear when vehicle system on');
    } else if (!parking.length) {
        fail('vehicle_parking markers should appear for external parking');
    } else if (!vehicles[0].label.includes('Rust Truck')) {
        fail('vehicle marker label should include vehicle name');
    } else {
        ok('map overlay emits vehicle + parking markers');
    }
}

if (failed) {
    console.error(`\n${failed} test(s) failed.`);
    process.exit(1);
}
console.log('\nAll vehicle integration core tests passed');