// Debug Trace Deep Emit P1a/P2: pure trace builders from subsystem inputs/outputs (no I/O).
//
// player_safe future: when adding player_safe rows, never copy raw npcId/locationId/internal
// rule text into message — use display names and FoW-safe refs only (see DEBUG_TRACE_DEEP_EMIT_GATE_DESIGN.md §P2).

import { quoteMarketPrice } from './commerceCore';
import type { DebugTraceCondition, DebugTraceEntry } from './debugTraceCore';
import {
    evaluateFoodCrisisEvent,
    isFoodCrisisEvent,
    type CommerceForge,
    type MarketStateMap,
    type NpcAgencyOp,
    type NpcPositionsMap,
    type NpcRegistryLike,
    type WorldChangeEventLike,
} from './livingWorldTypes';
import { MAX_NAMED_NPC_AGENCY, type AgencyReactionInput } from './npcAgencyCore';
import { stableNamedNpcIds } from './npcRelationshipCore';

export const MAX_FOOD_CRISIS_SCAN_EVENTS = 8;
export const MAX_FOOD_CRISIS_NPC_DECISIONS = 10;
export const MAX_DEEP_EMIT_ENTRIES_PER_TICK = 24;
export const MAX_DEEP_EMIT_EFFECT_ROWS = 8;
export const MAX_DEEP_EMIT_DECISION_ROWS = 8;

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
    return stableNamedNpcIds(registry, maxNamedNpcCount);
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

function dedupeStepEvents(stepEvents: WorldChangeEventLike[]): WorldChangeEventLike[] {
    const seen = new Set<string>();
    const out: WorldChangeEventLike[] = [];
    for (const ev of stepEvents) {
        const key = stepEventDedupeKey(ev);
        if (seen.has(key)) {
            continue;
        }
        seen.add(key);
        out.push(ev);
    }
    return out;
}

function buildScanEntries(
    runId: string,
    worldTurn: number,
    parentTraceId: string,
    stepEvents: WorldChangeEventLike[]
): { entries: DebugTraceEntry[]; omittedCount: number } {
    const unique = dedupeStepEvents(stepEvents);
    const matched: WorldChangeEventLike[] = [];
    const unmatched: WorldChangeEventLike[] = [];
    for (const ev of unique) {
        if (isFoodCrisisEvent(ev)) {
            matched.push(ev);
        } else {
            unmatched.push(ev);
        }
    }

    const selected: WorldChangeEventLike[] = [];
    for (const ev of matched) {
        if (selected.length >= MAX_FOOD_CRISIS_SCAN_EVENTS) {
            break;
        }
        selected.push(ev);
    }
    for (const ev of unmatched) {
        if (selected.length >= MAX_FOOD_CRISIS_SCAN_EVENTS) {
            break;
        }
        selected.push(ev);
    }
    const omittedCount = Math.max(0, unique.length - selected.length);

    const entries: DebugTraceEntry[] = [];
    for (const ev of selected) {
        const evaluation = evaluateFoodCrisisEvent(ev);
        const conditions = evaluation.conditions as DebugTraceCondition[];
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
            decision: evaluation.matched ? 'matched' : 'not_matched',
            message: 'Scan stepEvent for food crisis semantics.',
            inputRefs,
            conditions,
            audience: 'internal',
        });
    }

    return { entries, omittedCount };
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
    cheapWheat: string | undefined,
    omittedScanCount: number
): DebugTraceEntry {
    const gateOpen = foodCrisis && !!cheapWheat;
    const conditions: DebugTraceCondition[] = [
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
    ];
    if (omittedScanCount > 0) {
        conditions.push({
            label: 'scan events omitted from trace budget',
            result: true,
            actual: omittedScanCount,
            expected: '0 when all events fit',
        });
    }
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
        conditions,
        audience: 'internal',
    };
}

