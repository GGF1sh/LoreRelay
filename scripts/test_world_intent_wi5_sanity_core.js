#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const sanityPath = path.join(root, 'out', 'worldIntentSanityCore.js');
const vehiclePath = path.join(root, 'out', 'vehicleCore.js');
const settlementPath = path.join(root, 'out', 'settlementCore.js');
const modPath = path.join(root, 'out', 'modSystemCore.js');

let failed = 0;
function fail(msg) { console.error(`FAIL: ${msg}`); failed++; }
function ok(msg) { console.log(`OK: ${msg}`); }

for (const p of [sanityPath, vehiclePath, settlementPath, modPath]) {
    if (!fs.existsSync(p)) {
        fail(`${p} missing — run npm run compile`);
        process.exit(1);
    }
}

const { buildWorldSanityReport } = require(sanityPath);
const { parseVehicleState, diagnoseVehicleStateRaw } = require(vehiclePath);
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

const settlementFixture = parseSettlementState({
    version: 1,
    settlementId: 'ashcrawler_home',
    name: 'The Ashcrawler',
    locationId: 'outer_gate',
    morale: 50,
    safety: 45,
    stocks: [{ id: 'food', amount: 1 }],
    structures: [{ id: 'bridge', name: 'Bridge', status: 'intact', layerId: 'z0' }],
    residents: [],
    visitors: [],
    merchants: [],
    incidents: [],
});

function vehicleWithMobileBase(settlementId = 'ashcrawler_home') {
    return parseVehicleState({
        version: 1,
        vehicles: [{
            ...baseVehicle,
            id: 'ashcrawler_hull',
            kind: 'mobile_base',
            mobileBase: {
                settlementId,
                mode: 'landship',
                layoutProfile: 'crawler',
            },
        }],
    });
}

{
    const report = buildWorldSanityReport({});
    if (!report.ok || report.issueCount !== 0 || report.errorCount !== 0) {
        fail('empty input should yield ok report with zero issues');
    } else {
        ok('empty input -> ok report with zero issues');
    }
}

{
    const state = parseVehicleState({
        version: 1,
        activeVehicleId: 'rust_wagon',
        vehicles: [baseVehicle],
    });
    const report = buildWorldSanityReport({ vehicleState: state });
    if (!report.ok || report.issueCount !== 0) {
        fail('valid vehicle fleet should be ok');
    } else {
        ok('valid vehicle fleet -> ok');
    }
}

{
    const state = parseVehicleState({
        version: 1,
        vehicles: [baseVehicle],
    });
    state.activeVehicleId = 'missing_vehicle';
    const report = buildWorldSanityReport({ vehicleState: state });
    const issue = report.issues.find((i) => i.code === 'active_vehicle_missing');
    if (!issue || issue.severity !== 'error') {
        fail('active vehicle missing should be error');
    } else {
        ok('active vehicle id missing -> error');
    }
}

