import * as assert from 'node:assert/strict';
import { test, describe } from 'node:test';
import * as fs from 'fs';
import * as path from 'path';
import { AbilityDefinition, AbilityFixtureDocument, StatusDefinition } from './combatAbilityTypes';
import { AbilityValidationErrorCode, validateAbilityDefinition } from './combatAbilityValidator';
import {
    advanceMechanicsState, CombatantRank, LETHAL_TIMER_IMMINENT_SECONDS,
    MechanicsCombatant, MechanicsReceipt, resolveMechanics,
} from './combatMechanicsResolver';

/**
 * Doom V1: an expiring lethal timer executes only a target already inside its rank's execution
 * band, otherwise lands as a share of maxHp, and never kills a colossal. See
 * docs/COMBAT_LETHALITY_AND_ANTI_HORDE_DESIGN.md Part 1.
 */

const fixture = JSON.parse(fs.readFileSync(path.join(__dirname, '../resources/combat-abilities/v1-reference-abilities.json'), 'utf8')) as AbilityFixtureDocument;
const STATUSES = fixture.statuses;
const DOOM = fixture.abilities.find(ability => ability.id === 'doom')!;
const DOOM_SECONDS = STATUSES.find(status => status.id === 'doom')!.durationSeconds;
const TICK = 1 / 30;

const target = (over: Partial<MechanicsCombatant> = {}): MechanicsCombatant =>
    ({ id: 't', hp: 100, maxHp: 100, attack: 0, defense: 0, tags: ['living'], statuses: [], buildup: {}, ...over });
const caster = (id = 'caster'): MechanicsCombatant => ({ id, hp: 100, maxHp: 100, attack: 10, defense: 0 });
const doomed = (over: Partial<MechanicsCombatant> = {}, sourceId = 'caster'): MechanicsCombatant =>
    target({ statuses: [{ id: 'doom', remainingSeconds: DOOM_SECONDS, intensity: 1, sourceId }], ...over });

/** Advances until the doom timer resolves, returning the final state and every receipt produced. */
function runTimer(state: MechanicsCombatant, seconds = DOOM_SECONDS + 1, defeatedIds: string[] = []): { state: MechanicsCombatant; receipts: MechanicsReceipt[] } {
    let current = state;
    const receipts: MechanicsReceipt[] = [];
    for (let i = 0; i < Math.round(seconds / TICK); i++) {
        const tick: MechanicsReceipt[] = [];
        current = advanceMechanicsState(current, TICK, { statuses: STATUSES, receipts: tick, defeatedIds });
        receipts.push(...tick);
    }
    return { state: current, receipts };
}
const kinds = (receipts: MechanicsReceipt[]) => receipts.map(receipt => receipt.kind);

describe('Doom V1 — buildup and onset', () => {
    test('the shipped ability applies doom on the fourth hit, not the third', () => {
        let victim = target();
        for (let hit = 1; hit <= 4; hit++) {
            victim = resolveMechanics({ ability: DOOM, attacker: caster(), target: victim, statuses: STATUSES }).target;
            const applied = (victim.statuses || []).some(status => status.id === 'doom');
            assert.equal(applied, hit === 4, `doom should apply on hit 4, saw applied=${applied} at hit ${hit}`);
        }
    });

    test('the applied instance records its caster and ability', () => {
        let victim = target();
        for (let i = 0; i < 4; i++) victim = resolveMechanics({ ability: DOOM, attacker: caster('mage'), target: victim, statuses: STATUSES }).target;
        const instance = (victim.statuses || []).find(status => status.id === 'doom')!;
        assert.equal(instance.sourceId, 'mage');
        assert.equal(instance.sourceAbilityId, 'doom');
    });

    test('reapplication after a resolution needs a higher threshold', () => {
        let victim = target({ hp: 100, maxHp: 100 });
        for (let i = 0; i < 4; i++) victim = resolveMechanics({ ability: DOOM, attacker: caster(), target: victim, statuses: STATUSES }).target;
        assert.equal(victim.buildup!.doom.procCount, 1);
        // Threshold is now 100 * (1 + 0.5 * 1) = 150, so four more hits (100) must not re-apply.
        victim.statuses = [];
        for (let i = 0; i < 4; i++) victim = resolveMechanics({ ability: DOOM, attacker: caster(), target: victim, statuses: STATUSES }).target;
        assert.equal((victim.statuses || []).some(status => status.id === 'doom'), false);
        for (let i = 0; i < 2; i++) victim = resolveMechanics({ ability: DOOM, attacker: caster(), target: victim, statuses: STATUSES }).target;
        assert.equal((victim.statuses || []).some(status => status.id === 'doom'), true);
    });
});

