// ECON-FLOWS-005D: cold-start read-only logistics preview derivation.
// Pure Core — no vscode, fs, time, randomness, persistence, or LLM.
// Never applies market deltas or advances world time.

import {
    computeEconomyFlowTick,
    type EconomyFlowDefinition,
    type EconomyFlowTickResult,
} from './economyFlowCore';
import {
    computeEconomyProcessingTick,
    type EconomyProcessingTickResult,
} from './economyProcessingCore';
import type { EconomyOperationalState } from './economyOperationalCore';
import type { CommerceForge, MarketStateMap } from './livingWorldTypes';

export type EconomyLogisticsPreviewFailReason = 'derive_failed';

export interface EconomyLogisticsPreviewInput {
    forge: Pick<CommerceForge, 'commodities' | 'markets'>;
    definition: EconomyFlowDefinition;
    /** Opening market stock map. Must not be mutated. */
    markets: MarketStateMap;
    operationalState?: EconomyOperationalState;
    /** Label only — never incremented. */
    worldTurn?: number;
}

export type EconomyLogisticsPreviewResult =
    | {
        ok: true;
        worldTurn: number;
        economyFlow: EconomyFlowTickResult;
        economyProcessing: EconomyProcessingTickResult | null;
    }
    | {
        ok: false;
        reason: EconomyLogisticsPreviewFailReason;
    };

function hasProcessingDefinitions(definition: EconomyFlowDefinition): boolean {
    const recipes = definition.processingRecipes;
    const sites = definition.processingSites;
    return (Array.isArray(recipes) && recipes.length > 0)
        || (Array.isArray(sites) && sites.length > 0);
}

function labelWorldTurn(value: unknown): number {
    if (typeof value !== 'number' || !Number.isFinite(value)) { return 0; }
    return Math.max(0, Math.floor(value));
}

/**
 * Deterministic read-only preview of one processing+flow step on the supplied
 * opening markets. Does not apply deltas, write state, or call tick recovery.
 */
export function deriveEconomyLogisticsPreview(
    input: EconomyLogisticsPreviewInput
): EconomyLogisticsPreviewResult {
    try {
        if (!input || typeof input !== 'object') {
            return { ok: false, reason: 'derive_failed' };
        }
        const forge = input.forge;
        const definition = input.definition;
        const markets = input.markets;
        if (!forge || !definition || !markets || typeof markets !== 'object') {
            return { ok: false, reason: 'derive_failed' };
        }
        if (!Array.isArray(forge.commodities) || !Array.isArray(forge.markets)) {
            return { ok: false, reason: 'derive_failed' };
        }
        if (!Array.isArray(definition.nodes)) {
            return { ok: false, reason: 'derive_failed' };
        }

        let economyProcessing: EconomyProcessingTickResult | null = null;
        let workingMarkets = markets;
        let additionalProduction: EconomyProcessingTickResult['runtimeProduction'] | undefined;

        if (hasProcessingDefinitions(definition)) {
            economyProcessing = computeEconomyProcessingTick({
                definition,
                forge,
                markets: workingMarkets,
                operationalState: input.operationalState,
            });
            // Preview must not apply input-consumption deltas to canonical state.
            // Flow still needs post-consumption stock for demand math: build a
            // temporary in-memory market map only when processing consumed stock.
            if (economyProcessing.inputMarketDeltas.length > 0) {
                workingMarkets = applyDeltasInMemoryOnly(
                    workingMarkets,
                    economyProcessing.inputMarketDeltas
                );
            }
            if (economyProcessing.runtimeProduction.length > 0) {
                additionalProduction = economyProcessing.runtimeProduction;
            }
        }

        const economyFlow = computeEconomyFlowTick({
            definition,
            forge,
            markets: workingMarkets,
            additionalProduction,
            operationalState: input.operationalState,
        });

        // Intentionally ignore economyFlow.marketDeltas — never apply.
        return {
            ok: true,
            worldTurn: labelWorldTurn(input.worldTurn),
            economyFlow,
            economyProcessing,
        };
    } catch {
        return { ok: false, reason: 'derive_failed' };
    }
}

/**
 * Local shallow clone apply for preview-only processing consumption.
 * Does not share object identity with the input map/entries that change.
 */
function applyDeltasInMemoryOnly(
    markets: MarketStateMap,
    deltas: readonly { marketLocationId: string; commodityId: string; delta: number }[]
): MarketStateMap {
    let out: MarketStateMap | null = null;
    for (const d of deltas) {
        if (!d || typeof d.marketLocationId !== 'string' || typeof d.commodityId !== 'string') {
            continue;
        }
        if (typeof d.delta !== 'number' || !Number.isFinite(d.delta)) { continue; }
        const srcMarket = (out ?? markets)[d.marketLocationId];
        if (!srcMarket) { continue; }
        const entry = srcMarket[d.commodityId];
        if (!entry || typeof entry.stock !== 'number' || !Number.isFinite(entry.stock)) { continue; }
        const nextStock = Math.max(0, entry.stock + d.delta);
        if (nextStock === entry.stock) { continue; }
        if (!out) { out = { ...markets }; }
        if (out[d.marketLocationId] === markets[d.marketLocationId]) {
            out[d.marketLocationId] = { ...srcMarket };
        }
        out[d.marketLocationId][d.commodityId] = {
            stock: Object.is(nextStock, -0) ? 0 : nextStock,
            priceIndex: entry.priceIndex,
        };
    }
    return out ?? markets;
}
