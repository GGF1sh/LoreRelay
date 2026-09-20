#!/usr/bin/env node
'use strict';

const {
    applyCartographyReveal,
    parseCartographyReveal,
    listActiveMapItems,
    MAX_REVEAL_REGIONS_PER_TURN,
} = require('../out/cartographyRevealCore');
const {
    buildFogPayload,
    mergeRumoredRegionIdsForFog,
} = require('../out/fogOfWarCore');

let failed = 0;
function fail(msg) { console.error(`FAIL: ${msg}`); failed++; }
function ok(msg) { console.log(`OK: ${msg}`); }

const FORGE = {
    meta: { worldName: 'C9' },
    geography: {
        regions: [
            { id: 'coast_1', name: 'Harbor', type: 'urban', connectedTo: ['forest_1'] },
            { id: 'forest_1', name: 'Greenwood', type: 'forest', connectedTo: ['coast_1', 'peak_1'] },
            { id: 'peak_1', name: 'Iron Peaks', type: 'mountains', connectedTo: ['forest_1'] },
            { id: 'waste_1', name: 'Ashen Wastes', type: 'wasteland', connectedTo: [] },
        ],
        locations: [],
    },
    factions: [],
    loreHistory: [],
    initialNpcs: [],
};

// J2: remote rumor via rumorKnown
{
    const world = { discoveredRegionIds: ['coast_1'] };
    const { world: next, stats } = applyCartographyReveal(world, FORGE, {
        regions: [{ regionId: 'waste_1', strength: 'rumored' }],
    });
    if (!stats || !stats.appliedRumored.includes('waste_1')) {
        fail('remote rumored reveal');
    } else {
        ok('remote rumored → rumorKnown');
    }
    const fog = buildFogPayload(next, FORGE);
    if (!fog.rumoredRegionIds.includes('waste_1')) {
        fail('waste_1 not in rumored fog');
    } else {
        ok('rumorKnown merged into fog payload');
    }
}

// J1: discovered reveal
{
    const world = { discoveredRegionIds: ['coast_1'] };
    const { world: next, stats } = applyCartographyReveal(world, FORGE, {
        regions: [{ regionId: 'peak_1', strength: 'discovered' }],
    });
    if (!next.discoveredRegionIds?.includes('peak_1')) {
        fail('discovered reveal');
    } else {
        ok('map-style discovered reveal');
    }
    if (!stats?.appliedDiscovered.includes('peak_1')) {
        fail('stats discovered');
    }
}

// J3: invalid id drop
{
    const world = { discoveredRegionIds: ['coast_1'] };
    const { world: next, stats } = applyCartographyReveal(world, FORGE, {
        regions: [{ regionId: 'lost_atlantis', strength: 'discovered' }],
    });
    if (next.discoveredRegionIds?.includes('lost_atlantis')) {
        fail('invalid id should not apply');
    } else if (!stats || stats.rejectedCount < 1) {
        fail('rejectedCount');
    } else {
        ok('invalid region id dropped (J3)');
    }
}

// max regions per turn
{
    const world = {};
    const regions = ['coast_1', 'forest_1', 'peak_1', 'waste_1'].map((id) => ({ regionId: id, strength: 'rumored' }));
    const { stats } = applyCartographyReveal(world, FORGE, { regions });
    const applied = (stats?.appliedRumored.length ?? 0) + (stats?.appliedDiscovered.length ?? 0);
    if (applied !== MAX_REVEAL_REGIONS_PER_TURN) {
        fail(`max per turn expected ${MAX_REVEAL_REGIONS_PER_TURN} got ${applied}`);
    } else if (!stats || stats.rejectedCount < 1) {
        fail('overflow rejected');
    } else {
        ok('max 3 regions per turn');
    }
}

// upgrade rumored → discovered + prune rumorKnown
{
    const world = { discoveredRegionIds: ['coast_1'], rumorKnownRegionIds: ['waste_1'] };
    const { world: next } = applyCartographyReveal(world, FORGE, {
        regions: [{ regionId: 'waste_1', strength: 'discovered' }],
    });
    if (!next.discoveredRegionIds?.includes('waste_1')) {
        fail('upgrade to discovered');
    } else if (next.rumorKnownRegionIds?.includes('waste_1')) {
        fail('rumorKnown should prune on discovered');
    } else {
        ok('rumored → discovered upgrade prunes rumorKnown');
    }
}

// grantItems + consumedItemIds
{
    const world = {};
    const { world: next } = applyCartographyReveal(world, FORGE, {
        grantItems: [{ id: 'map_north', name: 'North Map', kind: 'map', consumable: true }],
    });
    if (!next.mapItems?.some((m) => m.id === 'map_north')) {
        fail('grantItems');
    } else {
        ok('grantItems append');
    }
    const { world: after } = applyCartographyReveal(next, FORGE, {
        consumedItemIds: ['map_north'],
    });
    if (listActiveMapItems(after).some((m) => m.id === 'map_north')) {
        fail('consumed item should hide from active list');
    } else if (!after.mapItemsConsumed?.includes('map_north')) {
        fail('mapItemsConsumed');
    } else {
        ok('consumedItemIds');
    }
}

// parseCartographyReveal
{
    const parsed = parseCartographyReveal({
        regions: [{ regionId: 'peak_1', strength: 'discovered', source: 'merchant' }],
        grantItems: [{ id: 'm1', name: 'Chart', kind: 'map' }],
    });
    if (!parsed?.regions?.[0]?.regionId || !parsed.grantItems?.[0]?.id) {
        fail('parseCartographyReveal');
    } else {
        ok('parseCartographyReveal');
    }
}

// mergeRumoredRegionIdsForFog direct
{
    const merged = mergeRumoredRegionIdsForFog(['coast_1'], ['waste_1'], FORGE);
    if (!merged.includes('forest_1') || !merged.includes('waste_1')) {
        fail(`merge rumored: ${JSON.stringify(merged)}`);
    } else {
        ok('mergeRumoredRegionIdsForFog');
    }
}

if (failed > 0) {
    console.error(`\n${failed} test(s) failed.`);
    process.exit(1);
}
console.log('\nAll cartographyRevealCore tests passed.');