/**
 * Headless direct-control state machine.
 *
 * V1 scope: move, light_attack, dodge (stamina + i-frames + evasion credits).
 * Pure TypeScript: no VS Code API, DOM, wall clock, draw FPS, Math.random(),
 * runtime class instances, or callbacks stored in state. All state is JSON-safe.
 *
 * Active-frame damage always goes through existing resolveMechanics — never a
 * bespoke HP writer. Successful i-frame avoids of dodgeable hits skip the
 * resolver and consume an evasion credit (shared interval with auto evasion).
 */

import { createHash } from 'node:crypto';
import { AbilityDefinition, DirectProfile, StatusDefinition } from './combatAbilityTypes';
import {
    DirectInputEvent,
    DirectInputLog,
    QuantizedDirection,
    emptyDirectInputLog,
    normalizeDirectInputLog,
    quantizeDirection,
    quantizeScalar,
    serializeDirectInputLog,
} from './combatDirectInputCore';
import {
    advanceMechanicsState,
    canAct,
    canMove,
    isAbilityAutoDodgeable,
    isMechanicsTargetLegal,
    MechanicsCombatant,
    MechanicsReceipt,
    resolveMechanics,
} from './combatMechanicsResolver';
import {
    CombatSelectableMode,
    combatModeAllowsDirectControl,
    combatModeAllowsTacticalOrder,
} from './combatModeContract';

// ---------------------------------------------------------------------------
// V1 constants (not authored on abilities/resources)
// ---------------------------------------------------------------------------

/** Simulation ticks per second for ms→tick conversion and movement integration. */
export const DIRECT_V1_TICK_RATE = 30;

/** Units of travel per second while a move direction is held. */
export const DIRECT_V1_MOVE_SPEED = 100;

/** One-shot displacement distance for a successful dodge press (world units). */
export const DIRECT_V1_DODGE_DISTANCE = 40;

/** Position / facing quantum — same 1/1000 grid as input direction. */
export const DIRECT_POSITION_QUANTUM = 1000;

/** Stamina is stored as milli-stamina (100_000 = 100.000). */
export const STAMINA_MAX_MILLI = 100_000;
export const DODGE_BASE_COST_MILLI = 25_000;
export const DODGE_CHAIN_PENALTY_MILLI = 10_000;
export const STAMINA_REGEN_MILLI_PER_SEC = 20_000;

/** Default i-frame / just-window when ability DirectProfile omits them. */
export const DEFAULT_IFRAME_MS = 300;
export const DEFAULT_JUST_WINDOW_MS = 120;
export const DEFAULT_DODGE_RECOVERY_MS = 150;

/** Consecutive-dodge windows in seconds. */
export const DODGE_CHAIN_WINDOW_SEC = 1;
export const DODGE_CHAIN_RESET_SEC = 2;

// ---------------------------------------------------------------------------
// State types (JSON-safe primitives / plain objects only)
// ---------------------------------------------------------------------------

export type DirectActionPhase =
    | 'idle'
    | 'moving'
    | 'windup'
    | 'active'
    | 'recovery'
    | 'defeated';

export type DirectDodgePhase = 'none' | 'iframe' | 'recovery';

export interface QuantizedVec2 {
    x: number;
    y: number;
}

/** Pure controller / action-machine state for the player-driven combatant. */
export interface DirectControllerState {
    controlledCombatantId: string;
    tick: number;
    position: QuantizedVec2;
    facing: QuantizedVec2;
    /** Null when no move is held. */
    heldMoveDirection: QuantizedDirection | null;
    actionPhase: DirectActionPhase;
    currentAbilityId: string | null;
    currentTargetId: string | null;
    phaseStartedTick: number;
    phaseEndsTick: number;
    attackCommitted: boolean;

    // --- Dodge / stamina / evasion credit (integers only) ---
    staminaMilli: number;
    dodgePhase: DirectDodgePhase;
    dodgeStartedTick: number;
    iframeStartTick: number;
    iframeEndTick: number;
    /** -1 means never dodged. */
    lastDodgeTick: number;
    consecutiveDodgeCount: number;
    dodgeableThreatCount: number;
    /** Hold cap 1. */
    availableEvasionCredits: number;
}

/** Snapshot of one combatant participating in the headless sim. */
export interface DirectCombatantSnapshot {
    id: string;
    team: number;
    position: QuantizedVec2;
    /** Ability cooldown ready-at tick (inclusive). */
    cooldownReadyTick: number;
    mechanics: MechanicsCombatant;
}

export type DirectInputRejectReason =
    | 'actor_defeated'
    | 'actor_mismatch'
    | 'invalid_phase'
    | 'missing_target'
    | 'invalid_target'
    | 'target_defeated'
    | 'cooldown'
    | 'unsupported_action'
    | 'missing_direction'
    | 'missing_ability'
    | 'insufficient_stamina'
    | 'cannot_move'
    | 'cannot_act'
    | 'mode_forbids_action'
    | 'tick_rate_mismatch';

export interface DirectRejectedInput {
    tick: number;
    seq: number;
    action: string;
    reason: DirectInputRejectReason;
}

export interface DirectCommittedAction {
    tick: number;
    seq: number;
    kind: 'light_attack';
    actorId: string;
    targetId: string;
    abilityId: string;
    damageDealt: number;
    dodged: boolean;
}

export interface DirectMechanicsReceiptEvent {
    tick: number;
    actorId: string;
    targetId: string;
    abilityId: string;
    receipt: MechanicsReceipt;
}

export type DirectSimReceiptKind =
    | 'dodge_started'
    | 'dodge_rejected_stamina'
    | 'dodge_rejected_phase'
    | 'dodge_rejected_control'
    | 'dodge_interrupted_control'
    | 'iframe_avoided'
    | 'iframe_no_credit'
    | 'undodgeable_hit'
    | 'evasion_credit_gained'
    | 'evasion_credit_consumed'
    | 'perfect_dodge'
    | 'dodge_chain_penalty'
    | 'stamina_regenerated'
    | 'incoming_hit'
    | 'action_interrupted'
    | 'move_stopped_control';

export interface DirectSimReceipt {
    tick: number;
    kind: DirectSimReceiptKind;
    amount?: number;
    detail?: string;
    attackerId?: string;
    targetId?: string;
    abilityId?: string;
}

export interface DirectPhaseTicks {
    windupTicks: number;
    activeTicks: number;
    recoveryTicks: number;
}

/** Deterministic scheduled attack against a combatant (usually the player). */
export interface IncomingAttackEvent {
    tick: number;
    seq: number;
    attackerId: string;
    targetId: string;
    abilityId: string;
}

export interface DirectHeadlessInput {
    controlledCombatantId: string;
    combatants: readonly DirectCombatantSeed[];
    /** Loadout normal-attack ability. Required for light_attack. */
    normalAttackAbility: AbilityDefinition;
    /** Ability catalog for incoming attacks (and optional extras). */
    abilities?: readonly AbilityDefinition[];
    statuses?: readonly StatusDefinition[];
    /**
     * Runner tick rate. When provided must match DirectInputLog.tickRate.
     * When omitted, the log's tickRate is used.
     */
    tickRate?: number;
    /** Inclusive simulation length: ticks 0 .. durationTicks-1 are processed. */
    durationTicks: number;
    directInput?: unknown;
    moveSpeed?: number;
    /** Deterministic incoming attack schedule, ordered by (tick, seq). */
    incomingAttacks?: readonly IncomingAttackEvent[];
    /** Optional override for i-frame ms (tests / profiles without ability.direct). */
    iframeMs?: number;
    justWindowMs?: number;
    dodgeRecoveryMs?: number;
    dodgeDistance?: number;
    /** Starting stamina in milli (default full). */
    initialStaminaMilli?: number;
    /**
     * Selectable mode controlling input rights.
     * Defaults to `direct_action` (full avatar control).
     */
    mode?: CombatSelectableMode;
}

