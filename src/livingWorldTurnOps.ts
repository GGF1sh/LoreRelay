// Apply turn_result tradeOps / npcAgencyOps (host layer).

import type { TurnResult } from './types/TurnResult';
import type { GameState } from './types/GameState';
import type { NpcRegistryLike } from './livingWorldTypes';
import type { NpcRegistry } from './npcRegistryCore';
import type { WorldState } from './worldStateCore';
import { loadGameRules } from './gameRules';
import { loadWorldForgeDocument, isWorldForgeEnabled } from './worldForge';
import { loadWorldState, saveWorldState } from './worldState';
import { loadNpcRegistry } from './npcRegistry';
import { parseCommerceForge } from './livingWorldForgeCore';
import { parseTradeOps, applyTradeOps, initializeMarketState } from './commerceCore';
import { parseNpcAgencyOps, applyNpcAgencyOps } from './npcAgencyCore';
import { clampElapsedWorldTurns } from './narrativeTimePassageCore';
import {
    getOrInitPlayerCommerce,
    applyTravelFoodConsumption,
} from './livingWorldTurnOpsCore';

export { getOrInitPlayerCommerce, applyTravelFoodConsumption } from './livingWorldTurnOpsCore';

function registryToAgencyLike(registry: NpcRegistry): NpcRegistryLike {
    const out: NpcRegistryLike = {};
    for (const [id, entry] of Object.entries(registry.npcs)) {
        out[id] = {
            name: entry.name,
            locationId: entry.locationId,
            factionId: entry.factionId,
        };
    }
    return out;
}

export function applyLivingWorldTurnOps(
    turnResult: TurnResult,
    gameState: GameState
): GameState {
    const rules = loadGameRules();
    if (!isWorldForgeEnabled()) { return gameState; }

    let nextGame = gameState;
    const rawDoc = loadWorldForgeDocument();
    const commerce = parseCommerceForge(rawDoc?.commerce);

    if (rules.enableCommerce && commerce) {
        const elapsed = clampElapsedWorldTurns(turnResult.elapsedWorldTurns, 100);
        if (elapsed > 0) {
            nextGame = applyTravelFoodConsumption(nextGame, elapsed, commerce);
        }
        const ops = parseTradeOps(turnResult.tradeOps);
        if (ops.length > 0) {
            const ws = loadWorldState();
            if (ws) {
                const markets = ws.markets && Object.keys(ws.markets).length > 0
                    ? ws.markets
                    : initializeMarketState(commerce);
                const playerCommerce = getOrInitPlayerCommerce(nextGame);
                const batch = applyTradeOps(commerce, markets, playerCommerce, ops);
                if (batch.ok) {
                    const updatedWorld: WorldState = {
                        ...ws,
                        markets: batch.markets,
                    };
                    saveWorldState(updatedWorld);
                    nextGame = {
                        ...nextGame,
                        commerce: batch.commerce,
                    } as GameState;
                }
            }
        }
    }

    if (rules.enableNpcAgency && rules.enableNpcRegistry) {
        const ops = parseNpcAgencyOps(turnResult.npcAgencyOps);
        if (ops.length > 0) {
            const ws = loadWorldState();
            const registry = loadNpcRegistry();
            if (ws) {
                const positions = applyNpcAgencyOps(
                    ws.npcPositions ?? {},
                    ops,
                    registryToAgencyLike(registry)
                );
                saveWorldState({ ...ws, npcPositions: positions });
            }
        }
    }

    return nextGame;
}