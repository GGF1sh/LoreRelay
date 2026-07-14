// Domain Mode D1: lordship stats, monthly actions, events (no vscode/fs).

import { CHARACTER_ID_PATTERN } from './characterId';
import { buildDomainCouncilLines } from './domainCouncilCore';
import {
    buildAudienceQueue,
    resolvePetitionRuling,
    isValidPetitionId,
    isValidPetitionRulingId,
    formatAudienceChronicleText,
    MAX_AUDIENCE_QUEUE,
    DEFAULT_AUDIENCE_SIZE,
} from './domainAudienceCore';
import type { PetitionRulingId } from './domainAudienceCore';
import {
    tickRivalLord,
    resolveRivalDiplomacy,
    discloseRivalInfo,
    validateRivalLord,
    deriveRivalLord,
    RIVAL_RAID_PREP_FLAG,
    type RivalLordState,
    type RivalActionId,
} from './rivalLordCore';
import {
    createOfficerMission,
    parseOfficerMission,
    isMissionDue,
    tickMissionMonth,
    resolveMissionOutcome,
    isValidMissionKind,
    clampMissionMonths,
    sanitizeMissionTargetId,
    MAX_ACTIVE_MISSIONS,
    DEFAULT_MAX_ACTIVE_MISSIONS,
    DEFAULT_OFFICER_SKILL,
    DEFAULT_OFFICER_TRUST,
    type OfficerMission,
} from './domainMissionCore';
import {
    startBattle,
    resolveEnemyTactic,
    resolveBattleRound,
    applyBattleRoundToState,
    isBattleConcluded,
    concludeBattle,
    parseBattleState,
    isValidBattleTactic,
    formatBattleChronicleText,
    type BattleState,
    type BattleTactic,
    type BattleOutcome,
} from './massBattleCore';
import { isExcludedEvent } from './gameRulesCore';

export const MAX_DOMAIN_OFFICERS = 5;
export const MAX_DOMAIN_ACTIONS_PER_MONTH = 4;
export const MAX_DOMAIN_MONTH_DAYS = 100;
export const MIN_DOMAIN_MONTH_DAYS = 1;
export const DEFAULT_DOMAIN_MONTH_DAYS = 30;
export const DEFAULT_DOMAIN_MONTHLY_ACTIONS = 2;
export const DOMAIN_STAT_MIN = 0;
export const DOMAIN_STAT_MAX = 100;
export const DOMAIN_RESOURCE_MAX = 9999;
export const MAX_DOMAIN_PENDING_EVENTS = 8;
/** §F10: rival.strength (0–100) → equivalent enemy troop count for battle resolution. */
export const ENEMY_TROOPS_PER_STRENGTH = 3;

export type DomainRank = 'minor_lord' | 'baron' | 'count';
export type OfficerRole = 'steward' | 'marshal' | 'diplomat' | 'merchant' | 'spy';
export type DomainActionId =
    | 'agriculture'
    | 'commerce'
    | 'public_order'
    | 'train_troops'
    | 'fortify'
    | 'diplomacy'
    | 'recruit'
    | 'inspect'
    | 'festival'
    | 'espionage'
    | 'audience';
export type DomainOpsKind =
    | 'monthly_commit'
    | 'appoint_officer'
    | 'dismiss_officer'
    | 'audience_ruling'
    | 'dispatch_officer'
    | 'battle_round';
export type DomainIntelligence = 'gather_rumors' | 'scout_border' | 'none';
export type DomainSeason = 'spring' | 'summer' | 'autumn' | 'winter';

export interface DomainOfficer {
    npcId: string;
    role: OfficerRole;
    skill?: number;
}

export interface DomainState {
    enabled: boolean;
    controlledRegionId: string;
    rank: DomainRank;
    calendarMonth: number;
    calendarYear: number;
    treasury: number;
    food: number;
    troops: number;
    publicOrder: number;
    popularSupport: number;
    agriculture: number;
    commerce: number;
    defense: number;
    culture: number;
    prestige: number;
    monthlyActionsRemaining: number;
    lastCommitWorldTurn?: number;
    officers: DomainOfficer[];
    pendingEvents: string[];
    /** Last rolled domain event id (GM narration hint). */
    lastEventId?: string;
    /** Actions chosen on the previous monthly_commit (council context). */
    lastMonthlyActions?: DomainActionId[];
    /** §F7: petition ids currently open for judgment (opened by an `audience` action). */
    pendingPetitions?: string[];
    /** §F8: single neighboring rival lord (v0 recommends exactly one). */
    rival?: RivalLordState;
    /** §F9: officers currently dispatched (absent from council + steward drift until they return). */
    activeMissions?: OfficerMission[];
    /** §F9: report lines for missions that resolved on this commit (transient — GM prompt hint). */
    lastMissionReports?: string[];
    /** §F10: an in-progress 3-round battle (v0 trigger: a rival's `raid` when enableMassBattle is ON). */
    activeBattle?: BattleState;
    /** §F10: report line for a battle that concluded on this op (transient — GM prompt/chronicle hint). */
    lastBattleReport?: string;
    flags: Record<string, boolean>;
}

export interface DomainConfig {
    monthDays: number;
    monthlyActions: number;
    /** §F7: petitioners surfaced when an `audience` action is committed. */
    audienceSize: number;
    /** §F8: gate for rival lazy-init + monthly tick (host resolves from game_rules). */
    rivalsEnabled?: boolean;
    /** §F8: neighbor region id used to lazily create `domain.rival` on first commit. */
    rivalRegionId?: string;
    /** §F9: max simultaneously dispatched officers (1–3). */
    maxActiveMissions?: number;
    /** §F9: host-resolved playerTrust per officer npcId (from Registry disposition), default 50. */
    officerTrustMap?: Record<string, number>;
    /** §F10: when ON, a rival `raid` starts a 3-round battle instead of an instant delta. */
    enableMassBattle?: boolean;
    excludedEventIds?: ReadonlySet<string>;
}

