#!/usr/bin/env node
/**
 * Integration smoke test: statePatch apply + GM entry merge + lorebook triggeredLore labels.
 * Requires npm run compile first.
 */
const path = require('path');
const fs = require('fs');
const os = require('os');

const root = path.join(__dirname, '..');
let failed = 0;

function fail(msg) {
  console.error(`FAIL: ${msg}`);
  failed++;
}

function ok(msg) {
  console.log(`OK: ${msg}`);
}

const Module = require('module');
const origRequire = Module.prototype.require;
Module.prototype.require = function (id) {
  if (id === 'vscode') {
    return { window: { showErrorMessage() {} } };
  }
  return origRequire.apply(this, arguments);
};

const { applyStatePatch, mergeGmEntryFromTurn, hashGameState } = require(path.join(root, 'out', 'statePatch.js'));
const { matchEntriesAgainstText } = require(path.join(root, 'out', 'lorebookMatcher.js'));
Module.prototype.require = origRequire;

const baseState = {
  status: { location: 'town square', hp: { current: 20, max: 20 } },
  options: ['look around'],
  theme: 'fantasy',
  entries: [{ id: 'turn-1', role: 'gm', sender: 'Game Master', content: 'You stand in the square.' }]
};

const turnResult = {
  turnId: 'turn-2',
  narration: 'A dragon roars overhead.',
  statePatch: [
    { op: 'replace', path: '/mood', value: 'tense' },
    { op: 'replace', path: '/status/location', value: 'town square (under attack)' }
  ],
  gmEntry: { imagePrompt: 'dragon over medieval town' }
};

let state = JSON.parse(JSON.stringify(baseState));
const beforeHash = hashGameState(state);
state = applyStatePatch(state, turnResult.statePatch);
state = mergeGmEntryFromTurn(state, turnResult);
const afterHash = hashGameState(state);

if (state.mood !== 'tense') {
  fail('pipeline: mood patch not applied');
} else {
  ok('pipeline: mood patch applied');
}

const gmEntry = state.entries.find((e) => e.id === 'turn-2');
if (!gmEntry || gmEntry.content !== turnResult.narration) {
  fail('pipeline: GM entry not merged');
} else {
  ok('pipeline: GM entry merged');
}

if (beforeHash === afterHash) {
  fail('pipeline: beforeHash should differ from afterHash');
} else {
  ok('pipeline: state hash changed');
}

const loreEntries = [
  { id: 'e1', keys: ['dragon'], comment: 'Dragon Lore', priority: 10 },
  { id: 'e2', keys: ['town'], use_regex: true, comment: 'Town Regex', insertion_order: 20 },
  { id: 'e3', keys: ['magic'], secondary_keys: ['scroll'], comment: 'Magic Scroll', priority: 5 }
];
const hint = `${turnResult.narration}\nattack the dragon over the town square`;
const loreHits = matchEntriesAgainstText(loreEntries, hint, 5);
const labels = loreHits.map((e) => e.comment || e.id);
if (!labels.includes('Dragon Lore')) {
  fail('pipeline: lorebook substring match');
} else {
  ok('pipeline: lorebook substring match');
}
if (!labels.includes('Town Regex')) {
  fail('pipeline: lorebook regex match');
} else {
  ok('pipeline: lorebook regex match');
}
if (labels.includes('Magic Scroll')) {
  fail('pipeline: secondary_keys should block Magic Scroll');
} else {
  ok('pipeline: secondary_keys AND logic');
}

if (failed > 0) {
  process.exit(1);
}
console.log('\nturn_result pipeline tests passed.');