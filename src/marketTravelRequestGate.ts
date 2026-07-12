export interface MarketTravelRequestResult {
    type: 'marketTravelResult';
    requestId: string;
    ok: boolean;
    [key: string]: unknown;
}

interface WorkspaceRequestState {
    activeRequestId?: string;
    activePromise?: Promise<MarketTravelRequestResult>;
    completed: Map<string, MarketTravelRequestResult>;
}

export interface MarketTravelRequestGate {
    run(workspaceKey: string, requestId: string, execute: () => Promise<MarketTravelRequestResult>): Promise<MarketTravelRequestResult>;
    clearWorkspace(workspaceKey: string): void;
    dispose(): void;
}

/** Narrow P4 gate: one market travel mutation per workspace, with bounded replay receipts. */
export function createMarketTravelRequestGate(maxCompletedPerWorkspace = 32): MarketTravelRequestGate {
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
                const busy: MarketTravelRequestResult = {
                    type: 'marketTravelResult', requestId, ok: false,
                    failure: {
                        code: 'BUSY',
                        message: '別の移動処理を確認中です。',
                        nextStep: '処理の完了後に、新しい受付番号でやり直してください。',
                    },
                };
                state.completed.set(requestId, busy);
                while (state.completed.size > cap) {
                    const oldest = state.completed.keys().next().value;
                    if (typeof oldest !== 'string') { break; }
                    state.completed.delete(oldest);
                }
                return busy;
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
