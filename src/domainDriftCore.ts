// Domain Mode §9.1: absence drift + since-last-visit delta (no vscode/fs).

import {
    type DomainConfig,
    type DomainState,
    type DomainOfficer,
    applyMonthlyDomainIncome,
    applySeasonalMonthlyEffects,
    advanceDomainCalendar,
    rollDomainEvent,
    applyDomainEventEffect,
    MAX_DOMAIN_PENDING_EVENTS,
    normalizeDomainConfig,
    isValidDomainEventId,
    isValidOfficerRole,
    sanitizeDomainPromptLabel,
} from './domainCore';

export const MAX_DOMAIN_DRIFT_MONTHS = 24;

export interface DomainSnapshot {
    worldTurn: number;
    treasury: number;
    food: number;
    troops: number;
    publicOrder: number;
    popularSupport: number;
    calendarMonth: number;
    calendarYear: number;
    officers: DomainOfficer[];
}

export interface DomainVisitChange {
    category: 'domain';
    eventId: string;
    message: string;
    treasuryDelta: number;
    foodDelta: number;
    publicOrderDelta: number;
    popularSupportDelta: number;
}

export interface SinceLastDomainVisitDelta {
    regionId: string;
    turnsAway: number;
    simulatedMonths: number;
    capped: boolean;
    stewardLabel: string;
    changes: DomainVisitChange[];
    treasuryDelta: number;
    foodDelta: number;
    publicOrderDelta: number;
    popularSupportDelta: number;
}

export interface SinceLastDomainVisitInput {
    lastVisitWorldTurn: number;
    currentWorldTurn: number;
    regionId: string;
    domainBefore: DomainState;
    monthDays: number;
    baseSeed: number;
    config?: Partial<DomainConfig>;
}

const DRIFT_EVENT_NARRATION: Record<string, string> = {
    bad_harvest: 'Crop failure strained stores',
    merchant_visit: 'A traveling merchant paid tolls and duties',
    bandit_activity: 'Bandit activity increased',
    neighbor_militarize: 'Border tensions stirred',
    petition: 'Subjects petitioned the steward',
    trade_route_disruption: 'A trade route faltered',
    rumor_mill: 'Rumors spread through the court',
    spy_arrival: 'A covert messenger surfaced',
    religious_friction: 'Faith or guild friction rose',
    festival_gathering: 'A seasonal festival was held',
    officer_discontent: 'An officer showed discontent',
    domain_quiet_month: 'The steward collected routine taxes',
};

function pickStewardLabel(officers: readonly DomainOfficer[]): string {
    const steward = officers.find((o) => o.role === 'steward');
    if (steward) {
        return `Steward ${sanitizeDomainPromptLabel(steward.npcId, 'castellan')}`;
    }
    if (officers.length > 0) {
        return `Officer ${sanitizeDomainPromptLabel(officers[0].npcId, 'castellan')}`;
    }
    return 'The acting castellan';
}

export function createDomainSnapshot(domain: DomainState, worldTurn: number): DomainSnapshot {
    return {
        worldTurn: Math.max(0, Math.floor(worldTurn)),
        treasury: domain.treasury,
        food: domain.food,
        troops: domain.troops,
        publicOrder: domain.publicOrder,
        popularSupport: domain.popularSupport,
        calendarMonth: domain.calendarMonth,
        calendarYear: domain.calendarYear,
        officers: domain.officers.map((o) => ({ ...o })),
    };
}

export function domainStateFromSnapshot(snapshot: DomainSnapshot, current: DomainState): DomainState {
    return {
        ...current,
        treasury: snapshot.treasury,
        food: snapshot.food,
        troops: snapshot.troops,
        publicOrder: snapshot.publicOrder,
        popularSupport: snapshot.popularSupport,
        calendarMonth: snapshot.calendarMonth,
        calendarYear: snapshot.calendarYear,
    };
}

export function simulateStewardMonth(
    domain: DomainState,
    seed: number,
    config?: Partial<DomainConfig>
): { domain: DomainState; eventId: string } {
    const normalized = normalizeDomainConfig(config);
    let next = { ...domain };
    next = applyMonthlyDomainIncome(next);
    next = applySeasonalMonthlyEffects(next);
    next = advanceDomainCalendar(next);

    const stewardActions = next.officers.some((o) => o.role === 'steward')
        ? (['inspect', 'public_order'] as const)
        : (['inspect'] as const);
    const eventId = rollDomainEvent(next, seed, 'none', stewardActions);
    next = applyDomainEventEffect(next, eventId);
    next.lastEventId = eventId;
    next.pendingEvents = [...next.pendingEvents, eventId].slice(-MAX_DOMAIN_PENDING_EVENTS);

    return { domain: next, eventId };
}

