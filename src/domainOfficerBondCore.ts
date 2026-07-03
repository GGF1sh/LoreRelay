// Domain §9.2 / D5: officers use playerBond + npcLifeEvents — no loyalty field (no vscode/fs).

import type { DomainOfficer, DomainState, OfficerRole } from './domainCore';
import { sanitizeDomainPromptLabel } from './domainCore';
import type { PlayerBondMilestoneMap } from './playerBondCore';
import {
    PLAYER_TRUST_NEMESIS_MAX,
    PLAYER_TRUST_ESTRANGE_MAX,
} from './playerBondCore';

/** playerTrust 0–100 scale: rival-or-below band (不和相当). */
export const PLAYER_TRUST_RIVAL_MAX = 35;

export type OfficerDiscontentReason = 'low_trust' | 'nemesis' | 'estrangement';

export interface OfficerRegistryEntry {
    name?: string;
    playerTrust?: number;
    personalityTraits?: string[];
}

export interface OfficerBondContext {
    registry: Record<string, OfficerRegistryEntry>;
    playerNpcMilestones: PlayerBondMilestoneMap;
}

export interface OfficerBondAssessment {
    discontent: boolean;
    discontentOfficerIds: string[];
    reasons: Array<{ npcId: string; reason: OfficerDiscontentReason }>;
}

function readTrust(raw: number | undefined): number {
    return typeof raw === 'number' && Number.isFinite(raw)
        ? Math.max(0, Math.min(100, Math.floor(raw)))
        : 50;
}

function milestoneReasons(npcId: string, milestones: PlayerBondMilestoneMap): OfficerDiscontentReason[] {
    const reached = new Set(milestones[npcId] ?? []);
    const out: OfficerDiscontentReason[] = [];
    if (reached.has('nemesis')) { out.push('nemesis'); }
    if (reached.has('estrangement')) { out.push('estrangement'); }
    return out;
}

export function assessOfficerBonds(
    officers: readonly DomainOfficer[],
    context: OfficerBondContext
): OfficerBondAssessment {
    const discontentOfficerIds: string[] = [];
    const reasons: OfficerBondAssessment['reasons'] = [];

    for (const officer of officers.slice(0, 5)) {
        const entry = context.registry[officer.npcId];
        const trust = readTrust(entry?.playerTrust);
        const msReasons = milestoneReasons(officer.npcId, context.playerNpcMilestones);

        let flagged = false;
        for (const reason of msReasons) {
            reasons.push({ npcId: officer.npcId, reason });
            flagged = true;
        }
        if (!flagged && trust <= PLAYER_TRUST_RIVAL_MAX) {
            reasons.push({ npcId: officer.npcId, reason: 'low_trust' });
            flagged = true;
        }
        if (flagged && !discontentOfficerIds.includes(officer.npcId)) {
            discontentOfficerIds.push(officer.npcId);
        }
    }

    return {
        discontent: discontentOfficerIds.length > 0,
        discontentOfficerIds,
        reasons,
    };
}

export function syncOfficerDiscontentFlag(
    domain: DomainState,
    assessment: OfficerBondAssessment
): DomainState {
    const flags = { ...domain.flags };
    if (assessment.discontent) {
        flags.officerDiscontent = true;
    } else {
        delete flags.officerDiscontent;
    }
    return { ...domain, flags };
}

export function isOfficerInRegistry(npcId: string, registryIds: ReadonlySet<string> | undefined): boolean {
    if (!registryIds || registryIds.size === 0) { return true; }
    return registryIds.has(npcId);
}

export function registryToOfficerBondContext(
    npcs: Record<string, {
        name?: string;
        disposition?: { playerTrust?: number };
        personalityTraits?: string[];
    }> | undefined,
    playerNpcMilestones: PlayerBondMilestoneMap
): OfficerBondContext {
    const registry: Record<string, OfficerRegistryEntry> = {};
    if (npcs) {
        for (const [id, entry] of Object.entries(npcs)) {
            registry[id] = {
                name: entry.name,
                playerTrust: entry.disposition?.playerTrust,
                personalityTraits: entry.personalityTraits,
            };
        }
    }
    return { registry, playerNpcMilestones };
}

export function officerBondToCouncilHint(assessment: OfficerBondAssessment | undefined): import('./domainCouncilCore').CouncilBondHint | undefined {
    if (!assessment) { return undefined; }
    return {
        discontentOfficerIds: assessment.discontentOfficerIds,
        reasons: assessment.reasons,
    };
}

export function buildOfficerBondGmHint(assessment: OfficerBondAssessment | undefined): string | undefined {
    if (!assessment?.discontent) { return undefined; }
    const names = assessment.discontentOfficerIds
        .map((id) => sanitizeDomainPromptLabel(id))
        .join(', ');
    return `[Domain — Officer Bonds] Discontent among appointed officers (${names}). `
        + 'Loyalty comes from playerBond/disposition — no separate loyalty stat. '
        + `Rival-or-below trust (≤${PLAYER_TRUST_RIVAL_MAX}), nemesis (≤${PLAYER_TRUST_NEMESIS_MAX}), `
        + `or estrangement milestone (after trust ≤${PLAYER_TRUST_ESTRANGE_MAX}) raises officer_discontent weight. `
        + 'Narrate council tension; stats already reflect discontent if event fired.';
}

export function resolveCouncilOfficersFromRegistry(
    officers: readonly DomainOfficer[],
    context: OfficerBondContext
): import('./domainCouncilCore').DomainCouncilOfficer[] {
    return officers.map((o) => {
        const entry = context.registry[o.npcId];
        return {
            npcId: o.npcId,
            role: o.role,
            name: entry?.name,
            personalityTrait: entry?.personalityTraits?.[0],
        };
    });
}