function buildNpcDecisionEntries(
    runId: string,
    worldTurn: number,
    gateTraceId: string,
    gateOpen: boolean,
    input: FoodCrisisAgencyEmitInput,
    maxRows: number
): DebugTraceEntry[] {
    if (!gateOpen || maxRows <= 0) {
        return [];
    }

    const maxNpc = Math.min(
        input.maxNpcTraces ?? MAX_FOOD_CRISIS_NPC_DECISIONS,
        MAX_FOOD_CRISIS_NPC_DECISIONS
    );
    const { agencyInput } = input;
    const entries: DebugTraceEntry[] = [];
    const matchedEventRefs = (input.stepEvents ?? [])
        .filter(isFoodCrisisEvent)
        .filter((ev, idx, arr) => arr.findIndex((x) => stepEventDedupeKey(x) === stepEventDedupeKey(ev)) === idx)
        .slice(0, 4)
        .map((ev) => (ev.id ? { kind: 'event' as const, id: ev.id } : undefined))
        .filter((ref): ref is { kind: 'event'; id: string } => !!ref);

    for (const npcId of registryNpcIds(agencyInput.registry, agencyInput.maxNamedNpcCount)) {
        if (entries.length >= maxRows || entries.length >= maxNpc) {
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
    moves: NpcAgencyOp[],
    maxRows: number
): DebugTraceEntry[] {
    const entries: DebugTraceEntry[] = [];
    for (const move of moves) {
        if (move.reason !== 'food_crisis_buy_wheat') {
            continue;
        }
        if (entries.length >= maxRows) {
            break;
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

function assembleBoundedEntries(
    scanEntries: DebugTraceEntry[],
    gateEntry: DebugTraceEntry,
    effectEntries: DebugTraceEntry[],
    npcEntries: DebugTraceEntry[]
): DebugTraceEntry[] {
    const budget = MAX_DEEP_EMIT_ENTRIES_PER_TICK;
    const result: DebugTraceEntry[] = [];

    for (const entry of scanEntries) {
        if (result.length >= budget) {
            break;
        }
        result.push(entry);
    }
    if (result.length < budget) {
        result.push(gateEntry);
    }

    const effectCap = Math.min(MAX_DEEP_EMIT_EFFECT_ROWS, budget - result.length);
    result.push(...effectEntries.slice(0, effectCap));

    const decisionCap = Math.min(MAX_DEEP_EMIT_DECISION_ROWS, budget - result.length);
    result.push(...npcEntries.slice(0, decisionCap));

    return result;
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

        const { entries: scanEntries, omittedCount } = buildScanEntries(
            runId,
            worldTurn,
            parentTraceId,
            stepEvents
        );
        const matchedCount = countMatchedFoodCrisisEvents(stepEvents);
        const foodCrisis = matchedCount > 0;
        const cheapWheat = cheapestWheatMarket(input.agencyInput.forge, input.agencyInput.markets);
        const gateEntry = buildGateEntry(
            runId,
            worldTurn,
            parentTraceId,
            foodCrisis,
            matchedCount,
            cheapWheat,
            omittedCount
        );
        const gateOpen = gateEntry.decision === 'gate_open';

        const effectEntries = buildEffectEntries(
            runId,
            worldTurn,
            input.agencyResult.moves ?? [],
            MAX_DEEP_EMIT_EFFECT_ROWS
        );

        const remainingAfterScanAndGate = Math.max(
            0,
            MAX_DEEP_EMIT_ENTRIES_PER_TICK - scanEntries.length - 1 - effectEntries.length
        );
        const npcEntries = buildNpcDecisionEntries(
            runId,
            worldTurn,
            gateEntry.traceId,
            gateOpen,
            input,
            Math.min(MAX_DEEP_EMIT_DECISION_ROWS, remainingAfterScanAndGate)
        );

        return assembleBoundedEntries(scanEntries, gateEntry, effectEntries, npcEntries);
    } catch {
        return [];
    }
}
