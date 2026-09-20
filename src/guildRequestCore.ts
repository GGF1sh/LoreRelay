// Guild G2: request queue — deterministic generation + ruling deltas (no vscode/fs).

import type { GuildState, GuildStatDelta, GuildSeason } from './guildCore';

const WEEKS_PER_YEAR = 48;
const WEEKS_PER_SEASON = 12;
const GUILD_STAT_MAX = 100;
const GUILD_RESOURCE_MAX = 9999;

function getGuildSeason(calendarWeek: number): GuildSeason {
    const w = ((Math.floor(calendarWeek) - 1) % WEEKS_PER_YEAR);
    if (w < WEEKS_PER_SEASON) { return 'spring'; }
    if (w < WEEKS_PER_SEASON * 2) { return 'summer'; }
    if (w < WEEKS_PER_SEASON * 3) { return 'autumn'; }
    return 'winter';
}

function clampGuildStat(value: number): number {
    return Math.max(0, Math.min(GUILD_STAT_MAX, Math.floor(value)));
}

export const MAX_GUILD_REQUEST_QUEUE = 4;
export const DEFAULT_BOARD_SIZE = 3;
export const NEGOTIATE_REWARD_DISCOUNT = 0.8;

export type GuildRequestId =
    | 'wolf_cull'
    | 'escort_caravan'
    | 'lost_heirloom'
    | 'haunted_mill'
    | 'bandit_bounty'
    | 'missing_child'
    | 'rare_herb'
    | 'debt_collection'
    | 'monster_nest'
    | 'ruin_survey';

export type QuestKind = 'hunt' | 'escort' | 'recover' | 'investigate' | 'clear';
export type RequestRulingId = 'accept' | 'decline' | 'negotiate';

export interface RequestRuling {
    label: string;
    delta: GuildStatDelta;
}

export interface GuildRequest {
    id: GuildRequestId;
    clientArchetype: string;
    summary: string;
    questKind: QuestKind;
    baseDifficulty: number;
    baseReward: number;
    rulings: Record<RequestRulingId, RequestRuling>;
}

interface GuildRequestDef extends GuildRequest {
    baseWeight: number;
    townFavorMax?: number;
    renownMin?: number;
    disciplineMax?: number;
    safetyMax?: number;
    season?: GuildSeason;
}

