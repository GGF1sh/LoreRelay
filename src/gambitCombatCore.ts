import { AbilityDefinition, StatusDefinition } from './combatAbilityTypes';
import { advanceMechanicsState, canAct, canMove, ENGAGEMENT_OVERFLOW_MULTIPLIER, engagementSlotsFor, falloffAtIndex, MechanicsCombatant, MechanicsReceipt, resolveMechanics } from './combatMechanicsResolver';
import { CombatSelectableMode, combatModeAllowsTacticalOrder, isCombatSelectableMode } from './combatModeContract';
import {
    CommandInputEvent, CommandInputLog, CommandPoint, RtsCommand,
    emptyCommandInputLog, normalizeCommandInputLog,
} from './combatRtsCommandInputCore';

export type CombatMode = 'legacy_gambit' | 'mechanics_v1';

export interface CombatVector2 {
    x: number;
    y: number;
}

export interface CombatUnitState {
    name: string;
    role: string;
    team: number; // 0 for ally, 1 for enemy
    max_hp: number;
    hp: number;
    attack: number;
    defense: number;
    heal_power: number;
    move_speed: number;
    attack_range: number;
    attack_cooldown: number;
    radius: number;
    pos_x: number;
    pos_y: number;
    gambits?: any[];
    normalAttackAbility?: AbilityDefinition;
    healAbility?: AbilityDefinition;
    mechanics?: MechanicsCombatant;

    // internal state
    _cooldown_timer: number;
    _dead: boolean;
    _last_action: string;
}

export interface BattleSpec {
    activePreset: string;
    deltaSeconds: number;
    /**
     * Overrides deltaSeconds for `delta` when truthy (1/fixedFps). Already read
     * informally before COMBAT-RTS-TICK-RATE-AND-ZERO-TICK-FIXED-001; declared
     * formally now so effectiveBattleTickRate can share its exact basis without
     * a cast. This does not change createCombatStepContext's existing delta
     * computation, which still keys off truthiness, not integer-ness.
     */
    fixedFps?: number;
    viewport: { width: number; height: number };
    participantOrder: string[];
    initialState: {
        units: {
            allies: any[];
            enemies: any[];
        };
    };
    combatMode?: CombatMode;
    mechanics?: { statuses: StatusDefinition[] };
    /**
     * Raw RTS command log, pre-normalization — see combatRtsCommandInputCore.
     *
     * Normalized once by createCombatStepContext (COMBAT-RTS-ORDER-SLOT-STOP-
     * RESUME-001, PR3 of docs/COMBAT_RTS_COMMAND_SPINE_DESIGN.md). Absent, or
     * present but failing normalizeCommandInputLog, both collapse to an empty
     * log — resolveCombat's signature has no channel to report a malformed
     * log, and an absent/empty log must behave exactly like today's fully
     * automatic battle either way.
     */
    command?: unknown;
    /**
     * Gates RTS command acceptance (see combatModeContract). Defaults to
     * 'command' when absent or unrecognized — existing callers never set this
     * and never populate `command` either, so the default has no observable
     * effect on them. `direct_action` (companion-unit commands) and
     * `spectator` (all commands rejected) are also valid.
     */
    selectableMode?: CombatSelectableMode;
}

export interface CombatEvent {
    tick: number;
    unit?: string;
    team?: number;
    [key: string]: any;
}

export interface CombatExpectedOutput {
    evaluations: CombatEvent[];
    decisions: CombatEvent[];
    attacks: CombatEvent[];
    heals: CombatEvent[];
    deaths: CombatEvent[];
    focusChanges: CombatEvent[];
    mechanicsReceipts?: Array<CombatEvent & { receipt: MechanicsReceipt }>;
    /**
     * Present only when spec.command normalized to a non-empty log — omitted
     * entirely otherwise, which is what keeps the golden master byte-identical
     * for every battle that never issues a command.
     */
    commandReceipts?: CommandReceipt[];
    finalState: {
        units: { name: string; hp: number; pos_x: number; pos_y: number }[];
    };
    outcome: string;
}

/**
 * A unit's currently active RTS order. Null/absent means gambits control the
 * unit. See docs/COMBAT_RTS_COMMAND_SPINE_DESIGN.md §3.
 *
 * `move_to` / `attack_target` / `attack_move` are accepted and installed here
 * exactly like `stop`, which is what suppresses gambit evaluation for that
 * unit; their movement/attack execution (arrival, engagement, completion) is
 * implemented in `stepCombat`'s RTS order execution block (PR4 for move_to /
 * attack_target, PR5 for attack_move). `stop` alone still just idles — it is
 * the only one of the four with no execution of its own.
 */
export interface ActiveOrder {
    command: RtsCommand;
    point?: CommandPoint;
    targetId?: string;
    /** Tick the order was accepted on. */
    issuedTick: number;
    /** attack_move only: true while an in-range enemy is selected for combat and movement is paused; false while resuming/moving. */
    engaging?: boolean;
}

export type CommandReceiptKind =
    | 'order_accepted' | 'order_rejected' | 'order_started'
    | 'order_completed' | 'order_superseded' | 'order_interrupted' | 'order_timeout';

/**
 * `unit_not_found` / `unit_dead` / `not_your_team` / `mode_forbids_command`
 * come from command acceptance (PR3). `invalid_target` / `target_not_found` /
 * `target_defeated` come from attack_target execution (PR4). `invalid_point`
 * and `unknown_command` are declared for schema-level rejection but are not
 * yet produced by any execution path.
 */
export type CommandRejectReason =
    | 'unit_not_found' | 'unit_dead' | 'not_your_team' | 'mode_forbids_command'
    | 'invalid_target' | 'target_not_found' | 'target_defeated'
    | 'invalid_point' | 'unknown_command';

export interface CommandReceipt {
    tick: number;
    unitId: string;
    command: RtsCommand;
    kind: CommandReceiptKind;
    reason?: CommandRejectReason;
    detail?: string;
}

const DEFAULT_GAMBITS: Record<string, any[]> = {
    "Shooter": [
        { "cond": "self_hp_below", "param": 0.3, "action": "flee_to_healer", "factor": 1.3 },
        { "cond": "enemy_too_close", "param": 130.0, "action": "retreat_to_safe", "factor": 1.2 },
        { "cond": "enemy_in_range", "action": "focus_fire" },
        { "cond": "nearest_enemy_exists", "action": "move_to_nearest_enemy" },
    ],
    "Medic": [
        { "cond": "enemy_too_close", "param": 110.0, "action": "retreat_to_safe", "factor": 1.3 },
        { "cond": "self_hp_below", "param": 0.6, "action": "heal_self" },
        { "cond": "ally_hp_below", "param": 0.7, "action": "heal_lowest_hp_ally" },
        { "cond": "enemy_in_range", "action": "attack_nearest" },
        { "cond": "nearest_enemy_exists", "action": "move_to_nearest_enemy" },
    ],
    "Support": [
        { "cond": "self_hp_below", "param": 0.3, "action": "flee_to_healer" },
        { "cond": "enemy_in_range", "action": "focus_fire" },
        { "cond": "nearest_enemy_exists", "action": "move_to_nearest_enemy" },
    ],
    "Scout": [
        { "cond": "self_hp_below", "param": 0.3, "action": "retreat_to_safe" },
        { "cond": "enemy_in_range", "action": "attack_weakest" },
        { "cond": "nearest_enemy_exists", "action": "move_to_nearest_enemy" },
    ],
    "Frontline": [
        { "cond": "backline_threatened", "param": 150.0, "action": "protect_ally" },
        { "cond": "enemy_in_range", "action": "attack_nearest" },
        { "cond": "nearest_enemy_exists", "action": "move_to_nearest_enemy" },
    ]
};

function getGambits(role: string): any[] {
    return DEFAULT_GAMBITS[role] || [
        { "cond": "enemy_in_range", "action": "attack_nearest" },
        { "cond": "nearest_enemy_exists", "action": "move_to_nearest_enemy" }
    ];
}

const f = Math.fround;
const dist = (u1: any, u2: any) => {
    const dx = f(u2.pos_x - u1.pos_x);
    const dy = f(u2.pos_y - u1.pos_y);
    return f(Math.sqrt(f(f(dx * dx) + f(dy * dy))));
};

