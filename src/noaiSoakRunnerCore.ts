// NOAI-SOAK-001: pure core for the deterministic long-horizon gameplay/engine runner.
//
// This module contains NO fs / vscode / network / LLM / ComfyUI / child_process access.
// It owns the opt-in soak scenario contract, deterministic player policies, telemetry
// aggregation, machine invariants, and report rendering. The host script
// (scripts/run_noai_soak.js) wires this to compiled production cores and the filesystem.
//
// It deliberately reuses production truth rather than re-deriving it:
//   - commerceCore read helpers size player trades (production applyTradeOp is the sole mutator);
//   - worldEventLogCore builds and dedups player-sourced event identities;
//   - determinismSpineCore serializes action/event streams for drift comparison;
//   - gameQaRunnerCore safe-path helpers gate temp deletion and fixture resolution.

import {
    MAX_TRADE_QTY,
    MIN_PRICE,
    cargoWeight,
    quoteMarketPrice,
    transportCapacity,
} from './commerceCore';
import { MAX_PROFILE_PRICE_INDEX, MIN_PRICE_INDEX } from './worldSimCommerceCore';
import {
    MAX_RECENT_CHANGES,
    makeWorldChangeEvent,
    mergeRecentChanges,
    type WorldChangeCategory,
    type WorldChangeEvent,
} from './worldEventLogCore';
import { stableSerialize } from './determinismSpineCore';
import { isSafeQaTempDeletionTarget, resolveRepoFixturePath } from './gameQaRunnerCore';
import type {
    CargoEntry,
    CommerceForge,
    CommodityDef,
    MarketStateMap,
    PlayerCommerceState,
    TradeOp,
} from './livingWorldTypes';

export { isSafeQaTempDeletionTarget, resolveRepoFixturePath };

// ---------------------------------------------------------------------------
// Versions & vocabulary
// ---------------------------------------------------------------------------

export const NOAI_SOAK_SCENARIO_VERSION = 1 as const;
export const NOAI_SOAK_REPORT_SCHEMA_VERSION = 1 as const;
export const DEFAULT_NOAI_SOAK_TEMP_ROOT = '.tmp/noai_soak';

export const NOAI_SOAK_RUN_MODES = ['quick', 'full', 'benchmark'] as const;
export type NoaiSoakRunMode = (typeof NOAI_SOAK_RUN_MODES)[number];

export const NOAI_SOAK_POLICIES = ['observe_only', 'merchant_balanced', 'merchant_stress'] as const;
export type NoaiSoakPolicyId = (typeof NOAI_SOAK_POLICIES)[number];

export const NOAI_SOAK_ACTION_TYPES = ['observe', 'buy', 'sell'] as const;
export type NoaiSoakActionType = (typeof NOAI_SOAK_ACTION_TYPES)[number];

/** Allowlisted machine invariants. No AI prose decides any of these. */
export const NOAI_SOAK_INVARIANTS = [
    'no_nan_or_infinity',
    'json_parseable',
    'world_turn_monotonic',
    'nonnegative_resources',
    'market_ranges_valid',
    'caps_bounded',
    'no_duplicate_event_ids',
    'no_duplicate_one_shot_events',
    'output_files_bounded',
] as const;
export type NoaiSoakInvariantId = (typeof NOAI_SOAK_INVARIANTS)[number];

/**
 * Keys that must never appear anywhere in a scenario document. Scenarios are pure
 * data: no shell commands, code, or arbitrary execution may be supplied from JSON.
 */
export const NOAI_SOAK_FORBIDDEN_KEYS = [
    'command', 'commands', 'cmd', 'shell', 'exec', 'execute', 'eval',
    'script', 'scripts', 'spawn', 'code', 'run', 'require', 'import',
] as const;

// ---------------------------------------------------------------------------
// Scenario contract
// ---------------------------------------------------------------------------

export type NoaiSoakWorkspaceSource =
    | { source: 'empty' }
    | { source: 'sample'; sampleId: string }
    | { source: 'fixture'; fixturePath: string };

export interface NoaiSoakHorizon {
    turns: number;
}

export interface NoaiSoakWorldSimConfig {
    /** Advance the world simulation every N gameplay turns (>= 1). */
    cadenceTurns: number;
    /** World-sim steps advanced per cadence tick (bounded per chunk by the host). */
    stepsPerCadence: number;
    /** Opt in to the NPC registry tick (default false to keep runs bounded/deterministic). */
    enableNpcRegistry: boolean;
    /** Deterministic market recovery per world tick when commerce is active. */
    recoveryPerTick?: number;
    /**
     * Economy pacing profile ('easy' | 'normal' | 'harsh'). When set, the host
     * resolves it via resolveEconomyProfileParams() and passes the full knob set
     * (recovery, shock magnitudes, price ceiling) to the market tick — so soak
     * runs exercise the same profile a player would pick, not just recovery.
     * Missing → legacy 'normal' knobs (unchanged behavior).
     */
    economyProfile?: string;
    /** Per-resource-category (commodity role) tier overrides for soak. */
    economyResourceProfiles?: Record<string, string>;
    /** Per-commodity-id tier overrides for soak (custom resources). */
    economyCommodityProfiles?: Record<string, string>;
}

export interface NoaiSoakLimits {
    timeoutMs?: number;
    /** Hard ceiling on horizon turns to avoid runaway scenarios. */
    maxTurns: number;
    /** Max world-sim steps per single bulk chunk (host clamps to production absolute cap). */
    maxStepsPerChunk: number;
    /** Max trade ops proposed per gameplay turn. */
    maxOpsPerTurn: number;
    maxFileBytes: number;
    maxRecentChanges: number;
    /** Generous wall-clock budget for benchmark termination proof. */
    performanceBudgetMs?: number;
}

export interface NoaiSoakTelemetryConfig {
    /** Capture a bounded periodic sample every N gameplay turns. */
    sampleEveryTurns: number;
    /** Hard cap on stored periodic samples. */
    maxSamples: number;
    /** Ring-buffer size for the recent-turn window kept for first-failure diagnosis. */
    recentWindow: number;
    /** Hard cap on stored anomaly windows. */
    maxAnomalyWindows: number;
}

export interface NoaiSoakDeterminismConfig {
    enabled: boolean;
    /** 1 = single run, 2 = run twice and compare canonical snapshots + action/event stream. */
    compareRuns: number;
    failOnDrift: boolean;
    /** Capture a determinism snapshot every N gameplay turns (in addition to start/finish). */
    snapshotEveryTurns?: number;
}

export interface NoaiSoakScenarioDefinition {
    id: string;
    version: number;
    description: string;
    mode: NoaiSoakRunMode;
    modes?: NoaiSoakRunMode[];
    seed: string;
    workspace: NoaiSoakWorkspaceSource;
    policyId: NoaiSoakPolicyId;
    horizon: NoaiSoakHorizon;
    worldSim: NoaiSoakWorldSimConfig;
    limits: NoaiSoakLimits;
    invariants: NoaiSoakInvariantId[];
    telemetry: NoaiSoakTelemetryConfig;
    determinism?: NoaiSoakDeterminismConfig;
}

export type ParseNoaiSoakScenarioResult =
    | { ok: true; scenario: NoaiSoakScenarioDefinition }
    | { ok: false; errors: string[] };

function isNonEmptyString(value: unknown): value is string {
    return typeof value === 'string' && value.trim().length > 0;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
    return !!value && typeof value === 'object' && !Array.isArray(value);
}

function isRunMode(value: unknown): value is NoaiSoakRunMode {
    return typeof value === 'string' && (NOAI_SOAK_RUN_MODES as readonly string[]).includes(value);
}

function isPolicyId(value: unknown): value is NoaiSoakPolicyId {
    return typeof value === 'string' && (NOAI_SOAK_POLICIES as readonly string[]).includes(value);
}

/** Reject unsafe fixture paths syntactically (absolute or parent traversal). */
export function isUnsafeFixturePath(fixturePath: string): boolean {
    const normalized = fixturePath.replace(/\\/g, '/');
    return normalized.startsWith('/')
        || /^[a-zA-Z]:/.test(normalized)
        || normalized.split('/').includes('..');
}

