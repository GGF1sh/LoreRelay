// NOAI-GAMEPLAY-SPINE-004: confirmed market-travel preview -> typed EffectPlan.
// Pure only: no host, filesystem, clock, RNG, execution, persistence, event, or narration behavior.

import type { MerchantTravelMode } from './gameRulesCore';
import {
    GAMEPLAY_EFFECT_PLAN_VERSION,
    type GameplayEffectPlan,
    type GameplayPlannedEffect,
} from './gameplaySpineEffectPlanCore';
import {
    MARKET_TRAVEL_ACTION_KEY,
    MARKET_TRAVEL_ACTION_VERSION,
    MARKET_TRAVEL_PREVIEW_VERSION,
    validateMarketTravelPreviewWitness,
    type MarketTravelMechanicalPreview,
    type MarketTravelPreviewWitness,
    type MarketTravelQueryResult,
    type MarketTravelWitnessValidationCode,
} from './gameplaySpineMarketTravelAdapterCore';
import {
    buildOpaqueConfirmationToken,
    digestCanonicalValue,
    type CanonicalJsonValue,
    type GameplaySpineClockSpan,
} from './gameplaySpinePreviewCore';
import type {
    CompatibilityInstantTravelPlan,
    AvailableDeterministicTravelPlan,
} from './deterministicTravelPlanCore';

export const MARKET_TRAVEL_EFFECT_PLAN_VERSION = GAMEPLAY_EFFECT_PLAN_VERSION;

const CORRELATION_TOKEN_DOMAIN = 'lr_mte_v1';
const MAX_ID_LENGTH = 128;
const MAX_REQUEST_ID_LENGTH = 160;

export type MarketTravelConcreteLedgerId = 'game_state' | 'world_state';
export type MarketTravelPotentialExpansionLedgerId = 'npc_registry';

export interface SetCurrentLocationEffect extends GameplayPlannedEffect<
    'set_current_location',
    'game_state',
    { kind: 'location'; id: string }
> {
    beforeLocationId: string;
    afterLocationId: string;
}

export interface SetTravelFoodEffect extends GameplayPlannedEffect<
    'set_travel_food',
    'game_state',
    { kind: 'commerce_food' }
> {
    before: number;
    cost: number;
    after: number;
}

export interface AdvanceWorldClockEffect extends GameplayPlannedEffect<
    'advance_clock',
    'world_state',
    { kind: 'clock'; clock: 'world' }
> {
    span: GameplaySpineClockSpan & { clock: 'world' };
}

export type MarketTravelEffect =
    | SetCurrentLocationEffect
    | SetTravelFoodEffect
    | AdvanceWorldClockEffect;

export interface MarketTravelEffectPlanSummary {
    kind: 'market_travel';
    mode: MerchantTravelMode;
    originLocationId: string;
    destinationLocationId: string;
    transportId: string | null;
    travelDuration: number;
    food: {
        before: number | null;
        cost: number;
        after: number | null;
    };
    worldTimeSpan: (GameplaySpineClockSpan & { clock: 'world' }) | null;
    effectCount: number;
    effectTypes: MarketTravelEffect['effectType'][];
    predictedMarketResultsIncluded: false;
    predictedNpcResultsIncluded: false;
    predictedEventResultsIncluded: false;
}

export type MarketTravelEffectPlan = GameplayEffectPlan<
    MarketTravelEffect,
    MarketTravelEffectPlanSummary,
    MarketTravelPreviewWitness,
    MarketTravelConcreteLedgerId,
    MarketTravelPotentialExpansionLedgerId
>;

export type MarketTravelEffectPlanFailureCode =
    | Exclude<MarketTravelWitnessValidationCode, 'valid'>
    | 'preview_unavailable'
    | 'invalid_effect_plan_inputs';

export type MarketTravelEffectPlanResult =
    | { status: 'available'; plan: MarketTravelEffectPlan }
    | { status: 'unavailable'; code: MarketTravelEffectPlanFailureCode };

export type MarketTravelPublicEffectPlan = Omit<MarketTravelEffectPlan, 'effects' | 'internal'>;

export interface LegacyInstantMarketTravelFacts {
    mode: 'instant_free';
    originLocationId: string;
    destinationLocationId: string;
    elapsedWorldTurns: number;
    fixedCosts: Array<{ costId: string; amount: number }>;
    foodBefore: number | null;
    foodAfter: number | null;
    mutatedLedgers: Array<'game_state' | 'world_state' | 'npc_registry'>;
    worldMutationClaimed: boolean;
    npcMutationClaimed: boolean;
}

