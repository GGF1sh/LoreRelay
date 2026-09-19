#!/usr/bin/env node
'use strict';

const assert = require('assert');
const { buildSettlementPromptBlock } = require('../out/settlementCore');

const state = {
  version: 1, settlementId: 'fixed_a', name: 'Fixed A', locationId: 'loc_a',
  stocks: [], structures: [
    { id: 'gate', name: 'North Gate', layerId: 'z0', status: 'intact' },
    { id: 'tower', name: 'Watch Tower', layerId: 'z1', status: 'intact' },
  ], residents: [], visitors: [], merchants: [], incidents: [],
};
const layout = {
  version: 1, settlementId: 'fixed_a', layers: ['z0', 'z1'],
  zones: [
    ...Array.from({ length: 9 }, (_, i) => ({ id: `wall_${i}`, layerId: 'z0', label: `Wall ${i}` })),
    { id: 'entry', layerId: 'z0', label: 'North Entrance', x: 12, y: 4 },
    { id: 'hidden_secret', layerId: 'z-1', label: 'Hidden Secret' },
  ],
  markers: [{ id: 'well', layerId: 'z1', label: 'Waterworks' }],
};
const text = buildSettlementPromptBlock(state, true, { layout });
assert.match(text, /North Gate/);
assert.match(text, /Watch Tower/);
assert.match(text, /z0/);
assert.match(text, /z1/);
assert.match(text, /North Entrance/);
assert.match(text, /@12,4/);
assert.doesNotMatch(text, /Hidden Secret/);
assert.doesNotMatch(text, /Mobile Base/);
console.log('settlement prompt scoped facilities/layout: all tests passed');