/** Recursively scan a raw document for forbidden command/code keys. */
export function scanForbiddenScenarioKeys(raw: unknown, pathPrefix = ''): string[] {
    const hits: string[] = [];
    const forbidden = new Set<string>(NOAI_SOAK_FORBIDDEN_KEYS as readonly string[]);
    const walk = (value: unknown, prefix: string): void => {
        if (Array.isArray(value)) {
            value.forEach((item, i) => walk(item, `${prefix}[${i}]`));
            return;
        }
        if (!isPlainObject(value)) {
            return;
        }
        for (const key of Object.keys(value)) {
            if (forbidden.has(key.toLowerCase())) {
                hits.push(`${prefix}${prefix ? '.' : ''}${key}`);
            }
            walk(value[key], `${prefix}${prefix ? '.' : ''}${key}`);
        }
    };
    walk(raw, pathPrefix);
    return hits;
}

function parseWorkspace(raw: unknown, errors: string[]): NoaiSoakWorkspaceSource | undefined {
    if (!isPlainObject(raw)) {
        errors.push('workspace must be an object');
        return undefined;
    }
    const source = raw.source;
    if (source === 'empty') {
        return { source: 'empty' };
    }
    if (source === 'sample') {
        if (!isNonEmptyString(raw.sampleId)) {
            errors.push('workspace.sampleId is required for source:sample');
            return undefined;
        }
        return { source: 'sample', sampleId: raw.sampleId.trim() };
    }
    if (source === 'fixture') {
        if (!isNonEmptyString(raw.fixturePath)) {
            errors.push('workspace.fixturePath is required for source:fixture');
            return undefined;
        }
        if (isUnsafeFixturePath(raw.fixturePath.trim())) {
            errors.push('workspace.fixturePath is unsafe (absolute or parent traversal)');
            return undefined;
        }
        return { source: 'fixture', fixturePath: raw.fixturePath.trim() };
    }
    errors.push('workspace.source must be empty, sample, or fixture');
    return undefined;
}

function requirePositiveInt(
    doc: Record<string, unknown>,
    field: string,
    errors: string[],
    fallback?: number
): number | undefined {
    const value = doc[field];
    if (value === undefined && fallback !== undefined) {
        return fallback;
    }
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 1) {
        errors.push(`${field} must be a positive number`);
        return undefined;
    }
    return Math.floor(value);
}

/**
 * Parse and validate a NOAI soak scenario document. Data-only: rejects unknown
 * command/code keys, unsafe paths, and any non-allowlisted policy or invariant.
 */
export function parseNoaiSoakScenarioDocument(raw: unknown): ParseNoaiSoakScenarioResult {
    const errors: string[] = [];
    if (!isPlainObject(raw)) {
        return { ok: false, errors: ['scenario root must be an object'] };
    }

    const forbidden = scanForbiddenScenarioKeys(raw);
    if (forbidden.length > 0) {
        errors.push(`forbidden command/code keys are not allowed: ${forbidden.join(', ')}`);
    }

    if (!isNonEmptyString(raw.id)) {
        errors.push('id is required');
    }
    if (raw.version !== NOAI_SOAK_SCENARIO_VERSION) {
        errors.push(`version must be ${NOAI_SOAK_SCENARIO_VERSION}`);
    }
    if (!isNonEmptyString(raw.description)) {
        errors.push('description is required');
    }
    if (!isRunMode(raw.mode)) {
        errors.push('mode must be quick, full, or benchmark');
    }
    if (!isNonEmptyString(raw.seed)) {
        errors.push('seed is required');
    }
    if (!isPolicyId(raw.policyId)) {
        errors.push(`policyId must be one of ${NOAI_SOAK_POLICIES.join(', ')}`);
    }

    const workspace = parseWorkspace(raw.workspace, errors);

    // horizon
    let horizon: NoaiSoakHorizon | undefined;
    if (!isPlainObject(raw.horizon)) {
        errors.push('horizon must be an object');
    } else {
        const turns = requirePositiveInt(raw.horizon, 'turns', errors);
        if (turns !== undefined) {
            horizon = { turns };
        }
    }

    // limits (required so runs are always bounded)
    let limits: NoaiSoakLimits | undefined;
    if (!isPlainObject(raw.limits)) {
        errors.push('limits must be an object');
    } else {
        const lim = raw.limits;
        const maxTurns = requirePositiveInt(lim, 'maxTurns', errors);
        const maxStepsPerChunk = requirePositiveInt(lim, 'maxStepsPerChunk', errors);
        const maxOpsPerTurn = requirePositiveInt(lim, 'maxOpsPerTurn', errors);
        const maxFileBytes = requirePositiveInt(lim, 'maxFileBytes', errors);
        const maxRecentChanges = requirePositiveInt(lim, 'maxRecentChanges', errors, MAX_RECENT_CHANGES);
        if (
            maxTurns !== undefined && maxStepsPerChunk !== undefined && maxOpsPerTurn !== undefined
            && maxFileBytes !== undefined && maxRecentChanges !== undefined
        ) {
            limits = {
                maxTurns,
                maxStepsPerChunk,
                maxOpsPerTurn,
                maxFileBytes,
                maxRecentChanges,
            };
            if (lim.timeoutMs !== undefined) {
                if (typeof lim.timeoutMs !== 'number' || lim.timeoutMs < 1) {
                    errors.push('limits.timeoutMs must be a positive number');
                } else {
                    limits.timeoutMs = Math.floor(lim.timeoutMs);
                }
            }
            if (lim.performanceBudgetMs !== undefined) {
                if (typeof lim.performanceBudgetMs !== 'number' || lim.performanceBudgetMs < 1) {
                    errors.push('limits.performanceBudgetMs must be a positive number');
                } else {
                    limits.performanceBudgetMs = Math.floor(lim.performanceBudgetMs);
                }
            }
        }
    }

    if (horizon && limits && horizon.turns > limits.maxTurns) {
        errors.push(`horizon.turns ${horizon.turns} exceeds limits.maxTurns ${limits.maxTurns}`);
    }

    // worldSim
    let worldSim: NoaiSoakWorldSimConfig | undefined;
    if (!isPlainObject(raw.worldSim)) {
        errors.push('worldSim must be an object');
    } else {
        const cadenceTurns = requirePositiveInt(raw.worldSim, 'cadenceTurns', errors);
        const stepsPerCadence = requirePositiveInt(raw.worldSim, 'stepsPerCadence', errors);
        const enableNpcRegistry = raw.worldSim.enableNpcRegistry === true;
        if (cadenceTurns !== undefined && stepsPerCadence !== undefined) {
            worldSim = { cadenceTurns, stepsPerCadence, enableNpcRegistry };
            if (raw.worldSim.recoveryPerTick !== undefined) {
                if (typeof raw.worldSim.recoveryPerTick !== 'number' || raw.worldSim.recoveryPerTick < 0) {
                    errors.push('worldSim.recoveryPerTick must be a non-negative number');
                } else {
                    worldSim.recoveryPerTick = raw.worldSim.recoveryPerTick;
                }
            }
            if (raw.worldSim.economyProfile !== undefined) {
                const validTiers = ['abundant', 'plentiful', 'normal', 'scarce', 'barren', 'easy', 'harsh'];
                if (typeof raw.worldSim.economyProfile !== 'string'
                    || !validTiers.includes(raw.worldSim.economyProfile)) {
                    errors.push(
                        "worldSim.economyProfile must be one of: abundant, plentiful, normal, scarce, barren (legacy easy/harsh accepted)"
                    );
                } else {
                    worldSim.economyProfile = raw.worldSim.economyProfile;
                }
            }
            if (raw.worldSim.economyResourceProfiles !== undefined) {
                if (typeof raw.worldSim.economyResourceProfiles !== 'object'
                    || raw.worldSim.economyResourceProfiles === null
                    || Array.isArray(raw.worldSim.economyResourceProfiles)) {
                    errors.push('worldSim.economyResourceProfiles must be an object map');
                } else {
                    worldSim.economyResourceProfiles = raw.worldSim.economyResourceProfiles as Record<string, string>;
                }
            }
            if (raw.worldSim.economyCommodityProfiles !== undefined) {
                if (typeof raw.worldSim.economyCommodityProfiles !== 'object'
                    || raw.worldSim.economyCommodityProfiles === null
                    || Array.isArray(raw.worldSim.economyCommodityProfiles)) {
                    errors.push('worldSim.economyCommodityProfiles must be an object map');
                } else {
                    worldSim.economyCommodityProfiles = raw.worldSim.economyCommodityProfiles as Record<string, string>;
                }
            }
            if (limits && worldSim.stepsPerCadence > limits.maxStepsPerChunk) {
                errors.push(
                    `worldSim.stepsPerCadence ${worldSim.stepsPerCadence} exceeds limits.maxStepsPerChunk ${limits.maxStepsPerChunk}`
                );
            }
        }
    }

    // invariants (allowlist)
    let invariants: NoaiSoakInvariantId[] | undefined;
    if (!Array.isArray(raw.invariants) || raw.invariants.length === 0) {
        errors.push('invariants must be a non-empty array');
    } else {
        const allowed = new Set<string>(NOAI_SOAK_INVARIANTS as readonly string[]);
        const collected: NoaiSoakInvariantId[] = [];
        for (let i = 0; i < raw.invariants.length; i++) {
            const inv = raw.invariants[i];
            if (typeof inv !== 'string' || !allowed.has(inv)) {
                errors.push(`invariants[${i}] is not an allowlisted invariant id`);
            } else if (!collected.includes(inv as NoaiSoakInvariantId)) {
                collected.push(inv as NoaiSoakInvariantId);
            }
        }
        invariants = collected;
    }

    // telemetry
    let telemetry: NoaiSoakTelemetryConfig | undefined;
    if (!isPlainObject(raw.telemetry)) {
        errors.push('telemetry must be an object');
    } else {
        const sampleEveryTurns = requirePositiveInt(raw.telemetry, 'sampleEveryTurns', errors);
        const maxSamples = requirePositiveInt(raw.telemetry, 'maxSamples', errors);
        const recentWindow = requirePositiveInt(raw.telemetry, 'recentWindow', errors);
        const maxAnomalyWindows = requirePositiveInt(raw.telemetry, 'maxAnomalyWindows', errors);
        if (
            sampleEveryTurns !== undefined && maxSamples !== undefined
            && recentWindow !== undefined && maxAnomalyWindows !== undefined
        ) {
            telemetry = { sampleEveryTurns, maxSamples, recentWindow, maxAnomalyWindows };
        }
    }

    // determinism (optional)
    let determinism: NoaiSoakDeterminismConfig | undefined;
    if (raw.determinism !== undefined) {
        if (!isPlainObject(raw.determinism)) {
            errors.push('determinism must be an object when provided');
        } else {
            const det = raw.determinism;
            const enabled = det.enabled === true;
            let compareRuns = 1;
            if (det.compareRuns !== undefined) {
                if (det.compareRuns !== 1 && det.compareRuns !== 2) {
                    errors.push('determinism.compareRuns must be 1 or 2');
                } else {
                    compareRuns = det.compareRuns;
                }
            }
            let failOnDrift = compareRuns >= 2;
            if (det.failOnDrift !== undefined) {
                if (typeof det.failOnDrift !== 'boolean') {
                    errors.push('determinism.failOnDrift must be a boolean');
                } else {
                    failOnDrift = det.failOnDrift;
                }
            }
            if (enabled) {
                determinism = { enabled, compareRuns, failOnDrift };
                if (det.snapshotEveryTurns !== undefined) {
                    if (typeof det.snapshotEveryTurns !== 'number' || det.snapshotEveryTurns < 1) {
                        errors.push('determinism.snapshotEveryTurns must be a positive number');
                    } else {
                        determinism.snapshotEveryTurns = Math.floor(det.snapshotEveryTurns);
                    }
                }
            }
        }
    }

    let modes: NoaiSoakRunMode[] | undefined;
    if (raw.modes !== undefined) {
        if (!Array.isArray(raw.modes)) {
            errors.push('modes must be an array when provided');
        } else {
            modes = [];
            for (let i = 0; i < raw.modes.length; i++) {
                if (!isRunMode(raw.modes[i])) {
                    errors.push(`modes[${i}] is not a supported run mode`);
                } else {
                    modes.push(raw.modes[i] as NoaiSoakRunMode);
                }
            }
        }
    }

    if (
        errors.length > 0 || !isNonEmptyString(raw.id) || !isNonEmptyString(raw.description)
        || !isRunMode(raw.mode) || !isNonEmptyString(raw.seed) || !isPolicyId(raw.policyId)
        || !workspace || !horizon || !limits || !worldSim || !invariants || !telemetry
    ) {
        return { ok: false, errors };
    }

    return {
        ok: true,
        scenario: {
            id: raw.id.trim(),
            version: NOAI_SOAK_SCENARIO_VERSION,
            description: raw.description.trim(),
            mode: raw.mode,
            modes,
            seed: raw.seed.trim(),
            workspace,
            policyId: raw.policyId,
            horizon,
            worldSim,
            limits,
            invariants,
            telemetry,
            determinism,
        },
    };
}

