#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const modulePath = path.join(__dirname, '..', 'webview', 'modules', '85b4-logistics-navigation.js');
const source = `${fs.readFileSync(modulePath, 'utf8')}\nglobalThis.api={computeLogisticsMinimapProjectionBounds,expandLogisticsMinimapProjectionBounds,computeLogisticsMinimapModel,isLogisticsRouteFlowEligible};`;
const context = { globalThis: {}, Map, Set, Number, String, Array, Object, Math, Intl, JSON };
context.globalThis = context;
vm.runInNewContext(source, context, { filename: modulePath });
const api = context.api;

const nodes = [{ id: 'moved', x: -420, y: 60, w: 120, h: 50 }];
const regions = new Map([['owning', { x: -500, y: 0, w: 260, h: 160 }]]);
const input = { graphBounds: { minX: 0, minY: 0, maxX: 300, maxY: 200 }, viewportSize: { width: 420, height: 360 }, camera: { k: 1, tx: 0, ty: 0 }, nodes, regions };
const canonical = api.computeLogisticsMinimapProjectionBounds(input);
assert.ok(canonical.minX <= -524, 'canonical bounds include the moved region plus normal padding');
const prior = { minX: -100, minY: -100, maxX: 320, maxY: 240 };
const expanded = api.expandLogisticsMinimapProjectionBounds(prior, canonical);
assert.ok(expanded.minX <= canonical.minX && expanded.maxX >= prior.maxX, 'live expansion is union-only and does not shrink');
const model = api.computeLogisticsMinimapModel({ ...input, options: { projectionBounds: expanded } });
const marker = model.nodeMarkers.find((item) => item.id === 'moved');
assert.ok(marker.x >= 0 && marker.x <= model.minimapBounds.width, 'moved marker projects inside minimap');
assert.ok(model.viewportRect.w > 0 && Number.isFinite(model.viewportRect.x), 'camera viewport remains representable');

for (const status of ['blocked', 'sealed', 'closed', 'disabled']) {
  assert.strictEqual(api.isLogisticsRouteFlowEligible({ flowEnabled: true, relevanceKind: 'primary', volume: 4, status }), false, `${status} cannot animate flow`);
}
for (const status of ['open', 'strained', 'raided']) {
  assert.strictEqual(api.isLogisticsRouteFlowEligible({ flowEnabled: true, relevanceKind: 'primary', volume: 1, status }), true, `${status} permits factual movement`);
}

console.log('webview logistics navigation: minimap projection and flow eligibility passed.');