describe('Doom V1 — imminent window', () => {
    test('doom_imminent is announced once, inside the final three seconds', () => {
        const { receipts } = runTimer(doomed());
        const imminent = receipts.filter(receipt => receipt.kind === 'doom_imminent');
        assert.equal(imminent.length, 1, 'imminent must be announced exactly once');
        assert.ok(imminent[0].amount! <= LETHAL_TIMER_IMMINENT_SECONDS && imminent[0].amount! > LETHAL_TIMER_IMMINENT_SECONDS - TICK * 2);
    });

    test('the instance carries the imminent flag for readers', () => {
        const { state } = runTimer(doomed(), DOOM_SECONDS - 1);
        assert.equal((state.statuses || []).find(status => status.id === 'doom')!.imminent, true);
    });
});

describe('Doom V1 — expiry resolution by rank', () => {
    const cases: { rank: CombatantRank; executeAt: number; surviveAt: number }[] = [
        { rank: 'normal', executeAt: 50, surviveAt: 51 },
        { rank: 'elite', executeAt: 35, surviveAt: 36 },
        { rank: 'boss', executeAt: 20, surviveAt: 21 },
    ];
    for (const { rank, executeAt, surviveAt } of cases) {
        test(`${rank} executes at ${executeAt}% and survives at ${surviveAt}%`, () => {
            const low = runTimer(doomed({ rank, hp: executeAt, maxHp: 100 }));
            assert.equal(low.state.hp, 0);
            assert.ok(kinds(low.receipts).includes('doom_executed'));

            const high = runTimer(doomed({ rank, hp: surviveAt, maxHp: 100 }));
            assert.ok(high.state.hp > 0, `${rank} above threshold must survive`);
            assert.ok(kinds(high.receipts).includes('doom_fallback_damage'));
        });
    }

    test('above threshold deals exactly 20% of maxHp', () => {
        const { state, receipts } = runTimer(doomed({ hp: 900, maxHp: 900 }));
        assert.equal(state.hp, 900 - 180);
        assert.equal(receipts.find(receipt => receipt.kind === 'doom_fallback_damage')!.amount, 180);
    });

    test('fallback damage that reaches zero still dies through the lethality gate', () => {
        const { state, receipts } = runTimer(doomed({ rank: 'boss', hp: 15, maxHp: 100 }));
        assert.equal(state.hp, 0);
        // 15% is below the boss 20% band, so this is an execution rather than fallback damage.
        assert.ok(kinds(receipts).includes('doom_executed'));
        assert.ok(kinds(receipts).includes('death'));
    });

    test('healing out of the execution band prevents execution and is reported', () => {
        let victim = doomed({ hp: 40, maxHp: 100 });
        const receipts: MechanicsReceipt[] = [];
        for (let i = 0; i < Math.round((DOOM_SECONDS + 1) / TICK); i++) {
            if (i === 60) victim.hp = 80;   // a heal lands two seconds in
            const tick: MechanicsReceipt[] = [];
            victim = advanceMechanicsState(victim, TICK, { statuses: STATUSES, receipts: tick });
            receipts.push(...tick);
        }
        assert.ok(kinds(receipts).includes('doom_threshold_escaped'));
        assert.ok(!kinds(receipts).includes('doom_executed'));
        assert.equal(victim.hp, 80 - 20);
    });
});

