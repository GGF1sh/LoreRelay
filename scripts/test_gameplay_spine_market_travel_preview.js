#!/usr/bin/env node
'use strict';

// NOAI-GAMEPLAY-SPINE-003: market-travel query/preview/witness focused tests.

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const adapterPath = path.join(root, 'out', 'gameplaySpineMarketTravelAdapterCore.js');
const plannerPath = path.join(root, 'out', 'deterministicTravelPlanCore.js');
for (const file of [adapterPath, plannerPath]) {
    assert(fs.existsSync(file), `${file} missing; run npm.cmd run compile`);
}

const {
    MARKET_TRAVEL_ACTION_KEY,
    MARKET_TRAVEL_ACTION_VERSION,
    MARKET_TRAVEL_PREVIEW_VERSION,
    MARKET_TRAVEL_VISIBILITY_BOUNDARY,
    projectMarketTravelQueryPublic,
    queryMarketTravelPreview,
    validateMarketTravelPreviewWitness,
} = require(adapterPath);

function clone(value) { return JSON.parse(JSON.stringify(value)); }

const locations = [
    { id: 'a', regionId: 'north', connectedTo: ['b'] },
    { id: 'b', regionId: 'north', connectedTo: ['a', 'c'] },
    { id: 'c', regionId: 'south', connectedTo: ['b'] },
];
const transports = [
    { id: 'wagon', name: 'Wagon', capacity: 20, speed: 1, foodPerDay: 2 },
    { id: 'cart', name: 'Cart', capacity: 12, speed: 1, foodPerDay: 1 },
];
const commodities = [
    { id: 'wheat', name: 'Wheat', basePrice: 10, weight: 1 },
    { id: 'spice', name: 'Spice', basePrice: 30, weight: 0.5 },
];

function worldInput(overrides = {}) {
    const input = {
        requestId: 'travel_preview_001',
        destinationLocationId: 'c',
        game: {
            stateRevision: 7,
            currentLocationId: 'a',
            availableFood: 30,
            selectedTransportId: 'wagon',
            cargo: [
                { commodityId: 'wheat', qty: 3 },
                { commodityId: 'spice', qty: 2 },
            ],
        },
        world: { stateRevision: 4, worldTurn: 11 },
        rules: { merchantTravelMode: 'world_time' },
        locations: clone(locations),
        transportDefinitions: clone(transports),
        commodityDefinitions: clone(commodities),
    };
    return {
        ...input,
        ...overrides,
        game: { ...input.game, ...(overrides.game || {}) },
        world: { ...input.world, ...(overrides.world || {}) },
        rules: { ...input.rules, ...(overrides.rules || {}) },
    };
}

// 1. Available world-time plan maps losslessly into a bounded public preview.
const baseInput = worldInput();
const baseBefore = clone(baseInput);
const available = queryMarketTravelPreview(baseInput);
assert.equal(available.admission.status, 'ready');
assert.equal(available.actionKey, 'commerce:travel_market');
assert.equal(MARKET_TRAVEL_ACTION_KEY, 'commerce:travel_market');
assert.equal(available.actionVersion, MARKET_TRAVEL_ACTION_VERSION);
assert.equal(available.previewVersion, MARKET_TRAVEL_PREVIEW_VERSION);
assert.deepStrictEqual(available.mechanicalPreview.pathLocationIds, ['a', 'b', 'c']);
assert.deepStrictEqual(available.mechanicalPreview.timeCost, { clock: 'world', amount: 2 });
assert.deepStrictEqual(available.mechanicalPreview.food, { before: 30, cost: 4, after: 26 });
assert.equal(available.mechanicalPreview.cargoWeight, 4);
assert.equal(available.mechanicalPreview.capacity, 20);
assert.equal(available.mechanicalPreview.predictedPricesIncluded, false);
assert.equal(available.confirmation.policy, 'explicit');
assert(/^[a-z0-9_]{1,24}\.[A-Za-z0-9_-]{43}$/.test(available.confirmation.token));
assert(available.confirmation.token.length < 80);
assert.deepStrictEqual(baseInput, baseBefore, 'query must not mutate canonical inputs');
assert.deepStrictEqual(available.internal.sourcePlan, {
    ok: true,
    status: 'available',
    mode: 'world_time',
    originLocationId: 'a',
    destinationLocationId: 'c',
    pathLocationIds: ['a', 'b', 'c'],
    transportId: 'wagon',
    cargoWeight: 4,
    capacity: 20,
    travelDuration: 2,
    elapsedWorldTurns: 2,
    foodBefore: 30,
    foodCost: 4,
    foodAfter: 26,
});

// 2. Compatibility mode remains an honest zero-time/zero-food-cost preview.
const instantInput = worldInput({ rules: { merchantTravelMode: 'instant_free' } });
delete instantInput.transportDefinitions[0].foodPerDay;
const instant = queryMarketTravelPreview(instantInput);
assert.equal(instant.admission.status, 'ready');
assert.equal(instant.mechanicalPreview.sourcePlanStatus, 'compatibility_instant_plan');
assert.equal(instant.mechanicalPreview.timeCost.amount, 0);
assert.equal(instant.mechanicalPreview.travelDuration, 0);
assert.equal(instant.mechanicalPreview.food.cost, 0);
assert.equal(instant.mechanicalPreview.food.before, 30);
assert.equal(instant.mechanicalPreview.food.after, 30);

