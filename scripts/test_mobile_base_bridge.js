#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const corePath = path.join(root, 'out', 'mobileBaseCore.js');
const bridgeSrcPath = path.join(root, 'src', 'mobileBaseBridge.ts');
const gameRulesPath = path.join(root, 'src', 'gameRules.ts');
const gmCorePath = path.join(root, 'out', 'gmPromptBuilderCore.js');
const vehicleCorePath = path.join(root, 'out', 'vehicleCore.js');
const settlementCorePath = path.join(root, 'out', 'settlementCore.js');

let failed = 0;
function fail(msg) { console.error(`FAIL: ${msg}`); failed++; }
function ok(msg) { console.log(`OK: ${msg}`); }

for (const p of [corePath, gmCorePath, vehicleCorePath, settlementCorePath]) {
    if (!fs.existsSync(p)) {
        fail(`${p} missing - run npm run compile first`);
        process.exit(1);
    }
}

const {
    mobileBaseSystemEnabled,
    resolveActiveMobileBaseVehicle,
    buildCarriedVehicleNameMap,
    buildMobileBasePromptBlock,
    validateMobileBaseLink,
} = require(corePath);
const { parseVehicleState } = require(vehicleCorePath);
const { parseSettlementState } = require(settlementCorePath);
const { shouldIncludePromptChunk } = require(gmCorePath);

const settlementFixture = parseSettlementState({
    version: 1,
    settlementId: 'ashcrawler_home',
    name: 'The Ashcrawler',
    locationId: 'outer_gate',
    morale: 50,
    safety: 45,
    stocks: [{ id: 'food', amount: 1 }],
    structures: [{ id: 'bridge', name: 'Bridge', status: 'intact', layerId: 'z0' }],
    residents: [{ npcId: 'crew_1' }],
    visitors: [],
    merchants: [],
    incidents: [],
});

const vehicleStateFixture = parseVehicleState({
    version: 1,
    activeVehicleId: 'scout_bike',
    vehicles: [
        {
            id: 'scout_bike',
            name: 'Scout Bike',
            kind: 'bike',
            owner: { type: 'party' },
            status: 'deployed',
            capacity: { crewRequired: 0, crewCapacity: 1, passengerCapacity: 0, cargoCapacity: 5 },
            access: { sizeClass: 'small', accessTags: ['road'] },
            mobility: { speedBand: 'fast', rangeBand: 'local', terrainTags: ['road'] },
            durability: { hp: 10, maxHp: 10, armorBand: 'none', condition: 'worn' },
        },
        {
            id: 'ashcrawler_hull',
            name: 'Ashcrawler Hull',
            kind: 'mobile_base',
            owner: { type: 'party' },
            status: 'parked',
            locationId: 'outer_gate',
            capacity: { crewRequired: 2, crewCapacity: 8, passengerCapacity: 4, cargoCapacity: 40 },
            access: { sizeClass: 'huge', accessTags: ['road', 'wide_gate'], blockedBy: ['narrow_tunnel'] },
            mobility: { speedBand: 'slow', rangeBand: 'regional', terrainTags: ['road'] },
            durability: { hp: 64, maxHp: 90, armorBand: 'heavy', condition: 'worn' },
            resources: { powerType: 'fuel', current: 2, max: 30 },
            mobileBase: {
                settlementId: 'ashcrawler_home',
                mode: 'landship',
                layoutProfile: 'crawler',
                dockedAtLocationId: 'outer_gate',
            },
        },
    ],
});

if (!settlementFixture || !vehicleStateFixture) {
    fail('fixtures should parse');
    process.exit(1);
}

{
    if (mobileBaseSystemEnabled({
        enableVehicleSystem: true,
        enableSettlementMode: true,
        enableMobileBaseSystem: true,
    })) {
        ok('mobileBaseSystemEnabled true when all three flags on');
    } else {
        fail('mobileBaseSystemEnabled should be true with all flags');
    }
    if (mobileBaseSystemEnabled({ enableMobileBaseSystem: true, enableVehicleSystem: true, enableSettlementMode: false })) {
        fail('mobileBaseSystemEnabled should require settlement mode');
    } else if (mobileBaseSystemEnabled({ enableMobileBaseSystem: true, enableVehicleSystem: false, enableSettlementMode: true })) {
        fail('mobileBaseSystemEnabled should require vehicle system');
    } else if (mobileBaseSystemEnabled(undefined)) {
        fail('mobileBaseSystemEnabled should be false when rules missing');
    } else {
        ok('mobileBaseSystemEnabled requires vehicle + settlement + mobile base flags');
    }
}

{
    const src = fs.readFileSync(gameRulesPath, 'utf-8');
    if (!/enableMobileBaseSystem:\s*false/.test(src)) {
        fail('DEFAULT_GAME_RULES should define enableMobileBaseSystem: false');
    } else {
        ok('gameRules default enableMobileBaseSystem is false');
    }
}

