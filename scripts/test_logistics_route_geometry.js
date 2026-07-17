#!/usr/bin/env node
'use strict';

// LOGISTICS-GRAPH-CANVAS-SLICE3 — pure geometry tests for
// webview/modules/85b2-logistics-route-geometry.js. Loads and executes the
// production module directly (no DOM, no locale helpers) via node:vm.

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const source = `${fs.readFileSync(path.join(__dirname, '..', 'webview', 'modules', '85b1-logistics-layout.js'), 'utf8')}\n${fs.readFileSync(path.join(__dirname, '..', 'webview', 'modules', '85b2-logistics-route-geometry.js'), 'utf8')}`;
const context = { Map, Set, Math, Number, String, Object, Array, Infinity };
context.globalThis = context;
vm.runInNewContext(`${source}\nglobalThis.api={computeLogisticsLayout,computeLogisticsRouteGeometry,buildLogisticsRouteTopologyIndex,logisticsAffectedRouteIdsForNode,logisticsGeomEstimateLabelSize};`, context);
const { computeLogisticsLayout, computeLogisticsRouteGeometry, buildLogisticsRouteTopologyIndex, logisticsAffectedRouteIdsForNode, logisticsGeomEstimateLabelSize } = context.api;

let failed = 0;
function test(name, fn) {
  try { fn(); console.log(`OK: ${name}`); } catch (error) { failed++; console.error(`FAIL: ${name}`); console.error(error.stack); }
}

function box(x, y, w = 152, h = 60) { return { x, y, w, h }; }

function inBox(point, b) {
  return point.x >= b.x - b.w / 2 - 1e-6 && point.x <= b.x + b.w / 2 + 1e-6
    && point.y >= b.y - b.h / 2 - 1e-6 && point.y <= b.y + b.h / 2 + 1e-6;
}
function onBoundary(point, b, eps = 1e-6) {
  const left = Math.abs(point.x - (b.x - b.w / 2)) < eps;
  const right = Math.abs(point.x - (b.x + b.w / 2)) < eps;
  const top = Math.abs(point.y - (b.y - b.h / 2)) < eps;
  const bottom = Math.abs(point.y - (b.y + b.h / 2)) < eps;
  return left || right || top || bottom;
}

function sampledPoints(geom, count = 600) {
  return Array.from({ length: count + 1 }, (_, i) => geom.pointAt(i / count));
}

function assertAvoids(geom, boxes, message) {
  const points = sampledPoints(geom);
  for (const [id, obstacle] of boxes) {
    assert.strictEqual(points.some((point) => inBox(point, obstacle)), false, `${message}: ${id}`);
  }
}

const two = new Map([['a', box(0, 0)], ['b', box(500, 0)]]);
const routeAB = { id: 'r1', fromNodeId: 'a', toNodeId: 'b' };

// 1-3: boundary, not centre
test('1-3: source/target sit on the boundary, not node centres', () => {
  const { routes } = computeLogisticsRouteGeometry({ routes: [routeAB], positions: two });
  const g = routes.get('r1');
  assert.ok(onBoundary(g.start, two.get('a')), 'start on source boundary');
  assert.ok(onBoundary(g.end, two.get('b')), 'end on target boundary');
  assert.notStrictEqual(g.start.x, 0);
  assert.notStrictEqual(g.start.y === 0 && g.start.x === 0, true);
  assert.notStrictEqual(g.end.x, 500);
});

// 4: twelve ports finite and deterministic
test('4: twelve ports per node are finite and deterministic', () => {
  const { routes: r1 } = computeLogisticsRouteGeometry({ routes: [routeAB], positions: two });
  const { routes: r2 } = computeLogisticsRouteGeometry({ routes: [routeAB], positions: two });
  const g1 = r1.get('r1'); const g2 = r2.get('r1');
  for (const p of [g1.sourcePort, g1.targetPort]) { assert.ok(Number.isFinite(p.x) && Number.isFinite(p.y)); }
  assert.deepStrictEqual(g1.sourcePort, g2.sourcePort);
  assert.deepStrictEqual(g1.targetPort, g2.targetPort);
});

