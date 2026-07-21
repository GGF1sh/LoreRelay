/**
 * COMBAT-RTS-ORDER-SLOT-STOP-RESUME-001 focused tests.
 *
 * PR3 of docs/COMBAT_RTS_COMMAND_SPINE_DESIGN.md: the order slot, the command
 * application phase, `stop` / `resume_gambit`, and the command-receipt
 * skeleton. move_to / attack_target / attack_move are accepted and installed
 * in the order slot (which suppresses gambits, same as `stop`).
 *
 * move_to and attack_target's own execution (movement, arrival, attack,
 * target-death completion) was implemented in PR4 —
 * COMBAT-RTS-MOVE-ATTACK-TARGET-001, see combatRtsMoveAttackTargetV1.test.ts —
 * and is out of scope here; tests below use points/targets far enough away
 * that neither ever completes within the ticks each test actually inspects.
 * attack_move remains idle-only (PR5).
 */

import * as assert from 'node:assert/strict';
import * as fs from 'fs';
import * as path from 'path';
import { describe, test } from 'node:test';
import {
    BattleSpec, CombatExpectedOutput, CombatUnitState, resolveCombat,
} from './gambitCombatCore';
import { CommandInputEvent, CommandInputLog, COMMAND_INPUT_SCHEMA_VERSION } from './combatRtsCommandInputCore';

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

/** A minimal two-unit skirmish spec, independent of the golden-master fixtures. */
function unit(over: Partial<CombatUnitState> & { name: string; team: 0 | 1 }): any {
    return {
        role: 'Frontline', max_hp: 100, attack: 10, defense: 0, heal_power: 0,
        move_speed: 40, attack_range: 40, attack_cooldown: 0.5, radius: 12,
        pos_x: over.team === 0 ? 0 : 200, pos_y: 0,
        ...over,
    };
}

function skirmishSpec(over: Partial<BattleSpec> = {}): BattleSpec {
    return {
        activePreset: 'rts-order-slot-test',
        deltaSeconds: 1 / 30,
        viewport: { width: 1280, height: 720 },
        participantOrder: ['ally_a', 'ally_b', 'enemy_a'],
        initialState: {
            units: {
                allies: [
                    unit({ name: 'ally_a', team: 0 }),
                    unit({ name: 'ally_b', team: 0, pos_y: 40 }),
                ],
                enemies: [unit({ name: 'enemy_a', team: 1 })],
            },
        },
        ...over,
    } as BattleSpec;
}

function commandLog(events: CommandInputEvent[], tickRate = 30): CommandInputLog {
    return { schemaVersion: COMMAND_INPUT_SCHEMA_VERSION, tickRate, events };
}

function stopEvent(over: Partial<CommandInputEvent> = {}): CommandInputEvent {
    return { tick: 0, seq: 0, issuerTeam: 0, unitIds: ['ally_a'], command: 'stop', ...over } as CommandInputEvent;
}

/** Every evaluation/decision/attack/heal touching `unitId`, across the whole battle. */
function activityFor(output: CombatExpectedOutput, unitId: string) {
    return {
        evaluations: output.evaluations.filter(e => e.unit === unitId),
        decisions: output.decisions.filter(e => e.unit === unitId),
        attacks: output.attacks.filter(e => e.unit === unitId),
        heals: output.heals.filter(e => e.unit === unitId || e.source === unitId),
    };
}

describe('RTS order slot — compatibility with the existing golden master', () => {
    for (const file of fixtureFiles) {
        test(`${file}: command absent leaves output byte-identical`, () => {
            const spec = fixtureSpec(file);
            const withoutField = resolveCombat(spec);
            const withUndefined = resolveCombat({ ...spec, command: undefined });
            assert.equal(JSON.stringify(withUndefined), JSON.stringify(withoutField));
            assert.equal('commandReceipts' in withoutField, false);
        });

        test(`${file}: an empty command log leaves output byte-identical`, () => {
            const spec = fixtureSpec(file);
            const baseline = resolveCombat(spec);
            const withEmptyLog = resolveCombat({ ...spec, command: commandLog([]) });
            assert.equal(JSON.stringify(withEmptyLog), JSON.stringify(baseline));
            assert.equal('commandReceipts' in withEmptyLog, false);
        });
    }

    test('an invalid raw command falls back to empty-log behavior, not a thrown error', () => {
        const spec = fixtureSpec(fixtureFiles[0]);
        const baseline = resolveCombat(spec);
        for (const bogus of [42, 'nonsense', { schemaVersion: 'wrong' }, null]) {
            const withBogus = resolveCombat({ ...spec, command: bogus });
            assert.equal(JSON.stringify(withBogus), JSON.stringify(baseline));
        }
    });
});

