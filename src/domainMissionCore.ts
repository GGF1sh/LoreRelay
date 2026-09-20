// Domain §F9: officer missions — dispatch, deterministic resolution, report lines (no vscode/fs).
// Type-only import from domainCore keeps runtime dependency one-directional (domainCore → this).

import type { DomainState, DomainStatDelta } from './domainCore';
import { PLAYER_TRUST_RIVAL_MAX } from './domainOfficerBondCore';

export const MAX_ACTIVE_MISSIONS = 3;
export const DEFAULT_MAX_ACTIVE_MISSIONS = 2;
export const MIN_MISSION_MONTHS = 1;
export const MAX_MISSION_MONTHS = 3;
export const DEFAULT_MISSION_MONTHS = 1;
export const DEFAULT_OFFICER_SKILL = 50;
export const DEFAULT_OFFICER_TRUST = 50;

export type MissionKind = 'espionage' | 'trade_run' | 'survey' | 'parley';
export type MissionGrade = 'triumph' | 'success' | 'setback' | 'disaster';

export interface OfficerMission {
    officerNpcId: string;
    kind: MissionKind;
    targetId?: string;
    /** Decremented by 1 each monthly_commit; resolved when it reaches 0. */
    monthsRemaining: number;
}

export interface MissionOutcome {
    grade: MissionGrade;
    deltas: DomainStatDelta;
    reportLine: string;
}

const MISSION_KINDS: readonly MissionKind[] = ['espionage', 'trade_run', 'survey', 'parley'];
const MISSION_GRADES: readonly MissionGrade[] = ['triumph', 'success', 'setback', 'disaster'];
const TARGET_ID_PATTERN = /^[a-zA-Z0-9_-]{1,64}$/;

export function isValidMissionKind(value: unknown): value is MissionKind {
    return typeof value === 'string' && (MISSION_KINDS as readonly string[]).includes(value);
}

export function isValidMissionGrade(value: unknown): value is MissionGrade {
    return typeof value === 'string' && (MISSION_GRADES as readonly string[]).includes(value);
}

export function clampMissionMonths(value: unknown): number {
    if (typeof value !== 'number' || !Number.isFinite(value)) { return DEFAULT_MISSION_MONTHS; }
    return Math.max(MIN_MISSION_MONTHS, Math.min(MAX_MISSION_MONTHS, Math.floor(value)));
}

function safeLabel(id: string): string {
    const cleaned = id.replace(/[\r\n\t\x00-\x1f]/g, ' ').slice(0, 64);
    return cleaned || 'officer';
}

export function sanitizeMissionTargetId(value: unknown): string | undefined {
    if (typeof value !== 'string') { return undefined; }
    const trimmed = value.trim();
    return TARGET_ID_PATTERN.test(trimmed) ? trimmed : undefined;
}

/** Constructs a mission after the caller (domainCore) has confirmed the officer exists and is free. */
export function createOfficerMission(
    officerNpcId: string,
    kind: unknown,
    months?: unknown,
    targetId?: unknown
): OfficerMission | undefined {
    if (!isValidMissionKind(kind)) { return undefined; }
    const id = safeLabel(officerNpcId);
    if (!id || id === 'officer') { return undefined; }
    return {
        officerNpcId: id,
        kind,
        targetId: sanitizeMissionTargetId(targetId),
        monthsRemaining: clampMissionMonths(months ?? DEFAULT_MISSION_MONTHS),
    };
}

export function parseOfficerMission(raw: unknown): OfficerMission | undefined {
    if (!raw || typeof raw !== 'object') { return undefined; }
    const doc = raw as Record<string, unknown>;
    const officerNpcId = typeof doc.officerNpcId === 'string' ? safeLabel(doc.officerNpcId.trim()) : '';
    if (!officerNpcId || officerNpcId === 'officer' || !isValidMissionKind(doc.kind)) { return undefined; }
    const monthsRemaining = typeof doc.monthsRemaining === 'number' && Number.isFinite(doc.monthsRemaining)
        ? Math.max(0, Math.min(MAX_MISSION_MONTHS, Math.floor(doc.monthsRemaining)))
        : DEFAULT_MISSION_MONTHS;
    return {
        officerNpcId,
        kind: doc.kind,
        targetId: sanitizeMissionTargetId(doc.targetId),
        monthsRemaining,
    };
}

export function isMissionDue(mission: OfficerMission): boolean {
    return mission.monthsRemaining <= 0;
}

/** One month passes for a mission in flight. */
export function tickMissionMonth(mission: OfficerMission): OfficerMission {
    return { ...mission, monthsRemaining: Math.max(0, mission.monthsRemaining - 1) };
}

