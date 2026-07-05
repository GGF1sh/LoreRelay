#!/usr/bin/env node
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { installVscodeStub } = require('./test_helpers/vscode_stub');

const root = path.join(__dirname, '..');
const ws = fs.mkdtempSync(path.join(os.tmpdir(), 'lorerelay-game-rules-'));
fs.writeFileSync(path.join(ws, 'game_rules.json'), JSON.stringify({
    enableVehicleSystem: 'false',
    enableNpcRelationships: 'false',
    maxNamedNpcCount: 'oops',
    diceDifficulty: 'bogus',
}, null, 2), 'utf8');

let failed = 0;
function ok(message) { console.log(`OK: ${message}`); }
function fail(message) { console.error(`FAIL: ${message}`); failed++; }

const restore = installVscodeStub({
    workspace: {
        workspaceFolders: [{ name: 'tmp', uri: { fsPath: ws } }],
        getConfiguration: () => ({
            get: () => '',
            update: async () => undefined,
        }),
    },
});

try {
    const {
        DEFAULT_GAME_RULES,
        clearGameRulesCache,
        loadGameRules,
    } = require(path.join(root, 'out', 'gameRules.js'));
    clearGameRulesCache();
    const rules = loadGameRules();

    if (typeof rules.enableVehicleSystem !== 'boolean') {
        fail(`enableVehicleSystem should be boolean, got ${typeof rules.enableVehicleSystem}`);
    } else if (rules.enableVehicleSystem !== DEFAULT_GAME_RULES.enableVehicleSystem) {
        fail('invalid enableVehicleSystem string should fall back to default');
    } else {
        ok('invalid boolean string falls back to default boolean');
    }

    if (typeof rules.enableNpcRelationships !== 'boolean') {
        fail(`enableNpcRelationships should be boolean, got ${typeof rules.enableNpcRelationships}`);
    } else {
        ok('second invalid boolean string does not pollute loaded rules');
    }

    if (rules.maxNamedNpcCount !== DEFAULT_GAME_RULES.maxNamedNpcCount) {
        fail(`invalid maxNamedNpcCount should fall back to default, got ${rules.maxNamedNpcCount}`);
    } else {
        ok('invalid number string falls back to default');
    }

    if (rules.diceDifficulty !== DEFAULT_GAME_RULES.diceDifficulty) {
        fail(`invalid diceDifficulty should fall back to default, got ${rules.diceDifficulty}`);
    } else {
        ok('invalid enum falls back to default');
    }
} finally {
    restore();
    fs.rmSync(ws, { recursive: true, force: true });
}

if (failed > 0) {
    process.exit(1);
}

console.log('gameRules load path: all tests passed.');
