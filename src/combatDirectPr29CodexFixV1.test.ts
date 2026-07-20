/**
 * COMBAT-DIRECT-PR29-CODEX-FIX-001 focused tests.
 */

import * as assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { AbilityDefinition } from './combatAbilityTypes';
import {
    DIRECT_INPUT_SCHEMA_VERSION,
    emptyDirectInputLog,
    normalizeDirectInputLog,
} from './combatDirectInputCore';
import {
    DIRECT_V1_TICK_RATE,
    DirectCombatantSeed,
    IncomingAttackEvent,
    autoDodgeInterval,
    effectiveEvasionFor,
    runDirectHeadlessMoveAttack,
    wouldAutoDodgeOnCount,
} from './combatDirectHeadlessCore';
import { MechanicsCombatant, resolveMechanics } from './combatMechanicsResolver';

const TR = DIRECT_V1_TICK_RATE;

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

function seeds(allyOver: Partial<MechanicsCombatant> = {}, enemyOver: Partial<MechanicsCombatant> = {}): DirectCombatantSeed[] {
    return [
        { id: 'ally', team: 0, position: { x: 0, y: 0 }, mechanics: mech('ally', allyOver) },
        { id: 'enemy', team: 1, position: { x: 40, y: 0 }, mechanics: mech('enemy', enemyOver) },
    ];
}

function log(events: Array<Record<string, unknown>>, tickRate = TR) {
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
    tickRate?: number;
    mode?: 'direct_action' | 'command' | 'spectator';
    abilities?: AbilityDefinition[];
}) {
    const tickRate = opts.tickRate ?? TR;
    const result = runDirectHeadlessMoveAttack({
        controlledCombatantId: 'ally',
        combatants: seeds(opts.ally || {}, opts.enemy || {}),
        normalAttackAbility: slash,
        abilities: opts.abilities || [slash],
        durationTicks: opts.durationTicks ?? 80,
        tickRate,
        mode: opts.mode || 'direct_action',
        directInput: log(opts.events || [], tickRate),
        incomingAttacks: opts.incoming || [],
        dodgeRecoveryMs: 0,
        iframeMs: 300,
    });
    if (!result.ok) assert.fail(result.error);
    return result.result;
}

// ---------------------------------------------------------------------------
// 1. Zero-evasion threat counting
// ---------------------------------------------------------------------------

