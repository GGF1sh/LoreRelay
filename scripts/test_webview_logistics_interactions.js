#!/usr/bin/env node
'use strict';

// CORRECTIONS-B: exercise production relevance, collapse, persistence and
// rounded-route helpers. The VM export exists only in this evaluated string.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const root = path.join(__dirname, '..');
const source = `${fs.readFileSync(path.join(root, 'webview/modules/85b1-logistics-layout.js'), 'utf8')}\n${fs.readFileSync(path.join(root, 'webview/modules/85b-economy-logistics.js'), 'utf8')}`;

class FakeNode {
  constructor(tag = 'g') { this.tagName = tag; this.attributes = {}; this.children = []; this.dataset = {}; this.listeners = {}; this.parentNode = null; this.style = { setProperty() {} }; this.classList = { values: new Set(), contains: (x) => this.classList.values.has(x), add: (x) => this.classList.values.add(x), remove: (x) => this.classList.values.delete(x) }; }
  setAttribute(k, v) { this.attributes[k] = String(v); }
  getAttribute(k) { return this.attributes[k] || null; }
  appendChild(c) { c.parentNode = this; this.children.push(c); return c; }
  addEventListener(k, fn) { (this.listeners[k] ||= []).push(fn); }
  fire(k, event = {}) { for (const fn of this.listeners[k] || []) fn({ target: this, preventDefault() { this.defaultPrevented = true; }, stopPropagation() {}, ...event }); }
}
const store = new Map();
const context = {
  Map, Set, Math, Number, String, Object, Array, JSON,
  currentWorldLocationId: 'loc-a',
  window: { localStorage: { getItem: (k) => store.get(k) || null, setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) }, confirm: () => true },
  document: { createElementNS: () => new FakeNode(), createElement: () => new FakeNode() },
  T: (key) => key,
  setTimeout: () => 1,
  clearTimeout() {},
};
context.globalThis = context;
vm.runInNewContext(`${source}\n;globalThis.api={economyLogisticsUiState, logisticsNodeIsRelevant, logisticsCurrentLocationRegionIds, logisticsBuildRenderedGraph, renderLogisticsNode, renderLogisticsRegionContainers, logisticsStorageKey, logisticsStorageSet, logisticsStorageGet, logisticsStorageRemove, logisticsCancelCameraSaves, logisticsRefreshRouteElement, logisticsRouteGeometry};`, context);
const { api } = context;
const payload = {
  nodes: [
    { id: 'a', label: 'A', kind: 'facility', locationId: 'loc-a', regionId: 'ra', commodityIds: [], production: [] },
    { id: 'b', label: 'B', kind: 'market', locationId: 'loc-b', regionId: 'rb', commodityIds: ['iron'], production: [] },
    { id: 'c', label: 'C', kind: 'store', locationId: 'loc-c', regionId: 'rc', commodityIds: [], production: [] },
    { id: 'dup-none', label: 'D', kind: 'store', locationId: 'loc-a', commodityIds: [], production: [] },
  ],
  routes: [{ id: 'iron-route', fromNodeId: 'a', toNodeId: 'b', commodityId: 'iron', volume: 1, effectiveCapacity: 2 }],
  shortages: [{ nodeId: 'c', commodityId: 'iron', unmetDemand: 1 }], processingSites: [],
};
const layout = { nodes: new Map(payload.nodes.filter((n) => n.regionId).map((n, i) => [n.id, { x: i * 220, y: 100, w: 152, h: 60, regionId: n.regionId }])), regions: new Map([['ra', { x: 0, y: 0, w: 200, h: 180, label: 'RA', memberIds: ['a'] }]]) };

