import { createHash, randomUUID } from 'crypto';
import type { DeterministicWorkspaceMutationGate } from './deterministicWorkspaceMutationGate';

export type GameActionId = 'commerce:trade' | 'commerce:travel' | 'commerce:end_day';
export type ActionCapability = 'action.list' | 'action.preview' | 'action.execute' | 'receipt.read' | 'qa.inspect';
export type GameActionClassification = 'rejected_invalid' | 'rejected_busy' | 'rejected_stale'
    | 'rejected_forbidden' | 'committed' | 'committed_partial' | 'outcome_unknown' | 'committed_with_warning';
export interface GameActionRequest {
    actionId: GameActionId;
    requestId: string;
    parameters: unknown;
    expectedActionSetHash?: string;
    confirmationToken?: string;
}
export interface TrustedActionExecutionContext {
    readonly principal: 'human-player' | 'player-agent' | 'qa-runner';
    readonly capabilities: readonly ActionCapability[];
    readonly workspaceId: string;
}
export interface GameActionReceipt {
    actionId: string;
    requestId: string;
    classification: GameActionClassification;
    commitStatus: 'not_committed' | 'committed' | 'partial' | 'unknown';
    result: Record<string, unknown>;
}
export interface PublicGameAction {
    actionId: GameActionId;
    version: 1;
    available: boolean;
    parameters: Record<string, unknown>;
    estimate: Record<string, unknown>;
}
export interface GameActionScope {
    workspaceId: string;
    campaignId: string;
    timelineEpoch: string;
    authorizationGeneration: number;
}
export interface GameActionMutationOutcome {
    classification: GameActionClassification;
    result: Record<string, unknown>;
    diagnostic?: Record<string, unknown>;
}
export interface GameActionBindings<T> {
    mutationGate: DeterministicWorkspaceMutationGate;
    scope(): GameActionScope;
    authorized(): boolean;
    read(): T;
    playerView(state: T): Record<string, unknown>;
    actions(state: T): PublicGameAction[];
    quote(state: T, action: GameActionId, parameters: Record<string, unknown>):
        { ok: true; quote: Record<string, unknown> } | { ok: false; code: string };
    witness(state: T): string;
    execute(action: GameActionId, parameters: Record<string, unknown>, internalRequestId: string): GameActionMutationOutcome;
    inspect(state: T): Record<string, unknown>;
    now?: () => number;
}

/** Canonical serialization is also used for public-only action projections. */
export function serializeGameActionValue(value: unknown): string {
    if (Array.isArray(value)) return '[' + value.map(serializeGameActionValue).join(',') + ']';
    if (value && typeof value === 'object') return '{' + Object.keys(value).sort()
        .filter(key => (value as Record<string, unknown>)[key] !== undefined)
        .map(key => JSON.stringify(key) + ':' + serializeGameActionValue((value as Record<string, unknown>)[key])).join(',') + '}';
    return JSON.stringify(value) ?? 'null';
}
export function hashGameActionValue(value: unknown): string {
    return createHash('sha256').update(serializeGameActionValue(value)).digest('hex');
}
function copy<T>(value: T): T { return JSON.parse(JSON.stringify(value)) as T; }
function object(value: unknown): value is Record<string, unknown> {
    return !!value && typeof value === 'object' && !Array.isArray(value)
        && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
}
function exact(value: Record<string, unknown>, allowed: string[]): boolean {
    return Object.keys(value).every(key => allowed.includes(key));
}
const ID = /^[A-Za-z0-9_-]{1,64}$/;
function parameters(action: unknown, raw: unknown): Record<string, unknown> | undefined {
    if (!object(raw)) return undefined;
    if (action === 'commerce:end_day') return exact(raw, []) ? {} : undefined;
    if (action === 'commerce:travel') return exact(raw, ['destinationId'])
        && typeof raw.destinationId === 'string' && ID.test(raw.destinationId) ? { destinationId: raw.destinationId } : undefined;
    if (action === 'commerce:trade' && exact(raw, ['op', 'marketLocationId', 'commodityId', 'qty'])
        && (raw.op === 'buy' || raw.op === 'sell') && typeof raw.marketLocationId === 'string' && ID.test(raw.marketLocationId)
        && typeof raw.commodityId === 'string' && ID.test(raw.commodityId)
        && Number.isSafeInteger(raw.qty) && Number(raw.qty) >= 1 && Number(raw.qty) <= 999) {
        return { op: raw.op, marketLocationId: raw.marketLocationId, commodityId: raw.commodityId, qty: raw.qty };
    }
    return undefined;
}
function receipt(actionId: string, requestId: string, classification: GameActionClassification, result: Record<string, unknown> = {}): GameActionReceipt {
    const commitStatus = classification === 'committed' || classification === 'committed_with_warning' ? 'committed'
        : classification === 'committed_partial' ? 'partial' : classification === 'outcome_unknown' ? 'unknown' : 'not_committed';
    return { actionId, requestId, classification, commitStatus, result: copy(result) };
}

