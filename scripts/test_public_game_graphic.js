'use strict';
const assert = require('assert/strict');
const { renderPublicGameGraphic } = require('../out/publicGameGraphicCore');
const view = { geography: { regions: [{ id: 'a', name: '<script>&', connectedTo: ['b', 'hidden-region'] },
    { id: 'b', name: '港町', connectedTo: ['a'] }], currentRegion: { id: 'a' }, secret: 'private-witness' },
    availableActions: [{ actionId: 'commerce:trade', estimate: { commodities: [
        { commodityId: 'grain', commodityName: '小麦', stock: 10, unitPrice: 3 },
        { commodityId: 'bad', commodityName: 'invalid-stock', stock: NaN, unitPrice: 3 },
    ] } }] };
const before = JSON.stringify(view);
const map = renderPublicGameGraphic('world-map', view);
assert(!map.includes('<script>'));
assert(map.includes('&lt;script&gt;&amp;'));
assert(!map.includes('hidden-region'));
assert(!map.includes('private-witness'));
assert.equal((map.match(/<path /g) || []).length, 1, 'only visible endpoints, deduplicated');
const market = renderPublicGameGraphic('market-report', view);
assert(market.includes('10個 / 単価 3'));
assert(!market.includes('invalid-stock'));
assert.equal(JSON.stringify(view), before);
assert(renderPublicGameGraphic('market-report', {}).includes('データはありません'));
assert(renderPublicGameGraphic('world-map', {}).includes('公開地域はありません'));
console.log('Public graphics: escaped labels, visible edges, estimates, empty states and no mutation passed.');
