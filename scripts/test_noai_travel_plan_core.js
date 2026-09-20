#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const corePath = path.join(root, 'out', 'deterministicTravelPlanCore.js');
const rulesPath = path.join(root, 'out', 'gameRulesCore.js');

for (const file of [corePath, rulesPath]) {
    if (!fs.existsSync(file)) {
        throw new Error(`${file} missing - run npm.cmd run compile`);
    }
}

const { planDeterministicMerchantTravel } = require(corePath);
const { DEFAULT_GAME_RULES, normalizeGameRules } = require(rulesPath);

const locations = [
    { id: 'a', connectedTo: ['b'] },
    { id: 'b', connectedTo: ['a', 'c'] },
    { id: 'c', connectedTo: ['b'] },
];
const commodities = [{ id: 'wheat', name: 'Wheat', basePrice: 10, weight: 1 }];
const wagon = { id: 'wagon', name: 'Wagon', capacity: 20, speed: 1, foodPerDay: 2 };

function worldInput(overrides = {}) {
    return {
        mode: 'world_time',
        originLocationId: 'a',
        destinationLocationId: 'b',
        locations,
        transport: wagon,
        commodities,
        cargo: [],
        availableFood: 30,
        ...overrides,
    };
}

function deepClone(value) {
    return JSON.parse(JSON.stringify(value));
}

assert.equal(normalizeGameRules({}).merchantTravelMode, 'instant_free');
assert.equal(normalizeGameRules({ merchantTravelMode: 'future_mode' }).merchantTravelMode, 'instant_free');
const timedBase = { ...DEFAULT_GAME_RULES, merchantTravelMode: 'world_time' };
assert.equal(normalizeGameRules({}, timedBase).merchantTravelMode, 'world_time');
assert.equal(normalizeGameRules({ merchantTravelMode: 'future_mode' }, timedBase).merchantTravelMode, 'instant_free');

const missingMode = planDeterministicMerchantTravel({
    originLocationId: 'a',
    destinationLocationId: 'b',
});
assert.equal(missingMode.status, 'compatibility_instant_plan');

const invalidMode = planDeterministicMerchantTravel({
    mode: 'future_mode',
    originLocationId: 'a',
    destinationLocationId: 'b',
});
assert.equal(invalidMode.status, 'compatibility_instant_plan');
assert.deepStrictEqual(
    {
        duration: invalidMode.travelDuration,
        worldSteps: invalidMode.elapsedWorldTurns,
        foodCost: invalidMode.foodCost,
    },
    { duration: 0, worldSteps: 0, foodCost: 0 }
);

const oneHop = planDeterministicMerchantTravel(worldInput());
assert.equal(oneHop.status, 'available');
assert.deepStrictEqual(oneHop.pathLocationIds, ['a', 'b']);
assert.equal(oneHop.travelDuration, 1);
assert.equal(oneHop.elapsedWorldTurns, 1);
assert.equal(oneHop.foodCost, 2);
for (const forbidden of ['expectedArrivalPrice', 'expectedProfit', 'profit']) {
    assert.equal(Object.prototype.hasOwnProperty.call(oneHop, forbidden), false);
}

const multiHop = planDeterministicMerchantTravel(worldInput({ destinationLocationId: 'c' }));
assert.equal(multiHop.status, 'available');
assert.deepStrictEqual(multiHop.pathLocationIds, ['a', 'b', 'c']);
assert.equal(multiHop.travelDuration, 2);

const faster = planDeterministicMerchantTravel(worldInput({
    destinationLocationId: 'c',
    transport: { ...wagon, speed: 2 },
}));
assert.equal(faster.status, 'available');
assert.equal(faster.travelDuration, 1);

const loaded = planDeterministicMerchantTravel(worldInput({
    destinationLocationId: 'c',
    cargo: [{ commodityId: 'wheat', qty: 20 }],
}));
assert.equal(loaded.status, 'available');
assert.equal(loaded.cargoWeight, 20);
assert.equal(loaded.foodCost, 5);

const deterministicInput = worldInput({ destinationLocationId: 'c' });
assert.deepStrictEqual(
    planDeterministicMerchantTravel(deterministicInput),
    planDeterministicMerchantTravel(deterministicInput)
);

const immutableInput = worldInput({ cargo: [{ commodityId: 'wheat', qty: 3 }] });
const immutableBefore = deepClone(immutableInput);
planDeterministicMerchantTravel(immutableInput);
assert.deepStrictEqual(immutableInput, immutableBefore);

