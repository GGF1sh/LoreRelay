// NOAI-GAMEPLAY-SPINE-005A: confirmed vehicle repair preview -> typed EffectPlan.
// Pure only: no host, filesystem, clock, RNG, execution, persistence, event, or narration behavior.

import {
    GAMEPLAY_EFFECT_PLAN_VERSION,
    type GameplayEffectPlan,
    type GameplayPlannedEffect,
} from './gameplaySpineEffectPlanCore';
import { REPAIR_VEHICLE_ACTION_KEY } from './gameplaySpineCore';
import {
    buildOpaqueConfirmationToken,
    digestCanonicalValue,
    type CanonicalJsonValue,
    type GameplaySpinePublicShadowQuery,
    type GameplaySpineShadowQuery,
} from './gameplaySpinePreviewCore';
import { applyVehicleOps, type RepairVehicleOp } from './vehicleOpsCore';
import { parseVehicleState, type VehicleState } from './vehicleCore';
import {
    vehicleOpFromWorldIntent,
    type IntentExecuteResult,
    type IntentQueryResult,
    type WorldIntent,
    type WorldIntentQueryContext,
} from './worldIntentCore';

export const REPAIR_VEHICLE_ACTION_VERSION = 1;
export const REPAIR_VEHICLE_PREVIEW_VERSION = 1;
export const REPAIR_VEHICLE_EFFECT_PLAN_VERSION = GAMEPLAY_EFFECT_PLAN_VERSION;

const CONFIRMATION_TOKEN_DOMAIN = 'lr_vrp_v1';
const CORRELATION_TOKEN_DOMAIN = 'lr_vre_v1';
const MAX_ID_LENGTH = 128;
const MAX_REQUEST_ID_LENGTH = 160;

export interface VehicleRepairMechanicalPreview {
    kind: 'vehicle_repair';
    vehicleId: string;
    vehicleName?: string;
    requestedAmount: number;
    hpBefore: number;
    hpAfter: number;
    maxHp: number;
    effectiveRepair: number;
}

export interface VehicleRepairPreviewWitness {
    schemaVersion: 1;
    ledgerIds: ['vehicle_state'];
    action: {
        requestId: string;
        actionKey: typeof REPAIR_VEHICLE_ACTION_KEY;
        actionVersion: typeof REPAIR_VEHICLE_ACTION_VERSION;
        previewVersion: typeof REPAIR_VEHICLE_PREVIEW_VERSION;
    };
    target: {
        vehicleId: string;
        requestedAmount: number;
        hpBefore: number;
        statusBefore: string;
    };
    vehicleState: {
        enableVehicleSystem: boolean;
        worldTurn: number | null;
        parsedCanonicalLedgerDigest: string;
    };
}

export interface VehicleRepairInternalPreviewEvidence {
    visibility: 'internal';
    witness?: VehicleRepairPreviewWitness;
    /** Candidate supplied by the authoritative WorldIntent execution path. */
    candidateParity?: {
        sourceCandidateDigest: string;
        sourceCandidate: VehicleState;
    };
}

export type VehicleRepairQueryResult = GameplaySpineShadowQuery<
    VehicleRepairMechanicalPreview,
    VehicleRepairInternalPreviewEvidence
>;

export type VehicleRepairPublicQuery = GameplaySpinePublicShadowQuery<VehicleRepairMechanicalPreview>;

export const VEHICLE_REPAIR_VISIBILITY_BOUNDARY = {
    public: [
        'requestId', 'actionKey', 'actionVersion', 'previewVersion', 'admission',
        'mechanicalPreview', 'confirmation', 'unavailable',
    ],
    internal: ['internal.witness', 'internal.candidateParity'],
    hidden: [
        'rawLedgerHash', 'fullGameState', 'npcRegistry', 'filesystemPath',
        'providerData', 'hiddenRequirements',
    ],
} as const;

export type VehicleRepairWitnessValidationCode =
    | 'valid'
    | 'stale_vehicle_ledger'
    | 'stale_target_vehicle'
    | 'stale_vehicle_hp'
    | 'stale_vehicle_status'
    | 'stale_rules'
    | 'stale_world_turn'
    | 'preview_version_mismatch'
    | 'action_version_mismatch'
    | 'invalid_confirmation_token'
    | 'invalid_preview';

export interface VehicleRepairWitnessValidationResult {
    valid: boolean;
    code: VehicleRepairWitnessValidationCode;
}

export interface RepairVehicleEffect extends GameplayPlannedEffect<
    'repair_vehicle',
    'vehicle_state',
    { kind: 'vehicle'; id: string }
> {
    amount: number;
}