// ---------------------------------------------------------------------------
// Deterministic combat state machine
//
// `resolveCombat` used to hold every piece of tick state in closures, so a
// battle could only be run start-to-finish with no way to observe or influence
// it mid-run. The tick body was lifted verbatim into `stepCombat`; the loop now
// lives in `resolveCombat`. Behaviour is unchanged — the Godot golden master
// fixtures are the proof, since they compare every emitted event and every final
// position.
//
// Nothing here reads a clock, a random source, the DOM or the filesystem, so a
// battle is a pure function of its inputs. Player commands are deliberately NOT
// part of this change; see docs/COMBAT_RTS_COMMAND_SPINE_DESIGN.md for the spine
// this extraction unblocks.
// ---------------------------------------------------------------------------

export const COMBAT_TIMEOUT_TICKS = 3600;

/** Events emitted by one tick. Accumulated by the caller; never stored in state. */
export interface CombatStepEvents {
    evaluations: CombatEvent[];
    decisions: CombatEvent[];
    attacks: CombatEvent[];
    heals: CombatEvent[];
    deaths: CombatEvent[];
    focusChanges: CombatEvent[];
    /** Only populated in `mechanics_v1`, matching the existing output contract. */
    mechanicsReceipts: Array<CombatEvent & { receipt: MechanicsReceipt }>;
    /** Always present (possibly empty) at the per-tick level; see CombatExpectedOutput.commandReceipts for the omit-when-empty rule at the whole-battle level. */
    commandReceipts: CommandReceipt[];
}

/**
 * Everything that survives a tick boundary. JSON-safe and self-contained, so a
 * battle can be paused, serialized and resumed without re-deriving it from the spec.
 */
export interface CombatState {
    tick: number;
    /** Empty string while the battle is still running. */
    outcome: string;
    units: Record<string, CombatUnitState>;
    /** Populated only in `mechanics_v1`. */
    mechanicsStates: Record<string, MechanicsCombatant>;
    /** Last `cond|action` signature per unit. Drives `evaluations` de-duplication. */
    lastEvals: Record<string, string>;
    /** Current focus target per team. Drives `focusChanges`. */
    focusTarget: Record<number, string>;
    /** Per-unit active RTS order. Absent or null = gambits control the unit. */
    orders: Record<string, ActiveOrder | null>;
    /** Index into ctx.commandLog.events of the next command not yet applied. */
    commandCursor: number;
}

/** Immutable per-battle configuration derived from the spec. Never mutated. */
export interface CombatStepContext {
    /** Read-only. Only `mechanics.statuses` is consulted during a tick. */
    spec: BattleSpec;
    participantOrder: string[];
    delta: number;
    combatMode: CombatMode;
    battleRect: { x: number; y: number; w: number; h: number };
    timeoutTicks: number;
    /**
     * Normalized once from spec.command (see BattleSpec.command's doc comment
     * for the absent/invalid → empty fallback). Never mutated; the per-tick
     * cursor into it lives on CombatState instead, since it changes every step.
     */
    commandLog: CommandInputLog;
    /** Gates RTS command acceptance. Defaults to 'command' — see BattleSpec.selectableMode. */
    selectableMode: CombatSelectableMode;
}

function isPositiveIntegerNumber(value: unknown): value is number {
    return typeof value === 'number' && Number.isFinite(value) && Number.isInteger(value) && value > 0;
}

/**
 * Relative tolerance for reconciling deltaSeconds against its rounded integer
 * reciprocal.
 *
 * A truncated literal like the golden-master fixtures' 60fps delta
 * (0.0166666667, not the full repeating decimal) round-trips through
 * `1 / Math.round(1 / delta)` with a relative error around 2e-9 — comfortably
 * inside this bound.
 *
 * Tightened from an earlier 1e-6 after review: a deliberately different rate
 * that happens to land close to an integer — e.g. 1/60.00005 (relative error
 * from exact 1/60 is ~8.33e-7) — passed a 1e-6 check, so a battle whose real
 * rate was 60.00005fps could still match a command log declaring tickRate 60.
 * 1e-7 keeps the fixture literal's ~2e-9 error comfortably inside (50x margin)
 * while rejecting that specific near-miss (~8x margin) and anything looser.
 *
 * This bound alone cannot perfectly distinguish "a truncated literal of
 * exactly N" from "a deliberately different rate that happens to be numerically
 * close to N" — no finite epsilon can, since both are just numbers near
 * 1/N. What makes a false-positive match harmless is that
 * createCombatStepContext canonicalizes `delta` to `1/N` whenever
 * effectiveBattleTickRate resolves to N, rather than leaving the caller's own
 * (possibly slightly different) deltaSeconds in place — so an accepted match
 * can no longer diverge from the timebase it was matched against, whatever the
 * caller's original literal actually was.
 */
const TICK_RATE_MATCH_EPSILON = 1e-7;

/**
 * Derives the battle's tick rate (ticks per second) from the exact same basis
 * createCombatStepContext uses for `delta`: a truthy fixedFps takes priority,
 * otherwise deltaSeconds. Each candidate is independently required to be a
 * clean positive integer — command log tickRate is a positive integer by
 * schema (combatRtsCommandInputCore) — so a fixedFps that is truthy but not a
 * clean integer (e.g. 59.94) does NOT fall through to deltaSeconds: deltaSeconds
 * is not what ctx.delta would actually be using in that case, and mixing bases
 * would silently validate a command log against a rate the battle is not
 * really running at. Returns null when neither source yields a usable rate.
 *
 * createCombatStepContext calls this exactly once per battle and reuses the
 * single result for both `delta` and the command log's tick-rate check, so the
 * two can never be computed from different values by construction.
 */
function effectiveBattleTickRate(spec: BattleSpec): number | null {
    if (spec.fixedFps) {
        return isPositiveIntegerNumber(spec.fixedFps) ? spec.fixedFps : null;
    }
    const deltaSeconds = spec.deltaSeconds;
    if (typeof deltaSeconds !== 'number' || !Number.isFinite(deltaSeconds) || deltaSeconds <= 0) {
        return null;
    }
    const rounded = Math.round(1 / deltaSeconds);
    if (!isPositiveIntegerNumber(rounded)) return null;
    // Reconstruct and compare rather than trusting the rounded value blindly —
    // this is what keeps a genuinely non-integer rate from being forced into a
    // nearby integer tick rate it does not actually represent.
    if (Math.abs(1 / rounded - deltaSeconds) > TICK_RATE_MATCH_EPSILON * deltaSeconds) return null;
    return rounded;
}

interface RtsCommandLogResolution {
    log: CommandInputLog;
    /**
     * True only when `raw` was actually supplied, successfully validated
     * against expectedTickRate, AND the resulting log has at least one event.
     *
     * A validated-but-empty log (e.g. the caller explicitly serializes
     * emptyCommandInputLog(30) rather than omitting `command`) is deliberately
     * NOT "accepted" here, even though normalizeCommandInputLog itself would
     * report ok:true for it. BattleSpec.command's doc comment promises that an
     * absent command and an empty one behave identically — an empty log can
     * never run a single command regardless of its own declared tickRate, so
     * there is nothing for delta canonicalization to keep consistent with, and
     * canonicalizing only the explicit-empty-log case would make it diverge
     * from the absent case, which is exactly the divergence that contract
     * exists to rule out. False for an absent command, an invalid one, a
     * tickRate mismatch, an undeterminable battle rate, or a validated-but-
     * empty log — every case createCombatStepContext must treat identically
     * for delta.
     */
    accepted: boolean;
}

/**
 * Resolves spec.command into a CommandInputLog, enforcing that its tickRate
 * agrees with the battle's own effective tick rate.
 *
 * Absent input, input that fails normalizeCommandInputLog (including a
 * tickRate mismatch), and a battle whose own rate cannot be pinned down as a
 * positive integer all collapse to an empty log — see BattleSpec.command's
 * doc comment for why that fallback is the only option. The empty log still
 * carries the battle's real tickRate as metadata when one is known, rather
 * than always defaulting to 30 — only a genuinely undeterminable battle rate
 * falls back to the schema default, since there is no real rate to attach.
 */
