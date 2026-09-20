// NOAI-ECON-FLOWS-004: productive potential, facility condition, route disruptions.
// Pure Core — no vscode, fs, time, randomness, persistence, or LLM.

import type {
    EconomyFlowDiagnostic,
    ProcessingSite,
    ProductionSource,
    TradeRoute,
} from './economyFlowCore';

export type EconomyRouteStatus =
    | 'open'
    | 'strained'
    | 'blocked'
    | 'raided';

export const ROUTE_STATUS_CAPACITY_MULTIPLIER: Readonly<Record<EconomyRouteStatus, number>> = {
    open: 1,
    strained: 0.5,
    blocked: 0,
    raided: 0.25,
};

export const VALID_ROUTE_STATUSES = new Set<EconomyRouteStatus>([
    'open',
    'strained',
    'blocked',
    'raided',
]);

export interface EconomyRouteRuntimeState {
    status?: EconomyRouteStatus;
    capacityMultiplier?: number;
    riskDelta?: number;
}

/**
 * Runtime operational overrides. Not WorldState; not persisted in this slice.
 * Resolution: runtime override > authored Forge default > neutral default.
 */
export interface EconomyOperationalState {
    sourcePotentialById?: Record<string, number>;
    sourceConditionById?: Record<string, number>;
    processingConditionBySiteId?: Record<string, number>;
    routeStateById?: Record<string, EconomyRouteRuntimeState>;
}

export interface ResolvedProductionOperation {
    productivePotential: number;
    condition: number;
    effectiveMultiplier: number;
    effectiveOutput: number;
}

export interface ResolvedProcessingOperation {
    condition: number;
    effectiveMaxBatches: number;
}

export interface ResolvedRouteOperation {
    status: EconomyRouteStatus;
    statusCapacityMultiplier: number;
    capacityMultiplier: number;
    baseCapacity: number;
    effectiveCapacity: number;
    riskDelta: number;
    baseRisk: number;
    effectiveRisk: number;
}

function isFiniteNumber(value: unknown): value is number {
    return typeof value === 'number' && Number.isFinite(value);
}

function nz(value: number): number {
    return Object.is(value, -0) ? 0 : value;
}

function clamp(value: number, min: number, max: number): number {
    return nz(Math.max(min, Math.min(max, value)));
}

export function isEconomyRouteStatus(value: unknown): value is EconomyRouteStatus {
    return typeof value === 'string' && VALID_ROUTE_STATUSES.has(value as EconomyRouteStatus);
}

/**
 * Resolve a numeric override/default with clamp. Non-finite values fall back.
 * Finite out-of-range values are clamped (with optional diagnostic via outOfRange flag).
 */
function resolveClampedField(
    runtimeValue: unknown,
    authoredValue: unknown,
    neutral: number,
    min: number,
    max: number,
    id: string,
    field: string,
    diagnostics: EconomyFlowDiagnostic[]
): number {
    if (runtimeValue !== undefined) {
        if (!isFiniteNumber(runtimeValue)) {
            diagnostics.push({
                code: 'invalid_operational_value',
                message: `Runtime ${field} for ${id} is non-finite; falling back`,
                id,
            });
        } else {
            if (runtimeValue < min || runtimeValue > max) {
                diagnostics.push({
                    code: 'out_of_range_operational_value',
                    message: `Runtime ${field} for ${id} clamped to [${min}, ${max}]`,
                    id,
                });
            }
            return clamp(runtimeValue, min, max);
        }
    }
    if (authoredValue !== undefined) {
        if (!isFiniteNumber(authoredValue)) {
            diagnostics.push({
                code: 'invalid_operational_value',
                message: `Authored ${field} for ${id} is non-finite; falling back`,
                id,
            });
        } else {
            if (authoredValue < min || authoredValue > max) {
                diagnostics.push({
                    code: 'out_of_range_operational_value',
                    message: `Authored ${field} for ${id} clamped to [${min}, ${max}]`,
                    id,
                });
            }
            return clamp(authoredValue, min, max);
        }
    }
    return neutral;
}

export function resolveProductionSourceOperation(
    source: Pick<ProductionSource, 'id' | 'baseOutputPerTick' | 'productivePotential' | 'condition'>,
    operational?: EconomyOperationalState | null,
    diagnostics: EconomyFlowDiagnostic[] = []
): ResolvedProductionOperation {
    const runtimePotential = operational?.sourcePotentialById?.[source.id];
    const runtimeCondition = operational?.sourceConditionById?.[source.id];

    const productivePotential = resolveClampedField(
        runtimePotential,
        source.productivePotential,
        1,
        0,
        2,
        source.id,
        'productivePotential',
        diagnostics
    );
    const condition = resolveClampedField(
        runtimeCondition,
        source.condition,
        1,
        0,
        1,
        source.id,
        'condition',
        diagnostics
    );
    const base = isFiniteNumber(source.baseOutputPerTick) && source.baseOutputPerTick >= 0
        ? source.baseOutputPerTick
        : 0;
    const effectiveMultiplier = nz(productivePotential * condition);
    const effectiveOutput = nz(base * effectiveMultiplier);
    return {
        productivePotential,
        condition,
        effectiveMultiplier,
        effectiveOutput,
    };
}

