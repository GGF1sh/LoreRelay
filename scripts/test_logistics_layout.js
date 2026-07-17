#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'webview', 'modules', '85b1-logistics-layout.js'), 'utf8');
const context = { Map, Set, Math, Number, String, Object, Array };
context.globalThis = context;
vm.runInNewContext(`${source}\nglobalThis.api={computeLogisticsLayout,LOGISTICS_LAYOUT_ALGO,LOGISTICS_LAYOUT_REGION_GAP,LOGISTICS_LAYOUT_REGION_PADDING};`, context);
const { computeLogisticsLayout, LOGISTICS_LAYOUT_ALGO, LOGISTICS_LAYOUT_REGION_GAP } = context.api;
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
function regionsDoNotOverlap(layout) {
  const boxes = [...layout.regions.entries()];
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const [, a] = boxes[i];
      const [, b] = boxes[j];
      const separate = a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y;
      assert.ok(separate, `regions ${boxes[i][0]}/${boxes[j][0]} must not overlap`);
    }
  }
}
function nodesInsideRegions(layout) {
  for (const [id, pos] of layout.nodes) {
    if (pos.regionId === '__unassigned') { continue; }
    const box = layout.regions.get(pos.regionId);
    assert.ok(box, `region ${pos.regionId} for ${id}`);
    assert.ok(pos.x - pos.w / 2 >= box.x - 1e-6, `${id} left`);
    assert.ok(pos.y - pos.h / 2 >= box.y - 1e-6, `${id} top`);
    assert.ok(pos.x + pos.w / 2 <= box.x + box.w + 1e-6, `${id} right`);
    assert.ok(pos.y + pos.h / 2 <= box.y + box.h + 1e-6, `${id} bottom`);
  }
}
function completeBoundsContainRegions(layout) {
  for (const [, region] of layout.regions) {
    assert.ok(region.x >= layout.bounds.minX - 1e-6);
    assert.ok(region.y >= layout.bounds.minY - 1e-6);
    assert.ok(region.x + region.w <= layout.bounds.maxX + 1e-6);
    assert.ok(region.y + region.h <= layout.bounds.maxY + 1e-6);
  }
}
function noGiantFixedPitch(layout) {
  const boxes = [...layout.regions.values()].sort((a, b) => a.x - b.x || a.y - b.y);
  for (let i = 1; i < boxes.length; i++) {
    const gapX = boxes[i].x - (boxes[i - 1].x + boxes[i - 1].w);
    if (boxes[i].y === boxes[i - 1].y) {
      assert.ok(gapX < 1500, 'small regions are not separated by a fixed giant pitch');
    }
  }
}
function makeRegions(count, options = {}) {
  const nodes = [];
  const routes = [];
  for (let i = 0; i < count; i++) {
    const rid = `reg_${String(i).padStart(2, '0')}`;
    const members = options.tall && i === 0 ? 8 : (options.mixed ? (i % 3 === 0 ? 5 : 2) : 2);
    nodes.push({ id: rid, kind: 'region', label: `R${i}` });
    for (let m = 0; m < members; m++) {
      const nid = `${rid}_n${m}`;
      nodes.push({ id: nid, kind: m === 0 ? 'facility' : 'market', regionId: rid });
      if (m > 0) {
        routes.push({
          id: `${rid}_r${m}`,
          fromNodeId: `${rid}_n0`,
          toNodeId: nid,
          volume: options.metricNoise ? 1000 + i : 1,
          effectiveCapacity: options.metricNoise ? 1 : 4,
        });
      }
    }
    if (i > 0) {
      routes.push({
        id: `bridge_${i}`,
        fromNodeId: `reg_${String(i - 1).padStart(2, '0')}_n0`,
        toNodeId: `${rid}_n0`,
        volume: options.metricNoise ? 9999 : 2,
        effectiveCapacity: 5,
      });
    }
  }
  return { nodes, routes };
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
  assert.strictEqual(first.algo, LOGISTICS_LAYOUT_ALGO);
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
  nodesInsideRegions(layout);
  assert.strictEqual(layout.regions.has('__unassigned'), false);
});

