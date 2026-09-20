/**
 * COMBAT-RTS-MOVE-ATTACK-TARGET-001 focused tests.
 *
 * PR4 of docs/COMBAT_RTS_COMMAND_SPINE_DESIGN.md: deterministic execution for
 * move_to (straight-line movement, arrival, completion) and attack_target
 * (approach via the existing movement math, attack via the existing tryAttack
 * path, target-death completion). Neither introduces a second movement or
 * damage formula — both reuse gambitCombatCore's existing moveToward/tryAttack
 * closures. attack_move is out of scope (PR5) and untouched here.
 */

import * as assert from 'node:assert/strict';
import * as fs from 'fs';
import * as path from 'path';
import { describe, test } from 'node:test';
import {
    BattleSpec, CombatExpectedOutput, CombatState, CombatUnitState,
    combatTerminalOutcome, createCombatState, createCombatStepContext, resolveCombat, stepCombat,
} from './gambitCombatCore';
import { CommandInputEvent, CommandInputLog, COMMAND_INPUT_SCHEMA_VERSION } from './combatRtsCommandInputCore';
import { AbilityDefinition } from './combatAbilityTypes';

/**
 * A minimal, valid ability (shape matches resources/combat-abilities/v1-reference-abilities.json's
 * basic_slash). tryAttack's mechanics_v1 branch — and the canAct gate inside
 * it — is only taken when the unit has a normalAttackAbility; without one,
 * mechanics_v1 units fall through to the plain damage formula, which does not
 * check canAct and does not stay in sync with mechanicsStates[name].hp once
 * the mechanics_v1 tail block overwrites it next tick. Tests exercising the
 * real mechanics_v1 path need this.
 */
const TEST_SLASH: AbilityDefinition = {
    id: 'test_slash', name: 'Test Slash', tier: 'normal',
    delivery: { shape: 'single_target', range: 48, maxTargets: 1, falloff: 1, dodgeable: false, blockedByCover: false, pierces: false },
    effects: [{
        kind: 'damage', vector: 'physical',
        penetration: { barrier: 'blocked', armor: 'blocked', requiresBodyContact: false, requiresDamageDealt: false },
        targetRequirement: [], magnitude: 14, weaponScale: 'personal',
    }],
    auto: { cooldown: 0.9, gambitTags: ['burst'] },
    scaleBehavior: { individual: 'full', huge: 'attenuate', squad: 'aggregate', fleet: 'drop' },
    counters: [], tags: ['physical'],
};

const fixturesDir = path.join(__dirname, '../test/fixtures/combat');
const fixtureFiles = fs.readdirSync(fixturesDir).filter(f => f.startsWith('fixture_') && f.endsWith('.json')).sort();

function fixtureSpec(file: string): BattleSpec {
    const data = JSON.parse(fs.readFileSync(path.join(fixturesDir, file), 'utf8'));
    return {
        activePreset: data.activePreset,
        deltaSeconds: data.deltaSeconds || (1.0 / 60.0),
        fixedFps: data.fixedFps,
        viewport: data.viewport || { width: 1280, height: 720 },
        participantOrder: data.participantOrder,
        initialState: data.initialState,
    } as BattleSpec;
}

/** Two units far enough apart that gambit auto-approach never confuses a move_to/attack_target test. */
function unit(over: Partial<CombatUnitState> & { name: string; team: 0 | 1 }): any {
    return {
        role: 'Frontline', max_hp: 100, attack: 10, defense: 0, heal_power: 0,
        move_speed: 40, attack_range: 40, attack_cooldown: 0.5, radius: 12,
        pos_x: over.team === 0 ? 0 : 5000, pos_y: 0,
        ...over,
    };
}

function skirmishSpec(over: Partial<BattleSpec> = {}): BattleSpec {
    return {
        activePreset: 'rts-move-attack-target-test',
        deltaSeconds: 1 / 30,
        viewport: { width: 1280, height: 720 },
        participantOrder: ['ally_a', 'ally_b', 'enemy_a'],
        initialState: {
            units: {
                allies: [unit({ name: 'ally_a', team: 0 }), unit({ name: 'ally_b', team: 0, pos_y: 40 })],
                enemies: [unit({ name: 'enemy_a', team: 1 })],
            },
        },
        ...over,
    } as BattleSpec;
}

function commandLog(events: CommandInputEvent[], tickRate = 30): CommandInputLog {
    return { schemaVersion: COMMAND_INPUT_SCHEMA_VERSION, tickRate, events };
}

function moveTo(unitId: string, point: { x: number; y: number }, over: Partial<CommandInputEvent> = {}): CommandInputEvent {
    return { tick: 1, seq: 0, issuerTeam: 0, unitIds: [unitId], command: 'move_to', point, ...over } as CommandInputEvent;
}

function attackTarget(unitId: string, targetId: string, over: Partial<CommandInputEvent> = {}): CommandInputEvent {
    return { tick: 1, seq: 0, issuerTeam: 0, unitIds: [unitId], command: 'attack_target', targetId, ...over } as CommandInputEvent;
}

function activityFor(output: CombatExpectedOutput, unitId: string) {
    return {
        evaluations: output.evaluations.filter(e => e.unit === unitId),
        decisions: output.decisions.filter(e => e.unit === unitId),
        attacks: output.attacks.filter(e => e.unit === unitId),
    };
}

function receiptsFor(output: CombatExpectedOutput, unitId: string) {
    return (output.commandReceipts || []).filter(r => r.unitId === unitId);
}

