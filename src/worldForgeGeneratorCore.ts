import type {
    WorldForge,
    Region,
    WorldLocation,
    Faction,
    InitialNpc,
    LoreHistoryEntry,
    RegionType,
    LocationType,
    FactionType,
} from './worldForgeCore';

// ---------------------------------------------------------------------------
// Public interface
// ---------------------------------------------------------------------------

export interface WorldForgeGeneratorInput {
    worldSeed: string;
    theme: string;
    regionCount: number;   // 3–12
    factionCount: number;  // 2–6
    npcCount: number;      // 2–20
}

export interface GeneratedWorldForge {
    forge: WorldForge;
    /** true if all referential constraints passed */
    valid: boolean;
    warnings: string[];
}

// ---------------------------------------------------------------------------
// Deterministic PRNG — mulberry32
// ---------------------------------------------------------------------------

function hashStr(s: string): number {
    let h = 0x811c9dc5;
    for (let i = 0; i < s.length; i++) {
        h ^= s.charCodeAt(i);
        h = (Math.imul(h, 0x01000193) >>> 0);
    }
    return h >>> 0;
}

function makePrng(seed: string): () => number {
    let state = hashStr(seed) >>> 0;
    return function next(): number {
        state |= 0;
        state = (state + 0x6d2b79f5) | 0;
        let t = Math.imul(state ^ (state >>> 15), 1 | state);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function randInt(rng: () => number, min: number, max: number): number {
    return min + Math.floor(rng() * (max - min + 1));
}

function pick<T>(rng: () => number, arr: T[]): T {
    return arr[Math.floor(rng() * arr.length)];
}

function pickWeighted<T>(rng: () => number, items: Array<[T, number]>): T {
    const total = items.reduce((s, [, w]) => s + w, 0);
    let r = rng() * total;
    for (const [item, w] of items) {
        r -= w;
        if (r <= 0) { return item; }
    }
    return items[items.length - 1][0];
}

function shuffle<T>(rng: () => number, arr: T[]): T[] {
    const out = [...arr];
    for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
}

// ---------------------------------------------------------------------------
// Name tables keyed by theme
// ---------------------------------------------------------------------------

const REGION_NAME_PARTS: Record<string, [string[], string[]]> = {
    'dungeon-crawler': [
        ['Upper', 'Lower', 'Deep', 'Dark', 'Sunken', 'Forsaken', 'Ancient', 'Crumbled'],
        ['Catacombs', 'Vault', 'Passage', 'Halls', 'Depths', 'Chamber', 'Labyrinth', 'Warren'],
    ],
    'dark-fantasy': [
        ['Ashwood', 'Ironveil', 'Blighted', 'Shadowed', 'Cursed', 'Hollow', 'Grim', 'Withered'],
        ['Moor', 'Vale', 'Forest', 'Reaches', 'Wastes', 'Highlands', 'Marshes', 'Crossing'],
    ],
    cyberpunk: [
        ['Sector', 'Grid', 'Sub', 'Neo', 'Core', 'Outer', 'Deep', 'High'],
        ['Zero', 'Block', 'District', 'Hub', 'Zone', 'Network', 'Junction', 'Spire'],
    ],
    default: [
        ['North', 'South', 'East', 'West', 'High', 'Low', 'Old', 'New'],
        ['Lands', 'Plains', 'Hills', 'Shore', 'Reaches', 'Wilds', 'Keep', 'Domain'],
    ],
};

const FACTION_NAME_PARTS: Record<string, [string[], string[]]> = {
    'dungeon-crawler': [
        ['Undead', 'Bone', 'Shadow', 'Cursed', 'Iron', 'Stone', 'Grave', 'Ash'],
        ['Legion', 'Watchers', 'Guard', 'Cult', 'Order', 'Brotherhood', 'Conclave', 'Pact'],
    ],
    'dark-fantasy': [
        ['Crimson', 'Iron', 'Black', 'Silver', 'Dusk', 'Crow', 'Ember', 'Pale'],
        ['Hand', 'Crown', 'Throne', 'Circle', 'Veil', 'Covenant', 'Host', 'Banner'],
    ],
    cyberpunk: [
        ['Neon', 'Ghost', 'Wire', 'Chrome', 'Null', 'Byte', 'Cipher', 'Static'],
        ['Run', 'Syndicate', 'Net', 'Corp', 'Collective', 'Grid', 'Protocol', 'Enclave'],
    ],
    default: [
        ['Red', 'Blue', 'Gold', 'Silver', 'Dark', 'Bright', 'Storm', 'Stone'],
        ['Alliance', 'Union', 'Guild', 'Order', 'Council', 'Company', 'Band', 'Circle'],
    ],
};

const NPC_NAMES: Record<string, string[]> = {
    'dungeon-crawler': ['Maren', 'Dusk', 'Verity', 'Aldric', 'Thorne', 'Sable', 'Osric', 'Wynn', 'Cael', 'Mira'],
    'dark-fantasy': ['Isolde', 'Gareth', 'Lira', 'Edric', 'Soren', 'Nessa', 'Bryn', 'Talon', 'Vesper', 'Corvin'],
    cyberpunk: ['Nova', 'Kira', 'Axel', 'Byte', 'Zara', 'Dex', 'Lyra', 'Cipher', 'Ryn', 'Flux'],
    default: ['Aela', 'Bren', 'Clara', 'Dorn', 'Ela', 'Fenn', 'Gara', 'Holt', 'Irra', 'Jeld'],
};

const NPC_ROLES = ['quest-giver', 'merchant', 'guard', 'scholar', 'innkeeper', 'scout', 'blacksmith', 'healer'];

const LORE_TEMPLATES: Record<string, LoreHistoryEntry[]> = {
    'dungeon-crawler': [
        { era: 'Ancient', yearsBefore: 800, event: 'A great empire carved these halls as a seat of power.' },
        { era: 'Collapse', yearsBefore: 300, event: 'The empire fell; the catacombs were sealed and forgotten.' },
        { era: 'Present', yearsBefore: 10, event: 'Explorers broke the seal. Something ancient stirred within.' },
    ],
    'dark-fantasy': [
        { era: 'Dawn Age', yearsBefore: 1000, event: 'The land was shaped by warring gods whose wounds became mountains and seas.' },
        { era: 'Blighting', yearsBefore: 400, event: 'A curse swept across the realm, turning forests to ash and rivers to black ichor.' },
        { era: 'Reformation', yearsBefore: 50, event: 'Survivors built fragile alliances. The blight recedes, but its source is unknown.' },
    ],
    cyberpunk: [
        { era: 'Pre-Collapse', yearsBefore: 120, event: 'Mega-corporations absorbed nation-states. The megacity was built on their ruins.' },
        { era: 'Blackout', yearsBefore: 40, event: 'A cascading network failure plunged the city into chaos for three weeks.' },
        { era: 'Now', yearsBefore: 0, event: 'Power is fractured between corps, gangs, and rogue AI clusters.' },
    ],
    default: [
        { era: 'Founding', yearsBefore: 500, event: 'The first settlers arrived and established the old kingdom.' },
        { era: 'War of Crowns', yearsBefore: 200, event: 'Rival factions tore the kingdom apart in a generation-long civil war.' },
        { era: 'Uneasy Peace', yearsBefore: 20, event: 'A fragile treaty holds, but old grudges simmer beneath the surface.' },
    ],
};

// ---------------------------------------------------------------------------
// ID helpers
// ---------------------------------------------------------------------------

function makeId(base: string, seq: number): string {
    const slug = base
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '')
        .slice(0, 20);
    return `${slug}_${seq}`;
}

// ---------------------------------------------------------------------------
// Step 1: Region graph (ring + chords)
// ---------------------------------------------------------------------------

function generateRegions(rng: () => number, theme: string, count: number): Region[] {
    const parts = REGION_NAME_PARTS[theme] ?? REGION_NAME_PARTS.default;
    const prefixes = shuffle(rng, [...parts[0]]);
    const suffixes = shuffle(rng, [...parts[1]]);

    const REGION_TYPE_WEIGHTS: Array<[RegionType, number]> = theme === 'dungeon-crawler'
        ? [['dungeon', 5], ['ruins', 3], ['wilderness', 1], ['other', 1]]
        : theme === 'cyberpunk'
        ? [['urban', 5], ['other', 3], ['wilderness', 1], ['ruins', 1]]
        : [['wilderness', 3], ['forest', 2], ['mountains', 2], ['dungeon', 1], ['urban', 1], ['ruins', 1]];

    const regions: Region[] = [];
    for (let i = 0; i < count; i++) {
        const prefix = prefixes[i % prefixes.length];
        const suffix = suffixes[i % suffixes.length];
        const name = `${prefix} ${suffix}`;
        const id = makeId(name, i + 1);
        const type = pickWeighted(rng, REGION_TYPE_WEIGHTS);
        const region: Region = {
            id,
            name,
            type,
            dangerLevel: randInt(rng, 2, 8),
            connectedTo: [],
            imagePromptHint: `A landscape view of ${name}, ${type} environment, ${theme} artstyle`,
        };
        regions.push(region);
    }

    // Ring topology: each region connects to the next
    for (let i = 0; i < count; i++) {
        const next = (i + 1) % count;
        if (!regions[i].connectedTo!.includes(regions[next].id)) {
            regions[i].connectedTo!.push(regions[next].id);
        }
        if (!regions[next].connectedTo!.includes(regions[i].id)) {
            regions[next].connectedTo!.push(regions[i].id);
        }
    }

    // Add 1–2 chord connections for worlds with ≥4 regions
    if (count >= 4) {
        const chordCount = count >= 6 ? 2 : 1;
        for (let c = 0; c < chordCount; c++) {
            const a = randInt(rng, 0, count - 1);
            let b = randInt(rng, 0, count - 1);
            // avoid same or already-adjacent
            let attempts = 0;
            while ((b === a || Math.abs(b - a) === 1 || Math.abs(b - a) === count - 1) && attempts < 10) {
                b = randInt(rng, 0, count - 1);
                attempts++;
            }
            if (b !== a && !regions[a].connectedTo!.includes(regions[b].id)) {
                regions[a].connectedTo!.push(regions[b].id);
                regions[b].connectedTo!.push(regions[a].id);
            }
        }
    }

    return regions;
}

// ---------------------------------------------------------------------------
// Step 2: Locations
// ---------------------------------------------------------------------------

const LOCATION_TYPE_BY_REGION: Record<RegionType, Array<[LocationType, number]>> = {
    dungeon: [['dungeon', 4], ['ruins', 3], ['landmark', 2], ['other', 1]],
    ruins: [['ruins', 4], ['dungeon', 2], ['wilderness', 2], ['landmark', 2]],
    wilderness: [['wilderness', 4], ['settlement', 2], ['landmark', 2], ['ruins', 2]],
    forest: [['wilderness', 3], ['settlement', 2], ['landmark', 3], ['ruins', 2]],
    mountains: [['wilderness', 3], ['ruins', 2], ['landmark', 3], ['dungeon', 2]],
    urban: [['settlement', 5], ['landmark', 3], ['other', 2]],
    ocean: [['settlement', 3], ['landmark', 3], ['wilderness', 3], ['other', 1]],
    other: [['other', 3], ['landmark', 3], ['wilderness', 2], ['settlement', 2]],
};

const LOCATION_NAME_SUFFIXES: Record<LocationType, string[]> = {
    settlement: ['Town', 'Village', 'Post', 'Outpost', 'Camp', 'Refuge'],
    dungeon: ['Chamber', 'Pit', 'Den', 'Depths', 'Sanctum', 'Lair'],
    landmark: ['Shrine', 'Ruin', 'Pillar', 'Gate', 'Monument', 'Overlook'],
    ruins: ['Remains', 'Rubble', 'Wreckage', 'Shell', 'Husk', 'Debris'],
    wilderness: ['Clearing', 'Trail', 'Hollow', 'Ridge', 'Grove', 'Path'],
    other: ['Point', 'Site', 'Area', 'Spot', 'Place', 'Corner'],
};

function generateLocations(
    rng: () => number,
    regions: Region[],
): WorldLocation[] {
    const locations: WorldLocation[] = [];
    let locSeq = 1;

    for (const region of regions) {
        const locCount = randInt(rng, 1, 3);
        for (let i = 0; i < locCount; i++) {
            const typeWeights = LOCATION_TYPE_BY_REGION[region.type] ?? LOCATION_TYPE_BY_REGION.other;
            const type = pickWeighted(rng, typeWeights);
            const suffix = pick(rng, LOCATION_NAME_SUFFIXES[type]);
            const name = `${region.name.split(' ')[0]} ${suffix}`;
            const id = makeId(name, locSeq++);
            const loc: WorldLocation = { id, name, type, regionId: region.id };
            loc.imagePromptHint = `A view of ${name}, ${type} structure, in ${region.name}, ${region.type} environment`;
            if (type === 'settlement') {
                loc.population = randInt(rng, 50, 800);
            }
            locations.push(loc);
        }
    }

    return locations;
}

// ---------------------------------------------------------------------------
// Step 3: Factions
// ---------------------------------------------------------------------------

function generateFactions(
    rng: () => number,
    theme: string,
    count: number,
): Faction[] {
    const parts = FACTION_NAME_PARTS[theme] ?? FACTION_NAME_PARTS.default;
    const prefixes = shuffle(rng, [...parts[0]]);
    const suffixes = shuffle(rng, [...parts[1]]);

    // type distribution: hostile 30% / neutral 40% / friendly 30%
    const TYPE_WEIGHTS: Array<[FactionType, number]> = [
        ['hostile', 3], ['neutral', 4], ['friendly', 3]
    ];

    const factions: Faction[] = [];
    for (let i = 0; i < count; i++) {
        const prefix = prefixes[i % prefixes.length];
        const suffix = suffixes[(i + 3) % suffixes.length]; // offset to avoid prefix+suffix clash
        const name = `${prefix} ${suffix}`;
        const id = makeId(name, i + 1);
        factions.push({
            id,
            name,
            type: pickWeighted(rng, TYPE_WEIGHTS),
            power: randInt(rng, 30, 80),
            resources: {
                food: randInt(rng, 10, 60),
                weapons: randInt(rng, 5, 50),
                mana: randInt(rng, 0, 40),
            },
            enemies: [],
            allies: [],
            goals: [],
        });
    }

    return factions;
}

// ---------------------------------------------------------------------------
// Step 4: Enemy/ally graph
// Guarantee: at least 1 hostile ↔ non-hostile pair exists
// ---------------------------------------------------------------------------

function buildFactionRelations(rng: () => number, factions: Faction[]): void {
    const hostile = factions.filter((f) => f.type === 'hostile');
    const others = factions.filter((f) => f.type !== 'hostile');

    // Guarantee one hostile↔neutral/friendly pair
    if (hostile.length > 0 && others.length > 0) {
        const h = pick(rng, hostile);
        const o = pick(rng, others);
        h.enemies = [o.id];
        o.enemies = [h.id];
    }

    // Extra random enemy pairs (avoid duplicating)
    if (factions.length >= 3) {
        const extraCount = Math.floor(factions.length / 2);
        for (let e = 0; e < extraCount; e++) {
            const a = factions[randInt(rng, 0, factions.length - 1)];
            const b = factions[randInt(rng, 0, factions.length - 1)];
            if (a.id === b.id) { continue; }
            if (!(a.enemies ?? []).includes(b.id) && !(a.allies ?? []).includes(b.id)) {
                if (rng() < 0.4) {
                    (a.enemies ??= []).push(b.id);
                    (b.enemies ??= []).push(a.id);
                } else if (a.type !== 'hostile' && b.type !== 'hostile') {
                    (a.allies ??= []).push(b.id);
                    (b.allies ??= []).push(a.id);
                }
            }
        }
    }
}

// ---------------------------------------------------------------------------
// Step 5: Faction control assignment
// Adjacent regions → different controlling factions where possible
// ---------------------------------------------------------------------------

function assignFactionControl(
    rng: () => number,
    factions: Faction[],
    locations: WorldLocation[],
    regions: Region[],
): void {
    if (factions.length === 0) { return; }

    // Assign per-region controlling faction (prefer different factions for connected regions)
    const regionFactionMap = new Map<string, string>();
    const shuffledRegions = shuffle(rng, [...regions]);

    for (const region of shuffledRegions) {
        const neighborFactionIds = new Set(
            (region.connectedTo ?? [])
                .map((rid) => regionFactionMap.get(rid))
                .filter((id): id is string => id !== undefined)
        );
        const available = factions.filter((f) => !neighborFactionIds.has(f.id));
        const chosen = available.length > 0 ? pick(rng, available) : pick(rng, factions);
        regionFactionMap.set(region.id, chosen.id);
    }

    // Assign factionControl to settlement-type locations
    for (const loc of locations) {
        if (loc.type === 'settlement' || loc.type === 'landmark') {
            const controllingId = loc.regionId
                ? regionFactionMap.get(loc.regionId)
                : undefined;
            if (controllingId) {
                loc.factionControl = controllingId;
            }
        }
    }
}

// ---------------------------------------------------------------------------
// Step 6: InitialNpcs
// ---------------------------------------------------------------------------

function generateNpcs(
    rng: () => number,
    theme: string,
    count: number,
    locations: WorldLocation[],
    factions: Faction[],
): InitialNpc[] {
    const namePool = shuffle(rng, [...(NPC_NAMES[theme] ?? NPC_NAMES.default)]);
    const settlementLocs = locations.filter((l) => l.type === 'settlement' || l.type === 'landmark');
    const anyLocs = locations.length > 0 ? locations : [];
    const npcs: InitialNpc[] = [];
    const usedNames = new Set<string>();

    for (let i = 0; i < count; i++) {
        let name = namePool[i % namePool.length];
        // If name already used, add numeric suffix
        if (usedNames.has(name)) { name = `${name}${i + 1}`; }
        usedNames.add(name);

        const role = i === 0 ? 'quest-giver' : pick(rng, NPC_ROLES);
        const locPool = settlementLocs.length > 0 ? settlementLocs : anyLocs;
        const loc = locPool.length > 0 ? pick(rng, locPool) : undefined;
        const faction = factions.length > 0 && rng() < 0.7 ? pick(rng, factions) : undefined;

        const idSlug = name.toLowerCase().replace(/[^a-z0-9]/g, '_');
        const id = `npc_${idSlug}_${i + 1}`;

        const npc: InitialNpc = { id, name, role };
        if (loc) { npc.locationId = loc.id; }
        if (faction) { npc.factionId = faction.id; }
        npcs.push(npc);
    }

    return npcs;
}

// ---------------------------------------------------------------------------
// Step 7: Lore history
// ---------------------------------------------------------------------------

function buildLoreHistory(theme: string): LoreHistoryEntry[] {
    return [...(LORE_TEMPLATES[theme] ?? LORE_TEMPLATES.default)];
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

function validateForge(forge: WorldForge): string[] {
    const warnings: string[] = [];
    const regionIds = new Set(forge.geography.regions.map((r) => r.id));
    const locationIds = new Set(forge.geography.locations.map((l) => l.id));
    const factionIds = new Set(forge.factions.map((f) => f.id));

    for (const loc of forge.geography.locations) {
        if (loc.regionId && !regionIds.has(loc.regionId)) {
            warnings.push(`location ${loc.id} references unknown regionId ${loc.regionId}`);
        }
        if (loc.factionControl && !factionIds.has(loc.factionControl)) {
            warnings.push(`location ${loc.id} references unknown factionControl ${loc.factionControl}`);
        }
    }
    for (const npc of forge.initialNpcs) {
        if (npc.locationId && !locationIds.has(npc.locationId)) {
            warnings.push(`npc ${npc.id} references unknown locationId ${npc.locationId}`);
        }
        if (npc.factionId && !factionIds.has(npc.factionId)) {
            warnings.push(`npc ${npc.id} references unknown factionId ${npc.factionId}`);
        }
    }
    for (const faction of forge.factions) {
        for (const eid of (faction.enemies ?? [])) {
            if (!factionIds.has(eid)) {
                warnings.push(`faction ${faction.id} has unknown enemy ${eid}`);
            }
        }
        for (const aid of (faction.allies ?? [])) {
            if (!factionIds.has(aid)) {
                warnings.push(`faction ${faction.id} has unknown ally ${aid}`);
            }
        }
    }
    return warnings;
}

// ---------------------------------------------------------------------------
// Public generator
// ---------------------------------------------------------------------------

export function generateWorldForge(input: WorldForgeGeneratorInput): GeneratedWorldForge {
    const regionCount = Math.max(3, Math.min(12, Math.floor(input.regionCount)));
    const factionCount = Math.max(2, Math.min(6, Math.floor(input.factionCount)));
    const npcCount = Math.max(2, Math.min(20, Math.floor(input.npcCount)));
    const theme = input.theme || 'default';
    const seed = input.worldSeed;

    const rng = makePrng(`${seed}:${theme}`);

    const regions = generateRegions(rng, theme, regionCount);
    const locations = generateLocations(rng, regions);
    const factions = generateFactions(rng, theme, factionCount);
    buildFactionRelations(rng, factions);
    assignFactionControl(rng, factions, locations, regions);
    const npcs = generateNpcs(rng, theme, npcCount, locations, factions);
    const loreHistory = buildLoreHistory(theme);

    // Derive world name from theme + seed
    const seedTag = seed.slice(0, 8).replace(/[^a-zA-Z0-9]/g, '');
    const worldName = theme === 'default'
        ? `World of ${seedTag}`
        : `${theme.split('-').map((w) => w[0].toUpperCase() + w.slice(1)).join(' ')} — ${seedTag}`;

    const forge: WorldForge = {
        format: 'lorerelay-world-forge/1.0',
        meta: {
            worldName,
            worldSeed: seed,
            theme,
            generatedAt: new Date().toISOString(),
            generationMethod: 'ai-generated',
        },
        geography: { regions, locations },
        factions,
        loreHistory,
        initialNpcs: npcs,
    };

    const warnings = validateForge(forge);
    const valid =
        forge.geography.regions.length >= 1 &&
        forge.geography.locations.length >= 1 &&
        forge.factions.length >= 2 &&
        warnings.length === 0;

    return { forge, valid, warnings };
}
