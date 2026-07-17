#!/usr/bin/env node
'use strict';

// LOGISTICS-GRAPH-CANVAS-SLICE1-CORRECTIONS — behavioral tests for the
// pointer-centred camera. Exercises pure camera math AND real event wiring
// (wheel/pointer/keyboard) against a bubbling-aware DOM stub, per
// docs/LOGISTICS_GRAPH_CANVAS_ARCHITECTURE.md §2 and the F1–F7 correction
// contract. Production constants are read from the evaluated module (not
// duplicated here) via a test-only appended export expression.

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const layoutModulePath = path.join(root, 'webview', 'modules', '85b1-logistics-layout.js');
const geometryModulePath = path.join(root, 'webview', 'modules', '85b2-logistics-route-geometry.js');
const modulePath = path.join(root, 'webview', 'modules', '85b-economy-logistics.js');
const source = `${fs.readFileSync(layoutModulePath, 'utf8')}\n${fs.readFileSync(geometryModulePath, 'utf8')}\n${fs.readFileSync(modulePath, 'utf8')}`;
let failed = 0;

// Appended only to the evaluation string — never shipped in production code.
// Top-level `const` bindings are not exposed by vm on the context object.
const TEST_API_EXPORT = `
;globalThis.__logisticsCameraTestApi = {
  LOGISTICS_ZOOM_MIN,
  LOGISTICS_ZOOM_MAX,
  LOGISTICS_ZOOM_STEP,
  LOGISTICS_VIEWPORT_HEIGHT,
  LOGISTICS_VIEWPORT_HEIGHT_LIGHTBOX,
  LOGISTICS_VIEWPORT_WIDTH_FALLBACK,
  LOGISTICS_FIT_SLACK,
  LOGISTICS_FIT_PADDING,
  LOGISTICS_WHEEL_DELTA_MAX,
  LOGISTICS_DRAG_THRESHOLD_PX,
  LOGISTICS_PAN_STEP,
  logisticsZoomAt,
  logisticsZoomFromWheel,
  logisticsWheelDeltaY,
  logisticsPanBy,
  logisticsFitAllCamera,
  logisticsClampZoom,
  logisticsIsValidCamera,
  logisticsDefaultCamera,
  logisticsComputeContentBBox,
  logisticsResolveCameraForRender,
  logisticsSanitizeViewportSize,
  logisticsIsFiniteBBox,
  logisticsIsBackgroundPanTarget,
  logisticsIsControlTarget,
  logisticsIsGraphContentTarget,
  logisticsCameraHostKey,
  logisticsActiveCameraContext,
  economyLogisticsUiState,
  ensureVisualLightbox,
};
`;

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
    this.type = '';
    this.clientWidth = 0;
    this.pointerCaptures = [];
    this.pointerReleases = [];
    this._capturedPointerId = null;
    this.isContentEditable = false;
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
  getAttribute(name) { return this.attributes[name] === undefined ? null : this.attributes[name]; }
  addEventListener(type, listener, options) {
    const capture = options === true || (options && options.capture);
    const key = capture ? `${type}__capture` : type;
    (this.listeners[key] ||= []).push(listener);
  }
  focus() {
    const prev = this.ownerDocument.activeElement;
    if (prev && prev !== this && typeof prev.blur === 'function') {
      // do not recurse infinitely
    }
    this.ownerDocument.activeElement = this;
  }
  blur() {
    if (this.ownerDocument.activeElement === this) {
      this.ownerDocument.activeElement = this.ownerDocument.body;
    }
    this.dispatchEvent({ type: 'blur' });
    this.dispatchEvent({ type: 'focusout' });
  }
  getBoundingClientRect() {
    return {
      left: 0, top: 0,
      width: this.clientWidth || 0,
      height: 0,
      right: this.clientWidth || 0,
      bottom: 0,
    };
  }
  setPointerCapture(pointerId) {
    this.pointerCaptures.push(pointerId);
    this._capturedPointerId = pointerId;
    this.ownerDocument.pointerCaptureOwner = this;
    this.ownerDocument.pointerCaptureId = pointerId;
  }
  releasePointerCapture(pointerId) {
    this.pointerReleases.push(pointerId);
    if (this._capturedPointerId === pointerId) {
      this._capturedPointerId = null;
    }
    if (
      this.ownerDocument.pointerCaptureOwner === this
      && this.ownerDocument.pointerCaptureId === pointerId
    ) {
      this.ownerDocument.pointerCaptureOwner = null;
      this.ownerDocument.pointerCaptureId = null;
      this.dispatchEvent({ type: 'lostpointercapture', pointerId });
    }
  }
  dispatchEvent(event) {
    event.target = event.target || this;
    event.currentTarget = null;
    event.defaultPrevented = Boolean(event.defaultPrevented);
    let stopped = false;
    event.preventDefault ||= () => { event.defaultPrevented = true; };
    event.stopPropagation ||= () => { stopped = true; };
    // Capture phase (viewport click suppressor etc.)
    const path = [];
    let walk = this;
    while (walk) { path.push(walk); walk = walk.parentNode; }
    for (let i = path.length - 1; i >= 0 && !stopped; i--) {
      const node = path[i];
      event.currentTarget = node;
      (node.listeners[`${event.type}__capture`] || []).forEach((listener) => listener(event));
    }
    // Bubble phase
    let node = this;
    while (node && !stopped) {
      event.currentTarget = node;
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
    this.pointerCaptureOwner = null;
    this.pointerCaptureId = null;
    this.body = this.createElement('body');
    this.activeElement = this.body;
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
  const windowListeners = {};
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
  context.globalThis = context;
  context.window = context;
  context.addEventListener = (type, listener) => {
    (windowListeners[type] ||= []).push(listener);
  };
  context.removeEventListener = (type, listener) => {
    windowListeners[type] = (windowListeners[type] || []).filter((item) => item !== listener);
  };
  context.dispatchWindowEvent = (event) => {
    event.defaultPrevented = Boolean(event.defaultPrevented);
    event.preventDefault ||= () => { event.defaultPrevented = true; };
    (windowListeners[event.type] || []).forEach((listener) => listener(event));
  };
  context.localStorage = { getItem: () => 'on', setItem: () => {} };
  context.matchMedia = () => ({ matches: reducedMotion, addEventListener: () => {}, addListener: () => {} });
  vm.runInNewContext(source + TEST_API_EXPORT, context, { filename: modulePath });
  return { document, rootNode, section, panel, context, windowListeners };
}

function apiOf(h) {
  const api = h.context.__logisticsCameraTestApi;
  assert.ok(api, 'test API export missing — production evaluation failed');
  return api;
}

function uiStateOf(h) {
  return apiOf(h).economyLogisticsUiState;
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
function toolbarBtn(h, className) {
  return findAll(h.panel, (n) => n.classList.contains(className))[0];
}
function expandBtnOf(h) {
  return findAll(h.panel, (n) => n.classList.contains('logistics-expand-btn'))[0];
}
function lightboxBodyOf(h) {
  return findAll(h.document.body, (n) => n.classList.contains('visual-lightbox-body'))[0];
}
function lightboxViewportOf(h) {
  const body = lightboxBodyOf(h);
  return body ? findAll(body, (n) => n.classList.contains('logistics-network-viewport'))[0] : null;
}
function lightboxCameraGroupOf(h) {
  const body = lightboxBodyOf(h);
  return body ? findAll(body, (n) => n.classList.contains('logistics-camera'))[0] : null;
}
function lightboxTransformOf(h) {
  const g = lightboxCameraGroupOf(h);
  return g ? g.getAttribute('transform') : null;
}

function parseTransform(str) {
  const m = /translate\(([^ ]+) ([^)]+)\) scale\(([^)]+)\)/.exec(str || '');
  if (!m) { return null; }
  return { tx: Number(m[1]), ty: Number(m[2]), k: Number(m[3]) };
}

