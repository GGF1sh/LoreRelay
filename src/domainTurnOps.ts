// Domain Mode D1.5: apply turn_result.domainOps to game_state (host layer).

import type { TurnResult } from './types/TurnResult';
import type { GameState } from './types/GameState';
import { loadGameRules } from './gameRules';
import { loadWorldState } from './worldState';
import {
    applyDomainOpsToGameState,
    readDomainFromState,
} from './domainTurnOpsCore';
import type { DomainState } from './domainCore';

export { applyDomainOpsToGameState, readDomainFromState } from './domainTurnOpsCore';

export function domainModeEnabled(rules: ReturnType<typeof loadGameRules>): boolean {
    return rules.enableDomainMode === true;
}

export function readDomainFromGameState(gameState: GameState | Record<string, unknown>): DomainState | undefined {
    return readDomainFromState(gameState as Record<string, unknown>);
}

export function applyDomainTurnOps(
    turnResult: TurnResult,
    gameState: GameState
): GameState {
    const rules = loadGameRules();
    const ws = loadWorldState();
    const worldTurnSeed = ws?.worldTurn ?? 0;

    const next = applyDomainOpsToGameState(
        turnResult,
        gameState as unknown as Record<string, unknown>,
        domainModeEnabled(rules),
        {
            monthDays: rules.domainMonthDays,
            monthlyActions: rules.domainMonthlyActions,
        },
        worldTurnSeed
    );
    return next as unknown as GameState;
}