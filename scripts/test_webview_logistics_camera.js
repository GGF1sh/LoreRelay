#!/usr/bin/env node
'use strict';

// LOGISTICS-GRAPH-CANVAS-SLICE1 — behavioral tests for the pointer-centred
// camera layered over the (unchanged) logistics graph. Exercises the pure
// camera math AND real event wiring (wheel/pointer/keyboard) against a
// bubbling-aware DOM stub, per docs/LOGISTICS_GRAPH_CANVAS_ARCHITECTURE.md §2
// and the SLICE1 scope in that document's §12.

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const modulePath = path.join(root, 'webview', 'modules', '85b-economy-logistics.js');
const source = fs.readFileSync(modulePath, 'utf8');
let failed = 0;

// vm.runInNewContext only exposes top-level FUNCTION declarations on the
// context object (not `const` primitives), so these mirror the module's
// camera constants for tests that need the numeric contract directly. Keep
// in sync with LOGISTICS_ZOOM_MIN/MAX/VIEWPORT_HEIGHT in the module.
const ZOOM_MIN = 0.25;
const ZOOM_MAX = 3.0;
const VIEWPORT_HEIGHT = 420;

function test(name, fn) {
  try {
    fn();
    console.log(`OK: ${name}`);
  } catch (error) {
    failed++;
    console.error(`FAIL: ${name}`);
    console.error(error && error.stack ? error.stack : error);
  }
}

// --- Bubbling-aware DOM stub -------------------------------------------
// Unlike scripts/test_economy_logistics_webview.js's FakeElement, camera
// interactions rely on real pointer/keyboard event bubbling from an inner
// node/route group up to the viewport that owns the listeners, so
// dispatchEvent here walks the parentNode chain like a real DOM bubble phase.

class FakeClassList {
  constructor() { this.values = new Set(); }
  set(value) { this.values = new Set(String(value || '').split(/\s+/).filter(Boolean)); }
  add(...values) { values.forEach((value) => this.values.add(value)); }
  remove(...values) { values.forEach((value) => this.values.delete(value)); }
  contains(value) { return this.values.has(value); }
  toggle(value, force) {
    const next = force === undefined ? !this.values.has(value) : Boolean(force);
    if (next) { this.values.add(value); } else { this.values.delete(value); }
    return next;
  }
  toString() { return [...this.values].join(' '); }
}

class FakeElement {
  constructor(tagName, document) {
    this.tagName = String(tagName).toUpperCase();
    this.ownerDocument = document;
    this.children = [];
    this.parentNode = null;
    this.attributes = {};
    this.dataset = {};
    this.style = {
      props: {},
      setProperty(name, value) { this.props[name] = String(value); },
      getPropertyValue(name) { return this.props[name] || ''; },
    };
    this.listeners = {};
    this.classList = new FakeClassList();
    this._text = '';
    this._id = '';
    this.value = '';
    this.disabled = false;
    this.clientWidth = 0;
    this.pointerCaptures = [];
    this.pointerReleases = [];
  }
  set className(value) { this.classList.set(value); }
  get className() { return this.classList.toString(); }
  set id(value) { this._id = String(value); if (this._id) { this.ownerDocument.byId.set(this._id, this); } }
  get id() { return this._id; }
  set textContent(value) { this._text = String(value ?? ''); this.children = []; }
  get textContent() { return this._text + this.children.map((child) => child.textContent).join(''); }
  appendChild(child) {
    child.parentNode = this;
    if (!child.clientWidth && this.clientWidth) { child.clientWidth = this.clientWidth; }
    this.children.push(child);
    return child;
  }
  replaceChildren(...children) { this._text = ''; this.children = []; children.forEach((child) => this.appendChild(child)); }
  setAttribute(name, value) {
    this.attributes[name] = String(value);
    if (name === 'class') { this.className = value; }
    if (name === 'id') { this.id = value; }
  }
  getAttribute(name) { return this.attributes[name]; }
  addEventListener(type, listener) { (this.listeners[type] ||= []).push(listener); }
  focus() { this.ownerDocument.activeElement = this; }
  getBoundingClientRect() { return { left: 0, top: 0, width: this.clientWidth || 0, height: 0, right: this.clientWidth || 0, bottom: 0 }; }
  setPointerCapture(pointerId) { this.pointerCaptures.push(pointerId); }
  releasePointerCapture(pointerId) { this.pointerReleases.push(pointerId); }
  dispatchEvent(event) {
    event.target = this;
    let stopped = false;
    event.preventDefault ||= () => { event.defaultPrevented = true; };
    event.stopPropagation ||= () => { stopped = true; };
    let node = this;
    while (node && !stopped) {
      (node.listeners[event.type] || []).forEach((listener) => listener(event));
      const propertyListener = node[`on${event.type}`];
      if (typeof propertyListener === 'function' && !stopped) { propertyListener(event); }
      node = node.parentNode;
    }
    return !event.defaultPrevented;
  }
}

