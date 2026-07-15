// Genesis Mode G1: deterministic onboarding answers -> safe game_rules patch.
// Pure module: no vscode, fs, Webview, ComfyUI, or quickstart wiring.

import type { GameRules } from './gameRulesCore';

export const GENESIS_GENRES = [
    'fantasy',
    'post_apocalypse',
    'cyberpunk',
    'sci_fi',
    'eastern',
    'horror',
    'modern',
] as const;
export type GenesisGenre = (typeof GENESIS_GENRES)[number];

export const GENESIS_PLAYSTYLES = [
    'adventure',
    'settlement',
    'vehicle',
    'mobile_base',
    'trade',
    'domain',
    'guild',
    'character_chat',
] as const;
export type GenesisPlaystyle = (typeof GENESIS_PLAYSTYLES)[number];

export const GENESIS_PRESSURES = ['tourist', 'standard', 'survival', 'nightmare'] as const;
export type GenesisPressure = (typeof GENESIS_PRESSURES)[number];

export const GENESIS_BOOKKEEPING_LEVELS = ['minimal', 'light', 'detailed'] as const;
export type GenesisBookkeeping = (typeof GENESIS_BOOKKEEPING_LEVELS)[number];

export const GENESIS_PROTAGONIST_MODES = ['generate', 'sillytavern', 'manual', 'skip'] as const;
export type GenesisProtagonistMode = (typeof GENESIS_PROTAGONIST_MODES)[number];

export interface GenesisAnswers {
    genre?: unknown;
    playstyle?: unknown;
    pressure?: unknown;
    bookkeeping?: unknown;
    protagonistMode?: unknown;
    imageGenerationWanted?: unknown;
}

export interface NormalizedGenesisAnswers {
    genre: GenesisGenre;
    playstyle: GenesisPlaystyle;
    pressure: GenesisPressure;
    bookkeeping: GenesisBookkeeping;
    protagonistMode: GenesisProtagonistMode;
    imageGenerationWanted: boolean;
}

export type RulesProfileWarningCode =
    | 'invalid_genre'
    | 'invalid_playstyle'
    | 'invalid_pressure'
    | 'invalid_bookkeeping'
    | 'invalid_protagonist_mode'
    | 'invalid_image_generation_wanted';

export interface RulesProfileWarning {
    code: RulesProfileWarningCode;
    field: keyof GenesisAnswers;
    fallback: string | boolean;
    received?: string;
}

export interface GenesisAssetHint {
    guideAssetId: string;
    guideWebviewPath: string;
    backgroundAssetId?: string;
    backgroundWebviewPath?: string;
}

export interface RulesProfileResult {
    profileId: string;
    normalizedAnswers: NormalizedGenesisAnswers;
    rulesPatch: Partial<GameRules>;
    summary: string;
    warnings: RulesProfileWarning[];
    comfyUiStylePrompt: string;
    assetHint: GenesisAssetHint;
}

const GENRE_SET = new Set<string>(GENESIS_GENRES);
const PLAYSTYLE_SET = new Set<string>(GENESIS_PLAYSTYLES);
const PRESSURE_SET = new Set<string>(GENESIS_PRESSURES);
const BOOKKEEPING_SET = new Set<string>(GENESIS_BOOKKEEPING_LEVELS);
const PROTAGONIST_MODE_SET = new Set<string>(GENESIS_PROTAGONIST_MODES);

const CAMPAIGN_KIT_BY_GENRE: Record<GenesisGenre, string> = {
    fantasy: 'classic_fantasy_guild',
    post_apocalypse: 'postapoc_scavenger',
    cyberpunk: 'cyberpunk_courier',
    sci_fi: 'space_frontier',
    eastern: 'eastern_fantasy',
    horror: 'survival_horror',
    modern: 'modern_occult',
};

