export type GenerationMethod = 'manual' | 'ai-generated';
export type RegionType = 'wilderness' | 'urban' | 'dungeon' | 'ruins' | 'ocean' | 'mountains' | 'forest' | 'other';
export type LocationType = 'settlement' | 'dungeon' | 'landmark' | 'ruins' | 'wilderness' | 'other';
export type FactionType = 'hostile' | 'neutral' | 'friendly' | 'player-faction';

export interface WorldForgeMeta {
    worldName: string;
    worldSeed?: string;
    theme?: string;
    generatedAt?: string;
    generationMethod?: GenerationMethod;
}

export interface Region {
    id: string;
    name: string;
    type: RegionType;
    climate?: string;
    dangerLevel?: number;
    description?: string;
    connectedTo?: string[];
    resourceNodes?: string[];
    imagePromptHint?: string;
}

export interface WorldLocation {
    id: string;
    name: string;
    regionId?: string;
    type: LocationType;
    population?: number;
    factionControl?: string;
    description?: string;
    services?: string[];
}

export interface FactionResources {
    food?: number;
    weapons?: number;
    mana?: number;
    [key: string]: number | undefined;
}

export interface Faction {
    id: string;
    name: string;
    type: FactionType;
    power?: number;
    resources?: FactionResources;
    goals?: string[];
    enemies?: string[];
    allies?: string[];
    description?: string;
}

export interface LoreHistoryEntry {
    era?: string;
    yearsBefore?: number;
    event: string;
}

export interface InitialNpc {
    id: string;
    name: string;
    role?: string;
    locationId?: string;
    factionId?: string;
    description?: string;
}

export interface WorldGeography {
    regions: Region[];
    locations: WorldLocation[];
}

export interface WorldForge {
    format: string;
    meta: WorldForgeMeta;
    geography: WorldGeography;
    factions: Faction[];
    loreHistory: LoreHistoryEntry[];
    initialNpcs: InitialNpc[];
}

// --- パーサーユーティリティ ---

function asString(v: unknown, fallback = ''): string {
    return typeof v === 'string' ? v.trim() : fallback;
}

function asId(v: unknown): string {
    const s = asString(v);
    return /^[a-zA-Z0-9_-]{1,64}$/.test(s) ? s : '';
}

function asNumber(v: unknown): number | undefined {
    return typeof v === 'number' && !Number.isNaN(v) ? v : undefined;
}

function asStringArray(v: unknown): string[] {
    return Array.isArray(v) ? v.filter((x) => typeof x === 'string').map((x) => (x as string).trim()) : [];
}

const VALID_REGION_TYPES = new Set<RegionType>(['wilderness', 'urban', 'dungeon', 'ruins', 'ocean', 'mountains', 'forest', 'other']);
const VALID_LOCATION_TYPES = new Set<LocationType>(['settlement', 'dungeon', 'landmark', 'ruins', 'wilderness', 'other']);
const VALID_FACTION_TYPES = new Set<FactionType>(['hostile', 'neutral', 'friendly', 'player-faction']);

function parseRegion(raw: unknown): Region | undefined {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) { return undefined; }
    const r = raw as Record<string, unknown>;
    const id = asId(r.id);
    const name = asString(r.name);
    if (!id || !name) { return undefined; }
    const region: Region = {
        id,
        name,
        type: VALID_REGION_TYPES.has(r.type as RegionType) ? (r.type as RegionType) : 'other'
    };
    if (r.climate) { region.climate = asString(r.climate); }
    if (r.dangerLevel !== undefined) { region.dangerLevel = asNumber(r.dangerLevel); }
    if (r.description) { region.description = asString(r.description); }
    if (r.connectedTo) { region.connectedTo = asStringArray(r.connectedTo); }
    if (r.resourceNodes) { region.resourceNodes = asStringArray(r.resourceNodes); }
    if (r.imagePromptHint) { region.imagePromptHint = asString(r.imagePromptHint); }
    return region;
}

function parseWorldLocation(raw: unknown): WorldLocation | undefined {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) { return undefined; }
    const r = raw as Record<string, unknown>;
    const id = asId(r.id);
    const name = asString(r.name);
    if (!id || !name) { return undefined; }
    const loc: WorldLocation = {
        id,
        name,
        type: VALID_LOCATION_TYPES.has(r.type as LocationType) ? (r.type as LocationType) : 'other'
    };
    if (r.regionId) { loc.regionId = asString(r.regionId); }
    if (r.population !== undefined) { loc.population = asNumber(r.population); }
    if (r.factionControl) { loc.factionControl = asString(r.factionControl); }
    if (r.description) { loc.description = asString(r.description); }
    if (r.services) { loc.services = asStringArray(r.services); }
    return loc;
}

