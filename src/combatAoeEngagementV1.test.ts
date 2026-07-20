import * as assert from 'node:assert/strict';
import { test, describe } from 'node:test';
import * as fs from 'fs';
import * as path from 'path';
import { AbilityDefinition, AbilityFixtureDocument } from './combatAbilityTypes';
import { AbilityValidationErrorCode, pricedTargetsFor, validateAbilityDefinition, validateAbilityFixtureDocument } from './combatAbilityValidator';
import {
    ENGAGEMENT_OVERFLOW_MULTIPLIER, ENGAGEMENT_SLOTS, engagementSlotsFor, falloffAtIndex,
    isSwarmTarget, MechanicsCombatant, resolveMechanics, SWARM_MULTIPLIER,
} from './combatMechanicsResolver';
import { CombatLabScenario, CombatLabUnit, runCombatLab } from './combatLabCore';

/**
 * AoE fan-out, delivery falloff, engagement slots and the swarm multiplier, plus the target-count
 * power budget that keeps area attacks from becoming a strict upgrade. See
 * docs/COMBAT_LETHALITY_AND_ANTI_HORDE_DESIGN.md Part 2.
 */

const fixture = JSON.parse(fs.readFileSync(path.join(__dirname, '../resources/combat-abilities/v1-reference-abilities.json'), 'utf8')) as AbilityFixtureDocument;
const catalog = { abilities: fixture.abilities, statuses: fixture.statuses };
const attacker: MechanicsCombatant = { id: 'a', hp: 500, maxHp: 500, attack: 40, defense: 0 };
const victim = (over: Partial<MechanicsCombatant> = {}): MechanicsCombatant =>
    ({ id: 't', hp: 500, maxHp: 500, attack: 0, defense: 0, tags: ['living'], statuses: [], buildup: {}, ...over });

const ability = (over: Partial<AbilityDefinition> = {}, delivery: Partial<AbilityDefinition['delivery']> = {}): AbilityDefinition => ({
    id: 'probe', name: 'Probe', tier: 'normal',
    delivery: { shape: 'single_target', range: 100, maxTargets: 1, falloff: 1, dodgeable: true, blockedByCover: false, pierces: false, ...delivery },
    effects: [{ kind: 'damage', vector: 'physical', penetration: { barrier: 'blocked', armor: 'blocked', requiresBodyContact: false, requiresDamageDealt: false }, targetRequirement: [], magnitude: 20 }],
    auto: { cooldown: 1, gambitTags: [] },
    scaleBehavior: { individual: 'full', huge: 'full', squad: 'full', fleet: 'full' }, counters: ['counter'], tags: [], ...over,
});
const hit = (spell: AbilityDefinition, target: MechanicsCombatant, delivery?: { falloff?: number; engagement?: number }) =>
    resolveMechanics({ ability: spell, attacker, target, statuses: fixture.statuses, delivery }).damageDealt;

// ---- Combat Lab helpers ----
const unit = (id: string, team: 'allies' | 'enemies', over: Partial<CombatLabUnit> = {}): CombatLabUnit => ({
    id, name: id, role: 'Frontline', team, hp: 100, maxHp: 100, attack: 15, defense: 5, armor: 0,
    moveSpeed: 150, attackRange: 300, cooldown: 1, accuracy: 0, evasion: 0, resistances: {},
    targetTags: ['living'], subsystemTags: [], normalAttackAbilityId: 'basic_slash',
    statuses: [], buildup: {}, healBlocked: false, position: { x: team === 'allies' ? -50 : 50, y: 0 }, ...over,
});
const scenario = (id: string, allies: CombatLabUnit[], enemies: CombatLabUnit[]): CombatLabScenario =>
    ({ id, name: id, mode: 'mechanics_v1', deltaSeconds: 1 / 30, allies, enemies });
/** Distinct enemies struck on the first tick any attack lands. */
const firstVolleyTargets = (run: ReturnType<typeof runCombatLab>) => {
    const first = run.output.attacks[0];
    if (!first) return [];
    return [...new Set(run.output.attacks.filter(a => a.tick === first.tick && a.unit === first.unit).map(a => a.target))];
};