describe('PR29 fix: zero-evasion threat counting', () => {
    test('accuracy that zeroes evasion does not advance the credit counter', () => {
        // evasion 25, accuracy 25 → eff 0 (3 hits); accuracy 0 → eff 25 (then 4 hits for credit)
        const incoming: IncomingAttackEvent[] = [];
        // 3 zero-eff hits (should not count)
        for (let i = 0; i < 3; i++) {
            incoming.push({
                tick: i, seq: 0, attackerId: 'enemy', targetId: 'ally', abilityId: 'basic_slash',
            });
        }
        // 1st effective threat (acc 0) — no credit yet (need 4 for evasion 25)
        incoming.push({
            tick: 10, seq: 0, attackerId: 'enemy', targetId: 'ally', abilityId: 'basic_slash',
        });

        // Use two enemy accuracy profiles via two attackers would need two combatants.
        // Instead: run phased — first 3 with high-accuracy enemy, then re... single run:
        // Seed enemy accuracy 25 for ticks 0-2, but accuracy is on combatant not per-event.
        // Solution: two enemy ids with different accuracy.

        const combatants: DirectCombatantSeed[] = [
            { id: 'ally', team: 0, position: { x: 0, y: 0 }, mechanics: mech('ally', { evasion: 25 }) },
            { id: 'acc_enemy', team: 1, position: { x: 40, y: 0 }, mechanics: mech('acc_enemy', { accuracy: 25 }) },
            { id: 'plain_enemy', team: 1, position: { x: 50, y: 0 }, mechanics: mech('plain_enemy', { accuracy: 0 }) },
        ];

        const schedule: IncomingAttackEvent[] = [
            { tick: 0, seq: 0, attackerId: 'acc_enemy', targetId: 'ally', abilityId: 'basic_slash' },
            { tick: 1, seq: 0, attackerId: 'acc_enemy', targetId: 'ally', abilityId: 'basic_slash' },
            { tick: 2, seq: 0, attackerId: 'acc_enemy', targetId: 'ally', abilityId: 'basic_slash' },
            // 4th overall, first effective — no credit (count=1)
            { tick: 3, seq: 0, attackerId: 'plain_enemy', targetId: 'ally', abilityId: 'basic_slash' },
            // +3 more effective → counts 2,3,4 → credit on 4th effective
            { tick: 4, seq: 0, attackerId: 'plain_enemy', targetId: 'ally', abilityId: 'basic_slash' },
            { tick: 5, seq: 0, attackerId: 'plain_enemy', targetId: 'ally', abilityId: 'basic_slash' },
            { tick: 6, seq: 0, attackerId: 'plain_enemy', targetId: 'ally', abilityId: 'basic_slash' },
        ];

        const r = runDirectHeadlessMoveAttack({
            controlledCombatantId: 'ally',
            combatants,
            normalAttackAbility: slash,
            abilities: [slash],
            durationTicks: 20,
            tickRate: TR,
            mode: 'direct_action',
            directInput: emptyDirectInputLog(TR),
            incomingAttacks: schedule,
            dodgeRecoveryMs: 0,
        });
        assert.equal(r.ok, true);
        if (!r.ok) return;

        // After first 4 overall: only 1 effective threat → no credit yet
        // We only have final state after all 7. After 4 effective (ticks 3-6) credit gained once.
        assert.equal(r.result.finalDirectState.dodgeableThreatCount, 4);
        assert.equal(r.result.directReceipts.filter(x => x.kind === 'evasion_credit_gained').length, 1);
        // Credit grant amount should be 4 (the 4th effective threat)
        const grant = r.result.directReceipts.find(x => x.kind === 'evasion_credit_gained');
        assert.equal(grant?.amount, 4);
        assert.equal(grant?.tick, 6);

        // Mid-sequence check: run only through tick 4 (after first plain hit)
        const mid = runDirectHeadlessMoveAttack({
            controlledCombatantId: 'ally',
            combatants,
            normalAttackAbility: slash,
            abilities: [slash],
            durationTicks: 4, // processes ticks 0..3
            tickRate: TR,
            mode: 'direct_action',
            directInput: emptyDirectInputLog(TR),
            incomingAttacks: schedule.filter(a => a.tick < 4),
            dodgeRecoveryMs: 0,
        });
        assert.equal(mid.ok, true);
        if (!mid.ok) return;
        assert.equal(mid.result.finalDirectState.dodgeableThreatCount, 1);
        assert.equal(mid.result.directReceipts.filter(x => x.kind === 'evasion_credit_gained').length, 0);
        assert.equal(mid.result.finalDirectState.availableEvasionCredits, 0);
    });

    test('auto and direct share the same success ceiling on a mixed accuracy sequence', () => {
        const combatants: DirectCombatantSeed[] = [
            { id: 'ally', team: 0, position: { x: 0, y: 0 }, mechanics: mech('ally', { evasion: 25 }) },
            { id: 'acc_enemy', team: 1, position: { x: 40, y: 0 }, mechanics: mech('acc_enemy', { accuracy: 25, attack: 5 }) },
            { id: 'plain_enemy', team: 1, position: { x: 50, y: 0 }, mechanics: mech('plain_enemy', { accuracy: 0, attack: 5 }) },
        ];
        const schedule: IncomingAttackEvent[] = [];
        // 3 zero-eff + 8 effective = max 2 auto dodges (interval 4)
        for (let i = 0; i < 3; i++) {
            schedule.push({ tick: i, seq: 0, attackerId: 'acc_enemy', targetId: 'ally', abilityId: 'basic_slash' });
        }
        for (let i = 0; i < 8; i++) {
            schedule.push({ tick: 10 + i, seq: 0, attackerId: 'plain_enemy', targetId: 'ally', abilityId: 'basic_slash' });
        }

        // Auto path: feed resolveMechanics sequentially with same accuracy/evasion.
        let autoTarget = structuredClone(combatants[0].mechanics);
        let autoDodges = 0;
        for (const atk of schedule) {
            const attacker = combatants.find(c => c.id === atk.attackerId)!.mechanics;
            const res = resolveMechanics({
                ability: slash,
                attacker,
                target: autoTarget,
                statuses: [],
            });
            if (res.dodged) autoDodges += 1;
            autoTarget = res.target;
        }

        // Direct: dodge only on credit-granting effective threats (4th, 8th) so
        // stamina is not the limiting factor — credit ceiling is.
        const directSchedule: IncomingAttackEvent[] = [];
        for (let i = 0; i < 3; i++) {
            directSchedule.push({
                tick: i * 5, seq: 0, attackerId: 'acc_enemy', targetId: 'ally', abilityId: 'basic_slash',
            });
        }
        const directEvents: Array<Record<string, unknown>> = [];
        for (let i = 0; i < 8; i++) {
            const t = 50 + i * 40;
            directSchedule.push({
                tick: t, seq: 1, attackerId: 'plain_enemy', targetId: 'ally', abilityId: 'basic_slash',
            });
            if ((i + 1) % 4 === 0) {
                directEvents.push({
                    tick: t, seq: 0, action: 'dodge', phase: 'press', direction: { x: 1, y: 0 },
                });
            }
        }

        const direct = runDirectHeadlessMoveAttack({
            controlledCombatantId: 'ally',
            combatants,
            normalAttackAbility: slash,
            abilities: [slash],
            durationTicks: 50 + 8 * 40 + 20,
            tickRate: TR,
            mode: 'direct_action',
            directInput: log(directEvents, TR),
            incomingAttacks: directSchedule,
            dodgeRecoveryMs: 0,
            iframeMs: 300,
            initialStaminaMilli: 100_000,
        });
        assert.equal(direct.ok, true);
        if (!direct.ok) return;

        const directAvoids = direct.result.directReceipts.filter(x => x.kind === 'iframe_avoided').length;
        // Auto ceiling on 8 effective threats with interval 4 = 2
        assert.equal(autoDodges, 2);
        assert.ok(directAvoids <= autoDodges, `direct ${directAvoids} > auto ${autoDodges}`);
        assert.equal(directAvoids, autoDodges);
        assert.equal(direct.result.finalDirectState.dodgeableThreatCount, 8);
    });

    test('helpers still match resolveMechanics interval math', () => {
        assert.equal(effectiveEvasionFor(mech('t', { evasion: 25 }), mech('a', { accuracy: 25 })), 0);
        assert.equal(effectiveEvasionFor(mech('t', { evasion: 25 }), mech('a', { accuracy: 0 })), 25);
        assert.equal(autoDodgeInterval(25), 4);
        assert.equal(wouldAutoDodgeOnCount(4, 25), true);
        assert.equal(wouldAutoDodgeOnCount(1, 25), false);
    });
});