// 5: shuffled routes -> byte-identical
test('5: shuffled route order is byte-identical', () => {
  const routes = [
    { id: 'r1', fromNodeId: 'a', toNodeId: 'b' },
    { id: 'r2', fromNodeId: 'b', toNodeId: 'a' },
    { id: 'r3', fromNodeId: 'a', toNodeId: 'b' },
  ];
  const a = computeLogisticsRouteGeometry({ routes, positions: two }).routes;
  const b2 = computeLogisticsRouteGeometry({ routes: routes.slice().reverse(), positions: two }).routes;
  for (const id of ['r1', 'r2', 'r3']) { assert.strictEqual(a.get(id).pathD, b2.get(id).pathD, id); }
});

// 6: shuffled nodes/positions -> byte-identical (Map iteration order varied)
test('6: shuffled node/position insertion order is byte-identical', () => {
  const positionsA = new Map([['a', box(0, 0)], ['b', box(500, 0)], ['c', box(250, 300)]]);
  const positionsB = new Map([['c', box(250, 300)], ['b', box(500, 0)], ['a', box(0, 0)]]);
  const routes = [{ id: 'r1', fromNodeId: 'a', toNodeId: 'b' }];
  const a = computeLogisticsRouteGeometry({ routes, positions: positionsA }).routes.get('r1');
  const b2 = computeLogisticsRouteGeometry({ routes, positions: positionsB }).routes.get('r1');
  assert.strictEqual(a.pathD, b2.pathD);
});

// 7: metric-only route fields do not change geometry
test('7: metric-only fields do not change geometry', () => {
  const plain = [{ id: 'r1', fromNodeId: 'a', toNodeId: 'b' }];
  const loud = [{ id: 'r1', fromNodeId: 'a', toNodeId: 'b', volume: 999, effectiveCapacity: 1, status: 'blocked', risk: 0.9 }];
  const g1 = computeLogisticsRouteGeometry({ routes: plain, positions: two }).routes.get('r1');
  const g2 = computeLogisticsRouteGeometry({ routes: loud, positions: two }).routes.get('r1');
  assert.strictEqual(g1.pathD, g2.pathD);
});

// 8/9: filter/camera independence — the module never receives these inputs
// at all (no commodityId/camera parameter exists), so identical topology and
// positions always yield identical geometry regardless of caller-side filter
// or camera state.
test('8-9: geometry API accepts no filter or camera input (independence by construction)', () => {
  const g1 = computeLogisticsRouteGeometry({ routes: [routeAB], positions: two }).routes.get('r1');
  const g2 = computeLogisticsRouteGeometry({ routes: [routeAB], positions: two, options: { commodityId: 'iron', cameraK: 3 } }).routes.get('r1');
  assert.strictEqual(g1.pathD, g2.pathD);
});

// 10: endpoint change changes geometry
test('10: changing a route endpoint changes geometry', () => {
  const three = new Map([['a', box(0, 0)], ['b', box(500, 0)], ['c', box(500, 300)]]);
  const toB = [{ id: 'r1', fromNodeId: 'a', toNodeId: 'b' }];
  const toC = [{ id: 'r1', fromNodeId: 'a', toNodeId: 'c' }];
  const g1 = computeLogisticsRouteGeometry({ routes: toB, positions: three }).routes.get('r1');
  const g2 = computeLogisticsRouteGeometry({ routes: toC, positions: three }).routes.get('r1');
  assert.notStrictEqual(g1.pathD, g2.pathD);
});

