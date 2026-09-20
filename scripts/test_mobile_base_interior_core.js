#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const corePath = path.join(root, 'out', 'mobileBaseInteriorCore.js');
const mbCorePath = path.join(root, 'out', 'mobileBaseCore.js');
const vehicleCorePath = path.join(root, 'out', 'vehicleCore.js');
const settlementCorePath = path.join(root, 'out', 'settlementCore.js');

let failed = 0;
function fail(msg) { console.error(`FAIL: ${msg}`); failed++; }
function ok(msg) { console.log(`OK: ${msg}`); }

for (const p of [corePath, mbCorePath, vehicleCorePath, settlementCorePath]) {
    if (!fs.existsSync(p)) {
        fail(`${p} missing — run npm run compile`);
        process.exit(1);
    }
}

const {
    buildMobileBaseInteriorPayload,
    pickMobileBaseInteriorPayloadKeys,
    MOBILE_BASE_INTERIOR_PAYLOAD_KEYS,
} = require(corePath);
const { parseVehicleState } = require(vehicleCorePath);
const { parseSettlementState } = require(settlementCorePath);

const TRIPLE_RULES = {
    enableVehicleSystem: true,
    enableSettlementMode: true,
    enableMobileBaseSystem: true,
    enableSettlementDiorama: true,
};

const settlement = parseSettlementState({
    version: 1,
    settlementId: 'ashcrawler_home',
    name: 'The Ashcrawler',
    locationId: 'outer_gate',
    morale: 50,
    safety: 45,
    stocks: [{ id: 'food', amount: 5 }],
    structures: [
        { id: 'bridge', name: 'Bridge', status: 'intact', layerId: 'z0' },
        { id: 'engine', name: 'Engine Room', status: 'intact', layerId: 'z0' },
    ],
    residents: [],
    visitors: [],
    merchants: [],
    incidents: [],
});

const vehicleOpen = parseVehicleState({
    version: 1,
    vehicles: [{
        id: 'ashcrawler_hull',
        name: 'Ashcrawler Hull',
        kind: 'mobile_base',
        owner: { type: 'party' },
        status: 'parked',
        locationId: 'outer_gate',
        capacity: { crewRequired: 2, crewCapacity: 8, passengerCapacity: 4, cargoCapacity: 40 },
        access: { sizeClass: 'huge', accessTags: ['road'], blockedBy: [] },
        mobility: { speedBand: 'slow', rangeBand: 'regional', terrainTags: ['road'] },
        durability: { hp: 80, maxHp: 90, armorBand: 'heavy', condition: 'worn' },
        mobileBase: {
            settlementId: 'ashcrawler_home',
            mode: 'crawler',
            layoutProfile: 'crawler',
            interiorAccess: 'open',
        },
    }],
}).vehicles[0];

const vehicleLocked = {
    ...vehicleOpen,
    mobileBase: {
        ...vehicleOpen.mobileBase,
        interiorAccess: 'locked',
    },
};

{
    const off = buildMobileBaseInteriorPayload(vehicleOpen, settlement, undefined, {
        enableVehicleSystem: true,
        enableSettlementMode: true,
        enableMobileBaseSystem: false,
    });
    if (off !== undefined) {
        fail('triple gate off should return undefined');
    } else {
        ok('triple gate off returns undefined');
    }
}

{
    const mismatch = buildMobileBaseInteriorPayload(
        { ...vehicleOpen, mobileBase: { ...vehicleOpen.mobileBase, settlementId: 'other_base' } },
        settlement,
        undefined,
        TRIPLE_RULES
    );
    if (mismatch !== undefined) {
        fail('settlementId mismatch should return undefined');
    } else {
        ok('settlement mismatch blocks interior payload');
    }
}

{
    const blocked = buildMobileBaseInteriorPayload(vehicleLocked, settlement, undefined, TRIPLE_RULES);
    if (!blocked || !blocked.interiorBlocked) {
        fail('locked interior should set interiorBlocked');
    } else if (blocked.settlementView) {
        fail('locked interior must not leak settlementView');
    } else if (blocked.hasCanvas || blocked.hasDiorama) {
        fail('blocked interior should not advertise canvas/diorama');
    } else if (blocked.interiorBlockReason !== 'interior_locked') {
        fail(`expected interior_locked reason, got ${blocked.interiorBlockReason}`);
    } else {
        ok('locked interior blocks view without leaking layout');
    }
}

{
    const before = JSON.stringify(settlement);
    const payload = buildMobileBaseInteriorPayload(vehicleOpen, settlement, undefined, TRIPLE_RULES);
    const after = JSON.stringify(settlement);
    if (before !== after) {
        fail('inputs must not mutate');
    } else if (!payload || payload.interiorBlocked) {
        fail('valid link should produce open interior payload');
    } else if (!payload.settlementView || payload.settlementView.settlementId !== 'ashcrawler_home') {
        fail('payload should include settlementView for linked settlement');
    } else if (!payload.hasCanvas) {
        fail('fixture settlement should have canvas content');
    } else if (!payload.settlementDiorama || !payload.hasDiorama) {
        fail('diorama flag on should build settlementDiorama');
    } else {
        ok('valid mobile base interior reuses settlementView + diorama');
    }
}

{
    const payload = buildMobileBaseInteriorPayload(vehicleOpen, settlement, undefined, TRIPLE_RULES);
    const keys = Object.keys(pickMobileBaseInteriorPayloadKeys(payload)).sort();
    const allowed = [...MOBILE_BASE_INTERIOR_PAYLOAD_KEYS].sort();
    if (JSON.stringify(keys) !== JSON.stringify(allowed.filter((k) => keys.includes(k)))) {
        fail('payload keys should stay within allow-list');
    } else {
        ok('payload keys stay within allow-list');
    }
}

if (failed) {
    console.error(`\n${failed} test(s) failed.`);
    process.exit(1);
}
console.log('\nAll mobile base interior core tests passed');