export interface InstantMarketTravelPlanFacts {
    mode: 'instant_free';
    originLocationId: string;
    destinationLocationId: string;
    elapsedWorldTurns: 0;
    fixedCosts: [];
    foodBefore: number | null;
    foodAfter: number | null;
    mutatedLedgers: ['game_state'];
    worldMutationClaimed: false;
    npcMutationClaimed: false;
}

export type InstantMarketTravelParityCode =
    | 'match'
    | 'not_instant_plan'
    | 'location_mismatch'
    | 'time_mismatch'
    | 'cost_mismatch'
    | 'food_mismatch'
    | 'ledger_mismatch'
    | 'expanded_mutation_claimed';

export interface InstantMarketTravelParityResult {
    matches: boolean;
    code: InstantMarketTravelParityCode;
}

function boundedId(value: unknown, maxLength = MAX_ID_LENGTH): value is string {
    return typeof value === 'string' && value.length > 0 && value.length <= maxLength;
}

function safeNonNegativeInteger(value: unknown): value is number {
    return Number.isSafeInteger(value) && (value as number) >= 0;
}

function cloneWitness(witness: MarketTravelPreviewWitness): MarketTravelPreviewWitness | undefined {
    if (!Array.isArray(witness?.ledgerIds) || !Array.isArray(witness?.game?.cargo)) {
        return undefined;
    }
    return {
        schemaVersion: witness.schemaVersion,
        ledgerIds: [...witness.ledgerIds],
        action: { ...witness.action },
        selection: { ...witness.selection },
        game: {
            ...witness.game,
            cargo: witness.game.cargo.map((entry) => ({ ...entry })),
        },
        world: { ...witness.world },
        rules: { ...witness.rules },
        planDigest: witness.planDigest,
    };
}

function unavailable(code: MarketTravelEffectPlanFailureCode): MarketTravelEffectPlanResult {
    return { status: 'unavailable', code };
}

function plansMatchPreview(
    plan: CompatibilityInstantTravelPlan | AvailableDeterministicTravelPlan,
    preview: MarketTravelMechanicalPreview
): boolean {
    return plan.status === preview.sourcePlanStatus
        && plan.mode === preview.mode
        && plan.originLocationId === preview.originLocationId
        && plan.destinationLocationId === preview.destinationLocationId
        && plan.transportId === preview.transportId
        && plan.travelDuration === preview.travelDuration
        && plan.elapsedWorldTurns === preview.timeCost.amount
        && preview.timeCost.clock === 'world'
        && plan.foodBefore === preview.food.before
        && plan.foodCost === preview.food.cost
        && plan.foodAfter === preview.food.after;
}

function validSourcePlan(
    query: MarketTravelQueryResult
): CompatibilityInstantTravelPlan | AvailableDeterministicTravelPlan | undefined {
    const sourcePlan = query.internal?.sourcePlan;
    const preview = query.mechanicalPreview;
    const witness = query.internal?.witness;
    if (!sourcePlan?.ok || !preview || !witness || !plansMatchPreview(sourcePlan, preview)) {
        return undefined;
    }
    try {
        if (digestCanonicalValue(sourcePlan as unknown as CanonicalJsonValue) !== witness.planDigest) {
            return undefined;
        }
    } catch {
        return undefined;
    }
    if (!boundedId(sourcePlan.originLocationId)
        || !boundedId(sourcePlan.destinationLocationId)
        || (sourcePlan.transportId !== null && !boundedId(sourcePlan.transportId))
        || !safeNonNegativeInteger(sourcePlan.travelDuration)
        || !safeNonNegativeInteger(sourcePlan.elapsedWorldTurns)
        || !safeNonNegativeInteger(sourcePlan.foodCost)) {
        return undefined;
    }
    if (sourcePlan.mode === 'world_time') {
        if (!safeNonNegativeInteger(sourcePlan.foodBefore)
            || !safeNonNegativeInteger(sourcePlan.foodAfter)
            || sourcePlan.foodBefore - sourcePlan.foodCost !== sourcePlan.foodAfter
            || sourcePlan.elapsedWorldTurns < 1) {
            return undefined;
        }
    } else if (sourcePlan.elapsedWorldTurns !== 0
        || sourcePlan.foodCost !== 0
        || sourcePlan.foodBefore !== sourcePlan.foodAfter) {
        return undefined;
    }
    return sourcePlan;
}

