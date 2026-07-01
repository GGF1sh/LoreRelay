#!/usr/bin/env node
/**
 * Unit tests for worldForgeGeneratorCore.ts (generateWorldForge).
 * No vscode dependency — requires: npm run compile.
 */
const { generateWorldForge } = require('../out/worldForgeGeneratorCore');

let failed = 0;

function fail(msg) {
    console.error(`FAIL: ${msg}`);
    failed++;
}

function ok(msg) {
    console.log(`OK: ${msg}`);
}

const VALID_BIOMES = new Set([
    'forest', 'desert', 'mountain', 'sea', 'coast', 'city', 'plains', 'swamp',
    'wasteland', 'ruins', 'dungeon', 'underground', 'snow', 'volcanic', 'other',
]);

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

function generate(overrides = {}) {
    return generateWorldForge({
        worldSeed: 'test-seed',
        theme: 'dungeon-crawler',
        regionCount: 5,
        factionCount: 3,
        npcCount: 6,
        ...overrides
    });
}

// ---------------------------------------------------------------------------
// Return structure
// ---------------------------------------------------------------------------

{
    const result = generate();
    if (!result || typeof result !== 'object') {
        fail('generateWorldForge should return an object');
        process.exit(1);
    }
    ok('returns object');
    if (!result.forge) { fail('result has forge'); } else { ok('result.forge exists'); }
    if (typeof result.valid !== 'boolean') { fail('result.valid is boolean'); } else { ok('result.valid is boolean'); }
    if (!Array.isArray(result.warnings)) { fail('result.warnings is array'); } else { ok('result.warnings is array'); }
}

// ---------------------------------------------------------------------------
// Minimum required constraints (§2.5)
// ---------------------------------------------------------------------------

{
    const { forge, valid, warnings } = generate();

    if (!forge.meta.worldName) { fail('worldName non-empty'); } else { ok('worldName non-empty'); }
    if (forge.geography.regions.length < 1) { fail('at least 1 region'); } else { ok('regions.length >= 1'); }
    if (forge.geography.locations.length < 1) { fail('at least 1 location'); } else { ok('locations.length >= 1'); }
    if (forge.factions.length < 2) { fail('at least 2 factions'); } else { ok('factions.length >= 2'); }

    // All location.regionId must reference a real region
    const regionIds = new Set(forge.geography.regions.map((r) => r.id));
    for (const loc of forge.geography.locations) {
        if (loc.regionId && !regionIds.has(loc.regionId)) {
            fail(`location ${loc.id} has invalid regionId ${loc.regionId}`);
        }
    }
    ok('all location.regionId references are valid');

    // All factionControl must reference a real faction
    const factionIds = new Set(forge.factions.map((f) => f.id));
    for (const loc of forge.geography.locations) {
        if (loc.factionControl && !factionIds.has(loc.factionControl)) {
            fail(`location ${loc.id} has invalid factionControl ${loc.factionControl}`);
        }
    }
    ok('all location.factionControl references are valid');

    // All initialNpc.locationId must reference a real location
    const locIds = new Set(forge.geography.locations.map((l) => l.id));
    for (const npc of forge.initialNpcs) {
        if (npc.locationId && !locIds.has(npc.locationId)) {
            fail(`npc ${npc.id} has invalid locationId ${npc.locationId}`);
        }
        if (npc.factionId && !factionIds.has(npc.factionId)) {
            fail(`npc ${npc.id} has invalid factionId ${npc.factionId}`);
        }
    }
    ok('all initialNpc references are valid');

    if (!valid) { fail(`valid=false with warnings: ${warnings.join('; ')}`); } else { ok('valid=true'); }
    if (warnings.length > 0) { fail(`unexpected warnings: ${warnings.join('; ')}`); } else { ok('no warnings'); }
}

// ---------------------------------------------------------------------------
// Determinism — same seed → identical output
// ---------------------------------------------------------------------------

