#!/usr/bin/env node
'use strict';

/**
 * MB3 move_mobile_base updates vehicle_state only — settlement ledger unchanged (Gemini P1 scope).
 */

const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const opsCorePath = path.join(root, 'out', 'mobileBaseOpsCore.js');
const vehicleCorePath = path.join(root, 'out', 'vehicleCore.js');
const settlementCorePath = path.join(root, 'out', 'settlementCore.js');

let failed = 0;
function fail(msg) { console.error(`FAIL: ${msg}`); failed++; }
function ok(msg) { console.log(`OK: ${msg}`); }

for (const p of [opsCorePath, vehicleCorePath, settlementCorePath]) {
    if (!fs.existsSync(p)) {
        fail(`${p} missing — run npm run compile`);
        process.exit(1);
    }
}

const { applyMobileBaseOps } = require(opsCorePath);
const { parseVehicleState } = require(vehicleCorePath);
const { parseSettlementState } = require(settlementCorePath);

const settlementBefore = parseSettlementState({
    version: 1,
    settlementId: 'ashcrawler_home',
    name: 'The Ashcrawler',
    locationId: 'outer_gate',
    stocks: [{ id: 'food', amount: 5 }],
    structures: [{ id: 'bridge', name: 'Bridge', status: 'intact', layerId: 'z0' }],
    residents: [{ npcId: 'crew_1' }],
    visitors: [],
    merchants: [],
    incidents: [],
});

const vehicleState = parseVehicleState({
    version: 1,
    vehicles: [{
        id: 'ashcrawler_hull',
        name: 'Ashcrawler Hull',
        kind: 'mobile_base',
        owner: { type: 'party' },
        status: 'parked',
        locationId: 'outer_gate',
        capacity: { crewRequired: 2, crewCapacity: 8, passengerCapacity: 4, cargoCapacity: 40 },
        access: { sizeClass: 'huge', accessTags: ['road'] },
        mobility: { speedBand: 'slow', rangeBand: 'regional', terrainTags: ['road'] },
        durability: { hp: 64, maxHp: 90, armorBand: 'heavy', condition: 'worn' },
        mobileBase: {
            settlementId: 'ashcrawler_home',
            mode: 'landship',
            layoutProfile: 'crawler',
            dockedAtLocationId: 'outer_gate',
        },
    }],
});

{
    const beforeVehicle = JSON.parse(JSON.stringify(vehicleState));
    const beforeSettlement = JSON.parse(JSON.stringify(settlementBefore));
    const next = applyMobileBaseOps(beforeVehicle, [{
        type: 'move_mobile_base',
        vehicleId: 'ashcrawler_hull',
        locationId: 'distant_hub',
        parkingLocationId: 'distant_yard',
    }]);
    const moved = next?.vehicles.find((v) => v.id === 'ashcrawler_hull');
    if (!moved || moved.locationId !== 'distant_hub') {
        fail(`vehicle location should move: ${JSON.stringify(moved?.locationId)}`);
    } else if (moved.mobileBase?.dockedAtLocationId !== 'distant_yard') {
        fail(`dock location should update: ${JSON.stringify(moved.mobileBase)}`);
    } else if (JSON.stringify(settlementBefore) !== JSON.stringify(beforeSettlement)) {
        fail('applyMobileBaseOps must not mutate settlement input');
    } else if (settlementBefore.locationId !== 'outer_gate') {
        fail('settlement locationId remains at pre-move value in this test fixture');
    } else {
        ok('move_mobile_base updates vehicle_state fields only');
    }
}

if (failed > 0) {
    console.error(`\n${failed} test(s) failed`);
    process.exit(1);
}
console.log('\nmobile base move vehicle-only: all tests passed');