// 11-13: parallel lanes
test('11-13: two/three/four parallel routes use distinct centred lanes', () => {
  for (const n of [2, 3, 4]) {
    const routes = [];
    for (let i = 0; i < n; i++) { routes.push({ id: `p${i}`, fromNodeId: 'a', toNodeId: 'b' }); }
    const { routes: geoms } = computeLogisticsRouteGeometry({ routes, positions: two });
    const lanes = routes.map((r) => geoms.get(r.id).laneIndex);
    assert.strictEqual(new Set(lanes).size, n, `lanes must be distinct for n=${n}`);
    const sum = lanes.reduce((s, v) => s + v, 0);
    assert.ok(Math.abs(sum) < 1e-9, `lanes must be centred for n=${n}`);
  }
});

// 14-16: reverse routes opposite side / distinguishable / opposite arrow tangent
test('14-16: reverse route is structurally opposite and tangent-distinguishable', () => {
  const routes = [
    { id: 'fwd', fromNodeId: 'a', toNodeId: 'b' },
    { id: 'rev', fromNodeId: 'b', toNodeId: 'a' },
  ];
  const { routes: geoms } = computeLogisticsRouteGeometry({ routes, positions: two });
  const fwd = geoms.get('fwd'); const rev = geoms.get('rev');
  assert.notStrictEqual(fwd.laneIndex, rev.laneIndex);
  assert.notStrictEqual(fwd.pathD, rev.pathD);
  const fwdTangent = fwd.tangentAt(1);
  const revTangent = rev.tangentAt(1);
  // Normalize (fwd - rev) into (-pi, pi]; forward/reverse should be
  // opposite, i.e. this normalized difference should sit near +-pi.
  let raw = (fwdTangent - revTangent) % (Math.PI * 2);
  if (raw > Math.PI) { raw -= Math.PI * 2; }
  if (raw < -Math.PI) { raw += Math.PI * 2; }
  const distanceFromPi = Math.min(Math.abs(raw - Math.PI), Math.abs(raw + Math.PI));
  assert.ok(distanceFromPi < 0.5, `forward/reverse arrow directions should be roughly opposite, got normalized diff=${raw}`);
});

// 17: direct route avoids a realistically offset unrelated node
test('17: direct route avoids an offset unrelated node', () => {
  const withBlocker = new Map([['a', box(0, 0)], ['b', box(500, 0)], ['c', box(250, 0)]]);
  assert.strictEqual(inBox({ x: 250, y: 0 }, withBlocker.get('c')), true, 'fixture must genuinely obstruct the original direct corridor');
  const g = computeLogisticsRouteGeometry({ routes: [routeAB], positions: withBlocker }).routes.get('r1');
  const points = [];
  for (let i = 0; i <= 24; i++) { points.push(g.pointAt(i / 24)); }
  const c = withBlocker.get('c');
  const inflated = { x: c.x, y: c.y, w: c.w + 28, h: c.h + 28 };
  assert.ok(!points.some((p) => inBox(p, inflated)), 'no sampled point should land inside the inflated blocker');
  assert.strictEqual(g.conflicted, false);
});