describe('AoE fan-out', () => {
    test('a single-target ability still strikes exactly one enemy', () => {
        const run = runCombatLab(scenario('single', [unit('ace', 'allies')],
            Array.from({ length: 5 }, (_, i) => unit(`mob${i}`, 'enemies', { position: { x: 50, y: i * 20 } }))), catalog);
        assert.equal(firstVolleyTargets(run).length, 1);
    });

    test('maxTargets 3 strikes three distinct enemies in one volley', () => {
        const sweep = { ...structuredClone(fixture.abilities.find(a => a.id === 'area_bombardment')!), id: 'probe_sweep' };
        sweep.delivery.maxTargets = 3;
        const run = runCombatLab(scenario('fan', [unit('ace', 'allies', { normalAttackAbilityId: 'probe_sweep' })],
            Array.from({ length: 5 }, (_, i) => unit(`mob${i}`, 'enemies', { position: { x: 50, y: i * 20 } }))),
            { abilities: [...fixture.abilities, sweep], statuses: fixture.statuses });
        const struck = firstVolleyTargets(run);
        assert.equal(struck.length, 3);
        assert.equal(new Set(struck).size, 3, 'no combatant may be struck twice in one volley');
    });

    test('target order is deterministic across runs', () => {
        const sweep = { ...structuredClone(fixture.abilities.find(a => a.id === 'area_bombardment')!), id: 'probe_sweep' };
        sweep.delivery.maxTargets = 4;
        const build = () => scenario('order', [unit('ace', 'allies', { normalAttackAbilityId: 'probe_sweep' })],
            Array.from({ length: 6 }, (_, i) => unit(`mob${i}`, 'enemies', { position: { x: 50, y: i * 20 } })));
        const cat = { abilities: [...fixture.abilities, sweep], statuses: fixture.statuses };
        const left = runCombatLab(build(), cat), right = runCombatLab(build(), cat);
        assert.deepEqual(firstVolleyTargets(left), firstVolleyTargets(right));
        assert.equal(JSON.stringify(left.output), JSON.stringify(right.output));
        assert.equal(left.deterministic, true);
    });

    test('a lethal timer stays single target', () => {
        const doom = fixture.abilities.find(a => a.id === 'doom')!;
        assert.equal(doom.delivery.maxTargets, 1);
        const multi = structuredClone(doom);
        multi.delivery = { ...multi.delivery, shape: 'area', maxTargets: 6 };
        const codes = validateAbilityDefinition(multi, { statuses: fixture.statuses }).errors.map(e => e.code);
        assert.ok(codes.includes(AbilityValidationErrorCode.LETHAL_TIMER_MULTI_TARGET));
    });
});

describe('Delivery falloff', () => {
    test('the first target takes full damage and later ones ramp down', () => {
        assert.equal(falloffAtIndex(1, 4, 0.4), 1);
        assert.equal(falloffAtIndex(4, 4, 0.4), 0.4);
        assert.ok(falloffAtIndex(2, 4, 0.4) > falloffAtIndex(3, 4, 0.4));
    });

    test('falloff scales damage on the target it is applied to', () => {
        const spell = ability({}, { shape: 'area', maxTargets: 4, falloff: 0.5 });
        // Damage is priced from AbilityDefinition magnitude (20), not attacker.attack.
        assert.equal(hit(spell, victim()), 20);
        assert.equal(hit(spell, victim(), { falloff: 0.5 }), 10);
    });

    test('falloff lands before the minimum-damage floor, so a reached target always takes at least 1', () => {
        const spell = ability({}, { shape: 'area', maxTargets: 8, falloff: 0.01 });
        const armoured = victim({ defense: 19 });   // magnitude 20 - 19 = 1 before falloff
        assert.equal(hit(spell, armoured, { falloff: 0.01 }), 1);
    });

    test('healing and barriers are exempt from falloff', () => {
        const heal = ability({ effects: [{ kind: 'heal', vector: 'magical', penetration: { barrier: 'passes', armor: 'passes', requiresBodyContact: false, requiresDamageDealt: false }, targetRequirement: [], magnitude: 20 }] },
            { shape: 'area', maxTargets: 4, falloff: 0.5 });
        const full = resolveMechanics({ ability: heal, attacker, target: victim({ hp: 100 }), statuses: fixture.statuses }).target.hp;
        const edge = resolveMechanics({ ability: heal, attacker, target: victim({ hp: 100 }), statuses: fixture.statuses, delivery: { falloff: 0.5 } }).target.hp;
        assert.equal(full, edge, 'an ally at the edge of a support effect is not worse off');
    });

    test('buildup attenuates with falloff but never below 1', () => {
        const spell = ability({ effects: [{ kind: 'buildup', vector: 'magical', penetration: { barrier: 'passes', armor: 'passes', requiresBodyContact: false, requiresDamageDealt: false }, targetRequirement: [], magnitude: 20, statusId: 'burn' }] },
            { shape: 'cone', maxTargets: 4, falloff: 0.5 });
        assert.equal(resolveMechanics({ ability: spell, attacker, target: victim(), statuses: fixture.statuses }).target.buildup!.burn.value, 20);
        assert.equal(resolveMechanics({ ability: spell, attacker, target: victim(), statuses: fixture.statuses, delivery: { falloff: 0.5 } }).target.buildup!.burn.value, 10);
        assert.equal(resolveMechanics({ ability: spell, attacker, target: victim(), statuses: fixture.statuses, delivery: { falloff: 0.01 } }).target.buildup!.burn.value, 1);
    });

    test('pierces is carried on the shipped line ability', () => {
        assert.equal(fixture.abilities.find(a => a.id === 'petrify_ray')!.delivery.pierces, true);
    });
});

