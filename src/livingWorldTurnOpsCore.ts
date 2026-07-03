// Pure Living World turn-op helpers (no vscode/fs).

import type { GameState } from './types/GameState';
import type { CommerceForge, MarketStateMap, PlayerCommerceState, PlayerRole, TradeOp } from './livingWorldTypes';
import { resolveDefaultPlayerRole } from './livingWorldCommerceUiCore';
import { cargoWeight, computePerLocationTradeCreditsDelta } from './commerceCore';
import { computeFoodConsumption, resolveTransportForTheme } from './transportCore';
import { clampElapsedWorldTurns } from './narrativeTimePassageCore';
import {
    batchPlayerBondTradeAdjustments,
    type PlayerBondRegistryLike,
    type PlayerBondMilestoneMap,
} from './playerBondCore';

/** Canonical turn-op phase order (commerce → agency → relationships). */
export const LIVING_WORLD_TURN_PHASES = ['commerce', 'npc_agency', 'relationship'] as const;
export type LivingWorldTurnPhase = typeof LIVING_WORLD_TURN_PHASES[number];

/** Sort arbitrary phase lists into canonical pipeline order. */
export function sortLivingWorldTurnPhases(phases: LivingWorldTurnPhase[]): LivingWorldTurnPhase[] {
    const order = new Map(LIVING_WORLD_TURN_PHASES.map((phase, index) => [phase, index]));
    return [...phases].sort((a, b) => (order.get(a) ?? 99) - (order.get(b) ?? 99));
}

export function getOrInitPlayerCommerce(
    state: GameState,
    defaultRole: PlayerRole = 'merchant'
): PlayerCommerceState {
    const existing = state.commerce;
    if (existing && typeof existing.credits === 'number') {
        const role = resolveDefaultPlayerRole(defaultRole, existing.playerRole);
        return { ...(existing as PlayerCommerceState), playerRole: role };
    }
    return {
        credits: 500,
        cargo: [],
        transportId: 'wagon',
        food: 30,
        playerRole: defaultRole,
    };
}

/** Deduct travel rations when elapsedWorldTurns advances (LW1-PR3). Never goes negative. */
export function applyTravelFoodConsumption(
    gameState: GameState,
    elapsedDays: number,
    commerce: CommerceForge
): GameState {
    const days = clampElapsedWorldTurns(elapsedDays, 100);
    if (days <= 0) { return gameState; }

    const playerCommerce = getOrInitPlayerCommerce(gameState);
    const transport = resolveTransportForTheme(
        commerce,
        undefined,
        playerCommerce.transportId
    );
    if (!transport) { return gameState; }

    const weight = cargoWeight(commerce, playerCommerce.cargo);
    const cost = computeFoodConsumption(days, transport, weight);
    const foodBefore = typeof playerCommerce.food === 'number' ? playerCommerce.food : 30;
    const foodAfter = Math.max(0, foodBefore - cost);

    return {
        ...gameState,
        commerce: { ...playerCommerce, food: foodAfter },
    };
}

/** LW3-P2: batch bond trade adjustments after all trade ops in a turn complete. */
export function resolveBondTradeBatchAdjustment(input: {
    milestones: PlayerBondMilestoneMap;
    registry: PlayerBondRegistryLike;
    npcAtLocation: Record<string, string | undefined>;
    commerce: CommerceForge;
    markets: MarketStateMap;
    playerCommerce: PlayerCommerceState;
    tradeOps: TradeOp[];
}): number {
    const locationDeltas = computePerLocationTradeCreditsDelta(
        input.commerce,
        input.markets,
        input.playerCommerce,
        input.tradeOps
    );
    const entries = Object.entries(locationDeltas).map(([locationId, creditsDelta]) => ({
        locationId,
        creditsDelta,
    }));
    if (entries.length === 0) {
        return 0;
    }
    return batchPlayerBondTradeAdjustments({
        milestones: input.milestones,
        registry: input.registry,
        npcAtLocation: input.npcAtLocation,
        locationDeltas: entries,
    }).totalAdjustment;
}