const STYLE_PROMPT_BY_GENRE: Record<GenesisGenre, string> = {
    fantasy: 'classic fantasy, warm lantern light, ancient ruins, painterly adventure key visual',
    post_apocalypse: 'post-apocalyptic wasteland, scavenger settlement, rusted vehicles, dramatic survival key visual',
    cyberpunk: 'cyberpunk neon city, rainy streets, holograms, high contrast sci-fi key visual',
    sci_fi: 'space frontier, starport, exploration vessel, alien horizon, cinematic science fiction key visual',
    eastern: 'eastern fantasy, misty mountains, shrine path, elegant ink-painting adventure key visual',
    horror: 'survival horror, abandoned streets, tense shadows, desperate safe room key visual',
    modern: 'modern occult, urban night, hidden ritual signs, investigative supernatural key visual',
};

const ASSET_HINT_BY_GENRE: Record<GenesisGenre, GenesisAssetHint> = {
    fantasy: {
        guideAssetId: 'guide_fantasy_goddess',
        guideWebviewPath: 'assets/genesis/guide_fantasy_goddess.png',
        backgroundAssetId: 'background_fantasy',
        backgroundWebviewPath: 'assets/genesis/background_fantasy.png',
    },
    post_apocalypse: {
        guideAssetId: 'guide_post_apocalypse_mechanic',
        guideWebviewPath: 'assets/genesis/guide_post_apocalypse_mechanic.png',
        backgroundAssetId: 'background_post_apocalypse',
        backgroundWebviewPath: 'assets/genesis/background_post_apocalypse.png',
    },
    cyberpunk: {
        guideAssetId: 'guide_cyberpunk_ai_avatar',
        guideWebviewPath: 'assets/genesis/guide_cyberpunk_ai_avatar.png',
        backgroundAssetId: 'background_cyberpunk',
        backgroundWebviewPath: 'assets/genesis/background_cyberpunk.png',
    },
    sci_fi: {
        guideAssetId: 'guide_space_alien_mercenary',
        guideWebviewPath: 'assets/genesis/guide_space_alien_mercenary.png',
        backgroundAssetId: 'background_sci_fi',
        backgroundWebviewPath: 'assets/genesis/background_sci_fi.png',
    },
    eastern: {
        guideAssetId: 'guide_eastern_xianxia_fairy',
        guideWebviewPath: 'assets/genesis/guide_eastern_xianxia_fairy.png',
        backgroundAssetId: 'background_eastern',
        backgroundWebviewPath: 'assets/genesis/background_eastern.png',
    },
    horror: {
        guideAssetId: 'guide_horror_hooded',
        guideWebviewPath: 'assets/genesis/guide_horror_hooded.png',
        backgroundAssetId: 'background_horror',
        backgroundWebviewPath: 'assets/genesis/background_horror.png',
    },
    modern: {
        guideAssetId: 'guide_modern_occult_librarian',
        guideWebviewPath: 'assets/genesis/guide_modern_occult_librarian.png',
        backgroundAssetId: 'background_modern',
        backgroundWebviewPath: 'assets/genesis/background_modern.png',
    },
};

function normalizeToken(value: unknown): string | undefined {
    if (typeof value !== 'string') { return undefined; }
    const token = value.trim().toLowerCase().replace(/[-\s]+/g, '_');
    return token || undefined;
}

function invalidWarning(
    code: RulesProfileWarningCode,
    field: keyof GenesisAnswers,
    fallback: string | boolean,
    received: unknown
): RulesProfileWarning {
    const warning: RulesProfileWarning = { code, field, fallback };
    if (typeof received === 'string' || typeof received === 'number' || typeof received === 'boolean') {
        warning.received = String(received).slice(0, 80);
    }
    return warning;
}

function normalizeEnum<T extends string>(
    value: unknown,
    set: Set<string>,
    fallback: T,
    field: keyof GenesisAnswers,
    code: RulesProfileWarningCode,
    warnings: RulesProfileWarning[]
): T {
    const token = normalizeToken(value);
    if (token && set.has(token)) { return token as T; }
    if (value !== undefined) {
        warnings.push(invalidWarning(code, field, fallback, value));
    }
    return fallback;
}