/** Return the run modes a scenario participates in. */
export function resolveNoaiSoakRunModes(scenario: NoaiSoakScenarioDefinition): NoaiSoakRunMode[] {
    if (scenario.modes && scenario.modes.length > 0) {
        return [...new Set(scenario.modes)];
    }
    return [scenario.mode];
}

/** Filter scenarios for a requested CLI run mode (benchmark is opt-in only). */
export function filterNoaiSoakScenariosByRunMode(
    scenarios: NoaiSoakScenarioDefinition[],
    requestedMode: NoaiSoakRunMode
): NoaiSoakScenarioDefinition[] {
    return scenarios.filter((scenario) => {
        const modes = resolveNoaiSoakRunModes(scenario);
        if (requestedMode === 'quick') {
            return modes.includes('quick');
        }
        if (requestedMode === 'full') {
            return modes.includes('quick') || modes.includes('full');
        }
        return modes.includes('benchmark');
    });
}

// ---------------------------------------------------------------------------
// Seeded deterministic PRNG (mulberry32 over an fnv1a-hashed seed)
// ---------------------------------------------------------------------------

export interface SoakRng {
    /** Next uint32. */
    nextU32(): number;
    /** Next float in [0, 1). */
    nextFloat(): number;
    /** Integer in [0, maxExclusive). */
    nextInt(maxExclusive: number): number;
}

function fnv1a32(input: string): number {
    let h = 0x811c9dc5;
    for (let i = 0; i < input.length; i++) {
        h ^= input.charCodeAt(i);
        h = Math.imul(h, 0x01000193);
    }
    return h >>> 0;
}

export function createSoakRng(seed: string): SoakRng {
    let state = fnv1a32(seed) >>> 0;
    const nextU32 = (): number => {
        state = (state + 0x6d2b79f5) >>> 0;
        let t = state;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return (t ^ (t >>> 14)) >>> 0;
    };
    return {
        nextU32,
        nextFloat: () => nextU32() / 4294967296,
        nextInt: (maxExclusive: number) => {
            if (!Number.isFinite(maxExclusive) || maxExclusive <= 1) {
                return 0;
            }
            return nextU32() % Math.floor(maxExclusive);
        },
    };
}

// ---------------------------------------------------------------------------
// Deterministic player policies
// ---------------------------------------------------------------------------

export interface PolicyDecisionContext {
    forge: CommerceForge;
    markets: MarketStateMap;
    commerce: PlayerCommerceState;
    worldTurn: number;
    turnIndex: number;
    rng: SoakRng;
    maxOpsPerTurn: number;
}

