#!/usr/bin/env node
'use strict';

// NOAI-GAMEPLAY-SPINE-004: typed market-travel EffectPlan and legacy parity tests.

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');

const root = path.join(__dirname, '..');
const out = path.join(root, 'out');
const previewAdapterPath = path.join(out, 'gameplaySpineMarketTravelAdapterCore.js');
const effectAdapterPath = path.join(out, 'gameplaySpineMarketTravelEffectPlanAdapterCore.js');
const productionTravelPath = path.join(out, 'deterministicMarketTravel.js');
for (const file of [previewAdapterPath, effectAdapterPath, productionTravelPath]) {
    assert(fs.existsSync(file), `${file} missing; run npm.cmd run compile`);
}

const { queryMarketTravelPreview } = require(previewAdapterPath);
const {
    MARKET_TRAVEL_EFFECT_PLAN_VERSION,
    buildMarketTravelEffectPlan,
    compareInstantMarketTravelLegacyParity,
    projectInstantMarketTravelEffectPlanFacts,
    projectMarketTravelEffectPlanPublic,
} = require(effectAdapterPath);

const originalLoad = Module._load;
Module._load = function(request) {
    if (request === 'vscode') {
        return {
            workspace: { workspaceFolders: [], getConfiguration: () => ({ get: (_key, fallback) => fallback }) },
            window: {},
            Uri: { file: (value) => ({ fsPath: value }) },
        };
    }
    return originalLoad.apply(this, arguments);
};
const { previewMarketTravel } = require(productionTravelPath);
Module._load = originalLoad;

function clone(value) { return JSON.parse(JSON.stringify(value)); }

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

function canonicalInput(mode = 'world_time', overrides = {}) {
    const input = {
        requestId: `effect_plan_${mode}`,
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
        rules: { merchantTravelMode: mode },
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

function availablePlan(input) {
    const preview = queryMarketTravelPreview(input);
    assert.equal(preview.admission.status, 'ready');
    const result = buildMarketTravelEffectPlan(preview, input);
    assert.equal(result.status, 'available');
    return { preview, plan: result.plan };
}

function expectUnavailable(preview, input, code) {
    assert.deepStrictEqual(buildMarketTravelEffectPlan(preview, input), {
        status: 'unavailable',
        code,
    });
}

// 1-4. Compatibility mode creates exactly one game_state location intention.
const instantInput = canonicalInput('instant_free');
const instantInputBefore = clone(instantInput);
const instantPreview = queryMarketTravelPreview(instantInput);
const instantPreviewBefore = clone(instantPreview);
const instantResult = buildMarketTravelEffectPlan(instantPreview, instantInput);
assert.equal(instantResult.status, 'available');
const instantPlan = instantResult.plan;
assert.equal(instantPlan.planVersion, MARKET_TRAVEL_EFFECT_PLAN_VERSION);
assert.deepStrictEqual(instantPlan.admission, { sourceStatus: 'ready' });
assert.deepStrictEqual(instantPlan.confirmation, { policy: 'explicit', status: 'validated' });
assert.deepStrictEqual(instantPlan.touchedLedgers, ['game_state']);
assert.deepStrictEqual(instantPlan.potentialExpansionLedgers, []);
assert.equal(instantPlan.effects.length, 1);
assert.deepStrictEqual(instantPlan.effects[0], {
    order: 0,
    effectType: 'set_current_location',
    ledgerId: 'game_state',
    target: { kind: 'location', id: 'c' },
    beforeLocationId: 'a',
    afterLocationId: 'c',
});
assert(!instantPlan.effects.some((effect) => effect.effectType === 'set_travel_food'));
assert(!instantPlan.effects.some((effect) => effect.effectType === 'advance_clock'));
assert.equal(instantPlan.publicSummary.worldTimeSpan, null);
assert.equal(instantPlan.publicSummary.food.cost, 0);
assert.deepStrictEqual(instantInput, instantInputBefore, 'canonical input changed');
assert.deepStrictEqual(instantPreview, instantPreviewBefore, 'prior preview changed');

// 5/28. Compare bounded facts from the real production preview without invoking its writer.
function productionPreviewFacts() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'noai-gs4-parity-'));
    const gamePath = path.join(dir, 'game_state.json');
    fs.writeFileSync(gamePath, JSON.stringify({
        entries: [],
        world: { currentLocationId: 'a' },
        commerce: { credits: 0, food: 30, cargo: [], transportId: 'wagon' },
    }));
    let writeCalls = 0;
    const forge = {
        format: 'lorerelay-world-forge/1.0',
        meta: { worldName: 'Parity' },
        geography: {
            regions: [{ id: 'north', name: 'North', type: 'other' }, { id: 'south', name: 'South', type: 'other' }],
            locations: [
                { id: 'a', name: 'A', type: 'settlement', regionId: 'north' },
                { id: 'c', name: 'C', type: 'settlement', regionId: 'south' },
            ],
        },
        factions: [], loreHistory: [], initialNpcs: [],
    };
    const rawForge = {
        ...forge,
        commerce: {
            commodities: clone(commodities),
            markets: [{ locationId: 'a', commodityIds: ['wheat'] }, { locationId: 'c', commodityIds: ['spice'] }],
            transportKinds: [{ id: 'wagon', name: 'Wagon', capacity: 20, speed: 1 }],
        },
    };
    const deps = {
        loadGameRules: () => ({ enableCommerce: true, enableWorldForge: true }),
        isWorldForgeEnabled: () => true,
        loadWorldForge: () => forge,
        loadWorldForgeDocument: () => rawForge,
        loadWorldState: () => ({ worldTurn: 11, factions: {}, regions: {}, recentChanges: [], markets: {} }),
        getGameStatePath: () => gamePath,
        commitGameState: () => { writeCalls++; throw new Error('writer must not be called'); },
        readStateRevision: () => 1,
    };
    try {
        const preview = previewMarketTravel('c', deps);
        assert.equal(preview.ok, true);
        assert.equal(writeCalls, 0, 'production writer was invoked');
        return {
            mode: 'instant_free',
            originLocationId: preview.current.id,
            destinationLocationId: preview.destination.id,
            elapsedWorldTurns: preview.elapsedWorldTurns,
            fixedCosts: preview.fixedCosts,
            foodBefore: 30,
            foodAfter: 30,
            mutatedLedgers: ['game_state'],
            worldMutationClaimed: false,
            npcMutationClaimed: false,
        };
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
}
const legacyFacts = productionPreviewFacts();
assert.deepStrictEqual(projectInstantMarketTravelEffectPlanFacts(instantPlan), legacyFacts);
assert.deepStrictEqual(compareInstantMarketTravelLegacyParity(instantPlan, legacyFacts), {
    matches: true,
    code: 'match',
});

