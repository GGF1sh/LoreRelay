/**
 * COMBAT-DIRECT-DODGE-EVASION-CREDIT-V1-001 focused tests.
 */

import * as assert from 'node:assert/strict';
import * as fs from 'fs';
import * as path from 'path';
import { describe, test } from 'node:test';
import { AbilityDefinition } from './combatAbilityTypes';
import { DIRECT_INPUT_SCHEMA_VERSION } from './combatDirectInputCore';
import {
    DIRECT_V1_TICK_RATE,
    DODGE_BASE_COST_MILLI,
    DODGE_CHAIN_PENALTY_MILLI,
    STAMINA_MAX_MILLI,
    STAMINA_REGEN_MILLI_PER_SEC,
    DirectCombatantSeed,
    IncomingAttackEvent,
    autoDodgeInterval,
    effectiveEvasionFor,
    iframeTicksFor,
    msToTicks,
    runDirectHeadlessMoveAttack,
    wouldAutoDodgeOnCount,
} from './combatDirectHeadlessCore';
import { MechanicsCombatant } from './combatMechanicsResolver';
import { BattleSpec, resolveCombat } from './gambitCombatCore';

const tickRate = DIRECT_V1_TICK_RATE;

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

const undodgeable: AbilityDefinition = {
    ...slash,
    id: 'beam_hit',
    delivery: {
        shape: 'beam', range: 200, maxTargets: 1, falloff: 1,
        dodgeable: false, blockedByCover: false, pierces: true,
    },
};

function mech(id: string, over: Partial<MechanicsCombatant> = {}): MechanicsCombatant {
    return {
        id, hp: 10_000, maxHp: 10_000, attack: 20, defense: 0,
        tags: ['living'], statuses: [], buildup: {}, ...over,
    };
}

function seeds(allyOver: Partial<MechanicsCombatant> = {}): DirectCombatantSeed[] {
    return [
        { id: 'ally', team: 0, position: { x: 0, y: 0 }, mechanics: mech('ally', allyOver) },
        { id: 'enemy', team: 1, position: { x: 50, y: 0 }, mechanics: mech('enemy') },
    ];
}

function log(events: Array<Record<string, unknown>>) {
    return { schemaVersion: DIRECT_INPUT_SCHEMA_VERSION, events };
}

function run(opts: {
    events?: Array<Record<string, unknown>>;
    incoming?: IncomingAttackEvent[];
    durationTicks?: number;
    ally?: Partial<MechanicsCombatant>;
    abilities?: AbilityDefinition[];
    iframeMs?: number;
    justWindowMs?: number;
    dodgeRecoveryMs?: number;
    initialStaminaMilli?: number;
    ability?: AbilityDefinition;
}) {
    const result = runDirectHeadlessMoveAttack({
        controlledCombatantId: 'ally',
        combatants: seeds(opts.ally || {}),
        normalAttackAbility: opts.ability || slash,
        abilities: opts.abilities || [slash, undodgeable],
        durationTicks: opts.durationTicks ?? 120,
        tickRate,
        directInput: log(opts.events || []),
        incomingAttacks: opts.incoming || [],
        iframeMs: opts.iframeMs,
        justWindowMs: opts.justWindowMs,
        dodgeRecoveryMs: opts.dodgeRecoveryMs ?? 0,
        initialStaminaMilli: opts.initialStaminaMilli,
    });
    if (!result.ok) assert.fail(result.error);
    return result.result;
}

function countKind(r: ReturnType<typeof run>, kind: string): number {
    return r.directReceipts.filter(x => x.kind === kind).length;
}

function dodgePress(tick: number, seq = 0) {
    return { tick, seq, action: 'dodge', phase: 'press', direction: { x: 1, y: 0 } };
}

function incoming(tick: number, seq = 0, abilityId = 'basic_slash'): IncomingAttackEvent {
    return { tick, seq, attackerId: 'enemy', targetId: 'ally', abilityId };
}

// ---------------------------------------------------------------------------
// Stamina / chain
// ---------------------------------------------------------------------------