function normalizeBool(value: unknown, fallback: boolean, warnings: RulesProfileWarning[]): boolean {
    if (typeof value === 'boolean') { return value; }
    if (value === undefined) { return fallback; }
    if (typeof value === 'string') {
        const token = normalizeToken(value);
        if (token === 'true' || token === 'yes' || token === 'on') { return true; }
        if (token === 'false' || token === 'no' || token === 'off') { return false; }
    }
    warnings.push(invalidWarning(
        'invalid_image_generation_wanted',
        'imageGenerationWanted',
        fallback,
        value
    ));
    return fallback;
}

export function normalizeGenesisAnswers(raw: GenesisAnswers | undefined): {
    answers: NormalizedGenesisAnswers;
    warnings: RulesProfileWarning[];
} {
    const src = raw ?? {};
    const warnings: RulesProfileWarning[] = [];
    const answers: NormalizedGenesisAnswers = {
        genre: normalizeEnum(src.genre, GENRE_SET, 'fantasy', 'genre', 'invalid_genre', warnings),
        playstyle: normalizeEnum(
            src.playstyle,
            PLAYSTYLE_SET,
            'adventure',
            'playstyle',
            'invalid_playstyle',
            warnings
        ),
        pressure: normalizeEnum(src.pressure, PRESSURE_SET, 'standard', 'pressure', 'invalid_pressure', warnings),
        bookkeeping: normalizeEnum(
            src.bookkeeping,
            BOOKKEEPING_SET,
            'light',
            'bookkeeping',
            'invalid_bookkeeping',
            warnings
        ),
        protagonistMode: normalizeEnum(
            src.protagonistMode,
            PROTAGONIST_MODE_SET,
            'generate',
            'protagonistMode',
            'invalid_protagonist_mode',
            warnings
        ),
        imageGenerationWanted: normalizeBool(src.imageGenerationWanted, true, warnings),
    };
    return { answers, warnings };
}

function applyCommonRules(patch: Partial<GameRules>, answers: NormalizedGenesisAnswers): void {
    patch.enableRpgMechanics = true;
    patch.enableCampaignKit = true;
    patch.campaignKitId = CAMPAIGN_KIT_BY_GENRE[answers.genre];
    patch.enableWorldForge = true;
    patch.enableNpcRegistry = true;
    patch.enableNpcRelationships = true;
    patch.enableFactionReputation = true;
    patch.maxNamedNpcCount = 12;
    patch.maxMemoriesPerNpc = 12;
}

/**
 * Lightweight Parlor / character-chat path.
 * Does not inherit the adventure "common" package (World Forge, Campaign Kit, NPC registry…).
 * Explicitly owns these keys so re-applying the profile is deterministic and does not leave
 * residual adventure systems enabled from a previous Genesis selection.
 */
function applyCharacterChatRules(patch: Partial<GameRules>): void {
    patch.enableRpgMechanics = false;
    patch.enableCampaignKit = false;
    patch.campaignKitId = '';
    patch.enableWorldForge = false;
    patch.enableNpcRegistry = false;
    patch.enableNpcRelationships = false;
    patch.enableFactionReputation = false;
    patch.enableEmergentSimulation = false;
    patch.enableTravelEncounters = false;
    patch.enableNpcAgency = false;
    patch.enableCommerce = false;
    patch.enableCommerceUi = false;
    patch.enableWorldObservatory = false;
    patch.enableSettlementMode = false;
    patch.enableSettlementDiorama = false;
    patch.enableVehicleSystem = false;
    patch.enableMobileBaseSystem = false;
    patch.enableDomainMode = false;
    patch.enableDomainAudience = false;
    patch.enableDomainRivals = false;
    patch.enableDomainMissions = false;
    patch.enableMassBattle = false;
    patch.enableGuildMode = false;
    patch.enableGuildRequests = false;
    patch.enableGuildParties = false;
    patch.enableRivalGuild = false;
    // Keep default-ish budgets; unused while registry/agency are off.
    patch.maxNamedNpcCount = 10;
    patch.maxMemoriesPerNpc = 10;
    patch.simIntervalTurns = 5;
    patch.travelEncounterDensity = 'low';
    patch.diceDifficulty = 'Normal';
}