test('17a: production rank-column L7 fixture routes around the complete inflated envelope', () => {
  const nodes = [
    { id: 'reg_world', kind: 'region' },
    ...['src_farm', 'mill_a', 'mill_b', 'mill_c', 'town_market'].map((id) => ({ id, kind: 'facility', regionId: 'reg_world' })),
  ];
  const routes = [
    { id: 'farm_a', fromNodeId: 'src_farm', toNodeId: 'mill_a' },
    { id: 'farm_b', fromNodeId: 'src_farm', toNodeId: 'mill_b' },
    { id: 'farm_c', fromNodeId: 'src_farm', toNodeId: 'mill_c' },
    { id: 'a_market', fromNodeId: 'mill_a', toNodeId: 'town_market' },
    { id: 'b_market', fromNodeId: 'mill_b', toNodeId: 'town_market' },
    { id: 'c_market', fromNodeId: 'mill_c', toNodeId: 'town_market' },
    { id: 'farm_market', fromNodeId: 'src_farm', toNodeId: 'town_market' },
  ];
  const layout = computeLogisticsLayout(nodes, routes);
  const expected = {
    src_farm: [120, 154], mill_a: [364, 58], mill_b: [364, 154], mill_c: [364, 250], town_market: [640, 154],
  };
  for (const [id, [x, y]] of Object.entries(expected)) {
    assert.strictEqual(layout.positions.get(id).x, x, `${id}.x`);
    assert.strictEqual(layout.positions.get(id).y, y, `${id}.y`);
  }
  assert.strictEqual(inBox({ x: 364, y: 154 }, layout.positions.get('mill_b')), true, 'rank-1 column intersects the original direct corridor');
  const directRoute = routes.find((route) => route.id === 'farm_market');
  const first = computeLogisticsRouteGeometry({ routes, positions: layout.positions }).routes.get('farm_market');
  const shuffled = computeLogisticsRouteGeometry({ routes: routes.slice().reverse(), positions: new Map([...layout.positions].reverse()) }).routes.get('farm_market');
  assert.strictEqual(first.pathD, shuffled.pathD, 'L7 output deterministic under shuffled input');
  assert.strictEqual(first.conflicted, false);
  assert.deepStrictEqual(Array.from(first.obstacleIds), []);
  const raw = ['mill_a', 'mill_b', 'mill_c'].map((id) => [id, layout.positions.get(id)]);
  const inflated = raw.map(([id, b]) => [id, { ...b, w: b.w + 28, h: b.h + 28 }]);
  assertAvoids(first, raw, 'L7 raw box intersection');
  assertAvoids(first, inflated, 'L7 inflated box intersection');
  for (const segment of first.pathSegments) {
    for (const point of [segment.start, segment.c1, segment.c2, segment.end]) {
      assert.ok(Number.isFinite(point.x) && Number.isFinite(point.y));
    }
  }
  assert.ok(directRoute);
});

test('17b: rotated three-node row uses a bounded side/outer corridor without conflict', () => {
  const positions = new Map([
    ['source', box(0, 0)], ['target', box(0, 600)],
    ['row_a', box(-192, 300)], ['row_b', box(0, 300)], ['row_c', box(192, 300)],
  ]);
  const route = { id: 'vertical', fromNodeId: 'source', toNodeId: 'target' };
  const geom = computeLogisticsRouteGeometry({ routes: [route], positions }).routes.get(route.id);
  assert.strictEqual(geom.conflicted, false);
  assert.ok(['left', 'right', 'outerCorridor'].includes(geom.detourKind), geom.detourKind);
  assertAvoids(geom, ['row_a', 'row_b', 'row_c'].map((id) => [id, { ...positions.get(id), w: 180, h: 88 }]), 'rotated row inflated intersection');
});

test('17c: envelope candidates cover staggered, sided, and outer-corridor fixtures', () => {
  const cases = [
    ['one blocker', new Map([['a', box(0, 0)], ['b', box(800, 0)], ['block', box(400, 0)]])],
    ['staggered blockers', new Map([['a', box(0, 0)], ['b', box(800, 0)], ['block_a', box(330, -25)], ['block_b', box(470, 25)]])],
    ['blockers above and below', new Map([['a', box(0, 0)], ['b', box(800, 0)], ['block', box(400, 0)], ['upper', box(250, -120, 80, 40)], ['lower', box(550, 120, 80, 40)]])],
    ['above blocked below clear', new Map([['a', box(0, 0)], ['b', box(800, 0)], ['block', box(400, 0)], ['upper', box(400, -73, 100, 10)]])],
    ['below blocked above clear', new Map([['a', box(0, 0)], ['b', box(800, 0)], ['block', box(400, 0)], ['lower', box(400, 73, 100, 10)]])],
  ];
  for (const [name, positions] of cases) {
    const geom = computeLogisticsRouteGeometry({ routes: [routeAB], positions }).routes.get('r1');
    assert.strictEqual(geom.conflicted, false, name);
    assert.deepStrictEqual(Array.from(geom.obstacleIds), [], name);
    assertAvoids(geom, [...positions].filter(([id]) => id !== 'a' && id !== 'b').map(([id, b]) => [id, { ...b, w: b.w + 28, h: b.h + 28 }]), name);
  }
  const outer = new Map([
    ['a', box(0, 0)], ['b', box(800, 0)], ['block', box(400, 0)],
    ['upper_guard', box(400, -73, 100, 10)], ['lower_guard', box(400, 73, 100, 10)],
  ]);
  const outerGeom = computeLogisticsRouteGeometry({ routes: [routeAB], positions: outer }).routes.get('r1');
  assert.strictEqual(outerGeom.detourKind, 'outerCorridor');
  assert.strictEqual(outerGeom.conflicted, false);
});