assert.equal(
    planDeterministicMerchantTravel(worldInput({ destinationLocationId: 'a' })).code,
    'same_location'
);
assert.equal(
    planDeterministicMerchantTravel(worldInput({ locations: [{ id: 'a' }, { id: 'b' }] })).code,
    'route_definition_missing'
);
assert.equal(
    planDeterministicMerchantTravel(worldInput({
        locations: [{ id: 'a', connectedTo: [] }, { id: 'b', connectedTo: [] }],
    })).code,
    'route_unavailable'
);

const insufficient = planDeterministicMerchantTravel(worldInput({ availableFood: 1 }));
assert.equal(insufficient.code, 'insufficient_food');
assert.equal(insufficient.requiredFood, 2);
assert.equal(insufficient.availableFood, 1);
assert.equal(Object.prototype.hasOwnProperty.call(insufficient, 'foodAfter'), false);

const foodMissingInput = worldInput();
delete foodMissingInput.availableFood;
assert.equal(planDeterministicMerchantTravel(foodMissingInput).code, 'food_missing');

assert.equal(
    planDeterministicMerchantTravel(worldInput({ cargo: [{ commodityId: 'wheat', qty: 21 }] })).code,
    'over_capacity'
);
assert.equal(
    planDeterministicMerchantTravel(worldInput({ transport: { ...wagon, speed: 0 } })).code,
    'transport_invalid'
);
assert.equal(
    planDeterministicMerchantTravel(worldInput({ transport: { ...wagon, foodPerDay: undefined } })).code,
    'transport_invalid'
);
assert.equal(
    planDeterministicMerchantTravel(worldInput({ transport: undefined })).code,
    'transport_missing'
);
assert.equal(
    planDeterministicMerchantTravel(worldInput({ originLocationId: 'missing' })).code,
    'invalid_origin'
);
assert.equal(
    planDeterministicMerchantTravel(worldInput({ destinationLocationId: 'missing' })).code,
    'invalid_destination'
);

const economyRouteOnly = worldInput({
    locations: [{ id: 'a' }, { id: 'b' }],
    economyFlowRoutes: [{ fromNodeId: 'a', toNodeId: 'b', capacityPerTick: 10 }],
});
assert.equal(planDeterministicMerchantTravel(economyRouteOnly).code, 'route_definition_missing');

assert.equal(
    planDeterministicMerchantTravel(worldInput({
        transport: { ...wagon, capacity: Number.MAX_SAFE_INTEGER },
        commodities: [{ ...commodities[0], weight: 2 }],
        cargo: [{ commodityId: 'wheat', qty: Number.MAX_SAFE_INTEGER }],
    })).code,
    'arithmetic_overflow'
);

const longLocations = Array.from({ length: 34 }, (_, i) => ({
    id: `n${i}`,
    connectedTo: i < 33 ? [`n${i + 1}`] : [],
}));
assert.equal(
    planDeterministicMerchantTravel(worldInput({
        originLocationId: 'n0',
        destinationLocationId: 'n33',
        locations: longLocations,
    })).code,
    'route_unavailable'
);

const currentTravelSource = fs.readFileSync(path.join(root, 'src', 'deterministicMarketTravel.ts'), 'utf8');
assert(!currentTravelSource.includes('deterministicTravelPlanCore'));
assert(currentTravelSource.includes('elapsedWorldTurns: 0'));
assert(currentTravelSource.includes('fixedCosts: []'));

function findGameRulesFiles(dir) {
    const out = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) { out.push(...findGameRulesFiles(full)); }
        if (entry.isFile() && entry.name === 'game_rules.json') { out.push(full); }
    }
    return out;
}

const bundledRules = findGameRulesFiles(path.join(root, 'sample-scenarios'));
assert(bundledRules.length > 0);
for (const file of bundledRules) {
    const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
    assert.notEqual(raw.merchantTravelMode, 'world_time', file);
    assert.equal(normalizeGameRules(raw).merchantTravelMode, 'instant_free', file);
}

const coreSource = fs.readFileSync(path.join(root, 'src', 'deterministicTravelPlanCore.ts'), 'utf8');
for (const forbidden of [
    "from 'fs'",
    "from 'vscode'",
    'Math.random',
    'Date.now',
    'commitGameState',
    'writeJsonAtomic',
    'RequestGate',
]) {
    assert(!coreSource.includes(forbidden), `pure Core includes forbidden dependency: ${forbidden}`);
}

console.log('NOAI deterministic travel plan core tests passed.');
