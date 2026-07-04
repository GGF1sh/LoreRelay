#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const mbPath = path.join(root, 'out', 'mobileBaseCore.js');
const vehiclePath = path.join(root, 'out', 'vehicleCore.js');
const settlementPath = path.join(root, 'out', 'settlementCore.js');

let failed = 0;
function fail(msg) { console.error(`FAIL: ${msg}`); failed++; }
function ok(msg) { console.log(`OK: ${msg}`); }

for (const p of [mbPath, vehiclePath, settlementPath]) {
    if (!fs.existsSync(p)) {
        fail(`${p} missing - run npm run compile first`);
        process.exit(1);
    }
}

const {
    parseMobileBaseLink,
    validateMobileBaseLink,
    buildMobileBasePromptLines,
    MAX_MOBILE_BASE_PROMPT_LINES,
    MAX_MOBILE_BASE_PROMPT_CHARS,
} = require(mbPath);
const { parseVehicleState } = require(vehiclePath);
const { parseSettlementState } = require(settlementPath);

const settlementFixture = parseSettlementState({
    version: 1,
    settlementId: 'ashcrawler_home',
    name: 'The Ashcrawler',
    locationId: 'outer_gate',
    morale: 50,
    safety: 45,
    stocks: [{ id: 'food', amount: 1 }, { id: 'parts', amount: 6 }],
    structures: [
        { id: 'bridge', name: 'Bridge', status: 'intact', layerId: 'z0' },
        { id: 'engine', name: 'Engine Room', status: 'damaged', layerId: 'z0' },
        { id: 'cargo', name: 'Cargo Hold', status: 'intact', layerId: 'z0' },
        { id: 'quarters', name: 'Quarters', status: 'intact', layerId: 'z0' },
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

const vehicleFixture = parseVehicleState({
    version: 1,
    vehicles: [{
        id: 'ashcrawler_hull',
        name: 'Ashcrawler Hull',
        kind: 'mobile_base',
        owner: { type: 'party' },
        status: 'parked',
        locationId: 'outer_gate',
        capacity: { crewRequired: 2, crewCapacity: 8, passengerCapacity: 4, cargoCapacity: 40, currentCargoLoad: 10 },
        access: {
            sizeClass: 'huge',
            accessTags: ['road', 'wide_gate', 'open_field'],
            blockedBy: ['narrow_tunnel', 'stairs', 'sacred_no_vehicle'],
        },
        mobility: { speedBand: 'slow', rangeBand: 'regional', terrainTags: ['road', 'wilderness'] },
        durability: { hp: 64, maxHp: 90, armorBand: 'heavy', condition: 'worn' },
        combat: { combatPower: 40, defensePower: 55, threatBand: 'heavy' },
        resources: { powerType: 'fuel', current: 2, max: 30 },
        hangar: { bayCapacity: 4, usedBays: 2, maxCarriedSize: 'medium', carriedVehicleIds: ['scout_bike', 'utility_golem'] },
        mobileBase: {
            settlementId: 'ashcrawler_home',
            mode: 'landship',
            layoutProfile: 'crawler',
            dockedAtLocationId: 'outer_gate',
            interiorAccess: 'open',
        },
    }],
}).vehicles[0];

if (!settlementFixture || !vehicleFixture) {
    fail('fixtures should parse');
    process.exit(1);
}

{
    if (parseMobileBaseLink(null) !== undefined) {
        fail('missing link should return undefined');
    } else {
        ok('missing link returns undefined');
    }
}

{
    const link = parseMobileBaseLink({ settlementId: 'x', mode: 'NOT_A_MODE', layoutProfile: 'bad' });
    if (!link || link.mode !== 'other' || link.layoutProfile !== 'compact') {
        fail('invalid mode/layout should normalize safely');
    } else {
        ok('invalid mode/layout profile normalizes safely');
    }
}

{
    const plain = parseVehicleState({
        version: 1,
        vehicles: [{ ...vehicleFixture, mobileBase: undefined }],
    }).vehicles[0];
    const result = validateMobileBaseLink(plain, settlementFixture);
    if (!result.ok || result.isMobileBase) {
        fail('vehicle without mobileBase should validate as not mobile base');
    } else {
        ok('vehicle without mobileBase is not a mobile base');
    }
}

{
    const result = validateMobileBaseLink(vehicleFixture, undefined);
    if (result.ok || !result.reasons.includes('missing_settlement_ledger')) {
        fail('missing settlement should fail');
    } else {
        ok('missing settlement fails with reason');
    }
}

{
    const badSettlement = { ...settlementFixture, settlementId: 'other_id' };
    const result = validateMobileBaseLink(vehicleFixture, badSettlement);
    if (result.ok || !result.reasons.some((r) => r.startsWith('settlement_id_mismatch'))) {
        fail('mismatched settlementId should fail');
    } else {
        ok('mismatched settlementId fails');
    }
}

{
    const result = validateMobileBaseLink(vehicleFixture, settlementFixture);
    if (!result.ok || !result.isMobileBase) {
        fail('valid vehicle + settlement should succeed');
    } else {
        ok('valid vehicle + settlement link succeeds');
    }
}

{
    const caravanVehicle = parseVehicleState({
        version: 1,
        vehicles: [{
            ...vehicleFixture,
            mobileBase: { settlementId: 'ashcrawler_home', mode: 'mobile_community', layoutProfile: 'caravan' },
        }],
    }).vehicles[0];
    const result = validateMobileBaseLink(caravanVehicle, settlementFixture);
    if (!result.warnings?.some((w) => w.includes('social moving base'))) {
        fail('caravan/mobile_community should warn it is social, not one giant vehicle');
    } else {
        ok('caravan/mobile community mode handled as social moving base');
    }
}

{
    const lines = buildMobileBasePromptLines(vehicleFixture, settlementFixture, {
        locationAccess: { allowedVehicleSizeMax: 'medium', parkingLocationId: 'outer_gate' },
        carriedVehicleNames: { scout_bike: 'Scout Bike', utility_golem: 'Utility Golem' },
    });
    const joined = lines.join('\n');
    if (!joined.includes('[Mobile Base]') || !joined.includes('landship')) {
        fail('prompt should include base name and mode');
    } else if (!joined.includes('cannot enter') || !joined.includes('outer_gate')) {
        fail('prompt should include access/docking warning');
    } else if (!joined.includes('Scout Bike') || !joined.includes('Utility Golem')) {
        fail('prompt should summarize hangar carried vehicles');
    } else if (!joined.includes('Engine Room') || joined.includes('z0') || joined.includes('tile')) {
        fail('prompt should list capped facilities without raw layout');
    } else if (lines.length > MAX_MOBILE_BASE_PROMPT_LINES) {
        fail('prompt lines should be capped');
    } else if (lines.some((l) => l.length > MAX_MOBILE_BASE_PROMPT_CHARS + 1)) {
        fail('prompt line length should be bounded');
    } else {
        ok('buildMobileBasePromptLines summarizes mobile base safely');
    }
}

{
    const beforeVehicle = JSON.stringify(vehicleFixture);
    const beforeSettlement = JSON.stringify(settlementFixture);
    buildMobileBasePromptLines(vehicleFixture, settlementFixture);
    if (JSON.stringify(vehicleFixture) !== beforeVehicle || JSON.stringify(settlementFixture) !== beforeSettlement) {
        fail('buildMobileBasePromptLines mutated inputs');
    } else {
        ok('input objects are not mutated');
    }
}

if (failed > 0) {
    console.error(`\n${failed} test(s) failed`);
    process.exit(1);
}
console.log('\nAll mobile base core tests passed');