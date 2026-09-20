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
    DOMAIN_ACTION_CATALOG,
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
import { buildAudiencePromptLines, getPetition, MAX_AUDIENCE_QUEUE } from './domainAudienceCore';
import { buildRivalPromptLine } from './rivalLordCore';
import { buildActiveMissionPromptLine, type OfficerMission } from './domainMissionCore';
import { buildBattlePromptLines } from './massBattleCore';
import { readDomainRegionDriftState } from './domainRegionDriftCore';
import { domainModeEnabled, readDomainFromGameState } from './domainTurnOps';

export { DOMAIN_OPS_PROMPT_LINE } from './domainPromptCore';

export function resolveRegionName(regionId: string): string | undefined {
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

    // §F9: officers currently dispatched on a mission are absent from council.
    const awayNpcIds = new Set((domain.activeMissions ?? []).map((m: OfficerMission) => m.officerNpcId));
    const presentOfficers = domain.officers.filter((o) => !awayNpcIds.has(o.npcId));

    const councilLines = shouldInjectDomainCouncil(domain, isCommitTurn)
        ? buildDomainCouncilLines({
            domain,
            officers: officerBond
                ? resolveCouncilOfficersFromRegistry(presentOfficers, officerBond)
                : presentOfficers.map((o) => ({ npcId: o.npcId, role: o.role })),
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

    // §F8: rival line only ever surfaces disclosed info (FoW parity); shown when a rival exists.
    if (rules.enableDomainRivals === true && domain.rival) {
        const rivalLine = buildRivalPromptLine(domain.rival);
        if (rivalLine) {
            lines.push(rivalLine);
        }
    }

    // §F9: dispatched officers surfaced every turn while away; return reports shown once, on the commit turn.
    if (rules.enableDomainMissions === true) {
        if (domain.activeMissions && domain.activeMissions.length > 0) {
            const missionLine = buildActiveMissionPromptLine(domain.activeMissions);
            if (missionLine) {
                lines.push(missionLine);
            }
        }
        if (isCommitTurn && domain.lastMissionReports && domain.lastMissionReports.length > 0) {
            lines.push(['[Domain — Missions Returned]', ...domain.lastMissionReports].join('\n'));
        }
    }

    // §F10: an active battle is the turn's main beat regardless of tier; last outcome persists once, like lastEventId.
    if (rules.enableMassBattle === true) {
        if (domain.activeBattle) {
            lines.push(buildBattlePromptLines(domain.activeBattle).join('\n'));
        } else if (domain.lastBattleReport) {
            lines.push(`[Domain — Battle] ${domain.lastBattleReport}`);
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
    const petitions = (domain.pendingPetitions ?? [])
        .slice(0, MAX_AUDIENCE_QUEUE)
        .map((id) => getPetition(id))
        .filter((p): p is NonNullable<typeof p> => Boolean(p))
        .map((p) => ({
            id: p.id,
            petitionerArchetype: p.petitionerArchetype,
            summary: p.summary,
            rulings: (['grant', 'deny', 'compromise'] as const).map((rulingId) => ({
                rulingId,
                label: p.rulings[rulingId].label,
            })),
        }));
    return {
        controlledRegionId: domain.controlledRegionId,
        regionName: resolveRegionName(domain.controlledRegionId),
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
        pendingPetitions: petitions,
        actionCatalog: [...DOMAIN_ACTION_CATALOG],
        rival: domain.rival
            ? {
                regionId: domain.rival.regionId,
                regionName: resolveRegionName(domain.rival.regionId),
                // FoW parity: webview only ever sees disclosed info, never true strength/stance.
                disclosedStrength: domain.rival.disclosedStrength,
                disclosedStance: domain.rival.disclosedStance,
            }
            : undefined,
        activeMissions: (domain.activeMissions ?? []).map((m) => ({
            officerNpcId: m.officerNpcId,
            kind: m.kind,
            monthsRemaining: m.monthsRemaining,
        })),
        lastMissionReports: domain.lastMissionReports?.slice(0, 3) ?? [],
        activeBattle: domain.activeBattle
            ? {
                opponentLabel: domain.activeBattle.opponentLabel,
                opponentName: resolveRegionName(domain.activeBattle.opponentLabel),
                round: domain.activeBattle.rounds.length + 1,
                maxRounds: domain.activeBattle.maxRounds,
                playerTroopsRemaining: domain.activeBattle.playerTroopsRemaining,
                enemyTroopsRemaining: domain.activeBattle.enemyTroopsRemaining,
            }
            : undefined,
        lastBattleReport: domain.lastBattleReport,
    };
}