/** Deterministic per-policy tuning. No values are read from scenario JSON. */
const POLICY_TUNING = {
    merchant_balanced: { buyStep: 3, sellStep: 3, sellPriceIndexFloor: 1.0, cargoFillTarget: 0.5, probeEvery: 0 },
    merchant_stress: { buyStep: 6, sellStep: 6, sellPriceIndexFloor: 0.9, cargoFillTarget: 0.6, probeEvery: 3 },
} as const;

function commodityById(forge: CommerceForge, id: string): CommodityDef | undefined {
    return forge.commodities.find((c) => c.id === id);
}

function cargoQty(cargo: CargoEntry[], commodityId: string): number {
    return cargo.find((c) => c.commodityId === commodityId)?.qty ?? 0;
}

interface TradeablePair {
    marketLocationId: string;
    commodityId: string;
}

function tradeablePairs(forge: CommerceForge): TradeablePair[] {
    const pairs: TradeablePair[] = [];
    for (const market of forge.markets) {
        for (const commodityId of market.commodityIds) {
            pairs.push({ marketLocationId: market.locationId, commodityId });
        }
    }
    // Stable order: commodityId then market so ties break deterministically.
    return pairs.sort((a, b) =>
        a.commodityId.localeCompare(b.commodityId) || a.marketLocationId.localeCompare(b.marketLocationId));
}

/** Largest qty of a commodity that still fits the transport, given current cargo. */
function maxBuyableByCapacity(forge: CommerceForge, commerce: PlayerCommerceState, commodityId: string): number {
    const cap = transportCapacity(forge, commerce.transportId);
    if (cap <= 0) {
        return 0;
    }
    const commodity = commodityById(forge, commodityId);
    if (!commodity || commodity.weight <= 0) {
        return 0;
    }
    const remaining = cap - cargoWeight(forge, commerce.cargo);
    return Math.max(0, Math.floor(remaining / commodity.weight));
}

/**
 * Choose deterministic, production-feasible trade ops for the merchant policies.
 * Sizing uses production read-helpers only; production applyTradeOp remains the
 * sole authority that mutates state and rejects infeasible ops.
 */
export function decideTradeIntents(policyId: NoaiSoakPolicyId, ctx: PolicyDecisionContext): TradeOp[] {
    if (policyId === 'observe_only') {
        return [];
    }
    const tuning = POLICY_TUNING[policyId];
    const ops: TradeOp[] = [];
    const pairs = tradeablePairs(ctx.forge);
    const cap = transportCapacity(ctx.forge, ctx.commerce.transportId);
    const fillRatio = cap > 0 ? cargoWeight(ctx.forge, ctx.commerce.cargo) / cap : 1;

    const wantBuy = fillRatio < tuning.cargoFillTarget;

    if (wantBuy) {
        // Buy the cheapest in-stock, affordable, cargo-fitting pair.
        let best: { pair: TradeablePair; unitPrice: number } | undefined;
        for (const pair of pairs) {
            const quote = quoteMarketPrice(ctx.forge, ctx.markets, pair.marketLocationId, pair.commodityId);
            if (!quote || quote.stock < 1 || quote.unitPrice < MIN_PRICE) {
                continue;
            }
            if (ctx.commerce.credits < quote.unitPrice) {
                continue;
            }
            if (maxBuyableByCapacity(ctx.forge, ctx.commerce, pair.commodityId) < 1) {
                continue;
            }
            if (!best || quote.unitPrice < best.unitPrice) {
                best = { pair, unitPrice: quote.unitPrice };
            }
        }
        if (best) {
            const quote = quoteMarketPrice(ctx.forge, ctx.markets, best.pair.marketLocationId, best.pair.commodityId)!;
            const affordable = Math.floor(ctx.commerce.credits / quote.unitPrice);
            const fits = maxBuyableByCapacity(ctx.forge, ctx.commerce, best.pair.commodityId);
            const qty = Math.max(0, Math.min(tuning.buyStep, affordable, fits, quote.stock, MAX_TRADE_QTY));
            if (qty >= 1) {
                ops.push({ op: 'buy', marketLocationId: best.pair.marketLocationId, commodityId: best.pair.commodityId, qty });
            }
        }
    } else {
        // Sell held cargo at the highest-price market that trades it.
        const heldCommodities = ctx.commerce.cargo
            .filter((c) => c.qty > 0)
            .map((c) => c.commodityId)
            .sort((a, b) => a.localeCompare(b));
        for (const commodityId of heldCommodities) {
            let bestSell: { marketLocationId: string; unitPrice: number } | undefined;
            for (const pair of pairs) {
                if (pair.commodityId !== commodityId) {
                    continue;
                }
                const quote = quoteMarketPrice(ctx.forge, ctx.markets, pair.marketLocationId, pair.commodityId);
                if (!quote || quote.priceIndex < tuning.sellPriceIndexFloor) {
                    continue;
                }
                if (!bestSell || quote.unitPrice > bestSell.unitPrice) {
                    bestSell = { marketLocationId: pair.marketLocationId, unitPrice: quote.unitPrice };
                }
            }
            if (bestSell) {
                const held = cargoQty(ctx.commerce.cargo, commodityId);
                const qty = Math.max(0, Math.min(tuning.sellStep, held, MAX_TRADE_QTY));
                if (qty >= 1) {
                    ops.push({ op: 'sell', marketLocationId: bestSell.marketLocationId, commodityId, qty });
                    break;
                }
            }
        }
    }

    // Stress policy: occasionally append one deliberately oversized probe that
    // production validation will reject (INSUFFICIENT_STOCK). It never mutates state.
    if (
        tuning.probeEvery > 0
        && pairs.length > 0
        && (ctx.turnIndex % tuning.probeEvery === 0)
        && ops.length < ctx.maxOpsPerTurn
    ) {
        const pair = pairs[ctx.rng.nextInt(pairs.length)];
        const quote = quoteMarketPrice(ctx.forge, ctx.markets, pair.marketLocationId, pair.commodityId);
        const stock = quote?.stock ?? 0;
        const probeQty = Math.min(MAX_TRADE_QTY, stock + 50);
        ops.push({ op: 'buy', marketLocationId: pair.marketLocationId, commodityId: pair.commodityId, qty: probeQty });
    }

    return ops.slice(0, ctx.maxOpsPerTurn);
}

// ---------------------------------------------------------------------------
// Player-sourced trade event identity (reuses production event log)
// ---------------------------------------------------------------------------

export interface PlayerTradeOutcome {
    accepted: boolean;
    unitPriceHint?: number;
}

export interface PlayerTradeEventResult {
    /** Deterministic receipt id — stable across retries of the same action. */
    receiptId: string;
    /** Canonical player-sourced world change event (undefined for rejected actions). */
    event?: WorldChangeEvent;
}

function tradeOpLabel(op: TradeOp): string {
    if (op.op === 'sell_discovery') {
        return `discovery ${op.discoveryId}`;
    }
    return `${op.op} ${op.qty} ${op.commodityId} @ ${op.marketLocationId}`;
}

/**
 * Build the deterministic receipt + player-sourced event for an accepted trade.
 * Distinct accepted actions (distinct actionSeq) yield distinct event ids; retrying
 * the same receipt yields the same id, so mergeRecentChanges dedups it.
 */
export function buildPlayerTradeEvent(
    worldTurn: number,
    actionSeq: number,
    op: TradeOp,
    outcome: PlayerTradeOutcome
): PlayerTradeEventResult {
    const receiptId = `rcpt_${worldTurn}_${actionSeq}`;
    if (!outcome.accepted) {
        return { receiptId };
    }
    const category: WorldChangeCategory = 'resource';
    const event = makeWorldChangeEvent({
        worldTurn,
        category,
        severity: 'info',
        source: 'player',
        idSuffix: `trade_${actionSeq}`,
        message: `Player trade: ${tradeOpLabel(op)}`,
    });
    return { receiptId, event };
}

/** Merge a batch of player events into recentChanges (production dedup + cap). */
export function mergePlayerEventsIntoRecentChanges(
    existing: WorldChangeEvent[],
    incoming: WorldChangeEvent[],
    maxCount: number = MAX_RECENT_CHANGES
): WorldChangeEvent[] {
    return mergeRecentChanges(existing, incoming, maxCount);
}

