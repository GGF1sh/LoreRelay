/**
 * COMBAT-DIRECT-PR29-CODEX-FIX-004 focused tests.
 */

import * as assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { AbilityDefinition, StatusDefinition } from './combatAbilityTypes';
import { DIRECT_INPUT_SCHEMA_VERSION, emptyDirectInputLog } from './combatDirectInputCore';
import {
    DIRECT_V1_TICK_RATE,
    DirectCombatantSeed,
    IncomingAttackEvent,
    normalizeIncomingHitCount,
    runDirectHeadlessMoveAttack,
} from './combatDirectHeadlessCore';
import { MechanicsCombatant, resolveMechanics } from './combatMechanicsResolver';

const TR = DIRECT_V1_TICK_RATE;

const slash: AbilityDefinition = {
    id: 'basic_slash', name: 'Basic Slash', tier: 'normal',
    delivery: {
        shape: 'single_target', range: 48, maxTargets: 1, falloff: 1,
        dodgeable: true, blockedByCover: false, pierces: false,
    },
    effects: [{
        kind: 'damage', vector: 'physical',
        penetration: { barrier: 'blocked', armor: 'blocked', requiresBodyContact: false, requiresDamageDealt: false },
        targetRequirement: [], magnitude: 10, weaponScale: 'personal',
    }],
    auto: { cooldown: 0.5, gambitTags: [] },
    scaleBehavior: { individual: 'full', huge: 'full', squad: 'full', fleet: 'full' },
    counters: [], tags: [],
};

function mech(id: string, over: Partial<MechanicsCombatant> = {}): MechanicsCombatant {
    return {
        id, hp: 50_000, maxHp: 50_000, attack: 20, defense: 0,
        tags: ['living'], statuses: [], buildup: {}, ...over,
    };
}

function seeds(ally: Partial<MechanicsCombatant> = {}, enemy: Partial<MechanicsCombatant> = {}): DirectCombatantSeed[] {
    return [
        { id: 'ally', team: 0, position: { x: 0, y: 0 }, mechanics: mech('ally', ally) },
        { id: 'enemy', team: 1, position: { x: 40, y: 0 }, mechanics: mech('enemy', enemy) },
    ];
}

function log(events: Array<Record<string, unknown>> = [], tickRate = TR) {
    return {
        schemaVersion: DIRECT_INPUT_SCHEMA_VERSION,
        tickRate,
        events: events.map(e => ({ actorId: e.actorId ?? 'ally', ...e })),
    };
}

function run(opts: {
    events?: Array<Record<string, unknown>>;
    incoming?: IncomingAttackEvent[];
    durationTicks?: number;
    ally?: Partial<MechanicsCombatant>;
    enemy?: Partial<MechanicsCombatant>;
    mode?: 'direct_action' | 'command' | 'spectator';
    statuses?: StatusDefinition[];
    abilities?: AbilityDefinition[];
    combatants?: DirectCombatantSeed[];
}) {
    const result = runDirectHeadlessMoveAttack({
        controlledCombatantId: 'ally',
        combatants: opts.combatants || seeds(opts.ally || {}, opts.enemy || {}),
        normalAttackAbility: slash,
        abilities: opts.abilities || [slash],
        statuses: opts.statuses || [],
        durationTicks: opts.durationTicks ?? 20,
        tickRate: TR,
        mode: opts.mode || 'direct_action',
        directInput: log(opts.events || []),
        incomingAttacks: opts.incoming || [],
        dodgeRecoveryMs: 0,
        iframeMs: 300,
    });
    if (!result.ok) assert.fail(result.error);
    return result.result;
}

// ---------------------------------------------------------------------------
// 1. Inherit / sync evasion interval progress
// ---------------------------------------------------------------------------

