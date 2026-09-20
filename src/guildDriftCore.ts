// Guild G4: absence drift + since-last-visit delta (no vscode/fs).

import {
    type GuildConfig,
    type GuildState,
    type GuildAdventurer,
    type GuildActionId,
    normalizeGuildConfig,
    isValidAdventurerClass,
    applyWeeklyGuildIncome,
    applySeasonalWeeklyEffects,
    advanceGuildCalendar,
    rollGuildEvent,
    applyGuildEventEffect,
    applyDelta,
    resolveWeeklyActionDeltas,
    MAX_GUILD_PENDING_EVENTS,
    sanitizeGuildPromptLabel,
    isValidGuildEventId,
} from './guildCore';
import {
    advanceActiveQuests,
    adventurersOnActiveQuests,
    DEFAULT_ADVENTURER_SKILL,
} from './guildQuestCore';
import { buildRequestQueue, isValidGuildRequestId } from './guildRequestCore';
import { CHARACTER_ID_PATTERN } from './characterId';

export const MAX_GUILD_DRIFT_WEEKS = 24;
export const DEFAULT_GUILD_TURNS_PER_WEEK = 7;

export interface GuildSnapshot {
    worldTurn: number;
    coffers: number;
    supplies: number;
    renown: number;
    townFavor: number;
    discipline: number;
    calendarWeek: number;
    calendarYear: number;
    adventurers: GuildAdventurer[];
    pendingRequests?: string[];
}

export interface GuildVisitChange {
    category: 'guild';
    eventId: string;
    message: string;
    coffersDelta: number;
    renownDelta: number;
    townFavorDelta: number;
}

export interface SinceLastGuildVisitDelta {
    hallLocationId: string;
    turnsAway: number;
    simulatedWeeks: number;
    capped: boolean;
    deputyLabel: string;
    changes: GuildVisitChange[];
    coffersDelta: number;
    renownDelta: number;
    townFavorDelta: number;
}

export interface SinceLastGuildVisitInput {
    lastVisitWorldTurn: number;
    currentWorldTurn: number;
    hallLocationId: string;
    guildBefore: GuildState;
    turnsPerWeek?: number;
    baseSeed: number;
    config?: Partial<GuildConfig>;
}

const DRIFT_EVENT_NARRATION: Record<string, string> = {
    quest_board_dry: 'The quest board ran dry while you were away',
    wealthy_patron: 'A wealthy patron visited the hall',
    adventurer_brawl: 'Adventurers brawled in the guild hall',
    rival_poaching: 'A rival guild stirred poaching pressure',
    walk_in_petition: 'Walk-in petitioners crowded the counter',
    supply_shortage: 'Guild supplies ran short',
    tavern_rumor: 'Tavern rumors spread through the hall',
    festival_recruits: 'A seasonal festival drew recruits',
    member_discontent: 'An adventurer showed discontent',
    guild_quiet_week: 'The deputy kept routine hall business',
};

function presentAdventurers(guild: GuildState): readonly GuildAdventurer[] {
    const away = adventurersOnActiveQuests(guild.quests ?? []);
    return guild.adventurers.filter((a) => !away.has(a.npcId));
}

function pickDeputyLabel(adventurers: readonly GuildAdventurer[]): string {
    if (adventurers.length === 0) {
        return 'The guild counter clerk';
    }
    let best = adventurers[0];
    let bestSkill = best.skill ?? DEFAULT_ADVENTURER_SKILL;
    for (const adv of adventurers.slice(1)) {
        const skill = adv.skill ?? DEFAULT_ADVENTURER_SKILL;
        if (skill > bestSkill) {
            best = adv;
            bestSkill = skill;
        }
    }
    return `Deputy ${sanitizeGuildPromptLabel(best.npcId, 'clerk')}`;
}

function buildAdventurerSkillMap(adventurers: readonly GuildAdventurer[]): Record<string, number> {
    const map: Record<string, number> = {};
    for (const a of adventurers) {
        map[a.npcId] = typeof a.skill === 'number' ? Math.max(0, Math.min(100, Math.floor(a.skill))) : DEFAULT_ADVENTURER_SKILL;
    }
    return map;
}

export function createGuildSnapshot(guild: GuildState, worldTurn: number): GuildSnapshot {
    return {
        worldTurn: Math.max(0, Math.floor(worldTurn)),
        coffers: guild.coffers,
        supplies: guild.supplies,
        renown: guild.renown,
        townFavor: guild.townFavor,
        discipline: guild.discipline,
        calendarWeek: guild.calendarWeek,
        calendarYear: guild.calendarYear,
        adventurers: guild.adventurers.map((a) => ({ ...a })),
        pendingRequests: guild.pendingRequests ? [...guild.pendingRequests] : undefined,
    };
}

