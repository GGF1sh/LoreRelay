// Guild Master G1–G2: quest-board role layer — weekly stats/events + request board (no vscode/fs).

import { CHARACTER_ID_PATTERN } from './characterId';
import {
    buildRequestQueue,
    getRequest,
    resolveRequestRuling,
    isValidGuildRequestId,
    isValidRequestRulingId,
    isValidQuestKind,
    resolveQuestDifficulty,
    resolveQuestReward,
    formatRequestChronicleText,
    type QuestKind,
} from './guildRequestCore';

export const MAX_GUILD_ADVENTURERS = 5;
export const MAX_GUILD_ACTIONS_PER_WEEK = 4;
export const DEFAULT_GUILD_WEEKLY_ACTIONS = 2;
export const WEEKS_PER_YEAR = 48;
export const WEEKS_PER_SEASON = 12;
export const GUILD_STAT_MIN = 0;
export const GUILD_STAT_MAX = 100;
export const GUILD_RESOURCE_MAX = 9999;
export const MAX_GUILD_PENDING_EVENTS = 8;
export const MAX_GUILD_PENDING_REQUESTS = 4;
export const DEFAULT_BOARD_SIZE = 3;
export const MAX_ACTIVE_QUESTS = 3;
export const DEFAULT_MAX_ACTIVE_QUESTS = 2;

export type GuildRank = 'chartered' | 'reputable' | 'renowned';
export type AdventurerClass = 'warrior' | 'scout' | 'mage' | 'healer' | 'rogue';
export type GuildActionId =
    | 'recruit_drive'
    | 'train'
    | 'maintain_hall'
    | 'advertise'
    | 'stock_supplies'
    | 'court_patrons'
    | 'open_board';
export type GuildOpsKind =
    | 'weekly_commit'
    | 'recruit_adventurer'
    | 'dismiss_adventurer'
    | 'resolve_request';
export type GuildSeason = 'spring' | 'summer' | 'autumn' | 'winter';

export interface GuildQuest {
    id: string;
    requestId: string;
    questKind: QuestKind;
    difficulty: number;
    rewardCoffers: number;
    status: 'accepted' | 'active';
    partyNpcIds?: string[];
    weeksRemaining?: number;
}

export interface GuildAdventurer {
    npcId: string;
    klass: AdventurerClass;
    skill?: number;
}

export interface GuildState {
    enabled: boolean;
    hallLocationId: string;
    rank: GuildRank;
    calendarWeek: number;
    calendarYear: number;
    coffers: number;
    supplies: number;
    renown: number;
    discipline: number;
    townFavor: number;
    facilities: number;
    safety: number;
    lore: number;
    weeklyActionsRemaining: number;
    lastCommitWorldTurn?: number;
    lastEventId?: string;
    lastWeeklyActions?: GuildActionId[];
    adventurers: GuildAdventurer[];
    pendingRequests?: string[];
    /** Accepted or active quests (G2 accept / G3 assign). */
    quests?: GuildQuest[];
    pendingEvents: string[];
    flags: Record<string, boolean>;
}

export interface GuildConfig {
    weeklyActions: number;
    boardSize: number;
    maxActiveQuests: number;
    /** G2: open_board generates request queue + board prompts. */
    requestsEnabled?: boolean;
}

export interface GuildOps {
    kind: GuildOpsKind;
    actions?: GuildActionId[];
    adventurer?: { npcId: string; klass: AdventurerClass; skill?: number };
    requestId?: string;
    rulingId?: 'accept' | 'decline' | 'negotiate';
}

export interface RequestRulingResult {
    requestId: string;
    rulingId: string;
    chronicleText: string;
}

export interface GuildStatDelta {
    coffers?: number;
    supplies?: number;
    renown?: number;
    discipline?: number;
    townFavor?: number;
    facilities?: number;
    safety?: number;
    lore?: number;
}

export interface WeeklyCommitResult {
    guild: GuildState;
    rolledEventId: string;
    chronicleText: string;
    counterLines: string[];
}

const GUILD_RANKS: readonly GuildRank[] = ['chartered', 'reputable', 'renowned'];
const ADVENTURER_CLASSES: readonly AdventurerClass[] = ['warrior', 'scout', 'mage', 'healer', 'rogue'];
const GUILD_ACTIONS: readonly GuildActionId[] = [
    'recruit_drive', 'train', 'maintain_hall', 'advertise',
    'stock_supplies', 'court_patrons', 'open_board',
];