export interface DirectCombatantSeed {
    id: string;
    team: number;
    position: QuantizedVec2;
    mechanics: MechanicsCombatant;
    /** Optional initial cooldown ready tick (default 0 = ready). */
    cooldownReadyTick?: number;
}

export interface DirectHeadlessResult {
    finalDirectState: DirectControllerState;
    combatants: Record<string, DirectCombatantSnapshot>;
    committedActions: DirectCommittedAction[];
    mechanicsReceipts: DirectMechanicsReceiptEvent[];
    directReceipts: DirectSimReceipt[];
    rejectedInputs: DirectRejectedInput[];
    inputLog: DirectInputLog;
    inputLogBytes: string;
    /** Stable full-result JSON for byte-identical replay checks. */
    outputBytes: string;
    /** SHA-256 of outputBytes. */
    replayHash: string;
}

export type DirectHeadlessRunResult =
    | { ok: true; result: DirectHeadlessResult }
    | { ok: false; error: string; detail?: string };

// ---------------------------------------------------------------------------
// Shared auto-evasion interval (must match resolveMechanics)
// ---------------------------------------------------------------------------

function clamp(value: number, low: number, high: number): number {
    return Math.max(low, Math.min(high, value));
}

/** Non-negative integer threat / auto-evasion hit count. */
export function normalizeIncomingHitCount(value: unknown): number {
    if (typeof value !== 'number' || !Number.isFinite(value)) return 0;
    return Math.max(0, Math.trunc(value));
}

/**
 * Keep controller credit-interval progress and mechanics.incomingHitCount aligned
 * so direct ⇄ command/spectator / pure auto paths share one counter.
 */
function syncThreatCount(
    controller: DirectControllerState,
    combatant: DirectCombatantSnapshot | undefined,
    count: number,
): void {
    const n = normalizeIncomingHitCount(count);
    controller.dodgeableThreatCount = n;
    if (combatant) combatant.mechanics.incomingHitCount = n;
}

/**
 * Same effective evasion as resolveMechanics: paralysis zeros it;
 * otherwise clamp(evasion - accuracy, 0, 50).
 */
export function effectiveEvasionFor(
    defender: MechanicsCombatant,
    attacker?: MechanicsCombatant,
): number {
    const paralyzed = (defender.statuses || []).some(
        s => s.id === 'paralysis' && s.remainingSeconds > 0,
    );
    if (paralyzed) return 0;
    return clamp((defender.evasion || 0) - (attacker?.accuracy || 0), 0, 50);
}

/** Auto dodge fires every `interval` dodgeable hits; 0 means never. */
export function autoDodgeInterval(effEvasion: number): number {
    if (!(effEvasion > 0)) return 0;
    return Math.ceil(100 / effEvasion);
}

/** True when the N-th dodgeable threat (1-based count) would auto-dodge. */
export function wouldAutoDodgeOnCount(threatCount: number, effEvasion: number): boolean {
    const interval = autoDodgeInterval(effEvasion);
    if (interval <= 0 || threatCount <= 0) return false;
    return threatCount % interval === 0;
}

// ---------------------------------------------------------------------------
// Frame derivation (§4.2)
// ---------------------------------------------------------------------------

function ceilPositive(value: number): number {
    if (!Number.isFinite(value) || value <= 0) return 0;
    return Math.ceil(value);
}

/** ticks = ceil(ms / 1000 * tickRate) — ceiling, never truncating active to zero. */
export function msToTicks(ms: number, tickRate: number): number {
    if (!Number.isFinite(ms) || ms <= 0) return 0;
    return ceilPositive((ms / 1000) * tickRate);
}

/**
 * Explicit DirectProfile overrides derivation. Active is always ≥ 1 tick.
 */
export function deriveDirectPhaseTicks(
    ability: AbilityDefinition,
    tickRate: number = DIRECT_V1_TICK_RATE,
): DirectPhaseTicks {
    const rate = tickRate > 0 ? tickRate : DIRECT_V1_TICK_RATE;
    const direct: DirectProfile | undefined = ability.direct;
    if (direct) {
        return {
            windupTicks: msToTicks(direct.windupMs, rate),
            activeTicks: Math.max(1, msToTicks(direct.activeMs, rate)),
            recoveryTicks: msToTicks(direct.recoveryMs, rate),
        };
    }
    const cooldown = typeof ability.auto?.cooldown === 'number' && Number.isFinite(ability.auto.cooldown)
        ? Math.max(0, ability.auto.cooldown)
        : 1;
    return {
        windupTicks: ceilPositive(cooldown * 0.20 * rate),
        activeTicks: Math.max(1, ceilPositive(cooldown * 0.10 * rate)),
        recoveryTicks: ceilPositive(cooldown * 0.20 * rate),
    };
}

/** Cooldown length in ticks from ability auto.cooldown (shared contract). */
export function abilityCooldownTicks(
    ability: AbilityDefinition,
    tickRate: number = DIRECT_V1_TICK_RATE,
): number {
    const rate = tickRate > 0 ? tickRate : DIRECT_V1_TICK_RATE;
    const cooldown = typeof ability.auto?.cooldown === 'number' && Number.isFinite(ability.auto.cooldown)
        ? Math.max(0, ability.auto.cooldown)
        : 0;
    return ceilPositive(cooldown * rate);
}

export function iframeTicksFor(
    ability: AbilityDefinition | undefined,
    tickRate: number,
    overrideMs?: number,
): number {
    const ms = overrideMs
        ?? ability?.direct?.iframeMs
        ?? DEFAULT_IFRAME_MS;
    return Math.max(1, msToTicks(ms, tickRate));
}

export function justWindowTicksFor(
    ability: AbilityDefinition | undefined,
    tickRate: number,
    overrideMs?: number,
): number {
    const ms = overrideMs
        ?? ability?.direct?.justWindowMs
        ?? DEFAULT_JUST_WINDOW_MS;
    return msToTicks(ms, tickRate);
}

// ---------------------------------------------------------------------------
// Quantized geometry helpers
// ---------------------------------------------------------------------------

export function quantizePosition(x: number, y: number): QuantizedVec2 {
    return {
        x: Math.round(x * DIRECT_POSITION_QUANTUM) / DIRECT_POSITION_QUANTUM,
        y: Math.round(y * DIRECT_POSITION_QUANTUM) / DIRECT_POSITION_QUANTUM,
    };
}

/**
 * Normalize a direction to unit length (or zero), then quantize to 1/1000.
 * Diagonal input never exceeds unit speed after normalize.
 */
export function normalizeAndQuantizeDirection(x: number, y: number): QuantizedDirection {
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
        return { x: 0, y: 0 };
    }
    const len = Math.sqrt(x * x + y * y);
    if (len <= 0) return { x: 0, y: 0 };
    return quantizeDirection(x / len, y / len);
}

function isAlive(snapshot: DirectCombatantSnapshot): boolean {
    return snapshot.mechanics.hp > 0;
}

function cloneMechanics(m: MechanicsCombatant): MechanicsCombatant {
    return structuredClone(m);
}

function isIframeActive(controller: DirectControllerState, tick: number): boolean {
    return controller.dodgePhase === 'iframe'
        && tick >= controller.iframeStartTick
        && tick < controller.iframeEndTick;
}

