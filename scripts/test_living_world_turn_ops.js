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
    sortLivingWorldTurnPhases,
    LIVING_WORLD_TURN_PHASES,
    resolveBondTradeBatchAdjustment,
} = require(modPath);
const { batchPlayerBondTradeAdjustments } = require(path.join(root, 'out', 'playerBondCore.js'));

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

{
    const sorted = sortLivingWorldTurnPhases(['relationship', 'commerce', 'npc_agency']);
    if (JSON.stringify(sorted) === JSON.stringify([...LIVING_WORLD_TURN_PHASES])) {
        ok('turn phases sort to canonical pipeline order');
    } else {
        fail(`phase sort (${JSON.stringify(sorted)})`);
    }
}

{
    const commerceForge = {
        commodities: [{ id: 'wheat', name: 'Wheat', basePrice: 10, weight: 1 }],
        markets: [{
            locationId: 'shop_a',
            regionId: 'r1',
            commodityIds: ['wheat'],
            targetStock: 30,
        }],
        transportKinds: [
            { id: 'wagon', name: 'Wagon', capacity: 20, speed: 1, foodPerDay: 2 },
        ],
    };
    const markets = { shop_a: { wheat: { stock: 30, priceIndex: 1 } } };
    const playerCommerce = { credits: 500, cargo: [], transportId: 'wagon', food: 30 };
    const adj = resolveBondTradeBatchAdjustment({
        milestones: { npc_elda: ['trusted_companion'] },
        registry: { npc_elda: { name: 'Elda' } },
        npcAtLocation: { npc_elda: 'shop_a' },
        commerce: commerceForge,
        markets,
        playerCommerce,
        tradeOps: [{ op: 'buy', marketLocationId: 'shop_a', commodityId: 'wheat', qty: 1 }],
    });
    if (adj === 1) {
        ok('resolveBondTradeBatchAdjustment applies ally favor from trade batch');
    } else {
        fail(`bond batch adj expected 1, got ${adj}`);
    }
}

if (failed > 0) {
    process.exit(1);
}
console.log('livingWorldTurnOps: all tests passed.');