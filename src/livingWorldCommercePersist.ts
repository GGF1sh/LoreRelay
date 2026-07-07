// LW1 PR3 — debounced commerce UI disk writes (game_state + world_state).

import type { GameState } from './types/GameState';
import type { MarketStateMap } from './livingWorldTypes';
import type { CommerceTradeEventDraft } from './livingWorldCommerceUiCore';
import { loadWorldState, saveWorldState } from './worldState';
import { commitGameState } from './stateManager';
import {
    createCommercePersistScheduler,
    type CommercePersistPayload,
} from './livingWorldCommercePersistCore';
import { executeCrossFileDualWrite } from './workspaceWriteCircuitBreakerCore';
import { recordSplitBrainRisk } from './workspaceWriteHealth';
import { makeWorldChangeEvent, mergeRecentChanges, type WorldChangeEvent } from './worldEventLogCore';

interface PendingCommercePersist {
    gameState?: GameState;
    baseRevision?: number;
    commerce?: GameState['commerce'];
    markets?: MarketStateMap;
    tradeEventDrafts?: CommerceTradeEventDraft[];
}

let pendingHost: PendingCommercePersist | null = null;
let commerceFlushInProgress = false;

function formatSignedGoldDelta(goldDelta: number): string {
    return goldDelta >= 0 ? `+${goldDelta}` : String(goldDelta);
}

function buildCommerceTradeEventMessage(draft: CommerceTradeEventDraft): string {
    const verb = draft.op === 'buy' ? 'Bought' : 'Sold';
    return `${verb} ${draft.qty} ${draft.commodityId} at ${draft.marketLocationId} (${formatSignedGoldDelta(draft.goldDelta)}G)`;
}

export function materializeCommerceTradeEventDrafts(
    drafts: readonly CommerceTradeEventDraft[],
    worldTurn: number
): WorldChangeEvent[] {
    return drafts.map((draft) => makeWorldChangeEvent({
        worldTurn,
        category: 'resource',
        severity: 'info',
        source: 'player',
        message: buildCommerceTradeEventMessage(draft),
        locationId: draft.marketLocationId,
        idSuffix: draft.draftId,
    }));
}

const scheduler = createCommercePersistScheduler((payload: CommercePersistPayload) => {
    const snap = pendingHost;
    pendingHost = null;
    if (!snap) {
        return;
    }

    const gameAttempted = Boolean(snap.gameState && snap.commerce !== undefined);
    const worldAttempted = Boolean(snap.markets || snap.tradeEventDrafts?.length);

    const outcome = executeCrossFileDualWrite({
        gameAttempted,
        worldAttempted,
        writeGame: () => {
            if (!gameAttempted || !snap.gameState || snap.commerce === undefined) {
                return true;
            }
            const next = { ...snap.gameState, commerce: snap.commerce } as GameState;
            const commit = commitGameState(next as unknown as Record<string, unknown>, {
                mode: 'salvage',
                baseRevision: snap.baseRevision ?? payload.baseRevision,
                mergeProfile: 'commerce-ui',
            });
            return commit.ok;
        },
        writeWorld: () => {
            if (!worldAttempted || !snap.markets) {
                return true;
            }
            const freshWs = loadWorldState();
            if (!freshWs) {
                return false;
            }
            let nextWs = snap.markets ? { ...freshWs, markets: snap.markets } : { ...freshWs };
            if (snap.tradeEventDrafts?.length) {
                try {
                    const events = materializeCommerceTradeEventDrafts(
                        snap.tradeEventDrafts,
                        freshWs.worldTurn
                    );
                    nextWs = {
                        ...nextWs,
                        recentChanges: mergeRecentChanges(freshWs.recentChanges ?? [], events),
                    };
                } catch (err) {
                    console.warn('[livingWorldCommercePersist] commerce trade event materialization failed:', err);
                }
            }
            return saveWorldState(nextWs);
        },
    });

    if (!outcome.ok) {
        console.error('[livingWorldCommercePersist] cross-file persist incomplete:', outcome);
    }
    recordSplitBrainRisk(outcome, 'livingWorldCommercePersist');
});

export function scheduleCommercePersist(update: PendingCommercePersist): void {
    pendingHost = {
        ...pendingHost,
        ...update,
        gameState: update.gameState ?? pendingHost?.gameState,
        commerce: update.commerce ?? pendingHost?.commerce,
        markets: update.markets ?? pendingHost?.markets,
        tradeEventDrafts: [
            ...(pendingHost?.tradeEventDrafts ?? []),
            ...(update.tradeEventDrafts ?? []),
        ],
        baseRevision: update.baseRevision ?? pendingHost?.baseRevision,
    };
    scheduler.schedule({
        baseRevision: pendingHost.baseRevision,
        commerce: pendingHost.commerce as Record<string, unknown> | undefined,
        markets: pendingHost.markets as Record<string, unknown> | undefined,
    });
}

export function isCommercePersistPending(): boolean {
    return pendingHost !== null || scheduler.peek() !== null;
}

/** Synchronous flush — safe to call from GM turn pre-hook and processTurnResult. */
export function flushScheduledCommercePersist(): void {
    if (commerceFlushInProgress) {
        return;
    }
    commerceFlushInProgress = true;
    try {
        scheduler.flush();
    } finally {
        commerceFlushInProgress = false;
    }
}

export function peekPendingCommercePersistForTests(): PendingCommercePersist | null {
    return pendingHost ? { ...pendingHost } : null;
}

export function resetCommercePersistForTests(): void {
    scheduler.reset();
    pendingHost = null;
}
