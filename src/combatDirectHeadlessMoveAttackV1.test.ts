/**
 * COMBAT-DIRECT-HEADLESS-MOVE-ATTACK-V1-001 focused tests.
 *
 * move + light_attack only. No dodge/guard/UI/etc.
 */

import * as assert from 'node:assert/strict';
import * as fs from 'fs';
import * as path from 'path';
import { describe, test } from 'node:test';
import { AbilityDefinition, StatusDefinition } from './combatAbilityTypes';
import { DIRECT_INPUT_SCHEMA_VERSION } from './combatDirectInputCore';
import {
    DIRECT_V1_MOVE_SPEED,
    DIRECT_V1_TICK_RATE,
    DirectCombatantSeed,
    deriveDirectPhaseTicks,
    emptyDirectLogIsIdentity,
    msToTicks,
    normalizeAndQuantizeDirection,
    quantizePosition,
    runDirectHeadlessMoveAttack,
} from './combatDirectHeadlessCore';
import { MechanicsCombatant } from './combatMechanicsResolver';
import { BattleSpec, resolveCombat } from './gambitCombatCore';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const statuses: StatusDefinition[] = [];

const slash: AbilityDefinition = {
    id: 'basic_slash',
    name: 'Basic Slash',
    tier: 'normal',
    delivery: {
        shape: 'single_target', range: 48, maxTargets: 1, falloff: 1,
        dodgeable: true, blockedByCover: false, pierces: false,
    },
    effects: [{
        kind: 'damage', vector: 'physical',
        penetration: { barrier: 'blocked', armor: 'blocked', requiresBodyContact: false, requiresDamageDealt: false },
        targetRequirement: [], magnitude: 14, weaponScale: 'personal',
    }],
    auto: { cooldown: 0.9, gambitTags: ['burst'] },
    scaleBehavior: { individual: 'full', huge: 'attenuate', squad: 'aggregate', fleet: 'drop' },
    counters: ['armor'], tags: ['physical'],
};

const slashWithDirect: AbilityDefinition = {
    ...slash,
    id: 'timed_slash',
    direct: { windupMs: 100, activeMs: 50, recoveryMs: 150, staminaCost: 10 },
};

function mech(id: string, over: Partial<MechanicsCombatant> = {}): MechanicsCombatant {
    return {
        id, hp: 100, maxHp: 100, attack: 20, defense: 0,
        tags: ['living'], statuses: [], buildup: {}, ...over,
    };
}

function seeds(allyOver: Partial<MechanicsCombatant> = {}, enemyOver: Partial<MechanicsCombatant> = {}): DirectCombatantSeed[] {
    return [
        { id: 'ally', team: 0, position: { x: 0, y: 0 }, mechanics: mech('ally', allyOver) },
        { id: 'enemy', team: 1, position: { x: 50, y: 0 }, mechanics: mech('enemy', enemyOver) },
    ];
}

function log(events: Array<Record<string, unknown>>, tickRate = DIRECT_V1_TICK_RATE) {
    return {
        schemaVersion: DIRECT_INPUT_SCHEMA_VERSION,
        tickRate,
        events: events.map(e => ({ actorId: e.actorId ?? 'ally', ...e })),
    };
}

function run(opts: {
    events?: Array<Record<string, unknown>>;
    durationTicks?: number;
    ability?: AbilityDefinition;
    combatants?: DirectCombatantSeed[];
    tickRate?: number;
    moveSpeed?: number;
}) {
    const tickRate = opts.tickRate ?? DIRECT_V1_TICK_RATE;
    const result = runDirectHeadlessMoveAttack({
        controlledCombatantId: 'ally',
        combatants: opts.combatants || seeds(),
        normalAttackAbility: opts.ability || slash,
        statuses,
        durationTicks: opts.durationTicks ?? 60,
        tickRate,
        moveSpeed: opts.moveSpeed ?? DIRECT_V1_MOVE_SPEED,
        mode: 'direct_action',
        directInput: log(opts.events || [], tickRate),
    });
    if (!result.ok) {
        assert.fail(`runDirectHeadlessMoveAttack failed: ${result.error}`);
    }
    return result.result;
}

// ---------------------------------------------------------------------------
// Move
// ---------------------------------------------------------------------------

