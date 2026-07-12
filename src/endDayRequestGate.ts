export interface EndDayRequestResult {
    type: 'endDayResult';
    requestId: string;
    ok: boolean;
    [key: string]: unknown;
}

interface WorkspaceRequestState {
    activeRequestId?: string;
    activePromise?: Promise<EndDayRequestResult>;
    completed: Map<string, EndDayRequestResult>;
}

export interface EndDayRequestGate {
    run(workspaceKey: string, requestId: string, execute: () => Promise<EndDayRequestResult>): Promise<EndDayRequestResult>;
    clearWorkspace(workspaceKey: string): void;
    dispose(): void;
}

/** Narrow P3 gate: one end-day mutation per workspace, with bounded replay receipts. */
export function createEndDayRequestGate(maxCompletedPerWorkspace = 32): EndDayRequestGate {
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
                    type: 'endDayResult', requestId, ok: false,
                    failure: {
                        code: 'BUSY',
                        message: '別の日の処理を確認中です。',
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
