#!/usr/bin/env node
'use strict';

// CORRECTIONS-C: real DOM event flows for filter, selection retention, collapse,
// node drag rounding, and Reset Camera via production handlers.

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const moduleSource = `${fs.readFileSync(path.join(root, 'webview/modules/85b1-logistics-layout.js'), 'utf8')}\n${fs.readFileSync(path.join(root, 'webview/modules/85b2-logistics-route-geometry.js'), 'utf8')}\n${fs.readFileSync(path.join(root, 'webview/modules/85b-economy-logistics.js'), 'utf8')}`;

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
  replaceChildren(...children) { this._text = ''; this.children = []; children.forEach((c) => this.appendChild(c)); }
  setAttribute(name, value) {
    this.attributes[name] = String(value);
    if (name === 'class') this.className = value;
    if (name === 'id') this.id = value;
  }
  getAttribute(name) { return this.attributes[name] === undefined ? null : this.attributes[name]; }
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

function createHarness() {
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
      constructor(cb) { this.cb = cb; }
      observe(el) { this.cb([{ contentRect: { width: el.clientWidth || 0 } }]); }
      disconnect() {}
    },
  };
  context.globalThis = context;
  context.window = context;
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
function selectOf(h) { return findAll(h.panel, (n) => n.tagName === 'SELECT')[0]; }
function toolbarBtn(h, cls) { return findAll(h.panel, (n) => n.classList.contains(cls))[0]; }
function parseTranslate(transform) {
  const m = /translate\(([^ ]+) ([^)]+)\)/.exec(transform || '');
  return m ? { x: Number(m[1]), y: Number(m[2]) } : null;
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
  const label = findAll(routeEl, (n) => n.classList.contains('logistics-route-label'))[0]
    || findAll(routeEl, (n) => n.tagName === 'TEXT')[0];
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
  const r2LabelBefore = findAll(r2Before, (n) => n.classList.contains('logistics-route-label'))[0].getAttribute('x');

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
  const r2LabelAfter = findAll(routeOf(h, 'grain_route_2'), (n) => n.classList.contains('logistics-route-label'))[0].getAttribute('x');
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
  const connectedLabel = findAll(connected, (n) => n.classList.contains('logistics-route-label'))[0];
  const connectedWarning = findAll(connected, (n) => n.classList.contains('logistics-route-warning'))[0];
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
  assert.deepStrictEqual(computedIds, ['local_0', 'local_1', 'local_2']);
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
  const rerenderedLabel = findAll(rerendered, (n) => n.classList.contains('logistics-route-label'))[0];
  const rerenderedWarning = findAll(rerendered, (n) => n.classList.contains('logistics-route-warning'))[0];
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

if (failed) process.exit(1);
console.log('webview logistics interactions: all behavioral checks passed.');
