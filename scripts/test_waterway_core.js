#!/usr/bin/env node
'use strict';

const assert = require('assert');
const { generateWaterways, parseWaterways } = require('../out/waterwayCore');

const forge = {
  format: 'world-forge-v1',
  meta: { worldName: 'Water Test', worldSeed: 'stable-seed' },
  geography: {
    regions: [
      { id: 'sea', name: 'Sea', type: 'ocean', biome: 'sea', x: 80, y: 500, connectedTo: ['coast'] },
      { id: 'coast', name: 'Coast', type: 'urban', biome: 'coast', x: 260, y: 500, connectedTo: ['sea', 'hills'] },
      { id: 'hills', name: 'Hills', type: 'wilderness', biome: 'hills', x: 650, y: 400, connectedTo: ['coast'] },
    ],
    locations: [
      { id: 'port-a', name: 'Port A', type: 'settlement', regionId: 'coast' },
      { id: 'port-b', name: 'Port B', type: 'settlement', regionId: 'coast' },
      { id: 'hill-camp', name: 'Camp', type: 'wilderness', regionId: 'hills' },
    ],
  }, factions: [], loreHistory: [], initialNpcs: [],
};

const a = generateWaterways(forge);
const b = generateWaterways(forge);
assert.deepStrictEqual(a, b, 'same seed must generate byte-equivalent graph data');
assert.strictEqual(a.version, 1);
assert.strictEqual(a.resolution, 128);
assert.ok(a.nodes.every(n => n.id && n.x >= 0 && n.x <= 1000 && n.y >= 0 && n.y <= 1000));
assert.ok(a.edges.every(e => e.from !== e.to && e.points.length >= 2 && e.length > 0));
assert.strictEqual(a.seaRows.length, 128);
assert.ok(a.seaRows.every(row => /^[012]{128}$/.test(row)));
assert.deepStrictEqual(parseWaterways(a), a);

function invalid(mutator, message) {
  const copy = JSON.parse(JSON.stringify(a));
  mutator(copy);
  assert.throws(() => parseWaterways(copy), /Invalid waterways|Invalid water|Invalid crossing|Invalid road|Cyclic rivers/, message);
}
assert.strictEqual(parseWaterways(undefined), undefined);
for (const raw of [null, {}, { version: 2 }, { version: 1, resolution: 64 }]) {
  assert.throws(() => parseWaterways(raw), /Invalid waterways/);
}
invalid(w => { w.nodes.push({ ...w.nodes[0] }); }, 'duplicate node ids rejected');
invalid(w => { w.edges[0].from = 'missing'; }, 'dangling edge reference rejected');
invalid(w => { w.edges[0].points[0].x = -1; }, 'out of range edge point rejected');
invalid(w => { w.seaRows[0] = 'x'.repeat(128); }, 'malformed sea grid rejected');
invalid(w => { w.crossings.push({ ...w.crossings[0], id: 'bad', waterEdgeId: 'missing' }); }, 'dangling crossing rejected');
invalid(w => { w.crossings.push({ ...w.crossings[0] }); }, 'duplicate crossing ids rejected');
invalid(w => { w.roads[0].crossingIds = ['missing']; }, 'dangling road crossing rejected');
invalid(w => { w.seed = 42; }, 'non-string seed rejected');
invalid(w => { w.edges[0].from = w.edges[0].to; }, 'self-loop edge rejected');
invalid(w => { w.edges[0].points[0] = { x: 999, y: 999 }; }, 'edge endpoint mismatch rejected');
invalid(w => { w.edges[0].points[0] = { x: 999, y: 999 }; }, 'polyline bounds rejected');

const nodes = [{ id: 'a', x: 1, y: 1, regionId: 'r', kind: 'junction' }, { id: 'b', x: 2, y: 2, regionId: 'r', kind: 'mouth' }];
const cycle = { version: 1, seed: 'x', resolution: 128, nodes, edges: [
  { id: 'e1', from: 'a', to: 'b', points: [{x:1,y:1},{x:2,y:2}], kind: 'river', width: 1, depth: 1, length: 1 },
  { id: 'e2', from: 'b', to: 'a', points: [{x:2,y:2},{x:1,y:1}], kind: 'stream', width: 1, depth: 1, length: 1 },
], crossings: [], roads: [], ports: {}, seaRows: Array(128).fill('0'.repeat(128)) };
assert.throws(() => parseWaterways(cycle), /Cyclic rivers/);
const locationIds = new Set(['port-a', 'port-b', 'hill-camp']);
const regionIds = new Set(['sea', 'coast', 'hills']);
assert.deepStrictEqual(parseWaterways(a, locationIds, regionIds), a);
assert.throws(() => parseWaterways(a, new Set(['other']), regionIds), /Invalid water ports\/grid|Invalid road/);
console.log('waterway core: all tests passed');