describe('Direct headless move', () => {
    test('move press starts movement', () => {
        const r = run({
            events: [
                { tick: 0, seq: 0, action: 'move', phase: 'press', direction: { x: 1, y: 0 } },
            ],
            durationTicks: 10,
        });
        assert.equal(r.finalDirectState.actionPhase, 'moving');
        assert.ok(r.finalDirectState.heldMoveDirection);
        assert.ok(r.finalDirectState.position.x > 0);
        assert.equal(r.finalDirectState.position.y, 0);
    });

    test('move release stops movement', () => {
        const r = run({
            events: [
                { tick: 0, seq: 0, action: 'move', phase: 'press', direction: { x: 1, y: 0 } },
                { tick: 5, seq: 0, action: 'move', phase: 'release' },
            ],
            durationTicks: 20,
        });
        assert.equal(r.finalDirectState.heldMoveDirection, null);
        assert.equal(r.finalDirectState.actionPhase, 'idle');
        const xAtStop = r.finalDirectState.position.x;
        assert.ok(xAtStop > 0);
        // After release, position must not keep growing — re-run and compare mid vs end via two sims.
        const short = run({
            events: [
                { tick: 0, seq: 0, action: 'move', phase: 'press', direction: { x: 1, y: 0 } },
                { tick: 5, seq: 0, action: 'move', phase: 'release' },
            ],
            durationTicks: 6,
        });
        assert.equal(r.finalDirectState.position.x, short.finalDirectState.position.x);
    });

    test('same input sequence yields identical position', () => {
        const events = [
            { tick: 0, seq: 0, action: 'move', phase: 'press', direction: { x: 1, y: 1 } },
            { tick: 20, seq: 0, action: 'move', phase: 'release' },
        ];
        const a = run({ events, durationTicks: 30 });
        const b = run({ events, durationTicks: 30 });
        assert.deepEqual(a.finalDirectState.position, b.finalDirectState.position);
        assert.equal(a.outputBytes, b.outputBytes);
        assert.equal(a.replayHash, b.replayHash);
    });

    test('diagonal movement is not faster than cardinal', () => {
        const durationTicks = 30;
        const cardinal = run({
            events: [{ tick: 0, seq: 0, action: 'move', phase: 'press', direction: { x: 1, y: 0 } }],
            durationTicks,
        });
        const diagonal = run({
            events: [{ tick: 0, seq: 0, action: 'move', phase: 'press', direction: { x: 1, y: 1 } }],
            durationTicks,
        });
        const cardDist = Math.hypot(cardinal.finalDirectState.position.x, cardinal.finalDirectState.position.y);
        const diagDist = Math.hypot(diagonal.finalDirectState.position.x, diagonal.finalDirectState.position.y);
        // Diagonal must not outrun cardinal. Axis-wise quantize can add sub-quantum noise.
        assert.ok(diagDist <= cardDist + 0.05, `diag ${diagDist} vs card ${cardDist}`);
        // And must not be drastically slower either (still a unit-speed vector).
        assert.ok(diagDist >= cardDist * 0.99, `diag ${diagDist} too slow vs card ${cardDist}`);
    });

    test('direction quantization is stable', () => {
        const d1 = normalizeAndQuantizeDirection(0.3333333, -0.6666666);
        const d2 = normalizeAndQuantizeDirection(0.3333333, -0.6666666);
        assert.deepEqual(d1, d2);
        // Input log quantizes first; the controller then unit-normalizes the quantized vector.
        // Both paths must be stable across runs and land on the 1/1000 grid.
        const events = [
            { tick: 0, seq: 0, action: 'move', phase: 'press', direction: { x: 0.3333333, y: -0.6666666 } },
        ];
        const a = run({ events, durationTicks: 5 });
        const b = run({ events, durationTicks: 5 });
        assert.deepEqual(a.finalDirectState.heldMoveDirection, b.finalDirectState.heldMoveDirection);
        assert.deepEqual(a.finalDirectState.facing, a.finalDirectState.heldMoveDirection);
        const held = a.finalDirectState.heldMoveDirection!;
        assert.equal(held.x, Math.round(held.x * 1000) / 1000);
        assert.equal(held.y, Math.round(held.y * 1000) / 1000);
        assert.ok(Math.hypot(held.x, held.y) <= 1.001);
    });
});