{
    const input = { worldSeed: 'deterministic', theme: 'dark-fantasy', regionCount: 4, factionCount: 3, npcCount: 5 };
    const r1 = generateWorldForge(input);
    const r2 = generateWorldForge(input);
    const normalize = (forge) => ({
        ...forge,
        meta: {
            ...forge.meta,
            generatedAt: '<ignored>',
        },
    });
    const j1 = JSON.stringify(normalize(r1.forge));
    const j2 = JSON.stringify(normalize(r2.forge));
    if (j1 !== j2) {
        fail('same seed must produce identical generated content');
    } else {
        ok('same seed produces identical output');
    }
}

// ---------------------------------------------------------------------------
// Different seeds → different output
// ---------------------------------------------------------------------------

{
    const base = { theme: 'dungeon-crawler', regionCount: 5, factionCount: 3, npcCount: 6 };
    const r1 = generateWorldForge({ ...base, worldSeed: 'alpha' });
    const r2 = generateWorldForge({ ...base, worldSeed: 'beta' });
    if (JSON.stringify(r1.forge) === JSON.stringify(r2.forge)) {
        fail('different seeds should produce different outputs');
    } else {
        ok('different seeds produce different outputs');
    }
}

// ---------------------------------------------------------------------------
// regionCount clamped to [3, 12]
// ---------------------------------------------------------------------------

{
    const { forge } = generateWorldForge({ worldSeed: 'clamp', theme: 'default', regionCount: 1, factionCount: 2, npcCount: 2 });
    if (forge.geography.regions.length < 3) {
        fail(`regionCount below 3 should be clamped to 3, got ${forge.geography.regions.length}`);
    } else {
        ok('regionCount clamped to minimum 3');
    }
}

{
    const { forge } = generateWorldForge({ worldSeed: 'clamp2', theme: 'default', regionCount: 99, factionCount: 2, npcCount: 2 });
    if (forge.geography.regions.length > 12) {
        fail(`regionCount above 12 should be clamped to 12, got ${forge.geography.regions.length}`);
    } else {
        ok('regionCount clamped to maximum 12');
    }
}

// ---------------------------------------------------------------------------
// factionCount clamped to [2, 6]
// ---------------------------------------------------------------------------

{
    const { forge } = generateWorldForge({ worldSeed: 'fc', theme: 'default', regionCount: 3, factionCount: 0, npcCount: 2 });
    if (forge.factions.length < 2) {
        fail(`factionCount below 2 should be clamped, got ${forge.factions.length}`);
    } else {
        ok('factionCount clamped to minimum 2');
    }
}

// ---------------------------------------------------------------------------
// Region count matches input (after clamping)
// ---------------------------------------------------------------------------

{
    const { forge } = generateWorldForge({ worldSeed: 'rc', theme: 'dungeon-crawler', regionCount: 7, factionCount: 3, npcCount: 4 });
    if (forge.geography.regions.length !== 7) {
        fail(`expected 7 regions, got ${forge.geography.regions.length}`);
    } else {
        ok('regionCount=7 produces exactly 7 regions');
    }
}

// ---------------------------------------------------------------------------
// Region connectivity — ring topology
// ---------------------------------------------------------------------------

{
    const { forge } = generate({ regionCount: 5 });
    for (const region of forge.geography.regions) {
        if (!region.connectedTo || region.connectedTo.length === 0) {
            fail(`region ${region.id} has no connections`);
        }
    }
    ok('all regions have at least 1 connection');
}

// ---------------------------------------------------------------------------
// Region cartography — every generated region has safe coordinates and biome
// ---------------------------------------------------------------------------

{
    const { forge } = generate({ regionCount: 8 });
    for (const region of forge.geography.regions) {
        if (!Number.isInteger(region.x) || region.x < 0 || region.x > 1000) {
            fail(`region ${region.id} x should be integer 0..1000, got ${region.x}`);
        }
        if (!Number.isInteger(region.y) || region.y < 0 || region.y > 1000) {
            fail(`region ${region.id} y should be integer 0..1000, got ${region.y}`);
        }
        if (!VALID_BIOMES.has(region.biome)) {
            fail(`region ${region.id} biome should be valid, got ${region.biome}`);
        }
    }
    ok('all generated regions have valid x/y/biome');
}