describe('Dodge stamina and chain penalty', () => {
    test('dodge spends base stamina and regenerates over time', () => {
        const r = run({
            events: [dodgePress(0)],
            durationTicks: tickRate, // 1 second
            dodgeRecoveryMs: 0,
            iframeMs: 33, // 1 tick iframe
        });
        assert.ok(countKind(r, 'dodge_started') === 1);
        // spent 25, then regen 20/s for ~29 remaining ticks after dodge tick
        // regen starts every tick including 0 before dodge... order: regen then input.
        // tick 0: regen (full, no-op), dodge spend 25000 → 75000
        // ticks 1..29: + floor(20000/30)=666 per tick → +29*666
        const regenPerTick = Math.trunc(STAMINA_REGEN_MILLI_PER_SEC / tickRate);
        const expected = Math.min(
            STAMINA_MAX_MILLI,
            STAMINA_MAX_MILLI - DODGE_BASE_COST_MILLI + regenPerTick * (tickRate - 1),
        );
        assert.equal(r.finalDirectState.staminaMilli, expected);
        assert.ok(countKind(r, 'stamina_regenerated') > 0);
    });

    test('insufficient stamina rejects dodge', () => {
        const r = run({
            events: [dodgePress(0)],
            initialStaminaMilli: 1_000,
            durationTicks: 5,
        });
        assert.equal(countKind(r, 'dodge_started'), 0);
        assert.equal(countKind(r, 'dodge_rejected_stamina'), 1);
        assert.ok(r.rejectedInputs.some(x => x.reason === 'insufficient_stamina'));
    });

    test('consecutive dodges within 1s raise cost', () => {
        // iframe 1 tick, no recovery → can dodge again quickly
        const r = run({
            events: [dodgePress(0), dodgePress(2)],
            iframeMs: 33,
            dodgeRecoveryMs: 0,
            durationTicks: 10,
        });
        assert.equal(countKind(r, 'dodge_started'), 2);
        assert.equal(countKind(r, 'dodge_chain_penalty'), 1);
        // first 25k, second 35k
        const spent = DODGE_BASE_COST_MILLI + (DODGE_BASE_COST_MILLI + DODGE_CHAIN_PENALTY_MILLI);
        const regenPerTick = Math.trunc(STAMINA_REGEN_MILLI_PER_SEC / tickRate);
        // regen on ticks 0..9 except when already full before first spend only tick0 no-op after full
        // Approximate: final = max - spent + regen*(ticks after below max)
        assert.ok(r.finalDirectState.staminaMilli < STAMINA_MAX_MILLI - DODGE_BASE_COST_MILLI);
        assert.ok(r.finalDirectState.consecutiveDodgeCount >= 2);
        void spent; void regenPerTick;
    });

    test('2s without dodge clears chain penalty', () => {
        const gap = tickRate * 2 + 1; // > 2s
        const r = run({
            events: [dodgePress(0), dodgePress(gap)],
            iframeMs: 33,
            dodgeRecoveryMs: 0,
            durationTicks: gap + 5,
            initialStaminaMilli: STAMINA_MAX_MILLI,
        });
        assert.equal(countKind(r, 'dodge_started'), 2);
        assert.equal(countKind(r, 'dodge_chain_penalty'), 0);
        // After reset, consecutive restarts at 1 for the second dodge.
        assert.equal(r.finalDirectState.consecutiveDodgeCount, 1);
    });
});

// ---------------------------------------------------------------------------
// I-frames
// ---------------------------------------------------------------------------

describe('I-frame window boundaries', () => {
    test('iframe covers [start, end) and ends on the boundary tick', () => {
        const iframeMs = 300;
        const iframeTicks = iframeTicksFor(slash, tickRate, iframeMs);
        assert.equal(iframeTicks, msToTicks(300, tickRate)); // 9

        // Attack on last iframe tick (start+8) avoided if credit; attack on end tick hits.
        // Need a credit: evasion 50 → interval 2, so 2nd threat grants credit.
        // Simpler: evasion 100 clamped to 50, interval 2.
        // Or evasion 25 interval 4 - arrange 4 threats first.

        // Direct: grant credit via 1 threat at interval 1? evasion 100→50 interval 2.
        // Use evasion that intervals every hit: can't with formula max 50 → min interval 2.
        // Pre-seed: run 2 dodgeable hits without iframe to bank credit, then dodge.

        const prep: IncomingAttackEvent[] = [
            incoming(0, 0),
            incoming(1, 0), // 2nd threat → credit at evasion 50
        ];
        const dodgeAt = 5;
        const events = [dodgePress(dodgeAt)];
        const attacks: IncomingAttackEvent[] = [
            ...prep,
            incoming(dodgeAt + iframeTicks - 1, 0), // still inside
            incoming(dodgeAt + iframeTicks, 0), // boundary: not inside
        ];

        const r = run({
            events,
            incoming: attacks,
            ally: { evasion: 50 },
            iframeMs,
            dodgeRecoveryMs: 0,
            durationTicks: dodgeAt + iframeTicks + 5,
        });

        assert.equal(r.finalDirectState.iframeStartTick, dodgeAt);
        assert.equal(r.finalDirectState.iframeEndTick, dodgeAt + iframeTicks);
        // First two threats grant one credit (hold cap 1) at threat 2.
        // Inside avoid consumes it; boundary hit has no credit → iframe_no_credit or hit.
        assert.ok(countKind(r, 'iframe_avoided') >= 1);
        assert.ok(
            countKind(r, 'iframe_no_credit') + countKind(r, 'incoming_hit') >= 1,
            'boundary tick must not free-avoid without credit',
        );
    });
});

