import { hashGameActionValue, type GameActionId } from './gameActionService';
import type { AgentConnectionApi } from './playerDelegationCore';

export interface PlayerLabConditions {
    fixtureDigest: string;
    initialPublicDigest: string;
    taskDigest: string;
    maximum: number;
    allowedActions: GameActionId[];
}
export interface PlayerLabResult {
    client: string;
    model: string;
    conditions: PlayerLabConditions;
    complete: boolean;
    receiptChecks?: { calls: number; unknown: number; errors: number };
    worldObservations?: { worldTurn: number; regions: { regionId: string; status: string }[] }[];
    observationsTruncated?: boolean;
    steps: { action: GameActionId; classification: string; commitStatus: string;
        trade?: { op: 'buy' | 'sell'; commodityId: string; qty: number; total: number } }[];
}
/** Fixture runner wrapper only. Never exports requests, handles, text or QA state. */
export function recordPlayerLabSession(api: AgentConnectionApi, client: string, model: string, conditions: PlayerLabConditions) {
    if (!Number.isInteger(conditions.maximum) || conditions.maximum < 1 || conditions.maximum > 100) throw new Error('invalid_lab_limit');
    const captured = JSON.parse(JSON.stringify(conditions)) as PlayerLabConditions;
    const steps: PlayerLabResult['steps'] = [];
    const requests = new Set<string>();
    const receiptChecks = { calls: 0, unknown: 0, errors: 0 };
    const worldObservations: NonNullable<PlayerLabResult['worldObservations']> = [];
    let observationsTruncated = false;
    let active = true;
    let pending = 0;
    const drained: (() => void)[] = [];
    const connection: AgentConnectionApi = { dispose() { active = false; api.dispose(); }, async call(tool, args) {
        if (!active) return { classification: 'rejected_forbidden' };
        pending++;
        try {
        const input = args && typeof args === 'object' ? args as Record<string, unknown> : {};
        // Match the full request so an invalid changed-body resend is not hidden.
        const fingerprint = hashGameActionValue(input);
        const record = tool === 'execute' && !requests.has(fingerprint);
        if (record && requests.size >= 100) return { classification: 'rejected_forbidden' };
        if (record) requests.add(fingerprint);
        let result: unknown;
        if (tool === 'wait_receipt') receiptChecks.calls++;
        try {
            result = await api.call(tool, args);
        } catch (error) {
            if (tool === 'wait_receipt') receiptChecks.errors++;
            // A lost response cannot prove that the operation did not commit.
            // Retain the attempted action without exporting exception diagnostics.
            if (record && captured.allowedActions.includes(input.actionId as GameActionId)) {
                steps.push({ action: input.actionId as GameActionId,
                    classification: 'outcome_unknown', commitStatus: 'unknown' });
            }
            throw error;
        }
        if (tool === 'wait_receipt' && result && typeof result === 'object'
            && (result as Record<string, unknown>).classification === 'outcome_unknown') receiptChecks.unknown++;
        if (record && result && typeof result === 'object') {
            const receipt = result as Record<string, unknown>;
            if (captured.allowedActions.includes(receipt.actionId as GameActionId)) {
                const publicResult = receipt.result as Record<string, unknown> | undefined;
                const committed = receipt.commitStatus === 'committed' && ['committed', 'committed_with_warning'].includes(String(receipt.classification));
                const trade: PlayerLabResult['steps'][number]['trade'] = committed && receipt.actionId === 'commerce:trade' && publicResult
                    && (publicResult.op === 'buy' || publicResult.op === 'sell')
                    && typeof publicResult.commodityId === 'string' && /^[a-zA-Z0-9_.:-]{1,128}$/.test(publicResult.commodityId)
                    && typeof publicResult.qty === 'number' && Number.isFinite(publicResult.qty) && publicResult.qty > 0
                    && typeof publicResult.total === 'number' && Number.isFinite(publicResult.total) && publicResult.total >= 0
                    ? { op: publicResult.op, commodityId: publicResult.commodityId, qty: publicResult.qty, total: publicResult.total } : undefined;
                steps.push({
                action: receipt.actionId as GameActionId,
                classification: typeof receipt.classification === 'string' ? receipt.classification : 'outcome_unknown',
                commitStatus: typeof receipt.commitStatus === 'string' ? receipt.commitStatus : 'unknown',
                ...(trade ? { trade } : {}),
                });
            }
        }
        if (tool === 'read_player_view' && result && typeof result === 'object') {
            const view = result as { classification?: unknown; worldTurn?: number; worldPacing?: { regions?: unknown } };
            if (!view.classification && Number.isSafeInteger(view.worldTurn) && view.worldTurn! >= 0 && Array.isArray(view.worldPacing?.regions)) {
                if (worldObservations.length >= 100) observationsTruncated = true;
                else {
                    const publicRegions = view.worldPacing.regions.filter(region => region
                        && typeof region.regionId === 'string' && /^[a-zA-Z0-9_.:-]{1,128}$/.test(region.regionId)
                        && ['unconfirmed', 'unconfigured', 'paused', 'supplied', 'shortage'].includes(region.status));
                    if (publicRegions.length > 100) observationsTruncated = true;
                    worldObservations.push({ worldTurn: view.worldTurn!, regions: publicRegions.slice(0, 100)
                        .map(region => ({ regionId: region.regionId, status: region.status })) });
                }
            }
        }
        return result;
        } finally {
            pending--;
            if (!pending) drained.splice(0).forEach(resolve => resolve());
        }
    } };
    return { connection, async close() {
        connection.dispose();
        // Invalidation refuses new calls; accepted work retains its fixture until settled.
        if (pending) await new Promise<void>(resolve => drained.push(resolve));
    }, result(complete = false): PlayerLabResult {
        return JSON.parse(JSON.stringify({ client, model, conditions: captured, complete, steps, receiptChecks, worldObservations, observationsTruncated }));
    } };
}

