#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { handleWaterNavigation } = require('../out/waterNavigationHost');
const { navigationGameWriteError, navigationVehicleWriteError } = require('../out/waterNavigationAuthority');

function workspace() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'water-nav-host-'));
  const nodes = [{ id: 'wa', x: 10, y: 10, regionId: 'r', kind: 'sea' }, { id: 'wb', x: 20, y: 10, regionId: 'r', kind: 'sea' }];
  const waterways = { version: 1, seed: 'x', resolution: 128, nodes, edges: [{ id: 'coast', from: 'wa', to: 'wb', points: [{ x: 10, y: 10 }, { x: 20, y: 10 }], kind: 'coastal', width: 2, depth: 2, length: 100 }], crossings: [], roads: [{ id: 'road-a-b', from: 'a', to: 'b', points: [{ x: 10, y: 10 }, { x: 20, y: 10 }], crossingIds: [], length: 100 }], ports: { a: 'wa', b: 'wb' }, seaRows: Array(128).fill('0'.repeat(128)) };
  const access = { requiredAccessTags: ['road'], allowedVehicleSizeMax: 'small' };
  const forge = { format: 'world-forge-v1', meta: { worldName: 'x', worldSeed: 'x' }, geography: { regions: [{ id: 'r', name: 'R', type: 'urban', biome: 'coast' }, { id: 'hidden', name: 'Hidden', type: 'wilderness', biome: 'forest' }], locations: [{ id: 'a', name: 'A', type: 'settlement', regionId: 'r', vehicleAccess: access }, { id: 'b', name: 'B', type: 'settlement', regionId: 'r', vehicleAccess: access }, { id: 'c', name: 'C', type: 'settlement', regionId: 'hidden', vehicleAccess: access }], waterways }, factions: [], loreHistory: [], initialNpcs: [] };
  fs.writeFileSync(path.join(root, 'world_forge.json'), JSON.stringify(forge));
  fs.writeFileSync(path.join(root, 'game_state.json'), JSON.stringify({ schemaVersion: 1, entries: [], world: { currentLocationId: 'a', discoveredRegionIds: ['r'] } }));
  fs.writeFileSync(path.join(root, 'vehicle_state.json'), JSON.stringify({ version: 1, activeVehicleId: 'boat', vehicles: [{ id: 'boat', name: 'Boat', kind: 'boat', owner: { type: 'player' }, status: 'parked', locationId: 'a', access: { sizeClass: 'small', accessTags: ['road'] }, mobility: { rangeBand: 'regional' }, durability: { hp: 100, maxHp: 100 }, waterProfile: { width: 1, draft: 1, airDraft: 1, seaworthiness: 0 } }] }));
  return root;
}
function call(root, message) { const out = []; const returned = handleWaterNavigation(root, message, v => out.push(v)); return { returned, value: out[0] }; }

const root = workspace();
assert.strictEqual(navigationGameWriteError(root, { world: { currentLocationId: 'a' } }, { world: { currentLocationId: 'a' } }), undefined);
assert.match(navigationGameWriteError(root, { world: { currentLocationId: 'a' } }, { world: { currentLocationId: 'c' } }) || '', /水系|航路|移動|無効/);
const activeState = JSON.parse(fs.readFileSync(path.join(root, 'vehicle_state.json'), 'utf8'));
assert.match(navigationVehicleWriteError(root, activeState, { ...activeState, vehicles: activeState.vehicles.map(v => ({ ...v, locationId: 'b' })) }) || '', /航路|位置/);
assert.strictEqual(navigationVehicleWriteError(root, activeState, activeState), undefined);
const preview = call(root, { action: 'preview', destination: 'b', vehicleId: 'boat' });
assert.strictEqual(preview.value.ok, true);
assert.ok(preview.value.quoteId);
assert.strictEqual(preview.value.route.damage, 5);
const quoteId = preview.value.quoteId;
const noDamage = call(root, { action: 'depart', quoteId });
assert.strictEqual(noDamage.value.ok, false);
assert.strictEqual(JSON.parse(fs.readFileSync(path.join(root, 'game_state.json'), 'utf8')).world.currentLocationId, 'a');
const departed = call(root, { action: 'depart', quoteId, confirmDamage: true });
assert.strictEqual(departed.value.ok, true);
const replayed = call(root, { action: 'depart', quoteId });
assert.strictEqual(replayed.value.replayed, true);
const gameAfter = JSON.parse(fs.readFileSync(path.join(root, 'game_state.json'), 'utf8'));
const vehicleAfter = JSON.parse(fs.readFileSync(path.join(root, 'vehicle_state.json'), 'utf8'));
assert.strictEqual(gameAfter.world.currentLocationId, 'b');
assert.strictEqual(vehicleAfter.vehicles[0].locationId, 'b');
assert.strictEqual(vehicleAfter.vehicles[0].durability.hp, 95);
assert.strictEqual(vehicleAfter.vehicles[0].mobileBase, undefined, 'ordinary boats must not gain a mobile-base link');