export function guildStateFromSnapshot(snapshot: GuildSnapshot, current: GuildState): GuildState {
    return {
        ...current,
        coffers: snapshot.coffers,
        supplies: snapshot.supplies,
        renown: snapshot.renown,
        townFavor: snapshot.townFavor,
        discipline: snapshot.discipline,
        calendarWeek: snapshot.calendarWeek,
        calendarYear: snapshot.calendarYear,
        adventurers: snapshot.adventurers.map((a) => ({ ...a })),
        pendingRequests: snapshot.pendingRequests,
    };
}

/** Steward week: passive income + season + calendar + deputy actions + event (+ optional board/quests). */
export function simulateBoardWeek(
    guild: GuildState,
    seed: number,
    config?: Partial<GuildConfig>
): { guild: GuildState; eventId: string } {
    const normalized = normalizeGuildConfig(config);
    const present = presentAdventurers(guild);
    const deputyPresent = present.length > 0;
    const stewardActions: GuildActionId[] = deputyPresent
        ? ['maintain_hall', 'open_board']
        : ['maintain_hall'];

    let next: GuildState = { ...guild };
    next = applyDelta(next, resolveWeeklyActionDeltas(stewardActions, next.calendarWeek));
    next = applyWeeklyGuildIncome(next);
    next = applySeasonalWeeklyEffects(next);
    next = advanceGuildCalendar(next);

    if (normalized.requestsEnabled && stewardActions.includes('open_board')) {
        const queue = buildRequestQueue(next, seed, normalized.boardSize);
        next = { ...next, pendingRequests: queue.map((r) => r.id) };
    }

    const eventId = rollGuildEvent(next, seed, stewardActions, normalized.excludedEventIds);
    next = applyGuildEventEffect(next, eventId);
    next.lastEventId = eventId;
    next.pendingEvents = [...next.pendingEvents, eventId].slice(-MAX_GUILD_PENDING_EVENTS);

    if (normalized.partiesEnabled) {
        const skillMap = buildAdventurerSkillMap(next.adventurers);
        const bondMap = normalized.adventurerBondMap ?? {};
        const questAdvance = advanceActiveQuests(next, skillMap, bondMap, seed);
        for (const delta of questAdvance.outcomeDeltas) {
            next = applyDelta(next, delta);
        }
        next = {
            ...next,
            quests: questAdvance.quests,
            lastQuestReports: questAdvance.lastQuestReports ?? next.lastQuestReports,
        };
    }

    return { guild: next, eventId };
}

export function simulateGuildDrift(
    start: GuildState,
    virtualWeeks: number,
    baseSeed: number,
    config?: Partial<GuildConfig>
): { guild: GuildState; events: string[] } {
    const weeks = Math.max(0, Math.min(MAX_GUILD_DRIFT_WEEKS, Math.floor(virtualWeeks)));
    let next = { ...start };
    const events: string[] = [];
    for (let i = 0; i < weeks; i++) {
        const tick = simulateBoardWeek(next, baseSeed + i * 997, config);
        next = tick.guild;
        events.push(tick.eventId);
    }
    return { guild: next, events };
}

function buildVisitChange(
    eventId: string,
    before: GuildState,
    after: GuildState
): GuildVisitChange {
    const coffersDelta = after.coffers - before.coffers;
    const renownDelta = after.renown - before.renown;
    const townFavorDelta = after.townFavor - before.townFavor;
    const narration = DRIFT_EVENT_NARRATION[eventId] ?? 'The guild shifted while you were away';
    const parts: string[] = [narration];
    if (coffersDelta !== 0) {
        parts.push(`coffers ${coffersDelta > 0 ? '+' : ''}${coffersDelta}`);
    }
    if (renownDelta !== 0) {
        parts.push(`renown ${renownDelta > 0 ? '+' : ''}${renownDelta}`);
    }
    if (townFavorDelta !== 0) {
        parts.push(`town favor ${townFavorDelta > 0 ? '+' : ''}${townFavorDelta}`);
    }
    return {
        category: 'guild',
        eventId,
        message: parts.join('; '),
        coffersDelta,
        renownDelta,
        townFavorDelta,
    };
}

export interface SinceLastGuildVisitResult {
    delta: SinceLastGuildVisitDelta;
    guildAfter: GuildState;
}

