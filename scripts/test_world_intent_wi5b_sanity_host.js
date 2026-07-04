#!/usr/bin/env node
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const root = path.join(__dirname, '..');
const hostCorePath = path.join(root, 'out', 'worldIntentSanityHostCore.js');
const loaderPath = path.join(root, 'out', 'worldIntentSanityLoader.js');
const vehiclePath = path.join(root, 'out', 'vehicleCore.js');
const settlementPath = path.join(root, 'out', 'settlementCore.js');
const modPath = path.join(root, 'out', 'modSystemCore.js');

let failed = 0;
function fail(msg) { console.error(`FAIL: ${msg}`); failed++; }
function ok(msg) { console.log(`OK: ${msg}`); }

for (const p of [hostCorePath, loaderPath, vehiclePath, settlementPath, modPath]) {
    if (!fs.existsSync(p)) {
        fail(`${p} missing — run npm run compile`);
        process.exit(1);
    }
}

const {
    buildWorldSanityInputFromSnapshot,
    runWorkspaceSanityCheckFromSnapshot,
    formatWorldSanityReportLines,
    formatWorldSanitySourceSummary,
} = require(hostCorePath);
const { readWorkspaceSanitySnapshot } = require(loaderPath);
const { parseVehicleState } = require(vehiclePath);
const { parseSettlementState } = require(settlementPath);
const { parseModManifest, parseModProfile } = require(modPath);

const baseVehicle = {
    id: 'rust_wagon',
    name: 'Rust Wagon',
    kind: 'truck',
    owner: { type: 'party' },
    status: 'parked',
    locationId: 'outer_gate',
    capacity: { crewRequired: 1, crewCapacity: 2, passengerCapacity: 4, cargoCapacity: 30 },
    access: { sizeClass: 'large', accessTags: ['road'] },
    mobility: { speedBand: 'normal', rangeBand: 'regional', terrainTags: ['road'] },
    durability: { hp: 42, maxHp: 60, armorBand: 'medium', condition: 'worn' },
    resources: { powerType: 'fuel', current: 3, max: 20 },
};

function mod(id, records, extra = {}) {
    return {
        manifestVersion: 1,
        id,
        name: id,
        version: '1.0.0',
        provides: records,
        ...extra,
    };
}

{
    const input = buildWorldSanityInputFromSnapshot({});
    if (Object.keys(input).length !== 0) {
        fail('empty snapshot should yield empty input');
    } else {
        ok('empty snapshot maps to empty input');
    }
}

{
    const vehicleState = parseVehicleState({ version: 1, vehicles: [baseVehicle] });
    const settlementState = parseSettlementState({
        version: 1,
        settlementId: 'home',
        name: 'Home',
        locationId: 'gate',
        morale: 50,
        safety: 50,
        stocks: [],
        structures: [],
        residents: [],
        visitors: [],
        merchants: [],
        incidents: [],
    });
    const manifest = parseModManifest(mod('child.mod', [], { dependencies: [{ modId: 'missing.parent' }] }));
    const profile = parseModProfile({
        name: 'Test',
        enabledMods: [{ modId: 'child.mod', enabled: true, priority: 0 }],
    });
    const snapshot = {
        vehicleState,
        settlementState,
        gameRules: {
            enableVehicleSystem: true,
            enableSettlementMode: true,
            enableMobileBaseSystem: false,
        },
        modProfile: profile,
        mods: { 'child.mod': manifest },
        rawConfig: { vehicleBridgeMode: 'apply' },
        sources: {
            vehicleState: true,
            settlementState: true,
            gameRules: true,
            modProfile: true,
            modManifestCount: 1,
            vehicleBridgeMode: true,
        },
    };
    const input = buildWorldSanityInputFromSnapshot(snapshot);
    if (!input.vehicleState || !input.settlementState || !input.modProfile || !input.rawConfig) {
        fail('snapshot fields should map into WorldSanityInput');
    } else {
        ok('snapshot maps vehicle/settlement/mod/config into input');
    }

    const report = runWorkspaceSanityCheckFromSnapshot(snapshot);
    if (report.ok) {
        fail('missing dependency and invalid bridge should produce errors/warnings');
    } else if (!report.issues.some((i) => i.code === 'mod_missing_dependency')) {
        fail('host snapshot path should surface mod missing dependency');
    } else if (!report.issues.some((i) => i.code === 'invalid_bridge_mode')) {
        fail('host snapshot path should surface invalid bridge mode');
    } else {
        ok('runWorkspaceSanityCheckFromSnapshot delegates to WI5 core');
    }
}

{
    const snapshot = {
        vehicleState: parseVehicleState({ version: 1, vehicles: [baseVehicle] }),
        sources: { vehicleState: true },
    };
    const report = runWorkspaceSanityCheckFromSnapshot(snapshot);
    const lines = formatWorldSanityReportLines(report, snapshot.sources);
    const joined = lines.join('\n');
    if (!joined.includes('[WI5b]') || !joined.includes('sources=vehicle')) {
        fail('formatted lines should include WI5b header and source summary');
    } else if (joined.includes('"vehicles"') || joined.includes('secretPayload')) {
        fail('formatted output must not include raw JSON payloads');
    } else if (lines[0].length > 500) {
        fail('summary line should stay bounded');
    } else {
        ok('formatWorldSanityReportLines is bounded and payload-free');
    }
}

{
    const summary = formatWorldSanitySourceSummary({
        vehicleState: true,
        modManifestCount: 2,
        vehicleBridgeMode: true,
    });
    if (!summary.includes('vehicle') || !summary.includes('mods=2') || !summary.includes('bridge_mode')) {
        fail(`unexpected source summary: ${summary}`);
    } else {
        ok('formatWorldSanitySourceSummary lists loaded sources');
    }
}

