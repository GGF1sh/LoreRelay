/**
 * Empty-log direct replay foundation.
 *
 * Wires selectable mode resolution + validated DirectInputLog into the existing
 * `resolveCombat` path without changing CombatExpectedOutput / Golden Master
 * shape. Empty logs are a pure no-op: combat state is produced solely by the
 * resolved runtime mode (legacy_gambit or mechanics_v1).
 *
 * Direct capability absent → explicit fallback to mechanics_gambit (never
 * implicit). Movement / attack / dodge / etc. are NOT implemented here.
 */

import {
    BattleSpec,
    CombatExpectedOutput,
    CombatMode,
    resolveCombat,
} from './gambitCombatCore';
import {
    DirectInputLog,
    DirectInputNormalizeErrorCode,
    emptyDirectInputLog,
    normalizeDirectInputLog,
    serializeDirectInputLog,
} from './combatDirectInputCore';
import {
    CombatModeCapabilities,
    CombatModeResolution,
    combatModeResolutionToJson,
    resolveCombatMode,
    toRuntimeCombatMode,
} from './combatModeContract';

export interface DirectReplayFoundationInput {
    /** Existing battle spec. combatMode on the spec is overridden by resolution. */
    spec: BattleSpec;
    /** Requested selectable mode (presentation contract). */
    requestedMode: unknown;
    /** Explicit capability bag — must not be inferred. */
    capabilities: CombatModeCapabilities;
    /**
     * Optional direct input log. Omitted / empty → no direct mutations.
     * Non-empty events are accepted and ordered but do not yet drive behaviour
     * (foundation only); they are retained for determinism/serialization checks.
     */
    directInput?: unknown;
}

export type DirectReplayFoundationError =
    | { ok: false; error: 'UNKNOWN_COMBAT_MODE'; requested: unknown }
    | { ok: false; error: 'INVALID_DIRECT_INPUT'; code: DirectInputNormalizeErrorCode; detail?: string }
    | { ok: false; error: 'NARRATIVE_HAS_NO_COMBAT_RESOLUTION' };

export interface DirectReplayFoundationSuccess {
    ok: true;
    mode: CombatModeResolution;
    modeJson: ReturnType<typeof combatModeResolutionToJson>;
    inputLog: DirectInputLog;
    /** Stable serialized form of the normalized input log. */
    inputLogBytes: string;
    /** Existing CombatExpectedOutput — Golden Master shape unchanged. */
    resolution: CombatExpectedOutput;
    /** Runtime mode actually passed to resolveCombat. */
    runtimeMode: CombatMode;
}

export type DirectReplayFoundationResult = DirectReplayFoundationSuccess | DirectReplayFoundationError;

/**
 * Resolve mode, normalize input, run existing combat path.
 * Empty input log must not alter combat state relative to the same runtime mode
 * without a log (i.e. identity for combat outcomes).
 */
export function runDirectReplayFoundation(input: DirectReplayFoundationInput): DirectReplayFoundationResult {
    const modeResult = resolveCombatMode(input.requestedMode, input.capabilities);
    if (!modeResult.ok) {
        return { ok: false, error: 'UNKNOWN_COMBAT_MODE', requested: modeResult.requested };
    }

    const logResult = normalizeDirectInputLog(
        input.directInput === undefined ? emptyDirectInputLog() : input.directInput,
    );
    if (!logResult.ok) {
        return {
            ok: false,
            error: 'INVALID_DIRECT_INPUT',
            code: logResult.error,
            detail: logResult.detail,
        };
    }

    const runtimeMode = toRuntimeCombatMode(modeResult.resolution.resolvedMode);
    if (runtimeMode === null) {
        return { ok: false, error: 'NARRATIVE_HAS_NO_COMBAT_RESOLUTION' };
    }

    // Foundation: empty (and non-empty-but-unimplemented) logs do not mutate
    // combat. Spec is cloned so caller state is never modified; combatMode is
    // set from explicit resolution only.
    const spec: BattleSpec = {
        ...input.spec,
        combatMode: runtimeMode,
    };

    const resolution = resolveCombat(spec);

    return {
        ok: true,
        mode: modeResult.resolution,
        modeJson: combatModeResolutionToJson(modeResult.resolution),
        inputLog: logResult.log,
        inputLogBytes: serializeDirectInputLog(logResult.log),
        resolution,
        runtimeMode,
    };
}

/**
 * Prove empty-log identity: foundation run with empty log matches bare resolveCombat
 * under the same runtime mode.
 */
export function emptyLogMatchesBareResolve(
    spec: BattleSpec,
    requestedMode: 'legacy_gambit' | 'mechanics_gambit' | 'direct_action' | 'command' | 'spectator',
    capabilities: CombatModeCapabilities,
): boolean {
    const foundation = runDirectReplayFoundation({
        spec,
        requestedMode,
        capabilities,
        directInput: emptyDirectInputLog(),
    });
    if (!foundation.ok) return false;

    const bare = resolveCombat({ ...spec, combatMode: foundation.runtimeMode });
    return stableStringify(foundation.resolution) === stableStringify(bare);
}

function stableStringify(value: unknown): string {
    return JSON.stringify(value);
}