function resolveRtsCommandLogForSpec(raw: unknown, expectedTickRate: number | null): RtsCommandLogResolution {
    if (expectedTickRate === null) return { log: emptyCommandInputLog(), accepted: false };
    if (raw === undefined) return { log: emptyCommandInputLog(expectedTickRate), accepted: false };
    const result = normalizeCommandInputLog(raw, expectedTickRate);
    if (!result.ok) return { log: emptyCommandInputLog(expectedTickRate), accepted: false };
    // Validated but empty still counts as unaccepted for canonicalization
    // purposes — see RtsCommandLogResolution.accepted's doc comment.
    return { log: result.log, accepted: result.log.events.length > 0 };
}

export function createCombatStepContext(spec: BattleSpec): CombatStepContext {
    const MARGIN = 8.0;
    const PANEL_W = 260.0;
    const LOG_H = 210.0;

    // In Godot 4, headless mode sets the visible rect size to the minimum window size (64x64)
    // This results in negative battle_rect sizes, and Godot's clamp() behaves differently than Math.min/max
    const headless_view_w = 64.0;
    const headless_view_h = 64.0;

    // Snapshotted BEFORE spec.command is touched at all, in this order:
    // legacyDelta, then tickRate, then rawCommand. A fourth review round found
    // that combatRtsCommandInputCore's own adversarial-input contract (PR2:
    // property reads on `command` are getter/Proxy-safe by design, so they may
    // run arbitrary code) cuts both ways — a getter on an explicit EMPTY log's
    // `events` can mutate the very `spec` object closed over by this function
    // (`spec.deltaSeconds = 999`, say) as a side effect of being read, not just
    // return a value. The previous code recomputed the fallback delta from
    // spec.fixedFps/spec.deltaSeconds AFTER normalizing spec.command, so that
    // recomputation observed the mutation — an explicit-but-empty log with a
    // hostile getter could silently corrupt delta even though the command
    // itself is accepted:false and has no other effect. legacyDelta below is
    // computed from the exact previous truthy-fixedFps rule, captured before
    // spec.command is dereferenced by anything, so no later mutation of
    // spec.fixedFps/spec.deltaSeconds — however it happens — can reach it.
    const legacyDelta = spec.fixedFps ? (1.0 / spec.fixedFps) : spec.deltaSeconds;
    const tickRate = effectiveBattleTickRate(spec);
    const rawCommand = spec.command;
    const commandResolution = resolveRtsCommandLogForSpec(rawCommand, tickRate);

    return {
        spec,
        participantOrder: spec.participantOrder,
        // Canonicalized to 1/tickRate ONLY when a command log was actually
        // accepted (raw supplied, validated, AND non-empty) — never merely
        // because a clean tick rate happens to be determinable.
        //
        // A second review round found the earlier, broader "canonicalize
        // whenever determinable" rule reached callers with no command log at
        // all: Combat Lab's battleSpecForCombatLab never sets spec.command, and
        // isValidScenario only requires deltaSeconds > 0 — no precision
        // requirement — so an imported or hand-edited scenario can carry an
        // imprecise literal like 0.033333333 that would have been silently
        // canonicalized to exactly 1/30, changing established command-free
        // combat timing for no reason (there was no command log to protect
        // consistency for), and leaving runCombatLab's own
        // `durationSeconds: ticks * scenario.deltaSeconds` display
        // disagreeing with the timebase the simulation had actually used.
        //
        // A third review round found that "accepted" alone was still too
        // broad: a caller supplying an explicit but EMPTY log — e.g.
        // emptyCommandInputLog(30), which validates fine against a matching
        // tick rate — was still marked accepted, so an imprecise deltaSeconds
        // canonicalized for that battle but not for the behaviorally-identical
        // command-absent battle, even though an empty log can never run a
        // single command either way. BattleSpec.command's own doc comment
        // promises absent and empty behave the same; RtsCommandLogResolution
        // now requires at least one event for `accepted`, so both cases take
        // the same, uncanonicalized path.
        //
        // Scoped this way, canonicalization is bit-identical to the original
        // fixedFps-or-deltaSeconds computation for every existing caller:
        // Combat Lab never supplies a command log, so commandResolution.accepted
        // is always false for it and delta is untouched, regardless of how
        // deltaSeconds is spelled. The golden-master fixtures likewise never
        // supply a command by default. Canonicalization only ever fires for a
        // spec that both determines a clean tick rate AND has a real, matching,
        // non-empty command log — precisely the case that needs delta and the
        // log to agree, and the only case introduced by this feature in the
        // first place.
        //
        // The fallback branch reads legacyDelta — the snapshot taken above,
        // before spec.command was ever touched — never spec.fixedFps /
        // spec.deltaSeconds directly. Re-reading those fields here (as the
        // previous version did) is exactly what a fourth review round found
        // exploitable: normalizing spec.command runs arbitrary getter code by
        // contract, and that code can mutate spec itself before this line
        // would have re-read it.
        delta: (commandResolution.accepted && tickRate !== null) ? (1.0 / tickRate) : legacyDelta,
        combatMode: spec.combatMode || 'legacy_gambit',
        battleRect: {
            x: MARGIN,
            y: MARGIN,
            w: headless_view_w - PANEL_W - MARGIN * 3.0,
            h: headless_view_h - LOG_H - MARGIN * 3.0
        },
        timeoutTicks: COMBAT_TIMEOUT_TICKS,
        commandLog: commandResolution.log,
        selectableMode: isCombatSelectableMode(spec.selectableMode) ? spec.selectableMode : 'command',
    };
}

export function createCombatState(spec: BattleSpec): CombatState {
    const units: Record<string, CombatUnitState> = {};
    const alliesRaw = spec.initialState.units.allies || [];
    const enemiesRaw = spec.initialState.units.enemies || [];

    for (const u of alliesRaw) {
        units[u.name] = { hp: u.max_hp, ...u, team: 0, _cooldown_timer: 0.0, _dead: false, _last_action: "" };
    }
    for (const u of enemiesRaw) {
        units[u.name] = { hp: u.max_hp, ...u, team: 1, _cooldown_timer: 0.0, _dead: false, _last_action: "" };
    }

    const mechanicsStates: Record<string, MechanicsCombatant> = {};
    if ((spec.combatMode || 'legacy_gambit') === 'mechanics_v1') {
        for (const name of Object.keys(units)) {
            const unit = units[name];
            mechanicsStates[name] = unit.mechanics ? structuredClone(unit.mechanics) : { id: name, hp: unit.hp, maxHp: unit.max_hp, attack: unit.attack, defense: unit.defense };
        }
    }

    return { tick: 0, outcome: "", units, mechanicsStates, lastEvals: {}, focusTarget: {}, orders: {}, commandCursor: 0 };
}

/**
 * Roster helpers shared by the terminal check and the tick body. Bound to one
 * `units` map so the extracted body keeps calling them exactly as it did before.
 */
function combatRosterHelpers(units: Record<string, CombatUnitState>, participantOrder: string[]) {
    function isAlive(name: string) {
        const u = units[name];
        return u && !u._dead && u.hp > 0;
    }
    function getUnits(team: number): string[] {
        return participantOrder.filter(name => units[name] && units[name].team === team);
    }
    function getAliveUnits(team: number): string[] {
        return getUnits(team).filter(isAlive);
    }
    function countAlive(team: number) {
        return getAliveUnits(team).length;
    }
    function isBackline(u: CombatUnitState) {
        return u.heal_power > 0 || u.role === "Shooter" || u.role === "Support" || u.role === "Medic";
    }
    return { isAlive, getUnits, getAliveUnits, countAlive, isBackline };
}

/**
 * Win/lose check for the state as it stands, evaluated before the tick advances
 * so the ordering of the original top-of-loop check is preserved exactly.
 */
export function combatTerminalOutcome(state: CombatState, ctx: CombatStepContext): string {
    const { countAlive } = combatRosterHelpers(state.units, ctx.participantOrder);
    if (countAlive(1) === 0) {
        return "勝利！ 敵を全滅させた";
    }
    if (countAlive(0) === 0) {
        return "敗北… 味方が全滅した";
    }
    return "";
}

/**
 * Per-tick copy. Every unit field mutated during a tick is a scalar, and each
 * mechanics entry (and each order) is replaced wholesale rather than mutated
 * in place, so copying one level deep — two for orders, since an ActiveOrder
 * is itself an object — is enough to leave the caller's state untouched.
 */
