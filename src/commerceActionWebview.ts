import { createCommerceActionRuntime } from './commerceActionRuntime';
import type { DeterministicWorkspaceMutationGate } from './deterministicWorkspaceMutationGate';
import type { GameActionId, GameActionReceipt } from './gameActionService';
import { shopkeeperRejectionText } from './shopkeeperDirectTradeCore';

type Runtime = Awaited<ReturnType<typeof createCommerceActionRuntime>>;
function doc(raw: unknown, fields: string[]): Record<string, unknown> | undefined {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
    const value = raw as Record<string, unknown>;
    return Object.keys(value).every(key => fields.includes(key)) ? value : undefined;
}
function failure(code = 'ACTION_NOT_CONFIRMED') {
    return { code, message: code === 'WORLD_MUTATION_IN_PROGRESS' ? '別の操作を確定中です。' : '操作結果を確認できませんでした。',
        nextStep: '現在の状態を確認し、確認画面を開き直してください。' };
}

/** Human-only adapter. No QA factory, role selector or arbitrary Action endpoint is
 * registered in the Webview transport. Confirmation comes from its confirm event. */
export function createCommerceActionWebviewAdapter(
    gate: DeterministicWorkspaceMutationGate,
    post: (message: Record<string, unknown>) => void,
    refresh: () => void,
) {
    let pending: Promise<{ runtime: Runtime; context: ReturnType<Runtime['service']['createTrustedSession']> }> | undefined;
    let generation = 0;
    async function session() {
        if (pending) {
            const prior = await pending;
            if (prior.runtime.authorized()) return prior;
            prior.runtime.service.close(prior.context);
            pending = undefined;
        }
        if (!pending) pending = createCommerceActionRuntime(gate).then(runtime => ({ runtime,
            context: runtime.service.createTrustedSession('human-player') })).catch(error => { pending = undefined; throw error; });
        return pending;
    }
    function dispose() {
        generation++;
        void pending?.then(({ runtime, context }) => runtime.service.close(context)).catch(() => {});
        pending = undefined;
    }
    async function preview(actionId: GameActionId, raw: unknown) {
        const type = actionId === 'commerce:trade' ? 'shopkeeperTradePreviewResult'
            : actionId === 'commerce:travel' ? 'marketTravelPreviewResult' : 'endDayPreviewResult';
        const allowed = actionId === 'commerce:trade' ? ['type', 'previewId', 'op', 'marketLocationId', 'commodityId', 'qty']
            : actionId === 'commerce:travel' ? ['type', 'destinationId'] : ['type'];
        const value = doc(raw, allowed);
        const requestGeneration = generation;
        const correlation = { ...(typeof value?.previewId === 'string' ? { previewId: value.previewId } : {}),
            ...(typeof value?.destinationId === 'string' ? { destinationId: value.destinationId } : {}) };
        try {
            if (!value) throw new Error('invalid');
            const { runtime, context } = await session();
            if (requestGeneration !== generation) return;
            if (actionId === 'commerce:travel' && value.destinationId === undefined) {
                const available = runtime.service.queryAvailable(context);
                const travel = available.actions.find(action => action.actionId === actionId)!;
                post({ type, ok: true, destinations: travel.estimate.destinations });
                return;
            }
            const parameters = actionId === 'commerce:trade' ? { op: value.op, marketLocationId: value.marketLocationId,
                commodityId: value.commodityId, qty: value.qty } : actionId === 'commerce:travel' ? { destinationId: value.destinationId } : {};
            const result = runtime.service.preview(context, { actionId, parameters });
            post({ type, ...correlation, ...result, ...(result.ok ? result.quote : { ...failure(), ...('code' in result && result.code ? shopkeeperRejectionText(result.code) : {}) }) });
        } catch { post({ type, ...correlation, ok: false, ...failure() }); }
    }
    async function execute(actionId: GameActionId, raw: unknown) {
        const type = actionId === 'commerce:trade' ? 'shopkeeperDirectTradeResult'
            : actionId === 'commerce:travel' ? 'marketTravelResult' : 'endDayResult';
        const fields = ['type', 'requestId', 'confirmationToken', ...(actionId === 'commerce:trade'
            ? ['op', 'marketLocationId', 'commodityId', 'qty'] : actionId === 'commerce:travel' ? ['destinationId'] : [])];
        const value = doc(raw, fields);
        const requestId = typeof value?.requestId === 'string' ? value.requestId : '';
        const requestGeneration = generation;
        try {
            if (!value) throw new Error('invalid');
            const { runtime, context } = await session();
            if (requestGeneration !== generation) return;
            if (typeof value.confirmationToken === 'string') runtime.service.confirm(context, value.confirmationToken, 'interactive');
            const parameters = actionId === 'commerce:trade' ? { op: value.op, marketLocationId: value.marketLocationId,
                commodityId: value.commodityId, qty: value.qty } : actionId === 'commerce:travel' ? { destinationId: value.destinationId } : {};
            const result: GameActionReceipt = await runtime.service.execute(context, { actionId, requestId, parameters, confirmationToken: value.confirmationToken });
            const ok = result.commitStatus === 'committed';
            let refreshFailed = false;
            if (ok) try { refresh(); } catch { refreshFailed = true; }
            const rejection = failure(result.classification === 'rejected_busy' ? 'WORLD_MUTATION_IN_PROGRESS' : result.classification);
            post({ type, requestId, ok, classification: refreshFailed ? 'committed_with_warning' : result.classification,
                commitStatus: result.commitStatus, ...(ok ? { receipt: { ...result.result, refreshFailed }, refreshFailed }
                    : { rejection, failure: rejection }) });
        } catch { post({ type, requestId, ok: false, classification: 'rejected_forbidden', failure: failure(), rejection: failure() }); }
    }
    return { preview, execute, dispose };
}