// ---------------------------------------------------------------------------
// Telemetry
// ---------------------------------------------------------------------------

export interface NoaiSoakActionRecord {
    turn: number;
    worldTurn: number;
    type: NoaiSoakActionType;
    accepted: boolean;
    rejectCode?: string;
    commodityId?: string;
    marketLocationId?: string;
    qty?: number;
    eventId?: string;
}

export interface MarketExtents {
    minStock: number;
    maxStock: number;
    minPriceIndex: number;
    maxPriceIndex: number;
}

export interface NoaiSoakSample {
    turn: number;
    worldTurn: number;
    credits: number;
    cargoUnits: number;
    marketExtents: MarketExtents;
    recentChangesLen: number;
}

export interface NoaiSoakAnomalyWindow {
    kind: string;
    turn: number;
    detail: string;
}

export interface NoaiSoakTelemetry {
    config: NoaiSoakTelemetryConfig;
    turnsCompleted: number;
    actionCounts: Record<NoaiSoakActionType, number>;
    acceptedActions: number;
    rejectedActions: number;
    rejectCounts: Record<string, number>;
    // action diversity
    private_typeSequenceCounts: Record<string, number>;
    lastActionType?: string;
    currentStreak: number;
    longestIdenticalActionStreak: number;
    // event tracking
    eventCategoryCounts: Record<string, number>;
    eventSeverityCounts: Record<string, number>;
    eventSourceCounts: Record<string, number>;
    emittedEventIds: Set<string>;
    duplicateEventIdCount: number;
    playerEventsEmitted: number;
    simEventsEmitted: number;
    // resources
    money: MinMaxFinal;
    cargoUnits: MinMaxFinal;
    marketStock: MinMaxFinal;
    marketPriceIndex: MinMaxFinal;
    // world progression
    startWorldTurn: number;
    finalWorldTurn: number;
    // streaks over cadence chunks
    longestZeroEventStreak: number;
    longestZeroChangeStreak: number;
    private_zeroEventStreak: number;
    private_zeroChangeStreak: number;
    // bounded windows
    samples: NoaiSoakSample[];
    recentWindow: NoaiSoakActionRecord[];
    anomalyWindows: NoaiSoakAnomalyWindow[];
}

export interface MinMaxFinal {
    min?: number;
    max?: number;
    final?: number;
}

function updateMinMaxFinal(acc: MinMaxFinal, value: number): void {
    if (!Number.isFinite(value)) {
        return;
    }
    acc.min = acc.min === undefined ? value : Math.min(acc.min, value);
    acc.max = acc.max === undefined ? value : Math.max(acc.max, value);
    acc.final = value;
}

export function createTelemetryAccumulator(
    config: NoaiSoakTelemetryConfig,
    startWorldTurn: number
): NoaiSoakTelemetry {
    return {
        config,
        turnsCompleted: 0,
        actionCounts: { observe: 0, buy: 0, sell: 0 },
        acceptedActions: 0,
        rejectedActions: 0,
        rejectCounts: {},
        private_typeSequenceCounts: {},
        currentStreak: 0,
        longestIdenticalActionStreak: 0,
        eventCategoryCounts: {},
        eventSeverityCounts: {},
        eventSourceCounts: {},
        emittedEventIds: new Set<string>(),
        duplicateEventIdCount: 0,
        playerEventsEmitted: 0,
        simEventsEmitted: 0,
        money: {},
        cargoUnits: {},
        marketStock: {},
        marketPriceIndex: {},
        startWorldTurn,
        finalWorldTurn: startWorldTurn,
        longestZeroEventStreak: 0,
        longestZeroChangeStreak: 0,
        private_zeroEventStreak: 0,
        private_zeroChangeStreak: 0,
        samples: [],
        recentWindow: [],
        anomalyWindows: [],
    };
}

/** Record a decided player action (accepted or rejected). Bounded ring buffer. */
export function recordAction(acc: NoaiSoakTelemetry, rec: NoaiSoakActionRecord): void {
    acc.actionCounts[rec.type] = (acc.actionCounts[rec.type] ?? 0) + 1;
    if (rec.accepted) {
        acc.acceptedActions++;
    } else {
        acc.rejectedActions++;
        if (rec.rejectCode) {
            acc.rejectCounts[rec.rejectCode] = (acc.rejectCounts[rec.rejectCode] ?? 0) + 1;
        }
    }

    // diversity: count by accepted action type label (observe / buy / sell)
    const label = rec.accepted ? rec.type : `rejected_${rec.type}`;
    acc.private_typeSequenceCounts[label] = (acc.private_typeSequenceCounts[label] ?? 0) + 1;
    if (acc.lastActionType === label) {
        acc.currentStreak++;
    } else {
        acc.currentStreak = 1;
        acc.lastActionType = label;
    }
    acc.longestIdenticalActionStreak = Math.max(acc.longestIdenticalActionStreak, acc.currentStreak);

    if (rec.accepted && rec.eventId) {
        if (acc.emittedEventIds.has(rec.eventId)) {
            acc.duplicateEventIdCount++;
        } else {
            acc.emittedEventIds.add(rec.eventId);
        }
        acc.playerEventsEmitted++;
    }

    acc.recentWindow.push(rec);
    if (acc.recentWindow.length > acc.config.recentWindow) {
        acc.recentWindow.shift();
    }
}

export function recordSimEvents(acc: NoaiSoakTelemetry, events: WorldChangeEvent[]): void {
    for (const ev of events) {
        acc.simEventsEmitted++;
        acc.eventCategoryCounts[ev.category] = (acc.eventCategoryCounts[ev.category] ?? 0) + 1;
        acc.eventSeverityCounts[ev.severity] = (acc.eventSeverityCounts[ev.severity] ?? 0) + 1;
        acc.eventSourceCounts[ev.source] = (acc.eventSourceCounts[ev.source] ?? 0) + 1;
    }
}

export function recordPlayerEventCategories(acc: NoaiSoakTelemetry, events: WorldChangeEvent[]): void {
    for (const ev of events) {
        acc.eventCategoryCounts[ev.category] = (acc.eventCategoryCounts[ev.category] ?? 0) + 1;
        acc.eventSeverityCounts[ev.severity] = (acc.eventSeverityCounts[ev.severity] ?? 0) + 1;
        acc.eventSourceCounts[ev.source] = (acc.eventSourceCounts[ev.source] ?? 0) + 1;
    }
}

export function scanMarketExtents(markets: MarketStateMap): MarketExtents {
    let minStock = Infinity;
    let maxStock = -Infinity;
    let minPriceIndex = Infinity;
    let maxPriceIndex = -Infinity;
    for (const stocks of Object.values(markets)) {
        for (const entry of Object.values(stocks)) {
            minStock = Math.min(minStock, entry.stock);
            maxStock = Math.max(maxStock, entry.stock);
            minPriceIndex = Math.min(minPriceIndex, entry.priceIndex);
            maxPriceIndex = Math.max(maxPriceIndex, entry.priceIndex);
        }
    }
    if (!Number.isFinite(minStock)) {
        return { minStock: 0, maxStock: 0, minPriceIndex: 1, maxPriceIndex: 1 };
    }
    return { minStock, maxStock, minPriceIndex, maxPriceIndex };
}

export function cargoUnitCount(cargo: CargoEntry[]): number {
    return cargo.reduce((sum, c) => sum + c.qty, 0);
}

export interface TurnStateSnapshot {
    turn: number;
    worldTurn: number;
    credits: number;
    cargoUnits: number;
    markets: MarketStateMap;
    recentChangesLen: number;
}