/** Display order for future World tab action chips (G2+). */
export const GUILD_ACTION_CATALOG: readonly GuildActionId[] = GUILD_ACTIONS;

const ACTION_DELTAS: Record<GuildActionId, GuildStatDelta> = {
    recruit_drive: { renown: 1, coffers: -30 },
    train: { supplies: -10, safety: 1, coffers: -40 },
    maintain_hall: { facilities: 3, coffers: -50 },
    advertise: { renown: 2, townFavor: 1, coffers: -25 },
    stock_supplies: { supplies: 20, coffers: -35, facilities: 1 },
    court_patrons: { coffers: 15, renown: 1, townFavor: 1 },
    open_board: { coffers: -10, townFavor: 1 },
};

interface GuildEventDef {
    id: string;
    baseWeight: number;
    facilitiesMax?: number;
    renownMin?: number;
    disciplineMax?: number;
    townFavorMax?: number;
    safetyMax?: number;
    requiresAdventurers?: boolean;
    season?: GuildSeason;
}

const GUILD_EVENTS: readonly GuildEventDef[] = [
    { id: 'quest_board_dry', baseWeight: 10, townFavorMax: 45 },
    { id: 'wealthy_patron', baseWeight: 15, renownMin: 40 },
    { id: 'adventurer_brawl', baseWeight: 12, disciplineMax: 45 },
    { id: 'rival_poaching', baseWeight: 8, safetyMax: 40 },
    { id: 'walk_in_petition', baseWeight: 14, townFavorMax: 45 },
    { id: 'supply_shortage', baseWeight: 9, renownMin: 25 },
    { id: 'tavern_rumor', baseWeight: 11 },
    { id: 'festival_recruits', baseWeight: 6 },
    { id: 'member_discontent', baseWeight: 4, requiresAdventurers: true },
    { id: 'guild_quiet_week', baseWeight: 2 },
];

const GUILD_EVENT_IDS = new Set(GUILD_EVENTS.map((e) => e.id));

const GUILD_EVENT_EFFECTS: Record<string, GuildStatDelta> = {
    quest_board_dry: { coffers: -20, townFavor: -4, facilities: -1 },
    wealthy_patron: { coffers: 40, renown: 2, townFavor: 1 },
    adventurer_brawl: { discipline: -6, supplies: -15, coffers: -10 },
    rival_poaching: { safety: -2, renown: 1, discipline: -2 },
    walk_in_petition: { townFavor: -3, discipline: -2 },
    supply_shortage: { supplies: -25, coffers: -15 },
    tavern_rumor: { renown: 1 },
    festival_recruits: { townFavor: 2, renown: 1, supplies: -10, coffers: -15 },
    member_discontent: { discipline: -3, renown: -2, townFavor: -1 },
    guild_quiet_week: { townFavor: 1 },
};

export const GUILD_EVENT_GM_HINTS: Record<string, string> = {
    quest_board_dry: 'The quest board ran dry; narrate fewer commissions. Core already reduced coffers and town favor.',
    wealthy_patron: 'A wealthy patron visited; narrate patronage. Coffers and renown already increased.',
    adventurer_brawl: 'Adventurers brawled in the hall; narrate discipline trouble. Supplies and discipline already reduced.',
    rival_poaching: 'A rival guild stirred; narrate poaching pressure. Safety and discipline already dipped.',
    walk_in_petition: 'Walk-in petitioners crowded the counter; narrate grievances. Town favor already dipped.',
    supply_shortage: 'Supplies ran short; narrate rationing. Supplies and coffers already reduced.',
    tavern_rumor: 'Tavern rumors spread; narrate hearsay only — no new map facts.',
    festival_recruits: 'A seasonal festival drew recruits; narrate celebration strain. Town favor rose; supplies/coffers already spent.',
    member_discontent: 'An adventurer shows discontent; narrate hall tension. Discipline and renown already dipped.',
    guild_quiet_week: 'A calm week at the guild; narrate small daily life at the counter.',
};

export function isValidGuildEventId(value: unknown): value is string {
    return typeof value === 'string' && GUILD_EVENT_IDS.has(value);
}

export function sanitizeGuildPromptLabel(value: unknown, fallback = 'adventurer', max = 64): string {
    if (typeof value !== 'string') { return fallback; }
    const trimmed = value.trim().replace(/[\r\n\t\x00-\x1f]/g, ' ').slice(0, max);
    if (!trimmed || !CHARACTER_ID_PATTERN.test(trimmed)) { return fallback; }
    return trimmed;
}

