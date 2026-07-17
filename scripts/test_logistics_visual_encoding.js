#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const source = `${fs.readFileSync(path.join(__dirname, '..', 'webview/modules/85b3-logistics-visual-encoding.js'), 'utf8')}\nglobalThis.api = { computeLogisticsVisualEncoding };`;
const context = { globalThis: {}, Map, Set, Number, String, Boolean, Array, Object, Math };
context.globalThis = context;
vm.runInNewContext(source, context, { filename: '85b3-logistics-visual-encoding.js' });
const compute = context.api.computeLogisticsVisualEncoding;

const commodities = [
  { id: 'grain', name: 'Grain', family: 'food' },
  { id: 'fruit', name: 'Fruit', family: 'food' },
  { id: 'iron', name: 'Iron', category: 'material' },
  { id: 'mystery', name: 'Mystery' },
];
const nodes = [
  { id: 'a', locationId: 'here', commodityIds: ['grain'], production: [], consumption: [], storage: [] },
  { id: 'b', commodityIds: ['grain'], production: [], consumption: [], storage: [] },
  { id: 'c', commodityIds: ['iron'], production: [], consumption: [], storage: [] },
];
const routes = [
  { id: 'open', fromNodeId: 'a', toNodeId: 'b', commodityId: 'grain', volume: 1, status: 'open' },
  { id: 'rumored', fromNodeId: 'b', toNodeId: 'c', commodityId: 'fruit', volume: 4, status: 'unconfirmed' },
  { id: 'impaired', fromNodeId: 'a', toNodeId: 'c', commodityId: 'iron', volume: 16, status: 'disrupted' },
  { id: 'blocked', fromNodeId: 'c', toNodeId: 'a', commodityId: 'mystery', volume: 64, status: 'blocked' },
];
const geometry = new Map(routes.map((route) => [route.id, { pathD: `M ${route.id}`, conflicted: route.id === 'blocked' }]));
const snapshot = JSON.stringify({ routes, nodes, geometry: [...geometry] });
const encoded = (extra = {}) => compute({ routes, nodes, commodities, currentLocationId: 'here', options: { geometryByRoute: geometry, shortages: [] }, ...extra });
const style = (id, extra) => encoded(extra).routeStyles.get(id);
const nodeStyle = (id, extra) => encoded(extra).nodeStyles.get(id);