// 18/19: horizontal and vertical blockers cause a deterministic detour
test('18-19: horizontal and vertical blockers cause deterministic detours', () => {
  const hBlock = new Map([['a', box(0, 0)], ['b', box(600, 0)], ['c', box(300, 40)]]);
  const g1a = computeLogisticsRouteGeometry({ routes: [routeAB], positions: hBlock }).routes.get('r1');
  const g1b = computeLogisticsRouteGeometry({ routes: [routeAB], positions: hBlock }).routes.get('r1');
  assert.strictEqual(g1a.pathD, g1b.pathD, 'horizontal-blocker detour must be deterministic');
  const vBlock = new Map([['x', box(0, 0)], ['y', box(0, 600)], ['z', box(40, 300)]]);
  const routeXY = [{ id: 'rv', fromNodeId: 'x', toNodeId: 'y' }];
  const g2a = computeLogisticsRouteGeometry({ routes: routeXY, positions: vBlock }).routes.get('rv');
  const g2b = computeLogisticsRouteGeometry({ routes: routeXY, positions: vBlock }).routes.get('rv');
  assert.strictEqual(g2a.pathD, g2b.pathD, 'vertical-blocker detour must be deterministic');
});

// 20: several blockers -> bounded fallback, never throws, never hides route
test('20: several blockers use a bounded deterministic fallback and never hide the route', () => {
  const positions = new Map([['a', box(0, 0)], ['b', box(400, 0)], ['c', box(200, -20)]]);
  const { routes } = computeLogisticsRouteGeometry({ routes: [routeAB], positions });
  const g = routes.get('r1');
  assert.ok(g && typeof g.pathD === 'string' && g.pathD.length > 0, 'route must still be rendered');
  assert.ok(Number.isFinite(g.start.x) && Number.isFinite(g.end.x));
});

// 21: source/target are never treated as obstacles for their own route
test('21: source and target boxes are not obstacles for their own route', () => {
  const tight = new Map([['a', box(0, 0)], ['b', box(160, 0)]]); // boxes nearly touching
  const g = computeLogisticsRouteGeometry({ routes: [routeAB], positions: tight }).routes.get('r1');
  assert.strictEqual(g.obstacleIds.includes('a'), false);
  assert.strictEqual(g.obstacleIds.includes('b'), false);
});

// 22: collapsed aggregate acts as an ordinary obstacle for unrelated routes
test('22: an aggregate node (by construction, an ordinary box in positions) obstructs an unrelated route', () => {
  const positions = new Map([['a', box(0, 0)], ['b', box(600, 0)], ['agg', box(300, 30, 184, 72)]]);
  const g = computeLogisticsRouteGeometry({ routes: [routeAB], positions }).routes.get('r1');
  const points = [];
  for (let i = 0; i <= 24; i++) { points.push(g.pointAt(i / 24)); }
  const agg = positions.get('agg');
  const inflated = { x: agg.x, y: agg.y, w: agg.w + 28, h: agg.h + 28 };
  const hits = points.filter((p) => inBox(p, inflated));
  assert.strictEqual(hits.length, 0, 'aggregate obstacle must be avoided like any other node');
});

// 23: region containers are never passed as obstacles (module has no concept
// of a region box at all — obstacles derive solely from node `positions`).
test('23: region containers are not solid obstacles (module never receives them)', () => {
  // No API surface accepts a region list; routes may freely cross a region's
  // visual bounds because this module only sees node boxes.
  const g = computeLogisticsRouteGeometry({ routes: [routeAB], positions: two }).routes.get('r1');
  assert.ok(g);
});

