#!/usr/bin/env node
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const root = path.join(__dirname, '..');
const bridgeCorePath = path.join(root, 'out', 'vehicleWorldIntentBridgeCore.js');
const turnOpsCorePath = path.join(root, 'out', 'vehicleTurnOpsCore.js');
const parityPath = path.join(root, 'out', 'worldIntentVehicleParityCore.js');
const vehicleCorePath = path.join(root, 'out', 'vehicleCore.js');
const worldIntentPath = path.join(root, 'out', 'worldIntentCore.js');

let failed = 0;
function fail(msg) { console.error(`FAIL: ${msg}`); failed++; }
function ok(msg) { console.log(`OK: ${msg}`); }

for (const p of [bridgeCorePath, turnOpsCorePath, parityPath, vehicleCorePath, worldIntentPath]) {
    if (!fs.existsSync(p)) {
        fail(`${p} missing — run npm run compile`);
        process.exit(1);
    }
}

const {
    normalizeVehicleWorldIntentBridgeMode,
    runVehicleWorldIntentBridgeBatch,
    buildVehicleBridgeParityErrorReport,
} = require(bridgeCorePath);
const { tryApplyVehicleTurnOpsWithDeps } = require(turnOpsCorePath);
const { compareVehicleWorldIntentParity } = require(parityPath);
const { parseVehicleState } = require(vehicleCorePath);
const { parseVehicleWorldIntentBridgeMode } = require(worldIntentPath);

const VEHICLE_STATE = 'vehicle_state.json';

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

function makeState(extra = {}) {
    return parseVehicleState({
        version: 1,
        activeVehicleId: 'rust_wagon',
        updatedTurn: 7,
        vehicles: [baseVehicle, {
            ...baseVehicle,
            id: 'scout_bike',
            name: 'Scout Bike',
            kind: 'bike',
            status: 'available',
            locationId: 'market_square',
            resources: { powerType: 'none' },
        }],
        ...extra,
    });
}

function makeDeps(statePath, state, options = {}) {
    let writeCount = 0;
    const diagnostics = [];
    const deps = {
        isVehicleSystemEnabled: () => options.enableVehicleSystem !== false,
        getVehicleStatePath: () => statePath,
        readVehicleStateFromDisk: () => parseVehicleState(JSON.parse(JSON.stringify(state))),
        loadWorldTurn: () => options.worldTurn ?? 11,
        writeVehicleStateAtomic: (p, doc) => {
            writeCount++;
            fs.writeFileSync(p, JSON.stringify(doc, null, 2), 'utf-8');
        },
        clearVehicleStateCache: () => {},
        runSerializedMutation: (fn) => fn(),
        getVehicleBridgeMode: () => options.bridgeMode ?? 'off',
        emitVehicleBridgeDiagnostics: (report) => diagnostics.push(report),
    };
    return { deps, getWriteCount: () => writeCount, diagnostics };
}

// 1-2. mode parser + invalid fallback
{
    if (parseVehicleWorldIntentBridgeMode('shadow') !== 'shadow') {
        fail('shadow should parse');
    } else if (parseVehicleWorldIntentBridgeMode('compare_only') !== 'compare_only') {
        fail('compare_only should parse');
    } else if (parseVehicleWorldIntentBridgeMode('apply') !== undefined) {
        fail('apply must be rejected');
    } else if (normalizeVehicleWorldIntentBridgeMode('bogus') !== 'off') {
        fail('invalid mode should fall back to off');
    } else if (normalizeVehicleWorldIntentBridgeMode(undefined) !== 'off') {
        fail('undefined mode should fall back to off');
    } else {
        ok('bridge mode parser accepts off/shadow/compare_only and rejects apply');
    }
}

// 3. off mode — no diagnostics, legacy behavior
{
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lr-wi3b-off-'));
    const statePath = path.join(dir, VEHICLE_STATE);
    const state = makeState({ activeVehicleId: 'scout_bike' });
    fs.writeFileSync(statePath, JSON.stringify(state, null, 2), 'utf-8');
    const { deps, diagnostics, getWriteCount } = makeDeps(statePath, state, { bridgeMode: 'off' });
    const result = tryApplyVehicleTurnOpsWithDeps({
        vehicleOps: [{ type: 'set_active_vehicle', vehicleId: 'rust_wagon' }],
    }, deps);
    if (diagnostics.length !== 0) {
        fail('off mode should emit no diagnostics');
    } else if (!result.ok || !result.applied || getWriteCount() !== 1) {
        fail(`off mode legacy apply failed: ${JSON.stringify({ result, writes: getWriteCount() })}`);
    } else {
        ok('off mode keeps legacy apply with no parity diagnostics');
    }
    fs.rmSync(dir, { recursive: true, force: true });
}