function mobileWorkspace() {
  const root = workspace();
  const fleetPath = path.join(root, 'vehicle_state.json');
  const fleet = JSON.parse(fs.readFileSync(fleetPath, 'utf8'));
  fleet.vehicles[0].mobileBase = { settlementId: 'boat_interior', mode: 'ship', layoutProfile: 'deck', interiorAccess: 'open', dockedAtLocationId: 'a' };
  fs.writeFileSync(fleetPath, JSON.stringify(fleet));
  return root;
}
const mobileRoot = mobileWorkspace();
const mobilePreview = call(mobileRoot, { action: 'preview', destination: 'b', vehicleId: 'boat' });
assert.strictEqual(call(mobileRoot, { action: 'depart', quoteId: mobilePreview.value.quoteId, confirmDamage: true }).value.ok, true);
const mobileAfterText = fs.readFileSync(path.join(mobileRoot, 'vehicle_state.json'), 'utf8');
const mobileAfter = JSON.parse(mobileAfterText).vehicles[0];
assert.strictEqual(mobileAfter.locationId, 'b');
assert.strictEqual(mobileAfter.mobileBase.dockedAtLocationId, 'b', 'arriving mobile base must not retain departure dock');
assert.strictEqual(mobileAfter.mobileBase.settlementId, 'boat_interior');
assert.strictEqual(mobileAfter.mobileBase.interiorAccess, 'open');
assert.strictEqual(mobileAfter.durability.hp, 95);
assert.strictEqual(call(mobileRoot, { action: 'depart', quoteId: mobilePreview.value.quoteId, confirmDamage: true }).value.replayed, true);
assert.strictEqual(fs.readFileSync(path.join(mobileRoot, 'vehicle_state.json'), 'utf8'), mobileAfterText, 'replay cannot damage or redock twice');

const mobileFootRoot = mobileWorkspace();
const mobileFoot = call(mobileFootRoot, { action: 'preview', destination: 'b' });
assert.strictEqual(call(mobileFootRoot, { action: 'depart', quoteId: mobileFoot.value.quoteId }).value.ok, true);
assert.strictEqual(JSON.parse(fs.readFileSync(path.join(mobileFootRoot, 'vehicle_state.json'), 'utf8')).vehicles[0].mobileBase.dockedAtLocationId, 'a', 'walking must leave the ship at its dock');

// Adversarial verification: fail each journal stage through the real host path.
const navigationStore = require('../out/waterNavigationStore');
const realCommit = navigationStore.commitWaterNavigation;
for (const stage of [0, 1, 2]) {
  const failureRoot = mobileWorkspace();
  const files = ['game_state.json', 'vehicle_state.json'];
  const before = files.map(name => fs.readFileSync(path.join(failureRoot, name), 'utf8'));
  files.forEach(name => fs.writeFileSync(path.join(failureRoot, name + '.bak'), 'existing-backup'));
  const quote = call(failureRoot, { action: 'preview', destination: 'b', vehicleId: 'boat' });
  navigationStore.commitWaterNavigation = (root, hash, id, writes) => realCommit(root, hash, id, writes, n => { if (n === stage) throw Error('injected mobile-base failure'); });
  try {
    const result = call(failureRoot, { action: 'depart', quoteId: quote.value.quoteId, confirmDamage: true });
    assert.strictEqual(result.value.ok, false);
    assert.match(result.value.error, /injected mobile-base failure/);
  } finally { navigationStore.commitWaterNavigation = realCommit; }
  files.forEach((name, i) => {
    assert.strictEqual(fs.readFileSync(path.join(failureRoot, name), 'utf8'), before[i], `stage ${stage}: ${name} restored with original dock`);
    assert.strictEqual(fs.readFileSync(path.join(failureRoot, name + '.bak'), 'utf8'), 'existing-backup');
  });
  assert.strictEqual(navigationStore.navigationReceiptExists(failureRoot, quote.value.quoteId), false);
}

