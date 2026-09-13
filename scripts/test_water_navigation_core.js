#!/usr/bin/env node
'use strict';

const assert = require('assert');
const { evaluateNavigation } = require('../out/waterNavigationCore');

const node = (id, x) => ({ id, x, y: 10, regionId: 'r', kind: 'sea' });
const edge = (id, from, to, kind, width = 2, depth = 2, length = 100, points = [{ x: 10, y: 10 }, { x: 20, y: 10 }]) => ({ id, from, to, kind, width, depth, length, points });
const locations = [
  { id: 'a', name: 'A', type: 'settlement', regionId: 'r', vehicleAccess: { road: true, offroad: true } },
  { id: 'b', name: 'B', type: 'settlement', regionId: 'r', vehicleAccess: { road: true, offroad: true } },
];
const base = {
  meta: { worldName: 'Navigation Test', worldSeed: 'nav' },
  geography: { regions: [{ id: 'r', name: 'R', type: 'urban', biome: 'coast' }], locations },
  factions: [], loreHistory: [], initialNpcs: [],
};
function waterways(edges, crossings = [], roads = []) {
  return { version: 1, seed: 'nav', resolution: 128, nodes: [node('wa', 10), node('wb', 20)], edges, crossings, roads, ports: { a: 'wa', b: 'wb' }, seaRows: Array(128).fill('0'.repeat(128)) };
}
const boat = (overrides = {}) => ({ id: 'boat', name: 'Boat', kind: 'boat', locationId: 'a', status: 'parked', access: { sizeClass: 'small', accessTags: ['road'] }, mobility: { rangeBand: 'regional' }, durability: { hp: 100, maxHp: 100 }, waterProfile: { width: 1, draft: 1, airDraft: 1, seaworthiness: 2 }, ...overrides });

const river = edge('river', 'wa', 'wb', 'river');
let result = evaluateNavigation({ ...base, geography: { ...base.geography, waterways: waterways([river]) } }, 'a', 'b', boat());
assert.strictEqual(result.preferred.status, 'safe', 'small boat should traverse a compatible river');
assert.strictEqual(result.preferred.hpAfter, 100);
assert.strictEqual(evaluateNavigation({ ...base, geography: { ...base.geography, waterways: waterways([edge('deep', 'wa', 'wb', 'river', 1, 1)]) } }, 'a', 'b', boat({ waterProfile: { width: 2, draft: 2, airDraft: 1, seaworthiness: 2 } })).preferred.status, 'blocked', 'large shallow boat must be blocked by width/depth');
assert.strictEqual(evaluateNavigation({ ...base, geography: { ...base.geography, waterways: waterways([edge('ocean', 'wa', 'wb', 'ocean', 3, 3)]) } }, 'a', 'b', boat({ waterProfile: { width: 1, draft: 1, airDraft: 1, seaworthiness: 0 } })).preferred.status, 'blocked', 'ocean vessel with insufficient seaworthiness is blocked');

const bridge = { id: 'bridge-1', waterEdgeId: 'river', x: 15, y: 10, kind: 'bridge', clearance: 1, maxWidth: 3, maxLoad: 3, maxVehicleSize: 3 };
assert.strictEqual(evaluateNavigation({ ...base, geography: { ...base.geography, waterways: waterways([river], [bridge]) } }, 'a', 'b', boat({ waterProfile: { width: 1, draft: 1, airDraft: 2, seaworthiness: 2 } })).preferred.status, 'blocked', 'air draft above bridge clearance is blocked');

const roads = [{ id: 'road', from: 'a', to: 'b', points: [{ x: 10, y: 10 }, { x: 20, y: 10 }], crossingIds: ['ferry'], length: 100 }];
const ferry = { id: 'ferry', waterEdgeId: 'river', x: 15, y: 10, kind: 'ferry', clearance: 1, maxWidth: 1, maxLoad: 1, maxVehicleSize: 1 };
const roadWorld = { ...base, geography: { ...base.geography, waterways: waterways([river], [ferry], roads) } };
assert.strictEqual(evaluateNavigation(roadWorld, 'a', 'b', { ...boat(), kind: 'truck', waterProfile: undefined, access: { sizeClass: 'medium', accessTags: ['road'] } }).preferred.status, 'blocked', 'road vehicle too large for ferry is blocked');

const hazard = edge('coast', 'wa', 'wb', 'coastal', 3, 3, 300);
const riskyWorld = { ...base, geography: { ...base.geography, waterways: waterways([hazard]) } };
result = evaluateNavigation(riskyWorld, 'a', 'b', boat({ waterProfile: { width: 1, draft: 1, airDraft: 1, seaworthiness: 0 } }));
assert.strictEqual(result.preferred.status, 'risky');
assert.strictEqual(result.preferred.damage, 5, 'one connected hazardous stretch costs one 5% damage event');
assert.strictEqual(result.preferred.hpAfter, 95);
assert.strictEqual(evaluateNavigation(riskyWorld, 'a', 'b', boat({ mobility: { rangeBand: 'local' } })).preferred.status, 'blocked', 'range limit blocks overlong route');
assert.strictEqual(evaluateNavigation(riskyWorld, 'a', 'b', boat({ durability: { hp: 5, maxHp: 100 }, waterProfile: { width: 1, draft: 1, airDraft: 1, seaworthiness: 0 } })).preferred.status, 'blocked', 'insufficient HP blocks forecast damage');

for (const args of [['missing', 'b'], ['a', 'missing'], ['a', 'a']]) assert.strictEqual(evaluateNavigation(riskyWorld, ...args, boat()).preferred.status, 'blocked');
assert.strictEqual(evaluateNavigation(riskyWorld, 'a', 'b', boat({ locationId: 'elsewhere' })).preferred.status, 'blocked', 'vehicle position must match origin');
assert.strictEqual(evaluateNavigation(riskyWorld, 'a', 'b').preferred.status, 'blocked', 'no vehicle cannot use water port route');
console.log('water navigation core: all tests passed');