describe('RTS order slot — stop', () => {
    test('stop is accepted and suppresses gambit evaluation, decisions, movement and attacks for several ticks', () => {
        // enemy_a is far enough away that it cannot close the distance within
        // COMBAT_TIMEOUT_TICKS, so ally_a's stop order is never interrupted by
        // death — this test is purely about stop's own suppression effect.
        const spec = skirmishSpec({ command: commandLog([stopEvent({ tick: 1 })]) });
        const output = resolveCombat({ ...spec, participantOrder: ['ally_a', 'enemy_a'], initialState: { units: { allies: [unit({ name: 'ally_a', team: 0 })], enemies: [unit({ name: 'enemy_a', team: 1, pos_x: 10000 })] } } });

        const activity = activityFor(output, 'ally_a');
        assert.equal(activity.evaluations.length, 0, 'stopped unit must not evaluate gambits');
        assert.equal(activity.decisions.length, 0, 'stopped unit must not record decisions');
        assert.equal(activity.attacks.length, 0, 'stopped unit must not auto-attack');

        const stoppedUnit = output.finalState.units.find(u => u.name === 'ally_a')!;
        assert.equal(stoppedUnit.pos_x, 0, 'stopped unit must not move');
        assert.equal(stoppedUnit.pos_y, 0);

        const receipts = output.commandReceipts!;
        assert.deepEqual(
            receipts.map(r => [r.tick, r.unitId, r.command, r.kind]),
            [[1, 'ally_a', 'stop', 'order_accepted'], [1, 'ally_a', 'stop', 'order_started']],
        );
    });

    test('stop is persistent: it does not auto-return after any number of ticks', () => {
        const spec = skirmishSpec({
            participantOrder: ['ally_a', 'enemy_a'],
            initialState: { units: { allies: [unit({ name: 'ally_a', team: 0 })], enemies: [unit({ name: 'enemy_a', team: 1, pos_x: 5000 })] } },
            command: commandLog([stopEvent({ tick: 1 })]),
        });
        // Enemy is far out of range, so the only way ally_a would ever act again
        // is if stop had (wrongly) auto-cleared.
        const output = resolveCombat(spec);
        const activity = activityFor(output, 'ally_a');
        assert.equal(activity.evaluations.length, 0);
        assert.equal(activity.decisions.length, 0);
        assert.equal(output.outcome, 'Timeout');
    });
});

describe('RTS order slot — resume_gambit', () => {
    test('resume_gambit clears the slot and gambits resume the very same tick it is scheduled for', () => {
        const spec = skirmishSpec({
            participantOrder: ['ally_a', 'enemy_a'],
            initialState: { units: { allies: [unit({ name: 'ally_a', team: 0 })], enemies: [unit({ name: 'enemy_a', team: 1, pos_x: 20 })] } },
            command: commandLog([
                stopEvent({ tick: 1 }),
                { tick: 5, seq: 0, issuerTeam: 0, unitIds: ['ally_a'], command: 'resume_gambit' },
            ]),
        });
        const output = resolveCombat(spec);
        const activity = activityFor(output, 'ally_a');

        assert.ok(activity.evaluations.every(e => e.tick >= 5), 'no gambit evaluation before resume_gambit\'s tick');
        assert.ok(activity.evaluations.some(e => e.tick === 5), 'gambit evaluation must resume on tick 5 itself, not tick 6');

        const receipts = output.commandReceipts!;
        assert.deepEqual(
            receipts.map(r => [r.tick, r.unitId, r.command, r.kind]),
            [
                [1, 'ally_a', 'stop', 'order_accepted'], [1, 'ally_a', 'stop', 'order_started'],
                // resume_gambit replacing an active order supersedes it, the same as
                // any other accepted command replacing a previous one (see the
                // "supersede semantics" describe block below).
                [5, 'ally_a', 'stop', 'order_superseded'],
                [5, 'ally_a', 'resume_gambit', 'order_accepted'],
            ],
        );
    });

    test('resume_gambit with no active order is still accepted, and emits no superseded receipt', () => {
        const spec = skirmishSpec({
            command: commandLog([{ tick: 1, seq: 0, issuerTeam: 0, unitIds: ['ally_a'], command: 'resume_gambit' }]),
        });
        const output = resolveCombat(spec);
        assert.deepEqual(
            output.commandReceipts!.map(r => r.kind),
            ['order_accepted'],
        );
    });
});

