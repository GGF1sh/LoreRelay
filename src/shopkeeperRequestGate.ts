export interface ShopkeeperRequestResult {
    type: 'shopkeeperDirectTradeResult';
    requestId: string;
    ok: boolean;
    [key: string]: unknown;
}

interface WorkspaceRequestState {
    activeRequestId?: string;
    activePromise?: Promise<ShopkeeperRequestResult>;
    completed: Map<string, ShopkeeperRequestResult>;
}

export interface ShopkeeperRequestGate {
    run(
        workspaceKey: string,
        requestId: string,
        execute: () => Promise<ShopkeeperRequestResult>
    ): Promise<ShopkeeperRequestResult>;
    clearWorkspace(workspaceKey: string): void;
    dispose(): void;
}

export function createShopkeeperRequestGate(maxCompletedPerWorkspace = 32): ShopkeeperRequestGate {
    const states = new Map<string, WorkspaceRequestState>();
    const cap = Math.max(1, Math.min(128, Math.floor(maxCompletedPerWorkspace)));

    function stateFor(workspaceKey: string): WorkspaceRequestState {
        let state = states.get(workspaceKey);
        if (!state) {
            state = { completed: new Map() };
            states.set(workspaceKey, state);
        }
        return state;
    }

    return {
        async run(workspaceKey, requestId, execute) {
            const state = stateFor(workspaceKey);
            const completed = state.completed.get(requestId);
            if (completed) { return completed; }
            if (state.activePromise) {
                if (state.activeRequestId === requestId) { return state.activePromise; }
                return {
                    type: 'shopkeeperDirectTradeResult', requestId, ok: false,
                    rejection: {
                        code: 'TRADE_IN_PROGRESS',
                        message: '別の取引を処理中です。',
                        nextStep: '処理完了後にもう一度確認してください。',
                    },
                };
            }

            state.activeRequestId = requestId;
            state.activePromise = Promise.resolve().then(execute);
            try {
                const result = await state.activePromise;
                state.completed.set(requestId, result);
                while (state.completed.size > cap) {
                    const oldest = state.completed.keys().next().value;
                    if (typeof oldest !== 'string') { break; }
                    state.completed.delete(oldest);
                }
                return result;
            } finally {
                state.activeRequestId = undefined;
                state.activePromise = undefined;
            }
        },
        clearWorkspace(workspaceKey) { states.delete(workspaceKey); },
        dispose() { states.clear(); },
    };
}
