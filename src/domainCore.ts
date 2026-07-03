// Domain Mode D1: lordship stats, monthly actions, events (no vscode/fs).

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
    | 'espionage';
export type DomainOpsKind = 'monthly_commit' | 'appoint_officer' | 'dismiss_officer';
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
    flags: Record<string, boolean>;
}

export interface DomainConfig {
    monthDays: number;
    monthlyActions: number;
}

export interface DomainOps {
    kind: DomainOpsKind;
    actions?: DomainActionId[];
    intelligence?: DomainIntelligence;
    officer?: { npcId: string; role: OfficerRole; skill?: number };
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
}

const DOMAIN_RANKS: readonly DomainRank[] = ['minor_lord', 'baron', 'count'];
const OFFICER_ROLES: readonly OfficerRole[] = ['steward', 'marshal', 'diplomat', 'merchant', 'spy'];
const DOMAIN_ACTIONS: readonly DomainActionId[] = [
    'agriculture', 'commerce', 'public_order', 'train_troops', 'fortify',
    'diplomacy', 'recruit', 'inspect', 'festival', 'espionage',
];

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
}

const DOMAIN_EVENTS: readonly DomainEventDef[] = [
    { id: 'bad_harvest', baseWeight: 10, agricultureMax: 40 },
    { id: 'merchant_visit', baseWeight: 15, commerceMin: 50 },
    { id: 'bandit_activity', baseWeight: 12, publicOrderMax: 45 },
    { id: 'neighbor_militarize', baseWeight: 8, defenseMax: 40 },
    { id: 'petition', baseWeight: 14, popularSupportMax: 45 },
    { id: 'trade_route_disruption', baseWeight: 9, commerceMin: 30 },
    { id: 'rumor_mill', baseWeight: 11, requiresIntelligence: 'gather_rumors' },
    { id: 'spy_arrival', baseWeight: 10, requiresAction: 'espionage' },
    { id: 'religious_friction', baseWeight: 7, popularSupportMax: 50 },
    { id: 'domain_quiet_month', baseWeight: 2 },
];

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
    domain_quiet_month: { popularSupport: 1 },
};

