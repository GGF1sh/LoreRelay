#!/usr/bin/env node
/**
 * Unit tests for validateGameState (requires npm run compile).
 */
'use strict';

const path = require('path');
const root = path.join(__dirname, '..');
const validatePath = path.join(root, 'out', 'validateGameState.js');

let failed = 0;
function fail(msg) { console.error(`FAIL: ${msg}`); failed++; }
function ok(msg) { console.log(`OK: ${msg}`); }

if (!require('fs').existsSync(validatePath)) {
    fail('out/validateGameState.js missing — run npm run compile first');
    process.exit(1);
}

const { validateGameState } = require(validatePath);

const MINIMAL = { schemaVersion: 2, entries: [] };

function expectErrors(state, fragments, label) {
    const errors = validateGameState(state);
    const missing = fragments.filter((f) => !errors.some((e) => e.includes(f)));
    if (missing.length > 0) {
        fail(`${label}: expected errors containing [${missing.join(', ')}], got: ${errors.join('; ') || '(none)'}`);
        return;
    }
    ok(label);
}

function expectValid(state, label) {
    const errors = validateGameState(state);
    if (errors.length > 0) {
        fail(`${label}: expected valid, got: ${errors.join('; ')}`);
        return;
    }
    ok(label);
}

expectValid(MINIMAL, 'minimal valid state');

expectValid({
    ...MINIMAL,
    hiddenState: { secretNote: 'boss hp is 3' },
    world: {
        currentLocationId: 'entrance',
        lastGeneratedImage: 'C:/game/images/scene.png',
        lastGeneratedLocationId: 'entrance',
        worldTurnAtLastSync: 4
    },
    npcMemoryUpdates: [{ npcId: 'npc_guard', dispositionDelta: { trust: 1 } }]
}, 'hiddenState + world metadata + npcMemoryUpdates valid');

expectErrors(
    { ...MINIMAL, hiddenState: 'not-an-object' },
    ['hiddenState'],
    'hiddenState must be object'
);

expectErrors(
    { ...MINIMAL, npcMemoryUpdates: [{ npcId: 'bad id' }] },
    ['npcId has invalid format'],
    'npcMemoryUpdates rejects invalid npcId'
);

expectErrors(
    {
        ...MINIMAL,
        world: { lastGeneratedLocationId: 'has space' }
    },
    ['lastGeneratedLocationId'],
    'world.lastGeneratedLocationId format'
);

expectErrors(
    {
        ...MINIMAL,
        world: { lastGeneratedImage: 42 }
    },
    ['lastGeneratedImage'],
    'world.lastGeneratedImage must be string'
);

expectErrors(
    {
        ...MINIMAL,
        world: { worldTurnAtLastSync: 'four' }
    },
    ['worldTurnAtLastSync'],
    'world.worldTurnAtLastSync must be number'
);

expectErrors(
    {
        ...MINIMAL,
        latestImageDescription: 'x'.repeat(1201)
    },
    ['latestImageDescription'],
    'latestImageDescription max length'
);

expectErrors(
    {
        ...MINIMAL,
        status: { hp: { current: NaN, max: Infinity } }
    },
    ['status.hp.current', 'status.hp.max'],
    'status.hp rejects NaN and Infinity'
);

expectErrors(
    {
        ...MINIMAL,
        status: { hp: { current: 50, max: 10 } }
    },
    ['status.hp.current must not exceed max'],
    'status.hp current > max'
);

expectErrors(
    {
        ...MINIMAL,
        hiddenDice: [null]
    },
    ['hiddenDice[0] must be an object'],
    'hiddenDice rejects null elements'
);

expectErrors(
    {
        ...MINIMAL,
        world: { regions: { deep_wastes: { dangerLevel: 11 } } }
    },
    ['dangerLevel must be between 0 and 10'],
    'world.regions dangerLevel above max'
);

expectErrors(
    {
        ...MINIMAL,
        world: { regions: { deep_wastes: { dangerLevel: -1 } } }
    },
    ['dangerLevel must be between 0 and 10'],
    'world.regions dangerLevel below min'
);

expectErrors(
    {
        ...MINIMAL,
        world: { regions: { deep_wastes: { dangerLevel: Infinity } } }
    },
    ['dangerLevel must be between 0 and 10'],
    'world.regions dangerLevel rejects Infinity'
);

expectErrors(
    {
        ...MINIMAL,
        world: { regions: { deep_wastes: { dangerLevel: 'high' } } }
    },
    ['dangerLevel must be a number'],
    'world.regions dangerLevel rejects string'
);

expectValid(
    {
        ...MINIMAL,
        world: { regions: { deep_wastes: { dangerLevel: 7.5 } } }
    },
    'world.regions dangerLevel allows fractional values'
);

expectErrors(
    {
        ...MINIMAL,
        world: { worldTurnAtLastSync: NaN }
    },
    ['worldTurnAtLastSync must be a finite non-negative number'],
    'world.worldTurnAtLastSync rejects NaN'
);

expectErrors(
    {
        ...MINIMAL,
        world: { worldTurnAtLastSync: Infinity }
    },
    ['worldTurnAtLastSync must be a finite non-negative number'],
    'world.worldTurnAtLastSync rejects Infinity'
);

expectErrors(
    {
        ...MINIMAL,
        world: { worldTurnAtLastSync: -3 }
    },
    ['worldTurnAtLastSync must be a finite non-negative number'],
    'world.worldTurnAtLastSync rejects negative'
);

if (failed > 0) {
    process.exit(1);
}
console.log('\nvalidateGameState tests passed.');