class FakeDocument {
  constructor() {
    this.byId = new Map();
    this.activeElement = null;
    this.body = this.createElement('body');
  }
  createElement(tag) { return new FakeElement(tag, this); }
  createElementNS(_ns, tag) { return new FakeElement(tag, this); }
  getElementById(id) { return this.byId.get(id) || null; }
  addEventListener() {}
}

function descendants(node) {
  return [node, ...node.children.flatMap(descendants)];
}
function findAll(node, predicate) {
  return descendants(node).filter(predicate);
}

function createHarness(options = {}) {
  const document = new FakeDocument();
  const reducedMotion = Boolean(options.reducedMotion);
  const rootNode = document.createElement('div');
  const section = document.createElement('details');
  section.id = 'world-logistics-details';
  section.className = 'hidden';
  const panel = document.createElement('div');
  panel.id = 'world-logistics-panel';
  panel.clientWidth = options.panelWidth ?? 800;
  section.appendChild(panel);
  rootNode.appendChild(section);
  document.body.appendChild(rootNode);
  const translations = {};
  const context = {
    document,
    console,
    Map,
    Set,
    Math,
    Number,
    String,
    Boolean,
    setTimeout,
    clearTimeout,
    T: (key) => translations[key] || key,
    ResizeObserver: class {
      constructor(callback) { this.callback = callback; }
      observe(element) { this.callback([{ contentRect: { width: element.clientWidth || 0 } }]); }
      disconnect() {}
    },
  };
  context.window = context;
  context.localStorage = { getItem: () => 'on', setItem: () => {} };
  context.matchMedia = () => ({ matches: reducedMotion, addEventListener: () => {}, addListener: () => {} });
  vm.runInNewContext(source, context, { filename: modulePath });
  return { document, rootNode, section, panel, context };
}

function threeNodePayload(overrides = {}) {
  return {
    available: true,
    nodes: [
      { id: 'source', label: 'Source', kind: 'region', commodityIds: ['grain'], production: [], processingSiteIds: [], shortageCommodityIds: [] },
      { id: 'facility', label: 'Mill', kind: 'facility', commodityIds: ['grain'], production: [], processingSiteIds: [], shortageCommodityIds: [] },
      { id: 'market', label: 'Harbor Market', kind: 'market', commodityIds: ['grain'], production: [], processingSiteIds: [], shortageCommodityIds: [] },
    ],
    routes: [
      { id: 'grain_route', fromNodeId: 'source', toNodeId: 'market', commodityId: 'grain', volume: 5, baseCapacity: 10, effectiveCapacity: 5, utilization: 1, risk: 0.3, status: 'open', bottleneck: false },
    ],
    commodities: [{ id: 'grain', name: 'Grain', localSpecialty: true, strategic: false }],
    shortages: [],
    processingSites: [],
    summary: { activeRoutes: 1, blockedRoutes: 0, raidedRoutes: 0, totalVolume: 5, shortageCount: 0, bottleneckCount: 0 },
    ...overrides,
  };
}

function oneNodePayload() {
  return {
    available: true,
    nodes: [{ id: 'solo', label: 'Solo', kind: 'region', commodityIds: [], production: [], processingSiteIds: [], shortageCommodityIds: [] }],
    routes: [],
    commodities: [],
    shortages: [],
    processingSites: [],
    summary: {},
  };
}

function emptyPayload() {
  return { available: true, nodes: [], routes: [], commodities: [], shortages: [], processingSites: [], summary: {} };
}