export function clampGuildStat(value: unknown): number {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
        return GUILD_STAT_MIN;
    }
    return Math.max(GUILD_STAT_MIN, Math.min(GUILD_STAT_MAX, Math.floor(value)));
}

export function clampGuildResource(value: unknown): number {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
        return 0;
    }
    return Math.max(0, Math.min(GUILD_RESOURCE_MAX, Math.floor(value)));
}

export function isValidGuildRank(value: unknown): value is GuildRank {
    return typeof value === 'string' && (GUILD_RANKS as readonly string[]).includes(value);
}

export function isValidAdventurerClass(value: unknown): value is AdventurerClass {
    return typeof value === 'string' && (ADVENTURER_CLASSES as readonly string[]).includes(value);
}

export function isValidGuildActionId(value: unknown): value is GuildActionId {
    return typeof value === 'string' && (GUILD_ACTIONS as readonly string[]).includes(value);
}

function parseLastWeeklyActions(raw: unknown): GuildActionId[] | undefined {
    if (!Array.isArray(raw)) { return undefined; }
    const actions = raw
        .filter((a): a is GuildActionId => isValidGuildActionId(a))
        .slice(0, MAX_GUILD_ACTIONS_PER_WEEK);
    return actions.length > 0 ? actions : undefined;
}

export function normalizeGuildConfig(raw?: Partial<GuildConfig>): GuildConfig {
    const weeklyActions = typeof raw?.weeklyActions === 'number' && Number.isFinite(raw.weeklyActions)
        ? Math.max(1, Math.min(MAX_GUILD_ACTIONS_PER_WEEK, Math.floor(raw.weeklyActions)))
        : DEFAULT_GUILD_WEEKLY_ACTIONS;
    const boardSize = typeof raw?.boardSize === 'number' && Number.isFinite(raw.boardSize)
        ? Math.max(1, Math.min(MAX_GUILD_PENDING_REQUESTS, Math.floor(raw.boardSize)))
        : DEFAULT_BOARD_SIZE;
    const maxActiveQuests = typeof raw?.maxActiveQuests === 'number' && Number.isFinite(raw.maxActiveQuests)
        ? Math.max(1, Math.min(MAX_ACTIVE_QUESTS, Math.floor(raw.maxActiveQuests)))
        : DEFAULT_MAX_ACTIVE_QUESTS;
    const requestsEnabled = raw?.requestsEnabled === true;
    return { weeklyActions, boardSize, maxActiveQuests, requestsEnabled };
}

export function defaultGuildState(hallLocationId: string, config?: Partial<GuildConfig>): GuildState {
    const cfg = normalizeGuildConfig(config);
    return {
        enabled: true,
        hallLocationId,
        rank: 'chartered',
        calendarWeek: 1,
        calendarYear: 1,
        coffers: 250,
        supplies: 120,
        renown: 10,
        discipline: 55,
        townFavor: 50,
        facilities: 40,
        safety: 35,
        lore: 20,
        weeklyActionsRemaining: cfg.weeklyActions,
        adventurers: [],
        pendingEvents: [],
        flags: {},
    };
}

function parseAdventurer(raw: unknown): GuildAdventurer | undefined {
    if (!raw || typeof raw !== 'object') { return undefined; }
    const doc = raw as Record<string, unknown>;
    const npcId = sanitizeGuildPromptLabel(doc.npcId, '', 64);
    if (!npcId) { return undefined; }
    if (!isValidAdventurerClass(doc.klass)) { return undefined; }
    const adventurer: GuildAdventurer = { npcId, klass: doc.klass };
    if (typeof doc.skill === 'number' && Number.isFinite(doc.skill)) {
        adventurer.skill = clampGuildStat(doc.skill);
    }
    return adventurer;
}