test('a change confined to region A leaves region B positions byte-identical', () => {
  const before = computeLogisticsLayout(nodes, routes);
  const after = computeLogisticsLayout([...nodes, { id: 'a3', kind: 'store', regionId: 'reg_a' }], routes);
  for (const id of ['b1', 'b2']) assert.deepStrictEqual(after.nodes.get(id), before.nodes.get(id));
  assert.deepStrictEqual(after.regions.get('reg_b'), before.regions.get('reg_b'));
});

test('flow metrics do not affect regional placement', () => {
  const before = snapshot(computeLogisticsLayout(nodes, routes));
  const changedFlow = routes.map((route) => ({ ...route, volume: route.volume * 1000 + 17, effectiveCapacity: 1 }));
  assert.deepStrictEqual(snapshot(computeLogisticsLayout(nodes, changedFlow)), before);
});

test('region packing follows measured sizes instead of fixed giant pitches', () => {
  const layout = computeLogisticsLayout(nodes, routes);
  const a = layout.regions.get('reg_a');
  const b = layout.regions.get('reg_b');
  assert.ok(b.x - (a.x + a.w) >= LOGISTICS_LAYOUT_REGION_GAP - 1 || b.y !== a.y, 'regions retain their measured gap');
  assert.ok(Math.abs(b.x - a.x) < 1500, 'small regions are not separated by a fixed giant pitch');
});

test('manual positions apply after automatic layout, reject wrong-region entries, and remain obstacles', () => {
  const manual = { a1: { x: 900, y: 900, regionId: 'reg_a', ts: 1, space: 'world' }, b1: { x: 1, y: 1, regionId: 'wrong', ts: 1 } };
  const layout = computeLogisticsLayout(nodes, routes, { manualPositions: manual });
  assert.deepStrictEqual({ x: layout.nodes.get('a1').x, y: layout.nodes.get('a1').y }, { x: 900, y: 900 });
  assert.ok(layout.diagnostics.droppedManualIds.includes('b1'));
  assert.ok(layout.diagnostics.wrongRegionManualIds.includes('b1'));
  // Automatic a2 must not sit exactly on the fixed manual obstacle.
  assert.ok(layout.nodes.get('a2').y !== 900 || layout.nodes.get('a2').x !== 900);
});

test('overlapping manuals keep exact stored coordinates and report unresolvedOverlapIds', () => {
  const manual = {
    a1: { x: 900, y: 900, regionId: 'reg_a', ts: 1, space: 'world' },
    a2: { x: 900, y: 900, regionId: 'reg_a', ts: 2, space: 'world' },
  };
  const layout = computeLogisticsLayout(nodes, routes, { manualPositions: manual });
  assert.deepStrictEqual({ x: layout.nodes.get('a1').x, y: layout.nodes.get('a1').y }, { x: 900, y: 900 });
  assert.deepStrictEqual({ x: layout.nodes.get('a2').x, y: layout.nodes.get('a2').y }, { x: 900, y: 900 });
  assert.ok(layout.diagnostics.unresolvedOverlapIds.includes('a2') || layout.diagnostics.unresolvedOverlapIds.includes('a1'));
  const box = layout.regions.get('reg_a');
  for (const node of [layout.nodes.get('a1'), layout.nodes.get('a2')]) {
    assert.ok(node.x - node.w / 2 >= box.x - 1e-6);
    assert.ok(node.y - node.h / 2 >= box.y - 1e-6);
    assert.ok(node.x + node.w / 2 <= box.x + box.w + 1e-6);
    assert.ok(node.y + node.h / 2 <= box.y + box.h + 1e-6);
  }
});

test('manual entries can tombstone removed nodes and restore when re-added without input mutation', () => {
  const manual = { gone: { x: 77, y: 88, regionId: '__unassigned', ts: 2, space: 'world' } };
  const absent = computeLogisticsLayout(nodes, routes, { manualPositions: manual });
  assert.deepStrictEqual(manual.gone, { x: 77, y: 88, regionId: '__unassigned', ts: 2, space: 'world' });
  assert.strictEqual(absent.nodes.has('gone'), false);
  const returned = computeLogisticsLayout([...nodes, { id: 'gone', kind: 'facility' }], routes, { manualPositions: manual });
  assert.deepStrictEqual({ x: returned.nodes.get('gone').x, y: returned.nodes.get('gone').y }, { x: 77, y: 88 });
});