// Fresh workspace: stale quote is rejected after a world change.
const staleRoot = workspace();
const stale = call(staleRoot, { action: 'preview', destination: 'b', vehicleId: 'boat' });
const changedGame = JSON.parse(fs.readFileSync(path.join(staleRoot, 'game_state.json'), 'utf8')); changedGame.world.currentLocationId = 'a'; changedGame.world.note = 'changed';
fs.writeFileSync(path.join(staleRoot, 'game_state.json'), JSON.stringify(changedGame));
assert.strictEqual(call(staleRoot, { action: 'depart', quoteId: stale.value.quoteId }).value.ok, false);

const hpRoot = workspace();
const hpQuote = call(hpRoot, { action: 'preview', destination: 'b', vehicleId: 'boat' });
const hpDoc = JSON.parse(fs.readFileSync(path.join(hpRoot, 'vehicle_state.json'), 'utf8')); hpDoc.vehicles[0].durability.hp = 99;
fs.writeFileSync(path.join(hpRoot, 'vehicle_state.json'), JSON.stringify(hpDoc));
assert.strictEqual(call(hpRoot, { action: 'depart', quoteId: hpQuote.value.quoteId, confirmDamage: true }).value.ok, false);

const npcRoot = workspace();
const npcDoc = JSON.parse(fs.readFileSync(path.join(npcRoot, 'vehicle_state.json'), 'utf8')); npcDoc.vehicles[0].owner.type = 'npc';
fs.writeFileSync(path.join(npcRoot, 'vehicle_state.json'), JSON.stringify(npcDoc));
assert.strictEqual(call(npcRoot, { action: 'preview', destination: 'b', vehicleId: 'boat' }).value.ok, false);
assert.strictEqual(call(root, { action: 'preview', destination: 'c', vehicleId: 'boat' }).value.ok, false);

// Existing foot selection remains untouched when no vehicle is selected.
const footRoot = workspace();
const foot = call(footRoot, { action: 'preview', destination: 'b' });
assert.strictEqual(foot.value.ok, true);
assert.strictEqual(foot.value.route.status, 'safe');
assert.strictEqual(call(footRoot, { action: 'depart', quoteId: foot.value.quoteId }).value.ok, true);
assert.strictEqual(JSON.parse(fs.readFileSync(path.join(footRoot, 'vehicle_state.json'), 'utf8')).vehicles[0].locationId, 'a');
assert.strictEqual(JSON.parse(fs.readFileSync(path.join(footRoot, 'game_state.json'), 'utf8')).world.currentLocationId, 'b');

for (const message of [
  { action: 'depart' },
  { action: 'depart', quoteId: 'missing' },
  { action: 'preview', destination: 'unknown' },
  { action: 'preview', destination: '../outside' },
]) {
  const result = call(root, message);
  assert.ok(result.value && result.value.type === 'waterNavigationResult');
  assert.strictEqual(result.value.ok, false, `invalid host request rejected: ${message.action}`);
}

// Host must fail closed when the forge is malformed or waterways are absent.
assert.strictEqual(call(root, { action: 'preview', destination: 'missing' }).value.ok, false);
fs.writeFileSync(path.join(root, 'world_forge.json'), '{bad json');
assert.strictEqual(call(root, { action: 'preview', destination: 'a' }).value.ok, false);

// Two distinct locations sharing one port must not yield an accepted zero-edge quote.
const sharedRoot = workspace();
const sharedForge = JSON.parse(fs.readFileSync(path.join(sharedRoot, 'world_forge.json'), 'utf8'));
sharedForge.geography.waterways.ports.b = 'wa';
fs.writeFileSync(path.join(sharedRoot, 'world_forge.json'), JSON.stringify(sharedForge));
const sharedPreview = call(sharedRoot, { action: 'preview', destination: 'b', vehicleId: 'boat' });
assert.strictEqual(sharedPreview.value.ok, true);
assert.strictEqual(sharedPreview.value.quoteId, null, 'blocked shared-port route must not create a quote');
assert.strictEqual(sharedPreview.value.route.status, 'blocked');
assert.match(sharedPreview.value.route.reasons.join(' '), /別々.*接続点|実際.*水上接続/);
const sharedDepart = call(sharedRoot, { action: 'depart', quoteId: 'shared-zero-edge' });
assert.strictEqual(sharedDepart.value.ok, false);
assert.strictEqual(JSON.parse(fs.readFileSync(path.join(sharedRoot, 'game_state.json'), 'utf8')).world.currentLocationId, 'a');
const sharedVehicle = JSON.parse(fs.readFileSync(path.join(sharedRoot, 'vehicle_state.json'), 'utf8')).vehicles[0];
assert.strictEqual(sharedVehicle.locationId, 'a');
assert.strictEqual(sharedVehicle.durability.hp, 100);

console.log('water navigation host: all guard tests passed');
