#!/usr/bin/env node
/**
 * Unit tests for worldMapGenerator.ts (generateWorldMap).
 * No vscode dependency — requires: npm run compile.
 */
const { generateWorldMap } = require('../out/worldMapGenerator');

let failed = 0;

function fail(msg) {
    console.error(`FAIL: ${msg}`);
    failed++;
}

function ok(msg) {
    console.log(`OK: ${msg}`);
}

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const FORGE = {
    geography: {
        regions: [
            { id: 'upper_catacombs', name: 'Upper Catacombs', type: 'dungeon', dangerLevel: 3, connectedTo: ['deep_vault'] },
            { id: 'deep_vault', name: 'Deep Vault', type: 'dungeon', dangerLevel: 8, connectedTo: ['upper_catacombs'] }
        ],
        locations: [
            { id: 'entrance_hall', name: 'Entrance Hall', type: 'landmark', regionId: 'upper_catacombs', factionControl: 'grave_watchers' },
            { id: 'ritual_chamber', name: 'Ritual Chamber', type: 'dungeon', regionId: 'deep_vault', factionControl: 'undead_legion' },
            { id: 'archive_room', name: 'Archive Room', type: 'landmark', regionId: 'upper_catacombs' }
        ]
    },
    factions: [
        { id: 'undead_legion', name: 'Undead Legion', type: 'hostile', power: 80, enemies: ['grave_watchers'] },
        { id: 'grave_watchers', name: 'Grave Watchers', type: 'neutral', power: 40, enemies: ['undead_legion'] }
    ]
};

// ---------------------------------------------------------------------------
// Basic structure
// ---------------------------------------------------------------------------

{
    const mmd = generateWorldMap(FORGE);
    if (typeof mmd !== 'string') {
        fail('generateWorldMap should return a string');
        process.exit(1);
    }
    ok('generateWorldMap returns string');

    if (!mmd.startsWith('graph TD')) {
        fail(`output should start with "graph TD", got: "${mmd.slice(0, 30)}"`);
    } else {
        ok('output starts with "graph TD"');
    }

    if (!mmd.includes('subgraph')) {
        fail('output should contain subgraph for regions');
    } else {
        ok('regions rendered as subgraphs');
    }

    if (!mmd.includes('classDef faction')) {
        fail('output should contain faction classDef');
    } else {
        ok('faction classDef present');
    }

    if (!mmd.includes('classDef phantom')) {
        fail('output should contain phantom classDef');
    } else {
        ok('phantom classDef present');
    }
}

// ---------------------------------------------------------------------------
// Current location gets ★ marker
// ---------------------------------------------------------------------------

