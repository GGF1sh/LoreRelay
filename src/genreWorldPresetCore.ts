import { GENESIS_GENRE_DEFAULT_WORLD_PRESET_ID } from './rulesProfileCore';
import type { GenesisGenre } from './rulesProfileCore';
import type {
    RegionBiome,
    RegionHazard,
    RegionType,
    WorldForge,
    WorldGenProvenance,
} from './worldForgeCore';

export type TerrainTendency = 'flat' | 'rolling' | 'mountainous';
export type GenreWorldPresetStatus = 'published' | 'example';

export interface RegionCompositionRule {
    weights: Array<[RegionType, number]>;
    /** Applied before weighted fill. The sum may not exceed the minimum region count of 3. */
    guarantee?: Array<[RegionType, number]>;
}

export interface GenreWorldPreset {
    presetId: string;
    presetVersion: number;
    label: string;
    status: GenreWorldPresetStatus;
    regionComposition: RegionCompositionRule;
    /** Composition/layout bias only; this is not an elevation model. */
    terrainTendency: TerrainTendency;
    biomeOverrides?: Partial<Record<RegionType, RegionBiome>>;
    hazardRules?: Array<{ hazard: RegionHazard; biomes: RegionBiome[]; chance: number }>;
    nameParts?: [string[], string[]];
    /** Validated and stored only. District generation is outside Slice 1. */
    districtProfileId?: string;
}

export interface ResolvePresetInput {
    presetId?: string;
    presetVersion?: number;
    genre?: GenesisGenre;
    theme?: string;
}

export interface GenreWorldPresetResolution {
    presetId: string;
    presetVersion: number;
    resolvedFrom: WorldGenProvenance['resolvedFrom'];
}

export type WorldReproductionUnavailableReason =
    | 'missing-provenance'
    | 'missing-reproduction-input'
    | 'preset-version-unavailable'
    | 'preset-not-published';

export type WorldReproductionAvailability =
    | { available: true; preset: GenreWorldPreset; provenance: WorldGenProvenance }
    | { available: false; reason: WorldReproductionUnavailableReason };

export type WorldPresetOvermapThemeKey =
    | 'cyberpunk'
    | 'postapoc'
    | 'zombie'
    | 'scifi'
    | 'steampunk'
    | 'horror'
    | 'oriental'
    | 'modern'
    | 'fantasy';

const DEFAULT_PRESET_ID = 'fantasy-temperate';
const DEFAULT_PRESET_VERSION = 1;
const MIN_SUPPORTED_REGION_COUNT = 3;

const DEFAULT_REGION_WEIGHTS: Array<[RegionType, number]> = [
    ['wilderness', 3],
    ['forest', 2],
    ['mountains', 2],
    ['dungeon', 1],
    ['urban', 1],
    ['ruins', 1],
];

const DEFAULT_HAZARD_RULES: NonNullable<GenreWorldPreset['hazardRules']> = [
    { hazard: 'haunted', biomes: ['ruins'], chance: 0.1 },
];

const DEFAULT_NAME_PARTS: NonNullable<GenreWorldPreset['nameParts']> = [
    ['North', 'South', 'East', 'West', 'High', 'Low', 'Old', 'New'],
    ['Lands', 'Plains', 'Hills', 'Shore', 'Reaches', 'Wilds', 'Keep', 'Domain'],
];

