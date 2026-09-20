#!/usr/bin/env node
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const root = path.join(__dirname, '..');
const hostCorePath = path.join(root, 'out', 'ledgerMigrationHostCore.js');
const loaderPath = path.join(root, 'out', 'ledgerMigrationLoader.js');
const runnerPath = path.join(root, 'src', 'ledgerMigrationRunner.ts');

let failed = 0;
function fail(msg) { console.error(`FAIL: ${msg}`); failed++; }
function ok(msg) { console.log(`OK: ${msg}`); }

for (const p of [hostCorePath, loaderPath]) {
    if (!fs.existsSync(p)) {
        fail(`${p} missing — run npm run compile`);
        process.exit(1);
    }
}

const {
    KNOWN_WORKSPACE_MIGRATION_LEDGERS,
    MAX_MIGRATION_PREVIEW_ISSUE_LINES,
    MIGRATION_PREVIEW_NO_FILES_CHANGED,
    buildWorkspaceMigrationPreviewReport,
    computeWorkspaceMigrationPreviewTotals,
    entryFromMigrationResult,
    formatWorkspaceMigrationPreviewLines,
    makeMissingPreviewEntry,
    makeReadErrorPreviewEntry,
} = require(hostCorePath);
const {
    buildWorkspaceMigrationPreview,
    readKnownLedgerFile,
    readKnownLedgerFiles,
} = require(loaderPath);

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

function makeEntry(status, overrides = {}) {
    return {
        ledger: 'vehicle_state',
        fileName: 'vehicle_state.json',
        status,
        changed: false,
        appliedSteps: [],
        issueCount: 0,
        issues: [],
        toVersion: 1,
        ...overrides,
    };
}

{
    const entries = [
        makeEntry('up_to_date', { fromVersion: 1 }),
        makeEntry('migrated', { fromVersion: 0, changed: true, appliedSteps: [{ fromVersion: 0, toVersion: 1 }] }),
        makeEntry('blocked', { fromVersion: 0, issues: [{ severity: 'error', code: 'missing_migration_step' }], issueCount: 1 }),
        makeEntry('invalid', { issues: [{ severity: 'error', code: 'non_integer_version' }], issueCount: 1 }),
        makeEntry('unsupported', { fromVersion: 2, issues: [{ severity: 'error', code: 'unsupported_future_version' }], issueCount: 1 }),
        makeMissingPreviewEntry('settlement_state', 'settlement_state.json', 1),
        makeReadErrorPreviewEntry('world_state', 'world_state.json', 1),
    ];
    const lines = formatWorkspaceMigrationPreviewLines(buildWorkspaceMigrationPreviewReport(entries, { workspaceName: 'TestWS' }));
    const text = lines.join('\n');
    const checks = [
        ['up_to_date', 'up_to_date'],
        ['migratable', 'migrated display'],
        ['blocked', 'blocked'],
        ['invalid', 'invalid'],
        ['unsupported', 'unsupported'],
        ['missing', 'missing'],
        ['read_error', 'read_error'],
        [MIGRATION_PREVIEW_NO_FILES_CHANGED, 'footer'],
        ['Workspace: TestWS', 'workspace name'],
    ];
    for (const [needle, label] of checks) {
        if (!text.includes(needle)) {
            fail(`formatter missing ${label}: ${needle}`);
        }
    }
    if (checks.every(([needle]) => text.includes(needle))) {
        ok('formatter summarizes all preview statuses');
    }
}

{
    const entries = [
        makeEntry('up_to_date'),
        makeEntry('migrated'),
        makeEntry('blocked'),
        makeEntry('invalid'),
        makeEntry('unsupported'),
        makeMissingPreviewEntry('discoveries', 'discoveries.json', 1),
        makeReadErrorPreviewEntry('npc_registry', 'npc_registry.json', 1),
    ];
    const totals = computeWorkspaceMigrationPreviewTotals(entries);
    if (totals.upToDate !== 1 || totals.migratable !== 1 || totals.blocked !== 1
        || totals.invalid !== 1 || totals.unsupported !== 1 || totals.missing !== 1 || totals.readError !== 1) {
        fail(`unexpected totals: ${JSON.stringify(totals)}`);
    } else {
        ok('totals count statuses correctly');
    }
}

{
    const issues = [];
    for (let i = 0; i < 30; i++) {
        issues.push({ severity: 'warning', code: `issue_${i}` });
    }
    const entry = makeEntry('blocked', { issues, issueCount: issues.length });
    const lines = formatWorkspaceMigrationPreviewLines(buildWorkspaceMigrationPreviewReport([entry]));
    const issueLines = lines.filter((line) => line.includes('vehicle_state warning issue_'));
    if (issueLines.length !== MAX_MIGRATION_PREVIEW_ISSUE_LINES) {
        fail(`expected ${MAX_MIGRATION_PREVIEW_ISSUE_LINES} issue lines, got ${issueLines.length}`);
    } else {
        ok('issue output is bounded');
    }
}

{
    const secret = '{"vehicles":[{"id":"secret_payload"}]}';
    const report = buildWorkspaceMigrationPreviewReport([
        makeEntry('migrated', {
            issues: [{ severity: 'error', code: 'validation_failed' }],
            issueCount: 1,
        }),
    ]);
    const text = formatWorkspaceMigrationPreviewLines(report).join('\n');
    if (text.includes(secret) || text.includes('secret_payload')) {
        fail('formatted report must not include raw JSON contents');
    } else {
        ok('report does not include raw JSON contents');
    }
}

