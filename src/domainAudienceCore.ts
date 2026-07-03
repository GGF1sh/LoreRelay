// Domain §F7: audience hall — deterministic petition queue + ruling deltas (no vscode/fs).
// Type-only import from domainCore keeps runtime dependency one-directional (domainCore → this).

import type { DomainState, DomainStatDelta, DomainSeason } from './domainCore';

export const MAX_AUDIENCE_QUEUE = 4;
export const DEFAULT_AUDIENCE_SIZE = 3;

export type PetitionId =
    | 'water_dispute'
    | 'tax_relief'
    | 'bandit_bounty'
    | 'land_claim'
    | 'guild_charter'
    | 'conscription_appeal'
    | 'festival_request'
    | 'corruption_report'
    | 'refugee_influx'
    | 'temple_dispute';

export type PetitionRulingId = 'grant' | 'deny' | 'compromise';

export interface PetitionRuling {
    /** Short verb phrase for the option (GM surfaces it; player picks). */
    label: string;
    delta: DomainStatDelta;
}

export interface Petition {
    id: PetitionId;
    /** Generic role — the GM names the actual NPC in narration. */
    petitionerArchetype: string;
    summary: string;
    rulings: Record<PetitionRulingId, PetitionRuling>;
}

interface PetitionDef extends Petition {
    baseWeight: number;
    publicOrderMax?: number;
    popularSupportMax?: number;
    commerceMin?: number;
    cultureMax?: number;
    /** Higher weight when treasury is at or below this (resource scale). */
    treasuryMax?: number;
    /** Seasonal affinity (weight boost). */
    season?: DomainSeason;
}

