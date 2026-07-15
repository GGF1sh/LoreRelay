#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');

const root = path.join(__dirname, '..');
const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'persona-preset-host-'));
const originalLoad = Module._load;
Module._load = function mockVscode(request, parent, isMain) {
    if (request === 'vscode') return { workspace: { workspaceFolders: [{ uri: { fsPath: workspace }, name: 'persona-test' }], getConfiguration: () => ({ get: (_key, fallback) => fallback }) } };
    return originalLoad.call(this, request, parent, isMain);
};

const persona = require(path.join(root, 'out', 'persona.js'));
const presets = require(path.join(root, 'out', 'personaPreset.js'));

fs.writeFileSync(path.join(workspace, 'persona.json'), JSON.stringify({ version: 1, name: 'Existing' }), 'utf8');
assert.deepStrictEqual(persona.loadPlayerPersona(), { version: 1, name: 'Existing' }, 'legacy persona.json loads without a preset directory');
assert.deepStrictEqual(presets.listPlayerPersonaPresets(), [], 'listing absent presets is read-only');
assert.strictEqual(fs.existsSync(path.join(workspace, 'personas')), false, 'settings/listing creates no personas directory');

const first = presets.createPlayerPersonaPreset({ version: 1, name: 'Traveler', description: 'A' }, { source: 'manual' });
persona.savePlayerPersona({ version: 1, name: first.name, description: first.description });
assert.strictEqual(first.id, 'traveler');
assert.strictEqual(fs.existsSync(path.join(workspace, 'personas', 'traveler.json')), true, 'explicit save creates one preset');
assert.deepStrictEqual(persona.loadPlayerPersona(), { version: 1, name: 'Traveler', description: 'A' }, 'explicit save updates runtime persona.json');
const duplicate = presets.createPlayerPersonaPreset({ version: 1, name: 'Traveler', description: 'B' });
assert.strictEqual(duplicate.id, 'traveler-2', 'Save as New never overwrites an existing preset');
fs.writeFileSync(path.join(workspace, 'personas', 'corrupt.json'), '{', 'utf8');
assert.strictEqual(presets.listPlayerPersonaPresets().length, 2, 'corrupt preset files are skipped safely');

const bridge = fs.readFileSync(path.join(root, 'src', 'parlorBridge.ts'), 'utf8');
const personaSection = bridge.slice(bridge.indexOf('function applyParlorPersona'), bridge.indexOf('export function handleSetParlorBackground'));
assert(!/setActiveCharacter|sendParlorSessionToWebview|appendAndSaveParlorMessage|switchParlorCharacter/.test(personaSection), 'persona actions never switch character or rewrite session/greeting');
assert(/activePersonaId/.test(bridge) && /personaPresets/.test(bridge), 'bounded active-preset payload is sent');

console.log('Persona preset host persistence tests passed.');
