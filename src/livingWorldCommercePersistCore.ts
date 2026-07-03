// LW1 PR3 — debounced commerce persist scheduling (pure, no vscode/fs).

export const COMMERCE_PERSIST_DEBOUNCE_MS = 80;

export interface CommercePersistPayload {
    baseRevision?: number;
    commerce?: Record<string, unknown>;
    markets?: Record<string, unknown>;
}

export interface CommercePersistScheduler {
    schedule(update: CommercePersistPayload): void;
    flush(): void;
    peek(): CommercePersistPayload | null;
    reset(): void;
}

export function createCommercePersistScheduler(
    onFlush: (payload: CommercePersistPayload) => void,
    debounceMs = COMMERCE_PERSIST_DEBOUNCE_MS,
    setTimer: typeof setTimeout = setTimeout,
    clearTimer: typeof clearTimeout = clearTimeout
): CommercePersistScheduler {
    let pending: CommercePersistPayload | null = null;
    let debounceTimer: ReturnType<typeof setTimeout> | undefined;

    function flush(): void {
        if (debounceTimer) {
            clearTimer(debounceTimer);
            debounceTimer = undefined;
        }
        const snap = pending;
        pending = null;
        if (snap) {
            onFlush(snap);
        }
    }

    return {
        schedule(update: CommercePersistPayload): void {
            pending = {
                ...pending,
                ...update,
                commerce: update.commerce ?? pending?.commerce,
                markets: update.markets ?? pending?.markets,
                baseRevision: update.baseRevision ?? pending?.baseRevision,
            };
            if (debounceTimer) {
                clearTimer(debounceTimer);
            }
            debounceTimer = setTimer(flush, debounceMs);
        },
        flush,
        peek(): CommercePersistPayload | null {
            return pending ? { ...pending } : null;
        },
        reset(): void {
            if (debounceTimer) {
                clearTimer(debounceTimer);
                debounceTimer = undefined;
            }
            pending = null;
        },
    };
}