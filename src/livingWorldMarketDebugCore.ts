// Pure market debug helpers (no vscode/fs).

import type { CommerceForge, MarketStateMap } from './livingWorldTypes';
import { initializeMarketState } from './commerceCore';
import { applyMarketPriceMultiplier } from './worldSimCommerceCore';

export interface MarketPriceDebugOp {
    locationId: string;
    commodityId: string;
    multiplier: number;
}

export function applyMarketPriceDebugOps(
    commerce: CommerceForge,
    markets: MarketStateMap | undefined,
    ops: MarketPriceDebugOp[]
): { markets: MarketStateMap; applied: number } {
    let next = markets && Object.keys(markets).length > 0
        ? markets
        : initializeMarketState(commerce);
    let applied = 0;
    for (const op of ops.slice(0, 16)) {
        const result = applyMarketPriceMultiplier(
            next,
            op.locationId,
            op.commodityId,
            op.multiplier
        );
        next = result.markets;
        if (result.applied) { applied++; }
    }
    return { markets: next, applied };
}