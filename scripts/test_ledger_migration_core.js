#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const corePath = path.join(root, 'out', 'ledgerMigrationCore.js');
const vehicleMigrationPath = path.join(root, 'out', 'vehicleMigrationCore.js');
const vehiclePath = path.join(root, 'out', 'vehicleCore.js');

let failed = 0;
function fail(msg) { console.error(`FAIL: ${msg}`); failed++; }
function ok(msg) { console.log(`OK: ${msg}`); }

for (const p of [corePath, vehicleMigrationPath, vehiclePath]) {
    if (!fs.existsSync(p)) {
        fail(`${p} missing — run npm run compile`);
        process.exit(1);
    }
}

const {
    migrateLedgerDocument,
    probeNumericVersion,
    LEDGER_MIGRATION_REPORT_VERSION,
    MAX_LEDGER_MIGRATION_MESSAGE_CHARS,
} = require(corePath);
const {
    migrateVehicleStateDocument,
    VEHICLE_STATE_TARGET_VERSION,
    VEHICLE_STATE_MIGRATION_STEPS,
} = require(vehicleMigrationPath);
const { parseVehicleState } = require(vehiclePath);

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

const upToDateRaw = {
    version: 1,
    activeVehicleId: 'rust_wagon',
    vehicles: [baseVehicle],
    updatedTurn: 4,
};

{
    const result = migrateVehicleStateDocument(upToDateRaw);
    if (result.status !== 'up_to_date' || result.changed !== false) {
        fail(`up-to-date v1 expected unchanged, got ${result.status} changed=${result.changed}`);
    } else if (result.fromVersion !== 1 || result.toVersion !== 1) {
        fail('up-to-date v1 should report from/to version 1');
    } else {
        ok('up-to-date v1 vehicle state returns up_to_date, changed:false');
    }
}

{
    const legacyRaw = { vehicles: [baseVehicle], updatedTurn: 4 };
    const result = migrateVehicleStateDocument(legacyRaw);
    if (result.status !== 'migrated' || !result.changed) {
        fail(`missing version should migrate, got ${result.status} changed=${result.changed}`);
    } else if (result.fromVersion !== 0 || result.appliedSteps.length !== 1) {
        fail('missing version should be treated as v0 with one applied step');
    } else if (result.migrated?.version !== 1) {
        fail('migrated output should include version:1');
    } else {
        ok('missing version vehicle state migrates v0 -> v1');
    }
}

{
    const legacyRaw = { vehicles: [baseVehicle], updatedTurn: 4 };
    const result = migrateVehicleStateDocument(legacyRaw);
    const parsed = parseVehicleState(result.migrated);
    if (parsed.version !== 1 || parsed.vehicles.length !== 1 || parsed.vehicles[0].id !== 'rust_wagon') {
        fail('migrated v0 -> v1 should parse through parseVehicleState');
    } else if (parsed.updatedTurn !== 4) {
        fail('migration should preserve unrelated fields like updatedTurn');
    } else {
        ok('migrated v0 -> v1 output validates through parseVehicleState');
    }
}

{
    const result = migrateVehicleStateDocument({ version: 2, vehicles: [] });
    if (result.status !== 'unsupported') {
        fail(`future version should be unsupported, got ${result.status}`);
    } else {
        ok('future version returns unsupported');
    }
}

{
    const negative = migrateVehicleStateDocument({ version: -1, vehicles: [] });
    const float = migrateVehicleStateDocument({ version: 1.5, vehicles: [] });
    if (negative.status !== 'invalid' || float.status !== 'invalid') {
        fail('negative/non-integer version should be invalid');
    } else {
        ok('negative/non-integer version returns invalid');
    }
}

{
    const result = migrateLedgerDocument({
        ledger: 'vehicle_state',
        raw: { vehicles: [] },
        targetVersion: 2,
        steps: VEHICLE_STATE_MIGRATION_STEPS,
        treatMissingVersionAs: 0,
        validate: (raw) => typeof raw === 'object' && raw !== null && raw.version === 2,
    });
    if (result.status !== 'blocked') {
        fail(`missing step should block, got ${result.status}`);
    } else if (!result.issues.some((i) => i.code === 'missing_migration_step')) {
        fail('blocked result should include missing_migration_step issue');
    } else {
        ok('missing migration step returns blocked');
    }
}

