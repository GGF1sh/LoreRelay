#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const source = `${fs.readFileSync(path.join(root, 'webview', 'modules', '85b1-logistics-layout.js'), 'utf8')}\n${fs.readFileSync(path.join(root, 'webview', 'modules', '85b-economy-logistics.js'), 'utf8')}`;
const backing = new Map();
let rejectStorage = false;
const timers = [];
const localStorage = {
  getItem(key) { if (rejectStorage) throw new Error('blocked'); return backing.has(key) ? backing.get(key) : null; },
  setItem(key, value) { if (rejectStorage) throw new Error('blocked'); backing.set(key, String(value)); },
  removeItem(key) { if (rejectStorage) throw new Error('blocked'); backing.delete(key); },
};
class FakeSvgNode {
  constructor() { this.attributes = {}; this.children = []; this.dataset = {}; this.classList = { add() {}, remove() {} }; }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  appendChild(child) { this.children.push(child); return child; }
  addEventListener() {}
}
const context = {
  Map, Set, Math, Number, String, Object, Array, JSON,
  window: { localStorage },
  document: { createElementNS() { return new FakeSvgNode(); } },
  T(key) { return key; },
  setTimeout(fn) { timers.push(fn); return timers.length; },
  clearTimeout() {},
};
context.globalThis = context;
vm.runInNewContext(`${source}\n;globalThis.api={economyLogisticsUiState, logisticsStorageGet, logisticsStorageSet, logisticsStorageRemove, logisticsQueueCameraSave, logisticsPruneWrongRegionManualPositions, logisticsStorageKey, renderLogisticsNode};`, context);
const api = context.api;
const camera = (tx) => ({ k: 1.25, tx, ty: 4, userModified: true });

function flushTimers() { while (timers.length) timers.shift()(); }

backing.set('layout', 'stale');
rejectStorage = true;
api.logisticsStorageSet('layout', 'fresh');
assert.strictEqual(api.logisticsStorageGet('layout'), 'fresh');
api.logisticsStorageRemove('layout');
assert.strictEqual(api.logisticsStorageGet('layout'), null, 'failed removal keeps a tombstone over stale storage');
rejectStorage = false;
api.logisticsStorageSet('layout', 'settled');
assert.strictEqual(api.logisticsStorageGet('layout'), 'settled');

const state = api.economyLogisticsUiState;
state.scopeKey = 'scope_a';
state.lightboxHost = null;
state.cameraContexts.normal.camera = camera(11);
api.logisticsQueueCameraSave(false);
state.lightboxHost = {};
state.cameraContexts.lightbox.camera = camera(22);
api.logisticsQueueCameraSave(false);
state.scopeKey = 'scope_b';
flushTimers();
const storedA = JSON.parse(backing.get(api.logisticsStorageKey('camera', 'scope_a')));
assert.deepStrictEqual(storedA.normal, camera(11));
assert.deepStrictEqual(storedA.lightbox, camera(22));
assert.strictEqual(backing.has(api.logisticsStorageKey('camera', 'scope_b')), false, 'a queued A save must not write B after a scope switch');

state.scopeKey = 'scope_a';
state.manualPositions = {
  moved: { x: 44, y: 55, regionId: 'old-region', ts: 1 },
  valid: { x: 66, y: 77, regionId: 'new-region', ts: 2 },
};
assert.strictEqual(api.logisticsPruneWrongRegionManualPositions({ diagnostics: { wrongRegionManualIds: ['moved'] } }), true);
assert.strictEqual(state.manualPositions.moved, undefined);
assert.ok(state.manualPositions.valid);
const persisted = JSON.parse(backing.get(api.logisticsStorageKey('layout', 'scope_a')));
assert.strictEqual(persisted.positions.moved, undefined);
assert.ok(persisted.positions.valid);

const svg = new FakeSvgNode();
api.renderLogisticsNode(svg, { nodes: [] }, { id: 'minor', label: 'Minor', kind: 'facility', scale: 'minor', processingSiteIds: [] }, { x: 100, y: 100, w: 112, h: 44, tier: 'minor' }, [], [], { nodeElements: new Map() });
assert.strictEqual(svg.children[0].attributes.transform, 'translate(44 78)');
assert.strictEqual(svg.children[0].children[0].attributes.transform, `scale(${112 / 152} ${44 / 60})`);
assert.strictEqual(svg.children[0].children[1].attributes.transform, `scale(${112 / 152} ${44 / 60})`);

console.log('webview logistics persistence: all tests passed.');