describe('Engagement slots', () => {
    test('slot counts follow the adopted size table', () => {
        assert.equal(ENGAGEMENT_SLOTS.medium, 3);
        assert.equal(ENGAGEMENT_SLOTS.colossal, 12);
        assert.equal(engagementSlotsFor({ id: 'x', hp: 1, maxHp: 1, attack: 0, defense: 0 }), 3, 'medium is the default');
        assert.equal(engagementSlotsFor({ id: 'x', hp: 1, maxHp: 1, attack: 0, defense: 0, sizeClass: 'colossal' }), 12);
    });

    test('an attacker beyond the slots deals a quarter damage', () => {
        const spell = ability();
        assert.equal(hit(spell, victim()), 20);
        assert.equal(hit(spell, victim(), { engagement: ENGAGEMENT_OVERFLOW_MULTIPLIER }), 5);
    });

    test('six attackers on one medium defender: three at full, three reduced', () => {
        const run = runCombatLab(scenario('slots', Array.from({ length: 6 }, (_, i) => unit(`atk${i}`, 'allies', { position: { x: -50, y: i * 20 } })),
            [unit('def', 'enemies', { hp: 4000, maxHp: 4000, attack: 1, cooldown: 99 })]), catalog);
        const firstTick = run.output.attacks[0].tick;
        const volley = run.output.attacks.filter(a => a.tick === firstTick && a.target === 'def').map(a => a.damage);
        assert.equal(volley.length, 6);
        // basic_slash magnitude 14 vs defense 5 → 9 full; overflow ×0.25 → 2.
        const full = volley.filter(d => d === 9).length;
        const reduced = volley.filter(d => d < 9).length;
        assert.equal(full, 3, `expected 3 full-damage attackers, saw ${volley.join(',')}`);
        assert.equal(reduced, 3);
    });

    test('engagement slots are independent of an ability target cap', () => {
        // One attacker with a 4-target ability occupies exactly one slot on each defender.
        const spell = ability({}, { shape: 'area', maxTargets: 4, falloff: 1 });
        assert.equal(hit(spell, victim(), { falloff: 1, engagement: 1 }), 20);
    });

    test('staggered cooldowns still assign overflow by participantOrder among all engagers', () => {
        // Ability cooldowns (not unit cooldown) gate re-fire. After the opening volley, only short-CD
        // attackers fire while all six remain in range — slot rank must still follow participantOrder.
        const base = structuredClone(fixture.abilities.find(a => a.id === 'basic_slash')!);
        const fast = { ...base, id: 'fast_slash', auto: { ...base.auto, cooldown: 0.5 } };
        const slow = { ...base, id: 'slow_slash', auto: { ...base.auto, cooldown: 99 } };
        const cat = { abilities: [...fixture.abilities, fast, slow], statuses: fixture.statuses };
        const defender = unit('def', 'enemies', { hp: 4000, maxHp: 4000, attack: 1, cooldown: 99 });

        const earlyAllies = Array.from({ length: 6 }, (_, i) => unit(`atk${i}`, 'allies', {
            position: { x: -50, y: i * 20 },
            normalAttackAbilityId: i < 2 ? 'fast_slash' : 'slow_slash',
        }));
        const early = runCombatLab(scenario('stagger_early', earlyAllies, [defender]), cat);
        const earlyByTick = new Map<number, typeof early.output.attacks>();
        for (const attack of early.output.attacks.filter(a => a.target === 'def')) {
            const list = earlyByTick.get(attack.tick) || [];
            list.push(attack);
            earlyByTick.set(attack.tick, list);
        }
        const earlyOnly = [...earlyByTick.entries()].find(([, list]) =>
            list.length === 2 && list.every(a => a.unit === 'atk0' || a.unit === 'atk1'));
        assert.ok(earlyOnly, 'expected a later tick with only the first two engagers firing');
        // atk0/atk1 are ranks 1–2 on a medium (3 slots) → full basic_slash damage (14−5=9).
        assert.ok(earlyOnly[1].every(a => a.damage === 9), `expected full slot damage, saw ${earlyOnly[1].map(a => a.damage).join(',')}`);

        const lateAllies = Array.from({ length: 6 }, (_, i) => unit(`late${i}`, 'allies', {
            position: { x: -50, y: i * 20 },
            normalAttackAbilityId: i < 4 ? 'slow_slash' : 'fast_slash',
        }));
        const late = runCombatLab(scenario('stagger_late', lateAllies, [structuredClone(defender)]), cat);
        const lateByTick = new Map<number, typeof late.output.attacks>();
        for (const attack of late.output.attacks.filter(a => a.target === 'def')) {
            const list = lateByTick.get(attack.tick) || [];
            list.push(attack);
            lateByTick.set(attack.tick, list);
        }
        const lateOnly = [...lateByTick.entries()].find(([, list]) =>
            list.length === 2 && list.every(a => a.unit === 'late4' || a.unit === 'late5'));
        assert.ok(lateOnly, 'expected a later tick with only the last two engagers firing');
        // late4/late5 are ranks 5–6 → overflow ×0.25 → trunc(9×0.25)=2.
        assert.ok(lateOnly[1].every(a => a.damage === 2), `expected overflow damage, saw ${lateOnly[1].map(a => `${a.unit}:${a.damage}`).join(',')}`);
    });
});

