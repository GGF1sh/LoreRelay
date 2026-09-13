#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { commitWaterNavigation, recoverWaterNavigation, navigationDigest, navigationPending, navigationReceiptExists } = require('../out/waterNavigationStore');

function workspace() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'water-nav-store-'));
  fs.writeFileSync(path.join(root, 'world_forge.json'), '{"world":"one"}');
  fs.writeFileSync(path.join(root, 'game_state.json'), 'game-before');
  fs.writeFileSync(path.join(root, 'vehicle_state.json'), 'vehicle-before');
  fs.writeFileSync(path.join(root, 'game_state.json.bak'), 'game-backup');
  fs.writeFileSync(path.join(root, 'vehicle_state.json.bak'), 'vehicle-backup');
  return root;
}
function writes() { return [
  { name: 'game_state.json', before: 'game-before', after: 'game-after' },
  { name: 'vehicle_state.json', before: 'vehicle-before', after: 'vehicle-after' },
]; }
function read(root, name) { return fs.readFileSync(path.join(root, name), 'utf8'); }
const worldHash = root => navigationDigest(read(root, 'world_forge.json'));

for (const stage of [0, 1, 2]) {
  const root = workspace();
  assert.throws(() => commitWaterNavigation(root, worldHash(root), `stage-${stage}`, writes(), n => { if (n === stage) throw Error('injected'); }));
  assert.strictEqual(read(root, 'game_state.json'), 'game-before', `stage ${stage} restores game ledger`);
  assert.strictEqual(read(root, 'vehicle_state.json'), 'vehicle-before', `stage ${stage} restores vehicle ledger`);
  assert.strictEqual(read(root, 'game_state.json.bak'), 'game-backup', '.bak is preserved');
  assert.strictEqual(read(root, 'vehicle_state.json.bak'), 'vehicle-backup', '.bak is preserved');
}

// A prepared journal is recoverable after a simulated restart.
{
  const root = workspace();
  fs.writeFileSync(path.join(root, 'game_state.json'), 'game-after');
  fs.writeFileSync(path.join(root, 'vehicle_state.json'), 'vehicle-after');
  fs.writeFileSync(path.join(root, '.water-navigation.json'), JSON.stringify({ version: 1, phase: 'prepared', worldHash: worldHash(root), requestId: 'crashed', writes: writes(), receipts: [] }));
  assert.strictEqual(navigationPending(root), true);
  recoverWaterNavigation(root);
  assert.strictEqual(read(root, 'game_state.json'), 'game-before');
  assert.strictEqual(read(root, 'vehicle_state.json'), 'vehicle-before');
  assert.strictEqual(navigationPending(root), false);
}

// World or third-party ledger edits must block recovery without overwriting.
for (const kind of ['world', 'ledger']) {
  const root = workspace();
  fs.writeFileSync(path.join(root, 'game_state.json'), 'game-after');
  fs.writeFileSync(path.join(root, 'vehicle_state.json'), 'vehicle-after');
  fs.writeFileSync(path.join(root, '.water-navigation.json'), JSON.stringify({ version: 1, phase: 'prepared', worldHash: worldHash(root), requestId: 'conflict', writes: writes(), receipts: [] }));
  if (kind === 'world') fs.writeFileSync(path.join(root, 'world_forge.json'), '{"world":"changed"}');
  else fs.writeFileSync(path.join(root, 'game_state.json'), 'third-party');
  assert.throws(() => recoverWaterNavigation(root));
  assert.strictEqual(read(root, kind === 'ledger' ? 'game_state.json' : 'world_forge.json'), kind === 'ledger' ? 'third-party' : '{"world":"changed"}');
}

{
  const root = workspace();
  assert.strictEqual(commitWaterNavigation(root, worldHash(root), 'once', writes()), 'committed');
  assert.strictEqual(commitWaterNavigation(root, worldHash(root), 'once', writes()), 'replayed');
  assert.strictEqual(navigationReceiptExists(root, 'once'), true);
  for (const bad of ['../evil.json', 'world_forge.json', '.water-navigation.json']) assert.throws(() => commitWaterNavigation(root, worldHash(root), 'bad-' + bad, [{ name: bad, before: '', after: '' }]));
}

// Refuse a symlinked ledger when the platform permits creating one.
{
  const root = workspace();
  try {
    fs.unlinkSync(path.join(root, 'game_state.json'));
    fs.symlinkSync(path.join(root, 'vehicle_state.json'), path.join(root, 'game_state.json'));
    assert.throws(() => commitWaterNavigation(root, worldHash(root), 'symlink', writes()), /リンク|symlink|link/i);
  } catch (error) {
    if (!/privilege|symbolic|symlink|not supported/i.test(String(error))) throw error;
  }
}

console.log('water navigation store: all tests passed');