describe('Doom V1 — colossal conversion', () => {
    const colossal = (tags: string[]) => doomed({
        hp: 500, maxHp: 500, tags: ['colossal'],
        subsystems: tags.map(tag => ({ tag: tag as never, hp: 100, maxHp: 100, disabledSeconds: 0 })),
    });

    test('destroys a critical subsystem permanently instead of killing', () => {
        const { state, receipts } = runTimer(colossal(['locomotion', 'power']));
        assert.equal(state.hp, 500, 'a colossal never dies to a lethal timer');
        const destroyed = state.subsystems!.find(system => system.destroyed);
        assert.equal(destroyed!.tag, 'power', 'power outranks locomotion');
        assert.equal(destroyed!.hp, 0);
        assert.ok(kinds(receipts).includes('doom_subsystem_destroyed'));
        assert.ok(!kinds(receipts).includes('doom_executed'));
    });

    test('follows the declared priority order', () => {
        const order = [
            { present: ['sensor', 'command', 'locomotion'], expect: 'command' },
            { present: ['locomotion', 'sensor'], expect: 'locomotion' },
            { present: ['sensor'], expect: 'sensor' },
        ];
        for (const { present, expect } of order) {
            const { state } = runTimer(colossal(present));
            assert.equal(state.subsystems!.find(system => system.destroyed)!.tag, expect);
        }
    });

    test('misfires safely with a structured receipt when no subsystem exists', () => {
        const { state, receipts } = runTimer(colossal([]));
        assert.equal(state.hp, 500);
        assert.ok(kinds(receipts).includes('doom_no_subsystem'));
        assert.ok(!kinds(receipts).includes('doom_executed'));
    });

    test('a second doom destroys the next subsystem, never the same one twice', () => {
        const first = runTimer(colossal(['power', 'command']));
        let victim = first.state;
        victim.statuses = [{ id: 'doom', remainingSeconds: DOOM_SECONDS, intensity: 1, sourceId: 'caster' }];
        const second = runTimer(victim);
        const destroyed = second.state.subsystems!.filter(system => system.destroyed).map(system => system.tag);
        assert.deepEqual(destroyed.sort(), ['command', 'power']);
        assert.equal(second.state.hp, 500);
    });
});

describe('Doom V1 — counters', () => {
    test('endure holds the target at 1 HP and reports prevention', () => {
        const victim = doomed({ hp: 10, maxHp: 100 });
        victim.lethality = { endureCharges: 1, undyingSeconds: 0 };
        const { state, receipts } = runTimer(victim);
        assert.equal(state.hp, 1);
        assert.ok(kinds(receipts).includes('endure'));
        assert.ok(kinds(receipts).includes('doom_prevented'));
        assert.ok(!kinds(receipts).includes('doom_executed'));
    });

    test('undying covering the timer holds the target at 1 HP', () => {
        const victim = doomed({ hp: 10, maxHp: 100 });
        victim.lethality = { endureCharges: 0, undyingSeconds: DOOM_SECONDS + 2 };
        const { state, receipts } = runTimer(victim);
        assert.equal(state.hp, 1);
        assert.ok(kinds(receipts).includes('undying'));
        assert.ok(kinds(receipts).includes('doom_prevented'));
    });

    test('defeating the caster lifts only that caster\'s doom', () => {
        const victim = target({ statuses: [
            { id: 'doom', remainingSeconds: DOOM_SECONDS, intensity: 1, sourceId: 'mage_a' },
        ] });
        const { state, receipts } = runTimer(victim, 1, ['mage_a']);
        assert.equal((state.statuses || []).length, 0);
        assert.ok(kinds(receipts).includes('doom_source_defeated'));
    });

    test('a doom cast by someone still alive is untouched', () => {
        const victim = target({ statuses: [
            { id: 'doom', remainingSeconds: DOOM_SECONDS, intensity: 1, sourceId: 'mage_b' },
        ] });
        const { state, receipts } = runTimer(victim, 1, ['mage_a']);
        assert.equal((state.statuses || []).length, 1);
        assert.ok(!kinds(receipts).includes('doom_source_defeated'));
    });

    test('legacy instances without a source are never lifted', () => {
        const victim = target({ statuses: [{ id: 'doom', remainingSeconds: DOOM_SECONDS, intensity: 1 }] });
        const { state, receipts } = runTimer(victim, 1, ['mage_a', 'anyone']);
        assert.equal((state.statuses || []).length, 1);
        assert.ok(!kinds(receipts).includes('doom_source_defeated'));
    });

    test('cleanse removes doom before it can resolve', () => {
        const cleanse: AbilityDefinition = {
            id: 'c', name: 'Cleanse', tier: 'normal',
            delivery: { shape: 'single_target', range: 1, maxTargets: 1, falloff: 1, dodgeable: true, blockedByCover: false, pierces: false },
            effects: [{ kind: 'cleanse', vector: 'magical', penetration: { barrier: 'passes', armor: 'passes', requiresBodyContact: false, requiresDamageDealt: false }, targetRequirement: [], magnitude: 1 }],
            auto: { cooldown: 4, gambitTags: [] },
            scaleBehavior: { individual: 'full', huge: 'full', squad: 'full', fleet: 'full' }, counters: ['silence'], tags: [],
        };
        const cleansed = resolveMechanics({ ability: cleanse, attacker: caster(), target: doomed({ hp: 10, maxHp: 100 }), statuses: STATUSES }).target;
        assert.equal((cleansed.statuses || []).some(status => status.id === 'doom'), false);
        const { state, receipts } = runTimer(cleansed);
        assert.equal(state.hp, 10);
        assert.ok(!kinds(receipts).includes('doom_executed'));
    });
});

