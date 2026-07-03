// Guild Master G1: apply turn_result.guildOps to game_state (host layer).

import type { TurnResult } from './types/TurnResult';
import type { GameState } from './types/GameState';
import { loadGameRules } from './gameRules';
import { loadWorldState } from './worldState';
import { loadNpcRegistry } from './npcRegistry';
import { buildOfficerTrustMap } from './domainOfficerBondCore';
import {
    applyGuildOpsToGameState,
    readGuildFromState,
} from './guildTurnOpsCore';
import type { GuildState } from './guildCore';

export { applyGuildOpsToGameState, readGuildFromState } from './guildTurnOpsCore';

export function guildModeEnabled(rules: ReturnType<typeof loadGameRules>): boolean {
    return rules.enableGuildMode === true;
}

export function readGuildFromGameState(gameState: GameState | Record<string, unknown>): GuildState | undefined {
    return readGuildFromState(gameState as Record<string, unknown>);
}

export function applyGuildTurnOps(
    turnResult: TurnResult,
    gameState: GameState
): GameState {
    const rules = loadGameRules();
    const ws = loadWorldState();
    const worldTurnSeed = ws?.worldTurn ?? 0;

    const registry = rules.enableNpcRegistry === true ? loadNpcRegistry() : undefined;
    const registryNpcIds = registry
        ? new Set(Object.keys(registry.npcs))
        : undefined;

    const adventurerBondMap = rules.enableGuildParties === true && registry
        ? buildOfficerTrustMap(registry.npcs)
        : undefined;

    const next = applyGuildOpsToGameState(
        turnResult,
        gameState as unknown as Record<string, unknown>,
        guildModeEnabled(rules),
        {
            weeklyActions: rules.guildWeeklyActions,
            boardSize: rules.guildBoardSize,
            maxActiveQuests: rules.guildMaxActiveQuests,
            requestsEnabled: rules.enableGuildRequests === true,
            partiesEnabled: rules.enableGuildParties === true,
            adventurerBondMap,
        },
        worldTurnSeed,
        registryNpcIds
    );

    return next as unknown as GameState;
}