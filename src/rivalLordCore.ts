// Domain §F8: rival lord — 3-variable neighbor, monthly deterministic tick (no vscode/fs).
// Type-only import from domainCore keeps runtime dependency one-directional (domainCore → this).

import type { DomainState, DomainStatDelta } from './domainCore';

export const MAX_RIVAL_COUNT = 2;
export const DEFAULT_RIVAL_STAT = 50;

export type RivalStance = 'friendly' | 'neutral' | 'wary' | 'hostile';
export type RivalActionId = 'build' | 'trade' | 'raid_prep' | 'envoy' | 'raid';

export interface RivalLordState {
    regionId: string;
    factionId?: string;
    /** True values — never sent to GM directly. Only `disclosed*` fields are prompt-safe. */
    strength: number;
    aggression: number;
    stance: RivalStance;
    /** Set by `raid_prep`, consumed by the next `raid` roll (or reset if the roll passes). */
    raidPending?: boolean;
    lastAction?: RivalActionId;
    /** FoW-style disclosure gate: only set after espionage / gather_rumors / diplomacy contact. */
    disclosedStrength?: number;
    disclosedStance?: RivalStance;
    disclosedAsOfMonth?: number;
    disclosedAsOfYear?: number;
}

export interface RivalTickResult {
    rival: RivalLordState;
    action: RivalActionId;
    /** Only set when action === 'raid': damage already applied to the player's domain. */
    playerDelta?: DomainStatDelta;
}

const RIVAL_STANCES: readonly RivalStance[] = ['friendly', 'neutral', 'wary', 'hostile'];
const RIVAL_ACTIONS: readonly RivalActionId[] = ['build', 'trade', 'raid_prep', 'envoy', 'raid'];
const STANCE_ORDER: readonly RivalStance[] = ['friendly', 'neutral', 'wary', 'hostile'];

export function isValidRivalStance(value: unknown): value is RivalStance {
    return typeof value === 'string' && (RIVAL_STANCES as readonly string[]).includes(value);
}

export function isValidRivalActionId(value: unknown): value is RivalActionId {
    return typeof value === 'string' && (RIVAL_ACTIONS as readonly string[]).includes(value);
}

export function clampRivalStat(value: unknown): number {
    if (typeof value !== 'number' || !Number.isFinite(value)) { return 0; }
    return Math.max(0, Math.min(100, Math.floor(value)));
}

function stanceIndex(stance: RivalStance): number {
    return STANCE_ORDER.indexOf(stance);
}

function stanceStepFriendlier(stance: RivalStance): RivalStance {
    const idx = stanceIndex(stance);
    return STANCE_ORDER[Math.max(0, idx - 1)];
}

function stanceStepHostile(stance: RivalStance): RivalStance {
    const idx = stanceIndex(stance);
    return STANCE_ORDER[Math.min(STANCE_ORDER.length - 1, idx + 1)];
}

/** Deterministic derivation from Forge region danger — no randomness. */
export function deriveRivalLord(
    regionId: string,
    options: { dangerLevel?: number; factionId?: string } = {}
): RivalLordState {
    const danger = typeof options.dangerLevel === 'number' && Number.isFinite(options.dangerLevel)
        ? Math.max(0, Math.min(10, options.dangerLevel))
        : 5;
    return {
        regionId,
        factionId: options.factionId,
        strength: DEFAULT_RIVAL_STAT,
        aggression: clampRivalStat(20 + danger * 8),
        stance: 'neutral',
    };
}

export function validateRivalLord(raw: unknown): RivalLordState | undefined {
    if (!raw || typeof raw !== 'object') { return undefined; }
    const doc = raw as Record<string, unknown>;
    const regionId = typeof doc.regionId === 'string' ? doc.regionId.trim() : '';
    if (!regionId) { return undefined; }

    const rival: RivalLordState = {
        regionId,
        strength: clampRivalStat(doc.strength),
        aggression: clampRivalStat(doc.aggression),
        stance: isValidRivalStance(doc.stance) ? doc.stance : 'neutral',
    };
    if (typeof doc.factionId === 'string' && doc.factionId.trim()) {
        rival.factionId = doc.factionId.trim();
    }
    if (doc.raidPending === true) {
        rival.raidPending = true;
    }
    if (isValidRivalActionId(doc.lastAction)) {
        rival.lastAction = doc.lastAction;
    }
    if (typeof doc.disclosedStrength === 'number' && Number.isFinite(doc.disclosedStrength)) {
        rival.disclosedStrength = clampRivalStat(doc.disclosedStrength);
    }
    if (isValidRivalStance(doc.disclosedStance)) {
        rival.disclosedStance = doc.disclosedStance;
    }
    if (typeof doc.disclosedAsOfMonth === 'number' && doc.disclosedAsOfMonth >= 1 && doc.disclosedAsOfMonth <= 12) {
        rival.disclosedAsOfMonth = Math.floor(doc.disclosedAsOfMonth);
    }
    if (typeof doc.disclosedAsOfYear === 'number' && doc.disclosedAsOfYear >= 1) {
        rival.disclosedAsOfYear = Math.floor(doc.disclosedAsOfYear);
    }
    return rival;
}