function applyPressureRules(patch: Partial<GameRules>, pressure: GenesisPressure): void {
    switch (pressure) {
        case 'tourist':
            patch.diceDifficulty = 'Easy';
            patch.enableEmergentSimulation = false;
            patch.simIntervalTurns = 8;
            patch.enableTravelEncounters = false;
            patch.travelEncounterDensity = 'low';
            patch.enableNpcAgency = false;
            break;
        case 'survival':
            patch.diceDifficulty = 'Hard';
            patch.enableEmergentSimulation = true;
            patch.simIntervalTurns = 3;
            patch.enableTravelEncounters = true;
            patch.travelEncounterDensity = 'high';
            patch.enableNpcAgency = true;
            break;
        case 'nightmare':
            patch.diceDifficulty = 'Hard';
            patch.enableEmergentSimulation = true;
            patch.simIntervalTurns = 2;
            patch.enableTravelEncounters = true;
            patch.travelEncounterDensity = 'high';
            patch.enableNpcAgency = true;
            patch.maxNamedNpcCount = 16;
            break;
        case 'standard':
        default:
            patch.diceDifficulty = 'Normal';
            patch.enableEmergentSimulation = true;
            patch.simIntervalTurns = 5;
            patch.enableTravelEncounters = true;
            patch.travelEncounterDensity = 'medium';
            patch.enableNpcAgency = true;
            break;
    }
}

function applyPlaystyleRules(patch: Partial<GameRules>, playstyle: GenesisPlaystyle): void {
    switch (playstyle) {
        case 'settlement':
            patch.enableSettlementMode = true;
            patch.enableSettlementDiorama = true;
            patch.enableCommerce = true;
            patch.enableCommerceUi = true;
            break;
        case 'vehicle':
            patch.enableVehicleSystem = true;
            patch.enableCommerce = true;
            patch.enableCommerceUi = true;
            patch.playerRole = 'adventurer';
            break;
        case 'mobile_base':
            patch.enableVehicleSystem = true;
            patch.enableSettlementMode = true;
            patch.enableSettlementDiorama = true;
            patch.enableMobileBaseSystem = true;
            patch.enableCommerce = true;
            patch.enableCommerceUi = true;
            patch.playerRole = 'merchant';
            break;
        case 'trade':
            patch.enableCommerce = true;
            patch.enableCommerceUi = true;
            patch.enableWorldObservatory = true;
            patch.playerRole = 'merchant';
            break;
        case 'domain':
            patch.enableDomainMode = true;
            patch.enableDomainAudience = true;
            patch.enableDomainRivals = true;
            patch.enableDomainMissions = true;
            patch.playerRole = 'ruler';
            break;
        case 'guild':
            patch.enableGuildMode = true;
            patch.enableGuildRequests = true;
            patch.enableGuildParties = true;
            patch.playerRole = 'adventurer';
            break;
        case 'character_chat':
            // Handled by applyCharacterChatRules() in resolveRulesProfile (skips common package).
            break;
        case 'adventure':
        default:
            patch.playerRole = 'adventurer';
            break;
    }
}