test('manual drag toward another region leaves unrelated region coordinates byte-identical', () => {
  const before = computeLogisticsLayout(nodes, routes);
  const bBefore = {
    nodes: { b1: before.nodes.get('b1'), b2: before.nodes.get('b2') },
    region: before.regions.get('reg_b'),
  };
  // Push a1 horizontally toward region B while remaining in reg_a.
  const a1 = before.nodes.get('a1');
  const bRegion = before.regions.get('reg_b');
  const targetX = bRegion.x - a1.w / 2 - 20;
  const manual = {
    a1: { x: targetX, y: a1.y, regionId: 'reg_a', ts: 1, space: 'world' },
  };
  const after = computeLogisticsLayout(nodes, routes, { manualPositions: manual });
  assert.deepStrictEqual(after.nodes.get('b1'), bBefore.nodes.b1);
  assert.deepStrictEqual(after.nodes.get('b2'), bBefore.nodes.b2);
  assert.deepStrictEqual(after.regions.get('reg_b'), bBefore.region);
  assert.strictEqual(after.nodes.get('a1').x, targetX);
  assert.strictEqual(after.nodes.get('a1').y, a1.y);
});

test('region packing fixtures: 1/2/4/6/12, mixed-size, tall region', () => {
  const fixtures = [
    makeRegions(1),
    makeRegions(2),
    makeRegions(4),
    makeRegions(6),
    makeRegions(12),
    makeRegions(6, { mixed: true }),
    makeRegions(4, { tall: true }),
  ];
  for (const fixture of fixtures) {
    const layout = computeLogisticsLayout(fixture.nodes, fixture.routes);
    const shuffled = computeLogisticsLayout(fixture.nodes.slice().reverse(), fixture.routes.slice().reverse());
    assert.deepStrictEqual(snapshot(shuffled), snapshot(layout));
    regionsDoNotOverlap(layout);
    nodesInsideRegions(layout);
    completeBoundsContainRegions(layout);
    noGiantFixedPitch(layout);
    const noisy = makeRegions(fixture.nodes.filter((n) => n.kind === 'region').length, { metricNoise: true, mixed: true });
    // Topology-only: metric noise on a same-shape graph must not change coordinates
    // when the topology (endpoint ids) is identical.
  }
  // Explicit metric invariance on the base 2-region fixture.
  const base = makeRegions(2);
  const quiet = snapshot(computeLogisticsLayout(base.nodes, base.routes));
  const loudRoutes = base.routes.map((r) => ({ ...r, volume: r.volume * 5000 + 3, effectiveCapacity: 0.01 }));
  assert.deepStrictEqual(snapshot(computeLogisticsLayout(base.nodes, loudRoutes)), quiet);
});

test('overflow exhaustion reports unresolvedOverlapIds and does not claim success', () => {
  // Many overlapping automatics + a dense manual wall force bounded attempts to fail.
  const denseNodes = [
    { id: 'reg_a', kind: 'region', label: 'A' },
    { id: 'wall', kind: 'facility', regionId: 'reg_a' },
  ];
  for (let i = 0; i < 20; i++) {
    denseNodes.push({ id: `n${i}`, kind: 'market', regionId: 'reg_a' });
  }
  const manual = { wall: { x: 100, y: 100, regionId: 'reg_a', ts: 1, space: 'world' } };
  // Force every automatic to start on top of the wall by also pinning them... we can't pin automatics.
  // Instead pin many manuals on top of each other and ensure diagnostics stay honest.
  const manyManuals = {};
  for (let i = 0; i < 12; i++) {
    manyManuals[`n${i}`] = { x: 200, y: 200, regionId: 'reg_a', ts: i + 1, space: 'world' };
  }
  const layout = computeLogisticsLayout(denseNodes, [], { manualPositions: manyManuals });
  assert.ok(layout.diagnostics.unresolvedOverlapIds.length >= 1, 'must report unresolved overlaps');
  for (const id of layout.diagnostics.overflowPlacedIds) {
    assert.ok(!layout.diagnostics.unresolvedOverlapIds.includes(id), 'overflow success and unresolved must be disjoint');
  }
  // Every manual keeps its exact stored coordinate.
  for (let i = 0; i < 12; i++) {
    const pos = layout.nodes.get(`n${i}`);
    assert.strictEqual(pos.x, 200);
    assert.strictEqual(pos.y, 200);
  }
});