export interface VehicleRepairEffectPlanSummary {
    kind: 'vehicle_repair';
    vehicleId: string;
    hpBefore: number;
    hpAfter: number;
    effectiveRepair: number;
    effectCount: 1;
    effectTypes: ['repair_vehicle'];
}

export type VehicleRepairEffectPlan = GameplayEffectPlan<
    RepairVehicleEffect,
    VehicleRepairEffectPlanSummary,
    VehicleRepairPreviewWitness,
    'vehicle_state',
    never
> & {
    internal: {
        visibility: 'internal';
        previewWitness: VehicleRepairPreviewWitness;
        sourcePreviewVersion: number;
        candidateEvidence: {
            vehicle_state: VehicleState;
        };
    };
};

export type VehicleRepairEffectPlanFailureCode =
    | Exclude<VehicleRepairWitnessValidationCode, 'valid'>
    | 'preview_unavailable'
    | 'invalid_effect_plan_inputs';

export type VehicleRepairEffectPlanResult =
    | { status: 'available'; plan: VehicleRepairEffectPlan }
    | { status: 'unavailable'; code: VehicleRepairEffectPlanFailureCode };

function boundedId(value: unknown, maxLength = MAX_ID_LENGTH): value is string {
    return typeof value === 'string' && value.length > 0 && value.length <= maxLength;
}

function canonicalVehicleState(value: unknown): VehicleState {
    // parseVehicleState is the ledger's canonical parser.  It preserves array order:
    // no vehicle, cargo, module, crew, note, tag, or warning ordering is declared
    // semantically interchangeable by this adapter.
    return parseVehicleState(value);
}

function vehicleStateDigest(value: unknown): string {
    return digestCanonicalValue(canonicalVehicleState(value) as unknown as CanonicalJsonValue);
}

function worldTurnFromContext(context: WorldIntentQueryContext): number | null {
    return typeof context.worldTurn === 'number' && Number.isFinite(context.worldTurn)
        ? context.worldTurn
        : null;
}

function vehicleSystemEnabled(context: WorldIntentQueryContext): boolean {
    return context.gameRules?.enableVehicleSystem !== false;
}

function baseQuery(requestId: string): Pick<
    VehicleRepairQueryResult,
    'requestId' | 'actionKey' | 'actionVersion' | 'previewVersion'
> {
    return {
        requestId,
        actionKey: REPAIR_VEHICLE_ACTION_KEY,
        actionVersion: REPAIR_VEHICLE_ACTION_VERSION,
        previewVersion: REPAIR_VEHICLE_PREVIEW_VERSION,
    };
}

function unavailableFromSource(
    requestId: string,
    query: IntentQueryResult
): VehicleRepairQueryResult {
    const base = baseQuery(requestId);
    const reasonCode = query.reasonCode ?? 'source_query_unavailable';
    if (query.status === 'valid_noop') {
        return { ...base, admission: { status: 'valid_noop', reasonCode } };
    }
    if (query.status === 'blocked' || query.status === 'unsupported') {
        return {
            ...base,
            admission: { status: query.status, reasonCode },
            unavailable: { kind: 'rejected', reasonCode },
        };
    }
    return {
        ...base,
        admission: { status: 'invalid', reasonCode },
        unavailable: { kind: 'invalid_query', reasonCode },
    };
}

function invalidConfiguration(requestId: string, reasonCode: string): VehicleRepairQueryResult {
    return {
        ...baseQuery(requestId),
        admission: { status: 'invalid', reasonCode },
        unavailable: { kind: 'configuration_failure', reasonCode },
    };
}

function isRepairVehicleIntent(intent: WorldIntent): boolean {
    return intent.subsystem === 'vehicle' && intent.action === 'repair_vehicle';
}

/**
 * Adapt already-produced WorldIntent results into a confirmed repair preview.
 * It never calls queryWorldIntent or executeWorldIntent itself.
 */
