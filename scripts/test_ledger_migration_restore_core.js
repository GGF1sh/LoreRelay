#!/usr/bin/env node
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const root = path.join(__dirname, '..');
const corePath = path.join(root, 'out', 'ledgerMigrationRestoreCore.js');
const hostPath = path.join(root, 'out', 'ledgerMigrationRestoreHost.js');
const coreSourcePath = path.join(root, 'src', 'ledgerMigrationRestoreCore.ts');
const runnerSourcePath = path.join(root, 'src', 'ledgerMigrationRestoreRunner.ts');

let failed = 0;
function fail(msg) { console.error(`FAIL: ${msg}`); failed++; }
function ok(msg) { console.log(`OK: ${msg}`); }

for (const p of [corePath, hostPath]) {
    if (!fs.existsSync(p)) {
        fail(`${p} missing — run npm run compile`);
        process.exit(1);
    }
}

const {
    parseMigrationBackupMeta,
    sortMigrationBackupCandidates,
    validateRestoreSourceDocument,
    formatRestoreReportLines,
    buildPreRestoreBackupPaths,
} = require(corePath);
const {
    MIGRATION_BACKUP_META_VERSION,
    isValidMigrationBackupTimestamp,
} = require(path.join(root, 'out', 'ledgerMigrationWritebackCore.js'));
const {
    listVehicleStateMigrationBackups,
    restoreVehicleStateMigrationBackup,
} = require(hostPath);

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

function validMeta(overrides = {}) {
    return {
        version: MIGRATION_BACKUP_META_VERSION,
        createdAt: '2026-07-04T15:30:12.000Z',
        ledger: 'vehicle_state',
        sourceFile: 'vehicle_state.json',
        fromVersion: 0,
        toVersion: 1,
        appliedSteps: [{ fromVersion: 0, toVersion: 1 }],
        ...overrides,
    };
}

function seedWi7Backup(dir, timestamp, vehicleRaw, metaOverrides = {}) {
    const backupDir = path.join(dir, '.lorerelay', 'backups', 'migrations', timestamp);
    fs.mkdirSync(backupDir, { recursive: true });
    fs.writeFileSync(path.join(backupDir, 'vehicle_state.json'), JSON.stringify(vehicleRaw, null, 2), 'utf-8');
    fs.writeFileSync(path.join(backupDir, 'migration_meta.json'), JSON.stringify(validMeta(metaOverrides), null, 2), 'utf-8');
}

{
    const meta = parseMigrationBackupMeta(validMeta());
    if (!meta || meta.ledger !== 'vehicle_state') {
        fail('valid WI7 backup metadata should be accepted');
    } else {
        ok('valid WI7 backup metadata is accepted');
    }
}

{
    if (parseMigrationBackupMeta(undefined) || parseMigrationBackupMeta(validMeta({ version: 2 }))) {
        fail('missing/invalid metadata should be rejected');
    } else {
        ok('missing metadata is rejected');
    }
}

{
    if (parseMigrationBackupMeta(validMeta({ ledger: 'world_state' }))) {
        fail('wrong ledger should be rejected');
    } else {
        ok('wrong ledger is rejected');
    }
}

{
    if (parseMigrationBackupMeta(validMeta({ sourceFile: 'game_state.json' }))) {
        fail('wrong sourceFile should be rejected');
    } else {
        ok('wrong sourceFile is rejected');
    }
}

{
    if (parseMigrationBackupMeta(validMeta({ fromVersion: 1, toVersion: 2 }))) {
        fail('unsupported version range should be rejected');
    } else {
        ok('unsupported version range is rejected');
    }
}

{
    if (buildPreRestoreBackupPaths('2026-07-04T15:30:12Z')) {
        fail('unsafe timestamp segment should be rejected');
    } else if (!isValidMigrationBackupTimestamp('20260704T153012Z')) {
        fail('valid timestamp should pass validation');
    } else {
        ok('unsafe timestamp segment is rejected');
    }
}

{
    const sorted = sortMigrationBackupCandidates([
        { timestamp: '20260704T100000Z', sortKey: '20260704T100000Z' },
        { timestamp: '20260704T200000Z', sortKey: '20260704T200000Z' },
    ]);
    if (sorted[0].timestamp !== '20260704T200000Z') {
        fail('backup list should sort newest first');
    } else {
        ok('backup list sorts newest first');
    }
}

{
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lr-wi7b-badjson-'));
    seedWi7Backup(dir, '20260704T153012Z', { vehicles: [baseVehicle] });
    fs.writeFileSync(
        path.join(dir, '.lorerelay', 'backups', 'migrations', '20260704T153012Z', 'vehicle_state.json'),
        '{bad',
        'utf-8'
    );
    const result = restoreVehicleStateMigrationBackup(dir, '20260704T153012Z');
    if (result.outcome !== 'aborted') {
        fail(`invalid backup JSON should abort before pre-restore backup, got ${JSON.stringify(result)}`);
    } else {
        ok('invalid backup JSON is rejected before pre-restore backup');
    }
}

{
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lr-wi7b-prebackupfail-'));
    seedWi7Backup(dir, '20260704T153012Z', { vehicles: [baseVehicle] });
    fs.writeFileSync(path.join(dir, 'vehicle_state.json'), JSON.stringify({ version: 1, vehicles: [] }), 'utf-8');
    const result = restoreVehicleStateMigrationBackup(dir, '20260704T153012Z', {
        copyFile: () => { throw new Error('copy failed'); },
        now: () => new Date('2026-07-04T16:00:00.000Z'),
    });
    const current = fs.readFileSync(path.join(dir, 'vehicle_state.json'), 'utf-8');
    if (result.reasonCode !== 'pre_restore_backup_failed' || current.includes('"version": 1')) {
        fail('pre-restore backup failure must abort before target write');
    } else {
        ok('pre-restore backup failure aborts before target write');
    }
}