api.economyLogisticsUiState.selection = { type: 'route', id: 'iron-route' };
assert.strictEqual(api.logisticsNodeIsRelevant(payload, payload.nodes[0], 'iron', payload.routes, payload.shortages), true, 'selected route endpoint remains related');
assert.strictEqual(api.logisticsNodeIsRelevant(payload, payload.nodes[2], 'iron', payload.routes, payload.shortages), true, 'relevant shortage remains related');
assert.strictEqual(api.logisticsNodeIsRelevant(payload, { id: 'x', locationId: 'none', commodityIds: [] }, 'iron', payload.routes, payload.shortages), false, 'unrelated node is dimmable');
assert.deepStrictEqual([...api.logisticsCurrentLocationRegionIds(payload)].sort(), ['ra'], 'all factual current-location matches are inspected');
payload.nodes.push({ id: 'dup-rb', label: 'E', kind: 'market', locationId: 'loc-a', regionId: 'rb', commodityIds: [] });
assert.deepStrictEqual([...api.logisticsCurrentLocationRegionIds(payload)].sort(), ['ra', 'rb'], 'duplicate factual locations protect every valid region');

const regionLayer = new FakeNode();
api.economyLogisticsUiState.collapsedRegionIds = new Set();
api.renderLogisticsRegionContainers(regionLayer, payload, layout);
const control = regionLayer.children[0].children[1];
assert.strictEqual(control.attributes.role, 'button');
assert.ok(control.children.some((child) => child.attributes.class === 'logistics-region-collapse-hit'), 'collapse uses a painted hit target');
assert.strictEqual(control.attributes['aria-disabled'], 'true', 'actual current region is protected');

const aggregateSvg = new FakeNode();
const aggregate = { id: '\u0000lr-region-aggregate:ra', label: 'RA', kind: 'region', aggregate: true, memberCount: 3, regionId: 'ra', processingSiteIds: [] };
api.economyLogisticsUiState.collapsedRegionIds = new Set(['ra']);
api.renderLogisticsNode(aggregateSvg, payload, aggregate, { x: 100, y: 100, w: 184, h: 72, tier: 'major', regionId: 'ra', aggregate: true }, [], [], { nodeElements: new Map() });
const aggregateEl = aggregateSvg.children[0];
assert.ok(aggregateEl.attributes.class.includes('scale-major') && aggregateEl.attributes.class.includes('aggregate'));
assert.ok(aggregateEl.children.some((child) => child.attributes.class === 'logistics-node-aggregate-outline'), 'aggregate has stacked outline');
assert.ok(aggregateEl.children.some((child) => child.attributes.class === 'logistics-aggregate-badge'), 'aggregate has factual member badge');

const cameraKey = api.logisticsStorageKey('camera', 'scope-a');
api.logisticsStorageSet(cameraKey, 'saved');
api.economyLogisticsUiState.cameraSaveTimers = { 'scope-a:normal': 1, 'scope-a:lightbox': 2, 'scope-b:normal': 3 };
api.logisticsStorageRemove(cameraKey); api.logisticsCancelCameraSaves('scope-a');
assert.strictEqual(api.logisticsStorageGet(cameraKey), null, 'reset removes active-scope camera state');
assert.deepStrictEqual(Object.keys(api.economyLogisticsUiState.cameraSaveTimers), ['scope-b:normal'], 'reset cancels only active-scope pending saves');

const positions = new Map([['a', { x: 101, y: 87, w: 152, h: 60 }], ['b', { x: 300, y: 100, w: 152, h: 60 }]]);
const route = { id: 'iron-route', fromNodeId: 'a', toNodeId: 'b' };
const routeEl = new FakeNode();
const line = new FakeNode('path'); const label = new FakeNode('text');
routeEl._logisticsRoute = route; routeEl._logisticsParts = { line, label, warning: null };
api.logisticsRefreshRouteElement(routeEl, positions);
assert.strictEqual(line.attributes.d, api.logisticsRouteGeometry(route, positions.get('a'), positions.get('b')).d, 'rounded node position and route path share geometry');
assert.ok(Number.isFinite(Number(label.attributes.x)) && Number.isFinite(Number(label.attributes.y)), 'route label refreshes with path');

console.log('webview logistics interactions: all behavioral checks passed.');