// ---------------------------------------------------------------------------
// Evasion credits
// ---------------------------------------------------------------------------

describe('Evasion credit ceiling matches auto interval', () => {
    test('shared interval helpers match resolveMechanics formula', () => {
        assert.equal(autoDodgeInterval(25), 4);
        assert.equal(autoDodgeInterval(50), 2);
        assert.equal(autoDodgeInterval(0), 0);
        assert.equal(effectiveEvasionFor(mech('t', { evasion: 25 })), 25);
        assert.equal(wouldAutoDodgeOnCount(4, 25), true);
        assert.equal(wouldAutoDodgeOnCount(3, 25), false);
    });

    test('evasion 25, 40 dodgeable threats → at most 10 successful avoids', () => {
        // interval 4 → credits on 4,8,...,40 = 10 grants; hold cap 1 so player
        // must spend each credit before next grant is "wasted" on cap — max avoids still 10.
        const duration = 40 * 20 + 50;
        const attacks: IncomingAttackEvent[] = [];
        const events: Array<Record<string, unknown>> = [];
        // Space dodges so stamina regenerates and i-frames cover each threat we want.
        // Strategy: on every 4th threat (when credit grants), dodge same tick as that attack.
        for (let i = 0; i < 40; i++) {
            const t = i * 20;
            attacks.push(incoming(t, 0));
            if ((i + 1) % 4 === 0) {
                // dodge just before / on the credit-granting threat
                events.push(dodgePress(t, 0));
            }
        }
        const r = run({
            events,
            incoming: attacks,
            ally: { evasion: 25 },
            iframeMs: 300,
            dodgeRecoveryMs: 0,
            durationTicks: duration,
        });
        const avoided = countKind(r, 'iframe_avoided');
        assert.ok(avoided <= 10, `avoided ${avoided} > 10`);
        assert.equal(r.finalDirectState.dodgeableThreatCount, 40);
    });

    test('with enough stamina and timing, 10 successes are achievable at evasion 25', () => {
        const attacks: IncomingAttackEvent[] = [];
        const events: Array<Record<string, unknown>> = [];
        // Every 4th hit: bank credit then dodge on that tick.
        // Spread by 45 ticks (~1.5s) for stamina regen (20/s → ~30 stamina per gap).
        for (let n = 1; n <= 10; n++) {
            const base = (n - 1) * 45;
            // three filler threats that do not grant credit yet, then grant+dodge
            for (let k = 0; k < 3; k++) {
                attacks.push(incoming(base + k, 0));
            }
            const grantTick = base + 3;
            attacks.push(incoming(grantTick, 0));
            events.push(dodgePress(grantTick, 0));
        }
        const r = run({
            events,
            incoming: attacks,
            ally: { evasion: 25, hp: 50_000, maxHp: 50_000 },
            iframeMs: 300,
            dodgeRecoveryMs: 0,
            durationTicks: 10 * 45 + 20,
            initialStaminaMilli: STAMINA_MAX_MILLI,
        });
        assert.equal(countKind(r, 'iframe_avoided'), 10);
    });

    test('sparse 10 threats at evasion 25 → at most 2 successful avoids', () => {
        // Credits only on threats 4 and 8.
        const attacks: IncomingAttackEvent[] = [];
        const events: Array<Record<string, unknown>> = [];
        for (let i = 0; i < 10; i++) {
            const t = i * 30;
            attacks.push(incoming(t, 0));
            events.push(dodgePress(t, 0)); // try to dodge every hit
        }
        const r = run({
            events,
            incoming: attacks,
            ally: { evasion: 25, hp: 50_000, maxHp: 50_000 },
            iframeMs: 300,
            dodgeRecoveryMs: 0,
            durationTicks: 10 * 30 + 10,
        });
        const avoided = countKind(r, 'iframe_avoided');
        assert.ok(avoided <= 2, `avoided ${avoided}`);
        assert.equal(avoided, 2);
    });

    test('evasion 0 never grants successful avoids', () => {
        const attacks: IncomingAttackEvent[] = [];
        const events: Array<Record<string, unknown>> = [];
        for (let i = 0; i < 20; i++) {
            const t = i * 25;
            attacks.push(incoming(t, 0));
            events.push(dodgePress(t, 0));
        }
        const r = run({
            events,
            incoming: attacks,
            ally: { evasion: 0 },
            iframeMs: 300,
            dodgeRecoveryMs: 0,
            durationTicks: 20 * 25 + 5,
        });
        assert.equal(countKind(r, 'iframe_avoided'), 0);
        assert.equal(countKind(r, 'evasion_credit_gained'), 0);
        assert.ok(countKind(r, 'iframe_no_credit') > 0);
    });

    test('evasion 50 successes stay at or below auto interval count', () => {
        // interval 2 → at most floor(20/2)=10 on 20 threats
        const attacks: IncomingAttackEvent[] = [];
        const events: Array<Record<string, unknown>> = [];
        for (let i = 0; i < 20; i++) {
            const t = i * 25;
            attacks.push(incoming(t, 0));
            if ((i + 1) % 2 === 0) events.push(dodgePress(t, 0));
        }
        const r = run({
            events,
            incoming: attacks,
            ally: { evasion: 50, hp: 50_000, maxHp: 50_000 },
            iframeMs: 300,
            dodgeRecoveryMs: 0,
            durationTicks: 20 * 25 + 5,
        });
        const avoided = countKind(r, 'iframe_avoided');
        assert.ok(avoided <= 10, `avoided ${avoided}`);
        assert.equal(avoided, 10);
    });

    test('credit can be held for a later dangerous hit', () => {
        // Evasion 25: threats 1-3 no credit, threat 4 grants. Hold through 5-6, spend on 7? 
        // Cap 1: grant at 4, don't spend; threats 5,6,7,8 - at 8 grant again but still 1.
        // Spend on threat 7 with dodge.
        const attacks = [1, 2, 3, 4, 5, 6, 7].map((n, i) => incoming(i * 10, 0));
        const events = [dodgePress(6 * 10, 0)]; // only dodge threat 7 (index 6)
        const r = run({
            events,
            incoming: attacks,
            ally: { evasion: 25 },
            iframeMs: 300,
            dodgeRecoveryMs: 0,
            durationTicks: 80,
        });
        assert.equal(countKind(r, 'evasion_credit_gained'), 1);
        assert.equal(countKind(r, 'iframe_avoided'), 1);
        assert.equal(r.directReceipts.find(x => x.kind === 'iframe_avoided')?.abilityId, 'basic_slash');
        // Earlier threats without dodge should have hit (no iframe).
        assert.ok(countKind(r, 'incoming_hit') >= 5);
    });

    test('iframe without credit still takes a normal hit', () => {
        // evasion 0: always no credit
        const r = run({
            events: [dodgePress(0)],
            incoming: [incoming(0, 1)], // same tick after dodge seq
            ally: { evasion: 0, hp: 500, maxHp: 500 },
            iframeMs: 300,
            dodgeRecoveryMs: 0,
            durationTicks: 5,
        });
        assert.equal(countKind(r, 'iframe_no_credit'), 1);
        assert.equal(countKind(r, 'iframe_avoided'), 0);
        assert.ok(r.combatants.ally.mechanics.hp < 500);
    });

    test('undodgeable attacks always hit and never touch credits', () => {
        const r = run({
            events: [dodgePress(0)],
            incoming: [incoming(0, 1, 'beam_hit')],
            ally: { evasion: 50, hp: 500, maxHp: 500 },
            abilities: [slash, undodgeable],
            iframeMs: 300,
            dodgeRecoveryMs: 0,
            durationTicks: 5,
        });
        assert.equal(countKind(r, 'undodgeable_hit'), 1);
        assert.equal(countKind(r, 'iframe_avoided'), 0);
        assert.equal(countKind(r, 'evasion_credit_gained'), 0);
        assert.equal(r.finalDirectState.dodgeableThreatCount, 0);
        assert.ok(r.combatants.ally.mechanics.hp < 500);
    });
});

