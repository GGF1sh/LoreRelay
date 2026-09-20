// Settlement Mode M4b: parse/filter/apply expand_layer ops to layout (pure).

import {
    parseSettlementOps,
    type ExpandLayerOp,
    type SettlementLayoutV1,
    type SettlementOp,
    type SettlementStateV1,
} from './settlementCore';
import {
    applyExpandLayerToLayout,
    createMinimalLayoutShell,
    type SettlementLayoutExpansionContext,
} from './settlementLayerExpansionCore';

export function filterExpandLayerOps(ops: SettlementOp[]): ExpandLayerOp[] {
    return ops.filter((op): op is ExpandLayerOp => op.type === 'expand_layer');
}

export function hasExpandLayerOps(raw: unknown): boolean {
    return filterExpandLayerOps(parseSettlementOps(raw)).length > 0;
}

export function applyExpandLayerOpsToLayout(
    layout: SettlementLayoutV1 | undefined,
    state: SettlementStateV1,
    ops: ExpandLayerOp[],
    context: SettlementLayoutExpansionContext = {}
): { layout: SettlementLayoutV1; anyApplied: boolean } {
    if (!ops.length) {
        return {
            layout: layout ?? createMinimalLayoutShell(state),
            anyApplied: false,
        };
    }
    let current: SettlementLayoutV1 | undefined = layout;
    let anyApplied = false;
    for (const op of ops) {
        const result = applyExpandLayerToLayout(current, state, op, context);
        current = result.layout;
        if (result.applied) {
            anyApplied = true;
        }
    }
    return { layout: current!, anyApplied };
}

export interface SettlementLayoutTurnOpsDeps {
    isSettlementModeEnabled: () => boolean;
    getLayoutPath: () => string | undefined;
    readLayoutFromDisk: (layoutPath?: string) => SettlementLayoutV1 | undefined;
    readStateFromDisk: (statePath?: string) => SettlementStateV1 | undefined;
    loadWorldTurn: () => number | undefined;
    writeLayoutAtomic: (layoutPath: string, layout: SettlementLayoutV1) => void;
    clearLayoutCache: () => void;
    runSerializedMutation: (fn: () => void) => void;
}

export interface SettlementLayoutTurnOpsResult {
    ok: boolean;
    applied: boolean;
    attempted: boolean;
    failure?: 'write_failed' | 'mutation_failed';
}

export function shouldAttemptSettlementLayoutPersistCore(
    enableSettlementMode: boolean,
    settlementOps: unknown
): boolean {
    if (!enableSettlementMode) {
        return false;
    }
    return hasExpandLayerOps(settlementOps);
}

export function tryApplySettlementLayoutTurnOpsWithDeps(
    turnResult: { settlementOps?: unknown },
    deps: SettlementLayoutTurnOpsDeps
): SettlementLayoutTurnOpsResult {
    if (!deps.isSettlementModeEnabled()) {
        return { ok: true, applied: false, attempted: false };
    }
    const ops = filterExpandLayerOps(parseSettlementOps(turnResult.settlementOps));
    if (!ops.length) {
        return { ok: true, applied: false, attempted: false };
    }
    const layoutPath = deps.getLayoutPath();
    if (!layoutPath) {
        return { ok: true, applied: false, attempted: false };
    }

    const result: SettlementLayoutTurnOpsResult = { ok: true, applied: false, attempted: true };
    try {
        deps.runSerializedMutation(() => {
            const state = deps.readStateFromDisk();
            if (!state) {
                result.ok = false;
                result.failure = 'mutation_failed';
                return;
            }
            const current = deps.readLayoutFromDisk(layoutPath);
            const worldTurn = deps.loadWorldTurn();
            const { layout: next, anyApplied } = applyExpandLayerOpsToLayout(
                current,
                state,
                ops,
                { worldTurn }
            );
            if (!anyApplied && JSON.stringify(current) === JSON.stringify(next)) {
                return;
            }
            if (JSON.stringify(current) === JSON.stringify(next)) {
                return;
            }
            try {
                deps.writeLayoutAtomic(layoutPath, next);
                deps.clearLayoutCache();
                result.applied = true;
            } catch (e) {
                result.ok = false;
                result.failure = 'write_failed';
                console.warn('[settlementLayoutTurnOps] failed to save settlement_layout.json', e);
            }
        });
    } catch (e) {
        return {
            ok: false,
            applied: false,
            attempted: true,
            failure: 'mutation_failed',
        };
    }
    return result;
}

export function applySettlementLayoutTurnOpsWithDeps(
    turnResult: { settlementOps?: unknown },
    deps: SettlementLayoutTurnOpsDeps
): boolean {
    return tryApplySettlementLayoutTurnOpsWithDeps(turnResult, deps).applied;
}