// ---------------------------------------------------------------------------
// Light attack state machine
// ---------------------------------------------------------------------------

describe('Direct headless light_attack', () => {
    test('explicit DirectProfile converts ms to phase ticks via ceiling', () => {
        const ticks = deriveDirectPhaseTicks(slashWithDirect, 30);
        assert.equal(ticks.windupTicks, msToTicks(100, 30)); // ceil(3.0) = 3
        assert.equal(ticks.activeTicks, Math.max(1, msToTicks(50, 30))); // ceil(1.5) = 2
        assert.equal(ticks.recoveryTicks, msToTicks(150, 30)); // ceil(4.5) = 5
        assert.equal(ticks.windupTicks, 3);
        assert.equal(ticks.activeTicks, 2);
        assert.equal(ticks.recoveryTicks, 5);
    });

    test('missing DirectProfile derives phase ticks from cooldown', () => {
        // cooldown 0.9, rate 30:
        // windup = ceil(0.9*0.2*30) = ceil(5.4) = 6
        // active = max(1, ceil(0.9*0.1*30)) = max(1, ceil(2.7)) = 3
        // recovery = ceil(0.9*0.2*30) = 6
        const ticks = deriveDirectPhaseTicks(slash, 30);
        assert.equal(ticks.windupTicks, 6);
        assert.equal(ticks.activeTicks, 3);
        assert.equal(ticks.recoveryTicks, 6);
        assert.ok(ticks.activeTicks >= 1);
    });

    test('active frame commits the attack exactly once', () => {
        const phases = deriveDirectPhaseTicks(slashWithDirect, 30);
        const r = run({
            ability: slashWithDirect,
            events: [
                { tick: 0, seq: 0, action: 'light_attack', phase: 'press', targetId: 'enemy' },
            ],
            durationTicks: 30,
        });
        assert.equal(r.committedActions.length, 1);
        assert.equal(r.committedActions[0].kind, 'light_attack');
        assert.equal(r.committedActions[0].tick, phases.windupTicks); // first active tick
        assert.ok(r.committedActions[0].damageDealt > 0);
        assert.ok(r.combatants.enemy.mechanics.hp < 100);
    });

    test('button mash does not multi-commit', () => {
        const r = run({
            ability: slashWithDirect,
            events: [
                { tick: 0, seq: 0, action: 'light_attack', phase: 'press', targetId: 'enemy' },
                { tick: 0, seq: 1, action: 'light_attack', phase: 'press', targetId: 'enemy' },
                { tick: 1, seq: 0, action: 'light_attack', phase: 'press', targetId: 'enemy' },
                { tick: 2, seq: 0, action: 'light_attack', phase: 'press', targetId: 'enemy' },
                { tick: 3, seq: 0, action: 'light_attack', phase: 'press', targetId: 'enemy' },
            ],
            durationTicks: 20,
        });
        assert.equal(r.committedActions.length, 1);
        assert.ok(r.rejectedInputs.some(item => item.reason === 'invalid_phase'));
    });

    test('after recovery a second attack can commit', () => {
        // Use short profile and short cooldown ability for a compact window.
        const quick: AbilityDefinition = {
            ...slash,
            id: 'quick',
            auto: { cooldown: 0.1, gambitTags: [] },
            direct: { windupMs: 0, activeMs: 33, recoveryMs: 33, staminaCost: 5 },
        };
        // windup 0, active ceil(0.033*30)=1, recovery ceil(0.033*30)=1, cd ceil(0.1*30)=3
        const r = run({
            ability: quick,
            events: [
                { tick: 0, seq: 0, action: 'light_attack', phase: 'press', targetId: 'enemy' },
                // recovery ends at tick 2 (active tick0, recovery tick1 → idle at tick2)
                // cooldown ready at tick 3
                { tick: 3, seq: 0, action: 'light_attack', phase: 'press', targetId: 'enemy' },
            ],
            durationTicks: 15,
        });
        assert.equal(r.committedActions.length, 2);
        assert.equal(r.committedActions[0].tick, 0);
        assert.equal(r.committedActions[1].tick, 3);
    });

    test('rejects invalid target', () => {
        const r = run({
            events: [
                { tick: 0, seq: 0, action: 'light_attack', phase: 'press', targetId: 'nobody' },
            ],
            durationTicks: 5,
        });
        assert.equal(r.committedActions.length, 0);
        assert.ok(r.rejectedInputs.some(item => item.reason === 'invalid_target'));
    });

    test('rejects input when actor is defeated', () => {
        const r = run({
            combatants: seeds({ hp: 0 }),
            events: [
                { tick: 0, seq: 0, action: 'move', phase: 'press', direction: { x: 1, y: 0 } },
                { tick: 0, seq: 1, action: 'light_attack', phase: 'press', targetId: 'enemy' },
            ],
            durationTicks: 5,
        });
        assert.equal(r.finalDirectState.actionPhase, 'defeated');
        assert.equal(r.committedActions.length, 0);
        assert.ok(r.rejectedInputs.every(item => item.reason === 'actor_defeated'));
        assert.equal(r.finalDirectState.position.x, 0);
    });

    test('rejects light_attack during cooldown', () => {
        const quick: AbilityDefinition = {
            ...slash,
            id: 'quick_cd',
            auto: { cooldown: 1, gambitTags: [] },
            direct: { windupMs: 0, activeMs: 33, recoveryMs: 0, staminaCost: 5 },
        };
        // commit tick 0, ready tick 30; recovery 0 → idle immediately after active ends tick 1
        const r = run({
            ability: quick,
            events: [
                { tick: 0, seq: 0, action: 'light_attack', phase: 'press', targetId: 'enemy' },
                { tick: 2, seq: 0, action: 'light_attack', phase: 'press', targetId: 'enemy' },
            ],
            durationTicks: 10,
        });
        assert.equal(r.committedActions.length, 1);
        assert.ok(r.rejectedInputs.some(item => item.reason === 'cooldown'));
    });

    test('armour and barrier use existing resolveMechanics results', () => {
        const armoured = run({
            combatants: seeds({}, { defense: 10, barrier: undefined }),
            ability: {
                ...slash,
                direct: { windupMs: 0, activeMs: 33, recoveryMs: 0, staminaCost: 5 },
                auto: { cooldown: 0, gambitTags: [] },
            },
            events: [{ tick: 0, seq: 0, action: 'light_attack', phase: 'press', targetId: 'enemy' }],
            durationTicks: 5,
        });
        const barred = run({
            combatants: seeds({}, {
                defense: 0,
                barrier: { amount: 50, blocksVectors: ['physical'], blocksStatusApplication: true },
            }),
            ability: {
                ...slash,
                direct: { windupMs: 0, activeMs: 33, recoveryMs: 0, staminaCost: 5 },
                auto: { cooldown: 0, gambitTags: [] },
            },
            events: [{ tick: 0, seq: 0, action: 'light_attack', phase: 'press', targetId: 'enemy' }],
            durationTicks: 5,
        });
        assert.equal(armoured.committedActions.length, 1);
        assert.equal(barred.committedActions.length, 1);
        // Armour reduces damage from ability magnitude: 14 - defense 10 = 4.
        assert.equal(armoured.committedActions[0].damageDealt, 4);
        // Barrier absorbs: receipts include barrier_absorbed and lower (or zero) HP damage.
        assert.ok(barred.mechanicsReceipts.some(e => e.receipt.kind === 'barrier_absorbed'));
        assert.ok(barred.combatants.enemy.mechanics.barrier);
        assert.ok((barred.combatants.enemy.mechanics.barrier?.amount ?? 0) < 50);
    });
});