export function simulateDomainDrift(
    start: DomainState,
    virtualMonths: number,
    baseSeed: number,
    config?: Partial<DomainConfig>
): { domain: DomainState; events: string[] } {
    const months = Math.max(0, Math.min(MAX_DOMAIN_DRIFT_MONTHS, Math.floor(virtualMonths)));
    let next = { ...start };
    const events: string[] = [];
    for (let i = 0; i < months; i++) {
        const tick = simulateStewardMonth(next, baseSeed + i * 997, config);
        next = tick.domain;
        events.push(tick.eventId);
    }
    return { domain: next, events };
}

function buildVisitChange(
    eventId: string,
    before: DomainState,
    after: DomainState
): DomainVisitChange {
    const treasuryDelta = after.treasury - before.treasury;
    const foodDelta = after.food - before.food;
    const publicOrderDelta = after.publicOrder - before.publicOrder;
    const popularSupportDelta = after.popularSupport - before.popularSupport;
    const narration = DRIFT_EVENT_NARRATION[eventId] ?? 'The domain shifted while you were away';
    const parts: string[] = [narration];
    if (treasuryDelta !== 0) {
        parts.push(`treasury ${treasuryDelta > 0 ? '+' : ''}${treasuryDelta}`);
    }
    if (foodDelta !== 0) {
        parts.push(`food ${foodDelta > 0 ? '+' : ''}${foodDelta}`);
    }
    if (publicOrderDelta !== 0) {
        parts.push(`public order ${publicOrderDelta > 0 ? '+' : ''}${publicOrderDelta}`);
    }
    if (popularSupportDelta !== 0) {
        parts.push(`support ${popularSupportDelta > 0 ? '+' : ''}${popularSupportDelta}`);
    }
    return {
        category: 'domain',
        eventId,
        message: parts.join('; '),
        treasuryDelta,
        foodDelta,
        publicOrderDelta,
        popularSupportDelta,
    };
}

export function computeSinceLastDomainVisitDelta(
    input: SinceLastDomainVisitInput
): SinceLastDomainVisitDelta | undefined {
    const turnsAway = Math.max(0, Math.floor(input.currentWorldTurn - input.lastVisitWorldTurn));
    if (turnsAway <= 0) { return undefined; }

    const monthDays = Math.max(1, Math.floor(input.monthDays));
    const rawVirtualMonths = Math.floor(turnsAway / monthDays);
    const virtualMonths = Math.min(MAX_DOMAIN_DRIFT_MONTHS, rawVirtualMonths);
    if (virtualMonths <= 0) { return undefined; }

    const start = { ...input.domainBefore };
    const changes: DomainVisitChange[] = [];
    let cursor = { ...start };
    for (let i = 0; i < virtualMonths; i++) {
        const before = { ...cursor };
        const tick = simulateStewardMonth(before, input.baseSeed + i * 997, input.config);
        cursor = tick.domain;
        changes.push(buildVisitChange(tick.eventId, before, cursor));
    }
    const end = cursor;

    return {
        regionId: input.regionId,
        turnsAway,
        simulatedMonths: virtualMonths,
        capped: rawVirtualMonths > MAX_DOMAIN_DRIFT_MONTHS,
        stewardLabel: pickStewardLabel(input.domainBefore.officers),
        changes: changes.slice(-4),
        treasuryDelta: end.treasury - start.treasury,
        foodDelta: end.food - start.food,
        publicOrderDelta: end.publicOrder - start.publicOrder,
        popularSupportDelta: end.popularSupport - start.popularSupport,
    };
}

function sanitizeDriftPromptLine(value: string, max = 240): string {
    return value.trim().replace(/[\r\n\t\x00-\x1f]/g, ' ').slice(0, max);
}

export function buildSinceLastDomainVisitLines(delta: SinceLastDomainVisitDelta | undefined): string[] {
    if (!delta || delta.turnsAway <= 0) { return []; }

    const awayDesc = delta.capped
        ? `${delta.turnsAway} turns away; ${delta.simulatedMonths} months simulated (cap ${MAX_DOMAIN_DRIFT_MONTHS})`
        : `${delta.turnsAway} turns away`;
    let steward = sanitizeDriftPromptLine(delta.stewardLabel, 80);
    if (steward.includes('[') || steward.includes(']')) {
        steward = 'The acting castellan';
    }
    const lines: string[] = [
        `Domain (${awayDesc}): While you were abroad, ${steward} managed the domain.`,
    ];

    if (delta.treasuryDelta !== 0) {
        lines.push(
            `- Treasury ${delta.treasuryDelta > 0 ? '+' : ''}${delta.treasuryDelta} overall.`
        );
    }
    if (delta.foodDelta !== 0) {
        lines.push(`- Food ${delta.foodDelta > 0 ? '+' : ''}${delta.foodDelta} overall.`);
    }

    const changes = Array.isArray(delta.changes) ? delta.changes : [];
    for (const ch of changes) {
        const eventId = isValidDomainEventId(ch.eventId) ? ch.eventId : 'domain_quiet_month';
        const narration = DRIFT_EVENT_NARRATION[eventId] ?? 'The domain shifted while you were away';
        lines.push(`- ${narration}. [domain:${eventId}]`);
    }

    return lines.slice(0, 8);
}