{
    const state = parseVehicleState({
        version: 1,
        activeVehicleId: 'rust_wagon',
        vehicles: [{ ...baseVehicle, status: 'lost' }],
    });
    const report = buildWorldSanityReport({ vehicleState: state });
    const issue = report.issues.find((i) => i.code === 'active_vehicle_lost');
    if (!issue || issue.severity !== 'warning') {
        fail('active vehicle lost should be warning');
    } else {
        ok('active vehicle lost -> warning');
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
    const report = buildWorldSanityReport({ vehicleState: state });
    const issue = report.issues.find((i) => i.code === 'carrier_cycle');
    if (!issue || issue.severity !== 'error') {
        fail('carrier cycle should be error');
    } else {
        ok('carrier graph cycle -> error');
    }
}

{
    const state = parseVehicleState({
        version: 1,
        vehicles: [{
            ...baseVehicle,
            id: 'carrier',
            hangar: { bayCapacity: 2, maxCarriedSize: 'large', carriedVehicleIds: ['ghost_child'] },
        }],
    });
    const report = buildWorldSanityReport({ vehicleState: state });
    const issue = report.issues.find((i) => i.code === 'missing_carried_vehicle');
    if (!issue || issue.severity !== 'error') {
        fail('missing carried vehicle should be error');
    } else {
        ok('carried vehicle missing -> error');
    }
}

{
    const state = parseVehicleState({
        version: 1,
        vehicles: [
            {
                ...baseVehicle,
                id: 'carrier',
                hangar: { bayCapacity: 2, maxCarriedSize: 'small', carriedVehicleIds: ['huge_child'] },
            },
            {
                ...baseVehicle,
                id: 'huge_child',
                access: { sizeClass: 'huge', accessTags: ['road'] },
            },
        ],
    });
    const report = buildWorldSanityReport({ vehicleState: state });
    const issue = report.issues.find((i) => i.code === 'carrier_size_exceeded');
    if (!issue || issue.severity !== 'error') {
        fail('oversize carried vehicle should be error');
    } else {
        ok('carried vehicle exceeds carrier size -> error');
    }
}

{
    const report = buildWorldSanityReport({
        gameRules: {
            enableMobileBaseSystem: true,
            enableVehicleSystem: false,
            enableSettlementMode: true,
        },
    });
    const issue = report.issues.find((i) => i.code === 'mobile_base_feature_gate_mismatch');
    if (!issue || issue.severity !== 'warning') {
        fail('mobile base without vehicle flag should warn');
    } else {
        ok('mobile base enabled without vehicle/settlement flags -> warning');
    }
}

{
    const state = vehicleWithMobileBase('wrong_settlement');
    const report = buildWorldSanityReport({
        vehicleState: state,
        settlementState: settlementFixture,
    });
    const issue = report.issues.find((i) => i.code === 'settlement_id_mismatch');
    if (!issue || issue.severity !== 'error') {
        fail('mobile base settlement mismatch should be error when settlement supplied');
    } else {
        ok('mobile base link missing/mismatched settlement -> error when settlement supplied');
    }
}

{
    const child = parseModManifest(mod('child.mod', [], { dependencies: [{ modId: 'missing.parent' }] }));
    const profile = parseModProfile({
        name: 'Missing Dep',
        enabledMods: [{ modId: 'child.mod', enabled: true, priority: 0 }],
    });
    const report = buildWorldSanityReport({
        modProfile: profile,
        mods: { 'child.mod': child },
    });
    const issue = report.issues.find((i) => i.code === 'mod_missing_dependency');
    if (!issue || issue.severity !== 'error') {
        fail('mod missing dependency should be error');
    } else {
        ok('mod missing dependency -> error');
    }
}

{
    const base = parseModManifest(mod('base.mod', []));
    const child = parseModManifest(mod('child.mod', [], { dependencies: [{ modId: 'base.mod' }] }));
    const profile = parseModProfile({
        name: 'Disabled Dep',
        enabledMods: [
            { modId: 'child.mod', enabled: true, priority: 10 },
            { modId: 'base.mod', enabled: false, priority: 0 },
        ],
    });
    const report = buildWorldSanityReport({
        modProfile: profile,
        mods: { 'base.mod': base, 'child.mod': child },
    });
    const issue = report.issues.find((i) => i.code === 'mod_disabled_dependency');
    if (!issue || issue.severity !== 'warning') {
        fail('mod disabled dependency should be warning');
    } else {
        ok('mod disabled dependency -> warning');
    }
}

{
    const a = parseModManifest(mod('mod.a', [], { dependencies: [{ modId: 'mod.b' }] }));
    const b = parseModManifest(mod('mod.b', [], { dependencies: [{ modId: 'mod.a' }] }));
    const profile = parseModProfile({
        name: 'Cycle',
        enabledMods: [
            { modId: 'mod.a', enabled: true, priority: 0 },
            { modId: 'mod.b', enabled: true, priority: 10 },
        ],
    });
    const report = buildWorldSanityReport({
        modProfile: profile,
        mods: { 'mod.a': a, 'mod.b': b },
    });
    const issue = report.issues.find((i) => i.code === 'mod_dependency_cycle');
    if (!issue || issue.severity !== 'error') {
        fail('mod dependency cycle should be error');
    } else {
        ok('mod dependency cycle -> error');
    }
}

{
    const one = parseModManifest(mod('one.mod', [{ domain: 'scenario', id: 'a', data: {} }], {
        conflicts: [{ modId: 'two.mod' }],
    }));
    const two = parseModManifest(mod('two.mod', [{ domain: 'scenario', id: 'b', data: {} }]));
    const profile = parseModProfile({
        name: 'Conflict',
        enabledMods: [
            { modId: 'one.mod', enabled: true, priority: 0 },
            { modId: 'two.mod', enabled: true, priority: 10 },
        ],
    });
    const report = buildWorldSanityReport({
        modProfile: profile,
        mods: { 'one.mod': one, 'two.mod': two },
    });
    const issue = report.issues.find((i) => i.code === 'mod_declared_conflict');
    if (!issue || issue.severity !== 'warning') {
        fail('declared enabled conflict should be warning');
    } else {
        ok('declared enabled conflict -> warning');
    }
}

{
    const base = parseModManifest(mod('a.base', [{ domain: 'scenario', id: 'shared', data: { from: 'base' } }]));
    const patch = parseModManifest(mod('b.patch', [{ domain: 'scenario', id: 'shared', data: { from: 'patch' } }]));
    const profile = parseModProfile({
        name: 'Override',
        enabledMods: [
            { modId: 'a.base', enabled: true, priority: 0 },
            { modId: 'b.patch', enabled: true, priority: 10 },
        ],
    });
    const report = buildWorldSanityReport({
        modProfile: profile,
        mods: { 'a.base': base, 'b.patch': patch },
    });
    const issue = report.issues.find((i) => i.code === 'mod_record_override');
    if (!issue || issue.severity !== 'warning') {
        fail('duplicate mod record override should warn');
    } else if (!issue.message.includes('b.patch') || !issue.message.includes('a.base')) {
        fail('override issue should name winner and overridden mods');
    } else {
        ok('duplicate mod record id -> deterministic winner/overridden issue');
    }
}

{
    const manifest = parseModManifest(mod('alias.mod', [
        { domain: 'scenario', id: 'canonical', data: { ok: true } },
    ], {
        aliasRules: [{ domain: 'scenario', fromId: 'legacy', toId: 'missing_target' }],
    }));
    const profile = parseModProfile({
        name: 'Alias Missing',
        enabledMods: [{ modId: 'alias.mod', enabled: true, priority: 0 }],
    });
    const report = buildWorldSanityReport({
        modProfile: profile,
        mods: { 'alias.mod': manifest },
    });
    const issue = report.issues.find((i) => i.code === 'mod_alias_missing_target');
    if (!issue || issue.severity !== 'warning') {
        fail('alias missing target should be warning');
    } else {
        ok('alias rule missing target -> warning');
    }
}

{
    const manifest = parseModManifest(mod('cycle.mod', [
        { domain: 'scenario', id: 'a', data: {} },
        { domain: 'scenario', id: 'b', data: {} },
    ], {
        aliasRules: [
            { domain: 'scenario', fromId: 'a', toId: 'b' },
            { domain: 'scenario', fromId: 'b', toId: 'a' },
        ],
    }));
    const profile = parseModProfile({
        name: 'Alias Cycle',
        enabledMods: [{ modId: 'cycle.mod', enabled: true, priority: 0 }],
    });
    const report = buildWorldSanityReport({
        modProfile: profile,
        mods: { 'cycle.mod': manifest },
    });
    const issue = report.issues.find((i) => i.code === 'mod_alias_cycle');
    if (!issue || issue.severity !== 'error') {
        fail('alias cycle should be error');
    } else {
        ok('alias rule cycle -> error');
    }
}

{
    const report = buildWorldSanityReport({
        rawConfig: { vehicleBridgeMode: 'apply' },
    });
    const issue = report.issues.find((i) => i.code === 'invalid_bridge_mode');
    if (!issue || issue.severity !== 'warning') {
        fail('invalid bridge mode should be warning');
    } else {
        ok('invalid bridge mode raw config -> warning');
    }
}

{
    const mods = {};
    const enabledMods = [];
    for (let i = 0; i < 12; i++) {
        const id = `dep_mod_${i}`;
        mods[id] = parseModManifest(mod(id, [], { dependencies: [{ modId: `missing_${i}` }] }));
        enabledMods.push({ modId: id, enabled: true, priority: i });
    }
    const profile = parseModProfile({ name: 'ManyDeps', enabledMods });
    const report = buildWorldSanityReport({ modProfile: profile, mods }, { maxIssues: 5 });
    if (!report.truncated || report.issueCount !== 5) {
        fail('truncation should cap issues and set truncated:true');
    } else if (report.issues.length !== 5) {
        fail('truncated report should contain exactly maxIssues entries');
    } else if (report.issues[0].code !== 'mod_missing_dependency') {
        fail('truncated report should keep deterministic ordering');
    } else {
        ok('issue cap truncates deterministically and sets truncated:true');
    }
}

{
    const state = parseVehicleState({
        version: 1,
        activeVehicleId: 'rust_wagon',
        vehicles: [
            baseVehicle,
            { ...baseVehicle, id: 'scout_bike', status: 'lost', durability: { hp: 1, maxHp: 10, armorBand: 'light', condition: 'worn' } },
        ],
    });
    const input = {
        vehicleState: state,
        gameRules: { enableMobileBaseSystem: true, enableVehicleSystem: true, enableSettlementMode: false },
        rawConfig: { vehicleBridgeMode: 'shadow' },
    };
    const r1 = buildWorldSanityReport(input);
    const r2 = buildWorldSanityReport(input);
    const order1 = r1.issues.map((i) => `${i.domain}|${i.severity}|${i.code}|${i.entity?.id ?? ''}`).join('\n');
    const order2 = r2.issues.map((i) => `${i.domain}|${i.severity}|${i.code}|${i.entity?.id ?? ''}`).join('\n');
    if (order1 !== order2) {
        fail('report ordering should be deterministic');
    } else if (r1.issues[0]?.domain !== 'game_rules') {
        fail('game_rules domain should sort first');
    } else {
        ok('report ordering is deterministic');
    }
}

{
    const state = parseVehicleState({
        version: 1,
        vehicles: [{
            ...baseVehicle,
            id: 'ashcrawler_hull',
            kind: 'mobile_base',
            mobileBase: { settlementId: 'home_base', mode: 'landship' },
        }],
    });
    const report = buildWorldSanityReport({ vehicleState: state });
    const issue = report.issues.find((i) => i.code === 'settlement_ledger_not_supplied');
    if (!issue || issue.severity !== 'warning') {
        fail('mobile base without settlement ledger should warn');
    } else {
        ok('mobile base without settlement ledger -> warning');
    }
}

{
    const manifest = parseModManifest(mod('secret.mod', [
        { domain: 'scenario', id: 'hidden', data: { secretPayload: { nested: true, list: [1, 2, 3] } } },
    ]));
    const state = parseVehicleState({
        version: 1,
        vehicles: [{
            ...baseVehicle,
            notes: [{ text: 'raw note payload should not leak' }],
            modules: [{ id: 'mod1', slot: 'utility', name: 'Radar', tags: ['sensor'] }],
        }],
    });
    const report = buildWorldSanityReport({
        vehicleState: state,
        modProfile: parseModProfile({ name: 'Leak', enabledMods: [{ modId: 'secret.mod', enabled: true, priority: 0 }] }),
        mods: { 'secret.mod': manifest },
    });
    const serialized = JSON.stringify(report);
    if (serialized.includes('secretPayload') || serialized.includes('raw note payload')) {
        fail('report must not include raw manifest/vehicle JSON payloads');
    } else if (serialized.includes('"vehicles"') || serialized.includes('"records"')) {
        fail('report must not embed raw ledgers');
    } else {
        ok('output does not include raw manifest/vehicle JSON payloads');
    }
}

{
    const raw = {
        version: 1,
        vehicles: [
            { ...baseVehicle, resources: { powerType: 'fuel', current: 999, max: 10 } },
            { ...baseVehicle },
        ],
    };
    const rawIssues = diagnoseVehicleStateRaw(raw);
    const parsed = parseVehicleState(raw);
    const report = buildWorldSanityReport({
        vehicleState: parsed,
        vehicleRawParseIssues: rawIssues,
    });
    if (!rawIssues.some((i) => i.code === 'duplicate_vehicle_id')) {
        fail('diagnoseVehicleStateRaw should detect duplicate ids');
    } else if (!rawIssues.some((i) => i.code === 'resource_over_max')) {
        fail('diagnoseVehicleStateRaw should detect resource_over_max before normalization');
    } else if (!report.issues.some((i) => i.code === 'raw_resource_over_max')) {
        fail('sanity report should surface raw_resource_over_max');
    } else if (parsed.vehicles[0].resources.current !== 10) {
        fail('parseVehicleState should clamp over-max resource');
    } else {
        ok('raw parse diagnostics surface pre-normalization vehicle issues');
    }
}

if (failed > 0) {
    console.error(`\n${failed} test(s) failed.`);
    process.exit(1);
}
console.log('\nAll world_intent_wi5_sanity_core tests passed.');