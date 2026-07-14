// Pure game_rules normalization (no vscode/fs). Shared by load, save, and tests.

import { CHARACTER_ID_PATTERN } from './characterId';

export type AiParticipationPolicy = 'always' | 'onDemand' | 'simulationOnly';

/** Economy pacing for market recovery / shock strength. Missing/invalid → normal. */
export type EconomyProfile = 'easy' | 'normal' | 'harsh';

export interface GameRules {
    enableRpgMechanics: boolean;
    defaultMaxHp: number;
    defaultMaxMp: number;
    diceDifficulty: string;
    skillCommentary?: boolean;
    backgroundSimulation?: boolean;
    autoLorebookGrowth?: boolean;
    enableNpcRegistry?: boolean;
    enableWorldForge?: boolean;
    enableEmergentSimulation?: boolean;
    simIntervalTurns?: number;
    enableFactionReputation?: boolean;
    enableTravelEncounters?: boolean;
    travelEncounterDensity?: 'low' | 'medium' | 'high';
    /** Market recovery / shock pacing. Default normal preserves legacy numbers. */
    economyProfile?: EconomyProfile;
    enableCommerce?: boolean;
    enableCommerceUi?: boolean;
    playerRole?: 'merchant' | 'adventurer' | 'retainer' | 'smith' | 'ruler';
    enableNpcAgency?: boolean;
    enableNpcRelationships?: boolean;
    maxNamedNpcCount?: number;
    maxMemoriesPerNpc?: number;
    enableDomainMode?: boolean;
    domainMonthDays?: number;
    domainMonthlyActions?: number;
    enableDomainAudience?: boolean;
    domainAudienceSize?: number;
    enableDomainRivals?: boolean;
    domainRivalRegionId?: string;
    enableDomainMissions?: boolean;
    domainMaxActiveMissions?: number;
    enableMassBattle?: boolean;
    enableGuildMode?: boolean;
    enableGuildRequests?: boolean;
    enableGuildParties?: boolean;
    enableRivalGuild?: boolean;
    guildWeeklyActions?: number;
    guildBoardSize?: number;
    guildMaxActiveQuests?: number;
    enableCampaignKit?: boolean;
    campaignKitId?: string;
    enableWorldObservatory?: boolean;
    enableSettlementMode?: boolean;
    enableSettlementDiorama?: boolean;
    enableVehicleSystem?: boolean;
    enableMobileBaseSystem?: boolean;
    aiParticipationPolicy?: AiParticipationPolicy;
    excludedEventIds?: string[];
}

export const DEFAULT_GAME_RULES: GameRules = {
    enableRpgMechanics: true,
    defaultMaxHp: 100,
    defaultMaxMp: 50,
    diceDifficulty: 'Normal',
    skillCommentary: false,
    backgroundSimulation: false,
    autoLorebookGrowth: false,
    enableNpcRegistry: false,
    enableWorldForge: false,
    enableEmergentSimulation: false,
    simIntervalTurns: 5,
    enableFactionReputation: false,
    enableTravelEncounters: false,
    travelEncounterDensity: 'medium',
    economyProfile: 'normal',
    enableCommerce: false,
    enableCommerceUi: false,
    playerRole: 'merchant',
    enableNpcAgency: false,
    enableNpcRelationships: false,
    maxNamedNpcCount: 10,
    maxMemoriesPerNpc: 10,
    enableDomainMode: false,
    domainMonthDays: 30,
    domainMonthlyActions: 2,
    enableDomainAudience: false,
    domainAudienceSize: 3,
    enableDomainRivals: false,
    enableDomainMissions: false,
    domainMaxActiveMissions: 2,
    enableMassBattle: false,
    enableGuildMode: false,
    enableGuildRequests: false,
    enableGuildParties: false,
    enableRivalGuild: false,
    guildWeeklyActions: 2,
    guildBoardSize: 3,
    guildMaxActiveQuests: 2,
    enableCampaignKit: false,
    campaignKitId: '',
    enableWorldObservatory: false,
    enableSettlementMode: false,
    enableSettlementDiorama: false,
    enableVehicleSystem: false,
    enableMobileBaseSystem: false,
    aiParticipationPolicy: 'always',
};

