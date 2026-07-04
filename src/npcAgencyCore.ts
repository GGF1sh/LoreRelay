// LW2 NPC Agency: world-driven positions, agenda arrivals (no vscode/fs).

import type {
    CommerceForge,
    MarketStateMap,
    NpcAgencyOp,
    NpcAgendaKind,
    NpcPositionsMap,
    NpcPositionState,
    NpcRegistryLike,
    WorldChangeEventLike,
} from './livingWorldTypes';
import { isFoodCrisisEvent } from './livingWorldTypes';
import { quoteMarketPrice } from './commerceCore';

// レガシー既定値(pre-1.0 の暫定値)。ホストは game_rules.maxNamedNpcCount をここへ渡す。
export const MAX_NAMED_NPC_AGENCY = 10;
export const DEFAULT_AGENDA_TRAVEL_DAYS = 3;

export interface NpcPresence {
    npcId: string;
    name: string;
    locationId: string;
    arrivesTurn: number;
    agenda?: NpcAgendaKind;
    reason?: string;
    inTransit: boolean;
}

function clonePositions(positions: NpcPositionsMap): NpcPositionsMap {
    const out: NpcPositionsMap = {};
    for (const [id, pos] of Object.entries(positions)) {
        out[id] = { ...pos };
    }
    return out;
}

function registryNpcIds(registry: NpcRegistryLike, maxNamedNpcCount = MAX_NAMED_NPC_AGENCY): string[] {
    return Object.keys(registry).slice(0, maxNamedNpcCount);
}

export function parseNpcAgencyOps(raw: unknown, maxNamedNpcCount = MAX_NAMED_NPC_AGENCY): NpcAgencyOp[] {
    if (!Array.isArray(raw)) { return []; }
    const out: NpcAgencyOp[] = [];
    for (const item of raw.slice(0, maxNamedNpcCount)) {
        if (!item || typeof item !== 'object') { continue; }
        const row = item as Record<string, unknown>;
        if (typeof row.npcId !== 'string' || !row.npcId) { continue; }
        if (typeof row.locationId !== 'string' || !row.locationId) { continue; }
        const arrivesTurn = typeof row.arrivesTurn === 'number' ? Math.floor(row.arrivesTurn) : 0;
        const agenda = typeof row.agenda === 'string' ? row.agenda as NpcAgendaKind : undefined;
        const reason = typeof row.reason === 'string' ? row.reason : undefined;
        out.push({ npcId: row.npcId, locationId: row.locationId, arrivesTurn, agenda, reason });
    }
    return out;
}

/**
 * Agency ON: world_state.npcPositions wins when present.
 * Agency OFF: fall back to registry.locationId.
 */
export function resolveNpcLocation(
    npcId: string,
    registry: NpcRegistryLike,
    positions: NpcPositionsMap,
    worldTurn: number,
    agencyEnabled: boolean
): NpcPositionState | undefined {
    const reg = registry[npcId];
    if (!reg) { return undefined; }

    if (agencyEnabled && positions[npcId]) {
        const pos = positions[npcId];
        if (pos.arrivesTurn <= worldTurn) {
            return pos;
        }
        return {
            locationId: reg.locationId ?? pos.locationId,
            arrivesTurn: pos.arrivesTurn,
            agenda: pos.agenda,
            reason: pos.reason ?? 'in_transit',
        };
    }

    if (reg.locationId) {
        return { locationId: reg.locationId, arrivesTurn: worldTurn };
    }
    return undefined;
}

export function listNpcPresence(
    registry: NpcRegistryLike,
    positions: NpcPositionsMap,
    worldTurn: number,
    agencyEnabled: boolean,
    maxNamedNpcCount = MAX_NAMED_NPC_AGENCY
): NpcPresence[] {
    const out: NpcPresence[] = [];
    for (const npcId of registryNpcIds(registry, maxNamedNpcCount)) {
        const reg = registry[npcId];
        const resolved = resolveNpcLocation(npcId, registry, positions, worldTurn, agencyEnabled);
        if (!resolved) { continue; }
        out.push({
            npcId,
            name: reg.name,
            locationId: resolved.locationId,
            arrivesTurn: resolved.arrivesTurn,
            agenda: resolved.agenda,
            reason: resolved.reason,
            inTransit: resolved.arrivesTurn > worldTurn,
        });
    }
    return out;
}