/** Exposed for tests — deterministic weight per candidate rival action this month. */
export function computeRivalActionWeight(actionId: RivalActionId, rival: RivalLordState): number {
    switch (actionId) {
        case 'build':
            return 10;
        case 'trade':
            return rival.stance === 'hostile' ? 2 : 8;
        case 'raid_prep':
            return rival.raidPending ? 0 : Math.max(1, Math.floor(rival.aggression / 6));
        case 'envoy':
            return rival.stance === 'hostile' || rival.stance === 'wary' ? 6 : 3;
        case 'raid':
            return rival.raidPending ? Math.max(10, Math.floor(rival.aggression / 3)) : 0;
        default:
            return 0;
    }
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

/** Deterministic raid resolution: player (troops/3 + defense) vs rival.strength. No dice. */
function resolveRaid(rival: RivalLordState, playerDomain: DomainState): { playerDelta: DomainStatDelta; rivalStrengthDelta: number } {
    const playerPower = Math.floor(playerDomain.troops / 3) + playerDomain.defense;
    const margin = rival.strength - playerPower;
    if (margin > 10) {
        return {
            playerDelta: { troops: -15, publicOrder: -8, treasury: -40 },
            rivalStrengthDelta: -5,
        };
    }
    if (margin > -10) {
        return {
            playerDelta: { troops: -8, publicOrder: -4, treasury: -20 },
            rivalStrengthDelta: -8,
        };
    }
    return {
        playerDelta: { publicOrder: -2 },
        rivalStrengthDelta: -15,
    };
}

/** One rival move per monthly commit — weighted choice among 5 actions, fully deterministic. */
export function tickRivalLord(
    rival: RivalLordState,
    playerDomain: DomainState,
    seed: number
): RivalTickResult {
    const weights = RIVAL_ACTIONS
        .map((id) => ({ id, w: computeRivalActionWeight(id, rival) }))
        .filter((e) => e.w > 0);

    if (weights.length === 0) {
        return { rival: { ...rival, lastAction: 'build' }, action: 'build' };
    }

    const total = weights.reduce((sum, e) => sum + e.w, 0);
    const roll = hashSeed([seed, rival.regionId, rival.strength, rival.aggression, rival.stance]) % total;
    let acc = 0;
    let action: RivalActionId = weights[weights.length - 1].id;
    for (const entry of weights) {
        if (roll < acc + entry.w) { action = entry.id; break; }
        acc += entry.w;
    }

    // raidPending carries over unchanged unless this month's action explicitly sets/clears it.
    let next: RivalLordState = { ...rival, lastAction: action, raidPending: rival.raidPending ?? false };
    let playerDelta: DomainStatDelta | undefined;

    switch (action) {
        case 'build':
            next.strength = clampRivalStat(next.strength + 4);
            break;
        case 'trade':
            next.strength = clampRivalStat(next.strength + 2);
            break;
        case 'raid_prep':
            next.raidPending = true;
            break;
        case 'envoy':
            next.stance = stanceStepFriendlier(next.stance);
            break;
        case 'raid': {
            const outcome = resolveRaid(next, playerDomain);
            next.strength = clampRivalStat(next.strength + outcome.rivalStrengthDelta);
            next.raidPending = false;
            playerDelta = outcome.playerDelta;
            break;
        }
        default:
            break;
    }

    return { rival: next, action, playerDelta };
}

/** Player's `diplomacy` action nudges the rival one stance step friendlier (deterministic). */
export function resolveRivalDiplomacy(rival: RivalLordState, playerPrestige: number, seed: number): RivalLordState {
    const chance = Math.max(20, Math.min(80, 30 + Math.floor(playerPrestige / 2)));
    const roll = hashSeed([seed, rival.regionId, 'diplomacy', playerPrestige]) % 100;
    if (roll >= chance) {
        return rival;
    }
    return { ...rival, stance: stanceStepFriendlier(rival.stance) };
}

/** Player's `espionage` action (or `gather_rumors`) reveals true strength/stance — FoW disclosure gate. */
export function discloseRivalInfo(rival: RivalLordState, calendarMonth: number, calendarYear: number): RivalLordState {
    return {
        ...rival,
        disclosedStrength: rival.strength,
        disclosedStance: rival.stance,
        disclosedAsOfMonth: calendarMonth,
        disclosedAsOfYear: calendarYear,
    };
}

/** Failed diplomacy / provocation escalates stance one step toward hostile (reserved for future hooks). */
export function escalateRivalStance(rival: RivalLordState): RivalLordState {
    return { ...rival, stance: stanceStepHostile(rival.stance) };
}

export const RIVAL_RAID_PREP_FLAG = 'rivalRaidPrep';

const STANCE_LABELS: Record<RivalStance, string> = {
    friendly: 'friendly',
    neutral: 'neutral',
    wary: 'wary',
    hostile: 'hostile',
};

/** Compact GM line — only ever surfaces `disclosed*` fields, never true state (FoW parity). */
export function buildRivalPromptLine(rival: RivalLordState | undefined): string | undefined {
    if (!rival) { return undefined; }
    if (rival.disclosedStrength === undefined || rival.disclosedStance === undefined) {
        return `[Domain — Rival] A neighboring power stirs beyond ${rival.regionId}; send espionage or gather rumors to learn more.`;
    }
    const asOf = rival.disclosedAsOfMonth !== undefined && rival.disclosedAsOfYear !== undefined
        ? ` (as of Y${rival.disclosedAsOfYear} M${rival.disclosedAsOfMonth})`
        : '';
    return `[Domain — Rival] ${rival.regionId}: reported strength ~${rival.disclosedStrength}, stance ${STANCE_LABELS[rival.disclosedStance]}${asOf}. Do not invent different numbers.`;
}

export function formatRivalChronicleText(
    action: RivalActionId,
    regionId: string,
    calendarMonth: number,
    calendarYear: number
): string {
    return `Year ${calendarYear} M${calendarMonth}: neighboring ${regionId} made its move (${action})`;
}