function renderHarness(payload, options = {}) {
  const h = createHarness(options);
  h.context.renderEconomyLogistics(payload, true);
  return h;
}

function svgOf(h) { return findAll(h.panel, (n) => n.tagName === 'SVG')[0]; }
function cameraGroupOf(h) { return findAll(h.panel, (n) => n.classList.contains('logistics-camera'))[0]; }
function viewportOf(h) { return findAll(h.panel, (n) => n.classList.contains('logistics-network-viewport'))[0]; }
function nodeGroup(h, nodeId) { return findAll(h.panel, (n) => n.dataset.nodeId === nodeId)[0]; }
function transformOf(h) { return cameraGroupOf(h).getAttribute('transform'); }

function parseTransform(str) {
  const m = /translate\(([^ ]+) ([^)]+)\) scale\(([^)]+)\)/.exec(str || '');
  if (!m) { return null; }
  return { tx: Number(m[1]), ty: Number(m[2]), k: Number(m[3]) };
}

// --- 1-6: pure camera math ----------------------------------------------

test('world-to-screen and screen-to-world round trip', () => {
  const h = createHarness();
  const camera = { k: 1.7, tx: -42.5, ty: 88.25, userModified: true };
  for (const point of [{ x: 0, y: 0 }, { x: 123.4, y: -56.7 }, { x: -900, y: 400 }]) {
    const screen = h.context.logisticsWorldToScreen(camera, point);
    const world = h.context.logisticsScreenToWorld(camera, screen);
    assert.ok(Math.abs(world.x - point.x) < 1e-9);
    assert.ok(Math.abs(world.y - point.y) < 1e-9);
  }
});

test('pointer-centred zoom invariant: world point under pointer is unchanged', () => {
  const h = createHarness();
  const pointers = [{ x: 0, y: 0 }, { x: 400, y: 210 }, { x: 799, y: 1 }, { x: 55.5, y: 388.2 }];
  const zooms = [0.3, 0.5, 1, 1.5, 2.4, 2.99];
  let camera = { k: 1, tx: 400, ty: 210, userModified: false };
  for (const pointer of pointers) {
    for (const nextK of zooms) {
      const before = h.context.logisticsScreenToWorld(camera, pointer);
      const next = h.context.logisticsZoomAt(camera, pointer, nextK);
      const after = h.context.logisticsScreenToWorld(next, pointer);
      assert.ok(Math.abs(before.x - after.x) < 1e-6, `x drift at ${JSON.stringify(pointer)} -> ${nextK}`);
      assert.ok(Math.abs(before.y - after.y) < 1e-6, `y drift at ${JSON.stringify(pointer)} -> ${nextK}`);
      camera = next;
    }
  }
});

test('zoom clamps at minimum and does not move tx/ty beyond the clamp', () => {
  const h = createHarness();
  const camera = { k: ZOOM_MIN, tx: 10, ty: 20, userModified: false };
  const next = h.context.logisticsZoomAt(camera, { x: 100, y: 100 }, 0.01);
  assert.strictEqual(next.k, ZOOM_MIN);
});

test('zoom clamps at maximum and does not move tx/ty beyond the clamp', () => {
  const h = createHarness();
  const camera = { k: 3, tx: 10, ty: 20, userModified: false };
  const next = h.context.logisticsZoomAt(camera, { x: 100, y: 100 }, 99);
  assert.strictEqual(next.k, 3);
});

test('repeated wheel input at the zoom limit does not drift tx/ty', () => {
  const h = createHarness();
  let camera = { k: 3, tx: 12.5, ty: -8.25, userModified: false };
  for (let i = 0; i < 20; i++) {
    camera = h.context.logisticsZoomFromWheel(camera, { x: 300, y: 150 }, -500);
  }
  assert.strictEqual(camera.k, 3);
  assert.strictEqual(camera.tx, 12.5);
  assert.strictEqual(camera.ty, -8.25);
  camera = { k: 0.25, tx: 3.5, ty: 4.5, userModified: false };
  for (let i = 0; i < 20; i++) {
    camera = h.context.logisticsZoomFromWheel(camera, { x: 300, y: 150 }, 500);
  }
  assert.strictEqual(camera.k, 0.25);
  assert.strictEqual(camera.tx, 3.5);
  assert.strictEqual(camera.ty, 4.5);
});

