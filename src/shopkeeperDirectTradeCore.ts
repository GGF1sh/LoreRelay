import { cargoWeight } from './commerceCore';
import { executeDirectTrade, type DirectTradeInput, type DirectTradeResult } from './livingWorldCommerceUiCore';
import type { CommerceForge, MarketStateMap, PlayerCommerceState } from './livingWorldTypes';

export type ShopkeeperIntent = Pick<DirectTradeInput, 'op' | 'marketLocationId' | 'commodityId' | 'qty'>;

export interface ShopkeeperSnapshot {
    currentLocationId: string;
    credits: number;
    cargoWeight: number;
    cargoCapacity: number;
    commodities: Array<{
        commodityId: string;
        commodityName: string;
        buyPrice: number;
        sellPrice: number;
        stock: number;
        heldQty: number;
    }>;
}

export interface ShopkeeperReceipt {
    ok: boolean;
    op: 'buy' | 'sell';
    commodityId: string;
    qty: number;
    credits: { before: number; after: number };
    cargoWeight: { before: number; after: number };
    marketStock: { before: number; after: number };
    unitPrice: number;
    total: number;
    persistenceOk: boolean;
    eventId?: string;
    rejection?: { code: string; message: string; nextStep: string };
}

const REJECTIONS: Record<string, { message: string; nextStep: string }> = {
    INSUFFICIENT_CREDITS: { message: '所持金が足りません。', nextStep: '数量を減らしてください。' },
    INSUFFICIENT_CARGO: { message: '売却する荷物を持っていません。', nextStep: '所持品を確認してください。' },
    INSUFFICIENT_STOCK: { message: 'この市場の在庫が足りません。', nextStep: '数量を減らしてください。' },
    CARGO_CAPACITY: { message: '積載量の上限を超えています。', nextStep: '数量を減らしてください。' },
    NOT_TRADED_HERE: { message: 'この品はこの市場では取引されていません。', nextStep: '別の品目を選んでください。' },
    INVALID_QTY: { message: '数量が正しくありません。', nextStep: '1以上の整数を入力してください。' },
    WRONG_LOCATION: { message: '現在地と市場が一致していません。', nextStep: '現在地を確認してください。' },
};

export function parseShopkeeperIntent(raw: unknown): ShopkeeperIntent | undefined {
    const value = raw && typeof raw === 'object' ? raw as Record<string, unknown> : undefined;
    const op = value?.op;
    const marketLocationId = value?.marketLocationId;
    const commodityId = value?.commodityId;
    const qty = typeof value?.qty === 'number' ? value.qty : Number(value?.qty);
    if ((op !== 'buy' && op !== 'sell') || typeof marketLocationId !== 'string' || !marketLocationId
        || typeof commodityId !== 'string' || !commodityId || !Number.isFinite(qty)) {
        return undefined;
    }
    return { op, marketLocationId, commodityId, qty };
}

export function buildShopkeeperSnapshot(
    forge: CommerceForge,
    markets: MarketStateMap,
    commerce: PlayerCommerceState,
    currentLocationId: string
): ShopkeeperSnapshot {
    const market = markets[currentLocationId];
    const local = forge.markets.find((entry) => entry.locationId === currentLocationId);
    const byId = new Map(forge.commodities.map((item) => [item.id, item]));
    const held = new Map((commerce.cargo ?? []).map((item) => [item.commodityId, item.qty]));
    const cargoCapacity = forge.transportKinds.find((item) => item.id === commerce.transportId)?.capacity ?? 0;
    return {
        currentLocationId,
        credits: commerce.credits,
        cargoWeight: cargoWeight(forge, commerce.cargo ?? []),
        cargoCapacity,
        commodities: (local?.commodityIds ?? []).flatMap((commodityId) => {
            const definition = byId.get(commodityId);
            const state = market?.[commodityId];
            if (!definition || !state) { return []; }
            const buyPrice = Math.max(1, Math.round(definition.basePrice * state.priceIndex));
            return [{
                commodityId,
                commodityName: definition.name,
                buyPrice,
                sellPrice: Math.max(1, Math.floor(buyPrice * 0.8)),
                stock: state.stock,
                heldQty: held.get(commodityId) ?? 0,
            }];
        }),
    };
}

function rejectionFor(result: DirectTradeResult): ShopkeeperReceipt['rejection'] {
    const code = !result.ok && (result.code || result.reason) || 'TRADE_FAILED';
    const mapped = REJECTIONS[code] ?? { message: result.ok ? '' : (result.message || '取引を実行できませんでした。'), nextStep: '現在の市場と所持品を確認してください。' };
    return { code, ...mapped };
}

export function executeShopkeeperTrade(
    forge: CommerceForge,
    markets: MarketStateMap,
    commerce: PlayerCommerceState,
    currentLocationId: string,
    intent: ShopkeeperIntent,
    persistenceOk = true,
    eventId?: string
): ShopkeeperReceipt {
    const before = buildShopkeeperSnapshot(forge, markets, commerce, currentLocationId);
    const quote = before.commodities.find((item) => item.commodityId === intent.commodityId);
    const unitPrice = intent.op === 'sell' ? quote?.sellPrice ?? 0 : quote?.buyPrice ?? 0;
    const beforeStock = quote?.stock ?? 0;
    const result = executeDirectTrade(forge, markets, commerce, { ...intent, currentLocationId });
    if (!result.ok || !persistenceOk) {
        return {
            ok: false, op: intent.op, commodityId: intent.commodityId, qty: intent.qty,
            credits: { before: commerce.credits, after: commerce.credits },
            cargoWeight: { before: before.cargoWeight, after: before.cargoWeight },
            marketStock: { before: beforeStock, after: beforeStock }, unitPrice, total: unitPrice * intent.qty,
            persistenceOk, eventId, rejection: persistenceOk ? rejectionFor(result) : {
                code: 'PERSIST_FAILED', message: '取引結果を保存できませんでした。', nextStep: '現在の状態を確認してから再試行してください。',
            },
        };
    }
    const after = buildShopkeeperSnapshot(forge, result.markets, result.commerce, currentLocationId);
    const afterQuote = after.commodities.find((item) => item.commodityId === intent.commodityId);
    return {
        ok: true, op: intent.op, commodityId: intent.commodityId, qty: intent.qty,
        credits: { before: commerce.credits, after: result.commerce.credits },
        cargoWeight: { before: before.cargoWeight, after: after.cargoWeight },
        marketStock: { before: beforeStock, after: afterQuote?.stock ?? beforeStock },
        unitPrice, total: intent.op === 'buy' ? result.totalCost : result.totalRevenue,
        persistenceOk: true, eventId,
    };
}

export function shopkeeperRejectionText(code: string): { message: string; nextStep: string } {
    return REJECTIONS[code] ?? { message: '取引を実行できませんでした。', nextStep: '現在の市場と所持品を確認してください。' };
}