function cloneCombatState(state: CombatState): CombatState {
    const units: Record<string, CombatUnitState> = {};
    for (const name of Object.keys(state.units)) units[name] = { ...state.units[name] };
    const orders: Record<string, ActiveOrder | null> = {};
    for (const name of Object.keys(state.orders)) {
        const order = state.orders[name];
        orders[name] = order ? { ...order } : null;
    }
    return {
        tick: state.tick,
        outcome: state.outcome,
        units,
        mechanicsStates: { ...state.mechanicsStates },
        lastEvals: { ...state.lastEvals },
        focusTarget: { ...state.focusTarget },
        orders,
        commandCursor: state.commandCursor,
    };
}

/**
 * Maps a normalized command event's declared tick to the simulation tick it is
 * actually applied on. combatRtsCommandInputCore's schema accepts tick 0 (a
 * non-negative integer), but stepCombat's first call already advances tickCount
 * to 1 before the command phase runs — tickCount is never 0. Comparing a raw
 * `event.tick` of 0 against tickCount would never match on any call, which
 * would permanently stall commandCursor on that event and silently block every
 * later command in the log, no matter its own tick. Folding tick 0 into tick 1
 * here — the earliest tick a command can actually take effect — is what keeps
 * the cursor advancing. This is deliberately not `event.tick <= tickCount`:
 * that would apply an arbitrarily-delayed event unconditionally the first time
 * stepCombat is called for a tick past it, rather than exactly once on the
 * tick it maps to.
 */
function effectiveCommandTick(event: CommandInputEvent): number {
    return event.tick === 0 ? 1 : event.tick;
}

/**
 * A unit's dispatch rank for command fan-out. Unknown units (not in
 * participantOrder) sort to the end, in their original relative order within
 * the event — `Array.prototype.sort` is spec-guaranteed stable, so ties
 * (including multiple unknowns, or a duplicated id) never depend on anything
 * but participantOrder and the event's own original array order.
 */
function orderRank(unitId: string, participantOrder: string[]): number {
    const index = participantOrder.indexOf(unitId);
    return index === -1 ? Number.POSITIVE_INFINITY : index;
}

/**
 * Applies one normalized command event to every unit it targets, in
 * participantOrder rank — never the event's own unitIds order, which is a UI
 * accident (drag-select direction, hit-test order), not a simulation input.
 * See docs/COMBAT_RTS_COMMAND_SPINE_DESIGN.md §4.
 *
 * A bad unit in the selection is rejected individually; the rest of the
 * event's fan-out still proceeds — one bad id must not silently drop an
 * entire multi-unit command.
 */
function applyRtsCommandEvent(
    event: CommandInputEvent,
    tick: number,
    participantOrder: string[],
    units: Record<string, CombatUnitState>,
    orders: Record<string, ActiveOrder | null>,
    selectableMode: CombatSelectableMode,
    receipts: CommandReceipt[],
): void {
    const orderedUnitIds = event.unitIds
        .slice()
        .sort((a, b) => orderRank(a, participantOrder) - orderRank(b, participantOrder));

    for (const unitId of orderedUnitIds) {
        if (!combatModeAllowsTacticalOrder(selectableMode)) {
            receipts.push({ tick, unitId, command: event.command, kind: 'order_rejected', reason: 'mode_forbids_command' });
            continue;
        }

        const unit = units[unitId];
        if (!unit) {
            receipts.push({ tick, unitId, command: event.command, kind: 'order_rejected', reason: 'unit_not_found' });
            continue;
        }
        if (unit._dead || unit.hp <= 0) {
            receipts.push({ tick, unitId, command: event.command, kind: 'order_rejected', reason: 'unit_dead' });
            continue;
        }
        if (unit.team !== event.issuerTeam) {
            receipts.push({ tick, unitId, command: event.command, kind: 'order_rejected', reason: 'not_your_team' });
            continue;
        }

        // attack_target: the target is validated once, here, at acceptance —
        // not re-validated on every subsequent execution tick. A rejection here
        // `continue`s before the order slot is ever touched below, so it never
        // replaces whatever order this unit already had active (COMBAT-RTS-
        // MOVE-ATTACK-TARGET-001), and the fan-out loop still proceeds to the
        // next selected unit exactly like every other per-unit rejection.
        if (event.command === 'attack_target') {
            const targetId = event.targetId;
            const target = targetId ? units[targetId] : undefined;
            if (!targetId || !target) {
                receipts.push({ tick, unitId, command: event.command, kind: 'order_rejected', reason: 'target_not_found' });
                continue;
            }
            if (target._dead || target.hp <= 0) {
                receipts.push({ tick, unitId, command: event.command, kind: 'order_rejected', reason: 'target_defeated' });
                continue;
            }
            if (target.team === unit.team) {
                receipts.push({ tick, unitId, command: event.command, kind: 'order_rejected', reason: 'invalid_target' });
                continue;
            }
        }

        // Accepted. Whatever was previously active for this unit is replaced —
        // same rule whether the replacement is another concrete order or
        // resume_gambit clearing the slot back to nothing.
        const previous = orders[unitId];
        if (previous) {
            receipts.push({ tick, unitId, command: previous.command, kind: 'order_superseded' });
        }
        receipts.push({ tick, unitId, command: event.command, kind: 'order_accepted' });

        if (event.command === 'resume_gambit') {
            orders[unitId] = null;
            continue;
        }

        orders[unitId] = { command: event.command, point: event.point, targetId: event.targetId, issuedTick: tick };
        receipts.push({ tick, unitId, command: event.command, kind: 'order_started' });
    }
}

/**
 * Advances the battle by exactly one tick. Pure: the input state is never
 * mutated and the same (state, ctx) always produces the same result.
 */