export function comparePlayerLabRuns(runs: readonly PlayerLabResult[]) {
    if (!runs.length) throw new Error('no_lab_runs');
    const reference = hashGameActionValue(runs[0].conditions);
    const comparable = runs.every(run => run.complete && /^[a-f0-9]{64}$/.test(run.conditions.taskDigest ?? '')
        && hashGameActionValue(run.conditions) === reference);
    return { comparable, reason: comparable ? 'matching_completed_conditions' : 'incomplete_or_different_conditions',
        runs: runs.map(run => ({ client: run.client, model: run.model, complete: run.complete,
            executions: run.steps.length,
            // Read-back behavior only; never overwrite the original execution outcome.
            // Legacy reports did not observe checks, so absence must not mean zero.
            receiptChecks: run.receiptChecks ? { ...run.receiptChecks } : null,
            worldObservations: run.worldObservations ? JSON.parse(JSON.stringify(run.worldObservations)) : null,
            observationsTruncated: run.worldObservations ? Boolean(run.observationsTruncated) : null,
            committed: run.steps.filter(step => step.commitStatus === 'committed'
                && ['committed', 'committed_with_warning'].includes(step.classification)).length,
            partialOrUnknown: run.steps.filter(step => ['partial', 'unknown'].includes(step.commitStatus)).length,
            recordedTradeCashFlow: run.steps.reduce((sum, step) => sum + (step.trade ? (step.trade.op === 'sell' ? step.trade.total : -step.trade.total) : 0), 0),
            // Cash movement is not profit: unsold cargo and acquisition costs matter.
            tradeDetailsComplete: run.steps.filter(step => step.action === 'commerce:trade' && step.commitStatus === 'committed').every(step => Boolean(step.trade)),
            trades: run.steps.flatMap(step => step.trade ? [{ ...step.trade }] : []),
            actions: Object.fromEntries(run.conditions.allowedActions.map(action => [action, run.steps.filter(step => step.action === action).length])),
            classifications: Object.fromEntries([...new Set(run.steps.map(step => step.classification))]
                .map(classification => [classification, run.steps.filter(step => step.classification === classification).length])),
        })) };
}