describe('RTS order slot — supersede semantics', () => {
    test('same tick, same unit, two commands: last wins, and the first is superseded', () => {
        const spec = skirmishSpec({
            command: commandLog([
                { tick: 1, seq: 0, issuerTeam: 0, unitIds: ['ally_a'], command: 'move_to', point: { x: 50, y: 0 } },
                { tick: 1, seq: 1, issuerTeam: 0, unitIds: ['ally_a'], command: 'stop' },
            ]),
        });
        const output = resolveCombat(spec);
        assert.deepEqual(
            output.commandReceipts!.map(r => [r.unitId, r.command, r.kind]),
            [
                ['ally_a', 'move_to', 'order_accepted'],
                ['ally_a', 'move_to', 'order_started'],
                ['ally_a', 'move_to', 'order_superseded'],
                ['ally_a', 'stop', 'order_accepted'],
                ['ally_a', 'stop', 'order_started'],
            ],
        );
    });

    test('a later tick can also supersede an order accepted on an earlier tick', () => {
        // point is far enough that move_to cannot arrive within this test's
        // observation window (COMBAT-RTS-MOVE-ATTACK-TARGET-001 made move_to
        // actually execute) — this test is only about supersede semantics.
        const spec = skirmishSpec({
            command: commandLog([
                stopEvent({ tick: 1 }),
                { tick: 4, seq: 0, issuerTeam: 0, unitIds: ['ally_a'], command: 'move_to', point: { x: 10000, y: 0 } },
            ]),
        });
        const output = resolveCombat(spec);
        const kinds = output.commandReceipts!.map(r => [r.tick, r.unitId, r.command, r.kind]);
        assert.deepEqual(kinds, [
            [1, 'ally_a', 'stop', 'order_accepted'],
            [1, 'ally_a', 'stop', 'order_started'],
            [4, 'ally_a', 'stop', 'order_superseded'],
            [4, 'ally_a', 'move_to', 'order_accepted'],
            [4, 'ally_a', 'move_to', 'order_started'],
        ]);
    });
});

describe('RTS order slot — multi-unit fan-out order', () => {
    test('fan-out follows participantOrder rank, not the event\'s own unitIds order', () => {
        const spec = skirmishSpec({
            participantOrder: ['ally_b', 'ally_a', 'enemy_a'],
            command: commandLog([
                { tick: 1, seq: 0, issuerTeam: 0, unitIds: ['ally_a', 'ally_b'], command: 'stop' },
            ]),
        });
        const output = resolveCombat(spec);
        const acceptedOrder = output.commandReceipts!.filter(r => r.kind === 'order_accepted').map(r => r.unitId);
        assert.deepEqual(acceptedOrder, ['ally_b', 'ally_a'], 'ally_b ranks before ally_a in participantOrder');
    });

    test('an unknown unit in the selection is rejected individually; the rest of the fan-out proceeds', () => {
        const spec = skirmishSpec({
            command: commandLog([
                { tick: 1, seq: 0, issuerTeam: 0, unitIds: ['ally_a', 'ghost_unit', 'ally_b'], command: 'stop' },
            ]),
        });
        const output = resolveCombat(spec);
        // Both allies are now parked (stopped) for the rest of the battle, so
        // the still-acting enemy may eventually kill one of them and trigger an
        // order_interrupted receipt much later — irrelevant to what this test
        // checks, which is the outcome of processing this one command at tick 1.
        const receipts = output.commandReceipts!.filter(r => r.tick === 1);

        const ghostReceipt = receipts.find(r => r.unitId === 'ghost_unit');
        assert.equal(ghostReceipt?.kind, 'order_rejected');
        assert.equal(ghostReceipt?.reason, 'unit_not_found');

        assert.deepEqual(
            receipts.filter(r => r.unitId === 'ally_a').map(r => r.kind),
            ['order_accepted', 'order_started'],
        );
        assert.deepEqual(
            receipts.filter(r => r.unitId === 'ally_b').map(r => r.kind),
            ['order_accepted', 'order_started'],
        );
    });
});