const PRESETS: GenreWorldPreset[] = [
    {
        presetId: 'fantasy-dungeon',
        presetVersion: 1,
        label: 'Dungeon Crawler',
        status: 'published',
        regionComposition: {
            weights: [['dungeon', 5], ['ruins', 3], ['wilderness', 1], ['other', 1]],
        },
        terrainTendency: 'rolling',
        biomeOverrides: { dungeon: 'underground', wilderness: 'wasteland' },
        hazardRules: [
            { hazard: 'haunted', biomes: ['underground', 'ruins', 'dungeon'], chance: 0.25 },
            { hazard: 'corrupted', biomes: ['wasteland'], chance: 0.2 },
        ],
        nameParts: [
            ['Upper', 'Lower', 'Deep', 'Dark', 'Sunken', 'Forsaken', 'Ancient', 'Crumbled'],
            ['Catacombs', 'Vault', 'Passage', 'Halls', 'Depths', 'Chamber', 'Labyrinth', 'Warren'],
        ],
    },
    {
        presetId: 'fantasy-dark',
        presetVersion: 1,
        label: 'Dark Fantasy',
        status: 'published',
        regionComposition: { weights: DEFAULT_REGION_WEIGHTS },
        terrainTendency: 'rolling',
        hazardRules: [
            { hazard: 'haunted', biomes: ['ruins', 'swamp', 'forest'], chance: 0.25 },
            { hazard: 'corrupted', biomes: ['forest', 'plains'], chance: 0.15 },
        ],
        nameParts: [
            ['Ashwood', 'Ironveil', 'Blighted', 'Shadowed', 'Cursed', 'Hollow', 'Grim', 'Withered'],
            ['Moor', 'Vale', 'Forest', 'Reaches', 'Wastes', 'Highlands', 'Marshes', 'Crossing'],
        ],
    },
    {
        presetId: 'cyberpunk-sprawl',
        presetVersion: 1,
        label: 'Cyberpunk Sprawl',
        status: 'published',
        regionComposition: {
            weights: [['urban', 5], ['other', 3], ['wilderness', 1], ['ruins', 1]],
        },
        terrainTendency: 'flat',
        biomeOverrides: { urban: 'city', other: 'wasteland' },
        hazardRules: [
            { hazard: 'toxic', biomes: ['wasteland'], chance: 0.35 },
            { hazard: 'quarantine', biomes: ['city'], chance: 0.15 },
        ],
        nameParts: [
            ['Sector', 'Grid', 'Sub', 'Neo', 'Core', 'Outer', 'Deep', 'High'],
            ['Zero', 'Block', 'District', 'Hub', 'Zone', 'Network', 'Junction', 'Spire'],
        ],
    },
    {
        presetId: 'postapoc-wasteland',
        presetVersion: 1,
        label: 'Post-Apocalyptic Wasteland',
        status: 'published',
        regionComposition: {
            weights: [['ruins', 4], ['wilderness', 3], ['urban', 2], ['other', 1]],
        },
        terrainTendency: 'flat',
        biomeOverrides: { urban: 'city', wilderness: 'wasteland', other: 'desert' },
        hazardRules: [
            { hazard: 'radiation', biomes: ['wasteland', 'ruins', 'city', 'desert'], chance: 0.35 },
            { hazard: 'toxic', biomes: ['swamp', 'wasteland'], chance: 0.25 },
        ],
        nameParts: [
            ['Rusted', 'Cratered', 'Ashen', 'Glassed', 'Broken', 'Silent', 'Scorched', 'Buried'],
            ['Expanse', 'Flats', 'Ruins', 'Corridor', 'Basin', 'Outskirts', 'Exclusion Zone', 'Barrens'],
        ],
    },
    {
        presetId: 'zombie-suburban',
        presetVersion: 1,
        label: 'Zombie Apocalypse',
        status: 'published',
        regionComposition: {
            weights: [['urban', 4], ['ruins', 3], ['wilderness', 2], ['other', 1]],
        },
        terrainTendency: 'flat',
        biomeOverrides: { urban: 'city', wilderness: 'plains', other: 'wasteland' },
        hazardRules: [
            { hazard: 'infested', biomes: ['city', 'ruins'], chance: 0.5 },
            { hazard: 'quarantine', biomes: ['city', 'plains', 'wasteland'], chance: 0.2 },
        ],
        nameParts: [
            ['Overrun', 'Quarantined', 'Abandoned', 'Barricaded', 'Silent', 'Burning', 'Walled', 'Lost'],
            ['District', 'Suburbs', 'Downtown', 'Outskirts', 'Highway', 'Mall', 'Harbor', 'Refuge'],
        ],
    },
    {
        presetId: 'scifi-frontier',
        presetVersion: 1,
        label: 'Science-Fiction Frontier',
        status: 'published',
        regionComposition: {
            weights: [['other', 3], ['wilderness', 3], ['urban', 2], ['mountains', 1], ['ruins', 1]],
        },
        terrainTendency: 'rolling',
        biomeOverrides: { wilderness: 'plains', other: 'wasteland' },
        hazardRules: [
            { hazard: 'anomaly', biomes: ['wasteland', 'mountain', 'plains'], chance: 0.2 },
            { hazard: 'radiation', biomes: ['wasteland', 'ruins'], chance: 0.2 },
            { hazard: 'storm', biomes: ['plains', 'desert', 'mountain'], chance: 0.15 },
        ],
        nameParts: [
            ['Kepler', 'Helios', 'Outer', 'Inner', 'Terra', 'Nova', 'Cryo', 'Zenith'],
            ['Colony', 'Crater', 'Plateau', 'Rift', 'Dome', 'Fields', 'Sector', 'Landing'],
        ],
    },
    {
        presetId: 'steampunk-industrial',
        presetVersion: 1,
        label: 'Steampunk Industrial',
        status: 'published',
        regionComposition: {
            weights: [['urban', 4], ['wilderness', 2], ['mountains', 2], ['ruins', 1], ['other', 1]],
        },
        terrainTendency: 'rolling',
        biomeOverrides: { urban: 'city', other: 'wasteland' },
        hazardRules: [
            { hazard: 'toxic', biomes: ['city', 'wasteland'], chance: 0.3 },
        ],
        nameParts: [
            ['Brass', 'Cog', 'Soot', 'Iron', 'Steam', 'Gaslight', 'Copper', 'Clockwork'],
            ['Quarter', 'Works', 'Yards', 'Terrace', 'Docks', 'Foundry', 'Sprawl', 'Heights'],
        ],
    },
    {
        presetId: 'horror-cosmic',
        presetVersion: 1,
        label: 'Cosmic Horror',
        status: 'published',
        regionComposition: {
            weights: [['wilderness', 3], ['ocean', 2], ['ruins', 2], ['urban', 2], ['forest', 1]],
        },
        terrainTendency: 'rolling',
        biomeOverrides: { wilderness: 'swamp', other: 'coast' },
        hazardRules: [
            { hazard: 'anomaly', biomes: ['coast', 'sea', 'swamp'], chance: 0.3 },
            { hazard: 'haunted', biomes: ['ruins', 'forest', 'swamp', 'city'], chance: 0.25 },
        ],
        nameParts: [
            ['Drowned', 'Nameless', 'Whispering', 'Sunken', 'Pallid', 'Cyclopean', 'Forgotten', 'Mist-veiled'],
            ['Shore', 'Hamlet', 'Moor', 'Depths', 'Hollow', 'Reef', 'Marsh', 'Vale'],
        ],
    },
    {
        presetId: 'fantasy-oriental',
        presetVersion: 1,
        label: 'Oriental Fantasy',
        status: 'published',
        regionComposition: {
            weights: [['wilderness', 3], ['forest', 2], ['mountains', 3], ['urban', 2], ['ruins', 1]],
        },
        terrainTendency: 'mountainous',
        biomeOverrides: { wilderness: 'plains' },
        hazardRules: [
            { hazard: 'haunted', biomes: ['forest', 'ruins'], chance: 0.15 },
            { hazard: 'storm', biomes: ['coast', 'sea', 'mountain'], chance: 0.2 },
        ],
        nameParts: [
            ['Jade', 'Crane', 'Lotus', 'Bamboo', 'Moonlit', 'Azure', 'Thunder', 'Plum Blossom'],
            ['Valley', 'Province', 'Peaks', 'Terraces', 'Coast', 'Forest', 'Pass', 'Marsh'],
        ],
    },
    {
        presetId: DEFAULT_PRESET_ID,
        presetVersion: DEFAULT_PRESET_VERSION,
        label: 'Temperate Fantasy',
        status: 'published',
        regionComposition: { weights: DEFAULT_REGION_WEIGHTS },
        terrainTendency: 'rolling',
        hazardRules: DEFAULT_HAZARD_RULES,
        nameParts: DEFAULT_NAME_PARTS,
    },
];

