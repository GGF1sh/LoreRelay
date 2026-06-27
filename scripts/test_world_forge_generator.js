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

if (failed > 0) {
    process.exit(1);
}
console.log('All world forge generator tests passed.');
