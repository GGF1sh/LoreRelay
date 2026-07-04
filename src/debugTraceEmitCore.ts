// Debug Trace Deep Emit P1a/P2: pure trace builders from subsystem inputs/outputs (no I/O).
//
// player_safe future: when adding player_safe rows, never copy raw npcId/locationId/internal
// rule text into message — use display names and FoW-safe refs only (see DEBUG_TRACE_DEEP_EMIT_GATE_DESIGN.md §P2).

import { quoteMarketPrice } from './commerceCore';
import type { DebugTraceCondition, DebugTraceEntry } from './debugTraceCore';
import {
    isFoodCrisisEvent,
    type CommerceForge,
    type MarketStateMap,
    type NpcAgencyOp,
    type NpcPositionsMap,
    type NpcRegistryLike,
    type WorldChangeEventLike,
} from './livingWorldTypes';
import { MAX_NAMED_NPC_AGENCY, type AgencyReactionInput } from './npcAgencyCore';

export const MAX_FOOD_CRISIS_SCAN_EVENTS = 8;
export const MAX_FOOD_CRISIS_NPC_DECISIONS = 10;
export const MAX_DEEP_EMIT_ENTRIES_PER_TICK = 24;

export interface FoodCrisisAgencyEmitInput {
    runId: string;
    worldTurn: number;
    parentTraceId: string;
    stepEvents: WorldChangeEventLike[];
    agencyInput: AgencyReactionInput;
    agencyResult: { moves: NpcAgencyOp[]; positions: NpcPositionsMap };
    maxNpcTraces?: number;
}

export interface DeepTraceEmitGateFlags {
    bulkWorldSimDebug: boolean;
    debugScenarioActive: boolean;
}

export function shouldEmitDeepDebugTrace(flags: DeepTraceEmitGateFlags): boolean {
    return flags.bulkWorldSimDebug === true || flags.debugScenarioActive === true;
}

function registryNpcIds(registry: NpcRegistryLike, maxNamedNpcCount = MAX_NAMED_NPC_AGENCY): string[] {
    return Object.keys(registry).slice(0, maxNamedNpcCount);
}

function messageHasFoodKeyword(message: string): boolean {
    const msg = message.toLowerCase();
    return msg.includes('food')
        || msg.includes('wheat')
        || msg.includes('食料')
        || msg.includes('小麦');
}

function buildIsFoodCrisisConditions(ev: WorldChangeEventLike): DebugTraceCondition[] {
    const keywordMatch = messageHasFoodKeyword(ev.message);
    return [
        {
            label: 'category === resource',
            result: ev.category === 'resource',
            actual: ev.category,
            expected: 'resource',
        },
        {
            label: 'message includes food keyword',
            result: keywordMatch,
            actual: ev.message.slice(0, 120),
            expected: '(food|wheat|食料|小麦)',
        },
    ];
}

function stepEventDedupeKey(ev: WorldChangeEventLike): string {
    if (ev.id) {
        return ev.id;
    }
    return `anon:${ev.worldTurn}|${ev.category ?? ''}|${ev.factionId ?? ''}|${ev.message}`;
}

function sanitizeTraceIdSuffix(raw: string): string {
    return raw.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 80);
}

function stepEventScanTraceId(ev: WorldChangeEventLike): string {
    const key = stepEventDedupeKey(ev);
    if (ev.id) {
        return `trace_fc_scan_${ev.id}`;
    }
    return `trace_fc_scan_${sanitizeTraceIdSuffix(key)}`;
}

function cheapestWheatMarket(forge: CommerceForge, markets: MarketStateMap): string | undefined {
    let best: { loc: string; price: number } | undefined;
    for (const market of forge.markets) {
        if (!market.commodityIds.includes('wheat')) {
            continue;
        }
        const q = quoteMarketPrice(forge, markets, market.locationId, 'wheat');
        if (!q) {
            continue;
        }
        if (!best || q.unitPrice < best.price) {
            best = { loc: market.locationId, price: q.unitPrice };
        }
    }
    return best?.loc;
}