const REQUEST_DEFS: readonly GuildRequestDef[] = [
    {
        id: 'wolf_cull',
        clientArchetype: 'frightened farmer',
        summary: 'Wolves have been savaging the outlying flocks; the village begs for a cull.',
        questKind: 'hunt',
        baseDifficulty: 30,
        baseReward: 40,
        baseWeight: 8,
        townFavorMax: 55,
        rulings: {
            accept: { label: 'post the wolf bounty', delta: { renown: 1, townFavor: 1 } },
            decline: { label: 'turn them away', delta: { townFavor: -2 } },
            negotiate: { label: 'take an advance fee', delta: { coffers: 15, townFavor: -1 } },
        },
    },
    {
        id: 'escort_caravan',
        clientArchetype: 'nervous merchant',
        summary: 'A merchant caravan seeks armed escort through bandit country.',
        questKind: 'escort',
        baseDifficulty: 35,
        baseReward: 50,
        baseWeight: 7,
        renownMin: 20,
        rulings: {
            accept: { label: 'accept the escort contract', delta: { renown: 1, coffers: 5 } },
            decline: { label: 'refuse the contract', delta: { townFavor: -1, renown: -1 } },
            negotiate: { label: 'haggle a higher retainer', delta: { coffers: 20, townFavor: -1 } },
        },
    },
    {
        id: 'lost_heirloom',
        clientArchetype: 'weeping noblewoman',
        summary: 'A family heirloom was stolen from a manor; they offer a finder\'s fee.',
        questKind: 'recover',
        baseDifficulty: 40,
        baseReward: 35,
        baseWeight: 6,
        rulings: {
            accept: { label: 'take the recovery job', delta: { renown: 1 } },
            decline: { label: 'decline politely', delta: { townFavor: -1 } },
            negotiate: { label: 'demand half the fee upfront', delta: { coffers: 12, townFavor: -1 } },
        },
    },
    {
        id: 'haunted_mill',
        clientArchetype: 'mill owner',
        summary: 'Strange lights haunt the old mill; workers refuse the night shift.',
        questKind: 'investigate',
        baseDifficulty: 45,
        baseReward: 45,
        baseWeight: 6,
        disciplineMax: 50,
        rulings: {
            accept: { label: 'investigate the mill', delta: { renown: 2, lore: 1 } },
            decline: { label: 'send them to the temple', delta: { townFavor: -2 } },
            negotiate: { label: 'charge a consultation fee', delta: { coffers: 18, townFavor: -1 } },
        },
    },
    {
        id: 'bandit_bounty',
        clientArchetype: 'road warden',
        summary: 'Bandits plague the east road; the warden posts a bounty on their leader.',
        questKind: 'hunt',
        baseDifficulty: 50,
        baseReward: 60,
        baseWeight: 7,
        safetyMax: 45,
        rulings: {
            accept: { label: 'post the bounty board-wide', delta: { renown: 2, safety: 1 } },
            decline: { label: 'refer them to the militia', delta: { townFavor: -2, safety: -1 } },
            negotiate: { label: 'split the bounty with the crown', delta: { coffers: 25, renown: -1 } },
        },
    },
    {
        id: 'missing_child',
        clientArchetype: 'desperate parent',
        summary: 'A child vanished near the river bend; the family begs the guild for help.',
        questKind: 'recover',
        baseDifficulty: 38,
        baseReward: 30,
        baseWeight: 8,
        townFavorMax: 50,
        rulings: {
            accept: { label: 'organize a search party', delta: { townFavor: 2, renown: 1 } },
            decline: { label: 'cannot spare adventurers', delta: { townFavor: -3 } },
            negotiate: { label: 'accept a partial advance', delta: { coffers: 10, townFavor: -1 } },
        },
    },
    {
        id: 'rare_herb',
        clientArchetype: 'apothecary',
        summary: 'An apothecary needs rare herbs from the deep woods before the frost.',
        questKind: 'investigate',
        baseDifficulty: 32,
        baseReward: 38,
        baseWeight: 6,
        season: 'autumn',
        rulings: {
            accept: { label: 'gather the herbs', delta: { renown: 1, supplies: 5 } },
            decline: { label: 'herbs are not our trade', delta: { townFavor: -1 } },
            negotiate: { label: 'sell guild supplies at markup', delta: { coffers: 14, townFavor: -1 } },
        },
    },
    {
        id: 'debt_collection',
        clientArchetype: 'moneylender',
        summary: 'A moneylender wants adventurers to recover a defaulted debt from a vanished debtor.',
        questKind: 'investigate',
        baseDifficulty: 42,
        baseReward: 55,
        baseWeight: 5,
        renownMin: 25,
        rulings: {
            accept: { label: 'take the collection job', delta: { coffers: 5, renown: 1 } },
            decline: { label: 'refuse shady work', delta: { discipline: 1, townFavor: 1 } },
            negotiate: { label: 'take a larger cut upfront', delta: { coffers: 22, townFavor: -2 } },
        },
    },
    {
        id: 'monster_nest',
        clientArchetype: 'village elder',
        summary: 'Scouts report a monster nest in the hills; the village cannot wait for the army.',
        questKind: 'clear',
        baseDifficulty: 55,
        baseReward: 70,
        baseWeight: 5,
        renownMin: 35,
        rulings: {
            accept: { label: 'clear the nest', delta: { renown: 2, safety: 2 } },
            decline: { label: 'too dangerous for our rank', delta: { townFavor: -2 } },
            negotiate: { label: 'demand hazard pay', delta: { coffers: 30, townFavor: -1 } },
        },
    },
    {
        id: 'ruin_survey',
        clientArchetype: 'scholar',
        summary: 'A scholar seeks a party to survey ruins before treasure hunters loot them bare.',
        questKind: 'investigate',
        baseDifficulty: 36,
        baseReward: 42,
        baseWeight: 6,
        rulings: {
            accept: { label: 'survey the ruins', delta: { renown: 1, lore: 2 } },
            decline: { label: 'ruins are off-limits', delta: { lore: -1 } },
            negotiate: { label: 'fund the expedition partially', delta: { coffers: 16, lore: 1, townFavor: -1 } },
        },
    },
];

const REQUEST_BY_ID = new Map<string, GuildRequestDef>(REQUEST_DEFS.map((d) => [d.id, d]));
const RULING_IDS: readonly RequestRulingId[] = ['accept', 'decline', 'negotiate'];
const QUEST_KINDS: readonly QuestKind[] = ['hunt', 'escort', 'recover', 'investigate', 'clear'];

