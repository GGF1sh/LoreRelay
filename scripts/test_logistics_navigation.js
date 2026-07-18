#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const source = `${fs.readFileSync(path.join(__dirname, '..', 'webview/modules/85b4-logistics-navigation.js'), 'utf8')}\nglobalThis.api={computeLogisticsMinimapModel,computeLogisticsMinimapProjectionBounds,expandLogisticsMinimapProjectionBounds,logisticsMinimapCameraAt,computeLogisticsSemanticZoom,computeLogisticsFilterModel,isLogisticsRouteFlowEligible};`;
const context = { globalThis: {}, Map, Set, Number, String, Array, Object, Math, Intl, JSON }; context.globalThis = context;
vm.runInNewContext(source, context); const api = context.api;
let contracts = 0;
function check(condition, message) { assert.ok(condition, message); contracts++; }
function equal(actual, expected, message) { assert.strictEqual(actual, expected, message); contracts++; }

const commodities = [
  { id: 'grain', name: 'Grain', family: 'food' },
  { id: 'fruit', name: 'Fruit', family: 'food' },
  { id: 'iron', name: 'Iron', family: 'metal' },
  { id: 'salt', name: 'Salt' },
];
const nodes = [
  { id: 'a', label: 'Alpha Depot', regionId: 'north' },
  { id: 'b', label: 'Special Foundry', regionId: 'east' },
  { id: 'c', label: 'Central Market', regionId: 'cn' },
  { id: 'd', label: 'Delta Store', regionId: 'tw' },
  { id: 'e', label: 'Remote Saltworks', regionId: 'remote' },
];
const routes = [
  { id: 'grain_quiet', fromNodeId: 'a', toNodeId: 'c', commodityId: 'grain', status: 'open' },
  { id: 'grain_special', fromNodeId: 'b', toNodeId: 'a', commodityId: 'grain', status: 'open' },
  { id: 'fruit_special', fromNodeId: 'b', toNodeId: 'c', commodityId: 'fruit', status: 'open' },
  { id: 'iron_special', fromNodeId: 'b', toNodeId: 'd', commodityId: 'iron', status: 'open' },
  { id: 'salt_blocked', fromNodeId: 'e', toNodeId: 'd', commodityId: 'salt', status: 'blocked' },
];
const regions = new Map([
  ['north', { label: 'Harbor of Winds' }],
  ['east', { label: '\u6e2f\u8857' }],
  ['cn', { label: '\u5317\u4eac\u5e02\u5834' }],
  ['tw', { label: '\u81fa\u5317\u6e2f' }],
  ['remote', { label: 'Remote Reach' }],
]);
function filter(options = {}) {
  return api.computeLogisticsFilterModel({ nodes, routes, commodities, regions, ...options });
}
function route(model, id) { return model.routeMatchKinds.get(id); }
function node(model, id) { return model.nodeMatchKinds.get(id); }

// 1-18: AND composition and factual count.
let model = filter({ commodityId: 'grain' });
equal(route(model, 'grain_quiet'), 'primary', '1 commodity-only exact is primary');
equal(route(model, 'fruit_special'), 'secondary', '2 commodity-only same family is secondary');
equal(route(model, 'iron_special'), 'unrelated', '3 commodity-only unrelated is unrelated');
model = filter({ query: 'special' });
equal(route(model, 'grain_special'), 'primary', '4 query-only match is primary');
equal(route(model, 'grain_quiet'), 'unrelated', '5 query-only mismatch is unrelated');
model = filter({ statusKeys: ['open'] });
equal(route(model, 'grain_quiet'), 'primary', '6 status-only match is primary');
equal(route(model, 'salt_blocked'), 'unrelated', '7 status-only mismatch is unrelated');
model = filter({ query: 'special', commodityId: 'grain' });
equal(route(model, 'grain_special'), 'primary', '8 query plus commodity match is primary');
equal(route(model, 'iron_special'), 'unrelated', '9 query cannot bypass unrelated commodity');
equal(route(model, 'grain_quiet'), 'unrelated', '10 commodity cannot bypass query mismatch');
model = filter({ query: 'special', statusKeys: ['open'] });
equal(route(model, 'grain_special'), 'primary', '11 query plus status match is primary');
model = filter({ query: 'special', statusKeys: ['blocked'] });
equal(route(model, 'grain_special'), 'unrelated', '12 query cannot bypass status mismatch');
model = filter({ query: 'special', statusKeys: ['open'], commodityId: 'grain' });
equal(route(model, 'grain_special'), 'primary', '13 all three matching constraints are primary');
equal(route(model, 'fruit_special'), 'secondary', '14 same-family match remains secondary');
model = filter({ query: 'quiet', commodityId: 'grain' });
equal(route(model, 'fruit_special'), 'unrelated', '15 same family cannot bypass query failure');
model = filter({ query: 'special', commodityId: 'grain', selection: { type: 'route', id: 'iron_special' } });
equal(route(model, 'iron_special'), 'unrelated', '16 selection does not alter factual filter result');
equal(model.matchCount, 2, '17 selected visual protection cannot inflate factual match count');
model = filter();
equal(model.active, false, '18 clearing filters restores inactive state');
equal(model.matchCount, routes.length, '18b clearing filters restores factual route total');

