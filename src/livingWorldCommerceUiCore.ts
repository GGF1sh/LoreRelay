// LW1 v1+ — direct commerce UI (pure, no vscode/fs).

import type { CommerceForge, PlayerCommerceState, PlayerRole, TradeOp } from './livingWorldTypes';
import type { LocationGraphNode, MarketStateMap, RegionGraphNode, WorldChangeEventLike } from './livingWorldTypes';
import { isFoodCrisisEvent } from './livingWorldTypes';
import { applyTradeOps, cargoWeight, parseTradeOps } from './commerceCore';
import { reputationTier } from './factionReputationCore';
import { planTravel } from './transportCore';

export const PLAYER_ROLES: readonly PlayerRole[] = [
    'merchant',
    'adventurer',
    'retainer',
    'smith',
    'ruler',
];

export function isValidPlayerRole(raw: unknown): raw is PlayerRole {
    return typeof raw === 'string' && (PLAYER_ROLES as readonly string[]).includes(raw);
}

export function resolveDefaultPlayerRole(
    rulesRole: unknown,
    commerceRole: unknown
): PlayerRole {
    if (isValidPlayerRole(commerceRole)) { return commerceRole; }
    if (isValidPlayerRole(rulesRole)) { return rulesRole; }
    return 'merchant';
}

export interface DirectTradeInput {
    op: 'buy' | 'sell';
    marketLocationId: string;
    commodityId: string;
    qty: number;
    currentLocationId?: string;
}

export interface CommerceTradeEventDraft {
    draftId: string;
    op: 'buy' | 'sell';
    marketLocationId: string;
    commodityId: string;
    qty: number;
    goldDelta: number;
}

export type DirectTradeFailureReason =
    | 'INVALID_OP'
    | 'INVALID_QTY'
    | 'WRONG_LOCATION'
    | 'TRADE_FAILED';

export interface DirectTradeSuccess {
    ok: true;
    commerce: PlayerCommerceState;
    markets: MarketStateMap;
    applied: number;
    totalCost: number;
    totalRevenue: number;
}

export interface DirectTradeFailure {
    ok: false;
    reason: DirectTradeFailureReason;
    code?: string;
    message?: string;
}

export type DirectTradeResult = DirectTradeSuccess | DirectTradeFailure;

export interface CommerceDecisionSurfaceQuoteInput {
    commodityId: string;
    commodityName: string;
    unitPrice: number;
    stock: number;
    priceIndex: number;
}

export interface CommerceDecisionSurfaceMarketInput {
    locationId: string;
    locationName: string;
    quotes: CommerceDecisionSurfaceQuoteInput[];
}

export type CommerceDecisionSurfaceEvidenceKind =
    | 'recent_event'
    | 'reputation_hostile'
    | 'reputation_unfriendly'
    | 'reputation_friendly'
    | 'reputation_allied'
    | 'low_stock';

export interface CommerceDecisionSurfaceQuote {
    commodityId: string;
    localUnitPrice: number;
    remoteUnitPrice: number;
    pressurePct: number;
    evidence: CommerceDecisionSurfaceEvidenceKind[];
    travelPreview: {
        days: number;
        foodCost: number;
        transportName: string;
    };
}

export interface CommerceDecisionSurfaceMarket {
    locationId: string;
    quotes: CommerceDecisionSurfaceQuote[];
}

export interface CommerceDecisionSurfaceInput {
    commerceForge: CommerceForge;
    marketTables: CommerceDecisionSurfaceMarketInput[];
    playerCommerce: Pick<PlayerCommerceState, 'cargo' | 'transportId'> | null | undefined;
    currentLocationId?: string | null;
    locations: LocationGraphNode[];
    regions?: RegionGraphNode[];
    discoveredLocationIds?: readonly string[];
    discoveredRegionIds?: readonly string[];
    recentChanges?: readonly WorldChangeEventLike[];
    marketFactionIds?: Record<string, string | undefined>;
    factionReputations?: Record<string, number | undefined>;
}

function quoteByCommodity(
    market: CommerceDecisionSurfaceMarketInput | undefined,
    commodityId: string
): CommerceDecisionSurfaceQuoteInput | undefined {
    return market?.quotes.find((quote) => quote.commodityId === commodityId);
}

function heldCargoQty(
    commerce: Pick<PlayerCommerceState, 'cargo'> | null | undefined,
    commodityId: string
): number {
    return commerce?.cargo?.find((entry) => entry.commodityId === commodityId)?.qty ?? 0;
}

function marketRegionId(forge: CommerceForge, locationId: string): string | undefined {
    return forge.markets.find((market) => market.locationId === locationId)?.regionId;
}

function isRemoteLocationDiscovered(input: CommerceDecisionSurfaceInput, locationId: string, regionId?: string): boolean {
    if (input.discoveredLocationIds) {
        return input.discoveredLocationIds.includes(locationId);
    }
    if (regionId) {
        return (input.discoveredRegionIds ?? []).includes(regionId);
    }
    return false;
}

function lowStockEvidence(forge: CommerceForge, locationId: string, commodityId: string, stock: number): boolean {
    const market = forge.markets.find((entry) => entry.locationId === locationId);
    if (!market?.commodityIds.includes(commodityId)) { return false; }
    const targetStock = market.targetStock;
    return typeof targetStock === 'number' && targetStock > 0 && stock < targetStock * 0.3;
}

function recentFoodEventEvidence(
    events: readonly WorldChangeEventLike[] | undefined,
    marketRegionIdValue: string | undefined,
    commodityId: string
): boolean {
    if (commodityId !== 'wheat') { return false; }
    return (events ?? []).some((event) => {
        if (event.category !== 'resource' || !isFoodCrisisEvent(event)) { return false; }
        if (event.regionId) { return event.regionId === marketRegionIdValue; }
        return true;
    });
}