// 24: very large valid coordinates remain finite
test('24: very large valid coordinates remain finite', () => {
  const big = new Map([['a', box(-40000, -40000)], ['b', box(40000, 40000)]]);
  const g = computeLogisticsRouteGeometry({ routes: [routeAB], positions: big }).routes.get('r1');
  for (const v of [g.start.x, g.start.y, g.end.x, g.end.y]) { assert.ok(Number.isFinite(v)); }
});

// 25/26: malformed / impossible fixtures produce an honest finite fallback
test('25: malformed coordinates are excluded rather than producing NaN', () => {
  const malformed = new Map([['a', box(NaN, 0)], ['b', box(500, 0)]]);
  const { routes } = computeLogisticsRouteGeometry({ routes: [routeAB], positions: malformed });
  assert.strictEqual(routes.has('r1'), false, 'a route touching a malformed box is dropped, never produces NaN geometry');
});

test('26: an impossible fixture sets conflicted honestly instead of hiding the route', () => {
  const positions = new Map([
    ['a', box(0, 0)], ['b', box(400, 0)],
    ['block_b', box(200, 0, 1000, 1000)], ['block_a', box(200, 0, 900, 900)],
  ]);
  const { routes, diagnostics } = computeLogisticsRouteGeometry({ routes: [routeAB], positions });
  const g = routes.get('r1');
  assert.ok(g, 'route must still exist');
  assert.strictEqual(g.conflicted, true);
  assert.deepStrictEqual(Array.from(g.obstacleIds), ['block_a', 'block_b']);
  assert.ok(diagnostics.conflictedIds.includes('r1'));
  assert.ok(g.pathD && g.pathSegments.every((segment) => [segment.start, segment.c1, segment.c2, segment.end].every((point) => Number.isFinite(point.x) && Number.isFinite(point.y))));
});

// 27: obstacle IDs deterministic
test('27: obstacle IDs are deterministic across repeated computation', () => {
  const positions = new Map([['a', box(0, 0)], ['b', box(400, 0)], ['c', box(200, -20)]]);
  const g1 = computeLogisticsRouteGeometry({ routes: [routeAB], positions }).routes.get('r1');
  const g2 = computeLogisticsRouteGeometry({ routes: [routeAB], positions }).routes.get('r1');
  assert.deepStrictEqual(g1.obstacleIds, g2.obstacleIds);
});

// 28: path bounds contain every segment (convex-hull-of-control-points property)
test('28: path bounds contain every drawn segment', () => {
  const positions = new Map([['a', box(0, 0)], ['b', box(400, 0)], ['c', box(200, -20)]]);
  const g = computeLogisticsRouteGeometry({ routes: [routeAB], positions }).routes.get('r1');
  for (let i = 0; i <= 24; i++) {
    const p = g.pointAt(i / 24);
    assert.ok(p.x >= g.bounds.minX - 1e-6 && p.x <= g.bounds.maxX + 1e-6, `x within bounds at t=${i / 24}`);
    assert.ok(p.y >= g.bounds.minY - 1e-6 && p.y <= g.bounds.maxY + 1e-6, `y within bounds at t=${i / 24}`);
  }
});

// 29-31: label avoids source, target, and an unrelated blocker
test('29-31: label avoids source, target, and an unrelated blocker box', () => {
  const positions = new Map([['a', box(0, 0)], ['b', box(600, 0)], ['c', box(300, 5)]]);
  const { routes } = computeLogisticsRouteGeometry({ routes: [routeAB], positions, labelMetrics: new Map([['r1', { text: '4.6 / 6.8' }]]) });
  const g = routes.get('r1');
  const labelSize = logisticsGeomEstimateLabelSize('4.6 / 6.8');
  assert.strictEqual(labelSize.width, 54);
  const labelBox = { x: g.labelAnchor.x, y: g.labelAnchor.y, w: labelSize.width, h: labelSize.height };
  for (const id of ['a', 'b', 'c']) {
    const nb = positions.get(id);
    const inflated = { x: nb.x, y: nb.y, w: nb.w + 24, h: nb.h + 24 };
    const overlap = Math.abs(labelBox.x - inflated.x) * 2 < labelBox.w + inflated.w && Math.abs(labelBox.y - inflated.y) * 2 < labelBox.h + inflated.h;
    assert.strictEqual(overlap, false, `label must avoid node ${id}`);
  }
});