export function resolveProcessingSiteOperation(
    site: Pick<ProcessingSite, 'id' | 'maxBatchesPerTick' | 'condition'>,
    operational?: EconomyOperationalState | null,
    diagnostics: EconomyFlowDiagnostic[] = []
): ResolvedProcessingOperation {
    const runtimeCondition = operational?.processingConditionBySiteId?.[site.id];
    const condition = resolveClampedField(
        runtimeCondition,
        site.condition,
        1,
        0,
        1,
        site.id,
        'condition',
        diagnostics
    );
    const baseMax = isFiniteNumber(site.maxBatchesPerTick) && site.maxBatchesPerTick > 0
        ? Math.floor(site.maxBatchesPerTick)
        : 0;
    const effectiveMaxBatches = Math.max(0, Math.floor(nz(baseMax * condition)));
    return { condition, effectiveMaxBatches };
}

export function resolveTradeRouteOperation(
    route: Pick<
        TradeRoute,
        'id' | 'capacityPerTick' | 'baseRisk' | 'status' | 'capacityMultiplier' | 'riskDelta'
    >,
    operational?: EconomyOperationalState | null,
    diagnostics: EconomyFlowDiagnostic[] = []
): ResolvedRouteOperation {
    const runtime = operational?.routeStateById?.[route.id];

    let status: EconomyRouteStatus = 'open';
    if (runtime?.status !== undefined) {
        if (isEconomyRouteStatus(runtime.status)) {
            status = runtime.status;
        } else {
            diagnostics.push({
                code: 'invalid_route_status',
                message: `Runtime status for route ${route.id} is invalid; falling back`,
                id: route.id,
            });
            if (isEconomyRouteStatus(route.status)) {
                status = route.status;
            }
        }
    } else if (isEconomyRouteStatus(route.status)) {
        status = route.status;
    } else if (route.status !== undefined) {
        diagnostics.push({
            code: 'invalid_route_status',
            message: `Authored status for route ${route.id} is invalid; using open`,
            id: route.id,
        });
    }

    const capacityMultiplier = resolveClampedField(
        runtime?.capacityMultiplier,
        route.capacityMultiplier,
        1,
        0,
        2,
        route.id,
        'capacityMultiplier',
        diagnostics
    );
    const riskDelta = resolveClampedField(
        runtime?.riskDelta,
        route.riskDelta,
        0,
        -1,
        1,
        route.id,
        'riskDelta',
        diagnostics
    );

    const baseCapacity = isFiniteNumber(route.capacityPerTick) && route.capacityPerTick >= 0
        ? route.capacityPerTick
        : 0;
    const statusCapacityMultiplier = ROUTE_STATUS_CAPACITY_MULTIPLIER[status];
    const effectiveCapacity = nz(baseCapacity * statusCapacityMultiplier * capacityMultiplier);

    let baseRisk = 0;
    if (route.baseRisk !== undefined) {
        if (isFiniteNumber(route.baseRisk)) {
            baseRisk = clamp(route.baseRisk, 0, 1);
        } else {
            diagnostics.push({
                code: 'invalid_number',
                message: `Route ${route.id} has non-finite baseRisk; using 0`,
                id: route.id,
            });
        }
    }
    const effectiveRisk = clamp(baseRisk + riskDelta, 0, 1);

    return {
        status,
        statusCapacityMultiplier,
        capacityMultiplier,
        baseCapacity: nz(baseCapacity),
        effectiveCapacity,
        riskDelta,
        baseRisk,
        effectiveRisk,
    };
}

/** Emit diagnostics for runtime map keys that do not match known entity ids. */
export function diagnoseUnknownOperationalIds(
    operational: EconomyOperationalState | null | undefined,
    known: {
        sourceIds?: ReadonlySet<string>;
        siteIds?: ReadonlySet<string>;
        routeIds?: ReadonlySet<string>;
    }
): EconomyFlowDiagnostic[] {
    if (!operational) { return []; }
    const out: EconomyFlowDiagnostic[] = [];

    if (operational.sourcePotentialById && known.sourceIds) {
        for (const id of Object.keys(operational.sourcePotentialById)) {
            if (!known.sourceIds.has(id)) {
                out.push({
                    code: 'unknown_source_id',
                    message: `Runtime sourcePotentialById has unknown source id: ${id}`,
                    id,
                });
            }
        }
    }
    if (operational.sourceConditionById && known.sourceIds) {
        for (const id of Object.keys(operational.sourceConditionById)) {
            if (!known.sourceIds.has(id)) {
                out.push({
                    code: 'unknown_source_id',
                    message: `Runtime sourceConditionById has unknown source id: ${id}`,
                    id,
                });
            }
        }
    }
    if (operational.processingConditionBySiteId && known.siteIds) {
        for (const id of Object.keys(operational.processingConditionBySiteId)) {
            if (!known.siteIds.has(id)) {
                out.push({
                    code: 'unknown_processing_site_id',
                    message: `Runtime processingConditionBySiteId has unknown site id: ${id}`,
                    id,
                });
            }
        }
    }
    if (operational.routeStateById && known.routeIds) {
        for (const id of Object.keys(operational.routeStateById)) {
            if (!known.routeIds.has(id)) {
                out.push({
                    code: 'unknown_route_id',
                    message: `Runtime routeStateById has unknown route id: ${id}`,
                    id,
                });
            }
        }
    }
    return out;
}