describe('Doom V1 — determinism and serialisation', () => {
    test('identical input reproduces identical output', () => {
        const left = runTimer(doomed({ hp: 40, maxHp: 100 }));
        const right = runTimer(doomed({ hp: 40, maxHp: 100 }));
        assert.equal(JSON.stringify(left.state), JSON.stringify(right.state));
        assert.deepEqual(kinds(left.receipts), kinds(right.receipts));
    });

    test('state survives a JSON round trip mid-timer', () => {
        const half = runTimer(doomed({ hp: 40, maxHp: 100 }), DOOM_SECONDS / 2);
        const revived = JSON.parse(JSON.stringify(half.state)) as MechanicsCombatant;
        assert.deepEqual(revived, half.state);
        const direct = runTimer(half.state, DOOM_SECONDS);
        const roundTripped = runTimer(revived, DOOM_SECONDS);
        assert.equal(JSON.stringify(direct.state), JSON.stringify(roundTripped.state));
    });
});

describe('Doom V1 — validator', () => {
    const lethalStatus: StatusDefinition = STATUSES.find(status => status.id === 'doom')!;
    const build = (over: Partial<AbilityDefinition>): AbilityDefinition => ({ ...structuredClone(DOOM), ...over });
    const codes = (ability: AbilityDefinition) => validateAbilityDefinition(ability, { statuses: STATUSES }).errors.map(issue => issue.code);

    test('the shipped doom ability is valid under the new rules', () => {
        assert.equal(validateAbilityDefinition(DOOM, { statuses: STATUSES }).valid, true);
        assert.equal(DOOM.effects[0].magnitude, 25);
    });

    test('rejects magnitude 26', () => {
        const bad = build({ effects: [{ ...structuredClone(DOOM.effects[0]), magnitude: 26 }] });
        assert.ok(codes(bad).includes(AbilityValidationErrorCode.LETHAL_TIMER_BUILDUP_TOO_HIGH));
    });

    test('rejects a cooldown of seven seconds', () => {
        assert.ok(codes(build({ auto: { ...DOOM.auto, cooldown: 7 } })).includes(AbilityValidationErrorCode.LETHAL_TIMER_COOLDOWN_TOO_LOW));
    });

    test('rejects a multi-target shape', () => {
        assert.ok(codes(build({ delivery: { ...DOOM.delivery, shape: 'area', maxTargets: 6 } })).includes(AbilityValidationErrorCode.LETHAL_TIMER_MULTI_TARGET));
    });

    test('rejects fewer than two counters', () => {
        assert.ok(codes(build({ counters: ['cleanse'] })).includes(AbilityValidationErrorCode.LETHAL_TIMER_COUNTER_REQUIRED));
    });

    test('rejects tier below elite', () => {
        assert.ok(codes(build({ tier: 'normal' })).includes(AbilityValidationErrorCode.LETHAL_TIMER_TIER_TOO_LOW));
    });

    test('rejects immediate onset at or above the threshold', () => {
        const bad = build({ effects: [{ ...structuredClone(DOOM.effects[0]), magnitude: lethalStatus.buildupThreshold }] });
        assert.ok(codes(bad).includes(AbilityValidationErrorCode.LETHAL_TIMER_IMMEDIATE_ONSET));
    });

    test('rejects pairing with hard control', () => {
        const stun = STATUSES.find(status => status.statusClass === 'hard_control');
        if (!stun) return;
        const bad = build({ effects: [structuredClone(DOOM.effects[0]), { ...structuredClone(DOOM.effects[0]), statusId: stun.id }] });
        assert.ok(codes(bad).includes(AbilityValidationErrorCode.LETHAL_TIMER_WITH_HARD_CONTROL));
    });

    test('rejects direct death against colossal targets', () => {
        assert.ok(codes(build({ scaleBehavior: { ...DOOM.scaleBehavior, huge: 'full' } })).includes(AbilityValidationErrorCode.LETHAL_TIMER_COLOSSAL_DEATH));
    });

    test('rejects undodgeable lethal timers that also pass barriers', () => {
        const bad = build({
            delivery: { ...DOOM.delivery, dodgeable: false },
            effects: [{ ...structuredClone(DOOM.effects[0]), penetration: { ...DOOM.effects[0].penetration, barrier: 'passes' } }],
        });
        assert.ok(codes(bad).includes(AbilityValidationErrorCode.LETHAL_TIMER_NO_INTERCEPTION));
    });

    test('rejects counters that omit cleanse and dispel', () => {
        assert.ok(codes(build({ counters: ['armor', 'evasion'] })).includes(AbilityValidationErrorCode.LETHAL_TIMER_COUNTER_REQUIRED));
    });

    test('rejects split lethal buildup that exceeds the aggregate cap', () => {
        const half = structuredClone(DOOM.effects[0]);
        half.magnitude = 20;
        const bad = build({ effects: [half, structuredClone(half)] });
        assert.ok(codes(bad).includes(AbilityValidationErrorCode.LETHAL_TIMER_BUILDUP_TOO_HIGH));
    });
});