export function stepCombat(state: CombatState, ctx: CombatStepContext): { state: CombatState; events: CombatStepEvents } {
    const next = cloneCombatState(state);

    // These names deliberately match the pre-extraction closure scope, so the
    // tick body below is byte-for-byte what the original loop ran.
    const spec = ctx.spec;
    const participantOrder = ctx.participantOrder;
    const combatMode = ctx.combatMode;
    const delta = ctx.delta;
    const battle_rect = ctx.battleRect;
    const units = next.units;
    const mechanicsStates = next.mechanicsStates;
    const lastEvals = next.lastEvals;
    const focusTarget = next.focusTarget;
    const orders = next.orders;
    let tickCount = next.tick;

    const evaluations: CombatEvent[] = [];
    const decisions: CombatEvent[] = [];
    const attacks: CombatEvent[] = [];
    const heals: CombatEvent[] = [];
    const deaths: CombatEvent[] = [];
    const focusChanges: CombatEvent[] = [];
    const mechanicsReceipts: Array<CombatEvent & { receipt: MechanicsReceipt }> = [];
    const commandReceipts: CommandReceipt[] = [];
    // Populated during the per-unit loop below when an attack_move holder is
    // within arrivalEpsilon of its destination with no living enemy in range
    // — completion is only finalized by the end-of-tick attack_move arrival
    // sweep, never inline, for the same holder-death-priority reason as the
    // attack_target target-death sweep (PR #35 review discussion
    // r3619920590): a holder that arrives AND dies later this same tick must
    // still receive order_interrupted, not order_completed.
    const arrivedThisTick = new Set<string>();

    const { isAlive, getAliveUnits, isBackline } = combatRosterHelpers(units, participantOrder);

    function godotClamp(val: number, min: number, max: number): number {
        return Math.min(max, Math.max(min, val));
    }

    function clampToBattlefield(u: CombatUnitState) {
        const m = u.radius + 2.0;
        u.pos_x = godotClamp(u.pos_x, battle_rect.x + m, battle_rect.x + battle_rect.w - m);
        u.pos_y = godotClamp(u.pos_y, battle_rect.y + m, battle_rect.y + battle_rect.h - m);
    }

    tickCount++;

    // ---------------------------------------------------------------------
    // ▸ RTS command application phase (COMBAT-RTS-ORDER-SLOT-STOP-RESUME-001)
    //
    // All commands scheduled for this tick land before any unit acts (design
    // §2/§4): no unit's order can depend on where an earlier-moving ally ended
    // up this same tick. The cursor only ever advances, so a battle with no
    // commands (ctx.commandLog.events is empty) runs this loop zero times,
    // every tick, for its entire duration — the golden master's byte-identity
    // depends on that being a true no-op, not merely a cheap one.
    //
    // Compared via effectiveCommandTick, not raw event.tick — see that
    // function's doc comment for why a raw tick-0 event would otherwise stall
    // the cursor forever. The events array is still sorted by (tick, seq) —
    // normalizeCommandInputLog guarantees this on raw tick, and tick 0 always
    // sorts before tick 1 regardless of seq — so a tick-0 command and a tick-1
    // command targeting the same unit are still applied in that order, with
    // tick 1 (correctly) superseding tick 0.
    // ---------------------------------------------------------------------
    {
        const commandEvents = ctx.commandLog.events;
        let cursor = next.commandCursor;
        while (cursor < commandEvents.length && effectiveCommandTick(commandEvents[cursor]) === tickCount) {
            applyRtsCommandEvent(commandEvents[cursor], tickCount, participantOrder, units, orders, ctx.selectableMode, commandReceipts);
            cursor++;
        }
        next.commandCursor = cursor;
    }

    // --- extracted tick body: unchanged from the original while-loop ----------
    // Engagement slots are assigned each tick to every living hostile currently engaging a
    // defender (in range, nearest enemy is that defender), ordered by participantOrder — not
    // only to attackers who happen to fire this tick. Overflow beyond the size table deals ×0.25.
    const engagementRankFor = (attackerName: string, defenderName: string): number => {
        const defender = units[defenderName];
        if (!defender || defender._dead) return 1;
        const engagers = participantOrder.filter(name => {
            const attacker = units[name];
            if (!attacker || attacker._dead || attacker.team === defender.team) return false;
            if (dist(attacker, defender) > attacker.attack_range) return false;
            let nearest: string | null = null;
            let best = Infinity;
            for (const other of participantOrder) {
                const candidate = units[other];
                if (!candidate || candidate._dead || candidate.team === attacker.team) continue;
                const d = dist(attacker, candidate);
                if (d < best) {
                    best = d;
                    nearest = other;
                }
            }
            return nearest === defenderName;
        });
        const rank = engagers.indexOf(attackerName);
        return rank < 0 ? engagers.length + 1 : rank + 1;
    };

    // Evaluate gambits
    for (const unitName of participantOrder) {
        const u = units[unitName];
        if (!u || u.hp <= 0) continue;

        if (u._cooldown_timer > 0.0) {
            u._cooldown_timer -= delta;
        }

        const move_delta = f(delta);

        const allyTeam = u.team;
        const enemyTeam = 1 - u.team;

        const aliveAllies = getAliveUnits(allyTeam);
        const aliveEnemies = getAliveUnits(enemyTeam);

        const findNearestEnemy = () => {
            let nearest = null;
            let best = Infinity;
            for (const en of aliveEnemies) {
                const eu = units[en];
                const d = dist(u, eu);
                if (d < best) {
                    best = d;
                    nearest = en;
                }
            }
            return nearest;
        };

        const findNearestEnemyTo = (x: number, y: number) => {
            let nearest = null;
            let best = Infinity;
            for (const en of aliveEnemies) {
                const eu = units[en];
                const d = dist({pos_x: x, pos_y: y} as any, eu);
                if (d < best) {
                    best = d;
                    nearest = en;
                }
            }
            return nearest;
        };

        const findThreatenedBackline = (param: number) => {
            let best = null;
            let best_threat = param;
            for (const al of aliveAllies) {
                if (al === u.name) continue;
                const au = units[al];
                if (!isBackline(au)) continue;
                const eName = findNearestEnemyTo(au.pos_x, au.pos_y);
                if (!eName) continue;
                const eu = units[eName];
                const d = dist(au, eu);
                if (d < best_threat) {
                    best_threat = d;
                    best = al;
                }
            }
            return best;
        };

        const findNearestHealer = () => {
            let nearest = null;
            let best = Infinity;
            for (const al of aliveAllies) {
                if (al === u.name) continue;
                const au = units[al];
                if (au.heal_power <= 0) continue;
                const d = dist(u, au);
                if (d < best) {
                    best = d;
                    nearest = al;
                }
            }
            return nearest;
        };

        const findWoundedAlly = (threshold: number) => {
            let target = null;
            let lowestRatio = threshold;
            for (const al of aliveAllies) {
                if (al === u.name) continue;
                const au = units[al];
                const ratio = au.hp / au.max_hp;
                if (ratio < lowestRatio) {
                    lowestRatio = ratio;
                    target = al;
                }
            }
            return target;
        };

        const findWeakestEnemy = () => {
            let weakest = null;
            let lowest = Infinity;
            for (const en of aliveEnemies) {
                const eu = units[en];
                if (eu.hp < lowest) {
                    lowest = eu.hp;
                    weakest = en;
                }
            }
            return weakest;
        };

        const checkCond = (rule: any) => {
            const param = rule.param || 0.0;
            switch (rule.cond) {
                case "self_hp_below": return (u.hp / u.max_hp) < param;
                case "ally_hp_below": return findWoundedAlly(param) !== null;
                case "backline_threatened": return findThreatenedBackline(param) !== null;
                case "enemy_in_range": {
                    const e = findNearestEnemy();
                    return e !== null && dist(u, units[e]) <= u.attack_range;
                }
                case "enemy_too_close": {
                    const e2 = findNearestEnemy();
                    return e2 !== null && dist(u, units[e2]) < param;
                }
                case "nearest_enemy_exists": return findNearestEnemy() !== null;
                default: return false;
            }
        };

        const setAction = (label: string, targetName: string = "") => {
            if (label !== u._last_action) {
                u._last_action = label;
                decisions.push({
                    tick: tickCount,
                    unit: u.name,
                    action: label,
                    target: targetName
                });
            }
        };

        const tryAttack = (targetName: string) => {
            if (u._cooldown_timer > 0.0) return;
            const tu = units[targetName];
            if (combatMode === 'mechanics_v1' && u.normalAttackAbility) {
                const ability = u.normalAttackAbility;
                // Consume the ability's priced cooldown so AoE loadouts pay their budgeted rate.
                // Committed on the attempt tick, before the act gate, so a unit that is stunned
                // out of its swing still pays for it and cannot fire the instant control lapses.
                u._cooldown_timer = typeof ability.auto?.cooldown === 'number' && ability.auto.cooldown > 0
                    ? ability.auto.cooldown
                    : u.attack_cooldown;
                if (!canAct(mechanicsStates[u.name])) return;
                const maxTargets = Math.max(1, Math.trunc(ability.delivery?.maxTargets ?? 1));
                const falloff = typeof ability.delivery?.falloff === 'number' ? ability.delivery.falloff : 1;
                // Primary target first, then the rest of the hostile line in participantOrder. Selection is
                // deterministic and never repeats a combatant, so fan-out is reproducible.
                const struck = [targetName, ...getAliveUnits(1 - u.team).filter(name => name !== targetName)].slice(0, maxTargets);
                focusTarget[u.team] = targetName;
                focusChanges.push({ tick: tickCount, team: u.team, target: targetName });
                for (let index = 0; index < struck.length; index++) {
                    const name = struck[index];
                    const victim = units[name];
                    if (!victim || victim._dead) continue;
                    // Fixed slot rank among all current engagers (participantOrder), independent of who fires this tick.
                    const rank = engagementRankFor(u.name, name);
                    const overflow = rank > engagementSlotsFor(mechanicsStates[name]) ? ENGAGEMENT_OVERFLOW_MULTIPLIER : 1;
                    const result = resolveMechanics({
                        ability, attacker: mechanicsStates[u.name], target: mechanicsStates[name],
                        statuses: spec.mechanics?.statuses || [],
                        delivery: { falloff: falloffAtIndex(index + 1, maxTargets, falloff), engagement: overflow },
                    });
                    mechanicsStates[name] = result.target;
                    victim.hp = result.target.hp;
                    attacks.push({ tick: tickCount, unit: u.name, target: name, damage: result.damageDealt });
                    for (const receipt of result.receipts) mechanicsReceipts.push({ tick: tickCount, unit: u.name, target: name, receipt });
                    if (victim.hp <= 0) { victim.hp = 0; victim._dead = true; deaths.push({ tick: tickCount, unit: name }); }
                }
                return;
            }
            u._cooldown_timer = u.attack_cooldown;
            const damage = Math.max(1, u.attack - tu.defense);
            
            focusTarget[u.team] = targetName;
            focusChanges.push({ tick: tickCount, team: u.team, target: targetName });

            attacks.push({ tick: tickCount, unit: u.name, target: targetName, damage });
            
            tu.hp -= damage;
            if (tu.hp <= 0) {
                tu.hp = 0;
                tu._dead = true;
                deaths.push({ tick: tickCount, unit: targetName });
            }
        };

        const moveToward = (targetName: string) => {
            const tu = units[targetName];
            if (!tu) return;
            if (combatMode === 'mechanics_v1' && !canMove(mechanicsStates[u.name])) return;
            const dx = f(tu.pos_x - u.pos_x);
            const dy = f(tu.pos_y - u.pos_y);
            const d = dist(u, tu);
            if (d > 0) {
                u.pos_x = f(u.pos_x + (dx / d) * u.move_speed * move_delta);
                    u.pos_y = f(u.pos_y + (dy / d) * u.move_speed * move_delta);
            }
        };

        // Same math as moveToward, generalized to a raw point instead of a
        // named unit — move_to's order carries a destination, not a target id.
        // No parallel movement formula: this is moveToward's own body with
        // `tu.pos_x/pos_y` replaced by the point's coordinates.
        const moveTowardPoint = (targetX: number, targetY: number) => {
            if (combatMode === 'mechanics_v1' && !canMove(mechanicsStates[u.name])) return;
            const target = { pos_x: targetX, pos_y: targetY } as any;
            const dx = f(targetX - u.pos_x);
            const dy = f(targetY - u.pos_y);
            const d = dist(u, target);
            if (d > 0) {
                u.pos_x = f(u.pos_x + (dx / d) * u.move_speed * move_delta);
                u.pos_y = f(u.pos_y + (dy / d) * u.move_speed * move_delta);
            }
        };

        // ▸ RTS order execution (PR4: COMBAT-RTS-MOVE-ATTACK-TARGET-001,
        // PR5: COMBAT-RTS-ATTACK-MOVE-001)
        //
        // A non-null order still suppresses gambit evaluation entirely — no
        // blending (design §3) — but for move_to / attack_target /
        // attack_move "suppressed" now means the order's own execution runs
        // in gambits' place, not mere idling. `stop` alone still just idles,
        // exactly as PR3 left it — it has no execution of its own.
        const activeOrder = orders[unitName];
        if (activeOrder) {
            if (activeOrder.command === 'move_to' && activeOrder.point) {
                // Arrival is checked BEFORE moving, using this tick's starting
                // position — arrivalEpsilon is one tick of travel (design §5),
                // so a unit already within that distance is done, not moved
                // one more (overshooting) step past its destination.
                const arrivalEpsilon = f(u.move_speed * move_delta);
                const remaining = dist(u, { pos_x: activeOrder.point.x, pos_y: activeOrder.point.y } as any);
                if (remaining <= arrivalEpsilon) {
                    orders[unitName] = null;
                    commandReceipts.push({ tick: tickCount, unitId: unitName, command: 'move_to', kind: 'order_completed' });
                } else {
                    // Ignores any enemy in range — move_to is a movement order,
                    // not an engage order (design §5). No attack call here, ever.
                    moveTowardPoint(activeOrder.point.x, activeOrder.point.y);
                }
                continue;
            }
            if (activeOrder.command === 'attack_target' && activeOrder.targetId) {
                const targetId = activeOrder.targetId;
                const targetAlive = () => {
                    const t = units[targetId];
                    return !!t && !t._dead && t.hp > 0;
                };
                // Completion (order_completed / target_defeated) is never
                // finalized inline here — only by the end-of-tick attack_target
                // target-death sweep below. Deferring it lets that sweep check
                // THIS unit's own end-of-tick survival before completing, so a
                // holder that also dies this same tick (to a hostile acting
                // later in participantOrder) correctly falls through to the
                // Unit-death interruption pass and receives order_interrupted
                // — holder-death priority (design §3) — instead of
                // order_completed, even though its target (whether already
                // dead before this unit's turn, or killed by this unit's own
                // attack below) died first. Completing inline here would clear
                // orders[unitName] before that later death is known, which is
                // exactly the bug Codex flagged on PR #35
                // (review discussion r3619920590): the sweep would then skip a
                // unit already reported dead, but the interruption pass would
                // find no active order left to interrupt either.
                if (!targetAlive()) {
                    // Target already gone (from any source, this tick or a
                    // prior one) — do not move or attack. The order is left
                    // exactly as-is for the end-of-tick sweep to resolve.
                    continue;
                }
                // Mirrors design §3's "canAct/canMove false -> retain the order
                // and idle" — already true of move_to via moveToward's own
                // internal canMove check, but attack_target has both a move
                // phase and an attack phase, so both gates are checked together
                // here, before either. tryAttack's own canAct check only runs
                // inside its mechanics_v1-ability branch (a mechanics_v1 unit
                // with no normalAttackAbility falls through to the plain damage
                // formula, which never checks canAct at all) — this check does
                // not depend on that branch and applies uniformly regardless of
                // whether the unit has an ability. Neither the order nor the
                // target-liveness state is touched: the order is retained
                // exactly as-is and re-evaluated next tick.
                if (combatMode === 'mechanics_v1' && (!canAct(mechanicsStates[u.name]) || !canMove(mechanicsStates[u.name]))) {
                    continue;
                }
                if (dist(u, units[targetId]) <= u.attack_range) {
                    tryAttack(targetId);
                } else {
                    moveToward(targetId);
                }
                // No inline re-check after acting: a target this unit's own
                // attack just defeated still completes the same tick, because
                // the end-of-tick sweep runs after every unit has acted and
                // stamps completions with this same tickCount — see the
                // comment above.
                continue;
            }
            if (activeOrder.command === 'attack_move' && activeOrder.point) {
                // Mirrors attack_target's canAct/canMove gate (design §3 /
                // §5): unlike attack_target's target-alive check, attack_move
                // has no "already resolved, complete regardless" exception —
                // a disabled holder retains its order unchanged, with no
                // completion, full stop, checked before anything else.
                if (combatMode === 'mechanics_v1' && (!canAct(mechanicsStates[u.name]) || !canMove(mechanicsStates[u.name]))) {
                    continue;
                }

                // Reacquired fresh every tick from the unit's current
                // position — no persistent target slot (design: attack_move
                // is not a second attack_target). Candidates and the nearest-
                // distance tie-break both derive from participantOrder, never
                // Object.keys/Object.values, so selection is deterministic.
                // Iterating in participantOrder order and only replacing on a
                // strictly smaller distance means an exact-distance tie keeps
                // whichever candidate has the lower participantOrder index.
                let nearestEnemy: string | null = null;
                let nearestDist = Infinity;
                for (const candidateName of participantOrder) {
                    const candidate = units[candidateName];
                    if (!candidate || candidate._dead || candidate.hp <= 0 || candidate.team === u.team) continue;
                    const d = dist(u, candidate);
                    if (d > u.attack_range) continue;
                    if (d < nearestDist) {
                        nearestDist = d;
                        nearestEnemy = candidateName;
                    }
                }

                if (nearestEnemy) {
                    // Stop and fight: no movement call at all this tick,
                    // regardless of whether tryAttack's own cooldown gate
                    // actually lets the attack land — "stopped while an
                    // enemy is in range" does not depend on cooldown state.
                    // Also skips the arrival check entirely (design §5:
                    // "enemy at destination -> fight first, complete only
                    // after no in-range enemy remains").
                    activeOrder.engaging = true;
                    tryAttack(nearestEnemy);
                    continue;
                }
                activeOrder.engaging = false;

                // No living enemy in range: resume straight-line movement.
                // Same arrivalEpsilon / "checked before moving" discipline as
                // move_to (design §5) — reuses moveTowardPoint verbatim, no
                // second movement formula.
                const arrivalEpsilon = f(u.move_speed * move_delta);
                const remaining = dist(u, { pos_x: activeOrder.point.x, pos_y: activeOrder.point.y } as any);
                if (remaining <= arrivalEpsilon) {
                    // Arrival-with-no-enemy-in-range is only recorded here —
                    // completion is finalized by the end-of-tick attack_move
                    // arrival sweep below, never inline. See arrivedThisTick's
                    // declaration comment for why.
                    arrivedThisTick.add(unitName);
                } else {
                    moveTowardPoint(activeOrder.point.x, activeOrder.point.y);
                }
                continue;
            }
            // `stop`: idle.
            continue;
        }

        const gambits = (u.gambits && u.gambits.length > 0) ? u.gambits : getGambits(u.role);
        let ruleMatched = false;

        const runAction = (rule: any) => {
            const action = rule.action;
            const param = rule.param || 0.0;
            
            if (action === "attack_nearest") {
                const en = findNearestEnemy();
                if (!en) { setAction("待機"); return; }
                if (dist(u, units[en]) <= u.attack_range) {
                    setAction("攻撃", en);
                    tryAttack(en);
                } else {
                    setAction("接近", en);
                    moveToward(en);
                }
            } else if (action === "attack_weakest") {
                const en = findWeakestEnemy();
                if (!en) { setAction("待機"); return; }
                if (dist(u, units[en]) <= u.attack_range) {
                    setAction("攻撃", en);
                    tryAttack(en);
                } else {
                    setAction("接近", en);
                    moveToward(en);
                }
            } else if (action === "focus_fire") {
                let en: string | null = focusTarget[u.team] || null;
                if (!en || !isAlive(en)) {
                    en = findNearestEnemy();
                }
                if (!en) { setAction("待機"); return; }
                if (dist(u, units[en]) <= u.attack_range) {
                    setAction("攻撃", en);
                    tryAttack(en);
                } else {
                    setAction("接近", en);
                    moveToward(en);
                }
            } else if (action === "protect_ally") {
                const ally = findThreatenedBackline(param || 150.0);
                if (!ally) {
                    const en = findNearestEnemy();
                    if (!en) { setAction("待機"); return; }
                    if (dist(u, units[en]) <= u.attack_range) {
                        setAction("攻撃", en);
                        tryAttack(en);
                    } else {
                        setAction("接近", en);
                        moveToward(en);
                    }
                    return;
                }
                const threat = findNearestEnemyTo(units[ally].pos_x, units[ally].pos_y);
                if (!threat) {
                    const en = findNearestEnemy();
                    if (!en) { setAction("待機"); return; }
                    if (dist(u, units[en]) <= u.attack_range) {
                        setAction("攻撃", en);
                        tryAttack(en);
                    } else {
                        setAction("接近", en);
                        moveToward(en);
                    }
                    return;
                }
                if (dist(u, units[threat]) <= u.attack_range) {
                    setAction("護衛(迎撃)", threat);
                    tryAttack(threat);
                    return;
                }
                const au = units[ally];
                const tu = units[threat];
                const dx = f(tu.pos_x - au.pos_x);
                const dy = f(tu.pos_y - au.pos_y);
                const d = dist(au, tu);
                let guard_x = au.pos_x;
                let guard_y = au.pos_y;
                if (d > 0) {
                    guard_x += (dx / d) * (au.radius * 2.0 + 16.0);
                    guard_y += (dy / d) * (au.radius * 2.0 + 16.0);
                }
                setAction("護衛", ally);
                const mx = f(guard_x - u.pos_x);
                const my = f(guard_y - u.pos_y);
                const md = f(Math.sqrt(f(f(mx * mx) + f(my * my))));
                if (md > 2.0) {
                    u.pos_x = f(u.pos_x + (dx / d) * u.move_speed * move_delta);
                    u.pos_y = f(u.pos_y + (dy / d) * u.move_speed * move_delta);
                }
                clampToBattlefield(u);
            } else if (action === "retreat") {
                const en = findNearestEnemy();
                if (!en) { setAction("待機"); return; }
                setAction("後退", en);
                const tu = units[en];
                const dx = u.pos_x - tu.pos_x;
                const dy = u.pos_y - tu.pos_y;
                const d = dist(u, tu);
                if (d > 0) {
                    u.pos_x = f(u.pos_x + (dx / d) * u.move_speed * move_delta);
                    u.pos_y = f(u.pos_y + (dy / d) * u.move_speed * move_delta);
                }
                clampToBattlefield(u);
            } else if (action === "retreat_to_safe") {
                const factor = rule.factor || 1.3;
                const en = findNearestEnemy();
                if (!en) { setAction("待機"); return; }
                const tu = units[en];
                const safe = Math.max(150.0, tu.attack_range * factor);
                const d = dist(u, tu);
                if (d >= safe) {
                    setAction("待機(警戒)", en);
                } else {
                    setAction("後退", en);
                    if (d > 0) {
                        const dx = u.pos_x - tu.pos_x;
                        const dy = u.pos_y - tu.pos_y;
                        u.pos_x = f(u.pos_x + (dx / d) * u.move_speed * move_delta);
                    u.pos_y = f(u.pos_y + (dy / d) * u.move_speed * move_delta);
                    }
                    clampToBattlefield(u);
                }
            } else if (action === "flee_to_healer") {
                const factor = rule.factor || 1.3;
                const medic = findNearestHealer();
                if (!medic) {
                    const en = findNearestEnemy();
                    if (!en) { setAction("待機"); return; }
                    const tu = units[en];
                    const safe = Math.max(150.0, tu.attack_range * factor);
                    const d = dist(u, tu);
                    if (d >= safe) {
                        setAction("待機(警戒)", en);
                    } else {
                        setAction("後退", en);
                        const dx = u.pos_x - tu.pos_x;
                        const dy = u.pos_y - tu.pos_y;
                        if (d > 0) {
                            u.pos_x = f(u.pos_x + (dx / d) * u.move_speed * move_delta);
                    u.pos_y = f(u.pos_y + (dy / d) * u.move_speed * move_delta);
                        }
                        clampToBattlefield(u);
                    }
                    return;
                }
                const mu = units[medic];
                const d = dist(u, mu);
                if (d > 48.0) {
                    setAction("後退", medic);
                    const dx = mu.pos_x - u.pos_x;
                    const dy = mu.pos_y - u.pos_y;
                    if (d > 0) {
                        u.pos_x = f(u.pos_x + (dx / d) * u.move_speed * move_delta);
                    u.pos_y = f(u.pos_y + (dy / d) * u.move_speed * move_delta);
                    }
                    clampToBattlefield(u);
                } else {
                    setAction("待機(警戒)", medic);
                }
            } else if (action === "heal_self") {
                if (u.hp >= u.max_hp) {
                    setAction("待機");
                    return;
                }
                setAction("自己回復", u.name);
                if (u._cooldown_timer <= 0.0) {
                    u._cooldown_timer = u.attack_cooldown;
                    if (combatMode === 'mechanics_v1' && u.healAbility) {
                        const result = resolveMechanics({ ability: u.healAbility, attacker: mechanicsStates[u.name], target: mechanicsStates[u.name], statuses: spec.mechanics?.statuses || [] });
                        mechanicsStates[u.name] = result.target; u.hp = result.target.hp;
                        const amount = result.receipts.filter(receipt => receipt.kind === 'healed').reduce((sum, receipt) => sum + (receipt.amount || 0), 0);
                        for (const receipt of result.receipts) mechanicsReceipts.push({ tick: tickCount, unit: u.name, target: u.name, receipt });
                        if (amount > 0) heals.push({ tick: tickCount, unit: u.name, source: u.name, amount });
                        return;
                    }
                    const amount = Math.min(u.max_hp - u.hp, u.heal_power);
                    u.hp += amount;
                    if (amount > 0) {
                        heals.push({ tick: tickCount, unit: u.name, source: u.name, amount });
                    }
                }
            } else if (action === "heal_lowest_hp_ally") {
                const ally = findWoundedAlly(param || 0.7);
                if (!ally) { setAction("待機"); return; }
                const au = units[ally];
                if (dist(u, au) <= u.attack_range) {
                    setAction("回復", ally);
                    if (u._cooldown_timer <= 0.0) {
                        u._cooldown_timer = u.attack_cooldown;
                        if (combatMode === 'mechanics_v1' && u.healAbility) {
                            const result = resolveMechanics({ ability: u.healAbility, attacker: mechanicsStates[u.name], target: mechanicsStates[ally], statuses: spec.mechanics?.statuses || [] });
                            mechanicsStates[ally] = result.target; au.hp = result.target.hp;
                            const amount = result.receipts.filter(receipt => receipt.kind === 'healed').reduce((sum, receipt) => sum + (receipt.amount || 0), 0);
                            for (const receipt of result.receipts) mechanicsReceipts.push({ tick: tickCount, unit: u.name, target: ally, receipt });
                            if (amount > 0) heals.push({ tick: tickCount, unit: ally, source: u.name, amount });
                            return;
                        }
                        const amount = Math.min(au.max_hp - au.hp, u.heal_power);
                        au.hp += amount;
                        if (amount > 0) {
                            heals.push({ tick: tickCount, unit: ally, source: u.name, amount });
                        }
                    }
                } else {
                    setAction("接近(回復)", ally);
                    moveToward(ally);
                }
            } else if (action === "move_to_nearest_enemy") {
                const en = findNearestEnemy();
                if (!en) { setAction("待機"); return; }
                setAction("接近", en);
                moveToward(en);
            } else {
                setAction("待機");
            }
        };

        for (const rule of gambits) {
            if (checkCond(rule)) {
                const sig = rule.cond + "|" + rule.action;
                if (lastEvals[u.name] !== sig) {
                    evaluations.push({
                        tick: tickCount,
                        unit: u.name,
                        cond: rule.cond,
                        rule_action: rule.action
                    });
                    lastEvals[u.name] = sig;
                }
                runAction(rule);
                ruleMatched = true;
                break;
            }
        }

        if (!ruleMatched) {
            const sig = "fallback|待機";
            if (lastEvals[u.name] !== sig) {
                evaluations.push({
                    tick: tickCount,
                    unit: u.name,
                    cond: "fallback",
                    rule_action: "待機"
                });
                lastEvals[u.name] = sig;
            }
            setAction("待機");
        }
    }
    if (combatMode === 'mechanics_v1') {
        // Anyone already dead is a defeated caster, so their lethal timers lift this tick.
        const defeatedIds = participantOrder.filter(name => units[name] && units[name]._dead);
        for (const name of Object.keys(mechanicsStates)) {
            if (units[name]._dead) continue;
            const tickReceipts: MechanicsReceipt[] = [];
            mechanicsStates[name] = advanceMechanicsState(mechanicsStates[name], delta, { statuses: spec.mechanics?.statuses || [], receipts: tickReceipts, defeatedIds });
            for (const receipt of tickReceipts) mechanicsReceipts.push({ tick: tickCount, unit: name, receipt });
            units[name].hp = mechanicsStates[name].hp;
            if (units[name].hp <= 0) {
                units[name].hp = 0; units[name]._dead = true;
                deaths.push({ tick: tickCount, unit: name });
            }
        }
    }
    // --- end extracted tick body ---------------------------------------------

    // ▸ attack_target target-death sweep (Codex review on PR #35): when
    // multiple units hold attack_target on the same enemy, a unit later in
    // participantOrder can land the killing blow (or the mechanics_v1
    // lethal-timer sweep can) AFTER an earlier unit's own per-tick liveness
    // check already passed this same tick — that earlier unit's order would
    // otherwise stay active with no order_completed receipt, and if the
    // defeated unit was the battle's last opponent the omission becomes
    // permanent: combatTerminalOutcome ends the battle before another tick
    // ever runs to notice. Swept once, here, after every unit has acted and
    // mechanics_v1 has resolved, for any attack_target order whose target is
    // no longer alive — including a target that died while its attacker was
    // disabled (canAct/canMove false) and never got to act at all this tick.
    // Skips a unit whose own HOLDER already died this tick; that case is
    // covered by the unit-death interruption pass below instead, with
    // order_interrupted rather than order_completed — the two sweeps never
    // touch the same order, so there is no priority ambiguity between them.
    // Iterates participantOrder, never Object.keys(orders), for the same
    // determinism reason as the sweep below.
    for (const unitName of participantOrder) {
        const activeOrder = orders[unitName];
        if (!activeOrder || activeOrder.command !== 'attack_target' || !activeOrder.targetId) continue;
        const unit = units[unitName];
        if (!unit || unit._dead || unit.hp <= 0) continue;
        const target = units[activeOrder.targetId];
        if (target && !target._dead && target.hp > 0) continue;
        orders[unitName] = null;
        commandReceipts.push({ tick: tickCount, unitId: unitName, command: 'attack_target', kind: 'order_completed', reason: 'target_defeated' });
    }

    // ▸ attack_move arrival sweep: mirrors the attack_target target-death
    // sweep directly above, for the same reason. Arrival eligibility
    // (arrivalEpsilon reached, no living enemy in range) is decided during
    // this unit's own per-unit turn, above, and recorded in arrivedThisTick
    // — but completion (order_completed) is only finalized here, once every
    // unit has acted and mechanics_v1 has resolved, so a holder that arrives
    // and is then killed later this same tick correctly falls through to the
    // Unit-death interruption pass below and receives order_interrupted
    // instead of order_completed. Iterates participantOrder, never
    // arrivedThisTick's own insertion order (a Set has none to rely on
    // anyway), for the same determinism reason as every other sweep here.
    for (const unitName of participantOrder) {
        if (!arrivedThisTick.has(unitName)) continue;
        const activeOrder = orders[unitName];
        if (!activeOrder || activeOrder.command !== 'attack_move') continue;
        const unit = units[unitName];
        if (!unit || unit._dead || unit.hp <= 0) continue;
        orders[unitName] = null;
        commandReceipts.push({ tick: tickCount, unitId: unitName, command: 'attack_move', kind: 'order_completed' });
    }

    // ▸ Unit-death interruption (design §3, "shared interruptions"): any order
    // still active for a unit that is dead by the end of this tick is cleared
    // with an order_interrupted receipt. Checked once, here, after all of this
    // tick's damage and mechanics resolution, so it catches death from any
    // source (melee tryAttack, resolveMechanics, or the mechanics_v1 lethal-
    // timer sweep above) uniformly, without threading receipt emission through
    // every death call site. Iterates participantOrder, never Object.keys(orders),
    // so this pass's own receipt order never depends on object key insertion order.
    for (const unitName of participantOrder) {
        const activeOrder = orders[unitName];
        if (!activeOrder) continue;
        const unit = units[unitName];
        if (unit && !unit._dead && unit.hp > 0) continue;
        orders[unitName] = null;
        commandReceipts.push({ tick: tickCount, unitId: unitName, command: activeOrder.command, kind: 'order_interrupted' });
    }

    next.tick = tickCount;
    return {
        state: next,
        events: { evaluations, decisions, attacks, heals, deaths, focusChanges, mechanicsReceipts, commandReceipts },
    };
}