function deepFreeze<T>(value: T): T {
    if (value && typeof value === 'object' && !Object.isFrozen(value)) {
        for (const child of Object.values(value as Record<string, unknown>)) {
            deepFreeze(child);
        }
        Object.freeze(value);
    }
    return value;
}

function presetValidationErrors(preset: GenreWorldPreset): string[] {
    const errors: string[] = [];
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(preset.presetId)) {
        errors.push('presetId must be kebab-case');
    }
    if (!Number.isInteger(preset.presetVersion) || preset.presetVersion < 1) {
        errors.push('presetVersion must be a positive integer');
    }
    if (!preset.label.trim()) {
        errors.push('label is required');
    }
    if (preset.status !== 'published' && preset.status !== 'example') {
        errors.push('status must be published or example');
    }
    if (preset.regionComposition.weights.length === 0
        || preset.regionComposition.weights.some(([, weight]) => !Number.isFinite(weight) || weight <= 0)) {
        errors.push('regionComposition.weights must contain positive finite weights');
    }
    const guarantee = preset.regionComposition.guarantee;
    if (guarantee) {
        if (guarantee.some(([, count]) => !Number.isInteger(count) || count < 0)) {
            errors.push('regionComposition.guarantee counts must be non-negative integers');
        }
        const guaranteeTotal = guarantee.reduce((sum, [, count]) => sum + count, 0);
        if (guaranteeTotal > MIN_SUPPORTED_REGION_COUNT) {
            errors.push(`regionComposition.guarantee total must be <= ${MIN_SUPPORTED_REGION_COUNT}`);
        }
    }
    if (preset.districtProfileId !== undefined
        && (typeof preset.districtProfileId !== 'string' || !preset.districtProfileId.trim())) {
        errors.push('districtProfileId must be a non-empty string');
    }
    return errors;
}