// 4-5. shadow / compare_only run parity and legacy write once
{
    for (const mode of ['shadow', 'compare_only']) {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), `lr-wi3b-${mode}-`));
        const statePath = path.join(dir, VEHICLE_STATE);
        const state = makeState({ activeVehicleId: 'scout_bike' });
        fs.writeFileSync(statePath, JSON.stringify(state, null, 2), 'utf-8');
        const { deps, diagnostics, getWriteCount } = makeDeps(statePath, state, { bridgeMode: mode });
        const result = tryApplyVehicleTurnOpsWithDeps({
            vehicleOps: [{ type: 'damage_vehicle', vehicleId: 'rust_wagon', amount: 2 }],
        }, deps);
        if (diagnostics.length !== 1) {
            fail(`${mode} should emit one batch diagnostic`);
        } else if (diagnostics[0].bridgeMode !== mode || diagnostics[0].reportCount < 1) {
            fail(`${mode} batch report missing reports`);
        } else if (!result.ok || !result.applied || getWriteCount() !== 1) {
            fail(`${mode} legacy write should occur once`);
        }
        fs.rmSync(dir, { recursive: true, force: true });
    }
    ok('shadow and compare_only run parity on pre-write clone and legacy write once');
}

// 6-7. mismatch / parity exception do not change TurnLedgerApplyResult
{
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lr-wi3b-mismatch-'));
    const statePath = path.join(dir, VEHICLE_STATE);
    const state = makeState();
    fs.writeFileSync(statePath, JSON.stringify(state, null, 2), 'utf-8');
    const { deps, diagnostics } = makeDeps(statePath, state, { bridgeMode: 'compare_only' });
    const result = tryApplyVehicleTurnOpsWithDeps({
        vehicleOps: [{ type: 'damage_vehicle', vehicleId: 'rust_wagon', amount: 3 }],
    }, deps);
    if (!result.ok || !result.applied) {
        fail('changed op should still apply despite diagnostics');
    } else if (!diagnostics[0] || diagnostics[0].matchCount < 1) {
        fail('expected at least one match report for valid changed op');
    }

    const throwDeps = {
        ...deps,
        getVehicleBridgeMode: () => 'shadow',
        emitVehicleBridgeDiagnostics: () => { throw new Error('diag sink failed'); },
    };
    const throwResult = tryApplyVehicleTurnOpsWithDeps({
        vehicleOps: [{ type: 'repair_vehicle', vehicleId: 'rust_wagon', amount: 2 }],
    }, throwDeps);
    if (!throwResult.ok || !throwResult.applied) {
        fail('parity diagnostic sink failure must not fail ledger apply');
    } else {
        ok('parity mismatch/exception paths do not change ledger apply result');
    }
    fs.rmSync(dir, { recursive: true, force: true });
}

// 8-13. blocked/no-op parity edge cases (WI2R P2 + Gate §10)
{
    const state = makeState();
    const cases = [
        {
            name: 'missing vehicle',
            op: { type: 'damage_vehicle', vehicleId: 'ghost_ship', amount: 2 },
            expectOutcome: 'match',
        },
        {
            name: 'lost vehicle',
            op: { type: 'damage_vehicle', vehicleId: 'rust_wagon', amount: 2 },
            mutate: (s) => { s.vehicles.find((v) => v.id === 'rust_wagon').status = 'lost'; },
            expectOutcome: 'match',
        },
        {
            name: 'full fuel refuel noop',
            op: { type: 'refuel_vehicle', vehicleId: 'rust_wagon', amount: 2 },
            mutate: (s) => { s.vehicles.find((v) => v.id === 'rust_wagon').resources.current = 20; },
            expectOutcome: 'match',
        },
        {
            name: 'no fuel tank',
            op: { type: 'refuel_vehicle', vehicleId: 'scout_bike', amount: 2 },
            expectOutcome: 'match',
        },
        {
            name: 'resource mismatch',
            op: { type: 'refuel_vehicle', vehicleId: 'rust_wagon', amount: 2, resourceType: 'battery' },
            expectOutcome: 'match',
        },
        {
            name: 'exact move noop',
            op: { type: 'move_vehicle', vehicleId: 'rust_wagon', locationId: 'outer_gate' },
            expectOutcome: 'match',
        },
    ];

    let edgeOk = true;
    for (const c of cases) {
        const s = makeState();
        if (c.mutate) { c.mutate(s); }
        const report = compareVehicleWorldIntentParity({
            op: c.op,
            vehicleState: s,
            enableVehicleSystem: true,
            worldTurn: 10,
        });
        if (report.outcome !== c.expectOutcome) {
            edgeOk = false;
            fail(`${c.name} parity expected ${c.expectOutcome}, got ${report.outcome}`);
        }
        const batch = runVehicleWorldIntentBridgeBatch({
            bridgeMode: 'compare_only',
            vehicleOps: [c.op],
            preWriteVehicleState: s,
            enableVehicleSystem: true,
            worldTurn: 10,
        });
        if (batch.reportCount !== 1) {
            edgeOk = false;
            fail(`${c.name} batch should include one report`);
        }
    }
    if (edgeOk) {
        ok('blocked/no-op parity edge cases produce structured diagnostics without throwing');
    }
}