function parseFaction(raw: unknown): Faction | undefined {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) { return undefined; }
    const r = raw as Record<string, unknown>;
    const id = asId(r.id);
    const name = asString(r.name);
    if (!id || !name) { return undefined; }
    const faction: Faction = {
        id,
        name,
        type: VALID_FACTION_TYPES.has(r.type as FactionType) ? (r.type as FactionType) : 'neutral'
    };
    if (r.power !== undefined) { faction.power = asNumber(r.power); }
    if (r.goals) { faction.goals = asStringArray(r.goals); }
    if (r.enemies) { faction.enemies = asStringArray(r.enemies); }
    if (r.allies) { faction.allies = asStringArray(r.allies); }
    if (r.description) { faction.description = asString(r.description); }
    if (r.resources && typeof r.resources === 'object' && !Array.isArray(r.resources)) {
        const res: FactionResources = {};
        for (const [k, v] of Object.entries(r.resources as Record<string, unknown>)) {
            if (typeof v === 'number') { res[k] = v; }
        }
        faction.resources = res;
    }
    return faction;
}

function parseLoreHistory(raw: unknown): LoreHistoryEntry[] {
    if (!Array.isArray(raw)) { return []; }
    return raw.filter((x) => x && typeof x === 'object' && !Array.isArray(x))
        .map((x) => {
            const r = x as Record<string, unknown>;
            const event = asString(r.event);
            if (!event) { return null; }
            const entry: LoreHistoryEntry = { event };
            if (r.era) { entry.era = asString(r.era); }
            if (r.yearsBefore !== undefined) { entry.yearsBefore = asNumber(r.yearsBefore); }
            return entry;
        })
        .filter((x): x is LoreHistoryEntry => x !== null);
}

function parseInitialNpc(raw: unknown): InitialNpc | undefined {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) { return undefined; }
    const r = raw as Record<string, unknown>;
    const id = asId(r.id);
    const name = asString(r.name);
    if (!id || !name) { return undefined; }
    const npc: InitialNpc = { id, name };
    if (r.role) { npc.role = asString(r.role); }
    if (r.locationId) { npc.locationId = asString(r.locationId); }
    if (r.factionId) { npc.factionId = asString(r.factionId); }
    if (r.description) { npc.description = asString(r.description); }
    return npc;
}

export function parseWorldForge(raw: unknown): WorldForge | undefined {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) { return undefined; }
    const doc = raw as Record<string, unknown>;

    const metaRaw = doc.meta as Record<string, unknown> | undefined;
    const worldName = metaRaw ? asString(metaRaw.worldName) : '';
    if (!worldName) { return undefined; }

    const meta: WorldForgeMeta = { worldName };
    if (metaRaw) {
        if (metaRaw.worldSeed) { meta.worldSeed = asString(metaRaw.worldSeed); }
        if (metaRaw.theme) { meta.theme = asString(metaRaw.theme); }
        if (metaRaw.generatedAt) { meta.generatedAt = asString(metaRaw.generatedAt); }
        if (metaRaw.generationMethod === 'manual' || metaRaw.generationMethod === 'ai-generated') {
            meta.generationMethod = metaRaw.generationMethod;
        }
    }

    const geoRaw = doc.geography as Record<string, unknown> | undefined;
    const geography: WorldGeography = {
        regions: Array.isArray(geoRaw?.regions)
            ? geoRaw!.regions.map(parseRegion).filter((x): x is Region => x !== undefined)
            : [],
        locations: Array.isArray(geoRaw?.locations)
            ? geoRaw!.locations.map(parseWorldLocation).filter((x): x is WorldLocation => x !== undefined)
            : []
    };

    const factions = Array.isArray(doc.factions)
        ? doc.factions.map(parseFaction).filter((x): x is Faction => x !== undefined)
        : [];

    return {
        format: asString(doc.format, 'lorerelay-world-forge/1.0'),
        meta,
        geography,
        factions,
        loreHistory: parseLoreHistory(doc.loreHistory),
        initialNpcs: Array.isArray(doc.initialNpcs)
            ? doc.initialNpcs.map(parseInitialNpc).filter((x): x is InitialNpc => x !== undefined)
            : []
    };
}