export interface DomainOps {
    kind: DomainOpsKind;
    actions?: DomainActionId[];
    intelligence?: DomainIntelligence;
    officer?: { npcId: string; role: OfficerRole; skill?: number };
    /** §F7 audience_ruling: which open petition, and how it was judged. */
    petitionId?: string;
    rulingId?: PetitionRulingId;
    /** §F9 dispatch_officer: which appointed officer, on what kind of mission. */
    mission?: { npcId: string; kind: string; targetId?: string; months?: number };
    /** §F10 battle_round: the player's tactic for the current round of an active battle. */
    tactic?: BattleTactic;
}

export interface AudienceRulingResult {
    petitionId: string;
    rulingId: string;
    chronicleText: string;
}

export interface DomainStatDelta {
    treasury?: number;
    food?: number;
    troops?: number;
    publicOrder?: number;
    popularSupport?: number;
    agriculture?: number;
    commerce?: number;
    defense?: number;
    culture?: number;
    prestige?: number;
}

export interface MonthlyCommitResult {
    domain: DomainState;
    rolledEventId: string;
    chronicleText: string;
    councilLines: string[];
    /** §F8: rival's move this month, if a rival exists (build/trade/raid_prep/envoy/raid). */
    rivalActionId?: RivalActionId;
}

const DOMAIN_RANKS: readonly DomainRank[] = ['minor_lord', 'baron', 'count'];
const OFFICER_ROLES: readonly OfficerRole[] = ['steward', 'marshal', 'diplomat', 'merchant', 'spy'];
const DOMAIN_ACTIONS: readonly DomainActionId[] = [
    'agriculture', 'commerce', 'public_order', 'train_troops', 'fortify',
    'diplomacy', 'recruit', 'inspect', 'festival', 'espionage', 'audience',
];

/** §D3: full action catalog for the World tab action chips (order = display order). */
export const DOMAIN_ACTION_CATALOG: readonly DomainActionId[] = DOMAIN_ACTIONS;

const ACTION_DELTAS: Record<DomainActionId, DomainStatDelta> = {
    agriculture: { agriculture: 2, treasury: -40, food: 15 },
    commerce: { commerce: 2, treasury: -30 },
    public_order: { publicOrder: 3, treasury: -25 },
    train_troops: { troops: 10, defense: 1, treasury: -50, food: -20 },
    fortify: { defense: 3, treasury: -60 },
    diplomacy: { prestige: 2, treasury: -20 },
    recruit: { prestige: 1, treasury: -30 },
    inspect: { popularSupport: 1, treasury: -10 },
    festival: { popularSupport: 3, culture: 1, treasury: -35, food: -15 },
    espionage: { treasury: -25, prestige: 1 },
    // §F7: opening the hall costs little; the petitions themselves carry the weight.
    audience: { treasury: -10, popularSupport: 1 },
};

interface DomainEventDef {
    id: string;
    baseWeight: number;
    agricultureMax?: number;
    agricultureMin?: number;
    commerceMin?: number;
    publicOrderMax?: number;
    popularSupportMax?: number;
    defenseMax?: number;
    requiresIntelligence?: DomainIntelligence;
    requiresAction?: DomainActionId;
    requiresOfficers?: boolean;
}

export const DOMAIN_EVENTS: readonly DomainEventDef[] = [
    { id: 'bad_harvest', baseWeight: 10, agricultureMax: 40 },
    { id: 'merchant_visit', baseWeight: 15, commerceMin: 50 },
    { id: 'bandit_activity', baseWeight: 12, publicOrderMax: 45 },
    { id: 'neighbor_militarize', baseWeight: 8, defenseMax: 40 },
    { id: 'petition', baseWeight: 14, popularSupportMax: 45 },
    { id: 'trade_route_disruption', baseWeight: 9, commerceMin: 30 },
    { id: 'rumor_mill', baseWeight: 11, requiresIntelligence: 'gather_rumors' },
    { id: 'spy_arrival', baseWeight: 10, requiresAction: 'espionage' },
    { id: 'religious_friction', baseWeight: 7, popularSupportMax: 50 },
    { id: 'festival_gathering', baseWeight: 6 },
    { id: 'officer_discontent', baseWeight: 4, requiresOfficers: true },
    { id: 'domain_quiet_month', baseWeight: 2 },
];

const DOMAIN_EVENT_IDS = new Set(DOMAIN_EVENTS.map((e) => e.id));

export function isValidDomainEventId(value: unknown): value is string {
    return typeof value === 'string' && DOMAIN_EVENT_IDS.has(value);
}

/** Single-line GM prompt token — blocks newline/control-char injection. */
export function sanitizeDomainPromptLabel(value: unknown, fallback = 'officer', max = 64): string {
    if (typeof value !== 'string') { return fallback; }
    const trimmed = value.trim().replace(/[\r\n\t\x00-\x1f]/g, ' ').slice(0, max);
    if (!trimmed || !CHARACTER_ID_PATTERN.test(trimmed)) { return fallback; }
    return trimmed;
}

/** Mechanical effects when an event fires (event-first — stats follow story). */
const DOMAIN_EVENT_EFFECTS: Record<string, DomainStatDelta> = {
    bad_harvest: { food: -35, popularSupport: -4, agriculture: -1 },
    merchant_visit: { treasury: 30, commerce: 1, popularSupport: 1 },
    bandit_activity: { publicOrder: -6, treasury: -20, troops: -5 },
    neighbor_militarize: { defense: -2, prestige: 1, publicOrder: -2 },
    petition: { popularSupport: -3, publicOrder: -2 },
    trade_route_disruption: { treasury: -25, commerce: -1 },
    rumor_mill: { prestige: 1 },
    spy_arrival: { defense: 1, treasury: -10 },
    religious_friction: { culture: -2, popularSupport: -2 },
    festival_gathering: { popularSupport: 2, culture: 1, food: -10, treasury: -15 },
    officer_discontent: { publicOrder: -3, prestige: -2, popularSupport: -1 },
    domain_quiet_month: { popularSupport: 1 },
};

