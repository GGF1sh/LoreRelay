#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const root = path.join(__dirname, '..');
const vehicleCorePath = path.join(root, 'out', 'vehicleCore.js');
const vehicleStateSrcPath = path.join(root, 'src', 'vehicleState.ts');
const gameRulesCorePath = path.join(root, 'src', 'gameRulesCore.ts');
const gmCorePath = path.join(root, 'out', 'gmPromptBuilderCore.js');

let failed = 0;
function fail(msg) { console.error(`FAIL: ${msg}`); failed++; }
function ok(msg) { console.log(`OK: ${msg}`); }

for (const p of [vehicleCorePath, gmCorePath]) {
    if (!fs.existsSync(p)) {
        fail(`${p} missing - run npm run compile first`);
        process.exit(1);
    }
}

const {
    buildVehiclePromptBlock,
    vehicleModeEnabled,
    parseVehicleState,
} = require(vehicleCorePath);
const { shouldIncludePromptChunk } = require(gmCorePath);

const VEHICLE_STATE_FILENAME = 'vehicle_state.json';

/** Mirror readVehicleStateFromDisk contract without vscode-dependent loader import. */
function readVehicleFixtureFromDisk(filePath) {
    const raw = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    const parsed = parseVehicleState(raw);
    return parsed.vehicles.length ? parsed : undefined;
}

const fixtureVehicle = {
    id: 'rust_wagon',
    name: 'Rust Wagon',
    kind: 'truck',
    owner: { type: 'party' },
    status: 'parked',
    locationId: 'outer_gate',
    capacity: { crewRequired: 1, crewCapacity: 2, passengerCapacity: 4, cargoCapacity: 30, currentCargoLoad: 12 },
    access: { sizeClass: 'large', accessTags: ['road', 'offroad', 'wide_gate'], blockedBy: ['stairs'] },
    mobility: { speedBand: 'normal', rangeBand: 'regional', terrainTags: ['road'] },
    durability: { hp: 42, maxHp: 60, armorBand: 'medium', condition: 'worn' },
};

{
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lr-vehicle-state-'));
    const filePath = path.join(tmp, VEHICLE_STATE_FILENAME);
    fs.writeFileSync(filePath, JSON.stringify({
        version: 1,
        activeVehicleId: 'rust_wagon',
        vehicles: [fixtureVehicle],
    }), 'utf-8');
    const loaded = readVehicleFixtureFromDisk(filePath);
    if (!loaded || loaded.vehicles.length !== 1 || loaded.activeVehicleId !== 'rust_wagon') {
        fail('vehicle_state.json disk read contract should parse valid ledger');
    } else {
        ok('vehicle_state.json disk read contract parses valid ledger');
    }
    fs.writeFileSync(filePath, JSON.stringify({ version: 1, vehicles: [] }), 'utf-8');
    if (readVehicleFixtureFromDisk(filePath) !== undefined) {
        fail('empty vehicles array should not produce a loaded state');
    } else {
        ok('empty fleet returns undefined from disk read contract');
    }
    fs.rmSync(tmp, { recursive: true, force: true });
}

{
    if (vehicleModeEnabled({ enableVehicleSystem: true })) {
        ok('vehicleModeEnabled true when flag on');
    } else {
        fail('vehicleModeEnabled should be true when flag on');
    }
    if (!vehicleModeEnabled({ enableVehicleSystem: false }) && !vehicleModeEnabled(undefined)) {
        ok('vehicleModeEnabled false when flag off or missing');
    } else {
        fail('vehicleModeEnabled should be false when off');
    }
}

{
    const state = parseVehicleState({ version: 1, vehicles: [fixtureVehicle], activeVehicleId: 'rust_wagon' });
    const off = buildVehiclePromptBlock(state, false);
    const on = buildVehiclePromptBlock(state, true, { currentLocationId: 'outer_gate' });
    if (off !== '') {
        fail('buildVehiclePromptBlock should be empty when disabled');
    } else if (!on.includes('[Vehicles]') || !on.includes('Rust Wagon')) {
        fail('buildVehiclePromptBlock should summarize vehicles when enabled');
    } else if (!on.includes('turn_result.vehicleOps')) {
        fail('prompt block should document vehicleOps persist channel');
    } else {
        ok('buildVehiclePromptBlock gated by enabled flag');
    }
}

{
    const src = fs.readFileSync(gameRulesCorePath, 'utf-8');
    if (!/enableVehicleSystem:\s*false/.test(src)) {
        fail('DEFAULT_GAME_RULES should define enableVehicleSystem: false');
    } else {
        ok('gameRules default enableVehicleSystem is false');
    }
}

{
    const src = fs.readFileSync(vehicleStateSrcPath, 'utf-8');
    if (!src.includes("VEHICLE_STATE_FILENAME = 'vehicle_state.json'")) {
        fail('vehicleState.ts should define vehicle_state.json filename');
    } else if (!src.includes('buildVehiclePromptContext')) {
        fail('vehicleState.ts should export buildVehiclePromptContext');
    } else {
        ok('vehicleState.ts loader + prompt context exports present');
    }
}

{
    const gmSrc = fs.readFileSync(path.join(root, 'src', 'gmPromptBuilder.ts'), 'utf-8');
    if (!gmSrc.includes('buildVehiclePromptContext')) {
        fail('gmPromptBuilder should wire buildVehiclePromptContext');
    } else {
        ok('gmPromptBuilder wires vehicle prompt chunk');
    }
}

{
    const off = {
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
    };
    if (shouldIncludePromptChunk('vehicles', off)) {
        fail('vehicles chunk should be off by default');
    } else if (!shouldIncludePromptChunk('vehicles', { ...off, enableVehicleSystem: true })) {
        fail('vehicles chunk should activate when enableVehicleSystem is true');
    } else {
        ok('vehicles prompt chunk activation wired');
    }
}

if (failed > 0) {
    console.error(`\n${failed} test(s) failed`);
    process.exit(1);
}
console.log('\nAll vehicle state tests passed');