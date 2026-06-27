#!/usr/bin/env node
/**
 * Unit tests for worldStateCore.ts (parseWorldState, buildInitialWorldState).
 * No vscode dependency — runs in plain Node.js.
 */
const { parseWorldState, buildInitialWorldState } = require('../out/worldStateCore');
const { parseWorldForge } = require('../out/worldForgeCore');

let failed = 0;

function fail(msg) {
    console.error(`FAIL: ${msg}`);
    failed++;
}

function ok(msg) {
    console.log(`OK: ${msg}`);
}

// ---------------------------------------------------------------------------
// parseWorldState — invalid input
// ---------------------------------------------------------------------------

if (parseWorldState(null) !== undefined) {
    fail('null input → undefined');
} else {
    ok('null input → undefined');
}

if (parseWorldState([]) !== undefined) {
    fail('array input → undefined');
} else {
    ok('array input → undefined');
}

// ---------------------------------------------------------------------------
// parseWorldState — valid data
// ---------------------------------------------------------------------------

const raw = {
    format: 'lorerelay-world-state/1.0',
    worldTurn: 5,
    lastSimulatedGmTurn: 5,
    factions: {
        undead: { power: 80, morale: 70, recentEvents: ['event1'], resources: { mana: 50 } },
        watchers: { power: 40 }
    },
    regions: {
        upper: { dangerLevel: 3, controllingFaction: 'watchers', activeEvents: [] },
        deep: { dangerLevel: 8, controllingFaction: 'undead' }
    },
    globalEvents: [
        { id: 'ev1', type: 'magical', severity: 'major', description: 'Seal weakens', turnsRemaining: 10 },
        { description: 'No id' }
    ],
    recentChanges: [
        {
            id: 'wce_5_region_deep',
            worldTurn: 5,
            source: 'simulation',
            category: 'region',
            severity: 'warning',
            regionId: 'deep',
            message: 'Deep grows dangerous',
            mapHighlight: true,
            expiresAfterTurns: 3
        },
        { id: 'bad id', message: 'invalid', category: 'region', severity: 'warning' }
    ],
    pendingWorldEvents: []
};

const parsed = parseWorldState(raw);
if (!parsed) {
    fail('valid world state should parse');
    process.exit(1);
}
ok('valid world state parses');

if (parsed.worldTurn !== 5) { fail('worldTurn preserved'); } else { ok('worldTurn preserved'); }
if (parsed.lastSimulatedGmTurn !== 5) { fail('lastSimulatedGmTurn preserved'); } else { ok('lastSimulatedGmTurn preserved'); }
if (!parsed.factions.undead || parsed.factions.undead.power !== 80) { fail('faction power'); } else { ok('faction power'); }
if (parsed.factions.undead.morale !== 70) { fail('faction morale'); } else { ok('faction morale'); }
if (!parsed.factions.undead.resources || parsed.factions.undead.resources.mana !== 50) { fail('faction resources'); } else { ok('faction resources'); }
if (!parsed.factions.watchers) { fail('second faction parsed'); } else { ok('second faction parsed'); }
if (!parsed.regions || parsed.regions.upper.dangerLevel !== 3) { fail('region dangerLevel'); } else { ok('region dangerLevel'); }
if (parsed.regions.upper.controllingFaction !== 'watchers') { fail('region controllingFaction'); } else { ok('region controllingFaction'); }
if (!parsed.globalEvents || parsed.globalEvents.length !== 1) { fail('globalEvent without id dropped'); } else { ok('globalEvent without id dropped'); }
if (parsed.globalEvents[0].turnsRemaining !== 10) { fail('globalEvent turnsRemaining'); } else { ok('globalEvent turnsRemaining'); }
if (parsed.globalEvents[0].severity !== 'major') { fail('globalEvent severity'); } else { ok('globalEvent severity'); }
if (!parsed.recentChanges || parsed.recentChanges.length !== 1) { fail('recentChanges invalid entries dropped'); } else { ok('recentChanges invalid entries dropped'); }
if (parsed.recentChanges[0]?.regionId !== 'deep') { fail('recentChanges regionId preserved'); } else { ok('recentChanges regionId preserved'); }

// ---------------------------------------------------------------------------
// parseWorldState — invalid event severity falls back
// ---------------------------------------------------------------------------

