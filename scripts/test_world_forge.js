#!/usr/bin/env node
/**
 * Unit tests for worldForgeCore.ts (parseWorldForge).
 * No vscode dependency — runs in plain Node.js.
 */
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
// Null / invalid input
// ---------------------------------------------------------------------------

if (parseWorldForge(null) !== undefined) {
    fail('null input should return undefined');
} else {
    ok('null input → undefined');
}

if (parseWorldForge('string') !== undefined) {
    fail('string input should return undefined');
} else {
    ok('string input → undefined');
}

if (parseWorldForge([]) !== undefined) {
    fail('array input should return undefined');
} else {
    ok('array input → undefined');
}

if (parseWorldForge({}) !== undefined) {
    fail('empty object (no worldName) should return undefined');
} else {
    ok('empty object (no meta.worldName) → undefined');
}

if (parseWorldForge({ meta: { worldName: '' } }) !== undefined) {
    fail('empty worldName should return undefined');
} else {
    ok('empty worldName → undefined');
}

// ---------------------------------------------------------------------------
// Minimal valid forge
// ---------------------------------------------------------------------------

const minimal = parseWorldForge({ meta: { worldName: 'Test World' } });
if (!minimal || minimal.meta.worldName !== 'Test World') {
    fail('minimal forge worldName');
} else {
    ok('minimal forge worldName');
}
if (!minimal || !Array.isArray(minimal.factions) || minimal.factions.length !== 0) {
    fail('minimal forge factions default empty array');
} else {
    ok('minimal forge factions default empty array');
}
if (!minimal || !Array.isArray(minimal.geography.regions)) {
    fail('minimal forge geography.regions array');
} else {
    ok('minimal forge geography.regions array');
}

// ---------------------------------------------------------------------------
// Region type normalization
// ---------------------------------------------------------------------------

const forgeWithRegions = parseWorldForge({
    meta: { worldName: 'World' },
    geography: {
        regions: [
            { id: 'r1', name: 'Valid', type: 'dungeon', dangerLevel: 5 },
            { id: 'r2', name: 'Bad Type', type: 'invalid_type' },
            { id: 'no_id_or_name', type: 'dungeon' }
        ]
    }
});
if (!forgeWithRegions) {
    fail('forge with regions should parse');
} else {
    ok('forge with regions parses');
    if (forgeWithRegions.geography.regions[0].type !== 'dungeon') {
        fail('valid region type kept');
    } else {
        ok('valid region type kept');
    }
    if (forgeWithRegions.geography.regions[1].type !== 'other') {
        fail('invalid region type falls back to "other"');
    } else {
        ok('invalid region type → "other"');
    }
    if (forgeWithRegions.geography.regions.some(r => !r.id || !r.name)) {
        fail('region without id/name should be dropped');
    } else {
        ok('region without id/name dropped');
    }
    if (forgeWithRegions.geography.regions[0].dangerLevel !== 5) {
        fail('dangerLevel preserved as number');
    } else {
        ok('dangerLevel preserved');
    }
}

// ---------------------------------------------------------------------------
// Location type normalization
// ---------------------------------------------------------------------------

const forgeWithLocs = parseWorldForge({
    meta: { worldName: 'World' },
    geography: {
        locations: [
            { id: 'loc1', name: 'Settlement', type: 'settlement', population: 200 },
            { id: 'loc2', name: 'Bad', type: 'not_a_type' },
            { name: 'No ID' }
        ]
    }
});
if (!forgeWithLocs) {
    fail('forge with locations should parse');
} else {
    ok('forge with locations parses');
    if (forgeWithLocs.geography.locations[0].type !== 'settlement') {
        fail('valid location type kept');
    } else {
        ok('valid location type kept');
    }
    if (forgeWithLocs.geography.locations[1].type !== 'other') {
        fail('invalid location type → "other"');
    } else {
        ok('invalid location type → "other"');
    }
    if (forgeWithLocs.geography.locations.some(l => !l.id)) {
        fail('location without id should be dropped');
    } else {
        ok('location without id dropped');
    }
    if (forgeWithLocs.geography.locations[0].population !== 200) {
        fail('population preserved');
    } else {
        ok('population preserved');
    }
}

// ---------------------------------------------------------------------------
// Faction type normalization
// ---------------------------------------------------------------------------

const forgeWithFactions = parseWorldForge({
    meta: { worldName: 'World' },
    factions: [
        { id: 'f1', name: 'Hostile', type: 'hostile', power: 80 },
        { id: 'f2', name: 'Unknown', type: 'unknown_type' },
        { id: 'f3', name: 'Ally', type: 'friendly', resources: { food: 30, mana: 10 } },
        { name: 'No ID' }
    ]
});
if (!forgeWithFactions) {
    fail('forge with factions should parse');
} else {
    ok('forge with factions parses');
    if (forgeWithFactions.factions[0].type !== 'hostile') {
        fail('valid faction type kept');
    } else {
        ok('valid faction type kept');
    }
    if (forgeWithFactions.factions[1].type !== 'neutral') {
        fail('invalid faction type → "neutral"');
    } else {
        ok('invalid faction type → "neutral"');
    }
    if (forgeWithFactions.factions[0].power !== 80) {
        fail('faction power preserved');
    } else {
        ok('faction power preserved');
    }
    if (!forgeWithFactions.factions[2].resources || forgeWithFactions.factions[2].resources.food !== 30) {
        fail('faction resources parsed');
    } else {
        ok('faction resources parsed');
    }
    if (forgeWithFactions.factions.some(f => !f.id)) {
        fail('faction without id dropped');
    } else {
        ok('faction without id dropped');
    }
}

// ---------------------------------------------------------------------------
// Lore history + initialNpcs
// ---------------------------------------------------------------------------

const forgeWithLore = parseWorldForge({
    meta: { worldName: 'World', theme: 'dark-fantasy', worldSeed: 'seed-001' },
    loreHistory: [
        { era: 'Ancient', yearsBefore: 500, event: 'Empire falls' },
        { event: 'No era' },
        { era: 'No event' }
    ],
    initialNpcs: [
        { id: 'npc1', name: 'Elder', role: 'quest-giver', locationId: 'loc1', factionId: 'f1' },
        { name: 'No ID' }
    ]
});
if (!forgeWithLore) {
    fail('forge with lore should parse');
} else {
    ok('forge with lore parses');
    if (forgeWithLore.meta.theme !== 'dark-fantasy') {
        fail('theme preserved');
    } else {
        ok('theme preserved');
    }
    if (forgeWithLore.loreHistory.length !== 2) {
        fail('lore without event dropped, 2 valid entries kept');
    } else {
        ok('lore entry without event dropped');
    }
    if (forgeWithLore.loreHistory[0].yearsBefore !== 500) {
        fail('loreHistory yearsBefore preserved');
    } else {
        ok('loreHistory yearsBefore preserved');
    }
    if (forgeWithLore.initialNpcs.length !== 1) {
        fail('initialNpc without id dropped');
    } else {
        ok('initialNpc without id dropped');
    }
    if (forgeWithLore.initialNpcs[0].role !== 'quest-giver') {
        fail('initialNpc role preserved');
    } else {
        ok('initialNpc role preserved');
    }
}

// ---------------------------------------------------------------------------
// Result
// ---------------------------------------------------------------------------

if (failed > 0) {
    process.exit(1);
}
console.log('All world forge tests passed.');
