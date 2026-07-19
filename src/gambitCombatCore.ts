import { AbilityDefinition, StatusDefinition } from './combatAbilityTypes';
import { advanceMechanicsState, canAct, canMove, MechanicsCombatant, MechanicsReceipt, resolveMechanics } from './combatMechanicsResolver';

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
    finalState: {
        units: { name: string; hp: number; pos_x: number; pos_y: number }[];
    };
    outcome: string;
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

export function resolveCombat(spec: BattleSpec): CombatExpectedOutput {
    let tickCount = 0;
    const timeoutTicks = 3600;

    const units: Record<string, CombatUnitState> = {};
    const alliesRaw = spec.initialState.units.allies || [];
    const enemiesRaw = spec.initialState.units.enemies || [];

    for (const u of alliesRaw) {
        units[u.name] = { hp: u.max_hp, ...u, team: 0, _cooldown_timer: 0.0, _dead: false, _last_action: "" };
    }
    for (const u of enemiesRaw) {
        units[u.name] = { hp: u.max_hp, ...u, team: 1, _cooldown_timer: 0.0, _dead: false, _last_action: "" };
    }

    const participantOrder = spec.participantOrder;

    const evaluations: CombatEvent[] = [];
    const decisions: CombatEvent[] = [];
    const attacks: CombatEvent[] = [];
    const heals: CombatEvent[] = [];
    const deaths: CombatEvent[] = [];
    const focusChanges: CombatEvent[] = [];
    const mechanicsReceipts: Array<CombatEvent & { receipt: MechanicsReceipt }> = [];
    const combatMode: CombatMode = spec.combatMode || 'legacy_gambit';
    const mechanicsStates: Record<string, MechanicsCombatant> = {};

    if (combatMode === 'mechanics_v1') {
        for (const name of Object.keys(units)) {
            const unit = units[name];
            mechanicsStates[name] = unit.mechanics ? structuredClone(unit.mechanics) : { id: name, hp: unit.hp, maxHp: unit.max_hp, attack: unit.attack, defense: unit.defense };
        }
    }

    const lastEvals: Record<string, string> = {};
    const focusTarget: Record<number, string> = {};

    let outcome = "";

    const MARGIN = 8.0;
    const PANEL_W = 260.0;
    const LOG_H = 210.0;
    const delta = (spec as any).fixedFps ? (1.0 / (spec as any).fixedFps) : spec.deltaSeconds;

    // In Godot 4, headless mode sets the visible rect size to the minimum window size (64x64)
    // This results in negative battle_rect sizes, and Godot's clamp() behaves differently than Math.min/max
    const headless_view_w = 64.0;
    const headless_view_h = 64.0;
    const battle_rect = {
        x: MARGIN,
        y: MARGIN,
        w: headless_view_w - PANEL_W - MARGIN * 3.0,
        h: headless_view_h - LOG_H - MARGIN * 3.0
    };

    function godotClamp(val: number, min: number, max: number): number {
        return Math.min(max, Math.max(min, val));
    }

    function clampToBattlefield(u: CombatUnitState) {
        const m = u.radius + 2.0;
        u.pos_x = godotClamp(u.pos_x, battle_rect.x + m, battle_rect.x + battle_rect.w - m);
        u.pos_y = godotClamp(u.pos_y, battle_rect.y + m, battle_rect.y + battle_rect.h - m);
    }

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

    while (tickCount <= timeoutTicks) {
        if (countAlive(1) === 0) {
            outcome = "勝利！ 敵を全滅させた";
            break;
        } else if (countAlive(0) === 0) {
            outcome = "敗北… 味方が全滅した";
            break;
        }

        tickCount++;

        // Evaluate gambits
        for (const unitName of participantOrder) {
            const u = units[unitName];
            if (!u || u.hp <= 0) continue;

            if (u._cooldown_timer > 0.0) {
                u._cooldown_timer -= delta;
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
                u._cooldown_timer = u.attack_cooldown;
                const tu = units[targetName];
                if (combatMode === 'mechanics_v1' && u.normalAttackAbility) {
                    if (!canAct(mechanicsStates[u.name])) return;
                    const result = resolveMechanics({ ability: u.normalAttackAbility, attacker: mechanicsStates[u.name], target: mechanicsStates[targetName], statuses: spec.mechanics?.statuses || [] });
                    mechanicsStates[targetName] = result.target;
                    tu.hp = result.target.hp;
                    focusTarget[u.team] = targetName;
                    focusChanges.push({ tick: tickCount, team: u.team, target: targetName });
                    attacks.push({ tick: tickCount, unit: u.name, target: targetName, damage: result.damageDealt });
                    for (const receipt of result.receipts) mechanicsReceipts.push({ tick: tickCount, unit: u.name, target: targetName, receipt });
                    if (tu.hp <= 0) { tu.hp = 0; tu._dead = true; deaths.push({ tick: tickCount, unit: targetName }); }
                    return;
                }
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
            for (const name of Object.keys(mechanicsStates)) {
                mechanicsStates[name] = advanceMechanicsState(mechanicsStates[name], delta);
                units[name].hp = mechanicsStates[name].hp;
                if (units[name].hp <= 0) { units[name].hp = 0; units[name]._dead = true; }
            }
        }
    }

    if (tickCount > timeoutTicks && outcome === "") {
        outcome = "Timeout";
    }

    const finalStateUnits = participantOrder.map(name => {
        const u = units[name];
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
    if (combatMode === 'mechanics_v1') output.mechanicsReceipts = mechanicsReceipts;
    return output;
}