describe('Swarm multiplier', () => {
    const swarm = victim({ tags: ['living', 'swarm'] });
    test('an area ability hits a swarm target harder', () => {
        const area = ability({}, { shape: 'area', maxTargets: 6, falloff: 1 });
        assert.equal(hit(area, victim()), 20);
        assert.equal(hit(area, swarm), Math.trunc(20 * SWARM_MULTIPLIER));
    });

    test('a single-target ability gets no swarm bonus', () => {
        assert.equal(hit(ability(), swarm), 20);
    });

    test('boss and colossal targets never take the swarm bonus', () => {
        const area = ability({}, { shape: 'area', maxTargets: 6, falloff: 1 });
        assert.equal(isSwarmTarget(victim({ tags: ['swarm'], rank: 'boss' })), false);
        assert.equal(isSwarmTarget(victim({ tags: ['swarm', 'colossal'] })), false);
        assert.equal(hit(area, victim({ tags: ['living', 'swarm'], rank: 'boss' })), 20);
        assert.equal(hit(area, victim({ tags: ['living', 'swarm', 'colossal'] })), 20);
    });
});

describe('Ability magnitude and cooldown consumption', () => {
    test('resolveMechanics deals the effect magnitude, not attacker.attack', () => {
        const spell = ability({ effects: [{ kind: 'damage', vector: 'physical', penetration: { barrier: 'blocked', armor: 'blocked', requiresBodyContact: false, requiresDamageDealt: false }, targetRequirement: [], magnitude: 7 }] });
        // attacker.attack is 40; priced magnitude is 7.
        assert.equal(hit(spell, victim()), 7);
    });

    test('mechanics_v1 attacks consume ability.auto.cooldown rather than unit cooldown', () => {
        const slow = { ...structuredClone(fixture.abilities.find(a => a.id === 'basic_slash')!), id: 'slow_slash' };
        slow.auto = { ...slow.auto, cooldown: 5 };
        slow.effects = [{ ...slow.effects[0], magnitude: 14 }];
        const run = runCombatLab(scenario('cd', [unit('ace', 'allies', { normalAttackAbilityId: 'slow_slash', cooldown: 0.5, attack: 99 })],
            [unit('mob', 'enemies', { hp: 500, maxHp: 500, attack: 1, cooldown: 99 })]),
            { abilities: [...fixture.abilities, slow], statuses: fixture.statuses });
        const ticks = run.output.attacks.filter(a => a.unit === 'ace').map(a => a.tick);
        assert.ok(ticks.length >= 2, 'ace should attack at least twice');
        // deltaSeconds is 1/30; ability cooldown 5s ≈ 150 ticks between attacks, not the unit's 0.5s.
        const gap = ticks[1] - ticks[0];
        assert.ok(gap >= 140 && gap <= 160, `expected ~150 tick gap from ability cooldown, saw ${gap}`);
    });

    test('a stunned attacker still commits the ability cooldown on the tick it tried to swing', () => {
        // The cooldown is charged on the attempt, before the act gate. A unit stunned for 2s with a
        // 5s ability must fire at ~5s, not the instant the stun lapses at 2s.
        const slow = { ...structuredClone(fixture.abilities.find(a => a.id === 'basic_slash')!), id: 'slow_slash' };
        slow.auto = { ...slow.auto, cooldown: 5 };
        const cat = { abilities: [...fixture.abilities, slow], statuses: fixture.statuses };
        const stunned = unit('ace', 'allies', {
            normalAttackAbilityId: 'slow_slash', cooldown: 0.5,
            statuses: [{ id: 'stun', remainingSeconds: 2, intensity: 1 }],
        });
        const run = runCombatLab(scenario('stun_cd', [stunned],
            [unit('mob', 'enemies', { hp: 500, maxHp: 500, attack: 1, cooldown: 99 })]), cat);
        const first = run.output.attacks.find(a => a.unit === 'ace');
        assert.ok(first, 'ace should eventually attack');
        // deltaSeconds is 1/30: stun lapses near tick 60, the committed cooldown near tick 150.
        assert.ok(first.tick >= 140, `expected the swing to wait out the committed cooldown, saw tick ${first.tick}`);
    });
});