function trimEntries(entries: DebugTraceEntry[]): DebugTraceEntry[] {
    if (entries.length <= MAX_DEEP_EMIT_ENTRIES_PER_TICK) {
        return entries;
    }
    return entries.slice(0, MAX_DEEP_EMIT_ENTRIES_PER_TICK);
}

function buildScanEntries(
    runId: string,
    worldTurn: number,
    parentTraceId: string,
    stepEvents: WorldChangeEventLike[]
): DebugTraceEntry[] {
    const entries: DebugTraceEntry[] = [];
    const seen = new Set<string>();

    for (const ev of stepEvents) {
        const dedupeKey = stepEventDedupeKey(ev);
        if (seen.has(dedupeKey)) {
            continue;
        }
        seen.add(dedupeKey);
        if (entries.length >= MAX_FOOD_CRISIS_SCAN_EVENTS) {
            break;
        }

        const conditions = buildIsFoodCrisisConditions(ev);
        const matched = conditions.every((c) => c.result);
        const traceId = stepEventScanTraceId(ev);
        const inputRefs = ev.id ? [{ kind: 'event' as const, id: ev.id }] : undefined;

        entries.push({
            version: 1,
            runId,
            traceId,
            parentTraceId,
            worldTurn,
            subsystem: 'livingWorldClassifier',
            phase: 'query',
            ruleId: 'isFoodCrisisEvent',
            decision: matched ? 'matched' : 'not_matched',
            message: 'Scan stepEvent for food crisis semantics.',
            inputRefs,
            conditions,
            audience: 'internal',
        });
    }

    return entries;
}

function countMatchedFoodCrisisEvents(stepEvents: WorldChangeEventLike[]): number {
    let count = 0;
    const seen = new Set<string>();
    for (const ev of stepEvents) {
        const key = stepEventDedupeKey(ev);
        if (seen.has(key)) {
            continue;
        }
        seen.add(key);
        if (isFoodCrisisEvent(ev)) {
            count += 1;
        }
    }
    return count;
}

function buildGateEntry(
    runId: string,
    worldTurn: number,
    parentTraceId: string,
    foodCrisis: boolean,
    matchedCount: number,
    cheapWheat: string | undefined
): DebugTraceEntry {
    const gateOpen = foodCrisis && !!cheapWheat;
    return {
        version: 1,
        runId,
        traceId: `trace_fc_gate_t${worldTurn}`,
        parentTraceId,
        worldTurn,
        subsystem: 'npcAgency',
        phase: 'decision',
        ruleId: 'food_crisis_gate',
        decision: gateOpen ? 'gate_open' : 'gate_closed',
        message: gateOpen
            ? 'Food crisis stepEvent matched and wheat market available; npcAgency wheat rush gate open.'
            : 'Food crisis npcAgency wheat rush gate closed.',
        conditions: [
            {
                label: 'any stepEvent matched isFoodCrisisEvent',
                result: foodCrisis,
                actual: matchedCount,
                expected: '>=1 when crisis',
            },
            {
                label: 'cheapestWheatMarket exists',
                result: !!cheapWheat,
                actual: cheapWheat ?? '(none)',
            },
        ],
        audience: 'internal',
    };
}

