/**
 * Headless direct-control state machine (move + light_attack only).
 *
 * Pure TypeScript: no VS Code API, DOM, wall clock, draw FPS, Math.random(),
 * runtime class instances, or callbacks stored in state. All state is JSON-safe.
 *
 * Active-frame damage always goes through existing resolveMechanics — never a
 * bespoke HP writer. Fan-out / AoE multi-target is intentionally out of scope.
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
    MechanicsCombatant,
    MechanicsReceipt,
    resolveMechanics,
} from './combatMechanicsResolver';

// ---------------------------------------------------------------------------
// V1 constants (not authored on abilities/resources)
// ---------------------------------------------------------------------------

/** Simulation ticks per second for ms→tick conversion and movement integration. */
export const DIRECT_V1_TICK_RATE = 30;

/** Units of travel per second while a move direction is held. */
export const DIRECT_V1_MOVE_SPEED = 100;

/** Position / facing quantum — same 1/1000 grid as input direction. */
export const DIRECT_POSITION_QUANTUM = 1000;

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
    | 'invalid_phase'
    | 'missing_target'
    | 'invalid_target'
    | 'target_defeated'
    | 'cooldown'
    | 'unsupported_action'
    | 'missing_direction'
    | 'missing_ability';

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

export interface DirectPhaseTicks {
    windupTicks: number;
    activeTicks: number;
    recoveryTicks: number;
}

export interface DirectHeadlessInput {
    controlledCombatantId: string;
    combatants: readonly DirectCombatantSeed[];
    /** Loadout normal-attack ability. Required for light_attack. */
    normalAttackAbility: AbilityDefinition;
    statuses?: readonly StatusDefinition[];
    tickRate?: number;
    /** Inclusive simulation length: ticks 0 .. durationTicks-1 are processed. */
    durationTicks: number;
    directInput?: unknown;
    moveSpeed?: number;
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
    rejectedInputs: DirectRejectedInput[];
    inputLog: DirectInputLog;
    inputLogBytes: string;
    /** Stable full-result JSON (key-ordered) for byte-identical replay checks. */
    outputBytes: string;
    /** SHA-256 of outputBytes. */
    replayHash: string;
}

export type DirectHeadlessRunResult =
    | { ok: true; result: DirectHeadlessResult }
    | { ok: false; error: string; detail?: string };

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

    const tickRate = input.tickRate && input.tickRate > 0 ? input.tickRate : DIRECT_V1_TICK_RATE;
    const moveSpeed = input.moveSpeed && input.moveSpeed > 0 ? input.moveSpeed : DIRECT_V1_MOVE_SPEED;
    const statuses = input.statuses || [];
    const ability = input.normalAttackAbility;
    const phaseTicks = deriveDirectPhaseTicks(ability, tickRate);
    const cooldownTicks = abilityCooldownTicks(ability, tickRate);

    const logResult = normalizeDirectInputLog(
        input.directInput === undefined ? emptyDirectInputLog() : input.directInput,
    );
    if (!logResult.ok) {
        return { ok: false, error: 'INVALID_DIRECT_INPUT', detail: logResult.error };
    }
    const inputLog = logResult.log;

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
    };

    const committedActions: DirectCommittedAction[] = [];
    const mechanicsReceipts: DirectMechanicsReceiptEvent[] = [];
    const rejectedInputs: DirectRejectedInput[] = [];

    // Index events by tick for O(1) retrieval (already sorted by normalize).
    const eventsByTick = new Map<number, DirectInputEvent[]>();
    for (const event of inputLog.events) {
        const list = eventsByTick.get(event.tick) || [];
        list.push(event);
        eventsByTick.set(event.tick, list);
    }

    const maxTick = input.durationTicks;
    for (let tick = 0; tick < maxTick; tick++) {
        controller.tick = tick;
        syncDefeated(controller, combatants);

        // 1) Consume inputs for this tick in seq order.
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
                statuses,
            });
        }

        // 2) Advance action phases (may commit attack on active entry).
        advanceActionPhase({
            controller,
            combatants,
            ability,
            phaseTicks,
            cooldownTicks,
            committedActions,
            mechanicsReceipts,
            statuses,
            inputSeq: -1,
        });

        // 3) Integrate movement for this tick.
        integrateMovement(controller, combatants, moveSpeed, tickRate);
        syncControlledPosition(controller, combatants);
    }

    // Final tick stamp is durationTicks (post-loop), matching "ended after N ticks".
    controller.tick = maxTick;
    syncDefeated(controller, combatants);
    syncControlledPosition(controller, combatants);

    const result = buildResult({
        controller,
        combatants,
        committedActions,
        mechanicsReceipts,
        rejectedInputs,
        inputLog,
    });
    return { ok: true, result };
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
    statuses: readonly StatusDefinition[];
}

function reject(ctx: ApplyContext, reason: DirectInputRejectReason): void {
    ctx.rejectedInputs.push({
        tick: ctx.event.tick,
        seq: ctx.event.seq,
        action: ctx.event.action,
        reason,
    });
}

function applyInputEvent(ctx: ApplyContext): void {
    const { event, controller } = ctx;
    const actor = ctx.combatants[controller.controlledCombatantId];

    if (event.action === 'move') {
        applyMove(ctx, actor);
        return;
    }
    if (event.action === 'light_attack') {
        applyLightAttack(ctx, actor);
        return;
    }
    // All other semantic actions are out of scope for this task.
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
        if (controller.actionPhase === 'moving') {
            controller.actionPhase = 'idle';
        }
        return;
    }

    // press
    if (!event.direction) {
        reject(ctx, 'missing_direction');
        return;
    }
    const held = normalizeAndQuantizeDirection(event.direction.x, event.direction.y);
    controller.heldMoveDirection = held;
    if (held.x !== 0 || held.y !== 0) {
        controller.facing = { x: held.x, y: held.y };
    }
    if (controller.actionPhase === 'idle') {
        controller.actionPhase = 'moving';
    }
}