// ---------------------------------------------------------------------------
// Simulation
// ---------------------------------------------------------------------------

export function runDirectHeadlessMoveAttack(input: DirectHeadlessInput): DirectHeadlessRunResult {
    if (!input.controlledCombatantId || typeof input.controlledCombatantId !== 'string') {
        return { ok: false, error: 'MISSING_CONTROLLED_COMBATANT' };
    }
    if (!Number.isInteger(input.durationTicks) || input.durationTicks < 0) {
        return { ok: false, error: 'INVALID_DURATION' };
    }
    if (!input.normalAttackAbility || typeof input.normalAttackAbility !== 'object') {
        return { ok: false, error: 'MISSING_ABILITY' };
    }

    const moveSpeed = input.moveSpeed && input.moveSpeed > 0 ? input.moveSpeed : DIRECT_V1_MOVE_SPEED;
    const dodgeDistance = input.dodgeDistance && input.dodgeDistance > 0
        ? input.dodgeDistance
        : DIRECT_V1_DODGE_DISTANCE;
    const statuses = input.statuses || [];
    const ability = input.normalAttackAbility;
    const mode: CombatSelectableMode = input.mode || 'direct_action';

    const abilityById = new Map<string, AbilityDefinition>();
    abilityById.set(ability.id, ability);
    for (const extra of input.abilities || []) {
        if (extra && typeof extra.id === 'string') abilityById.set(extra.id, extra);
    }

    const defaultTickRate = input.tickRate && input.tickRate > 0 ? input.tickRate : DIRECT_V1_TICK_RATE;
    const logResult = normalizeDirectInputLog(
        input.directInput === undefined ? emptyDirectInputLog(defaultTickRate) : input.directInput,
    );
    if (!logResult.ok) {
        return { ok: false, error: 'INVALID_DIRECT_INPUT', detail: logResult.error };
    }
    const inputLog = logResult.log;

    // Runner tickRate must match the log when both are explicit.
    if (input.tickRate !== undefined && input.tickRate !== inputLog.tickRate) {
        return {
            ok: false,
            error: 'TICK_RATE_MISMATCH',
            detail: `runner=${input.tickRate} log=${inputLog.tickRate}`,
        };
    }
    const tickRate = inputLog.tickRate;
    const phaseTicks = deriveDirectPhaseTicks(ability, tickRate);
    const cooldownTicks = abilityCooldownTicks(ability, tickRate);
    const iframeTicks = iframeTicksFor(ability, tickRate, input.iframeMs);
    const justWindowTicks = justWindowTicksFor(ability, tickRate, input.justWindowMs);
    const dodgeRecoveryTicks = Math.max(
        0,
        msToTicks(input.dodgeRecoveryMs ?? DEFAULT_DODGE_RECOVERY_MS, tickRate),
    );

    const incoming = normalizeIncomingAttacks(input.incomingAttacks || []);
    if (!incoming.ok) {
        return { ok: false, error: 'INVALID_INCOMING_ATTACKS', detail: incoming.detail };
    }

    const combatants: Record<string, DirectCombatantSnapshot> = {};
    for (const seed of input.combatants) {
        if (!seed || typeof seed.id !== 'string') {
            return { ok: false, error: 'INVALID_COMBATANT_SEED' };
        }
        const mechanics = cloneMechanics(seed.mechanics);
        mechanics.id = seed.id;
        combatants[seed.id] = {
            id: seed.id,
            team: seed.team,
            position: quantizePosition(seed.position.x, seed.position.y),
            cooldownReadyTick: seed.cooldownReadyTick ?? 0,
            mechanics,
        };
    }

    const controlled = combatants[input.controlledCombatantId];
    if (!controlled) {
        return { ok: false, error: 'CONTROLLED_COMBATANT_NOT_FOUND', detail: input.controlledCombatantId };
    }

    const initialStamina = input.initialStaminaMilli !== undefined
        ? clamp(Math.trunc(input.initialStaminaMilli), 0, STAMINA_MAX_MILLI)
        : STAMINA_MAX_MILLI;

    // Inherit auto evasion interval progress so mode switches do not reset the counter.
    const inheritedThreatCount = normalizeIncomingHitCount(controlled.mechanics.incomingHitCount);
    controlled.mechanics.incomingHitCount = inheritedThreatCount;

    const controller: DirectControllerState = {
        controlledCombatantId: input.controlledCombatantId,
        tick: 0,
        position: { ...controlled.position },
        facing: { x: 1, y: 0 },
        heldMoveDirection: null,
        actionPhase: controlled.mechanics.hp > 0 ? 'idle' : 'defeated',
        currentAbilityId: null,
        currentTargetId: null,
        phaseStartedTick: 0,
        phaseEndsTick: 0,
        attackCommitted: false,
        staminaMilli: initialStamina,
        dodgePhase: 'none',
        dodgeStartedTick: 0,
        iframeStartTick: 0,
        iframeEndTick: 0,
        lastDodgeTick: -1,
        consecutiveDodgeCount: 0,
        dodgeableThreatCount: inheritedThreatCount,
        availableEvasionCredits: 0,
    };

    const committedActions: DirectCommittedAction[] = [];
    const mechanicsReceipts: DirectMechanicsReceiptEvent[] = [];
    const directReceipts: DirectSimReceipt[] = [];
    const rejectedInputs: DirectRejectedInput[] = [];

    const eventsByTick = new Map<number, DirectInputEvent[]>();
    for (const event of inputLog.events) {
        const list = eventsByTick.get(event.tick) || [];
        list.push(event);
        eventsByTick.set(event.tick, list);
    }

    const attacksByTick = new Map<number, IncomingAttackEvent[]>();
    for (const atk of incoming.events) {
        const list = attacksByTick.get(atk.tick) || [];
        list.push(atk);
        attacksByTick.set(atk.tick, list);
    }

    const regenPerTick = Math.trunc(STAMINA_REGEN_MILLI_PER_SEC / tickRate);
    const chainWindowTicks = Math.max(1, Math.ceil(DODGE_CHAIN_WINDOW_SEC * tickRate));
    const mechanicsDelta = 1 / tickRate;

    const maxTick = input.durationTicks;
    for (let tick = 0; tick < maxTick; tick++) {
        controller.tick = tick;
        syncDefeated(controller, combatants);

        // 1) Controller time boundaries first (action phase / i-frame / chain).
        //    Status remainingSeconds still reflect the *start* of this tick.
        advanceDodgePhase(controller, tick, dodgeRecoveryTicks);
        advanceActionPhase({
            controller,
            combatants,
            ability,
            phaseTicks,
            cooldownTicks,
            committedActions,
            mechanicsReceipts,
            directReceipts,
            statuses,
            inputSeq: -1,
        });

        // 2) Stamina regen (integer milli only).
        regenerateStamina(controller, regenPerTick, directReceipts);

        // 3) Current-tick inputs in seq order.
        const events = eventsByTick.get(tick) || [];
        for (const event of events) {
            applyInputEvent({
                event,
                controller,
                combatants,
                ability,
                phaseTicks,
                cooldownTicks,
                rejectedInputs,
                committedActions,
                mechanicsReceipts,
                directReceipts,
                statuses,
                tickRate,
                iframeTicks,
                dodgeRecoveryTicks,
                dodgeDistance,
                chainWindowTicks,
                mode,
            });
        }

        // 4) Incoming attacks after inputs so same-tick dodges open i-frames first.
        const attacks = attacksByTick.get(tick) || [];
        for (const atk of attacks) {
            resolveIncomingAttack({
                atk,
                controller,
                combatants,
                abilityById,
                statuses,
                mechanicsReceipts,
                directReceipts,
                justWindowTicks,
                mode,
            });
            // Hard control applied mid-dodge cancels remaining i-frames (no credit spend).
            maybeInterruptDodgeFromControl(controller, combatants, directReceipts);
        }

        // 5) Movement / commit side-effects for this tick.
        integrateMovement(controller, combatants, moveSpeed, tickRate, directReceipts);
        syncControlledPosition(controller, combatants);

        // 6–7) Mechanics status/DoT/doom advance once at tick end for living only.
        //     Status present at tick start blocked actions; duration drops here.
        advanceAllMechanics(combatants, mechanicsDelta, statuses, mechanicsReceipts, tick, controller);
        syncControlledPosition(controller, combatants);
    }

    controller.tick = maxTick;
    syncDefeated(controller, combatants);
    syncControlledPosition(controller, combatants);

    return {
        ok: true,
        result: buildResult({
            controller,
            combatants,
            committedActions,
            mechanicsReceipts,
            directReceipts,
            rejectedInputs,
            inputLog,
        }),
    };
}

