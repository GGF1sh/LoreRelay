/**
 * COMBAT-RTS-ATTACK-MOVE-001 focused tests.
 *
 * PR5 of docs/COMBAT_RTS_COMMAND_SPINE_DESIGN.md: deterministic V1 execution
 * for attack_move — each tick, stop and fight the nearest living enemy
 * currently within attack_range (reusing the existing tryAttack path, ties
 * broken by participantOrder), otherwise resume straight-line movement
 * toward the destination (reusing move_to's own moveTowardPoint/f()
 * discipline). No second movement or damage formula, and no persistent
 * target slot — candidates are reacquired fresh from current position every
 * tick, unlike attack_target. move_to and attack_target are untouched here.
 */

import * as assert from 'node:assert/strict';
import * as fs from 'fs';
import * as path from 'path';
import { describe, test } from 'node:test';
import {
    BattleSpec, CombatExpectedOutput, CombatState, CombatStepEvents, CombatUnitState,
    combatTerminalOutcome, createCombatState, createCombatStepContext, resolveCombat, stepCombat,
} from './gambitCombatCore';
import { CommandInputEvent, CommandInputLog, COMMAND_INPUT_SCHEMA_VERSION } from './combatRtsCommandInputCore';
import { AbilityDefinition } from './combatAbilityTypes';

/**
 * A minimal, valid ability (shape matches resources/combat-abilities/v1-reference-abilities.json's
 * basic_slash). tryAttack's mechanics_v1 branch is only taken when the unit
 * has a normalAttackAbility; without one, mechanics_v1 units fall through to
 * the plain damage formula.
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
        activePreset: 'rts-attack-move-test',
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

function attackMove(unitId: string, point: { x: number; y: number }, over: Partial<CommandInputEvent> = {}): CommandInputEvent {
    return { tick: 1, seq: 0, issuerTeam: 0, unitIds: [unitId], command: 'attack_move', point, ...over } as CommandInputEvent;
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

/** Advances a battle exactly `count` ticks via the raw step API, returning only the final state. */
function runTicks(spec: BattleSpec, count: number): CombatState {
    const ctx = createCombatStepContext(spec);
    let state = createCombatState(spec);
    for (let i = 0; i < count; i++) {
        if (combatTerminalOutcome(state, ctx)) break;
        state = stepCombat(state, ctx).state;
    }
    return state;
}

/** Same as runTicks, but also returns each tick's own events, indexed 0-based (events[0] is tick 1's). */
function runTicksCollecting(spec: BattleSpec, count: number): { state: CombatState; events: CombatStepEvents[] } {
    const ctx = createCombatStepContext(spec);
    let state = createCombatState(spec);
    const events: CombatStepEvents[] = [];
    for (let i = 0; i < count; i++) {
        if (combatTerminalOutcome(state, ctx)) break;
        const result = stepCombat(state, ctx);
        state = result.state;
        events.push(result.events);
    }
    return { state, events };
}

