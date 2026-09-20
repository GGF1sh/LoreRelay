#!/usr/bin/env node
'use strict';

const {
    deriveRumoredRegionIds,
    resolveLocationRegionId,
    getRegionFogVisibility,
    applyFogOnLocationVisit,
    normalizeFogWorldState,
    buildFogPayload,
    maskCartographyPinsForFog,
    maskCartographyRegionLabelsForFog,
    listUnexploredRegionNames,
} = require('../out/fogOfWarCore');

let failed = 0;
function fail(msg) { console.error(`FAIL: ${msg}`); failed++; }
function ok(msg) { console.log(`OK: ${msg}`); }

const FORGE = {
    meta: { worldName: 'Fog Test' },
    geography: {
        regions: [
            { id: 'coast_1', name: 'Harbor', type: 'urban', connectedTo: ['forest_1', 'sea_1'] },
            { id: 'forest_1', name: 'Greenwood', type: 'forest', connectedTo: ['coast_1', 'peak_1'] },
            { id: 'peak_1', name: 'Iron Peaks', type: 'mountains', connectedTo: ['forest_1'] },
            { id: 'sea_1', name: 'Deep Sea', type: 'ocean', connectedTo: ['coast_1'] },
        ],
        locations: [
            { id: 'port_a', name: 'Port A', type: 'settlement', regionId: 'coast_1' },
            { id: 'camp', name: 'Camp', type: 'wilderness', regionId: 'forest_1' },
            { id: 'summit', name: 'Summit', type: 'landmark', regionId: 'peak_1' },
        ],
    },
    factions: [],
    loreHistory: [],
    initialNpcs: [],
};

// resolveLocationRegionId
{
    const region = resolveLocationRegionId(FORGE, 'port_a');
    if (region !== 'coast_1') { fail(`resolveLocationRegionId: got ${region}`); }
    else { ok('resolveLocationRegionId'); }
}

// deriveRumoredRegionIds — neighbors of discovered minus discovered
{
    const rumored = deriveRumoredRegionIds(['coast_1'], FORGE.geography.regions);
    const expected = ['forest_1', 'sea_1'].sort();
    if (JSON.stringify(rumored) !== JSON.stringify(expected)) {
        fail(`deriveRumoredRegionIds: got ${JSON.stringify(rumored)}, expected ${JSON.stringify(expected)}`);
    } else { ok('deriveRumoredRegionIds from coast'); }

    const rumored2 = deriveRumoredRegionIds(['coast_1', 'forest_1'], FORGE.geography.regions);
    if (!rumored2.includes('peak_1') || rumored2.includes('coast_1') || rumored2.includes('forest_1')) {
        fail(`deriveRumoredRegionIds step2: ${JSON.stringify(rumored2)}`);
    } else { ok('deriveRumoredRegionIds excludes discovered'); }
}

// getRegionFogVisibility
{
    const discovered = new Set(['coast_1']);
    const rumored = new Set(['forest_1']);
    if (getRegionFogVisibility('coast_1', discovered, rumored) !== 'discovered') { fail('visibility discovered'); }
    else if (getRegionFogVisibility('forest_1', discovered, rumored) !== 'rumored') { fail('visibility rumored'); }
    else if (getRegionFogVisibility('peak_1', discovered, rumored) !== 'unknown') { fail('visibility unknown'); }
    else { ok('getRegionFogVisibility'); }
}

// applyFogOnLocationVisit — idempotent visit tracking
{
    let world = {};
    world = applyFogOnLocationVisit(world, FORGE, 'port_a');
    if (!world.visitedLocationIds?.includes('port_a')) { fail('visitedLocationIds not updated'); }
    else if (!world.discoveredRegionIds?.includes('coast_1')) { fail('discoveredRegionIds not updated'); }
    else { ok('applyFogOnLocationVisit first visit'); }

    const again = applyFogOnLocationVisit(world, FORGE, 'port_a');
    if (again.visitedLocationIds.length !== 1) { fail('applyFogOnLocationVisit should be idempotent'); }
    else { ok('applyFogOnLocationVisit idempotent'); }

    const moved = applyFogOnLocationVisit(world, FORGE, 'camp');
    if (!moved.visitedLocationIds.includes('camp') || !moved.discoveredRegionIds.includes('forest_1')) {
        fail('applyFogOnLocationVisit second region');
    } else { ok('applyFogOnLocationVisit second region'); }
}

