#!/usr/bin/env node
/**
 * schemaVersion マイグレーション + バリデーションテスト
 */
'use strict';
const { migrateGameState, isValidSchemaVersion, CURRENT_SCHEMA_VERSION } = require('../out/migrateGameState');
const { validateGameState } = require('../out/validateGameState');

let failed = 0;
function fail(msg) { console.error(`FAIL: ${msg}`); failed++; }
function ok(msg)   { console.log(`OK: ${msg}`); }

const MINIMAL_V2 = { schemaVersion: 2, entries: [] };

// ── migrateGameState ──────────────────────────────────────────

// v1: schemaVersion フィールドなし → v2 に昇格
{
    const v1 = { entries: [], status: { location: 'forest' } };
    const { state, migrated, fromVersion } = migrateGameState(v1);
    if (!migrated)                              { fail('v1 should be migrated'); }
    else if (state.schemaVersion !== CURRENT_SCHEMA_VERSION) { fail(`v1 schemaVersion should be ${CURRENT_SCHEMA_VERSION}, got ${state.schemaVersion}`); }
    else if (fromVersion !== 1)                 { fail(`fromVersion should be 1, got ${fromVersion}`); }
    else if (state.entries === undefined)       { fail('v1 migration must preserve entries'); }
    else { ok('v1 → v2 migration'); }
}

// v2: 既に最新 → migrated = false
{
    const v2 = { schemaVersion: 2, entries: [] };
    const { state, migrated } = migrateGameState(v2);
    if (migrated) { fail('v2 should not be re-migrated'); }
    else if (state.schemaVersion !== 2) { fail('v2 schemaVersion should remain 2'); }
    else { ok('v2 is already current — no migration'); }
}

// 未来バージョン → migrated = false（前方互換）
{
    const future = { schemaVersion: 999, entries: [] };
    const { migrated } = migrateGameState(future);
    if (migrated) { fail('future version should not be migrated'); }
    else { ok('future schemaVersion skipped gracefully'); }
}

// 非オブジェクト入力 → migrated = false
{
    const { migrated } = migrateGameState('not an object');
    if (migrated) { fail('string input should not be migrated'); }
    else { ok('non-object input returns migrated=false'); }
}
{
    const { migrated } = migrateGameState(null);
    if (migrated) { fail('null input should not be migrated'); }
    else { ok('null input returns migrated=false'); }
}

// マイグレーション後に既存フィールドが保持されること
{
    const v1 = { entries: [{ id: 'e1', role: 'gm', sender: 'GM', content: 'Hello' }], theme: 'fantasy' };
    const { state } = migrateGameState(v1);
    if (state.theme !== 'fantasy') { fail('v1 migration must preserve theme'); }
    else if (!Array.isArray(state.entries) || state.entries.length !== 1) { fail('v1 migration must preserve entries array'); }
    else { ok('v1 migration preserves existing fields'); }
}

// ── isValidSchemaVersion ──────────────────────────────────────

if (!isValidSchemaVersion(undefined))     { fail('undefined should be valid (v1 compat)'); }
else { ok('isValidSchemaVersion(undefined) = true'); }

if (!isValidSchemaVersion(1))             { fail('1 should be valid'); }
else { ok('isValidSchemaVersion(1) = true'); }

if (!isValidSchemaVersion(CURRENT_SCHEMA_VERSION)) { fail(`${CURRENT_SCHEMA_VERSION} should be valid`); }
else { ok(`isValidSchemaVersion(${CURRENT_SCHEMA_VERSION}) = true`); }

if (isValidSchemaVersion(0))              { fail('0 should be invalid'); }
else { ok('isValidSchemaVersion(0) = false'); }

if (isValidSchemaVersion(-1))             { fail('-1 should be invalid'); }
else { ok('isValidSchemaVersion(-1) = false'); }

if (isValidSchemaVersion(1.5))            { fail('1.5 should be invalid (not integer)'); }
else { ok('isValidSchemaVersion(1.5) = false'); }

if (isValidSchemaVersion(CURRENT_SCHEMA_VERSION + 1)) { fail('future version should be invalid'); }
else { ok(`isValidSchemaVersion(${CURRENT_SCHEMA_VERSION + 1}) = false`); }

if (isValidSchemaVersion('2'))            { fail('"2" string should be invalid'); }
else { ok('isValidSchemaVersion("2") = false'); }

// ── validateGameState schemaVersion 検証 ──────────────────────

// schemaVersion なし（v1 後方互換）→ エラーなし
{
    const errors = validateGameState({ entries: [] });
    if (errors.length > 0) {
        fail(`v1 without schemaVersion should pass validation: ${errors.join('; ')}`);
    } else {
        ok('validateGameState: no schemaVersion (v1) is valid');
    }
}

// schemaVersion: 2 → エラーなし
{
    const errors = validateGameState(MINIMAL_V2);
    if (errors.length > 0) {
        fail(`schemaVersion 2 should pass: ${errors.join('; ')}`);
    } else {
        ok('validateGameState: schemaVersion 2 is valid');
    }
}

// schemaVersion: 0 → エラーあり
{
    const errors = validateGameState({ schemaVersion: 0, entries: [] });
    if (!errors.some(e => e.includes('schemaVersion'))) {
        fail('schemaVersion 0 should produce a schemaVersion error');
    } else {
        ok('validateGameState: schemaVersion 0 rejected');
    }
}

// schemaVersion: "2" (string) → エラーあり
{
    const errors = validateGameState({ schemaVersion: '2', entries: [] });
    if (!errors.some(e => e.includes('schemaVersion'))) {
        fail('schemaVersion string should produce error');
    } else {
        ok('validateGameState: schemaVersion string rejected');
    }
}

if (failed > 0) {
    process.exit(1);
}
console.log('All migrate game state tests passed.');