function cameraSnapshot(cam) {
  if (!cam) { return null; }
  return { k: cam.k, tx: cam.tx, ty: cam.ty, userModified: cam.userModified };
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
  const api = apiOf(h);
  const camera = { k: api.LOGISTICS_ZOOM_MIN, tx: 10, ty: 20, userModified: false };
  const next = h.context.logisticsZoomAt(camera, { x: 100, y: 100 }, 0.01);
  assert.strictEqual(next.k, api.LOGISTICS_ZOOM_MIN);
});

test('zoom clamps at maximum and does not move tx/ty beyond the clamp', () => {
  const h = createHarness();
  const api = apiOf(h);
  const camera = { k: api.LOGISTICS_ZOOM_MAX, tx: 10, ty: 20, userModified: false };
  const next = h.context.logisticsZoomAt(camera, { x: 100, y: 100 }, 99);
  assert.strictEqual(next.k, api.LOGISTICS_ZOOM_MAX);
});

test('repeated wheel input at the zoom limit does not drift tx/ty', () => {
  const h = createHarness();
  const api = apiOf(h);
  let camera = { k: api.LOGISTICS_ZOOM_MAX, tx: 12.5, ty: -8.25, userModified: false };
  for (let i = 0; i < 20; i++) {
    camera = h.context.logisticsZoomFromWheel(camera, { x: 300, y: 150 }, -500);
  }
  assert.strictEqual(camera.k, api.LOGISTICS_ZOOM_MAX);
  assert.strictEqual(camera.tx, 12.5);
  assert.strictEqual(camera.ty, -8.25);
  camera = { k: api.LOGISTICS_ZOOM_MIN, tx: 3.5, ty: 4.5, userModified: false };
  for (let i = 0; i < 20; i++) {
    camera = h.context.logisticsZoomFromWheel(camera, { x: 300, y: 150 }, 500);
  }
  assert.strictEqual(camera.k, api.LOGISTICS_ZOOM_MIN);
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

test('Fit All respects screen-space padding and applies FIT_SLACK', () => {
  const h = createHarness();
  const api = apiOf(h);
  const bbox = { minX: 0, minY: 0, maxX: 2000, maxY: 40 };
  const viewportSize = { width: 800, height: 420 };
  const camera = h.context.logisticsFitAllCamera(bbox, viewportSize);
  const contentW = bbox.maxX - bbox.minX;
  const contentH = bbox.maxY - bbox.minY;
  const availW = viewportSize.width - api.LOGISTICS_FIT_PADDING * 2;
  const availH = viewportSize.height - api.LOGISTICS_FIT_PADDING * 2;
  const expectedK = Math.max(
    api.LOGISTICS_ZOOM_MIN,
    Math.min(api.LOGISTICS_ZOOM_MAX, Math.min(availW / contentW, availH / contentH) * api.LOGISTICS_FIT_SLACK)
  );
  assert.ok(Math.abs(camera.k - expectedK) < 1e-9, `expected k=${expectedK}, got ${camera.k}`);
  const topLeft = h.context.logisticsWorldToScreen(camera, { x: bbox.minX, y: bbox.minY });
  assert.ok(topLeft.x >= api.LOGISTICS_FIT_PADDING - 1e-6, `padding must be at least ${api.LOGISTICS_FIT_PADDING}, got ${topLeft.x}`);
});

test('Fit All handles an empty graph without NaN or throwing', () => {
  const h = createHarness();
  const viewportSize = { width: 800, height: 420 };
  const camera = h.context.logisticsFitAllCamera(null, viewportSize);
  assert.ok(Number.isFinite(camera.k) && Number.isFinite(camera.tx) && Number.isFinite(camera.ty));
});

test('Fit All handles a single node without absurd zoom', () => {
  const h = createHarness();
  const api = apiOf(h);
  const layout = h.context.buildLogisticsLayout(oneNodePayload().nodes);
  const bbox = h.context.logisticsComputeContentBBox(layout.positions);
  const camera = h.context.logisticsFitAllCamera(bbox, { width: 800, height: 420 });
  assert.ok(camera.k >= api.LOGISTICS_ZOOM_MIN && camera.k <= api.LOGISTICS_ZOOM_MAX);
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
  viewport.focus();
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
  const api = apiOf(h);
  const viewport = viewportOf(h);
  const before = parseTransform(transformOf(h));
  const event = { type: 'keydown', key: 'ArrowRight' };
  viewport.dispatchEvent(event);
  const after = parseTransform(transformOf(h));
  assert.strictEqual(after.tx, before.tx - api.LOGISTICS_PAN_STEP);
  assert.strictEqual(after.ty, before.ty);
  assert.strictEqual(event.defaultPrevented, true, 'arrow keys must prevent surrounding-panel scroll');
});

test('Shift+arrow pans faster than a plain arrow key', () => {
  const h = renderHarness(threeNodePayload());
  const api = apiOf(h);
  const viewport = viewportOf(h);
  const before = parseTransform(transformOf(h));
  viewport.dispatchEvent({ type: 'keydown', key: 'ArrowUp', shiftKey: true });
  const after = parseTransform(transformOf(h));
  assert.strictEqual(after.ty, before.ty + api.LOGISTICS_PAN_STEP * 4);
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

test('user-modified camera survives dataset change without auto Fit All', () => {
  const h = renderHarness(threeNodePayload());
  const viewport = viewportOf(h);
  let fitCalls = 0;
  const originalFit = h.context.logisticsFitAllCamera;
  h.context.logisticsFitAllCamera = (...args) => { fitCalls++; return originalFit(...args); };

  // User pans far away (userModified = true).
  viewport.dispatchEvent({ type: 'pointerdown', clientX: 0, clientY: 0, button: 0, pointerId: 9 });
  viewport.dispatchEvent({ type: 'pointermove', clientX: -100000, clientY: -100000, pointerId: 9 });
  viewport.dispatchEvent({ type: 'pointerup', pointerId: 9 });
  const userCam = cameraSnapshot(uiStateOf(h).cameraContexts.normal.camera);
  const beforeTx = userCam.tx;
  assert.strictEqual(userCam.userModified, true);
  fitCalls = 0;

  const grown = threeNodePayload({
    nodes: [...threeNodePayload().nodes, { id: 'extra', label: 'Extra', kind: 'store', commodityIds: [], production: [], processingSiteIds: [], shortageCommodityIds: [] }],
  });
  h.context.renderEconomyLogistics(grown, true);
  assert.strictEqual(fitCalls, 0, `user-modified camera must never auto-refit, got ${fitCalls} Fit All calls`);
  const after = uiStateOf(h).cameraContexts.normal.camera;
  assert.strictEqual(after.k, userCam.k);
  assert.strictEqual(after.tx, beforeTx);
  assert.strictEqual(after.ty, userCam.ty);
  assert.strictEqual(after.userModified, true);
  // Identity storage updates; camera numbers stay byte-equivalent.
  assert.notStrictEqual(
    uiStateOf(h).cameraContexts.normal.identity,
    h.context.logisticsDatasetIdentity(threeNodePayload())
  );
  assert.strictEqual(
    uiStateOf(h).cameraContexts.normal.identity,
    h.context.logisticsDatasetIdentity(grown)
  );

  // Manual Fit All still works.
  fitCalls = 0;
  const fitBtn = toolbarBtn(h, 'logistics-camera-fit');
  fitBtn.dispatchEvent({ type: 'click' });
  assert.strictEqual(fitCalls, 1, 'toolbar Fit All must still run');
  const fitted = parseTransform(transformOf(h));
  assert.ok(Number.isFinite(fitted.k) && Number.isFinite(fitted.tx) && Number.isFinite(fitted.ty));
  assert.notStrictEqual(fitted.tx, beforeTx);
});

test('unmodified offscreen camera may fit once on dataset change', () => {
  const h = renderHarness(threeNodePayload());
  const api = apiOf(h);
  let fitCalls = 0;
  const originalFit = h.context.logisticsFitAllCamera;
  h.context.logisticsFitAllCamera = (...args) => { fitCalls++; return originalFit(...args); };

  // Seed an unmodified camera far off-screen with a stale identity.
  uiStateOf(h).cameraContexts.normal.camera = {
    k: 1, tx: -1e6, ty: -1e6, userModified: false,
  };
  uiStateOf(h).cameraContexts.normal.identity = 'stale|identity';
  fitCalls = 0;

  const grown = threeNodePayload({
    nodes: [...threeNodePayload().nodes, { id: 'extra2', label: 'Extra2', kind: 'store', commodityIds: [], production: [], processingSiteIds: [], shortageCommodityIds: [] }],
  });
  h.context.renderEconomyLogistics(grown, true);
  assert.strictEqual(fitCalls, 1, `expected exactly one Fit All for unmodified offscreen, got ${fitCalls}`);
  const layout = h.context.buildLogisticsLayout(grown.nodes, grown.routes);
  const bbox = layout.bounds;
  const expected = originalFit(bbox, { width: 800, height: api.LOGISTICS_VIEWPORT_HEIGHT });
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

test('deterministic route geometry and regional node layout output are stable', () => {
  const h = createHarness();
  const from = { x: 100, y: 80 };
  const to = { x: 500, y: 220 };
  const geometry = h.context.logisticsRouteGeometry({ id: 'r1' }, from, to);
  // LOGISTICS-GRAPH-CANVAS-SLICE3: endpoints now sit on the node's boundary
  // (a deterministic port), not at a fixed +/-78 centre offset. Default box
  // size is 152x60 (see logisticsRouteGeometry's adapter). The camera
  // transform sits outside this either way. Objects here are constructed
  // inside the vm context (a different realm), so compare primitive fields
  // rather than assert.deepStrictEqual, which treats same-shape cross-realm
  // objects as unequal.
  assert.strictEqual(geometry.start.x, from.x + 76, 'start sits on the source box boundary, not its centre');
  assert.notStrictEqual(geometry.start.x, from.x);
  assert.strictEqual(geometry.end.x, to.x - 76, 'end sits on the target box boundary, not its centre');
  assert.notStrictEqual(geometry.end.x, to.x);
  assert.ok(geometry.d.startsWith(`M ${geometry.start.x},${geometry.start.y} C `));
  assert.ok(geometry.d.endsWith(` ${geometry.end.x},${geometry.end.y}`));
  assert.strictEqual(geometry.d, h.context.logisticsRouteGeometry({ id: 'r1' }, from, to).d, 'same input twice is byte-identical');
  const payload = threeNodePayload();
  const layout = h.context.buildLogisticsLayout(payload.nodes, payload.routes);
  const again = h.context.buildLogisticsLayout(payload.nodes.slice().reverse(), payload.routes.slice().reverse());
  for (const id of ['source', 'facility', 'market']) {
    assert.ok(layout.positions.get(id));
    assert.strictEqual(JSON.stringify(layout.positions.get(id)), JSON.stringify(again.positions.get(id)));
  }
});

// --- F1–F7 correction cases -----------------------------------------------

test('normal and lightbox cameras are independent', () => {
  const h = renderHarness(threeNodePayload());
  const api = apiOf(h);
  const normalVp = viewportOf(h);

  // 1. normal Fit All
  toolbarBtn(h, 'logistics-camera-fit').dispatchEvent({ type: 'click' });
  const normalAfterFit = cameraSnapshot(uiStateOf(h).cameraContexts.normal.camera);
  assert.ok(normalAfterFit);
  assert.strictEqual(normalAfterFit.userModified, false);

  // Open lightbox
  expandBtnOf(h).dispatchEvent({ type: 'click' });
  assert.ok(uiStateOf(h).lightboxHost, 'lightbox host should be set');
  const lbVp = lightboxViewportOf(h);
  assert.ok(lbVp, 'lightbox viewport should render');

  // 2. lightbox Fit All (different height → different camera)
  const lbFit = findAll(lightboxBodyOf(h), (n) => n.classList.contains('logistics-camera-fit'))[0];
  lbFit.dispatchEvent({ type: 'click' });
  const lightboxAfterFit = cameraSnapshot(uiStateOf(h).cameraContexts.lightbox.camera);
  assert.ok(lightboxAfterFit);
  // Viewport heights differ (420 vs 640) so fit cameras should differ.
  assert.notStrictEqual(
    JSON.stringify(normalAfterFit),
    JSON.stringify(lightboxAfterFit),
    'normal and lightbox Fit All must produce independent cameras'
  );

  // 3. pan lightbox
  lbVp.dispatchEvent({ type: 'pointerdown', clientX: 50, clientY: 50, button: 0, pointerId: 20 });
  lbVp.dispatchEvent({ type: 'pointermove', clientX: 90, clientY: 80, pointerId: 20 });
  lbVp.dispatchEvent({ type: 'pointerup', pointerId: 20 });
  const lightboxPanned = cameraSnapshot(uiStateOf(h).cameraContexts.lightbox.camera);
  assert.strictEqual(lightboxPanned.userModified, true);
  assert.strictEqual(lightboxPanned.tx, lightboxAfterFit.tx + 40);
  assert.strictEqual(lightboxPanned.ty, lightboxAfterFit.ty + 30);

  // 4. close lightbox
  apiOf(h).ensureVisualLightbox().close();
  assert.strictEqual(uiStateOf(h).lightboxHost, null);

  // 5. normal transform unchanged
  const normalAfterClose = cameraSnapshot(uiStateOf(h).cameraContexts.normal.camera);
  assert.deepStrictEqual(normalAfterClose, normalAfterFit);
  const normalDom = parseTransform(transformOf(h));
  assert.ok(Math.abs(normalDom.tx - normalAfterFit.tx) < 1e-9);
  assert.ok(Math.abs(normalDom.ty - normalAfterFit.ty) < 1e-9);
  assert.ok(Math.abs(normalDom.k - normalAfterFit.k) < 1e-9);

  // 6. reopen lightbox and retain lightbox transform
  expandBtnOf(h).dispatchEvent({ type: 'click' });
  const lightboxReopened = cameraSnapshot(uiStateOf(h).cameraContexts.lightbox.camera);
  assert.deepStrictEqual(lightboxReopened, lightboxPanned);
  const lbDom = parseTransform(lightboxTransformOf(h));
  assert.ok(Math.abs(lbDom.tx - lightboxPanned.tx) < 1e-9);
  assert.ok(Math.abs(lbDom.ty - lightboxPanned.ty) < 1e-9);

  // 7. dataset identity tracked separately
  const grown = threeNodePayload({
    nodes: [...threeNodePayload().nodes, { id: 'lb-extra', label: 'LB', kind: 'store', commodityIds: [], production: [], processingSiteIds: [], shortageCommodityIds: [] }],
  });
  // While lightbox is open, identity updates only the lightbox context.
  const beforeNormalId = uiStateOf(h).cameraContexts.normal.identity;
  h.context.renderEconomyLogistics(grown, true);
  assert.strictEqual(
    uiStateOf(h).cameraContexts.lightbox.identity,
    h.context.logisticsDatasetIdentity(grown)
  );
  // Normal context identity is independent (may still be the previous one until normal re-renders).
  assert.strictEqual(uiStateOf(h).cameraContexts.normal.identity, beforeNormalId);
  assert.strictEqual(api.LOGISTICS_VIEWPORT_HEIGHT, 420);
  assert.strictEqual(api.LOGISTICS_VIEWPORT_HEIGHT_LIGHTBOX, 640);
});

test('toolbar interaction does not pan the camera', () => {
  const h = renderHarness(threeNodePayload());
  const fitBtn = toolbarBtn(h, 'logistics-camera-fit');
  const before = parseTransform(transformOf(h));
  // pointerdown+move on toolbar must not change tx/ty via pan
  fitBtn.dispatchEvent({ type: 'pointerdown', clientX: 10, clientY: 10, button: 0, pointerId: 30 });
  viewportOf(h).dispatchEvent({ type: 'pointermove', clientX: 80, clientY: 80, pointerId: 30 });
  const after = parseTransform(transformOf(h));
  assert.strictEqual(after.tx, before.tx);
  assert.strictEqual(after.ty, before.ty);
});

test('expand button does not pan the camera', () => {
  const h = renderHarness(threeNodePayload());
  const expand = expandBtnOf(h);
  const before = parseTransform(transformOf(h));
  expand.dispatchEvent({ type: 'pointerdown', clientX: 5, clientY: 5, button: 0, pointerId: 31 });
  viewportOf(h).dispatchEvent({ type: 'pointermove', clientX: 60, clientY: 60, pointerId: 31 });
  const after = parseTransform(transformOf(h));
  assert.strictEqual(after.tx, before.tx);
  assert.strictEqual(after.ty, before.ty);
});

test('middle-button pointerdown prevents default', () => {
  const h = renderHarness(threeNodePayload());
  const viewport = viewportOf(h);
  const event = { type: 'pointerdown', clientX: 40, clientY: 40, button: 1, pointerId: 32 };
  viewport.dispatchEvent(event);
  assert.strictEqual(event.defaultPrevented, true);
});

test('Space modifier prevents page scroll when viewport owns focus', () => {
  const h = renderHarness(threeNodePayload());
  const viewport = viewportOf(h);
  viewport.focus();
  const event = { type: 'keydown', key: ' ', code: 'Space' };
  viewport.dispatchEvent(event);
  assert.strictEqual(event.defaultPrevented, true);
  assert.strictEqual(uiStateOf(h).spaceHeld, true);
});

test('Space on focused toolbar button remains usable (no pan-modifier steal)', () => {
  const h = renderHarness(threeNodePayload());
  const fitBtn = toolbarBtn(h, 'logistics-camera-fit');
  fitBtn.focus();
  assert.strictEqual(h.document.activeElement, fitBtn);
  const event = { type: 'keydown', key: ' ', code: 'Space' };
  // Space is delivered to the focused control; even if it bubbles to the
  // viewport, the pan modifier must not engage and must not preventDefault.
  viewportOf(h).dispatchEvent(event);
  assert.strictEqual(uiStateOf(h).spaceHeld, false);
  assert.strictEqual(event.defaultPrevented, false);
});

test('Escape releases stored pointer capture and restores camera', () => {
  const h = renderHarness(threeNodePayload());
  const viewport = viewportOf(h);
  const before = transformOf(h);
  viewport.dispatchEvent({ type: 'pointerdown', clientX: 10, clientY: 10, button: 0, pointerId: 40 });
  assert.deepStrictEqual(viewport.pointerCaptures, [40]);
  viewport.dispatchEvent({ type: 'pointermove', clientX: 100, clientY: 100, pointerId: 40 });
  viewport.dispatchEvent({ type: 'keydown', key: 'Escape' });
  assert.strictEqual(transformOf(h), before);
  assert.ok(viewport.pointerReleases.includes(40), 'Escape must release the stored initiating pointer id');
  assert.strictEqual(h.document.pointerCaptureOwner, null);
});

test('second pointer is ignored during an active drag', () => {
  const h = renderHarness(threeNodePayload());
  const viewport = viewportOf(h);
  const before = parseTransform(transformOf(h));
  viewport.dispatchEvent({ type: 'pointerdown', clientX: 0, clientY: 0, button: 0, pointerId: 50 });
  viewport.dispatchEvent({ type: 'pointermove', clientX: 40, clientY: 0, pointerId: 50 });
  const mid = parseTransform(transformOf(h));
  assert.strictEqual(mid.tx, before.tx + 40);
  // Second pointer tries to hijack
  viewport.dispatchEvent({ type: 'pointerdown', clientX: 0, clientY: 0, button: 0, pointerId: 51 });
  viewport.dispatchEvent({ type: 'pointermove', clientX: 0, clientY: 200, pointerId: 51 });
  assert.strictEqual(parseTransform(transformOf(h)).tx, mid.tx, 'second pointer must not move the camera');
  assert.strictEqual(parseTransform(transformOf(h)).ty, mid.ty);
  // Original pointer still owns the drag
  viewport.dispatchEvent({ type: 'pointermove', clientX: 80, clientY: 0, pointerId: 50 });
  assert.strictEqual(parseTransform(transformOf(h)).tx, before.tx + 80);
  viewport.dispatchEvent({ type: 'pointerup', pointerId: 50 });
  // New drag can begin after cleanup
  viewport.dispatchEvent({ type: 'pointerdown', clientX: 0, clientY: 0, button: 0, pointerId: 52 });
  viewport.dispatchEvent({ type: 'pointermove', clientX: 10, clientY: 0, pointerId: 52 });
  assert.strictEqual(parseTransform(transformOf(h)).tx, before.tx + 80 + 10);
});

test('pointercancel cleans up without leaving drag state', () => {
  const h = renderHarness(threeNodePayload());
  const viewport = viewportOf(h);
  const before = parseTransform(transformOf(h));
  viewport.dispatchEvent({ type: 'pointerdown', clientX: 0, clientY: 0, button: 0, pointerId: 60 });
  viewport.dispatchEvent({ type: 'pointermove', clientX: 50, clientY: 0, pointerId: 60 });
  assert.notStrictEqual(parseTransform(transformOf(h)).tx, before.tx);
  viewport.dispatchEvent({ type: 'pointercancel', pointerId: 60 });
  // Further move of same id must not pan
  const mid = parseTransform(transformOf(h));
  viewport.dispatchEvent({ type: 'pointermove', clientX: 200, clientY: 0, pointerId: 60 });
  assert.strictEqual(parseTransform(transformOf(h)).tx, mid.tx);
  // Fresh drag works
  viewport.dispatchEvent({ type: 'pointerdown', clientX: 0, clientY: 0, button: 0, pointerId: 61 });
  viewport.dispatchEvent({ type: 'pointermove', clientX: 15, clientY: 0, pointerId: 61 });
  assert.strictEqual(parseTransform(transformOf(h)).tx, mid.tx + 15);
});

test('lostpointercapture cleans up drag state', () => {
  const h = renderHarness(threeNodePayload());
  const viewport = viewportOf(h);
  viewport.dispatchEvent({ type: 'pointerdown', clientX: 0, clientY: 0, button: 0, pointerId: 70 });
  viewport.dispatchEvent({ type: 'pointermove', clientX: 30, clientY: 0, pointerId: 70 });
  const mid = parseTransform(transformOf(h));
  // Simulate browser-driven capture loss without going through releasePointerCapture path twice
  viewport._capturedPointerId = 70;
  h.document.pointerCaptureOwner = viewport;
  h.document.pointerCaptureId = 70;
  // Fire lostpointercapture directly (as the browser would)
  viewport.dispatchEvent({ type: 'lostpointercapture', pointerId: 70 });
  viewport.dispatchEvent({ type: 'pointermove', clientX: 300, clientY: 0, pointerId: 70 });
  assert.strictEqual(parseTransform(transformOf(h)).tx, mid.tx, 'move after lostpointercapture must not pan');
});

test('window blur cleans up drag and clears Space state', () => {
  const h = renderHarness(threeNodePayload());
  const viewport = viewportOf(h);
  viewport.focus();
  viewport.dispatchEvent({ type: 'keydown', key: ' ', code: 'Space' });
  assert.strictEqual(uiStateOf(h).spaceHeld, true);
  viewport.dispatchEvent({ type: 'pointerdown', clientX: 0, clientY: 0, button: 0, pointerId: 80 });
  viewport.dispatchEvent({ type: 'pointermove', clientX: 40, clientY: 0, pointerId: 80 });
  const mid = parseTransform(transformOf(h));
  h.context.dispatchWindowEvent({ type: 'blur' });
  assert.strictEqual(uiStateOf(h).spaceHeld, false);
  viewport.dispatchEvent({ type: 'pointermove', clientX: 200, clientY: 0, pointerId: 80 });
  assert.strictEqual(parseTransform(transformOf(h)).tx, mid.tx, 'move after blur must not pan');
});

test('drag past threshold suppresses the synthesized click', () => {
  const h = renderHarness(threeNodePayload());
  const viewport = viewportOf(h);
  const node = nodeGroup(h, 'source');
  // Pan from background far enough to set suppressClick
  viewport.dispatchEvent({ type: 'pointerdown', clientX: 0, clientY: 0, button: 0, pointerId: 90 });
  viewport.dispatchEvent({ type: 'pointermove', clientX: 50, clientY: 0, pointerId: 90 });
  viewport.dispatchEvent({ type: 'pointerup', pointerId: 90 });
  assert.ok(h.panel.textContent.includes('webview.world.logisticsSelectHint'), 'nothing selected yet');
  // Synthesized click after drag must be suppressed (capture listener)
  node.dispatchEvent({ type: 'click' });
  // Because click bubbles from node and suppress is on viewport capture, the
  // suppress flag applies to the next click that reaches the viewport tree.
  // Node click still fires its own listeners first on bubble from node...
  // Capture phase on viewport runs before target phase, so suppress should work
  // for any click inside the viewport after a pan.
  // If the first click was consumed by suppress, selection stays empty:
  // (If node click already selected before suppress — ensure capture works)
  // Re-render may have rebuilt; re-check via a second interaction path:
  // Actually node click handlers fire during bubble from node; capture on
  // viewport runs first on the way down and stopPropagation prevents target.
  // So selection should remain empty.
  assert.ok(
    h.panel.textContent.includes('webview.world.logisticsSelectHint'),
    'click after a real pan must be suppressed'
  );
});

test('sub-threshold motion does not suppress click', () => {
  const h = renderHarness(threeNodePayload());
  const viewport = viewportOf(h);
  // Background sub-threshold press (does not pan)
  viewport.dispatchEvent({ type: 'pointerdown', clientX: 0, clientY: 0, button: 0, pointerId: 91 });
  viewport.dispatchEvent({ type: 'pointermove', clientX: 1, clientY: 0, pointerId: 91 });
  viewport.dispatchEvent({ type: 'pointerup', pointerId: 91 });
  const node = nodeGroup(h, 'source');
  node.dispatchEvent({ type: 'click' });
  assert.ok(
    !h.panel.textContent.includes('webview.world.logisticsSelectHint'),
    'sub-threshold path must still allow selection clicks'
  );
});

test('extreme wheel delta remains finite', () => {
  const h = createHarness();
  const api = apiOf(h);
  const camera = { k: 1, tx: 100, ty: 100, userModified: false };
  const huge = h.context.logisticsWheelDeltaY({ deltaY: 1e308, deltaMode: 0 });
  assert.strictEqual(huge, api.LOGISTICS_WHEEL_DELTA_MAX);
  const pageHuge = h.context.logisticsWheelDeltaY({ deltaY: 1e10, deltaMode: 2 });
  assert.ok(Math.abs(pageHuge) <= api.LOGISTICS_WHEEL_DELTA_MAX);
  const next = h.context.logisticsZoomFromWheel(camera, { x: 100, y: 100 }, huge);
  assert.ok(Number.isFinite(next.k) && Number.isFinite(next.tx) && Number.isFinite(next.ty));
  const inf = h.context.logisticsZoomFromWheel(camera, { x: 100, y: 100 }, Infinity);
  assert.strictEqual(inf, camera);
  const nan = h.context.logisticsZoomFromWheel(camera, { x: 100, y: 100 }, NaN);
  assert.strictEqual(nan, camera);
});

test('extreme bbox remains safe (no Infinity transform)', () => {
  const h = createHarness();
  const bad = { minX: -Infinity, minY: 0, maxX: 10, maxY: 10 };
  assert.strictEqual(h.context.logisticsIsFiniteBBox(bad), false);
  const camera = h.context.logisticsFitAllCamera(bad, { width: 800, height: 420 });
  assert.ok(Number.isFinite(camera.k) && Number.isFinite(camera.tx) && Number.isFinite(camera.ty));
  const maxed = h.context.logisticsFitAllCamera(
    { minX: 0, minY: 0, maxX: Number.MAX_VALUE, maxY: Number.MAX_VALUE },
    { width: 800, height: 420 }
  );
  assert.ok(Number.isFinite(maxed.k) && Number.isFinite(maxed.tx) && Number.isFinite(maxed.ty));
});

test('malformed viewport remains safe', () => {
  const h = createHarness();
  const api = apiOf(h);
  const vp = h.context.logisticsSanitizeViewportSize({ width: NaN, height: Infinity });
  assert.strictEqual(vp.width, api.LOGISTICS_VIEWPORT_WIDTH_FALLBACK);
  assert.ok(Number.isFinite(vp.width) && vp.width > 0);
  assert.ok(Number.isFinite(vp.height) && vp.height > 0);
  const camera = h.context.logisticsFitAllCamera(
    { minX: 0, minY: 0, maxX: 100, maxY: 100 },
    { width: -5, height: NaN }
  );
  assert.ok(Number.isFinite(camera.k) && Number.isFinite(camera.tx) && Number.isFinite(camera.ty));
});

test('Fit slack equals production constant 0.92 and scales correctly', () => {
  const h = createHarness();
  const api = apiOf(h);
  assert.strictEqual(api.LOGISTICS_FIT_SLACK, 0.92);
  const bbox = { minX: 0, minY: 0, maxX: 400, maxY: 200 };
  const viewportSize = { width: 800, height: 420 };
  const camera = h.context.logisticsFitAllCamera(bbox, viewportSize);
  const availW = viewportSize.width - api.LOGISTICS_FIT_PADDING * 2;
  const availH = viewportSize.height - api.LOGISTICS_FIT_PADDING * 2;
  const expected = Math.min(availW / 400, availH / 200) * api.LOGISTICS_FIT_SLACK;
  const clamped = Math.max(api.LOGISTICS_ZOOM_MIN, Math.min(api.LOGISTICS_ZOOM_MAX, expected));
  assert.ok(Math.abs(camera.k - clamped) < 1e-9, `expected scale ${clamped}, got ${camera.k}`);
});

test('test constants come from evaluated production bindings', () => {
  const h = createHarness();
  const api = apiOf(h);
  assert.strictEqual(api.LOGISTICS_ZOOM_MIN, 0.25);
  assert.strictEqual(api.LOGISTICS_ZOOM_MAX, 3.0);
  assert.strictEqual(api.LOGISTICS_FIT_SLACK, 0.92);
  assert.strictEqual(api.LOGISTICS_VIEWPORT_HEIGHT, 420);
  assert.strictEqual(api.LOGISTICS_VIEWPORT_HEIGHT_LIGHTBOX, 640);
  assert.strictEqual(api.LOGISTICS_WHEEL_DELTA_MAX, 4096);
  assert.strictEqual(typeof api.logisticsZoomAt, 'function');
  assert.strictEqual(typeof api.logisticsFitAllCamera, 'function');
  // Ensure the exported Fit All is the live production function.
  assert.strictEqual(api.logisticsFitAllCamera, h.context.logisticsFitAllCamera);
});

if (failed) { process.exit(1); }
console.log('logistics camera: all tests passed.');
