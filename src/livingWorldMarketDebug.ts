// Inspector / debug market price tweaks (host layer).

import { loadGameRules } from './gameRules';
import { loadWorldForgeDocument } from './worldForge';
import { loadWorldState, saveWorldState } from './worldState';
import { parseCommerceForge } from './livingWorldForgeCore';
import {
    applyMarketPriceDebugOps,
    type MarketPriceDebugOp,
} from './livingWorldMarketDebugCore';

export type LivingWorldMarketDebugResult =
    | { ok: true; applied: number }
    | { ok: false; reason: 'COMMERCE_OFF' | 'NO_COMMERCE' | 'NO_WORLD_STATE' | 'NOT_APPLIED' };

export function applyLivingWorldMarketDebugOps(
    ops: MarketPriceDebugOp[]
): LivingWorldMarketDebugResult {
    const rules = loadGameRules();
    if (!rules.enableCommerce) {
        return { ok: false, reason: 'COMMERCE_OFF' };
    }
    const rawDoc = loadWorldForgeDocument();
    const commerce = parseCommerceForge(rawDoc?.commerce);
    if (!commerce) {
        return { ok: false, reason: 'NO_COMMERCE' };
    }
    const ws = loadWorldState();
    if (!ws) {
        return { ok: false, reason: 'NO_WORLD_STATE' };
    }
    const batch = applyMarketPriceDebugOps(commerce, ws.markets, ops);
    if (batch.applied === 0) {
        return { ok: false, reason: 'NOT_APPLIED' };
    }
    saveWorldState({ ...ws, markets: batch.markets });
    return { ok: true, applied: batch.applied };
}