export function computeSinceLastGuildVisitDelta(
    input: SinceLastGuildVisitInput
): SinceLastGuildVisitResult | undefined {
    const turnsAway = Math.max(0, Math.floor(input.currentWorldTurn - input.lastVisitWorldTurn));
    if (turnsAway <= 0) { return undefined; }

    const turnsPerWeek = Math.max(1, Math.floor(input.turnsPerWeek ?? DEFAULT_GUILD_TURNS_PER_WEEK));
    const rawVirtualWeeks = Math.floor(turnsAway / turnsPerWeek);
    const virtualWeeks = Math.min(MAX_GUILD_DRIFT_WEEKS, rawVirtualWeeks);
    if (virtualWeeks <= 0) { return undefined; }

    const start = { ...input.guildBefore };
    const changes: GuildVisitChange[] = [];
    let cursor = { ...start };
    for (let i = 0; i < virtualWeeks; i++) {
        const before = { ...cursor };
        const tick = simulateBoardWeek(before, input.baseSeed + i * 997, input.config);
        cursor = tick.guild;
        changes.push(buildVisitChange(tick.eventId, before, cursor));
    }
    const end = cursor;

    return {
        delta: {
            hallLocationId: input.hallLocationId,
            turnsAway,
            simulatedWeeks: virtualWeeks,
            capped: rawVirtualWeeks > MAX_GUILD_DRIFT_WEEKS,
            deputyLabel: pickDeputyLabel(presentAdventurers(input.guildBefore)),
            changes: changes.slice(-4),
            coffersDelta: end.coffers - start.coffers,
            renownDelta: end.renown - start.renown,
            townFavorDelta: end.townFavor - start.townFavor,
        },
        guildAfter: end,
    };
}

function sanitizeDriftPromptLine(value: string, max = 240): string {
    return value.trim().replace(/[\r\n\t\x00-\x1f]/g, ' ').slice(0, max);
}

export function buildSinceLastGuildVisitLines(delta: SinceLastGuildVisitDelta | undefined): string[] {
    if (!delta || delta.turnsAway <= 0) { return []; }

    const awayDesc = delta.capped
        ? `${delta.turnsAway} turns away; ${delta.simulatedWeeks} guild weeks simulated (cap ${MAX_GUILD_DRIFT_WEEKS})`
        : `${delta.turnsAway} turns away`;
    let deputy = sanitizeDriftPromptLine(delta.deputyLabel, 80);
    if (deputy.includes('[') || deputy.includes(']')) {
        deputy = 'The guild counter clerk';
    }
    const lines: string[] = [
        `Guild (${awayDesc}): While you were away, ${deputy} ran the quest board.`,
    ];

    if (delta.coffersDelta !== 0) {
        lines.push(`- Coffers ${delta.coffersDelta > 0 ? '+' : ''}${delta.coffersDelta} overall.`);
    }
    if (delta.renownDelta !== 0) {
        lines.push(`- Renown ${delta.renownDelta > 0 ? '+' : ''}${delta.renownDelta} overall.`);
    }
    if (delta.townFavorDelta !== 0) {
        lines.push(`- Town favor ${delta.townFavorDelta > 0 ? '+' : ''}${delta.townFavorDelta} overall.`);
    }

    const changes = Array.isArray(delta.changes) ? delta.changes : [];
    for (const ch of changes) {
        const eventId = isValidGuildEventId(ch.eventId) ? ch.eventId : 'guild_quiet_week';
        const narration = DRIFT_EVENT_NARRATION[eventId] ?? 'The guild shifted while you were away';
        lines.push(`- ${narration}. [guild:${eventId}]`);
    }

    return lines.slice(0, 8);
}