// 6-8. Timed mode carries bounded location, food, and requested-world-clock intentions only.
const worldInput = canonicalInput('world_time');
const { preview: worldPreview, plan: worldPlan } = availablePlan(worldInput);
assert.deepStrictEqual(worldPlan.effects, [
    {
        order: 0,
        effectType: 'set_current_location',
        ledgerId: 'game_state',
        target: { kind: 'location', id: 'c' },
        beforeLocationId: 'a',
        afterLocationId: 'c',
    },
    {
        order: 1,
        effectType: 'set_travel_food',
        ledgerId: 'game_state',
        target: { kind: 'commerce_food' },
        before: 30,
        cost: 4,
        after: 26,
    },
    {
        order: 2,
        effectType: 'advance_clock',
        ledgerId: 'world_state',
        target: { kind: 'clock', clock: 'world' },
        span: { clock: 'world', amount: 2 },
    },
]);
assert.deepStrictEqual(worldPlan.touchedLedgers, ['game_state', 'world_state']);
assert.deepStrictEqual(worldPlan.potentialExpansionLedgers, ['npc_registry']);
assert.deepStrictEqual(worldPlan.publicSummary.worldTimeSpan, { clock: 'world', amount: 2 });
assert.equal(worldPlan.publicSummary.predictedMarketResultsIncluded, false);
assert.equal(worldPlan.publicSummary.predictedNpcResultsIncluded, false);
assert.equal(worldPlan.publicSummary.predictedEventResultsIncluded, false);
for (const forbidden of ['marketValues', 'npcChanges', 'events', 'quests', 'relationships', 'worldTurnAfter']) {
    assert(!collectKeys(worldPlan).has(forbidden), `timed plan fabricated ${forbidden}`);
}

// 9-17. Slice 003 validation supplies exact stale/version/token failure codes.
function expectStale(mutator, code) {
    const current = clone(worldInput);
    mutator(current);
    expectUnavailable(worldPreview, current, code);
}
expectStale((value) => { value.game.currentLocationId = 'b'; }, 'stale_location');
expectStale((value) => { value.game.availableFood = 29; }, 'stale_food');
expectStale((value) => { value.game.cargo[0].qty = 4; }, 'stale_cargo');
expectStale((value) => { value.game.selectedTransportId = 'cart'; }, 'stale_transport');
expectStale((value) => { value.world.worldTurn = 12; }, 'stale_world_turn');
expectStale((value) => { value.locations[1].connectedTo = ['a']; }, 'stale_route_definition');
expectStale((value) => { value.rules.merchantTravelMode = 'instant_free'; }, 'stale_rules');
expectStale((value) => { value.game.stateRevision = 8; }, 'stale_game_revision');
expectStale((value) => { value.world.stateRevision = 5; }, 'stale_world_revision');
const wrongVersion = clone(worldPreview);
wrongVersion.previewVersion += 1;
expectUnavailable(wrongVersion, clone(worldInput), 'preview_version_mismatch');
const wrongToken = clone(worldPreview);
wrongToken.confirmation.token += 'x';
expectUnavailable(wrongToken, clone(worldInput), 'invalid_confirmation_token');

// 18. A planner-rejected/unavailable preview cannot become an EffectPlan.
const rejectedInput = canonicalInput('world_time', { destinationLocationId: 'a' });
const rejectedPreview = queryMarketTravelPreview(rejectedInput);
assert.notEqual(rejectedPreview.admission.status, 'ready');
expectUnavailable(rejectedPreview, rejectedInput, 'preview_unavailable');

