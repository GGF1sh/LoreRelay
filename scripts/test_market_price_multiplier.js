#!/usr/bin/env node
'use strict';

const path = require('path');
const root = path.join(__dirname, '..');
const corePath = path.join(root, 'out', 'worldSimCommerceCore.js');

let failed = 0;
function fail(msg) { console.error(`FAIL: ${msg}`); failed++; }
function ok(msg) { console.log(`OK: ${msg}`); }

if (!require('fs').existsSync(corePath)) {
    fail('out/worldSimCommerceCore.js missing — run npm run compile');
    process.exit(1);
}

const { applyMarketPriceMultiplier, MAX_PRICE_INDEX } = require(corePath);

const markets = {
    north_farm: {
        wheat: { stock: 40, priceIndex: 1 },
    },
};

{
    const result = applyMarketPriceMultiplier(markets, 'north_farm', 'wheat', 2);
    const idx = result.markets.north_farm.wheat.priceIndex;
    if (!result.applied || idx !== 2) {
        fail(`expected priceIndex 2, got ${idx}`);
    } else {
        ok('applyMarketPriceMultiplier doubles index');
    }
}

{
    const heavy = applyMarketPriceMultiplier(markets, 'north_farm', 'wheat', 99);
    if (heavy.markets.north_farm.wheat.priceIndex !== MAX_PRICE_INDEX) {
        fail('priceIndex should clamp to MAX');
    } else {
        ok('priceIndex clamps to MAX');
    }
}

if (failed > 0) {
    process.exit(1);
}
console.log('market price multiplier: all tests passed.');