export function validateGuild(raw: unknown): GuildState | undefined {
    if (!raw || typeof raw !== 'object') { return undefined; }
    const doc = raw as Record<string, unknown>;
    const hallLocationId = typeof doc.hallLocationId === 'string' ? doc.hallLocationId.trim() : '';
    if (!hallLocationId || !CHARACTER_ID_PATTERN.test(hallLocationId)) { return undefined; }

    const adventurers: GuildAdventurer[] = [];
    if (Array.isArray(doc.adventurers)) {
        for (const item of doc.adventurers.slice(0, MAX_GUILD_ADVENTURERS)) {
            const adventurer = parseAdventurer(item);
            if (adventurer) { adventurers.push(adventurer); }
        }
    }

    const pendingEvents: string[] = [];
    if (Array.isArray(doc.pendingEvents)) {
        for (const item of doc.pendingEvents.slice(0, MAX_GUILD_PENDING_EVENTS)) {
            const id = typeof item === 'string' ? item.trim() : '';
            if (id && isValidGuildEventId(id)) {
                pendingEvents.push(id);
            }
        }
    }

    const pendingRequests: string[] = [];
    if (Array.isArray(doc.pendingRequests)) {
        for (const item of doc.pendingRequests.slice(0, MAX_GUILD_PENDING_REQUESTS)) {
            const id = typeof item === 'string' ? item.trim() : '';
            if (id && isValidGuildRequestId(id)) {
                pendingRequests.push(id);
            }
        }
    }

    const quests: GuildQuest[] = [];
    if (Array.isArray(doc.quests)) {
        for (const item of doc.quests.slice(0, MAX_ACTIVE_QUESTS)) {
            const quest = parseGuildQuest(item);
            if (quest) { quests.push(quest); }
        }
    }

    const flags: Record<string, boolean> = {};
    if (doc.flags && typeof doc.flags === 'object' && !Array.isArray(doc.flags)) {
        for (const [key, val] of Object.entries(doc.flags as Record<string, unknown>).slice(0, 32)) {
            if (typeof key === 'string' && key.length <= 64 && typeof val === 'boolean') {
                flags[key] = val;
            }
        }
    }

    const renown = clampGuildStat(doc.renown);
    return {
        enabled: doc.enabled !== false,
        hallLocationId,
        rank: isValidGuildRank(doc.rank) ? doc.rank : resolveRankFromRenown(renown),
        calendarWeek: Math.max(1, Math.min(WEEKS_PER_YEAR, Math.floor(
            typeof doc.calendarWeek === 'number' && Number.isFinite(doc.calendarWeek)
                ? doc.calendarWeek
                : 1
        ))),
        calendarYear: Math.max(1, Math.min(9999, Math.floor(
            typeof doc.calendarYear === 'number' && Number.isFinite(doc.calendarYear)
                ? doc.calendarYear
                : 1
        ))),
        coffers: clampGuildResource(doc.coffers),
        supplies: clampGuildResource(doc.supplies),
        renown,
        discipline: clampGuildStat(doc.discipline),
        townFavor: clampGuildStat(doc.townFavor),
        facilities: clampGuildStat(doc.facilities),
        safety: clampGuildStat(doc.safety),
        lore: clampGuildStat(doc.lore),
        weeklyActionsRemaining: Math.max(0, Math.min(
            MAX_GUILD_ACTIONS_PER_WEEK,
            Math.floor(typeof doc.weeklyActionsRemaining === 'number' && Number.isFinite(doc.weeklyActionsRemaining)
                ? doc.weeklyActionsRemaining
                : DEFAULT_GUILD_WEEKLY_ACTIONS)
        )),
        lastCommitWorldTurn: typeof doc.lastCommitWorldTurn === 'number' && Number.isFinite(doc.lastCommitWorldTurn)
            && doc.lastCommitWorldTurn >= 0
            ? Math.floor(doc.lastCommitWorldTurn)
            : undefined,
        lastEventId: typeof doc.lastEventId === 'string' && isValidGuildEventId(doc.lastEventId.trim())
            ? doc.lastEventId.trim()
            : undefined,
        lastWeeklyActions: parseLastWeeklyActions(doc.lastWeeklyActions),
        adventurers,
        pendingRequests: pendingRequests.length > 0 ? pendingRequests : undefined,
        quests: quests.length > 0 ? quests : undefined,
        pendingEvents,
        flags,
    };
}

