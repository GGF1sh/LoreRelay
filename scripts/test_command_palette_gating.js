#!/usr/bin/env node
'use strict';

// UX-COMBAT-DEVTOOLS-GATE-001: developer and debug commands must not sit in the
// player's Command Palette by default, and every command title must be
// localizable. Both regressed silently before this gate existed.

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const defaultNls = JSON.parse(fs.readFileSync(path.join(root, 'package.nls.json'), 'utf8'));

let failed = 0;
function check(name, fn) {
    try { fn(); console.log(`OK: ${name}`); } catch (err) { console.error(`FAIL: ${name}: ${err.message}`); failed++; }
}

const commands = pkg.contributes.commands;
const commandIds = new Set(commands.map((c) => c.command));
const palette = (pkg.contributes.menus && pkg.contributes.menus.commandPalette) || [];
const gated = new Map(palette.map((entry) => [entry.command, entry.when]));

check('every command title uses an nls key present in the default bundle', () => {
    for (const command of commands) {
        assert.ok(
            /^%.+%$/.test(command.title),
            `${command.command} has a hardcoded title (${command.title}); use %command.<id>% so ja/zh users do not see English`,
        );
        const key = command.title.slice(1, -1);
        assert.ok(key in defaultNls, `${key} is missing from package.nls.json`);
    }
});

check('every commandPalette entry targets a contributed command', () => {
    for (const entry of palette) {
        assert.ok(commandIds.has(entry.command), `commandPalette references unknown command ${entry.command}`);
        assert.ok(typeof entry.when === 'string' && entry.when.length > 0, `${entry.command} needs a when clause`);
    }
});

check('combat debug commands are hidden behind the combat dev-tools setting', () => {
    for (const id of [
        'textadventure.startCampaignCombatDebug',
        'textadventure.abortCampaignCombat',
        'textadventure.applyPendingCombatOutcomes',
    ]) {
        assert.strictEqual(gated.get(id), 'config.textAdventure.debug.combatDevTools', `${id} must be gated`);
    }
});

check('developer and maintenance commands are hidden behind the developer-commands setting', () => {
    for (const id of [
        'textadventure.listLmModels',
        'textadventure.previewGmTurnTransactionPlan',
        'textadventure.previewWorkspaceMigrations',
        'textadventure.applyVehicleStateMigration',
        'textadventure.restoreVehicleStateMigrationBackup',
        'textadventure.upgradeVehicleStateForGameplaySpine',
        'textadventure.gameplaySpineRepairVehicle',
    ]) {
        assert.strictEqual(gated.get(id), 'config.textAdventure.debug.developerCommands', `${id} must be gated`);
    }
});

check('both gating settings exist and default to off', () => {
    for (const key of ['textAdventure.debug.combatDevTools', 'textAdventure.debug.developerCommands']) {
        const prop = pkg.contributes.configuration.properties[key];
        assert.ok(prop, `${key} is not contributed`);
        assert.strictEqual(prop.type, 'boolean');
        assert.strictEqual(prop.default, false, `${key} must default to off so players never see dev tooling`);
    }
});

check('ordinary play commands stay visible in the palette', () => {
    for (const id of [
        'textadventure.openGame',
        'textadventure.loadScenario',
        'textadventure.exportReplay',
        'textadventure.promoteParlorToCampaign',
        'textadventure.runWorkspaceSanityCheck',
    ]) {
        assert.ok(commandIds.has(id), `${id} should exist`);
        assert.ok(!gated.has(id), `${id} must not be hidden from the palette`);
    }
});

if (failed > 0) {
    console.error(`\ncommand palette gating: ${failed} check(s) failed.`);
    process.exit(1);
}
console.log('\ncommand palette gating tests passed.');