export const DOMAIN_EVENT_GM_HINTS: Record<string, string> = {
    bad_harvest: 'Crop yields failed; narrate hunger anxiety and rationing. Core already reduced food and support.',
    merchant_visit: 'A traveling merchant arrived; narrate trade opportunity. Treasury already increased.',
    bandit_activity: 'Bandits troubled the roads; narrate fear and patrols. Order and treasury already reduced.',
    neighbor_militarize: 'Neighboring forces stirred; narrate border tension. Do not invent troop counts.',
    petition: 'Subjects petition the lord; narrate grievances. Support and order already dipped.',
    trade_route_disruption: 'A route faltered; narrate delayed goods. Treasury already took a hit.',
    rumor_mill: 'Rumors spread from abroad; narrate hearsay only — no new map facts.',
    spy_arrival: 'A covert messenger surfaced; narrate intrigue. Do not canonize new NPCs without GM ops.',
    religious_friction: 'Faith or guild friction rose; narrate cultural tension.',
    festival_gathering: 'A seasonal festival lifted spirits; narrate celebration and ration strain. Support already rose; food/treasury already spent.',
    officer_discontent: 'An appointed officer shows discontent; narrate tension in council. Triggered by playerBond rival-or-below trust, nemesis, or estrangement milestone. Order and prestige already dipped.',
    domain_quiet_month: 'A calm month; narrate small daily life in the domain.',
};

export type DomainPromptTier = 'minimal' | 'standard' | 'full';

export function clampDomainStat(value: unknown): number {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
        return DOMAIN_STAT_MIN;
    }
    return Math.max(DOMAIN_STAT_MIN, Math.min(DOMAIN_STAT_MAX, Math.floor(value)));
}

export function clampDomainResource(value: unknown): number {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
        return 0;
    }
    return Math.max(0, Math.min(DOMAIN_RESOURCE_MAX, Math.floor(value)));
}

export function isValidDomainRank(value: unknown): value is DomainRank {
    return typeof value === 'string' && (DOMAIN_RANKS as readonly string[]).includes(value);
}

export function isValidOfficerRole(value: unknown): value is OfficerRole {
    return typeof value === 'string' && (OFFICER_ROLES as readonly string[]).includes(value);
}

export function isValidDomainActionId(value: unknown): value is DomainActionId {
    return typeof value === 'string' && (DOMAIN_ACTIONS as readonly string[]).includes(value);
}

function parseLastMonthlyActions(raw: unknown): DomainActionId[] | undefined {
    if (!Array.isArray(raw)) { return undefined; }
    const actions = raw
        .filter((a): a is DomainActionId => isValidDomainActionId(a))
        .slice(0, MAX_DOMAIN_ACTIONS_PER_MONTH);
    return actions.length > 0 ? actions : undefined;
}

export function normalizeDomainConfig(raw?: Partial<DomainConfig>): DomainConfig {
    const monthDays = typeof raw?.monthDays === 'number' && Number.isFinite(raw.monthDays)
        ? Math.max(MIN_DOMAIN_MONTH_DAYS, Math.min(MAX_DOMAIN_MONTH_DAYS, Math.floor(raw.monthDays)))
        : DEFAULT_DOMAIN_MONTH_DAYS;
    const monthlyActions = typeof raw?.monthlyActions === 'number' && Number.isFinite(raw.monthlyActions)
        ? Math.max(1, Math.min(MAX_DOMAIN_ACTIONS_PER_MONTH, Math.floor(raw.monthlyActions)))
        : DEFAULT_DOMAIN_MONTHLY_ACTIONS;
    const audienceSize = typeof raw?.audienceSize === 'number' && Number.isFinite(raw.audienceSize)
        ? Math.max(1, Math.min(MAX_AUDIENCE_QUEUE, Math.floor(raw.audienceSize)))
        : DEFAULT_AUDIENCE_SIZE;
    const rivalsEnabled = raw?.rivalsEnabled === true;
    const rivalRegionId = typeof raw?.rivalRegionId === 'string' && CHARACTER_ID_PATTERN.test(raw.rivalRegionId)
        ? raw.rivalRegionId
        : undefined;
    const maxActiveMissions = typeof raw?.maxActiveMissions === 'number' && Number.isFinite(raw.maxActiveMissions)
        ? Math.max(1, Math.min(MAX_ACTIVE_MISSIONS, Math.floor(raw.maxActiveMissions)))
        : DEFAULT_MAX_ACTIVE_MISSIONS;
    const officerTrustMap = raw?.officerTrustMap && typeof raw.officerTrustMap === 'object'
        ? raw.officerTrustMap
        : undefined;
    const enableMassBattle = raw?.enableMassBattle === true;
    const excludedEventIds = raw?.excludedEventIds instanceof Set ? raw.excludedEventIds : undefined;
    return {
        monthDays, monthlyActions, audienceSize, rivalsEnabled, rivalRegionId,
        maxActiveMissions, officerTrustMap, enableMassBattle, excludedEventIds,
    };
}

export function defaultDomainState(controlledRegionId: string, config?: Partial<DomainConfig>): DomainState {
    const cfg = normalizeDomainConfig(config);
    return {
        enabled: true,
        controlledRegionId,
        rank: 'minor_lord',
        calendarMonth: 1,
        calendarYear: 1,
        treasury: 300,
        food: 500,
        troops: 80,
        publicOrder: 55,
        popularSupport: 50,
        agriculture: 45,
        commerce: 40,
        defense: 35,
        culture: 20,
        prestige: 10,
        monthlyActionsRemaining: cfg.monthlyActions,
        officers: [],
        pendingEvents: [],
        flags: {},
    };
}

