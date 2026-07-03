// LW1 PR3 — debounced commerce UI disk writes (game_state + world_state).

import type { GameState } from './types/GameState';
import type { MarketStateMap } from './livingWorldTypes';
import { loadWorldState, saveWorldState } from './worldState';
import { commitGameState } from './stateManager';
import {
    createCommercePersistScheduler,
    type CommercePersistPayload,
} from './livingWorldCommercePersistCore';

interface PendingCommercePersist {
    gameState?: GameState;
    baseRevision?: number;
    commerce?: GameState['commerce'];
    markets?: MarketStateMap;
}

let pendingHost: PendingCommercePersist | null = null;

const scheduler = createCommercePersistScheduler((payload: CommercePersistPayload) => {
    const snap = pendingHost;
    pendingHost = null;
    if (!snap) {
        return;
    }

    if (snap.gameState && snap.commerce !== undefined) {
        const next = { ...snap.gameState, commerce: snap.commerce } as GameState;
        commitGameState(next as unknown as Record<string, unknown>, {
            mode: 'salvage',
            baseRevision: snap.baseRevision ?? payload.baseRevision,
            mergeProfile: 'commerce-ui',
        });
    }

    if (snap.markets) {
        const freshWs = loadWorldState();
        if (freshWs) {
            saveWorldState({ ...freshWs, markets: snap.markets });
        }
    }
});

export function scheduleCommercePersist(update: PendingCommercePersist): void {
    pendingHost = {
        ...pendingHost,
        ...update,
        gameState: update.gameState ?? pendingHost?.gameState,
        commerce: update.commerce ?? pendingHost?.commerce,
        markets: update.markets ?? pendingHost?.markets,
        baseRevision: update.baseRevision ?? pendingHost?.baseRevision,
    };
    scheduler.schedule({
        baseRevision: pendingHost.baseRevision,
        commerce: pendingHost.commerce as Record<string, unknown> | undefined,
        markets: pendingHost.markets as Record<string, unknown> | undefined,
    });
}

export function flushScheduledCommercePersist(): void {
    scheduler.flush();
}

export function peekPendingCommercePersistForTests(): PendingCommercePersist | null {
    return pendingHost ? { ...pendingHost } : null;
}

export function resetCommercePersistForTests(): void {
    scheduler.reset();
    pendingHost = null;
}