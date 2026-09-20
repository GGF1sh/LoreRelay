// NOAI-GAMEPLAY-SPINE-001: vehicle:repair_vehicle shadow adapter (pure, no I/O).
// Maps already-produced WorldIntent query/execute results — does not re-execute.

import type {
    IntentExecuteResult,
    IntentQueryResult,
    WorldIntent,
    WorldIntentExecuteStatus,
    WorldIntentQueryStatus,
} from './worldIntentCore';
import {
    REPAIR_VEHICLE_ACTION_KEY,
    type ActionAdmissionStatus,
    type ActionKey,
    type ShadowResolutionStatus,
} from './gameplaySpineCore';

export interface GameplaySpineAdmissionSummary {
    requestId: string;
    actionKey: ActionKey;
    status: ActionAdmissionStatus;
    sourceQueryStatus: WorldIntentQueryStatus;
    reasonCode?: string;
}

export interface GameplaySpineShadowResolutionSummary {
    requestId: string;
    actionKey: ActionKey;
    mode: 'automatic';
    status: ShadowResolutionStatus;
    sourceExecuteStatus?: WorldIntentExecuteStatus;
    candidateChanged: boolean;
    /** Always false in Slice 001 — no commit path exists. */
    committed: false;
    reasonCode?: string;
}

export interface GameplaySpineVehicleShadowSummary {
    admission: GameplaySpineAdmissionSummary;
    /** Present when an execute result was supplied (or adapter failure on mapping). */
    resolution?: GameplaySpineShadowResolutionSummary;
    /** Explicit absence of commit — no ActionCommitStatus is fabricated. */
    commitAttempted: false;
    commit: null;
}

export interface AdaptRepairVehicleShadowOk {
    ok: true;
    summary: GameplaySpineVehicleShadowSummary;
}

export interface AdaptRepairVehicleShadowErr {
    ok: false;
    reasonCode: string;
    message: string;
}

export type AdaptRepairVehicleShadowResult =
    | AdaptRepairVehicleShadowOk
    | AdaptRepairVehicleShadowErr;

const QUERY_TO_ADMISSION: Readonly<Record<WorldIntentQueryStatus, ActionAdmissionStatus>> = {
    allowed: 'ready',
    valid_noop: 'valid_noop',
    blocked: 'blocked',
    invalid: 'invalid',
    unsupported: 'unsupported',
};

function isNonEmptyString(value: unknown): value is string {
    return typeof value === 'string' && value.length > 0;
}

function isRepairVehicleIntent(intent: WorldIntent): boolean {
    return intent
        && intent.subsystem === 'vehicle'
        && intent.action === 'repair_vehicle';
}

function mapAdmission(
    intent: WorldIntent,
    query: IntentQueryResult
): GameplaySpineAdmissionSummary {
    const status = QUERY_TO_ADMISSION[query.status] ?? 'invalid';
    const summary: GameplaySpineAdmissionSummary = {
        requestId: intent.id,
        actionKey: REPAIR_VEHICLE_ACTION_KEY,
        status,
        sourceQueryStatus: query.status,
    };
    if (isNonEmptyString(query.reasonCode)) {
        summary.reasonCode = query.reasonCode;
    }
    return summary;
}

function mapResolution(
    intent: WorldIntent,
    execute: IntentExecuteResult
): GameplaySpineShadowResolutionSummary {
    const requestId = intent.id;
    const actionKey = REPAIR_VEHICLE_ACTION_KEY;
    const base = {
        requestId,
        actionKey,
        mode: 'automatic' as const,
        sourceExecuteStatus: execute.status,
        committed: false as const,
    };

    if (execute.status === 'applied') {
        if (execute.nextVehicleState) {
            return {
                ...base,
                status: 'resolved',
                candidateChanged: true,
                ...(isNonEmptyString(execute.reasonCode) ? { reasonCode: execute.reasonCode } : {}),
            };
        }
        // applied without candidate is not mechanical success
        return {
            ...base,
            status: 'not_resolved',
            candidateChanged: false,
            reasonCode: isNonEmptyString(execute.reasonCode)
                ? execute.reasonCode
                : 'missing_candidate_state',
        };
    }

    if (execute.status === 'valid_noop') {
        return {
            ...base,
            status: 'valid_noop',
            candidateChanged: false,
            ...(isNonEmptyString(execute.reasonCode) ? { reasonCode: execute.reasonCode } : {}),
        };
    }

    if (execute.status === 'failed') {
        return {
            ...base,
            status: 'adapter_failed',
            candidateChanged: false,
            ...(isNonEmptyString(execute.reasonCode) ? { reasonCode: execute.reasonCode } : {}),
        };
    }

    // blocked | invalid | unsupported — no fabricated mechanical success
    return {
        ...base,
        status: 'not_resolved',
        candidateChanged: false,
        ...(isNonEmptyString(execute.reasonCode) ? { reasonCode: execute.reasonCode } : {}),
    };
}

/**
 * Map existing WorldIntent query (+ optional execute) results for vehicle:repair_vehicle
 * into a Gameplay Spine shadow summary.
 *
 * Does not call queryWorldIntent or executeWorldIntent.
 * Does not mutate inputs. Does not claim commit or persistence.
 */
export function adaptRepairVehicleWorldIntentShadow(
    intent: WorldIntent,
    query: IntentQueryResult,
    execute?: IntentExecuteResult
): AdaptRepairVehicleShadowResult {
    if (!intent || typeof intent !== 'object' || !isNonEmptyString(intent.id)) {
        return {
            ok: false,
            reasonCode: 'invalid_intent',
            message: 'Intent is missing or has no id',
        };
    }
    if (!query || typeof query !== 'object' || !isNonEmptyString(query.status)) {
        return {
            ok: false,
            reasonCode: 'invalid_query_result',
            message: 'Query result is missing or has no status',
        };
    }
    if (!isRepairVehicleIntent(intent)) {
        return {
            ok: false,
            reasonCode: 'not_repair_vehicle_intent',
            message: 'Adapter only supports vehicle:repair_vehicle',
        };
    }

    const admission = mapAdmission(intent, query);
    const summary: GameplaySpineVehicleShadowSummary = {
        admission,
        commitAttempted: false,
        commit: null,
    };

    if (execute !== undefined) {
        if (!execute || typeof execute !== 'object' || !isNonEmptyString(execute.status)) {
            return {
                ok: false,
                reasonCode: 'invalid_execute_result',
                message: 'Execute result is missing or has no status',
            };
        }
        summary.resolution = mapResolution(intent, execute);
    }

    return { ok: true, summary };
}
