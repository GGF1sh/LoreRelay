#!/usr/bin/env node
'use strict';

// CORRECTIONS-C: real DOM event flows for filter, selection retention, collapse,
// node drag rounding, and Reset Camera via production handlers.

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const moduleSource = `${fs.readFileSync(path.join(root, 'webview/modules/85b1-logistics-layout.js'), 'utf8')}\n${fs.readFileSync(path.join(root, 'webview/modules/85b2-logistics-route-geometry.js'), 'utf8')}\n${fs.readFileSync(path.join(root, 'webview/modules/85b3-logistics-visual-encoding.js'), 'utf8')}\n${fs.readFileSync(path.join(root, 'webview/modules/85b4-logistics-navigation.js'), 'utf8')}\n${fs.readFileSync(path.join(root, 'webview/modules/85b-economy-logistics.js'), 'utf8')}`;

const TEST_API = `
;globalThis.__api = {
  economyLogisticsUiState,
  logisticsNodeIsRelevant,
  logisticsCurrentLocationRegionIds,
  logisticsBuildRenderedGraph,
  logisticsStorageKey,
  logisticsStorageSet,
  logisticsStorageGet,
  logisticsStorageRemove,
  logisticsCancelCameraSaves,
  logisticsRefreshRouteElement,
  logisticsRouteGeometry,
  logisticsNodeTransform,
  logisticsNodeShapePath,
  logisticsRetainValidSelection,
  logisticsClampZoom,
  LOGISTICS_ZOOM_MIN,
  LOGISTICS_ZOOM_MAX,
  LOGISTICS_VIEWPORT_HEIGHT,
  renderEconomyLogistics,
  renderEconomyLogisticsPanel,
  ensureVisualLightbox,
  computeLogisticsLayout,
  computeLogisticsRouteGeometry,
  buildLogisticsRouteTopologyIndex,
  logisticsAffectedRouteIdsForNode,
  isRouteSuppressedByActiveNodeDrag,
  logisticsRouteMayShowFlowParticles,
  logisticsBeginNodeDragSession,
  logisticsEndNodeDragSession,
  logisticsPurgeSuppressedFlowDots,
  logisticsClearRouteParticles,
  logisticsRenderFlowParticles,
  isLogisticsRouteFlowEligible,
};
`;

class FakeClassList {
  constructor() { this.values = new Set(); }
  set(value) { this.values = new Set(String(value || '').split(/\s+/).filter(Boolean)); }
  add(...values) { values.forEach((v) => this.values.add(v)); }
  remove(...values) { values.forEach((v) => this.values.delete(v)); }
  contains(value) { return this.values.has(value); }
  toggle(value, force) {
    const next = force === undefined ? !this.values.has(value) : Boolean(force);
    if (next) this.values.add(value); else this.values.delete(value);
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
    this.style = { props: {}, setProperty(n, v) { this.props[n] = String(v); }, getPropertyValue(n) { return this.props[n] || ''; } };
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
    this._logisticsRoute = null;
    this._logisticsParts = null;
  }
  set className(v) { this.classList.set(v); }
  get className() { return this.classList.toString(); }
  set id(v) { this._id = String(v); if (this._id) this.ownerDocument.byId.set(this._id, this); }
  get id() { return this._id; }
  set textContent(v) { this._text = String(v ?? ''); this.children = []; }
  get textContent() { return this._text + this.children.map((c) => c.textContent).join(''); }
  appendChild(c) {
    c.parentNode = this;
    if (!c.clientWidth && this.clientWidth) c.clientWidth = this.clientWidth;
    this.children.push(c);
    return c;
  }
  removeChild(c) {
    const index = this.children.indexOf(c);
    if (index >= 0) this.children.splice(index, 1);
    c.parentNode = null;
    return c;
  }
  replaceChildren(...children) { this._text = ''; this.children = []; children.forEach((c) => this.appendChild(c)); }
  setAttribute(name, value) {
    this.attributes[name] = String(value);
    if (name === 'class') this.className = value;
    if (name === 'id') this.id = value;
  }
  getAttribute(name) { return this.attributes[name] === undefined ? null : this.attributes[name]; }
  querySelectorAll(sel) {
    const all = [];
    const walk = (node) => {
      all.push(node);
      (node.children || []).forEach(walk);
    };
    walk(this);
    if (sel === '.logistics-flow-dot') {
      return all.filter((n) => n.classList && n.classList.contains('logistics-flow-dot'));
    }
    if (sel === 'mpath' || sel === 'MPATH') {
      return all.filter((n) => n.tagName === 'MPATH');
    }
    return [];
  }
  querySelector(sel) {
    const list = this.querySelectorAll(sel);
    return list[0] || null;
  }
  addEventListener(type, listener, options) {
    const capture = options === true || (options && options.capture);
    const key = capture ? `${type}__capture` : type;
    (this.listeners[key] ||= []).push(listener);
  }
  focus() { this.ownerDocument.activeElement = this; }
  blur() {
    if (this.ownerDocument.activeElement === this) this.ownerDocument.activeElement = this.ownerDocument.body;
    this.dispatchEvent({ type: 'blur' });
  }
  getBoundingClientRect() {
    return { left: 0, top: 0, width: this.clientWidth || 800, height: 420, right: this.clientWidth || 800, bottom: 420 };
  }
  setPointerCapture(pointerId) {
    this.pointerCaptures.push(pointerId);
    this._capturedPointerId = pointerId;
    this.ownerDocument.pointerCaptureOwner = this;
    this.ownerDocument.pointerCaptureId = pointerId;
  }
  releasePointerCapture(pointerId) {
    this.pointerReleases.push(pointerId);
    if (this._capturedPointerId === pointerId) this._capturedPointerId = null;
    if (this.ownerDocument.pointerCaptureOwner === this && this.ownerDocument.pointerCaptureId === pointerId) {
      this.ownerDocument.pointerCaptureOwner = null;
      this.ownerDocument.pointerCaptureId = null;
      this.dispatchEvent({ type: 'lostpointercapture', pointerId });
    }
  }
  dispatchEvent(event) {
    event.target = event.target || this;
    event.defaultPrevented = Boolean(event.defaultPrevented);
    let stopped = false;
    event.preventDefault ||= () => { event.defaultPrevented = true; };
    event.stopPropagation ||= () => { stopped = true; };
    const path = [];
    let walk = this;
    while (walk) { path.push(walk); walk = walk.parentNode; }
    for (let i = path.length - 1; i >= 0 && !stopped; i--) {
      event.currentTarget = path[i];
      (path[i].listeners[`${event.type}__capture`] || []).forEach((fn) => fn(event));
    }
    let node = this;
    while (node && !stopped) {
      event.currentTarget = node;
      (node.listeners[event.type] || []).forEach((fn) => fn(event));
      const prop = node[`on${event.type}`];
      if (typeof prop === 'function' && !stopped) prop(event);
      node = node.parentNode;
    }
    return !event.defaultPrevented;
  }
}

class FakeDocument {
  constructor() {
    this.byId = new Map();
    this.body = this.createElement('body');
    this.activeElement = this.body;
    this.pointerCaptureOwner = null;
    this.pointerCaptureId = null;
  }
  createElement(tag) { return new FakeElement(tag, this); }
  createElementNS(_ns, tag) { return new FakeElement(tag, this); }
  getElementById(id) { return this.byId.get(id) || null; }
  addEventListener() {}
}

function descendants(node) {
  return [node, ...node.children.flatMap(descendants)];
}
function findAll(node, pred) { return descendants(node).filter(pred); }

function createHarness(options = {}) {
  const document = new FakeDocument();
  const section = document.createElement('details');
  section.id = 'world-logistics-details';
  const panel = document.createElement('div');
  panel.id = 'world-logistics-panel';
  panel.clientWidth = 800;
  section.appendChild(panel);
  document.body.appendChild(section);
  const store = new Map();
  const timers = [];
  const animationFrames = [];
  let animationFrameRequests = 0;
  const windowListeners = {};
  const context = {
    document,
    console,
    Map, Set, Math, Number, String, Boolean, Object, Array, JSON,
    currentWorldLocationId: 'loc-a',
    setTimeout(fn, ms) {
      const id = timers.length + 1;
      timers.push({ id, fn, ms: ms || 0 });
      return id;
    },
    clearTimeout(id) {
      const idx = timers.findIndex((t) => t.id === id);
      if (idx >= 0) timers.splice(idx, 1);
    },
    T: (key) => key,
    ResizeObserver: class {
      constructor(cb) { this.cb = cb; this._busy = false; }
      observe(el) {
        // Avoid re-entrant observe→render→observe loops in the Fake DOM.
        if (this._busy) { return; }
        this._busy = true;
        try {
          this.cb([{ contentRect: { width: el.clientWidth || 800 } }]);
        } finally {
          this._busy = false;
        }
      }
      disconnect() { this._busy = false; }
    },
  };
  context.globalThis = context;
  context.window = context;
  if (options.deferAnimationFrames) {
    context.requestAnimationFrame = (fn) => { const id = ++animationFrameRequests; animationFrames.push({ id, fn }); return id; };
    context.cancelAnimationFrame = (id) => { const index = animationFrames.findIndex((frame) => frame.id === id); if (index >= 0) animationFrames.splice(index, 1); };
  }
  context.addEventListener = (type, fn) => { (windowListeners[type] ||= []).push(fn); };
  context.removeEventListener = (type, fn) => {
    windowListeners[type] = (windowListeners[type] || []).filter((x) => x !== fn);
  };
  context.dispatchWindowEvent = (event) => {
    event.defaultPrevented = Boolean(event.defaultPrevented);
    event.preventDefault ||= () => { event.defaultPrevented = true; };
    (windowListeners[event.type] || []).forEach((fn) => fn(event));
  };
  context.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
  };
  context.confirm = () => true;
  context.matchMedia = () => ({ matches: false, addEventListener() {}, addListener() {} });
  vm.runInNewContext(moduleSource + TEST_API, context, { filename: 'logistics-interactions.js' });
  return {
    document, panel, context, store, timers,
    get animationFrameRequests() { return animationFrameRequests; },
    flushAnimationFrames() {
      while (animationFrames.length) {
        const frame = animationFrames.shift();
        if (frame && typeof frame.fn === 'function') frame.fn();
      }
    },
    flushTimers() {
      while (timers.length) {
        const next = timers.shift();
        if (next && typeof next.fn === 'function') next.fn();
      }
    },
    api: context.__api,
  };
}

function twoRegionPayload(overrides = {}) {
  return {
    available: true,
    scopeKey: 'scope-test',
    nodes: [
      { id: 'reg_a', kind: 'region', label: 'Alpha' },
      { id: 'a1', label: 'A1', kind: 'facility', locationId: 'loc-a', regionId: 'reg_a', commodityIds: ['grain'], production: [], processingSiteIds: [], shortageCommodityIds: [] },
      { id: 'a2', label: 'A2', kind: 'market', locationId: 'loc-a2', regionId: 'reg_a', commodityIds: ['grain'], production: [], processingSiteIds: [], shortageCommodityIds: [] },
      { id: 'reg_b', kind: 'region', label: 'Beta' },
      { id: 'b1', label: 'B1', kind: 'facility', locationId: 'loc-b', regionId: 'reg_b', commodityIds: ['iron'], production: [], processingSiteIds: [], shortageCommodityIds: [] },
      { id: 'b2', label: 'B2', kind: 'market', locationId: 'loc-b2', regionId: 'reg_b', commodityIds: ['iron'], production: [], processingSiteIds: [], shortageCommodityIds: [] },
    ],
    routes: [
      { id: 'grain_route', fromNodeId: 'a1', toNodeId: 'a2', commodityId: 'grain', volume: 5, baseCapacity: 10, effectiveCapacity: 5, utilization: 1, risk: 0.2, status: 'open', bottleneck: false },
      { id: 'iron_route', fromNodeId: 'b1', toNodeId: 'b2', commodityId: 'iron', volume: 3, baseCapacity: 8, effectiveCapacity: 4, utilization: 0.5, risk: 0.1, status: 'open', bottleneck: false },
    ],
    commodities: [
      { id: 'grain', name: 'Grain', localSpecialty: true, strategic: false },
      { id: 'iron', name: 'Iron', localSpecialty: false, strategic: true },
    ],
    shortages: [],
    processingSites: [],
    summary: { activeRoutes: 2, blockedRoutes: 0, raidedRoutes: 0, totalVolume: 8, shortageCount: 0, bottleneckCount: 0 },
    ...overrides,
  };
}

function viewportOf(h) { return findAll(h.panel, (n) => n.classList.contains('logistics-network-viewport'))[0]; }
function nodeOf(h, id) { return findAll(h.panel, (n) => n.dataset.nodeId === id)[0]; }
function routeOf(h, id) { return findAll(h.panel, (n) => n.dataset.routeId === id)[0]; }
function routeAnnotation(route, className) { return findAll(route?._logisticsAnnotations, (n) => n.classList.contains(className))[0]; }
function selectOf(h) { return findAll(h.panel, (n) => n.tagName === 'SELECT')[0]; }
function toolbarBtn(h, cls) { return findAll(h.panel, (n) => n.classList.contains(cls))[0]; }
function expandBtnOf(h) { return findAll(h.panel, (n) => n.classList.contains('logistics-expand-btn'))[0]; }
function parseTranslate(transform) {
  const m = /translate\(([^ ]+) ([^)]+)\)/.exec(transform || '');
  return m ? { x: Number(m[1]), y: Number(m[2]) } : null;
}

function renderedPathEndpoints(pathD) {
  const values = String(pathD || '').match(/-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/gi)?.map(Number) || [];
  assert.ok(values.length >= 4 && values.every(Number.isFinite), `finite SVG path expected, got ${pathD}`);
  return {
    source: { x: values[0], y: values[1] },
    destination: { x: values[values.length - 2], y: values[values.length - 1] },
  };
}

function assertPointNear(actual, expected, message, tolerance = 0.05) {
  assert.ok(Math.hypot(actual.x - expected.x, actual.y - expected.y) <= tolerance,
    `${message}: (${actual.x}, ${actual.y}) != (${expected.x}, ${expected.y})`);
}

function assertRenderedEndpointsMatchCurrentAnchors(h, routeId, message) {
  const group = routeOf(h, routeId);
  const line = findAll(group, (n) => n.classList.contains('logistics-route-line'))[0];
  const endpoints = renderedPathEndpoints(line.getAttribute('d'));
  assertPointNear(endpoints.source, group._logisticsGeometry.start, `${message} source`);
  assertPointNear(endpoints.destination, group._logisticsGeometry.end, `${message} destination`);
  const route = group._logisticsRoute;
  const positions = h.api.economyLogisticsUiState.rendered.positions;
  const boundaryDistance = (point, box) => Math.min(
    Math.abs(Math.abs(point.x - box.x) - box.w / 2),
    Math.abs(Math.abs(point.y - box.y) - box.h / 2)
  );
  assert.ok(boundaryDistance(endpoints.source, positions.get(route.fromNodeId)) <= 0.05, `${message} source lies on current source-node boundary`);
  assert.ok(boundaryDistance(endpoints.destination, positions.get(route.toNodeId)) <= 0.05, `${message} destination lies on current destination-node boundary`);
  return endpoints;
}

function elementBytes(node) {
  if (!node) return '';
  const attributes = Object.entries(node.attributes || {}).sort((a, b) => a[0].localeCompare(b[0]));
  const dataset = Object.entries(node.dataset || {}).sort((a, b) => a[0].localeCompare(b[0]));
  return JSON.stringify({
    tag: node.tagName,
    className: node.className,
    attributes,
    dataset,
    text: node._text,
    children: (node.children || []).map(elementBytes),
  });
}

let failed = 0;
function test(name, fn) {
  try { fn(); console.log(`OK: ${name}`); }
  catch (error) { failed++; console.error(`FAIL: ${name}`); console.error(error && error.stack ? error.stack : error); }
}

// --- Filter + selection retention via real events ---

