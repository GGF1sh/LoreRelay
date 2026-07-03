// Domain Mode D2: GM prompt blocks (no vscode/fs).

import type { DomainState, DomainPromptTier } from './domainCore';
import { getDomainSeason } from './domainCore';

export const DOMAIN_EVENT_FOCUS_LINE =
    'Domain play is event-first: narrate the pending/last domain event as the main beat. '
    + 'Stat changes are already applied by Core; do not re-roll outcomes.';

export const DOMAIN_OPS_PROMPT_LINE =
    'When the player commits to a monthly domain policy (up to N actions), '
    + 'set turn_result.domainOps: { kind: "monthly_commit", actions: [...], intelligence?: "gather_rumors"|"scout_border"|"none" }. '
    + 'Set elapsedWorldTurns to domainMonthDays (default 30) on the same commit. '
    + 'Core applies stat changes; narrate outcomes only.';

export interface DomainPromptOptions {
    regionName?: string;
    councilLines?: string[];
    /** @deprecated Prefer tier */
    compact?: boolean;
    tier?: DomainPromptTier;
    eventHint?: string;
}

function clampLine(text: string, max: number): string {
    const t = text.trim();
    return t.length <= max ? t : `${t.slice(0, max - 1)}…`;
}

export function buildDomainCompactPrompt(domain: DomainState, options: DomainPromptOptions = {}): string {
    const name = options.regionName?.trim() || domain.controlledRegionId;
    const season = getDomainSeason(domain.calendarMonth);
    return [
        `[Domain — ${clampLine(name, 80)}]`,
        `M${domain.calendarMonth} Y${domain.calendarYear} (${season}) · treasury ${domain.treasury} · food ${domain.food} · troops ${domain.troops}`,
        `Actions left: ${domain.monthlyActionsRemaining}${domain.pendingEvents.length ? ` · pending: ${domain.pendingEvents.slice(-2).join(', ')}` : ''}`,
    ].join('\n');
}

export function buildDomainStandardPrompt(domain: DomainState, options: DomainPromptOptions = {}): string {
    const name = options.regionName?.trim() || domain.controlledRegionId;
    const lines = [
        `[Domain — ${clampLine(name, 80)}]`,
        `M${domain.calendarMonth} Y${domain.calendarYear} (${getDomainSeason(domain.calendarMonth)}) · treasury ${domain.treasury} · food ${domain.food}`,
        `Order ${domain.publicOrder} · support ${domain.popularSupport} · prestige ${domain.prestige}`,
    ];
    if (domain.officers.length > 0) {
        lines.push(`Officers: ${domain.officers.length}`);
    }
    if (domain.pendingEvents.length > 0) {
        lines.push(`Pending: ${domain.pendingEvents.slice(-2).join(', ')}`);
    }
    if (domain.lastEventId) {
        lines.push(`Last event: ${domain.lastEventId}`);
    }
    if (options.eventHint) {
        lines.push(options.eventHint);
    }
    return lines.join('\n');
}

export function buildDomainFullPrompt(domain: DomainState, options: DomainPromptOptions = {}): string {
    const name = options.regionName?.trim() || domain.controlledRegionId;
    const lines = [
        `[Domain — ${clampLine(name, 80)}]`,
        `Rank: ${domain.rank} · Month ${domain.calendarMonth}, Year ${domain.calendarYear} (${getDomainSeason(domain.calendarMonth)})`,
        `Treasury ${domain.treasury} · Food ${domain.food} · Troops ${domain.troops}`,
        `Public order ${domain.publicOrder} · Popular support ${domain.popularSupport}`,
        `Agriculture ${domain.agriculture} · Commerce ${domain.commerce} · Defense ${domain.defense} · Culture ${domain.culture} · Prestige ${domain.prestige}`,
        `Monthly actions remaining: ${domain.monthlyActionsRemaining}`,
    ];

    if (domain.officers.length > 0) {
        const officerSummary = domain.officers
            .map((o) => `${o.npcId} (${o.role})`)
            .join(', ');
        lines.push(`Officers: ${clampLine(officerSummary, 200)}`);
    }

    if (domain.pendingEvents.length > 0) {
        lines.push(`Pending: ${domain.pendingEvents.slice(-3).join(', ')}`);
    }
    if (domain.lastEventId) {
        lines.push(`Last event: ${domain.lastEventId}`);
    }
    if (options.eventHint) {
        lines.push(options.eventHint);
    }

    lines.push(
        DOMAIN_EVENT_FOCUS_LINE,
        'Guidance: Stats are canonical. Narrate mood and NPC reactions only.',
        'Monthly policy changes require turn_result.domainOps (monthly_commit).',
        'Do not invent treasury or troop numbers in narration.'
    );

    if (options.councilLines && options.councilLines.length > 0) {
        lines.push('[Domain — Council]');
        lines.push(...options.councilLines.slice(0, 5));
    }

    return lines.join('\n');
}

export function buildDomainPromptBlock(
    domain: DomainState,
    options: DomainPromptOptions = {}
): string {
    const tier = options.tier ?? (options.compact ? 'minimal' : 'full');
    if (tier === 'minimal') {
        return buildDomainCompactPrompt(domain, options);
    }
    if (tier === 'standard') {
        return buildDomainStandardPrompt(domain, options);
    }
    return buildDomainFullPrompt(domain, options);
}