#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const modulePath = path.join(__dirname, '..', 'webview', 'modules', '85b4-logistics-navigation.js');
const source = `${fs.readFileSync(modulePath, 'utf8')}\nglobalThis.api={computeLogisticsMinimapProjectionBounds,expandLogisticsMinimapProjectionBounds,computeLogisticsMinimapModel,logisticsMinimapCameraAt,isLogisticsRouteFlowEligible};`;
const context = { globalThis: {}, Map, Set, Number, String, Array, Object, Math, Intl, JSON };
context.globalThis = context;
vm.runInNewContext(source, context, { filename: modulePath });
const api = context.api;

const nodes = [{ id: 'moved', x: -420, y: 60, w: 120, h: 50 }];
const regions = new Map([['owning', { x: -500, y: 0, w: 260, h: 160 }]]);
const input = { graphBounds: { minX: 0, minY: 0, maxX: 300, maxY: 200 }, viewportSize: { width: 420, height: 360 }, camera: { k: 1, tx: 0, ty: 0 }, nodes, regions };
const canonical = api.computeLogisticsMinimapProjectionBounds(input);
assert.ok(canonical.minX <= -524, 'D #1 node movement expands content bounds');
const cameraOnly = api.computeLogisticsMinimapProjectionBounds({ ...input, camera: { k: 2.4, tx: -900, ty: 480 } });
assert.deepStrictEqual(cameraOnly, canonical, 'D #2 camera movement alone does not change projection bounds');
const prior = { minX: -100, minY: -100, maxX: 320, maxY: 240 };
const expanded = api.expandLogisticsMinimapProjectionBounds(prior, canonical);
assert.ok(expanded.minX <= canonical.minX && expanded.maxX >= prior.maxX, 'live expansion is union-only and does not shrink');
const model = api.computeLogisticsMinimapModel({ ...input, options: { projectionBounds: expanded } });
const cameraOnlyModel = api.computeLogisticsMinimapModel({ ...input, camera: { k: 2.4, tx: -900, ty: 480 }, options: { projectionBounds: expanded } });
assert.strictEqual(cameraOnlyModel.scale, model.scale, 'D #3 camera movement alone does not change minimap scale');
const marker = model.nodeMarkers.find((item) => item.id === 'moved');
assert.ok(marker.x >= 0 && marker.x <= model.minimapBounds.width, 'moved marker projects inside minimap');
assert.ok(model.viewportRect.w > 0 && model.viewportRect.x >= model.contentRect.x && model.viewportRect.x + model.viewportRect.w <= model.contentRect.x + model.contentRect.w + 1e-9, 'D #4 viewport indicator is clamped inside contentRect');
const target = api.logisticsMinimapCameraAt(model, { x: -999, y: 9999 }, input.viewportSize, { k: 1.7 });
const targetWorldX = (input.viewportSize.width / 2 - target.tx) / target.k;
const targetWorldY = (input.viewportSize.height / 2 - target.ty) / target.k;
assert.ok(targetWorldX - input.viewportSize.width / (2 * target.k) >= model.worldBounds.minX - 1e-9 && targetWorldX + input.viewportSize.width / (2 * target.k) <= model.worldBounds.maxX + 1e-9, 'D #5 minimap target accounts for horizontal viewport edges');
assert.ok(targetWorldY - input.viewportSize.height / (2 * target.k) >= model.worldBounds.minY - 1e-9 && targetWorldY + input.viewportSize.height / (2 * target.k) <= model.worldBounds.maxY + 1e-9, 'D #5 minimap target accounts for vertical viewport edges');
let repeatedBounds = expanded;
let repeatedCamera = { k: 1.7, tx: 0, ty: 0 };
for (const point of [{ x: 0, y: 0 }, { x: 132, y: 132 }, { x: 66, y: 66 }]) {
  const repeatedModel = api.computeLogisticsMinimapModel({ ...input, camera: repeatedCamera, options: { projectionBounds: repeatedBounds } });
  repeatedCamera = api.logisticsMinimapCameraAt(repeatedModel, point, input.viewportSize, repeatedCamera);
  const candidate = api.computeLogisticsMinimapProjectionBounds({ ...input, camera: repeatedCamera });
  repeatedBounds = api.expandLogisticsMinimapProjectionBounds(repeatedBounds, candidate);
}
assert.deepStrictEqual(repeatedBounds, expanded, 'D #6 repeated minimap targeting cannot shrink projection bounds');
assert.strictEqual(repeatedCamera.k, 1.7, 'D #7 repeated minimap targeting preserves camera scale');
assert.deepStrictEqual(api.computeLogisticsMinimapProjectionBounds(input), canonical, 'D #8 canonical reset recomputes from original content, not stale expansion');

assert.strictEqual(api.isLogisticsRouteFlowEligible({ flowEnabled: true, relevanceKind: 'primary', volume: 4, operational: false }), false, 'non-operational route cannot animate flow');
assert.strictEqual(api.isLogisticsRouteFlowEligible({ flowEnabled: true, relevanceKind: 'primary', volume: 1, operational: true }), true, 'operational route permits factual movement');

console.log('webview logistics navigation: minimap projection and flow eligibility passed.');