const withBadSeverity = parseWorldState({
    worldTurn: 0,
    factions: {},
    globalEvents: [{ id: 'ev', description: 'test', severity: 'nuclear_strike', type: 'alien' }]
});
if (withBadSeverity && withBadSeverity.globalEvents[0].severity !== 'minor') {
    fail('invalid severity → "minor"');
} else {
    ok('invalid severity → "minor"');
}
if (withBadSeverity && withBadSeverity.globalEvents[0].type !== 'other') {
    fail('invalid type → "other"');
} else {
    ok('invalid type → "other"');
}

// ---------------------------------------------------------------------------
// buildInitialWorldState — from world_forge.json data
// ---------------------------------------------------------------------------

const forge = parseWorldForge({
    meta: { worldName: 'Catacombs' },
    geography: {
        regions: [
            { id: 'upper', name: 'Upper', type: 'dungeon', dangerLevel: 3 },
            { id: 'deep', name: 'Deep', type: 'dungeon', dangerLevel: 8 }
        ],
        locations: [
            { id: 'hall', name: 'Entrance', type: 'landmark', regionId: 'upper', factionControl: 'watchers' },
            { id: 'ritual', name: 'Ritual', type: 'dungeon', regionId: 'deep', factionControl: 'undead' }
        ]
    },
    factions: [
        { id: 'undead', name: 'Undead Legion', type: 'hostile', power: 80,
          resources: { weapons: 70, mana: 50 }, enemies: ['watchers'] },
        { id: 'watchers', name: 'Grave Watchers', type: 'neutral', power: 40,
          resources: { food: 20 }, enemies: ['undead'] }
    ]
});

if (!forge) {
    fail('test forge should parse');
    process.exit(1);
}

const initial = buildInitialWorldState(forge);

if (!initial) { fail('buildInitialWorldState returns value'); process.exit(1); }
ok('buildInitialWorldState returns value');

if (initial.worldTurn !== 0) { fail('initial worldTurn = 0'); } else { ok('initial worldTurn = 0'); }
if (initial.lastSimulatedGmTurn !== 0) { fail('initial lastSimulatedGmTurn = 0'); } else { ok('initial lastSimulatedGmTurn = 0'); }

// Factions initialized from forge
if (!initial.factions.undead) { fail('undead faction initialized'); } else { ok('undead faction initialized'); }
if (initial.factions.undead.power !== 80) { fail('undead faction power from forge'); } else { ok('undead faction power from forge'); }
if (!initial.factions.undead.resources || initial.factions.undead.resources.mana !== 50) {
    fail('undead faction resources copied');
} else {
    ok('undead faction resources copied');
}
if (initial.factions.undead.morale !== 60) { fail('initial morale = 60'); } else { ok('initial morale = 60'); }
if (!Array.isArray(initial.factions.undead.recentEvents) || initial.factions.undead.recentEvents.length !== 0) {
    fail('initial recentEvents = []');
} else {
    ok('initial recentEvents = []');
}

// Regions initialized from forge
if (!initial.regions || !initial.regions.upper) { fail('upper region initialized'); } else { ok('upper region initialized'); }
if (initial.regions.upper.dangerLevel !== 3) { fail('region dangerLevel from forge'); } else { ok('region dangerLevel from forge'); }
if (initial.regions.deep.dangerLevel !== 8) { fail('deep region dangerLevel from forge'); } else { ok('deep region dangerLevel from forge'); }

// Location factionControl → region controllingFaction
if (initial.regions.upper.controllingFaction !== 'watchers') {
    fail('location factionControl → region controllingFaction (upper→watchers)');
} else {
    ok('location factionControl → region.controllingFaction');
}
if (initial.regions.deep.controllingFaction !== 'undead') {
    fail('deep region controllingFaction = undead');
} else {
    ok('deep region controllingFaction from location');
}

// globalEvents initially empty
if (!Array.isArray(initial.globalEvents) || initial.globalEvents.length !== 0) {
    fail('initial globalEvents = []');
} else {
    ok('initial globalEvents = []');
}

// pendingWorldEvents initially empty
if (!Array.isArray(initial.pendingWorldEvents) || initial.pendingWorldEvents.length !== 0) {
    fail('initial pendingWorldEvents = []');
} else {
    ok('initial pendingWorldEvents = []');
}

if (!Array.isArray(initial.recentChanges) || initial.recentChanges.length !== 0) {
    fail('initial recentChanges = []');
} else {
    ok('initial recentChanges = []');
}

// ---------------------------------------------------------------------------
// Result
// ---------------------------------------------------------------------------

if (failed > 0) {
    process.exit(1);
}
console.log('All world state tests passed.');