const PETITION_DEFS: readonly PetitionDef[] = [
    {
        id: 'water_dispute',
        petitionerArchetype: 'village elder',
        summary: 'Two hamlets quarrel over the mill-race water rights.',
        baseWeight: 8,
        rulings: {
            grant: { label: 'favor the upstream village', delta: { publicOrder: -2, popularSupport: 1 } },
            deny: { label: 'refuse to intervene', delta: { popularSupport: -3 } },
            compromise: { label: 'fund a shared sluice', delta: { treasury: -20, publicOrder: 2, popularSupport: 1 } },
        },
    },
    {
        id: 'tax_relief',
        petitionerArchetype: 'merchant guild representative',
        summary: 'Merchants plead for lighter market tolls this season.',
        baseWeight: 7,
        commerceMin: 40,
        rulings: {
            grant: { label: 'lower the tolls', delta: { treasury: -30, commerce: 2, popularSupport: 2 } },
            deny: { label: 'hold the tolls firm', delta: { treasury: 10, commerce: -1, popularSupport: -3 } },
            compromise: { label: 'a temporary reduction', delta: { treasury: -10, commerce: 1, popularSupport: 1 } },
        },
    },
    {
        id: 'bandit_bounty',
        petitionerArchetype: 'road warden',
        summary: 'Roadside villagers beg the lord to fund a bounty on the bandits.',
        baseWeight: 6,
        publicOrderMax: 50,
        rulings: {
            grant: { label: 'post the bounty', delta: { treasury: -25, publicOrder: 4 } },
            deny: { label: 'leave it to the militia', delta: { publicOrder: -3, popularSupport: -2 } },
            compromise: { label: 'a modest reward', delta: { treasury: -10, publicOrder: 2 } },
        },
    },
    {
        id: 'land_claim',
        petitionerArchetype: 'minor noble',
        summary: 'A minor noble presses a claim to disputed border fields.',
        baseWeight: 5,
        rulings: {
            grant: { label: 'uphold the noble claim', delta: { prestige: 2, popularSupport: -2 } },
            deny: { label: 'rule for the commoners', delta: { prestige: -2, popularSupport: 2 } },
            compromise: { label: 'partition the land', delta: { treasury: -15, prestige: 1 } },
        },
    },
    {
        id: 'guild_charter',
        petitionerArchetype: 'artisan spokesman',
        summary: 'Town artisans petition for a formal guild charter.',
        baseWeight: 6,
        commerceMin: 40,
        rulings: {
            grant: { label: 'grant the charter', delta: { treasury: -15, commerce: 3, culture: 1 } },
            deny: { label: 'withhold the charter', delta: { commerce: -1, popularSupport: -1 } },
            compromise: { label: 'a provisional charter', delta: { treasury: -5, commerce: 1 } },
        },
    },
    {
        id: 'conscription_appeal',
        petitionerArchetype: 'grieving mother',
        summary: 'A family begs exemption from the coming levy.',
        baseWeight: 5,
        rulings: {
            grant: { label: 'grant the exemption', delta: { troops: -5, popularSupport: 3 } },
            deny: { label: 'enforce the levy', delta: { troops: 5, popularSupport: -3 } },
            compromise: { label: 'assign lighter service', delta: { popularSupport: 1 } },
        },
    },
    {
        id: 'festival_request',
        petitionerArchetype: 'town crier',
        summary: 'The town asks leave to hold a seasonal festival.',
        baseWeight: 5,
        season: 'autumn',
        rulings: {
            grant: { label: 'sponsor the festival', delta: { treasury: -25, food: -10, popularSupport: 3, culture: 1 } },
            deny: { label: 'refuse the request', delta: { popularSupport: -2 } },
            compromise: { label: 'a modest gathering', delta: { treasury: -10, popularSupport: 1 } },
        },
    },
    {
        id: 'corruption_report',
        petitionerArchetype: 'honest clerk',
        summary: 'A clerk accuses a tax official of skimming the levies.',
        baseWeight: 5,
        publicOrderMax: 55,
        rulings: {
            grant: { label: 'investigate and punish', delta: { treasury: 15, publicOrder: 2, prestige: 1 } },
            deny: { label: 'dismiss the accusation', delta: { publicOrder: -3, popularSupport: -2 } },
            compromise: { label: 'a quiet reprimand', delta: { publicOrder: 1 } },
        },
    },
    {
        id: 'refugee_influx',
        petitionerArchetype: 'refugee leader',
        summary: 'Refugees from a troubled neighbor seek shelter within the walls.',
        baseWeight: 4,
        rulings: {
            grant: { label: 'admit the refugees', delta: { food: -20, popularSupport: 2, commerce: 1 } },
            deny: { label: 'turn them away', delta: { popularSupport: -3, prestige: -1 } },
            compromise: { label: 'grant limited aid', delta: { food: -10, treasury: -10, popularSupport: 1 } },
        },
    },
    {
        id: 'temple_dispute',
        petitionerArchetype: 'high priest',
        summary: 'The clergy demand renewed patronage for the temple.',
        baseWeight: 5,
        cultureMax: 40,
        rulings: {
            grant: { label: 'fund the temple', delta: { treasury: -20, culture: 3, popularSupport: 1 } },
            deny: { label: 'decline their demand', delta: { culture: -2, popularSupport: -2 } },
            compromise: { label: 'a token endowment', delta: { treasury: -10, culture: 1 } },
        },
    },
];

const PETITION_BY_ID = new Map<string, PetitionDef>(PETITION_DEFS.map((d) => [d.id, d]));
const RULING_IDS: readonly PetitionRulingId[] = ['grant', 'deny', 'compromise'];

export function isValidPetitionId(value: unknown): value is PetitionId {
    return typeof value === 'string' && PETITION_BY_ID.has(value);
}

export function isValidPetitionRulingId(value: unknown): value is PetitionRulingId {
    return typeof value === 'string' && (RULING_IDS as readonly string[]).includes(value);
}

function toPetition(def: PetitionDef): Petition {
    return {
        id: def.id,
        petitionerArchetype: def.petitionerArchetype,
        summary: def.summary,
        rulings: def.rulings,
    };
}

export function getPetition(id: string): Petition | undefined {
    const def = PETITION_BY_ID.get(id);
    return def ? toPetition(def) : undefined;
}

