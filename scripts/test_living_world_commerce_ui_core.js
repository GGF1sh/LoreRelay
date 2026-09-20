#!/usr/bin/env node
'use strict';

const path = require('path');
const root = path.join(__dirname, '..');
const corePath = path.join(root, 'out', 'livingWorldCommerceUiCore.js');
const commercePath = path.join(root, 'out', 'commerceCore.js');
const forgePath = path.join(root, 'out', 'livingWorldForgeCore.js');

let failed = 0;
function fail(msg) { console.error(`FAIL: ${msg}`); failed++; }
function ok(msg) { console.log(`OK: ${msg}`); }

for (const p of [corePath, commercePath, forgePath]) {
    if (!require('fs').existsSync(p)) {
        fail(`${p} missing — run npm run compile`);
        process.exit(1);
    }
}

const {
    executeDirectTrade,
    isValidPlayerRole,
    resolveDefaultPlayerRole,
    PLAYER_ROLES,
} = require(corePath);
const { initializeMarketState } = require(commercePath);
const { parseCommerceForge } = require(forgePath);

const fixture = JSON.parse(require('fs').readFileSync(
    path.join(root, 'sample-scenarios', 'trade-routes', 'world_forge.json'),
    'utf-8'
));
const forge = parseCommerceForge(fixture.commerce);
const markets = initializeMarketState(forge);
const commerce = { credits: 500, cargo: [], transportId: 'wagon', food: 30, playerRole: 'merchant' };

{
    if (!isValidPlayerRole('merchant') || isValidPlayerRole('invalid')) {
        fail('isValidPlayerRole');
    } else {
        ok('isValidPlayerRole');
    }
}

{
    const role = resolveDefaultPlayerRole('smith', 'adventurer');
    if (role !== 'adventurer') {
        fail(`resolveDefaultPlayerRole prefers commerce role, got ${role}`);
    } else {
        ok('resolveDefaultPlayerRole prefers commerce');
    }
}

{
    const role = resolveDefaultPlayerRole('smith', undefined);
    if (role !== 'smith') {
        fail(`resolveDefaultPlayerRole falls back to rules, got ${role}`);
    } else {
        ok('resolveDefaultPlayerRole rules fallback');
    }
}

{
    if (PLAYER_ROLES.length !== 5) {
        fail('PLAYER_ROLES count');
    } else {
        ok('PLAYER_ROLES');
    }
}

{
    const result = executeDirectTrade(forge, markets, commerce, {
        op: 'buy',
        marketLocationId: 'north_farm',
        commodityId: 'wheat',
        qty: 2,
        currentLocationId: 'south_port',
    });
    if (result.ok || result.reason !== 'WRONG_LOCATION') {
        fail(`WRONG_LOCATION expected, got ${JSON.stringify(result)}`);
    } else {
        ok('WRONG_LOCATION guard');
    }
}

{
    const result = executeDirectTrade(forge, markets, commerce, {
        op: 'buy',
        marketLocationId: 'north_farm',
        commodityId: 'wheat',
        qty: 3,
        currentLocationId: 'north_farm',
    });
    if (!result.ok || result.applied !== 1 || result.totalCost <= 0) {
        fail(`buy at location failed: ${JSON.stringify(result)}`);
    } else if (result.commerce.credits >= 500) {
        fail('buy should deduct credits');
    } else {
        ok('buy at current location');
    }
}

{
    const withCargo = {
        credits: 500,
        cargo: [{ commodityId: 'wheat', qty: 3 }],
        transportId: 'wagon',
        food: 30,
        playerRole: 'merchant',
    };
    const result = executeDirectTrade(forge, markets, withCargo, {
        op: 'sell',
        marketLocationId: 'north_farm',
        commodityId: 'wheat',
        qty: 2,
        currentLocationId: 'north_farm',
    });
    if (!result.ok || result.totalRevenue <= 0) {
        fail(`sell failed: ${JSON.stringify(result)}`);
    } else {
        ok('sell at current location');
    }
}

if (failed > 0) {
    process.exit(1);
}
console.log('livingWorldCommerceUiCore: all tests passed.');
