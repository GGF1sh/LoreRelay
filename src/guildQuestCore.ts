// Guild G3: party dispatch + deterministic quest resolution (Bond + difficulty; no vscode/fs).

import type { GuildQuest, GuildStatDelta, GuildState } from './guildCore';
import { sanitizeGuildPromptLabel } from './guildCore';
import { isValidGuildRequestId } from './guildRequestCore';
import { PLAYER_TRUST_RIVAL_MAX } from './domainOfficerBondCore';
import type { QuestKind } from './guildRequestCore';

export const MIN_QUEST_WEEKS = 1;
export const MAX_QUEST_WEEKS = 3;
export const DEFAULT_QUEST_WEEKS = 1;
export const MAX_PARTY_SIZE = 3;
export const DEFAULT_ADVENTURER_SKILL = 50;
export const DEFAULT_ADVENTURER_BOND = 50;

export type QuestGrade = 'triumph' | 'success' | 'setback' | 'disaster';

export interface QuestOutcome {
    grade: QuestGrade;
    deltas: GuildStatDelta;
    reportLine: string;
    embezzled?: boolean;
}

const QUEST_GRADES: readonly QuestGrade[] = ['triumph', 'success', 'setback', 'disaster'];

export function isValidQuestGrade(value: unknown): value is QuestGrade {
    return typeof value === 'string' && (QUEST_GRADES as readonly string[]).includes(value);
}

export function clampQuestWeeks(value: unknown): number {
    if (typeof value !== 'number' || !Number.isFinite(value)) { return DEFAULT_QUEST_WEEKS; }
    return Math.max(MIN_QUEST_WEEKS, Math.min(MAX_QUEST_WEEKS, Math.floor(value)));
}

function safeLabel(id: string): string {
    const cleaned = id.replace(/[\r\n\t\x00-\x1f]/g, ' ').slice(0, 64);
    return cleaned || 'adventurer';
}

function readSkill(value: number | undefined): number {
    return typeof value === 'number' && Number.isFinite(value)
        ? Math.max(0, Math.min(100, Math.floor(value)))
        : DEFAULT_ADVENTURER_SKILL;
}