function parseGuildQuest(raw: unknown): GuildQuest | undefined {
    if (!raw || typeof raw !== 'object') { return undefined; }
    const doc = raw as Record<string, unknown>;
    const requestId = typeof doc.requestId === 'string' ? doc.requestId.trim() : '';
    const id = typeof doc.id === 'string' ? doc.id.trim() : requestId;
    if (!id || !requestId || !isValidGuildRequestId(requestId)) { return undefined; }
    if (!isValidQuestKind(doc.questKind)) { return undefined; }
    if (doc.status !== 'accepted' && doc.status !== 'active') { return undefined; }
    const quest: GuildQuest = {
        id,
        requestId,
        questKind: doc.questKind,
        difficulty: clampGuildStat(doc.difficulty),
        rewardCoffers: clampGuildResource(doc.rewardCoffers),
        status: doc.status,
    };
    if (doc.status === 'active' && Array.isArray(doc.partyNpcIds)) {
        const partyNpcIds = doc.partyNpcIds
            .filter((n): n is string => typeof n === 'string' && CHARACTER_ID_PATTERN.test(n.trim()))
            .map((n) => n.trim())
            .slice(0, MAX_GUILD_ADVENTURERS);
        if (partyNpcIds.length > 0) {
            quest.partyNpcIds = partyNpcIds;
        }
    }
    if (typeof doc.weeksRemaining === 'number' && Number.isFinite(doc.weeksRemaining)) {
        quest.weeksRemaining = Math.max(0, Math.min(3, Math.floor(doc.weeksRemaining)));
    }
    return quest;
}

export function parseGuildOps(raw: unknown): GuildOps | undefined {
    if (!raw || typeof raw !== 'object') { return undefined; }
    const doc = raw as Record<string, unknown>;
    const kind = doc.kind;
    if (
        kind !== 'weekly_commit'
        && kind !== 'recruit_adventurer'
        && kind !== 'dismiss_adventurer'
        && kind !== 'resolve_request'
    ) {
        return undefined;
    }

    const ops: GuildOps = { kind };

    if (kind === 'resolve_request') {
        const requestId = typeof doc.requestId === 'string' ? doc.requestId.trim() : '';
        if (!isValidGuildRequestId(requestId) || !isValidRequestRulingId(doc.rulingId)) {
            return undefined;
        }
        ops.requestId = requestId;
        ops.rulingId = doc.rulingId;
        return ops;
    }

    if (Array.isArray(doc.actions)) {
        const actions = doc.actions
            .filter((a): a is GuildActionId => isValidGuildActionId(a))
            .slice(0, MAX_GUILD_ACTIONS_PER_WEEK);
        if (actions.length > 0) { ops.actions = actions; }
    }

    if (doc.adventurer && typeof doc.adventurer === 'object') {
        const adv = doc.adventurer as Record<string, unknown>;
        const npcId = sanitizeGuildPromptLabel(adv.npcId, '', 64);
        if (npcId && isValidAdventurerClass(adv.klass)) {
            ops.adventurer = {
                npcId,
                klass: adv.klass,
                skill: typeof adv.skill === 'number' ? clampGuildStat(adv.skill) : undefined,
            };
        }
    }

    if (kind === 'weekly_commit' && (!ops.actions || ops.actions.length === 0)) {
        return undefined;
    }
    if ((kind === 'recruit_adventurer' || kind === 'dismiss_adventurer') && !ops.adventurer) {
        return undefined;
    }

    return ops;
}

export function resolveRankFromRenown(renown: number): GuildRank {
    const r = clampGuildStat(renown);
    if (r >= 60) { return 'renowned'; }
    if (r >= 30) { return 'reputable'; }
    return 'chartered';
}

export function getGuildSeason(calendarWeek: number): GuildSeason {
    const w = ((Math.floor(calendarWeek) - 1) % WEEKS_PER_YEAR);
    if (w < WEEKS_PER_SEASON) { return 'spring'; }
    if (w < WEEKS_PER_SEASON * 2) { return 'summer'; }
    if (w < WEEKS_PER_SEASON * 3) { return 'autumn'; }
    return 'winter';
}

export function seasonLabel(season: GuildSeason): string {
    return season;
}

function applyDelta(state: GuildState, delta: GuildStatDelta): GuildState {
    const nextRenown = clampGuildStat(state.renown + (delta.renown ?? 0));
    return {
        ...state,
        coffers: clampGuildResource(state.coffers + (delta.coffers ?? 0)),
        supplies: clampGuildResource(state.supplies + (delta.supplies ?? 0)),
        renown: nextRenown,
        discipline: clampGuildStat(state.discipline + (delta.discipline ?? 0)),
        townFavor: clampGuildStat(state.townFavor + (delta.townFavor ?? 0)),
        facilities: clampGuildStat(state.facilities + (delta.facilities ?? 0)),
        safety: clampGuildStat(state.safety + (delta.safety ?? 0)),
        lore: clampGuildStat(state.lore + (delta.lore ?? 0)),
        rank: resolveRankFromRenown(nextRenown),
    };
}