{
    const resolved = resolveActiveMobileBaseVehicle(vehicleStateFixture);
    if (!resolved || resolved.id !== 'ashcrawler_hull') {
        fail('resolveActiveMobileBaseVehicle should prefer linked vehicle over unrelated activeVehicleId');
    } else {
        ok('resolveActiveMobileBaseVehicle finds linked mobile base');
    }
}

{
    const onlyActive = parseVehicleState({
        version: 1,
        activeVehicleId: 'ashcrawler_hull',
        vehicles: vehicleStateFixture.vehicles,
    });
    const resolved = resolveActiveMobileBaseVehicle(onlyActive);
    if (!resolved || resolved.id !== 'ashcrawler_hull') {
        fail('resolveActiveMobileBaseVehicle should use active vehicle when it has mobileBase');
    } else {
        ok('resolveActiveMobileBaseVehicle honors active linked vehicle');
    }
}

{
    const names = buildCarriedVehicleNameMap(vehicleStateFixture);
    if (names.scout_bike !== 'Scout Bike' || names.ashcrawler_hull !== 'Ashcrawler Hull') {
        fail('buildCarriedVehicleNameMap should map ids to names');
    } else {
        ok('buildCarriedVehicleNameMap builds fleet name map');
    }
}

{
    const vehicle = vehicleStateFixture.vehicles.find((v) => v.id === 'ashcrawler_hull');
    const off = buildMobileBasePromptBlock(vehicle, settlementFixture, false);
    const on = buildMobileBasePromptBlock(vehicle, settlementFixture, true, {
        carriedVehicleNames: buildCarriedVehicleNameMap(vehicleStateFixture),
    });
    if (off !== '') {
        fail('buildMobileBasePromptBlock should be empty when disabled');
    } else if (!on.includes('[Mobile Base]') || !on.includes('landship')) {
        fail('buildMobileBasePromptBlock should summarize linked mobile base');
    } else if (!on.includes('mobileBaseOps')) {
        fail('prompt block should note mobileBaseOps not wired');
    } else {
        ok('buildMobileBasePromptBlock gated and summarizes mobile base');
    }
}

{
    const vehicle = vehicleStateFixture.vehicles.find((v) => v.id === 'ashcrawler_hull');
    const badSettlement = { ...settlementFixture, settlementId: 'other_home' };
    const block = buildMobileBasePromptBlock(vehicle, badSettlement, true);
    if (block !== '') {
        fail('mismatched settlement should not produce prompt block');
    } else {
        ok('invalid link produces empty prompt block');
    }
}

{
    const bridgeSrc = fs.readFileSync(bridgeSrcPath, 'utf-8');
    const gmSrc = fs.readFileSync(path.join(root, 'src', 'gmPromptBuilder.ts'), 'utf-8');
    if (!bridgeSrc.includes('buildMobileBasePromptContext')) {
        fail('mobileBaseBridge.ts should export buildMobileBasePromptContext');
    } else if (!gmSrc.includes('buildMobileBasePromptContext')) {
        fail('gmPromptBuilder should wire mobile base prompt chunk');
    } else {
        ok('mobileBaseBridge + gmPromptBuilder wiring present');
    }
}

{
    const baseOff = {
        enableCampaignKit: false,
        hasCampaignKitFile: false,
        enableDomainMode: false,
        enableGuildMode: false,
        enableEmergentSimulation: false,
        enableWorldObservatory: false,
        chronicleRecapInPrompt: false,
        enableCommerce: false,
        enableNpcRegistry: false,
        enableNpcRelationships: false,
        livingWorldEnabled: false,
        worldStateEnabled: false,
        worldForgeEnabled: false,
        enableTravelEncounters: false,
        enableSettlementMode: false,
        enableVehicleSystem: false,
        enableMobileBaseSystem: false,
    };
    if (shouldIncludePromptChunk('mobileBase', baseOff)) {
        fail('mobileBase chunk should be off by default');
    } else if (!shouldIncludePromptChunk('mobileBase', {
        ...baseOff,
        enableMobileBaseSystem: true,
        enableVehicleSystem: true,
        enableSettlementMode: true,
    })) {
        fail('mobileBase chunk should activate when all three flags on');
    } else if (shouldIncludePromptChunk('mobileBase', {
        ...baseOff,
        enableMobileBaseSystem: true,
        enableVehicleSystem: true,
        enableSettlementMode: false,
    })) {
        fail('mobileBase chunk should require settlement mode');
    } else {
        ok('mobileBase prompt chunk activation wired');
    }
}

if (failed > 0) {
    console.error(`\n${failed} test(s) failed`);
    process.exit(1);
}
console.log('\nAll mobile base bridge tests passed');