function readBond(value: number | undefined): number {
    return typeof value === 'number' && Number.isFinite(value)
        ? Math.max(0, Math.min(100, Math.floor(value)))
        : DEFAULT_ADVENTURER_BOND;
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

/** Exposed for tests — deterministic grade weights from party skill, avg bond, and difficulty. */
export function computeQuestGradeWeights(
    partySkill: number,
    avgBond: number,
    difficulty: number
): Record<QuestGrade, number> {
    const skill = Math.max(0, Math.min(100, Math.floor(partySkill)));
    const bond = Math.max(0, Math.min(100, Math.floor(avgBond)));
    const diff = Math.max(0, Math.min(100, Math.floor(difficulty)));
    const lowTrust = bond <= PLAYER_TRUST_RIVAL_MAX;
    const edge = skill - diff;

    let triumph = Math.max(2, Math.floor(skill / 5));
    let success = 45;
    let setback = 25;
    let disaster = lowTrust ? 25 : 8;

    if (edge >= 15) {
        triumph += 12;
        setback = Math.max(5, setback - 8);
    } else if (edge >= 5) {
        triumph += 6;
        setback = Math.max(10, setback - 4);
    } else if (edge <= -15) {
        disaster += 15;
        triumph = Math.max(1, triumph - 8);
    } else if (edge <= -5) {
        disaster += 8;
        setback += 6;
        triumph = Math.max(1, triumph - 4);
    }

    if (lowTrust) {
        triumph = Math.max(1, Math.floor(triumph / 2));
        success = Math.max(10, success - 15);
    }

    return { triumph, success, setback, disaster };
}

const REPORT_TEMPLATES: Record<QuestKind, Record<QuestGrade, string>> = {
    hunt: {
        triumph: 'returned from the hunt in triumph, trophies and coin in hand',
        success: 'completed the hunt and claimed the bounty',
        setback: 'returned from the hunt battered, with only half the expected take',
        disaster: "'s party was routed — the hunt ended in disaster",
    },
    escort: {
        triumph: 'escorted the caravan flawlessly and earned a hero\'s fee',
        success: 'delivered the escort contract without serious incident',
        setback: 'returned from the escort run having lost goods and reputation',
        disaster: "'s escort was ambushed — the contract ended in disaster",
    },
    recover: {
        triumph: 'recovered the prize and returned to acclaim',
        success: 'completed the recovery job as contracted',
        setback: 'returned empty-handed after a costly search',
        disaster: "'s recovery party vanished into the wild — disaster",
    },
    investigate: {
        triumph: 'uncovered secrets beyond the contract and returned in triumph',
        success: 'finished the investigation with useful findings',
        setback: 'returned from the investigation with more questions than answers',
        disaster: "'s investigators were lost — the job ended in disaster",
    },
    clear: {
        triumph: 'cleared the threat decisively and returned to cheers',
        success: 'completed the clearing job as promised',
        setback: 'returned from the clearing run bloodied and short on pay',
        disaster: "'s party was broken — the clearing ended in disaster",
    },
};

function buildQuestOutcomeDeltas(
    grade: QuestGrade,
    rewardCoffers: number,
    hasLowTrustMember: boolean
): GuildStatDelta {
    const reward = Math.max(0, Math.floor(rewardCoffers));
    switch (grade) {
        case 'triumph':
            return {
                coffers: Math.floor(reward * 1.5),
                renown: 3,
                townFavor: 2,
            };
        case 'success':
            return { coffers: reward, renown: 1 };
        case 'setback':
            return {
                coffers: Math.floor(reward / 2),
                supplies: -15,
            };
        case 'disaster': {
            const delta: GuildStatDelta = { renown: -2, townFavor: -3 };
            if (hasLowTrustMember) {
                delta.coffers = -Math.max(20, Math.floor(reward * 0.5));
            }
            return delta;
        }
        default:
            return {};
    }
}

function partyStats(
    partyNpcIds: readonly string[],
    skillMap: Record<string, number>,
    bondMap: Record<string, number>
): { partySkill: number; avgBond: number; hasLowTrustMember: boolean } {
    if (partyNpcIds.length === 0) {
        return { partySkill: DEFAULT_ADVENTURER_SKILL, avgBond: DEFAULT_ADVENTURER_BOND, hasLowTrustMember: false };
    }
    let skillSum = 0;
    let bondSum = 0;
    let lowTrust = false;
    for (const id of partyNpcIds) {
        const skill = readSkill(skillMap[id]);
        const bond = readBond(bondMap[id]);
        skillSum += skill;
        bondSum += bond;
        if (bond <= PLAYER_TRUST_RIVAL_MAX) { lowTrust = true; }
    }
    return {
        partySkill: Math.floor(skillSum / partyNpcIds.length),
        avgBond: Math.floor(bondSum / partyNpcIds.length),
        hasLowTrustMember: lowTrust,
    };
}

/** Deterministic quest resolution: same quest/party/skill/bond/seed → same grade, always. */
export function resolveQuestOutcome(
    quest: GuildQuest,
    skillMap: Record<string, number>,
    bondMap: Record<string, number>,
    seed: number
): QuestOutcome {
    const partyNpcIds = quest.partyNpcIds ?? [];
    const { partySkill, avgBond, hasLowTrustMember } = partyStats(partyNpcIds, skillMap, bondMap);
    const weights = computeQuestGradeWeights(partySkill, avgBond, quest.difficulty);
    const total = QUEST_GRADES.reduce((sum, g) => sum + weights[g], 0);
    const roll = hashSeed([
        seed,
        quest.id,
        partyNpcIds.join(','),
        partySkill,
        avgBond,
    ]) % total;

    let acc = 0;
    let grade: QuestGrade = 'setback';
    for (const g of QUEST_GRADES) {
        if (roll < acc + weights[g]) { grade = g; break; }
        acc += weights[g];
    }

    const embezzled = grade === 'disaster' && hasLowTrustMember;
    const deltas = buildQuestOutcomeDeltas(grade, quest.rewardCoffers, hasLowTrustMember);
    const labels = partyNpcIds.map(safeLabel).join(', ') || 'the party';
    const bodyTemplate = REPORT_TEMPLATES[quest.questKind][grade];
    const joiner = bodyTemplate.startsWith("'") ? '' : ' ';
    let reportLine = `${labels}${joiner}${bodyTemplate}.`;
    if (embezzled) {
        reportLine += ' A rogue adventurer embezzled guild funds on the way back.';
    }

    return { grade, deltas, reportLine, embezzled };
}

export function isQuestDue(quest: GuildQuest): boolean {
    return quest.status === 'active' && (quest.weeksRemaining ?? 0) <= 0;
}

export function tickQuestWeek(quest: GuildQuest): GuildQuest {
    if (quest.status !== 'active') { return quest; }
    const remaining = typeof quest.weeksRemaining === 'number' ? quest.weeksRemaining : DEFAULT_QUEST_WEEKS;
    return { ...quest, weeksRemaining: Math.max(0, remaining - 1) };
}

export function countActiveQuests(quests: readonly GuildQuest[]): number {
    return quests.filter((q) => q.status === 'active').length;
}

export function adventurersOnActiveQuests(quests: readonly GuildQuest[]): Set<string> {
    const busy = new Set<string>();
    for (const q of quests) {
        if (q.status !== 'active') { continue; }
        for (const id of q.partyNpcIds ?? []) {
            busy.add(id);
        }
    }
    return busy;
}

/** Assign an accepted quest party. No-op when guards fail (BRIEF §6.1). */
export function assignParty(
    guild: GuildState,
    questId: string,
    npcIds: readonly string[],
    maxActiveQuests: number,
    weeks?: number
): GuildState {
    const quests = guild.quests ?? [];
    const quest = quests.find((q) => q.id === questId || q.requestId === questId);
    if (!quest || quest.status !== 'accepted') { return guild; }

    const party = [...new Set(
        npcIds
            .map((id) => (typeof id === 'string' ? id.trim() : ''))
            .filter((id) => id.length > 0)
    )].slice(0, MAX_PARTY_SIZE);
    if (party.length === 0 || party.length > MAX_PARTY_SIZE) { return guild; }

    const rosterIds = new Set(guild.adventurers.map((a) => a.npcId));
    if (!party.every((id) => rosterIds.has(id))) { return guild; }

    const activeCount = countActiveQuests(quests);
    if (activeCount >= maxActiveQuests) { return guild; }

    const busy = adventurersOnActiveQuests(quests);
    if (party.some((id) => busy.has(id))) { return guild; }

    const updated: GuildQuest = {
        ...quest,
        status: 'active',
        partyNpcIds: [...party],
        weeksRemaining: clampQuestWeeks(weeks ?? DEFAULT_QUEST_WEEKS),
    };

    const nextQuests = quests.map((q) => (q.id === quest.id ? updated : q));
    return { ...guild, quests: nextQuests };
}

export interface QuestAdvanceResult {
    quests?: GuildQuest[];
    lastQuestReports?: string[];
    outcomeDeltas: GuildStatDelta[];
    reports: string[];
}

/** Tick active quests one week; resolve due quests (caller applies deltas via applyDelta). */
export function advanceActiveQuests(
    guild: GuildState,
    skillMap: Record<string, number>,
    bondMap: Record<string, number>,
    seed: number
): QuestAdvanceResult {
    const quests = guild.quests ?? [];
    if (quests.length === 0) {
        return { outcomeDeltas: [], reports: [] };
    }

    const ticked = quests.map((q) => (q.status === 'active' ? tickQuestWeek(q) : q));
    const due = ticked.filter(isQuestDue);
    const stillRunning = ticked.filter((q) => !isQuestDue(q));
    const outcomeDeltas: GuildStatDelta[] = [];
    const reports: string[] = [];

    for (const quest of due) {
        const outcome = resolveQuestOutcome(quest, skillMap, bondMap, seed);
        outcomeDeltas.push(outcome.deltas);
        reports.push(outcome.reportLine);
    }

    return {
        quests: stillRunning.length > 0 ? stillRunning : undefined,
        lastQuestReports: reports.length > 0 ? reports : undefined,
        outcomeDeltas,
        reports,
    };
}

export const GUILD_QUEST_OPS_PROMPT_LINE =
    'To dispatch adventurers on an accepted quest, set turn_result.guildOps: '
    + '{ kind: "assign_party", quest: { questId: "<id>", npcIds: ["<npc>", ...], weeks?: 1-3 } }. '
    + 'Dispatched parties are away until weeksRemaining reaches 0; Core resolves outcomes on return. '
    + 'Narrate only what Core reports — do not invent coffers, renown, or quest grades early.';

export function buildActiveQuestPromptLine(quests: readonly GuildQuest[]): string | undefined {
    const active = quests.filter((q) => q.status === 'active');
    if (active.length === 0) { return undefined; }
    const parts = active.map((q) => {
        const party = (q.partyNpcIds ?? []).map(safeLabel).join('+') || 'party';
        const weeks = q.weeksRemaining ?? DEFAULT_QUEST_WEEKS;
        const questId = isValidGuildRequestId(q.id)
            ? q.id
            : sanitizeGuildPromptLabel(q.id, 'quest');
        return `${questId} (${q.questKind}, ${party}, ${weeks}w left)`;
    });
    return `[Guild — Quests] Away: ${parts.join(', ')}.`;
}