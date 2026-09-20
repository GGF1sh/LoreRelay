import * as assert from 'node:assert/strict';
import { test, describe } from 'node:test';
import { AbilityDefinition, StatusDefinition } from './combatAbilityTypes';
import { advanceMechanicsState, MechanicsCombatant, resolveMechanics } from './combatMechanicsResolver';

/**
 * Regression coverage for the heal-reduction gap measured in
 * docs/COMBAT_BALANCE_PLAYTEST_V1.md §P.4: healReceivedMul/heal_block were
 * consumed by the direct heal effect but ignored by regeneration ticks in
 * advanceMechanicsState, so condition 04/05 in that playtest were byte-identical.
 */

const STATUSES: StatusDefinition[] = [
    { id: 'poison', statusClass: 'dot', buildupThreshold: 100, durationSeconds: 8, stacking: 'refresh', cureChannels: ['cleanse', 'time'], tags: [] },
    { id: 'burn', statusClass: 'dot', buildupThreshold: 100, durationSeconds: 6, stacking: 'refresh', cureChannels: ['cleanse', 'time'], tags: [] },
    { id: 'bleed', statusClass: 'dot', buildupThreshold: 100, durationSeconds: 10, stacking: 'refresh', cureChannels: ['cleanse', 'time'], tags: [] },
    { id: 'regen', statusClass: 'beneficial', buildupThreshold: 100, durationSeconds: 10, stacking: 'refresh', cureChannels: ['dispel', 'time'], tags: [] },
];

const carrier = (hp: number, statuses: { id: string; remainingSeconds: number; intensity: number }[], over: Partial<MechanicsCombatant> = {}): MechanicsCombatant =>
    ({ id: 'x', hp, maxHp: 200, attack: 0, defense: 0, tags: ['living'], statuses, buildup: {}, ...over });

/** Advances `seconds` of simulated time at the given tick width. */
function advanceFor(state: MechanicsCombatant, seconds: number, delta: number): MechanicsCombatant {
    let current = state;
    const ticks = Math.round(seconds / delta);
    for (let i = 0; i < ticks; i++) current = advanceMechanicsState(current, delta, { statuses: STATUSES });
    return current;
}

const ability = (effects: AbilityDefinition['effects']): AbilityDefinition => ({
    id: 'test', name: 'Test', tier: 'normal',
    delivery: { shape: 'single_target', range: 1, maxTargets: 1, falloff: 1, dodgeable: true, blockedByCover: false, pierces: false },
    effects, auto: { cooldown: 1, gambitTags: [] },
    scaleBehavior: { individual: 'full', huge: 'full', squad: 'full', fleet: 'full' }, counters: ['counter'], tags: [],
});
const healEffect = (magnitude: number): AbilityDefinition['effects'][number] =>
    ({ kind: 'heal', vector: 'magical', penetration: { barrier: 'passes', armor: 'passes', requiresBodyContact: false, requiresDamageDealt: false }, targetRequirement: [], magnitude });
const healer: MechanicsCombatant = { id: 'h', hp: 1, maxHp: 1, attack: 1, defense: 0 };

describe('Heal-block now applies to regeneration ticks', () => {
    test('regen +20 over 10s becomes +5 under heal_block (x0.25)', () => {
        const after = advanceFor(carrier(100, [{ id: 'regen', remainingSeconds: 999, intensity: 1 }, { id: 'heal_block', remainingSeconds: 999, intensity: 1 }]), 10, 1 / 30);
        assert.equal(after.hp - 100, 5);
    });

    test('healReceivedMul 1.0 leaves regen at its full +20', () => {
        const after = advanceFor(carrier(100, [{ id: 'regen', remainingSeconds: 999, intensity: 1 }], { healReceivedMul: 1.0 }), 10, 1 / 30);
        assert.equal(after.hp - 100, 20);
    });

    test('healReceivedMul 0 fully suppresses regen', () => {
        const after = advanceFor(carrier(100, [{ id: 'regen', remainingSeconds: 999, intensity: 1 }], { healReceivedMul: 0 }), 10, 1 / 30);
        assert.equal(after.hp, 100);
    });

    test('the direct heal path is not doubly discounted', () => {
        const blocked = resolveMechanics({ ability: ability([healEffect(20)]), attacker: healer, target: carrier(50, [{ id: 'heal_block', remainingSeconds: 999, intensity: 1 }]), statuses: STATUSES });
        assert.equal(blocked.target.hp - 50, 5, 'direct heal must apply the x0.25 exactly once, matching Math.trunc(20 * 0.25)');
    });

    test('poison, burn and bleed damage are unaffected by heal_block or healReceivedMul', () => {
        const rate = (id: string) => 100 - advanceFor(carrier(100, [{ id, remainingSeconds: 999, intensity: 1 }, { id: 'heal_block', remainingSeconds: 999, intensity: 1 }]), 10, 1 / 30).hp;
        assert.equal(rate('poison'), 30);
        assert.equal(rate('burn'), 50);
        assert.equal(rate('bleed'), 20);
        // healReceivedMul is a *healing* multiplier and must not touch damage either.
        const damaged = advanceFor(carrier(100, [{ id: 'poison', remainingSeconds: 999, intensity: 1 }], { healReceivedMul: 0 }), 10, 1 / 30);
        assert.equal(100 - damaged.hp, 30);
    });

    test('reduced regen is tick-width invariant for the same elapsed time', () => {
        const results = [1 / 30, 1 / 10, 1 / 2, 1].map(delta =>
            advanceFor(carrier(100, [{ id: 'regen', remainingSeconds: 999, intensity: 1 }, { id: 'heal_block', remainingSeconds: 999, intensity: 1 }]), 10, delta).hp - 100);
        assert.equal(new Set(results).size, 1, `reduced regen differed across tick widths: ${results.join(',')}`);
        assert.equal(results[0], 5);
    });

    test('reduced regen still clamps at maxHp', () => {
        const after = advanceFor(carrier(198, [{ id: 'regen', remainingSeconds: 999, intensity: 1 }]), 10, 1 / 30);
        assert.equal(after.hp, 200, 'unblocked regen (+20) must clamp at maxHp 200, not overshoot');
    });

    test('identical input reproduces identical output', () => {
        const build = () => carrier(100, [{ id: 'regen', remainingSeconds: 10, intensity: 1 }, { id: 'heal_block', remainingSeconds: 6, intensity: 1 }]);
        const left = advanceFor(build(), 8, 1 / 30);
        const right = advanceFor(build(), 8, 1 / 30);
        assert.equal(JSON.stringify(left), JSON.stringify(right));
    });
});