export function resolveSeasonalActionBonus(
    actions: readonly GuildActionId[],
    calendarWeek: number
): GuildStatDelta {
    const season = getGuildSeason(calendarWeek);
    const bonus: GuildStatDelta = {};
    if (season === 'spring' && actions.includes('stock_supplies')) {
        bonus.facilities = 1;
    }
    if (season === 'winter' && actions.includes('advertise')) {
        bonus.townFavor = 1;
        bonus.renown = 1;
    }
    return bonus;
}

export function resolveWeeklyActionDeltas(
    actions: readonly GuildActionId[],
    calendarWeek?: number
): GuildStatDelta {
    const merged: GuildStatDelta = {};
    for (const action of actions) {
        const d = ACTION_DELTAS[action];
        if (!d) { continue; }
        merged.coffers = (merged.coffers ?? 0) + (d.coffers ?? 0);
        merged.supplies = (merged.supplies ?? 0) + (d.supplies ?? 0);
        merged.renown = (merged.renown ?? 0) + (d.renown ?? 0);
        merged.discipline = (merged.discipline ?? 0) + (d.discipline ?? 0);
        merged.townFavor = (merged.townFavor ?? 0) + (d.townFavor ?? 0);
        merged.facilities = (merged.facilities ?? 0) + (d.facilities ?? 0);
        merged.safety = (merged.safety ?? 0) + (d.safety ?? 0);
        merged.lore = (merged.lore ?? 0) + (d.lore ?? 0);
    }
    if (typeof calendarWeek === 'number' && Number.isFinite(calendarWeek)) {
        const seasonal = resolveSeasonalActionBonus(actions, calendarWeek);
        merged.coffers = (merged.coffers ?? 0) + (seasonal.coffers ?? 0);
        merged.supplies = (merged.supplies ?? 0) + (seasonal.supplies ?? 0);
        merged.renown = (merged.renown ?? 0) + (seasonal.renown ?? 0);
        merged.discipline = (merged.discipline ?? 0) + (seasonal.discipline ?? 0);
        merged.townFavor = (merged.townFavor ?? 0) + (seasonal.townFavor ?? 0);
        merged.facilities = (merged.facilities ?? 0) + (seasonal.facilities ?? 0);
        merged.safety = (merged.safety ?? 0) + (seasonal.safety ?? 0);
        merged.lore = (merged.lore ?? 0) + (seasonal.lore ?? 0);
    }
    return merged;
}

export function applySeasonalWeeklyEffects(guild: GuildState): GuildState {
    const season = getGuildSeason(guild.calendarWeek);
    let next = { ...guild };
    if (season === 'winter') {
        const drain = 8 + Math.floor(next.adventurers.length * 2);
        next.supplies = clampGuildResource(next.supplies - drain);
    } else if (season === 'autumn') {
        next.supplies = clampGuildResource(next.supplies + 15 + Math.floor(next.facilities / 10));
    }
    return next;
}

export function advanceGuildCalendar(guild: GuildState): GuildState {
    let week = guild.calendarWeek + 1;
    let year = guild.calendarYear;
    if (week > WEEKS_PER_YEAR) {
        week = 1;
        year += 1;
    }
    return { ...guild, calendarWeek: week, calendarYear: year };
}

function hashSeed(parts: readonly (string | number)[]): number {
    let h = 2166136261;
    for (const part of parts) {
        const s = String(part);
        for (let i = 0; i < s.length; i++) {
            h ^= s.charCodeAt(i);
            h = Math.imul(h, 16777619);
        }
    }
    return h >>> 0;
}

function eventWeight(def: GuildEventDef, guild: GuildState, actions?: readonly GuildActionId[]): number {
    let w = def.baseWeight;
    if (def.requiresAdventurers && guild.adventurers.length === 0) { return 0; }
    if (def.facilitiesMax !== undefined && guild.facilities > def.facilitiesMax) { return 0; }
    if (def.renownMin !== undefined && guild.renown < def.renownMin) { return 0; }
    if (def.disciplineMax !== undefined && guild.discipline > def.disciplineMax) { return 0; }
    if (def.townFavorMax !== undefined && guild.townFavor > def.townFavorMax) { return 0; }
    if (def.safetyMax !== undefined && guild.safety > def.safetyMax) { return 0; }
    const season = getGuildSeason(guild.calendarWeek);
    if (def.season && season !== def.season) { return 0; }
    if (def.id === 'quest_board_dry' && season === 'autumn') { w = Math.max(1, w - 5); }
    if (def.id === 'festival_recruits' && season === 'winter') { w += 10; }
    if (def.id === 'festival_recruits' && actions?.includes('advertise')) { w += 8; }
    if (def.id === 'member_discontent' && guild.flags.memberDiscontent === true) { w += 14; }
    if (def.id === 'guild_quiet_week') { w = Math.max(1, w - 2); }
    return w;
}