// ---------------------------------------------------------------------------
// Incoming attack normalize
// ---------------------------------------------------------------------------

function normalizeIncomingAttacks(
    raw: readonly IncomingAttackEvent[],
): { ok: true; events: IncomingAttackEvent[] } | { ok: false; detail: string } {
    const events: IncomingAttackEvent[] = [];
    const seen = new Set<string>();
    for (let i = 0; i < raw.length; i++) {
        const e = raw[i];
        if (!e || typeof e !== 'object') return { ok: false, detail: `bad event ${i}` };
        if (!Number.isInteger(e.tick) || e.tick < 0) return { ok: false, detail: `tick ${i}` };
        if (!Number.isInteger(e.seq) || e.seq < 0) return { ok: false, detail: `seq ${i}` };
        if (typeof e.attackerId !== 'string' || typeof e.targetId !== 'string' || typeof e.abilityId !== 'string') {
            return { ok: false, detail: `ids ${i}` };
        }
        const key = `${e.tick}:${e.seq}`;
        if (seen.has(key)) return { ok: false, detail: `duplicate ${key}` };
        seen.add(key);
        events.push({
            tick: e.tick,
            seq: e.seq,
            attackerId: e.attackerId,
            targetId: e.targetId,
            abilityId: e.abilityId,
        });
    }
    events.sort((a, b) => (a.tick !== b.tick ? a.tick - b.tick : a.seq - b.seq));
    return { ok: true, events };
}

// ---------------------------------------------------------------------------
// Stamina
// ---------------------------------------------------------------------------

function regenerateStamina(
    controller: DirectControllerState,
    regenPerTick: number,
    receipts: DirectSimReceipt[],
): void {
    if (controller.actionPhase === 'defeated') return;
    if (regenPerTick <= 0) return;
    if (controller.staminaMilli >= STAMINA_MAX_MILLI) return;
    const before = controller.staminaMilli;
    controller.staminaMilli = Math.min(STAMINA_MAX_MILLI, controller.staminaMilli + regenPerTick);
    const gained = controller.staminaMilli - before;
    if (gained > 0) {
        receipts.push({
            tick: controller.tick,
            kind: 'stamina_regenerated',
            amount: gained,
        });
    }
}

function dodgeCostMilli(consecutiveDodgeCount: number): number {
    return DODGE_BASE_COST_MILLI + DODGE_CHAIN_PENALTY_MILLI * Math.max(0, consecutiveDodgeCount);
}

// ---------------------------------------------------------------------------
// Input handling
// ---------------------------------------------------------------------------

interface ApplyContext {
    event: DirectInputEvent;
    controller: DirectControllerState;
    combatants: Record<string, DirectCombatantSnapshot>;
    ability: AbilityDefinition;
    phaseTicks: DirectPhaseTicks;
    cooldownTicks: number;
    rejectedInputs: DirectRejectedInput[];
    committedActions: DirectCommittedAction[];
    mechanicsReceipts: DirectMechanicsReceiptEvent[];
    directReceipts: DirectSimReceipt[];
    statuses: readonly StatusDefinition[];
    tickRate: number;
    iframeTicks: number;
    dodgeRecoveryTicks: number;
    dodgeDistance: number;
    chainWindowTicks: number;
    mode: CombatSelectableMode;
}

function reject(ctx: ApplyContext, reason: DirectInputRejectReason): void {
    ctx.rejectedInputs.push({
        tick: ctx.event.tick,
        seq: ctx.event.seq,
        action: ctx.event.action,
        reason,
    });
}

const COMBAT_OPS = new Set([
    'move', 'light_attack', 'heavy_attack', 'use_ability', 'guard', 'parry', 'dodge',
    'target_lock', 'target_cycle', 'switch_character',
]);

function applyInputEvent(ctx: ApplyContext): void {
    const { event, controller, mode } = ctx;

    // actorId must match the controlled combatant (distinct from incoming IDs).
    if (event.actorId !== controller.controlledCombatantId) {
        reject(ctx, 'actor_mismatch');
        return;
    }

    // Spectator authorization is checked *before* any deferred-intent early return
    // so companion_order / pause / mode_switch cannot slip through.
    if (mode === 'spectator') {
        reject(ctx, 'mode_forbids_action');
        return;
    }

    // Command: tactical / companion orders only; no avatar combat ops.
    if (mode === 'command') {
        if (event.action === 'tactical_order' || event.action === 'companion_order') {
            // Accepted deferred intents; no side effects in this task scope.
            return;
        }
        reject(ctx, 'mode_forbids_action');
        return;
    }

    // direct_action (and any future avatar modes): deferred intents accepted.
    if (
        event.action === 'tactical_order'
        || event.action === 'mode_switch'
        || event.action === 'pause'
        || event.action === 'companion_order'
    ) {
        if (event.action === 'tactical_order' && !combatModeAllowsTacticalOrder(mode)) {
            reject(ctx, 'mode_forbids_action');
            return;
        }
        return;
    }

    if (COMBAT_OPS.has(event.action) && !combatModeAllowsDirectControl(mode)) {
        reject(ctx, 'mode_forbids_action');
        return;
    }

    const actor = ctx.combatants[controller.controlledCombatantId];

    if (event.action === 'move') {
        applyMove(ctx, actor);
        return;
    }
    if (event.action === 'light_attack') {
        applyLightAttack(ctx, actor);
        return;
    }
    if (event.action === 'dodge') {
        applyDodge(ctx, actor);
        return;
    }
    reject(ctx, 'unsupported_action');
}

function applyMove(ctx: ApplyContext, actor: DirectCombatantSnapshot | undefined): void {
    const { event, controller } = ctx;
    if (!actor || !isAlive(actor) || controller.actionPhase === 'defeated') {
        reject(ctx, 'actor_defeated');
        return;
    }

    const phase = event.phase || 'press';
    if (phase === 'release') {
        controller.heldMoveDirection = null;
        if (controller.actionPhase === 'moving' && controller.dodgePhase === 'none') {
            controller.actionPhase = 'idle';
        }
        return;
    }

    // Shared with auto path: paralysis / stun / sleep / petrify block move start.
    if (!canMove(actor.mechanics)) {
        reject(ctx, 'cannot_move');
        return;
    }

    if (!event.direction) {
        reject(ctx, 'missing_direction');
        return;
    }
    const held = normalizeAndQuantizeDirection(event.direction.x, event.direction.y);
    controller.heldMoveDirection = held;
    if (held.x !== 0 || held.y !== 0) {
        controller.facing = { x: held.x, y: held.y };
    }
    if (controller.actionPhase === 'idle' && controller.dodgePhase === 'none') {
        controller.actionPhase = 'moving';
    }
}