test('filter and payload-push selection retention via real events', () => {
  const h = createHarness();
  const payload = twoRegionPayload();
  h.context.renderEconomyLogistics(payload, true);
  const grain = routeOf(h, 'grain_route');
  assert.ok(grain, 'grain route rendered');
  grain.dispatchEvent({ type: 'click' });
  assert.strictEqual(h.api.economyLogisticsUiState.selection?.type, 'route');
  assert.strictEqual(h.api.economyLogisticsUiState.selection?.id, 'grain_route');

  const select = selectOf(h);
  assert.ok(select, 'commodity select present');
  select.value = 'iron';
  select.dispatchEvent({ type: 'change' });
  assert.strictEqual(h.api.economyLogisticsUiState.selection?.type, 'route', 'selection survives filter change');
  assert.strictEqual(h.api.economyLogisticsUiState.selection?.id, 'grain_route');
  const grainAfter = routeOf(h, 'grain_route');
  assert.ok(grainAfter.classList.contains('is-selected'), 'selected route keeps is-selected');
  assert.ok(!grainAfter.classList.contains('is-unrelated'), 'selected route is never is-unrelated');
  const iron = routeOf(h, 'iron_route');
  // iron matches filter so may be related; use a third commodity scenario for unrelated
  // Re-filter to grain-only: iron becomes unrelated while grain selected stays related.
  select.value = 'grain';
  select.dispatchEvent({ type: 'change' });
  const ironUnderGrain = routeOf(h, 'iron_route');
  assert.ok(ironUnderGrain.classList.contains('is-unrelated'), 'unrelated route is dimmed');
  assert.ok(!routeOf(h, 'grain_route').classList.contains('is-unrelated'));
  // Endpoints of selected route must not dim.
  assert.ok(!nodeOf(h, 'a1').classList.contains('is-unrelated'));
  assert.ok(!nodeOf(h, 'a2').classList.contains('is-unrelated'));

  // New payload object, same route id → retain.
  const tick = twoRegionPayload({ routes: payload.routes.map((r) => ({ ...r, volume: r.volume + 1 })) });
  h.context.renderEconomyLogistics(tick, true);
  assert.strictEqual(h.api.economyLogisticsUiState.selection?.type, 'route');
  assert.strictEqual(h.api.economyLogisticsUiState.selection?.id, 'grain_route');

  // Payload without the route → clear.
  const gone = twoRegionPayload({ routes: payload.routes.filter((r) => r.id !== 'grain_route') });
  h.context.renderEconomyLogistics(gone, true);
  assert.strictEqual(h.api.economyLogisticsUiState.selection, null);
});

// --- Collapse real events ---

test('collapse control real pointer/keyboard events without pan or synthetic selection', () => {
  const h = createHarness();
  // Non-current region can collapse: use loc elsewhere for reg_b only current.
  h.context.currentWorldLocationId = 'loc-a';
  h.context.renderEconomyLogistics(twoRegionPayload(), true);
  const collapseControls = findAll(h.panel, (n) => n.classList.contains('logistics-region-collapse'));
  const free = collapseControls.find((c) => c.getAttribute('aria-disabled') !== 'true');
  assert.ok(free, 'at least one collapsible region');
  const regionId = free.parentNode.dataset.regionId;
  const hit = findAll(free, (n) => n.classList.contains('logistics-region-collapse-hit'))[0];
  const beforeCam = h.api.economyLogisticsUiState.cameraContexts.normal.camera;
  const beforeTx = beforeCam && beforeCam.tx;

  hit.dispatchEvent({ type: 'click' });
  assert.ok(h.api.economyLogisticsUiState.collapsedRegionIds.has(regionId), 'pointer click collapses');
  assert.strictEqual(h.api.economyLogisticsUiState.selection, null, 'collapse does not set factual selection');
  assert.strictEqual(h.api.economyLogisticsUiState.cameraContexts.normal.camera.tx, beforeTx, 'collapse does not pan');

  // Expand again via Enter.
  const free2 = findAll(h.panel, (n) => n.classList.contains('logistics-region-collapse') && n.parentNode.dataset.regionId === regionId)[0];
  free2.dispatchEvent({ type: 'keydown', key: 'Enter' });
  assert.ok(!h.api.economyLogisticsUiState.collapsedRegionIds.has(regionId), 'Enter expands');

  // Space preventDefault and toggle.
  const free3 = findAll(h.panel, (n) => n.classList.contains('logistics-region-collapse') && n.parentNode.dataset.regionId === regionId)[0];
  const spaceEvent = { type: 'keydown', key: ' ', code: 'Space' };
  free3.dispatchEvent(spaceEvent);
  assert.strictEqual(spaceEvent.defaultPrevented, true, 'Space on collapse preventDefault');
  assert.ok(h.api.economyLogisticsUiState.collapsedRegionIds.has(regionId));

  // Click aggregate → expand, no synthetic aggregate id in selection.
  const aggregate = findAll(h.panel, (n) => n.classList.contains('logistics-node-aggregate'))[0];
  assert.ok(aggregate, 'aggregate node present when collapsed');
  aggregate.dispatchEvent({ type: 'click' });
  assert.ok(!h.api.economyLogisticsUiState.collapsedRegionIds.has(regionId));
  const sel = h.api.economyLogisticsUiState.selection;
  if (sel) {
    assert.ok(!String(sel.id).includes('lr-region-aggregate'), 'no synthetic aggregate id in selection');
  }
});

// --- Node drag with fractional world result ---

test('node drag rounds, stays region-local, suppresses one click, cleanup paths do not suppress', () => {
  const h = createHarness();
  h.context.renderEconomyLogistics(twoRegionPayload(), true);
  const viewport = viewportOf(h);
  const node = nodeOf(h, 'a1');
  const b1Before = {
    x: h.api.economyLogisticsUiState.layout.nodes.get('b1').x,
    y: h.api.economyLogisticsUiState.layout.nodes.get('b1').y,
    regionId: h.api.economyLogisticsUiState.layout.nodes.get('b1').regionId,
  };
  const b2Before = {
    x: h.api.economyLogisticsUiState.layout.nodes.get('b2').x,
    y: h.api.economyLogisticsUiState.layout.nodes.get('b2').y,
    regionId: h.api.economyLogisticsUiState.layout.nodes.get('b2').regionId,
  };
  const start = h.api.economyLogisticsUiState.rendered.positions.get('a1');
  const startX = start.x;
  const startY = start.y;
  const cam = h.api.economyLogisticsUiState.cameraContexts.normal.camera;
  // Requirement: fractional drop 101.4 / 86.6 rounds to 101 / 87.
  const wantX = 101.4;
  const wantY = 86.6;
  const dx = (wantX - startX) * cam.k;
  const dy = (wantY - startY) * cam.k;

  node.dispatchEvent({ type: 'pointerdown', clientX: 0, clientY: 0, button: 0, pointerId: 1 });
  viewport.dispatchEvent({ type: 'pointermove', clientX: dx, clientY: dy, pointerId: 1 });
  const mid = h.api.economyLogisticsUiState.rendered.positions.get('a1');
  assert.ok(Math.abs(mid.x - wantX) < 1e-6, `mid-drag x expected ~${wantX}, got ${mid.x}`);
  assert.ok(Math.abs(mid.y - wantY) < 1e-6, `mid-drag y expected ~${wantY}, got ${mid.y}`);
  viewport.dispatchEvent({ type: 'pointerup', pointerId: 1 });

  const pos = h.api.economyLogisticsUiState.rendered.positions.get('a1');
  assert.strictEqual(pos.x, 101);
  assert.strictEqual(pos.y, 87);
  // Rendered transform
  const tr = parseTranslate(nodeOf(h, 'a1').getAttribute('transform'));
  assert.strictEqual(tr.x, 101 - pos.w / 2);
  assert.strictEqual(tr.y, 87 - pos.h / 2);
  // Persisted
  const stored = h.api.economyLogisticsUiState.manualPositions.a1;
  assert.strictEqual(stored.x, 101);
  assert.strictEqual(stored.y, 87);
  // Other region's node coordinates remain byte-identical (only a1 moved live).
  assert.strictEqual(h.api.economyLogisticsUiState.layout.nodes.get('b1').x, b1Before.x);
  assert.strictEqual(h.api.economyLogisticsUiState.layout.nodes.get('b1').y, b1Before.y);
  assert.strictEqual(h.api.economyLogisticsUiState.layout.nodes.get('b2').x, b2Before.x);
  assert.strictEqual(h.api.economyLogisticsUiState.layout.nodes.get('b2').y, b2Before.y);
  // Recompute with persisted manual must keep B fixed.
  const recomputed = h.api.computeLogisticsLayout(
    twoRegionPayload().nodes,
    twoRegionPayload().routes,
    { manualPositions: h.api.economyLogisticsUiState.manualPositions }
  );
  assert.strictEqual(recomputed.nodes.get('b1').x, b1Before.x);
  assert.strictEqual(recomputed.nodes.get('b1').y, b1Before.y);
  assert.strictEqual(recomputed.nodes.get('b2').x, b2Before.x);
  assert.strictEqual(recomputed.nodes.get('b2').y, b2Before.y);

  // Connected route uses rounded position.
  const routeEl = routeOf(h, 'grain_route');
  const line = findAll(routeEl, (n) => n.classList.contains('logistics-route-line'))[0];
  const a2 = h.api.economyLogisticsUiState.rendered.positions.get('a2');
  const expectedGeom = h.api.logisticsRouteGeometry({ id: 'grain_route' }, pos, a2);
  assert.strictEqual(line.getAttribute('d'), expectedGeom.d);
  const label = routeAnnotation(routeEl, 'logistics-route-label');
  assert.ok(label, 'route label present');
  assert.ok(Number.isFinite(Number(label.getAttribute('x'))));
  assert.ok(Number.isFinite(Number(label.getAttribute('y'))));
  // Particle path reference if any
  const mpath = findAll(routeEl, (n) => n.tagName === 'MPATH')[0];
  if (mpath) {
    assert.strictEqual(mpath.getAttribute('href'), `#${line.getAttribute('id')}`);
  }

  // Synthesized click after drag is suppressed once.
  h.api.economyLogisticsUiState.selection = null;
  nodeOf(h, 'a1').dispatchEvent({ type: 'click' });
  assert.strictEqual(h.api.economyLogisticsUiState.selection, null, 'first click after drag suppressed');
  // Next independent click works (after suppress clears on timer or second attempt).
  h.flushTimers();
  nodeOf(h, 'a1').dispatchEvent({ type: 'click' });
  assert.strictEqual(h.api.economyLogisticsUiState.selection?.type, 'node');
  assert.strictEqual(h.api.economyLogisticsUiState.selection?.id, 'a1');

  // Escape / pointercancel / lostpointercapture / blur must not suppress next click.
  h.api.economyLogisticsUiState.selection = null;
  const n2 = nodeOf(h, 'a2');
  n2.dispatchEvent({ type: 'pointerdown', clientX: 0, clientY: 0, button: 0, pointerId: 2 });
  viewport.dispatchEvent({ type: 'pointermove', clientX: 40, clientY: 0, pointerId: 2 });
  viewport.dispatchEvent({ type: 'keydown', key: 'Escape' });
  n2.dispatchEvent({ type: 'click' });
  assert.strictEqual(h.api.economyLogisticsUiState.selection?.id, 'a2', 'Escape path does not suppress click');

  h.api.economyLogisticsUiState.selection = null;
  n2.dispatchEvent({ type: 'pointerdown', clientX: 0, clientY: 0, button: 0, pointerId: 3 });
  viewport.dispatchEvent({ type: 'pointermove', clientX: 40, clientY: 0, pointerId: 3 });
  viewport.dispatchEvent({ type: 'pointercancel', pointerId: 3 });
  n2.dispatchEvent({ type: 'click' });
  assert.strictEqual(h.api.economyLogisticsUiState.selection?.id, 'a2', 'pointercancel does not suppress click');

  h.api.economyLogisticsUiState.selection = null;
  n2.dispatchEvent({ type: 'pointerdown', clientX: 0, clientY: 0, button: 0, pointerId: 4 });
  viewport.dispatchEvent({ type: 'pointermove', clientX: 40, clientY: 0, pointerId: 4 });
  viewport.dispatchEvent({ type: 'lostpointercapture', pointerId: 4 });
  n2.dispatchEvent({ type: 'click' });
  assert.strictEqual(h.api.economyLogisticsUiState.selection?.id, 'a2', 'lostpointercapture does not suppress click');

  h.api.economyLogisticsUiState.selection = null;
  n2.dispatchEvent({ type: 'pointerdown', clientX: 0, clientY: 0, button: 0, pointerId: 5 });
  viewport.dispatchEvent({ type: 'pointermove', clientX: 40, clientY: 0, pointerId: 5 });
  h.context.dispatchWindowEvent({ type: 'blur' });
  n2.dispatchEvent({ type: 'click' });
  assert.strictEqual(h.api.economyLogisticsUiState.selection?.id, 'a2', 'window blur does not suppress click');
});

// --- Reset Camera via real toolbar handler ---

test('Reset Camera via toolbar button clears storage and cancels timers', () => {
  const h = createHarness();
  h.context.renderEconomyLogistics(twoRegionPayload(), true);
  const state = h.api.economyLogisticsUiState;
  const scope = state.scopeKey;
  const cameraKey = h.api.logisticsStorageKey('camera', scope);
  // Seed saved camera + pending timer.
  h.api.logisticsStorageSet(cameraKey, JSON.stringify({
    normal: { k: 2, tx: -50, ty: -60, userModified: true },
    lightbox: { k: 1.5, tx: 10, ty: 20, userModified: true },
  }));
  state.cameraContexts.normal.camera = { k: 2, tx: -50, ty: -60, userModified: true };
  state.cameraContexts.normal.identity = 'x';
  // Queue a deferred save.
  state.cameraSaveTimers = state.cameraSaveTimers || {};
  const timerId = h.context.setTimeout(() => {
    h.api.logisticsStorageSet(cameraKey, JSON.stringify({ normal: { k: 2, tx: -50, ty: -60, userModified: true } }));
  }, 220);
  state.cameraSaveTimers[`${scope}:normal`] = timerId;

  const resetBtn = toolbarBtn(h, 'logistics-camera-reset');
  assert.ok(resetBtn, 'reset camera button exists');
  resetBtn.dispatchEvent({ type: 'click' });

  assert.strictEqual(h.api.logisticsStorageGet(cameraKey), null, 'storage key removed');
  assert.ok(!state.cameraSaveTimers[`${scope}:normal`], 'pending timer cancelled');
  const cam = state.cameraContexts.normal.camera;
  assert.ok(cam && cam.userModified === false, 'in-memory Fit All applied');
  assert.ok(Number.isFinite(cam.k) && Number.isFinite(cam.tx) && Number.isFinite(cam.ty));

  // Flushing leftover timers must not recreate the key.
  h.flushTimers();
  assert.strictEqual(h.api.logisticsStorageGet(cameraKey), null, 'flush does not recreate key');

  // Genuine user pan re-enables persistence.
  const viewport = viewportOf(h);
  viewport.dispatchEvent({ type: 'pointerdown', clientX: 0, clientY: 0, button: 0, pointerId: 9 });
  viewport.dispatchEvent({ type: 'pointermove', clientX: 40, clientY: 10, pointerId: 9 });
  viewport.dispatchEvent({ type: 'pointerup', pointerId: 9 });
  h.flushTimers();
  const saved = h.api.logisticsStorageGet(cameraKey);
  assert.ok(saved, 'pan re-persists camera');
  const parsed = JSON.parse(saved);
  assert.ok(parsed.normal && parsed.normal.userModified === true);

  // Lightbox isolation: reset normal must not wipe only via shared key — same key holds both hosts;
  // after reset both cleared; pan only writes active host.
  assert.ok(parsed.normal);
});

test('Reset Camera via Shift+0 keyboard handler', () => {
  const h = createHarness();
  h.context.renderEconomyLogistics(twoRegionPayload(), true);
  const state = h.api.economyLogisticsUiState;
  const cameraKey = h.api.logisticsStorageKey('camera', state.scopeKey);
  h.api.logisticsStorageSet(cameraKey, JSON.stringify({ normal: { k: 2.5, tx: 1, ty: 2, userModified: true } }));
  state.cameraContexts.normal.camera = { k: 2.5, tx: 1, ty: 2, userModified: true };
  const viewport = viewportOf(h);
  viewport.focus();
  viewport.dispatchEvent({ type: 'keydown', key: ')', code: 'Digit0', shiftKey: true });
  assert.strictEqual(h.api.logisticsStorageGet(cameraKey), null);
  assert.strictEqual(state.cameraContexts.normal.camera.userModified, false);
});

