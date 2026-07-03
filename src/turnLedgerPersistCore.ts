// PR-D — cross-ledger persist contract after game_state commit (pure, no vscode/fs).

/**
 * Persist order for GM turn_result side effects.
 * game_state MUST commit before independent ledger files are written.
 */
export const TURN_LEDGER_PERSIST_ORDER = ['game_state', 'discoveries', 'campaign_resources'] as const;

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

export type TurnLedgerTarget = 'discovery' | 'campaignResources';

export interface TurnLedgerPersistOutcome {
    /** True when every attempted ledger write succeeded (or none attempted). */
    ok: boolean;
    /** True when some attempted ledger writes succeeded and others failed. */
    partial: boolean;
    discoveryAttempted: boolean;
    discoveryApplied: boolean;
    campaignResourcesAttempted: boolean;
    campaignResourcesApplied: boolean;
    failedTargets: TurnLedgerTarget[];
}

export interface TurnLedgerPersistInput {
    discoveryOpsPresent: boolean;
    campaignResourceOpsPresent: boolean;
    applyDiscovery: () => boolean;
    applyCampaignResources: () => boolean;
}

/** Gate independent ledger writes on successful game_state commit. */
export function shouldPersistTurnLedgersAfterCommit(commitOk: boolean): boolean {
    return commitOk;
}

/**
 * Apply discovery + campaign_resources ledger ops after game_state commit.
 * Returns structured outcome for partial-failure compensation logging.
 */
export function persistTurnLedgersAfterCommit(input: TurnLedgerPersistInput): TurnLedgerPersistOutcome {
    const failedTargets: TurnLedgerTarget[] = [];
    let discoveryApplied = false;
    let campaignResourcesApplied = false;
    const discoveryAttempted = input.discoveryOpsPresent;
    const campaignResourcesAttempted = input.campaignResourceOpsPresent;

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

    const anySucceeded = (discoveryAttempted && discoveryApplied)
        || (campaignResourcesAttempted && campaignResourcesApplied);
    const partial = failedTargets.length > 0 && anySucceeded;

    return {
        ok: failedTargets.length === 0,
        partial,
        discoveryAttempted,
        discoveryApplied,
        campaignResourcesAttempted,
        campaignResourcesApplied,
        failedTargets,
    };
}