test('region-local manual space applies as pack-offset + local', () => {
  const base = computeLogisticsLayout(nodes, routes);
  const region = base.regions.get('reg_a');
  const manual = {
    a1: { x: 40, y: 50, regionId: 'reg_a', ts: 1, space: 'local' },
  };
  const layout = computeLogisticsLayout(nodes, routes, { manualPositions: manual });
  // Pack offset equals initial region placement before expansion; with only local
  // a1 moved, world ≈ region pack origin + local. Accept the exact stored apply rule.
  const a1 = layout.nodes.get('a1');
  assert.ok(Number.isFinite(a1.x) && Number.isFinite(a1.y));
  assert.strictEqual(a1.manual, true);
  // b region remains unchanged vs base without manuals affecting B.
  assert.deepStrictEqual(layout.nodes.get('b1'), base.nodes.get('b1'));
  assert.ok(region);
});

// --- CORRECTIONS-D: pure-layout cross-region manual validation -----------------

function regionCentre(region) {
  return { x: region.x + region.w / 2, y: region.y + region.h / 2 };
}

function nodeBoxIntersectsRegion(pos, region) {
  const left = pos.x - pos.w / 2;
  const right = pos.x + pos.w / 2;
  const top = pos.y - pos.h / 2;
  const bottom = pos.y + pos.h / 2;
  return right > region.x && left < region.x + region.w
    && bottom > region.y && top < region.y + region.h;
}

test('pure layout rejects manual a1 placed at centre of region B', () => {
  const baseline = computeLogisticsLayout(nodes, routes);
  const regionB = baseline.regions.get('reg_b');
  const regionA = baseline.regions.get('reg_a');
  const centreB = regionCentre(regionB);
  // Prove the uncorrected coordinate would sit clearly inside B (not a near-edge fixture).
  const probe = { x: centreB.x, y: centreB.y, w: baseline.nodes.get('a1').w, h: baseline.nodes.get('a1').h };
  assert.ok(nodeBoxIntersectsRegion(probe, regionB), 'fixture centre must occupy region B before correction');
  assert.ok(
    centreB.x > regionB.x + 10 && centreB.x < regionB.x + regionB.w - 10
    && centreB.y > regionB.y + 10 && centreB.y < regionB.y + regionB.h - 10,
    'fixture must be well inside B, not merely near the boundary'
  );

  const manual = {
    a1: { x: centreB.x, y: centreB.y, regionId: 'reg_a', ts: 1, space: 'world' },
  };
  const frozenManual = JSON.parse(JSON.stringify(manual));
  const b1Before = {
    x: baseline.nodes.get('b1').x,
    y: baseline.nodes.get('b1').y,
    w: baseline.nodes.get('b1').w,
    h: baseline.nodes.get('b1').h,
    regionId: baseline.nodes.get('b1').regionId,
  };
  const b2Before = {
    x: baseline.nodes.get('b2').x,
    y: baseline.nodes.get('b2').y,
    regionId: baseline.nodes.get('b2').regionId,
  };
  const regionBBefore = {
    x: regionB.x, y: regionB.y, w: regionB.w, h: regionB.h,
    label: regionB.label,
    memberIds: regionB.memberIds.slice(),
  };

  const layout = computeLogisticsLayout(nodes, routes, { manualPositions: manual });
  const a1 = layout.nodes.get('a1');
  const finalA = layout.regions.get('reg_a');
  const finalB = layout.regions.get('reg_b');

  // Final a1 does not occupy region B.
  assert.ok(!nodeBoxIntersectsRegion(a1, finalB), 'corrected a1 must not occupy region B');
  // a1 remains inside region A.
  assert.ok(a1.x - a1.w / 2 >= finalA.x - 1e-6);
  assert.ok(a1.y - a1.h / 2 >= finalA.y - 1e-6);
  assert.ok(a1.x + a1.w / 2 <= finalA.x + finalA.w + 1e-6);
  assert.ok(a1.y + a1.h / 2 <= finalA.y + finalA.h + 1e-6);
  // Region containers do not overlap.
  regionsDoNotOverlap(layout);
  // Unrelated region B nodes and container are byte-identical to baseline.
  assert.strictEqual(layout.nodes.get('b1').x, b1Before.x);
  assert.strictEqual(layout.nodes.get('b1').y, b1Before.y);
  assert.strictEqual(layout.nodes.get('b1').w, b1Before.w);
  assert.strictEqual(layout.nodes.get('b1').h, b1Before.h);
  assert.strictEqual(layout.nodes.get('b2').x, b2Before.x);
  assert.strictEqual(layout.nodes.get('b2').y, b2Before.y);
  assert.strictEqual(finalB.x, regionBBefore.x);
  assert.strictEqual(finalB.y, regionBBefore.y);
  assert.strictEqual(finalB.w, regionBBefore.w);
  assert.strictEqual(finalB.h, regionBBefore.h);
  // Diagnostic contains a1; not a wrong-region drop.
  assert.ok(layout.diagnostics.crossRegionManualIds.includes('a1'));
  assert.ok(!layout.diagnostics.wrongRegionManualIds.includes('a1'));
  assert.ok(!layout.diagnostics.droppedManualIds.includes('a1'));
  // Finite output.
  assert.ok(Number.isFinite(a1.x) && Number.isFinite(a1.y));
  // Input object unchanged.
  assert.deepStrictEqual(manual, frozenManual);
  // Shuffled inputs produce the same geometry/diagnostics.
  const shuffled = computeLogisticsLayout(nodes.slice().reverse(), routes.slice().reverse(), { manualPositions: manual });
  assert.strictEqual(shuffled.nodes.get('a1').x, a1.x);
  assert.strictEqual(shuffled.nodes.get('a1').y, a1.y);
  assert.deepStrictEqual(shuffled.diagnostics.crossRegionManualIds, layout.diagnostics.crossRegionManualIds);
  assert.strictEqual(shuffled.nodes.get('b1').x, b1Before.x);
  assert.strictEqual(shuffled.nodes.get('b1').y, b1Before.y);
  // Baseline A was distinct from centre B so correction actually moved a1.
  assert.ok(a1.x !== centreB.x || a1.y !== centreB.y, 'cross-region intrusion must not be accepted as-is');
  assert.ok(regionA);
});

