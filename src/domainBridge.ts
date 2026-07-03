// Domain Mode D2: host bridge — prompt injection and region name resolution.

import { loadGameRules } from './gameRules';
import { loadWorldState } from './worldState';
import { loadNpcRegistry } from './npcRegistry';
import { loadWorldForge, isWorldForgeEnabled } from './worldForge';
import {
    buildDomainPromptBlock,
    buildDomainSinceLastVisitPrompt,
    DOMAIN_OPS_PROMPT_LINE,
    DOMAIN_EVENT_FOCUS_LINE,
} from './domainPromptCore';
import {
    buildDomainEventGmHint,
    buildSeasonalDomainGmHint,
    resolveDomainPromptTier,
    type DomainState,
} from './domainCore';
import {
    buildDomainCouncilLines,
    isDomainMonthlyCommitTurn,
    shouldInjectDomainCouncil,
} from './domainCouncilCore';
import {
    assessOfficerBonds,
    buildOfficerBondGmHint,
    officerBondToCouncilHint,
    registryToOfficerBondContext,
    resolveCouncilOfficersFromRegistry,
} from './domainOfficerBondCore';
import { buildDomainLedgerPromptLine } from './domainLedgerCore';
import { buildAudiencePromptLines, MAX_AUDIENCE_QUEUE } from './domainAudienceCore';
import { readDomainRegionDriftState } from './domainRegionDriftCore';
import { domainModeEnabled, readDomainFromGameState } from './domainTurnOps';

export { DOMAIN_OPS_PROMPT_LINE } from './domainPromptCore';

function resolveRegionName(regionId: string): string | undefined {
    if (!isWorldForgeEnabled()) { return undefined; }
    const forge = loadWorldForge();
    if (!forge) { return undefined; }
    const region = forge.geography.regions.find((r) => r.id === regionId);
    return region?.name || regionId;
}

function resolveEventHint(domain: DomainState, tier: ReturnType<typeof resolveDomainPromptTier>): string | undefined {
    const eventId = domain.lastEventId ?? domain.pendingEvents[domain.pendingEvents.length - 1];
    if (!eventId || tier === 'minimal') {
        return undefined;
    }
    return buildDomainEventGmHint(eventId);
}

export function buildDomainPromptContext(
    gameState: Record<string, unknown> | undefined,
    playerAction?: string
): string {
    const rules = loadGameRules();
    if (!domainModeEnabled(rules)) {
        return '';
    }

    const domain = gameState ? readDomainFromGameState(gameState) : undefined;
    if (!domain || !domain.enabled) {
        return '';
    }

    const isCommitTurn = isDomainMonthlyCommitTurn(playerAction);
    const tier = resolveDomainPromptTier(domain, isCommitTurn);
    const regionName = resolveRegionName(domain.controlledRegionId);
    const eventHint = tier === 'full' ? resolveEventHint(domain, tier) : undefined;

    const rulesNpcRegistry = rules.enableNpcRegistry === true;
    const registry = rulesNpcRegistry ? loadNpcRegistry() : undefined;
    const ws = loadWorldState();
    const officerBond = registry && ws
        ? registryToOfficerBondContext(
            registry.npcs,
            (ws as { playerNpcMilestones?: Record<string, string[]> }).playerNpcMilestones ?? {}
        )
        : undefined;
    const bondAssessment = officerBond
        ? assessOfficerBonds(domain.officers, officerBond)
        : undefined;
    const bondHint = buildOfficerBondGmHint(bondAssessment);

    const councilLines = shouldInjectDomainCouncil(domain, isCommitTurn)
        ? buildDomainCouncilLines({
            domain,
            officers: officerBond
                ? resolveCouncilOfficersFromRegistry(domain.officers, officerBond)
                : domain.officers.map((o) => ({ npcId: o.npcId, role: o.role })),
            bondHint: officerBondToCouncilHint(bondAssessment),
        })
        : undefined;

    const seasonalHint = tier === 'full' ? buildSeasonalDomainGmHint(domain) : undefined;

    const block = buildDomainPromptBlock(domain, {
        regionName,
        councilLines,
        tier,
        eventHint,
        seasonalHint,
        bondHint: tier === 'full' ? bondHint : undefined,
    });

    const lines = [block];

    // §F7: petitioners awaiting judgment are surfaced on every turn until ruled
    // (independent of prompt tier — the audience is the active beat).
    if (rules.enableDomainAudience === true && domain.pendingPetitions && domain.pendingPetitions.length > 0) {
        const audienceLines = buildAudiencePromptLines(domain.pendingPetitions);
        if (audienceLines.length > 0) {
            lines.push(audienceLines.join('\n'));
        }
    }

    const ledger = buildDomainLedgerPromptLine(rules.enableCommerce === true, true);
    if (ledger && tier === 'full') {
        lines.push(ledger);
    }

    if (isCommitTurn) {
        lines.push(DOMAIN_OPS_PROMPT_LINE.replace('up to N', `up to ${rules.domainMonthlyActions ?? 2}`));
    } else if (tier === 'standard' && (domain.pendingEvents.length > 0 || domain.lastEventId)) {
        lines.push(DOMAIN_EVENT_FOCUS_LINE);
    }

    if (!isCommitTurn) {
        const { domainSinceLastVisit } = readDomainRegionDriftState(gameState ?? {});
        const sinceLastVisit = buildDomainSinceLastVisitPrompt(domainSinceLastVisit);
        if (sinceLastVisit) {
            lines.push(sinceLastVisit);
        }
    }

    return lines.filter(Boolean).join('\n\n');
}

export function pickDomainForWebview(domain: DomainState | undefined): Record<string, unknown> | undefined {
    if (!domain || !domain.enabled) { return undefined; }
    return {
        controlledRegionId: domain.controlledRegionId,
        rank: domain.rank,
        calendarMonth: domain.calendarMonth,
        calendarYear: domain.calendarYear,
        treasury: domain.treasury,
        food: domain.food,
        troops: domain.troops,
        publicOrder: domain.publicOrder,
        popularSupport: domain.popularSupport,
        agriculture: domain.agriculture,
        commerce: domain.commerce,
        defense: domain.defense,
        culture: domain.culture,
        prestige: domain.prestige,
        monthlyActionsRemaining: domain.monthlyActionsRemaining,
        lastEventId: domain.lastEventId,
        officers: domain.officers.map((o) => ({ npcId: o.npcId, role: o.role })),
        pendingEvents: domain.pendingEvents.slice(-5),
        pendingPetitions: domain.pendingPetitions?.slice(0, MAX_AUDIENCE_QUEUE) ?? [],
    };
}