{
    const mmd = generateWorldMap(FORGE, 'entrance_hall');
    if (!mmd.includes('★')) {
        fail('current location should have ★ marker');
    } else {
        ok('current location marked with ★');
    }

    // Other locations should not have ★
    const starCount = (mmd.match(/★/g) || []).length;
    if (starCount !== 1) {
        fail(`exactly 1 ★ expected, got ${starCount}`);
    } else {
        ok('exactly 1 ★ in output');
    }

    // Non-current location should not have ★
    if (mmd.includes('★') && mmd.includes('ritual_chamber') && mmd.match(/ritual_chamber\["★/)) {
        fail('non-current location should not have ★');
    } else {
        ok('non-current locations have no ★');
    }
}

// ---------------------------------------------------------------------------
// Region danger level in label
// ---------------------------------------------------------------------------

{
    const mmd = generateWorldMap(FORGE);
    // dangerLevel 3 should appear in upper_catacombs subgraph label
    if (!mmd.includes('3/10') && !mmd.includes('危険:3')) {
        fail('region danger level 3 should appear in map');
    } else {
        ok('region danger level shown in label');
    }
    if (!mmd.includes('8/10') && !mmd.includes('危険:8')) {
        fail('region danger level 8 should appear in map');
    } else {
        ok('region danger level 8 shown');
    }
}

// ---------------------------------------------------------------------------
// Live region danger overrides static value
// ---------------------------------------------------------------------------

{
    const regionStates = {
        upper_catacombs: { dangerLevel: 6, controllingFaction: 'grave_watchers' },
        deep_vault: { dangerLevel: 9.5, controllingFaction: 'undead_legion' }
    };
    const mmd = generateWorldMap(FORGE, undefined, regionStates);

    // Live danger 6 should appear (not static 3)
    if (!mmd.includes('6/10') && !mmd.includes('危険:6')) {
        fail('live region danger 6 should override static 3');
    } else {
        ok('live region danger overrides static value');
    }
}

// ---------------------------------------------------------------------------
// Faction power in node label
// ---------------------------------------------------------------------------

{
    const mmd = generateWorldMap(FORGE);
    // Faction nodes should show power
    if (!mmd.includes('80') || !mmd.includes('40')) {
        fail('faction power should appear in faction nodes');
    } else {
        ok('faction power shown in faction nodes');
    }
}

// ---------------------------------------------------------------------------
// Live faction power overrides static
// ---------------------------------------------------------------------------

{
    const factionStates = {
        undead_legion: { power: 65, morale: 60 },
        grave_watchers: { power: 52, morale: 70 }
    };
    const mmd = generateWorldMap(FORGE, undefined, undefined, factionStates);
    if (!mmd.includes('65') || !mmd.includes('52')) {
        fail('live faction power (65, 52) should override static values (80, 40)');
    } else {
        ok('live faction power overrides static in Mermaid');
    }
}

// ---------------------------------------------------------------------------
// ID special characters escaped
// ---------------------------------------------------------------------------

{
    const forgeWithSpecialId = {
        geography: {
            regions: [{ id: 'my-region.1', name: 'My Region', type: 'other', connectedTo: [] }],
            locations: [{ id: 'loc-1.x', name: 'Loc', type: 'other', regionId: 'my-region.1' }]
        },
        factions: []
    };
    const mmd = generateWorldMap(forgeWithSpecialId);
    // Special chars should be replaced with underscore in node IDs
    if (mmd.includes('my-region.1[') || mmd.includes('loc-1.x[')) {
        fail('special chars in IDs should be escaped to underscores');
    } else {
        ok('special chars in IDs escaped');
    }
    // Subgraph label should still have the real name
    if (!mmd.includes('My Region')) {
        fail('region name should appear in subgraph label');
    } else {
        ok('region name preserved in label');
    }
}

// ---------------------------------------------------------------------------
// Label truncation (max 40 chars)
// ---------------------------------------------------------------------------

{
    const longName = 'A'.repeat(60);
    const forgeWithLong = {
        geography: {
            regions: [],
            locations: [{ id: 'loc1', name: longName, type: 'other' }]
        },
        factions: [{ id: 'fac1', name: longName, type: 'hostile', power: 50 }]
    };
    const mmd = generateWorldMap(forgeWithLong);
    // The 60-char name should be truncated to 40 in labels
    if (mmd.includes(longName)) {
        fail('60-char name should be truncated in label');
    } else {
        ok('long name truncated in label');
    }
}

// ---------------------------------------------------------------------------
// Region connection edges
// ---------------------------------------------------------------------------

{
    const mmd = generateWorldMap(FORGE);
    // upper_catacombs → deep_vault connection should exist
    if (!mmd.includes('upper_catacombs --> deep_vault') && !mmd.includes('upper_catacombs-->deep_vault')) {
        fail('region connection edge should appear');
    } else {
        ok('region connection edges rendered');
    }
}

// ---------------------------------------------------------------------------
// Faction control edges (dashed)
// ---------------------------------------------------------------------------

{
    const mmd = generateWorldMap(FORGE);
    // Faction nodes should have control edges to locations
    if (!mmd.includes('-.->')) {
        fail('faction control edges (dashed) should appear');
    } else {
        ok('faction control edges rendered');
    }
}

// ---------------------------------------------------------------------------
// Orphan locations (no regionId)
// ---------------------------------------------------------------------------

{
    const forgeWithOrphan = {
        geography: {
            regions: [],
            locations: [{ id: 'orphan', name: 'Orphan Town', type: 'settlement' }]
        },
        factions: []
    };
    const mmd = generateWorldMap(forgeWithOrphan);
    if (!mmd.includes('orphan')) {
        fail('orphan location (no regionId) should still appear in map');
    } else {
        ok('orphan location (no regionId) rendered at top level');
    }
}

// ---------------------------------------------------------------------------
// Phase 2: Size limits — MAX_REGIONS=20, MAX_LOCS_PER_REGION=10, MAX_ORPHAN_LOCS=10
// ---------------------------------------------------------------------------

{
    // 30 regions → only first 20 rendered
    const bigForge = {
        geography: {
            regions: Array.from({ length: 30 }, (_, i) => ({
                id: `region_${i}`, name: `Region ${i}`, type: 'dungeon'
            })),
            locations: []
        },
        factions: []
    };
    const mmd = generateWorldMap(bigForge);
    const subgraphCount = (mmd.match(/subgraph /g) || []).length;
    if (subgraphCount > 20) {
        fail(`regions should be capped at 20, got ${subgraphCount} subgraphs`);
    } else {
        ok(`30 regions capped to ≤20 subgraphs (got ${subgraphCount})`);
    }
}

{
    // 15 locations per region → only first 10 rendered
    const denseForge = {
        geography: {
            regions: [{ id: 'region_a', name: 'Dense Region', type: 'dungeon' }],
            locations: Array.from({ length: 15 }, (_, i) => ({
                id: `loc_${i}`, name: `Loc ${i}`, type: 'landmark', regionId: 'region_a'
            }))
        },
        factions: []
    };
    const mmd = generateWorldMap(denseForge);
    // Count loc_ node appearances (each rendered as loc_N[...])
    const locCount = (mmd.match(/loc_\d+\[/g) || []).length;
    if (locCount > 10) {
        fail(`locations per region should be capped at 10, got ${locCount}`);
    } else {
        ok(`15 locs/region capped to ≤10 (got ${locCount})`);
    }
}

{
    // 15 orphan locations → only first 10 rendered
    const orphanForge = {
        geography: {
            regions: [],
            locations: Array.from({ length: 15 }, (_, i) => ({
                id: `orphan_${i}`, name: `Orphan ${i}`, type: 'settlement'
            }))
        },
        factions: []
    };
    const mmd = generateWorldMap(orphanForge);
    const orphanCount = (mmd.match(/orphan_\d+\[/g) || []).length;
    if (orphanCount > 10) {
        fail(`orphan locations should be capped at 10, got ${orphanCount}`);
    } else {
        ok(`15 orphan locs capped to ≤10 (got ${orphanCount})`);
    }
}

{
    // Region connection edge to a truncated (>20) region should not appear
    const edgeForge = {
        geography: {
            regions: [
                ...Array.from({ length: 20 }, (_, i) => ({
                    id: `region_${i}`, name: `Region ${i}`, type: 'dungeon', connectedTo: []
                })),
                { id: 'region_20', name: 'Region 20', type: 'dungeon', connectedTo: [] },
            ],
            locations: []
        },
        factions: []
    };
    // region_0 connects to region_20 (which is truncated)
    edgeForge.geography.regions[0].connectedTo = ['region_20'];
    const mmd = generateWorldMap(edgeForge);
    if (mmd.includes('region_0 --> region_20') || mmd.includes('region_0-->region_20')) {
        fail('edge to truncated region_20 should not appear in output');
    } else {
        ok('connection edges to truncated regions are dropped');
    }
}

// ---------------------------------------------------------------------------
// Result
// ---------------------------------------------------------------------------

if (failed > 0) {
    process.exit(1);
}
console.log('All world map generator tests passed.');
