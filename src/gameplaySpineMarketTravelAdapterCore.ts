// NOAI-GAMEPLAY-SPINE-003: deterministic market-travel query/preview shadow adapter.
// Pure only: no host, filesystem, clock, RNG, request gate, persistence, or commit behavior.

import { normalizeMerchantTravelMode, type MerchantTravelMode } from './gameRulesCore';
import {
    planDeterministicMerchantTravel,
    type DeterministicTravelPlanFailure,
    type DeterministicTravelPlanResult,
} from './deterministicTravelPlanCore';
import type { ActionKey } from './gameplaySpineCore';
import type {
    CargoEntry,
    CommodityDef,
    LocationGraphNode,
    TransportKindDef,
} from './livingWorldTypes';
import {
    buildOpaqueConfirmationToken,
    digestCanonicalValue,
    type CanonicalJsonValue,
    type GameplaySpineClockSpan,
    type GameplaySpinePublicShadowQuery,
    type GameplaySpineShadowQuery,
} from './gameplaySpinePreviewCore';

export const MARKET_TRAVEL_ACTION_KEY: ActionKey = 'commerce:travel_market';
export const MARKET_TRAVEL_ACTION_VERSION = 1;
export const MARKET_TRAVEL_PREVIEW_VERSION = 1;

const CONFIRMATION_TOKEN_DOMAIN = 'lr_mtp_v1';
const MAX_ID_LENGTH = 128;
const MAX_REQUEST_ID_LENGTH = 160;
const MAX_LOCATIONS = 512;
const MAX_DEFINITIONS = 100;
const MAX_CARGO_ENTRIES = 100;

export interface MarketTravelGameCanonicalInput {
    stateRevision?: number;
    currentLocationId: string;
    availableFood?: number;
    selectedTransportId?: string;
    cargo?: CargoEntry[];
}

export interface MarketTravelWorldCanonicalInput {
    stateRevision?: number;
    worldTurn: number;
}

export interface MarketTravelRulesCanonicalInput {
    merchantTravelMode?: unknown;
}

export interface MarketTravelPreviewCanonicalInput {
    requestId: string;
    destinationLocationId: string;
    game: MarketTravelGameCanonicalInput;
    world: MarketTravelWorldCanonicalInput;
    rules: MarketTravelRulesCanonicalInput;
    locations?: LocationGraphNode[];
    transportDefinitions?: TransportKindDef[];
    commodityDefinitions?: CommodityDef[];
}

export interface MarketTravelMechanicalPreview {
    kind: 'market_travel';
    sourcePlanStatus: 'available' | 'compatibility_instant_plan';
    mode: MerchantTravelMode;
    originLocationId: string;
    destinationLocationId: string;
    pathLocationIds: string[];
    transportId: string | null;
    cargoWeight: number | null;
    capacity: number | null;
    travelDuration: number;
    timeCost: GameplaySpineClockSpan;
    food: {
        before: number | null;
        cost: number;
        after: number | null;
    };
    predictedPricesIncluded: false;
}

export interface MarketTravelPreviewWitness {
    schemaVersion: 1;
    ledgerIds: Array<'game_state' | 'world_state'>;
    action: {
        requestId: string;
        actionKey: typeof MARKET_TRAVEL_ACTION_KEY;
        actionVersion: typeof MARKET_TRAVEL_ACTION_VERSION;
        previewVersion: typeof MARKET_TRAVEL_PREVIEW_VERSION;
    };
    selection: {
        destinationLocationId: string;
    };
    game: {
        stateRevision: number | null;
        currentLocationId: string;
        availableFood: number | null;
        selectedTransportId: string | null;
        cargo: Array<{ commodityId: string; qty: number }>;
        cargoDigest: string;
    };
    world: {
        stateRevision: number | null;
        worldTurn: number;
        routeDefinitionDigest: string;
    };
    rules: {
        merchantTravelMode: MerchantTravelMode;
        transportDefinitionDigest: string;
        commodityDefinitionsDigest: string;
    };
    planDigest: string;
}

export interface MarketTravelInternalPreviewEvidence {
    visibility: 'internal';
    witness?: MarketTravelPreviewWitness;
    /** Exact planner output retained for shadow parity diagnostics. */
    sourcePlan?: DeterministicTravelPlanResult;
}

export type MarketTravelQueryResult = GameplaySpineShadowQuery<
    MarketTravelMechanicalPreview,
    MarketTravelInternalPreviewEvidence
>;

export type MarketTravelPublicQuery = GameplaySpinePublicShadowQuery<MarketTravelMechanicalPreview>;