function reputationEvidence(
    marketFactionIds: Record<string, string | undefined> | undefined,
    factionReputations: Record<string, number | undefined> | undefined,
    locationId: string
): CommerceDecisionSurfaceEvidenceKind | undefined {
    const factionId = marketFactionIds?.[locationId];
    if (!factionId) { return undefined; }
    const rep = factionReputations?.[factionId];
    if (typeof rep !== 'number') { return undefined; }
    const tier = reputationTier(rep);
    if (tier === 'neutral') { return undefined; }
    return `reputation_${tier}` as CommerceDecisionSurfaceEvidenceKind;
}

function buildEvidence(input: {
    forge: CommerceForge;
    locationId: string;
    commodityId: string;
    stock: number;
    marketRegionId?: string;
    recentChanges?: readonly WorldChangeEventLike[];
    marketFactionIds?: Record<string, string | undefined>;
    factionReputations?: Record<string, number | undefined>;
}): CommerceDecisionSurfaceEvidenceKind[] {
    const evidence: CommerceDecisionSurfaceEvidenceKind[] = [];
    if (recentFoodEventEvidence(input.recentChanges, input.marketRegionId, input.commodityId)) {
        evidence.push('recent_event');
    }
    const reputation = reputationEvidence(input.marketFactionIds, input.factionReputations, input.locationId);
    if (reputation) {
        evidence.push(reputation);
    }
    if (lowStockEvidence(input.forge, input.locationId, input.commodityId, input.stock)) {
        evidence.push('low_stock');
    }
    return evidence;
}

export function buildCommerceDecisionSurface(
    input: CommerceDecisionSurfaceInput
): CommerceDecisionSurfaceMarket[] {
    const currentLocationId = input.currentLocationId ?? undefined;
    if (!currentLocationId || !input.playerCommerce) { return []; }

    const currentMarket = input.marketTables.find((market) => market.locationId === currentLocationId);
    if (!currentMarket) { return []; }

    const cargoW = cargoWeight(input.commerceForge, input.playerCommerce.cargo ?? []);
    const out: CommerceDecisionSurfaceMarket[] = [];

    for (const market of input.marketTables) {
        if (market.locationId === currentLocationId) { continue; }
        const regionId = marketRegionId(input.commerceForge, market.locationId)
            ?? input.locations.find((loc) => loc.id === market.locationId)?.regionId;
        if (!isRemoteLocationDiscovered(input, market.locationId, regionId)) { continue; }

        const travel = planTravel({
            fromLocationId: currentLocationId,
            toLocationId: market.locationId,
            locations: input.locations,
            regions: input.regions,
            transportId: input.playerCommerce.transportId,
            forge: input.commerceForge,
        }, cargoW);
        if (!travel) { continue; }

        const quotes: CommerceDecisionSurfaceQuote[] = [];
        for (const remoteQuote of market.quotes) {
            if (heldCargoQty(input.playerCommerce, remoteQuote.commodityId) <= 0) { continue; }
            const localQuote = quoteByCommodity(currentMarket, remoteQuote.commodityId);
            if (!localQuote) { continue; }
            if (remoteQuote.unitPrice <= localQuote.unitPrice) { continue; }
            const pressurePct = Math.round((remoteQuote.priceIndex - 1) * 100);
            quotes.push({
                commodityId: remoteQuote.commodityId,
                localUnitPrice: localQuote.unitPrice,
                remoteUnitPrice: remoteQuote.unitPrice,
                pressurePct,
                evidence: buildEvidence({
                    forge: input.commerceForge,
                    locationId: market.locationId,
                    commodityId: remoteQuote.commodityId,
                    stock: remoteQuote.stock,
                    marketRegionId: regionId,
                    recentChanges: input.recentChanges,
                    marketFactionIds: input.marketFactionIds,
                    factionReputations: input.factionReputations,
                }),
                travelPreview: {
                    days: travel.days,
                    foodCost: travel.foodCost,
                    transportName: travel.transportName,
                },
            });
        }
        if (quotes.length > 0) {
            out.push({ locationId: market.locationId, quotes });
        }
    }

    return out;
}

export function executeDirectTrade(
    forge: CommerceForge,
    markets: MarketStateMap,
    commerce: PlayerCommerceState,
    input: DirectTradeInput
): DirectTradeResult {
    if (input.op !== 'buy' && input.op !== 'sell') {
        return { ok: false, reason: 'INVALID_OP' };
    }
    const qty = Math.floor(input.qty);
    if (qty < 1 || qty > 999) {
        return { ok: false, reason: 'INVALID_QTY' };
    }
    if (
        input.currentLocationId
        && input.marketLocationId !== input.currentLocationId
    ) {
        return { ok: false, reason: 'WRONG_LOCATION' };
    }

    const ops = parseTradeOps([{
        op: input.op,
        marketLocationId: input.marketLocationId,
        commodityId: input.commodityId,
        qty,
    } satisfies TradeOp]);

    if (ops.length === 0) {
        return { ok: false, reason: 'INVALID_OP' };
    }

    const batch = applyTradeOps(forge, markets, commerce, ops);
    if (!batch.ok) {
        return {
            ok: false,
            reason: 'TRADE_FAILED',
            code: batch.error.code,
            message: batch.error.message,
        };
    }

    return {
        ok: true,
        commerce: batch.commerce,
        markets: batch.markets,
        applied: batch.applied,
        totalCost: batch.totalCost,
        totalRevenue: batch.totalRevenue,
    };
}