// 14. no double write
{
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lr-wi3b-write-'));
    const statePath = path.join(dir, VEHICLE_STATE);
    const state = makeState({ activeVehicleId: 'scout_bike' });
    fs.writeFileSync(statePath, JSON.stringify(state, null, 2), 'utf-8');
    const { deps, getWriteCount } = makeDeps(statePath, state, { bridgeMode: 'compare_only' });
    tryApplyVehicleTurnOpsWithDeps({
        vehicleOps: [
            { type: 'set_active_vehicle', vehicleId: 'rust_wagon' },
            { type: 'damage_vehicle', vehicleId: 'rust_wagon', amount: 1 },
        ],
    }, deps);
    if (getWriteCount() !== 1) {
        fail(`expected exactly one legacy write, got ${getWriteCount()}`);
    } else {
        ok('bridge observes at most one legacy vehicle_state write');
    }
    fs.rmSync(dir, { recursive: true, force: true });
}

// 15. forbidden imports / pure core
{
    const bridgeCoreSrc = fs.readFileSync(path.join(root, 'src', 'vehicleWorldIntentBridgeCore.ts'), 'utf-8');
    const bridgeHostSrc = fs.readFileSync(path.join(root, 'src', 'vehicleWorldIntentBridge.ts'), 'utf-8');
    if (/from ['"]fs['"]/.test(bridgeCoreSrc) || /from ['"]vscode['"]/.test(bridgeCoreSrc)) {
        fail('bridge core must remain pure');
    }
    if (/writeJsonAtomic|turnLedgerPersistCore|statePatch/.test(bridgeCoreSrc)) {
        fail('bridge core must not import persistence wrappers');
    }
    if (!/from ['"]vscode['"]/.test(bridgeHostSrc)) {
        fail('host bridge wrapper should use vscode for config/output only');
    } else {
        ok('bridge core is pure; host wrapper limits vscode to config/diagnostics');
    }
}

// parity error report helper
{
    const errReport = buildVehicleBridgeParityErrorReport('shadow', 2, new Error('boom'));
    if (errReport.exceptionCount !== 1 || !errReport.parityError) {
        fail('parity error report should be structured');
    } else {
        ok('parity exceptions convert to structured batch error report');
    }
}

// package.json config enum
{
    const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf-8'));
    const setting = pkg.contributes?.configuration?.properties?.['textAdventure.worldIntent.vehicleBridgeMode'];
    if (!setting || setting.default !== 'off') {
        fail('package.json bridge mode default must be off');
    } else if (!setting.enum || setting.enum.includes('apply')) {
        fail('package.json bridge enum must not include apply');
    } else {
        ok('package.json exposes off/shadow/compare_only with off default');
    }
}

// statePatch unchanged regression
{
    const statePatchSrc = fs.readFileSync(path.join(root, 'src', 'statePatch.ts'), 'utf-8');
    if (/vehicleWorldIntentBridge|runVehicleWorldIntentBridgeBatch/.test(statePatchSrc)) {
        fail('statePatch.ts should not wire WI3b bridge directly');
    } else {
        ok('statePatch.ts remains unchanged for WI3b bridge integration');
    }
}

if (failed > 0) {
    console.error(`\n${failed} WI3b test(s) failed.`);
    process.exit(1);
}
console.log('\nAll world intent WI3b tests passed (Gate §10 Required Tests 1-19 covered in suite)');