/** Exposed for unit tests. */
export function computeGuildEventWeight(
    eventId: string,
    guild: GuildState,
    actions?: readonly GuildActionId[]
): number {
    const def = GUILD_EVENTS.find((e) => e.id === eventId);
    if (!def) { return 0; }
    return eventWeight(def, guild, actions);
}

export function applyGuildEventEffect(guild: GuildState, eventId: string): GuildState {
    const delta = GUILD_EVENT_EFFECTS[eventId];
    if (!delta) {
        return guild;
    }
    return applyDelta(guild, delta);
}

export function buildGuildEventGmHint(eventId: string): string {
    const hint = GUILD_EVENT_GM_HINTS[eventId] ?? 'Narrate this guild development; stats are already canonical.';
    return `[Guild — Event] ${eventId}: ${hint}`;
}

const SEASONAL_GUILD_GM_HINTS: Record<GuildSeason, string> = {
    spring: 'Spring: restocking season — stock_supplies actions gain +1 facilities; narrate renewal at the hall.',
    summer: 'Summer: baseline season — narrate patrols, contracts, and trade as usual.',
    autumn: 'Autumn: resupply week — supplies bonus applied; quest_board_dry weight reduced.',
    winter: 'Winter: rations tighten (supplies drain applied); advertise favored — narrate cold and morale.',
};

export function buildSeasonalGuildGmHint(guild: GuildState): string {
    const season = getGuildSeason(guild.calendarWeek);
    const hint = SEASONAL_GUILD_GM_HINTS[season];
    return `[Guild — Season] ${seasonLabel(season)} (W${guild.calendarWeek}): ${hint}`;
}

/** Passive membership fees / hall upkeep income. */
export function applyWeeklyGuildIncome(guild: GuildState): GuildState {
    const fees = Math.floor(guild.renown / 8) + Math.floor(guild.facilities / 10) + 5;
    const supplyYield = Math.floor(guild.facilities / 12) + 3;
    return applyDelta(guild, { coffers: fees, supplies: supplyYield });
}

export function rollGuildEvent(
    guild: GuildState,
    seed: number,
    actions?: readonly GuildActionId[]
): string {
    const weights: { id: string; w: number }[] = [];
    for (const def of GUILD_EVENTS) {
        const w = eventWeight(def, guild, actions);
        if (w > 0) { weights.push({ id: def.id, w }); }
    }
    if (weights.length === 0) { return 'guild_quiet_week'; }

    const total = weights.reduce((sum, e) => sum + e.w, 0);
    let roll = hashSeed([seed, guild.calendarWeek, guild.calendarYear, guild.hallLocationId]) % total;
    for (const entry of weights) {
        if (roll < entry.w) { return entry.id; }
        roll -= entry.w;
    }
    return weights[weights.length - 1].id;
}

export function buildGuildCounterLines(guild: GuildState): string[] {
    if (guild.adventurers.length === 0) {
        return ['[Guild — Counter] The hall is quiet — no adventurers on the roster yet.'];
    }
    const roster = guild.adventurers
        .map((a) => `${a.npcId} (${a.klass})`)
        .join(', ');
    return [`[Guild — Counter] Adventurers present: ${roster}.`];
}

export function formatWeeklyChronicleText(
    actions: readonly GuildActionId[],
    eventId: string,
    calendarWeek: number,
    calendarYear: number
): string {
    const actionText = actions.length > 0 ? actions.join(', ') : 'policy';
    const season = getGuildSeason(calendarWeek);
    return `Year ${calendarYear} ${season} W${calendarWeek}: weekly policy (${actionText}); event: ${eventId}`;
}