// 3. Every authoritative planner failure code remains unavailable and never becomes success.
const failureCases = new Map();
failureCases.set('invalid_origin', worldInput({ game: { currentLocationId: 'missing' } }));
failureCases.set('invalid_destination', worldInput({ destinationLocationId: 'missing' }));
failureCases.set('same_location', worldInput({ destinationLocationId: 'a' }));
failureCases.set('transport_missing', worldInput({ game: { selectedTransportId: undefined } }));
failureCases.set('transport_invalid', worldInput({
    transportDefinitions: [{ ...transports[0], speed: 0 }],
}));
failureCases.set('route_definition_missing', worldInput({
    locations: [{ id: 'a' }, { id: 'c' }],
}));
failureCases.set('route_definition_invalid', worldInput({
    locations: [{ id: 'a', connectedTo: ['c'] }, { id: 'a', connectedTo: ['a'] }, { id: 'c', connectedTo: ['a'] }],
}));
failureCases.set('route_unavailable', worldInput({
    locations: [{ id: 'a', connectedTo: [] }, { id: 'c', connectedTo: [] }],
}));
failureCases.set('cargo_invalid', worldInput({ game: { cargo: [{ commodityId: 'wheat', qty: -1 }] } }));
failureCases.set('commodity_missing', worldInput({ game: { cargo: [{ commodityId: 'ore', qty: 1 }] } }));
failureCases.set('over_capacity', worldInput({ game: { cargo: [{ commodityId: 'wheat', qty: 21 }] } }));
const foodMissing = worldInput();
delete foodMissing.game.availableFood;
failureCases.set('food_missing', foodMissing);
failureCases.set('food_invalid', worldInput({ game: { availableFood: -1 } }));
failureCases.set('insufficient_food', worldInput({ game: { availableFood: 1 } }));
failureCases.set('arithmetic_overflow', worldInput({
    game: { cargo: [{ commodityId: 'wheat', qty: Number.MAX_SAFE_INTEGER }] },
    transportDefinitions: [{ ...transports[0], capacity: Number.MAX_SAFE_INTEGER }],
    commodityDefinitions: [{ ...commodities[0], weight: 2 }],
}));

for (const [expectedCode, input] of failureCases) {
    const query = queryMarketTravelPreview(input);
    assert.notEqual(query.admission.status, 'ready', expectedCode);
    assert.equal(query.admission.reasonCode, expectedCode);
    assert.equal(query.unavailable.reasonCode, expectedCode);
    assert.equal(query.internal.sourcePlan.code, expectedCode);
    assert.equal(query.mechanicalPreview, undefined);
    assert.equal(query.confirmation, undefined);
}

// 4-7. Identical material state, cargo reordering, and location-array reordering normalize.
const identical = queryMarketTravelPreview(clone(baseInput));
assert.deepStrictEqual(identical, available);
const cargoReordered = worldInput({ game: { cargo: [...baseInput.game.cargo].reverse() } });
assert.equal(queryMarketTravelPreview(cargoReordered).confirmation.token, available.confirmation.token);
const locationsReordered = worldInput({ locations: [...locations].reverse().map(clone) });
assert.equal(queryMarketTravelPreview(locationsReordered).confirmation.token, available.confirmation.token);

// 8. Internal witness contains bounded game/world/rules evidence.
const witness = available.internal.witness;
assert.deepStrictEqual(witness.ledgerIds, ['game_state', 'world_state']);
assert.deepStrictEqual(witness.game.cargo, [
    { commodityId: 'spice', qty: 2 },
    { commodityId: 'wheat', qty: 3 },
]);
assert.equal(witness.game.currentLocationId, 'a');
assert.equal(witness.game.availableFood, 30);
assert.equal(witness.game.selectedTransportId, 'wagon');
assert.equal(witness.game.stateRevision, 7);
assert.equal(witness.world.worldTurn, 11);
assert.equal(witness.world.stateRevision, 4);
assert.equal(witness.rules.merchantTravelMode, 'world_time');
for (const digest of [
    witness.game.cargoDigest,
    witness.world.routeDefinitionDigest,
    witness.rules.transportDefinitionDigest,
    witness.rules.commodityDefinitionsDigest,
    witness.planDigest,
]) {
    assert(/^[a-f0-9]{64}$/.test(digest));
}