describe('Doom V1 — DoT and lethality gate on the same tick', () => {
    test('DoT zeroing HP on the same advance as doom expiry still runs the lethality gate', () => {
        const receipts: MechanicsReceipt[] = [];
        // Poison deals whole HP this tick and doom expires on the same advance. Undying must still
        // fire: without routing DoT through applyHpDamage, both paths skip the lethality gate.
        const state: MechanicsCombatant = {
            id: 't', hp: 2, maxHp: 100, attack: 0, defense: 0, tags: ['living'], buildup: {},
            lethality: { endureCharges: 0, undyingSeconds: 5 },
            statuses: [
                { id: 'poison', remainingSeconds: 8, intensity: 1, residualMilli: 0 },
                { id: 'doom', remainingSeconds: 0.02, intensity: 1, sourceId: 'caster' },
            ],
        };
        const after = advanceMechanicsState(state, 1, { statuses: STATUSES, receipts });
        assert.equal(after.hp, 1);
        assert.ok(receipts.some(r => r.kind === 'undying'), `expected undying, saw ${receipts.map(r => r.kind).join(',')}`);
        assert.ok(!receipts.some(r => r.kind === 'death'));
    });
});

/**
 * The lethality gate is shared by every lethal source in one advance — each damaging DoT and each
 * expiring lethal timer. It must resolve exactly once per tick, or a target burns one endure charge
 * per poison/burn instance and reports its own death twice.
 */
