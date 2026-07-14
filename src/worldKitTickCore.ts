// Orchestrates one Living World tick: Tier 1 markets + Tier 2 NPC reactions.

import type {
    CommerceForge,
    MarketStateMap,
    NpcPositionsMap,
    NpcRegistryLike,
    PlayerCommerceState,
    WorldChangeEventLike,
} from './livingWorldTypes';
import {
    resolveEconomyProfileParams,
    tickFactionReputationMarketDemand,
    tickMarketRecovery,
    type EconomyProfile,
} from './worldSimCommerceCore';
import { advanceNpcArrivals, reactNpcsToWorld } from './npcAgencyCore';

export interface WorldKitTickInput {
    forge: CommerceForge;
    markets: MarketStateMap;
    registry: NpcRegistryLike;
    npcPositions: NpcPositionsMap;
    worldTurn: number;
    /** この sim tick で新規発生したイベントのみ。市場/NPC反応の mutation 入力。 */
    stepEvents?: WorldChangeEventLike[];
    commerceEnabled: boolean;
    agencyEnabled: boolean;
    /** Market locationId -> controlling factionId (undefined = no faction demand drift there). */
    marketFactionIds?: Record<string, string | undefined>;
    /** factionId -> player reputation (-100..100); only used when marketFactionIds is set. */
    factionReputations?: Record<string, number>;
    /** 名ありNPCの上限(game_rules.maxNamedNpcCount)。未指定時は npcAgencyCore の既定値。 */
    maxNamedNpcCount?: number;
    /**
     * Economy pacing from game_rules.economyProfile.
     * Missing/invalid → normal (legacy recovery and shock numbers).
     */
    economyProfile?: EconomyProfile;
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
        const economyParams = resolveEconomyProfileParams(input.economyProfile);
        const tick = tickMarketRecovery(input.forge, markets, {
            worldTurn: input.worldTurn,
            stepEvents: input.stepEvents,
            recoveryPerTick: economyParams.recoveryPerTick,
            economyParams,
        });
        markets = tick.markets;
        marketSummary = tick.summary;

        if (input.marketFactionIds && input.factionReputations) {
            markets = tickFactionReputationMarketDemand(
                input.forge,
                markets,
                input.marketFactionIds,
                input.factionReputations
            ).markets;
        }
    }

    if (input.agencyEnabled) {
        const reaction = reactNpcsToWorld({
            forge: input.forge,
            markets,
            registry: input.registry,
            positions: npcPositions,
            worldTurn: input.worldTurn,
            stepEvents: input.stepEvents,
            maxNamedNpcCount: input.maxNamedNpcCount,
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
    return { credits, cargo: [], transportId, food: 30, playerRole: role };
}