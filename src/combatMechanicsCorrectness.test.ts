import * as assert from 'node:assert/strict';
import { test, describe } from 'node:test';
import { AbilityDefinition, StatusDefinition } from './combatAbilityTypes';
import { advanceMechanicsState, MechanicsCombatant, MechanicsReceipt, resolveMechanics } from './combatMechanicsResolver';

/**
 * Regression coverage for the four correctness defects measured in
 * docs/COMBAT_BALANCE_PLAYTEST_V1.md: over-time truncation, non-depleting
 * barriers, unread armour penetration, and lethal timers that never fired.
 */

const status = (id: string, statusClass: StatusDefinition['statusClass'], durationSeconds: number): StatusDefinition =>
    ({ id, statusClass, buildupThreshold: 100, durationSeconds, stacking: 'refresh', cureChannels: ['cleanse', 'time'], tags: [] });
const STATUSES: StatusDefinition[] = [
    status('poison', 'dot', 8), status('burn', 'dot', 6), status('bleed', 'dot', 10),
    status('regen', 'beneficial', 10), status('doom', 'lethal_timer', 12),
];

const pen = (over: Partial<AbilityDefinition['effects'][number]['penetration']> = {}) =>
    ({ barrier: 'blocked' as const, armor: 'blocked' as const, requiresBodyContact: false, requiresDamageDealt: false, ...over });
const ability = (effects: AbilityDefinition['effects'], tags: string[] = []): AbilityDefinition => ({
    id: 'test', name: 'Test', tier: 'normal',
    delivery: { shape: 'single_target', range: 1, maxTargets: 1, falloff: 1, dodgeable: true, blockedByCover: false, pierces: false },
    effects, auto: { cooldown: 1, gambitTags: [] },
    scaleBehavior: { individual: 'full', huge: 'full', squad: 'full', fleet: 'full' }, counters: ['counter'], tags,
});
const damageEffect = (over: Partial<AbilityDefinition['effects'][number]> = {}): AbilityDefinition['effects'][number] =>
    ({ kind: 'damage', vector: 'physical', penetration: pen(), targetRequirement: [], magnitude: 0, ...over });

const carrier = (id: string, hp: number, statuses: { id: string; remainingSeconds: number; intensity: number }[]): MechanicsCombatant =>
    ({ id, hp, maxHp: 200, attack: 0, defense: 0, tags: ['living'], statuses, buildup: {} });

/** Runs `seconds` of simulated time at the given tick width and returns the final HP. */
function advanceFor(state: MechanicsCombatant, seconds: number, delta: number, statuses: StatusDefinition[] = STATUSES): MechanicsCombatant {
    let current = state;
    const ticks = Math.round(seconds / delta);
    for (let i = 0; i < ticks; i++) current = advanceMechanicsState(current, delta, { statuses });
    return current;
}

