#!/usr/bin/env node
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const root = path.join(__dirname, '..');
const corePath = path.join(root, 'out', 'ledgerMigrationWritebackCore.js');
const hostPath = path.join(root, 'out', 'ledgerMigrationWritebackHost.js');
const migrationCorePath = path.join(root, 'out', 'ledgerMigrationCore.js');
const vehicleMigrationPath = path.join(root, 'out', 'vehicleMigrationCore.js');
const vehiclePath = path.join(root, 'out', 'vehicleCore.js');
const coreSourcePath = path.join(root, 'src', 'ledgerMigrationWritebackCore.ts');
const runnerSourcePath = path.join(root, 'src', 'ledgerMigrationWritebackRunner.ts');

let failed = 0;
function fail(msg) { console.error(`FAIL: ${msg}`); failed++; }
function ok(msg) { console.log(`OK: ${msg}`); }

for (const p of [corePath, hostPath, migrationCorePath, vehicleMigrationPath, vehiclePath]) {
    if (!fs.existsSync(p)) {
        fail(`${p} missing — run npm run compile`);
        process.exit(1);
    }
}

const {
    assessVehicleStateWritebackEligibility,
    buildMigrationBackupMeta,
    buildMigrationBackupPaths,
    formatMigrationBackupTimestamp,
    formatWritebackReportLines,
    isValidMigrationBackupTimestamp,
    VEHICLE_STATE_WRITEBACK_LEDGER,
} = require(corePath);
const {
    applyVehicleStateMigrationWriteback,
    prepareVehicleStateWriteback,
} = require(hostPath);
const { migrateVehicleStateDocument } = require(vehicleMigrationPath);
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

const legacyRaw = { vehicles: [baseVehicle], updatedTurn: 4 };
const migratedResult = migrateVehicleStateDocument(legacyRaw);
const upToDateResult = migrateVehicleStateDocument({ version: 1, vehicles: [baseVehicle] });
const futureResult = migrateVehicleStateDocument({ version: 2, vehicles: [] });

{
    const eligibility = assessVehicleStateWritebackEligibility(migratedResult);
    if (!eligibility.eligible) {
        fail(`eligible migrated result rejected: ${eligibility.reasonCode}`);
    } else {
        ok('eligible result: vehicle_state migrated changed 0 -> 1');
    }
}

{
    const cases = [
        [upToDateResult, 'not_eligible'],
        [futureResult, 'wrong_status'],
        [{ ...migratedResult, ledger: 'settlement_state' }, 'wrong_ledger'],
        [{ ...migratedResult, fromVersion: 1, toVersion: 1 }, 'wrong_version_range'],
        [{ ...migratedResult, migrated: undefined }, 'missing_migrated_payload'],
        [{ ...migratedResult, status: 'blocked', changed: false }, 'wrong_status'],
        [{ ...migratedResult, status: 'invalid', changed: false }, 'wrong_status'],
    ];
    let allOk = true;
    for (const [result, code] of cases) {
        const eligibility = assessVehicleStateWritebackEligibility(result);
        if (eligibility.eligible || eligibility.reasonCode !== code) {
            fail(`expected ${code}, got ${JSON.stringify(eligibility)}`);
            allOk = false;
        }
    }
    if (allOk) { ok('ineligible results abort with expected reason codes'); }
}

{
    const meta = buildMigrationBackupMeta(migratedResult, '2026-07-04T15:30:12.000Z');
    const text = JSON.stringify(meta);
    if (!meta || meta.ledger !== VEHICLE_STATE_WRITEBACK_LEDGER || meta.fromVersion !== 0 || meta.toVersion !== 1) {
        fail(`unexpected backup meta: ${text}`);
    } else if (text.includes('rust_wagon') || text.includes('vehicles')) {
        fail('backup metadata must not include raw JSON document contents');
    } else {
        ok('backup metadata contains only bounded metadata');
    }
}

{
    const ts = '20260704T153012Z';
    const paths = buildMigrationBackupPaths(ts);
    if (!paths || !paths.backupDirRel.includes('.lorerelay/backups/migrations/20260704T153012Z')) {
        fail(`unexpected backup paths: ${JSON.stringify(paths)}`);
    } else if (!paths.backupFileRel.endsWith('vehicle_state.json')) {
        fail('backup file path must target vehicle_state.json');
    } else {
        ok('backup path is inside .lorerelay/backups/migrations/<timestamp>/');
    }
}