describe('Power budget priced by target count', () => {
    test('a single-target ability is priced exactly as before', () => {
        assert.equal(pricedTargetsFor(1, 1), 1);
    });

    test('area is cheaper per target than single target, but dearer overall', () => {
        const priced = pricedTargetsFor(6, 0.6);
        assert.ok(priced > 1, 'a fan-out must cost more than one target');
        assert.ok(priced < 6 * (1 + 0.6) / 2, 'the crowd discount must make area worthwhile');
    });

    test('at equal budget an area ability is strictly weaker in a duel', () => {
        // Same cooldown and tier: per-target magnitude must be divided by pricedTargets.
        const budget = 15 * 3 * 1;
        const singlePerTarget = budget / pricedTargetsFor(1, 1);
        const areaPerTarget = budget / pricedTargetsFor(6, 0.6);
        assert.ok(areaPerTarget < singlePerTarget, 'area must never be a strict upgrade one-on-one');
    });

    test('every shipped ability passes the new budget', () => {
        const results = validateAbilityFixtureDocument(fixture);
        const failed = results.map((r, i) => ({ id: fixture.abilities[i]?.id, r })).filter(x => !x.r.valid);
        assert.deepEqual(failed.map(x => x.id), [], 'all shipped abilities must validate');
    });

    test('an over-budget fan-out is rejected', () => {
        const greedy = ability({ auto: { cooldown: 1, gambitTags: [] } }, { shape: 'sweep', maxTargets: 12, falloff: 1 });
        const codes = validateAbilityDefinition(greedy, { statuses: fixture.statuses }).errors.map(e => e.code);
        assert.ok(codes.includes(AbilityValidationErrorCode.POWER_BUDGET_EXCEEDED));
    });
});