{
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lr-wi6b-empty-'));
    const report = buildWorkspaceMigrationPreview(dir, { workspaceName: 'Empty' });
    if (report.entries.length !== KNOWN_WORKSPACE_MIGRATION_LEDGERS.length) {
        fail(`expected ${KNOWN_WORKSPACE_MIGRATION_LEDGERS.length} entries for empty workspace`);
    } else if (report.totals.missing !== KNOWN_WORKSPACE_MIGRATION_LEDGERS.length) {
        fail('all missing ledgers should be non-fatal missing status');
    } else {
        ok('missing files are non-fatal');
    }
}

{
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lr-wi6b-vehicle-v0-'));
    fs.writeFileSync(
        path.join(dir, 'vehicle_state.json'),
        JSON.stringify({ vehicles: [baseVehicle], updatedTurn: 4 }, null, 2),
        'utf-8'
    );
    const report = buildWorkspaceMigrationPreview(dir);
    const vehicle = report.entries.find((e) => e.ledger === 'vehicle_state');
    if (!vehicle || vehicle.status !== 'migrated' || vehicle.fromVersion !== 0 || vehicle.toVersion !== 1) {
        fail(`vehicle v0 should be migratable 0->1, got ${JSON.stringify(vehicle)}`);
    } else {
        ok('vehicle v0 file reports migratable 0 -> 1');
    }
}

{
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lr-wi6b-vehicle-v1-'));
    fs.writeFileSync(
        path.join(dir, 'vehicle_state.json'),
        JSON.stringify({ version: 1, vehicles: [baseVehicle] }, null, 2),
        'utf-8'
    );
    const report = buildWorkspaceMigrationPreview(dir);
    const vehicle = report.entries.find((e) => e.ledger === 'vehicle_state');
    if (!vehicle || vehicle.status !== 'up_to_date' || vehicle.fromVersion !== 1) {
        fail(`vehicle v1 should be up_to_date, got ${JSON.stringify(vehicle)}`);
    } else {
        ok('vehicle v1 file reports up-to-date');
    }
}

{
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lr-wi6b-vehicle-v2-'));
    fs.writeFileSync(
        path.join(dir, 'vehicle_state.json'),
        JSON.stringify({ version: 2, vehicles: [] }, null, 2),
        'utf-8'
    );
    const report = buildWorkspaceMigrationPreview(dir);
    const vehicle = report.entries.find((e) => e.ledger === 'vehicle_state');
    if (!vehicle || vehicle.status !== 'unsupported') {
        fail(`future vehicle version should be unsupported, got ${JSON.stringify(vehicle)}`);
    } else {
        ok('future vehicle version reports unsupported');
    }
}

{
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lr-wi6b-bad-json-'));
    fs.writeFileSync(path.join(dir, 'vehicle_state.json'), '{not json', 'utf-8');
    let threw = false;
    let report;
    try {
        report = buildWorkspaceMigrationPreview(dir);
    } catch {
        threw = true;
    }
    const vehicle = report?.entries?.find((e) => e.ledger === 'vehicle_state');
    if (threw || !vehicle || vehicle.status !== 'read_error') {
        fail('invalid JSON should become read_error without throwing');
    } else {
        ok('invalid JSON becomes read_error without throwing from preview builder');
    }
}

{
    if (KNOWN_WORKSPACE_MIGRATION_LEDGERS.length !== 8) {
        fail(`expected 8 known ledgers, got ${KNOWN_WORKSPACE_MIGRATION_LEDGERS.length}`);
    }
    const allowed = new Set(KNOWN_WORKSPACE_MIGRATION_LEDGERS.map((s) => s.relativePath));
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lr-wi6b-loader-'));
    fs.writeFileSync(path.join(dir, 'vehicle_state.json'), JSON.stringify({ version: 1, vehicles: [] }), 'utf-8');
    fs.writeFileSync(path.join(dir, 'secret_extra.json'), JSON.stringify({ version: 99 }), 'utf-8');

    for (const spec of KNOWN_WORKSPACE_MIGRATION_LEDGERS) {
        if (!allowed.has(spec.relativePath)) {
            fail(`unexpected ledger path ${spec.relativePath}`);
        }
        const read = readKnownLedgerFile(dir, spec);
        if (read.relativePath !== spec.relativePath) {
            fail('readKnownLedgerFile should preserve fixed relative path');
        }
    }

    const results = readKnownLedgerFiles(dir);
    if (results.length !== 8) {
        fail(`readKnownLedgerFiles should return 8 entries, got ${results.length}`);
    } else if (results.some((r) => r.relativePath === 'secret_extra.json')) {
        fail('loader must not read arbitrary workspace files');
    } else {
        ok('host loader reads only fixed known filenames');
    }
}

{
    const lines = formatWorkspaceMigrationPreviewLines(buildWorkspaceMigrationPreviewReport([]));
    if (!lines.includes(MIGRATION_PREVIEW_NO_FILES_CHANGED)) {
        fail('command output must contain No files were changed.');
    } else {
        ok('command output contains No files were changed.');
    }
}

{
    const source = fs.readFileSync(runnerPath, 'utf-8');
    const forbidden = ['writeFile', 'writeJsonAtomic', 'writeFileSync', 'renameSync'];
    const hits = forbidden.filter((sym) => source.includes(sym));
    if (hits.length > 0) {
        fail(`ledgerMigrationRunner must not import mutation helpers: ${hits.join(', ')}`);
    } else {
        ok('runner has no writeFile/writeJsonAtomic/mutation helper usage');
    }
}

if (failed > 0) {
    console.error(`\n${failed} test(s) failed.`);
    process.exit(1);
}
console.log('\nAll ledger_migration_host_core tests passed.');