function applyLightAttack(ctx: ApplyContext, actor: DirectCombatantSnapshot | undefined): void {
    const { event, controller, ability, phaseTicks } = ctx;

    if (event.phase === 'release') {
        return;
    }

    if (!actor || !isAlive(actor) || controller.actionPhase === 'defeated') {
        reject(ctx, 'actor_defeated');
        return;
    }
    if (controller.dodgePhase !== 'none') {
        reject(ctx, 'invalid_phase');
        return;
    }
    if (controller.actionPhase !== 'idle' && controller.actionPhase !== 'moving') {
        reject(ctx, 'invalid_phase');
        return;
    }
    // Shared with auto path: stun / sleep / petrify block attack start.
    if (!canAct(actor.mechanics)) {
        reject(ctx, 'cannot_act');
        return;
    }
    if (!event.targetId) {
        reject(ctx, 'missing_target');
        return;
    }
    const target = ctx.combatants[event.targetId];
    if (!target) {
        reject(ctx, 'invalid_target');
        return;
    }
    if (!isAlive(target)) {
        reject(ctx, 'target_defeated');
        return;
    }
    if (target.team === actor.team) {
        reject(ctx, 'invalid_target');
        return;
    }
    if (controller.tick < actor.cooldownReadyTick) {
        reject(ctx, 'cooldown');
        return;
    }
    if (!ability.id) {
        reject(ctx, 'missing_ability');
        return;
    }

    controller.currentAbilityId = ability.id;
    controller.currentTargetId = event.targetId;
    controller.attackCommitted = false;
    controller.phaseStartedTick = controller.tick;

    if (phaseTicks.windupTicks <= 0) {
        enterActivePhase({
            controller: ctx.controller,
            combatants: ctx.combatants,
            ability: ctx.ability,
            phaseTicks: ctx.phaseTicks,
            cooldownTicks: ctx.cooldownTicks,
            committedActions: ctx.committedActions,
            mechanicsReceipts: ctx.mechanicsReceipts,
            directReceipts: ctx.directReceipts,
            statuses: ctx.statuses,
            inputSeq: event.seq,
        });
    } else {
        controller.actionPhase = 'windup';
        controller.phaseEndsTick = controller.tick + phaseTicks.windupTicks;
    }
}

function applyDodge(ctx: ApplyContext, actor: DirectCombatantSnapshot | undefined): void {
    const { event, controller, directReceipts } = ctx;

    if (event.phase === 'release') {
        return;
    }

    if (!actor || !isAlive(actor) || controller.actionPhase === 'defeated') {
        reject(ctx, 'actor_defeated');
        return;
    }

    // Hard control: reject without spending stamina.
    if (!canMove(actor.mechanics) || !canAct(actor.mechanics)) {
        directReceipts.push({
            tick: controller.tick,
            kind: 'dodge_rejected_control',
            detail: 'hard_control',
        });
        reject(ctx, 'cannot_act');
        return;
    }

    // Attack windup/active/recovery, or already dodging → reject.
    if (
        controller.actionPhase === 'windup'
        || controller.actionPhase === 'active'
        || controller.actionPhase === 'recovery'
        || controller.dodgePhase !== 'none'
    ) {
        directReceipts.push({
            tick: controller.tick,
            kind: 'dodge_rejected_phase',
            detail: controller.actionPhase,
        });
        reject(ctx, 'invalid_phase');
        return;
    }
    if (controller.actionPhase !== 'idle' && controller.actionPhase !== 'moving') {
        directReceipts.push({
            tick: controller.tick,
            kind: 'dodge_rejected_phase',
            detail: controller.actionPhase,
        });
        reject(ctx, 'invalid_phase');
        return;
    }

    if (!event.direction) {
        reject(ctx, 'missing_direction');
        return;
    }

    // Surcharge window is strictly 1s (chainWindowTicks). Outside it, reset
    // *before* cost so 1s–2s gaps never pay the +10 chain tax.
    if (
        controller.lastDodgeTick >= 0
        && (controller.tick - controller.lastDodgeTick) > ctx.chainWindowTicks
    ) {
        controller.consecutiveDodgeCount = 0;
    }

    const cost = dodgeCostMilli(controller.consecutiveDodgeCount);
    if (controller.staminaMilli < cost) {
        directReceipts.push({
            tick: controller.tick,
            kind: 'dodge_rejected_stamina',
            amount: cost,
        });
        reject(ctx, 'insufficient_stamina');
        return;
    }

    // Spend stamina immediately (amount matches receipt).
    controller.staminaMilli -= cost;
    const chainSurcharge = cost > DODGE_BASE_COST_MILLI;

    // Chain bookkeeping for the *next* dodge.
    if (
        controller.lastDodgeTick >= 0
        && (controller.tick - controller.lastDodgeTick) <= ctx.chainWindowTicks
    ) {
        controller.consecutiveDodgeCount += 1;
    } else {
        controller.consecutiveDodgeCount = 1;
    }
    controller.lastDodgeTick = controller.tick;

    if (chainSurcharge) {
        directReceipts.push({
            tick: controller.tick,
            kind: 'dodge_chain_penalty',
            amount: cost,
            detail: `cost_milli=${cost}`,
        });
    }

    // Directional displacement.
    const dir = normalizeAndQuantizeDirection(event.direction.x, event.direction.y);
    if (dir.x !== 0 || dir.y !== 0) {
        const len = Math.hypot(dir.x, dir.y) || 1;
        const nx = dir.x / len;
        const ny = dir.y / len;
        controller.position = quantizePosition(
            controller.position.x + nx * ctx.dodgeDistance,
            controller.position.y + ny * ctx.dodgeDistance,
        );
        controller.facing = { x: dir.x, y: dir.y };
        actor.position = { ...controller.position };
    }

    // Open i-frames.
    controller.dodgePhase = 'iframe';
    controller.dodgeStartedTick = controller.tick;
    controller.iframeStartTick = controller.tick;
    controller.iframeEndTick = controller.tick + ctx.iframeTicks;
    controller.heldMoveDirection = null;
    controller.actionPhase = 'idle';

    directReceipts.push({
        tick: controller.tick,
        kind: 'dodge_started',
        amount: cost,
        detail: `iframe_end=${controller.iframeEndTick};cost_milli=${cost}`,
    });
}

/** Cancel remaining i-frames under hard control; does not consume evasion credit. */
function maybeInterruptDodgeFromControl(
    controller: DirectControllerState,
    combatants: Record<string, DirectCombatantSnapshot>,
    receipts: DirectSimReceipt[],
): void {
    if (controller.dodgePhase !== 'iframe' && controller.dodgePhase !== 'recovery') return;
    const actor = combatants[controller.controlledCombatantId];
    if (!actor) return;
    if (canMove(actor.mechanics) && canAct(actor.mechanics)) return;

    controller.heldMoveDirection = null;
    controller.dodgePhase = 'none';
    controller.iframeEndTick = controller.tick;
    if (controller.actionPhase === 'moving') controller.actionPhase = 'idle';
    receipts.push({
        tick: controller.tick,
        kind: 'dodge_interrupted_control',
        detail: 'no_credit_consumed',
    });
}

// ---------------------------------------------------------------------------
// Incoming attacks + evasion credits
// ---------------------------------------------------------------------------