export function isValidGuildRequestId(value: unknown): value is GuildRequestId {
    return typeof value === 'string' && REQUEST_BY_ID.has(value);
}

export function isValidRequestRulingId(value: unknown): value is RequestRulingId {
    return typeof value === 'string' && (RULING_IDS as readonly string[]).includes(value);
}

export function isValidQuestKind(value: unknown): value is QuestKind {
    return typeof value === 'string' && (QUEST_KINDS as readonly string[]).includes(value);
}

function toRequest(def: GuildRequestDef): GuildRequest {
    return {
        id: def.id,
        clientArchetype: def.clientArchetype,
        summary: def.summary,
        questKind: def.questKind,
        baseDifficulty: def.baseDifficulty,
        baseReward: def.baseReward,
        rulings: def.rulings,
    };
}

export function getRequest(id: string): GuildRequest | undefined {
    const def = REQUEST_BY_ID.get(id);
    return def ? toRequest(def) : undefined;
}

/** Exposed for tests — deterministic request weight given guild condition. */
export function computeRequestWeight(requestId: string, guild: GuildState): number {
    const def = REQUEST_BY_ID.get(requestId);
    if (!def) { return 0; }
    let w = def.baseWeight;
    if (def.townFavorMax !== undefined && guild.townFavor <= def.townFavorMax) { w += 8; }
    if (def.renownMin !== undefined && guild.renown < def.renownMin) { return 0; }
    if (def.disciplineMax !== undefined && guild.discipline > def.disciplineMax) { return 0; }
    if (def.safetyMax !== undefined && guild.safety > def.safetyMax) { return 0; }
    if (def.season !== undefined && getGuildSeason(guild.calendarWeek) !== def.season) { return 0; }
    if (def.renownMin !== undefined && guild.renown >= def.renownMin) { w += 5; }
    return w;
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

/** Deterministic weighted selection without replacement. */
export function buildRequestQueue(
    guild: GuildState,
    seed: number,
    size = DEFAULT_BOARD_SIZE
): GuildRequest[] {
    const clampedSize = Math.max(1, Math.min(MAX_GUILD_REQUEST_QUEUE, Math.floor(size)));
    const remaining = REQUEST_DEFS
        .map((def) => ({ id: def.id, w: computeRequestWeight(def.id, guild) }))
        .filter((e) => e.w > 0);
    const chosen: GuildRequestId[] = [];
    let s = hashSeed([seed, guild.calendarWeek, guild.calendarYear, guild.hallLocationId]);

    while (chosen.length < clampedSize && remaining.length > 0) {
        const total = remaining.reduce((sum, e) => sum + e.w, 0);
        s = hashSeed([s, chosen.length]);
        let roll = s % total;
        let idx = 0;
        for (; idx < remaining.length - 1; idx++) {
            if (roll < remaining[idx].w) { break; }
            roll -= remaining[idx].w;
        }
        chosen.push(remaining[idx].id);
        remaining.splice(idx, 1);
    }

    return chosen.map((id) => toRequest(REQUEST_BY_ID.get(id)!));
}

/** Ruling → stat delta. Unknown request/ruling → no-op ({}). */
export function resolveRequestRuling(requestId: string, rulingId: string): GuildStatDelta {
    const def = REQUEST_BY_ID.get(requestId);
    if (!def || !isValidRequestRulingId(rulingId)) { return {}; }
    return { ...def.rulings[rulingId].delta };
}

export function resolveQuestDifficulty(baseDifficulty: number, renown: number): number {
    return clampGuildStat(baseDifficulty - Math.floor(renown / 15));
}

export function resolveQuestReward(baseReward: number, negotiate: boolean): number {
    const raw = negotiate ? Math.floor(baseReward * NEGOTIATE_REWARD_DISCOUNT) : baseReward;
    return Math.max(0, Math.min(GUILD_RESOURCE_MAX, raw));
}

export function formatRequestChronicleText(
    requestId: string,
    rulingId: string,
    calendarWeek: number,
    calendarYear: number
): string {
    const id = isValidGuildRequestId(requestId) ? requestId : 'request';
    const ruling = isValidRequestRulingId(rulingId) ? rulingId : 'ruled';
    return `Year ${calendarYear} W${calendarWeek}: board — ${id} (${ruling})`;
}