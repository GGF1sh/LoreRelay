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
    'vehicle_state',
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

export type TurnLedgerTarget = 'discovery' | 'campaignResources' | 'settlementLayout' | 'vehicleState';

export interface TurnLedgerApplyResult {
    ok: boolean;
    applied: boolean;
}

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
    vehicleStateAttempted: boolean;
    vehicleStateApplied: boolean;
    failedTargets: TurnLedgerTarget[];
}

export interface TurnLedgerPersistInput {
    discoveryOpsPresent: boolean;
    campaignResourceOpsPresent: boolean;
    settlementLayoutOpsPresent: boolean;
    vehicleOpsPresent?: boolean;
    applyDiscovery: () => boolean | TurnLedgerApplyResult;
    applyCampaignResources: () => boolean | TurnLedgerApplyResult;
    applySettlementLayout: () => boolean | TurnLedgerApplyResult;
    applyVehicleState?: () => boolean | TurnLedgerApplyResult;
}

/** Gate independent ledger writes on successful game_state commit. */
export function shouldPersistTurnLedgersAfterCommit(commitOk: boolean): boolean {
    return commitOk;
}

/** Normalize legacy boolean apply results (false = failure) vs structured no-op (ok true, applied false). */
export function normalizeLedgerApplyResult(result: boolean | TurnLedgerApplyResult): TurnLedgerApplyResult {
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
    let vehicleStateApplied = false;
    const discoveryAttempted = input.discoveryOpsPresent;
    const campaignResourcesAttempted = input.campaignResourceOpsPresent;
    const settlementLayoutAttempted = input.settlementLayoutOpsPresent;
    const vehicleStateAttempted = input.vehicleOpsPresent === true;
    const applyVehicleState = input.applyVehicleState ?? (() => ({ ok: true, applied: false }));

    if (discoveryAttempted) {
        const discoveryResult = normalizeLedgerApplyResult(input.applyDiscovery());
        discoveryApplied = discoveryResult.applied;
        if (!discoveryResult.ok) {
            failedTargets.push('discovery');
        }
    }

    if (campaignResourcesAttempted) {
        const resourcesResult = normalizeLedgerApplyResult(input.applyCampaignResources());
        campaignResourcesApplied = resourcesResult.applied;
        if (!resourcesResult.ok) {
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

    if (vehicleStateAttempted) {
        const vehicleResult = normalizeLedgerApplyResult(applyVehicleState());
        vehicleStateApplied = vehicleResult.applied;
        if (!vehicleResult.ok) {
            failedTargets.push('vehicleState');
        }
    }

    const anySucceeded = (discoveryAttempted && discoveryApplied)
        || (campaignResourcesAttempted && campaignResourcesApplied)
        || (settlementLayoutAttempted && settlementLayoutApplied)
        || (vehicleStateAttempted && vehicleStateApplied);
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
        vehicleStateAttempted,
        vehicleStateApplied,
        failedTargets,
    };
}