interface IncomingContext {
    atk: IncomingAttackEvent;
    controller: DirectControllerState;
    combatants: Record<string, DirectCombatantSnapshot>;
    abilityById: Map<string, AbilityDefinition>;
    statuses: readonly StatusDefinition[];
    mechanicsReceipts: DirectMechanicsReceiptEvent[];
    directReceipts: DirectSimReceipt[];
    justWindowTicks: number;
    mode: CombatSelectableMode;
}

function resolveIncomingAttack(ctx: IncomingContext): void {
    const { atk, controller, combatants, abilityById, mode } = ctx;
    const target = combatants[atk.targetId];
    const attacker = combatants[atk.attackerId];
    const spell = abilityById.get(atk.abilityId);
    if (!target || !attacker || !spell) return;
    if (!isAlive(target) || !isAlive(attacker)) return;

    // Shared legality gate *before* any credit mutation (same helper as resolver).
    if (!isMechanicsTargetLegal(target.mechanics, spell)) {
        applyMechanicsHit(ctx, attacker, target, spell, 'incoming_hit');
        return;
    }

    const isControlledTarget = atk.targetId === controller.controlledCombatantId;
    // Shared with resolveMechanics (dodgeable:false + area/beam).
    const dodgeable = isAbilityAutoDodgeable(spell);

    // Credit / manual i-frame path is direct_action only.
    const useDirectCreditPath = mode === 'direct_action' && isControlledTarget;

    // Undodgeable: always resolveMechanics; no credit gen/consume.
    if (!dodgeable) {
        applyMechanicsHit(ctx, attacker, target, spell, 'undodgeable_hit');
        return;
    }

    if (useDirectCreditPath) {
        // Match resolveMechanics: only effEvasion > 0 hits advance the shared
        // dodgeable threat counter (incomingHitCount equivalent). Credit consume
        // never decrements the count.
        const eff = effectiveEvasionFor(target.mechanics, attacker.mechanics);
        if (eff > 0) {
            syncThreatCount(controller, target, controller.dodgeableThreatCount + 1);
            if (wouldAutoDodgeOnCount(controller.dodgeableThreatCount, eff)) {
                if (controller.availableEvasionCredits < 1) {
                    controller.availableEvasionCredits = 1;
                    ctx.directReceipts.push({
                        tick: controller.tick,
                        kind: 'evasion_credit_gained',
                        amount: controller.dodgeableThreatCount,
                        detail: `interval=${autoDodgeInterval(eff)}`,
                        attackerId: atk.attackerId,
                        targetId: atk.targetId,
                        abilityId: atk.abilityId,
                    });
                }
            }
        }

        // I-frame window active?
        if (isIframeActive(controller, controller.tick)) {
            if (controller.availableEvasionCredits >= 1) {
                controller.availableEvasionCredits -= 1;
                ctx.directReceipts.push({
                    tick: controller.tick,
                    kind: 'evasion_credit_consumed',
                    amount: 1,
                    attackerId: atk.attackerId,
                    targetId: atk.targetId,
                    abilityId: atk.abilityId,
                });
                ctx.directReceipts.push({
                    tick: controller.tick,
                    kind: 'iframe_avoided',
                    attackerId: atk.attackerId,
                    targetId: atk.targetId,
                    abilityId: atk.abilityId,
                });

                const justStart = atk.tick - ctx.justWindowTicks;
                if (
                    controller.dodgeStartedTick >= justStart
                    && controller.dodgeStartedTick <= atk.tick
                ) {
                    ctx.directReceipts.push({
                        tick: controller.tick,
                        kind: 'perfect_dodge',
                        attackerId: atk.attackerId,
                        targetId: atk.targetId,
                        abilityId: atk.abilityId,
                        detail: 'no_defensive_bonus',
                    });
                }
                // Skip resolveMechanics entirely; threat count already synced above.
                return;
            }

            ctx.directReceipts.push({
                tick: controller.tick,
                kind: 'iframe_no_credit',
                attackerId: atk.attackerId,
                targetId: atk.targetId,
                abilityId: atk.abilityId,
            });
        }
    }

    applyMechanicsHit(ctx, attacker, target, spell, 'incoming_hit');
}

function applyMechanicsHit(
    ctx: IncomingContext,
    attacker: DirectCombatantSnapshot,
    target: DirectCombatantSnapshot,
    spell: AbilityDefinition,
    kind: DirectSimReceiptKind,
): void {
    // Only direct_action suppresses auto evasion on the controlled combatant
    // (credit path owns avoids). command/spectator keep normal mechanics_v1
    // auto evasion — never zero the evasion clone.
    let defender = target.mechanics;
    const suppressAutoEvasion =
        ctx.mode === 'direct_action'
        && target.id === ctx.controller.controlledCombatantId;
    if (suppressAutoEvasion) {
        defender = cloneMechanics(target.mechanics);
        defender.evasion = 0;
    }
    const resolution = resolveMechanics({
        ability: spell,
        attacker: attacker.mechanics,
        target: defender,
        statuses: ctx.statuses,
    });
    if (suppressAutoEvasion) {
        resolution.target.evasion = target.mechanics.evasion;
        // Credit path owns the interval counter — do not let a zero-evasion
        // resolve rewrite or desync it. Credit consume never rolls the count back.
        resolution.target.incomingHitCount = ctx.controller.dodgeableThreatCount;
    } else if (target.id === ctx.controller.controlledCombatantId) {
        // command/spectator auto path: inherit resolver-updated count onto controller
        // so a later direct_action session continues the same interval.
        const next = normalizeIncomingHitCount(resolution.target.incomingHitCount);
        resolution.target.incomingHitCount = next;
        ctx.controller.dodgeableThreatCount = next;
    }
    target.mechanics = resolution.target;

    ctx.directReceipts.push({
        tick: ctx.controller.tick,
        kind,
        amount: resolution.damageDealt,
        attackerId: ctx.atk.attackerId,
        targetId: ctx.atk.targetId,
        abilityId: ctx.atk.abilityId,
        detail: resolution.dodged ? 'resolver_dodged' : undefined,
    });

    for (const receipt of resolution.receipts) {
        ctx.mechanicsReceipts.push({
            tick: ctx.controller.tick,
            actorId: attacker.id,
            targetId: target.id,
            abilityId: spell.id,
            receipt: structuredClone(receipt),
        });
    }

    if (target.id === ctx.controller.controlledCombatantId && target.mechanics.hp <= 0) {
        syncDefeated(ctx.controller, ctx.combatants);
    }
}

/**
 * Exactly one advanceMechanicsState per *living* combatant per tick (end of tick).
 * Defeated (hp <= 0) combatants are skipped so regen cannot revive them.
 *
 * Within the sorted loop, newly dead casters are added to defeatedSet immediately
 * and later combatants receive a fresh defeatedIds snapshot that includes them,
 * so same-tick lethal-timer source death lifts timers without a second pass.
 */
