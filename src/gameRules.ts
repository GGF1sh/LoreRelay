import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { getWorkspacePath, writeJsonAtomic } from './workspacePaths';
import { CHARACTER_ID_PATTERN } from './characterId';

export interface GameRules {
    enableRpgMechanics: boolean;
    defaultMaxHp: number;
    defaultMaxMp: number;
    diceDifficulty: string; // e.g. "Normal", "Hard"
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
    enableCommerce?: boolean;
    /** LW1 v1+: World tab buy/sell buttons (Core applies trade; GM narrates separately). */
    enableCommerceUi?: boolean;
    /** Default player role when commerce state is initialized. */
    playerRole?: 'merchant' | 'adventurer' | 'retainer' | 'smith' | 'ruler';
    enableNpcAgency?: boolean;
    /** LW3: NPC間関係(同席/共通の危機/派閥対立で affinity が動く)。Registry+Agency 前提。 */
    enableNpcRelationships?: boolean;
    /** Domain Mode: lordship / fief management layer (default OFF). */
    enableDomainMode?: boolean;
    /** World days advanced per monthly domain commit (1–100). */
    domainMonthDays?: number;
    /** Monthly domain actions selectable per commit (1–4). */
    domainMonthlyActions?: number;
    /** §F7: audience hall — petitioners judged in conversation (requires Domain Mode). */
    enableDomainAudience?: boolean;
    /** Petitioners surfaced per audience day (1–4). */
    domainAudienceSize?: number;
    /** §F8: neighboring rival lord tick (requires Domain Mode; World Forge recommended). */
    enableDomainRivals?: boolean;
    /** Optional explicit neighbor region id; auto-picked from World Forge adjacency if unset. */
    domainRivalRegionId?: string;
    /** §F9: officer missions — dispatch appointed officers, resolve on return (requires Domain Mode). */
    enableDomainMissions?: boolean;
    /** Max simultaneously dispatched officers (1–3). */
    domainMaxActiveMissions?: number;
    /** §F10: 3-round battle resolver — replaces a rival raid's instant delta (requires Domain Mode + Rivals). */
    enableMassBattle?: boolean;
    /** Guild Master Mode (F11): adventurer guild / quest board layer (default OFF). */
    enableGuildMode?: boolean;
    /** §G2: request board — clients ruled via resolve_request (requires Guild Mode). */
    enableGuildRequests?: boolean;
    /** §G3: party dispatch + deterministic quest resolution (requires Guild Mode). */
    enableGuildParties?: boolean;
    /** §G4 / §F8 warm-up: rival guild tick (declared only — un wired in v0). */
    enableRivalGuild?: boolean;
    /** Weekly guild actions selectable per commit (1–4). */
    guildWeeklyActions?: number;
    /** Request queue size when open_board runs (1–4, G2+). */
    guildBoardSize?: number;
    /** Max simultaneously active quests (1–3, G3+). */
    guildMaxActiveQuests?: number;
    /** Genre-agnostic hub/job/expedition/discovery loop guidance. */
    enableCampaignKit?: boolean;
    /** Optional built-in Campaign Kit preset id; ignored when campaign_kit.json exists. */
    campaignKitId?: string;
}

export const DEFAULT_GAME_RULES: GameRules = {
    enableRpgMechanics: true,
    defaultMaxHp: 100,
    defaultMaxMp: 50,
    diceDifficulty: "Normal",
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
    enableCommerce: false,
    enableCommerceUi: false,
    playerRole: 'merchant',
    enableNpcAgency: false,
    enableNpcRelationships: false,
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
    campaignKitId: ''
};

export function getGameRulesPath(): string | undefined {
    const ws = getWorkspacePath();
    if (!ws) return undefined;
    return path.join(ws, 'game_rules.json');
}

let cachedRules: GameRules | undefined = undefined;
let cacheRulesPath = '';
let cacheRulesMtime = 0;

