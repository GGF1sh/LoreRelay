#!/usr/bin/env node
'use strict';

const path = require('path');
const root = path.join(__dirname, '..');
const modPath = path.join(root, 'out', 'livingWorldTurnOpsCore.js');

let failed = 0;
function fail(msg) { console.error(`FAIL: ${msg}`); failed++; }
function ok(msg) { console.log(`OK: ${msg}`); }

if (!require('fs').existsSync(modPath)) {
    fail('out/livingWorldTurnOpsCore.js missing — run npm run compile first');
    process.exit(1);
}

const {
    getOrInitPlayerCommerce,
    applyTravelFoodConsumption,
} = require(modPath);

const commerce = {
    commodities: [
        { id: 'wheat', name: 'Wheat', basePrice: 10, weight: 1 },
    ],
    markets: [],
    transportKinds: [
        { id: 'wagon', name: 'Wagon', capacity: 20, speed: 1, foodPerDay: 2 },
    ],
};

{
    const state = {};
    const commerceState = getOrInitPlayerCommerce(state);
    if (commerceState.food !== 30 || commerceState.credits !== 500) {
        fail('getOrInitPlayerCommerce defaults');
    } else {
        ok('getOrInitPlayerCommerce defaults');
    }
}

{
    const state = {
        commerce: { credits: 100, cargo: [], transportId: 'wagon', food: 10 },
    };
    const next = applyTravelFoodConsumption(state, 3, commerce);
    const food = next.commerce?.food;
    // wagon foodPerDay=2, 3 days => 6 consumed
    if (food !== 4) {
        fail(`travel food deduction expected 4, got ${food}`);
    } else {
        ok('travel food deduction');
    }
}

{
    const state = {
        commerce: { credits: 100, cargo: [], transportId: 'wagon', food: 2 },
    };
    const next = applyTravelFoodConsumption(state, 5, commerce);
    const food = next.commerce?.food;
    if (food !== 0) {
        fail(`food should clamp to 0, got ${food}`);
    } else {
        ok('travel food clamps at zero');
    }
}

if (failed > 0) {
    process.exit(1);
}
console.log('livingWorldTurnOps: all tests passed.');