/** Update per-turn resource extents and (optionally) push a bounded periodic sample. */
export function observeTurnState(acc: NoaiSoakTelemetry, snap: TurnStateSnapshot, forceSample = false): void {
    acc.turnsCompleted = Math.max(acc.turnsCompleted, snap.turn);
    acc.finalWorldTurn = snap.worldTurn;
    updateMinMaxFinal(acc.money, snap.credits);
    updateMinMaxFinal(acc.cargoUnits, snap.cargoUnits);
    const extents = scanMarketExtents(snap.markets);
    updateMinMaxFinal(acc.marketStock, extents.minStock);
    updateMinMaxFinal(acc.marketStock, extents.maxStock);
    updateMinMaxFinal(acc.marketPriceIndex, extents.minPriceIndex);
    updateMinMaxFinal(acc.marketPriceIndex, extents.maxPriceIndex);

    const due = forceSample
        || (acc.config.sampleEveryTurns > 0 && snap.turn % acc.config.sampleEveryTurns === 0);
    if (due && acc.samples.length < acc.config.maxSamples) {
        acc.samples.push({
            turn: snap.turn,
            worldTurn: snap.worldTurn,
            credits: snap.credits,
            cargoUnits: snap.cargoUnits,
            marketExtents: extents,
            recentChangesLen: snap.recentChangesLen,
        });
    }
}

/** Record a cadence chunk's activity to maintain zero-event / zero-change streaks. */
export function recordCadenceChunk(acc: NoaiSoakTelemetry, eventsEmitted: number, canonicalChanged: boolean): void {
    if (eventsEmitted === 0) {
        acc.private_zeroEventStreak++;
        acc.longestZeroEventStreak = Math.max(acc.longestZeroEventStreak, acc.private_zeroEventStreak);
    } else {
        acc.private_zeroEventStreak = 0;
    }
    if (!canonicalChanged) {
        acc.private_zeroChangeStreak++;
        acc.longestZeroChangeStreak = Math.max(acc.longestZeroChangeStreak, acc.private_zeroChangeStreak);
    } else {
        acc.private_zeroChangeStreak = 0;
    }
}

export function pushAnomalyWindow(acc: NoaiSoakTelemetry, window: NoaiSoakAnomalyWindow): void {
    if (acc.anomalyWindows.length < acc.config.maxAnomalyWindows) {
        acc.anomalyWindows.push(window);
    }
}

/** Shannon entropy (bits) over the accepted/rejected action-type distribution. */
export function computeActionEntropy(counts: Record<string, number>): number {
    const values = Object.values(counts).filter((n) => n > 0);
    const total = values.reduce((s, n) => s + n, 0);
    if (total <= 0 || values.length <= 1) {
        return 0;
    }
    let entropy = 0;
    for (const n of values) {
        const p = n / total;
        entropy -= p * Math.log2(p);
    }
    return entropy;
}

export interface NoaiSoakTelemetrySummary {
    turnsCompleted: number;
    actionCounts: Record<NoaiSoakActionType, number>;
    acceptedActions: number;
    rejectedActions: number;
    rejectCounts: Record<string, number>;
    actionEntropyBits: number;
    longestIdenticalActionStreak: number;
    eventCategoryCounts: Record<string, number>;
    eventSeverityCounts: Record<string, number>;
    eventSourceCounts: Record<string, number>;
    playerEventsEmitted: number;
    simEventsEmitted: number;
    duplicateEventIdCount: number;
    distinctEventIds: number;
    money: MinMaxFinal;
    cargoUnits: MinMaxFinal;
    marketStock: MinMaxFinal;
    marketPriceIndex: MinMaxFinal;
    startWorldTurn: number;
    finalWorldTurn: number;
    worldTurnDelta: number;
    longestZeroEventStreak: number;
    longestZeroChangeStreak: number;
    samples: NoaiSoakSample[];
    recentWindow: NoaiSoakActionRecord[];
    anomalyWindows: NoaiSoakAnomalyWindow[];
}

export function finalizeTelemetry(acc: NoaiSoakTelemetry): NoaiSoakTelemetrySummary {
    return {
        turnsCompleted: acc.turnsCompleted,
        actionCounts: acc.actionCounts,
        acceptedActions: acc.acceptedActions,
        rejectedActions: acc.rejectedActions,
        rejectCounts: acc.rejectCounts,
        actionEntropyBits: computeActionEntropy(acc.private_typeSequenceCounts),
        longestIdenticalActionStreak: acc.longestIdenticalActionStreak,
        eventCategoryCounts: acc.eventCategoryCounts,
        eventSeverityCounts: acc.eventSeverityCounts,
        eventSourceCounts: acc.eventSourceCounts,
        playerEventsEmitted: acc.playerEventsEmitted,
        simEventsEmitted: acc.simEventsEmitted,
        duplicateEventIdCount: acc.duplicateEventIdCount,
        distinctEventIds: acc.emittedEventIds.size,
        money: acc.money,
        cargoUnits: acc.cargoUnits,
        marketStock: acc.marketStock,
        marketPriceIndex: acc.marketPriceIndex,
        startWorldTurn: acc.startWorldTurn,
        finalWorldTurn: acc.finalWorldTurn,
        worldTurnDelta: acc.finalWorldTurn - acc.startWorldTurn,
        longestZeroEventStreak: acc.longestZeroEventStreak,
        longestZeroChangeStreak: acc.longestZeroChangeStreak,
        samples: acc.samples,
        recentWindow: acc.recentWindow,
        anomalyWindows: acc.anomalyWindows,
    };
}

// ---------------------------------------------------------------------------
// Machine invariants (pure detectors)
// ---------------------------------------------------------------------------

/** Find dotted paths to any non-finite number (NaN / Infinity) in a value. */
export function findNonFiniteNumbers(value: unknown, prefix = '$', out: string[] = []): string[] {
    if (typeof value === 'number') {
        if (!Number.isFinite(value)) {
            out.push(prefix);
        }
        return out;
    }
    if (Array.isArray(value)) {
        value.forEach((item, i) => findNonFiniteNumbers(item, `${prefix}[${i}]`, out));
        return out;
    }
    if (value && typeof value === 'object') {
        for (const [k, v] of Object.entries(value)) {
            findNonFiniteNumbers(v, `${prefix}.${k}`, out);
        }
    }
    return out;
}

export interface NegativeResourceHit {
    path: string;
    value: number;
}

/**
 * Find negative values among defined non-negative resource fields. The field
 * allowlist keeps intentionally-signed values (deltas, biases) out of scope.
 */
export const NONNEGATIVE_RESOURCE_FIELDS = new Set([
    'credits', 'stock', 'qty', 'food', 'power', 'morale', 'targetStock', 'capacity',
]);

export function findNegativeResources(value: unknown, prefix = '$', out: NegativeResourceHit[] = []): NegativeResourceHit[] {
    if (Array.isArray(value)) {
        value.forEach((item, i) => findNegativeResources(item, `${prefix}[${i}]`, out));
        return out;
    }
    if (value && typeof value === 'object') {
        for (const [k, v] of Object.entries(value)) {
            if (typeof v === 'number' && NONNEGATIVE_RESOURCE_FIELDS.has(k) && v < 0) {
                out.push({ path: `${prefix}.${k}`, value: v });
            }
            findNegativeResources(v, `${prefix}.${k}`, out);
        }
    }
    return out;
}

export interface MarketRangeHit {
    marketLocationId: string;
    commodityId: string;
    field: 'stock' | 'priceIndex';
    value: number;
}

/** Verify market stocks are non-negative and price indices stay in production range. */
export function findMarketRangeViolations(markets: MarketStateMap): MarketRangeHit[] {
    const hits: MarketRangeHit[] = [];
    for (const [marketLocationId, stocks] of Object.entries(markets)) {
        for (const [commodityId, entry] of Object.entries(stocks)) {
            if (!Number.isFinite(entry.stock) || entry.stock < 0) {
                hits.push({ marketLocationId, commodityId, field: 'stock', value: entry.stock });
            }
            if (
                !Number.isFinite(entry.priceIndex)
                || entry.priceIndex < MIN_PRICE_INDEX - 1e-9
                || entry.priceIndex > MAX_PROFILE_PRICE_INDEX + 1e-9
            ) {
                hits.push({ marketLocationId, commodityId, field: 'priceIndex', value: entry.priceIndex });
            }
        }
    }
    return hits;
}