function buildEffects(
    plan: CompatibilityInstantTravelPlan | AvailableDeterministicTravelPlan
): MarketTravelEffect[] {
    const effects: MarketTravelEffect[] = [{
        order: 0,
        effectType: 'set_current_location',
        ledgerId: 'game_state',
        target: { kind: 'location', id: plan.destinationLocationId as string },
        beforeLocationId: plan.originLocationId as string,
        afterLocationId: plan.destinationLocationId as string,
    }];
    if (plan.mode === 'world_time') {
        effects.push({
            order: 1,
            effectType: 'set_travel_food',
            ledgerId: 'game_state',
            target: { kind: 'commerce_food' },
            before: plan.foodBefore,
            cost: plan.foodCost,
            after: plan.foodAfter,
        });
        effects.push({
            order: 2,
            effectType: 'advance_clock',
            ledgerId: 'world_state',
            target: { kind: 'clock', clock: 'world' },
            span: { clock: 'world', amount: plan.elapsedWorldTurns },
        });
    }
    return effects;
}

/** Build intended effects only after the Slice 003 witness remains valid. */
export function buildMarketTravelEffectPlan(
    priorPreview: MarketTravelQueryResult,
    currentCanonicalInputs: unknown
): MarketTravelEffectPlanResult {
    if (priorPreview?.admission?.status !== 'ready'
        || priorPreview.unavailable
        || !priorPreview.mechanicalPreview) {
        return unavailable('preview_unavailable');
    }

    let validation: ReturnType<typeof validateMarketTravelPreviewWitness>;
    try {
        validation = validateMarketTravelPreviewWitness(priorPreview, currentCanonicalInputs);
    } catch {
        return unavailable('invalid_effect_plan_inputs');
    }
    if (!validation.valid) {
        return unavailable(validation.code as Exclude<MarketTravelWitnessValidationCode, 'valid'>);
    }

    const confirmationToken = priorPreview.confirmation?.token;
    const witness = priorPreview.internal?.witness;
    const sourcePlan = validSourcePlan(priorPreview);
    const copiedWitness = witness ? cloneWitness(witness) : undefined;
    if (!boundedId(priorPreview.requestId, MAX_REQUEST_ID_LENGTH)
        || !boundedId(confirmationToken, 80)
        || !witness
        || !copiedWitness
        || !sourcePlan) {
        return unavailable('invalid_effect_plan_inputs');
    }

    const effects = buildEffects(sourcePlan);
    const worldTimeSpan = sourcePlan.mode === 'world_time'
        ? { clock: 'world' as const, amount: sourcePlan.elapsedWorldTurns }
        : null;
    const touchedLedgers: MarketTravelConcreteLedgerId[] = sourcePlan.mode === 'world_time'
        ? ['game_state', 'world_state']
        : ['game_state'];
    const potentialExpansionLedgers: MarketTravelPotentialExpansionLedgerId[] = sourcePlan.mode === 'world_time'
        ? ['npc_registry']
        : [];
    const summary: MarketTravelEffectPlanSummary = {
        kind: 'market_travel',
        mode: sourcePlan.mode,
        originLocationId: sourcePlan.originLocationId as string,
        destinationLocationId: sourcePlan.destinationLocationId as string,
        transportId: sourcePlan.transportId,
        travelDuration: sourcePlan.travelDuration,
        food: {
            before: sourcePlan.foodBefore,
            cost: sourcePlan.foodCost,
            after: sourcePlan.foodAfter,
        },
        worldTimeSpan,
        effectCount: effects.length,
        effectTypes: effects.map((effect) => effect.effectType),
        predictedMarketResultsIncluded: false,
        predictedNpcResultsIncluded: false,
        predictedEventResultsIncluded: false,
    };
    const correlationId = buildOpaqueConfirmationToken(CORRELATION_TOKEN_DOMAIN, {
        actionKey: MARKET_TRAVEL_ACTION_KEY,
        requestId: priorPreview.requestId,
        confirmationToken,
    });

    return {
        status: 'available',
        plan: {
            planVersion: MARKET_TRAVEL_EFFECT_PLAN_VERSION,
            actionKey: MARKET_TRAVEL_ACTION_KEY,
            actionVersion: MARKET_TRAVEL_ACTION_VERSION,
            requestId: priorPreview.requestId,
            correlationId,
            sourcePreview: {
                previewVersion: MARKET_TRAVEL_PREVIEW_VERSION,
                confirmationToken,
            },
            admission: { sourceStatus: 'ready' },
            confirmation: { policy: 'explicit', status: 'validated' },
            touchedLedgers,
            potentialExpansionLedgers,
            effects,
            publicSummary: summary,
            internal: {
                visibility: 'internal',
                previewWitness: copiedWitness,
                sourcePreviewVersion: MARKET_TRAVEL_PREVIEW_VERSION,
            },
        },
    };
}