function parseOfficer(raw: unknown): DomainOfficer | undefined {
    if (!raw || typeof raw !== 'object') { return undefined; }
    const doc = raw as Record<string, unknown>;
    const npcId = sanitizeDomainPromptLabel(doc.npcId, '', 64);
    if (!npcId) { return undefined; }
    if (!isValidOfficerRole(doc.role)) { return undefined; }
    const officer: DomainOfficer = { npcId, role: doc.role };
    if (typeof doc.skill === 'number' && Number.isFinite(doc.skill)) {
        officer.skill = clampDomainStat(doc.skill);
    }
    return officer;
}

export function validateDomain(raw: unknown): DomainState | undefined {
    if (!raw || typeof raw !== 'object') { return undefined; }
    const doc = raw as Record<string, unknown>;
    const controlledRegionId = typeof doc.controlledRegionId === 'string'
        ? doc.controlledRegionId.trim()
        : '';
    if (!controlledRegionId || !CHARACTER_ID_PATTERN.test(controlledRegionId)) { return undefined; }

    const officers: DomainOfficer[] = [];
    if (Array.isArray(doc.officers)) {
        for (const item of doc.officers.slice(0, MAX_DOMAIN_OFFICERS)) {
            const officer = parseOfficer(item);
            if (officer) { officers.push(officer); }
        }
    }

    const pendingEvents: string[] = [];
    if (Array.isArray(doc.pendingEvents)) {
        for (const item of doc.pendingEvents.slice(0, MAX_DOMAIN_PENDING_EVENTS)) {
            const id = typeof item === 'string' ? item.trim() : '';
            if (id && isValidDomainEventId(id)) {
                pendingEvents.push(id);
            }
        }
    }

    const pendingPetitions: string[] = [];
    if (Array.isArray(doc.pendingPetitions)) {
        for (const item of doc.pendingPetitions.slice(0, MAX_AUDIENCE_QUEUE)) {
            if (typeof item === 'string' && isValidPetitionId(item.trim())) {
                pendingPetitions.push(item.trim());
            }
        }
    }

    const activeMissions: OfficerMission[] = [];
    if (Array.isArray(doc.activeMissions)) {
        for (const item of doc.activeMissions.slice(0, MAX_ACTIVE_MISSIONS)) {
            const mission = parseOfficerMission(item);
            if (mission) { activeMissions.push(mission); }
        }
    }

    const lastMissionReports: string[] = [];
    if (Array.isArray(doc.lastMissionReports)) {
        for (const item of doc.lastMissionReports.slice(0, MAX_ACTIVE_MISSIONS)) {
            if (typeof item === 'string' && item.trim()) {
                lastMissionReports.push(item.trim().replace(/[\r\n\t\x00-\x1f]/g, ' ').slice(0, 200));
            }
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

    const prestige = clampDomainStat(doc.prestige);
    return {
        enabled: doc.enabled !== false,
        controlledRegionId,
        rank: isValidDomainRank(doc.rank) ? doc.rank : resolveRankFromPrestige(prestige),
        calendarMonth: Math.max(1, Math.min(12, Math.floor(
            typeof doc.calendarMonth === 'number' && Number.isFinite(doc.calendarMonth)
                ? doc.calendarMonth
                : 1
        ))),
        calendarYear: Math.max(1, Math.min(9999, Math.floor(
            typeof doc.calendarYear === 'number' && Number.isFinite(doc.calendarYear)
                ? doc.calendarYear
                : 1
        ))),
        treasury: clampDomainResource(doc.treasury),
        food: clampDomainResource(doc.food),
        troops: clampDomainResource(doc.troops),
        publicOrder: clampDomainStat(doc.publicOrder),
        popularSupport: clampDomainStat(doc.popularSupport),
        agriculture: clampDomainStat(doc.agriculture),
        commerce: clampDomainStat(doc.commerce),
        defense: clampDomainStat(doc.defense),
        culture: clampDomainStat(doc.culture),
        prestige,
        monthlyActionsRemaining: Math.max(0, Math.min(
            MAX_DOMAIN_ACTIONS_PER_MONTH,
            Math.floor(typeof doc.monthlyActionsRemaining === 'number' && Number.isFinite(doc.monthlyActionsRemaining)
                ? doc.monthlyActionsRemaining
                : DEFAULT_DOMAIN_MONTHLY_ACTIONS)
        )),
        lastCommitWorldTurn: typeof doc.lastCommitWorldTurn === 'number' && Number.isFinite(doc.lastCommitWorldTurn)
            && doc.lastCommitWorldTurn >= 0
            ? Math.floor(doc.lastCommitWorldTurn)
            : undefined,
        lastEventId: typeof doc.lastEventId === 'string' && isValidDomainEventId(doc.lastEventId.trim())
            ? doc.lastEventId.trim()
            : undefined,
        lastMonthlyActions: parseLastMonthlyActions(doc.lastMonthlyActions),
        officers,
        pendingEvents,
        pendingPetitions: pendingPetitions.length > 0 ? pendingPetitions : undefined,
        rival: validateRivalLord(doc.rival),
        activeMissions: activeMissions.length > 0 ? activeMissions : undefined,
        lastMissionReports: lastMissionReports.length > 0 ? lastMissionReports : undefined,
        activeBattle: parseBattleState(doc.activeBattle),
        lastBattleReport: typeof doc.lastBattleReport === 'string'
            ? doc.lastBattleReport.trim().replace(/[\r\n\t\x00-\x1f]/g, ' ').slice(0, 200)
            : undefined,
        flags,
    };
}

export function parseDomainOps(raw: unknown): DomainOps | undefined {
    if (!raw || typeof raw !== 'object') { return undefined; }
    const doc = raw as Record<string, unknown>;
    const kind = doc.kind;
    if (
        kind !== 'monthly_commit'
        && kind !== 'appoint_officer'
        && kind !== 'dismiss_officer'
        && kind !== 'audience_ruling'
        && kind !== 'dispatch_officer'
        && kind !== 'battle_round'
    ) {
        return undefined;
    }

    const ops: DomainOps = { kind };

    if (kind === 'audience_ruling') {
        const petitionId = typeof doc.petitionId === 'string' ? doc.petitionId.trim() : '';
        if (!isValidPetitionId(petitionId) || !isValidPetitionRulingId(doc.rulingId)) {
            return undefined;
        }
        ops.petitionId = petitionId;
        ops.rulingId = doc.rulingId;
        return ops;
    }

    if (kind === 'battle_round') {
        if (!isValidBattleTactic(doc.tactic)) { return undefined; }
        ops.tactic = doc.tactic;
        return ops;
    }

    if (kind === 'dispatch_officer') {
        if (!doc.mission || typeof doc.mission !== 'object') { return undefined; }
        const m = doc.mission as Record<string, unknown>;
        const npcId = sanitizeDomainPromptLabel(m.npcId, '', 64);
        if (!npcId || !isValidMissionKind(m.kind)) { return undefined; }
        ops.mission = {
            npcId,
            kind: m.kind,
            targetId: sanitizeMissionTargetId(m.targetId),
            months: clampMissionMonths(m.months),
        };
        return ops;
    }

    if (Array.isArray(doc.actions)) {
        const actions = doc.actions
            .filter((a): a is DomainActionId => isValidDomainActionId(a))
            .slice(0, MAX_DOMAIN_ACTIONS_PER_MONTH);
        if (actions.length > 0) { ops.actions = actions; }
    }

    const intel = doc.intelligence;
    if (intel === 'gather_rumors' || intel === 'scout_border' || intel === 'none') {
        ops.intelligence = intel;
    }

    if (doc.officer && typeof doc.officer === 'object') {
        const off = doc.officer as Record<string, unknown>;
        const npcId = sanitizeDomainPromptLabel(off.npcId, '', 64);
        if (npcId && isValidOfficerRole(off.role)) {
            ops.officer = {
                npcId,
                role: off.role,
                skill: typeof off.skill === 'number' ? clampDomainStat(off.skill) : undefined,
            };
        }
    }

    if (kind === 'monthly_commit' && (!ops.actions || ops.actions.length === 0)) {
        return undefined;
    }
    if ((kind === 'appoint_officer' || kind === 'dismiss_officer') && !ops.officer) {
        return undefined;
    }

    return ops;
}

export function resolveRankFromPrestige(prestige: number): DomainRank {
    const p = clampDomainStat(prestige);
    if (p >= 60) { return 'count'; }
    if (p >= 30) { return 'baron'; }
    return 'minor_lord';
}

export function getDomainSeason(calendarMonth: number): DomainSeason {
    const m = ((Math.floor(calendarMonth) - 1) % 12) + 1;
    if (m >= 3 && m <= 5) { return 'spring'; }
    if (m >= 6 && m <= 8) { return 'summer'; }
    if (m >= 9 && m <= 11) { return 'autumn'; }
    return 'winter';
}

export function seasonLabel(season: DomainSeason): string {
    return season;
}

function applyDelta(state: DomainState, delta: DomainStatDelta): DomainState {
    return {
        ...state,
        treasury: clampDomainResource(state.treasury + (delta.treasury ?? 0)),
        food: clampDomainResource(state.food + (delta.food ?? 0)),
        troops: clampDomainResource(state.troops + (delta.troops ?? 0)),
        publicOrder: clampDomainStat(state.publicOrder + (delta.publicOrder ?? 0)),
        popularSupport: clampDomainStat(state.popularSupport + (delta.popularSupport ?? 0)),
        agriculture: clampDomainStat(state.agriculture + (delta.agriculture ?? 0)),
        commerce: clampDomainStat(state.commerce + (delta.commerce ?? 0)),
        defense: clampDomainStat(state.defense + (delta.defense ?? 0)),
        culture: clampDomainStat(state.culture + (delta.culture ?? 0)),
        prestige: clampDomainStat(state.prestige + (delta.prestige ?? 0)),
        rank: resolveRankFromPrestige(clampDomainStat(state.prestige + (delta.prestige ?? 0))),
    };
}

export function resolveSeasonalActionBonus(
    actions: readonly DomainActionId[],
    calendarMonth: number
): DomainStatDelta {
    const season = getDomainSeason(calendarMonth);
    const bonus: DomainStatDelta = {};
    if (season === 'spring' && actions.includes('agriculture')) {
        bonus.agriculture = 1;
    }
    if (season === 'winter' && actions.includes('festival')) {
        bonus.popularSupport = 1;
        bonus.culture = 1;
    }
    return bonus;
}

export function resolveMonthlyActionDeltas(
    actions: readonly DomainActionId[],
    calendarMonth?: number
): DomainStatDelta {
    const merged: DomainStatDelta = {};
    for (const action of actions) {
        const d = ACTION_DELTAS[action];
        if (!d) { continue; }
        merged.treasury = (merged.treasury ?? 0) + (d.treasury ?? 0);
        merged.food = (merged.food ?? 0) + (d.food ?? 0);
        merged.troops = (merged.troops ?? 0) + (d.troops ?? 0);
        merged.publicOrder = (merged.publicOrder ?? 0) + (d.publicOrder ?? 0);
        merged.popularSupport = (merged.popularSupport ?? 0) + (d.popularSupport ?? 0);
        merged.agriculture = (merged.agriculture ?? 0) + (d.agriculture ?? 0);
        merged.commerce = (merged.commerce ?? 0) + (d.commerce ?? 0);
        merged.defense = (merged.defense ?? 0) + (d.defense ?? 0);
        merged.culture = (merged.culture ?? 0) + (d.culture ?? 0);
        merged.prestige = (merged.prestige ?? 0) + (d.prestige ?? 0);
    }
    if (typeof calendarMonth === 'number' && Number.isFinite(calendarMonth)) {
        const seasonal = resolveSeasonalActionBonus(actions, calendarMonth);
        merged.treasury = (merged.treasury ?? 0) + (seasonal.treasury ?? 0);
        merged.food = (merged.food ?? 0) + (seasonal.food ?? 0);
        merged.troops = (merged.troops ?? 0) + (seasonal.troops ?? 0);
        merged.publicOrder = (merged.publicOrder ?? 0) + (seasonal.publicOrder ?? 0);
        merged.popularSupport = (merged.popularSupport ?? 0) + (seasonal.popularSupport ?? 0);
        merged.agriculture = (merged.agriculture ?? 0) + (seasonal.agriculture ?? 0);
        merged.commerce = (merged.commerce ?? 0) + (seasonal.commerce ?? 0);
        merged.defense = (merged.defense ?? 0) + (seasonal.defense ?? 0);
        merged.culture = (merged.culture ?? 0) + (seasonal.culture ?? 0);
        merged.prestige = (merged.prestige ?? 0) + (seasonal.prestige ?? 0);
    }
    return merged;
}

export function applySeasonalMonthlyEffects(domain: DomainState): DomainState {
    const season = getDomainSeason(domain.calendarMonth);
    let next = { ...domain };
    if (season === 'winter') {
        const drain = 10 + Math.floor(next.troops / 20);
        next.food = clampDomainResource(next.food - drain);
    } else if (season === 'autumn') {
        next.food = clampDomainResource(next.food + 20 + Math.floor(next.agriculture / 10));
    }
    return next;
}

export function advanceDomainCalendar(domain: DomainState): DomainState {
    let month = domain.calendarMonth + 1;
    let year = domain.calendarYear;
    if (month > 12) {
        month = 1;
        year += 1;
    }
    return { ...domain, calendarMonth: month, calendarYear: year };
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

function eventWeight(def: DomainEventDef, domain: DomainState, intelligence?: DomainIntelligence, actions?: readonly DomainActionId[]): number {
    let w = def.baseWeight;
    if (def.requiresOfficers && domain.officers.length === 0) { return 0; }
    if (def.agricultureMax !== undefined && domain.agriculture > def.agricultureMax) { return 0; }
    if (def.agricultureMin !== undefined && domain.agriculture < def.agricultureMin) { w += 8; }
    if (def.commerceMin !== undefined && domain.commerce >= def.commerceMin) { w += 6; }
    if (def.publicOrderMax !== undefined && domain.publicOrder <= def.publicOrderMax) { w += 10; }
    if (def.popularSupportMax !== undefined && domain.popularSupport <= def.popularSupportMax) { w += 8; }
    if (def.defenseMax !== undefined && domain.defense <= def.defenseMax) { w += 7; }
    if (def.requiresIntelligence && intelligence !== def.requiresIntelligence) { return 0; }
    if (def.requiresIntelligence && intelligence === def.requiresIntelligence) { w += 15; }
    if (def.requiresAction && actions?.includes(def.requiresAction)) { w += 12; }
    const season = getDomainSeason(domain.calendarMonth);
    if (def.id === 'bad_harvest' && season === 'autumn') { w = Math.max(1, w - 5); }
    if (def.id === 'festival_gathering' && season === 'winter') { w += 10; }
    if (def.id === 'festival_gathering' && actions?.includes('festival')) { w += 8; }
    if (def.id === 'officer_discontent' && domain.flags.officerDiscontent === true) { w += 14; }
    if (def.id === 'neighbor_militarize' && domain.flags[RIVAL_RAID_PREP_FLAG] === true) { w += 12; }
    if (def.id === 'domain_quiet_month') { w = Math.max(1, w - 2); }
    return w;
}

/** Exposed for unit tests (seasonal / event-first weight tuning). */
export function computeDomainEventWeight(
    eventId: string,
    domain: DomainState,
    intelligence?: DomainIntelligence,
    actions?: readonly DomainActionId[]
): number {
    const def = DOMAIN_EVENTS.find((e) => e.id === eventId);
    if (!def) { return 0; }
    return eventWeight(def, domain, intelligence, actions);
}

export function applyDomainEventEffect(domain: DomainState, eventId: string): DomainState {
    const delta = DOMAIN_EVENT_EFFECTS[eventId];
    if (!delta) {
        return domain;
    }
    return applyDelta(domain, delta);
}

export function buildDomainEventGmHint(eventId: string): string {
    const hint = DOMAIN_EVENT_GM_HINTS[eventId] ?? 'Narrate this domain development; stats are already canonical.';
    return `[Domain — Event] ${eventId}: ${hint}`;
}

const SEASONAL_DOMAIN_GM_HINTS: Record<DomainSeason, string> = {
    spring: 'Spring: planting season — agriculture actions gain +1; narrate renewal and field work.',
    summer: 'Summer: baseline season — narrate heat, patrols, and trade as usual.',
    autumn: 'Autumn: harvest month — food yield bonus applied; bad_harvest event weight reduced.',
    winter: 'Winter: rations tighten (food drain applied); festival action and festival_gathering events are favored — narrate cold and morale.',
};

export function buildSeasonalDomainGmHint(domain: DomainState): string {
    const season = getDomainSeason(domain.calendarMonth);
    const hint = SEASONAL_DOMAIN_GM_HINTS[season];
    return `[Domain — Season] ${seasonLabel(season)} (M${domain.calendarMonth}): ${hint}`;
}

/** Passive tax / harvest so months feel alive without stat-grind (+2 forever). */
export function applyMonthlyDomainIncome(domain: DomainState): DomainState {
    const tax = Math.floor(domain.commerce / 8) + Math.floor(domain.agriculture / 10) + 8;
    const foodYield = Math.floor(domain.agriculture / 12) + 5;
    return applyDelta(domain, { treasury: tax, food: foodYield });
}

/** §10.3: minimal = 3-line summary; full = monthly_commit; standard = compact + pending/officers. */
export function resolveDomainPromptTier(domain: DomainState, isCommitTurn: boolean): DomainPromptTier {
    if (isCommitTurn) {
        return 'full';
    }
    if (
        domain.pendingEvents.length === 0
        && domain.officers.length === 0
        && !domain.lastEventId
    ) {
        return 'minimal';
    }
    return 'standard';
}

export function rollDomainEvent(
    domain: DomainState,
    seed: number,
    intelligence?: DomainIntelligence,
    actions?: readonly DomainActionId[],
    excludedEventIds?: ReadonlySet<string>
): string {
    const weights: { id: string; w: number }[] = [];
    for (const def of DOMAIN_EVENTS) {
        if (def.id !== 'domain_quiet_month' && excludedEventIds && isExcludedEvent(excludedEventIds, 'domain', def.id)) {
            continue;
        }
        const w = eventWeight(def, domain, intelligence, actions);
        if (w > 0) { weights.push({ id: def.id, w }); }
    }
    if (weights.length === 0) { return 'domain_quiet_month'; }

    const total = weights.reduce((sum, e) => sum + e.w, 0);
    let roll = hashSeed([seed, domain.calendarMonth, domain.calendarYear, domain.controlledRegionId]) % total;
    for (const entry of weights) {
        if (roll < entry.w) { return entry.id; }
        roll -= entry.w;
    }
    return weights[weights.length - 1].id;
}

export interface CouncilOfficerInput {
    npcId: string;
    role: OfficerRole;
    name?: string;
}

export function formatMonthlyChronicleText(
    actions: readonly DomainActionId[],
    eventId: string,
    calendarMonth: number,
    calendarYear: number
): string {
    const actionText = actions.length > 0 ? actions.join(', ') : 'policy';
    const season = getDomainSeason(calendarMonth);
    return `Year ${calendarYear} ${season}: monthly decree (${actionText}); event: ${eventId}`;
}

export function applyMonthlyCommit(
    domain: DomainState,
    ops: DomainOps,
    config: DomainConfig,
    worldTurnSeed = 0
): MonthlyCommitResult {
    const actions = (ops.actions ?? []).slice(0, config.monthlyActions);
    let next: DomainState = { ...domain, lastBattleReport: undefined };
    next = applyDelta(next, resolveMonthlyActionDeltas(actions, next.calendarMonth));

    next = applyMonthlyDomainIncome(next);
    next = applySeasonalMonthlyEffects(next);
    next = advanceDomainCalendar(next);
    next.monthlyActionsRemaining = config.monthlyActions;
    next.lastCommitWorldTurn = worldTurnSeed;

    const eventId = rollDomainEvent(next, worldTurnSeed, ops.intelligence, actions, config.excludedEventIds);
    next = applyDomainEventEffect(next, eventId);
    next.lastEventId = eventId;
    const pending = [...next.pendingEvents, eventId].slice(-MAX_DOMAIN_PENDING_EVENTS);
    next.pendingEvents = pending;

    next = {
        ...next,
        lastMonthlyActions: actions.length > 0 ? [...actions] : next.lastMonthlyActions,
    };

    if (actions.includes('audience')) {
        const queue = buildAudienceQueue(next, worldTurnSeed, config.audienceSize, config.excludedEventIds);
        next = { ...next, pendingPetitions: queue.map((p) => p.id) };
    }

    let rivalActionId: RivalActionId | undefined;
    if (config.rivalsEnabled && !next.rival && config.rivalRegionId) {
        next = { ...next, rival: deriveRivalLord(config.rivalRegionId) };
    }
    if (next.rival) {
        let rival = next.rival;
        if (actions.includes('diplomacy')) {
            rival = resolveRivalDiplomacy(rival, next.prestige, worldTurnSeed);
        }
        if (actions.includes('espionage') || ops.intelligence === 'gather_rumors') {
            rival = discloseRivalInfo(rival, next.calendarMonth, next.calendarYear);
        }
        const tickResult = tickRivalLord(rival, next, worldTurnSeed);
        rivalActionId = tickResult.action;

        if (tickResult.action === 'raid' && config.enableMassBattle && !next.activeBattle) {
            // §F10 owns raid outcomes now — undo rivalLordCore's own placeholder strength/delta resolution
            // (rival.strength reverts to its pre-raid value; the battle applies its own outcome on conclusion).
            next = { ...next, rival: { ...tickResult.rival, strength: rival.strength } };
            const enemyTroops = Math.max(20, rival.strength * ENEMY_TROOPS_PER_STRENGTH);
            const marshalSkill = next.officers.find((o) => o.role === 'marshal')?.skill ?? 50;
            next.activeBattle = startBattle(
                rival.regionId,
                { troops: next.troops, quality: next.defense, commanderSkill: marshalSkill },
                { troops: enemyTroops, quality: rival.aggression, commanderSkill: 50 }
            );
        } else {
            next = { ...next, rival: tickResult.rival };
            if (tickResult.playerDelta) {
                next = applyDelta(next, tickResult.playerDelta);
            }
        }
        next.flags = { ...next.flags, [RIVAL_RAID_PREP_FLAG]: tickResult.rival.raidPending === true };
    }

    // §F9: one month passes for every mission in flight; due missions resolve now.
    const ticked = (next.activeMissions ?? []).map(tickMissionMonth);
    const due = ticked.filter(isMissionDue);
    const stillAway = ticked.filter((m) => !isMissionDue(m));
    const missionReports: string[] = [];
    for (const mission of due) {
        const skill = next.officers.find((o) => o.npcId === mission.officerNpcId)?.skill ?? DEFAULT_OFFICER_SKILL;
        const trust = config.officerTrustMap?.[mission.officerNpcId] ?? DEFAULT_OFFICER_TRUST;
        const outcome = resolveMissionOutcome(mission, skill, trust, worldTurnSeed);
        next = applyDelta(next, outcome.deltas);
        missionReports.push(outcome.reportLine);
    }
    next.activeMissions = stillAway.length > 0 ? stillAway : undefined;
    next.lastMissionReports = missionReports.length > 0 ? missionReports : undefined;

    // Council excludes officers still away on a mission (D5 §9.3 stays bond-driven; F9 only filters presence).
    const awayNpcIds = new Set(stillAway.map((m) => m.officerNpcId));
    const councilLines = buildDomainCouncilLines({
        domain: next,
        officers: next.officers
            .filter((o) => !awayNpcIds.has(o.npcId))
            .map((o) => ({ npcId: o.npcId, role: o.role })),
    });

    return {
        domain: next,
        rolledEventId: eventId,
        chronicleText: formatMonthlyChronicleText(
            actions,
            eventId,
            next.calendarMonth === 1 ? 12 : next.calendarMonth - 1,
            next.calendarMonth === 1 ? next.calendarYear - 1 : next.calendarYear
        ),
        councilLines,
        rivalActionId,
    };
}

export function appointOfficer(domain: DomainState, officer: DomainOfficer): DomainState {
    const filtered = domain.officers.filter((o) => o.npcId !== officer.npcId);
    const next = [...filtered, officer].slice(0, MAX_DOMAIN_OFFICERS);
    return { ...domain, officers: next };
}

export function dismissOfficer(domain: DomainState, npcId: string): DomainState {
    return {
        ...domain,
        officers: domain.officers.filter((o) => o.npcId !== npcId),
    };
}

export function dispatchOfficer(
    domain: DomainState,
    npcId: string,
    kind: string,
    maxActiveMissions: number,
    targetId?: string,
    months?: number
): DomainState {
    const isAppointed = domain.officers.some((o) => o.npcId === npcId);
    const active = domain.activeMissions ?? [];
    const alreadyAway = active.some((m) => m.officerNpcId === npcId);
    if (!isAppointed || alreadyAway || active.length >= maxActiveMissions) {
        return domain;
    }
    const mission = createOfficerMission(npcId, kind, months, targetId);
    if (!mission) { return domain; }
    return { ...domain, activeMissions: [...active, mission] };
}

export interface BattleRoundApplyResult {
    domain: DomainState;
    outcome?: BattleOutcome;
}

export function applyBattleRound(
    domain: DomainState,
    tactic: BattleTactic,
    worldTurnSeed: number
): BattleRoundApplyResult {
    if (!domain.activeBattle) { return { domain }; }

    const battle = domain.activeBattle;
    const round = battle.rounds.length + 1;
    const playerSide = {
        troops: battle.playerTroopsRemaining,
        quality: domain.defense,
        commanderSkill: domain.officers.find((o) => o.role === 'marshal')?.skill ?? 50,
    };
    const enemySide = { ...battle.enemySide, troops: battle.enemyTroopsRemaining };
    const enemyTactic = resolveEnemyTactic(enemySide, worldTurnSeed, round);
    const roundResult = resolveBattleRound(playerSide, enemySide, tactic, enemyTactic, worldTurnSeed, round);
    const advanced = applyBattleRoundToState(battle, roundResult);

    if (!isBattleConcluded(advanced)) {
        return { domain: { ...domain, activeBattle: advanced } };
    }

    const outcome = concludeBattle(advanced);
    let next = applyDelta(domain, outcome.playerDelta);
    next = { ...next, activeBattle: undefined, lastBattleReport: outcome.reportLine };
    if (next.rival && next.rival.regionId === advanced.opponentLabel) {
        next.rival = { ...next.rival, strength: clampDomainStat(next.rival.strength + outcome.enemyStrengthDelta) };
    }
    return { domain: next, outcome };
}

export function applyAudienceRuling(
    domain: DomainState,
    petitionId: string,
    rulingId: string
): { domain: DomainState; audience?: AudienceRulingResult } {
    if (!domain.pendingPetitions?.includes(petitionId)) {
        return { domain };
    }
    const delta = resolvePetitionRuling(petitionId, rulingId);
    let next = applyDelta(domain, delta);
    const remaining = domain.pendingPetitions.filter((id) => id !== petitionId);
    next = { ...next, pendingPetitions: remaining.length > 0 ? remaining : undefined };
    return {
        domain: next,
        audience: {
            petitionId,
            rulingId,
            chronicleText: formatAudienceChronicleText(petitionId, rulingId, domain.calendarMonth, domain.calendarYear),
        },
    };
}

export function applyDomainOps(
    domain: DomainState,
    ops: DomainOps,
    config: DomainConfig,
    worldTurnSeed = 0
): { domain: DomainState; monthly?: MonthlyCommitResult; audience?: AudienceRulingResult; battle?: BattleOutcome } {
    if (ops.kind === 'battle_round' && ops.tactic) {
        const result = applyBattleRound(domain, ops.tactic, worldTurnSeed);
        return { domain: result.domain, battle: result.outcome };
    }
    if (ops.kind === 'appoint_officer' && ops.officer) {
        return {
            domain: appointOfficer(domain, {
                npcId: ops.officer.npcId,
                role: ops.officer.role,
                skill: ops.officer.skill,
            }),
        };
    }
    if (ops.kind === 'dismiss_officer' && ops.officer) {
        return { domain: dismissOfficer(domain, ops.officer.npcId) };
    }
    if (ops.kind === 'audience_ruling' && ops.petitionId && ops.rulingId) {
        return applyAudienceRuling(domain, ops.petitionId, ops.rulingId);
    }
    if (ops.kind === 'dispatch_officer' && ops.mission) {
        return {
            domain: dispatchOfficer(
                domain,
                ops.mission.npcId,
                ops.mission.kind,
                config.maxActiveMissions ?? DEFAULT_MAX_ACTIVE_MISSIONS,
                ops.mission.targetId,
                ops.mission.months
            ),
        };
    }
    if (ops.kind === 'monthly_commit') {
        const monthly = applyMonthlyCommit(domain, ops, config, worldTurnSeed);
        return { domain: monthly.domain, monthly };
    }
    return { domain };
}