function buildRegistry(presets: GenreWorldPreset[]): Readonly<Record<string, Readonly<Record<number, GenreWorldPreset>>>> {
    const registry: Record<string, Record<number, GenreWorldPreset>> = {};
    for (const preset of presets) {
        const errors = presetValidationErrors(preset);
        if (errors.length > 0) {
            throw new Error(`Invalid genre world preset ${preset.presetId}: ${errors.join('; ')}`);
        }
        const versions = registry[preset.presetId] ?? {};
        if (versions[preset.presetVersion]) {
            throw new Error(`Duplicate genre world preset ${preset.presetId}@${preset.presetVersion}`);
        }
        versions[preset.presetVersion] = preset;
        registry[preset.presetId] = versions;
    }
    return deepFreeze(registry);
}

/** Frozen registry keyed by stable preset id, then exact published version. */
export const GENRE_WORLD_PRESET_REGISTRY = buildRegistry(PRESETS);

function latestPresetVersion(presetId: string): number | undefined {
    const versions = GENRE_WORLD_PRESET_REGISTRY[presetId];
    if (!versions) { return undefined; }
    return Object.keys(versions)
        .map(Number)
        .filter(Number.isInteger)
        .sort((a, b) => b - a)[0];
}

export function getPreset(presetId: string, presetVersion: number): GenreWorldPreset | undefined {
    return GENRE_WORLD_PRESET_REGISTRY[presetId]?.[presetVersion];
}

/**
 * Exact legacy generator theme keys only — same semantics as the old
 * `TABLE[theme] ?? TABLE.default` lookups. No trim, lowercase, normalization,
 * substring matching, or aliases in Slice 1.
 */