/**
 * Advances a battle exactly `count` ticks via the raw step API, independent
 * of resolveCombat's full-run-to-completion behavior. Used for tests that only
 * care about mid-flight progress (e.g. a straight line partway to a move_to
 * point) and would otherwise have to reason about what a distant placeholder
 * enemy causes gambits to do once an order completes and control returns to
 * them, or about how the battle eventually times out.
 */
function runTicks(spec: BattleSpec, count: number): CombatState {
    const ctx = createCombatStepContext(spec);
    let state = createCombatState(spec);
    for (let i = 0; i < count; i++) {
        if (combatTerminalOutcome(state, ctx)) break;
        state = stepCombat(state, ctx).state;
    }
    return state;
}

/**
 * combatTerminalOutcome is checked BEFORE every stepCombat call, including the
 * very first one — a battle with zero living units on either team ends
 * instantly, before the command phase (or anything else) ever runs even once.
 * Tests that isolate one ally's move_to/attack_target behavior still need a
 * living, harmless placeholder on the other team so the battle actually runs
 * long enough to observe. Far enough away, and weak enough, that it never
 * reaches or meaningfully threatens anyone within these tests' windows.
 */
function harmlessDistantEnemy(name = 'harmless_enemy'): any {
    return unit({ name, team: 1, pos_x: 1_000_000, pos_y: 0, attack: 0, move_speed: 0 });
}

/** A stunned unit: canMove and canAct both false for the whole battle (mechanics_v1 only). */
function stunnedMechanicsUnit(over: Partial<CombatUnitState> & { name: string; team: 0 | 1 }): any {
    return unit({
        ...over,
        mechanics: {
            id: over.name, hp: over.hp ?? 100, maxHp: over.max_hp ?? 100, attack: over.attack ?? 10, defense: over.defense ?? 0,
            statuses: [{ id: 'stun', remainingSeconds: 3600, intensity: 1 }],
        },
    } as any);
}

describe('RTS move_to — compatibility with the existing golden master', () => {
    for (const file of fixtureFiles) {
        test(`${file}: command absent leaves output byte-identical`, () => {
            const spec = fixtureSpec(file);
            assert.equal(JSON.stringify(resolveCombat({ ...spec, command: undefined })), JSON.stringify(resolveCombat(spec)));
        });
        test(`${file}: an empty command log leaves output byte-identical`, () => {
            const spec = fixtureSpec(file);
            const baseline = resolveCombat(spec);
            const empty = resolveCombat({ ...spec, command: commandLog([], 60) });
            assert.equal(JSON.stringify(empty), JSON.stringify(baseline));
            assert.equal('commandReceipts' in empty, false);
        });
    }
});