export function planVehicleRepairPreview(
    intent: WorldIntent,
    sourceQuery: IntentQueryResult,
    sourceExecute: IntentExecuteResult | undefined,
    context: WorldIntentQueryContext
): VehicleRepairQueryResult {
    const requestId = boundedId(intent?.id, MAX_REQUEST_ID_LENGTH) ? intent.id : '';
    if (!requestId || !isRepairVehicleIntent(intent) || !sourceQuery) {
        return invalidConfiguration(requestId, 'invalid_preview_inputs');
    }
    if (sourceQuery.status !== 'allowed') {
        return unavailableFromSource(requestId, sourceQuery);
    }
    if (!sourceExecute || sourceExecute.status !== 'applied' || !sourceExecute.nextVehicleState) {
        return invalidConfiguration(requestId, 'missing_candidate_state');
    }

    const op = vehicleOpFromWorldIntent(intent);
    if (!op || op.type !== 'repair_vehicle') {
        return invalidConfiguration(requestId, 'invalid_vehicle_payload');
    }
    const repairOp: RepairVehicleOp = op;
    const current = canonicalVehicleState(context.vehicleState);
    const target = current.vehicles.find((vehicle) => vehicle.id === repairOp.vehicleId);
    if (!target) {
        return invalidConfiguration(requestId, 'missing_target_vehicle');
    }

    const sourceCandidate = canonicalVehicleState(sourceExecute.nextVehicleState);
    const candidateTarget = sourceCandidate.vehicles.find((vehicle) => vehicle.id === repairOp.vehicleId);
    if (!candidateTarget) {
        return invalidConfiguration(requestId, 'missing_candidate_target');
    }
    const worldTurn = worldTurnFromContext(context);
    const directCandidate = applyVehicleOps(
        current,
        [repairOp],
        worldTurn === null ? undefined : { worldTurn }
    );
    if (!directCandidate || vehicleStateDigest(sourceCandidate) !== vehicleStateDigest(directCandidate)) {
        return invalidConfiguration(requestId, 'parity_mismatch');
    }

    const effectiveRepair = candidateTarget.durability.hp - target.durability.hp;
    if (effectiveRepair <= 0 || candidateTarget.durability.maxHp !== target.durability.maxHp) {
        return invalidConfiguration(requestId, 'invalid_candidate_state');
    }

    const witness: VehicleRepairPreviewWitness = {
        schemaVersion: 1,
        ledgerIds: ['vehicle_state'],
        action: {
            requestId,
            actionKey: REPAIR_VEHICLE_ACTION_KEY,
            actionVersion: REPAIR_VEHICLE_ACTION_VERSION,
            previewVersion: REPAIR_VEHICLE_PREVIEW_VERSION,
        },
        target: {
            vehicleId: repairOp.vehicleId,
            requestedAmount: repairOp.amount,
            hpBefore: target.durability.hp,
            statusBefore: target.status,
        },
        vehicleState: {
            enableVehicleSystem: vehicleSystemEnabled(context),
            worldTurn: worldTurnFromContext(context),
            parsedCanonicalLedgerDigest: vehicleStateDigest(current),
        },
    };
    const token = buildOpaqueConfirmationToken(
        CONFIRMATION_TOKEN_DOMAIN,
        witness as unknown as CanonicalJsonValue
    );
    const mechanicalPreview: VehicleRepairMechanicalPreview = {
        kind: 'vehicle_repair',
        vehicleId: repairOp.vehicleId,
        requestedAmount: repairOp.amount,
        hpBefore: target.durability.hp,
        hpAfter: candidateTarget.durability.hp,
        maxHp: target.durability.maxHp,
        effectiveRepair,
        ...(target.name ? { vehicleName: target.name } : {}),
    };

    return {
        ...baseQuery(requestId),
        admission: { status: 'ready' },
        mechanicalPreview,
        confirmation: { policy: 'explicit', token },
        internal: {
            visibility: 'internal',
            witness,
            candidateParity: {
                sourceCandidateDigest: vehicleStateDigest(sourceCandidate),
                sourceCandidate,
            },
        },
    };
}

export function validateVehicleRepairPreviewWitness(
    witness: VehicleRepairPreviewWitness,
    token: string,
    context: WorldIntentQueryContext
): VehicleRepairWitnessValidationResult {
    if (!witness || witness.schemaVersion !== 1) {
        return { valid: false, code: 'invalid_preview' };
    }
    const computedToken = buildOpaqueConfirmationToken(
        CONFIRMATION_TOKEN_DOMAIN,
        witness as unknown as CanonicalJsonValue
    );
    if (computedToken !== token) {
        return { valid: false, code: 'invalid_confirmation_token' };
    }
    if (witness.action.previewVersion !== REPAIR_VEHICLE_PREVIEW_VERSION) {
        return { valid: false, code: 'preview_version_mismatch' };
    }
    if (witness.action.actionVersion !== REPAIR_VEHICLE_ACTION_VERSION) {
        return { valid: false, code: 'action_version_mismatch' };
    }
    if (witness.vehicleState.enableVehicleSystem !== vehicleSystemEnabled(context)) {
        return { valid: false, code: 'stale_rules' };
    }
    if (witness.vehicleState.worldTurn !== worldTurnFromContext(context)) {
        return { valid: false, code: 'stale_world_turn' };
    }

    const current = canonicalVehicleState(context.vehicleState);
    const currentTarget = current.vehicles.find((vehicle) => vehicle.id === witness.target.vehicleId);
    if (!currentTarget) {
        return { valid: false, code: 'stale_target_vehicle' };
    }
    if (vehicleStateDigest(current) !== witness.vehicleState.parsedCanonicalLedgerDigest) {
        if (currentTarget.durability.hp !== witness.target.hpBefore) {
            return { valid: false, code: 'stale_vehicle_hp' };
        }
        if (currentTarget.status !== witness.target.statusBefore) {
            return { valid: false, code: 'stale_vehicle_status' };
        }
        return { valid: false, code: 'stale_vehicle_ledger' };
    }
    return { valid: true, code: 'valid' };
}