// ---------------------------------------------------------------------------
// Determinism / identity / foundation & GM isolation
// ---------------------------------------------------------------------------

describe('Direct headless determinism', () => {
    test('JSON round trip of output is stable', () => {
        const r = run({
            events: [
                { tick: 0, seq: 0, action: 'move', phase: 'press', direction: { x: 1, y: 0 } },
                { tick: 5, seq: 0, action: 'light_attack', phase: 'press', targetId: 'enemy' },
            ],
            ability: slashWithDirect,
            durationTicks: 40,
        });
        const parsed = JSON.parse(r.outputBytes);
        assert.equal(JSON.stringify(parsed), r.outputBytes);
        assert.equal(typeof r.replayHash, 'string');
        assert.equal(r.replayHash.length, 64);
    });

    test('replay is byte-identical across two runs', () => {
        const events = [
            { tick: 0, seq: 0, action: 'move', phase: 'press', direction: { x: 0.5, y: 0.5 } },
            { tick: 10, seq: 0, action: 'light_attack', phase: 'press', targetId: 'enemy' },
            { tick: 15, seq: 0, action: 'move', phase: 'release' },
        ];
        const a = run({ events, ability: slashWithDirect, durationTicks: 50 });
        const b = run({ events, ability: slashWithDirect, durationTicks: 50 });
        assert.equal(a.outputBytes, b.outputBytes);
        assert.equal(a.replayHash, b.replayHash);
        assert.equal(a.inputLogBytes, b.inputLogBytes);
    });

    test('empty input log is identity on combatant state', () => {
        assert.equal(emptyDirectLogIsIdentity(seeds(), 'ally', slash), true);
        const r = run({ events: [], durationTicks: 45 });
        assert.equal(r.committedActions.length, 0);
        assert.equal(r.mechanicsReceipts.length, 0);
        assert.deepEqual(r.finalDirectState.position, quantizePosition(0, 0));
        assert.equal(r.combatants.enemy.mechanics.hp, 100);
        assert.equal(r.combatants.ally.mechanics.hp, 100);
    });
});