/**
 * A harmless, distant placeholder that keeps the opposing team alive without
 * interfering — combatTerminalOutcome ends a battle instantly once one side
 * has zero living units, before any per-unit logic (including this file's
 * attack_move execution) ever runs even once.
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

describe('RTS attack_move — compatibility with the existing golden master', () => {
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

describe('RTS attack_move — execution', () => {
    test('no enemy in range -> moves toward the destination in a straight line', () => {
        const spec = skirmishSpec({
            participantOrder: ['ally_a', 'harmless_enemy'],
            initialState: { units: { allies: [unit({ name: 'ally_a', team: 0, pos_x: 0, pos_y: 0, move_speed: 30 })], enemies: [harmlessDistantEnemy()] } },
            command: commandLog([attackMove('ally_a', { x: 300, y: 0 })]),
        });
        const state = runTicks(spec, 10);
        // move_speed 30, delta 1/30 -> exactly 1 unit/tick -> 10 ticks -> x=10.
        assert.equal(state.units['ally_a'].pos_x, 10);
        assert.equal(state.units['ally_a'].pos_y, 0, 'straight line: y must not drift');
        assert.equal(state.orders['ally_a']!.command, 'attack_move', 'the order must still be active mid-transit');
        assert.equal(state.orders['ally_a']!.engaging, false, 'no enemy in range -> engaging must be false while moving');
    });

    test('enemy in range -> stops moving and attacks through tryAttack', () => {
        const spec = skirmishSpec({
            participantOrder: ['ally_a', 'enemy_a'],
            initialState: {
                units: {
                    allies: [unit({ name: 'ally_a', team: 0, pos_x: 0, pos_y: 0, attack_range: 40, move_speed: 30 })],
                    enemies: [unit({ name: 'enemy_a', team: 1, pos_x: 20, pos_y: 0, max_hp: 100000, hp: 100000, attack: 0 })],
                },
            },
            command: commandLog([attackMove('ally_a', { x: 300, y: 0 })]),
        });
        const { state, events } = runTicksCollecting(spec, 1);
        assert.equal(state.units['ally_a'].pos_x, 0, 'must not move while an enemy is in range');
        assert.equal(state.orders['ally_a']!.engaging, true);
        // Filtered to ally_a's own outgoing attacks: enemy_a's default gambits
        // also reach ally_a within their own attack_range and return-attack
        // the same tick (damage floors at 1 via Math.max even with attack: 0),
        // which would otherwise show up in the same shared events.attacks array.
        assert.deepEqual(events[0].attacks.filter(a => a.unit === 'ally_a').map(a => a.target), ['enemy_a']);
    });

    test('attack cooldown not ready -> remains stopped, no second attack until it expires', () => {
        const spec = skirmishSpec({
            participantOrder: ['ally_a', 'enemy_a'],
            initialState: {
                units: {
                    allies: [unit({ name: 'ally_a', team: 0, pos_x: 0, pos_y: 0, attack_range: 40, move_speed: 30, attack_cooldown: 5 })],
                    enemies: [unit({ name: 'enemy_a', team: 1, pos_x: 20, pos_y: 0, max_hp: 100000, hp: 100000, attack: 0 })],
                },
            },
            command: commandLog([attackMove('ally_a', { x: 300, y: 0 })]),
        });
        const { state, events } = runTicksCollecting(spec, 2);
        const allyAttacksT1 = events[0].attacks.filter(a => a.unit === 'ally_a');
        const allyAttacksT2 = events[1].attacks.filter(a => a.unit === 'ally_a');
        assert.equal(allyAttacksT1.length, 1, 'tick 1: the attack lands and starts the cooldown');
        assert.equal(allyAttacksT2.length, 0, 'tick 2: cooldown blocks the attack');
        assert.equal(state.units['ally_a'].pos_x, 0, 'must remain stopped on tick 2 too, because an enemy is still in range');
        assert.equal(state.orders['ally_a']!.engaging, true, 'still engaging, even though the attack itself was blocked by cooldown');
    });

    test('the nearest in-range enemy is selected, not merely the first one in participantOrder', () => {
        const spec = skirmishSpec({
            participantOrder: ['ally_a', 'enemy_far', 'enemy_near'],
            initialState: {
                units: {
                    allies: [unit({ name: 'ally_a', team: 0, pos_x: 0, pos_y: 0, attack_range: 40 })],
                    enemies: [
                        unit({ name: 'enemy_far', team: 1, pos_x: 30, pos_y: 0, max_hp: 100000, hp: 100000, attack: 0 }),
                        unit({ name: 'enemy_near', team: 1, pos_x: 10, pos_y: 0, max_hp: 100000, hp: 100000, attack: 0 }),
                    ],
                },
            },
            command: commandLog([attackMove('ally_a', { x: 300, y: 0 })]),
        });
        const { events } = runTicksCollecting(spec, 1);
        assert.deepEqual(events[0].attacks.filter(a => a.unit === 'ally_a').map(a => a.target), ['enemy_near']);
    });

    test('an exact-distance tie is broken by participantOrder (earlier index wins), not array declaration order', () => {
        const initialState = {
            units: {
                allies: [unit({ name: 'ally_a', team: 0, pos_x: 0, pos_y: 0, attack_range: 40 })],
                enemies: [
                    unit({ name: 'enemy_x', team: 1, pos_x: 20, pos_y: 0, max_hp: 100000, hp: 100000, attack: 0 }),
                    unit({ name: 'enemy_y', team: 1, pos_x: -20, pos_y: 0, max_hp: 100000, hp: 100000, attack: 0 }),
                ],
            },
        };
        const command = commandLog([attackMove('ally_a', { x: 300, y: 0 })]);

        const specXFirst = skirmishSpec({ participantOrder: ['ally_a', 'enemy_x', 'enemy_y'], initialState, command });
        const { events: eventsXFirst } = runTicksCollecting(specXFirst, 1);
        assert.deepEqual(eventsXFirst[0].attacks.filter(a => a.unit === 'ally_a').map(a => a.target), ['enemy_x'], 'enemy_x precedes enemy_y in participantOrder');

        const specYFirst = skirmishSpec({ participantOrder: ['ally_a', 'enemy_y', 'enemy_x'], initialState, command });
        const { events: eventsYFirst } = runTicksCollecting(specYFirst, 1);
        assert.deepEqual(eventsYFirst[0].attacks.filter(a => a.unit === 'ally_a').map(a => a.target), ['enemy_y'], 'reversing participantOrder flips the winner, proving it is not array order');
    });

    test('the engaged enemy dying leaves attack_move active, and movement resumes the following tick once no enemy remains in range', () => {
        // A harmless distant placeholder keeps team 1 alive after enemy_a
        // dies, so the battle keeps running long enough to observe tick 2 —
        // otherwise enemy_a being the only enemy would end the battle
        // (victory) the instant it died, before a second tick ever runs.
        const spec = skirmishSpec({
            participantOrder: ['ally_a', 'enemy_a', 'harmless_enemy'],
            initialState: {
                units: {
                    allies: [unit({ name: 'ally_a', team: 0, pos_x: 0, pos_y: 0, attack_range: 40, attack: 999, move_speed: 30 })],
                    enemies: [unit({ name: 'enemy_a', team: 1, pos_x: 20, pos_y: 0, max_hp: 10, hp: 10, attack: 0 }), harmlessDistantEnemy()],
                },
            },
            command: commandLog([attackMove('ally_a', { x: 300, y: 0 })]),
        });
        const afterKill = runTicks(spec, 1);
        assert.ok(afterKill.units['enemy_a']._dead, 'enemy_a must be dead after tick 1');
        assert.notEqual(afterKill.orders['ally_a'], null, 'attack_move must remain active after the target dies');
        assert.equal(afterKill.orders['ally_a']!.command, 'attack_move');
        assert.equal(afterKill.units['ally_a'].pos_x, 0, 'still stopped on the kill tick itself');

        const nextTick = runTicks(spec, 2);
        assert.ok(nextTick.units['ally_a'].pos_x > 0, 'movement resumes the following tick since no enemy remains in range');
    });

    test('another in-range enemy is selected on a later tick, after the first is defeated', () => {
        const spec = skirmishSpec({
            participantOrder: ['ally_a', 'enemy_near', 'enemy_far'],
            initialState: {
                units: {
                    // attack_cooldown exactly one tick so the cooldown started by
                    // killing enemy_near on tick 1 has already expired by tick 2.
                    allies: [unit({ name: 'ally_a', team: 0, pos_x: 0, pos_y: 0, attack_range: 40, attack: 999, move_speed: 30, attack_cooldown: 1 / 30 })],
                    enemies: [
                        unit({ name: 'enemy_near', team: 1, pos_x: 10, pos_y: 0, max_hp: 10, hp: 10, attack: 0 }),
                        unit({ name: 'enemy_far', team: 1, pos_x: 30, pos_y: 0, max_hp: 100000, hp: 100000, attack: 0 }),
                    ],
                },
            },
            command: commandLog([attackMove('ally_a', { x: 300, y: 0 })]),
        });
        const { state, events } = runTicksCollecting(spec, 2);
        assert.deepEqual(events[0].attacks.filter(a => a.unit === 'ally_a').map(a => a.target), ['enemy_near'], 'tick 1: the nearest enemy is engaged and dies');
        assert.ok(state.units['enemy_near']._dead);
        assert.deepEqual(events[1].attacks.filter(a => a.unit === 'ally_a').map(a => a.target), ['enemy_far'], 'tick 2: the surviving in-range enemy is engaged instead of resuming movement');
        assert.equal(state.units['ally_a'].pos_x, 0, 'still stopped: another enemy remains in range');
    });

    test('arrival with no enemy in range emits exactly one order_completed receipt', () => {
        const spec = skirmishSpec({
            participantOrder: ['ally_a', 'harmless_enemy'],
            initialState: { units: { allies: [unit({ name: 'ally_a', team: 0, pos_x: 0, pos_y: 0, move_speed: 100 })], enemies: [harmlessDistantEnemy()] } },
            command: commandLog([attackMove('ally_a', { x: 2, y: 0 })]),
        });
        const stateAtArrival = runTicks(spec, 1);
        assert.equal(stateAtArrival.units['ally_a'].pos_x, 0, 'arrival is checked before moving, so a target already within epsilon never moves the unit');
        assert.equal(stateAtArrival.orders['ally_a'], null, 'the order slot must be cleared on arrival');

        const output = resolveCombat(spec);
        const receipts = receiptsFor(output, 'ally_a');
        assert.deepEqual(receipts.filter(r => r.command === 'attack_move').map(r => r.kind), ['order_accepted', 'order_started', 'order_completed']);
        assert.equal(receipts.filter(r => r.kind === 'order_completed').length, 1, 'exactly one completion for this one attack_move order');
    });

    test('an enemy in range at the destination is fought before the order completes', () => {
        // A harmless distant placeholder keeps team 1 alive after enemy_a
        // dies, so tick 2 actually runs to observe the (re)checked arrival —
        // otherwise enemy_a being the only enemy would end the battle
        // (victory) the instant it died, before a second tick ever runs.
        const spec = skirmishSpec({
            participantOrder: ['ally_a', 'enemy_a', 'harmless_enemy'],
            initialState: {
                units: {
                    allies: [unit({ name: 'ally_a', team: 0, pos_x: 0, pos_y: 0, attack_range: 40, attack: 999, move_speed: 100 })],
                    enemies: [unit({ name: 'enemy_a', team: 1, pos_x: 1, pos_y: 0, max_hp: 10, hp: 10, attack: 0 }), harmlessDistantEnemy()],
                },
            },
            // The destination is essentially where ally_a already stands, so
            // arrival would fire immediately if the in-range enemy did not
            // take priority first.
            command: commandLog([attackMove('ally_a', { x: 0, y: 0 })]),
        });
        const tick1 = runTicks(spec, 1);
        assert.notEqual(tick1.orders['ally_a'], null, 'must not complete while an enemy is in range, even at the destination');
        assert.ok(tick1.units['enemy_a']._dead, 'the in-range enemy must be fought, not ignored in favor of completing');

        const tick2 = runTicks(spec, 2);
        assert.equal(tick2.orders['ally_a'], null, 'once no enemy remains in range, arrival is (re)checked and the order completes');
    });

    test('end-of-tick arrival rechecks final positions: enemy that walks into range later same tick retains attack_move', () => {
        // ally_a is first in participantOrder and already at its destination with
        // no enemy currently in range, so mid-tick it records arrival eligibility.
        // enemy_mover is just outside attack_range and acts later; its gambit
        // moves it into range before the tick ends. Without a final-position
        // recheck the arrival sweep would complete the order and drop the
        // holder back to gambits instead of fighting the enemy now present.
        const spec = skirmishSpec({
            participantOrder: ['ally_a', 'enemy_mover', 'harmless_enemy'],
            initialState: {
                units: {
                    allies: [unit({
                        name: 'ally_a', team: 0, pos_x: 0, pos_y: 0,
                        attack_range: 40, move_speed: 100, attack: 0,
                    })],
                    enemies: [
                        unit({
                            name: 'enemy_mover', team: 1, pos_x: 41, pos_y: 0,
                            // One tick of travel (move_speed * delta ≈ 100/30) closes
                            // the 1-unit gap and ends inside ally_a's attack_range.
                            move_speed: 100, attack_range: 40, attack: 0,
                        }),
                        harmlessDistantEnemy(),
                    ],
                },
            },
            command: commandLog([attackMove('ally_a', { x: 0, y: 0 })]),
        });
        const { state, events } = runTicksCollecting(spec, 1);
        assert.notEqual(state.orders['ally_a'], null, 'must retain attack_move when an enemy is in range at final positions');
        assert.equal(state.orders['ally_a']!.command, 'attack_move');
        assert.ok(
            state.units['enemy_mover'].pos_x <= 40,
            `enemy_mover should have walked into range, pos_x=${state.units['enemy_mover'].pos_x}`,
        );
        const completed = events[0].commandReceipts.filter(
            r => r.unitId === 'ally_a' && r.kind === 'order_completed',
        );
        assert.equal(completed.length, 0, 'must not emit order_completed while a living enemy ends the tick in range');
    });


    test('canAct=false (mechanics_v1, stunned) retains the order and idles: no move, no attack, no completion', () => {
        const spec = skirmishSpec({
            combatMode: 'mechanics_v1',
            participantOrder: ['ally_a', 'enemy_a'],
            initialState: {
                units: {
                    allies: [stunnedMechanicsUnit({ name: 'ally_a', team: 0, pos_x: 0, pos_y: 0, attack_range: 40, move_speed: 30 })],
                    enemies: [unit({ name: 'enemy_a', team: 1, pos_x: 20, pos_y: 0, attack: 0, max_hp: 100, hp: 100 })],
                },
            },
            command: commandLog([attackMove('ally_a', { x: 300, y: 0 })]),
        });
        const state = runTicks(spec, 5);
        assert.equal(state.units['ally_a'].pos_x, 0, 'must not move while disabled, even though no enemy blocks movement otherwise');
        assert.equal(state.units['enemy_a'].hp, 100, 'must not attack while disabled, even though an enemy is in range');
        assert.notEqual(state.orders['ally_a'], null, 'the order must be retained');
        assert.equal(state.orders['ally_a']!.command, 'attack_move');

        const output = resolveCombat(spec);
        const receipts = receiptsFor(output, 'ally_a');
        assert.equal(receipts.filter(r => r.kind === 'order_completed').length, 0, 'no completion receipt while disabled');
    });

    test('canMove=false (mechanics_v1, paralysis; canAct still true) also retains the order and idles, with no enemy to explain the stop', () => {
        const spec = skirmishSpec({
            combatMode: 'mechanics_v1',
            participantOrder: ['ally_a', 'harmless_enemy'],
            initialState: {
                units: {
                    allies: [{
                        ...unit({ name: 'ally_a', team: 0, pos_x: 0, pos_y: 0, move_speed: 30 }),
                        mechanics: { id: 'ally_a', hp: 100, maxHp: 100, attack: 10, defense: 0, statuses: [{ id: 'paralysis', remainingSeconds: 3600, intensity: 1 }] },
                    }],
                    enemies: [harmlessDistantEnemy()],
                },
            },
            command: commandLog([attackMove('ally_a', { x: 300, y: 0 })]),
        });
        const state = runTicks(spec, 10);
        assert.equal(state.units['ally_a'].pos_x, 0, 'paralysis blocks movement even with no enemy in range at all');
        assert.notEqual(state.orders['ally_a'], null, 'the order must be retained');
    });

    test('a holder that arrives (no enemy in range) and is then killed itself, same tick, receives order_interrupted, not order_completed', () => {
        // ally_a's own attack_range (5) excludes enemy_b (distance 20), so
        // ally_a sees no enemy in range and is eligible to complete on
        // arrival this tick. enemy_b's own attack_range (40, default) does
        // reach ally_a, and enemy_b (processed later in participantOrder, via
        // its own default gambits, no order needed) one-shots ally_a back
        // this same tick. Holder-death priority (design §3, preserved from
        // COMBAT-RTS-MOVE-ATTACK-TARGET-001's Codex fix, review discussion
        // r3619920590) means ally_a must be reported as order_interrupted,
        // not order_completed, even though it had already qualified for
        // completion earlier in this same tick's own turn.
        const spec = skirmishSpec({
            participantOrder: ['ally_a', 'enemy_b'],
            initialState: {
                units: {
                    allies: [unit({ name: 'ally_a', team: 0, pos_x: 0, pos_y: 0, attack_range: 5, move_speed: 100, hp: 10, max_hp: 10 })],
                    enemies: [unit({ name: 'enemy_b', team: 1, pos_x: 20, pos_y: 0, attack_range: 40, attack: 999 })],
                },
            },
            command: commandLog([attackMove('ally_a', { x: 1, y: 0 })]),
        });
        const output = resolveCombat(spec);
        const receipts = receiptsFor(output, 'ally_a');
        assert.deepEqual(receipts.map(r => r.kind), ['order_accepted', 'order_started', 'order_interrupted'],
            'holder-death priority: the holder must be interrupted, not completed, when it also dies this same tick');
        assert.ok(!receipts.some(r => r.kind === 'order_completed'), 'must never also emit order_completed for the same order');
    });

    test('legacy_gambit: attack_move deals damage through the plain damage formula path', () => {
        const spec = skirmishSpec({
            participantOrder: ['ally_a', 'enemy_a'],
            initialState: {
                units: {
                    allies: [unit({ name: 'ally_a', team: 0, pos_x: 0, pos_y: 0, attack_range: 40, attack: 15, defense: 0 })],
                    enemies: [unit({ name: 'enemy_a', team: 1, pos_x: 20, pos_y: 0, max_hp: 100, hp: 100, defense: 0, attack: 0 })],
                },
            },
            command: commandLog([attackMove('ally_a', { x: 300, y: 0 })]),
        });
        const output = resolveCombat(spec);
        assert.equal(output.mechanicsReceipts, undefined, 'legacy_gambit must never produce mechanicsReceipts');
        const { events } = runTicksCollecting(spec, 1);
        const allyAttack = events[0].attacks.find(a => a.unit === 'ally_a');
        assert.equal(allyAttack?.damage, 15, 'plain damage = max(1, attack - defense) = 15');
    });

    test('mechanics_v1: attack_move routes through resolveMechanics and produces mechanicsReceipts', () => {
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
            command: commandLog([attackMove('ally_a', { x: 300, y: 0 })]),
        });
        const output = resolveCombat(spec);
        const activity = activityFor(output, 'ally_a');
        assert.ok(activity.attacks.length > 0, 'expected at least one attack');
        assert.ok((output.mechanicsReceipts || []).length > 0, 'expected mechanicsReceipts from resolveMechanics');
        assert.equal(activity.attacks[0].damage, 14, 'TEST_SLASH magnitude 14, no defense/resistance to reduce it');
    });
});

describe('RTS attack_move — determinism', () => {
    test('repeated runs of the same attack_move battle produce byte-identical JSON', () => {
        const spec = skirmishSpec({
            participantOrder: ['ally_a', 'enemy_near', 'enemy_far'],
            initialState: {
                units: {
                    allies: [unit({ name: 'ally_a', team: 0, pos_x: 0, pos_y: 0, attack_range: 40, attack: 999, move_speed: 30, attack_cooldown: 1 / 30 })],
                    enemies: [
                        unit({ name: 'enemy_near', team: 1, pos_x: 10, pos_y: 0, max_hp: 10, hp: 10, attack: 0 }),
                        unit({ name: 'enemy_far', team: 1, pos_x: 500, pos_y: 0, max_hp: 10, hp: 10, attack: 0 }),
                    ],
                },
            },
            command: commandLog([attackMove('ally_a', { x: 600, y: 0 })]),
        });
        const a = resolveCombat(structuredClone(spec));
        const b = resolveCombat(structuredClone(spec));
        assert.equal(JSON.stringify(a), JSON.stringify(b));
    });

    test('repeated runs of the disabled-unit attack_move scenario remain deterministic', () => {
        const spec = skirmishSpec({
            combatMode: 'mechanics_v1',
            participantOrder: ['ally_a', 'enemy_a'],
            initialState: {
                units: {
                    allies: [stunnedMechanicsUnit({ name: 'ally_a', team: 0, pos_x: 0, pos_y: 0, attack_range: 40 })],
                    enemies: [unit({ name: 'enemy_a', team: 1, pos_x: 20, pos_y: 0, attack: 0 })],
                },
            },
            command: commandLog([attackMove('ally_a', { x: 300, y: 0 })]),
        });
        const a = resolveCombat(structuredClone(spec));
        const b = resolveCombat(structuredClone(spec));
        assert.equal(JSON.stringify(a), JSON.stringify(b));
    });
});