test('line-mode wheel delta is normalized before zooming', () => {
  const h = createHarness();
  const camera = { k: 1, tx: 0, ty: 0, userModified: false };
  const pixelResult = h.context.logisticsZoomFromWheel(camera, { x: 0, y: 0 }, -16);
  const lineResult = h.context.logisticsZoomFromWheel(camera, { x: 0, y: 0 }, h.context.logisticsWheelDeltaY({ deltaY: -1, deltaMode: 1 }));
  assert.ok(Math.abs(pixelResult.k - lineResult.k) < 1e-9);
  assert.strictEqual(h.context.logisticsWheelDeltaY({ deltaY: 2, deltaMode: 0 }), 2);
});

// --- 7-10: Fit All --------------------------------------------------------

test('Fit All produces symmetric slack around the content centre', () => {
  const h = createHarness();
  const bbox = { minX: 100, minY: 50, maxX: 300, maxY: 150 };
  const viewportSize = { width: 800, height: 420 };
  const camera = h.context.logisticsFitAllCamera(bbox, viewportSize);
  const topLeft = h.context.logisticsWorldToScreen(camera, { x: bbox.minX, y: bbox.minY });
  const bottomRight = h.context.logisticsWorldToScreen(camera, { x: bbox.maxX, y: bbox.maxY });
  const leftSlack = topLeft.x;
  const rightSlack = viewportSize.width - bottomRight.x;
  const topSlack = topLeft.y;
  const bottomSlack = viewportSize.height - bottomRight.y;
  assert.ok(Math.abs(leftSlack - rightSlack) < 1e-6, 'left/right slack must match');
  assert.ok(Math.abs(topSlack - bottomSlack) < 1e-6, 'top/bottom slack must match');
});

test('Fit All respects the ~32px screen-space padding', () => {
  const h = createHarness();
  const bbox = { minX: 0, minY: 0, maxX: 2000, maxY: 40 };
  const viewportSize = { width: 800, height: 420 };
  const camera = h.context.logisticsFitAllCamera(bbox, viewportSize);
  const topLeft = h.context.logisticsWorldToScreen(camera, { x: bbox.minX, y: bbox.minY });
  assert.ok(topLeft.x >= 31 && topLeft.x <= 33, `expected ~32px padding, got ${topLeft.x}`);
});

test('Fit All handles an empty graph without NaN or throwing', () => {
  const h = createHarness();
  const viewportSize = { width: 800, height: 420 };
  const camera = h.context.logisticsFitAllCamera(null, viewportSize);
  assert.ok(Number.isFinite(camera.k) && Number.isFinite(camera.tx) && Number.isFinite(camera.ty));
});

test('Fit All handles a single node without absurd zoom', () => {
  const h = createHarness();
  const layout = h.context.buildLogisticsLayout(oneNodePayload().nodes);
  const bbox = h.context.logisticsComputeContentBBox(layout.positions);
  const camera = h.context.logisticsFitAllCamera(bbox, { width: 800, height: 420 });
  assert.ok(camera.k >= ZOOM_MIN && camera.k <= ZOOM_MAX);
  assert.ok(camera.k <= 6, `single node should not zoom absurdly, got k=${camera.k}`);
});

// --- 11-20: DOM/event wiring ----------------------------------------------

test('background drag pans the camera', () => {
  const h = renderHarness(threeNodePayload());
  const viewport = viewportOf(h);
  const before = parseTransform(transformOf(h));
  viewport.dispatchEvent({ type: 'pointerdown', clientX: 100, clientY: 100, button: 0, pointerId: 1 });
  viewport.dispatchEvent({ type: 'pointermove', clientX: 140, clientY: 130, pointerId: 1 });
  const after = parseTransform(transformOf(h));
  assert.strictEqual(after.tx, before.tx + 40);
  assert.strictEqual(after.ty, before.ty + 30);
  viewport.dispatchEvent({ type: 'pointerup', pointerId: 1 });
});

test('left-drag directly on a node does not pan the camera', () => {
  const h = renderHarness(threeNodePayload());
  const viewport = viewportOf(h);
  const node = nodeGroup(h, 'source');
  const before = transformOf(h);
  node.dispatchEvent({ type: 'pointerdown', clientX: 100, clientY: 100, button: 0, pointerId: 2 });
  viewport.dispatchEvent({ type: 'pointermove', clientX: 200, clientY: 200, pointerId: 2 });
  assert.strictEqual(transformOf(h), before);
});

