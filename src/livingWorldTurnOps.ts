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
import type { PlayerBondRegistryLike } from './playerBondCore';
import { clampElapsedWorldTurns } from './narrativeTimePassageCore';
import {
    getOrInitPlayerCommerce,
    applyTravelFoodConsumption,
    LIVING_WORLD_TURN_PHASES,
    resolveBondTradeBatchAdjustment,
    type LivingWorldTurnPhase,
} from './livingWorldTurnOpsCore';

export {
    getOrInitPlayerCommerce,
    applyTravelFoodConsumption,
    LIVING_WORLD_TURN_PHASES,
    sortLivingWorldTurnPhases,
} from './livingWorldTurnOpsCore';

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

function buildBondTradeContext(
    registry: NpcRegistry,
    ws: WorldState
): { bondReg: PlayerBondRegistryLike; npcAtLocation: Record<string, string | undefined> } {
    const bondReg: PlayerBondRegistryLike = {};
    const npcAtLocation: Record<string, string | undefined> = {};
    const agencyLike = registryToAgencyLike(registry);
    for (const [id, entry] of Object.entries(registry.npcs)) {
        bondReg[id] = { name: entry.name };
        npcAtLocation[id] = resolveNpcLocation(
            id,
            agencyLike,
            ws.npcPositions ?? {},
            ws.worldTurn,
            true
        )?.locationId;
    }
    return { bondReg, npcAtLocation };
}

function runCommercePhase(
    turnResult: TurnResult,
    gameState: GameState,
    commerce: NonNullable<ReturnType<typeof parseCommerceForge>>
): GameState {
    const rules = loadGameRules();
    let nextGame = gameState;

    const elapsed = clampElapsedWorldTurns(turnResult.elapsedWorldTurns, 100);
    if (elapsed > 0) {
        nextGame = applyTravelFoodConsumption(nextGame, elapsed, commerce);
    }

    const ops = parseTradeOps(turnResult.tradeOps);
    if (ops.length === 0) {
        return nextGame;
    }

    const ws = loadWorldState();
    if (!ws) {
        return nextGame;
    }

    const markets = ws.markets && Object.keys(ws.markets).length > 0
        ? ws.markets
        : initializeMarketState(commerce);
    const playerCommerce = getOrInitPlayerCommerce(
        nextGame,
        loadGameRules().playerRole ?? 'merchant'
    );
    const batch = applyTradeOps(commerce, markets, playerCommerce, ops);
    if (!batch.ok) {
        return nextGame;
    }

    let finalCommerce = batch.commerce;

    if (rules.enableNpcRelationships && rules.enableNpcAgency && rules.enableNpcRegistry) {
        const registry = loadNpcRegistry();
        const { bondReg, npcAtLocation } = buildBondTradeContext(registry, ws);
        const bondAdj = resolveBondTradeBatchAdjustment({
            milestones: ws.playerNpcMilestones ?? {},
            registry: bondReg,
            npcAtLocation,
            commerce,
            markets,
            playerCommerce,
            tradeOps: ops,
        });
        if (bondAdj !== 0) {
            finalCommerce = {
                ...finalCommerce,
                credits: Math.max(0, finalCommerce.credits + bondAdj),
            };
        }
    }

    saveWorldState({ ...ws, markets: batch.markets });
    return {
        ...nextGame,
        commerce: finalCommerce,
    } as GameState;
}

function runNpcAgencyPhase(turnResult: TurnResult): void {
    const ops = parseNpcAgencyOps(turnResult.npcAgencyOps);
    if (ops.length === 0) {
        return;
    }
    const ws = loadWorldState();
    const registry = loadNpcRegistry();
    if (!ws) {
        return;
    }
    const positions = applyNpcAgencyOps(
        ws.npcPositions ?? {},
        ops,
        registryToAgencyLike(registry)
    );
    saveWorldState({ ...ws, npcPositions: positions });
}

function runRelationshipPhase(turnResult: TurnResult): void {
    const ops = parseRelationshipOps(turnResult.relationshipOps);
    if (ops.length === 0) {
        return;
    }
    const ws = loadWorldState();
    const registry = loadNpcRegistry();
    if (!ws) {
        return;
    }
    const relationships = applyRelationshipOps(
        ws.npcRelationships ?? {},
        ops,
        registryToAgencyLike(registry)
    );
    saveWorldState({ ...ws, npcRelationships: relationships });
}

export function applyLivingWorldTurnOps(
    turnResult: TurnResult,
    gameState: GameState
): GameState {
    const rules = loadGameRules();
    if (!isWorldForgeEnabled()) { return gameState; }

    const rawDoc = loadWorldForgeDocument();
    const commerce = parseCommerceForge(rawDoc?.commerce);

    const phases: LivingWorldTurnPhase[] = [...LIVING_WORLD_TURN_PHASES];
    let nextGame = gameState;

    for (const phase of phases) {
        if (phase === 'commerce' && rules.enableCommerce && commerce) {
            nextGame = runCommercePhase(turnResult, nextGame, commerce);
        } else if (phase === 'npc_agency' && rules.enableNpcAgency && rules.enableNpcRegistry) {
            runNpcAgencyPhase(turnResult);
        } else if (
            phase === 'relationship'
            && rules.enableNpcRelationships
            && rules.enableNpcAgency
            && rules.enableNpcRegistry
        ) {
            runRelationshipPhase(turnResult);
        }
    }

    return nextGame;
}