export function resolveCombat(spec: BattleSpec): CombatExpectedOutput {
    const ctx = createCombatStepContext(spec);
    let state = createCombatState(spec);

    const evaluations: CombatEvent[] = [];
    const decisions: CombatEvent[] = [];
    const attacks: CombatEvent[] = [];
    const heals: CombatEvent[] = [];
    const deaths: CombatEvent[] = [];
    const focusChanges: CombatEvent[] = [];
    const mechanicsReceipts: Array<CombatEvent & { receipt: MechanicsReceipt }> = [];
    const commandReceipts: CommandReceipt[] = [];

    while (state.tick <= ctx.timeoutTicks) {
        const terminal = combatTerminalOutcome(state, ctx);
        if (terminal) {
            state = { ...state, outcome: terminal };
            break;
        }
        const stepped = stepCombat(state, ctx);
        state = stepped.state;
        evaluations.push(...stepped.events.evaluations);
        decisions.push(...stepped.events.decisions);
        attacks.push(...stepped.events.attacks);
        heals.push(...stepped.events.heals);
        deaths.push(...stepped.events.deaths);
        focusChanges.push(...stepped.events.focusChanges);
        mechanicsReceipts.push(...stepped.events.mechanicsReceipts);
        commandReceipts.push(...stepped.events.commandReceipts);
    }

    let outcome = state.outcome;
    if (state.tick > ctx.timeoutTicks && outcome === "") {
        outcome = "Timeout";
    }

    const finalStateUnits = ctx.participantOrder.map(name => {
        const u = state.units[name];
        return {
            name: u.name,
            hp: u.hp,
            pos_x: u.pos_x,
            pos_y: u.pos_y
        };
    });

    const output: CombatExpectedOutput = {
        evaluations,
        decisions,
        attacks,
        heals,
        deaths,
        focusChanges,
        finalState: { units: finalStateUnits },
        outcome
    };
    if (ctx.combatMode === 'mechanics_v1') output.mechanicsReceipts = mechanicsReceipts;
    if (ctx.commandLog.events.length > 0) output.commandReceipts = commandReceipts;
    return output;
}
