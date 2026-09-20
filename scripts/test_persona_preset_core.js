#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.join(__dirname, '..');
const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'persona-preset-core-'));
const tsc = path.join(root, 'node_modules', 'typescript', 'bin', 'tsc');
const result = spawnSync(process.execPath, [tsc,
    path.join(root, 'src', 'personaCore.ts'), path.join(root, 'src', 'personaPresetCore.ts'),
    '--outDir', outDir, '--module', 'commonjs', '--target', 'ES2020', '--strict', '--skipLibCheck'
], { stdio: 'inherit' });
assert.strictEqual(result.status, 0, 'persona preset core compiles');
const core = require(path.join(outDir, 'personaPresetCore.js'));

assert.strictEqual(core.normalizePersonaPresetId('  Traveler / Scholar  '), 'traveler-scholar');
assert.strictEqual(core.chooseAvailablePersonaPresetId('Traveler', ['traveler', 'traveler-2']), 'traveler-3');
assert.strictEqual(core.isValidPersonaPresetId('../escape'), false, 'path traversal is never a preset id');

const character = {
    id: 'source-character', name: 'Marisa', description: 'A magician', personality: 'Direct and warm',
    portrait: 'secret.png', equipment: { weapon: 'broom' }, stSource: { first_mes: 'Do not copy me' },
    llmProvider: 'vscode-lm', baseStatus: { hp: 1 },
};
const before = JSON.stringify(character);
assert.deepStrictEqual(core.mapCharacterToPlayerPersona(character), {
    version: 1, name: 'Marisa', description: 'A magician', speakingStyle: 'Direct and warm',
});
assert.strictEqual(JSON.stringify(character), before, 'character mapping does not mutate input');

const imported = core.parsePersonaJsonImport({
    name: 'Traveler', description: 'Scholar', speakingStyle: 'Calm',
    system_prompt: 'ignored', first_mes: 'ignored', character_book: { entries: [] }, macros: ['ignored'],
});
assert.deepStrictEqual(imported.persona, { version: 1, name: 'Traveler', description: 'Scholar', speakingStyle: 'Calm' });
assert.deepStrictEqual(imported.ignoredFields.sort(), ['character_book', 'first_mes', 'macros', 'system_prompt']);
assert.strictEqual(core.parsePersonaJsonImport({ system_prompt: 'only unsafe' }).persona, undefined, 'unsafe-only import is empty');
assert.strictEqual(core.parsePlayerPersonaPreset({ version: 1, id: '../bad', name: 'Nope' }), undefined, 'invalid preset file is skipped');

console.log('Persona preset core tests passed.');