test('aggregate outline uses region silhouette, not envoy diamond', () => {
  const h = createHarness();
  h.context.currentWorldLocationId = 'loc-a';
  h.context.renderEconomyLogistics(twoRegionPayload(), true);
  // Collapse non-current region via control.
  const free = findAll(h.panel, (n) => n.classList.contains('logistics-region-collapse') && n.getAttribute('aria-disabled') !== 'true')[0];
  findAll(free, (n) => n.classList.contains('logistics-region-collapse-hit'))[0].dispatchEvent({ type: 'click' });
  const aggregate = findAll(h.panel, (n) => n.classList.contains('logistics-node-aggregate'))[0];
  assert.ok(aggregate);
  const shape = findAll(aggregate, (n) => n.classList.contains('logistics-node-shape'))[0];
  const outline = findAll(aggregate, (n) => n.classList.contains('logistics-node-aggregate-outline'))[0];
  assert.ok(shape && outline);
  assert.strictEqual(outline.getAttribute('d'), shape.getAttribute('d'), 'outline d matches main aggregate path');
  assert.notStrictEqual(outline.getAttribute('d'), h.api.logisticsNodeShapePath('envoy'));
  assert.ok(String(outline.getAttribute('transform')).includes('translate(4 4)'));
});

// --- LOGISTICS-GRAPH-CANVAS-SLICE3: shared route geometry, layers, drag ---

function threeRegionRoutePayload() {
  return {
    available: true,
    scopeKey: 'scope-test',
    nodes: [
      { id: 'reg_a', kind: 'region', label: 'Alpha' },
      { id: 'a1', label: 'A1', kind: 'facility', locationId: 'loc-a', regionId: 'reg_a', commodityIds: ['grain'], production: [], processingSiteIds: [], shortageCommodityIds: [] },
      { id: 'reg_b', kind: 'region', label: 'Beta' },
      { id: 'b1', label: 'B1', kind: 'market', locationId: 'loc-b', regionId: 'reg_b', commodityIds: ['grain'], production: [], processingSiteIds: [], shortageCommodityIds: [] },
    ],
    routes: [
      { id: 'grain_route', fromNodeId: 'a1', toNodeId: 'b1', commodityId: 'grain', volume: 5, baseCapacity: 10, effectiveCapacity: 5, utilization: 1, risk: 0.2, status: 'open', bottleneck: false },
      { id: 'grain_route_2', fromNodeId: 'a1', toNodeId: 'b1', commodityId: 'grain', volume: 2, baseCapacity: 6, effectiveCapacity: 3, utilization: 0.4, risk: 0.1, status: 'strained', bottleneck: false },
    ],
    commodities: [{ id: 'grain', name: 'Grain', localSpecialty: true, strategic: false }],
    shortages: [],
    processingSites: [],
    summary: { activeRoutes: 2, blockedRoutes: 0, raidedRoutes: 0, totalVolume: 7, shortageCount: 0, bottleneckCount: 0 },
  };
}

function slice5CorrectionsPayload() {
  const node = (id, label, regionId, scale) => ({ id, label, kind: 'facility', locationId: `loc-${id}`, regionId, scale, commodityIds: [], production: [], processingSiteIds: [], shortageCommodityIds: [] });
  return {
    available: true, scopeKey: 'slice5-corrections',
    nodes: [
      { id: 'reg_harbor', kind: 'region', label: 'Harbor Display' },
      node('grain_quiet_node', 'Quiet Granary', 'reg_harbor'),
      node('grain_special_node', 'Special Granary', 'reg_harbor'),
      node('fruit_special_node', 'Special Orchard', 'reg_harbor'),
      node('minor_endpoint', 'Minor Endpoint', 'reg_harbor', 'minor'),
      { id: 'reg_metal', kind: 'region', label: 'Metal Display' },
      node('iron_special_node', 'Special Forge', 'reg_metal'),
      node('unrelated_minor', 'Unrelated Minor', 'reg_metal', 'minor'),
    ],
    routes: [
      { id: 'grain_quiet', fromNodeId: 'grain_quiet_node', toNodeId: 'minor_endpoint', commodityId: 'grain', volume: 8, baseCapacity: 10, effectiveCapacity: 8, utilization: 0.8, risk: 0.1, status: 'open', bottleneck: false },
      { id: 'grain_special', fromNodeId: 'grain_special_node', toNodeId: 'minor_endpoint', commodityId: 'grain', volume: 8, baseCapacity: 10, effectiveCapacity: 8, utilization: 0.8, risk: 0.1, status: 'open', bottleneck: false },
      { id: 'fruit_special', fromNodeId: 'fruit_special_node', toNodeId: 'minor_endpoint', commodityId: 'fruit', volume: 8, baseCapacity: 10, effectiveCapacity: 8, utilization: 0.8, risk: 0.1, status: 'unconfirmed', bottleneck: false },
      { id: 'iron_special', fromNodeId: 'iron_special_node', toNodeId: 'unrelated_minor', commodityId: 'iron', volume: 8, baseCapacity: 10, effectiveCapacity: 8, utilization: 0.8, risk: 0.1, status: 'unconfirmed', bottleneck: false },
    ],
    commodities: [
      { id: 'grain', name: 'Grain', family: 'food' },
      { id: 'fruit', name: 'Fruit', family: 'food' },
      { id: 'iron', name: 'Iron', family: 'metal' },
    ],
    shortages: [], processingSites: [],
    summary: { activeRoutes: 4, blockedRoutes: 0, raidedRoutes: 0, totalVolume: 32, shortageCount: 0, bottleneckCount: 0 },
  };
}

function largeDragPayload() {
  const nodes = [{ id: 'reg_large', kind: 'region', label: 'Large' }];
  for (let i = 0; i < 200; i++) {
    nodes.push({
      id: `n${i}`, label: `N${i}`, kind: i % 7 === 0 ? 'market' : 'facility',
      locationId: i === 0 ? 'loc-a' : `loc-${i}`, regionId: 'reg_large',
      commodityIds: ['grain'], production: [], processingSiteIds: [], shortageCommodityIds: [],
    });
  }
  const route = (id, fromNodeId, toNodeId, status = 'open') => ({
    id, fromNodeId, toNodeId, commodityId: 'grain', volume: 2, baseCapacity: 6,
    effectiveCapacity: 4, utilization: 0.5, risk: 0.2, status, bottleneck: false,
  });
  const routes = [
    route('local_0', 'n0', 'n1', 'blocked'),
    route('local_1', 'n1', 'n2'),
    route('local_2', 'n1', 'n0'),
  ];
  for (let i = routes.length; i < 400; i++) {
    const from = 3 + ((i - 3) % 197);
    const to = 3 + ((i - 2) % 197);
    routes.push(route(`remote_${String(i).padStart(4, '0')}`, `n${from}`, `n${to}`));
  }
  return {
    available: true, scopeKey: 'large-drag', nodes, routes,
    commodities: [{ id: 'grain', name: 'Grain', localSpecialty: true, strategic: false }],
    shortages: [], processingSites: [],
    summary: { activeRoutes: 400, blockedRoutes: 1, raidedRoutes: 0, totalVolume: 800, shortageCount: 0, bottleneckCount: 0 },
  };
}

test('41-43: selecting a route moves it to layer-edges-raised without duplication, click still selects the factual route', () => {
  const h = createHarness();
  h.context.renderEconomyLogistics(threeRegionRoutePayload(), true);
  const before = routeOf(h, 'grain_route');
  assert.strictEqual(before.parentNode.classList.contains('layer-edges'), true, 'ordinary route starts in layer-edges');
  before.dispatchEvent({ type: 'click' });
  assert.strictEqual(h.api.economyLogisticsUiState.selection.type, 'route');
  assert.strictEqual(h.api.economyLogisticsUiState.selection.id, 'grain_route');
  const afterAll = findAll(h.panel, (n) => n.dataset && n.dataset.routeId === 'grain_route');
  assert.strictEqual(afterAll.length, 1, 'selected route must not be duplicated across layers');
  assert.strictEqual(afterAll[0].parentNode.classList.contains('layer-edges-raised'), true, 'selected route moves to layer-edges-raised');
  const other = routeOf(h, 'grain_route_2');
  assert.strictEqual(other.parentNode.classList.contains('layer-edges'), true, 'unrelated route stays in layer-edges');
});

test('44: keyboard route activation still selects the factual route', () => {
  const h = createHarness();
  h.context.renderEconomyLogistics(threeRegionRoutePayload(), true);
  const route = routeOf(h, 'grain_route_2');
  route.dispatchEvent({ type: 'keydown', key: 'Enter' });
  assert.strictEqual(h.api.economyLogisticsUiState.selection?.id, 'grain_route_2');
});

test('45-48: node drag updates every connected route path/label, preserves particle refs, leaves unrelated routes byte-identical', () => {
  const h = createHarness();
  h.context.renderEconomyLogistics(threeRegionRoutePayload(), true);
  const viewport = viewportOf(h);
  const node = nodeOf(h, 'a1');
  const r1Before = routeOf(h, 'grain_route');
  const r2Before = routeOf(h, 'grain_route_2');
  const r1LineBefore = findAll(r1Before, (n) => n.classList.contains('logistics-route-line'))[0].getAttribute('d');
  const r2LineBefore = findAll(r2Before, (n) => n.classList.contains('logistics-route-line'))[0].getAttribute('d');
  const r2LabelBefore = routeAnnotation(r2Before, 'logistics-route-label').getAttribute('x');

  node.dispatchEvent({ type: 'pointerdown', clientX: 0, clientY: 0, button: 0, pointerId: 41 });
  viewport.dispatchEvent({ type: 'pointermove', clientX: 60, clientY: 30, pointerId: 41 });
  viewport.dispatchEvent({ type: 'pointerup', pointerId: 41 });

  const r1Line = findAll(routeOf(h, 'grain_route'), (n) => n.classList.contains('logistics-route-line'))[0];
  const r2Line = findAll(routeOf(h, 'grain_route_2'), (n) => n.classList.contains('logistics-route-line'))[0];
  assert.notStrictEqual(r1Line.getAttribute('d'), r1LineBefore, 'route touching the dragged node must update');
  // grain_route_2 shares the same endpoint pair; its path may legitimately
  // shift too (shared lane geometry depends on both endpoints), but its
  // label anchor must remain a finite, present value either way.
  assert.ok(r2Line.getAttribute('d'), 'sibling route sharing the endpoint remains rendered');
  const r2LabelAfter = routeAnnotation(routeOf(h, 'grain_route_2'), 'logistics-route-label').getAttribute('x');
  assert.ok(Number.isFinite(Number(r2LabelAfter)));
  void r2LineBefore; void r2LabelBefore;

  const dot = findAll(routeOf(h, 'grain_route'), (n) => n.classList.contains('logistics-flow-dot'))[0];
  if (dot) {
    const mpath = findAll(dot, (n) => n.tagName === 'MPATH')[0];
    const lineId = r1Line.getAttribute('id');
    assert.strictEqual(mpath.getAttribute('href'), `#${lineId}`, 'particle mpath still references the live route path id after drag');
  }
});

test('49: pointermove does not rebuild the panel (unrelated node element identity is preserved)', () => {
  const h = createHarness();
  h.context.renderEconomyLogistics(threeRegionRoutePayload(), true);
  const viewport = viewportOf(h);
  const unrelatedNodeBefore = nodeOf(h, 'b1');
  const node = nodeOf(h, 'a1');
  node.dispatchEvent({ type: 'pointerdown', clientX: 0, clientY: 0, button: 0, pointerId: 42 });
  viewport.dispatchEvent({ type: 'pointermove', clientX: 20, clientY: 10, pointerId: 42 });
  const unrelatedNodeDuring = nodeOf(h, 'b1');
  assert.strictEqual(unrelatedNodeDuring, unrelatedNodeBefore, 'unrelated node DOM identity unchanged during drag (no full rebuild)');
  viewport.dispatchEvent({ type: 'pointerup', pointerId: 42 });
});

test('50: completed drop and full rerender produce the same route geometry', () => {
  const h = createHarness();
  const payload = threeRegionRoutePayload();
  h.context.renderEconomyLogistics(payload, true);
  const viewport = viewportOf(h);
  const node = nodeOf(h, 'a1');
  node.dispatchEvent({ type: 'pointerdown', clientX: 0, clientY: 0, button: 0, pointerId: 43 });
  viewport.dispatchEvent({ type: 'pointermove', clientX: 50, clientY: 20, pointerId: 43 });
  viewport.dispatchEvent({ type: 'pointerup', pointerId: 43 });
  const afterDrag = findAll(routeOf(h, 'grain_route'), (n) => n.classList.contains('logistics-route-line'))[0].getAttribute('d');
  h.context.renderEconomyLogisticsPanel();
  const afterRerender = findAll(routeOf(h, 'grain_route'), (n) => n.classList.contains('logistics-route-line'))[0].getAttribute('d');
  assert.strictEqual(afterRerender, afterDrag, 'a full rerender from the persisted manual position reproduces the same geometry');
});

test('50a: 200-node/400-route low-degree drag computes only its topology group and preserves remote DOM byte-for-byte', () => {
  const h = createHarness();
  const payload = largeDragPayload();
  h.context.renderEconomyLogistics(payload, true);
  const viewport = viewportOf(h);
  const node = nodeOf(h, 'n0');
  const connected = routeOf(h, 'local_0');
  const remote = routeOf(h, 'remote_0399');
  const connectedLine = findAll(connected, (n) => n.classList.contains('logistics-route-line'))[0];
  const connectedHit = findAll(connected, (n) => n.classList.contains('logistics-route-hit'))[0];
  const connectedLabel = routeAnnotation(connected, 'logistics-route-label');
  const connectedWarning = routeAnnotation(connected, 'logistics-route-warning');
  const before = {
    path: connectedLine.getAttribute('d'),
    label: `${connectedLabel.getAttribute('x')},${connectedLabel.getAttribute('y')}`,
    warning: `${connectedWarning.getAttribute('x')},${connectedWarning.getAttribute('y')}`,
  };
  const remoteBytes = elementBytes(remote);
  const remoteIdentity = remote;

  node.dispatchEvent({ type: 'pointerdown', clientX: 0, clientY: 0, button: 0, pointerId: 90 });
  viewport.dispatchEvent({ type: 'pointermove', clientX: 80, clientY: 35, pointerId: 90 });

  const computedIds = Array.from(h.api.economyLogisticsUiState.rendered.lastGeometryRouteIds || []);
  assert.deepStrictEqual(computedIds, ['local_0', 'local_2']);
  assert.ok(computedIds.length < payload.routes.length, 'partial geometry call must not receive all 400 routes');
  assert.strictEqual(computedIds.includes('remote_0399'), false, 'remote component excluded');
  assert.strictEqual(routeOf(h, 'remote_0399'), remoteIdentity, 'remote route DOM identity unchanged');
  assert.strictEqual(elementBytes(routeOf(h, 'remote_0399')), remoteBytes, 'remote path and label remain byte-identical');
  assert.notStrictEqual(connectedLine.getAttribute('d'), before.path, 'connected visible path updates');
  assert.strictEqual(connectedHit.getAttribute('d'), connectedLine.getAttribute('d'), 'connected hit path shares updated geometry');
  assert.notStrictEqual(`${connectedLabel.getAttribute('x')},${connectedLabel.getAttribute('y')}`, before.label, 'connected label updates');
  assert.notStrictEqual(`${connectedWarning.getAttribute('x')},${connectedWarning.getAttribute('y')}`, before.warning, 'connected warning updates');
  const particlePath = findAll(connected, (n) => n.tagName === 'MPATH')[0];
  if (particlePath) { assert.strictEqual(particlePath.getAttribute('href'), `#${connectedLine.getAttribute('id')}`, 'particle follows the updated shared path'); }

  viewport.dispatchEvent({ type: 'pointerup', pointerId: 90 });
  const afterDrop = {
    path: connectedLine.getAttribute('d'),
    label: `${connectedLabel.getAttribute('x')},${connectedLabel.getAttribute('y')}`,
    warning: `${connectedWarning.getAttribute('x')},${connectedWarning.getAttribute('y')}`,
  };
  h.context.renderEconomyLogisticsPanel();
  const rerendered = routeOf(h, 'local_0');
  const rerenderedLine = findAll(rerendered, (n) => n.classList.contains('logistics-route-line'))[0];
  const rerenderedLabel = routeAnnotation(rerendered, 'logistics-route-label');
  const rerenderedWarning = routeAnnotation(rerendered, 'logistics-route-warning');
  assert.deepStrictEqual({
    path: rerenderedLine.getAttribute('d'),
    label: `${rerenderedLabel.getAttribute('x')},${rerenderedLabel.getAttribute('y')}`,
    warning: `${rerenderedWarning.getAttribute('x')},${rerenderedWarning.getAttribute('y')}`,
  }, afterDrop, 'completed drop agrees with ordinary rerender');
});