describe('RTS order slot — rejections', () => {
    test('a dead unit is rejected with unit_dead', () => {
        // ally_a is dead at the start (hp: 0); ally_b is alive, so team 0 is not
        // wiped and the battle actually runs stepCombat instead of terminating
        // at tick 0 before the command phase ever executes.
        const spec = skirmishSpec({
            initialState: {
                units: {
                    allies: [unit({ name: 'ally_a', team: 0, hp: 0 } as any), unit({ name: 'ally_b', team: 0, pos_y: 40 })],
                    enemies: [unit({ name: 'enemy_a', team: 1, pos_x: 5000 })],
                },
            },
            participantOrder: ['ally_a', 'ally_b', 'enemy_a'],
            command: commandLog([stopEvent({ tick: 1, unitIds: ['ally_a'] })]),
        });
        const output = resolveCombat(spec);
        const receipt = output.commandReceipts!.find(r => r.unitId === 'ally_a')!;
        assert.equal(receipt.kind, 'order_rejected');
        assert.equal(receipt.reason, 'unit_dead');
    });

    test('commanding the other team\'s unit is rejected with not_your_team', () => {
        const spec = skirmishSpec({
            command: commandLog([
                { tick: 1, seq: 0, issuerTeam: 0, unitIds: ['enemy_a'], command: 'stop' },
            ]),
        });
        const output = resolveCombat(spec);
        const receipt = output.commandReceipts!.find(r => r.unitId === 'enemy_a')!;
        assert.equal(receipt.kind, 'order_rejected');
        assert.equal(receipt.reason, 'not_your_team');
    });

    test('spectator mode rejects every command with mode_forbids_command, unit_not_found included', () => {
        const spec = skirmishSpec({
            selectableMode: 'spectator',
            command: commandLog([
                { tick: 1, seq: 0, issuerTeam: 0, unitIds: ['ally_a', 'ghost_unit'], command: 'stop' },
            ]),
        });
        const output = resolveCombat(spec);
        const receipts = output.commandReceipts!;
        assert.equal(receipts.length, 2);
        assert.ok(receipts.every(r => r.kind === 'order_rejected' && r.reason === 'mode_forbids_command'));

        // And gambits/movement/attacks proceed completely normally for ally_a.
        const activity = activityFor(output, 'ally_a');
        assert.ok(activity.evaluations.length > 0, 'spectator mode must not otherwise affect gambit evaluation');
    });

    test('command mode (the default) allows the same command that spectator mode rejects', () => {
        const spec = skirmishSpec({ command: commandLog([stopEvent({ tick: 1 })]) });
        const output = resolveCombat(spec);
        assert.deepEqual(output.commandReceipts!.map(r => r.kind), ['order_accepted', 'order_started']);
    });

    test('an unknown unit id alone is rejected with unit_not_found', () => {
        const spec = skirmishSpec({
            command: commandLog([{ tick: 1, seq: 0, issuerTeam: 0, unitIds: ['ghost_unit'], command: 'stop' }]),
        });
        const output = resolveCombat(spec);
        assert.deepEqual(
            output.commandReceipts!.map(r => [r.kind, r.reason]),
            [['order_rejected', 'unit_not_found']],
        );
    });
});

describe('RTS order slot — unit death interrupts an active order', () => {
    test('a unit that dies while holding an active order gets an order_interrupted receipt', () => {
        // ally_a stops in melee range of a much stronger enemy that will kill it.
        const spec = skirmishSpec({
            participantOrder: ['ally_a', 'enemy_a'],
            initialState: {
                units: {
                    allies: [unit({ name: 'ally_a', team: 0, max_hp: 5, attack: 1 })],
                    enemies: [unit({ name: 'enemy_a', team: 1, pos_x: 20, attack: 999, attack_cooldown: 0.01 })],
                },
            },
            command: commandLog([stopEvent({ tick: 1 })]),
        });
        const output = resolveCombat(spec);
        const receipts = output.commandReceipts!.filter(r => r.unitId === 'ally_a');
        const interrupted = receipts.find(r => r.kind === 'order_interrupted');
        assert.ok(interrupted, 'expected an order_interrupted receipt once ally_a dies');
        assert.equal(interrupted!.command, 'stop');
        assert.ok(output.deaths.some(d => d.unit === 'ally_a'));
    });
});

