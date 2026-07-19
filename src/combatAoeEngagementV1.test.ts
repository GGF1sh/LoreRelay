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
        assert.equal(hit(spell, victim()), 40);
        assert.equal(hit(spell, victim(), { falloff: 0.5 }), 20);
    });

    test('falloff lands before the minimum-damage floor, so a reached target always takes at least 1', () => {
        const spell = ability({}, { shape: 'area', maxTargets: 8, falloff: 0.01 });
        const armoured = victim({ defense: 39 });   // 40 - 39 = 1 before falloff
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
        assert.equal(hit(spell, victim()), 40);
        assert.equal(hit(spell, victim(), { engagement: ENGAGEMENT_OVERFLOW_MULTIPLIER }), 10);
    });

    test('six attackers on one medium defender: three at full, three reduced', () => {
        const run = runCombatLab(scenario('slots', Array.from({ length: 6 }, (_, i) => unit(`atk${i}`, 'allies', { position: { x: -50, y: i * 20 } })),
            [unit('def', 'enemies', { hp: 4000, maxHp: 4000, attack: 1, cooldown: 99 })]), catalog);
        const firstTick = run.output.attacks[0].tick;
        const volley = run.output.attacks.filter(a => a.tick === firstTick && a.target === 'def').map(a => a.damage);
        assert.equal(volley.length, 6);
        const full = volley.filter(d => d === 10).length;
        const reduced = volley.filter(d => d < 10).length;
        assert.equal(full, 3, `expected 3 full-damage attackers, saw ${volley.join(',')}`);
        assert.equal(reduced, 3);
    });

    test('engagement slots are independent of an ability target cap', () => {
        // One attacker with a 4-target ability occupies exactly one slot on each defender.
        const spell = ability({}, { shape: 'area', maxTargets: 4, falloff: 1 });
        assert.equal(hit(spell, victim(), { falloff: 1, engagement: 1 }), 40);
    });
});

describe('Swarm multiplier', () => {
    const swarm = victim({ tags: ['living', 'swarm'] });
    test('an area ability hits a swarm target harder', () => {
        const area = ability({}, { shape: 'area', maxTargets: 6, falloff: 1 });
        assert.equal(hit(area, victim()), 40);
        assert.equal(hit(area, swarm), Math.trunc(40 * SWARM_MULTIPLIER));
    });

    test('a single-target ability gets no swarm bonus', () => {
        assert.equal(hit(ability(), swarm), 40);
    });

    test('boss and colossal targets never take the swarm bonus', () => {
        const area = ability({}, { shape: 'area', maxTargets: 6, falloff: 1 });
        assert.equal(isSwarmTarget(victim({ tags: ['swarm'], rank: 'boss' })), false);
        assert.equal(isSwarmTarget(victim({ tags: ['swarm', 'colossal'] })), false);
        assert.equal(hit(area, victim({ tags: ['living', 'swarm'], rank: 'boss' })), 40);
        assert.equal(hit(area, victim({ tags: ['living', 'swarm', 'colossal'] })), 40);
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