{
    const { forge } = generate({ regionCount: 8 });
    const byId = new Map(forge.geography.regions.map((r) => [r.id, r]));
    let checked = 0;
    for (const region of forge.geography.regions) {
        for (const neighborId of region.connectedTo ?? []) {
            const neighbor = byId.get(neighborId);
            if (!neighbor) { continue; }
            const dx = region.x - neighbor.x;
            const dy = region.y - neighbor.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            if (distance > 760) {
                fail(`connected regions should not be across the whole map: ${region.id} -> ${neighborId} = ${distance.toFixed(1)}`);
            }
            checked++;
        }
    }
    if (checked === 0) {
        fail('cartography distance test should check at least one edge');
    } else {
        ok('connected region coordinates are reasonably local');
    }
}

// ---------------------------------------------------------------------------
// All region IDs unique
// ---------------------------------------------------------------------------

{
    const { forge } = generate({ regionCount: 8 });
    const ids = forge.geography.regions.map((r) => r.id);
    const unique = new Set(ids);
    if (unique.size !== ids.length) {
        fail(`duplicate region IDs detected: ${ids.join(', ')}`);
    } else {
        ok('all region IDs unique');
    }
}

// ---------------------------------------------------------------------------
// Faction enemy graph — at least 1 hostile↔non-hostile pair
// ---------------------------------------------------------------------------

{
    const { forge } = generateWorldForge({ worldSeed: 'enemy', theme: 'dungeon-crawler', regionCount: 4, factionCount: 4, npcCount: 3 });
    const hostile = forge.factions.find((f) => f.type === 'hostile');
    const hasEnemyPair = forge.factions.some(
        (f) => (f.enemies ?? []).length > 0
    );
    if (!hasEnemyPair) {
        fail('factions should have at least one enemy relationship');
    } else {
        ok('at least one enemy relationship exists');
    }
    void hostile;
}

// ---------------------------------------------------------------------------
// NPC count matches input (after clamping)
// ---------------------------------------------------------------------------

{
    const { forge } = generate({ npcCount: 4 });
    if (forge.initialNpcs.length !== 4) {
        fail(`expected 4 npcs, got ${forge.initialNpcs.length}`);
    } else {
        ok('npcCount=4 produces exactly 4 npcs');
    }
}

// ---------------------------------------------------------------------------
// First NPC is quest-giver
// ---------------------------------------------------------------------------

{
    const { forge } = generate({ npcCount: 3 });
    if (forge.initialNpcs[0]?.role !== 'quest-giver') {
        fail(`first NPC should be quest-giver, got ${forge.initialNpcs[0]?.role}`);
    } else {
        ok('first NPC is quest-giver');
    }
}

// ---------------------------------------------------------------------------
// All NPC IDs unique
// ---------------------------------------------------------------------------

{
    const { forge } = generate({ npcCount: 8 });
    const ids = forge.initialNpcs.map((n) => n.id);
    const unique = new Set(ids);
    if (unique.size !== ids.length) {
        fail(`duplicate NPC IDs: ${ids.join(', ')}`);
    } else {
        ok('all NPC IDs unique');
    }
}

// ---------------------------------------------------------------------------
// Lore history has 3 entries
// ---------------------------------------------------------------------------

{
    const { forge } = generate();
    if (forge.loreHistory.length !== 3) {
        fail(`expected 3 lore entries, got ${forge.loreHistory.length}`);
    } else {
        ok('loreHistory has 3 entries');
    }
    for (const entry of forge.loreHistory) {
        if (!entry.event) { fail(`lore entry missing event: ${JSON.stringify(entry)}`); }
    }
    ok('all lore entries have event text');
}

// ---------------------------------------------------------------------------
// Theme variation — cyberpunk produces different region types
// ---------------------------------------------------------------------------