function buildNpcDecisionEntries(
    runId: string,
    worldTurn: number,
    gateTraceId: string,
    gateOpen: boolean,
    input: FoodCrisisAgencyEmitInput
): DebugTraceEntry[] {
    if (!gateOpen) {
        return [];
    }

    const maxNpc = input.maxNpcTraces ?? MAX_FOOD_CRISIS_NPC_DECISIONS;
    const { agencyInput } = input;
    const entries: DebugTraceEntry[] = [];
    const matchedEventRefs = (input.stepEvents ?? [])
        .filter(isFoodCrisisEvent)
        .filter((ev, idx, arr) => arr.findIndex((x) => stepEventDedupeKey(x) === stepEventDedupeKey(ev)) === idx)
        .slice(0, 4)
        .map((ev) => (ev.id ? { kind: 'event' as const, id: ev.id } : undefined))
        .filter((ref): ref is { kind: 'event'; id: string } => !!ref);

    for (const npcId of registryNpcIds(agencyInput.registry, agencyInput.maxNamedNpcCount)) {
        if (entries.length >= maxNpc) {
            break;
        }
        const reg = agencyInput.registry[npcId];
        const existing = agencyInput.positions[npcId];
        const inTransit = !!(existing && existing.arrivesTurn > worldTurn);
        const hasFaction = reg.factionId !== undefined;

        let decision: string;
        if (inTransit) {
            decision = 'skipped_in_transit';
        } else if (!hasFaction) {
            decision = 'skipped_no_faction';
        } else {
            decision = 'move_scheduled';
        }

        entries.push({
            version: 1,
            runId,
            traceId: `trace_fc_npc_${npcId}_t${worldTurn}`,
            parentTraceId: gateTraceId,
            worldTurn,
            subsystem: 'npcAgency',
            phase: 'decision',
            ruleId: 'food_crisis_buy_wheat',
            decision,
            message: `${reg.name} food crisis buy-wheat evaluation.`,
            inputRefs: matchedEventRefs.length ? matchedEventRefs : undefined,
            conditions: [
                { label: 'food_crisis_gate open', result: true },
                {
                    label: 'npc has factionId',
                    result: hasFaction,
                    actual: reg.factionId ?? '(none)',
                },
                { label: 'npc not in transit', result: !inTransit },
            ],
            audience: 'internal',
        });
    }

    return entries;
}

function buildEffectEntries(
    runId: string,
    worldTurn: number,
    moves: NpcAgencyOp[]
): DebugTraceEntry[] {
    const entries: DebugTraceEntry[] = [];
    for (const move of moves) {
        if (move.reason !== 'food_crisis_buy_wheat') {
            continue;
        }
        entries.push({
            version: 1,
            runId,
            traceId: `trace_fc_effect_${move.npcId}_t${worldTurn}`,
            parentTraceId: `trace_fc_npc_${move.npcId}_t${worldTurn}`,
            worldTurn,
            subsystem: 'npcAgency',
            phase: 'effect',
            ruleId: 'food_crisis_buy_wheat',
            decision: 'applied',
            message: `restock_wheat → ${move.locationId} in ${move.arrivesTurn - worldTurn} days`,
            outputRefs: [
                { kind: 'npc', id: move.npcId },
                { kind: 'location', id: move.locationId },
            ],
            audience: 'gm_safe',
        });
    }
    return entries;
}

/** Build food-crisis npcAgency deep trace entries for one sim tick. Never throws. */
export function buildFoodCrisisAgencyTraceEntries(input: FoodCrisisAgencyEmitInput): DebugTraceEntry[] {
    try {
        if (!input || typeof input.runId !== 'string' || !input.runId) {
            return [];
        }
        if (typeof input.worldTurn !== 'number' || !Number.isFinite(input.worldTurn)) {
            return [];
        }
        if (!input.parentTraceId || !input.agencyInput || !input.agencyResult) {
            return [];
        }

        const stepEvents = Array.isArray(input.stepEvents) ? input.stepEvents : [];
        const worldTurn = Math.floor(input.worldTurn);
        const parentTraceId = input.parentTraceId;
        const runId = input.runId;

        const scanEntries = buildScanEntries(runId, worldTurn, parentTraceId, stepEvents);
        const matchedCount = countMatchedFoodCrisisEvents(stepEvents);
        const foodCrisis = matchedCount > 0;
        const cheapWheat = cheapestWheatMarket(input.agencyInput.forge, input.agencyInput.markets);
        const gateEntry = buildGateEntry(runId, worldTurn, parentTraceId, foodCrisis, matchedCount, cheapWheat);
        const gateOpen = gateEntry.decision === 'gate_open';

        const npcEntries = buildNpcDecisionEntries(
            runId,
            worldTurn,
            gateEntry.traceId,
            gateOpen,
            input
        );
        const effectEntries = buildEffectEntries(
            runId,
            worldTurn,
            input.agencyResult.moves ?? []
        );

        return trimEntries([
            ...scanEntries,
            gateEntry,
            ...npcEntries,
            ...effectEntries,
        ]);
    } catch {
        return [];
    }
}