{
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lr-wi7b-success-'));
    const legacy = { vehicles: [baseVehicle], updatedTurn: 4 };
    seedWi7Backup(dir, '20260704T153012Z', legacy);
    seedWi7Backup(dir, '20260704T161830Z', legacy);
    fs.writeFileSync(path.join(dir, 'vehicle_state.json'), JSON.stringify({ version: 1, vehicles: [baseVehicle] }), 'utf-8');
    fs.writeFileSync(path.join(dir, 'settlement_state.json'), JSON.stringify({ version: 1 }), 'utf-8');
    const settlementBefore = fs.readFileSync(path.join(dir, 'settlement_state.json'), 'utf-8');

    const listed = listVehicleStateMigrationBackups(dir);
    if (listed.candidates.length !== 2 || listed.candidates[0].timestamp !== '20260704T161830Z') {
        fail(`expected two sorted backups, got ${JSON.stringify(listed.candidates.map((c) => c.timestamp))}`);
    }

    const result = restoreVehicleStateMigrationBackup(dir, '20260704T153012Z', {
        now: () => new Date('2026-07-04T17:00:00.000Z'),
    });
    const restored = JSON.parse(fs.readFileSync(path.join(dir, 'vehicle_state.json'), 'utf-8'));
    const settlementAfter = fs.readFileSync(path.join(dir, 'settlement_state.json'), 'utf-8');
    if (result.outcome !== 'success' || restored.version !== undefined || restored.vehicles.length !== 1) {
        fail(`successful restore expected v0 backup content, got ${JSON.stringify(result)}`);
    } else if (!result.preRestoreBackupRel || !fs.existsSync(path.join(dir, result.preRestoreBackupRel))) {
        fail('successful restore must create pre-restore backup');
    } else if (settlementBefore !== settlementAfter) {
        fail('restore must not modify other ledgers');
    } else {
        ok('successful restore touches only vehicle_state.json plus restore backup/meta');
    }
}

{
    const lines = formatRestoreReportLines({
        outcome: 'success',
        restoredFromRel: '.lorerelay/backups/migrations/20260704T153012Z/vehicle_state.json',
        preRestoreBackupRel: '.lorerelay/backups/migration-restores/20260704T170000Z/vehicle_state.before_restore.json',
    });
    const text = lines.join('\n');
    if (!text.includes('Restored from:') || !text.includes('Pre-restore backup:')) {
        fail('restore output must include selected backup and pre-restore paths');
    } else if (text.includes('rust_wagon')) {
        fail('output must not include raw JSON');
    } else {
        ok('restore output includes paths and excludes raw JSON');
    }
}

{
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lr-wi7b-postfail-'));
    seedWi7Backup(dir, '20260704T153012Z', { vehicles: [baseVehicle] });
    fs.writeFileSync(path.join(dir, 'vehicle_state.json'), JSON.stringify({ version: 1, vehicles: [] }), 'utf-8');
    const result = restoreVehicleStateMigrationBackup(dir, '20260704T153012Z', {
        now: () => new Date('2026-07-04T17:00:00.000Z'),
        writeTextAtomic: (filePath) => {
            fs.writeFileSync(filePath, JSON.stringify({ version: 99, vehicles: [] }, null, 2), 'utf-8');
        },
    });
    if (result.reasonCode !== 'post_restore_validation_failed' || !result.preRestoreBackupCreated) {
        fail(`post-write validation failure expected, got ${JSON.stringify(result)}`);
    } else {
        ok('post-write validation failure is reported');
    }
}

{
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lr-wi7b-scan-'));
    seedWi7Backup(dir, '20260704T153012Z', { vehicles: [baseVehicle] });
    fs.mkdirSync(path.join(dir, '.lorerelay', 'backups', 'migrations', 'nested'), { recursive: true });
    fs.writeFileSync(path.join(dir, '.lorerelay', 'backups', 'migrations', 'nested', 'vehicle_state.json'), '{}', 'utf-8');
    const listed = listVehicleStateMigrationBackups(dir);
    if (listed.candidates.length !== 1) {
        fail('runner must scan only immediate children of migrations backup directory');
    } else {
        ok('runner scans only immediate children of fixed migrations backup directory');
    }
}

{
    const validation = validateRestoreSourceDocument({ version: 2, vehicles: [] });
    if (validation.ok) {
        fail('future-version backup should be rejected');
    } else {
        ok('future-version backup is rejected');
    }
}

{
    const coreSource = fs.readFileSync(coreSourcePath, 'utf-8');
    if (/\bfs\b/.test(coreSource) || coreSource.includes('vscode')) {
        fail('restore core must not import fs or vscode');
    } else {
        ok('pure restore core imports no fs, vscode, or DOM');
    }
}

{
    const runnerSource = fs.readFileSync(runnerSourcePath, 'utf-8');
    if (runnerSource.includes('writeFileSync') || runnerSource.includes('copyFileSync')) {
        fail('runner should delegate filesystem work to host module');
    } else if (runnerSource.includes('runRestoreVehicleStateMigrationBackupCommand')
        && runnerSource.includes('restoreVehicleStateMigrationBackup')) {
        ok('runner delegates restore writes to host module');
    }
}

if (failed > 0) {
    console.error(`\n${failed} test(s) failed.`);
    process.exit(1);
}
console.log('\nAll ledger_migration_restore tests passed.');