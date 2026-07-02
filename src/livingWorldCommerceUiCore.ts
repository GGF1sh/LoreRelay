// LW1 v1+ — direct commerce UI (pure, no vscode/fs).

import type { CommerceForge, PlayerCommerceState, PlayerRole, TradeOp } from './livingWorldTypes';
import type { MarketStateMap } from './livingWorldTypes';
import { applyTradeOps, parseTradeOps } from './commerceCore';

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