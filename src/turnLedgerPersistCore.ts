// PR-D — cross-ledger persist contract after game_state commit (pure, no vscode/fs).

/**
 * Persist order for GM turn_result side effects.
 * game_state MUST commit before independent ledger files are written.
 */
export const TURN_LEDGER_PERSIST_ORDER = [
    'game_state',
    'discoveries',
    'campaign_resources',
    'settlement_layout',
] as const;

/**
 * Compensation when a ledger write fails after game_state commit succeeds:
 * - Do NOT rollback game_state (would worsen split-brain across files).
 * - Surface failed ledger targets for operator reconcile (journal + console).
 * - Retry is host responsibility; no automatic multi-file transaction yet.
 */
export const CROSS_LEDGER_COMPENSATION_POLICY = {
    rollbackGameStateOnLedgerFailure: false,
    operatorReconcileRecommended: true,
} as const;

export type TurnLedgerTarget = 'discovery' | 'campaignResources' | 'settlementLayout';

export interface TurnLedgerPersistOutcome {
    /** True when every attempted ledger write succeeded (or none attempted). */
    ok: boolean;
    /** True when some attempted ledger writes succeeded and others failed. */
    partial: boolean;
    discoveryAttempted: boolean;
    discoveryApplied: boolean;
    campaignResourcesAttempted: boolean;
    campaignResourcesApplied: boolean;
    settlementLayoutAttempted: boolean;
    settlementLayoutApplied: boolean;
    failedTargets: TurnLedgerTarget[];
}

export interface TurnLedgerApplyResult {
    ok: boolean;
    applied: boolean;
}

export interface TurnLedgerPersistInput {
    discoveryOpsPresent: boolean;
    campaignResourceOpsPresent: boolean;
    settlementLayoutOpsPresent: boolean;
    applyDiscovery: () => boolean;
    applyCampaignResources: () => boolean;
    applySettlementLayout: () => boolean | TurnLedgerApplyResult;
}

/** Gate independent ledger writes on successful game_state commit. */
export function shouldPersistTurnLedgersAfterCommit(commitOk: boolean): boolean {
    return commitOk;
}

function normalizeLedgerApplyResult(result: boolean | TurnLedgerApplyResult): TurnLedgerApplyResult {
    if (typeof result === 'boolean') {
        return { ok: result, applied: result };
    }
    return {
        ok: result.ok === true,
        applied: result.applied === true,
    };
}

/**
 * Apply discovery + campaign_resources + settlement_layout ledger ops after game_state commit.
 * Returns structured outcome for partial-failure compensation logging.
 */
export function persistTurnLedgersAfterCommit(input: TurnLedgerPersistInput): TurnLedgerPersistOutcome {
    const failedTargets: TurnLedgerTarget[] = [];
    let discoveryApplied = false;
    let campaignResourcesApplied = false;
    let settlementLayoutApplied = false;
    const discoveryAttempted = input.discoveryOpsPresent;
    const campaignResourcesAttempted = input.campaignResourceOpsPresent;
    const settlementLayoutAttempted = input.settlementLayoutOpsPresent;

    if (discoveryAttempted) {
        discoveryApplied = input.applyDiscovery();
        if (!discoveryApplied) {
            failedTargets.push('discovery');
        }
    }

    if (campaignResourcesAttempted) {
        campaignResourcesApplied = input.applyCampaignResources();
        if (!campaignResourcesApplied) {
            failedTargets.push('campaignResources');
        }
    }

    if (settlementLayoutAttempted) {
        const settlementResult = normalizeLedgerApplyResult(input.applySettlementLayout());
        settlementLayoutApplied = settlementResult.applied;
        if (!settlementResult.ok) {
            failedTargets.push('settlementLayout');
        }
    }

    const anySucceeded = (discoveryAttempted && discoveryApplied)
        || (campaignResourcesAttempted && campaignResourcesApplied)
        || (settlementLayoutAttempted && settlementLayoutApplied);
    const partial = failedTargets.length > 0 && anySucceeded;

    return {
        ok: failedTargets.length === 0,
        partial,
        discoveryAttempted,
        discoveryApplied,
        campaignResourcesAttempted,
        campaignResourcesApplied,
        settlementLayoutAttempted,
        settlementLayoutApplied,
        failedTargets,
    };
}