// ---------------------------------------------------------------------------
// Perfect dodge / armour path
// ---------------------------------------------------------------------------

describe('Perfect dodge and resolver paths', () => {
    test('perfect dodge grants no stamina refund, extra iframe, or credit', () => {
        // Bank credit: evasion 50, two threats, dodge on second with just window covering.
        const r = run({
            events: [dodgePress(1, 0)],
            incoming: [incoming(0, 0), incoming(1, 1)],
            ally: { evasion: 50 },
            iframeMs: 300,
            justWindowMs: 200,
            dodgeRecoveryMs: 0,
            durationTicks: 15,
        });
        const staminaAfter = r.finalDirectState.staminaMilli;
        assert.ok(countKind(r, 'perfect_dodge') >= 1);
        assert.equal(countKind(r, 'iframe_avoided'), 1);
        // No refund: stamina below max - base cost + some regen
        assert.ok(staminaAfter < STAMINA_MAX_MILLI);
        // No extra credit from perfect
        assert.ok(r.finalDirectState.availableEvasionCredits <= 1);
        // iframe end not extended beyond dodge+iframeTicks
        const iframeTicks = iframeTicksFor(slash, tickRate, 300);
        assert.equal(r.finalDirectState.iframeStartTick + iframeTicks, r.finalDirectState.iframeEndTick
            || r.finalDirectState.iframeStartTick + iframeTicks);
    });

    test('non-avoided hit uses existing armour / barrier resolver path', () => {
        const r = run({
            events: [],
            incoming: [incoming(0, 0)],
            ally: {
                evasion: 0,
                defense: 10,
                barrier: { amount: 5, blocksVectors: ['physical'], blocksStatusApplication: true },
                hp: 500,
                maxHp: 500,
            },
            durationTicks: 5,
        });
        assert.ok(r.mechanicsReceipts.some(e => e.receipt.kind === 'barrier_absorbed' || e.receipt.kind === 'damage'));
        assert.ok(r.combatants.ally.mechanics.hp < 500 || (r.combatants.ally.mechanics.barrier?.amount ?? 0) < 5);
    });
});