describe('Combat Mechanics V1 correctness fixes', () => {
    test('poison deals its full per-second rate across a 30-tick second', () => {
        const after = advanceFor(carrier('p', 100, [{ id: 'poison', remainingSeconds: 8, intensity: 1 }]), 1, 1 / 30);
        assert.equal(100 - after.hp, 3, 'poison 3/s must deal exactly 3 over one second at 1/30s ticks');
    });

    test('over-time results are identical across tick widths for the same elapsed time', () => {
        for (const id of ['poison', 'burn', 'bleed'] as const) {
            const results = [1 / 30, 1 / 10, 1 / 4, 1 / 2, 1].map(delta =>
                200 - advanceFor(carrier(id, 200, [{ id, remainingSeconds: 999, intensity: 1 }]), 10, delta).hp);
            assert.equal(new Set(results).size, 1, `${id} differed across tick widths: ${results.join(',')}`);
        }
    });

    test('over-time totals match their designed rates over ten seconds', () => {
        const total = (id: string) => 200 - advanceFor(carrier(id, 200, [{ id, remainingSeconds: 999, intensity: 1 }]), 10, 1 / 30).hp;
        assert.equal(total('poison'), 30);
        assert.equal(total('burn'), 50);
        assert.equal(total('bleed'), 20);
    });

    test('regeneration accrues fractional healing instead of losing it to truncation', () => {
        const after = advanceFor(carrier('r', 100, [{ id: 'regen', remainingSeconds: 999, intensity: 1 }]), 10, 1 / 30);
        assert.equal(after.hp - 100, 20, 'regen 2/s must restore 20 HP over ten seconds');
    });

    test('sub-tick accrual carries across ticks rather than resetting', () => {
        // bleed is 2 HP/s: no whole HP can land on the first 1/30s tick, but the residual must persist.
        const one = advanceMechanicsState(carrier('b', 100, [{ id: 'bleed', remainingSeconds: 10, intensity: 1 }]), 1 / 30, { statuses: STATUSES });
        assert.equal(one.hp, 100, 'first fine tick should not yet remove a whole HP');
        assert.ok((one.statuses || [])[0].residualMilli! > 0, 'residual must be retained as JSON-safe state');
        assert.equal(advanceFor(carrier('b', 100, [{ id: 'bleed', remainingSeconds: 10, intensity: 1 }]), 5, 1 / 30).hp, 90);
    });

    test('a blocked barrier absorbs and depletes, then lets damage reach the body', () => {
        const attacker: MechanicsCombatant = { id: 'a', hp: 100, maxHp: 100, attack: 4, defense: 0 };
        let target: MechanicsCombatant = {
            id: 't', hp: 100, maxHp: 100, attack: 0, defense: 0, tags: ['living'],
            barrier: { amount: 10, blocksVectors: ['physical'], blocksStatusApplication: true },
        };
        const spell = ability([damageEffect()]);
        let absorbed = 0;
        for (let i = 0; i < 3; i++) {
            const result = resolveMechanics({ ability: spell, attacker, target, statuses: STATUSES });
            absorbed += result.receipts.filter(r => r.kind === 'barrier_absorbed').reduce((sum, r) => sum + (r.amount || 0), 0);
            target = result.target;
        }
        assert.equal(absorbed, 10, 'a 10-point pool must absorb exactly 10 before depleting');
        assert.equal(target.barrier!.amount, 0, 'pool must reach zero');
        assert.ok(target.hp < 100, 'damage must reach the body once the pool is empty');
    });

    test('armour piercing beats a plain attack against armour, and stays weaker against none', () => {
        const attacker: MechanicsCombatant = { id: 'a', hp: 100, maxHp: 100, attack: 15, defense: 0 };
        const plain = ability([damageEffect({ weaponScale: 'personal', penetration: pen({ armor: 'blocked' }) })]);
        const piercing = ability([damageEffect({ weaponScale: 'anti_armor', penetration: pen({ armor: 'reduced' }) })]);
        const hit = (spell: AbilityDefinition, armor: number) => resolveMechanics({
            ability: spell, attacker, statuses: STATUSES,
            target: { id: 't', hp: 500, maxHp: 500, attack: 0, defense: armor, tags: ['living'] },
        }).damageDealt;

        assert.ok(hit(piercing, 15) > hit(plain, 15), 'AP must beat a plain attack against armoured targets');
        assert.ok(hit(piercing, 25) > hit(plain, 25));
        assert.ok(hit(piercing, 40) > hit(plain, 40));
        assert.ok(hit(piercing, 0) < hit(plain, 0), 'AP keeps its trade-off against unarmoured targets');
    });

    test('an expiring lethal timer executes through the lethality gate', () => {
        const receipts: MechanicsReceipt[] = [];
        const after = advanceMechanicsState(carrier('d', 100, [{ id: 'doom', remainingSeconds: 0.02, intensity: 1 }]), 1 / 30, { statuses: STATUSES, receipts });
        assert.equal(after.hp, 0, 'doom must execute on expiry');
        assert.ok(receipts.some(r => r.kind === 'lethal_timer_expired'));
        assert.ok(receipts.some(r => r.kind === 'death'));
    });

    test('the lethality gate can still save a target from an expiring lethal timer', () => {
        const receipts: MechanicsReceipt[] = [];
        const doomed = carrier('d', 100, [{ id: 'doom', remainingSeconds: 0.02, intensity: 1 }]);
        doomed.lethality = { endureCharges: 1, undyingSeconds: 0 };
        const after = advanceMechanicsState(doomed, 1 / 30, { statuses: STATUSES, receipts });
        assert.equal(after.hp, 1, 'endure must hold the target at 1 HP');
        assert.ok(receipts.some(r => r.kind === 'endure'));
        assert.ok(!receipts.some(r => r.kind === 'death'));
    });

    test('a lethal timer that has not expired does nothing', () => {
        const after = advanceMechanicsState(carrier('d', 100, [{ id: 'doom', remainingSeconds: 12, intensity: 1 }]), 1 / 30, { statuses: STATUSES });
        assert.equal(after.hp, 100);
    });

    test('identical input reproduces identical output', () => {
        const build = () => carrier('x', 100, [{ id: 'poison', remainingSeconds: 8, intensity: 2 }, { id: 'regen', remainingSeconds: 5, intensity: 1 }]);
        const left = advanceFor(build(), 6, 1 / 30);
        const right = advanceFor(build(), 6, 1 / 30);
        assert.equal(JSON.stringify(left), JSON.stringify(right));
    });
});