export function parseDomainSnapshot(raw: unknown): DomainSnapshot | undefined {
    if (!raw || typeof raw !== 'object') { return undefined; }
    const doc = raw as Record<string, unknown>;
    if (typeof doc.worldTurn !== 'number' || !Number.isFinite(doc.worldTurn)) { return undefined; }
    const officers: DomainOfficer[] = [];
    if (Array.isArray(doc.officers)) {
        for (const item of doc.officers.slice(0, 5)) {
            if (!item || typeof item !== 'object') { continue; }
            const o = item as Record<string, unknown>;
            const npcId = sanitizeDomainPromptLabel(o.npcId, '', 64);
            if (!npcId || !isValidOfficerRole(o.role)) { continue; }
            officers.push({ npcId, role: o.role });
        }
    }
    return {
        worldTurn: Math.max(0, Math.floor(doc.worldTurn)),
        treasury: Math.max(0, Math.floor(typeof doc.treasury === 'number' ? doc.treasury : 0)),
        food: Math.max(0, Math.floor(typeof doc.food === 'number' ? doc.food : 0)),
        troops: Math.max(0, Math.floor(typeof doc.troops === 'number' ? doc.troops : 0)),
        publicOrder: Math.max(0, Math.min(100, Math.floor(typeof doc.publicOrder === 'number' ? doc.publicOrder : 0))),
        popularSupport: Math.max(0, Math.min(100, Math.floor(typeof doc.popularSupport === 'number' ? doc.popularSupport : 0))),
        calendarMonth: Math.max(1, Math.min(12, Math.floor(typeof doc.calendarMonth === 'number' ? doc.calendarMonth : 1))),
        calendarYear: Math.max(1, Math.floor(typeof doc.calendarYear === 'number' ? doc.calendarYear : 1)),
        officers,
    };
}

export function parseSinceLastDomainVisitDelta(raw: unknown): SinceLastDomainVisitDelta | undefined {
    if (!raw || typeof raw !== 'object') { return undefined; }
    const doc = raw as Record<string, unknown>;
    const regionId = typeof doc.regionId === 'string' ? doc.regionId.trim() : '';
    if (!regionId) { return undefined; }
    const turnsAway = typeof doc.turnsAway === 'number' && Number.isFinite(doc.turnsAway)
        ? Math.max(0, Math.floor(doc.turnsAway))
        : 0;
    if (turnsAway <= 0) { return undefined; }

    const changes: DomainVisitChange[] = [];
    if (Array.isArray(doc.changes)) {
        for (const item of doc.changes.slice(0, 8)) {
            if (!item || typeof item !== 'object') { continue; }
            const c = item as Record<string, unknown>;
            const eventId = typeof c.eventId === 'string' && isValidDomainEventId(c.eventId.trim())
                ? c.eventId.trim()
                : '';
            if (!eventId) { continue; }
            const message = DRIFT_EVENT_NARRATION[eventId] ?? 'The domain shifted while you were away';
            changes.push({
                category: 'domain',
                eventId,
                message,
                treasuryDelta: Math.floor(typeof c.treasuryDelta === 'number' ? c.treasuryDelta : 0),
                foodDelta: Math.floor(typeof c.foodDelta === 'number' ? c.foodDelta : 0),
                publicOrderDelta: Math.floor(typeof c.publicOrderDelta === 'number' ? c.publicOrderDelta : 0),
                popularSupportDelta: Math.floor(typeof c.popularSupportDelta === 'number' ? c.popularSupportDelta : 0),
            });
        }
    }

    const simulatedMonths = typeof doc.simulatedMonths === 'number' && Number.isFinite(doc.simulatedMonths)
        ? Math.max(0, Math.min(MAX_DOMAIN_DRIFT_MONTHS, Math.floor(doc.simulatedMonths)))
        : Math.min(MAX_DOMAIN_DRIFT_MONTHS, Math.floor(turnsAway / 30));
    const capped = doc.capped === true;

    return {
        regionId: regionId.slice(0, 64),
        turnsAway,
        simulatedMonths,
        capped,
        stewardLabel: sanitizeDriftPromptLine(
            typeof doc.stewardLabel === 'string' ? doc.stewardLabel : 'The acting castellan',
            80
        ),
        changes,
        treasuryDelta: Math.floor(typeof doc.treasuryDelta === 'number' ? doc.treasuryDelta : 0),
        foodDelta: Math.floor(typeof doc.foodDelta === 'number' ? doc.foodDelta : 0),
        publicOrderDelta: Math.floor(typeof doc.publicOrderDelta === 'number' ? doc.publicOrderDelta : 0),
        popularSupportDelta: Math.floor(typeof doc.popularSupportDelta === 'number' ? doc.popularSupportDelta : 0),
    };
}