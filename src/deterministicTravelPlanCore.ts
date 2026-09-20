// Canonical deterministic merchant travel planning (pure; no host or persistence).

import { cargoWeight as computeCargoWeight } from './commerceCore';
import {
    normalizeMerchantTravelMode,
    type MerchantTravelMode,
} from './gameRulesCore';
import {
    findLocationPath,
    MAX_PATH_HOPS,
    planTravel,
} from './transportCore';
import type {
    CargoEntry,
    CommodityDef,
    CommerceForge,
    LocationGraphNode,
    TransportKindDef,
} from './livingWorldTypes';

const MAX_INPUT_LOCATIONS = 512;
const MAX_INPUT_COMMODITIES = 100;
const MAX_INPUT_CARGO_ENTRIES = 100;

export type DeterministicTravelPlanFailureCode =
    | 'invalid_origin'
    | 'invalid_destination'
    | 'same_location'
    | 'transport_missing'
    | 'transport_invalid'
    | 'route_definition_missing'
    | 'route_definition_invalid'
    | 'route_unavailable'
    | 'cargo_invalid'
    | 'commodity_missing'
    | 'over_capacity'
    | 'food_missing'
    | 'food_invalid'
    | 'insufficient_food'
    | 'arithmetic_overflow';

export interface DeterministicTravelPlanInput {
    mode?: unknown;
    originLocationId: string;
    destinationLocationId: string;
    locations?: LocationGraphNode[];
    transport?: TransportKindDef;
    commodities?: CommodityDef[];
    cargo?: CargoEntry[];
    availableFood?: number;
}

interface DeterministicTravelPlanIdentity {
    mode: MerchantTravelMode;
    originLocationId: string | null;
    destinationLocationId: string | null;
}

export interface CompatibilityInstantTravelPlan extends DeterministicTravelPlanIdentity {
    ok: true;
    status: 'compatibility_instant_plan';
    mode: 'instant_free';
    pathLocationIds: [];
    transportId: string | null;
    cargoWeight: null;
    capacity: null;
    travelDuration: 0;
    elapsedWorldTurns: 0;
    foodBefore: number | null;
    foodCost: 0;
    foodAfter: number | null;
}

export interface AvailableDeterministicTravelPlan extends DeterministicTravelPlanIdentity {
    ok: true;
    status: 'available';
    mode: 'world_time';
    originLocationId: string;
    destinationLocationId: string;
    pathLocationIds: string[];
    transportId: string;
    cargoWeight: number;
    capacity: number;
    travelDuration: number;
    elapsedWorldTurns: number;
    foodBefore: number;
    foodCost: number;
    foodAfter: number;
}

export interface DeterministicTravelPlanFailure extends DeterministicTravelPlanIdentity {
    ok: false;
    status: 'rejected' | 'configuration_failure';
    code: DeterministicTravelPlanFailureCode;
    requiredFood?: number;
    availableFood?: number;
    cargoWeight?: number;
    capacity?: number;
}

export type DeterministicTravelPlanResult =
    | CompatibilityInstantTravelPlan
    | AvailableDeterministicTravelPlan
    | DeterministicTravelPlanFailure;