// 9. Public projection removes raw/internal evidence and hidden categories.
const publicQuery = projectMarketTravelQueryPublic(available);
function collectKeys(value, out = new Set()) {
    if (Array.isArray(value)) {
        for (const entry of value) { collectKeys(entry, out); }
    } else if (value && typeof value === 'object') {
        for (const [key, entry] of Object.entries(value)) {
            out.add(key);
            collectKeys(entry, out);
        }
    }
    return out;
}
const publicKeys = collectKeys(publicQuery);
for (const forbiddenKey of [
    'internal', 'sourcePlan', 'stateRevision', 'cargoDigest', 'routeDefinitionDigest',
    'transportDefinitionDigest', 'commodityDefinitionsDigest', 'planDigest',
    'rawLedgerHash', 'npcRegistry', 'filesystemPath', 'providerData', 'hiddenRequirements',
]) {
    assert(!publicKeys.has(forbiddenKey), `public projection exposed ${forbiddenKey}`);
}
assert.equal(publicQuery.confirmation.token, available.confirmation.token);
assert.deepStrictEqual(MARKET_TRAVEL_VISIBILITY_BOUNDARY.internal, ['internal.witness', 'internal.sourcePlan']);

function expectStale(mutator, code) {
    const current = clone(baseInput);
    mutator(current);
    assert.deepStrictEqual(validateMarketTravelPreviewWitness(available, current), { valid: false, code });
}

// 10-16. Material changes receive stable, specific stale codes.
expectStale((v) => { v.game.currentLocationId = 'b'; }, 'stale_location');
expectStale((v) => { v.game.availableFood = 29; }, 'stale_food');
expectStale((v) => { v.game.cargo[0].qty = 4; }, 'stale_cargo');
expectStale((v) => { v.game.selectedTransportId = 'cart'; }, 'stale_transport');
expectStale((v) => { v.world.worldTurn = 12; }, 'stale_world_turn');
expectStale((v) => { v.locations[1].connectedTo = ['a']; }, 'stale_route_definition');
expectStale((v) => { v.rules.merchantTravelMode = 'instant_free'; }, 'stale_rules');
expectStale((v) => { v.transportDefinitions[0].foodPerDay = 3; }, 'stale_rules');
expectStale((v) => { v.commodityDefinitions[0].weight = 2; }, 'stale_rules');
expectStale((v) => { v.game.stateRevision = 8; }, 'stale_game_revision');
expectStale((v) => { v.world.stateRevision = 5; }, 'stale_world_revision');
assert.deepStrictEqual(validateMarketTravelPreviewWitness(available, clone(baseInput)), { valid: true, code: 'valid' });

// 17. Action/preview contract mismatch fails before stale comparisons.
const wrongVersion = clone(available);
wrongVersion.previewVersion += 1;
assert.deepStrictEqual(
    validateMarketTravelPreviewWitness(wrongVersion, clone(baseInput)),
    { valid: false, code: 'preview_version_mismatch' }
);

// 18. Confirmation token tampering is rejected.
const tampered = clone(available);
tampered.confirmation.token = `${tampered.confirmation.token}x`;
assert.deepStrictEqual(
    validateMarketTravelPreviewWitness(tampered, clone(baseInput)),
    { valid: false, code: 'invalid_confirmation_token' }
);

// 19/21. Pure modules have no locale/time/random, I/O, persistence, or gate dependencies.
for (const file of ['gameplaySpinePreviewCore.ts', 'gameplaySpineMarketTravelAdapterCore.ts']) {
    const source = fs.readFileSync(path.join(root, 'src', file), 'utf8');
    for (const forbidden of [
        "from 'fs'", "from 'vscode'", 'Date.now', 'new Date', 'Math.random',
        'localeCompare', 'toLocale', 'Intl.', 'commitGameState', 'saveWorldState',
        'saveNpcRegistry', 'writeJsonAtomic', 'RequestGate', 'MutationGate',
    ]) {
        assert(!source.includes(forbidden), `${file} includes forbidden dependency: ${forbidden}`);
    }
}

// 20. Production market travel remains the independent instant/free host path.
const productionTravelSource = fs.readFileSync(path.join(root, 'src', 'deterministicMarketTravel.ts'), 'utf8');
assert(!productionTravelSource.includes('gameplaySpineMarketTravelAdapterCore'));
assert(!productionTravelSource.includes('queryMarketTravelPreview'));
assert(productionTravelSource.includes('elapsedWorldTurns: 0'));
assert(productionTravelSource.includes('fixedCosts: []'));

function findGameRulesFiles(dir) {
    const out = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) { out.push(...findGameRulesFiles(full)); }
        if (entry.isFile() && entry.name === 'game_rules.json') { out.push(full); }
    }
    return out;
}
for (const file of findGameRulesFiles(path.join(root, 'sample-scenarios'))) {
    const rules = JSON.parse(fs.readFileSync(file, 'utf8'));
    assert.notEqual(rules.merchantTravelMode, 'world_time', file);
}

// 22. Slice 003 does not import or alter Slice 001/002 behavior contracts.
const adapterSource = fs.readFileSync(path.join(root, 'src', 'gameplaySpineMarketTravelAdapterCore.ts'), 'utf8');
assert(!adapterSource.includes('gameplaySpineVehicleAdapterCore'));
assert(!adapterSource.includes('gameplaySpineCheckCore'));

console.log('Gameplay Spine market travel preview witness tests passed.');
