/**
 * Selectable combat mode contract + explicit capability resolution.
 *
 * Presentation-level modes (this module) are distinct from the existing
 * runtime CombatMode in gambitCombatCore (`legacy_gambit` | `mechanics_v1`).
 * That runtime enum is intentionally left unchanged so legacy Golden Master
 * and mechanics_v1 paths keep their existing behaviour.
 */

/** Presentation / selectable combat modes (V1 contract). */
export const COMBAT_SELECTABLE_MODES = [
    'narrative',
    'legacy_gambit',
    'mechanics_gambit',
    'direct_action',
    'command',
    'spectator',
] as const;

export type CombatSelectableMode = (typeof COMBAT_SELECTABLE_MODES)[number];

/** Existing resolver modes used by `resolveCombat` — not expanded by this foundation. */
export type CombatRuntimeMode = 'legacy_gambit' | 'mechanics_v1';

/**
 * Explicit capability bag. Direct runtime availability must be passed in —
 * never inferred from environment, wall clock, DOM, or presentation state.
 */
export interface CombatModeCapabilities {
    /** True only when a direct-action input + presentation runtime is available. */
    directRuntimeAvailable: boolean;
}

/** Stable, JSON-safe fallback reason codes. `null` means no fallback occurred. */
export type CombatModeFallbackReason = 'direct_runtime_unavailable' | null;

export interface CombatModeResolution {
    requestedMode: CombatSelectableMode;
    resolvedMode: CombatSelectableMode;
    fallbackReason: CombatModeFallbackReason;
}

export type CombatModeResolveResult =
    | { ok: true; resolution: CombatModeResolution }
    | { ok: false; error: 'UNKNOWN_COMBAT_MODE'; requested: unknown };

const SELECTABLE_SET: ReadonlySet<string> = new Set(COMBAT_SELECTABLE_MODES);

export function isCombatSelectableMode(value: unknown): value is CombatSelectableMode {
    return typeof value === 'string' && SELECTABLE_SET.has(value);
}

/**
 * Resolve a requested selectable mode against explicit capabilities.
 *
 * Rules:
 * - Unknown modes are rejected (no silent default).
 * - `direct_action` without direct runtime capability falls back to
 *   `mechanics_gambit` with reason `direct_runtime_unavailable`.
 * - All other known modes resolve to themselves (no implicit fallback).
 * - Legacy / mechanics existing runtime behaviour is not modified here.
 */
export function resolveCombatMode(
    requestedMode: unknown,
    capabilities: CombatModeCapabilities,
): CombatModeResolveResult {
    if (!isCombatSelectableMode(requestedMode)) {
        return { ok: false, error: 'UNKNOWN_COMBAT_MODE', requested: requestedMode };
    }

    if (requestedMode === 'direct_action' && !capabilities.directRuntimeAvailable) {
        const resolution: CombatModeResolution = {
            requestedMode: 'direct_action',
            resolvedMode: 'mechanics_gambit',
            fallbackReason: 'direct_runtime_unavailable',
        };
        return { ok: true, resolution };
    }

    const resolution: CombatModeResolution = {
        requestedMode,
        resolvedMode: requestedMode,
        fallbackReason: null,
    };
    return { ok: true, resolution };
}

/**
 * Map a resolved selectable mode to the existing `resolveCombat` runtime mode.
 * `narrative` has no gambit/mechanics combat path — returns null.
 * `direct_action` / `command` / `spectator` / `mechanics_gambit` share the
 * mechanics_v1 resolver (input rights differ; see permission helpers).
 */
export function toRuntimeCombatMode(resolvedMode: CombatSelectableMode): CombatRuntimeMode | null {
    switch (resolvedMode) {
        case 'legacy_gambit':
            return 'legacy_gambit';
        case 'mechanics_gambit':
        case 'direct_action':
        case 'command':
        case 'spectator':
            return 'mechanics_v1';
        case 'narrative':
            return null;
        default: {
            const _exhaustive: never = resolvedMode;
            return _exhaustive;
        }
    }
}

/** Avatar-level combat verbs (move / attack / dodge / …). */
export function combatModeAllowsDirectControl(mode: CombatSelectableMode): boolean {
    return mode === 'direct_action';
}

/** Command mode may issue tactical orders; spectator may not. */
export function combatModeAllowsTacticalOrder(mode: CombatSelectableMode): boolean {
    return mode === 'command' || mode === 'direct_action';
}

/** Spectator: no combat operation inputs. Command: no avatar control. */
export function combatModeRejectsCombatOps(mode: CombatSelectableMode): boolean {
    return mode === 'spectator' || mode === 'command';
}

/** JSON-safe plain object for logging / transport (no class instances, no undefined). */
export function combatModeResolutionToJson(resolution: CombatModeResolution): {
    requestedMode: CombatSelectableMode;
    resolvedMode: CombatSelectableMode;
    fallbackReason: CombatModeFallbackReason;
} {
    return {
        requestedMode: resolution.requestedMode,
        resolvedMode: resolution.resolvedMode,
        fallbackReason: resolution.fallbackReason,
    };
}