const VALID_DICE = new Set(['Easy', 'Normal', 'Hard']);
const VALID_ROLES = new Set(['merchant', 'adventurer', 'retainer', 'smith', 'ruler']);
const VALID_DENSITIES = new Set(['low', 'medium', 'high']);
const VALID_ECONOMY_PROFILES = new Set<EconomyProfile>(['easy', 'normal', 'harsh']);
const VALID_AI_PARTICIPATION_POLICIES = new Set<AiParticipationPolicy>(['always', 'onDemand', 'simulationOnly']);

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
    if (typeof value !== 'number' || !Number.isFinite(value)) { return fallback; }
    return Math.max(min, Math.min(max, Math.floor(value)));
}

function asBool(value: unknown, fallback: boolean): boolean {
    return typeof value === 'boolean' ? value : fallback;
}

function asOptionalBool(value: unknown, fallback: boolean | undefined): boolean | undefined {
    return typeof value === 'boolean' ? value : fallback;
}

function asTrimmedString(value: unknown, maxLen: number, fallback: string): string {
    if (typeof value !== 'string') { return fallback; }
    const t = value.trim();
    return t ? t.slice(0, maxLen) : fallback;
}

function asCampaignKitId(value: unknown, fallback: string): string {
    if (typeof value !== 'string') { return fallback; }
    const kitId = value.trim();
    if (!kitId) { return ''; }
    return /^[a-zA-Z0-9_-]{1,64}$/.test(kitId) ? kitId : fallback;
}

function asDomainRivalRegionId(value: unknown, fallback: string | undefined): string | undefined {
    if (typeof value !== 'string' || !CHARACTER_ID_PATTERN.test(value)) { return fallback; }
    return value;
}

export function normalizeGuildRuleFlags(rules: GameRules): GameRules {
    if (rules.enableGuildMode === true) {
        return rules;
    }
    return {
        ...rules,
        enableGuildRequests: false,
        enableGuildParties: false,
        enableRivalGuild: false,
    };
}

/**
 * Normalize raw/partial game_rules into a full GameRules object.
 * Invalid fields fall back to `base` (default: DEFAULT_GAME_RULES).
 */