function normalizeGuildRuleFlags(rules: GameRules): GameRules {
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

export function clearGameRulesCache(): void {
    cachedRules = undefined;
    cacheRulesPath = '';
    cacheRulesMtime = 0;
}

export function loadGameRules(): GameRules {
    const rulesPath = getGameRulesPath();
    if (!rulesPath || !fs.existsSync(rulesPath)) {
        return { ...DEFAULT_GAME_RULES };
    }
    try {
        const mtime = fs.statSync(rulesPath).mtimeMs;
        if (cachedRules && cacheRulesPath === rulesPath && cacheRulesMtime === mtime) {
            return cachedRules;
        }
        const data = fs.readFileSync(rulesPath, 'utf8');
        const parsed = JSON.parse(data);
        const loaded = normalizeGuildRuleFlags({ ...DEFAULT_GAME_RULES, ...parsed });
        cachedRules = loaded;
        cacheRulesPath = rulesPath;
        cacheRulesMtime = mtime;
        return loaded;
    } catch (err) {
        console.error("Failed to load game_rules.json", err);
        return { ...DEFAULT_GAME_RULES };
    }
}

export function saveGameRules(rules: Partial<GameRules>): void {
    const rulesPath = getGameRulesPath();
    if (!rulesPath) return;

    const current = loadGameRules();
    const sanitized: Partial<GameRules> = {};

    if (rules && typeof rules === 'object') {
        if (rules.enableRpgMechanics !== undefined && typeof rules.enableRpgMechanics === 'boolean') {
            sanitized.enableRpgMechanics = rules.enableRpgMechanics;
        }
        if (rules.defaultMaxHp !== undefined && typeof rules.defaultMaxHp === 'number') {
            sanitized.defaultMaxHp = Math.max(1, Math.min(99999, Math.floor(rules.defaultMaxHp)));
        }
        if (rules.defaultMaxMp !== undefined && typeof rules.defaultMaxMp === 'number') {
            sanitized.defaultMaxMp = Math.max(1, Math.min(99999, Math.floor(rules.defaultMaxMp)));
        }
        if (rules.diceDifficulty !== undefined && typeof rules.diceDifficulty === 'string') {
            const difficulty = rules.diceDifficulty.trim();
            if (difficulty === 'Easy' || difficulty === 'Normal' || difficulty === 'Hard') {
                sanitized.diceDifficulty = difficulty;
            }
        }
        if (rules.skillCommentary !== undefined && typeof rules.skillCommentary === 'boolean') {
            sanitized.skillCommentary = rules.skillCommentary;
        }
        if (rules.backgroundSimulation !== undefined && typeof rules.backgroundSimulation === 'boolean') {
            sanitized.backgroundSimulation = rules.backgroundSimulation;
        }
        if (rules.autoLorebookGrowth !== undefined && typeof rules.autoLorebookGrowth === 'boolean') {
            sanitized.autoLorebookGrowth = rules.autoLorebookGrowth;
        }
        if (rules.enableNpcRegistry !== undefined && typeof rules.enableNpcRegistry === 'boolean') {
            sanitized.enableNpcRegistry = rules.enableNpcRegistry;
        }
        if (rules.enableWorldForge !== undefined && typeof rules.enableWorldForge === 'boolean') {
            sanitized.enableWorldForge = rules.enableWorldForge;
        }
        if (rules.enableEmergentSimulation !== undefined && typeof rules.enableEmergentSimulation === 'boolean') {
            sanitized.enableEmergentSimulation = rules.enableEmergentSimulation;
        }
        if (rules.simIntervalTurns !== undefined && typeof rules.simIntervalTurns === 'number') {
            sanitized.simIntervalTurns = Math.max(1, Math.min(50, Math.floor(rules.simIntervalTurns)));
        }
        if (rules.enableFactionReputation !== undefined && typeof rules.enableFactionReputation === 'boolean') {
            sanitized.enableFactionReputation = rules.enableFactionReputation;
        }
        if (rules.enableTravelEncounters !== undefined && typeof rules.enableTravelEncounters === 'boolean') {
            sanitized.enableTravelEncounters = rules.enableTravelEncounters;
        }
        if (
            rules.travelEncounterDensity === 'low'
            || rules.travelEncounterDensity === 'medium'
            || rules.travelEncounterDensity === 'high'
        ) {
            sanitized.travelEncounterDensity = rules.travelEncounterDensity;
        }
        if (rules.enableCommerce !== undefined && typeof rules.enableCommerce === 'boolean') {
            sanitized.enableCommerce = rules.enableCommerce;
        }
        if (rules.enableNpcAgency !== undefined && typeof rules.enableNpcAgency === 'boolean') {
            sanitized.enableNpcAgency = rules.enableNpcAgency;
        }
        if (rules.enableNpcRelationships !== undefined && typeof rules.enableNpcRelationships === 'boolean') {
            sanitized.enableNpcRelationships = rules.enableNpcRelationships;
        }
        if (rules.enableCommerceUi !== undefined && typeof rules.enableCommerceUi === 'boolean') {
            sanitized.enableCommerceUi = rules.enableCommerceUi;
        }
        const role = rules.playerRole;
        if (
            role === 'merchant'
            || role === 'adventurer'
            || role === 'retainer'
            || role === 'smith'
            || role === 'ruler'
        ) {
            sanitized.playerRole = role;
        }
        if (rules.enableDomainMode !== undefined && typeof rules.enableDomainMode === 'boolean') {
            sanitized.enableDomainMode = rules.enableDomainMode;
        }
        if (rules.domainMonthDays !== undefined && typeof rules.domainMonthDays === 'number') {
            sanitized.domainMonthDays = Math.max(1, Math.min(100, Math.floor(rules.domainMonthDays)));
        }
        if (rules.domainMonthlyActions !== undefined && typeof rules.domainMonthlyActions === 'number') {
            sanitized.domainMonthlyActions = Math.max(1, Math.min(4, Math.floor(rules.domainMonthlyActions)));
        }
        if (rules.enableDomainAudience !== undefined && typeof rules.enableDomainAudience === 'boolean') {
            sanitized.enableDomainAudience = rules.enableDomainAudience;
        }
        if (rules.domainAudienceSize !== undefined && typeof rules.domainAudienceSize === 'number') {
            sanitized.domainAudienceSize = Math.max(1, Math.min(4, Math.floor(rules.domainAudienceSize)));
        }
        if (rules.enableDomainRivals !== undefined && typeof rules.enableDomainRivals === 'boolean') {
            sanitized.enableDomainRivals = rules.enableDomainRivals;
        }
        if (typeof rules.domainRivalRegionId === 'string' && CHARACTER_ID_PATTERN.test(rules.domainRivalRegionId)) {
            sanitized.domainRivalRegionId = rules.domainRivalRegionId;
        }
        if (rules.enableDomainMissions !== undefined && typeof rules.enableDomainMissions === 'boolean') {
            sanitized.enableDomainMissions = rules.enableDomainMissions;
        }
        if (rules.domainMaxActiveMissions !== undefined && typeof rules.domainMaxActiveMissions === 'number') {
            sanitized.domainMaxActiveMissions = Math.max(1, Math.min(3, Math.floor(rules.domainMaxActiveMissions)));
        }
        if (rules.enableMassBattle !== undefined && typeof rules.enableMassBattle === 'boolean') {
            sanitized.enableMassBattle = rules.enableMassBattle;
        }
        if (rules.enableGuildMode !== undefined && typeof rules.enableGuildMode === 'boolean') {
            sanitized.enableGuildMode = rules.enableGuildMode;
        }
        if (rules.enableGuildRequests !== undefined && typeof rules.enableGuildRequests === 'boolean') {
            sanitized.enableGuildRequests = rules.enableGuildRequests;
        }
        if (rules.enableGuildParties !== undefined && typeof rules.enableGuildParties === 'boolean') {
            sanitized.enableGuildParties = rules.enableGuildParties;
        }
        if (rules.enableRivalGuild !== undefined && typeof rules.enableRivalGuild === 'boolean') {
            sanitized.enableRivalGuild = rules.enableRivalGuild;
        }
        if (rules.guildWeeklyActions !== undefined && typeof rules.guildWeeklyActions === 'number') {
            sanitized.guildWeeklyActions = Math.max(1, Math.min(4, Math.floor(rules.guildWeeklyActions)));
        }
        if (rules.guildBoardSize !== undefined && typeof rules.guildBoardSize === 'number') {
            sanitized.guildBoardSize = Math.max(1, Math.min(4, Math.floor(rules.guildBoardSize)));
        }
        if (rules.guildMaxActiveQuests !== undefined && typeof rules.guildMaxActiveQuests === 'number') {
            sanitized.guildMaxActiveQuests = Math.max(1, Math.min(3, Math.floor(rules.guildMaxActiveQuests)));
        }
        if (rules.enableCampaignKit !== undefined && typeof rules.enableCampaignKit === 'boolean') {
            sanitized.enableCampaignKit = rules.enableCampaignKit;
        }
        if (rules.campaignKitId !== undefined && typeof rules.campaignKitId === 'string') {
            const kitId = rules.campaignKitId.trim();
            if (!kitId) {
                sanitized.campaignKitId = '';
            } else if (/^[a-zA-Z0-9_-]{1,64}$/.test(kitId)) {
                sanitized.campaignKitId = kitId;
            }
        }
    }

    const updated = normalizeGuildRuleFlags({ ...current, ...sanitized });

    try {
        writeJsonAtomic(rulesPath, updated);
        cachedRules = updated;
        cacheRulesPath = rulesPath;
        try { cacheRulesMtime = fs.statSync(rulesPath).mtimeMs; } catch { cacheRulesMtime = 0; }
    } catch (err) {
        console.error("Failed to save game_rules.json", err);
    }
}
