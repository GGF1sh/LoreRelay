// State Orchestrator SO2b: pure GM-turn plan request from turn_result flags (no I/O).

import type { GameRules } from './gameRulesCore';
import { shouldAttemptMobileBasePersistCore } from './mobileBaseOpsCore';
import { shouldAttemptSettlementLayoutPersistCore } from './settlementLayoutTurnOpsCore';
import { shouldAttemptVehiclePersistCore } from './vehicleOpsCore';
import {
    buildStateTransactionPlan,
    formatStateTransactionPlanLines,
    type StateTransactionPlan,
    type StateTransactionPlanRequest,
} from './stateOrchestratorPlanCore';

export interface GmTurnPlanTurnResultInput {
    discoveryOps?: unknown;
    campaignResourceOps?: unknown;
    settlementOps?: unknown;
    vehicleOps?: unknown;
    mobileBaseOps?: unknown;
}

export type GmTurnPlanRuleFlags = Pick<
    GameRules,
    'enableSettlementMode' | 'enableVehicleSystem' | 'enableMobileBaseSystem'
>;

export interface BuildGmTurnPlanRequestOptions {
    /** When false, mirrors statePatch commit failure (side ledgers blocked). Default true. */
    commitGameStatePlanned?: boolean;
}

/** Mirror runtime GM-turn side-ledger presence flags (pure, game-rules gated). */
export function buildGmTurnPlanRequestFromTurnResult(
    turnResult: GmTurnPlanTurnResultInput,
    rules: GmTurnPlanRuleFlags,
    options?: BuildGmTurnPlanRequestOptions
): StateTransactionPlanRequest {
    const settlementEnabled = rules.enableSettlementMode === true;
    const vehicleEnabled = rules.enableVehicleSystem === true;

    return {
        kind: 'gm_turn',
        commitGameStatePlanned: options?.commitGameStatePlanned !== false,
        discoveryOpsPresent: Array.isArray(turnResult.discoveryOps) && turnResult.discoveryOps.length > 0,
        campaignResourceOpsPresent: Array.isArray(turnResult.campaignResourceOps)
            && turnResult.campaignResourceOps.length > 0,
        settlementLayoutOpsPresent: shouldAttemptSettlementLayoutPersistCore(
            settlementEnabled,
            turnResult.settlementOps
        ),
        vehicleOpsPresent: shouldAttemptVehiclePersistCore(vehicleEnabled, turnResult.vehicleOps)
            || shouldAttemptMobileBasePersistCore(rules, turnResult.mobileBaseOps),
    };
}

export function buildGmTurnTransactionPlanFromTurnResult(
    turnResult: GmTurnPlanTurnResultInput,
    rules: GmTurnPlanRuleFlags,
    options?: BuildGmTurnPlanRequestOptions
): StateTransactionPlan {
    const request = buildGmTurnPlanRequestFromTurnResult(turnResult, rules, options);
    return buildStateTransactionPlan(request);
}

export function formatGmTurnTransactionPlanReportLines(
    plan: StateTransactionPlan,
    extras?: { worldStateParseWarnings?: string[] }
): string[] {
    const lines = formatStateTransactionPlanLines(plan);
    if (extras?.worldStateParseWarnings && extras.worldStateParseWarnings.length > 0) {
        lines.push('');
        lines.push('Recent world_state parse cap warnings:');
        for (const line of extras.worldStateParseWarnings) {
            lines.push(`  ${line}`);
        }
    }
    return lines;
}