describe('PR29-004: inherit incomingHitCount into dodgeableThreatCount', () => {
    test('normalizeIncomingHitCount is non-negative integer', () => {
        assert.equal(normalizeIncomingHitCount(3.9), 3);
        assert.equal(normalizeIncomingHitCount(-2), 0);
        assert.equal(normalizeIncomingHitCount(undefined), 0);
        assert.equal(normalizeIncomingHitCount(Number.NaN), 0);
    });

    test('incomingHitCount 3 + evasion 25 grants credit on next effective threat', () => {
        // interval 4: starting at 3 → next hit makes 4 → credit
        const r = run({
            ally: { evasion: 25, incomingHitCount: 3 },
            incoming: [
                { tick: 0, seq: 0, attackerId: 'enemy', targetId: 'ally', abilityId: 'basic_slash' },
            ],
            durationTicks: 5,
        });
        assert.equal(r.finalDirectState.dodgeableThreatCount, 4);
        assert.equal(r.combatants.ally.mechanics.incomingHitCount, 4);
        assert.equal(r.finalDirectState.availableEvasionCredits, 1);
        assert.ok(r.directReceipts.some(x => x.kind === 'evasion_credit_gained' && x.amount === 4));
    });

    test('incomingHitCount 0 still needs four effective threats for evasion 25', () => {
        const attacks: IncomingAttackEvent[] = [];
        for (let i = 0; i < 3; i++) {
            attacks.push({ tick: i, seq: 0, attackerId: 'enemy', targetId: 'ally', abilityId: 'basic_slash' });
        }
        const mid = run({
            ally: { evasion: 25, incomingHitCount: 0 },
            incoming: attacks,
            durationTicks: 5,
        });
        assert.equal(mid.finalDirectState.dodgeableThreatCount, 3);
        assert.equal(mid.finalDirectState.availableEvasionCredits, 0);

        attacks.push({ tick: 3, seq: 0, attackerId: 'enemy', targetId: 'ally', abilityId: 'basic_slash' });
        const full = run({
            ally: { evasion: 25, incomingHitCount: 0 },
            incoming: attacks,
            durationTicks: 6,
        });
        assert.equal(full.finalDirectState.dodgeableThreatCount, 4);
        assert.equal(full.finalDirectState.availableEvasionCredits, 1);
    });

    test('after direct progress, pure auto resolveMechanics continues the same interval', () => {
        // Start at 2, one effective threat → count 3, no credit yet (need 4 for evasion 25)
        const r = run({
            ally: { evasion: 25, incomingHitCount: 2, hp: 50_000, maxHp: 50_000 },
            incoming: [
                { tick: 0, seq: 0, attackerId: 'enemy', targetId: 'ally', abilityId: 'basic_slash' },
            ],
            durationTicks: 3,
        });
        assert.equal(r.finalDirectState.dodgeableThreatCount, 3);
        assert.equal(r.combatants.ally.mechanics.incomingHitCount, 3);

        // Hand off mechanics state to pure auto — next hit should auto-dodge (count 4 % 4 === 0)
        let t = structuredClone(r.combatants.ally.mechanics);
        const attacker = mech('enemy', { attack: 5 });
        const res = resolveMechanics({ ability: slash, attacker, target: t, statuses: [] });
        assert.equal(res.dodged, true);
        assert.equal(res.target.incomingHitCount, 4);
    });

    test('JSON / replay output keeps controller and mechanics counts aligned', () => {
        const r = run({
            ally: { evasion: 50, incomingHitCount: 1 },
            incoming: [
                { tick: 0, seq: 0, attackerId: 'enemy', targetId: 'ally', abilityId: 'basic_slash' },
            ],
            durationTicks: 3,
        });
        assert.equal(r.finalDirectState.dodgeableThreatCount, 2);
        assert.equal(r.combatants.ally.mechanics.incomingHitCount, 2);
        const parsed = JSON.parse(r.outputBytes);
        assert.equal(parsed.finalDirectState.dodgeableThreatCount, 2);
        assert.equal(parsed.combatants.ally.mechanics.incomingHitCount, 2);

        const a = run({
            ally: { evasion: 50, incomingHitCount: 1 },
            incoming: [
                { tick: 0, seq: 0, attackerId: 'enemy', targetId: 'ally', abilityId: 'basic_slash' },
            ],
            durationTicks: 3,
        });
        const b = run({
            ally: { evasion: 50, incomingHitCount: 1 },
            incoming: [
                { tick: 0, seq: 0, attackerId: 'enemy', targetId: 'ally', abilityId: 'basic_slash' },
            ],
            durationTicks: 3,
        });
        assert.equal(a.outputBytes, b.outputBytes);
    });

    test('credit consume does not roll the count backward', () => {
        // Preload count 3, evasion 50 → interval 2; first hit makes 4 → credit; dodge consumes without reset
        const r = run({
            ally: { evasion: 50, incomingHitCount: 3 },
            events: [{ tick: 0, seq: 0, action: 'dodge', phase: 'press', direction: { x: 1, y: 0 } }],
            incoming: [
                { tick: 0, seq: 1, attackerId: 'enemy', targetId: 'ally', abilityId: 'basic_slash' },
            ],
            durationTicks: 5,
        });
        // hit advances 3→4, credit, consume on iframe
        assert.equal(r.finalDirectState.dodgeableThreatCount, 4);
        assert.equal(r.combatants.ally.mechanics.incomingHitCount, 4);
        assert.ok(r.directReceipts.some(x => x.kind === 'evasion_credit_consumed'));
        assert.equal(r.finalDirectState.availableEvasionCredits, 0);
    });

    test('command path updates controller count from auto for later continuity', () => {
        const r = run({
            mode: 'command',
            ally: { evasion: 50, incomingHitCount: 0 },
            incoming: [
                { tick: 0, seq: 0, attackerId: 'enemy', targetId: 'ally', abilityId: 'basic_slash' },
                { tick: 1, seq: 0, attackerId: 'enemy', targetId: 'ally', abilityId: 'basic_slash' },
            ],
            durationTicks: 5,
        });
        // Auto interval 2: two hits → count 2, one dodged
        assert.equal(r.combatants.ally.mechanics.incomingHitCount, 2);
        assert.equal(r.finalDirectState.dodgeableThreatCount, 2);
        // command does not mint credits
        assert.equal(r.finalDirectState.availableEvasionCredits, 0);
    });
});