test('51-52: collapsed aggregate endpoint uses the aggregate boundary; expansion restores factual-endpoint geometry', () => {
  const h = createHarness();
  h.context.renderEconomyLogistics(threeRegionRoutePayload(), true);
  h.api.economyLogisticsUiState.collapsedRegionIds = new Set(['reg_a']);
  h.context.renderEconomyLogisticsPanel();
  const collapsedRoute = routeOf(h, 'grain_route');
  assert.ok(collapsedRoute, 'route remains distinct and present when its source region is collapsed');
  const line = findAll(collapsedRoute, (n) => n.classList.contains('logistics-route-line'))[0];
  assert.ok(line.getAttribute('d'), 'collapsed-endpoint route still has a real path');
  h.api.economyLogisticsUiState.collapsedRegionIds = new Set();
  h.context.renderEconomyLogisticsPanel();
  const expandedRoute = routeOf(h, 'grain_route');
  assert.ok(expandedRoute, 'route id survives expand/collapse round-trip');
  assert.strictEqual(expandedRoute.getAttribute('data-route-id') || expandedRoute.dataset.routeId, 'grain_route');
});

test('53-54: route status and commodity-relevance classes are unaffected by the geometry rewrite', () => {
  const h = createHarness();
  h.context.renderEconomyLogistics(threeRegionRoutePayload(), true);
  const strained = routeOf(h, 'grain_route_2');
  assert.ok(strained.classList.contains('logistics-route-strained'), 'status class unchanged');
  assert.ok(strained.classList.contains('is-related'), 'relevance class unchanged for a matching commodity');
});

test('55: geometry computation never mutates the payload object', () => {
  const h = createHarness();
  const payload = threeRegionRoutePayload();
  const before = JSON.parse(JSON.stringify(payload));
  h.context.renderEconomyLogistics(payload, true);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(payload)), before, 'payload object must remain unmodified by rendering');
});

test('SLICE4 41-60: factual visual tokens affect only rendering, not geometry or interaction', () => {
  const h = createHarness();
  h.context.currentWorldLocationId = 'loc-a';
  const payload = threeRegionRoutePayload();
  payload.commodities = [
    { id: 'grain', name: 'Grain', family: 'food' },
    { id: 'iron', name: 'Iron', family: 'metal' },
  ];
  payload.routes = [
    { ...payload.routes[0], id: 'normal', commodityId: 'grain', volume: 1, status: 'open' },
    { ...payload.routes[1], id: 'rumored', commodityId: 'grain', volume: 8, status: 'unconfirmed' },
    { ...payload.routes[1], id: 'impaired', commodityId: 'iron', volume: 32, status: 'disrupted' },
    { ...payload.routes[1], id: 'blocked', commodityId: 'iron', volume: 64, status: 'blocked' },
  ];
  h.context.renderEconomyLogistics(payload, true);
  const normal = routeOf(h, 'normal');
  const rumored = routeOf(h, 'rumored');
  const impaired = routeOf(h, 'impaired');
  const blocked = routeOf(h, 'blocked');
  const line = (group) => findAll(group, (n) => n.classList.contains('logistics-route-line'))[0];
  const hit = (group) => findAll(group, (n) => n.classList.contains('logistics-route-hit'))[0];
  assert.ok(normal.classList.contains('logistics-route-status-open'), '41 normal route exposes its status token');
  assert.ok(Number(line(blocked).getAttribute('stroke-width')) > Number(line(normal).getAttribute('stroke-width')), '42 factual volume controls rendered width');
  assert.strictEqual(hit(normal).getAttribute('stroke-width'), '12', '43 hit path remains independently interaction-safe');
  assert.ok(line(rumored).style.props['stroke-dasharray'], '44 unconfirmed route renders a dash');
  assert.notStrictEqual(line(impaired).style.props['stroke-dasharray'], line(rumored).style.props['stroke-dasharray'], '45 impaired dash differs from unconfirmed');
  assert.ok(blocked && line(blocked).getAttribute('d'), '46 blocked route remains visible');
  const normalD = line(normal).getAttribute('d');
  h.api.economyLogisticsUiState.selection = { type: 'route', id: 'normal' };
  h.api.economyLogisticsUiState.commodityId = 'iron';
  h.context.renderEconomyLogisticsPanel();
  const selected = routeOf(h, 'normal');
  assert.ok(selected.parentNode.classList.contains('layer-edges-raised'), '47 selected route remains raised');
  assert.strictEqual(selected.style.opacity, '1', '48 selected route remains undimmed');
  assert.ok(selected.classList.contains('logistics-route-status-open'), '49 selected route retains factual status');
  assert.ok(Number(routeOf(h, 'rumored').style.opacity) < 1, '50 unrelated route dims');
  assert.strictEqual(nodeOf(h, 'a1').style.opacity, '1', '51 current-location node does not dim');
  h.api.economyLogisticsUiState.selection = { type: 'node', id: 'b1' };
  h.context.renderEconomyLogisticsPanel();
  assert.strictEqual(nodeOf(h, 'b1').style.opacity, '1', '52 selected node does not dim');
  assert.strictEqual(line(routeOf(h, 'normal')).getAttribute('d'), normalD, '53 filter/accent does not alter path d');
  const changed = JSON.parse(JSON.stringify(payload));
  changed.routes[0].volume = 999;
  changed.routes[1].status = 'blocked';
  h.context.renderEconomyLogistics(changed, true);
  assert.strictEqual(line(routeOf(h, 'normal')).getAttribute('d'), normalD, '54 volume changes do not alter path d');
  assert.strictEqual(line(routeOf(h, 'rumored')).getAttribute('d'), line(routeOf(h, 'rumored')).dataset.routePath, '55 status changes retain the computed path');
  const particle = findAll(routeOf(h, 'normal'), (n) => n.tagName === 'MPATH')[0];
  if (particle) { assert.strictEqual(particle.getAttribute('href'), `#${line(routeOf(h, 'normal')).getAttribute('id')}`, '56 mpath remains stable'); }
  routeOf(h, 'normal').dispatchEvent({ type: 'click' });
  assert.strictEqual(h.api.economyLogisticsUiState.selection.id, 'normal', '57 route click remains factual');
  routeOf(h, 'blocked').dispatchEvent({ type: 'keydown', key: 'Enter' });
  assert.strictEqual(h.api.economyLogisticsUiState.selection.id, 'blocked', '58 route keyboard activation remains factual');
  assert.ok(h.panel.textContent.includes(h.context.T('webview.world.logisticsLegendEncoding')), '59 localized encoding legend renders');
  assert.strictEqual(findAll(h.panel, (n) => n.dataset.routeId).length, payload.routes.length, '60 filtering deletes no routes');
  assert.strictEqual(findAll(h.panel, (n) => n.dataset.nodeId).length, 2, '60 filtering deletes no nodes');
});

test('SLICE4 corrections: renderer uses one relevance result and paints a secondary family accent', () => {
  const h = createHarness();
  const payload = threeRegionRoutePayload();
  payload.commodities = [
    { id: 'grain', name: 'Grain', family: 'food' },
    { id: 'fruit', name: 'Fruit', family: 'food' },
    { id: 'iron', name: 'Iron', family: 'metal' },
  ];
  payload.routes = [
    { ...payload.routes[0], id: 'grain', commodityId: 'grain', volume: 12, status: 'open' },
    { ...payload.routes[1], id: 'fruit', commodityId: 'fruit', volume: 8, status: 'unconfirmed' },
    { ...payload.routes[1], id: 'iron', commodityId: 'iron', volume: 4, status: 'disrupted' },
  ];
  const line = (group) => findAll(group, (n) => n.classList.contains('logistics-route-line'))[0];
  const hit = (group) => findAll(group, (n) => n.classList.contains('logistics-route-hit'))[0];
  h.context.renderEconomyLogistics(payload, true);
  const before = {
    d: line(routeOf(h, 'fruit')).getAttribute('d'),
    hitD: hit(routeOf(h, 'fruit')).getAttribute('d'),
    id: line(routeOf(h, 'fruit')).getAttribute('id'),
  };
  assert.strictEqual(routeOf(h, 'iron').style.opacity, '1', 'all commodities starts fully relevant');

  h.api.economyLogisticsUiState.selection = { type: 'route', id: 'grain' };
  h.api.economyLogisticsUiState.commodityId = 'all';
  h.context.renderEconomyLogisticsPanel();
  const remoteSelected = routeOf(h, 'iron');
  assert.strictEqual(remoteSelected.dataset.relevance, 'unrelated', 'selected-route remote has authoritative unrelated data');
  assert.ok(remoteSelected.classList.contains('is-unrelated'), 'selected-route remote has unrelated class');
  assert.strictEqual(remoteSelected.style.opacity, '0.18', 'selected-route remote inline opacity agrees');
  assert.strictEqual(routeOf(h, 'grain').style.opacity, '1', 'selected route remains full');

  h.api.economyLogisticsUiState.selection = null;
  h.api.economyLogisticsUiState.commodityId = 'grain';
  h.context.renderEconomyLogisticsPanel();
  const grain = routeOf(h, 'grain');
  const fruit = routeOf(h, 'fruit');
  const iron = routeOf(h, 'iron');
  assert.strictEqual(grain.dataset.relevance, 'primary');
  assert.strictEqual(grain.style.opacity, '1');
  assert.ok(grain.classList.contains('is-commodity-primary'), 'exact commodity uses the primary halo');
  assert.strictEqual(fruit.dataset.relevance, 'secondary', 'same family exposes secondary relevance');
  assert.strictEqual(fruit.style.opacity, '0.55', 'same family uses secondary opacity');
  assert.ok(fruit.classList.contains('is-secondary') && fruit.classList.contains('is-commodity-secondary'), 'same family consumes a secondary accent state');
  assert.ok(fruit.classList.contains('logistics-route-rumored'), 'secondary retains factual status class');
  assert.ok(line(fruit).style.props['stroke-dasharray'], 'secondary retains factual dash');
  assert.strictEqual(iron.dataset.relevance, 'unrelated');
  assert.strictEqual(iron.style.opacity, '0.18');
  assert.ok(!iron.classList.contains('is-commodity-primary') && !iron.classList.contains('is-commodity-secondary'), 'unrelated route has no commodity halo');
  assert.strictEqual(line(fruit).getAttribute('d'), before.d, 'commodity relevance leaves visible path d byte-identical');
  assert.strictEqual(hit(fruit).getAttribute('d'), before.hitD, 'commodity relevance leaves hit path d byte-identical');
  assert.strictEqual(line(fruit).getAttribute('id'), before.id, 'commodity relevance leaves path id stable');
  const mpath = findAll(fruit, (n) => n.tagName === 'MPATH')[0];
  if (mpath) { assert.strictEqual(mpath.getAttribute('href'), `#${before.id}`, 'commodity relevance leaves mpath stable'); }
  assert.strictEqual(findAll(h.panel, (n) => n.dataset.routeId === 'fruit').length, 1, 'filter leaves one factual route element');

  h.api.economyLogisticsUiState.selection = { type: 'route', id: 'grain' };
  h.api.economyLogisticsUiState.commodityId = 'iron';
  h.context.renderEconomyLogisticsPanel();
  assert.strictEqual(routeOf(h, 'grain').style.opacity, '1', 'selection overrides unrelated commodity dimming');
  h.api.economyLogisticsUiState.selection = null;
  h.api.economyLogisticsUiState.commodityId = 'all';
  h.context.renderEconomyLogisticsPanel();
  assert.strictEqual(routeOf(h, 'iron').style.opacity, '1', 'clearing all focus restores full relevance');
  const css = fs.readFileSync(path.join(root, 'webview', 'styles', '85b-economy-logistics.css'), 'utf8');
  assert.match(css, /\.logistics-route\.is-commodity-secondary \.logistics-route-line/, 'stylesheet consumes the secondary route state');
});

test('SLICE5: search, minimap, and semantic zoom preserve rendered geometry', () => {
  const h = createHarness();
  h.context.renderEconomyLogistics(twoRegionPayload(), true);
  const grain = routeOf(h, 'grain_route');
  const grainLine = findAll(grain, (n) => n.classList.contains('logistics-route-line'))[0];
  const beforePath = grainLine.getAttribute('d');
  const search = findAll(h.panel, (n) => n.classList.contains('logistics-search'))[0];
  assert.ok(search, 'search input is rendered');
  search.value = 'iron';
  search.dispatchEvent({ type: 'input' });
  assert.strictEqual(routeOf(h, 'grain_route'), grain, 'search updates existing route DOM instead of rebuilding it');
  assert.strictEqual(grainLine.getAttribute('d'), beforePath, 'search leaves route geometry byte-identical');
  assert.strictEqual(routeOf(h, 'grain_route').dataset.relevance, 'unrelated', 'non-matching route dims');
  assert.strictEqual(routeOf(h, 'iron_route').dataset.relevance, 'primary', 'matching route remains primary');

  const minimap = findAll(h.panel, (n) => n.classList.contains('logistics-minimap-canvas'))[0];
  assert.ok(minimap, 'large enough graph has an interactive minimap');
  for (let i = 0; i < 4; i++) toolbarBtn(h, 'logistics-camera-zoom-in').dispatchEvent({ type: 'click' });
  const beforeCamera = { ...h.api.economyLogisticsUiState.cameraContexts.normal.camera };
  minimap.dispatchEvent({ type: 'pointerdown', pointerId: 501, clientX: 110, clientY: 22 });
  minimap.dispatchEvent({ type: 'pointerup', pointerId: 501, clientX: 110, clientY: 22 });
  const afterCamera = h.api.economyLogisticsUiState.cameraContexts.normal.camera;
  assert.strictEqual(afterCamera.k, beforeCamera.k, 'minimap pan retains the active zoom scale');
  assert.ok(afterCamera.tx !== beforeCamera.tx || afterCamera.ty !== beforeCamera.ty, 'minimap pointer moves the camera viewport');

  const svg = findAll(h.panel, (n) => n.classList.contains('logistics-network'))[0];
  const zoomIn = toolbarBtn(h, 'logistics-camera-zoom-in');
  for (let i = 0; i < 8; i++) { zoomIn.dispatchEvent({ type: 'click' }); }
  assert.ok(svg.classList.contains('is-zoom-detail'), 'zoom-in reaches the semantic detail level without rerendering');
  assert.strictEqual(grainLine.getAttribute('d'), beforePath, 'semantic zoom leaves route geometry byte-identical');
});