describe('RTS move_to — straight-line movement and arrival', () => {
    test('moves in a straight line toward the point using the existing f()/fround discipline', () => {
        // Checked mid-flight, well before arrival (~300 ticks) or the harmless
        // placeholder mattering at all — after arrival, gambits would resume
        // and chase whatever enemy exists, which is not what this test is about.
        const spec = skirmishSpec({
            participantOrder: ['ally_a', 'harmless_enemy'],
            initialState: { units: { allies: [unit({ name: 'ally_a', team: 0, pos_x: 0, pos_y: 0, move_speed: 30 })], enemies: [harmlessDistantEnemy()] } },
            combatMode: undefined,
            command: commandLog([moveTo('ally_a', { x: 300, y: 0 })]),
        });
        const state = runTicks(spec, 10);
        const positions = state.units['ally_a'];
        // move_speed 30, delta 1/30 -> exactly 1 unit/tick -> 10 ticks -> x=10.
        assert.equal(positions.pos_x, 10);
        assert.equal(positions.pos_y, 0, 'straight line: y must not drift');
    });

    test('arrives and emits exactly one order_completed receipt, no more', () => {
        // Target point is within arrivalEpsilon (move_speed*delta ≈ 3.33) from
        // the unit's own starting position, so arrival is checked and satisfied
        // on tick 1 before any movement happens at all — the simplest possible
        // arrival case, and the position genuinely does not move.
        const spec = skirmishSpec({
            participantOrder: ['ally_a', 'harmless_enemy'],
            initialState: { units: { allies: [unit({ name: 'ally_a', team: 0, pos_x: 0, pos_y: 0, move_speed: 100 })], enemies: [harmlessDistantEnemy()] } },
            command: commandLog([moveTo('ally_a', { x: 2, y: 0 })]),
        });
        // Checked at the arrival tick itself — after this, gambits resume and
        // may move the unit again (e.g. toward the harmless placeholder),
        // which is expected and irrelevant to "exactly one completion receipt".
        const stateAtArrival = runTicks(spec, 1);
        assert.equal(stateAtArrival.units['ally_a'].pos_x, 0, 'arrival is checked before moving, so a target already within epsilon never moves the unit');
        assert.equal(stateAtArrival.orders['ally_a'], null, 'the order slot must be cleared on arrival');

        const output = resolveCombat(spec);
        const receipts = receiptsFor(output, 'ally_a');
        assert.deepEqual(receipts.filter(r => r.command === 'move_to').map(r => r.kind), ['order_accepted', 'order_started', 'order_completed']);
        assert.equal(receipts.filter(r => r.kind === 'order_completed').length, 1, 'exactly one completion for this one move_to order');
    });

    test('arrival threshold is exactly move_speed * delta: just outside it does not complete this tick, just inside it does', () => {
        const deltaSeconds = 1 / 30;
        const moveSpeed = 30; // arrivalEpsilon = 30 * (1/30) = 1
        const justOutside = skirmishSpec({
            participantOrder: ['ally_a', 'harmless_enemy'],
            deltaSeconds,
            initialState: { units: { allies: [unit({ name: 'ally_a', team: 0, pos_x: 0, pos_y: 0, move_speed: moveSpeed })], enemies: [harmlessDistantEnemy()] } },
            command: commandLog([moveTo('ally_a', { x: 1.5, y: 0 })], 30),
        });
        const justInside = skirmishSpec({
            participantOrder: ['ally_a', 'harmless_enemy'],
            deltaSeconds,
            initialState: { units: { allies: [unit({ name: 'ally_a', team: 0, pos_x: 0, pos_y: 0, move_speed: moveSpeed })], enemies: [harmlessDistantEnemy()] } },
            command: commandLog([moveTo('ally_a', { x: 0.5, y: 0 })], 30),
        });
        // Checked at tick 1 itself via the raw step state — resolveCombat runs
        // the whole battle, and the "outside" case legitimately DOES complete
        // one tick later (it closes the remaining sliver of distance on tick 2)
        // once gambits resume they may move the unit again regardless, so only
        // the tick-1 order state distinguishes "completed this tick" from not.
        const insideAtTick1 = runTicks(justInside, 1);
        const outsideAtTick1 = runTicks(justOutside, 1);
        assert.equal(insideAtTick1.orders['ally_a'], null, 'within arrivalEpsilon must complete tick 1');
        assert.notEqual(outsideAtTick1.orders['ally_a'], null, 'outside arrivalEpsilon must not complete the same tick');
        assert.equal(outsideAtTick1.orders['ally_a']!.command, 'move_to', 'the order must still be active, just not yet completed');

        const outsideReceiptsTick1 = receiptsFor(resolveCombat(justOutside), 'ally_a').filter(r => r.tick === 1).map(r => r.kind);
        const insideReceiptsTick1 = receiptsFor(resolveCombat(justInside), 'ally_a').filter(r => r.tick === 1).map(r => r.kind);
        assert.deepEqual(insideReceiptsTick1, ['order_accepted', 'order_started', 'order_completed']);
        assert.deepEqual(outsideReceiptsTick1, ['order_accepted', 'order_started']);
    });

    test('no attack occurs while move_to is active, even with an enemy in range along the path', () => {
        // The move_to point (x=200) is far past the enemy sitting at x=20, so
        // the unit eventually arrives, gambits resume, and it MAY then engage
        // the enemy normally — this test is only about the ~150 ticks while
        // move_to is still actively in progress, well before arrival.
        const spec = skirmishSpec({
            participantOrder: ['ally_a', 'enemy_a'],
            initialState: {
                units: {
                    allies: [unit({ name: 'ally_a', team: 0, pos_x: 0, pos_y: 0 })],
                    // Sits directly on the path to the move_to point, well within attack_range.
                    enemies: [unit({ name: 'enemy_a', team: 1, pos_x: 20, pos_y: 0, attack_range: 40 })],
                },
            },
            command: commandLog([moveTo('ally_a', { x: 200, y: 0 })]),
        });
        const output = resolveCombat(spec);
        const activity = activityFor(output, 'ally_a');
        const earlyWindow = 20; // well before arrival (~150 ticks) or even passing the enemy (~15 ticks)
        assert.equal(activity.attacks.filter(a => a.tick <= earlyWindow).length, 0, 'move_to must never auto-attack while still active');
        const finalUnit = output.finalState.units.find(u => u.name === 'ally_a')!;
        assert.ok(finalUnit.pos_x > 0, 'the unit must still have moved toward the point');
    });

    test('gambits resume starting the tick after arrival, not the arrival tick itself', () => {
        // Target within arrivalEpsilon from the start -> arrival on tick 1.
        const spec = skirmishSpec({
            participantOrder: ['ally_a', 'harmless_enemy'],
            initialState: { units: { allies: [unit({ name: 'ally_a', team: 0, pos_x: 0, pos_y: 0, move_speed: 100 })], enemies: [harmlessDistantEnemy()] } },
            command: commandLog([moveTo('ally_a', { x: 2, y: 0 })]),
        });
        const output = resolveCombat(spec);
        const activity = activityFor(output, 'ally_a');
        assert.ok(!activity.evaluations.some(e => e.tick === 1), 'no gambit evaluation on the arrival tick itself');
        assert.ok(activity.evaluations.some(e => e.tick === 2), 'gambit evaluation must resume tick 2, the tick after arrival');
    });

    test('temporarily disabled movement (mechanics_v1, canMove false) retains the order and idles', () => {
        const spec = skirmishSpec({
            combatMode: 'mechanics_v1',
            participantOrder: ['ally_a', 'harmless_enemy'],
            initialState: { units: { allies: [stunnedMechanicsUnit({ name: 'ally_a', team: 0, pos_x: 0, pos_y: 0 })], enemies: [harmlessDistantEnemy()] } },
            command: commandLog([moveTo('ally_a', { x: 100, y: 0 })]),
        });
        const output = resolveCombat(spec);
        const finalUnit = output.finalState.units.find(u => u.name === 'ally_a')!;
        assert.equal(finalUnit.pos_x, 0, 'a stunned unit must not move at all');
        const receipts = receiptsFor(output, 'ally_a');
        assert.deepEqual(receipts.map(r => r.kind), ['order_accepted', 'order_started'], 'the order must never complete while movement stays disabled');
    });
});