// Embedded source-plan or public mechanical tampering is not accepted after witness validation.
const sourceTampered = clone(worldPreview);
sourceTampered.internal.sourcePlan.foodAfter = 25;
expectUnavailable(sourceTampered, clone(worldInput), 'invalid_effect_plan_inputs');
const mechanicalTampered = clone(worldPreview);
mechanicalTampered.mechanicalPreview.food.after = 25;
expectUnavailable(mechanicalTampered, clone(worldInput), 'invalid_effect_plan_inputs');

// 19-22. Determinism, immutability, and canonical ordering.
const repeatInput = clone(worldInput);
const repeatPreview = queryMarketTravelPreview(repeatInput);
const repeat = buildMarketTravelEffectPlan(repeatPreview, repeatInput);
assert.deepStrictEqual(repeat, { status: 'available', plan: worldPlan });
assert.deepStrictEqual(worldPlan.effects.map((effect) => effect.order), [0, 1, 2]);
assert.deepStrictEqual(worldPlan.effects.map((effect) => effect.effectType), [
    'set_current_location', 'set_travel_food', 'advance_clock',
]);
assert.deepStrictEqual(worldPlan.touchedLedgers, ['game_state', 'world_state']);

// 23. Public projection exposes summary/token but no witness, revisions, or digests.
const publicPlan = projectMarketTravelEffectPlanPublic(worldPlan);
assert.equal(publicPlan.sourcePreview.confirmationToken, worldPreview.confirmation.token);
const publicKeys = collectKeys(publicPlan);
for (const forbidden of [
    'internal', 'effects', 'previewWitness', 'sourcePreviewVersion', 'stateRevision',
    'cargo', 'cargoDigest', 'routeDefinitionDigest', 'transportDefinitionDigest',
    'commodityDefinitionsDigest', 'planDigest', 'locations', 'transportDefinitions',
    'commodityDefinitions', 'rawLedgerHash', 'filesystemPath', 'providerData', 'hiddenRequirements',
]) {
    assert(!publicKeys.has(forbidden), `public plan exposed ${forbidden}`);
}

// 24. Plans contain no commit, persistence, receipt, event, narration, or rollback result fields.
const planKeys = collectKeys(worldPlan);
for (const forbidden of [
    'persisted', 'committed', 'succeeded', 'rollbackComplete', 'receiptId',
    'eventEmitted', 'narrationGenerated', 'commitId', 'commitStatus',
]) {
    assert(!planKeys.has(forbidden), `EffectPlan contains forbidden result field ${forbidden}`);
}

// 25. New pure modules contain no host, write, clock, random, persistence, or gate dependency.
for (const file of ['gameplaySpineEffectPlanCore.ts', 'gameplaySpineMarketTravelEffectPlanAdapterCore.ts']) {
    const source = fs.readFileSync(path.join(root, 'src', file), 'utf8');
    for (const forbidden of [
        "from 'fs'", "from 'vscode'", 'Date.now', 'new Date', 'Math.random',
        'localeCompare', 'toLocale', 'Intl.', 'commitGameState', 'saveWorldState',
        'saveNpcRegistry', 'writeJsonAtomic', 'RequestGate', 'MutationGate',
    ]) {
        assert(!source.includes(forbidden), `${file} includes forbidden dependency: ${forbidden}`);
    }
}

// 26-28. Slice 003/vehicle/check remain independent; production host is still instant/free.
const productionSource = fs.readFileSync(path.join(root, 'src', 'deterministicMarketTravel.ts'), 'utf8');
assert(!productionSource.includes('gameplaySpineMarketTravelEffectPlanAdapterCore'));
assert(!productionSource.includes('buildMarketTravelEffectPlan'));
assert(productionSource.includes('elapsedWorldTurns: 0'));
assert(productionSource.includes('fixedCosts: []'));
assert(productionSource.includes('commitGameState(nextGame'));
assert(!productionSource.includes('saveWorldState'));
assert(!productionSource.includes('saveNpcRegistry'));
for (const file of [
    'gameplaySpineMarketTravelAdapterCore.ts',
    'gameplaySpineVehicleAdapterCore.ts',
    'gameplaySpineCheckCore.ts',
    'extension.ts',
]) {
    const source = fs.readFileSync(path.join(root, 'src', file), 'utf8');
    assert(!source.includes('gameplaySpineMarketTravelEffectPlanAdapterCore'), `${file} imports Slice 004`);
    assert(!source.includes('buildMarketTravelEffectPlan'), `${file} executes Slice 004`);
}

// 29. Bundled scenarios remain compatibility mode (no timed-travel opt-in).
function findRulesFiles(dir) {
    const found = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) { found.push(...findRulesFiles(full)); }
        if (entry.isFile() && entry.name === 'game_rules.json') { found.push(full); }
    }
    return found;
}
for (const file of findRulesFiles(path.join(root, 'sample-scenarios'))) {
    const rules = JSON.parse(fs.readFileSync(file, 'utf8'));
    assert.notEqual(rules.merchantTravelMode, 'world_time', file);
}

console.log('Gameplay Spine market travel EffectPlan tests passed.');
