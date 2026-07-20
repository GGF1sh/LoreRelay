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
 * unit — but their actual movement/attack execution (arrival, engagement,
 * completion) is not implemented until PR4/PR5. A unit under one of those
 * three orders simply idles until it is replaced, explicitly resumed, or dies.
 */
export interface ActiveOrder {
    command: RtsCommand;
    point?: CommandPoint;
    targetId?: string;
    /** Tick the order was accepted on. */
    issuedTick: number;
    /** attack_move only, wired up in PR5: paused to fight mid-transit. */
    engaging?: boolean;
}

export type CommandReceiptKind =
    | 'order_accepted' | 'order_rejected' | 'order_started'
    | 'order_completed' | 'order_superseded' | 'order_interrupted' | 'order_timeout';

/**
 * Only `unit_not_found` / `unit_dead` / `not_your_team` / `mode_forbids_command`
 * are ever produced in PR3. The rest (`invalid_target`, `target_not_found`,
 * `target_defeated`, `invalid_point`, `unknown_command`) belong to move_to /
 * attack_target / attack_move execution semantics landing in PR4/PR5, and are
 * declared now only so CommandReceipt's shape does not change again then.
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

/**
 * Normalizes spec.command into a CommandInputLog. Absent input, or input that
 * fails normalizeCommandInputLog, both collapse to an empty log — see
 * BattleSpec.command's doc comment for why that fallback is the only option.
 */
function normalizeRtsCommandLogForSpec(raw: unknown): CommandInputLog {
    if (raw === undefined) return emptyCommandInputLog();
    const result = normalizeCommandInputLog(raw);
    return result.ok ? result.log : emptyCommandInputLog();
}

export function createCombatStepContext(spec: BattleSpec): CombatStepContext {
    const MARGIN = 8.0;
    const PANEL_W = 260.0;
    const LOG_H = 210.0;

    // In Godot 4, headless mode sets the visible rect size to the minimum window size (64x64)
    // This results in negative battle_rect sizes, and Godot's clamp() behaves differently than Math.min/max
    const headless_view_w = 64.0;
    const headless_view_h = 64.0;

    return {
        spec,
        participantOrder: spec.participantOrder,
        delta: (spec as any).fixedFps ? (1.0 / (spec as any).fixedFps) : spec.deltaSeconds,
        combatMode: spec.combatMode || 'legacy_gambit',
        battleRect: {
            x: MARGIN,
            y: MARGIN,
            w: headless_view_w - PANEL_W - MARGIN * 3.0,
            h: headless_view_h - LOG_H - MARGIN * 3.0
        },
        timeoutTicks: COMBAT_TIMEOUT_TICKS,
        commandLog: normalizeRtsCommandLogForSpec(spec.command),
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
    // ---------------------------------------------------------------------
    {
        const commandEvents = ctx.commandLog.events;
        let cursor = next.commandCursor;
        while (cursor < commandEvents.length && commandEvents[cursor].tick === tickCount) {
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

        // ▸ RTS order slot: a non-null order suppresses gambit evaluation,
        // movement, and auto-attack entirely — no blending (design §3). Cooldown
        // still decays above, same as any idle unit. move_to / attack_target /
        // attack_move execution is not implemented yet (PR4/PR5), so a unit
        // under one of those three orders simply idles, same as under `stop`,
        // until it is replaced, explicitly resumed, or dies.
        if (orders[unitName]) {
            continue;
        }

        const move_delta = f(delta);
        const gambits = (u.gambits && u.gambits.length > 0) ? u.gambits : getGambits(u.role);
        let ruleMatched = false;

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