{
    const { forge: dungeon } = generateWorldForge({ worldSeed: 'tv', theme: 'dungeon-crawler', regionCount: 6, factionCount: 2, npcCount: 2 });
    const { forge: cyber } = generateWorldForge({ worldSeed: 'tv', theme: 'cyberpunk', regionCount: 6, factionCount: 2, npcCount: 2 });

    const dungeonTypes = dungeon.geography.regions.map((r) => r.type).join(',');
    const cyberTypes = cyber.geography.regions.map((r) => r.type).join(',');
    if (dungeonTypes === cyberTypes) {
        fail('different themes should produce different region type distributions');
    } else {
        ok('different themes produce different region types');
    }
}

// ---------------------------------------------------------------------------
// format field is correct
// ---------------------------------------------------------------------------

{
    const { forge } = generate();
    if (forge.format !== 'lorerelay-world-forge/1.0') {
        fail(`format should be "lorerelay-world-forge/1.0", got "${forge.format}"`);
    } else {
        ok('format field is correct');
    }
}

// ---------------------------------------------------------------------------
// meta fields populated
// ---------------------------------------------------------------------------

{
    const { forge } = generate({ worldSeed: 'meta-test', theme: 'dark-fantasy' });
    if (forge.meta.worldSeed !== 'meta-test') { fail('meta.worldSeed preserved'); } else { ok('meta.worldSeed preserved'); }
    if (forge.meta.theme !== 'dark-fantasy') { fail('meta.theme preserved'); } else { ok('meta.theme preserved'); }
    if (!forge.meta.generatedAt) { fail('meta.generatedAt set'); } else { ok('meta.generatedAt set'); }
    if (forge.meta.generationMethod !== 'ai-generated') { fail('meta.generationMethod = "ai-generated"'); } else { ok('meta.generationMethod correct'); }
}

// ---------------------------------------------------------------------------
// Result
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// New genre themes generate valid worlds (+ hazards where expected)
// ---------------------------------------------------------------------------

const VALID_HAZARDS = new Set([
    'radiation', 'toxic', 'infested', 'quarantine', 'anomaly', 'haunted', 'storm', 'corrupted',
]);

{
    const themes = ['post-apocalyptic', 'zombie-apocalypse', 'scifi', 'steampunk', 'cosmic-horror', 'oriental-fantasy'];
    for (const theme of themes) {
        const { forge, valid } = generate({ worldSeed: `hazard-${theme}`, theme, regionCount: 8 });
        if (!valid) { fail(`theme ${theme} generates valid forge`); } else { ok(`theme ${theme} valid`); }
        const badHazard = forge.geography.regions.find((r) => r.hazard !== undefined && !VALID_HAZARDS.has(r.hazard));
        if (badHazard) { fail(`theme ${theme} produced invalid hazard ${badHazard.hazard}`); } else { ok(`theme ${theme} hazards valid`); }
        const badBiome = forge.geography.regions.find((r) => !VALID_BIOMES.has(r.biome));
        if (badBiome) { fail(`theme ${theme} produced invalid biome ${badBiome.biome}`); } else { ok(`theme ${theme} biomes valid`); }
    }

    const { forge: zForge } = generate({ worldSeed: 'hazard-check-1', theme: 'zombie-apocalypse', regionCount: 12 });
    const hazardCount = zForge.geography.regions.filter((r) => r.hazard).length;
    if (hazardCount === 0) { fail('zombie-apocalypse x12 regions expected >=1 hazard'); } else { ok(`zombie theme sprinkles hazards (${hazardCount}/12)`); }

    const a = generate({ worldSeed: 'hazard-det', theme: 'post-apocalyptic', regionCount: 10 });
    const b = generate({ worldSeed: 'hazard-det', theme: 'post-apocalyptic', regionCount: 10 });
    const ha = a.forge.geography.regions.map((r) => r.hazard ?? null).join(',');
    const hb = b.forge.geography.regions.map((r) => r.hazard ?? null).join(',');
    if (ha !== hb) { fail('hazard assignment not deterministic'); } else { ok('hazard assignment deterministic'); }
}

if (failed > 0) {
    process.exit(1);
}
console.log('All world forge generator tests passed.');