{
    if (!isValidMigrationBackupTimestamp('20260704T153012Z')) {
        fail('valid timestamp rejected');
    } else if (isValidMigrationBackupTimestamp('2026-07-04T15:30:12Z')) {
        fail('malformed timestamp accepted');
    } else if (!formatMigrationBackupTimestamp(new Date('2026-07-04T15:30:12.000Z')).startsWith('20260704T153012')) {
        fail('timestamp formatter did not normalize to compact UTC');
    } else {
        ok('malformed timestamp rejected and formatter normalizes safely');
    }
}

{
    const secret = JSON.stringify(legacyRaw);
    const lines = formatWritebackReportLines({
        outcome: 'aborted',
        reasonCode: 'not_eligible',
    });
    const text = lines.join('\n');
    if (text.includes(secret) || text.includes('rust_wagon')) {
        fail('output must not include raw JSON');
    } else if (!text.includes('No files were changed.')) {
        fail('aborted output must include No files were changed.');
    } else {
        ok('output never includes raw JSON');
    }
}

{
    const coreSource = fs.readFileSync(coreSourcePath, 'utf-8');
    if (/\bfs\b/.test(coreSource) || coreSource.includes('vscode') || coreSource.includes('document')) {
        fail('writeback core must not import fs, vscode, or DOM');
    } else {
        ok('pure helper imports no fs, vscode, or DOM');
    }
}

{
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lr-wi7-success-'));
    fs.writeFileSync(
        path.join(dir, 'vehicle_state.json'),
        JSON.stringify(legacyRaw, null, 2),
        'utf-8'
    );
    const before = fs.readFileSync(path.join(dir, 'vehicle_state.json'), 'utf-8');
    const result = applyVehicleStateMigrationWriteback(dir, {
        now: () => new Date('2026-07-04T15:30:12.000Z'),
    });
    const after = fs.readFileSync(path.join(dir, 'vehicle_state.json'), 'utf-8');
    const parsed = parseVehicleState(JSON.parse(after));
    if (result.outcome !== 'success' || parsed.version !== 1) {
        fail(`successful write expected version 1, got ${JSON.stringify(result)}`);
    } else if (!result.backupFileRel || !fs.existsSync(path.join(dir, result.backupFileRel))) {
        fail('backup file must exist after success');
    } else if (!fs.existsSync(path.join(dir, result.metaFileRel))) {
        fail('migration_meta.json must exist after success');
    } else if (before === after) {
        fail('vehicle_state.json should change on success');
    } else {
        ok('successful write updates vehicle_state.json and creates backup/meta');
    }
}

{
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lr-wi7-uptodate-'));
    fs.writeFileSync(
        path.join(dir, 'vehicle_state.json'),
        JSON.stringify({ version: 1, vehicles: [baseVehicle] }, null, 2),
        'utf-8'
    );
    const result = prepareVehicleStateWriteback(dir);
    if (result.outcome !== 'aborted' || result.reasonCode !== 'not_eligible') {
        fail(`up-to-date should abort, got ${JSON.stringify(result)}`);
    } else {
        ok('ineligible up-to-date result aborts');
    }
}

{
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lr-wi7-future-'));
    fs.writeFileSync(path.join(dir, 'vehicle_state.json'), JSON.stringify({ version: 2, vehicles: [] }), 'utf-8');
    const result = prepareVehicleStateWriteback(dir);
    if (result.outcome !== 'aborted' || result.reasonCode !== 'wrong_status') {
        fail(`future version should abort unsupported, got ${JSON.stringify(result)}`);
    } else {
        ok('future-version vehicle state is not written');
    }
}

{
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lr-wi7-missing-'));
    const result = prepareVehicleStateWriteback(dir);
    if (result.reasonCode !== 'missing_file') {
        fail(`missing file expected, got ${JSON.stringify(result)}`);
    } else {
        ok('missing file aborts without write');
    }
}

