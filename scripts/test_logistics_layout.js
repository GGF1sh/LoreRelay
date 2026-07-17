#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'webview', 'modules', '85b1-logistics-layout.js'), 'utf8');
const context = { Map, Set, Math, Number, String, Object, Array };
context.globalThis = context;
vm.runInNewContext(`${source}\nglobalThis.api={computeLogisticsLayout,LOGISTICS_LAYOUT_ALGO};`, context);
const { computeLogisticsLayout } = context.api;
let failed = 0;
function test(name, fn) {
  try { fn(); console.log(`OK: ${name}`); } catch (error) { failed++; console.error(`FAIL: ${name}`); console.error(error.stack); }
}
function snapshot(layout) {
  return JSON.parse(JSON.stringify({
    nodes: [...layout.nodes.entries()].sort((a, b) => a[0].localeCompare(b[0])),
    regions: [...layout.regions.entries()].sort((a, b) => a[0].localeCompare(b[0])),
    bounds: layout.bounds, algo: layout.algo, diagnostics: layout.diagnostics,
  }));
}
const nodes = [
  { id: 'reg_a', kind: 'region', label: 'Alpha' },
  { id: 'a1', kind: 'facility', regionId: 'reg_a' },
  { id: 'a2', kind: 'market', regionId: 'reg_a' },
  { id: 'reg_b', kind: 'region', label: 'Beta' },
  { id: 'b1', kind: 'facility', regionId: 'reg_b' },
  { id: 'b2', kind: 'market', regionId: 'reg_b' },
  { id: 'loose', kind: 'region', label: 'Loose' },
];
const routes = [
  { id: 'a1_a2', fromNodeId: 'a1', toNodeId: 'a2', volume: 2, effectiveCapacity: 4 },
  { id: 'a2_a1', fromNodeId: 'a2', toNodeId: 'a1', volume: 1, effectiveCapacity: 4 },
  { id: 'b1_b2', fromNodeId: 'b1', toNodeId: 'b2', volume: 3, effectiveCapacity: 5 },
  { id: 'a_b', fromNodeId: 'a2', toNodeId: 'b1', volume: 7, effectiveCapacity: 8 },
];

test('same input is byte-identical and uses the required algorithm', () => {
  const first = snapshot(computeLogisticsLayout(nodes, routes));
  const second = snapshot(computeLogisticsLayout(nodes, routes));
  assert.deepStrictEqual(second, first);
  assert.strictEqual(first.algo, 'region-hybrid-1');
});

test('shuffled node and route inputs are byte-identical', () => {
  const base = snapshot(computeLogisticsLayout(nodes, routes));
  assert.deepStrictEqual(snapshot(computeLogisticsLayout(nodes.slice().reverse(), routes.slice().reverse())), base);
});

test('cycle breaking is deterministic and ordering performs exactly four sweeps', () => {
  const layout = computeLogisticsLayout(nodes, routes);
  assert.deepStrictEqual(Array.from(layout.diagnostics.cycleBreaks), ['a2_a1']);
  assert.strictEqual(layout.diagnostics.sweeps, 4);
});

test('automatic boxes do not overlap and assigned nodes stay in padded region boxes', () => {
  const layout = computeLogisticsLayout(nodes, routes);
  const entries = [...layout.nodes.entries()];
  for (let i = 0; i < entries.length; i++) for (let j = i + 1; j < entries.length; j++) {
    const [idA, a] = entries[i]; const [idB, b] = entries[j];
    if (a.regionId !== b.regionId) { continue; }
    assert.ok(Math.abs(a.x - b.x) * 2 >= a.w + b.w || Math.abs(a.y - b.y) * 2 >= a.h + b.h, `${idA}/${idB}`);
  }
  for (const [id, pos] of entries) {
    if (pos.regionId === '__unassigned') { continue; }
    const box = layout.regions.get(pos.regionId);
    assert.ok(pos.x - pos.w / 2 >= box.x + 28 && pos.y - pos.h / 2 >= box.y + 28, id);
    assert.ok(pos.x + pos.w / 2 <= box.x + box.w - 28 && pos.y + pos.h / 2 <= box.y + box.h - 4, id);
  }
  assert.strictEqual(layout.regions.has('__unassigned'), false);
});

test('a change confined to region A leaves region B positions byte-identical', () => {
  const before = computeLogisticsLayout(nodes, routes);
  const after = computeLogisticsLayout([...nodes, { id: 'a3', kind: 'store', regionId: 'reg_a' }], routes);
  for (const id of ['b1', 'b2']) assert.deepStrictEqual(after.nodes.get(id), before.nodes.get(id));
});

test('manual positions apply after automatic layout, reject wrong-region entries, and remain obstacles', () => {
  const manual = { a1: { x: 900, y: 900, regionId: 'reg_a', ts: 1 }, b1: { x: 1, y: 1, regionId: 'wrong', ts: 1 } };
  const layout = computeLogisticsLayout(nodes, routes, { manualPositions: manual });
  assert.deepStrictEqual({ x: layout.nodes.get('a1').x, y: layout.nodes.get('a1').y }, { x: 900, y: 900 });
  assert.ok(layout.diagnostics.droppedManualIds.includes('b1'));
  assert.ok(layout.nodes.get('a2').y !== 900 || layout.nodes.get('a2').x !== 900);
});

test('manual entries can tombstone removed nodes and restore when re-added without input mutation', () => {
  const manual = { gone: { x: 77, y: 88, regionId: '__unassigned', ts: 2 } };
  const absent = computeLogisticsLayout(nodes, routes, { manualPositions: manual });
  assert.deepStrictEqual(manual.gone, { x: 77, y: 88, regionId: '__unassigned', ts: 2 });
  assert.strictEqual(absent.nodes.has('gone'), false);
  const returned = computeLogisticsLayout([...nodes, { id: 'gone', kind: 'facility' }], routes, { manualPositions: manual });
  assert.deepStrictEqual({ x: returned.nodes.get('gone').x, y: returned.nodes.get('gone').y }, { x: 77, y: 88 });
});

if (failed) process.exit(1);
console.log('logistics layout: all tests passed.');