{
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lr-wi5b-ws-'));
    const vehicleState = parseVehicleState({
        version: 1,
        activeVehicleId: 'rust_wagon',
        vehicles: [baseVehicle],
    });
    fs.writeFileSync(path.join(dir, 'vehicle_state.json'), JSON.stringify(vehicleState, null, 2), 'utf-8');
    fs.writeFileSync(path.join(dir, 'game_rules.json'), JSON.stringify({
        enableVehicleSystem: true,
        enableSettlementMode: false,
        enableMobileBaseSystem: true,
    }, null, 2), 'utf-8');

    const modDir = path.join(dir, '.lorerelay', 'mods', 'child.mod');
    fs.mkdirSync(modDir, { recursive: true });
    fs.writeFileSync(path.join(modDir, 'lorerelay_mod.json'), JSON.stringify(
        mod('child.mod', [], { dependencies: [{ modId: 'missing.parent' }] }),
        null,
        2
    ), 'utf-8');
    fs.mkdirSync(path.join(dir, '.lorerelay'), { recursive: true });
    fs.writeFileSync(path.join(dir, '.lorerelay', 'mod_profile.json'), JSON.stringify({
        profileVersion: 1,
        name: 'Workspace Profile',
        enabledMods: [{ modId: 'child.mod', enabled: true, priority: 0 }],
    }, null, 2), 'utf-8');

    const snapshot = readWorkspaceSanitySnapshot(dir);
    if (!snapshot.sources?.vehicleState || !snapshot.sources?.gameRules || !snapshot.sources?.modProfile) {
        fail('readWorkspaceSanitySnapshot should load vehicle, rules, and mod profile');
    } else if (!snapshot.mods?.['child.mod']) {
        fail('readWorkspaceSanitySnapshot should parse mod manifest from .lorerelay/mods');
    } else {
        ok('readWorkspaceSanitySnapshot loads workspace ledgers read-only');
    }

    const report = runWorkspaceSanityCheckFromSnapshot(snapshot);
    if (!report.issues.some((i) => i.code === 'mobile_base_feature_gate_mismatch')) {
        fail('loaded game rules should feed game_rules checks');
    } else if (!report.issues.some((i) => i.code === 'mod_missing_dependency')) {
        fail('loaded mod profile should feed mod checks');
    } else {
        ok('workspace disk snapshot produces expected WI5 issues');
    }
}

{
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lr-wi5b-mods-'));
    const enabledDir = path.join(dir, '.lorerelay', 'mods', 'enabled.mod');
    const disabledDir = path.join(dir, '.lorerelay', 'mods', 'disabled.mod');
    fs.mkdirSync(enabledDir, { recursive: true });
    fs.mkdirSync(disabledDir, { recursive: true });
    fs.writeFileSync(path.join(enabledDir, 'lorerelay_mod.json'), JSON.stringify(
        mod('enabled.mod', [{ domain: 'scenario', id: 'on', data: {} }]),
        null,
        2
    ), 'utf-8');
    fs.writeFileSync(path.join(disabledDir, 'lorerelay_mod.json'), JSON.stringify(
        mod('disabled.mod', [{ domain: 'scenario', id: 'off', data: {} }], {
            conflicts: [{ modId: 'enabled.mod' }],
        }),
        null,
        2
    ), 'utf-8');
    fs.writeFileSync(path.join(dir, '.lorerelay', 'mod_profile.json'), JSON.stringify({
        profileVersion: 1,
        name: 'Disabled Mod Excluded',
        enabledMods: [
            { modId: 'enabled.mod', enabled: true, priority: 0 },
            { modId: 'disabled.mod', enabled: false, priority: 10 },
        ],
    }, null, 2), 'utf-8');

    const snapshot = readWorkspaceSanitySnapshot(dir);
    if (!snapshot.mods || snapshot.mods['disabled.mod']) {
        fail('disabled or unscanned mods should not be included in snapshot mods');
    } else if (!snapshot.mods['enabled.mod']) {
        fail('enabled mod manifest should still load');
    } else if (snapshot.sources?.modManifestCount !== 1) {
        fail(`expected modManifestCount=1, got ${snapshot.sources?.modManifestCount}`);
    } else {
        ok('loader includes only enabled profile mods');
    }
}

{
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wi5b-parse-'));
    fs.writeFileSync(path.join(dir, 'vehicle_state.json'), '{ not json', 'utf-8');
    const snapshot = readWorkspaceSanitySnapshot(dir);
    if (!snapshot.ledgerLoadIssues?.some((i) => i.file === 'vehicle_state.json')) {
        fail('malformed vehicle_state.json should record ledgerLoadIssues');
    } else if (!snapshot.sources?.ledgerParseErrors?.includes('vehicle_state.json')) {
        fail('sources should list ledger parse error files');
    } else {
        ok('loader surfaces malformed vehicle_state.json parse error');
    }
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
}

{
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wi5b-settle-'));
    fs.writeFileSync(path.join(dir, 'settlement_state.json'), JSON.stringify({ version: 1 }), 'utf-8');
    const snapshot = readWorkspaceSanitySnapshot(dir);
    if (!snapshot.ledgerLoadIssues?.some((i) => i.code === 'structural_validation_failed')) {
        fail('invalid settlement_state.json should record structural_validation_failed');
    } else {
        ok('loader surfaces invalid settlement_state.json structure');
    }
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
}

if (failed > 0) {
    console.error(`\n${failed} test(s) failed.`);
    process.exit(1);
}
console.log('\nAll world_intent_wi5b_sanity_host tests passed.');