export const MARKET_TRAVEL_VISIBILITY_BOUNDARY = {
    public: [
        'requestId', 'actionKey', 'actionVersion', 'previewVersion', 'admission',
        'mechanicalPreview', 'confirmation', 'unavailable',
    ],
    internal: ['internal.witness', 'internal.sourcePlan'],
    hidden: [
        'rawLedgerHash', 'fullGameState', 'npcRegistry', 'filesystemPath',
        'providerData', 'hiddenRequirements',
    ],
} as const;

export type MarketTravelWitnessValidationCode =
    | 'valid'
    | 'stale_location'
    | 'stale_destination'
    | 'stale_food'
    | 'stale_cargo'
    | 'stale_transport'
    | 'stale_world_turn'
    | 'stale_route_definition'
    | 'stale_rules'
    | 'stale_game_revision'
    | 'stale_world_revision'
    | 'preview_version_mismatch'
    | 'invalid_confirmation_token'
    | 'invalid_current_inputs';

export interface MarketTravelWitnessValidationResult {
    valid: boolean;
    code: MarketTravelWitnessValidationCode;
}

interface NormalizedWitnessInputs {
    witness: MarketTravelPreviewWitness;
    token: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function boundedString(value: unknown, maxLength = MAX_ID_LENGTH): value is string {
    return typeof value === 'string' && value.length > 0 && value.length <= maxLength;
}

function optionalRevision(value: unknown): number | null | undefined {
    if (value === undefined) { return null; }
    if (!Number.isSafeInteger(value) || (value as number) < 0) { return undefined; }
    return value as number;
}

function compareStrings(a: string, b: string): number {
    return a < b ? -1 : a > b ? 1 : 0;
}

function clonePlan(plan: DeterministicTravelPlanResult): DeterministicTravelPlanResult {
    if (!plan.ok) { return { ...plan }; }
    if (plan.status === 'compatibility_instant_plan') {
        return { ...plan, pathLocationIds: [] as [] };
    }
    return { ...plan, pathLocationIds: [...plan.pathLocationIds] };
}

function normalizeCargo(value: unknown): Array<{ commodityId: string; qty: number }> | undefined {
    if (!Array.isArray(value) || value.length > MAX_CARGO_ENTRIES) { return undefined; }
    const out: Array<{ commodityId: string; qty: number }> = [];
    for (const entry of value) {
        if (!isRecord(entry) || !boundedString(entry.commodityId)
            || !Number.isSafeInteger(entry.qty) || (entry.qty as number) < 0) {
            return undefined;
        }
        out.push({ commodityId: entry.commodityId, qty: entry.qty as number });
    }
    return out.sort((a, b) => compareStrings(a.commodityId, b.commodityId) || a.qty - b.qty);
}

function normalizeRouteDefinition(value: unknown): CanonicalJsonValue | undefined {
    if (!Array.isArray(value) || value.length > MAX_LOCATIONS) { return undefined; }
    const out: Array<{ id: string; regionId: string | null; connectedTo: string[] | null }> = [];
    for (const entry of value) {
        if (!isRecord(entry) || !boundedString(entry.id)) { return undefined; }
        const regionId = entry.regionId === undefined
            ? null
            : boundedString(entry.regionId) ? entry.regionId : undefined;
        if (regionId === undefined) { return undefined; }
        let connectedTo: string[] | null = null;
        if (Object.prototype.hasOwnProperty.call(entry, 'connectedTo')) {
            if (!Array.isArray(entry.connectedTo) || entry.connectedTo.length > MAX_LOCATIONS
                || entry.connectedTo.some((id) => !boundedString(id))) {
                return undefined;
            }
            // Neighbor order is material: the authoritative planner uses it for BFS tie-breaking.
            connectedTo = [...entry.connectedTo] as string[];
        }
        out.push({ id: entry.id, regionId, connectedTo });
    }
    out.sort((a, b) => compareStrings(a.id, b.id));
    return out;
}

function normalizeCommodityDefinitions(value: unknown): CanonicalJsonValue | undefined {
    if (!Array.isArray(value) || value.length > MAX_DEFINITIONS) { return undefined; }
    const out: Array<{ id: string; weight: number }> = [];
    for (const entry of value) {
        if (!isRecord(entry) || !boundedString(entry.id)
            || !Number.isFinite(entry.weight) || (entry.weight as number) <= 0
            || Math.abs(entry.weight as number) > Number.MAX_SAFE_INTEGER) {
            return undefined;
        }
        out.push({ id: entry.id, weight: entry.weight as number });
    }
    out.sort((a, b) => compareStrings(a.id, b.id));
    return out;
}

function normalizeSelectedTransportDefinition(
    value: unknown,
    selectedTransportId: string | null,
    mode: MerchantTravelMode
): CanonicalJsonValue | undefined {
    if (!Array.isArray(value) || value.length > MAX_DEFINITIONS) { return undefined; }
    if (!selectedTransportId) { return null; }
    const selected = value.find((entry) => isRecord(entry) && entry.id === selectedTransportId);
    if (!isRecord(selected)
        || !boundedString(selected.id)
        || !boundedString(selected.name)
        || !Number.isSafeInteger(selected.capacity) || (selected.capacity as number) <= 0
        || !Number.isFinite(selected.speed) || (selected.speed as number) <= 0) {
        return undefined;
    }
    const foodPerDay = selected.foodPerDay === undefined && mode === 'instant_free'
        ? null
        : Number.isFinite(selected.foodPerDay) && (selected.foodPerDay as number) >= 0
            ? selected.foodPerDay as number
            : undefined;
    if (foodPerDay === undefined) { return undefined; }
    return {
        id: selected.id,
        name: selected.name,
        capacity: selected.capacity as number,
        speed: selected.speed as number,
        foodPerDay,
    };
}

function toCanonicalWitnessValue(witness: MarketTravelPreviewWitness): CanonicalJsonValue {
    return witness as unknown as CanonicalJsonValue;
}

function buildWitness(
    input: MarketTravelPreviewCanonicalInput,
    plan: DeterministicTravelPlanResult
): NormalizedWitnessInputs | undefined {
    if (!boundedString(input.requestId, MAX_REQUEST_ID_LENGTH)
        || !boundedString(input.destinationLocationId)
        || !isRecord(input.game)
        || !isRecord(input.world)
        || !isRecord(input.rules)
        || !boundedString(input.game.currentLocationId)
        || !Number.isSafeInteger(input.world.worldTurn) || input.world.worldTurn < 0) {
        return undefined;
    }

    const gameRevision = optionalRevision(input.game.stateRevision);
    const worldRevision = optionalRevision(input.world.stateRevision);
    if (gameRevision === undefined || worldRevision === undefined) { return undefined; }

    const selectedTransportId = input.game.selectedTransportId === undefined
        ? null
        : boundedString(input.game.selectedTransportId) ? input.game.selectedTransportId : undefined;
    if (selectedTransportId === undefined) { return undefined; }

    const food = input.game.availableFood === undefined
        ? null
        : Number.isSafeInteger(input.game.availableFood) && input.game.availableFood >= 0
            ? input.game.availableFood
            : undefined;
    if (food === undefined) { return undefined; }

    const mode = normalizeMerchantTravelMode(input.rules.merchantTravelMode);
    const cargo = normalizeCargo(input.game.cargo ?? []);
    const routeDefinition = normalizeRouteDefinition(input.locations ?? []);
    const commodityDefinitions = normalizeCommodityDefinitions(input.commodityDefinitions ?? []);
    const transportDefinition = normalizeSelectedTransportDefinition(
        input.transportDefinitions ?? [],
        selectedTransportId,
        mode
    );
    if (!cargo || routeDefinition === undefined || commodityDefinitions === undefined
        || transportDefinition === undefined) {
        return undefined;
    }

    const planValue = clonePlan(plan) as unknown as CanonicalJsonValue;
    const witness: MarketTravelPreviewWitness = {
        schemaVersion: 1,
        ledgerIds: mode === 'world_time'
            ? ['game_state', 'world_state']
            : ['game_state'],
        action: {
            requestId: input.requestId,
            actionKey: MARKET_TRAVEL_ACTION_KEY,
            actionVersion: MARKET_TRAVEL_ACTION_VERSION,
            previewVersion: MARKET_TRAVEL_PREVIEW_VERSION,
        },
        selection: { destinationLocationId: input.destinationLocationId },
        game: {
            stateRevision: gameRevision,
            currentLocationId: input.game.currentLocationId,
            availableFood: food,
            selectedTransportId,
            cargo,
            cargoDigest: digestCanonicalValue(cargo as unknown as CanonicalJsonValue),
        },
        world: {
            stateRevision: worldRevision,
            worldTurn: input.world.worldTurn,
            routeDefinitionDigest: digestCanonicalValue(routeDefinition),
        },
        rules: {
            merchantTravelMode: mode,
            transportDefinitionDigest: digestCanonicalValue(transportDefinition),
            commodityDefinitionsDigest: digestCanonicalValue(commodityDefinitions),
        },
        planDigest: digestCanonicalValue(planValue),
    };
    return {
        witness,
        token: buildOpaqueConfirmationToken(CONFIRMATION_TOKEN_DOMAIN, toCanonicalWitnessValue(witness)),
    };
}

function invalidQuery(reasonCode: string, requestId = ''): MarketTravelQueryResult {
    return {
        requestId,
        actionKey: MARKET_TRAVEL_ACTION_KEY,
        actionVersion: MARKET_TRAVEL_ACTION_VERSION,
        previewVersion: MARKET_TRAVEL_PREVIEW_VERSION,
        admission: { status: 'invalid', reasonCode },
        unavailable: { kind: 'invalid_query', reasonCode },
    };
}

function plannerFailureQuery(
    requestId: string,
    plan: DeterministicTravelPlanFailure
): MarketTravelQueryResult {
    return {
        requestId,
        actionKey: MARKET_TRAVEL_ACTION_KEY,
        actionVersion: MARKET_TRAVEL_ACTION_VERSION,
        previewVersion: MARKET_TRAVEL_PREVIEW_VERSION,
        admission: {
            status: plan.status === 'rejected' ? 'blocked' : 'invalid',
            reasonCode: plan.code,
        },
        unavailable: { kind: plan.status, reasonCode: plan.code },
        internal: { visibility: 'internal', sourcePlan: clonePlan(plan) },
    };
}

function mechanicalPreview(plan: Exclude<DeterministicTravelPlanResult, DeterministicTravelPlanFailure>): MarketTravelMechanicalPreview {
    return {
        kind: 'market_travel',
        sourcePlanStatus: plan.status,
        mode: plan.mode,
        originLocationId: plan.originLocationId as string,
        destinationLocationId: plan.destinationLocationId as string,
        pathLocationIds: [...plan.pathLocationIds],
        transportId: plan.transportId,
        cargoWeight: plan.cargoWeight,
        capacity: plan.capacity,
        travelDuration: plan.travelDuration,
        timeCost: { clock: 'world', amount: plan.elapsedWorldTurns },
        food: { before: plan.foodBefore, cost: plan.foodCost, after: plan.foodAfter },
        predictedPricesIncluded: false,
    };
}

/** Adapt the authoritative deterministic planner into a no-write Gameplay Spine shadow query. */
export function queryMarketTravelPreview(input: unknown): MarketTravelQueryResult {
    if (!isRecord(input)) { return invalidQuery('invalid_query_input'); }
    const requestId = boundedString(input.requestId, MAX_REQUEST_ID_LENGTH) ? input.requestId : '';
    if (!requestId || !isRecord(input.game) || !isRecord(input.world) || !isRecord(input.rules)) {
        return invalidQuery('invalid_query_input', requestId);
    }

    const transportDefinitions = Array.isArray(input.transportDefinitions)
        ? input.transportDefinitions as TransportKindDef[]
        : undefined;
    const selectedTransportId = input.game.selectedTransportId;
    const selectedTransport = transportDefinitions?.find(
        (entry) => isRecord(entry) && entry.id === selectedTransportId
    );
    const plannerInput = {
        mode: input.rules.merchantTravelMode,
        originLocationId: input.game.currentLocationId as string,
        destinationLocationId: input.destinationLocationId as string,
        locations: Array.isArray(input.locations) ? input.locations as LocationGraphNode[] : undefined,
        transport: selectedTransport as TransportKindDef | undefined,
        commodities: Array.isArray(input.commodityDefinitions)
            ? input.commodityDefinitions as CommodityDef[]
            : undefined,
        cargo: Array.isArray(input.game.cargo) ? input.game.cargo as CargoEntry[] : undefined,
        availableFood: input.game.availableFood as number | undefined,
    };

    let plan: DeterministicTravelPlanResult;
    try {
        plan = planDeterministicMerchantTravel(plannerInput);
    } catch {
        return invalidQuery('invalid_query_input', requestId);
    }
    if (!plan.ok) { return plannerFailureQuery(requestId, plan); }

    const canonicalInput = input as unknown as MarketTravelPreviewCanonicalInput;
    const normalized = buildWitness(canonicalInput, plan);
    if (!normalized) { return invalidQuery('invalid_witness_inputs', requestId); }

    return {
        requestId,
        actionKey: MARKET_TRAVEL_ACTION_KEY,
        actionVersion: MARKET_TRAVEL_ACTION_VERSION,
        previewVersion: MARKET_TRAVEL_PREVIEW_VERSION,
        admission: { status: 'ready' },
        mechanicalPreview: mechanicalPreview(plan),
        confirmation: { policy: 'explicit', token: normalized.token },
        internal: {
            visibility: 'internal',
            witness: normalized.witness,
            sourcePlan: clonePlan(plan),
        },
    };
}

/** Remove internal/hidden evidence before a future Webview transport. */
export function projectMarketTravelQueryPublic(query: MarketTravelQueryResult): MarketTravelPublicQuery {
    return {
        requestId: query.requestId,
        actionKey: query.actionKey,
        actionVersion: query.actionVersion,
        previewVersion: query.previewVersion,
        admission: { ...query.admission },
        ...(query.mechanicalPreview
            ? {
                mechanicalPreview: {
                    ...query.mechanicalPreview,
                    pathLocationIds: [...query.mechanicalPreview.pathLocationIds],
                    timeCost: { ...query.mechanicalPreview.timeCost },
                    food: { ...query.mechanicalPreview.food },
                },
            }
            : {}),
        ...(query.confirmation ? { confirmation: { ...query.confirmation } } : {}),
        ...(query.unavailable ? { unavailable: { ...query.unavailable } } : {}),
    };
}

function invalid(code: MarketTravelWitnessValidationCode): MarketTravelWitnessValidationResult {
    return { valid: false, code };
}

/**
 * Compare a prior internal preview witness with fresh canonical inputs.
 * A stale result is never regenerated-and-accepted automatically.
 */
export function validateMarketTravelPreviewWitness(
    prior: MarketTravelQueryResult,
    currentCanonicalInputs: unknown
): MarketTravelWitnessValidationResult {
    if (prior.actionVersion !== MARKET_TRAVEL_ACTION_VERSION
        || prior.previewVersion !== MARKET_TRAVEL_PREVIEW_VERSION
        || prior.internal?.witness?.action?.actionVersion !== MARKET_TRAVEL_ACTION_VERSION
        || prior.internal?.witness?.action?.previewVersion !== MARKET_TRAVEL_PREVIEW_VERSION) {
        return invalid('preview_version_mismatch');
    }
    const previousWitness = prior.internal?.witness;
    const priorToken = prior.confirmation?.token;
    if (!previousWitness || typeof priorToken !== 'string') {
        return invalid('invalid_confirmation_token');
    }
    const expectedToken = buildOpaqueConfirmationToken(
        CONFIRMATION_TOKEN_DOMAIN,
        toCanonicalWitnessValue(previousWitness)
    );
    if (priorToken !== expectedToken) { return invalid('invalid_confirmation_token'); }
    if (!isRecord(currentCanonicalInputs)
        || currentCanonicalInputs.requestId !== previousWitness.action.requestId) {
        return invalid('invalid_confirmation_token');
    }

    const currentQuery = queryMarketTravelPreview(currentCanonicalInputs);
    const currentPlan = currentQuery.internal?.sourcePlan;
    if (!currentPlan) { return invalid('invalid_current_inputs'); }
    const current = buildWitness(
        currentCanonicalInputs as unknown as MarketTravelPreviewCanonicalInput,
        currentPlan
    )?.witness;
    if (!current) { return invalid('invalid_current_inputs'); }

    if (current.selection.destinationLocationId !== previousWitness.selection.destinationLocationId) {
        return invalid('stale_destination');
    }
    if (current.game.currentLocationId !== previousWitness.game.currentLocationId) {
        return invalid('stale_location');
    }
    if (current.game.availableFood !== previousWitness.game.availableFood) {
        return invalid('stale_food');
    }
    if (current.game.cargoDigest !== previousWitness.game.cargoDigest) {
        return invalid('stale_cargo');
    }
    if (current.game.selectedTransportId !== previousWitness.game.selectedTransportId) {
        return invalid('stale_transport');
    }
    if (current.world.worldTurn !== previousWitness.world.worldTurn) {
        return invalid('stale_world_turn');
    }
    if (current.world.routeDefinitionDigest !== previousWitness.world.routeDefinitionDigest) {
        return invalid('stale_route_definition');
    }
    if (current.rules.merchantTravelMode !== previousWitness.rules.merchantTravelMode
        || current.rules.transportDefinitionDigest !== previousWitness.rules.transportDefinitionDigest
        || current.rules.commodityDefinitionsDigest !== previousWitness.rules.commodityDefinitionsDigest) {
        return invalid('stale_rules');
    }
    if (current.game.stateRevision !== previousWitness.game.stateRevision) {
        return invalid('stale_game_revision');
    }
    if (current.world.stateRevision !== previousWitness.world.stateRevision) {
        return invalid('stale_world_revision');
    }
    if (current.planDigest !== previousWitness.planDigest) {
        return invalid('stale_rules');
    }
    return { valid: true, code: 'valid' };
}