// ---------------------------------------------------------------------------
// 2. tickRate in outputBytes
// ---------------------------------------------------------------------------

describe('PR29 fix: preserve tickRate in outputBytes', () => {
    test('embedded inputLog round-trips through normalizeDirectInputLog', () => {
        const r = run({
            events: [{ tick: 0, seq: 0, action: 'move', phase: 'press', direction: { x: 1, y: 0 } }],
            durationTicks: 5,
            tickRate: 30,
        });
        const parsed = JSON.parse(r.outputBytes);
        assert.equal(parsed.inputLog.tickRate, 30);
        assert.equal(parsed.inputLog.schemaVersion, DIRECT_INPUT_SCHEMA_VERSION);
        const renorm = normalizeDirectInputLog(parsed.inputLog);
        assert.equal(renorm.ok, true);
        if (!renorm.ok) return;
        assert.equal(renorm.log.tickRate, 30);
        assert.equal(r.inputLog.tickRate, parsed.inputLog.tickRate);
    });

    test('tickRate 30 vs 60 empty logs produce different outputBytes and replayHash', () => {
        const a = runDirectHeadlessMoveAttack({
            controlledCombatantId: 'ally',
            combatants: seeds(),
            normalAttackAbility: slash,
            durationTicks: 10,
            tickRate: 30,
            mode: 'direct_action',
            directInput: emptyDirectInputLog(30),
            incomingAttacks: [],
        });
        const b = runDirectHeadlessMoveAttack({
            controlledCombatantId: 'ally',
            combatants: seeds(),
            normalAttackAbility: slash,
            durationTicks: 10,
            tickRate: 60,
            mode: 'direct_action',
            directInput: emptyDirectInputLog(60),
            incomingAttacks: [],
        });
        assert.equal(a.ok && b.ok, true);
        if (!a.ok || !b.ok) return;
        assert.equal(a.result.inputLog.tickRate, 30);
        assert.equal(b.result.inputLog.tickRate, 60);
        assert.notEqual(a.result.outputBytes, b.result.outputBytes);
        assert.notEqual(a.result.replayHash, b.result.replayHash);
        assert.equal(JSON.parse(a.result.outputBytes).inputLog.tickRate, 30);
        assert.equal(JSON.parse(b.result.outputBytes).inputLog.tickRate, 60);
    });

    test('JSON round trip keeps tickRate; top-level and embedded match', () => {
        const r = run({
            events: [{ tick: 0, seq: 0, action: 'pause' }],
            durationTicks: 3,
            tickRate: 30,
        });
        const once = JSON.parse(r.outputBytes);
        const twice = JSON.parse(JSON.stringify(once));
        assert.equal(twice.inputLog.tickRate, 30);
        assert.equal(r.inputLog.tickRate, twice.inputLog.tickRate);
        assert.equal(normalizeDirectInputLog(twice.inputLog).ok, true);
    });
});

