import type { GameActionObservation } from './gameActionService';

type ReferenceKind = 'market' | 'commodity';
interface RecordedReference { kind: ReferenceKind; fixtureValue?: string; unresolved: boolean }
interface RecordedAction {
    actionId: string; parameters: Record<string, string | number>; classification: string;
    numbers: Record<string, number>; manualReviewRequired: boolean;
}
const knownFixtureValues: Record<ReferenceKind, readonly string[]> = {
    market: ['north_farm', 'elda_shop'], commodity: ['wheat'],
};
/** Memory-only recording. Every stored field is built from an explicit public allowlist. */
export function createActionRecorder(onLimit: () => void = () => {}) {
    let active = false;
    let actions: RecordedAction[] = [];
    let references: Record<string, RecordedReference> = {};
    let identities = new Map<string, string>();
    function reference(kind: ReferenceKind, value: unknown) {
        if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(value)) return;
        const key = `${kind}:${value}`;
        let alias = identities.get(key);
        if (!alias) {
            alias = `${kind}_${Object.keys(references).length + 1}`;
            identities.set(key, alias);
            const known = knownFixtureValues[kind].includes(value);
            references[alias] = { kind, unresolved: !known, ...(known ? { fixtureValue: value } : {}) };
        }
        return `$${alias}`;
    }
    return {
        start() { active = true; actions = []; references = {}; identities = new Map(); },
        stop() { active = false; },
        status() { return { recording: active, count: actions.length, limit: 100 }; },
        observe(value: GameActionObservation) {
            if (!active || value.principal !== 'human-player') return;
            const parameters: Record<string, string | number> = {};
            if (value.actionId === 'commerce:trade') {
                if (!['buy', 'sell'].includes(String(value.parameters.op)) || !Number.isSafeInteger(value.parameters.qty)
                    || Number(value.parameters.qty) < 1 || Number(value.parameters.qty) > 999) return;
                const market = reference('market', value.parameters.marketLocationId);
                const commodity = reference('commodity', value.parameters.commodityId);
                if (!market || !commodity) return;
                Object.assign(parameters, { op: value.parameters.op, marketLocationId: market, commodityId: commodity, qty: value.parameters.qty });
            } else if (value.actionId === 'commerce:travel') {
                const destination = reference('market', value.parameters.destinationId);
                if (!destination) return;
                parameters.destinationId = destination;
            } else if (value.actionId !== 'commerce:end_day') return;
            if (!['committed', 'committed_with_warning', 'committed_partial', 'outcome_unknown',
                'rejected_busy', 'rejected_stale', 'rejected_invalid', 'rejected_forbidden'].includes(value.classification)) return;
            const numbers: Record<string, number> = {};
            for (const key of ['qty', 'total', 'elapsedWorldTurns']) {
                const n = value.result[key];
                if (typeof n === 'number' && Number.isFinite(n)) numbers[key] = n;
            }
            actions.push({ actionId: value.actionId, parameters, classification: value.classification, numbers,
                manualReviewRequired: !['committed', 'committed_with_warning'].includes(value.classification) });
            if (actions.length === 100) { active = false; onLimit(); }
        },
        template() {
            return JSON.parse(JSON.stringify({ format: 'lorerelay-action-template/1', executable: false,
                fixtureId: 'merchant_route_v1', registrationRequired: true, references, actions,
                steps: actions.flatMap((action, index) => {
                    if (action.manualReviewRequired) return [];
                    const id = `recorded_${index + 1}`;
                    return [{ id: `${id}_preview`, op: 'preview', actionId: action.actionId, parameters: action.parameters },
                        { id, op: 'execute', previewFrom: `${id}_preview`, requestId: `${id}_fresh`, confirmed: true },
                        { id: `${id}_receipt`, op: 'wait_receipt', requestFrom: id, timeoutMs: 5000 },
                        { id: `${id}_assert`, op: 'assert_receipt', receiptFrom: `${id}_receipt`, classification: action.classification }];
                }) }));
        },
    };
}

/** Produces a registration candidate, never grants the runner a new catalog entry. */
export function resolveRecordedActionTemplate(template: unknown, catalogId: string, bindings: Record<string, string> = {}) {
    const value = template as ReturnType<ReturnType<typeof createActionRecorder>['template']>;
    if (!value || value.format !== 'lorerelay-action-template/1' || value.executable !== false
        || value.fixtureId !== 'merchant_route_v1' || !/^[a-z][a-z0-9_]{0,63}$/.test(catalogId)
        || !Array.isArray(value.actions) || value.actions.length < 1 || value.actions.length > 100
        || value.actions.some((action: RecordedAction) => action.manualReviewRequired
            || !['committed', 'committed_with_warning'].includes(action.classification))) throw new Error('template_review_required');
    const resolved: Record<string, string> = {};
    for (const [alias, raw] of Object.entries(value.references as Record<string, RecordedReference>)) {
        if (!/^(market|commodity)_\d+$/.test(alias) || !raw || !Object.hasOwn(knownFixtureValues, raw.kind)) throw new Error('invalid_reference');
        const id = bindings[alias] ?? (!raw.unresolved ? raw.fixtureValue : undefined);
        if (!id || !knownFixtureValues[raw.kind].includes(id)) throw new Error('unresolved_reference');
        resolved[`$${alias}`] = id;
    }
    // Rebuild from recorded actions rather than trusting editable executable steps.
    const steps: Record<string, unknown>[] = [];
    for (const [index, action] of (value.actions as RecordedAction[]).entries()) {
        const parameters: Record<string, unknown> = {};
        const fields = action.actionId === 'commerce:trade' ? ['op', 'marketLocationId', 'commodityId', 'qty']
            : action.actionId === 'commerce:travel' ? ['destinationId'] : action.actionId === 'commerce:end_day' ? [] : undefined;
        if (!fields || !action.parameters || Object.keys(action.parameters).some(key => !fields.includes(key))) throw new Error('invalid_action');
        for (const key of fields) {
            const raw = action.parameters[key];
            if (['marketLocationId', 'commodityId', 'destinationId'].includes(key)) {
                if (typeof raw !== 'string' || !Object.hasOwn(resolved, raw)) throw new Error('unresolved_reference');
                parameters[key] = resolved[raw];
            } else parameters[key] = raw;
        }
        if (action.actionId === 'commerce:trade' && (!['buy', 'sell'].includes(String(parameters.op))
            || !Number.isSafeInteger(parameters.qty) || Number(parameters.qty) < 1 || Number(parameters.qty) > 999)) throw new Error('invalid_action');
        const id = `recorded_${index + 1}`;
        steps.push({ id: `${id}_preview`, op: 'preview', actionId: action.actionId, parameters },
            { id, op: 'execute', previewFrom: `${id}_preview`, requestId: `${id}_fresh`, confirmed: true },
            { id: `${id}_receipt`, op: 'wait_receipt', requestFrom: id, timeoutMs: 5000 },
            { id: `${id}_assert`, op: 'assert_receipt', receiptFrom: `${id}_receipt`, classification: action.classification });
    }
    return { schemaVersion: 1, id: catalogId, fixtureId: 'merchant_route_v1', seed: 7,
        limits: { maxSteps: steps.length, timeoutMs: 30000 }, steps };
}
