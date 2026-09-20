#!/usr/bin/env node
'use strict';

/**
 * Mobile Base interior Webview payload — party-scope disclosure only (Gemini test gap).
 */

const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const interiorCorePath = path.join(root, 'out', 'mobileBaseInteriorCore.js');
const mbCorePath = path.join(root, 'out', 'mobileBaseCore.js');
const vehicleCorePath = path.join(root, 'out', 'vehicleCore.js');
const settlementCorePath = path.join(root, 'out', 'settlementCore.js');

let failed = 0;
function fail(msg) { console.error(`FAIL: ${msg}`); failed++; }
function ok(msg) { console.log(`OK: ${msg}`); }

for (const p of [interiorCorePath, mbCorePath, vehicleCorePath, settlementCorePath]) {
    if (!fs.existsSync(p)) {
        fail(`${p} missing — run npm run compile`);
        process.exit(1);
    }
}

const { buildMobileBaseInteriorPayload } = require(interiorCorePath);
const { resolveActiveMobileBaseVehicle } = require(mbCorePath);
const { parseVehicleState } = require(vehicleCorePath);
const { parseSettlementState } = require(settlementCorePath);

const TRIPLE_RULES = {
    enableVehicleSystem: true,
    enableSettlementMode: true,
    enableMobileBaseSystem: true,
    enableSettlementDiorama: false,
};

const partySettlement = parseSettlementState({
    version: 1,
    settlementId: 'party_base',
    name: 'Party Crawler',
    locationId: 'hub',
    stocks: [{ id: 'food', amount: 3 }],
    structures: [{ id: 'bridge', name: 'Bridge', status: 'intact', layerId: 'z0' }],
    residents: [{ npcId: 'crew_1' }],
    visitors: [],
    merchants: [],
    incidents: [],
});

const rivalSettlement = parseSettlementState({
    version: 1,
    settlementId: 'rival_base',
    name: 'Rival Dreadnought',
    locationId: 'enemy_port',
    stocks: [{ id: 'ammo', amount: 99 }],
    structures: [{ id: 'war_room', name: 'War Room', status: 'intact', layerId: 'z0' }],
    residents: [{ npcId: 'rival_lord' }],
    visitors: [],
    merchants: [],
    incidents: [],
});

function makeMobileBaseVehicle(id, name, settlementId, locationId) {
    return {
        id,
        name,
        kind: 'mobile_base',
        owner: { type: 'faction' },
        status: 'parked',
        locationId,
        capacity: { crewRequired: 2, crewCapacity: 8, passengerCapacity: 4, cargoCapacity: 40 },
        access: { sizeClass: 'huge', accessTags: ['road'] },
        mobility: { speedBand: 'slow', rangeBand: 'regional', terrainTags: ['road'] },
        durability: { hp: 80, maxHp: 90, armorBand: 'heavy', condition: 'worn' },
        mobileBase: {
            settlementId,
            mode: 'landship',
            layoutProfile: 'crawler',
            interiorAccess: 'open',
        },
    };
}

{
    const state = parseVehicleState({
        version: 1,
        activeVehicleId: 'party_hull',
        vehicles: [
            makeMobileBaseVehicle('party_hull', 'Party Hull', 'party_base', 'hub'),
            makeMobileBaseVehicle('rival_hull', 'Rival Hull', 'rival_base', 'enemy_port'),
        ],
    });
    const resolved = resolveActiveMobileBaseVehicle(state);
    if (!resolved || resolved.id !== 'party_hull') {
        fail(`active mobile base should win: ${resolved?.id}`);
    } else {
        ok('resolveActiveMobileBaseVehicle prefers active party mobile base');
    }
}

{
    const state = parseVehicleState({
        version: 1,
        activeVehicleId: 'scout_bike',
        vehicles: [
            {
                id: 'scout_bike',
                name: 'Scout',
                kind: 'bike',
                owner: { type: 'party' },
                status: 'available',
                locationId: 'hub',
                capacity: { crewRequired: 1, crewCapacity: 1, passengerCapacity: 1, cargoCapacity: 5 },
                access: { sizeClass: 'small', accessTags: ['road'] },
                mobility: { speedBand: 'fast', rangeBand: 'local', terrainTags: ['road'] },
                durability: { hp: 10, maxHp: 10, armorBand: 'none', condition: 'worn' },
            },
            makeMobileBaseVehicle('party_hull', 'Party Hull', 'party_base', 'hub'),
        ],
    });
    const resolved = resolveActiveMobileBaseVehicle(state);
    if (!resolved || resolved.id !== 'party_hull') {
        fail(`fallback mobile base should be party hull: ${resolved?.id}`);
    } else {
        ok('resolveActiveMobileBaseVehicle falls back to fleet mobile base when active is not MB');
    }
}

{
    const partyVehicle = makeMobileBaseVehicle('party_hull', 'Party Hull', 'party_base', 'hub');
    const payload = buildMobileBaseInteriorPayload(
        partyVehicle,
        partySettlement,
        undefined,
        TRIPLE_RULES
    );
    if (!payload || payload.settlementId !== 'party_base') {
        fail('party interior payload should build for validated link');
    } else if (!payload.settlementView) {
        fail('party interior should include sanitized settlementView');
    } else if (JSON.stringify(payload.settlementView).includes('rival_lord')) {
        fail('party interior must not leak rival NPC ids');
    } else {
        ok('party interior payload is scoped to linked settlement');
    }
}

{
    const rivalVehicle = makeMobileBaseVehicle('rival_hull', 'Rival Hull', 'rival_base', 'enemy_port');
    const mismatched = buildMobileBaseInteriorPayload(
        rivalVehicle,
        partySettlement,
        undefined,
        TRIPLE_RULES
    );
    if (mismatched !== undefined) {
        fail('rival vehicle with party settlement must not produce interior payload');
    } else {
        ok('settlement id mismatch blocks interior payload');
    }
}

{
    const rivalVehicle = makeMobileBaseVehicle('rival_hull', 'Rival Hull', 'rival_base', 'enemy_port');
    const rivalPayload = buildMobileBaseInteriorPayload(
        rivalVehicle,
        rivalSettlement,
        undefined,
        TRIPLE_RULES
    );
    if (!rivalPayload) {
        fail('rival fixture should build when settlement matches');
    } else if (JSON.stringify(rivalPayload).includes('crew_1')) {
        fail('rival payload must not include party crew ids');
    } else {
        ok('rival interior fixture stays separate from party settlement data');
    }
}

if (failed > 0) {
    console.error(`\n${failed} test(s) failed`);
    process.exit(1);
}
console.log('\nmobile base interior disclosure: all tests passed');