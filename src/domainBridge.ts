// Domain Mode D2: host bridge — prompt injection and region name resolution.

import { loadGameRules } from './gameRules';
import { loadWorldForge, isWorldForgeEnabled } from './worldForge';
import {
    buildDomainPromptBlock,
    DOMAIN_OPS_PROMPT_LINE,
    DOMAIN_EVENT_FOCUS_LINE,
} from './domainPromptCore';
import {
    buildCouncilLines,
    buildDomainEventGmHint,
    resolveDomainPromptTier,
    type DomainState,
} from './domainCore';
import { buildDomainLedgerPromptLine } from './domainLedgerCore';
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

    const isCommitTurn = Boolean(
        playerAction && /今月|monthly|月次|方針|decree|domain.*commit/i.test(playerAction)
    );
    const tier = resolveDomainPromptTier(domain, isCommitTurn);
    const regionName = resolveRegionName(domain.controlledRegionId);
    const eventHint = resolveEventHint(domain, tier);

    const councilLines = isCommitTurn
        ? buildCouncilLines(
            domain,
            domain.officers.map((o) => ({ npcId: o.npcId, role: o.role }))
        )
        : undefined;

    const block = buildDomainPromptBlock(domain, {
        regionName,
        councilLines,
        tier,
        eventHint,
    });

    const lines = [block];

    const ledger = buildDomainLedgerPromptLine(rules.enableCommerce === true, true);
    if (ledger && tier !== 'minimal') {
        lines.push(ledger);
    }

    if (isCommitTurn) {
        lines.push(DOMAIN_OPS_PROMPT_LINE.replace('up to N', `up to ${rules.domainMonthlyActions ?? 2}`));
    } else if (tier === 'standard' && (domain.pendingEvents.length > 0 || domain.lastEventId)) {
        lines.push(DOMAIN_EVENT_FOCUS_LINE);
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
    };
}