test('middle-button drag over a node pans the camera', () => {
  const h = renderHarness(threeNodePayload());
  const viewport = viewportOf(h);
  const node = nodeGroup(h, 'source');
  const before = parseTransform(transformOf(h));
  node.dispatchEvent({ type: 'pointerdown', clientX: 100, clientY: 100, button: 1, pointerId: 3 });
  viewport.dispatchEvent({ type: 'pointermove', clientX: 150, clientY: 90, pointerId: 3 });
  const after = parseTransform(transformOf(h));
  assert.strictEqual(after.tx, before.tx + 50);
  assert.strictEqual(after.ty, before.ty - 10);
});

test('Space + drag over a node pans the camera', () => {
  const h = renderHarness(threeNodePayload());
  const viewport = viewportOf(h);
  const node = nodeGroup(h, 'source');
  viewport.dispatchEvent({ type: 'keydown', key: ' ', code: 'Space' });
  const before = parseTransform(transformOf(h));
  node.dispatchEvent({ type: 'pointerdown', clientX: 60, clientY: 60, button: 0, pointerId: 4 });
  viewport.dispatchEvent({ type: 'pointermove', clientX: 20, clientY: 60, pointerId: 4 });
  const after = parseTransform(transformOf(h));
  assert.strictEqual(after.tx, before.tx - 40);
  viewport.dispatchEvent({ type: 'keyup', key: ' ', code: 'Space' });
});

test('sub-threshold movement remains a click and preserves node selection', () => {
  const h = renderHarness(threeNodePayload());
  const viewport = viewportOf(h);
  const node = nodeGroup(h, 'source');
  const before = transformOf(h);
  assert.ok(h.panel.textContent.includes('webview.world.logisticsSelectHint'), 'nothing selected yet');
  node.dispatchEvent({ type: 'pointerdown', clientX: 100, clientY: 100, button: 0, pointerId: 5 });
  viewport.dispatchEvent({ type: 'pointermove', clientX: 101, clientY: 100, pointerId: 5 });
  assert.strictEqual(transformOf(h), before, 'sub-threshold movement must not pan');
  node.dispatchEvent({ type: 'click' });
  assert.ok(
    !h.panel.textContent.includes('webview.world.logisticsSelectHint'),
    'click after a sub-threshold move must still select the node'
  );
});

test('pointer capture is requested on drag start and released on drag end', () => {
  const h = renderHarness(threeNodePayload());
  const viewport = viewportOf(h);
  viewport.dispatchEvent({ type: 'pointerdown', clientX: 10, clientY: 10, button: 0, pointerId: 7 });
  assert.deepStrictEqual(viewport.pointerCaptures, [7]);
  viewport.dispatchEvent({ type: 'pointerup', pointerId: 7 });
  assert.deepStrictEqual(viewport.pointerReleases, [7]);
});

test('Escape cancels an active drag and restores the pre-drag camera', () => {
  const h = renderHarness(threeNodePayload());
  const viewport = viewportOf(h);
  const before = transformOf(h);
  viewport.dispatchEvent({ type: 'pointerdown', clientX: 10, clientY: 10, button: 0, pointerId: 8 });
  viewport.dispatchEvent({ type: 'pointermove', clientX: 200, clientY: 200, pointerId: 8 });
  assert.notStrictEqual(transformOf(h), before, 'drag should have moved the camera first');
  viewport.dispatchEvent({ type: 'keydown', key: 'Escape' });
  assert.strictEqual(transformOf(h), before, 'Escape must restore the pre-drag camera');
  // Further movement after cancel must not resume panning.
  viewport.dispatchEvent({ type: 'pointermove', clientX: 400, clientY: 400, pointerId: 8 });
  assert.strictEqual(transformOf(h), before);
});

test('arrow keys pan the camera by the standard step', () => {
  const h = renderHarness(threeNodePayload());
  const viewport = viewportOf(h);
  const before = parseTransform(transformOf(h));
  viewport.dispatchEvent({ type: 'keydown', key: 'ArrowRight' });
  const after = parseTransform(transformOf(h));
  assert.strictEqual(after.tx, before.tx - 48);
  assert.strictEqual(after.ty, before.ty);
});