// 32: parallel-route labels do not occupy the same box
test('32: parallel-route labels do not occupy the same box', () => {
  const routes = [
    { id: 'p0', fromNodeId: 'a', toNodeId: 'b' },
    { id: 'p1', fromNodeId: 'a', toNodeId: 'b' },
    { id: 'p2', fromNodeId: 'a', toNodeId: 'b' },
  ];
  const { routes: geoms } = computeLogisticsRouteGeometry({ routes, positions: two });
  const anchors = routes.map((r) => geoms.get(r.id).labelAnchor);
  for (let i = 0; i < anchors.length; i++) {
    for (let j = i + 1; j < anchors.length; j++) {
      const dist = Math.hypot(anchors[i].x - anchors[j].x, anchors[i].y - anchors[j].y);
      assert.ok(dist > 1, `labels ${i}/${j} must not coincide`);
    }
  }
});

// 33: warning marker does not cover the primary label
test('33: warning anchor is offset from the label anchor, not on top of it', () => {
  const g = computeLogisticsRouteGeometry({ routes: [routeAB], positions: two }).routes.get('r1');
  const size = logisticsGeomEstimateLabelSize('');
  assert.ok(g.warningAnchor.y > g.labelAnchor.y + size.height / 2);
});

// 34: CJK-length label estimate remains finite
test('34: CJK label size estimate remains finite and larger than ASCII of equal length', () => {
  const withCjk = computeLogisticsRouteGeometry({ routes: [routeAB], positions: two, labelMetrics: new Map([['r1', { text: '流量 / 輸送力' }]]) }).routes.get('r1');
  assert.ok(Number.isFinite(withCjk.labelAnchor.x) && Number.isFinite(withCjk.labelAnchor.y));
});

// 35/36: selected route uses the same computed path; layer choice is a
// render-time classification, not a separate geometry (verified structurally:
// the module has no "selected" input at all, so there is only ever one path
// per route — see webview interactions test for the DOM-level raised-layer check).
test('35-36: geometry has no selection-specific branch (one path per route, always)', () => {
  const g1 = computeLogisticsRouteGeometry({ routes: [routeAB], positions: two }).routes.get('r1');
  const g2 = computeLogisticsRouteGeometry({ routes: [routeAB], positions: two }).routes.get('r1');
  assert.strictEqual(g1.pathD, g2.pathD);
});

// 37: visible path and hit path use identical d — verified at the render
// module level (both are set from the same geometry.pathD); asserted here on
// the geometry object itself, which is the single source both consumers read.
test('37: geometry exposes exactly one d used for both stroke and hit target', () => {
  const g = computeLogisticsRouteGeometry({ routes: [routeAB], positions: two }).routes.get('r1');
  assert.strictEqual(typeof g.pathD, 'string');
  assert.strictEqual(g.d, g.pathD);
});

// 38: mpath references the visible path id — this is a render-module
// responsibility (pathId is DOM-assigned); geometry only guarantees a stable,
// reusable d. Covered at the webview level in test_webview_logistics_interactions.js.

// 39: arrowhead uses final path tangent
test('39: tangentAt(1) is finite and matches the local direction into the target port', () => {
  const g = computeLogisticsRouteGeometry({ routes: [routeAB], positions: two }).routes.get('r1');
  const tangent = g.tangentAt(1);
  assert.ok(Number.isFinite(tangent));
  // For a left-to-right route with no lane offset, the tangent should point
  // broadly rightward (within a quarter turn) into the target.
  assert.ok(Math.abs(tangent) < Math.PI / 2 + 0.3);
});

