// Orchestrates one Living World tick: Tier 1 markets + Tier 2 NPC reactions.

import type {
    CommerceForge,
    MarketStateMap,
    NpcPositionsMap,
    NpcRegistryLike,
    PlayerCommerceState,
    WorldChangeEventLike,
} from './livingWorldTypes';
import { tickMarketRecovery } from './worldSimCommerceCore';
import { advanceNpcArrivals, reactNpcsToWorld } from './npcAgencyCore';

export interface WorldKitTickInput {
    forge: CommerceForge;
    markets: MarketStateMap;
    registry: NpcRegistryLike;
    npcPositions: NpcPositionsMap;
    worldTurn: number;
    recentChanges?: WorldChangeEventLike[];
    commerceEnabled: boolean;
    agencyEnabled: boolean;
}

export interface WorldKitTickResult {
    markets: MarketStateMap;
    npcPositions: NpcPositionsMap;
    marketSummary: ReturnType<typeof tickMarketRecovery>['summary'] | null;
    npcMoves: ReturnType<typeof reactNpcsToWorld>['moves'];
}

export function runLivingWorldTick(input: WorldKitTickInput): WorldKitTickResult {
    let markets = input.markets;
    let npcPositions = advanceNpcArrivals(input.npcPositions, input.worldTurn);
    let marketSummary: WorldKitTickResult['marketSummary'] = null;
    let npcMoves: WorldKitTickResult['npcMoves'] = [];

    if (input.commerceEnabled) {
        const tick = tickMarketRecovery(input.forge, markets, {
            worldTurn: input.worldTurn,
            recentChanges: input.recentChanges,
        });
        markets = tick.markets;
        marketSummary = tick.summary;
    }

    if (input.agencyEnabled) {
        const reaction = reactNpcsToWorld({
            forge: input.forge,
            markets,
            registry: input.registry,
            positions: npcPositions,
            worldTurn: input.worldTurn,
            recentChanges: input.recentChanges,
        });
        npcPositions = reaction.positions;
        npcMoves = reaction.moves;
    }

    return { markets, npcPositions, marketSummary, npcMoves };
}

export function defaultPlayerCommerce(
    forge: CommerceForge,
    credits = 500,
    role: PlayerCommerceState['playerRole'] = 'merchant'
): PlayerCommerceState {
    const transportId = forge.transportKinds[0]?.id ?? 'wagon';
    return { credits, cargo: [], transportId, playerRole: role };
}