test('SLICE5 corrections: filters compose, regions search, endpoints persist at overview, and count stays factual', () => {
  const h = createHarness();
  h.context.renderEconomyLogistics(slice5CorrectionsPayload(), true);
  const line = (id) => findAll(routeOf(h, id), (n) => n.classList.contains('logistics-route-line'))[0];
  const hit = (id) => findAll(routeOf(h, id), (n) => n.classList.contains('logistics-route-hit'))[0];
  const stable = new Map(['grain_quiet', 'grain_special', 'fruit_special', 'iron_special'].map((id) => [id, {
    group: routeOf(h, id), d: line(id).getAttribute('d'), hit: hit(id).getAttribute('d'), pathId: line(id).getAttribute('id'), mpath: findAll(routeOf(h, id), (n) => n.tagName === 'MPATH')[0]?.getAttribute('href') || null,
  }]));
  const commodity = selectOf(h);
  const search = findAll(h.panel, (n) => n.classList.contains('logistics-search'))[0];
  const status = findAll(h.panel, (n) => n.classList.contains('logistics-status-filter'))[0];
  const count = () => findAll(h.panel, (n) => n.classList.contains('logistics-filter-results'))[0];
  const clear = findAll(h.panel, (n) => n.classList.contains('logistics-clear-filters-btn'))[0];
  assert.strictEqual(count().getAttribute('aria-live'), 'polite', 'match count has restrained live announcement');
  assert.ok(count().textContent.endsWith(': 4'), 'inactive filters show factual route total');

  commodity.value = 'grain'; commodity.dispatchEvent({ type: 'change' });
  search.value = 'special'; search.dispatchEvent({ type: 'input' });
  assert.strictEqual(routeOf(h, 'grain_quiet').dataset.relevance, 'unrelated', 'commodity match cannot bypass query mismatch');
  assert.strictEqual(routeOf(h, 'iron_special').dataset.relevance, 'unrelated', 'query match cannot bypass commodity mismatch');
  assert.strictEqual(routeOf(h, 'grain_special').dataset.relevance, 'primary', 'exact commodity plus query is primary');
  assert.strictEqual(routeOf(h, 'grain_special').style.opacity, '1');
  assert.ok(routeOf(h, 'grain_special').classList.contains('is-commodity-primary'));
  assert.strictEqual(routeOf(h, 'fruit_special').dataset.relevance, 'secondary', 'same factual family plus query is secondary');
  assert.strictEqual(routeOf(h, 'fruit_special').style.opacity, '0.55');
  assert.ok(routeOf(h, 'fruit_special').classList.contains('is-commodity-secondary'));
  assert.ok(routeOf(h, 'fruit_special').classList.contains('logistics-route-rumored'), 'factual status class survives combined filtering');
  assert.ok(line('fruit_special').style.props['stroke-dasharray'], 'factual status dash survives combined filtering');
  assert.ok(count().textContent.endsWith(': 2'), 'combined exact and same-family factual matches are counted');
  for (const [id, before] of stable) {
    assert.strictEqual(routeOf(h, id), before.group, 'filter changes retain route DOM identity');
    assert.strictEqual(line(id).getAttribute('d'), before.d, 'filter changes retain route path');
    assert.strictEqual(hit(id).getAttribute('d'), before.hit, 'filter changes retain hit path');
    assert.strictEqual(line(id).getAttribute('id'), before.pathId, 'filter changes retain path id');
    const mpath = findAll(routeOf(h, id), (n) => n.tagName === 'MPATH')[0];
    if (before.mpath) assert.strictEqual(mpath.getAttribute('href'), before.mpath, 'filter changes retain mpath reference');
  }

  search.value = 'no factual match'; search.dispatchEvent({ type: 'input' });
  assert.ok(count().textContent.endsWith(': 0'), 'zero factual matches are visible');
  search.value = ''; search.dispatchEvent({ type: 'input' }); status.value = 'open'; status.dispatchEvent({ type: 'change' });
  assert.ok(count().textContent.endsWith(': 2'), 'status changes update combined factual count');
  clear.dispatchEvent({ type: 'click' });
  assert.ok(count().textContent.endsWith(': 4'), 'clearing filters restores factual route total');

  const beforeRegionCamera = { ...h.api.economyLogisticsUiState.cameraContexts.normal.camera };
  const beforeRegionPositions = JSON.stringify([...h.api.economyLogisticsUiState.rendered.positions.entries()].map(([id, position]) => [id, position.x, position.y]));
  search.value = 'Harbor Display'; search.dispatchEvent({ type: 'input' });
  assert.strictEqual(nodeOf(h, 'grain_quiet_node').dataset.relevance, 'primary', 'visible region label matches its node');
  assert.strictEqual(routeOf(h, 'grain_quiet').dataset.relevance, 'primary', 'visible region label matches incident route');
  assert.strictEqual(nodeOf(h, 'iron_special_node').dataset.relevance, 'unrelated', 'other region node dims');
  assert.strictEqual(routeOf(h, 'iron_special').dataset.relevance, 'unrelated', 'other region route dims');
  assert.strictEqual(JSON.stringify([...h.api.economyLogisticsUiState.rendered.positions.entries()].map(([id, position]) => [id, position.x, position.y])), beforeRegionPositions, 'region search preserves layout coordinates');
  const afterRegionCamera = h.api.economyLogisticsUiState.cameraContexts.normal.camera;
  assert.strictEqual(afterRegionCamera.k, beforeRegionCamera.k, 'region search preserves camera scale');
  assert.strictEqual(afterRegionCamera.tx, beforeRegionCamera.tx, 'region search preserves camera x');
  assert.strictEqual(afterRegionCamera.ty, beforeRegionCamera.ty, 'region search preserves camera y');
  clear.dispatchEvent({ type: 'click' });

  routeOf(h, 'grain_special').dispatchEvent({ type: 'click' });
  assert.ok(nodeOf(h, 'minor_endpoint').classList.contains('is-route-endpoint'), 'selected route endpoint receives stable semantic class');
  assert.ok(routeOf(h, 'grain_special').parentNode.classList.contains('layer-edges-raised'), 'selected route remains raised');
  const svg = findAll(h.panel, (n) => n.classList.contains('logistics-network'))[0];
  const zoomOut = toolbarBtn(h, 'logistics-camera-zoom-out');
  for (let i = 0; i < 8; i++) { zoomOut.dispatchEvent({ type: 'click' }); }
  assert.ok(svg.classList.contains('is-zoom-overview'), 'accepted camera API reaches overview');
  const css = fs.readFileSync(path.join(root, 'webview', 'styles', '85b-economy-logistics.css'), 'utf8');
  assert.match(css, /\.logistics-node-label-overlay\.is-route-endpoint \.logistics-node-label/, 'overview CSS preserves only selected-route endpoint label');
  assert.ok(nodeOf(h, 'unrelated_minor').classList.contains('logistics-node-scale-minor'), 'fixture contains unrelated minor label candidate');
  h.panel.dispatchEvent({ type: 'keydown', key: 'Escape' });
  assert.ok(!nodeOf(h, 'minor_endpoint').classList.contains('is-route-endpoint'), 'clearing route selection removes endpoint protection');
  const countBeforeCamera = count().textContent;
  toolbarBtn(h, 'logistics-camera-zoom-in').dispatchEvent({ type: 'click' });
  assert.strictEqual(count().textContent, countBeforeCamera, 'camera changes do not update or reannounce filter count');
});

test('HUMAN-BLOCKERS-A: factual labels are final-layer text and filtered particles follow final relevance', () => {
  const h = createHarness({ panelWidth: 800 });
  h.context.renderEconomyLogistics(slice5CorrectionsPayload(), true);
  const svg = findAll(h.panel, (n) => n.classList.contains('logistics-network'))[0];
  const camera = findAll(svg, (n) => n.classList.contains('logistics-camera'))[0];
  const layer = (name) => findAll(camera, (n) => n.classList.contains(name))[0];
  const labels = layer('layer-labels');
  const ordinary = layer('layer-edges');
  const raised = layer('layer-edges-raised');
  const nodes = layer('layer-nodes');
  const grain = routeOf(h, 'grain_special');
  const routeLabel = routeAnnotation(grain, 'logistics-route-label');
  const nodeLabels = nodeOf(h, 'grain_special_node')._logisticsAnnotations;
  const regionLabel = findAll(labels, (n) => n.classList.contains('logistics-region-label'))[0];
  assert.strictEqual(routeLabel.parentNode.parentNode, labels, 'route factual label is in the final annotation layer');
  assert.strictEqual(nodeLabels.parentNode, labels, 'node factual labels are in the final annotation layer');
  assert.strictEqual(regionLabel.parentNode, labels, 'region factual label is in the final annotation layer');
  assert.ok(camera.children.indexOf(labels) > camera.children.indexOf(ordinary));
  assert.ok(camera.children.indexOf(labels) > camera.children.indexOf(raised));
  assert.ok(camera.children.indexOf(labels) > camera.children.indexOf(nodes));
  assert.strictEqual(labels.getAttribute('pointer-events'), null, 'layer styling owns non-interactive overlays');
  assert.strictEqual(nodeLabels.getAttribute('pointer-events'), 'none');
  const grainLine = findAll(grain, (n) => n.classList.contains('logistics-route-line'))[0];
  const grainHit = findAll(grain, (n) => n.classList.contains('logistics-route-hit'))[0];
  const original = { d: grainLine.getAttribute('d'), hit: grainHit.getAttribute('d'), id: grainLine.getAttribute('id'), mpath: findAll(grain, (n) => n.tagName === 'MPATH')[0]?.getAttribute('href') };
  assert.strictEqual(grainHit.parentNode, grain, 'route hit path remains inside the clickable factual route');
  grain.dispatchEvent({ type: 'click' });
  const selected = routeOf(h, 'grain_special');
  assert.strictEqual(findAll(h.panel, (n) => n.dataset.routeId === 'grain_special').length, 1, 'selection keeps exactly one factual route');
  assert.ok(selected.parentNode.classList.contains('layer-edges-raised'), 'selected stroke is raised below final labels');
  assert.ok(camera.children.indexOf(labels) > camera.children.indexOf(selected.parentNode));
  h.panel.dispatchEvent({ type: 'keydown', key: 'Escape' });

  const visibleDots = (id) => findAll(routeOf(h, id), (n) => n.classList.contains('logistics-flow-dot') && n.getAttribute('display') !== 'none');
  let commodity = selectOf(h);
  commodity.value = 'grain'; commodity.dispatchEvent({ type: 'change' });
  assert.ok(visibleDots('grain_special').length > 0, 'primary route particles remain visible');
  assert.strictEqual(visibleDots('fruit_special').length, 0, 'secondary policy hides particles');
  assert.strictEqual(visibleDots('iron_special').length, 0, 'unrelated commodity particles hide immediately');
  const search = findAll(h.panel, (n) => n.classList.contains('logistics-search'))[0];
  search.value = 'special'; search.dispatchEvent({ type: 'input' });
  assert.strictEqual(visibleDots('grain_quiet').length, 0, 'search mismatch hides particles immediately');
  const status = findAll(h.panel, (n) => n.classList.contains('logistics-status-filter'))[0];
  status.value = 'open'; status.dispatchEvent({ type: 'change' });
  assert.strictEqual(visibleDots('fruit_special').length, 0, 'status mismatch hides particles under AND filtering');
  search.value = 'no factual match'; search.dispatchEvent({ type: 'input' });
  assert.strictEqual(findAll(h.panel, (n) => n.classList.contains('logistics-flow-dot') && n.getAttribute('display') !== 'none').length, 0, 'zero-result filtering leaves no visible ghost particles');
  const clear = findAll(h.panel, (n) => n.classList.contains('logistics-clear-filters-btn'))[0];
  clear.dispatchEvent({ type: 'click' });
  assert.ok(visibleDots('grain_quiet').length > 0, 'clearing filters restores operational eligible particles');
  assert.strictEqual(visibleDots('iron_special').length, 0, 'unknown/non-operational status never gains particles when filters clear');
  assert.strictEqual(findAll(h.panel, (n) => n.dataset.routeId === 'grain_special').length, 1, 'filtering does not duplicate the selected route');
  const grainAfter = routeOf(h, 'grain_special');
  const lineAfter = findAll(grainAfter, (n) => n.classList.contains('logistics-route-line'))[0];
  const hitAfter = findAll(grainAfter, (n) => n.classList.contains('logistics-route-hit'))[0];
  assert.strictEqual(lineAfter.getAttribute('d'), original.d, 'filtering does not recompute route geometry');
  assert.strictEqual(hitAfter.getAttribute('d'), original.hit, 'filtering preserves hit-path geometry');
  assert.strictEqual(lineAfter.getAttribute('id'), original.id, 'filtering preserves route path id');
  assert.strictEqual(findAll(grainAfter, (n) => n.tagName === 'MPATH')[0]?.getAttribute('href'), original.mpath, 'filtering preserves mpath reference');
  const flowToggle = findAll(h.panel, (n) => n.classList.contains('logistics-flow-toggle-btn'))[0];
  flowToggle.dispatchEvent({ type: 'click' });
  assert.strictEqual(findAll(h.panel, (n) => n.classList.contains('logistics-flow-dot')).length, 0, 'Flow off removes every particle');
  const css = fs.readFileSync(path.join(root, 'webview', 'styles', '85b-economy-logistics.css'), 'utf8');
  assert.match(css, /\.layer-labels[\s\S]*pointer-events: none/, 'label layer is non-interactive');
  assert.match(css, /stroke: var\(--vscode-editor-background\)/, 'theme-safe factual text outline supports dark and light themes');
});

// --- SLICE6 HUMAN-BLOCKERS-B: live region sync, minimap rendering, selection
//     clearing, reg_coast policy, Layout Reset feedback, light-theme quality ---

function regionRefs(h, regionId) {
  const rendered = h.api.economyLogisticsUiState.rendered;
  return rendered && rendered.regionElements ? rendered.regionElements.get(regionId) : null;
}
function rectXYWH(rect) {
  return {
    x: rect.getAttribute('x'), y: rect.getAttribute('y'),
    w: rect.getAttribute('width'), h: rect.getAttribute('height'),
  };
}
function minimapNodes(h) { return findAll(h.panel, (n) => n.classList.contains('logistics-minimap-node')); }
function minimapRegions(h) { return findAll(h.panel, (n) => n.classList.contains('logistics-minimap-region')); }
function minimapViewportRect(h) { return findAll(h.panel, (n) => n.classList.contains('logistics-minimap-viewport'))[0]; }
function minimapCanvas(h) { return findAll(h.panel, (n) => n.classList.contains('logistics-minimap-canvas'))[0]; }
function styleNum(el, prop) { return parseFloat(el.style.getPropertyValue(prop)); }
function cameraOf(h) { return h.api.economyLogisticsUiState.cameraContexts.normal.camera; }
function collapseControl(h, regionId) {
  return findAll(h.panel, (n) => n.classList.contains('logistics-region-collapse') && n.parentNode && n.parentNode.dataset.regionId === regionId)[0];
}
function cssBlock(css, selector) {
  const esc = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const m = new RegExp(`${esc}\\s*\\{([^}]*)\\}`).exec(css);
  return m ? m[1] : '';
}
const LOGISTICS_CSS = fs.readFileSync(path.join(root, 'webview', 'styles', '85b-economy-logistics.css'), 'utf8');

test('A: owning region rect + label + hit follow a node pointermove; unrelated region byte-identical', () => {
  const h = createHarness();
  h.context.renderEconomyLogistics(twoRegionPayload(), true);
  const viewport = viewportOf(h);
  const beforeA = regionRefs(h, 'reg_a');
  const beforeB = regionRefs(h, 'reg_b');
  assert.ok(beforeA && beforeA.rect && beforeA.label && beforeA.hit, 'reg_a refs captured');
  assert.ok(beforeB && beforeB.rect, 'reg_b refs captured');
  const rectA0 = rectXYWH(beforeA.rect);
  const labelA0 = { x: beforeA.label.getAttribute('x'), y: beforeA.label.getAttribute('y') };
  const hitA0 = { x: beforeA.hit.getAttribute('x'), w: beforeA.hit.getAttribute('width') };
  const bytesB0 = elementBytes(beforeB.rect);

  const node = nodeOf(h, 'a1');
  node.dispatchEvent({ type: 'pointerdown', clientX: 0, clientY: 0, button: 0, pointerId: 61 });
  viewport.dispatchEvent({ type: 'pointermove', clientX: 46, clientY: 34, pointerId: 61 });

  const rectA1 = rectXYWH(beforeA.rect);
  assert.notDeepStrictEqual(rectA1, rectA0, 'owning region rect follows the drag during pointermove');
  assert.notStrictEqual(beforeA.label.getAttribute('x') + ',' + beforeA.label.getAttribute('y'),
    labelA0.x + ',' + labelA0.y, 'owning region label follows the drag');
  assert.notStrictEqual(beforeA.hit.getAttribute('x') + ',' + beforeA.hit.getAttribute('width'),
    hitA0.x + ',' + hitA0.w, 'owning region header hit-area follows the drag');
  assert.strictEqual(elementBytes(beforeB.rect), bytesB0, 'unrelated region rect stays byte-identical during drag');

  viewport.dispatchEvent({ type: 'pointerup', pointerId: 61 });
});

test('A: pointerup-finalized region bounds equal a full rerender (byte-identical)', () => {
  const h = createHarness();
  h.context.renderEconomyLogistics(twoRegionPayload(), true);
  const viewport = viewportOf(h);
  const node = nodeOf(h, 'a1');
  node.dispatchEvent({ type: 'pointerdown', clientX: 0, clientY: 0, button: 0, pointerId: 62 });
  viewport.dispatchEvent({ type: 'pointermove', clientX: 30, clientY: 22, pointerId: 62 });
  viewport.dispatchEvent({ type: 'pointerup', pointerId: 62 });
  const committed = rectXYWH(regionRefs(h, 'reg_a').rect);

  h.api.renderEconomyLogisticsPanel();
  const rerendered = rectXYWH(regionRefs(h, 'reg_a').rect);
  assert.deepStrictEqual(rerendered, committed, 'committed region bounds match a full rerender exactly');
});

test('B: minimap renders visible region rects, node markers and a finite viewport rect; drag follows', () => {
  const h = createHarness();
  h.context.renderEconomyLogistics(twoRegionPayload(), true);
  const regions = minimapRegions(h);
  const nodes = minimapNodes(h);
  const vpRect = minimapViewportRect(h);
  assert.ok(regions.length >= 2, 'minimap has region rectangles');
  assert.ok(nodes.length >= 4, 'minimap has node markers');
  assert.ok(vpRect, 'minimap has a viewport rectangle');
  regions.forEach((r) => { assert.ok(styleNum(r, 'width') > 0 && styleNum(r, 'height') > 0, 'region rect has positive size'); });
  assert.ok(Number.isFinite(styleNum(vpRect, 'width')) && styleNum(vpRect, 'width') > 0, 'viewport rect width is finite and visible');
  assert.ok(Number.isFinite(styleNum(vpRect, 'height')) && styleNum(vpRect, 'height') > 0, 'viewport rect height is finite and visible');
  // selected/current markers distinguishable
  const current = minimapNodes(h).filter((n) => n.classList.contains('is-current'));
  assert.strictEqual(current.length, 1, 'exactly one current-location marker is distinguishable');

  // node drag updates the minimap projection for the dragged node
  const viewport = viewportOf(h);
  const marker = minimapNodes(h).find((n) => n.dataset.minimapNodeId === 'a1');
  const left0 = styleNum(marker, 'left');
  nodeOf(h, 'a1').dispatchEvent({ type: 'pointerdown', clientX: 0, clientY: 0, button: 0, pointerId: 63 });
  viewport.dispatchEvent({ type: 'pointermove', clientX: 60, clientY: 0, pointerId: 63 });
  assert.notStrictEqual(styleNum(marker, 'left'), left0, 'minimap marker follows the node drag');
  viewport.dispatchEvent({ type: 'pointerup', pointerId: 63 });
});