assert.strictEqual(style('open').statusKey, 'open', '1 open maps deterministically');
assert.ok(style('rumored').dashPattern, '2 unconfirmed has a dash');
assert.notStrictEqual(style('impaired').dashPattern, style('rumored').dashPattern, '3 disrupted dash differs');
assert.notStrictEqual(style('blocked', { options: { geometryByRoute: new Map(), shortages: [] } }).dashPattern, style('impaired').dashPattern, '4 blocked dash differs');
assert.strictEqual(style('open', { routes: [{ ...routes[0], status: 'future' }] }).statusKey, 'unknown', '5 unknown is neutral');
assert.strictEqual(style('blocked').statusKey, 'conflicted', '6 geometry conflict uses diagnostic status');
assert.strictEqual(style('open', { routes: [{ ...routes[0], volume: 9999 }] }).statusKey, 'open', '7 volume does not change status');
assert.strictEqual(style('open', { selectedCommodityId: 'iron' }).statusKey, 'open', '8 filter does not change status');
assert.strictEqual(style('open', { routes: [{ ...routes[0], volume: 0 }] }).strokeWidth, 2, '9 zero volume is minimum');
assert.strictEqual(style('open', { routes: [{ ...routes[0], volume: undefined }] }).strokeWidth, 2, '10 missing volume is minimum');
assert.ok(Number.isFinite(style('open', { routes: [{ ...routes[0], volume: NaN }] }).strokeWidth), '11 malformed volume is finite');
assert.strictEqual(style('open', { routes: [{ ...routes[0], volume: -1 }] }).strokeWidth, 2, '12 negative volume is safe');
const widths = routes.map((route) => style(route.id).strokeWidth); assert.ok(widths.every((width, index) => index === 0 || width >= widths[index - 1]), '13 width is monotonic');
const outlier = compute({ routes: [{ ...routes[0], volume: 1 }, { ...routes[1], volume: 10 }, { ...routes[2], volume: 100 }, { ...routes[3], volume: 1e12 }], nodes, commodities });
assert.ok(outlier.routeStyles.get('rumored').strokeWidth > outlier.routeStyles.get('open').strokeWidth, '14 outlier does not flatten ordinary widths');
assert.ok(widths.every((width) => width >= 2 && width <= 7), '15 widths stay bounded');
const stable = (value) => JSON.stringify([...value.routeStyles].map(([id, item]) => [id, item]));
assert.strictEqual(stable(encoded()), stable(compute({ routes: routes.slice().reverse(), nodes: nodes.slice().reverse(), commodities, currentLocationId: 'here', options: { geometryByRoute: geometry, shortages: [] } })), '16 shuffled inputs are byte-stable');
assert.strictEqual(style('blocked', { selectedRouteId: 'blocked', selectedCommodityId: 'grain' }).relevance, 1, '17 selected route is relevant');
assert.strictEqual(nodeStyle('c', { selectedRouteId: 'blocked', selectedCommodityId: 'grain' }).relevance, 1, '18 selected endpoint is relevant');
assert.strictEqual(nodeStyle('c', { selectedNodeId: 'c', selectedCommodityId: 'grain' }).relevance, 1, '19 selected node is relevant');
assert.strictEqual(nodeStyle('a', { selectedCommodityId: 'iron' }).relevance, 1, '20 current location is relevant');
assert.ok(style('impaired', { selectedCommodityId: 'grain' }).relevance < 1, '21 unrelated route dims');
assert.ok(nodeStyle('c', { selectedCommodityId: 'grain', currentLocationId: null }).relevance < 1, '22 unrelated node dims');
assert.strictEqual(encoded({ selectedCommodityId: 'grain' }).routeStyles.size, routes.length, '23 filter retains routes');
assert.strictEqual(encoded({ selectedCommodityId: 'grain' }).nodeStyles.size, nodes.length, '24 filter retains nodes');
assert.ok([...encoded().routeStyles.values()].every((item) => item.commodityAccentState === 'none'), '25 overview has no commodity rainbow');
assert.strictEqual(style('open', { selectedCommodityId: 'grain' }).commodityAccentState, 'primary', '26 selected commodity gets one accent');
assert.strictEqual(style('rumored', { selectedCommodityId: 'grain' }).commodityAccentState, 'secondary', '27 same factual family is secondary');
assert.strictEqual(style('impaired', { selectedCommodityId: 'grain' }).commodityAccentState, 'none', '28 unrelated family has no accent');
assert.strictEqual(style('blocked', { selectedCommodityId: 'mystery' }).commodityFamilyToken, 'unclassified', '29 missing family is unclassified');
assert.ok(encoded().diagnostics.familyTokens.length <= 6, '30 no more than six family tokens');
assert.strictEqual(style('blocked', { selectedCommodityId: 'mystery' }).commodityFamilyKey, null, '31 family never derives from an id');
assert.strictEqual(nodes[0].kind, undefined, '32 node role data is not mutated');
assert.strictEqual(JSON.stringify({ routes, nodes, geometry: [...geometry] }), snapshot, '33-35 route, node, and geometry inputs are unchanged');
assert.strictEqual(geometry.get('open').pathD, 'M open', '36 pathD unchanged by status');
assert.strictEqual(geometry.get('open').pathD, 'M open', '37 pathD unchanged by volume');
assert.strictEqual(geometry.get('open').pathD, 'M open', '38 pathD unchanged by filter');
assert.ok(style('open', { selectedCommodityId: 'grain' }).dashPattern === '' && style('rumored', { selectedCommodityId: 'grain' }).dashPattern, '39 status survives commodity accent');
assert.strictEqual(JSON.stringify(encoded().legend.channels.map((item) => item[0])), JSON.stringify(['status', 'throughput', 'relevance', 'direction', 'uncertainty']), '40 legend describes five channels');
assert.strictEqual(style('impaired', { selectedRouteId: 'open' }).relevance, 0.18, '41 route selection dims remote routes');
assert.strictEqual(style('impaired', { selectedRouteId: 'open' }).relevanceKind, 'unrelated', '42 remote selection relevance is explicit');
assert.strictEqual(style('open', { selectedRouteId: 'open' }).relevance, 1, '43 selected route remains primary');
assert.strictEqual(style('impaired').relevance, 1, '44 clearing route selection restores relevance');
assert.strictEqual(style('open', { selectedCommodityId: 'grain' }).relevanceKind, 'primary', '45 exact commodity is primary');
assert.strictEqual(style('rumored', { selectedCommodityId: 'grain' }).relevance, 0.55, '46 factual same family is secondary');
assert.strictEqual(style('rumored', { selectedCommodityId: 'grain' }).relevanceKind, 'secondary', '47 secondary relevance is explicit');
assert.strictEqual(style('impaired', { selectedCommodityId: 'grain' }).relevance, 0.18, '48 unrelated family is dimmed');
assert.strictEqual(style('impaired', { selectedCommodityId: 'grain' }).commodityAccentState, 'none', '49 unrelated family has no accent');
assert.strictEqual(style('open', { selectedRouteId: 'open', selectedCommodityId: 'iron' }).relevance, 1, '50 selected route overrides an unrelated commodity filter');
assert.strictEqual(nodeStyle('a', { selectedRouteId: 'open', selectedCommodityId: 'iron' }).relevance, 1, '51 selected route endpoint remains primary');
assert.strictEqual(nodeStyle('c', { selectedNodeId: 'c', selectedCommodityId: 'grain', currentLocationId: null }).relevance, 1, '52 selected node remains primary');
assert.strictEqual(nodeStyle('a', { selectedCommodityId: 'iron' }).relevance, 1, '53 current node remains primary');
assert.strictEqual(style('open', { selectedCommodityId: 'mystery' }).commodityAccentState, 'none', '54 missing family metadata does not create secondary matches');
assert.strictEqual(JSON.stringify({ routes, nodes, geometry: [...geometry] }), snapshot, '55 relevance encoding does not mutate inputs');

console.log('logistics visual encoding: 55 factual contracts passed.');