function cheapestWheatMarket(
    forge: CommerceForge,
    markets: MarketStateMap
): string | undefined {
    let best: { loc: string; price: number } | undefined;
    for (const market of forge.markets) {
        if (!market.commodityIds.includes('wheat')) { continue; }
        const q = quoteMarketPrice(forge, markets, market.locationId, 'wheat');
        if (!q) { continue; }
        if (!best || q.unitPrice < best.price) {
            best = { loc: market.locationId, price: q.unitPrice };
        }
    }
    return best?.loc;
}

function marketWithSteelShortage(
    forge: CommerceForge,
    markets: MarketStateMap
): string | undefined {
    for (const market of forge.markets) {
        if (!market.commodityIds.includes('steel')) { continue; }
        const stock = markets[market.locationId]?.steel?.stock ?? 0;
        if (stock < 5) { return market.locationId; }
    }
    return undefined;
}

export interface AgencyReactionInput {
    forge: CommerceForge;
    markets: MarketStateMap;
    registry: NpcRegistryLike;
    positions: NpcPositionsMap;
    worldTurn: number;
    /** この sim tick で新規発生したイベントのみ。食料危機判定に使う。 */
    stepEvents?: WorldChangeEventLike[];
    maxNamedNpcCount?: number;
}

/**
 * Deterministic NPC reactions to world/commerce events (v0: one rule per agenda trigger).
 */
export function reactNpcsToWorld(
    input: AgencyReactionInput
): { positions: NpcPositionsMap; moves: NpcAgencyOp[] } {
    const next = clonePositions(input.positions);
    const moves: NpcAgencyOp[] = [];
    const foodCrisis = (input.stepEvents ?? []).some(isFoodCrisisEvent);
    const cheapWheat = cheapestWheatMarket(input.forge, input.markets);
    const steelShort = marketWithSteelShortage(input.forge, input.markets);

    for (const npcId of registryNpcIds(input.registry, input.maxNamedNpcCount)) {
        const reg = input.registry[npcId];
        const existing = next[npcId];
        if (existing && existing.arrivesTurn > input.worldTurn) { continue; }

        if (foodCrisis && cheapWheat && reg.factionId !== undefined) {
            const op: NpcAgencyOp = {
                npcId,
                locationId: cheapWheat,
                arrivesTurn: input.worldTurn + DEFAULT_AGENDA_TRAVEL_DAYS,
                agenda: 'restock_wheat',
                reason: 'food_crisis_buy_wheat',
            };
            next[npcId] = {
                locationId: existing?.locationId ?? reg.locationId ?? cheapWheat,
                arrivesTurn: op.arrivesTurn,
                agenda: op.agenda,
                reason: op.reason,
            };
            moves.push(op);
            continue;
        }

        if (steelShort && reg.name.toLowerCase().includes('marcus')) {
            const op: NpcAgencyOp = {
                npcId,
                locationId: steelShort,
                arrivesTurn: input.worldTurn + DEFAULT_AGENDA_TRAVEL_DAYS,
                agenda: 'restock_steel',
                reason: 'smith_restock_steel',
            };
            next[npcId] = {
                locationId: existing?.locationId ?? reg.locationId ?? steelShort,
                arrivesTurn: op.arrivesTurn,
                agenda: op.agenda,
                reason: op.reason,
            };
            moves.push(op);
        }
    }

    return { positions: next, moves };
}

export { isFoodCrisisEvent } from './livingWorldTypes';

export function applyNpcAgencyOps(
    positions: NpcPositionsMap,
    ops: NpcAgencyOp[],
    registry: NpcRegistryLike,
    maxNamedNpcCount = MAX_NAMED_NPC_AGENCY
): NpcPositionsMap {
    const next = clonePositions(positions);
    const allowed = new Set(registryNpcIds(registry, maxNamedNpcCount));

    for (const op of ops) {
        if (!allowed.has(op.npcId)) { continue; }
        next[op.npcId] = {
            locationId: op.locationId,
            arrivesTurn: op.arrivesTurn,
            agenda: op.agenda,
            reason: op.reason,
        };
    }
    return next;
}

export function advanceNpcArrivals(
    positions: NpcPositionsMap,
    worldTurn: number
): NpcPositionsMap {
    const next = clonePositions(positions);
    for (const [npcId, pos] of Object.entries(next)) {
        if (pos.arrivesTurn <= worldTurn) {
            next[npcId] = { ...pos, arrivesTurn: worldTurn };
        }
    }
    return next;
}