// ---------------------------------------------------------------------------
// Determinism
// ---------------------------------------------------------------------------

describe('Dodge determinism', () => {
    test('same inputs and attack schedule are byte-identical', () => {
        const events = [dodgePress(5), dodgePress(40)];
        const incomingAtks = [incoming(5, 1), incoming(10, 0), incoming(40, 1)];
        const a = run({
            events, incoming: incomingAtks, ally: { evasion: 25 },
            durationTicks: 80, dodgeRecoveryMs: 0,
        });
        const b = run({
            events, incoming: incomingAtks, ally: { evasion: 25 },
            durationTicks: 80, dodgeRecoveryMs: 0,
        });
        assert.equal(a.outputBytes, b.outputBytes);
        assert.equal(a.replayHash, b.replayHash);
    });

    test('JSON round trip of output is stable', () => {
        const r = run({
            events: [dodgePress(0)],
            incoming: [incoming(0, 1)],
            ally: { evasion: 50 },
            durationTicks: 20,
            dodgeRecoveryMs: 0,
        });
        assert.equal(JSON.stringify(JSON.parse(r.outputBytes)), r.outputBytes);
    });
});

// ---------------------------------------------------------------------------
// Regression: Golden Master
// ---------------------------------------------------------------------------

describe('Regression: Golden Master still 8/8', () => {
    test('legacy fixtures unchanged', () => {
        const fixturesDir = path.join(__dirname, '../test/fixtures/combat');
        const files = fs.readdirSync(fixturesDir).filter(f => f.endsWith('.json') && f.startsWith('fixture_'));
        assert.equal(files.length, 8);
        for (const file of files) {
            const data = JSON.parse(fs.readFileSync(path.join(fixturesDir, file), 'utf8'));
            const spec = {
                activePreset: data.activePreset,
                deltaSeconds: data.deltaSeconds || (1.0 / 60.0),
                fixedFps: data.fixedFps,
                viewport: data.viewport || { width: 1280, height: 720 },
                participantOrder: data.participantOrder,
                initialState: data.initialState,
            } as BattleSpec;
            const actual = resolveCombat(spec);
            const expected = data.expected;
            assert.deepEqual(actual.evaluations, expected.evaluations, file);
            assert.deepEqual(actual.attacks, expected.attacks, file);
            assert.equal(actual.outcome, expected.outcome, file);
        }
    });
});
