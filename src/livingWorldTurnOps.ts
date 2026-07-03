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
import { parseNpcAgencyOps, applyNpcAgencyOps, resolveNpcLocation } from './npcAgencyCore';
import { parseRelationshipOps, applyRelationshipOps } from './npcRelationshipCore';
import { applyPlayerBondTradeAdjustment, type PlayerBondRegistryLike } from './playerBondCore';
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
            playerTrust: entry.disposition?.playerTrust,
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
                const playerCommerce = getOrInitPlayerCommerce(
                    nextGame,
                    loadGameRules().playerRole ?? 'merchant'
                );
                const batch = applyTradeOps(commerce, markets, playerCommerce, ops);
                if (batch.ok) {
                    let finalCommerce = batch.commerce;

                    // LW3-P2: 絆の交易波及 — 盟友NPCが同席する市場では商いに情が乗り(還元)、
                    // 敵対NPCの市場では上乗せされる。全opが同一市場の場合のみ(通常のUI経路)。
                    if (rules.enableNpcRelationships && rules.enableNpcAgency && rules.enableNpcRegistry) {
                        const locations = new Set(ops.map((o) => o.marketLocationId));
                        if (locations.size === 1) {
                            const locationId = ops[0].marketLocationId;
                            const registry = loadNpcRegistry();
                            const bondReg: PlayerBondRegistryLike = {};
                            const npcAtLocation: Record<string, string | undefined> = {};
                            for (const [id, entry] of Object.entries(registry.npcs)) {
                                bondReg[id] = { name: entry.name };
                                npcAtLocation[id] = resolveNpcLocation(
                                    id,
                                    registryToAgencyLike(registry),
                                    ws.npcPositions ?? {},
                                    ws.worldTurn,
                                    true
                                )?.locationId;
                            }
                            const adj = applyPlayerBondTradeAdjustment({
                                milestones: ws.playerNpcMilestones ?? {},
                                registry: bondReg,
                                npcAtLocation,
                                locationId,
                                creditsDelta: batch.commerce.credits - playerCommerce.credits,
                            });
                            if (adj.adjustment !== 0) {
                                finalCommerce = {
                                    ...finalCommerce,
                                    credits: Math.max(0, finalCommerce.credits + adj.adjustment),
                                };
                            }
                        }
                    }

                    const updatedWorld: WorldState = {
                        ...ws,
                        markets: batch.markets,
                    };
                    saveWorldState(updatedWorld);
                    nextGame = {
                        ...nextGame,
                        commerce: finalCommerce,
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

    // LW3: GM の例外的な関係確定(通常は世界tickの evolveRelationships が決定論で動かす)。
    if (rules.enableNpcRelationships && rules.enableNpcAgency && rules.enableNpcRegistry) {
        const ops = parseRelationshipOps(turnResult.relationshipOps);
        if (ops.length > 0) {
            const ws = loadWorldState();
            const registry = loadNpcRegistry();
            if (ws) {
                const relationships = applyRelationshipOps(
                    ws.npcRelationships ?? {},
                    ops,
                    registryToAgencyLike(registry)
                );
                saveWorldState({ ...ws, npcRelationships: relationships });
            }
        }
    }

    return nextGame;
}