{
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lr-wi7-badjson-'));
    fs.writeFileSync(path.join(dir, 'vehicle_state.json'), '{bad', 'utf-8');
    const result = prepareVehicleStateWriteback(dir);
    if (result.reasonCode !== 'read_error') {
        fail(`read_error expected, got ${JSON.stringify(result)}`);
    } else {
        ok('invalid JSON becomes read_error without throwing');
    }
}

{
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lr-wi7-backupfail-'));
    fs.writeFileSync(path.join(dir, 'vehicle_state.json'), JSON.stringify(legacyRaw), 'utf-8');
    const original = fs.readFileSync(path.join(dir, 'vehicle_state.json'), 'utf-8');
    const result = applyVehicleStateMigrationWriteback(dir, {
        copyFile: () => { throw new Error('backup copy failed'); },
        now: () => new Date('2026-07-04T15:30:12.000Z'),
    });
    const current = fs.readFileSync(path.join(dir, 'vehicle_state.json'), 'utf-8');
    if (result.reasonCode !== 'backup_failed' || current !== original) {
        fail(`backup failure must abort before write, got ${JSON.stringify(result)}`);
    } else {
        ok('backup failure aborts before write');
    }
}

{
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lr-wi7-writefail-'));
    fs.writeFileSync(path.join(dir, 'vehicle_state.json'), JSON.stringify(legacyRaw), 'utf-8');
    let writeAttempts = 0;
    const result = applyVehicleStateMigrationWriteback(dir, {
        now: () => new Date('2026-07-04T15:30:12.000Z'),
        writeJsonAtomic: () => {
            writeAttempts++;
            throw new Error('write failed');
        },
    });
    if (result.outcome !== 'write_failed' || !result.backupCreated || writeAttempts !== 1) {
        fail(`write failure should report backup and not retry, got ${JSON.stringify(result)} attempts=${writeAttempts}`);
    } else {
        ok('write failure reports backup existence and does not retry a second write');
    }
}

{
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lr-wi7-postfail-'));
    fs.writeFileSync(path.join(dir, 'vehicle_state.json'), JSON.stringify(legacyRaw), 'utf-8');
    let parseCalls = 0;
    const result = applyVehicleStateMigrationWriteback(dir, {
        now: () => new Date('2026-07-04T15:30:12.000Z'),
        writeJsonAtomic: (filePath) => {
            fs.writeFileSync(filePath, JSON.stringify({ version: 99, vehicles: [] }, null, 2), 'utf-8');
        },
        parse: (raw) => {
            parseCalls++;
            return parseCalls === 1 ? parseVehicleState(raw) : { version: 99 };
        },
    });
    if (result.reasonCode !== 'post_write_validation_failed' || !result.backupCreated) {
        fail(`post-write validation failure expected, got ${JSON.stringify(result)}`);
    } else {
        ok('post-write validation failure is reported with backup path');
    }
}

{
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lr-wi7-onlyfiles-'));
    fs.writeFileSync(path.join(dir, 'vehicle_state.json'), JSON.stringify(legacyRaw), 'utf-8');
    fs.writeFileSync(path.join(dir, 'settlement_state.json'), JSON.stringify({ version: 1 }), 'utf-8');
    const settlementBefore = fs.readFileSync(path.join(dir, 'settlement_state.json'), 'utf-8');
    const result = applyVehicleStateMigrationWriteback(dir, {
        now: () => new Date('2026-07-04T15:30:12.000Z'),
    });
    const settlementAfter = fs.readFileSync(path.join(dir, 'settlement_state.json'), 'utf-8');
    if (result.outcome !== 'success' || settlementBefore !== settlementAfter) {
        fail('successful write must not modify other workspace ledgers');
    } else {
        ok('successful write changes only vehicle_state.json plus backup/meta');
    }
}

{
    const runnerSource = fs.readFileSync(runnerSourcePath, 'utf-8');
    if (runnerSource.includes('writeFileSync') || runnerSource.includes('writeJsonAtomic(')) {
        fail('runner should delegate writes to host module');
    } else {
        ok('runner delegates filesystem writes to host module');
    }
}

if (failed > 0) {
    console.error(`\n${failed} test(s) failed.`);
    process.exit(1);
}
console.log('\nAll ledger_migration_writeback tests passed.');