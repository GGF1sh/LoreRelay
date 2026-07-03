// World Observatory — observer tick (host layer, needs workspace).
// Advances the world without a player turn: driven by the webview's "watch"/"advance" toggle,
// never by the GM. Writes only world_state.json (+ npc_registry.json) in 'watch' mode; 'advance'
// mode additionally deducts travel food via the same debounced, revision-checked game_state write
// path already used by the Commerce UI's direct-trade buttons (scheduleCommercePersist).

import * as fs from 'fs';
import type { GameRules } from './gameRules';
import { loadGameRules } from './gameRules';
import { loadWorldForge, loadWorldForgeDocument } from './worldForge';
import { ensureWorldStateExists, saveWorldState } from './worldState';
import { runOneWorldStep } from './emergentSimulator';
import { resolveCommerceForge } from './livingWorldBridge';
import { applyTravelFoodConsumption } from './livingWorldTurnOpsCore';
import { readStateRevision } from './workspaceStateQueueCore';
import { getGameStatePath } from './workspacePaths';
import { scheduleCommercePersist } from './livingWorldCommercePersist';
import type { GameState } from './types/GameState';
import {
    appendMarketPriceHistory,
    normalizeObserverTickMode,
    type ObserverTickMode,
} from './worldObservatoryCore';

/** Days advanced per observer tick when mode === 'advance' (kept small — this is a "watch" gesture, not a time-skip). */
const OBSERVER_ADVANCE_DAYS_PER_TICK = 1;

export function observerModeEnabled(rules: GameRules = loadGameRules()): boolean {
    return rules.enableWorldObservatory === true;
}

function readGameStateForObserver(): GameState | undefined {
    const statePath = getGameStatePath();
    if (!statePath || !fs.existsSync(statePath)) { return undefined; }
    try {
        return JSON.parse(fs.readFileSync(statePath, 'utf-8')) as GameState;
    } catch {
        return undefined;
    }
}

/**
 * 'advance' モードのみ: 作中 OBSERVER_ADVANCE_DAYS_PER_TICK 日ぶんの旅費食料を消費する。
 * Commerce が無効、または world_forge の commerce 定義が無い場合は無害に何もしない。
 * 既存の Commerce UI 直接取引(executeLivingWorldDirectTrade)と同じ非同期・楽観的並行制御
 * (readStateRevision + scheduleCommercePersist)を再利用し、game_state.json への書き込みを
 * Persist-Before-Narrate パイプライン外から安全に行う。
 */
function applyObserverAdvanceCost(rules: GameRules): void {
    if (rules.enableCommerce !== true) { return; }
    const forge = loadWorldForge();
    const rawDoc = loadWorldForgeDocument();
    const commerceForge = forge && rawDoc ? resolveCommerceForge(forge, rawDoc) : undefined;
    if (!commerceForge) { return; }

    const gameState = readGameStateForObserver();
    if (!gameState) { return; }
    const baseRevision = readStateRevision(gameState as unknown as Record<string, unknown>);

    const updated = applyTravelFoodConsumption(gameState, OBSERVER_ADVANCE_DAYS_PER_TICK, commerceForge);
    if (updated.commerce === gameState.commerce) { return; } // no-op (no transport / already at floor logic unchanged)

    scheduleCommercePersist({
        gameState: updated,
        baseRevision,
        commerce: updated.commerce,
    });
}

/**
 * 観測者モード: プレイヤーのターンなしで世界を1ティック進める。
 * mode==='watch' は world_state.json のみ変更(game_state.json には触れない)。
 * mode==='advance' はそれに加えて作中1日ぶんの資源消費を上記の安全な経路で反映する。
 */
export function runObserverWorldTick(rawMode: unknown): void {
    const rules = loadGameRules();
    if (!observerModeEnabled(rules)) { return; }

    const forge = loadWorldForge();
    if (!forge) { return; }

    const state = ensureWorldStateExists(forge);
    const mode: ObserverTickMode = normalizeObserverTickMode(rawMode);

    const { state: stepped } = runOneWorldStep(forge, state, rules);
    const next = stepped;
    next.marketPriceHistory = appendMarketPriceHistory(next.markets, next.marketPriceHistory);

    saveWorldState(next);

    if (mode === 'advance') {
        applyObserverAdvanceCost(rules);
    }
}