const LEGACY_THEME_TO_PRESET_ID: Readonly<Record<string, string>> = Object.freeze({
    'dungeon-crawler': 'fantasy-dungeon',
    'dark-fantasy': 'fantasy-dark',
    cyberpunk: 'cyberpunk-sprawl',
    'post-apocalyptic': 'postapoc-wasteland',
    'zombie-apocalypse': 'zombie-suburban',
    scifi: 'scifi-frontier',
    steampunk: 'steampunk-industrial',
    'cosmic-horror': 'horror-cosmic',
    'oriental-fantasy': 'fantasy-oriental',
});

function resolveLegacyThemePresetId(theme?: string): string | undefined {
    if (theme === undefined) { return undefined; }
    return LEGACY_THEME_TO_PRESET_ID[theme];
}

/**
 * Resolve once at generation time. Explicit unavailable versions are returned
 * unchanged so callers can fail safely instead of substituting another version.
 */
export function resolvePresetId(input: ResolvePresetInput): GenreWorldPresetResolution | undefined {
    const explicitPresetId = input.presetId?.trim();
    if (explicitPresetId) {
        if (input.presetVersion !== undefined) {
            if (!Number.isInteger(input.presetVersion) || input.presetVersion < 1) { return undefined; }
            return {
                presetId: explicitPresetId,
                presetVersion: input.presetVersion,
                resolvedFrom: 'explicit',
            };
        }
        const presetVersion = latestPresetVersion(explicitPresetId);
        return presetVersion === undefined
            ? undefined
            : { presetId: explicitPresetId, presetVersion, resolvedFrom: 'explicit' };
    }

    if (input.genre) {
        const presetId = GENESIS_GENRE_DEFAULT_WORLD_PRESET_ID[input.genre];
        const presetVersion = latestPresetVersion(presetId);
        if (presetVersion !== undefined) {
            return { presetId, presetVersion, resolvedFrom: 'genre' };
        }
    }

    const legacyPresetId = resolveLegacyThemePresetId(input.theme);
    if (legacyPresetId) {
        const presetVersion = latestPresetVersion(legacyPresetId);
        if (presetVersion !== undefined) {
            return { presetId: legacyPresetId, presetVersion, resolvedFrom: 'theme-keyword' };
        }
    }

    return {
        presetId: DEFAULT_PRESET_ID,
        presetVersion: DEFAULT_PRESET_VERSION,
        resolvedFrom: 'default',
    };
}

export function validatePresetForGeneration(
    preset: GenreWorldPreset
): { valid: true } | { valid: false; errors: string[] } {
    const errors = presetValidationErrors(preset);
    if (preset.status !== 'published') {
        errors.push('example presets are not available for generation');
    }
    return errors.length === 0 ? { valid: true } : { valid: false, errors };
}

/**
 * Opt-in composition path. Guarantees are emitted in declaration order, then
 * the weighted remainder is allocated by largest remainder with stable ties.
 */
export function allocateGuaranteedRegionTypes(
    rule: RegionCompositionRule,
    regionCount: number
): RegionType[] {
    if (!rule.guarantee) {
        throw new Error('guarantee is required for guaranteed allocation');
    }
    if (!Number.isInteger(regionCount) || regionCount < MIN_SUPPORTED_REGION_COUNT) {
        throw new Error(`regionCount must be an integer >= ${MIN_SUPPORTED_REGION_COUNT}`);
    }
    const validationPreset: GenreWorldPreset = {
        presetId: 'validation-only',
        presetVersion: 1,
        label: 'Validation only',
        status: 'published',
        regionComposition: rule,
        terrainTendency: 'rolling',
    };
    const errors = presetValidationErrors(validationPreset);
    if (errors.length > 0) {
        throw new Error(errors.join('; '));
    }

    const allocated: RegionType[] = [];
    for (const [type, count] of rule.guarantee) {
        for (let i = 0; i < count; i++) { allocated.push(type); }
    }

    const remainderCount = regionCount - allocated.length;
    const totalWeight = rule.weights.reduce((sum, [, weight]) => sum + weight, 0);
    const quotas = rule.weights.map(([type, weight], index) => {
        const exact = (weight / totalWeight) * remainderCount;
        const count = Math.floor(exact);
        return { type, index, count, fraction: exact - count };
    });
    let unallocated = remainderCount - quotas.reduce((sum, quota) => sum + quota.count, 0);
    const byRemainder = [...quotas].sort((a, b) => b.fraction - a.fraction || a.index - b.index);
    for (let i = 0; i < byRemainder.length && unallocated > 0; i++, unallocated--) {
        byRemainder[i].count++;
    }
    for (const quota of quotas.sort((a, b) => a.index - b.index)) {
        for (let i = 0; i < quota.count; i++) { allocated.push(quota.type); }
    }
    return allocated;
}