describe('RTS order slot — move_to / attack_target / attack_move are accepted', () => {
    // COMBAT-RTS-MOVE-ATTACK-TARGET-001 (PR4) implemented move_to and
    // attack_target's actual execution; attack_move remains idle-only (PR5).
    // The points/targets below are chosen so none of the three completes
    // within this test's 50-tick observation window — this test is only about
    // the order slot suppressing gambits immediately upon acceptance.
    // move_to/attack_target's own arrival, completion and target-death
    // semantics are covered in combatRtsMoveAttackTargetV1.test.ts.
    for (const [command, extra] of [
        ['move_to', { point: { x: 10000, y: 0 } }],
        ['attack_target', { targetId: 'enemy_a' }],
        ['attack_move', { point: { x: 30, y: 0 } }],
    ] as const) {
        test(`${command} is accepted, installed in the order slot, and also suppresses gambits`, () => {
            // An enemy far enough away still eventually closes the distance —
            // the assertions below only cover the ticks before that contact
            // (or, for move_to, arrival) is possible.
            const spec = skirmishSpec({
                participantOrder: ['ally_a', 'enemy_a'],
                initialState: { units: { allies: [unit({ name: 'ally_a', team: 0 })], enemies: [unit({ name: 'enemy_a', team: 1, pos_x: 400 })] } },
                command: commandLog([{ tick: 1, seq: 0, issuerTeam: 0, unitIds: ['ally_a'], command, ...extra } as CommandInputEvent]),
            });
            const output = resolveCombat(spec);
            const acceptedReceipts = output.commandReceipts!.filter(r => r.tick === 1);
            assert.deepEqual(acceptedReceipts.map(r => r.kind), ['order_accepted', 'order_started']);

            const earlyWindow = 50; // enemy_a needs ~270 ticks to close the distance
            const activity = activityFor(output, 'ally_a');
            assert.equal(
                activity.evaluations.filter(e => e.tick <= earlyWindow).length, 0,
                `${command} must suppress gambit evaluation like stop does`,
            );
        });
    }
});

describe('RTS order slot — determinism', () => {
    test('repeated runs of the same spec + command log produce byte-identical JSON', () => {
        const spec = skirmishSpec({
            command: commandLog([
                stopEvent({ tick: 1 }),
                { tick: 3, seq: 0, issuerTeam: 0, unitIds: ['ally_b'], command: 'move_to', point: { x: 10, y: 10 } },
                { tick: 6, seq: 0, issuerTeam: 0, unitIds: ['ally_a'], command: 'resume_gambit' },
            ]),
        });
        const a = resolveCombat(structuredClone(spec));
        const b = resolveCombat(structuredClone(spec));
        assert.equal(JSON.stringify(a), JSON.stringify(b));
    });

    test('seq order, not array order, decides application order within a tick', () => {
        const specForward = skirmishSpec({
            command: commandLog([
                { tick: 1, seq: 0, issuerTeam: 0, unitIds: ['ally_a'], command: 'move_to', point: { x: 1, y: 1 } },
                { tick: 1, seq: 1, issuerTeam: 0, unitIds: ['ally_a'], command: 'stop' },
            ]),
        });
        // Same two events, submitted in the opposite array order — normalizeCommandInputLog
        // sorts by (tick, seq), so the application order (and thus the result) is identical.
        const specReversed = skirmishSpec({
            command: commandLog([
                { tick: 1, seq: 1, issuerTeam: 0, unitIds: ['ally_a'], command: 'stop' },
                { tick: 1, seq: 0, issuerTeam: 0, unitIds: ['ally_a'], command: 'move_to', point: { x: 1, y: 1 } },
            ]),
        });
        assert.equal(JSON.stringify(resolveCombat(specForward)), JSON.stringify(resolveCombat(specReversed)));
    });
});
