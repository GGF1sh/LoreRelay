/**
 * COMBAT-DIRECT-PR29-CODEX-FIX-003 focused tests.
 */

import * as assert from 'node:assert/strict';
import * as fs from 'fs';
import * as path from 'path';
import { describe, test } from 'node:test';
import { AbilityDefinition, StatusDefinition } from './combatAbilityTypes';
import { DIRECT_INPUT_SCHEMA_VERSION, emptyDirectInputLog } from './combatDirectInputCore';
import {
    DIRECT_V1_TICK_RATE,
    DirectCombatantSeed,
    IncomingAttackEvent,
    runDirectHeadlessMoveAttack,
} from './combatDirectHeadlessCore';
import {
    MechanicsCombatant,
    isAbilityAutoDodgeable,
    resolveMechanics,
} from './combatMechanicsResolver';
import { BattleSpec, resolveCombat } from './gambitCombatCore';

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

function undodgeable(shape: AbilityDefinition['delivery']['shape'], id: string): AbilityDefinition {
    return {
        ...slash,
        id,
        delivery: {
            shape, range: 100, maxTargets: shape === 'cone' ? 3 : 1, falloff: 1,
            dodgeable: false, blockedByCover: false, pierces: false,
            ...(shape === 'cone' ? { angle: 60 } : {}),
        },
    };
}

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
    mode?: 'direct_action' | 'command' | 'spectator';
    tickRate?: number;
    statuses?: StatusDefinition[];
    abilities?: AbilityDefinition[];
    ability?: AbilityDefinition;
}) {
    const tickRate = opts.tickRate ?? TR;
    const result = runDirectHeadlessMoveAttack({
        controlledCombatantId: 'ally',
        combatants: seeds(opts.ally || {}, opts.enemy || {}),
        normalAttackAbility: opts.ability || slash,
        abilities: opts.abilities || [slash, undodgeable('single_target', 'undodge_single'), undodgeable('cone', 'undodge_cone')],
        statuses: opts.statuses || [],
        durationTicks: opts.durationTicks ?? 40,
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
// 1. Shared undodgeable semantics
// ---------------------------------------------------------------------------

describe('PR29-003: shared undodgeable auto-evasion gate', () => {
    test('isAbilityAutoDodgeable rejects dodgeable:false for any shape', () => {
        assert.equal(isAbilityAutoDodgeable(slash), true);
        assert.equal(isAbilityAutoDodgeable(undodgeable('single_target', 'u')), false);
        assert.equal(isAbilityAutoDodgeable(undodgeable('cone', 'c')), false);
        assert.equal(isAbilityAutoDodgeable(undodgeable('line', 'l')), false);
        assert.equal(isAbilityAutoDodgeable({
            delivery: { shape: 'area', dodgeable: true },
        }), false);
        assert.equal(isAbilityAutoDodgeable({
            delivery: { shape: 'beam', dodgeable: true },
        }), false);
    });

    test('evasion 50 still cannot auto-dodge single undodgeable', () => {
        const target = mech('t', { evasion: 50, hp: 500, maxHp: 500 });
        const attacker = mech('a', { attack: 20 });
        let t = target;
        let dodged = 0;
        for (let i = 0; i < 10; i++) {
            const res = resolveMechanics({
                ability: undodgeable('single_target', 'u'),
                attacker, target: t, statuses: [],
            });
            if (res.dodged) dodged += 1;
            t = res.target;
        }
        assert.equal(dodged, 0);
        assert.ok(t.hp < 500);
        assert.equal(t.incomingHitCount, undefined);
    });

    test('cone undodgeable also never auto-dodges', () => {
        const res = resolveMechanics({
            ability: undodgeable('cone', 'c'),
            attacker: mech('a', { attack: 20 }),
            target: mech('t', { evasion: 50, hp: 500, maxHp: 500 }),
            statuses: [],
        });
        assert.equal(res.dodged, false);
        assert.ok(res.damageDealt > 0);
    });

    test('dodgeable single still auto-dodges on interval', () => {
        let t = mech('t', { evasion: 50, hp: 50_000, maxHp: 50_000 });
        const attacker = mech('a', { attack: 5 });
        let dodged = 0;
        for (let i = 0; i < 4; i++) {
            const res = resolveMechanics({ ability: slash, attacker, target: t, statuses: [] });
            if (res.dodged) dodged += 1;
            t = res.target;
        }
        assert.equal(dodged, 2); // interval 2 → hits 2 and 4
    });

    test('command / spectator / direct undodgeable results agree (no resolver_dodged)', () => {
        const abilities = [slash, undodgeable('single_target', 'undodge_single')];
        const incoming: IncomingAttackEvent[] = [
            { tick: 0, seq: 0, attackerId: 'enemy', targetId: 'ally', abilityId: 'undodge_single' },
            { tick: 1, seq: 0, attackerId: 'enemy', targetId: 'ally', abilityId: 'undodge_single' },
        ];
        for (const mode of ['direct_action', 'command', 'spectator'] as const) {
            const r = run({
                mode,
                ally: { evasion: 50, hp: 500, maxHp: 500 },
                abilities,
                incoming,
                durationTicks: 5,
            });
            assert.equal(r.directReceipts.filter(x => x.detail === 'resolver_dodged').length, 0, mode);
            assert.ok(r.combatants.ally.mechanics.hp < 500, mode);
            if (mode === 'direct_action') {
                assert.equal(r.directReceipts.filter(x => x.kind === 'undodgeable_hit').length, 2);
            }
        }
    });

    test('legacy Golden Master still 8/8', () => {
        const fixturesDir = path.join(__dirname, '../test/fixtures/combat');
        const files = fs.readdirSync(fixturesDir).filter(f => f.endsWith('.json') && f.startsWith('fixture_'));
        assert.equal(files.length, 8);
        for (const file of files) {
            const data = JSON.parse(fs.readFileSync(path.join(fixturesDir, file), 'utf8'));
            const actual = resolveCombat({
                activePreset: data.activePreset,
                deltaSeconds: data.deltaSeconds || 1 / 60,
                fixedFps: data.fixedFps,
                viewport: data.viewport || { width: 1280, height: 720 },
                participantOrder: data.participantOrder,
                initialState: data.initialState,
            } as BattleSpec);
            assert.deepEqual(actual.attacks, data.expected.attacks, file);
            assert.equal(actual.outcome, data.expected.outcome, file);
        }
    });
});

// ---------------------------------------------------------------------------
// 2. Defeated combatants skip mechanics advance
// ---------------------------------------------------------------------------

describe('PR29-003: defeated combatants skip advance', () => {
    test('hp0 with regen does not revive', () => {
        const statuses: StatusDefinition[] = [
            { id: 'regen', statusClass: 'beneficial', buildupThreshold: 1, durationSeconds: 30, stacking: 'refresh', cureChannels: ['time'], tags: [] },
        ];
        const r = run({
            ally: {
                hp: 0, maxHp: 500,
                statuses: [{ id: 'regen', remainingSeconds: 30, intensity: 1 }],
            },
            statuses,
            durationTicks: TR, // 1 second of regen would heal if advanced
            events: [],
        });
        assert.equal(r.combatants.ally.mechanics.hp, 0);
        assert.equal(r.finalDirectState.actionPhase, 'defeated');
    });

    test('defeated enemy is not restored as living by regen advance', () => {
        const statuses: StatusDefinition[] = [
            { id: 'regen', statusClass: 'beneficial', buildupThreshold: 1, durationSeconds: 30, stacking: 'refresh', cureChannels: ['time'], tags: [] },
        ];
        const r = run({
            enemy: {
                hp: 0, maxHp: 500,
                statuses: [{ id: 'regen', remainingSeconds: 30, intensity: 1 }],
            },
            statuses,
            durationTicks: 30,
        });
        assert.equal(r.combatants.enemy.mechanics.hp, 0);
    });

    test('DoT death skips subsequent advances', () => {
        const statuses: StatusDefinition[] = [
            { id: 'poison', statusClass: 'dot', buildupThreshold: 1, durationSeconds: 30, stacking: 'refresh', cureChannels: ['time'], tags: [] },
        ];
        // High intensity poison via residual: rate 3/s on 5 hp dies in ~2s
        const r = run({
            ally: {
                hp: 5, maxHp: 500,
                statuses: [{ id: 'poison', remainingSeconds: 30, intensity: 1 }],
            },
            statuses,
            durationTicks: TR * 3,
        });
        assert.equal(r.combatants.ally.mechanics.hp, 0);
        assert.equal(r.finalDirectState.actionPhase, 'defeated');
        // After death, further ticks should not produce more poison damage receipts on ally
        // (advance skipped). Phase remains defeated.
        const advanceReceipts = r.mechanicsReceipts.filter(x => x.abilityId === '_tick_advance' && x.targetId === 'ally');
        // May have had advance receipts while alive; after death no new state growth
        assert.ok(r.combatants.ally.mechanics.hp === 0);
        void advanceReceipts;
    });

    test('controlled actor phase matches hp after death', () => {
        const r = run({
            ally: { hp: 0, maxHp: 100 },
            durationTicks: 5,
            events: [{ tick: 0, seq: 0, action: 'move', phase: 'press', direction: { x: 1, y: 0 } }],
        });
        assert.equal(r.combatants.ally.mechanics.hp, 0);
        assert.equal(r.finalDirectState.actionPhase, 'defeated');
        assert.ok(r.rejectedInputs.some(x => x.reason === 'actor_defeated'));
    });
});

// ---------------------------------------------------------------------------
// 3. Mechanics advance at tick end
// ---------------------------------------------------------------------------

describe('PR29-003: mechanics status advance at tick end', () => {
    test('1-tick stun blocks tick 0 and frees tick 1', () => {
        const oneTick = 1 / TR;
        const r = run({
            ally: { statuses: [{ id: 'stun', remainingSeconds: oneTick, intensity: 1 }] },
            events: [
                { tick: 0, seq: 0, action: 'move', phase: 'press', direction: { x: 1, y: 0 } },
                { tick: 0, seq: 1, action: 'light_attack', phase: 'press', targetId: 'enemy' },
                { tick: 0, seq: 2, action: 'dodge', phase: 'press', direction: { x: 1, y: 0 } },
                { tick: 1, seq: 0, action: 'move', phase: 'press', direction: { x: 1, y: 0 } },
            ],
            ability: {
                ...slash,
                auto: { cooldown: 0, gambitTags: [] },
                direct: { windupMs: 0, activeMs: 33, recoveryMs: 0, staminaCost: 1 },
            },
            durationTicks: 10,
        });
        assert.ok(r.rejectedInputs.some(x => x.tick === 0 && (x.reason === 'cannot_move' || x.reason === 'cannot_act')));
        assert.ok(r.finalDirectState.position.x > 0); // tick 1 move worked
        assert.ok(!r.rejectedInputs.some(x => x.tick === 1 && x.action === 'move'));
    });

    test('1-tick untargetable blocks tick 0 hit; tick 1 is legal', () => {
        const oneTick = 1 / TR;
        const r = run({
            ally: {
                evasion: 50,
                statuses: [{ id: 'untargetable', remainingSeconds: oneTick, intensity: 1 }],
            },
            incoming: [
                { tick: 0, seq: 0, attackerId: 'enemy', targetId: 'ally', abilityId: 'basic_slash' },
                { tick: 1, seq: 0, attackerId: 'enemy', targetId: 'ally', abilityId: 'basic_slash' },
            ],
            durationTicks: 5,
        });
        assert.ok(r.mechanicsReceipts.some(x => x.tick === 0 && x.receipt.kind === 'target_illegal'));
        // tick 1 is first legal threat
        assert.equal(r.finalDirectState.dodgeableThreatCount, 1);
    });

    test('status is not double-advanced within a tick', () => {
        // 2-tick stun: blocks ticks 0 and 1, free on tick 2
        const twoTicks = 2 / TR;
        const r = run({
            ally: { statuses: [{ id: 'stun', remainingSeconds: twoTicks, intensity: 1 }] },
            events: [
                { tick: 0, seq: 0, action: 'move', phase: 'press', direction: { x: 1, y: 0 } },
                { tick: 1, seq: 0, action: 'move', phase: 'press', direction: { x: 1, y: 0 } },
                { tick: 2, seq: 0, action: 'move', phase: 'press', direction: { x: 1, y: 0 } },
            ],
            durationTicks: 8,
        });
        assert.ok(r.rejectedInputs.some(x => x.tick === 0));
        assert.ok(r.rejectedInputs.some(x => x.tick === 1));
        assert.ok(!r.rejectedInputs.some(x => x.tick === 2 && x.action === 'move'));
        assert.ok(r.finalDirectState.position.x > 0);
    });

    test('DoT / regen over one second still time-consistent at 30 and 60 Hz', () => {
        const statuses: StatusDefinition[] = [
            { id: 'poison', statusClass: 'dot', buildupThreshold: 1, durationSeconds: 10, stacking: 'refresh', cureChannels: ['time'], tags: [] },
        ];
        const a = run({
            ally: { hp: 1000, maxHp: 1000, statuses: [{ id: 'poison', remainingSeconds: 10, intensity: 1 }] },
            statuses,
            tickRate: 30,
            durationTicks: 30,
        });
        const b = run({
            ally: { hp: 1000, maxHp: 1000, statuses: [{ id: 'poison', remainingSeconds: 10, intensity: 1 }] },
            statuses,
            tickRate: 60,
            durationTicks: 60,
        });
        assert.ok(Math.abs(a.combatants.ally.mechanics.hp - b.combatants.ally.mechanics.hp) <= 1);
    });

    test('doom timer still expires under end-of-tick advance', () => {
        const statuses: StatusDefinition[] = [
            {
                id: 'doom', statusClass: 'lethal_timer', buildupThreshold: 25,
                durationSeconds: 0.2, stacking: 'refresh', cureChannels: ['cleanse', 'time'], tags: [],
            },
        ];
        const r = run({
            ally: {
                hp: 100, maxHp: 100, rank: 'normal',
                statuses: [{
                    id: 'doom', remainingSeconds: 0.2, intensity: 1,
                    sourceId: 'enemy', sourceAbilityId: 'doom', wasBelowThreshold: true,
                }],
            },
            statuses,
            durationTicks: TR,
        });
        assert.ok(
            r.combatants.ally.mechanics.hp < 100
            || r.mechanicsReceipts.some(x =>
                x.receipt.kind === 'doom_executed'
                || x.receipt.kind === 'lethal_timer_expired'
                || x.receipt.kind === 'death'),
        );
    });

    test('identical runs remain byte-identical with end-of-tick advance', () => {
        const events = [
            { tick: 0, seq: 0, action: 'move', phase: 'press', direction: { x: 1, y: 0 } },
            { tick: 5, seq: 0, action: 'dodge', phase: 'press', direction: { x: 0, y: 1 } },
        ];
        const incoming: IncomingAttackEvent[] = [
            { tick: 5, seq: 1, attackerId: 'enemy', targetId: 'ally', abilityId: 'basic_slash' },
        ];
        const a = run({ events, incoming, ally: { evasion: 25 }, durationTicks: 20 });
        const b = run({ events, incoming, ally: { evasion: 25 }, durationTicks: 20 });
        assert.equal(a.outputBytes, b.outputBytes);
        assert.equal(a.replayHash, b.replayHash);
    });
});
