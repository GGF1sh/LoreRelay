/** Closed QA vocabulary. Never used as a player capability factory. */
export const LIVE_QA_OPERATIONS = [
    'read_player_view', 'query_available', 'preview', 'execute', 'wait_receipt',
    'inspect', 'checkpoint_list', 'checkpoint_save', 'checkpoint_restore',
    'reopen', 'reload', 'stop',
] as const;
export type LiveQaOperation = typeof LIVE_QA_OPERATIONS[number];
export interface LiveQaRequest {
    id: string; session: string; op: LiveQaOperation; args: Record<string, unknown>;
}
export function parseLiveQaRequest(value: unknown): LiveQaRequest | undefined {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return;
    const v = value as Record<string, unknown>;
    if (Object.keys(v).some(key => !['id', 'session', 'op', 'args'].includes(key))
        || typeof v.id !== 'string' || !/^[a-zA-Z0-9_-]{8,128}$/.test(v.id)
        || typeof v.session !== 'string' || typeof v.op !== 'string'
        || !LIVE_QA_OPERATIONS.includes(v.op as LiveQaOperation)
        || !v.args || typeof v.args !== 'object' || Array.isArray(v.args)) return;
    const args = v.args as Record<string, unknown>;
    const fields = v.op === 'preview' ? ['actionId', 'parameters', 'expectedActionSetHash']
        : v.op === 'execute' ? ['actionId', 'requestId', 'parameters', 'expectedActionSetHash', 'confirmationToken']
        : v.op === 'wait_receipt' ? ['requestId', 'timeoutMs']
        : v.op === 'checkpoint_restore' ? ['checkpointId'] : [];
    if (Object.keys(args).some(key => !fields.includes(key))) return;
    if (v.op === 'checkpoint_restore' && (typeof args.checkpointId !== 'string'
        || !/^[a-zA-Z0-9_-]{1,128}$/.test(args.checkpointId))) return;
    return v as unknown as LiveQaRequest;
}