function advanceAllMechanics(
    combatants: Record<string, DirectCombatantSnapshot>,
    deltaSeconds: number,
    statuses: readonly StatusDefinition[],
    mechanicsReceipts: DirectMechanicsReceiptEvent[],
    tick: number,
    controller: DirectControllerState,
): void {
    const defeatedSet = new Set(
        Object.values(combatants)
            .filter(c => c.mechanics.hp <= 0)
            .map(c => c.id),
    );
    const ids = Object.keys(combatants).sort();
    for (const id of ids) {
        const snap = combatants[id];
        // Skip already-defeated: no regen revive, no timer progress as living.
        if (defeatedSet.has(id) || snap.mechanics.hp <= 0) {
            if (snap.mechanics.hp < 0) snap.mechanics.hp = 0;
            continue;
        }
        // Rebuild defeated list each iteration so earlier deaths in this tick
        // propagate to later targets (deterministic sort order).
        const defeatedIds = [...defeatedSet].sort();
        const receipts: MechanicsReceipt[] = [];
        snap.mechanics = advanceMechanicsState(snap.mechanics, deltaSeconds, {
            statuses,
            receipts,
            defeatedIds,
        });
        for (const receipt of receipts) {
            mechanicsReceipts.push({
                tick,
                actorId: id,
                targetId: id,
                abilityId: '_tick_advance',
                receipt: structuredClone(receipt),
            });
        }
        // Newly dead this advance → available to later IDs in the same tick.
        if (snap.mechanics.hp <= 0) {
            snap.mechanics.hp = 0;
            defeatedSet.add(id);
        }
    }
    syncDefeated(controller, combatants);
}

// ---------------------------------------------------------------------------
// Phase machines
// ---------------------------------------------------------------------------

interface PhaseContext {
    controller: DirectControllerState;
    combatants: Record<string, DirectCombatantSnapshot>;
    ability: AbilityDefinition;
    phaseTicks: DirectPhaseTicks;
    cooldownTicks: number;
    committedActions: DirectCommittedAction[];
    mechanicsReceipts: DirectMechanicsReceiptEvent[];
    directReceipts?: DirectSimReceipt[];
    statuses: readonly StatusDefinition[];
    inputSeq: number;
}

function interruptAttack(ctx: PhaseContext, detail: string): void {
    const { controller } = ctx;
    controller.actionPhase = 'idle';
    controller.currentAbilityId = null;
    controller.currentTargetId = null;
    controller.attackCommitted = false;
    controller.phaseStartedTick = controller.tick;
    controller.phaseEndsTick = controller.tick;
    if (ctx.directReceipts) {
        ctx.directReceipts.push({
            tick: controller.tick,
            kind: 'action_interrupted',
            detail,
        });
    }
    enterIdleOrMoving(controller);
}

function advanceActionPhase(ctx: PhaseContext): void {
    const { controller, combatants } = ctx;
    if (
        controller.actionPhase === 'defeated'
        || controller.actionPhase === 'idle'
        || controller.actionPhase === 'moving'
    ) {
        return;
    }

    const actor = combatants[controller.controlledCombatantId];
    // Windup interrupted by hard control — no damage commit.
    if (controller.actionPhase === 'windup' && actor && !canAct(actor.mechanics)) {
        interruptAttack(ctx, 'hard_control_windup');
        return;
    }

    if (controller.tick < controller.phaseEndsTick) {
        return;
    }

    if (controller.actionPhase === 'windup') {
        enterActivePhase(ctx);
        return;
    }
    if (controller.actionPhase === 'active') {
        enterRecoveryPhase(ctx);
        return;
    }
    if (controller.actionPhase === 'recovery') {
        enterIdleOrMoving(ctx.controller);
    }
}

function enterActivePhase(ctx: PhaseContext): void {
    const { controller, phaseTicks, combatants } = ctx;
    const actor = combatants[controller.controlledCombatantId];
    // Re-check canAct immediately before commit.
    if (actor && !canAct(actor.mechanics)) {
        interruptAttack(ctx, 'hard_control_active');
        return;
    }

    controller.actionPhase = 'active';
    controller.phaseStartedTick = controller.tick;
    controller.phaseEndsTick = controller.tick + Math.max(1, phaseTicks.activeTicks);

    if (!controller.attackCommitted) {
        commitLightAttack(ctx);
        controller.attackCommitted = true;
    }
}

function enterRecoveryPhase(ctx: PhaseContext): void {
    const { controller, phaseTicks } = ctx;
    controller.actionPhase = 'recovery';
    controller.phaseStartedTick = controller.tick;
    controller.phaseEndsTick = controller.tick + Math.max(0, phaseTicks.recoveryTicks);
    if (phaseTicks.recoveryTicks <= 0) {
        enterIdleOrMoving(controller);
    }
}

function enterIdleOrMoving(controller: DirectControllerState): void {
    controller.currentAbilityId = null;
    controller.currentTargetId = null;
    controller.attackCommitted = false;
    controller.phaseStartedTick = controller.tick;
    controller.phaseEndsTick = controller.tick;
    if (
        controller.dodgePhase === 'none'
        && controller.heldMoveDirection
        && (controller.heldMoveDirection.x !== 0 || controller.heldMoveDirection.y !== 0)
    ) {
        controller.actionPhase = 'moving';
    } else {
        controller.actionPhase = 'idle';
    }
}

function commitLightAttack(ctx: PhaseContext): void {
    const { controller, combatants, ability, cooldownTicks, statuses } = ctx;
    const actor = combatants[controller.controlledCombatantId];
    const targetId = controller.currentTargetId;
    if (!actor || !targetId) return;
    const target = combatants[targetId];
    if (!target || !isAlive(actor) || !isAlive(target)) return;

    const resolution = resolveMechanics({
        ability,
        attacker: actor.mechanics,
        target: target.mechanics,
        statuses,
    });

    target.mechanics = resolution.target;
    actor.cooldownReadyTick = controller.tick + cooldownTicks;

    ctx.committedActions.push({
        tick: controller.tick,
        seq: ctx.inputSeq,
        kind: 'light_attack',
        actorId: actor.id,
        targetId,
        abilityId: ability.id,
        damageDealt: resolution.damageDealt,
        dodged: resolution.dodged,
    });

    for (const receipt of resolution.receipts) {
        ctx.mechanicsReceipts.push({
            tick: controller.tick,
            actorId: actor.id,
            targetId,
            abilityId: ability.id,
            receipt: structuredClone(receipt),
        });
    }
}

/**
 * Advance dodge phases at the start of `tick`.
 * I-frames are active for ticks in [iframeStartTick, iframeEndTick).
 * After iframe expires, optional recovery reuses iframeEndTick as exclusive end.
 */
function advanceDodgePhase(
    controller: DirectControllerState,
    tick: number,
    dodgeRecoveryTicks: number,
): void {
    if (controller.dodgePhase === 'iframe' && tick >= controller.iframeEndTick) {
        if (dodgeRecoveryTicks > 0) {
            controller.dodgePhase = 'recovery';
            controller.iframeEndTick = tick + dodgeRecoveryTicks;
        } else {
            controller.dodgePhase = 'none';
        }
        return;
    }
    if (controller.dodgePhase === 'recovery' && tick >= controller.iframeEndTick) {
        controller.dodgePhase = 'none';
    }
}

// ---------------------------------------------------------------------------
// Movement
// ---------------------------------------------------------------------------

function integrateMovement(
    controller: DirectControllerState,
    combatants: Record<string, DirectCombatantSnapshot>,
    moveSpeed: number,
    tickRate: number,
    directReceipts?: DirectSimReceipt[],
): void {
    if (controller.actionPhase === 'defeated') return;
    if (controller.dodgePhase !== 'none') return;
    if (controller.actionPhase !== 'idle' && controller.actionPhase !== 'moving') return;

    const actor = combatants[controller.controlledCombatantId];
    // Held move stops when the combatant becomes unable to move (shared canMove).
    if (actor && !canMove(actor.mechanics)) {
        if (controller.heldMoveDirection) {
            controller.heldMoveDirection = null;
            if (controller.actionPhase === 'moving') controller.actionPhase = 'idle';
            if (directReceipts) {
                directReceipts.push({
                    tick: controller.tick,
                    kind: 'move_stopped_control',
                });
            }
        }
        return;
    }

    const held = controller.heldMoveDirection;
    if (!held || (held.x === 0 && held.y === 0)) {
        if (controller.actionPhase === 'moving') controller.actionPhase = 'idle';
        return;
    }

    const len = Math.hypot(held.x, held.y);
    if (!(len > 0)) return;
    const step = moveSpeed / tickRate;
    const nx = held.x / len;
    const ny = held.y / len;
    const next = quantizePosition(
        controller.position.x + nx * step,
        controller.position.y + ny * step,
    );
    controller.position = next;
    controller.facing = { x: held.x, y: held.y };
    controller.actionPhase = 'moving';

    if (actor) actor.position = { ...next };
}

