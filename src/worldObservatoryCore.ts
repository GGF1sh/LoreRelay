// World Observatory: pure helpers for the "watch the world change" dashboard.
// No vscode or fs imports — safe for Node.js test environment.

import type { MarketStateMap } from './livingWorldTypes';
import { MAX_MARKET_PRICE_HISTORY_POINTS } from './worldStateCore';

export type MarketPriceHistoryMap = Record<string, Record<string, number[]>>;

export { MAX_MARKET_PRICE_HISTORY_POINTS };

/**
 * Append the current priceIndex of every market/commodity onto the rolling history,
 * capping each series at MAX_MARKET_PRICE_HISTORY_POINTS (oldest dropped first).
 * Pure — returns a new object, never mutates its inputs.
 */
export function appendMarketPriceHistory(
    markets: MarketStateMap | undefined,
    history: MarketPriceHistoryMap | undefined
): MarketPriceHistoryMap | undefined {
    if (!markets || Object.keys(markets).length === 0) { return history; }

    const out: MarketPriceHistoryMap = {};
    for (const [locId, existingByCommodity] of Object.entries(history ?? {})) {
        out[locId] = { ...existingByCommodity };
    }

    for (const [locId, stocks] of Object.entries(markets)) {
        const locOut = { ...(out[locId] ?? {}) };
        for (const [commodityId, entry] of Object.entries(stocks)) {
            if (typeof entry?.priceIndex !== 'number' || !Number.isFinite(entry.priceIndex)) { continue; }
            const series = (locOut[commodityId] ?? []).slice();
            series.push(entry.priceIndex);
            if (series.length > MAX_MARKET_PRICE_HISTORY_POINTS) {
                series.splice(0, series.length - MAX_MARKET_PRICE_HISTORY_POINTS);
            }
            locOut[commodityId] = series;
        }
        if (Object.keys(locOut).length > 0) {
            out[locId] = locOut;
        }
    }

    return Object.keys(out).length > 0 ? out : undefined;
}

export type ObserverTickMode = 'watch' | 'advance';

export function normalizeObserverTickMode(raw: unknown): ObserverTickMode {
    return raw === 'advance' ? 'advance' : 'watch';
}

/** Hard cap on consecutive auto-observe ticks per session (before the webview must stop and re-arm). */
export const MAX_AUTO_OBSERVE_TICKS_PER_SESSION = 200;
/** Minimum interval between auto-observe ticks, in ms — guards against runaway recentChanges churn. */
export const MIN_AUTO_OBSERVE_INTERVAL_MS = 1000;
