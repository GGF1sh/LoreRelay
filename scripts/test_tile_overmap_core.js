#!/usr/bin/env node
'use strict';

const {
    buildTileOvermap,
    hashStringToSeed,
    TILE_OVERMAP_SIZE,
    TILE_BIOME_CODES,
    TILE_CODE_SET,
} = require('../out/tileOvermapCore');

let failed = 0;
function fail(msg) { console.error(`FAIL: ${msg}`); failed++; }
function ok(msg) { console.log(`OK: ${msg}`); }

function makeForge(overrides = {}) {
    return {
        meta: { worldName: 'Tile Realm', worldSeed: 'tile-realm-seed', theme: 'dark-fantasy' },
        geography: {
            regions: [
                { id: 'sea_1', name: 'Deep Sea', type: 'ocean', biome: 'sea', x: 100, y: 500, connectedTo: ['forest_1'] },
                { id: 'forest_1', name: 'Greenwood', type: 'forest', biome: 'forest', x: 500, y: 400, connectedTo: ['sea_1', 'peak_1'] },
                { id: 'peak_1', name: 'Iron Peaks', type: 'mountains', biome: 'mountain', x: 800, y: 250, connectedTo: ['forest_1'] },
            ],
            locations: [
                { id: 'camp', name: 'Camp', type: 'wilderness', regionId: 'forest_1' },
            ],
        },
        factions: [],
        loreHistory: [],
        initialNpcs: [],
        ...overrides,
    };
}

// --- dimensions & encoding ---
const forge = makeForge();
const om = buildTileOvermap(forge);
if (om.cols !== TILE_OVERMAP_SIZE || om.rows !== TILE_OVERMAP_SIZE) {
    fail(`grid dims ${om.cols}x${om.rows}, expected ${TILE_OVERMAP_SIZE}`);
} else { ok('grid dimensions'); }

if (om.tileRows.length !== om.rows || om.tileRows.some((r) => r.length !== om.cols)) {
    fail('tileRows shape mismatch');
} else { ok('tileRows shape'); }

const badChars = new Set();
for (const row of om.tileRows) {
    for (const ch of row) {
        if (!TILE_CODE_SET.has(ch)) { badChars.add(ch); }
    }
}
if (badChars.size > 0) { fail(`invalid tile codes: ${[...badChars].join(',')}`); }
else { ok('all tile codes valid'); }

// --- determinism ---
const om2 = buildTileOvermap(makeForge());
if (JSON.stringify(om) !== JSON.stringify(om2)) { fail('same forge should yield identical overmap'); }
else { ok('deterministic for same forge'); }

const omOtherSeed = buildTileOvermap(makeForge({ meta: { worldName: 'Tile Realm', worldSeed: 'other-seed' } }));
if (JSON.stringify(om.tileRows) === JSON.stringify(omOtherSeed.tileRows)) {
    fail('different worldSeed should change the grid');
} else { ok('seed changes grid'); }

if (hashStringToSeed('a') === hashStringToSeed('b')) { fail('hashStringToSeed collision on trivial input'); }
else { ok('hashStringToSeed'); }

// --- region coverage: the sea region center area should contain sea tiles ---
const seaCx = Math.floor((100 / 1000) * om.cols);
const seaCy = Math.floor((500 / 1000) * om.rows);
let seaHits = 0;
for (let dy = -2; dy <= 2; dy++) {
    for (let dx = -2; dx <= 2; dx++) {
        const x = seaCx + dx, y = seaCy + dy;
        if (x < 0 || y < 0 || x >= om.cols || y >= om.rows) { continue; }
        if (om.tileRows[y][x] === TILE_BIOME_CODES.sea) { seaHits++; }
    }
}
if (seaHits < 10) { fail(`sea region center should be mostly sea tiles (got ${seaHits}/25)`); }
else { ok('sea region coverage'); }