function applyBookkeepingRules(patch: Partial<GameRules>, answers: NormalizedGenesisAnswers): void {
    const playstyleNeedsCommerce = answers.playstyle === 'trade'
        || answers.playstyle === 'settlement'
        || answers.playstyle === 'vehicle'
        || answers.playstyle === 'mobile_base';

    if (answers.bookkeeping === 'minimal') {
        patch.enableWorldObservatory = false;
        if (!playstyleNeedsCommerce) {
            patch.enableCommerce = false;
            patch.enableCommerceUi = false;
        } else {
            patch.enableCommerceUi = false;
        }
        if (answers.pressure !== 'survival' && answers.pressure !== 'nightmare') {
            patch.simIntervalTurns = Math.max(6, patch.simIntervalTurns ?? 6);
        }
        return;
    }

    if (answers.bookkeeping === 'detailed') {
        patch.enableWorldObservatory = true;
        patch.enableCommerce = patch.enableCommerce ?? playstyleNeedsCommerce;
        patch.enableCommerceUi = patch.enableCommerceUi ?? playstyleNeedsCommerce;
        patch.maxMemoriesPerNpc = 20;
        patch.maxNamedNpcCount = Math.max(20, patch.maxNamedNpcCount ?? 20);
    }
}

function label(value: string): string {
    return value.split('_').map((part) => part ? part[0].toUpperCase() + part.slice(1) : part).join(' ');
}

function buildSummary(answers: NormalizedGenesisAnswers, patch: Partial<GameRules>): string {
    if (answers.playstyle === 'character_chat') {
        return [
            `${label(answers.genre)} / ${label(answers.playstyle)}`,
            `pressure=${answers.pressure}`,
            `bookkeeping=${answers.bookkeeping}`,
            `protagonist=${answers.protagonistMode}`,
            `images=${answers.imageGenerationWanted ? 'wanted' : 'skip'}`,
            'systems=character chat (Parlor)',
        ].join('; ');
    }
    const enabled: string[] = [];
    if (patch.enableSettlementMode) { enabled.push('Settlement'); }
    if (patch.enableVehicleSystem) { enabled.push('Vehicle'); }
    if (patch.enableMobileBaseSystem) { enabled.push('Mobile Base'); }
    if (patch.enableDomainMode) { enabled.push('Domain'); }
    if (patch.enableGuildMode) { enabled.push('Guild'); }
    if (patch.enableCommerce) { enabled.push('Commerce'); }
    if (patch.enableWorldObservatory) { enabled.push('Observatory'); }
    const systems = enabled.length ? enabled.join(', ') : 'core adventure loop';
    return [
        `${label(answers.genre)} / ${label(answers.playstyle)}`,
        `pressure=${answers.pressure}`,
        `bookkeeping=${answers.bookkeeping}`,
        `protagonist=${answers.protagonistMode}`,
        `images=${answers.imageGenerationWanted ? 'wanted' : 'skip'}`,
        `systems=${systems}`,
    ].join('; ');
}

/** Resolve Genesis onboarding answers into a deterministic, safe game_rules patch. */
export function resolveRulesProfile(rawAnswers?: GenesisAnswers): RulesProfileResult {
    const { answers, warnings } = normalizeGenesisAnswers(rawAnswers);
    const rulesPatch: Partial<GameRules> = {};
    if (answers.playstyle === 'character_chat') {
        // Composition: chat path does not inherit adventure common/pressure/bookkeeping packages.
        applyCharacterChatRules(rulesPatch);
    } else {
        applyCommonRules(rulesPatch, answers);
        applyPressureRules(rulesPatch, answers.pressure);
        applyPlaystyleRules(rulesPatch, answers.playstyle);
        applyBookkeepingRules(rulesPatch, answers);
    }

    return {
        profileId: [
            answers.genre,
            answers.playstyle,
            answers.pressure,
            answers.bookkeeping,
        ].join('.'),
        normalizedAnswers: answers,
        rulesPatch,
        summary: buildSummary(answers, rulesPatch),
        warnings,
        comfyUiStylePrompt: STYLE_PROMPT_BY_GENRE[answers.genre],
        assetHint: ASSET_HINT_BY_GENRE[answers.genre],
    };
}
