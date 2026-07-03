// Domain Mode D2: host bridge — prompt injection and region name resolution.

import { loadGameRules } from './gameRules';
import { loadWorldForge, isWorldForgeEnabled } from './worldForge';
import {
    buildDomainPromptBlock,
    DOMAIN_OPS_PROMPT_LINE,
} from './domainPromptCore';
import {
    buildCouncilLines,
    type DomainState,
} from './domainCore';
import { domainModeEnabled, readDomainFromGameState } from './domainTurnOps';

export { DOMAIN_OPS_PROMPT_LINE } from './domainPromptCore';

function resolveRegionName(regionId: string): string | undefined {
    if (!isWorldForgeEnabled()) { return undefined; }
    const forge = loadWorldForge();
    if (!forge) { return undefined; }
    const region = forge.geography.regions.find((r) => r.id === regionId);
    return region?.name || regionId;
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

    const regionName = resolveRegionName(domain.controlledRegionId);
    const councilLines = isCommitTurn
        ? buildCouncilLines(
            domain,
            domain.officers.map((o) => ({ npcId: o.npcId, role: o.role }))
        )
        : undefined;

    const block = buildDomainPromptBlock(domain, {
        regionName,
        councilLines,
        compact: !isCommitTurn && domain.pendingEvents.length === 0 && domain.officers.length === 0,
    });

    const lines = [block];
    if (isCommitTurn || /monthly|月次|domain/i.test(playerAction ?? '')) {
        lines.push(DOMAIN_OPS_PROMPT_LINE.replace('up to N', `up to ${rules.domainMonthlyActions ?? 2}`));
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
        officers: domain.officers.map((o) => ({ npcId: o.npcId, role: o.role })),
        pendingEvents: domain.pendingEvents.slice(-5),
    };
}