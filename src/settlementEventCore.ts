// Settlement Mode M2b: adaptive event candidate selector (pure, no disk apply).

import type { SettlementIncident, SettlementStateV1 } from './settlementCore';

export type SettlementEventCategory =
    | 'raid'
    | 'shortage'
    | 'unrest'
    | 'windfall'
    | 'arrival'
    | 'departure'
    | 'repair';

export type SettlementEventSeverity = 'info' | 'warning' | 'critical';

export interface SettlementEventCandidate {
    category: SettlementEventCategory;
    severity: SettlementEventSeverity;
    weight: number;
    suggestedText?: string;
}

export interface SettlementEventContext {
    worldTurn: number;
    seed: number;
    cooldowns?: Partial<Record<SettlementEventCategory, number>>;
}

const ALL_CATEGORIES: readonly SettlementEventCategory[] = [
    'raid', 'shortage', 'unrest', 'windfall', 'arrival', 'departure', 'repair',
];

const NEGATIVE_CATEGORIES = new Set<SettlementEventCategory>([
    'raid', 'shortage', 'unrest', 'departure',
]);

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

function clampText(raw: string, max: number): string {
    return raw.trim().replace(/\s+/g, ' ').slice(0, max);
}

function hasStockShortage(state: SettlementStateV1): boolean {
    return state.stocks.some((s) => s.amount <= 2);
}

function unresolvedIncidentCount(state: SettlementStateV1): number {
    return state.incidents.filter((i) => !i.resolved).length;
}

function categorySeverity(category: SettlementEventCategory, state: SettlementStateV1): SettlementEventSeverity {
    const safety = state.safety ?? 50;
    const morale = state.morale ?? 50;
    if (category === 'raid' && safety < 30) { return 'critical'; }
    if (category === 'shortage' && hasStockShortage(state)) { return 'warning'; }
    if (category === 'unrest' && morale < 35) { return 'critical'; }
    if (category === 'windfall' || category === 'arrival' || category === 'repair') { return 'info'; }
    return 'warning';
}

function suggestedTextFor(category: SettlementEventCategory): string {
    switch (category) {
        case 'raid': return 'Hostile interest in the settlement has risen.';
        case 'shortage': return 'Supplies are running thin at the settlement.';
        case 'unrest': return 'Tempers are fraying among the residents.';
        case 'windfall': return 'A modest windfall may be within reach.';
        case 'arrival': return 'New faces may soon arrive at the settlement.';
        case 'departure': return 'Someone may be preparing to leave.';
        case 'repair': return 'Repairs or upkeep demand attention.';
        default: return 'Something shifts at the settlement.';
    }
}

/** Compute bounded category weights without mutating state. */
export function computeSettlementEventWeights(
    state: SettlementStateV1,
    context: SettlementEventContext
): Record<SettlementEventCategory, number> {
    const safety = state.safety ?? 50;
    const morale = state.morale ?? 50;
    const shortage = hasStockShortage(state);
    const unresolved = unresolvedIncidentCount(state);
    const dampen = unresolved >= 3 ? 0.5 : 1;

    const weights: Record<SettlementEventCategory, number> = {
        raid: 10,
        shortage: 10,
        unrest: 10,
        windfall: 10,
        arrival: 10,
        departure: 10,
        repair: 10,
    };

    if (safety < 40) {
        weights.raid += Math.round((40 - safety) * 0.8 * dampen);
        weights.unrest += Math.round((40 - safety) * 0.4 * dampen);
    }
    if (morale < 40) {
        weights.unrest += Math.round((40 - morale) * 0.7 * dampen);
        weights.departure += Math.round((40 - morale) * 0.5 * dampen);
    }
    if (shortage) {
        weights.shortage += 35;
    } else {
        weights.shortage = 0;
    }
    if (unresolved >= 2) {
        for (const cat of NEGATIVE_CATEGORIES) {
            weights[cat] = Math.floor(weights[cat] * dampen);
        }
    }
    if (safety >= 60 && morale >= 60 && !shortage && unresolved === 0) {
        weights.windfall += 15;
        weights.arrival += 12;
        weights.repair += 8;
    }

    for (const cat of ALL_CATEGORIES) {
        const until = context.cooldowns?.[cat];
        if (typeof until === 'number' && until > context.worldTurn) {
            weights[cat] = 0;
        }
    }

    return weights;
}

function pickWeightedCategory(
    weights: Record<SettlementEventCategory, number>,
    seed: number
): SettlementEventCategory | undefined {
    const entries = ALL_CATEGORIES
        .map((category) => ({ category, weight: Math.max(0, Math.floor(weights[category])) }))
        .filter((e) => e.weight > 0);
    if (!entries.length) { return undefined; }
    const total = entries.reduce((sum, e) => sum + e.weight, 0);
    let roll = seed % total;
    for (const entry of entries) {
        if (roll < entry.weight) { return entry.category; }
        roll -= entry.weight;
    }
    return entries[entries.length - 1].category;
}

/**
 * Pure selector — returns one candidate or undefined. Does not mutate state or write disk.
 */
export function selectSettlementEvent(
    state: SettlementStateV1,
    context: SettlementEventContext
): SettlementEventCandidate | undefined {
    const weights = computeSettlementEventWeights(state, context);
    const seed = hashSeed([
        context.seed,
        state.settlementId,
        context.worldTurn,
        ...ALL_CATEGORIES.map((c) => weights[c]),
    ]);
    const category = pickWeightedCategory(weights, seed);
    if (!category) { return undefined; }
    return {
        category,
        severity: categorySeverity(category, state),
        weight: weights[category],
        suggestedText: suggestedTextFor(category),
    };
}

/** Turn a resolved incident into a short reusable legacy note (no new schema). */
export function deriveLegacyNote(incident: SettlementIncident): string | undefined {
    if (!incident.resolved) { return undefined; }
    const text = clampText(incident.text, 80);
    return text || undefined;
}