// Domain §9.3: monthly council lines — template + stat thresholds (no vscode/fs).

import type {
    DomainActionId,
    DomainState,
    OfficerRole,
} from './domainCore';
import { MAX_DOMAIN_OFFICERS, sanitizeDomainPromptLabel } from './domainCore';
export const MAX_DOMAIN_COUNCIL_LINES = 5;

export type CouncilDiscontentReason = 'low_trust' | 'nemesis' | 'estrangement';

export interface CouncilBondHint {
    discontentOfficerIds: string[];
    reasons: Array<{ npcId: string; reason: CouncilDiscontentReason }>;
}

const MONTHLY_COMMIT_ACTION_RE = /今月|monthly|月次|方針|decree|domain.*commit/i;

export interface DomainCouncilOfficer {
    npcId: string;
    role: OfficerRole;
    name?: string;
    personalityTrait?: string;
}

export interface DomainCouncilInput {
    domain: DomainState;
    officers: readonly DomainCouncilOfficer[];
    bondHint?: CouncilBondHint;
}

const LAST_ACTION_PHRASE: Partial<Record<DomainActionId, string>> = {
    fortify: 'after fortify last month',
    train_troops: 'after troop training last month',
    agriculture: 'after agricultural focus last month',
    commerce: 'after trade policy last month',
    diplomacy: 'after diplomacy last month',
    festival: 'after the festival last month',
    espionage: 'after espionage last month',
    public_order: 'after policing last month',
    recruit: 'after recruitment last month',
    inspect: 'after your inspection tour last month',
};

function lastActionSuffix(actions: readonly DomainActionId[] | undefined): string {
    if (!actions?.length) { return ''; }
    const primary = actions[actions.length - 1];
    const phrase = LAST_ACTION_PHRASE[primary];
    return phrase ? ` ${phrase}` : '';
}

function personalityLead(trait: string | undefined): string {
    const t = trait?.trim().replace(/[\r\n\t\x00-\x1f]/g, ' ');
    if (!t) { return ''; }
    const word = t.slice(0, 40);
    return `${word.charAt(0).toUpperCase()}${word.slice(1)} in temperament — `;
}

function discontentSuffix(npcId: string, hint: CouncilBondHint | undefined): string {
    if (!hint?.discontentOfficerIds.includes(npcId)) { return ''; }
    const reason = hint.reasons.find((r) => r.npcId === npcId)?.reason;
    if (reason === 'nemesis') { return ' Shows open hostility toward your rule.'; }
    if (reason === 'estrangement') { return ' Seems to have turned away from your counsel.'; }
    if (reason === 'low_trust') { return ' Voices unease and withheld loyalty.'; }
    return '';
}

function stewardLine(domain: DomainState, suffix: string): string {
    if (domain.treasury < 150) {
        return `Worried about treasury${suffix}; urges caution on spending.`;
    }
    if (domain.food < 200) {
        return `Reports granaries running low${suffix}; rationing may be needed.`;
    }
    if (domain.treasury >= 400) {
        return `Notes healthy reserves${suffix}; room for investment.`;
    }
    return `Treasury is manageable${suffix}; awaits your decree.`;
}

function marshalLine(domain: DomainState, suffix: string, lastEventId?: string): string {
    if (domain.defense < 40 || domain.troops < 60) {
        return `Recommends training troops before border rumors spread${suffix}.`;
    }
    if (lastEventId === 'bandit_activity' || lastEventId === 'neighbor_militarize') {
        return `Urges patrols and readiness after recent border tension${suffix}.`;
    }
    if (domain.defense >= 55) {
        return `Reports garrison morale steady${suffix}.`;
    }
    return `Advises routine drills and watch rotations${suffix}.`;
}

function diplomatLine(domain: DomainState, suffix: string): string {
    if (domain.prestige < 25) {
        return `Prestige is low${suffix}; outward diplomacy may wait.`;
    }
    if (domain.prestige >= 45) {
        return `Sees openings for envoys and marriage talks${suffix}.`;
    }
    if (domain.lastEventId === 'neighbor_militarize') {
        return `Proposes cautious envoys to neighboring courts${suffix}.`;
    }
    return `Monitors neighboring courts for diplomatic openings${suffix}.`;
}

function merchantLine(domain: DomainState, suffix: string): string {
    if (domain.lastEventId === 'trade_route_disruption') {
        return `Warns caravan delays are pinching revenue${suffix}.`;
    }
    if (domain.commerce >= 50) {
        return `Trade routes look favorable this season${suffix}.`;
    }
    if (domain.commerce < 35) {
        return `Urges market recovery and merchant incentives${suffix}.`;
    }
    return `Reports steady tolls and market traffic${suffix}.`;
}

function spyLine(domain: DomainState, suffix: string): string {
    if (domain.lastEventId === 'rumor_mill' || domain.lastEventId === 'spy_arrival') {
        return `Passes on fresh whispers from abroad${suffix}.`;
    }
    if (domain.publicOrder < 45) {
        return `Hears unrest and loose tongues in the streets${suffix}.`;
    }
    return `Hears unease in neighboring lands${suffix}.`;
}

function roleCouncilBody(
    role: OfficerRole,
    domain: DomainState,
    suffix: string
): string {
    switch (role) {
        case 'steward': return stewardLine(domain, suffix);
        case 'marshal': return marshalLine(domain, suffix, domain.lastEventId);
        case 'diplomat': return diplomatLine(domain, suffix);
        case 'merchant': return merchantLine(domain, suffix);
        case 'spy': return spyLine(domain, suffix);
        default: return `Awaits your monthly decree${suffix}.`;
    }
}

export function buildDomainCouncilLine(
    officer: DomainCouncilOfficer,
    input: DomainCouncilInput
): string {
    const label = officer.name?.trim() || sanitizeDomainPromptLabel(officer.npcId);
    const suffix = lastActionSuffix(input.domain.lastMonthlyActions);
    const lead = personalityLead(officer.personalityTrait);
    const body = roleCouncilBody(officer.role, input.domain, suffix);
    const tail = discontentSuffix(officer.npcId, input.bondHint);
    return `${label} (${officer.role}): ${lead}${body}${tail}`;
}

export function buildDomainCouncilLines(input: DomainCouncilInput): string[] {
    if (input.officers.length === 0) { return []; }
    const lines: string[] = [];
    for (const officer of input.officers.slice(0, MAX_DOMAIN_COUNCIL_LINES)) {
        lines.push(buildDomainCouncilLine(officer, input));
    }
    return lines;
}

export function isDomainMonthlyCommitTurn(playerAction: string | undefined): boolean {
    return Boolean(playerAction && MONTHLY_COMMIT_ACTION_RE.test(playerAction));
}

export function shouldInjectDomainCouncil(
    domain: DomainState,
    isCommitTurn: boolean
): boolean {
    return isCommitTurn && domain.officers.length > 0;
}