/** Remove intended effect payloads and internal witness evidence for public transport. */
export function projectMarketTravelEffectPlanPublic(
    plan: MarketTravelEffectPlan
): MarketTravelPublicEffectPlan {
    return {
        planVersion: plan.planVersion,
        actionKey: plan.actionKey,
        actionVersion: plan.actionVersion,
        requestId: plan.requestId,
        correlationId: plan.correlationId,
        sourcePreview: { ...plan.sourcePreview },
        admission: { ...plan.admission },
        confirmation: { ...plan.confirmation },
        touchedLedgers: [...plan.touchedLedgers],
        potentialExpansionLedgers: [...plan.potentialExpansionLedgers],
        publicSummary: {
            ...plan.publicSummary,
            food: { ...plan.publicSummary.food },
            worldTimeSpan: plan.publicSummary.worldTimeSpan
                ? { ...plan.publicSummary.worldTimeSpan }
                : null,
            effectTypes: [...plan.publicSummary.effectTypes],
        },
    };
}

/** Project bounded plan facts comparable with the current instant/free production preview. */
export function projectInstantMarketTravelEffectPlanFacts(
    plan: MarketTravelEffectPlan
): InstantMarketTravelPlanFacts | undefined {
    if (plan.publicSummary.mode !== 'instant_free'
        || plan.effects.length !== 1
        || plan.effects[0]?.effectType !== 'set_current_location'
        || plan.publicSummary.worldTimeSpan !== null
        || plan.publicSummary.food.cost !== 0
        || plan.publicSummary.food.before !== plan.publicSummary.food.after
        || plan.touchedLedgers.length !== 1
        || plan.touchedLedgers[0] !== 'game_state'
        || plan.potentialExpansionLedgers.length !== 0) {
        return undefined;
    }
    return {
        mode: 'instant_free',
        originLocationId: plan.publicSummary.originLocationId,
        destinationLocationId: plan.publicSummary.destinationLocationId,
        elapsedWorldTurns: 0,
        fixedCosts: [],
        foodBefore: plan.publicSummary.food.before,
        foodAfter: plan.publicSummary.food.after,
        mutatedLedgers: ['game_state'],
        worldMutationClaimed: false,
        npcMutationClaimed: false,
    };
}

/** Compare pure bounded facts; this function never calls the production writer. */
export function compareInstantMarketTravelLegacyParity(
    plan: MarketTravelEffectPlan,
    legacy: LegacyInstantMarketTravelFacts
): InstantMarketTravelParityResult {
    const projected = projectInstantMarketTravelEffectPlanFacts(plan);
    if (!projected) { return { matches: false, code: 'not_instant_plan' }; }
    if (projected.originLocationId !== legacy.originLocationId
        || projected.destinationLocationId !== legacy.destinationLocationId) {
        return { matches: false, code: 'location_mismatch' };
    }
    if (legacy.elapsedWorldTurns !== 0) { return { matches: false, code: 'time_mismatch' }; }
    if (legacy.fixedCosts.length !== 0) { return { matches: false, code: 'cost_mismatch' }; }
    if (projected.foodBefore !== legacy.foodBefore || projected.foodAfter !== legacy.foodAfter) {
        return { matches: false, code: 'food_mismatch' };
    }
    if (legacy.mutatedLedgers.length !== 1 || legacy.mutatedLedgers[0] !== 'game_state') {
        return { matches: false, code: 'ledger_mismatch' };
    }
    if (legacy.worldMutationClaimed || legacy.npcMutationClaimed) {
        return { matches: false, code: 'expanded_mutation_claimed' };
    }
    return { matches: true, code: 'match' };
}
