#!/usr/bin/env node
'use strict';

/**
 * SETTLEMENT-MULTI-LOCATION-001-PRE1: pure location ID + path contract tests.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const root = path.join(__dirname, '..');
const corePath = path.join(root, 'out', 'settlementLocationPathCore.js');

let failed = 0;
function fail(msg) { console.error(`FAIL: ${msg}`); failed++; }
function ok(msg) { console.log(`OK: ${msg}`); }

if (!fs.existsSync(corePath)) {
    fail(`${corePath} missing — run npm run compile first`);
    process.exit(1);
}

const {
    SETTLEMENT_FIXED_LOCATION_ID_PATTERN,
    MOBILE_BASE_SETTLEMENT_NAMESPACE,
    SETTLEMENTS_DIR_NAME,
    SETTLEMENT_STATE_BASENAME,
    SETTLEMENT_LAYOUT_BASENAME,
    validateFixedSettlementLocationId,
    validateFixedSettlementLocationIdInCatalog,
    buildFixedSettlementDocumentPaths,
    buildMobileBaseSettlementDocumentPaths,
    isPathInsideRoot,
} = require(corePath);

let cases = 0;
function check(cond, msg) {
    cases += 1;
    if (cond) { ok(msg); }
    else { fail(msg); }
}

// --- Accepted IDs ---
const accepted = ['a', 'loc1', 'loc_sapphire_port', 'Sapphire-Port-01'];
const id64 = 'A' + 'b'.repeat(63);
accepted.push(id64);
check(id64.length === 64, 'exactly-64-char id length');

for (const id of accepted) {
    const r = validateFixedSettlementLocationId(id);
    check(r.ok === true && r.locationId === id, `accept syntax: ${id.slice(0, 20)}${id.length > 20 ? '…' : ''}`);
    check(SETTLEMENT_FIXED_LOCATION_ID_PATTERN.test(id), `pattern matches: ${id.slice(0, 12)}`);
}

// --- Rejected IDs (each category) ---
const rejections = [
    [null, 'not_string'],
    [undefined, 'not_string'],
    [123, 'not_string'],
    [{}, 'not_string'],
    ['', 'empty'],
    ['A' + 'x'.repeat(64), 'too_long'], // 65 chars
    [' loc1', 'invalid_characters'],
    ['loc 1', 'invalid_characters'],
    ['loc1\n', 'invalid_characters'],
    ['loc1\t', 'invalid_characters'],
    ['loc\u0000id', 'invalid_characters'],
    ['loc\u007fid', 'invalid_characters'],
    ['loc_サファイア', 'invalid_characters'],
    ['café', 'invalid_characters'],
    ['a/b', 'path_segment'],
    ['a\\b', 'path_segment'],
    ['.', 'path_segment'],
    ['..', 'path_segment'],
    ['loc.with.dot', 'path_segment'],
    ['loc%2e%2e', 'url_encoded'],
    ['foo%bar', 'url_encoded'],
    ['C:foo', 'absolute_or_drive'],
    ['C:', 'absolute_or_drive'],
    ['_mobile_base', 'reserved_namespace'],
    ['_hidden', 'reserved_namespace'],
    ['__proto__', 'prototype_key'],
    ['prototype', 'prototype_key'],
    ['constructor', 'prototype_key'],
    ['CON', 'reserved_device_name'],
    ['con', 'reserved_device_name'],
    ['Prn', 'reserved_device_name'],
    ['AUX', 'reserved_device_name'],
    ['nul', 'reserved_device_name'],
    ['COM1', 'reserved_device_name'],
    ['com9', 'reserved_device_name'],
    ['LPT1', 'reserved_device_name'],
    ['lpt9', 'reserved_device_name'],
    ['-bad', 'invalid_characters'], // first char not alphanumeric
];

for (const [value, expected] of rejections) {
    const r = validateFixedSettlementLocationId(value);
    check(
        r.ok === false && r.code === expected,
        `reject ${JSON.stringify(value)} → ${expected} (got ${r.ok ? 'ok' : r.code})`
    );
}

// --- Catalog validation ---
const catalog = new Set(['loc_sapphire_port', 'loc_reedmarket', '_mobile_base']);
const catalogSnapshot = [...catalog].sort().join(',');

{
    const known = validateFixedSettlementLocationIdInCatalog('loc_sapphire_port', catalog);
    check(known.ok && known.locationId === 'loc_sapphire_port', 'catalog: known ID accepted');
}
{
    const unknown = validateFixedSettlementLocationIdInCatalog('loc_unknown_town', catalog);
    check(unknown.ok === false && unknown.code === 'unknown_location', 'catalog: unknown valid ID');
}
{
    const invalid = validateFixedSettlementLocationIdInCatalog('../evil', catalog);
    check(invalid.ok === false && invalid.code === 'path_segment', 'catalog: invalid preserves syntax error');
}
{
    const reserved = validateFixedSettlementLocationIdInCatalog('_mobile_base', catalog);
    check(reserved.ok === false && reserved.code === 'reserved_namespace', 'catalog: reserved rejected even if in set');
}
check([...catalog].sort().join(',') === catalogSnapshot, 'catalog set not mutated');

// --- Path containment helper ---
{
    const base = path.resolve('C:\\workspace\\settlements');
    check(isPathInsideRoot(base, path.join(base, 'loc1')), 'containment: child ok');
    check(isPathInsideRoot(base, base), 'containment: root equals ok');
    check(
        !isPathInsideRoot(base, path.resolve('C:\\workspace\\settlements-evil\\loc1')),
        'containment: settlements-evil is not inside settlements'
    );
}

// --- Fixed paths (temp root, no I/O by core) ---
const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'lr-settlement-path-'));
const beforeListing = fs.readdirSync(tmpRoot);
const forgeIds = new Set(['loc_sapphire_port', 'Sapphire-Port-01', 'a', 'loc1', id64]);

{
    const built = buildFixedSettlementDocumentPaths(tmpRoot, 'loc_sapphire_port', forgeIds);
    check(built.ok === true, 'fixed paths: ok');
    if (built.ok) {
        check(built.kind === 'fixed', 'fixed paths: kind fixed');
        check(built.locationId === 'loc_sapphire_port', 'fixed paths: exact locationId');
        const expectedDir = path.resolve(tmpRoot, SETTLEMENTS_DIR_NAME, 'loc_sapphire_port');
        check(built.directory === expectedDir, 'fixed paths: directory');
        check(
            built.statePath === path.join(expectedDir, SETTLEMENT_STATE_BASENAME),
            'fixed paths: state basename'
        );
        check(
            built.layoutPath === path.join(expectedDir, SETTLEMENT_LAYOUT_BASENAME),
            'fixed paths: layout basename'
        );
        check(
            path.dirname(built.statePath) === path.dirname(built.layoutPath),
            'fixed paths: shared settlement directory'
        );
        check(
            isPathInsideRoot(built.settlementsRoot, built.directory),
            'fixed paths: under settlements root'
        );
        check(
            !built.directory.includes('..'),
            'fixed paths: no .. in directory string'
        );
    }
}

{
    const bad = buildFixedSettlementDocumentPaths(tmpRoot, '_mobile_base', new Set(['_mobile_base']));
    check(bad.ok === false && bad.code === 'reserved_namespace', 'fixed paths: reject _mobile_base');
}
{
    const badRoot = buildFixedSettlementDocumentPaths('', 'loc1', forgeIds);
    check(badRoot.ok === false && badRoot.code === 'invalid_workspace_root', 'fixed paths: empty workspace root');
}
{
    const badCat = buildFixedSettlementDocumentPaths(tmpRoot, 'loc_not_in_forge', forgeIds);
    check(badCat.ok === false && badCat.code === 'unknown_location', 'fixed paths: unknown catalog id');
}

// --- Mobile-base paths ---
{
    const mb = buildMobileBaseSettlementDocumentPaths(tmpRoot);
    check(mb.ok === true, 'mobile paths: ok');
    if (mb.ok) {
        check(mb.kind === 'mobile_base', 'mobile paths: kind');
        check(!('locationId' in mb), 'mobile paths: no locationId field');
        const expectedDir = path.resolve(tmpRoot, SETTLEMENTS_DIR_NAME, MOBILE_BASE_SETTLEMENT_NAMESPACE);
        check(mb.directory === expectedDir, 'mobile paths: directory _mobile_base');
        check(
            mb.statePath === path.join(expectedDir, SETTLEMENT_STATE_BASENAME),
            'mobile paths: state'
        );
        check(
            mb.layoutPath === path.join(expectedDir, SETTLEMENT_LAYOUT_BASENAME),
            'mobile paths: layout'
        );
        check(isPathInsideRoot(mb.settlementsRoot, mb.directory), 'mobile paths: under settlements root');
    }
}

// --- Determinism ---
{
    const a = buildFixedSettlementDocumentPaths(tmpRoot, 'loc1', forgeIds);
    const b = buildFixedSettlementDocumentPaths(tmpRoot, 'loc1', forgeIds);
    check(JSON.stringify(a) === JSON.stringify(b), 'deterministic equal results for equal inputs');
    const m1 = buildMobileBaseSettlementDocumentPaths(tmpRoot);
    const m2 = buildMobileBaseSettlementDocumentPaths(tmpRoot);
    check(JSON.stringify(m1) === JSON.stringify(m2), 'mobile paths deterministic');
}

// --- Purity: no directories/files created by path builders ---
const afterListing = fs.readdirSync(tmpRoot);
check(
    beforeListing.length === afterListing.length
    && beforeListing.join('\0') === afterListing.join('\0'),
    'path builders create no directories or files under temp root'
);
// Also ensure settlements/ was not created
check(!fs.existsSync(path.join(tmpRoot, SETTLEMENTS_DIR_NAME)), 'settlements/ directory not created');

try {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
} catch (_) { /* ignore */ }

console.log(`\nCases exercised: ${cases}`);
if (failed > 0) {
    console.error(`\n${failed} failure(s)`);
    process.exit(1);
}
console.log('All settlement location path core tests passed.');