/** Internal factory: neither bindings nor session creation are transport endpoints. */
export function createGameActionService<T>(bindings: GameActionBindings<T>) {
    const now = bindings.now ?? Date.now;
    const contexts = new WeakMap<TrustedActionExecutionContext, { callerId: string; closed: boolean }>();
    const handles = new Map<string, {
        context: TrustedActionExecutionContext; scope: string; actionId: GameActionId; parameters: Record<string, unknown>;
        quote: Record<string, unknown>; witness: string; hash: string; expires: number; approved: boolean; used?: string;
    }>();
    const requests = new Map<string, { fingerprint: string; promise: Promise<GameActionReceipt>; receipt?: GameActionReceipt; diagnostic?: Record<string, unknown> }>();
    // Tombstones retain request identities after receipt eviction. At the session cap,
    // fail closed instead of forgetting identities and risking a second mutation.
    const completed: string[] = [];
    const valid = (context: TrustedActionExecutionContext, capability: ActionCapability): boolean => {
        const registered = contexts.get(context);
        return !!registered && !registered.closed && context.capabilities.includes(capability)
            && bindings.authorized() && context.workspaceId === bindings.scope().workspaceId;
    };
    const scopeKey = () => serializeGameActionValue(bindings.scope());
    const requestKey = (context: TrustedActionExecutionContext, requestId: string) =>
        serializeGameActionValue([contexts.get(context)?.callerId, scopeKey(), requestId]);
    function available(context: TrustedActionExecutionContext, state: T) {
        const actions = bindings.actions(state);
        const permissions = context.capabilities.filter(cap => cap !== 'qa.inspect').slice().sort();
        return { actions: copy(actions), actionSetHash: hashGameActionValue({ actions, permissions }) };
    }
    function safeValid(context: TrustedActionExecutionContext, cap: ActionCapability) {
        try { return valid(context, cap); } catch { return false; }
    }
    return {
        // A caller must hold this in-process factory, not merely possess JSON with
        // the same fields. Public methods check object identity in the WeakMap.
        createTrustedSession(principal: TrustedActionExecutionContext['principal'], delegatedActions: boolean = false): TrustedActionExecutionContext {
            const capabilities: ActionCapability[] = ['action.list', 'action.preview', 'receipt.read'];
            if (principal !== 'player-agent' || delegatedActions) capabilities.push('action.execute');
            if (principal === 'qa-runner') capabilities.push('qa.inspect');
            const context = Object.freeze({ principal, workspaceId: bindings.scope().workspaceId, capabilities: Object.freeze(capabilities) });
            contexts.set(context, { callerId: randomUUID(), closed: false });
            return context;
        },
        close(context: TrustedActionExecutionContext) {
            const registered = contexts.get(context);
            if (registered) registered.closed = true;
            for (const [key, handle] of handles) if (handle.context === context) handles.delete(key);
        },
        readPlayerView(context: TrustedActionExecutionContext) {
            if (!safeValid(context, 'action.list')) throw new Error('rejected_forbidden');
            return copy(bindings.playerView(bindings.read()));
        },
        queryAvailable(context: TrustedActionExecutionContext) {
            if (!safeValid(context, 'action.list')) throw new Error('rejected_forbidden');
            return available(context, bindings.read());
        },
        preview(context: TrustedActionExecutionContext, raw: unknown) {
            if (!safeValid(context, 'action.preview')) return { ok: false as const, classification: 'rejected_forbidden' as const };
            if (!object(raw) || !exact(raw, ['actionId', 'parameters', 'expectedActionSetHash'])
                || (raw.expectedActionSetHash !== undefined && typeof raw.expectedActionSetHash !== 'string'))
                return { ok: false as const, classification: 'rejected_invalid' as const };
            const normalized = parameters(raw.actionId, raw.parameters);
            if (!normalized) return { ok: false as const, classification: 'rejected_invalid' as const };
            try {
                const state = bindings.read();
                const projection = available(context, state);
                if (raw.expectedActionSetHash !== undefined && raw.expectedActionSetHash !== projection.actionSetHash)
                    return { ok: false as const, classification: 'rejected_stale' as const };
                const actionId = raw.actionId as GameActionId;
                if (!projection.actions.some(action => action.actionId === actionId && action.available))
                    return { ok: false as const, classification: 'rejected_forbidden' as const };
                const quoted = bindings.quote(state, actionId, normalized);
                if (!quoted.ok) return { ok: false as const, classification: 'rejected_invalid' as const, code: quoted.code };
                for (const [id, handle] of handles) if (handle.expires <= now()) handles.delete(id);
                if (handles.size >= 256) return { ok: false as const, classification: 'rejected_busy' as const };
                const confirmationToken = randomUUID();
                handles.set(confirmationToken, { context, scope: scopeKey(), actionId, parameters: copy(normalized),
                    quote: copy(quoted.quote), witness: bindings.witness(state), hash: projection.actionSetHash,
                    expires: now() + 120_000, approved: false });
                return { ok: true as const, actionId, parameters: copy(normalized), quote: copy(quoted.quote),
                    actionSetHash: projection.actionSetHash, confirmationToken };
            } catch { return { ok: false as const, classification: 'rejected_forbidden' as const }; }
        },
        /** Called only by a trusted adapter after the user selects confirm, or by
         * the fixture runner after validating all scripted-confirmation conditions. */
        confirm(context: TrustedActionExecutionContext, token: string, mode: 'interactive' | 'scripted'): boolean {
            if (!safeValid(context, 'action.execute') || (mode === 'scripted' && context.principal !== 'qa-runner')) return false;
            const handle = handles.get(token);
            if (!handle || handle.context !== context || handle.scope !== scopeKey() || handle.expires <= now() || handle.used) return false;
            handle.approved = true;
            return true;
        },
        async execute(context: TrustedActionExecutionContext, raw: unknown): Promise<GameActionReceipt> {
            const actionId = object(raw) && typeof raw.actionId === 'string' ? raw.actionId : '';
            const requestId = object(raw) && typeof raw.requestId === 'string' ? raw.requestId : '';
            const reject = (kind: GameActionClassification, result = {}) => receipt(actionId, requestId, kind, result);
            if (!safeValid(context, 'action.execute')) return reject('rejected_forbidden');
            if (!object(raw) || !exact(raw, ['actionId', 'requestId', 'parameters', 'expectedActionSetHash', 'confirmationToken'])
                || !/^[A-Za-z0-9_-]{8,128}$/.test(requestId)
                || (raw.expectedActionSetHash !== undefined && typeof raw.expectedActionSetHash !== 'string')
                || (raw.confirmationToken !== undefined && typeof raw.confirmationToken !== 'string')) return reject('rejected_invalid');
            const normalized = parameters(actionId, raw.parameters);
            if (!normalized) return reject('rejected_invalid');
            const key = requestKey(context, requestId);
            const fingerprint = hashGameActionValue([actionId, normalized]);
            const prior = requests.get(key);
            if (prior) return prior.fingerprint === fingerprint ? copy(await prior.promise) : reject('rejected_invalid');
            if (requests.size >= 1024) return reject('outcome_unknown');
            const handle = typeof raw.confirmationToken === 'string' ? handles.get(raw.confirmationToken) : undefined;
            if (!handle) return reject('outcome_unknown');
            if (handle.context !== context) return reject('rejected_forbidden');
            if (handle.actionId !== actionId || hashGameActionValue(handle.parameters) !== hashGameActionValue(normalized)) return reject('rejected_invalid');
            if (handle.scope !== scopeKey() || handle.expires <= now() || handle.used) return reject('rejected_stale');
            if (!handle.approved) return reject('rejected_forbidden');
            const admittedScope = scopeKey();
            const entry: { fingerprint: string; promise: Promise<GameActionReceipt>; receipt?: GameActionReceipt; diagnostic?: Record<string, unknown> }
                = { fingerprint, promise: Promise.resolve(reject('outcome_unknown')) };
            requests.set(key, entry);
            // Publish the promise before calling any supplied implementation.
            entry.promise = Promise.resolve().then(async () => {
                let started = false;
                const mutation = await bindings.mutationGate.run(context.workspaceId,
                    { actionKind: actionId, requestId }, () => {
                        if (!safeValid(context, 'action.execute')) return reject('rejected_forbidden');
                        if (admittedScope !== scopeKey() || handle.expires <= now()) return reject('rejected_stale');
                        const state = bindings.read();
                        const projection = available(context, state);
                        if (bindings.witness(state) !== handle.witness || projection.actionSetHash !== handle.hash
                            || (raw.expectedActionSetHash !== undefined && raw.expectedActionSetHash !== projection.actionSetHash)) return reject('rejected_stale');
                        const quoted = bindings.quote(state, actionId as GameActionId, normalized);
                        if (!quoted.ok || hashGameActionValue(quoted.quote) !== hashGameActionValue(handle.quote)) return reject('rejected_stale');
                        handle.used = key;
                        started = true;
                        // IDs are mapped, never silently truncated to WorldIntent limits.
                        const outcome = bindings.execute(actionId as GameActionId, normalized, randomUUID());
                        entry.diagnostic = outcome.diagnostic;
                        return receipt(actionId, requestId, outcome.classification, outcome.result);
                    });
                const result = mutation.status === 'completed' ? mutation.value : mutation.status === 'busy'
                    ? reject('rejected_busy') : reject(started ? 'outcome_unknown' : 'rejected_forbidden');
                entry.receipt = copy(result);
                completed.push(key);
                while (completed.length > 32) {
                    const expired = requests.get(completed.shift()!);
                    if (expired) {
                        const old = expired.receipt!;
                        expired.receipt = undefined;
                        expired.diagnostic = undefined;
                        expired.promise = Promise.resolve(receipt(old.actionId, old.requestId, 'outcome_unknown'));
                    }
                }
                return copy(result);
            });
            return copy(await entry.promise);
        },
        async waitReceipt(context: TrustedActionExecutionContext, requestId: string, timeoutMs: number): Promise<GameActionReceipt | { classification: 'outcome_unknown' }> {
            if (!safeValid(context, 'receipt.read')) return receipt('', requestId, 'rejected_forbidden');
            if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 0 || timeoutMs > 30_000) return receipt('', requestId, 'rejected_invalid');
            const prior = requests.get(requestKey(context, requestId));
            if (!prior) return { classification: 'outcome_unknown' };
            let timer: ReturnType<typeof setTimeout> | undefined;
            try {
                return copy(await Promise.race([prior.promise, new Promise<{ classification: 'outcome_unknown' }>(resolve => {
                    timer = setTimeout(() => resolve({ classification: 'outcome_unknown' }), timeoutMs);
                })]));
            } finally { if (timer) clearTimeout(timer); }
        },
        inspect(context: TrustedActionExecutionContext) {
            if (!safeValid(context, 'qa.inspect')) throw new Error('rejected_forbidden');
            const lease = bindings.mutationGate.acquire(context.workspaceId, { actionKind: 'qa_inspect', requestId: randomUUID() });
            if (lease.status !== 'acquired') throw new Error('rejected_busy');
            try { return copy(bindings.inspect(bindings.read())); } finally { lease.lease.release(); }
        },
    };
}