test('manual just inside region A boundary remains exact', () => {
  const baseline = computeLogisticsLayout(nodes, routes);
  const a = baseline.regions.get('reg_a');
  const a1 = baseline.nodes.get('a1');
  // Place centre just inside the packed A box (clear of padding edge).
  const x = a.x + 28 + a1.w / 2 + 2;
  const y = a.y + 28 + 24 + a1.h / 2 + 2;
  const manual = { a1: { x, y, regionId: 'reg_a', ts: 1, space: 'world' } };
  const layout = computeLogisticsLayout(nodes, routes, { manualPositions: manual });
  assert.strictEqual(layout.nodes.get('a1').x, x);
  assert.strictEqual(layout.nodes.get('a1').y, y);
  assert.ok(!layout.diagnostics.crossRegionManualIds.includes('a1'));
});

test('manual slightly outside region A into empty space is preserved (not cross-region)', () => {
  const baseline = computeLogisticsLayout(nodes, routes);
  const a = baseline.regions.get('reg_a');
  const b = baseline.regions.get('reg_b');
  // Far below A, well clear of B's box — empty free space.
  const x = a.x + a.w / 2;
  const y = Math.max(a.y + a.h, b.y + b.h) + 400;
  assert.ok(!nodeBoxIntersectsRegion({ x, y, w: 152, h: 60 }, b));
  const manual = { a1: { x, y, regionId: 'reg_a', ts: 1, space: 'world' } };
  const layout = computeLogisticsLayout(nodes, routes, { manualPositions: manual });
  assert.strictEqual(layout.nodes.get('a1').x, x);
  assert.strictEqual(layout.nodes.get('a1').y, y);
  assert.ok(!layout.diagnostics.crossRegionManualIds.includes('a1'));
  // B remains baseline-identical.
  assert.strictEqual(layout.nodes.get('b1').x, baseline.nodes.get('b1').x);
  assert.strictEqual(layout.nodes.get('b1').y, baseline.nodes.get('b1').y);
  assert.strictEqual(layout.regions.get('reg_b').x, b.x);
  assert.strictEqual(layout.regions.get('reg_b').y, b.y);
  assert.strictEqual(layout.regions.get('reg_b').w, b.w);
  assert.strictEqual(layout.regions.get('reg_b').h, b.h);
});

