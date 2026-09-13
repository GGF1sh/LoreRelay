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

console.log('water navigation host: all guard tests passed');