export function normalizeGameRules(raw: unknown, base: GameRules = DEFAULT_GAME_RULES): GameRules {
    const src = raw && typeof raw === 'object' && !Array.isArray(raw)
        ? raw as Record<string, unknown>
        : {};

    const diceRaw = typeof src.diceDifficulty === 'string' ? src.diceDifficulty.trim() : base.diceDifficulty;
    const diceDifficulty = VALID_DICE.has(diceRaw) ? diceRaw : base.diceDifficulty;

    const densityRaw = src.travelEncounterDensity;
    const travelEncounterDensity = VALID_DENSITIES.has(densityRaw as string)
        ? densityRaw as GameRules['travelEncounterDensity']
        : base.travelEncounterDensity;

    const economyProfileRaw = src.economyProfile;
    const economyProfile = VALID_ECONOMY_PROFILES.has(economyProfileRaw as EconomyProfile)
        ? economyProfileRaw as EconomyProfile
        : base.economyProfile;

    const roleRaw = src.playerRole;
    const playerRole = VALID_ROLES.has(roleRaw as string)
        ? roleRaw as GameRules['playerRole']
        : base.playerRole;

    const aiParticipationPolicyRaw = src.aiParticipationPolicy;
    const aiParticipationPolicy = VALID_AI_PARTICIPATION_POLICIES.has(aiParticipationPolicyRaw as AiParticipationPolicy)
        ? aiParticipationPolicyRaw as AiParticipationPolicy
        : base.aiParticipationPolicy;

    let excludedEventIds = base.excludedEventIds;
    if (Array.isArray(src.excludedEventIds)) {
        excludedEventIds = src.excludedEventIds
            .filter((id) => typeof id === 'string')
            .map((id) => id.trim())
            .filter((id) => id.length > 0)
            .slice(0, 200);
    }

    const normalized: GameRules = {
        enableRpgMechanics: asBool(src.enableRpgMechanics, base.enableRpgMechanics),
        defaultMaxHp: clampInt(src.defaultMaxHp, 1, 99999, base.defaultMaxHp),
        defaultMaxMp: clampInt(src.defaultMaxMp, 1, 99999, base.defaultMaxMp),
        diceDifficulty,
        skillCommentary: asOptionalBool(src.skillCommentary, base.skillCommentary),
        backgroundSimulation: asOptionalBool(src.backgroundSimulation, base.backgroundSimulation),
        autoLorebookGrowth: asOptionalBool(src.autoLorebookGrowth, base.autoLorebookGrowth),
        enableNpcRegistry: asOptionalBool(src.enableNpcRegistry, base.enableNpcRegistry),
        enableWorldForge: asOptionalBool(src.enableWorldForge, base.enableWorldForge),
        enableEmergentSimulation: asOptionalBool(src.enableEmergentSimulation, base.enableEmergentSimulation),
        simIntervalTurns: clampInt(src.simIntervalTurns, 1, 50, base.simIntervalTurns ?? 5),
        enableFactionReputation: asOptionalBool(src.enableFactionReputation, base.enableFactionReputation),
        enableTravelEncounters: asOptionalBool(src.enableTravelEncounters, base.enableTravelEncounters),
        travelEncounterDensity,
        economyProfile,
        enableCommerce: asOptionalBool(src.enableCommerce, base.enableCommerce),
        enableCommerceUi: asOptionalBool(src.enableCommerceUi, base.enableCommerceUi),
        playerRole,
        enableNpcAgency: asOptionalBool(src.enableNpcAgency, base.enableNpcAgency),
        enableNpcRelationships: asOptionalBool(src.enableNpcRelationships, base.enableNpcRelationships),
        maxNamedNpcCount: clampInt(src.maxNamedNpcCount, 1, 5000, base.maxNamedNpcCount ?? 10),
        maxMemoriesPerNpc: clampInt(src.maxMemoriesPerNpc, 1, 5000, base.maxMemoriesPerNpc ?? 10),
        enableDomainMode: asOptionalBool(src.enableDomainMode, base.enableDomainMode),
        domainMonthDays: clampInt(src.domainMonthDays, 1, 100, base.domainMonthDays ?? 30),
        domainMonthlyActions: clampInt(src.domainMonthlyActions, 1, 4, base.domainMonthlyActions ?? 2),
        enableDomainAudience: asOptionalBool(src.enableDomainAudience, base.enableDomainAudience),
        domainAudienceSize: clampInt(src.domainAudienceSize, 1, 4, base.domainAudienceSize ?? 3),
        enableDomainRivals: asOptionalBool(src.enableDomainRivals, base.enableDomainRivals),
        domainRivalRegionId: asDomainRivalRegionId(src.domainRivalRegionId, base.domainRivalRegionId),
        enableDomainMissions: asOptionalBool(src.enableDomainMissions, base.enableDomainMissions),
        domainMaxActiveMissions: clampInt(src.domainMaxActiveMissions, 1, 3, base.domainMaxActiveMissions ?? 2),
        enableMassBattle: asOptionalBool(src.enableMassBattle, base.enableMassBattle),
        enableGuildMode: asOptionalBool(src.enableGuildMode, base.enableGuildMode),
        enableGuildRequests: asOptionalBool(src.enableGuildRequests, base.enableGuildRequests),
        enableGuildParties: asOptionalBool(src.enableGuildParties, base.enableGuildParties),
        enableRivalGuild: asOptionalBool(src.enableRivalGuild, base.enableRivalGuild),
        guildWeeklyActions: clampInt(src.guildWeeklyActions, 1, 4, base.guildWeeklyActions ?? 2),
        guildBoardSize: clampInt(src.guildBoardSize, 1, 4, base.guildBoardSize ?? 3),
        guildMaxActiveQuests: clampInt(src.guildMaxActiveQuests, 1, 3, base.guildMaxActiveQuests ?? 2),
        enableCampaignKit: asOptionalBool(src.enableCampaignKit, base.enableCampaignKit),
        campaignKitId: asCampaignKitId(src.campaignKitId, base.campaignKitId ?? ''),
        enableWorldObservatory: asOptionalBool(src.enableWorldObservatory, base.enableWorldObservatory),
        enableSettlementMode: asOptionalBool(src.enableSettlementMode, base.enableSettlementMode),
        enableSettlementDiorama: asOptionalBool(src.enableSettlementDiorama, base.enableSettlementDiorama),
        enableVehicleSystem: asOptionalBool(src.enableVehicleSystem, base.enableVehicleSystem),
        enableMobileBaseSystem: asOptionalBool(src.enableMobileBaseSystem, base.enableMobileBaseSystem),
        aiParticipationPolicy,
        excludedEventIds,
    };

    return normalizeGuildRuleFlags(normalized);
}

export type EventKind = 'domain' | 'guild' | 'audience';

export function toExcludedEventId(kind: EventKind, id: string): string {
    return `${kind}:${id}`;
}

export function isExcludedEvent(set: ReadonlySet<string>, kind: EventKind, id: string): boolean {
    return set.has(toExcludedEventId(kind, id));
}