/** The complete generated world minus only volatile/bookkeeping metadata. */
export function canonicalContentOf(forge: WorldForge): WorldForge {
    const {
        generatedAt: _generatedAt,
        generationProvenance: _generationProvenance,
        ...stableMeta
    } = forge.meta;
    return {
        ...forge,
        meta: stableMeta,
    };
}

export function reproductionAvailabilityOf(forge: WorldForge): WorldReproductionAvailability {
    const provenance = forge.meta.generationProvenance;
    if (!provenance) {
        return { available: false, reason: 'missing-provenance' };
    }
    const preset = getPreset(provenance.presetId, provenance.presetVersion);
    if (!preset) {
        return { available: false, reason: 'preset-version-unavailable' };
    }
    if (preset.status !== 'published') {
        return { available: false, reason: 'preset-not-published' };
    }
    if (!forge.meta.worldSeed?.trim() || !forge.meta.theme?.trim()) {
        return { available: false, reason: 'missing-reproduction-input' };
    }
    return { available: true, preset, provenance };
}

export const PRESET_ID_TO_OVERMAP_THEME_KEY: Readonly<Record<string, WorldPresetOvermapThemeKey>> = deepFreeze({
    'fantasy-dungeon': 'fantasy',
    'fantasy-dark': 'fantasy',
    'cyberpunk-sprawl': 'cyberpunk',
    'postapoc-wasteland': 'postapoc',
    'zombie-suburban': 'zombie',
    'scifi-frontier': 'scifi',
    'steampunk-industrial': 'steampunk',
    'horror-cosmic': 'horror',
    'fantasy-oriental': 'oriental',
    'fantasy-temperate': 'fantasy',
});

export const PRESET_ID_TO_CARTOGRAPHY_THEME_KEY: Readonly<Record<string, string>> = deepFreeze({
    'fantasy-dungeon': 'dungeon-crawler',
    'fantasy-dark': 'dark-fantasy',
    'cyberpunk-sprawl': 'cyberpunk',
    'postapoc-wasteland': 'post-apocalyptic',
    'zombie-suburban': 'zombie-apocalypse',
    'scifi-frontier': 'scifi',
    'steampunk-industrial': 'steampunk',
    'horror-cosmic': 'cosmic-horror',
    'fantasy-oriental': 'oriental-fantasy',
    'fantasy-temperate': 'fantasy',
});

export const PRESET_ID_TO_CAMPAIGN_KIT_ID: Readonly<Record<string, string>> = deepFreeze({
    'fantasy-dungeon': 'classic_fantasy_guild',
    'fantasy-dark': 'classic_fantasy_guild',
    'cyberpunk-sprawl': 'cyberpunk_courier',
    'postapoc-wasteland': 'postapoc_scavenger',
    'zombie-suburban': 'survival_horror',
    'scifi-frontier': 'space_frontier',
    'steampunk-industrial': 'classic_fantasy_guild',
    'horror-cosmic': 'survival_horror',
    'fantasy-oriental': 'eastern_fantasy',
    'fantasy-temperate': 'classic_fantasy_guild',
});