// normalizeFogWorldState — backward compat seeds from currentLocationId
{
    const normalized = normalizeFogWorldState({}, FORGE, 'port_a');
    if (!normalized?.discoveredRegionIds?.includes('coast_1')) {
        fail('normalizeFogWorldState seed');
    } else if (!normalized.visitedLocationIds?.includes('port_a')) {
        fail('normalizeFogWorldState visited seed');
    } else { ok('normalizeFogWorldState backward compat'); }
}

// buildFogPayload + masking (Q3)
{
    const world = { discoveredRegionIds: ['coast_1'], visitedLocationIds: ['port_a'] };
    const fog = buildFogPayload(world, FORGE);
    if (!fog.rumoredRegionIds.includes('forest_1')) { fail('buildFogPayload rumored'); }
    else { ok('buildFogPayload'); }

    const pins = [
        { locationId: 'port_a', locationName: 'Port A', regionId: 'coast_1', leftPct: 10, topPct: 20 },
        { locationId: 'camp', locationName: 'Camp', regionId: 'forest_1', leftPct: 30, topPct: 40 },
        { locationId: 'summit', locationName: 'Summit', regionId: 'peak_1', leftPct: 50, topPct: 60 },
    ];
    const masked = maskCartographyPinsForFog(pins, FORGE, fog);
    if (masked[0].locationName !== 'Port A') { fail('mask pins discovered'); }
    else if (masked[1].locationName !== '?') { fail('mask pins rumored'); }
    else if (masked[2].locationName !== '') { fail('mask pins unknown'); }
    else { ok('maskCartographyPinsForFog'); }

    const labels = [
        { regionId: 'coast_1', regionName: 'Harbor', leftPct: 1, topPct: 2 },
        { regionId: 'peak_1', regionName: 'Iron Peaks', leftPct: 3, topPct: 4 },
    ];
    const maskedLabels = maskCartographyRegionLabelsForFog(labels, fog);
    if (maskedLabels[0].regionName !== 'Harbor') { fail('mask labels discovered'); }
    else if (maskedLabels[1].regionName !== '') { fail('mask labels unknown'); }
    else { ok('maskCartographyRegionLabelsForFog'); }
}

// connectedTo missing — no crash (backward compat)
{
    const sparseForge = {
        ...FORGE,
        geography: {
            regions: [{ id: 'r1', name: 'R1', type: 'other' }],
            locations: [{ id: 'l1', name: 'L1', type: 'other', regionId: 'r1' }],
        },
    };
    const rumored = deriveRumoredRegionIds(['r1'], sparseForge.geography.regions);
    if (rumored.length !== 0) { fail('sparse connectedTo should yield empty rumored'); }
    else { ok('connectedTo missing backward compat'); }
}

// listUnexploredRegionNames (PR6)
{
    const names = listUnexploredRegionNames(FORGE, ['coast_1']);
    if (!names.includes('Greenwood') || names.includes('Harbor')) { fail('listUnexploredRegionNames'); }
    else { ok('listUnexploredRegionNames'); }
}

// determinism
{
    const a = deriveRumoredRegionIds(['coast_1', 'forest_1'], FORGE.geography.regions);
    const b = deriveRumoredRegionIds(['coast_1', 'forest_1'], FORGE.geography.regions);
    if (JSON.stringify(a) !== JSON.stringify(b)) { fail('deriveRumoredRegionIds not deterministic'); }
    else { ok('deterministic rumored derivation'); }
}

if (failed > 0) {
    console.error(`\n${failed} test(s) failed.`);
    process.exit(1);
}
console.log('\nAll fogOfWarCore tests passed.');