const DOMAIN_EVENT_GM_HINTS: Record<string, string> = {
    bad_harvest: 'Crop yields failed; narrate hunger anxiety and rationing. Core already reduced food and support.',
    merchant_visit: 'A traveling merchant arrived; narrate trade opportunity. Treasury already increased.',
    bandit_activity: 'Bandits troubled the roads; narrate fear and patrols. Order and treasury already reduced.',
    neighbor_militarize: 'Neighboring forces stirred; narrate border tension. Do not invent troop counts.',
    petition: 'Subjects petition the lord; narrate grievances. Support and order already dipped.',
    trade_route_disruption: 'A route faltered; narrate delayed goods. Treasury already took a hit.',
    rumor_mill: 'Rumors spread from abroad; narrate hearsay only — no new map facts.',
    spy_arrival: 'A covert messenger surfaced; narrate intrigue. Do not canonize new NPCs without GM ops.',
    religious_friction: 'Faith or guild friction rose; narrate cultural tension.',
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

export function normalizeDomainConfig(raw?: Partial<DomainConfig>): DomainConfig {
    const monthDays = typeof raw?.monthDays === 'number' && Number.isFinite(raw.monthDays)
        ? Math.max(MIN_DOMAIN_MONTH_DAYS, Math.min(MAX_DOMAIN_MONTH_DAYS, Math.floor(raw.monthDays)))
        : DEFAULT_DOMAIN_MONTH_DAYS;
    const monthlyActions = typeof raw?.monthlyActions === 'number' && Number.isFinite(raw.monthlyActions)
        ? Math.max(1, Math.min(MAX_DOMAIN_ACTIONS_PER_MONTH, Math.floor(raw.monthlyActions)))
        : DEFAULT_DOMAIN_MONTHLY_ACTIONS;
    return { monthDays, monthlyActions };
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
    const npcId = typeof doc.npcId === 'string' ? doc.npcId.trim() : '';
    if (!npcId || npcId.length > 64) { return undefined; }
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
    if (!controlledRegionId || controlledRegionId.length > 64) { return undefined; }

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
            if (typeof item === 'string' && item.trim()) {
                pendingEvents.push(item.trim().slice(0, 64));
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
        lastEventId: typeof doc.lastEventId === 'string' && doc.lastEventId.trim()
            ? doc.lastEventId.trim().slice(0, 64)
            : undefined,
        officers,
        pendingEvents,
        flags,
    };
}

export function parseDomainOps(raw: unknown): DomainOps | undefined {
    if (!raw || typeof raw !== 'object') { return undefined; }
    const doc = raw as Record<string, unknown>;
    const kind = doc.kind;
    if (kind !== 'monthly_commit' && kind !== 'appoint_officer' && kind !== 'dismiss_officer') {
        return undefined;
    }

    const ops: DomainOps = { kind };

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
        const npcId = typeof off.npcId === 'string' ? off.npcId.trim() : '';
        if (npcId && isValidOfficerRole(off.role)) {
            ops.officer = {
                npcId: npcId.slice(0, 64),
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

export function resolveMonthlyActionDeltas(actions: readonly DomainActionId[]): DomainStatDelta {
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
    if (def.agricultureMax !== undefined && domain.agriculture > def.agricultureMax) { return 0; }
    if (def.agricultureMin !== undefined && domain.agriculture < def.agricultureMin) { w += 8; }
    if (def.commerceMin !== undefined && domain.commerce >= def.commerceMin) { w += 6; }
    if (def.publicOrderMax !== undefined && domain.publicOrder <= def.publicOrderMax) { w += 10; }
    if (def.popularSupportMax !== undefined && domain.popularSupport <= def.popularSupportMax) { w += 8; }
    if (def.defenseMax !== undefined && domain.defense <= def.defenseMax) { w += 7; }
    if (def.requiresIntelligence && intelligence !== def.requiresIntelligence) { return 0; }
    if (def.requiresIntelligence && intelligence === def.requiresIntelligence) { w += 15; }
    if (def.requiresAction && actions?.includes(def.requiresAction)) { w += 12; }
    if (def.id === 'bad_harvest' && getDomainSeason(domain.calendarMonth) === 'autumn') { w = Math.max(1, w - 5); }
    if (def.id === 'domain_quiet_month') { w = Math.max(1, w - 2); }
    return w;
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

/** Passive tax / harvest so months feel alive without stat-grind (+2 forever). */
export function applyMonthlyDomainIncome(domain: DomainState): DomainState {
    const tax = Math.floor(domain.commerce / 8) + Math.floor(domain.agriculture / 10) + 8;
    const foodYield = Math.floor(domain.agriculture / 12) + 5;
    return applyDelta(domain, { treasury: tax, food: foodYield });
}

export function resolveDomainPromptTier(domain: DomainState, isCommitTurn: boolean): DomainPromptTier {
    if (isCommitTurn) {
        return 'full';
    }
    if (domain.pendingEvents.length > 0 || domain.officers.length > 0 || domain.lastEventId) {
        return 'standard';
    }
    return 'minimal';
}

export function rollDomainEvent(
    domain: DomainState,
    seed: number,
    intelligence?: DomainIntelligence,
    actions?: readonly DomainActionId[]
): string {
    const weights: { id: string; w: number }[] = [];
    for (const def of DOMAIN_EVENTS) {
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

export function buildCouncilLines(domain: DomainState, officers: readonly CouncilOfficerInput[]): string[] {
    const lines: string[] = [];
    for (const officer of officers.slice(0, MAX_DOMAIN_OFFICERS)) {
        const label = officer.name?.trim() || officer.npcId;
        let line = '';
        if (officer.role === 'steward' && domain.treasury < 200) {
            line = `${label} (steward): Treasury is strained; caution on spending.`;
        } else if (officer.role === 'marshal' && domain.defense < 45) {
            line = `${label} (marshal): Recommends training troops before border rumors spread.`;
        } else if (officer.role === 'diplomat' && domain.prestige < 25) {
            line = `${label} (diplomat): Prestige is low; diplomacy may wait.`;
        } else if (officer.role === 'merchant' && domain.commerce >= 50) {
            line = `${label} (merchant): Trade routes look favorable this season.`;
        } else if (officer.role === 'spy') {
            line = `${label} (spy): Hears unease in neighboring lands.`;
        } else {
            line = `${label} (${officer.role}): Awaits your monthly decree.`;
        }
        lines.push(line);
    }
    return lines;
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
    let next = { ...domain };
    next = applyDelta(next, resolveMonthlyActionDeltas(actions));

    const season = getDomainSeason(next.calendarMonth);
    if (season === 'spring' && actions.includes('agriculture')) {
        next.agriculture = clampDomainStat(next.agriculture + 1);
    }

    next = applyMonthlyDomainIncome(next);
    next = applySeasonalMonthlyEffects(next);
    next = advanceDomainCalendar(next);
    next.monthlyActionsRemaining = config.monthlyActions;
    next.lastCommitWorldTurn = worldTurnSeed;

    const eventId = rollDomainEvent(next, worldTurnSeed, ops.intelligence, actions);
    next = applyDomainEventEffect(next, eventId);
    next.lastEventId = eventId;
    const pending = [...next.pendingEvents, eventId].slice(-MAX_DOMAIN_PENDING_EVENTS);
    next.pendingEvents = pending;

    const councilLines = buildCouncilLines(
        next,
        next.officers.map((o) => ({ npcId: o.npcId, role: o.role }))
    );

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

export function applyDomainOps(
    domain: DomainState,
    ops: DomainOps,
    config: DomainConfig,
    worldTurnSeed = 0
): { domain: DomainState; monthly?: MonthlyCommitResult } {
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
    if (ops.kind === 'monthly_commit') {
        const monthly = applyMonthlyCommit(domain, ops, config, worldTurnSeed);
        return { domain: monthly.domain, monthly };
    }
    return { domain };
}