{
    const steps = [
        {
            ledger: 'vehicle_state',
            fromVersion: 0,
            toVersion: 1,
            migrate: (raw) => ({ ...(raw || {}), version: 1, vehicles: raw?.vehicles ?? [] }),
        },
        {
            ledger: 'vehicle_state',
            fromVersion: 1,
            toVersion: 2,
            migrate: (raw) => ({ ...(raw || {}), version: 2, pilotMarker: true }),
        },
    ];
    const result = migrateLedgerDocument({
        ledger: 'vehicle_state',
        raw: { vehicles: [baseVehicle] },
        targetVersion: 2,
        steps,
        treatMissingVersionAs: 0,
        validate: (raw) => raw?.version === 2,
    });
    if (result.status !== 'migrated' || result.appliedSteps.length !== 2) {
        fail(`multi-step chain should apply 2 steps, got ${JSON.stringify(result.appliedSteps)}`);
    } else if (result.appliedSteps[0].fromVersion !== 0 || result.appliedSteps[1].toVersion !== 2) {
        fail('applied steps should be contiguous 0->1 and 1->2');
    } else if (result.migrated?.pilotMarker !== true) {
        fail('multi-step chain should reach target version payload');
    } else {
        ok('multi-step chain applies contiguous steps in order');
    }
}

{
    const steps = [
        {
            ledger: 'vehicle_state',
            fromVersion: 1,
            toVersion: 2,
            migrate: (raw) => ({ ...(raw || {}), version: 2 }),
        },
    ];
    const result = migrateLedgerDocument({
        ledger: 'vehicle_state',
        raw: { vehicles: [] },
        targetVersion: 2,
        steps,
        treatMissingVersionAs: 0,
    });
    if (result.status !== 'blocked') {
        fail('missing v0->1 step should not skip to v1->2');
    } else {
        ok('steps are not skipped');
    }
}

{
    const raw = { vehicles: [baseVehicle], updatedTurn: 9 };
    const snap = JSON.stringify(raw);
    migrateVehicleStateDocument(raw);
    if (JSON.stringify(raw) !== snap) {
        fail('migration must not mutate input raw object');
    } else {
        ok('migration does not mutate input raw object');
    }
}

{
    const result = migrateLedgerDocument({
        ledger: 'vehicle_state',
        raw: { version: 0, vehicles: 'not-an-array' },
        targetVersion: 1,
        steps: VEHICLE_STATE_MIGRATION_STEPS,
        treatMissingVersionAs: 0,
        validate: () => false,
    });
    if (result.status !== 'invalid') {
        fail(`invalid migrated output should be invalid, got ${result.status}`);
    } else {
        ok('invalid migrated output returns invalid');
    }
}

{
    const longMsg = 'x'.repeat(MAX_LEDGER_MIGRATION_MESSAGE_CHARS + 40);
    const result = migrateLedgerDocument({
        ledger: 'vehicle_state',
        raw: { version: 9, vehicles: [] },
        targetVersion: 1,
        steps: [],
        versionFields: ['version'],
    });
    const issue = result.issues.find((i) => i.code === 'unsupported_future_version');
    if (!issue || issue.message.length > MAX_LEDGER_MIGRATION_MESSAGE_CHARS) {
        fail('issue messages should be bounded');
    } else if (result.version !== LEDGER_MIGRATION_REPORT_VERSION) {
        fail('report version should be set');
    } else {
        ok('report contains bounded issue messages');
    }
    if (longMsg.length <= MAX_LEDGER_MIGRATION_MESSAGE_CHARS) {
        ok('synthetic long message guard skipped');
    }
}

{
    const result = migrateVehicleStateDocument({ vehicles: [baseVehicle] });
    const serialized = JSON.stringify(result);
    if (serialized.includes('C:\\\\') || serialized.includes('/tmp/') || serialized.includes('.json')) {
        fail('result should not include filesystem paths');
    } else {
        ok('result does not include filesystem paths');
    }
}

{
    const legacyRaw = { vehicles: [baseVehicle] };
    const result = migrateVehicleStateDocument(legacyRaw);
    if ('activeVehicleId' in (result.migrated || {})) {
        fail('vehicle pilot must not invent activeVehicleId');
    } else {
        ok('vehicle pilot does not invent active vehicle ids');
    }
}

{
    const probe = probeNumericVersion({ schemaVersion: 3 }, ['version', 'schemaVersion']);
    if (probe.status !== 'valid' || probe.value !== 3) {
        fail('getNumericVersion helper should read schemaVersion fallback');
    } else {
        ok('probeNumericVersion reads alternate version fields');
    }
}

if (failed > 0) {
    console.error(`\n${failed} test(s) failed.`);
    process.exit(1);
}
console.log('\nAll ledger_migration_core tests passed.');