test('Shift+arrow pans faster than a plain arrow key', () => {
  const h = renderHarness(threeNodePayload());
  const viewport = viewportOf(h);
  const before = parseTransform(transformOf(h));
  viewport.dispatchEvent({ type: 'keydown', key: 'ArrowUp', shiftKey: true });
  const after = parseTransform(transformOf(h));
  assert.strictEqual(after.ty, before.ty + 48 * 4);
});

test('camera shortcuts are ignored when focus is outside the graph viewport', () => {
  const h = renderHarness(threeNodePayload());
  const before = transformOf(h);
  // Dispatched on the panel (an ancestor, not a descendant, of the viewport)
  // never reaches the viewport's own keydown listener.
  h.panel.dispatchEvent({ type: 'keydown', key: 'ArrowRight' });
  assert.strictEqual(transformOf(h), before);
});

// --- 21-25: render/rerender integration ------------------------------------

test('camera transform updates without rebuilding the graph DOM', () => {
  const h = renderHarness(threeNodePayload());
  const viewport = viewportOf(h);
  const svgBefore = svgOf(h);
  const nodeBefore = nodeGroup(h, 'source');
  viewport.dispatchEvent({ type: 'wheel', clientX: 400, clientY: 210, deltaY: -100 });
  assert.strictEqual(svgOf(h), svgBefore, 'wheel must not replace the SVG element');
  assert.strictEqual(nodeGroup(h, 'source'), nodeBefore, 'wheel must not replace node elements');
});

test('selecting a route does not reset the camera', () => {
  const h = renderHarness(threeNodePayload());
  const viewport = viewportOf(h);
  viewport.dispatchEvent({ type: 'wheel', clientX: 400, clientY: 210, deltaY: -400 });
  const zoomed = transformOf(h);
  const route = findAll(h.panel, (n) => n.dataset.routeId === 'grain_route')[0];
  route.dispatchEvent({ type: 'click' });
  assert.strictEqual(transformOf(h), zoomed, 'selection rerender must retain the camera');
});

test('an ordinary rerender with the same dataset identity retains the camera', () => {
  const h = renderHarness(threeNodePayload());
  const viewport = viewportOf(h);
  viewport.dispatchEvent({ type: 'wheel', clientX: 400, clientY: 210, deltaY: -300 });
  const panned = transformOf(h);
  const nextTick = threeNodePayload({ routes: [{ ...threeNodePayload().routes[0], volume: 8, utilization: 0.4 }] });
  h.context.renderEconomyLogistics(nextTick, true);
  assert.strictEqual(transformOf(h), panned, 'same node/route ids must retain the camera across a payload push');
});

test('a materially changed dataset performs at most one bounded Fit All', () => {
  const h = renderHarness(threeNodePayload());
  const viewport = viewportOf(h);
  let fitCalls = 0;
  const originalFit = h.context.logisticsFitAllCamera;
  h.context.logisticsFitAllCamera = (...args) => { fitCalls++; return originalFit(...args); };
  // Pan far enough that the graph is entirely off-screen for the new dataset.
  viewport.dispatchEvent({ type: 'pointerdown', clientX: 0, clientY: 0, button: 0, pointerId: 9 });
  viewport.dispatchEvent({ type: 'pointermove', clientX: -100000, clientY: -100000, pointerId: 9 });
  viewport.dispatchEvent({ type: 'pointerup', pointerId: 9 });
  fitCalls = 0;
  const grown = threeNodePayload({
    nodes: [...threeNodePayload().nodes, { id: 'extra', label: 'Extra', kind: 'store', commodityIds: [], production: [], processingSiteIds: [], shortageCommodityIds: [] }],
  });
  h.context.renderEconomyLogistics(grown, true);
  assert.strictEqual(fitCalls, 1, `expected exactly one Fit All, got ${fitCalls}`);
  const layout = h.context.buildLogisticsLayout(grown.nodes);
  const bbox = h.context.logisticsComputeContentBBox(layout.positions);
  const expected = originalFit(bbox, { width: 800, height: VIEWPORT_HEIGHT });
  const actual = parseTransform(transformOf(h));
  assert.ok(Math.abs(actual.k - expected.k) < 1e-6);
  assert.ok(Math.abs(actual.tx - expected.tx) < 1e-6);
  assert.ok(Math.abs(actual.ty - expected.ty) < 1e-6);
});