export function applyWeeklyCommit(
    guild: GuildState,
    ops: GuildOps,
    config: GuildConfig,
    worldTurnSeed = 0
): WeeklyCommitResult {
    const actions = (ops.actions ?? []).slice(0, config.weeklyActions);
    let next: GuildState = { ...guild };
    next = applyDelta(next, resolveWeeklyActionDeltas(actions, next.calendarWeek));

    next = applyWeeklyGuildIncome(next);
    next = applySeasonalWeeklyEffects(next);
    next = advanceGuildCalendar(next);
    next.weeklyActionsRemaining = config.weeklyActions;
    next.lastCommitWorldTurn = worldTurnSeed;

    const eventId = rollGuildEvent(next, worldTurnSeed, actions);
    next = applyGuildEventEffect(next, eventId);
    next.lastEventId = eventId;
    const pending = [...next.pendingEvents, eventId].slice(-MAX_GUILD_PENDING_EVENTS);
    next.pendingEvents = pending;

    next = {
        ...next,
        lastWeeklyActions: actions.length > 0 ? [...actions] : next.lastWeeklyActions,
    };

    if (config.requestsEnabled && actions.includes('open_board')) {
        const queue = buildRequestQueue(next, worldTurnSeed, config.boardSize);
        next = { ...next, pendingRequests: queue.map((r) => r.id) };
    }

    const counterLines = buildGuildCounterLines(next);

    return {
        guild: next,
        rolledEventId: eventId,
        chronicleText: formatWeeklyChronicleText(
            actions,
            eventId,
            next.calendarWeek === 1 ? WEEKS_PER_YEAR : next.calendarWeek - 1,
            next.calendarWeek === 1 ? Math.max(1, next.calendarYear - 1) : next.calendarYear
        ),
        counterLines,
    };
}

export function recruitAdventurer(guild: GuildState, adventurer: GuildAdventurer): GuildState {
    const filtered = guild.adventurers.filter((a) => a.npcId !== adventurer.npcId);
    const next = [...filtered, adventurer].slice(0, MAX_GUILD_ADVENTURERS);
    return { ...guild, adventurers: next };
}

export function dismissAdventurer(guild: GuildState, npcId: string): GuildState {
    return {
        ...guild,
        adventurers: guild.adventurers.filter((a) => a.npcId !== npcId),
    };
}

export function applyGuildRequest(
    guild: GuildState,
    requestId: string,
    rulingId: string
): { guild: GuildState; request?: RequestRulingResult } {
    if (!guild.pendingRequests?.includes(requestId)) {
        return { guild };
    }
    const delta = resolveRequestRuling(requestId, rulingId);
    let next = applyDelta(guild, delta);
    const remaining = guild.pendingRequests.filter((id) => id !== requestId);
    next = { ...next, pendingRequests: remaining.length > 0 ? remaining : undefined };

    if (rulingId === 'accept' || rulingId === 'negotiate') {
        const def = getRequest(requestId);
        if (def) {
            const negotiate = rulingId === 'negotiate';
            const quest: GuildQuest = {
                id: requestId,
                requestId,
                questKind: def.questKind,
                difficulty: resolveQuestDifficulty(def.baseDifficulty, next.renown),
                rewardCoffers: resolveQuestReward(def.baseReward, negotiate),
                status: 'accepted',
            };
            const quests = [...(next.quests ?? []), quest].slice(-MAX_ACTIVE_QUESTS);
            next = { ...next, quests };
        }
    }

    return {
        guild: next,
        request: {
            requestId,
            rulingId,
            chronicleText: formatRequestChronicleText(
                requestId,
                rulingId,
                guild.calendarWeek,
                guild.calendarYear
            ),
        },
    };
}

export function applyGuildOps(
    guild: GuildState,
    ops: GuildOps,
    config: GuildConfig,
    worldTurnSeed = 0
): { guild: GuildState; weekly?: WeeklyCommitResult; request?: RequestRulingResult } {
    if (ops.kind === 'resolve_request' && ops.requestId && ops.rulingId) {
        if (!config.requestsEnabled) {
            return { guild };
        }
        return applyGuildRequest(guild, ops.requestId, ops.rulingId);
    }
    if (ops.kind === 'recruit_adventurer' && ops.adventurer) {
        return {
            guild: recruitAdventurer(guild, {
                npcId: ops.adventurer.npcId,
                klass: ops.adventurer.klass,
                skill: ops.adventurer.skill,
            }),
        };
    }
    if (ops.kind === 'dismiss_adventurer' && ops.adventurer) {
        return { guild: dismissAdventurer(guild, ops.adventurer.npcId) };
    }
    if (ops.kind === 'weekly_commit') {
        const weekly = applyWeeklyCommit(guild, ops, config, worldTurnSeed);
        return { guild: weekly.guild, weekly };
    }
    return { guild };
}