describe('RTS attack_target — acceptance rejects an invalid target without disturbing the batch', () => {
    test('a missing target is rejected with target_not_found', () => {
        const spec = skirmishSpec({ command: commandLog([attackTarget('ally_a', 'ghost_unit')]) });
        const output = resolveCombat(spec);
        assert.deepEqual(receiptsFor(output, 'ally_a').map(r => [r.kind, r.reason]), [['order_rejected', 'target_not_found']]);
    });

    test('a dead target is rejected with target_defeated', () => {
        // enemy_a is dead from the start; harmless_enemy keeps team 1 non-empty
        // so the battle does not end instantly (combatTerminalOutcome is
        // checked before every stepCombat call, including the first).
        const spec = skirmishSpec({
            participantOrder: ['ally_a', 'ally_b', 'enemy_a', 'harmless_enemy'],
            initialState: {
                units: {
                    allies: [unit({ name: 'ally_a', team: 0 }), unit({ name: 'ally_b', team: 0, pos_y: 40 })],
                    enemies: [unit({ name: 'enemy_a', team: 1, hp: 0 } as any), harmlessDistantEnemy()],
                },
            },
            command: commandLog([attackTarget('ally_a', 'enemy_a')]),
        });
        const output = resolveCombat(spec);
        assert.deepEqual(receiptsFor(output, 'ally_a').map(r => [r.kind, r.reason]), [['order_rejected', 'target_defeated']]);
    });

    test('a same-team target is rejected with invalid_target', () => {
        const spec = skirmishSpec({ command: commandLog([attackTarget('ally_a', 'ally_b')]) });
        const output = resolveCombat(spec);
        assert.deepEqual(receiptsFor(output, 'ally_a').map(r => [r.kind, r.reason]), [['order_rejected', 'invalid_target']]);
    });

    test('rejection does not replace the unit\'s currently active order', () => {
        const spec = skirmishSpec({
            command: commandLog([
                moveTo('ally_a', { x: 5000, y: 0 }, { tick: 1, seq: 0 }),
                attackTarget('ally_a', 'ally_b', { tick: 2, seq: 0 }), // invalid: same team
            ]),
        });
        const output = resolveCombat(spec);
        const receipts = receiptsFor(output, 'ally_a');
        assert.deepEqual(
            receipts.map(r => [r.tick, r.command, r.kind, r.reason]),
            [
                [1, 'move_to', 'order_accepted', undefined],
                [1, 'move_to', 'order_started', undefined],
                [2, 'attack_target', 'order_rejected', 'invalid_target'],
            ],
        );
        // The original move_to order must still be the active one — proven by
        // the unit still moving on later ticks instead of sitting idle.
        const finalUnit = output.finalState.units.find(u => u.name === 'ally_a')!;
        assert.ok(finalUnit.pos_x > 0, 'move_to must still be in effect after the attack_target rejection');
    });

    test('a rejected command for one unit does not abort the rest of a multi-unit selection', () => {
        const spec = skirmishSpec({
            command: commandLog([
                { tick: 1, seq: 0, issuerTeam: 0, unitIds: ['ally_a', 'ally_b'], command: 'attack_target', targetId: 'ghost_unit' } as CommandInputEvent,
            ]),
        });
        const output = resolveCombat(spec);
        assert.deepEqual(receiptsFor(output, 'ally_a').map(r => r.kind), ['order_rejected']);
        assert.deepEqual(receiptsFor(output, 'ally_b').map(r => r.kind), ['order_rejected']);
    });

    test('a valid attack_target in the same multi-unit selection as an invalid one is still accepted', () => {
        const spec = skirmishSpec({
            command: commandLog([
                { tick: 1, seq: 0, issuerTeam: 0, unitIds: ['ally_a', 'ally_b'], command: 'attack_target', targetId: 'enemy_a' } as CommandInputEvent,
                { tick: 1, seq: 1, issuerTeam: 0, unitIds: ['ally_a'], command: 'attack_target', targetId: 'ally_b' } as CommandInputEvent, // ally_a's own order now invalid
            ]),
        });
        const output = resolveCombat(spec);
        // Both units' attack_target orders are live and may run all the way to
        // completion (target death) over a long battle — restrict to tick 1,
        // the acceptance moment this test is actually about.
        const aTick1 = receiptsFor(output, 'ally_a').filter(r => r.tick === 1);
        const bTick1 = receiptsFor(output, 'ally_b').filter(r => r.tick === 1);
        // ally_a: first accepted, then rejected (invalid_target) on its second event — order slot untouched by the rejection.
        assert.deepEqual(aTick1.map(r => [r.command, r.kind, r.reason]), [
            ['attack_target', 'order_accepted', undefined],
            ['attack_target', 'order_started', undefined],
            ['attack_target', 'order_rejected', 'invalid_target'],
        ]);
        // ally_b: unaffected by ally_a's second event, cleanly accepted.
        assert.deepEqual(bTick1.map(r => r.kind), ['order_accepted', 'order_started']);
    });
});