describe('Regression: foundation / Golden Master / mechanics untouched', () => {
    test('legacy Golden Master fixtures still match 8/8', () => {
        const fixturesDir = path.join(__dirname, '../test/fixtures/combat');
        const files = fs.readdirSync(fixturesDir).filter(f => f.endsWith('.json') && f.startsWith('fixture_'));
        assert.equal(files.length, 8);
        for (const file of files) {
            const data = JSON.parse(fs.readFileSync(path.join(fixturesDir, file), 'utf8'));
            const spec: BattleSpec = {
                activePreset: data.activePreset,
                deltaSeconds: data.deltaSeconds || (1.0 / 60.0),
                fixedFps: data.fixedFps,
                viewport: data.viewport || { width: 1280, height: 720 },
                participantOrder: data.participantOrder,
                initialState: data.initialState,
            } as BattleSpec;
            const expected = data.expected;
            const actual = resolveCombat(spec);
            assert.deepEqual(actual.evaluations, expected.evaluations, file);
            assert.deepEqual(actual.decisions, expected.decisions, file);
            assert.deepEqual(actual.attacks, expected.attacks, file);
            assert.deepEqual(actual.heals, expected.heals, file);
            assert.deepEqual(actual.deaths, expected.deaths, file);
            assert.deepEqual(actual.focusChanges, expected.focusChanges, file);
            assert.equal(actual.outcome, expected.outcome, file);
            for (let i = 0; i < expected.finalState.units.length; i++) {
                assert.equal(actual.finalState.units[i].hp, expected.finalState.units[i].hp);
                assert.ok(Math.abs(actual.finalState.units[i].pos_x - expected.finalState.units[i].pos_x) < 0.005);
                assert.ok(Math.abs(actual.finalState.units[i].pos_y - expected.finalState.units[i].pos_y) < 0.005);
            }
        }
    });

    test('legacy resolveCombat still free of mechanics receipts', () => {
        const legacy = resolveCombat({
            activePreset: 't',
            deltaSeconds: 1,
            viewport: { width: 1280, height: 720 },
            participantOrder: ['a', 'e'],
            initialState: {
                units: {
                    allies: [{ name: 'a', role: 'Frontline', max_hp: 100, attack: 10, defense: 0, heal_power: 0, move_speed: 0, attack_range: 999, attack_cooldown: 1, radius: 1, pos_x: 0, pos_y: 0 }],
                    enemies: [{ name: 'e', role: 'Frontline', max_hp: 100, attack: 10, defense: 0, heal_power: 0, move_speed: 0, attack_range: 999, attack_cooldown: 1, radius: 1, pos_x: 50, pos_y: 0 }],
                },
            },
        });
        assert.equal(legacy.mechanicsReceipts, undefined);
    });
});