export function parseGuildSnapshot(raw: unknown): GuildSnapshot | undefined {
    if (!raw || typeof raw !== 'object') { return undefined; }
    const doc = raw as Record<string, unknown>;
    if (typeof doc.worldTurn !== 'number' || !Number.isFinite(doc.worldTurn)) { return undefined; }

    const adventurers: GuildAdventurer[] = [];
    if (Array.isArray(doc.adventurers)) {
        for (const item of doc.adventurers.slice(0, 5)) {
            if (!item || typeof item !== 'object') { continue; }
            const a = item as Record<string, unknown>;
            const npcId = sanitizeGuildPromptLabel(a.npcId, '', 64);
            if (!npcId) { continue; }
            const adv: GuildAdventurer = { npcId, klass: 'warrior' };
            if (isValidAdventurerClass(a.klass)) {
                adv.klass = a.klass;
            }
            if (typeof a.skill === 'number' && Number.isFinite(a.skill)) {
                adv.skill = Math.max(0, Math.min(100, Math.floor(a.skill)));
            }
            adventurers.push(adv);
        }
    }

    const pendingRequests: string[] = [];
    if (Array.isArray(doc.pendingRequests)) {
        for (const item of doc.pendingRequests.slice(0, 4)) {
            if (typeof item === 'string' && isValidGuildRequestId(item.trim())) {
                pendingRequests.push(item.trim());
            }
        }
    }

    return {
        worldTurn: Math.max(0, Math.floor(doc.worldTurn)),
        coffers: Math.max(0, Math.floor(typeof doc.coffers === 'number' ? doc.coffers : 0)),
        supplies: Math.max(0, Math.floor(typeof doc.supplies === 'number' ? doc.supplies : 0)),
        renown: Math.max(0, Math.min(100, Math.floor(typeof doc.renown === 'number' ? doc.renown : 0))),
        townFavor: Math.max(0, Math.min(100, Math.floor(typeof doc.townFavor === 'number' ? doc.townFavor : 0))),
        discipline: Math.max(0, Math.min(100, Math.floor(typeof doc.discipline === 'number' ? doc.discipline : 0))),
        calendarWeek: Math.max(1, Math.min(48, Math.floor(typeof doc.calendarWeek === 'number' ? doc.calendarWeek : 1))),
        calendarYear: Math.max(1, Math.floor(typeof doc.calendarYear === 'number' ? doc.calendarYear : 1)),
        adventurers,
        pendingRequests: pendingRequests.length > 0 ? pendingRequests : undefined,
    };
}

export function parseSinceLastGuildVisitDelta(raw: unknown): SinceLastGuildVisitDelta | undefined {
    if (!raw || typeof raw !== 'object') { return undefined; }
    const doc = raw as Record<string, unknown>;
    const hallLocationId = typeof doc.hallLocationId === 'string' ? doc.hallLocationId.trim() : '';
    if (!hallLocationId || !CHARACTER_ID_PATTERN.test(hallLocationId)) { return undefined; }
    const turnsAway = typeof doc.turnsAway === 'number' && Number.isFinite(doc.turnsAway)
        ? Math.max(0, Math.floor(doc.turnsAway))
        : 0;
    if (turnsAway <= 0) { return undefined; }

    const changes: GuildVisitChange[] = [];
    if (Array.isArray(doc.changes)) {
        for (const item of doc.changes.slice(0, 8)) {
            if (!item || typeof item !== 'object') { continue; }
            const c = item as Record<string, unknown>;
            const eventId = typeof c.eventId === 'string' && isValidGuildEventId(c.eventId.trim())
                ? c.eventId.trim()
                : '';
            if (!eventId) { continue; }
            const message = DRIFT_EVENT_NARRATION[eventId] ?? 'The guild shifted while you were away';
            changes.push({
                category: 'guild',
                eventId,
                message,
                coffersDelta: Math.floor(typeof c.coffersDelta === 'number' ? c.coffersDelta : 0),
                renownDelta: Math.floor(typeof c.renownDelta === 'number' ? c.renownDelta : 0),
                townFavorDelta: Math.floor(typeof c.townFavorDelta === 'number' ? c.townFavorDelta : 0),
            });
        }
    }

    const simulatedWeeks = typeof doc.simulatedWeeks === 'number' && Number.isFinite(doc.simulatedWeeks)
        ? Math.max(0, Math.min(MAX_GUILD_DRIFT_WEEKS, Math.floor(doc.simulatedWeeks)))
        : Math.min(MAX_GUILD_DRIFT_WEEKS, Math.floor(turnsAway / DEFAULT_GUILD_TURNS_PER_WEEK));

    return {
        hallLocationId: hallLocationId.slice(0, 64),
        turnsAway,
        simulatedWeeks,
        capped: doc.capped === true,
        deputyLabel: sanitizeDriftPromptLine(
            typeof doc.deputyLabel === 'string' ? doc.deputyLabel : 'The guild counter clerk',
            80
        ),
        changes,
        coffersDelta: Math.floor(typeof doc.coffersDelta === 'number' ? doc.coffersDelta : 0),
        renownDelta: Math.floor(typeof doc.renownDelta === 'number' ? doc.renownDelta : 0),
        townFavorDelta: Math.floor(typeof doc.townFavorDelta === 'number' ? doc.townFavorDelta : 0),
    };
}