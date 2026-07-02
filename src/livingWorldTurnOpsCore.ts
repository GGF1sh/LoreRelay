// Pure Living World turn-op helpers (no vscode/fs).

import type { GameState } from './types/GameState';
import type { CommerceForge, PlayerCommerceState, PlayerRole } from './livingWorldTypes';
import { resolveDefaultPlayerRole } from './livingWorldCommerceUiCore';
import { cargoWeight } from './commerceCore';
import { computeFoodConsumption, resolveTransportForTheme } from './transportCore';
import { clampElapsedWorldTurns } from './narrativeTimePassageCore';

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