function cloneWitness(witness: VehicleRepairPreviewWitness): VehicleRepairPreviewWitness {
    return {
        schemaVersion: witness.schemaVersion,
        ledgerIds: ['vehicle_state'],
        action: { ...witness.action },
        target: { ...witness.target },
        vehicleState: { ...witness.vehicleState },
    };
}

/** Build the typed intent only after the complete vehicle ledger witness remains valid. */
export function buildVehicleRepairEffectPlan(
    query: VehicleRepairQueryResult,
    currentContext: WorldIntentQueryContext
): VehicleRepairEffectPlanResult {
    if (query?.admission?.status !== 'ready' || query.unavailable || !query.mechanicalPreview
        || !query.confirmation || !query.internal?.witness || !query.internal.candidateParity) {
        return { status: 'unavailable', code: 'preview_unavailable' };
    }
    const validation = validateVehicleRepairPreviewWitness(
        query.internal.witness,
        query.confirmation.token,
        currentContext
    );
    if (!validation.valid) {
        return {
            status: 'unavailable',
            code: validation.code as Exclude<VehicleRepairWitnessValidationCode, 'valid'>,
        };
    }

    const preview = query.mechanicalPreview;
    const candidate = canonicalVehicleState(query.internal.candidateParity.sourceCandidate);
    const candidateDigest = vehicleStateDigest(candidate);
    const current = canonicalVehicleState(currentContext.vehicleState);
    const target = current.vehicles.find((vehicle) => vehicle.id === preview.vehicleId);
    const candidateTarget = candidate.vehicles.find((vehicle) => vehicle.id === preview.vehicleId);
    if (!boundedId(query.requestId, MAX_REQUEST_ID_LENGTH)
        || !target
        || !candidateTarget
        || candidateDigest !== query.internal.candidateParity.sourceCandidateDigest
        || candidateTarget.durability.hp !== preview.hpAfter
        || target.durability.hp !== preview.hpBefore
        || candidateTarget.durability.hp - target.durability.hp !== preview.effectiveRepair) {
        return { status: 'unavailable', code: 'invalid_effect_plan_inputs' };
    }

    const effect: RepairVehicleEffect = {
        order: 0,
        effectType: 'repair_vehicle',
        ledgerId: 'vehicle_state',
        target: { kind: 'vehicle', id: preview.vehicleId },
        amount: preview.requestedAmount,
    };
    const witness = cloneWitness(query.internal.witness);
    const confirmationToken = query.confirmation.token;
    return {
        status: 'available',
        plan: {
            planVersion: REPAIR_VEHICLE_EFFECT_PLAN_VERSION,
            actionKey: REPAIR_VEHICLE_ACTION_KEY,
            actionVersion: REPAIR_VEHICLE_ACTION_VERSION,
            requestId: query.requestId,
            correlationId: buildOpaqueConfirmationToken(CORRELATION_TOKEN_DOMAIN, {
                actionKey: REPAIR_VEHICLE_ACTION_KEY,
                requestId: query.requestId,
                confirmationToken,
            }),
            sourcePreview: {
                previewVersion: REPAIR_VEHICLE_PREVIEW_VERSION,
                confirmationToken,
            },
            admission: { sourceStatus: 'ready' },
            confirmation: { policy: 'explicit', status: 'validated' },
            touchedLedgers: ['vehicle_state'],
            potentialExpansionLedgers: [],
            effects: [effect],
            publicSummary: {
                kind: 'vehicle_repair',
                vehicleId: preview.vehicleId,
                hpBefore: preview.hpBefore,
                hpAfter: preview.hpAfter,
                effectiveRepair: preview.effectiveRepair,
                effectCount: 1,
                effectTypes: ['repair_vehicle'],
            },
            internal: {
                visibility: 'internal',
                previewWitness: witness,
                sourcePreviewVersion: REPAIR_VEHICLE_PREVIEW_VERSION,
                candidateEvidence: { vehicle_state: candidate },
            },
        },
    };
}