export interface InvariantContext {
    /** Parsed canonical documents by filename (undefined if absent/unparseable). */
    canonicalDocs: Record<string, unknown>;
    /** Filenames that failed JSON.parse this check. */
    parseErrors: string[];
    markets: MarketStateMap;
    recentChangesLen: number;
    worldTurn: number;
    previousWorldTurn: number;
    expectedWorldTurnDelta: number;
    telemetry: NoaiSoakTelemetry;
    limits: NoaiSoakLimits;
    fileBytes: Record<string, number>;
}

export interface InvariantResult {
    id: NoaiSoakInvariantId;
    ok: boolean;
    detail?: string;
    /** Exact turn / id links where available. */
    refs?: string[];
}

function evaluateSingleInvariant(id: NoaiSoakInvariantId, ctx: InvariantContext): InvariantResult {
    switch (id) {
        case 'no_nan_or_infinity': {
            const hits: string[] = [];
            for (const [name, doc] of Object.entries(ctx.canonicalDocs)) {
                for (const p of findNonFiniteNumbers(doc, `${name}`)) {
                    hits.push(p);
                    if (hits.length >= 8) {
                        break;
                    }
                }
            }
            return { id, ok: hits.length === 0, detail: hits.length ? `${hits.length} non-finite number(s)` : undefined, refs: hits };
        }
        case 'json_parseable': {
            return {
                id,
                ok: ctx.parseErrors.length === 0,
                detail: ctx.parseErrors.length ? ctx.parseErrors.join(', ') : undefined,
                refs: ctx.parseErrors,
            };
        }
        case 'world_turn_monotonic': {
            const delta = ctx.worldTurn - ctx.previousWorldTurn;
            const ok = ctx.worldTurn >= ctx.previousWorldTurn && delta === ctx.expectedWorldTurnDelta;
            return {
                id,
                ok,
                detail: ok ? undefined : `worldTurn ${ctx.previousWorldTurn}->${ctx.worldTurn} delta=${delta} expected=${ctx.expectedWorldTurnDelta}`,
            };
        }
        case 'nonnegative_resources': {
            const hits: NegativeResourceHit[] = [];
            for (const [name, doc] of Object.entries(ctx.canonicalDocs)) {
                findNegativeResources(doc, name, hits);
                if (hits.length >= 8) {
                    break;
                }
            }
            return {
                id,
                ok: hits.length === 0,
                detail: hits.length ? `${hits.length} negative resource(s)` : undefined,
                refs: hits.slice(0, 8).map((h) => `${h.path}=${h.value}`),
            };
        }
        case 'market_ranges_valid': {
            const hits = findMarketRangeViolations(ctx.markets);
            return {
                id,
                ok: hits.length === 0,
                detail: hits.length ? `${hits.length} market range violation(s)` : undefined,
                refs: hits.slice(0, 8).map((h) => `${h.marketLocationId}/${h.commodityId}.${h.field}=${h.value}`),
            };
        }
        case 'caps_bounded': {
            const ok = ctx.recentChangesLen <= ctx.limits.maxRecentChanges;
            return {
                id,
                ok,
                detail: ok ? undefined : `recentChanges length ${ctx.recentChangesLen} > cap ${ctx.limits.maxRecentChanges}`,
            };
        }
        case 'no_duplicate_event_ids': {
            const dupes = ctx.telemetry.duplicateEventIdCount;
            return { id, ok: dupes === 0, detail: dupes ? `${dupes} duplicate accepted event id(s)` : undefined };
        }
        case 'no_duplicate_one_shot_events': {
            // recentChanges are deduped by id on merge; verify no id appears twice.
            const recent = extractRecentChangeIds(ctx.canonicalDocs['world_state.json']);
            const seen = new Set<string>();
            const dupes: string[] = [];
            for (const rid of recent) {
                if (seen.has(rid)) {
                    dupes.push(rid);
                } else {
                    seen.add(rid);
                }
            }
            return { id, ok: dupes.length === 0, detail: dupes.length ? `${dupes.length} duplicate recentChange id(s)` : undefined, refs: dupes };
        }
        case 'output_files_bounded': {
            const over: string[] = [];
            for (const [name, bytes] of Object.entries(ctx.fileBytes)) {
                if (bytes > ctx.limits.maxFileBytes) {
                    over.push(`${name}=${bytes}`);
                }
            }
            return { id, ok: over.length === 0, detail: over.length ? `${over.length} file(s) over limit` : undefined, refs: over };
        }
        default:
            return { id, ok: false, detail: `unknown invariant ${id}` };
    }
}

function extractRecentChangeIds(worldStateDoc: unknown): string[] {
    if (!worldStateDoc || typeof worldStateDoc !== 'object') {
        return [];
    }
    const rc = (worldStateDoc as Record<string, unknown>).recentChanges;
    if (!Array.isArray(rc)) {
        return [];
    }
    const ids: string[] = [];
    for (const item of rc) {
        if (item && typeof item === 'object' && typeof (item as Record<string, unknown>).id === 'string') {
            ids.push((item as Record<string, unknown>).id as string);
        }
    }
    return ids;
}

/** Evaluate the allowlisted invariants; returns per-invariant results. */
export function evaluateInvariants(ids: NoaiSoakInvariantId[], ctx: InvariantContext): InvariantResult[] {
    return ids.map((id) => evaluateSingleInvariant(id, ctx));
}

// ---------------------------------------------------------------------------
// Action / event stream hashing for determinism comparison
// ---------------------------------------------------------------------------

/** Canonical, order-preserving hash input for the accepted action + event stream. */
export function serializeActionStream(records: NoaiSoakActionRecord[]): string {
    const canonical = records.map((r) => ({
        turn: r.turn,
        worldTurn: r.worldTurn,
        type: r.type,
        accepted: r.accepted,
        rejectCode: r.rejectCode,
        commodityId: r.commodityId,
        marketLocationId: r.marketLocationId,
        qty: r.qty,
        eventId: r.eventId,
    }));
    return stableSerialize(canonical);
}

// ---------------------------------------------------------------------------
// Run id / directory planning
// ---------------------------------------------------------------------------

export interface NoaiSoakRunDirectoryPlan {
    tempRoot: string;
    scenarioDir: string;
    runDir: string;
    workspaceDir: string;
    reportJsonPath: string;
    reportMdPath: string;
    runId: string;
}

export function formatNoaiSoakRunId(now: Date, suffix: string): string {
    const pad = (n: number) => String(n).padStart(2, '0');
    const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`;
    const time = `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
    return `soak_${stamp}_${time}_${suffix}`;
}

export function planNoaiSoakRunDirectories(
    repoRoot: string,
    scenarioId: string,
    runId: string,
    tempRoot = DEFAULT_NOAI_SOAK_TEMP_ROOT,
    join: (...parts: string[]) => string = defaultJoin,
    resolve: (...parts: string[]) => string = defaultJoin
): NoaiSoakRunDirectoryPlan {
    const tempRootAbs = resolve(repoRoot, tempRoot);
    const scenarioDir = join(tempRootAbs, scenarioId);
    const runDir = join(scenarioDir, runId);
    return {
        tempRoot: tempRootAbs,
        scenarioDir,
        runDir,
        workspaceDir: join(runDir, 'workspace'),
        reportJsonPath: join(runDir, 'report.json'),
        reportMdPath: join(runDir, 'report.md'),
        runId,
    };
}

/** Minimal POSIX-ish join fallback (host passes node's path.join/resolve). */
function defaultJoin(...parts: string[]): string {
    return parts.join('/').replace(/\/+/g, '/');
}

// ---------------------------------------------------------------------------
// Report model + markdown
// ---------------------------------------------------------------------------

export interface NoaiSoakDeterminismReport {
    enabled: boolean;
    compareRuns: number;
    baselineRunId?: string;
    canonicalMatch?: boolean;
    actionStreamMatch?: boolean;
    firstDifference?: {
        kind: 'canonical' | 'action_stream';
        detail: string;
    };
    snapshotCount?: number;
}

