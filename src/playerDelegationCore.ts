import { createGameActionService, hashGameActionValue, type GameActionId, type GameActionReceipt } from './gameActionService';

export const PLAYER_TOOLS = ['read_player_view', 'query_available', 'preview', 'execute', 'wait_receipt'] as const;
export interface AgentConnectionApi { call(tool: string, args: unknown): Promise<unknown>; dispose(): void }
interface Bindings {
    service: ReturnType<typeof createGameActionService>;
    current(): boolean;
    scope(): unknown;
    now?: () => number;
}
const actions: readonly GameActionId[] = ['commerce:trade', 'commerce:travel', 'commerce:end_day'];
function object(value: unknown): value is Record<string, unknown> {
    return !!value && typeof value === 'object' && !Array.isArray(value);
}
function fields(value: unknown, allowed: string[]): value is Record<string, unknown> {
    return object(value) && Object.keys(value).every(key => allowed.includes(key));
}
function rejection(raw: unknown, classification: 'rejected_forbidden' | 'rejected_invalid'): GameActionReceipt {
    return { actionId: object(raw) && typeof raw.actionId === 'string' ? raw.actionId.slice(0, 64) : '',
        requestId: object(raw) && typeof raw.requestId === 'string' ? raw.requestId.slice(0, 128) : '',
        classification, commitStatus: 'not_committed', result: {} };
}
/** Only the Host creates this after explicit approval. No JSON capability factory. */
export function createPlayerDelegation(bindings: Bindings, allowed: readonly GameActionId[], maximum = 10, durationMs = 30 * 60_000): AgentConnectionApi {
    if (!Number.isSafeInteger(maximum) || maximum < 1 || maximum > 100 || !Number.isSafeInteger(durationMs) || durationMs <= 0 || durationMs > 30 * 60_000
        || !allowed.length || allowed.some(action => !actions.includes(action))) throw new Error('invalid_delegation');
    const { service } = bindings;
    const context = service.createTrustedSession('player-agent', true);
    const scope = hashGameActionValue(bindings.scope());
    const now = bindings.now ?? Date.now;
    const expires = now() + durationMs;
    let active = true;
    let remaining = maximum;
    const requests = new Map<string, { fingerprint: string; result: Promise<GameActionReceipt> }>();
    const dispose = () => { active = false; service.close(context); };
    const valid = () => {
        if (active && (!bindings.current() || now() >= expires || hashGameActionValue(bindings.scope()) !== scope)) dispose();
        return active;
    };
    return { dispose, async call(tool, args) {
        if (!valid()) return rejection(args, 'rejected_forbidden');
        if (!PLAYER_TOOLS.includes(tool as typeof PLAYER_TOOLS[number])) return rejection(args, 'rejected_forbidden');
        const acceptedFields = tool === 'preview' ? ['actionId', 'parameters', 'expectedActionSetHash']
            : tool === 'execute' ? ['actionId', 'parameters', 'requestId', 'confirmationToken', 'expectedActionSetHash']
            : tool === 'wait_receipt' ? ['requestId', 'timeoutMs'] : [];
        if (!fields(args, acceptedFields)) return rejection(args, 'rejected_invalid');
        if ((tool === 'preview' || tool === 'execute') && !allowed.includes(args.actionId as GameActionId)) return rejection(args, 'rejected_forbidden');
        if (tool === 'read_player_view') return service.readPlayerView(context);
        if (tool === 'query_available') return { ...service.queryAvailable(context),
            delegation: { allowedActions: [...allowed], remaining, expiresAt: expires } };
        if (tool === 'preview') return service.preview(context, args);
        if (tool === 'wait_receipt') return service.waitReceipt(context, args.requestId as string, args.timeoutMs as number);
        if (typeof args.requestId !== 'string' || !/^[A-Za-z0-9_-]{8,128}$/.test(args.requestId)
            || typeof args.confirmationToken !== 'string' || !object(args.parameters)) return rejection(args, 'rejected_invalid');
        const fingerprint = hashGameActionValue(args);
        const previous = requests.get(args.requestId);
        if (previous) return previous.fingerprint === fingerprint ? previous.result : rejection(args, 'rejected_invalid');
        if (remaining === 0) return rejection(args, 'rejected_forbidden');
        remaining--;
        const result = Promise.resolve().then(async () => {
            if (!valid()) return rejection(args, 'rejected_forbidden');
            service.confirm(context, args.confirmationToken as string, 'delegated');
            return service.execute(context, args);
        });
        requests.set(args.requestId, { fingerprint, result });
        return result;
    } };
}
/** Separate read-only authority and entrypoint; never upgrades into Player or QA. */
export function createNarratorReader(bindings: Bindings): AgentConnectionApi {
    const context = bindings.service.createTrustedSession('narrator');
    const scope = hashGameActionValue(bindings.scope());
    let active = true;
    const dispose = () => { active = false; bindings.service.close(context); };
    return { dispose, async call(tool, args) {
        if (!active || !bindings.current() || hashGameActionValue(bindings.scope()) !== scope) { dispose(); return rejection(args, 'rejected_forbidden'); }
        if (tool !== 'read_committed_facts' || !fields(args, [])) return rejection(args, 'rejected_forbidden');
        return { facts: bindings.service.readPlayerView(context) };
    } };
}
