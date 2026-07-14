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
    applyEconomyFlowMarketDeltas,
    computeEconomyFlowTick,
    type EconomyFlowTickResult,
} from './economyFlowCore';
import {
    resolveEconomyProfileParams,
    tickFactionReputationMarketDemand,
    tickMarketRecovery,
    type EconomyDifficultyConfig,
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
     * Economy pacing from game_rules.economyProfile (single global tier).
     * Missing/invalid → normal (legacy recovery and shock numbers).
     * Ignored when economyConfig is provided.
     */
    economyProfile?: EconomyProfile;
    /**
     * Per-world difficulty config (global + per-category + per-commodity tiers,
     * optional modifiers). When present, each commodity resolves its own knobs.
     * Empty/undefined → legacy single-tier behavior via economyProfile.
     */
    economyConfig?: EconomyDifficultyConfig;
}

export interface WorldKitTickResult {
    markets: MarketStateMap;
    npcPositions: NpcPositionsMap;
    marketSummary: ReturnType<typeof tickMarketRecovery>['summary'] | null;
    npcMoves: ReturnType<typeof reactNpcsToWorld>['moves'];
    /** Semantic flow summaries when resourceFlows ran; otherwise null. */
    economyFlow: EconomyFlowTickResult | null;
}

export function runLivingWorldTick(input: WorldKitTickInput): WorldKitTickResult {
    let markets = input.markets;
    let npcPositions = advanceNpcArrivals(input.npcPositions, input.worldTurn);
    let marketSummary: WorldKitTickResult['marketSummary'] = null;
    let npcMoves: WorldKitTickResult['npcMoves'] = [];
    let economyFlow: EconomyFlowTickResult | null = null;

    if (input.commerceEnabled) {
        // NOAI-ECON-FLOWS-002: opt-in production/demand/route before recovery.
        if (input.forge.resourceFlows) {
            economyFlow = computeEconomyFlowTick({
                definition: input.forge.resourceFlows,
                forge: input.forge,
                markets,
            });
            markets = applyEconomyFlowMarketDeltas(markets, economyFlow.marketDeltas);
        }

        const hasConfig = !!input.economyConfig && (
            input.economyConfig.globalTier !== undefined
            || input.economyConfig.categoryTiers !== undefined
            || input.economyConfig.commodityTiers !== undefined
            || input.economyConfig.modifiers !== undefined
        );
        const economyParams = resolveEconomyProfileParams(
            input.economyConfig?.globalTier ?? input.economyProfile
        );
        const tick = tickMarketRecovery(input.forge, markets, {
            worldTurn: input.worldTurn,
            stepEvents: input.stepEvents,
            // When a per-world config is present, per-commodity recovery governs;
            // otherwise the single global tier's recovery is used (legacy).
            recoveryPerTick: hasConfig ? undefined : economyParams.recoveryPerTick,
            economyParams,
            economyConfig: hasConfig ? input.economyConfig : undefined,
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

    return { markets, npcPositions, marketSummary, npcMoves, economyFlow };
}

export function defaultPlayerCommerce(
    forge: CommerceForge,
    credits = 500,
    role: PlayerCommerceState['playerRole'] = 'merchant'
): PlayerCommerceState {
    const transportId = forge.transportKinds[0]?.id ?? 'wagon';
    return { credits, cargo: [], transportId, food: 30, playerRole: role };
}