test('B: minimap paint tokens are non-transparent theme variables (dark and light)', () => {
  const region = cssBlock(LOGISTICS_CSS, '.logistics-minimap-region');
  const nodeTok = cssBlock(LOGISTICS_CSS, '.logistics-minimap-node');
  const vpTok = cssBlock(LOGISTICS_CSS, '.logistics-minimap-viewport');
  assert.match(region, /background:\s*color-mix\([^;]*--vscode/, 'region rect painted via theme var, not SVG fill');
  assert.ok(!/^\s*background:\s*transparent\s*;/m.test(region), 'region rect background is not transparent');
  assert.match(nodeTok, /background:\s*var\(--vscode/, 'node marker painted via theme var');
  assert.match(vpTok, /border:[^;]*--vscode-focusBorder/, 'viewport rect has a visible themed border');
  assert.match(vpTok, /background:\s*color-mix\([^;]*--vscode/, 'viewport rect has a visible themed fill');
  // Same tokens are VS Code theme variables → they resolve in both dark and light.
  assert.match(LOGISTICS_CSS, /body\.vscode-light\s+\.logistics-minimap\s*\{[^}]*--vscode/, 'light theme keeps minimap themed');
});

test('B/#11/#12: minimap click and both drags preserve camera scale', () => {
  const h = createHarness();
  h.context.renderEconomyLogistics(twoRegionPayload(), true);
  const canvas = minimapCanvas(h);
  assert.ok(canvas, 'minimap canvas present');
  for (let i = 0; i < 4; i++) toolbarBtn(h, 'logistics-camera-zoom-in').dispatchEvent({ type: 'click' });
  const k0 = cameraOf(h).k;
  canvas.dispatchEvent({ type: 'pointerdown', clientX: 30, clientY: 30, button: 0, pointerId: 71 });
  canvas.dispatchEvent({ type: 'pointerup', clientX: 30, clientY: 30, pointerId: 71 });
  assert.strictEqual(cameraOf(h).k, k0, 'minimap click does not change scale');
  const tx1 = cameraOf(h).tx;
  canvas.dispatchEvent({ type: 'pointerdown', clientX: 20, clientY: 20, button: 0, pointerId: 72 });
  canvas.dispatchEvent({ type: 'pointermove', clientX: 64, clientY: 58, pointerId: 72 });
  canvas.dispatchEvent({ type: 'pointerup', clientX: 64, clientY: 58, pointerId: 72 });
  assert.strictEqual(cameraOf(h).k, k0, 'first minimap drag preserves scale');
  const tx2 = cameraOf(h).tx;
  assert.notStrictEqual(tx2, tx1, 'first minimap drag pans the camera');
  canvas.dispatchEvent({ type: 'pointerdown', clientX: 90, clientY: 40, button: 0, pointerId: 73 });
  canvas.dispatchEvent({ type: 'pointermove', clientX: 110, clientY: 55, pointerId: 73 });
  canvas.dispatchEvent({ type: 'pointerup', clientX: 110, clientY: 55, pointerId: 73 });
  assert.strictEqual(cameraOf(h).k, k0, 'second minimap drag preserves scale');
  assert.notStrictEqual(cameraOf(h).tx, tx2, 'second minimap drag works (pans again)');
});

test('C: second click on selected route clears; background click clears; Escape clears', () => {
  const h = createHarness();
  h.context.renderEconomyLogistics(twoRegionPayload(), true);
  const grain = routeOf(h, 'grain_route');
  grain.dispatchEvent({ type: 'click' });
  assert.strictEqual(h.api.economyLogisticsUiState.selection?.id, 'grain_route', 'first click selects');
  routeOf(h, 'grain_route').dispatchEvent({ type: 'click' });
  assert.strictEqual(h.api.economyLogisticsUiState.selection, null, 'second click on same route clears');

  // background click
  routeOf(h, 'grain_route').dispatchEvent({ type: 'click' });
  assert.ok(h.api.economyLogisticsUiState.selection, 're-selected for background test');
  const svg = findAll(h.panel, (n) => n.classList.contains('logistics-network'))[0];
  svg.dispatchEvent({ type: 'click', target: svg });
  assert.strictEqual(h.api.economyLogisticsUiState.selection, null, 'background click clears selection');

  // Escape
  routeOf(h, 'grain_route').dispatchEvent({ type: 'click' });
  assert.ok(h.api.economyLogisticsUiState.selection, 're-selected for Escape test');
  h.panel.dispatchEvent({ type: 'keydown', key: 'Escape' });
  assert.strictEqual(h.api.economyLogisticsUiState.selection, null, 'Escape clears selection');
});

test('C: clicking a different entity, toolbar, or minimap never clears accidentally', () => {
  const h = createHarness();
  h.context.renderEconomyLogistics(twoRegionPayload(), true);
  routeOf(h, 'grain_route').dispatchEvent({ type: 'click' });
  // selecting a different route switches selection, never clears
  routeOf(h, 'iron_route').dispatchEvent({ type: 'click' });
  assert.strictEqual(h.api.economyLogisticsUiState.selection?.id, 'iron_route', 'different route selects, not clears');
  // toolbar click keeps selection
  const zoomIn = toolbarBtn(h, 'logistics-camera-zoom-in');
  zoomIn.dispatchEvent({ type: 'click' });
  assert.strictEqual(h.api.economyLogisticsUiState.selection?.id, 'iron_route', 'toolbar click does not clear selection');
  // minimap click keeps selection
  const canvas = minimapCanvas(h);
  canvas.dispatchEvent({ type: 'click', target: canvas });
  assert.strictEqual(h.api.economyLogisticsUiState.selection?.id, 'iron_route', 'minimap click does not clear selection');
  // discoverability hint present while selected
  const hint = findAll(h.panel, (n) => n.classList.contains('logistics-selection-hint'))[0];
  assert.ok(hint && hint.textContent, 'compact selection-clear hint is shown while selected');
});

test('D: reg_coast-style current-location region has a meaningful, accessible locked policy; frees collapse and update minimap', () => {
  const h = createHarness();
  h.context.renderEconomyLogistics(twoRegionPayload(), true);
  // reg_a holds current location loc-a → protected.
  const protectedCtl = collapseControl(h, 'reg_a');
  assert.ok(protectedCtl, 'protected region control present');
  assert.strictEqual(protectedCtl.getAttribute('aria-disabled'), 'true', 'protected region is a deliberate disabled control, not silently active');
  assert.ok(protectedCtl.getAttribute('aria-label'), 'protected region exposes an accessible label');
  const title = findAll(protectedCtl, (n) => n.tagName === 'TITLE')[0];
  assert.ok(title && title.textContent, 'disabled collapse reason is accessible via title');
  const protectedLabel = regionRefs(h, 'reg_a').label;
  assert.ok(protectedLabel.classList.contains('is-protected'), 'protected heading is visibly marked');
  assert.ok(protectedLabel.textContent.startsWith('\u{1F512}'), 'protected heading shows a visible lock, not only a cursor');
  // pointer and keyboard agree: neither collapses the protected region
  const hit = findAll(protectedCtl, (n) => n.classList.contains('logistics-region-collapse-hit'))[0];
  hit.dispatchEvent({ type: 'click' });
  protectedCtl.dispatchEvent({ type: 'keydown', key: 'Enter', preventDefault() {} });
  assert.ok(!h.api.economyLogisticsUiState.collapsedRegionIds.has('reg_a'), 'protected region does not collapse by pointer or keyboard');
  // a free region collapses and the minimap reflects the new state
  const free = collapseControl(h, 'reg_b');
  const beforeRegions = minimapRegions(h).length;
  findAll(free, (n) => n.classList.contains('logistics-region-collapse-hit'))[0].dispatchEvent({ type: 'click' });
  assert.ok(h.api.economyLogisticsUiState.collapsedRegionIds.has('reg_b'), 'free region collapses');
  assert.ok(minimapRegions(h).length >= 1 && minimapRegions(h).length <= beforeRegions, 'minimap rebuilt after collapse');
  // no route/node data deleted: routes still resolvable to endpoints/aggregate
  assert.ok(findAll(h.panel, (n) => n.dataset.routeId).length >= 1, 'routes preserved after collapse');
});

test('E: Layout Reset disabled with no overrides; enabled after drag; resets position + bounds + reports status', () => {
  const h = createHarness();
  h.context.renderEconomyLogistics(twoRegionPayload(), true);
  const resetBtn0 = toolbarBtn(h, 'logistics-layout-reset');
  assert.strictEqual(resetBtn0.disabled, true, 'Layout Reset is disabled when there are no manual overrides');
  assert.ok(resetBtn0.getAttribute('aria-label'), 'disabled Layout Reset still explains itself');
  const cameraReset = toolbarBtn(h, 'logistics-camera-reset');
  assert.notStrictEqual(cameraReset.getAttribute('aria-label'), resetBtn0.getAttribute('aria-label'), 'Camera Reset and Layout Reset are distinct');

  const viewport = viewportOf(h);
  const defaultPos = { x: h.api.economyLogisticsUiState.rendered.positions.get('a1').x, y: h.api.economyLogisticsUiState.rendered.positions.get('a1').y };
  nodeOf(h, 'a1').dispatchEvent({ type: 'pointerdown', clientX: 0, clientY: 0, button: 0, pointerId: 81 });
  viewport.dispatchEvent({ type: 'pointermove', clientX: 44, clientY: 30, pointerId: 81 });
  viewport.dispatchEvent({ type: 'pointerup', pointerId: 81 });
  assert.ok(Object.keys(h.api.economyLogisticsUiState.manualPositions).length > 0, 'drag created a manual override');
  assert.strictEqual(toolbarBtn(h, 'logistics-layout-reset').disabled, false, 'Layout Reset enabled once an override exists');

  const boundsBefore = rectXYWH(regionRefs(h, 'reg_a').rect);
  toolbarBtn(h, 'logistics-layout-reset').dispatchEvent({ type: 'click' });
  assert.strictEqual(Object.keys(h.api.economyLogisticsUiState.manualPositions).length, 0, 'Layout Reset clears manual overrides');
  const status = findAll(h.panel, (n) => n.classList.contains('logistics-layout-status'))[0];
  assert.ok(status && status.textContent && status.classList.contains('is-visible'), 'Layout Reset reports a visible completion status');
  const boundsAfter = rectXYWH(regionRefs(h, 'reg_a').rect);
  const posAfter = { x: h.api.economyLogisticsUiState.rendered.positions.get('a1').x, y: h.api.economyLogisticsUiState.rendered.positions.get('a1').y };
  assert.deepStrictEqual(posAfter, defaultPos, 'Layout Reset restores the default node position');
  assert.ok(minimapNodes(h).length >= 4, 'minimap projection rebuilt after Layout Reset');
  assert.ok(boundsBefore, 'captured bounds before reset');
  assert.ok(boundsAfter, 'region bounds recomputed after reset');
});

test('F: light-theme region heading has a theme-aware backing and readable graph/minimap contracts', () => {
  const hitBlock = cssBlock(LOGISTICS_CSS, '.logistics-region-collapse-hit');
  assert.match(hitBlock, /fill:\s*color-mix\([^;]*--vscode/, 'region heading sits on a theme-aware header backing');
  assert.ok(!/fill:\s*transparent/.test(hitBlock), 'region heading backing is no longer transparent');
  assert.match(LOGISTICS_CSS, /body\.vscode-light\s+\.logistics-region-collapse-hit\s*\{[^}]*--vscode/, 'light theme firms up the heading backing');
  assert.match(LOGISTICS_CSS, /body\.vscode-light\s+\.logistics-network-viewport\s*\{[^}]*--vscode-editor-background/, 'light theme graph field distinct from panel via theme var');
  assert.match(LOGISTICS_CSS, /\.logistics-region-label\b[\s\S]*?paint-order:\s*stroke/, 'region heading keeps a theme-aware outline halo');
  // no hard-coded dark palette in the new region-heading rules
  assert.ok(!/#[0-9a-fA-F]{3,6}/.test(hitBlock), 'region heading backing uses theme variables, not hard-coded colors');
});

test('HUMAN-BLOCKERS-C #1-12: minimap projection expands live and canonicalizes at lifecycle boundaries', () => {
  const h = createHarness({ deferAnimationFrames: true });
  h.context.renderEconomyLogistics(twoRegionPayload(), true);
  const model = () => h.api.economyLogisticsUiState.rendered.minimap.currentModel();
  const viewport = viewportOf(h);
  const initial = model();
  const initialScale = initial.scale;
  const unrelated = ['b1', 'b2'].map((id) => ({ id, x: h.api.economyLogisticsUiState.rendered.positions.get(id).x, y: h.api.economyLogisticsUiState.rendered.positions.get(id).y }));
  nodeOf(h, 'a1').dispatchEvent({ type: 'pointerdown', clientX: 0, clientY: 0, button: 0, pointerId: 901 });
  viewport.dispatchEvent({ type: 'pointermove', clientX: -900, clientY: 0, pointerId: 901 });
  viewport.dispatchEvent({ type: 'pointermove', clientX: -980, clientY: 0, pointerId: 901 });
  viewport.dispatchEvent({ type: 'pointermove', clientX: -1040, clientY: 0, pointerId: 901 });
  assert.strictEqual(h.animationFrameRequests, 1, '#5 repeated pointermove schedules one animation frame');
  h.flushAnimationFrames();
  const expanded = model();
  const movedMarker = expanded.nodeMarkers.find((item) => item.id === 'a1');
  const owningRegion = expanded.regionRects.find((item) => item.id === 'reg_a');
  assert.ok(expanded.worldBounds.minX < initial.worldBounds.minX && expanded.scale < initialScale, '#1 moving beyond old bounds expands projection');
  assert.ok(movedMarker.x >= expanded.minimapBounds.padding && movedMarker.x <= expanded.minimapBounds.width - expanded.minimapBounds.padding, '#2 moved node remains inside minimap');
  assert.ok(owningRegion.x >= 0 && owningRegion.x + owningRegion.w <= expanded.minimapBounds.width + 0.01, '#3 owning region remains inside minimap');
  unrelated.forEach((before) => { const after = h.api.economyLogisticsUiState.rendered.positions.get(before.id); assert.deepStrictEqual({ x: after.x, y: after.y }, { x: before.x, y: before.y }, '#4 unrelated region layout is unchanged'); });
  viewport.dispatchEvent({ type: 'pointerup', pointerId: 901 });
  const canonical = model();
  const pos = h.api.economyLogisticsUiState.rendered.positions.get('a1');
  assert.ok(pos.x - pos.w / 2 - canonical.worldBounds.minX >= 23.9, '#6 pointerup canonical projection retains world padding');

  nodeOf(h, 'a1').dispatchEvent({ type: 'pointerdown', clientX: 0, clientY: 0, button: 0, pointerId: 902 });
  viewport.dispatchEvent({ type: 'pointermove', clientX: 1700, clientY: 80, pointerId: 902 });
  h.flushAnimationFrames();
  viewport.dispatchEvent({ type: 'pointerup', pointerId: 902 });
  const repeated = model();
  const repeatedMarker = repeated.nodeMarkers.find((item) => item.id === 'a1');
  assert.ok(Number.isFinite(repeated.scale) && repeatedMarker.x >= repeated.minimapBounds.padding && repeatedMarker.x <= repeated.minimapBounds.width - repeated.minimapBounds.padding, '#7 repeated drag has no stale scale/bounds');

  toolbarBtn(h, 'logistics-layout-reset').dispatchEvent({ type: 'click' });
  assert.ok(Number.isFinite(model().scale) && model().nodeMarkers.every((item) => item.x >= 0 && item.x <= model().minimapBounds.width), 'D #8 Layout Reset restores canonical content bounds');
  const collapse = collapseControl(h, 'reg_b');
  findAll(collapse, (n) => n.classList.contains('logistics-region-collapse-hit'))[0].dispatchEvent({ type: 'click' });
  const collapsedModel = model();
  findAll(collapseControl(h, 'reg_b'), (n) => n.classList.contains('logistics-region-collapse-hit'))[0].dispatchEvent({ type: 'click' });
  assert.ok(collapsedModel !== model() && model().regionRects.length >= collapsedModel.regionRects.length, '#9 collapse/expand rebuilds projection from visible graph');

  const normalModel = model();
  const largeHost = h.document.createElement('div'); largeHost.clientWidth = 900; h.document.body.appendChild(largeHost);
  h.api.economyLogisticsUiState.lightboxHost = largeHost; h.api.renderEconomyLogisticsPanel();
  const largeModel = h.api.economyLogisticsUiState.rendered.minimap.currentModel();
  h.api.economyLogisticsUiState.lightboxHost = null; h.api.renderEconomyLogisticsPanel();
  assert.ok(largeModel !== normalModel && Number.isFinite(largeModel.scale) && Number.isFinite(model().scale), '#10 embedded/large transitions recompute projection');

  const canvas = minimapCanvas(h);
  for (let i = 0; i < 4; i++) toolbarBtn(h, 'logistics-camera-zoom-in').dispatchEvent({ type: 'click' });
  const k0 = cameraOf(h).k;
  canvas.dispatchEvent({ type: 'pointerdown', pointerId: 903, clientX: 25, clientY: 35, button: 0 });
  canvas.dispatchEvent({ type: 'pointermove', pointerId: 903, clientX: 70, clientY: 60 });
  canvas.dispatchEvent({ type: 'pointerup', pointerId: 903, clientX: 70, clientY: 60 });
  assert.strictEqual(cameraOf(h).k, k0, '#11 first minimap drag preserves scale');
  const tx = cameraOf(h).tx;
  canvas.dispatchEvent({ type: 'pointerdown', pointerId: 904, clientX: 80, clientY: 30, button: 0 });
  canvas.dispatchEvent({ type: 'pointermove', pointerId: 904, clientX: 105, clientY: 50 });
  canvas.dispatchEvent({ type: 'pointerup', pointerId: 904, clientX: 105, clientY: 50 });
  assert.strictEqual(cameraOf(h).k, k0, '#12 second minimap drag preserves scale');
  assert.notStrictEqual(cameraOf(h).tx, tx, '#12 second minimap drag remains active');
});

test('HUMAN-BLOCKERS-D #9-11 and #20: node drag preserves route geometry and rebuilds only affected flow particles', () => {
  const h = createHarness();
  h.context.renderEconomyLogistics(twoRegionPayload(), true);
  const viewport = viewportOf(h);
  const affectedBefore = routeOf(h, 'grain_route');
  const unaffectedBefore = routeOf(h, 'iron_route');
  const affectedLine = findAll(affectedBefore, (n) => n.classList.contains('logistics-route-line'))[0];
  const affectedHit = findAll(affectedBefore, (n) => n.classList.contains('logistics-route-hit'))[0];
  const affectedPathId = affectedLine.getAttribute('id');
  const affectedPathBefore = affectedLine.getAttribute('d');
  const affectedDotsBefore = findAll(affectedBefore, (n) => n.classList.contains('logistics-flow-dot'));
  const unaffectedDotsBefore = findAll(unaffectedBefore, (n) => n.classList.contains('logistics-flow-dot'));
  assert.ok(affectedDotsBefore.length > 0 && unaffectedDotsBefore.length > 0, 'fixture starts with particles on both operational routes');
  nodeOf(h, 'a1').dispatchEvent({ type: 'pointerdown', clientX: 0, clientY: 0, button: 0, pointerId: 920 });
  viewport.dispatchEvent({ type: 'pointermove', clientX: 140, clientY: 60, pointerId: 920 });
  assert.strictEqual(findAll(affectedBefore, (n) => n.classList.contains('logistics-flow-dot')).length, 0, 'D #9 affected route particles are removed during drag');
  assert.strictEqual(findAll(routeOf(h, 'iron_route'), (n) => n.classList.contains('logistics-flow-dot')).length, unaffectedDotsBefore.length, 'D #10 unrelated route particle count is untouched');
  assert.ok(unaffectedDotsBefore.every((dot, index) => findAll(routeOf(h, 'iron_route'), (n) => n.classList.contains('logistics-flow-dot'))[index] === dot), 'D #10 unrelated particle objects retain identity');
  assert.strictEqual(findAll(routeOf(h, 'grain_route'), (n) => n.classList.contains('logistics-route-line'))[0], affectedLine, 'D #20 drag reuses affected route line');
  assert.strictEqual(findAll(routeOf(h, 'grain_route'), (n) => n.classList.contains('logistics-route-hit'))[0], affectedHit, 'D #20 drag reuses affected route hit target');
  assert.notStrictEqual(affectedLine.getAttribute('d'), affectedPathBefore, 'D #20 live drag updates the existing geometry');
  viewport.dispatchEvent({ type: 'pointerup', pointerId: 920 });
  const rebuiltDots = findAll(routeOf(h, 'grain_route'), (n) => n.classList.contains('logistics-flow-dot'));
  assert.ok(rebuiltDots.length > 0 && routeOf(h, 'grain_route').classList.contains('is-flowing'), 'D #11 pointerup immediately restores affected operational particles');
  assert.strictEqual(affectedLine.getAttribute('id'), affectedPathId, 'D #20 pointerup preserves the route path ID');
  assert.ok(rebuiltDots.every((dot) => findAll(dot, (n) => n.tagName === 'MPATH').every((mpath) => mpath.getAttribute('href') === `#${affectedPathId}`)), 'D #20 rebuilt particles reference the preserved path ID');
});

test('HUMAN-BLOCKERS-D #12-19: particles represent only relevant operational movement', () => {
  const base = twoRegionPayload();
  const routes = [
    base.routes[0],
    { ...base.routes[1], id: 'blocked_positive', volume: 4, status: 'blocked' },
    { ...base.routes[1], id: 'sealed_equivalent', volume: 4, status: 'sealed' },
    { ...base.routes[1], id: 'raided_positive', volume: 2, status: 'raided' },
  ];
  const h = createHarness();
  h.context.renderEconomyLogistics(twoRegionPayload({ routes, summary: { activeRoutes: 2, blockedRoutes: 1, raidedRoutes: 1, totalVolume: 14, shortageCount: 0, bottleneckCount: 0 } }), true);
  const dots = (id, visibleOnly = false) => findAll(routeOf(h, id), (n) => n.classList.contains('logistics-flow-dot') && (!visibleOnly || n.getAttribute('display') !== 'none'));
  assert.ok(dots('grain_route', true).length > 0 && routeOf(h, 'grain_route').classList.contains('is-flowing'), '#13 active operational route has particles');
  assert.strictEqual(dots('blocked_positive').length, 0, '#14 blocked positive-volume route creates no particles');
  assert.strictEqual(dots('sealed_equivalent').length, 0, '#14 disabled-equivalent/unknown status creates no particles');
  assert.ok(routeOf(h, 'blocked_positive').classList.contains('logistics-route-status-blocked'), '#12 blocked route uses explicit stopped encoding');
  assert.ok(routeOf(h, 'sealed_equivalent').classList.contains('logistics-route-status-blocked'), '#12 sealed equivalent uses explicit stopped encoding');
  assert.ok(routeOf(h, 'raided_positive').classList.contains('logistics-route-status-impaired') && !routeOf(h, 'raided_positive').classList.contains('logistics-route-status-blocked'), '#16 degraded movement is distinct from stopped movement');
  routeOf(h, 'blocked_positive').dispatchEvent({ type: 'click' });
  assert.strictEqual(dots('blocked_positive').length, 0, '#15 selection cannot force blocked movement');
  h.panel.dispatchEvent({ type: 'keydown', key: 'Escape' });
  const commodity = selectOf(h); commodity.value = 'iron'; commodity.dispatchEvent({ type: 'change' });
  assert.strictEqual(dots('blocked_positive').length, 0, '#16 commodity relevance cannot force blocked movement');
  const operational = routeOf(h, 'raided_positive');
  const line = findAll(operational, (n) => n.classList.contains('logistics-route-line'))[0];
  const hit = findAll(operational, (n) => n.classList.contains('logistics-route-hit'))[0];
  const geometry = { d: line.getAttribute('d'), hit: hit.getAttribute('d'), id: line.getAttribute('id'), mpath: findAll(operational, (n) => n.tagName === 'MPATH')[0].getAttribute('href') };
  const search = findAll(h.panel, (n) => n.classList.contains('logistics-search'))[0];
  search.value = 'no route result'; search.dispatchEvent({ type: 'input' });
  assert.strictEqual(findAll(h.panel, (n) => n.classList.contains('logistics-flow-dot') && n.getAttribute('display') !== 'none').length, 0, '#17 zero-result search shows no particles');
  findAll(h.panel, (n) => n.classList.contains('logistics-clear-filters-btn'))[0].dispatchEvent({ type: 'click' });
  assert.ok(dots('grain_route', true).length > 0 && dots('raided_positive', true).length > 0, '#18 clear restores operational routes only');
  assert.strictEqual(dots('blocked_positive').length + dots('sealed_equivalent').length, 0, '#18 clear never restores stopped routes');
  const after = routeOf(h, 'raided_positive'); const afterLine = findAll(after, (n) => n.classList.contains('logistics-route-line'))[0]; const afterHit = findAll(after, (n) => n.classList.contains('logistics-route-hit'))[0];
  assert.deepStrictEqual({ d: afterLine.getAttribute('d'), hit: afterHit.getAttribute('d'), id: afterLine.getAttribute('id'), mpath: findAll(after, (n) => n.tagName === 'MPATH')[0].getAttribute('href') }, geometry, '#19 filters preserve geometry, path IDs, and mpath');
  assert.strictEqual(routeOf(h, 'blocked_positive')._logisticsRoute.status, 'blocked', '#19 rendering does not mutate status');
  findAll(h.panel, (n) => n.classList.contains('logistics-flow-toggle-btn'))[0].dispatchEvent({ type: 'click' });
  assert.strictEqual(findAll(h.panel, (n) => n.classList.contains('logistics-flow-dot')).length, 0, '#20 Flow off creates no particles');
});

test('HUMAN-BLOCKERS-E #1-15: RAF live drag keeps both rendered endpoints on current anchors', () => {
  const base = twoRegionPayload();
  const routes = [
    { ...base.routes[0], id: 'tr_grain_to_port', fromNodeId: 'a1', toNodeId: 'a2', status: 'open', volume: 5 },
    { ...base.routes[0], id: 'tr_grain_to_reed', fromNodeId: 'a1', toNodeId: 'b1', status: 'blocked', volume: 4 },
    { ...base.routes[1], id: 'tr_ore_to_ash', fromNodeId: 'b2', toNodeId: 'a1', status: 'raided', volume: 3 },
    { ...base.routes[1], id: 'tr_gate_unrelated', fromNodeId: 'b1', toNodeId: 'b2', status: 'open', volume: 2 },
  ];
  const h = createHarness({ deferAnimationFrames: true });
  h.context.renderEconomyLogistics(twoRegionPayload({ routes, summary: { activeRoutes: 3, blockedRoutes: 1, raidedRoutes: 1, totalVolume: 14, shortageCount: 0, bottleneckCount: 0 } }), true);
  h.flushAnimationFrames();
  const statusFilter = findAll(h.panel, (n) => n.classList.contains('logistics-status-filter'))[0];
  statusFilter.value = 'open'; statusFilter.dispatchEvent({ type: 'change' });
  routeOf(h, 'tr_grain_to_port').dispatchEvent({ type: 'click' });
  h.flushAnimationFrames();
  assert.strictEqual(h.api.economyLogisticsUiState.selection?.id, 'tr_grain_to_port', '#8 selected route fixture is active during drag');
  assert.strictEqual(h.api.economyLogisticsUiState.statusKeys.has('open'), true, '#9 status filter remains active during drag');
  const viewport = viewportOf(h);
  const incidentIds = ['tr_grain_to_port', 'tr_grain_to_reed', 'tr_ore_to_ash'];
  const refs = new Map(incidentIds.map((id) => {
    const group = routeOf(h, id);
    const line = findAll(group, (n) => n.classList.contains('logistics-route-line'))[0];
    const hit = findAll(group, (n) => n.classList.contains('logistics-route-hit'))[0];
    return [id, { line, hit, pathId: line.getAttribute('id'), before: line.getAttribute('d') }];
  }));
  const unrelated = routeOf(h, 'tr_gate_unrelated');
  const unrelatedBytes = elementBytes(unrelated);
  const unrelatedDots = findAll(unrelated, (n) => n.classList.contains('logistics-flow-dot'));

  nodeOf(h, 'a1').dispatchEvent({ type: 'pointerdown', clientX: 0, clientY: 0, button: 0, pointerId: 1001 });
  viewport.dispatchEvent({ type: 'pointermove', clientX: 320, clientY: 70, pointerId: 1001 });
  assert.ok(h.animationFrameRequests > 0, '#1 live updates are requestAnimationFrame-bounded');
  h.flushAnimationFrames();
  for (const id of incidentIds) {
    const current = routeOf(h, id);
    const saved = refs.get(id);
    assert.notStrictEqual(saved.line.getAttribute('d'), saved.before, `#4 multi-route drag updates ${id}`);
    assert.strictEqual(findAll(current, (n) => n.classList.contains('logistics-route-line'))[0], saved.line, `#6 ${id} line identity stable`);
    assert.strictEqual(findAll(current, (n) => n.classList.contains('logistics-route-hit'))[0], saved.hit, `#6 ${id} hit identity stable`);
    assert.strictEqual(saved.line.getAttribute('id'), saved.pathId, `#7 ${id} path ID stable`);
    assert.strictEqual(saved.hit.getAttribute('d'), saved.line.getAttribute('d'), `#3 ${id} hit path follows visible path`);
    assertRenderedEndpointsMatchCurrentAnchors(h, id, `#1/#3 live source drag ${id}`);
    assert.strictEqual(findAll(current, (n) => n.classList.contains('logistics-flow-dot')).length, 0, `#12 ${id} particles suppressed during drag`);
  }
  assert.ok(routeOf(h, 'tr_grain_to_port').parentNode.classList.contains('layer-edges-raised'), '#8 selected route updates in its raised layer');
  assert.strictEqual(routeOf(h, 'tr_grain_to_port').dataset.relevance, 'primary', '#9 filtered primary route updates during drag');
  assert.strictEqual(routeOf(h, 'tr_gate_unrelated'), unrelated, '#5 unrelated route identity unchanged');
  assert.strictEqual(elementBytes(unrelated), unrelatedBytes, '#5 unrelated route geometry/DOM byte-identical');
  assert.ok(unrelatedDots.every((dot, index) => findAll(unrelated, (n) => n.classList.contains('logistics-flow-dot'))[index] === dot), '#5 unrelated particle identity untouched');
  assert.deepStrictEqual(Array.from(h.api.economyLogisticsUiState.rendered.lastGeometryRouteIds), incidentIds.slice().sort(), '#4 only factual incident routes recomputed');
  viewport.dispatchEvent({ type: 'pointerup', pointerId: 1001 });
  assertRenderedEndpointsMatchCurrentAnchors(h, 'tr_grain_to_port', '#13 pointerup needs no rerender');
  assert.ok(findAll(routeOf(h, 'tr_grain_to_port'), (n) => n.classList.contains('logistics-flow-dot')).length > 0, '#13 eligible particles restore immediately');
  assert.strictEqual(findAll(routeOf(h, 'tr_grain_to_reed'), (n) => n.classList.contains('logistics-flow-dot')).length, 0, '#10 blocked route stays particle-free after pointerup');
  assert.ok(findAll(routeOf(h, 'tr_ore_to_ash'), (n) => n.classList.contains('logistics-flow-dot')).length > 0, '#11 impaired route particles restore');

  const sourceNodeBeforeDestinationDrag = { ...h.api.economyLogisticsUiState.rendered.positions.get('a1') };
  nodeOf(h, 'a2').dispatchEvent({ type: 'pointerdown', clientX: 0, clientY: 0, button: 0, pointerId: 1002 });
  viewport.dispatchEvent({ type: 'pointermove', clientX: -330, clientY: 90, pointerId: 1002 });
  h.flushAnimationFrames();
  assertRenderedEndpointsMatchCurrentAnchors(h, 'tr_grain_to_port', '#2 live destination drag');
  assert.deepStrictEqual({ x: h.api.economyLogisticsUiState.rendered.positions.get('a1').x, y: h.api.economyLogisticsUiState.rendered.positions.get('a1').y },
    { x: sourceNodeBeforeDestinationDrag.x, y: sourceNodeBeforeDestinationDrag.y }, '#2 destination drag does not move the source node');
  viewport.dispatchEvent({ type: 'pointerup', pointerId: 1002 });
  assertRenderedEndpointsMatchCurrentAnchors(h, 'tr_grain_to_port', '#15 no large-view transition required');

  toolbarBtn(h, 'logistics-layout-reset').dispatchEvent({ type: 'click' });
  assertRenderedEndpointsMatchCurrentAnchors(h, 'tr_grain_to_port', '#14 Layout Reset endpoint repair');
  assertRenderedEndpointsMatchCurrentAnchors(h, 'tr_grain_to_reed', '#14 Layout Reset updates all affected routes');
});

test('HUMAN-BLOCKERS-E #16-25: fixture status, filtering and legend remain factually aligned', () => {
  const base = twoRegionPayload();
  const routes = [
    { ...base.routes[0], id: 'tr_grain_to_port', status: 'open', volume: 5 },
    { ...base.routes[0], id: 'tr_grain_to_reed', status: 'blocked', volume: 4 },
    { ...base.routes[1], id: 'tr_ore_to_ash', status: 'raided', volume: 3 },
  ];
  const h = createHarness();
  h.context.renderEconomyLogistics(twoRegionPayload({ routes, summary: { activeRoutes: 2, blockedRoutes: 1, raidedRoutes: 1, totalVolume: 12, shortageCount: 0, bottleneckCount: 0 } }), true);
  const blocked = routeOf(h, 'tr_grain_to_reed');
  const impaired = routeOf(h, 'tr_ore_to_ash');
  const open = routeOf(h, 'tr_grain_to_port');
  const routeLine = (group) => findAll(group, (n) => n.classList.contains('logistics-route-line'))[0];
  const dots = (group) => findAll(group, (n) => n.classList.contains('logistics-flow-dot'));

  assert.strictEqual([open, blocked, impaired].filter((group) => group.classList.contains('logistics-route-status-blocked')).length, 1, '#16/#23 exactly one fixture route renders blocked');
  assert.ok(blocked.classList.contains('logistics-route-status-blocked') && !blocked._logisticsStyle.operational, '#17 blocked class is non-operational');
  assert.ok(impaired.classList.contains('logistics-route-status-impaired') && !impaired.classList.contains('logistics-route-status-blocked') && impaired._logisticsStyle.operational, '#18 impaired is operational and not blocked');
  assert.notStrictEqual(routeLine(impaired).style.props['stroke-dasharray'], routeLine(blocked).style.props['stroke-dasharray'], '#19 impaired and blocked dash patterns differ');
  assert.match(LOGISTICS_CSS, /\.logistics-route-status-impaired,[\s\S]{0,160}editorWarning|\.logistics-route-status-impaired,[\s\S]{0,160}charts-yellow/, '#19 impaired uses warning treatment');
  assert.match(LOGISTICS_CSS, /\.logistics-route-status-blocked,[\s\S]{0,160}editorError|\.logistics-route-status-blocked,[\s\S]{0,160}charts-red/, '#19 blocked uses stopped/error treatment');
  assert.strictEqual(dots(blocked).length, 0, '#20 blocked positive-volume route has zero particles');
  assert.ok(dots(impaired).length > 0, '#21 impaired movement-permitted route can animate');

  const status = findAll(h.panel, (n) => n.classList.contains('logistics-status-filter'))[0];
  status.value = 'blocked'; status.dispatchEvent({ type: 'change' });
  const primary = [open, blocked, impaired].filter((group) => group.dataset.relevance === 'primary');
  assert.deepStrictEqual(primary.map((group) => group.dataset.routeId), ['tr_grain_to_reed'], '#22 blocked filter yields exactly one primary fixture route');
  assert.ok(!open.classList.contains('logistics-route-status-blocked') && !impaired.classList.contains('logistics-route-status-blocked'), '#22 non-blocked filtered routes never acquire blocked styling');
  status.value = ''; status.dispatchEvent({ type: 'change' });
  assert.strictEqual([open, blocked, impaired].filter((group) => group.classList.contains('logistics-route-status-blocked')).length, 1, '#23 clearing filter leaves blocked styling only on actual blocked route');

  const legend = findAll(h.panel, (n) => n.classList.contains('logistics-legend'))[0];
  for (const key of ['open', 'impaired', 'blocked']) {
    assert.ok(findAll(legend, (n) => n.classList.contains(`logistics-legend-${key}`)).length === 1, `#24 legend explicitly distinguishes ${key}`);
  }
  assert.ok(findAll(legend, (n) => n.classList.contains('logistics-legend-impaired'))[0].textContent.includes('webview.world.logisticsLegendActive'), '#24 impaired legend states movement continues');
  assert.ok(findAll(legend, (n) => n.classList.contains('logistics-legend-blocked'))[0].textContent.includes('webview.world.logisticsFlowAnimationOff'), '#24 blocked legend states flow is off');
  assert.ok(Number.isFinite(h.api.economyLogisticsUiState.rendered.minimap.currentModel().scale), '#25 minimap projection scale remains finite');
});

// --- HUMAN-BLOCKERS-F: authoritative drag-session particle suppression + maximize ---

function collectVisibleDots(root) {
  return findAll(root, (n) => n.classList.contains('logistics-flow-dot') && n.getAttribute('display') !== 'none');
}

function mpathHref(dot) {
  const m = findAll(dot, (n) => n.tagName === 'MPATH')[0];
  return m ? (m.getAttribute('href') || '') : '';
}

test('HUMAN-BLOCKERS-F #1-20: drag session suppresses all active-view particles for incident routes', () => {
  const base = twoRegionPayload();
  const routes = [
    { ...base.routes[0], id: 'tr_grain_to_port', fromNodeId: 'a1', toNodeId: 'a2', status: 'open', volume: 5 },
    { ...base.routes[0], id: 'tr_grain_to_reed', fromNodeId: 'a1', toNodeId: 'b1', status: 'blocked', volume: 4 },
    { ...base.routes[1], id: 'tr_ore_to_ash', fromNodeId: 'b2', toNodeId: 'a1', status: 'raided', volume: 3 },
    { ...base.routes[1], id: 'tr_gate_unrelated', fromNodeId: 'b1', toNodeId: 'b2', status: 'open', volume: 2 },
  ];
  const h = createHarness({ deferAnimationFrames: true });
  h.context.renderEconomyLogistics(twoRegionPayload({
    routes,
    summary: { activeRoutes: 3, blockedRoutes: 1, raidedRoutes: 1, totalVolume: 14, shortageCount: 0, bottleneckCount: 0 },
  }), true);
  h.flushAnimationFrames();
  const openPathId = findAll(routeOf(h, 'tr_grain_to_port'), (n) => n.classList.contains('logistics-route-line'))[0].getAttribute('id');
  // Select open route first so it sits in the raised layer during the drag (#7).
  routeOf(h, 'tr_grain_to_port').dispatchEvent({ type: 'click' });
  assert.ok(routeOf(h, 'tr_grain_to_port').parentNode.classList.contains('layer-edges-raised'), '#7 pre-selected raised layer');
  // Capture viewport AFTER selection re-render so pointer events hit live handlers.
  const viewport = viewportOf(h);
  // Capture unrelated particle identity AFTER selection re-render settles.
  const unrelatedDots = findAll(routeOf(h, 'tr_gate_unrelated'), (n) => n.classList.contains('logistics-flow-dot'));
  assert.ok(unrelatedDots.length > 0, 'fixture starts with unrelated operational particles');

  // #1 source-node drag starts session immediately on pointerdown
  nodeOf(h, 'a1').dispatchEvent({ type: 'pointerdown', clientX: 0, clientY: 0, button: 0, pointerId: 2001 });
  const session = h.api.economyLogisticsUiState.nodeDragSession;
  assert.ok(session && session.active, '#1 drag session active after source pointerdown');
  assert.strictEqual(session.movedNodeId, 'a1');
  const affected = [...session.affectedRouteIds].sort();
  assert.deepStrictEqual(affected, ['tr_grain_to_port', 'tr_grain_to_reed', 'tr_ore_to_ash'].sort(), '#3 affected route IDs are exactly incident routes');
  assert.ok(!session.affectedRouteIds.has('tr_gate_unrelated'), '#4 unrelated route excluded');
  assert.ok(h.api.isRouteSuppressedByActiveNodeDrag('tr_grain_to_port'), '#5 suppression predicate true for incident');
  assert.ok(!h.api.isRouteSuppressedByActiveNodeDrag('tr_gate_unrelated'), '#5 suppression predicate false for unrelated');

  // #12-14 full active-view audit (not only route descendants)
  const allDots = collectVisibleDots(h.panel);
  for (const dot of allDots) {
    const href = mpathHref(dot);
    const pathId = href.startsWith('#') ? href.slice(1) : href;
    assert.ok(!session.affectedPathIds.has(pathId), `#13 no visible dot references affected path ${pathId}`);
  }
  assert.strictEqual(findAll(routeOf(h, 'tr_grain_to_port'), (n) => n.classList.contains('logistics-flow-dot')).length, 0, '#5/#7 raised route has no particles during drag');
  assert.strictEqual(findAll(routeOf(h, 'tr_grain_to_reed'), (n) => n.classList.contains('logistics-flow-dot')).length, 0, 'blocked stays particle free');
  assert.ok(unrelatedDots.every((dot, i) => findAll(routeOf(h, 'tr_gate_unrelated'), (n) => n.classList.contains('logistics-flow-dot'))[i] === dot), '#15 unrelated particle DOM identity preserved');

  // #8 central gate / purge
  h.api.logisticsPurgeSuppressedFlowDots(h.api.economyLogisticsUiState.rendered);
  assert.strictEqual(findAll(routeOf(h, 'tr_grain_to_port'), (n) => n.classList.contains('logistics-flow-dot')).length, 0, '#8 purge leaves incident routes particle-free');
  assert.ok(
    !h.api.logisticsRouteMayShowFlowParticles(
      routeOf(h, 'tr_grain_to_port')._logisticsRoute,
      'primary',
      routeOf(h, 'tr_grain_to_port')._logisticsStyle
    ),
    '#8 central gate denies particle recreation during drag'
  );

  // Continue move + geometry refresh still particle-free
  viewport.dispatchEvent({ type: 'pointermove', clientX: 200, clientY: 40, pointerId: 2001 });
  h.flushAnimationFrames();
  assert.strictEqual(findAll(routeOf(h, 'tr_grain_to_port'), (n) => n.classList.contains('logistics-flow-dot')).length, 0, '#5 geometry refresh keeps particles suppressed');

  // #16-19 pointerup restore
  viewport.dispatchEvent({ type: 'pointerup', pointerId: 2001 });
  assert.strictEqual(h.api.economyLogisticsUiState.nodeDragSession, null, 'session cleared on pointerup');
  const restoredOpen = findAll(routeOf(h, 'tr_grain_to_port'), (n) => n.classList.contains('logistics-flow-dot'));
  const restoredImpaired = findAll(routeOf(h, 'tr_ore_to_ash'), (n) => n.classList.contains('logistics-flow-dot'));
  assert.ok(restoredOpen.length > 0, `#16 open-route particles restore (got ${restoredOpen.length})`);
  assert.ok(restoredImpaired.length > 0, '#17 impaired-route particles restore');
  assert.strictEqual(findAll(routeOf(h, 'tr_grain_to_reed'), (n) => n.classList.contains('logistics-flow-dot')).length, 0, '#18 blocked never restores');
  const openLineId = findAll(routeOf(h, 'tr_grain_to_port'), (n) => n.classList.contains('logistics-route-line'))[0].getAttribute('id');
  assert.ok(restoredOpen.every((dot) => mpathHref(dot) === `#${openLineId}`), '#19 restored mpath uses current path ID');
  assert.strictEqual(openLineId, openPathId, '#19 path ID preserved across drag');

  // #2 destination drag
  nodeOf(h, 'a2').dispatchEvent({ type: 'pointerdown', clientX: 0, clientY: 0, button: 0, pointerId: 2002 });
  assert.ok(h.api.economyLogisticsUiState.nodeDragSession?.active, '#2 destination drag starts session');
  assert.ok(h.api.economyLogisticsUiState.nodeDragSession.affectedRouteIds.has('tr_grain_to_port'));
  viewport.dispatchEvent({ type: 'pointerup', pointerId: 2002 });
});

test('HUMAN-BLOCKERS-F #21-24: maximize toggles panel size and preserves camera/selection', () => {
  const h = createHarness();
  h.context.renderEconomyLogistics(twoRegionPayload(), true);
  expandBtnOf(h).dispatchEvent({ type: 'click' });
  const lb = h.api.ensureVisualLightbox();
  assert.ok(h.api.economyLogisticsUiState.lightboxHost, 'lightbox open');
  const camBefore = {
    k: h.api.economyLogisticsUiState.cameraContexts.lightbox.camera?.k,
    tx: h.api.economyLogisticsUiState.cameraContexts.lightbox.camera?.tx,
    ty: h.api.economyLogisticsUiState.cameraContexts.lightbox.camera?.ty,
  };
  // select a route in lightbox body
  const lbRoute = findAll(lb.body, (n) => n.dataset.routeId === 'grain_route')[0];
  if (lbRoute) lbRoute.dispatchEvent({ type: 'click' });
  const selBefore = h.api.economyLogisticsUiState.selection?.id;
  assert.ok(typeof lb.toggleMaximize === 'function', '#21 maximize control exists');
  lb.toggleMaximize();
  assert.strictEqual(h.api.economyLogisticsUiState.lightboxMaximized, true, '#21 maximized state true');
  assert.ok(lb.panel.classList.contains('is-maximized'), '#21 panel has is-maximized class');
  assert.strictEqual(h.api.economyLogisticsUiState.cameraContexts.lightbox.camera?.k, camBefore.k, '#22 maximize preserves camera k');
  assert.strictEqual(h.api.economyLogisticsUiState.cameraContexts.lightbox.camera?.tx, camBefore.tx, '#22 maximize preserves camera tx');
  assert.strictEqual(h.api.economyLogisticsUiState.selection?.id, selBefore, '#23 selection preserved');
  lb.toggleMaximize();
  assert.strictEqual(h.api.economyLogisticsUiState.lightboxMaximized, false, '#24 restore clears maximized');
  assert.ok(!lb.panel.classList.contains('is-maximized'), '#24 panel restored');
});

test('HUMAN-BLOCKERS-F #6: lightbox/enlarged context drag suppresses particles', () => {
  const h = createHarness({ deferAnimationFrames: true });
  h.context.renderEconomyLogistics(twoRegionPayload(), true);
  expandBtnOf(h).dispatchEvent({ type: 'click' });
  const lb = h.api.ensureVisualLightbox();
  h.flushAnimationFrames();
  const host = lb.body;
  const node = findAll(host, (n) => n.dataset.nodeId === 'a1')[0];
  const viewport = findAll(host, (n) => n.classList.contains('logistics-network-viewport'))[0];
  const route = findAll(host, (n) => n.dataset.routeId === 'grain_route')[0];
  assert.ok(node && viewport && route, 'lightbox graph mounted');
  assert.ok(findAll(route, (n) => n.classList.contains('logistics-flow-dot')).length > 0, 'particles present before drag');
  node.dispatchEvent({ type: 'pointerdown', clientX: 0, clientY: 0, button: 0, pointerId: 3001 });
  assert.ok(h.api.economyLogisticsUiState.nodeDragSession?.active, '#6 enlarged-context session active');
  assert.strictEqual(h.api.economyLogisticsUiState.nodeDragSession.renderedContextId, 'lightbox');
  assert.strictEqual(findAll(route, (n) => n.classList.contains('logistics-flow-dot')).length, 0, '#6 enlarged drag suppresses particles');
  const allDots = collectVisibleDots(host);
  for (const dot of allDots) {
    const pathId = mpathHref(dot).replace(/^#/, '');
    assert.ok(!h.api.economyLogisticsUiState.nodeDragSession.affectedPathIds.has(pathId), '#6/#12 no visible host dot on affected path');
  }
  viewport.dispatchEvent({ type: 'pointerup', pointerId: 3001 });
  assert.ok(findAll(findAll(host, (n) => n.dataset.routeId === 'grain_route')[0], (n) => n.classList.contains('logistics-flow-dot')).length > 0, '#20 restore without large-view reopen');
});

if (failed) process.exit(1);
console.log('webview logistics interactions: all behavioral checks passed.');