// 19-30: factual region label search, Unicode, and input safety.
model = filter({ query: 'Harbor of Winds' });
equal(node(model, 'a'), 'primary', '19 exact visible region label matches its node');
equal(route(model, 'grain_quiet'), 'primary', '20 exact region label matches incident route');
model = filter({ query: 'winds' });
equal(node(model, 'a'), 'primary', '21 partial region display label matches');
model = filter({ query: '\u6e2f\u8857' });
equal(node(model, 'b'), 'primary', '22 Japanese region display label matches');
model = filter({ query: '\u5317\u4eac' });
equal(node(model, 'c'), 'primary', '23 Simplified Chinese region display label matches');
model = filter({ query: '\u81fa\u5317' });
equal(node(model, 'd'), 'primary', '24 Traditional Chinese region display label matches');
model = filter({ query: '\uFF28\uFF41\uFF52\uFF42\uFF4F\uFF52' });
equal(node(model, 'a'), 'primary', '25 full-width Latin normalizes with NFKC');
model = filter({ query: 'Harbor' });
equal(route(model, 'grain_quiet'), 'primary', '26 region match reaches route endpoint text');
equal(node(model, 'e'), 'unrelated', '27 unrelated region node is dimmed');
equal(route(model, 'salt_blocked'), 'unrelated', '28 unrelated region route is dimmed');
const shuffled = new Map([...regions.entries()].reverse());
const snapshot = (value) => JSON.stringify({ routes: [...value.routeMatchKinds.entries()], nodes: [...value.nodeMatchKinds.entries()], count: value.matchCount });
equal(snapshot(api.computeLogisticsFilterModel({ nodes, routes, commodities, regions, query: 'Harbor' })), snapshot(api.computeLogisticsFilterModel({ nodes, routes, commodities, regions: shuffled, query: 'Harbor' })), '29 shuffled regions are deterministic');
const beforeNodes = JSON.stringify(nodes); const beforeRegions = JSON.stringify([...regions.entries()]);
const safeMissing = api.computeLogisticsFilterModel({ nodes, routes, commodities, regions: new Map([['north', {}]]), query: 'missing' });
equal(JSON.stringify(nodes), beforeNodes, '30 node input is not mutated');
equal(JSON.stringify([...regions.entries()]), beforeRegions, '31 region input is not mutated');
check(Number.isFinite(safeMissing.matchCount) && safeMissing.routeMatchKinds.size === routes.length, '32 missing region metadata is finite and safe');

// Keep existing minimap and semantic contracts covered by this production module.
const mini = api.computeLogisticsMinimapModel({ graphBounds: { minX: -60, minY: 0, maxX: 270, maxY: 150 }, viewportSize: { width: 300, height: 200 }, camera: { k: 1, tx: 20, ty: -10 }, nodes: [{ id: 'a', x: -50, y: 10 }], regions: new Map([['north', { x: -60, y: 0, w: 330, h: 150 }]]) });
check(Number.isFinite(mini.scale) && mini.viewportRect.w > 0, '33 minimap projection remains finite');
equal(api.computeLogisticsSemanticZoom({ cameraScale: 0.4 }).level, 'overview', '34 overview semantic level remains stable');
equal(api.computeLogisticsSemanticZoom({ cameraScale: 1.3 }).level, 'detail', '35 detail semantic level remains stable');
check(api.isLogisticsRouteFlowEligible({ flowEnabled: true, relevanceKind: 'primary', volume: 1, status: 'open' }), '36 open positive primary route is flow eligible');
check(api.isLogisticsRouteFlowEligible({ flowEnabled: true, relevanceKind: 'primary', volume: 1, status: 'strained' }), '37 strained route permits movement');
check(api.isLogisticsRouteFlowEligible({ flowEnabled: true, relevanceKind: 'primary', volume: 1, status: 'raided' }), '38 raided route permits movement');
check(!api.isLogisticsRouteFlowEligible({ flowEnabled: true, relevanceKind: 'primary', volume: 9, status: 'blocked' }), '39 blocked route cannot animate regardless of positive volume');
check(!api.isLogisticsRouteFlowEligible({ flowEnabled: true, relevanceKind: 'primary', volume: 9, status: 'sealed' }), '40 unknown stopped equivalent is denied by allowlist');
check(!api.isLogisticsRouteFlowEligible({ flowEnabled: true, relevanceKind: 'unrelated', volume: 9, status: 'open' }), '41 unrelated route cannot animate');
check(!api.isLogisticsRouteFlowEligible({ flowEnabled: false, relevanceKind: 'primary', volume: 9, status: 'open' }), '42 disabled flow toggle suppresses animation');
console.log(`logistics navigation: ${contracts} meaningful contracts passed.`);