describe('Doom V1 — one lethality gate per advance', () => {
    const count = (receipts: MechanicsReceipt[], kind: string) => receipts.filter(r => r.kind === kind).length;
    /** HP low enough that poison alone would zero it, so every DoT trips the gate independently. */
    const rotting = (over: Partial<MechanicsCombatant> = {}): MechanicsCombatant => target({
        hp: 2,
        statuses: [
            { id: 'poison', remainingSeconds: 8, intensity: 1, residualMilli: 0 },
            { id: 'burn', remainingSeconds: 6, intensity: 1, residualMilli: 0 },
        ],
        ...over,
    });

    test('two DoTs zeroing HP in one tick spend a single endure charge', () => {
        const receipts: MechanicsReceipt[] = [];
        const after = advanceMechanicsState(rotting({ lethality: { endureCharges: 2, undyingSeconds: 0 } }), 1, { statuses: STATUSES, receipts });
        assert.equal(count(receipts, 'endure'), 1, `expected one endure, saw ${receipts.map(r => r.kind).join(',')}`);
        assert.equal(after.lethality!.endureCharges, 1);
        assert.equal(after.hp, 1);
        assert.equal(count(receipts, 'death'), 0);
    });

    test('two DoTs killing an unprotected target report death once', () => {
        const receipts: MechanicsReceipt[] = [];
        const after = advanceMechanicsState(rotting(), 1, { statuses: STATUSES, receipts });
        assert.equal(count(receipts, 'death'), 1, `expected one death, saw ${receipts.map(r => r.kind).join(',')}`);
        assert.equal(after.hp, 0);
    });

    test('DoT and doom expiring together still spend at most one endure charge', () => {
        const receipts: MechanicsReceipt[] = [];
        const state = rotting({ lethality: { endureCharges: 2, undyingSeconds: 0 } });
        state.statuses!.push({ id: 'doom', remainingSeconds: 0.02, intensity: 1, sourceId: 'caster' });
        const after = advanceMechanicsState(state, 1, { statuses: STATUSES, receipts });
        assert.ok(kinds(receipts).includes('lethal_timer_expired'));
        assert.equal(count(receipts, 'endure'), 1, `expected one endure, saw ${receipts.map(r => r.kind).join(',')}`);
        assert.equal(after.lethality!.endureCharges, 1);
        assert.equal(after.hp, 1);
        assert.equal(count(receipts, 'death'), 0);
        // The gate held the target, so the timer must not claim an execution it did not get.
        assert.ok(kinds(receipts).includes('doom_prevented'));
        assert.ok(!kinds(receipts).includes('doom_executed'));
    });

    test('DoT and doom expiring together report undying once', () => {
        const receipts: MechanicsReceipt[] = [];
        const state = rotting({ lethality: { endureCharges: 0, undyingSeconds: 5 } });
        state.statuses!.push({ id: 'doom', remainingSeconds: 0.02, intensity: 1, sourceId: 'caster' });
        const after = advanceMechanicsState(state, 1, { statuses: STATUSES, receipts });
        assert.equal(count(receipts, 'undying'), 1, `expected one undying, saw ${receipts.map(r => r.kind).join(',')}`);
        assert.equal(after.hp, 1);
        assert.equal(count(receipts, 'death'), 0);
    });

    test('a non-lethal DoT tick produces no lethality receipt at all', () => {
        const receipts: MechanicsReceipt[] = [];
        const after = advanceMechanicsState(rotting({ hp: 100, lethality: { endureCharges: 1, undyingSeconds: 0 } }), 1, { statuses: STATUSES, receipts });
        assert.equal(after.hp, 92);   // poison 3 + burn 5
        assert.equal(after.lethality!.endureCharges, 1);
        assert.equal(receipts.filter(r => r.stage === 'lethality').length, 0);
    });

    test('aggregating DoT damage leaves the 30Hz and 60Hz residual totals untouched', () => {
        const drain = (tick: number) => {
            let current = target({
                hp: 200, maxHp: 200,
                statuses: [
                    { id: 'poison', remainingSeconds: 8, intensity: 1, residualMilli: 0 },
                    { id: 'bleed', remainingSeconds: 10, intensity: 1, residualMilli: 0 },
                ],
            });
            for (let i = 0; i < Math.round(4 / tick); i++) current = advanceMechanicsState(current, tick, { statuses: STATUSES });
            return current.hp;
        };
        // Banking the tick's DoT damage and subtracting it once cannot change the residual maths, so
        // both figures are the pre-change ones. They differ by 1 HP because `bleed` at 2 HP/s does not
        // divide evenly into either tick width — that rounding is long-standing and out of scope here.
        assert.equal(drain(1 / 30), 180);
        assert.equal(drain(1 / 60), 181);
    });
});