function applyLightAttack(ctx: ApplyContext, actor: DirectCombatantSnapshot | undefined): void {
    const { event, controller, ability, phaseTicks, cooldownTicks } = ctx;

    // light_attack is press-to-start; release is ignored (not a held action).
    if (event.phase === 'release') {
        return;
    }

    if (!actor || !isAlive(actor) || controller.actionPhase === 'defeated') {
        reject(ctx, 'actor_defeated');
        return;
    }
    if (controller.actionPhase !== 'idle' && controller.actionPhase !== 'moving') {
        reject(ctx, 'invalid_phase');
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

    // Begin attack state machine.
    controller.currentAbilityId = ability.id;
    controller.currentTargetId = event.targetId;
    controller.attackCommitted = false;
    controller.phaseStartedTick = controller.tick;

    if (phaseTicks.windupTicks <= 0) {
        // Immediate active: commit on this tick.
        enterActivePhase({
            controller: ctx.controller,
            combatants: ctx.combatants,
            ability: ctx.ability,
            phaseTicks: ctx.phaseTicks,
            cooldownTicks: ctx.cooldownTicks,
            committedActions: ctx.committedActions,
            mechanicsReceipts: ctx.mechanicsReceipts,
            statuses: ctx.statuses,
            inputSeq: event.seq,
        });
    } else {
        controller.actionPhase = 'windup';
        controller.phaseEndsTick = controller.tick + phaseTicks.windupTicks;
    }
}

// ---------------------------------------------------------------------------
// Phase machine
// ---------------------------------------------------------------------------

interface PhaseContext {
    controller: DirectControllerState;
    combatants: Record<string, DirectCombatantSnapshot>;
    ability: AbilityDefinition;
    phaseTicks: DirectPhaseTicks;
    cooldownTicks: number;
    committedActions: DirectCommittedAction[];
    mechanicsReceipts: DirectMechanicsReceiptEvent[];
    statuses: readonly StatusDefinition[];
    inputSeq: number;
}

function advanceActionPhase(ctx: PhaseContext): void {
    const { controller, phaseTicks } = ctx;
    if (controller.actionPhase === 'defeated' || controller.actionPhase === 'idle' || controller.actionPhase === 'moving') {
        return;
    }

    // Stay in phase until phaseEndsTick (exclusive end: transition when tick >= ends).
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
    const { controller, phaseTicks } = ctx;
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
    if (controller.heldMoveDirection && (controller.heldMoveDirection.x !== 0 || controller.heldMoveDirection.y !== 0)) {
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

    // Single primary target only — no fan-out in this task.
    const resolution = resolveMechanics({
        ability,
        attacker: actor.mechanics,
        target: target.mechanics,
        statuses,
        // single-target delivery defaults (falloff/engagement = 1)
    });

    target.mechanics = resolution.target;
    // Shared cooldown with ability auto.cooldown.
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

// ---------------------------------------------------------------------------
// Movement
// ---------------------------------------------------------------------------

function integrateMovement(
    controller: DirectControllerState,
    combatants: Record<string, DirectCombatantSnapshot>,
    moveSpeed: number,
    tickRate: number,
): void {
    if (controller.actionPhase === 'defeated') return;
    if (controller.actionPhase !== 'idle' && controller.actionPhase !== 'moving') return;

    const held = controller.heldMoveDirection;
    if (!held || (held.x === 0 && held.y === 0)) {
        if (controller.actionPhase === 'moving') controller.actionPhase = 'idle';
        return;
    }

    // Force unit length each tick so diagonal speed never exceeds cardinal.
    // Held is already quantized; re-normalize in float space for travel only.
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
    // Facing stays on the quantized held vector (no second re-quantize).
    controller.facing = { x: held.x, y: held.y };
    controller.actionPhase = 'moving';

    const actor = combatants[controller.controlledCombatantId];
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
        rejectedInputs: parts.rejectedInputs.map(r => ({ ...r })),
        inputLog: {
            schemaVersion: parts.inputLog.schemaVersion,
            events: parts.inputLog.events.map(e => ({ ...e, direction: e.direction ? { ...e.direction } : undefined })),
        },
    };

    // Strip undefined for stable JSON (JSON.stringify drops undefined object values,
    // but rebuild events without undefined keys for exact byte control).
    const stable = JSON.parse(JSON.stringify(payload));
    const outputBytes = JSON.stringify(stable);
    const replayHash = createHash('sha256').update(outputBytes).digest('hex');
    const inputLogBytes = serializeDirectInputLog(parts.inputLog);

    return {
        finalDirectState,
        combatants: combatantsJson,
        committedActions: payload.committedActions,
        mechanicsReceipts: payload.mechanicsReceipts,
        rejectedInputs: payload.rejectedInputs,
        inputLog: parts.inputLog,
        inputLogBytes,
        outputBytes,
        replayHash,
    };
}

/**
 * Empty-log identity: no committed actions, combatant mechanics/positions match
 * a zero-duration-equivalent snapshot of the seeds (no direct mutations).
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
        directInput: emptyDirectInputLog(),
    });
    if (!run.ok) return false;
    if (run.result.committedActions.length !== 0) return false;
    if (run.result.mechanicsReceipts.length !== 0) return false;
    if (run.result.rejectedInputs.length !== 0) return false;

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
