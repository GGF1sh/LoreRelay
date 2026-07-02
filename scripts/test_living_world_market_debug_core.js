#!/usr/bin/env node
'use strict';

const path = require('path');
const root = path.join(__dirname, '..');
const corePath = path.join(root, 'out', 'livingWorldMarketDebugCore.js');
const forgePath = path.join(root, 'out', 'livingWorldForgeCore.js');

let failed = 0;
function fail(msg) { console.error(`FAIL: ${msg}`); failed++; }
function ok(msg) { console.log(`OK: ${msg}`); }

for (const p of [corePath, forgePath]) {
    if (!require('fs').existsSync(p)) {
        fail(`${p} missing — run npm run compile`);
        process.exit(1);
    }
}

const { applyMarketPriceDebugOps } = require(corePath);
const { parseCommerceForge } = require(forgePath);
const fixture = JSON.parse(require('fs').readFileSync(
    path.join(root, '..', 'lorerelay-world-kit', 'fixtures', 'trade_routes_forge.json'),
    'utf-8'
));
const commerce = parseCommerceForge(fixture.commerce);

{
    const batch = applyMarketPriceDebugOps(commerce, undefined, [
        { locationId: 'north_farm', commodityId: 'wheat', multiplier: 2 },
    ]);
    const idx = batch.markets.north_farm?.wheat?.priceIndex;
    if (batch.applied !== 1 || idx !== 2) {
        fail(`batch apply expected index 2, got ${idx}`);
    } else {
        ok('applyMarketPriceDebugOps');
    }
}

if (failed > 0) {
    process.exit(1);
}
console.log('livingWorldMarketDebugCore: all tests passed.');