// ---------------------------------------------------------------------------
// 3. Spectator authorization ordering
// ---------------------------------------------------------------------------

describe('PR29 fix: spectator authorization ordering', () => {
    test('spectator rejects companion_order, pause, and mode_switch', () => {
        const r = run({
            mode: 'spectator',
            events: [
                { tick: 0, seq: 0, action: 'companion_order', order: 'focus' },
                { tick: 1, seq: 0, action: 'pause' },
                { tick: 2, seq: 0, action: 'mode_switch', requestedMode: 'mechanics_gambit' },
                { tick: 3, seq: 0, action: 'move', phase: 'press', direction: { x: 1, y: 0 } },
            ],
            durationTicks: 10,
        });
        assert.equal(r.rejectedInputs.length, 4);
        assert.ok(r.rejectedInputs.every(x => x.reason === 'mode_forbids_action'));
        assert.ok(r.rejectedInputs.some(x => x.action === 'companion_order'));
        assert.ok(r.rejectedInputs.some(x => x.action === 'pause'));
        assert.ok(r.rejectedInputs.some(x => x.action === 'mode_switch'));
    });

    test('command accepts companion_order as deferred intent', () => {
        const r = run({
            mode: 'command',
            events: [
                { tick: 0, seq: 0, action: 'companion_order', order: 'heal_priority' },
                { tick: 1, seq: 0, action: 'tactical_order' },
            ],
            durationTicks: 5,
        });
        assert.equal(r.rejectedInputs.length, 0);
        assert.equal(r.committedActions.length, 0);
    });

    test('spectator inputs mutate neither state nor resources', () => {
        const r = run({
            mode: 'spectator',
            ally: { evasion: 25, hp: 400, maxHp: 400 },
            events: [
                { tick: 0, seq: 0, action: 'dodge', phase: 'press', direction: { x: 1, y: 0 } },
                { tick: 1, seq: 0, action: 'move', phase: 'press', direction: { x: 1, y: 0 } },
                { tick: 2, seq: 0, action: 'companion_order', order: 'focus' },
            ],
            incoming: [
                { tick: 0, seq: 1, attackerId: 'enemy', targetId: 'ally', abilityId: 'basic_slash' },
            ],
            durationTicks: 10,
        });
        // No avatar control side effects
        assert.equal(r.finalDirectState.position.x, 0);
        assert.equal(r.finalDirectState.staminaMilli, 100_000); // full; no dodge spend
        // Credits may still accrue from incoming (spectator watches auto resolve path)
        // but dodge was rejected so no iframe avoid from player input
        assert.equal(r.directReceipts.filter(x => x.kind === 'dodge_started').length, 0);
        assert.equal(r.committedActions.length, 0);
        assert.ok(r.rejectedInputs.length >= 3);
    });
});