// --- roads ---
if (om.roads.length === 0) { fail('expected road tiles from connectedTo edges'); }
else { ok('roads generated'); }
if (om.roads.some(([x, y]) => x < 0 || y < 0 || x >= om.cols || y >= om.rows)) {
    fail('road tile out of bounds');
} else { ok('roads in bounds'); }
const roadKeys = new Set(om.roads.map(([x, y]) => `${x},${y}`));
if (roadKeys.size !== om.roads.length) { fail('duplicate road tiles'); }
else { ok('roads deduplicated'); }

// --- ocean border only for worlds that have water regions ---
const landForge = makeForge();
landForge.meta = { worldName: 'Dry Realm', worldSeed: 'dry-realm' };
landForge.geography.regions = [
    { id: 'p1', name: 'Plains', type: 'wilderness', biome: 'plains', x: 300, y: 500, connectedTo: [] },
    { id: 'd1', name: 'Dunes', type: 'other', biome: 'desert', x: 700, y: 500, connectedTo: [] },
];
const dryOm = buildTileOvermap(landForge);
let dryHasSea = false;
for (const row of dryOm.tileRows) {
    if (row.includes(TILE_BIOME_CODES.sea)) { dryHasSea = true; break; }
}
if (dryHasSea) { fail('landlocked world must not get an ocean border'); }
else { ok('no ocean border on landlocked world'); }

// --- empty world fallback ---
const emptyForge = makeForge();
emptyForge.meta = { worldName: 'Empty', worldSeed: 'empty' };
emptyForge.geography.regions = [];
emptyForge.geography.locations = [];
const emptyOm = buildTileOvermap(emptyForge);
if (emptyOm.tileRows.length !== emptyOm.rows || emptyOm.roads.length !== 0) {
    fail('empty world should yield a filled fallback grid with no roads');
} else { ok('empty world fallback'); }

// --- hazard scatter overlay ---
const hazardForge = makeForge();
hazardForge.meta = { worldName: 'Hazard Realm', worldSeed: 'hazard-realm' };
hazardForge.geography.regions = [
    { id: 'glow_1', name: 'Glow Flats', type: 'other', biome: 'wasteland', x: 300, y: 500, hazard: 'radiation', connectedTo: [] },
    { id: 'safe_1', name: 'Safe Vale', type: 'wilderness', biome: 'plains', x: 700, y: 500, connectedTo: [] },
];
const hazardOm = buildTileOvermap(hazardForge);
const radGroup = hazardOm.hazards.find((h) => h.hazard === 'radiation');
if (!radGroup || radGroup.tiles.length === 0) { fail('hazard scatter should produce radiation tiles'); }
else { ok(`hazard scatter produced ${radGroup.tiles.length} radiation tiles`); }
if (hazardOm.hazards.length !== 1) { fail(`only the hazardous region should scatter (got ${hazardOm.hazards.length} groups)`); }
else { ok('non-hazard regions produce no overlay'); }
if (radGroup) {
    const wCode = TILE_BIOME_CODES.wasteland;
    const misplaced = radGroup.tiles.filter(([x, y]) =>
        x < 0 || y < 0 || x >= hazardOm.cols || y >= hazardOm.rows || hazardOm.tileRows[y][x] !== wCode);
    if (misplaced.length > 0) { fail(`hazard tiles must sit on their own region's tiles (${misplaced.length} misplaced)`); }
    else { ok('hazard tiles stay on owner-region tiles'); }
}
const hazardOm2 = buildTileOvermap(JSON.parse(JSON.stringify(hazardForge)));
if (JSON.stringify(hazardOm.hazards) !== JSON.stringify(hazardOm2.hazards)) { fail('hazard scatter should be deterministic'); }
else { ok('hazard scatter deterministic'); }

if (failed > 0) {
    console.error(`\n${failed} test(s) failed`);
    process.exit(1);
}
console.log('\nAll tile overmap core tests passed');