describe('RTS attack_target — execution', () => {
    test('approaches the target through the existing movement path when out of range', () => {
        const spec = skirmishSpec({
            participantOrder: ['ally_a', 'enemy_a'],
            initialState: {
                units: {
                    allies: [unit({ name: 'ally_a', team: 0, pos_x: 0, pos_y: 0 })],
                    enemies: [unit({ name: 'enemy_a', team: 1, pos_x: 200, pos_y: 0, attack_range: 40 })],
                },
            },
            command: commandLog([attackTarget('ally_a', 'enemy_a')]),
        });
        const output = resolveCombat(spec);
        const activity = activityFor(output, 'ally_a');
        assert.equal(activity.attacks.filter(e => e.tick <= 5).length, 0, 'must not attack while still out of range');
        const finalUnit = output.finalState.units.find(u => u.name === 'ally_a')!;
        assert.ok(finalUnit.pos_x > 0, 'must have approached the target');
    });

    test('attacks through the existing tryAttack path once in range, dealing damage', () => {
        const spec = skirmishSpec({
            participantOrder: ['ally_a', 'enemy_a'],
            initialState: {
                units: {
                    allies: [unit({ name: 'ally_a', team: 0, pos_x: 0, pos_y: 0, attack_range: 40, attack: 20 })],
                    enemies: [unit({ name: 'enemy_a', team: 1, pos_x: 20, pos_y: 0, max_hp: 200, hp: 200 })],
                },
            },
            command: commandLog([attackTarget('ally_a', 'enemy_a')]),
        });
        const output = resolveCombat(spec);
        const activity = activityFor(output, 'ally_a');
        assert.ok(activity.attacks.length > 0, 'expected at least one attack through tryAttack');
        assert.ok(activity.attacks.every(a => a.target === 'enemy_a'));
        const finalEnemy = output.finalState.units.find(u => u.name === 'enemy_a')!;
        assert.ok(finalEnemy.hp < 200, 'the target must have taken damage');
    });

    test('target death mid-execution (killed by this unit\'s own attack) completes the order the same tick', () => {
        const spec = skirmishSpec({
            participantOrder: ['ally_a', 'enemy_a'],
            initialState: {
                units: {
                    allies: [unit({ name: 'ally_a', team: 0, pos_x: 0, pos_y: 0, attack_range: 40, attack: 999 })],
                    enemies: [unit({ name: 'enemy_a', team: 1, pos_x: 20, pos_y: 0, max_hp: 10, hp: 10 })],
                },
            },
            command: commandLog([attackTarget('ally_a', 'enemy_a')]),
        });
        const output = resolveCombat(spec);
        const receipts = receiptsFor(output, 'ally_a');
        assert.deepEqual(receipts.map(r => [r.kind, r.reason]), [
            ['order_accepted', undefined],
            ['order_started', undefined],
            ['order_completed', 'target_defeated'],
        ]);
        assert.equal(receipts[0].tick, 1);
        assert.equal(receipts[2].tick, 1, 'must complete the same tick the killing blow lands, not one tick later');
        assert.ok(output.deaths.some(d => d.unit === 'enemy_a'));
    });

    test('target death from another source (not this unit) still completes the order and resumes gambits next tick', () => {
        // A second, harmless enemy keeps team 1 alive after enemy_a dies, so
        // the battle keeps running long enough for ally_a's own next-tick
        // check to notice the death and complete its order — otherwise the
        // battle would end (victory) the instant enemy_a, the only enemy,
        // died, before ally_a ever gets another turn.
        const spec = skirmishSpec({
            participantOrder: ['ally_a', 'ally_b', 'enemy_a', 'harmless_enemy'],
            initialState: {
                units: {
                    // ally_a is far from enemy_a and will never land a hit itself;
                    // ally_b (unordered, normal gambits) kills enemy_a instead.
                    allies: [
                        unit({ name: 'ally_a', team: 0, pos_x: -500, pos_y: 0, attack_range: 40 }),
                        unit({ name: 'ally_b', team: 0, pos_x: 20, pos_y: 0, attack: 999, attack_range: 40 }),
                    ],
                    enemies: [unit({ name: 'enemy_a', team: 1, pos_x: 0, pos_y: 0, max_hp: 10, hp: 10 }), harmlessDistantEnemy()],
                },
            },
            command: commandLog([attackTarget('ally_a', 'enemy_a')]),
        });
        const output = resolveCombat(spec);
        const receipts = receiptsFor(output, 'ally_a');
        const completed = receipts.find(r => r.kind === 'order_completed');
        assert.ok(completed, 'expected attack_target to complete once enemy_a died');
        assert.equal(completed!.reason, 'target_defeated');
        const activity = activityFor(output, 'ally_a');
        assert.ok(!activity.evaluations.some(e => e.tick <= completed!.tick), 'no gambit evaluation up to and including the completion tick');
        assert.ok(activity.evaluations.some(e => e.tick === completed!.tick + 1), 'gambits resume exactly the following tick');
    });

    test('two units both attack_target the same enemy: the earlier-processed unit still completes when the later one lands the kill (Codex review on PR #35)', () => {
        // participantOrder puts ally_a before ally_b. ally_a's own per-tick
        // "target still alive?" check runs and passes BEFORE ally_b's turn,
        // in the same tick, deals the killing blow. Without the end-of-tick
        // sweep, ally_a's order would never receive order_completed — and
        // since enemy_a is the only enemy, the battle ends in victory this
        // exact tick, so there is no later tick for ally_a to notice on its own.
        const spec = skirmishSpec({
            participantOrder: ['ally_a', 'ally_b', 'enemy_a'],
            initialState: {
                units: {
                    allies: [
                        unit({ name: 'ally_a', team: 0, pos_x: 0, pos_y: 0, attack_range: 40, attack: 1 }),
                        unit({ name: 'ally_b', team: 0, pos_x: 0, pos_y: 0, attack_range: 40, attack: 999 }),
                    ],
                    enemies: [unit({ name: 'enemy_a', team: 1, pos_x: 20, pos_y: 0, max_hp: 10, hp: 10 })],
                },
            },
            command: commandLog([
                { tick: 1, seq: 0, issuerTeam: 0, unitIds: ['ally_a', 'ally_b'], command: 'attack_target', targetId: 'enemy_a' } as CommandInputEvent,
            ]),
        });
        const output = resolveCombat(spec);

        const aReceipts = receiptsFor(output, 'ally_a');
        const bReceipts = receiptsFor(output, 'ally_b');
        assert.deepEqual(aReceipts.map(r => [r.kind, r.reason]), [
            ['order_accepted', undefined],
            ['order_started', undefined],
            ['order_completed', 'target_defeated'],
        ], 'the earlier-processed unit must still receive its completion receipt');
        assert.deepEqual(bReceipts.map(r => [r.kind, r.reason]), [
            ['order_accepted', undefined],
            ['order_started', undefined],
            ['order_completed', 'target_defeated'],
        ]);
        assert.equal(aReceipts[2].tick, 1);
        assert.equal(bReceipts[2].tick, 1, 'both complete on the same tick the target actually died');
    });

    test('a holder that kills its own target and is then killed itself, same tick, receives order_interrupted, not order_completed (Codex review on PR #35, discussion r3619920590)', () => {
        // participantOrder: ally_a acts first and one-shots its attack_target
        // (enemy_a). enemy_b, hostile to ally_a and processed later this same
        // tick, one-shots ally_a back via its own default gambits (no order
        // needed — the same mechanism ally_b used unordered in the test
        // above). Holder-death priority (design §3) means a holder that dies
        // this same tick must be reported as order_interrupted, even though
        // its own target died first, earlier in this same tick's per-unit
        // loop. Completing inline (the pre-fix behavior) would clear
        // orders['ally_a'] and emit order_completed before ally_a's own
        // death was known, leaving the end-of-tick sweeps unable to correct
        // it: the target-death sweep would already see no active order, and
        // the interruption sweep would find nothing left to interrupt.
        const spec = skirmishSpec({
            participantOrder: ['ally_a', 'enemy_b', 'enemy_a'],
            initialState: {
                units: {
                    allies: [unit({ name: 'ally_a', team: 0, pos_x: 0, pos_y: 0, attack_range: 40, attack: 999, hp: 10, max_hp: 10 })],
                    enemies: [
                        unit({ name: 'enemy_a', team: 1, pos_x: 20, pos_y: 0, max_hp: 10, hp: 10, attack: 0 }),
                        unit({ name: 'enemy_b', team: 1, pos_x: 0, pos_y: 0, attack_range: 40, attack: 999 }),
                    ],
                },
            },
            command: commandLog([attackTarget('ally_a', 'enemy_a')]),
        });
        const output = resolveCombat(spec);

        const aReceipts = receiptsFor(output, 'ally_a');
        assert.deepEqual(aReceipts.map(r => [r.kind, r.reason]), [
            ['order_accepted', undefined],
            ['order_started', undefined],
            ['order_interrupted', undefined],
        ], 'holder-death priority: the holder must be interrupted, not completed, when it also dies this same tick');
        assert.equal(aReceipts[2].tick, 1);
        assert.ok(!aReceipts.some(r => r.kind === 'order_completed'), 'must never also emit order_completed for the same order');

        const finalEnemyA = output.finalState.units.find(u => u.name === 'enemy_a');
        assert.ok(!finalEnemyA || finalEnemyA.hp <= 0, 'enemy_a still actually died from ally_a\'s attack this tick');
    });

    test('temporarily disabled action (mechanics_v1, canAct false) retains the order and idles without attacking', () => {
        // canAct is only checked inside tryAttack's mechanics_v1-ability branch
        // (gated behind normalAttackAbility being set) — without an ability, a
        // mechanics_v1 unit falls through to the plain damage formula, which
        // never checks canAct at all. ally_a needs a real ability to exercise
        // the gate this test is actually about. enemy_a's own attack is
        // neutered (attack: 0) so this test only has to reason about ally_a's
        // side, not whether ally_a itself survives being attacked back.
        const spec = skirmishSpec({
            combatMode: 'mechanics_v1',
            participantOrder: ['ally_a', 'enemy_a'],
            initialState: {
                units: {
                    allies: [{
                        ...stunnedMechanicsUnit({ name: 'ally_a', team: 0, pos_x: 0, pos_y: 0, attack_range: 40 }),
                        normalAttackAbility: TEST_SLASH,
                    }],
                    enemies: [unit({ name: 'enemy_a', team: 1, pos_x: 20, pos_y: 0, attack: 0 })],
                },
            },
            command: commandLog([attackTarget('ally_a', 'enemy_a')]),
        });
        const output = resolveCombat(spec);
        const activity = activityFor(output, 'ally_a');
        assert.equal(activity.attacks.length, 0, 'a stunned unit must never land an attack');
        const receipts = receiptsFor(output, 'ally_a');
        assert.deepEqual(receipts.map(r => r.kind), ['order_accepted', 'order_started'], 'the order must persist while canAct stays false');
    });

    test('temporarily disabled action WITHOUT a normalAttackAbility still retains the order and idles (the exact gap review found)', () => {
        // The regression this exists to pin: tryAttack's canAct check only runs
        // inside its mechanics_v1-ability branch. Without normalAttackAbility, a
        // mechanics_v1 unit fell through to the plain damage formula, which
        // never checks canAct at all — a stunned unit with no ability could
        // still attack through an active attack_target order. This is the exact
        // state the previous test avoided by always equipping TEST_SLASH.
        const spec = skirmishSpec({
            combatMode: 'mechanics_v1',
            participantOrder: ['ally_a', 'enemy_a'],
            initialState: {
                units: {
                    allies: [stunnedMechanicsUnit({ name: 'ally_a', team: 0, pos_x: 0, pos_y: 0, attack_range: 40 })], // no normalAttackAbility
                    enemies: [unit({ name: 'enemy_a', team: 1, pos_x: 20, pos_y: 0, attack: 0, max_hp: 100, hp: 100 })],
                },
            },
            command: commandLog([attackTarget('ally_a', 'enemy_a')]),
        });
        const output = resolveCombat(spec);
        const activity = activityFor(output, 'ally_a');
        assert.equal(activity.attacks.length, 0, 'a stunned unit with no ability must still never land an attack');
        const finalEnemy = output.finalState.units.find(u => u.name === 'enemy_a')!;
        assert.equal(finalEnemy.hp, 100, 'the target must take no damage at all');
        const receipts = receiptsFor(output, 'ally_a');
        assert.deepEqual(receipts.map(r => r.kind), ['order_accepted', 'order_started'], 'the order must persist and never complete while disabled');
        assert.equal(output.outcome, 'Timeout', 'neither side can ever act, so the battle must simply time out');
    });

    test('a unit disabled by canMove=false (paralysis; canAct still true) also does not approach an out-of-range target', () => {
        // paralysis blocks canMove but NOT canAct (combatMechanicsResolver.ts).
        // Per the task's exact contract, BOTH gates are checked together before
        // either movement or attack — a unit that could technically still act
        // must not move toward an out-of-range target while paralyzed.
        const spec = skirmishSpec({
            combatMode: 'mechanics_v1',
            participantOrder: ['ally_a', 'enemy_a'],
            initialState: {
                units: {
                    allies: [unit({
                        name: 'ally_a', team: 0, pos_x: 0, pos_y: 0, attack_range: 40,
                        mechanics: { id: 'ally_a', hp: 100, maxHp: 100, attack: 20, defense: 0, statuses: [{ id: 'paralysis', remainingSeconds: 3600, intensity: 1 }] },
                    } as any)],
                    enemies: [unit({ name: 'enemy_a', team: 1, pos_x: 200, pos_y: 0, attack: 0 })], // out of range
                },
            },
            command: commandLog([attackTarget('ally_a', 'enemy_a')]),
        });
        const state = runTicks(spec, 10);
        assert.equal(state.units['ally_a'].pos_x, 0, 'a paralyzed unit must not approach, even though it could technically still act');
        assert.notEqual(state.orders['ally_a'], null, 'the order must still be retained');
    });

    test('after the disabling status expires, the retained order resumes and attacks normally', () => {
        const spec = skirmishSpec({
            combatMode: 'mechanics_v1',
            participantOrder: ['ally_a', 'enemy_a'],
            initialState: {
                units: {
                    allies: [unit({
                        name: 'ally_a', team: 0, pos_x: 0, pos_y: 0, attack_range: 40,
                        // Expires after 2 ticks at delta = 1/30 (remainingSeconds
                        // decays by `delta` each tick, clamped at 0).
                        mechanics: { id: 'ally_a', hp: 100, maxHp: 100, attack: 20, defense: 0, statuses: [{ id: 'stun', remainingSeconds: 2 / 30, intensity: 1 }] },
                    } as any)],
                    enemies: [unit({ name: 'enemy_a', team: 1, pos_x: 20, pos_y: 0, attack: 0, max_hp: 1000, hp: 1000 })],
                },
            },
            command: commandLog([attackTarget('ally_a', 'enemy_a')]),
        });
        const output = resolveCombat(spec);
        const activity = activityFor(output, 'ally_a');
        assert.equal(activity.attacks.filter(a => a.tick <= 2).length, 0, 'no attack while still stunned');
        assert.ok(activity.attacks.some(a => a.tick > 2), 'the SAME order must resume attacking once the stun lifts, without needing a new command');
        const receipts = receiptsFor(output, 'ally_a');
        assert.equal(receipts.filter(r => r.kind === 'order_accepted').length, 1, 'only ever accepted once — no new command was issued');
    });

    test('a target that dies while the acting unit is disabled still completes with target_defeated, not left stale', () => {
        // ally_b (unordered, normal gambits, in range) kills enemy_a while
        // ally_a (holding attack_target on the same enemy) is stunned and never
        // gets to act at all — the end-of-tick sweep must still complete
        // ally_a's order, since it does not depend on ally_a having acted.
        const spec = skirmishSpec({
            combatMode: 'mechanics_v1',
            participantOrder: ['ally_a', 'ally_b', 'enemy_a', 'harmless_enemy'],
            initialState: {
                units: {
                    allies: [
                        stunnedMechanicsUnit({ name: 'ally_a', team: 0, pos_x: 0, pos_y: 0, attack_range: 40 }),
                        unit({ name: 'ally_b', team: 0, pos_x: 20, pos_y: 0, attack: 999, attack_range: 40 }),
                    ],
                    enemies: [unit({ name: 'enemy_a', team: 1, pos_x: 20, pos_y: 0, max_hp: 10, hp: 10 }), harmlessDistantEnemy()],
                },
            },
            command: commandLog([attackTarget('ally_a', 'enemy_a')]),
        });
        const output = resolveCombat(spec);
        const activity = activityFor(output, 'ally_a');
        assert.equal(activity.attacks.length, 0, 'ally_a itself, stunned, never attacks');
        const receipts = receiptsFor(output, 'ally_a');
        assert.deepEqual(receipts.map(r => [r.kind, r.reason]), [
            ['order_accepted', undefined],
            ['order_started', undefined],
            ['order_completed', 'target_defeated'],
        ]);
        assert.equal(receipts[2].tick, 1, 'ally_b kills enemy_a on tick 1; the sweep must complete ally_a the same tick');
    });

    test('repeated runs of the disabled-unit attack_target scenario remain deterministic', () => {
        const spec = skirmishSpec({
            combatMode: 'mechanics_v1',
            participantOrder: ['ally_a', 'enemy_a'],
            initialState: {
                units: {
                    allies: [stunnedMechanicsUnit({ name: 'ally_a', team: 0, pos_x: 0, pos_y: 0, attack_range: 40 })],
                    enemies: [unit({ name: 'enemy_a', team: 1, pos_x: 20, pos_y: 0, attack: 0 })],
                },
            },
            command: commandLog([attackTarget('ally_a', 'enemy_a')]),
        });
        const a = resolveCombat(structuredClone(spec));
        const b = resolveCombat(structuredClone(spec));
        assert.equal(JSON.stringify(a), JSON.stringify(b));
    });

    test('legacy_gambit: attack_target deals damage through the plain damage formula path', () => {
        // enemy_a fights back (default gambits) and the battle runs to a real
        // conclusion, so final hp reflects the whole fight, not one hit —
        // the FIRST attack event is what pins the plain formula's exact result.
        const spec = skirmishSpec({
            participantOrder: ['ally_a', 'enemy_a'],
            initialState: {
                units: {
                    allies: [unit({ name: 'ally_a', team: 0, pos_x: 0, pos_y: 0, attack_range: 40, attack: 15, defense: 0 })],
                    enemies: [unit({ name: 'enemy_a', team: 1, pos_x: 20, pos_y: 0, max_hp: 100, hp: 100, defense: 0 })],
                },
            },
            command: commandLog([attackTarget('ally_a', 'enemy_a')]),
        });
        const output = resolveCombat(spec);
        assert.equal(output.mechanicsReceipts, undefined, 'legacy_gambit must never produce mechanicsReceipts');
        const firstAttack = activityFor(output, 'ally_a').attacks[0];
        assert.ok(firstAttack, 'expected at least one attack');
        assert.equal(firstAttack.damage, 15, 'plain damage = max(1, attack - defense) = 15');
    });

    test('mechanics_v1: attack_target routes through resolveMechanics and produces mechanicsReceipts', () => {
        // normalAttackAbility is required to take tryAttack's mechanics_v1
        // branch at all — without one, mechanics_v1 units fall through to the
        // plain formula, whose direct CombatUnitState.hp write gets clobbered
        // the very next tick by the mechanics_v1 tail block re-syncing
        // units[name].hp from the (in that case, never-updated) mechanicsStates.
        const spec = skirmishSpec({
            combatMode: 'mechanics_v1',
            participantOrder: ['ally_a', 'enemy_a'],
            initialState: {
                units: {
                    allies: [{
                        ...unit({ name: 'ally_a', team: 0, pos_x: 0, pos_y: 0, attack_range: 48 }),
                        normalAttackAbility: TEST_SLASH,
                        mechanics: { id: 'ally_a', hp: 100, maxHp: 100, attack: 20, defense: 0 },
                    }],
                    enemies: [unit({
                        name: 'enemy_a', team: 1, pos_x: 20, pos_y: 0, max_hp: 100, hp: 100, attack: 0,
                        mechanics: { id: 'enemy_a', hp: 100, maxHp: 100, attack: 0, defense: 0 },
                    } as any)],
                },
            },
            command: commandLog([attackTarget('ally_a', 'enemy_a')]),
        });
        const output = resolveCombat(spec);
        const activity = activityFor(output, 'ally_a');
        assert.ok(activity.attacks.length > 0, 'expected at least one attack');
        assert.ok((output.mechanicsReceipts || []).length > 0, 'expected mechanicsReceipts from resolveMechanics');
        const firstAttack = activity.attacks[0];
        assert.equal(firstAttack.damage, 14, 'TEST_SLASH magnitude 14, no defense/resistance to reduce it');
    });
});

describe('RTS move_to / attack_target — determinism', () => {
    test('repeated runs of the same spec + command log produce byte-identical JSON', () => {
        const spec = skirmishSpec({
            command: commandLog([
                moveTo('ally_a', { x: 50, y: 0 }, { tick: 1, seq: 0, unitIds: ['ally_b'] }),
                attackTarget('ally_a', 'enemy_a', { tick: 1, seq: 1 }),
            ]),
        });
        const a = resolveCombat(structuredClone(spec));
        const b = resolveCombat(structuredClone(spec));
        assert.equal(JSON.stringify(a), JSON.stringify(b));
    });

    test('a full move_to-to-arrival run is deterministic across repeated calls', () => {
        const spec = skirmishSpec({
            participantOrder: ['ally_a'],
            initialState: { units: { allies: [unit({ name: 'ally_a', team: 0, pos_x: 0, pos_y: 0 })], enemies: [] } },
            command: commandLog([moveTo('ally_a', { x: 137.5, y: -42.25 })]),
        });
        const a = resolveCombat(structuredClone(spec));
        const b = resolveCombat(structuredClone(spec));
        assert.equal(JSON.stringify(a), JSON.stringify(b));
    });
});