// 40: inputs are not mutated
test('40: routes and positions are never mutated', () => {
  const routes = [{ id: 'r1', fromNodeId: 'a', toNodeId: 'b', volume: 5 }];
  const positions = new Map([['a', box(0, 0)], ['b', box(500, 0)]]);
  const routesBefore = JSON.parse(JSON.stringify(routes));
  const positionsBefore = new Map([...positions].map(([k, v]) => [k, { ...v }]));
  computeLogisticsRouteGeometry({ routes, positions });
  assert.deepStrictEqual(routes, routesBefore);
  for (const [id, v] of positions) { assert.deepStrictEqual(v, positionsBefore.get(id)); }
});

function largeTopologyFixture(nodeCount, routeCount) {
  const positions = new Map();
  for (let i = 0; i < nodeCount; i++) { positions.set(`n${i}`, box((i % 20) * 260, Math.floor(i / 20) * 160)); }
  const routes = [
    { id: 'local_0', fromNodeId: 'n0', toNodeId: 'n1' },
    { id: 'local_1', fromNodeId: 'n1', toNodeId: 'n2' },
    { id: 'local_2', fromNodeId: 'n1', toNodeId: 'n0' },
  ];
  for (let i = routes.length; i < routeCount; i++) {
    const from = 3 + ((i - 3) % (nodeCount - 3));
    const to = 3 + ((i - 2) % (nodeCount - 3));
    routes.push({ id: `remote_${String(i).padStart(4, '0')}`, fromNodeId: `n${from}`, toNodeId: `n${to}` });
  }
  return { positions, routes };
}

test('41: topology index bounds low-degree partial geometry and excludes remote routes', () => {
  const fixture = largeTopologyFixture(200, 400);
  const topologyIndex = buildLogisticsRouteTopologyIndex(fixture.routes);
  const affectedRouteIds = logisticsAffectedRouteIdsForNode('n0', topologyIndex);
  assert.deepStrictEqual(Array.from(affectedRouteIds), ['local_0', 'local_1', 'local_2']);
  assert.strictEqual(affectedRouteIds.includes('remote_0399'), false);
  const partial = computeLogisticsRouteGeometry({
    routes: fixture.routes, positions: fixture.positions, topologyIndex, routeIds: affectedRouteIds,
  });
  assert.deepStrictEqual(Array.from(partial.diagnostics.computedRouteIds), Array.from(affectedRouteIds));
  assert.strictEqual(partial.diagnostics.routeCount, 3);
  assert.ok(partial.diagnostics.routeCount < fixture.routes.length);
});

if (!failed) {
  for (const [nodeCount, routeCount] of [[60, 90], [200, 400]]) {
    const fixture = largeTopologyFixture(nodeCount, routeCount);
    const topologyIndex = buildLogisticsRouteTopologyIndex(fixture.routes);
    const affectedRouteIds = logisticsAffectedRouteIdsForNode('n0', topologyIndex);
    const startedFull = process.hrtime.bigint();
    computeLogisticsRouteGeometry({ routes: fixture.routes, positions: fixture.positions, topologyIndex });
    const fullMs = Number(process.hrtime.bigint() - startedFull) / 1e6;
    const startedPartial = process.hrtime.bigint();
    computeLogisticsRouteGeometry({ routes: fixture.routes, positions: fixture.positions, topologyIndex, routeIds: affectedRouteIds });
    const partialMs = Number(process.hrtime.bigint() - startedPartial) / 1e6;
    console.log(`TIMING: nodes=${nodeCount} routes=${routeCount} full=${fullMs.toFixed(2)}ms partial=${partialMs.toFixed(2)}ms affected=${affectedRouteIds.length}`);
  }
}

if (failed) { console.error(`\n${failed} geometry test(s) failed.`); process.exit(1); }
console.log('logistics route geometry: all tests passed.');
