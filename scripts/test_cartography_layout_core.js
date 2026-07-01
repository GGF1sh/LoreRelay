#!/usr/bin/env node
'use strict';

const {
    buildCartographyLayoutSpec,
    buildCartographyPositivePrompt,
    buildCartographyLoraPromptPrefix,
    buildCartographyNegativePrompt,
    resolveCartographyThemeStyle,
    buildCartographyPinPositions,
    buildCartographyRegionLabels,
    MAX_CARTOGRAPHY_LAYOUT_REGIONS,
    MAX_CARTOGRAPHY_LAYOUT_LOCATIONS,
    mapCoordToPixel,
    mapCoordToPercent,
    BIOME_LAYOUT_RGB,
} = require('../out/cartographyLayoutCore');

let failed = 0;
function fail(msg) { console.error(`FAIL: ${msg}`); failed++; }
function ok(msg) { console.log(`OK: ${msg}`); }

const forge = {
    meta: { worldName: 'Test Realm', theme: 'dungeon-crawler' },
    geography: {
        regions: [
            { id: 'sea_1', name: 'Deep Sea', type: 'ocean', biome: 'sea', x: 80, y: 500, connectedTo: ['coast_1'] },
            { id: 'coast_1', name: 'Harbor', type: 'urban', biome: 'coast', x: 220, y: 480, connectedTo: ['sea_1', 'forest_1'] },
            { id: 'forest_1', name: 'Greenwood', type: 'forest', biome: 'forest', x: 500, y: 400, connectedTo: ['coast_1', 'peak_1'] },
            { id: 'peak_1', name: 'Iron Peaks', type: 'mountains', biome: 'mountain', x: 780, y: 260, connectedTo: ['forest_1'] },
        ],
        locations: [
            { id: 'port_a', name: 'Port A', type: 'settlement', regionId: 'coast_1' },
            { id: 'port_b', name: 'Port B', type: 'settlement', regionId: 'coast_1' },
            { id: 'camp', name: 'Camp', type: 'wilderness', regionId: 'forest_1' },
        ],
    },
    factions: [],
    loreHistory: [],
    initialNpcs: [],
};

const spec = buildCartographyLayoutSpec(forge, 1024);
if (spec.regions.length !== 4) { fail(`expected 4 layout regions, got ${spec.regions.length}`); }
else { ok('layout spec region count'); }

if (spec.edges.length !== 3) { fail(`expected 3 edges, got ${spec.edges.length}`); }
else { ok('layout spec edge dedup'); }

if (mapCoordToPixel(500, 1024) !== 512) { fail(`mapCoordToPixel center: ${mapCoordToPixel(500, 1024)}`); }
else { ok('mapCoordToPixel center'); }

if (Math.abs(mapCoordToPercent(250) - 25) > 0.01) { fail('mapCoordToPercent'); }
else { ok('mapCoordToPercent'); }

const pos = buildCartographyPositivePrompt(spec);
if (!pos.includes('Test Realm') || !pos.includes('overworld') || !pos.includes('no labels')) { fail('positive prompt missing keywords'); }
else { ok('positive prompt'); }

const mapcraftPrefix = buildCartographyLoraPromptPrefix('Mapcraft_Illustrious_v1.safetensors', 'scifi');
if (!mapcraftPrefix.includes('mapcraft') || !mapcraftPrefix.includes('sci-fi')) { fail('mapcraft lora prefix'); }
else { ok('mapcraft lora prefix'); }

const posLora = buildCartographyPositivePrompt(spec, 'Mapcraft_Illustrious_v1.safetensors');
if (!posLora.startsWith('mapcraft')) { fail('positive prompt with lora'); }
else { ok('positive prompt with lora'); }

const neg = buildCartographyNegativePrompt('dungeon-crawler');
if (!neg.includes('star chart') || !neg.includes('magic circle')) { fail('negative prompt'); }
else { ok('negative prompt'); }

const cyber = resolveCartographyThemeStyle('cyberpunk');
if (!cyber.mapType.includes('cyberpunk')) { fail('cyberpunk theme style'); }
else { ok('cyberpunk theme style'); }

const postapoc = resolveCartographyThemeStyle('postapoc');
if (!postapoc.mapType.includes('post-apocalyptic')) { fail('postapoc theme style'); }
else { ok('postapoc theme style'); }

const regionLabels = buildCartographyRegionLabels(forge);
if (regionLabels.length !== 4) { fail(`region label count ${regionLabels.length}`); }
else { ok('region labels count'); }

const pins = buildCartographyPinPositions(forge);
if (pins.length !== 3) { fail(`pin count ${pins.length}`); }
else { ok('pin positions count'); }

const portA = pins.find((p) => p.locationId === 'port_a');
const portB = pins.find((p) => p.locationId === 'port_b');
if (!portA || !portB) { fail('missing port pins'); }
else if (portA.leftPct === portB.leftPct && portA.topPct === portB.topPct) {
    fail('same-region pins should offset');
} else {
    ok('same-region pin offset');
}

if (!BIOME_LAYOUT_RGB.sea || BIOME_LAYOUT_RGB.sea.length !== 3) { fail('biome rgb'); }
else { ok('biome layout colors'); }

const manyRegionsForge = {
    meta: { worldName: 'Big', theme: 'fantasy' },
    geography: {
        regions: Array.from({ length: 30 }, (_, i) => ({
            id: `r${i}`, name: `R${i}`, type: 'plains', biome: 'plains', x: 100 + i * 10, y: 500, connectedTo: [],
        })),
        locations: Array.from({ length: 150 }, (_, i) => ({
            id: `l${i}`, name: `L${i}`, type: 'settlement', regionId: 'r0',
        })),
    },
    factions: [],
    loreHistory: [],
    initialNpcs: [],
};
const cappedSpec = buildCartographyLayoutSpec(manyRegionsForge);
if (cappedSpec.regions.length !== MAX_CARTOGRAPHY_LAYOUT_REGIONS) {
    fail(`layout regions capped at ${MAX_CARTOGRAPHY_LAYOUT_REGIONS}, got ${cappedSpec.regions.length}`);
} else { ok('layout regions capped'); }
const cappedPins = buildCartographyPinPositions(manyRegionsForge);
if (cappedPins.length !== MAX_CARTOGRAPHY_LAYOUT_LOCATIONS) {
    fail(`layout pins capped at ${MAX_CARTOGRAPHY_LAYOUT_LOCATIONS}, got ${cappedPins.length}`);
} else { ok('layout location pins capped'); }

if (failed > 0) { process.exit(1); }
console.log('All cartography layout core tests passed.');