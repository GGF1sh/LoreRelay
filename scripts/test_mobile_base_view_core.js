#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const corePath = path.join(root, 'out', 'mobileBaseViewCore.js');
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
    buildMobileBasePanelSnapshot,
    pickMobileBasePanelSnapshotKeys,
    MOBILE_BASE_PANEL_SNAPSHOT_KEYS,
    MAX_PANEL_FACILITIES,
    MAX_PANEL_STOCKS,
} = require(corePath);
const { parseVehicleState } = require(vehicleCorePath);
const { parseSettlementState } = require(settlementCorePath);

const settlement = parseSettlementState({
    version: 1,
    settlementId: 'ashcrawler_home',
    name: 'The Ashcrawler',
    locationId: 'outer_gate',
    morale: 50,
    safety: 45,
    stocks: [{ id: 'food', amount: 1 }, { id: 'parts', amount: 6 }, { id: 'water', amount: 0 }],
    structures: [
        { id: 'bridge', name: 'Bridge', status: 'intact', layerId: 'z0' },
        { id: 'engine', name: 'Engine Room', status: 'damaged', layerId: 'z0' },
        { id: 'cargo', name: 'Cargo Hold', status: 'intact', layerId: 'z0' },
    ],
    residents: [{ npcId: 'crew_1' }, { npcId: 'crew_2' }],
    visitors: [{ npcId: 'merchant_1', untilWorldTurn: 20 }],
    merchants: [],
    incidents: [{
        id: 'inc_engine',
        worldTurn: 8,
        kind: 'repair',
        severity: 'warning',
        resolved: false,
        text: 'Engine repairs stalled',
    }],
});

const vehicle = parseVehicleState({
    version: 1,
    vehicles: [{
        id: 'ashcrawler_hull',
        name: 'Ashcrawler Hull',
        kind: 'mobile_base',
        owner: { type: 'party' },
        status: 'parked',
        locationId: 'outer_gate',
        capacity: { crewRequired: 2, crewCapacity: 8, passengerCapacity: 4, cargoCapacity: 40 },
        access: {
            sizeClass: 'huge',
            accessTags: ['road', 'wide_gate'],
            blockedBy: ['narrow_tunnel', 'stairs'],
        },
        mobility: { speedBand: 'slow', rangeBand: 'regional', terrainTags: ['road'] },
        durability: { hp: 64, maxHp: 90, armorBand: 'heavy', condition: 'worn' },
        combat: { threatBand: 'heavy' },
        resources: { powerType: 'fuel', current: 2, max: 30 },
        hangar: { bayCapacity: 4, usedBays: 2, maxCarriedSize: 'medium', carriedVehicleIds: ['scout_bike'] },
        mobileBase: {
            settlementId: 'ashcrawler_home',
            mode: 'landship',
            layoutProfile: 'crawler',
            dockedAtLocationId: 'outer_gate',
            interiorAccess: 'open',
        },
    }],
}).vehicles[0];

if (!settlement || !vehicle) {
    fail('fixtures should parse');
    process.exit(1);
}

{
    if (buildMobileBasePanelSnapshot(undefined, settlement) !== undefined) {
        fail('missing vehicle should return undefined');
    } else if (buildMobileBasePanelSnapshot(vehicle, undefined) !== undefined) {
        fail('missing settlement should return undefined');
    } else {
        ok('missing ledgers return undefined panel');
    }
}

{
    const mismatch = buildMobileBasePanelSnapshot(
        { ...vehicle, mobileBase: { settlementId: 'other_hub', mode: 'other' } },
        settlement
    );
    if (mismatch !== undefined) {
        fail('settlement id mismatch should not produce panel');
    } else {
        ok('settlement mismatch blocks panel snapshot');
    }
}

{
    const before = JSON.parse(JSON.stringify(vehicle));
    const panel = buildMobileBasePanelSnapshot(vehicle, settlement, {
        currentLocationId: 'outer_gate',
        resolveLocationName: (id) => (id === 'outer_gate' ? 'Outer Gate' : id),
        locationAccess: { allowedVehicleSizeMax: 'medium', parkingLocationId: 'gate_yard' },
        carriedVehicleNames: { scout_bike: 'Scout Bike' },
    });
    if (JSON.stringify(vehicle) !== JSON.stringify(before)) {
        fail('buildMobileBasePanelSnapshot mutated vehicle input');
    } else if (!panel || panel.settlementName !== 'The Ashcrawler') {
        fail('panel should include settlement name');
    } else if (!panel.atCurrentLocation || panel.dockLabel !== 'Outer Gate') {
        fail('dock/current location should resolve');
    } else if (panel.accessReasonCode !== 'vehicle_too_large' || panel.parkingFallbackId !== 'gate_yard') {
        fail(`access reason missing: ${JSON.stringify(panel)}`);
    } else if (panel.facilities.length < 2 || panel.stocks.length < 2) {
        fail('facilities and stocks should be included');
    } else if (!panel.problems.length || panel.fuelBand !== 'low') {
        fail(`problems/fuel band wrong: ${JSON.stringify({ problems: panel.problems, fuel: panel.fuelBand })}`);
    } else if (!panel.carriedVehicles.includes('Scout Bike')) {
        fail('carried vehicle names should resolve');
    } else {
        ok('mobile base panel snapshot summarizes linked vehicle+settlement');
    }
}

{
    const caravanVehicle = {
        ...vehicle,
        mobileBase: { settlementId: 'ashcrawler_home', mode: 'caravan', layoutProfile: 'caravan' },
    };
    const panel = buildMobileBasePanelSnapshot(caravanVehicle, settlement);
    if (!panel || typeof panel.communityCount !== 'number' || panel.communityCount < 3) {
        fail(`caravan community count expected: ${panel?.communityCount}`);
    } else {
        ok('caravan mode includes community count');
    }
}

{
    const manyStructures = Array.from({ length: 12 }, (_, i) => ({
        id: `s${i}`,
        name: `Room ${i}`,
        status: 'intact',
        layerId: 'z0',
    }));
    const bigSettlement = parseSettlementState({
        ...settlement,
        structures: manyStructures,
        stocks: Array.from({ length: 12 }, (_, i) => ({ id: `stock_${i}`, amount: i % 3 })),
    });
    const panel = buildMobileBasePanelSnapshot(vehicle, bigSettlement);
    if (!panel || panel.facilities.length !== MAX_PANEL_FACILITIES || panel.stocks.length !== MAX_PANEL_STOCKS) {
        fail(`panel caps wrong: facilities=${panel?.facilities.length} stocks=${panel?.stocks.length}`);
    } else {
        ok(`panel caps facilities at ${MAX_PANEL_FACILITIES} and stocks at ${MAX_PANEL_STOCKS}`);
    }
}

{
    const panel = buildMobileBasePanelSnapshot(vehicle, settlement, { currentLocationId: 'outer_gate' });
    const extra = Object.keys(pickMobileBasePanelSnapshotKeys(panel)).filter(
        (k) => !MOBILE_BASE_PANEL_SNAPSHOT_KEYS.includes(k)
    );
    if (extra.length) {
        fail(`unexpected panel keys: ${extra.join(',')}`);
    } else {
        ok('panel snapshot keys stay within allow-list');
    }
}

if (failed > 0) {
    console.error(`\n${failed} test(s) failed`);
    process.exit(1);
}
console.log('\nAll mobile base view core tests passed');