// ---------------------------------------------------------------------------
// 2. Mid-loop defeated caster propagation
// ---------------------------------------------------------------------------

describe('PR29-004: same-tick defeated caster lifts later lethal timers', () => {
    const statuses: StatusDefinition[] = [
        {
            id: 'poison', statusClass: 'dot', buildupThreshold: 1, durationSeconds: 30,
            stacking: 'refresh', cureChannels: ['time'], tags: [],
        },
        {
            id: 'doom', statusClass: 'lethal_timer', buildupThreshold: 25, durationSeconds: 10,
            stacking: 'refresh', cureChannels: ['cleanse', 'time'], tags: [],
        },
    ];

    test('earlier caster DoT death lifts later target doom in the same tick', () => {
        // Sorted IDs: "caster" < "target" so caster advances first and dies, then target sees it.
        const combatants: DirectCombatantSeed[] = [
            {
                id: 'ally', team: 0, position: { x: 0, y: 0 },
                mechanics: mech('ally', { hp: 500, maxHp: 500 }),
            },
            {
                id: 'caster', team: 1, position: { x: 30, y: 0 },
                mechanics: mech('caster', {
                    hp: 1, maxHp: 100,
                    // residual + one tick of poison yields ≥1 HP → dies this advance
                    statuses: [{ id: 'poison', remainingSeconds: 30, intensity: 1, residualMilli: 999 }],
                }),
            },
            {
                id: 'target', team: 1, position: { x: 50, y: 0 },
                mechanics: mech('target', {
                    hp: 20, maxHp: 100, rank: 'normal',
                    // Long timer so only source-death lift applies this tick (not expiry execute)
                    statuses: [{
                        id: 'doom', remainingSeconds: 5, intensity: 1,
                        sourceId: 'caster', sourceAbilityId: 'doom',
                        wasBelowThreshold: true, imminent: true,
                    }],
                }),
            },
        ];

        const r = runDirectHeadlessMoveAttack({
            controlledCombatantId: 'ally',
            combatants,
            normalAttackAbility: slash,
            abilities: [slash],
            statuses,
            durationTicks: 3,
            tickRate: TR,
            mode: 'direct_action',
            directInput: emptyDirectInputLog(TR),
            incomingAttacks: [],
        });
        assert.equal(r.ok, true);
        if (!r.ok) return;

        assert.equal(r.result.combatants.caster.mechanics.hp, 0);
        // Doom lifted via source death — target should not be executed by doom this tick.
        // wasBelowThreshold true + execute band would kill; source defeat should lift first.
        assert.ok(
            r.result.mechanicsReceipts.some(
                x => x.receipt.kind === 'doom_source_defeated' && x.receipt.detail === 'caster',
            ),
            'expected doom_source_defeated for caster',
        );
        // Target still alive (not doom-executed); may have taken poison residual only if any
        assert.ok(r.result.combatants.target.mechanics.hp > 0);
        assert.ok(!(r.result.combatants.target.mechanics.statuses || []).some(s => s.id === 'doom'));
    });

    test('multiple new deaths propagate to all later advances in the same tick', () => {
        // a_caster and b_caster die from DoT; z_target has doom from a_caster
        const combatants: DirectCombatantSeed[] = [
            { id: 'ally', team: 0, position: { x: 0, y: 0 }, mechanics: mech('ally') },
            {
                id: 'a_caster', team: 1, position: { x: 10, y: 0 },
                mechanics: mech('a_caster', {
                    hp: 1, maxHp: 50,
                    statuses: [{ id: 'poison', remainingSeconds: 30, intensity: 1, residualMilli: 999 }],
                }),
            },
            {
                id: 'b_caster', team: 1, position: { x: 20, y: 0 },
                mechanics: mech('b_caster', {
                    hp: 1, maxHp: 50,
                    statuses: [{ id: 'poison', remainingSeconds: 30, intensity: 1, residualMilli: 999 }],
                }),
            },
            {
                id: 'z_target', team: 1, position: { x: 40, y: 0 },
                mechanics: mech('z_target', {
                    hp: 40, maxHp: 100, rank: 'normal',
                    statuses: [{
                        id: 'doom', remainingSeconds: 5, intensity: 1,
                        sourceId: 'a_caster', sourceAbilityId: 'doom',
                        wasBelowThreshold: true, imminent: true,
                    }],
                }),
            },
        ];
        const r = runDirectHeadlessMoveAttack({
            controlledCombatantId: 'ally',
            combatants,
            normalAttackAbility: slash,
            abilities: [slash],
            statuses,
            durationTicks: 3,
            tickRate: TR,
            mode: 'direct_action',
            directInput: emptyDirectInputLog(TR),
            incomingAttacks: [],
        });
        assert.equal(r.ok, true);
        if (!r.ok) return;
        assert.equal(r.result.combatants.a_caster.mechanics.hp, 0);
        assert.equal(r.result.combatants.b_caster.mechanics.hp, 0);
        assert.ok(r.result.mechanicsReceipts.some(x => x.receipt.kind === 'doom_source_defeated'));
        assert.ok(r.result.combatants.z_target.mechanics.hp > 0);
    });

    test('same input yields byte-identical replay with live defeated propagation', () => {
        const combatants: DirectCombatantSeed[] = [
            { id: 'ally', team: 0, position: { x: 0, y: 0 }, mechanics: mech('ally') },
            {
                id: 'caster', team: 1, position: { x: 30, y: 0 },
                mechanics: mech('caster', {
                    hp: 1, maxHp: 100,
                    statuses: [{ id: 'poison', remainingSeconds: 30, intensity: 1, residualMilli: 999 }],
                }),
            },
            {
                id: 'target', team: 1, position: { x: 50, y: 0 },
                mechanics: mech('target', {
                    hp: 40, maxHp: 100, rank: 'normal',
                    statuses: [{
                        id: 'doom', remainingSeconds: 5, intensity: 1,
                        sourceId: 'caster', sourceAbilityId: 'doom',
                        wasBelowThreshold: true,
                    }],
                }),
            },
        ];
        const mk = () => runDirectHeadlessMoveAttack({
            controlledCombatantId: 'ally',
            combatants: structuredClone(combatants),
            normalAttackAbility: slash,
            abilities: [slash],
            statuses,
            durationTicks: 5,
            tickRate: TR,
            mode: 'direct_action',
            directInput: emptyDirectInputLog(TR),
            incomingAttacks: [],
        });
        const a = mk();
        const b = mk();
        assert.equal(a.ok && b.ok, true);
        if (!a.ok || !b.ok) return;
        assert.equal(a.result.outputBytes, b.result.outputBytes);
        assert.equal(a.result.replayHash, b.result.replayHash);
    });
});