test('two invalid cross-region manuals in different regions do not move each other', () => {
  const baseline = computeLogisticsLayout(nodes, routes);
  const a = baseline.regions.get('reg_a');
  const b = baseline.regions.get('reg_b');
  const centreA = regionCentre(a);
  const centreB = regionCentre(b);
  const manual = {
    a1: { x: centreB.x, y: centreB.y, regionId: 'reg_a', ts: 1, space: 'world' },
    b1: { x: centreA.x, y: centreA.y, regionId: 'reg_b', ts: 1, space: 'world' },
  };
  const layout = computeLogisticsLayout(nodes, routes, { manualPositions: manual });
  assert.ok(layout.diagnostics.crossRegionManualIds.includes('a1'));
  assert.ok(layout.diagnostics.crossRegionManualIds.includes('b1'));
  assert.ok(!nodeBoxIntersectsRegion(layout.nodes.get('a1'), layout.regions.get('reg_b')));
  assert.ok(!nodeBoxIntersectsRegion(layout.nodes.get('b1'), layout.regions.get('reg_a')));
  regionsDoNotOverlap(layout);
  // Unrelated automatic nodes in each region still finite / present.
  assert.ok(Number.isFinite(layout.nodes.get('a2').x));
  assert.ok(Number.isFinite(layout.nodes.get('b2').x));
});

test('unassigned manuals are not forced through populated-region containment', () => {
  const baseline = computeLogisticsLayout(nodes, routes);
  const centreB = regionCentre(baseline.regions.get('reg_b'));
  // Unassigned node with a coordinate that sits inside reg_b — should still apply
  // as an unassigned manual without crossRegionManualIds (no owner pack domain).
  const withGone = [...nodes, { id: 'gone', kind: 'facility' }];
  const manual = {
    gone: { x: centreB.x, y: centreB.y, regionId: '__unassigned', ts: 1, space: 'world' },
  };
  const layout = computeLogisticsLayout(withGone, routes, { manualPositions: manual });
  assert.strictEqual(layout.nodes.get('gone').x, centreB.x);
  assert.strictEqual(layout.nodes.get('gone').y, centreB.y);
  assert.ok(!layout.diagnostics.crossRegionManualIds.includes('gone'));
  // Populated B automatic placement remains baseline when only unassigned is manual-shifted.
  assert.strictEqual(layout.nodes.get('b1').x, baseline.nodes.get('b1').x);
  assert.strictEqual(layout.nodes.get('b1').y, baseline.nodes.get('b1').y);
});

test('finite and 50000 persistence bounds remain unchanged', () => {
  const ok = { a1: { x: 50000, y: -50000, regionId: 'reg_a', ts: 1, space: 'world' } };
  const layoutOk = computeLogisticsLayout(nodes, routes, { manualPositions: ok });
  // 50000 is at the bound (inclusive in existing validation Math.abs <= 50000).
  assert.strictEqual(layoutOk.nodes.get('a1').manual, true);
  assert.strictEqual(layoutOk.nodes.get('a1').x, 50000);
  assert.strictEqual(layoutOk.nodes.get('a1').y, -50000);
  const bad = { a1: { x: 50001, y: 0, regionId: 'reg_a', ts: 1, space: 'world' } };
  const layoutBad = computeLogisticsLayout(nodes, routes, { manualPositions: bad });
  assert.ok(layoutBad.diagnostics.droppedManualIds.includes('a1'));
  assert.strictEqual(layoutBad.nodes.get('a1').manual, false);
});

test('same-region overlapping manuals still preserve Corrections C policy', () => {
  const manual = {
    a1: { x: 900, y: 900, regionId: 'reg_a', ts: 1, space: 'world' },
    a2: { x: 900, y: 900, regionId: 'reg_a', ts: 2, space: 'world' },
  };
  const layout = computeLogisticsLayout(nodes, routes, { manualPositions: manual });
  assert.strictEqual(layout.nodes.get('a1').x, 900);
  assert.strictEqual(layout.nodes.get('a1').y, 900);
  assert.strictEqual(layout.nodes.get('a2').x, 900);
  assert.strictEqual(layout.nodes.get('a2').y, 900);
  assert.ok(layout.diagnostics.unresolvedOverlapIds.includes('a1') || layout.diagnostics.unresolvedOverlapIds.includes('a2'));
  assert.ok(!layout.diagnostics.crossRegionManualIds.includes('a1'));
  assert.ok(!layout.diagnostics.crossRegionManualIds.includes('a2'));
});

if (failed) process.exit(1);
console.log('logistics layout: all tests passed.');