function seasonOf(calendarMonth: number): DomainSeason {
    const m = ((Math.floor(calendarMonth) - 1) % 12) + 1;
    if (m >= 3 && m <= 5) { return 'spring'; }
    if (m >= 6 && m <= 8) { return 'summer'; }
    if (m >= 9 && m <= 11) { return 'autumn'; }
    return 'winter';
}

/** Exposed for tests — deterministic petition weight given domain condition. */
export function computePetitionWeight(petitionId: string, domain: DomainState): number {
    const def = PETITION_BY_ID.get(petitionId);
    if (!def) { return 0; }
    let w = def.baseWeight;
    if (def.publicOrderMax !== undefined && domain.publicOrder <= def.publicOrderMax) { w += 8; }
    if (def.popularSupportMax !== undefined && domain.popularSupport <= def.popularSupportMax) { w += 8; }
    if (def.commerceMin !== undefined && domain.commerce >= def.commerceMin) { w += 5; }
    if (def.cultureMax !== undefined && domain.culture <= def.cultureMax) { w += 6; }
    if (def.treasuryMax !== undefined && domain.treasury <= def.treasuryMax) { w += 6; }
    if (def.season !== undefined && seasonOf(domain.calendarMonth) === def.season) { w += 6; }
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
export function buildAudienceQueue(
    domain: DomainState,
    seed: number,
    size = DEFAULT_AUDIENCE_SIZE
): Petition[] {
    const clampedSize = Math.max(1, Math.min(MAX_AUDIENCE_QUEUE, Math.floor(size)));
    const remaining = PETITION_DEFS
        .map((def) => ({ id: def.id, w: computePetitionWeight(def.id, domain) }))
        .filter((e) => e.w > 0);
    const chosen: PetitionId[] = [];
    let s = hashSeed([seed, domain.calendarMonth, domain.calendarYear, domain.controlledRegionId]);

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

    return chosen.map((id) => toPetition(PETITION_BY_ID.get(id)!));
}

/** Ruling → stat delta. Unknown petition/ruling → no-op ({}). */
export function resolvePetitionRuling(petitionId: string, rulingId: string): DomainStatDelta {
    const def = PETITION_BY_ID.get(petitionId);
    if (!def || !isValidPetitionRulingId(rulingId)) { return {}; }
    return { ...def.rulings[rulingId].delta };
}

export const DOMAIN_AUDIENCE_OPS_PROMPT_LINE =
    'Rule each petitioner via turn_result.domainOps: '
    + '{ kind: "audience_ruling", petitionId: "<id>", rulingId: "grant"|"deny"|"compromise" }. '
    + 'Core applies the stat change; narrate the petitioner and your judgment only.';

export function buildAudiencePromptLines(petitionIds: readonly string[]): string[] {
    const petitions = petitionIds
        .map((id) => PETITION_BY_ID.get(id))
        .filter((d): d is PetitionDef => Boolean(d))
        .slice(0, MAX_AUDIENCE_QUEUE);
    if (petitions.length === 0) { return []; }

    const lines: string[] = [
        '[Domain — Audience]',
        'Petitioners await your judgment this audience day.',
    ];
    for (const def of petitions) {
        const opts = RULING_IDS
            .map((rid) => `${rid}: ${def.rulings[rid].label}`)
            .join(' / ');
        lines.push(`- ${def.id} (${def.petitionerArchetype}): ${def.summary} Options — ${opts}.`);
    }
    lines.push(DOMAIN_AUDIENCE_OPS_PROMPT_LINE);
    lines.push('Play each petitioner in character; do not invent treasury or troop numbers.');
    return lines;
}

export function formatAudienceChronicleText(
    petitionId: string,
    rulingId: string,
    calendarMonth: number,
    calendarYear: number
): string {
    const season = seasonOf(calendarMonth);
    const id = isValidPetitionId(petitionId) ? petitionId : 'petition';
    const ruling = isValidPetitionRulingId(rulingId) ? rulingId : 'ruled';
    return `Year ${calendarYear} ${season}: audience — ${id} ruled (${ruling})`;
}