function syncControlledPosition(
    controller: DirectControllerState,
    combatants: Record<string, DirectCombatantSnapshot>,
): void {
    const actor = combatants[controller.controlledCombatantId];
    if (actor) {
        actor.position = { ...controller.position };
    }
}

function syncDefeated(
    controller: DirectControllerState,
    combatants: Record<string, DirectCombatantSnapshot>,
): void {
    const actor = combatants[controller.controlledCombatantId];
    if (!actor || actor.mechanics.hp <= 0) {
        controller.actionPhase = 'defeated';
        controller.heldMoveDirection = null;
        controller.currentAbilityId = null;
        controller.currentTargetId = null;
        controller.attackCommitted = false;
        controller.dodgePhase = 'none';
    }
}

// ---------------------------------------------------------------------------
// Output / serialization
// ---------------------------------------------------------------------------

function buildResult(parts: {
    controller: DirectControllerState;
    combatants: Record<string, DirectCombatantSnapshot>;
    committedActions: DirectCommittedAction[];
    mechanicsReceipts: DirectMechanicsReceiptEvent[];
    directReceipts: DirectSimReceipt[];
    rejectedInputs: DirectRejectedInput[];
    inputLog: DirectInputLog;
}): DirectHeadlessResult {
    const combatantsJson: Record<string, DirectCombatantSnapshot> = {};
    const ids = Object.keys(parts.combatants).sort();
    for (const id of ids) {
        const c = parts.combatants[id];
        combatantsJson[id] = {
            id: c.id,
            team: c.team,
            position: { x: c.position.x, y: c.position.y },
            cooldownReadyTick: c.cooldownReadyTick,
            mechanics: structuredClone(c.mechanics),
        };
    }

    const finalDirectState: DirectControllerState = {
        controlledCombatantId: parts.controller.controlledCombatantId,
        tick: parts.controller.tick,
        position: { ...parts.controller.position },
        facing: { ...parts.controller.facing },
        heldMoveDirection: parts.controller.heldMoveDirection
            ? { x: parts.controller.heldMoveDirection.x, y: parts.controller.heldMoveDirection.y }
            : null,
        actionPhase: parts.controller.actionPhase,
        currentAbilityId: parts.controller.currentAbilityId,
        currentTargetId: parts.controller.currentTargetId,
        phaseStartedTick: parts.controller.phaseStartedTick,
        phaseEndsTick: parts.controller.phaseEndsTick,
        attackCommitted: parts.controller.attackCommitted,
        staminaMilli: parts.controller.staminaMilli,
        dodgePhase: parts.controller.dodgePhase,
        dodgeStartedTick: parts.controller.dodgeStartedTick,
        iframeStartTick: parts.controller.iframeStartTick,
        iframeEndTick: parts.controller.iframeEndTick,
        lastDodgeTick: parts.controller.lastDodgeTick,
        consecutiveDodgeCount: parts.controller.consecutiveDodgeCount,
        dodgeableThreatCount: parts.controller.dodgeableThreatCount,
        availableEvasionCredits: parts.controller.availableEvasionCredits,
    };

    const payload = {
        finalDirectState,
        combatants: combatantsJson,
        committedActions: parts.committedActions.map(a => ({ ...a })),
        mechanicsReceipts: parts.mechanicsReceipts.map(r => ({
            tick: r.tick,
            actorId: r.actorId,
            targetId: r.targetId,
            abilityId: r.abilityId,
            receipt: structuredClone(r.receipt),
        })),
        directReceipts: parts.directReceipts.map(r => ({ ...r })),
        rejectedInputs: parts.rejectedInputs.map(r => ({ ...r })),
        // Embedded log must round-trip through normalizeDirectInputLog (tickRate required).
        inputLog: {
            schemaVersion: parts.inputLog.schemaVersion,
            tickRate: parts.inputLog.tickRate,
            events: parts.inputLog.events.map(e => ({
                tick: e.tick,
                seq: e.seq,
                actorId: e.actorId,
                action: e.action,
                ...(e.phase !== undefined ? { phase: e.phase } : {}),
                ...(e.direction !== undefined ? { direction: { x: e.direction.x, y: e.direction.y } } : {}),
                ...(e.targetId !== undefined ? { targetId: e.targetId } : {}),
                ...(e.abilityId !== undefined ? { abilityId: e.abilityId } : {}),
                ...(e.order !== undefined ? { order: e.order } : {}),
                ...(e.requestedMode !== undefined ? { requestedMode: e.requestedMode } : {}),
            })),
        },
    };

    const outputBytes = stableDirectOutputBytes(payload);
    const replayHash = createHash('sha256').update(outputBytes).digest('hex');
    const inputLogBytes = serializeDirectInputLog(parts.inputLog);

    return {
        finalDirectState,
        combatants: combatantsJson,
        committedActions: payload.committedActions,
        mechanicsReceipts: payload.mechanicsReceipts,
        directReceipts: payload.directReceipts,
        rejectedInputs: payload.rejectedInputs,
        inputLog: parts.inputLog,
        inputLogBytes,
        outputBytes,
        replayHash,
    };
}

/**
 * Stable JSON bytes for a headless result payload (used for replayHash).
 * Ensures embedded inputLog retains schemaVersion + tickRate + events.
 */
export function stableDirectOutputBytes(payload: unknown): string {
    return JSON.stringify(JSON.parse(JSON.stringify(payload)));
}

/**
 * Empty-log identity: no committed actions, combatant mechanics/positions match
 * seeds (no direct mutations). Full stamina start so regen is a no-op.
 */
export function emptyDirectLogIsIdentity(
    seeds: readonly DirectCombatantSeed[],
    controlledCombatantId: string,
    ability: AbilityDefinition,
): boolean {
    const run = runDirectHeadlessMoveAttack({
        controlledCombatantId,
        combatants: seeds,
        normalAttackAbility: ability,
        durationTicks: 30,
        tickRate: DIRECT_V1_TICK_RATE,
        directInput: emptyDirectInputLog(DIRECT_V1_TICK_RATE),
        incomingAttacks: [],
    });
    if (!run.ok) return false;
    if (run.result.committedActions.length !== 0) return false;
    if (run.result.mechanicsReceipts.length !== 0) return false;
    if (run.result.rejectedInputs.length !== 0) return false;
    // stamina_regenerated may appear only if not full; seeds start full.

    for (const seed of seeds) {
        const after = run.result.combatants[seed.id];
        if (!after) return false;
        if (after.mechanics.hp !== seed.mechanics.hp) return false;
        if (after.position.x !== quantizePosition(seed.position.x, seed.position.y).x) return false;
        if (after.position.y !== quantizePosition(seed.position.x, seed.position.y).y) return false;
    }
    return true;
}

/** Re-export for tests that need the scalar helper. */
export { quantizeScalar };