export type NoaiSoakFailureClass =
    | 'scenario_invalid'
    | 'setup_failed'
    | 'invariant_failed'
    | 'crash_or_stall'
    | 'timeout'
    | 'determinism_drift'
    | 'performance_budget_exceeded'
    | 'internal_error';

export interface NoaiSoakReport {
    schemaVersion: typeof NOAI_SOAK_REPORT_SCHEMA_VERSION;
    runId: string;
    scenarioId: string;
    seed: string;
    policyId: NoaiSoakPolicyId;
    mode: NoaiSoakRunMode;
    startedAt: string;
    finishedAt: string;
    ok: boolean;
    failureClass?: NoaiSoakFailureClass;
    turnsRequested: number;
    turnsCompleted: number;
    initialCanonicalHash?: string;
    finalCanonicalHash?: string;
    runtimeMs: number;
    turnsPerSecond: number;
    telemetry?: NoaiSoakTelemetrySummary;
    invariantResults: InvariantResult[];
    failedInvariants: string[];
    firstFailure?: {
        turn: number;
        invariantId?: string;
        detail: string;
    };
    determinism?: NoaiSoakDeterminismReport;
    fileBytes: Record<string, number>;
    warnings: string[];
}

export function createEmptyNoaiSoakReport(
    runId: string,
    scenario: NoaiSoakScenarioDefinition,
    mode: NoaiSoakRunMode,
    startedAt: string
): NoaiSoakReport {
    return {
        schemaVersion: NOAI_SOAK_REPORT_SCHEMA_VERSION,
        runId,
        scenarioId: scenario.id,
        seed: scenario.seed,
        policyId: scenario.policyId,
        mode,
        startedAt,
        finishedAt: startedAt,
        ok: false,
        turnsRequested: scenario.horizon.turns,
        turnsCompleted: 0,
        runtimeMs: 0,
        turnsPerSecond: 0,
        invariantResults: [],
        failedInvariants: [],
        fileBytes: {},
        warnings: [],
    };
}

function fmtMinMax(m: MinMaxFinal): string {
    const part = (v: number | undefined) => (v === undefined ? '—' : String(v));
    return `min=${part(m.min)} max=${part(m.max)} final=${part(m.final)}`;
}

export function formatNoaiSoakReportMarkdown(report: NoaiSoakReport): string {
    const lines: string[] = [];
    lines.push(`# NOAI Soak Report — ${report.scenarioId}`);
    lines.push('');
    lines.push(`- Run ID: \`${report.runId}\``);
    lines.push(`- Seed: \`${report.seed}\``);
    lines.push(`- Policy: \`${report.policyId}\``);
    lines.push(`- Mode: \`${report.mode}\``);
    lines.push(`- Result: **${report.ok ? 'PASS' : 'FAIL'}**`);
    if (report.failureClass) {
        lines.push(`- Failure class: \`${report.failureClass}\``);
    }
    lines.push(`- Turns: ${report.turnsCompleted}/${report.turnsRequested}`);
    lines.push(`- Runtime: ${report.runtimeMs} ms (${report.turnsPerSecond.toFixed(1)} turns/s)`);
    if (report.initialCanonicalHash) {
        lines.push(`- Initial canonical hash: \`${report.initialCanonicalHash}\``);
    }
    if (report.finalCanonicalHash) {
        lines.push(`- Final canonical hash: \`${report.finalCanonicalHash}\``);
    }
    lines.push('');

    if (report.firstFailure) {
        lines.push('## First failure');
        lines.push('');
        lines.push(`- Turn: ${report.firstFailure.turn}`);
        if (report.firstFailure.invariantId) {
            lines.push(`- Invariant: \`${report.firstFailure.invariantId}\``);
        }
        lines.push(`- Detail: ${report.firstFailure.detail}`);
        lines.push('');
    }

    lines.push('## Invariants');
    lines.push('');
    for (const inv of report.invariantResults) {
        const mark = inv.ok ? 'ok' : 'FAIL';
        const detail = inv.detail ? ` — ${inv.detail}` : '';
        lines.push(`- \`${inv.id}\`: ${mark}${detail}`);
        if (!inv.ok && inv.refs && inv.refs.length > 0) {
            lines.push(`  - refs: ${inv.refs.slice(0, 8).join(', ')}`);
        }
    }
    lines.push('');

    const t = report.telemetry;
    if (t) {
        lines.push('## Telemetry');
        lines.push('');
        lines.push(`- Actions: observe=${t.actionCounts.observe} buy=${t.actionCounts.buy} sell=${t.actionCounts.sell}`);
        lines.push(`- Accepted/Rejected: ${t.acceptedActions}/${t.rejectedActions}`);
        if (Object.keys(t.rejectCounts).length > 0) {
            lines.push(`- Reject reasons: ${Object.entries(t.rejectCounts).map(([k, v]) => `${k}=${v}`).join(', ')}`);
        }
        lines.push(`- Action entropy: ${t.actionEntropyBits.toFixed(3)} bits`);
        lines.push(`- Longest identical-action streak: ${t.longestIdenticalActionStreak}`);
        lines.push(`- Events: player=${t.playerEventsEmitted} sim=${t.simEventsEmitted} distinctIds=${t.distinctEventIds} dupIds=${t.duplicateEventIdCount}`);
        if (Object.keys(t.eventCategoryCounts).length > 0) {
            lines.push(`- Event categories: ${Object.entries(t.eventCategoryCounts).map(([k, v]) => `${k}=${v}`).join(', ')}`);
        }
        if (Object.keys(t.eventSeverityCounts).length > 0) {
            lines.push(`- Event severities: ${Object.entries(t.eventSeverityCounts).map(([k, v]) => `${k}=${v}`).join(', ')}`);
        }
        if (Object.keys(t.eventSourceCounts).length > 0) {
            lines.push(`- Event sources: ${Object.entries(t.eventSourceCounts).map(([k, v]) => `${k}=${v}`).join(', ')}`);
        }
        lines.push(`- Money: ${fmtMinMax(t.money)}`);
        lines.push(`- Cargo units: ${fmtMinMax(t.cargoUnits)}`);
        lines.push(`- Market stock: ${fmtMinMax(t.marketStock)}`);
        lines.push(`- Market price index: ${fmtMinMax(t.marketPriceIndex)}`);
        lines.push(`- World turn: ${t.startWorldTurn} → ${t.finalWorldTurn} (Δ${t.worldTurnDelta})`);
        lines.push(`- Longest zero-event streak: ${t.longestZeroEventStreak}; zero-change streak: ${t.longestZeroChangeStreak}`);
        lines.push(`- Bounded samples: ${t.samples.length}; anomaly windows: ${t.anomalyWindows.length}; recent window: ${t.recentWindow.length}`);
        lines.push('');
    }

    if (report.determinism?.enabled) {
        lines.push('## Determinism');
        lines.push('');
        lines.push(`- Compare runs: ${report.determinism.compareRuns}`);
        if (report.determinism.baselineRunId) {
            lines.push(`- Baseline run: \`${report.determinism.baselineRunId}\``);
        }
        lines.push(`- Canonical match: ${report.determinism.canonicalMatch === undefined ? 'n/a' : report.determinism.canonicalMatch}`);
        lines.push(`- Action-stream match: ${report.determinism.actionStreamMatch === undefined ? 'n/a' : report.determinism.actionStreamMatch}`);
        if (report.determinism.firstDifference) {
            lines.push(`- First difference (${report.determinism.firstDifference.kind}): ${report.determinism.firstDifference.detail}`);
        }
        lines.push('');
    }

    const fileEntries = Object.entries(report.fileBytes);
    if (fileEntries.length > 0) {
        lines.push('## Canonical file sizes');
        lines.push('');
        for (const [name, bytes] of fileEntries.sort(([a], [b]) => a.localeCompare(b))) {
            lines.push(`- ${name}: ${bytes} bytes`);
        }
        lines.push('');
    }

    if (report.warnings.length > 0) {
        lines.push('## Warnings');
        lines.push('');
        for (const w of report.warnings) {
            lines.push(`- ${w}`);
        }
        lines.push('');
    }

    return lines.join('\n');
}