function canonicalId(value: unknown): string | null {
    return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function failure(
    identity: DeterministicTravelPlanIdentity,
    status: DeterministicTravelPlanFailure['status'],
    code: DeterministicTravelPlanFailureCode,
    details: Pick<DeterministicTravelPlanFailure, 'requiredFood' | 'availableFood' | 'cargoWeight' | 'capacity'> = {}
): DeterministicTravelPlanFailure {
    return { ok: false, status, code, ...identity, ...details };
}

function isValidTransport(transport: TransportKindDef): boolean {
    return canonicalId(transport.id) !== null
        && typeof transport.name === 'string'
        && transport.name.trim().length > 0
        && Number.isSafeInteger(transport.capacity)
        && transport.capacity > 0
        && Number.isFinite(transport.speed)
        && transport.speed > 0
        // The parser does not supply a foodPerDay default. Timed travel must be explicit.
        && typeof transport.foodPerDay === 'number'
        && Number.isFinite(transport.foodPerDay)
        && transport.foodPerDay >= 0;
}

function graphDefinitionStatus(locations: LocationGraphNode[]): 'present' | 'missing' | 'invalid' {
    let present = false;
    const ids = new Set<string>();
    for (const location of locations) {
        if (!location || canonicalId(location.id) === null || ids.has(location.id)) { return 'invalid'; }
        ids.add(location.id);
        if (!Object.prototype.hasOwnProperty.call(location, 'connectedTo')) { continue; }
        if (!Array.isArray(location.connectedTo)
            || location.connectedTo.length > MAX_INPUT_LOCATIONS
            || location.connectedTo.some((id) => canonicalId(id) === null)) {
            return 'invalid';
        }
        present = true;
    }
    return present ? 'present' : 'missing';
}

function validateAndComputeCargoWeight(
    commodities: CommodityDef[] | undefined,
    cargo: CargoEntry[] | undefined,
    forge: CommerceForge,
    identity: DeterministicTravelPlanIdentity
): number | DeterministicTravelPlanFailure {
    if (!Array.isArray(commodities) || commodities.length > MAX_INPUT_COMMODITIES
        || !Array.isArray(cargo) || cargo.length > MAX_INPUT_CARGO_ENTRIES) {
        return failure(identity, 'configuration_failure', 'cargo_invalid');
    }

    const commodityIds = new Set<string>();
    for (const commodity of commodities) {
        if (!commodity || canonicalId(commodity.id) === null || commodityIds.has(commodity.id)
            || !Number.isFinite(commodity.weight) || commodity.weight <= 0
            || Math.abs(commodity.weight) > Number.MAX_SAFE_INTEGER) {
            return failure(identity, 'configuration_failure', 'cargo_invalid');
        }
        commodityIds.add(commodity.id);
    }

    for (const entry of cargo) {
        if (!entry || canonicalId(entry.commodityId) === null
            || !Number.isSafeInteger(entry.qty) || entry.qty < 0) {
            return failure(identity, 'configuration_failure', 'cargo_invalid');
        }
        if (!commodityIds.has(entry.commodityId)) {
            return failure(identity, 'configuration_failure', 'commodity_missing');
        }
    }

    const weight = computeCargoWeight(forge, cargo);
    if (!Number.isFinite(weight) || weight < 0 || Math.abs(weight) > Number.MAX_SAFE_INTEGER) {
        return failure(identity, 'configuration_failure', 'arithmetic_overflow');
    }
    return weight;
}

/**
 * Produce a future travel contract without advancing clocks or changing state.
 * Identical inputs produce identical data, and no input object is mutated.
 */
export function planDeterministicMerchantTravel(
    input: DeterministicTravelPlanInput
): DeterministicTravelPlanResult {
    const mode = normalizeMerchantTravelMode(input?.mode);
    const originLocationId = canonicalId(input?.originLocationId);
    const destinationLocationId = canonicalId(input?.destinationLocationId);
    const identity: DeterministicTravelPlanIdentity = { mode, originLocationId, destinationLocationId };

    if (!originLocationId) { return failure(identity, 'configuration_failure', 'invalid_origin'); }
    if (!destinationLocationId) { return failure(identity, 'configuration_failure', 'invalid_destination'); }
    if (originLocationId === destinationLocationId) {
        return failure(identity, 'rejected', 'same_location');
    }

    if (mode === 'instant_free') {
        const food = Number.isSafeInteger(input.availableFood) && (input.availableFood ?? -1) >= 0
            ? input.availableFood as number
            : null;
        return {
            ok: true,
            status: 'compatibility_instant_plan',
            mode,
            originLocationId,
            destinationLocationId,
            pathLocationIds: [],
            transportId: canonicalId(input.transport?.id),
            cargoWeight: null,
            capacity: null,
            travelDuration: 0,
            elapsedWorldTurns: 0,
            foodBefore: food,
            foodCost: 0,
            foodAfter: food,
        };
    }

    if (!Array.isArray(input.locations) || input.locations.length === 0) {
        return failure(identity, 'configuration_failure', 'route_definition_missing');
    }
    if (input.locations.length > MAX_INPUT_LOCATIONS) {
        return failure(identity, 'configuration_failure', 'route_definition_invalid');
    }
    if (!input.locations.some((location) => location?.id === originLocationId)) {
        return failure(identity, 'configuration_failure', 'invalid_origin');
    }
    if (!input.locations.some((location) => location?.id === destinationLocationId)) {
        return failure(identity, 'configuration_failure', 'invalid_destination');
    }

    const graphStatus = graphDefinitionStatus(input.locations);
    if (graphStatus === 'missing') {
        return failure(identity, 'configuration_failure', 'route_definition_missing');
    }
    if (graphStatus === 'invalid') {
        return failure(identity, 'configuration_failure', 'route_definition_invalid');
    }

    if (!input.transport) {
        return failure(identity, 'configuration_failure', 'transport_missing');
    }
    if (!isValidTransport(input.transport)) {
        return failure(identity, 'configuration_failure', 'transport_invalid');
    }

    const forge: CommerceForge = {
        commodities: Array.isArray(input.commodities) ? input.commodities.map((entry) => ({ ...entry })) : [],
        markets: [],
        transportKinds: [{ ...input.transport }],
    };
    const cargo = Array.isArray(input.cargo) ? input.cargo.map((entry) => ({ ...entry })) : input.cargo;
    const weight = validateAndComputeCargoWeight(input.commodities, cargo, forge, identity);
    if (typeof weight !== 'number') { return weight; }
    if (weight > input.transport.capacity) {
        return failure(identity, 'rejected', 'over_capacity', {
            cargoWeight: weight,
            capacity: input.transport.capacity,
        });
    }

    if (input.availableFood === undefined) {
        return failure(identity, 'configuration_failure', 'food_missing');
    }
    if (!Number.isSafeInteger(input.availableFood) || input.availableFood < 0) {
        return failure(identity, 'configuration_failure', 'food_invalid');
    }

    const path = findLocationPath(input.locations, originLocationId, destinationLocationId);
    if (!path || path.length - 1 > MAX_PATH_HOPS) {
        return failure(identity, 'rejected', 'route_unavailable');
    }

    const transportPlan = planTravel({
        fromLocationId: originLocationId,
        toLocationId: destinationLocationId,
        locations: input.locations,
        transportId: input.transport.id,
        forge,
    }, weight);
    if (!transportPlan) {
        return failure(identity, 'rejected', 'route_unavailable');
    }
    if (!Number.isSafeInteger(transportPlan.days) || transportPlan.days < 1
        || !Number.isSafeInteger(transportPlan.foodCost) || transportPlan.foodCost < 0) {
        return failure(identity, 'configuration_failure', 'arithmetic_overflow');
    }

    const foodAfter = input.availableFood - transportPlan.foodCost;
    if (!Number.isSafeInteger(foodAfter)) {
        return failure(identity, 'configuration_failure', 'arithmetic_overflow');
    }
    if (foodAfter < 0) {
        return failure(identity, 'rejected', 'insufficient_food', {
            requiredFood: transportPlan.foodCost,
            availableFood: input.availableFood,
        });
    }

    return {
        ok: true,
        status: 'available',
        mode,
        originLocationId,
        destinationLocationId,
        pathLocationIds: [...path],
        transportId: transportPlan.transportId,
        cargoWeight: weight,
        capacity: transportPlan.capacity,
        travelDuration: transportPlan.days,
        elapsedWorldTurns: transportPlan.days,
        foodBefore: input.availableFood,
        foodCost: transportPlan.foodCost,
        foodAfter,
    };
}