test('reduced motion applies discrete camera commands without an easing class', () => {
  const h = renderHarness(threeNodePayload(), { reducedMotion: true });
  const viewport = viewportOf(h);
  viewport.dispatchEvent({ type: 'keydown', key: '+', code: 'Equal' });
  const cameraGroup = cameraGroupOf(h);
  assert.strictEqual(cameraGroup.classList.contains('is-easing'), false);
});

test('non-reduced-motion toolbar/keyboard commands apply an easing class', () => {
  const h = renderHarness(threeNodePayload(), { reducedMotion: false });
  const viewport = viewportOf(h);
  viewport.dispatchEvent({ type: 'keydown', key: '+', code: 'Equal' });
  const cameraGroup = cameraGroupOf(h);
  assert.strictEqual(cameraGroup.classList.contains('is-easing'), true);
});

test('wheel and direct drag never apply an easing class', () => {
  const h = renderHarness(threeNodePayload(), { reducedMotion: false });
  const viewport = viewportOf(h);
  viewport.dispatchEvent({ type: 'wheel', clientX: 400, clientY: 210, deltaY: -100 });
  assert.strictEqual(cameraGroupOf(h).classList.contains('is-easing'), false);
  viewport.dispatchEvent({ type: 'pointerdown', clientX: 0, clientY: 0, button: 0, pointerId: 11 });
  viewport.dispatchEvent({ type: 'pointermove', clientX: 30, clientY: 30, pointerId: 11 });
  assert.strictEqual(cameraGroupOf(h).classList.contains('is-easing'), false);
});

// --- 26-27: existing behavior stays unchanged -------------------------------

test('particle flow behavior on a positive-volume route is unchanged', () => {
  const h = renderHarness(threeNodePayload());
  const route = findAll(h.panel, (n) => n.dataset.routeId === 'grain_route')[0];
  const dots = findAll(route, (n) => n.classList.contains('logistics-flow-dot'));
  assert.strictEqual(dots.length, 2, 'open, positive-volume routes still render 2 SMIL particles');
  const line = findAll(route, (n) => n.classList.contains('logistics-route-line'))[0];
  const motionPath = findAll(dots[0], (n) => n.tagName === 'MPATH')[0];
  assert.strictEqual(motionPath.getAttribute('href'), `#${line.getAttribute('id')}`);
});

test('deterministic route geometry and node layout output are unchanged', () => {
  const h = createHarness();
  const from = { x: 100, y: 80 };
  const to = { x: 500, y: 220 };
  const geometry = h.context.logisticsRouteGeometry({ id: 'r1' }, from, to);
  // Endpoints are still fixed ±78 world-space units from the node centres
  // (unchanged geometry formula); the camera transform sits outside this.
  // Objects here are constructed inside the vm context (a different realm),
  // so compare primitive fields rather than assert.deepStrictEqual, which
  // treats same-shape cross-realm objects as unequal.
  assert.strictEqual(geometry.start.x, 178);
  assert.strictEqual(geometry.start.y, 80);
  assert.strictEqual(geometry.end.x, 422);
  assert.strictEqual(geometry.end.y, 220);
  assert.ok(geometry.d.startsWith('M 178,80 C '));
  assert.ok(geometry.d.endsWith(' 422,220'));
  assert.strictEqual(geometry.d, h.context.logisticsRouteGeometry({ id: 'r1' }, from, to).d);
  const layout = h.context.buildLogisticsLayout(threeNodePayload().nodes);
  const source = layout.positions.get('source');
  const facility = layout.positions.get('facility');
  const market = layout.positions.get('market');
  assert.strictEqual(source.x, 105); assert.strictEqual(source.y, 140);
  assert.strictEqual(facility.x, 380); assert.strictEqual(facility.y, 140);
  assert.strictEqual(market.x, 655); assert.strictEqual(market.y, 140);
});

if (failed) { process.exit(1); }
console.log('logistics camera: all tests passed.');