const MISSION_OUTCOME_DELTAS: Record<MissionKind, Record<MissionGrade, DomainStatDelta>> = {
    espionage: {
        triumph: { prestige: 3, treasury: 10 },
        success: { prestige: 1 },
        setback: { treasury: -10 },
        disaster: { publicOrder: -5, treasury: -20, prestige: -2 },
    },
    trade_run: {
        triumph: { treasury: 50, commerce: 2 },
        success: { treasury: 20 },
        setback: { treasury: -15 },
        disaster: { treasury: -40, commerce: -2 },
    },
    survey: {
        triumph: { prestige: 2, defense: 1 },
        success: { prestige: 1 },
        setback: { troops: -5 },
        disaster: { troops: -15, popularSupport: -2 },
    },
    parley: {
        triumph: { prestige: 3, publicOrder: 2 },
        success: { prestige: 1 },
        setback: { popularSupport: -2 },
        disaster: { popularSupport: -5, prestige: -3 },
    },
};

const REPORT_TEMPLATES: Record<MissionKind, Record<MissionGrade, string>> = {
    espionage: {
        triumph: 'returned from espionage with priceless intelligence',
        success: 'returned from espionage with useful rumors',
        setback: 'returned from espionage empty-handed, coin spent for nothing',
        disaster: 'was caught spying — the mission ended in disaster',
    },
    trade_run: {
        triumph: 'closed an exceptional trade run, coffers overflowing',
        success: 'completed the trade run with modest profit',
        setback: 'returned from the trade run at a loss',
        disaster: "'s caravan was raided — the trade run ended in disaster",
    },
    survey: {
        triumph: 'charted valuable ground and returned in triumph',
        success: 'completed the survey without incident',
        setback: 'returned from the survey having lost some hands to the wild',
        disaster: "'s survey party was scattered — disaster in the field",
    },
    parley: {
        triumph: 'secured a favorable parley beyond all expectations',
        success: 'completed the parley amicably',
        setback: 'returned from the parley having conceded more than hoped',
        disaster: "'s parley collapsed into insult and disaster",
    },
};

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

/** Exposed for tests — deterministic grade weights from officer skill + player trust. */
export function computeMissionGradeWeights(skill: number, trust: number): Record<MissionGrade, number> {
    const competence = Math.max(0, Math.min(100, skill));
    const lowTrust = trust <= PLAYER_TRUST_RIVAL_MAX;

    let triumph = Math.max(2, Math.floor(competence / 5));
    let success = 45;
    let setback = 25;
    let disaster = lowTrust ? 25 : 8;

    if (lowTrust) {
        triumph = Math.max(1, Math.floor(triumph / 2));
        success = Math.max(10, success - 15);
    }

    return { triumph, success, setback, disaster };
}

/** Deterministic mission resolution: same officer/kind/skill/trust/seed → same grade, always. */
export function resolveMissionOutcome(
    mission: OfficerMission,
    officerSkill: number,
    officerTrust: number,
    seed: number
): MissionOutcome {
    const weights = computeMissionGradeWeights(officerSkill, officerTrust);
    const total = MISSION_GRADES.reduce((sum, g) => sum + weights[g], 0);
    const roll = hashSeed([seed, mission.officerNpcId, mission.kind, officerSkill, officerTrust]) % total;

    let acc = 0;
    let grade: MissionGrade = 'setback';
    for (const g of MISSION_GRADES) {
        if (roll < acc + weights[g]) { grade = g; break; }
        acc += weights[g];
    }

    const deltas = MISSION_OUTCOME_DELTAS[mission.kind][grade];
    const label = safeLabel(mission.officerNpcId);
    const bodyTemplate = REPORT_TEMPLATES[mission.kind][grade];
    const joiner = bodyTemplate.startsWith("'") ? '' : ' ';
    const reportLine = `${label}${joiner}${bodyTemplate}.`;

    return { grade, deltas: { ...deltas }, reportLine };
}

export const DOMAIN_MISSION_OPS_PROMPT_LINE =
    'To dispatch an appointed officer on a mission, set turn_result.domainOps: '
    + '{ kind: "dispatch_officer", mission: { npcId: "<officer>", kind: "espionage"|"trade_run"|"survey"|"parley", '
    + 'targetId?: "<region/faction/location>", months?: 1-3 } }. '
    + 'Dispatched officers are absent from council and steward drift until they return. '
    + 'Core resolves the outcome on return and narrates only what Core reports — do not invent results early.';

export function buildActiveMissionPromptLine(missions: readonly OfficerMission[]): string | undefined {
    if (missions.length === 0) { return undefined; }
    const parts = missions.map((m) => `${safeLabel(m.officerNpcId)} (${m.kind}, ${m.monthsRemaining}mo left)`);
    return `[Domain — Missions] Away: ${parts.join(', ')}.`;
}
