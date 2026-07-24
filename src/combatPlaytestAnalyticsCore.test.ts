import * as assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { initialCombatLabScenarios } from './combatLabCore';
import { CombatStepEvents } from './gambitCombatCore';
import {
    CombatCommandPlaytestSession,
    advanceCombatCommandPlaytest,
    combatCommandPlaytestSnapshot,
    createCombatCommandPlaytest,
} from './combatCommandPlaytestCore';
import {
    COMBAT_ANALYTICS_RECENT_EVENT_LIMIT,
    createCombatPlaytestAnalytics,
    foldCombatStepEvents,
    topDamageTargetId,
} from './combatPlaytestAnalyticsCore';

import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * The real built-in catalog the extension host loads. An empty catalog is not
 * representative: in `mechanics_v1` a unit without `normalAttackAbility` takes
 * the legacy damage path, whose HP write is overwritten by the end-of-tick
 * `units[name].hp = mechanicsStates[name].hp` resync — every battle stalemates
 * to Timeout at full HP. Production always has this fixture, so tests use it too.
 */
const catalog = JSON.parse(
    fs.readFileSync(path.join(__dirname, '..', 'resources', 'combat-abilities', 'v1-reference-abilities.json'), 'utf8'),
) as Parameters<typeof createCombatCommandPlaytest>[1];

function events(partial: Partial<CombatStepEvents>): CombatStepEvents {
    return {
        evaluations: [],
        decisions: [],
        attacks: [],
        heals: [],
        deaths: [],
        focusChanges: [],
        mechanicsReceipts: [],
        commandReceipts: [],
        ...partial,
    };
}

function start(): CombatCommandPlaytestSession {
    const result = createCombatCommandPlaytest(initialCombatLabScenarios()[0], catalog, 'command');
    assert.equal(result.ok, true);
    return (result as { ok: true; value: CombatCommandPlaytestSession }).value;
}

function step(session: CombatCommandPlaytestSession, ticks = 1): CombatCommandPlaytestSession {
    const result = advanceCombatCommandPlaytest(session, ticks);
    assert.equal(result.ok, true);
    return (result as { ok: true; value: CombatCommandPlaytestSession }).value;
}

/** Advances until the battle resolves, mirroring how the host pulses in chunks. */
function runToOutcome(session: CombatCommandPlaytestSession, maxCalls = 200): CombatCommandPlaytestSession {
    let current = session;
    for (let index = 0; index < maxCalls && !current.state.outcome; index++) {
        current = step(current, 60);
    }
    return current;
}

describe('combat playtest analytics fold', () => {
    test('an attack credits the attacker and debits the victim', () => {
        const analytics = foldCombatStepEvents(
            createCombatPlaytestAnalytics(['a', 'b']),
            events({ attacks: [{ tick: 3, unit: 'a', target: 'b', damage: 17 }] }),
        );
        assert.equal(analytics.units.a.damageDealt, 17);
        assert.equal(analytics.units.a.attacksMade, 1);
        assert.equal(analytics.units.a.hits, 1);
        assert.equal(analytics.units.a.lastTargetId, 'b');
        assert.equal(analytics.units.a.lastTargetTick, 3);
        assert.equal(analytics.units.b.damageTaken, 17);
        assert.equal(analytics.units.b.damageDealt, 0);
    });

    test('a fully evaded attack counts as a swing and a dodge, never as a hit', () => {
        const analytics = foldCombatStepEvents(
            createCombatPlaytestAnalytics(['a', 'b']),
            events({
                attacks: [{ tick: 5, unit: 'a', target: 'b', damage: 0 }],
                mechanicsReceipts: [{ tick: 5, unit: 'a', target: 'b', receipt: { stage: 'hit', kind: 'dodged' } }],
            }),
        );
        assert.equal(analytics.units.a.attacksMade, 1);
        assert.equal(analytics.units.a.hits, 0);
        assert.equal(analytics.units.a.damageDealt, 0);
        assert.equal(analytics.units.b.dodges, 1);
        assert.equal(analytics.recentEvents[0].dodged, true);
    });

    test('a zero-damage attack without a dodge receipt is not counted as a dodge', () => {
        const analytics = foldCombatStepEvents(
            createCombatPlaytestAnalytics(['a', 'b']),
            events({ attacks: [{ tick: 5, unit: 'a', target: 'b', damage: 0 }] }),
        );
        assert.equal(analytics.units.b.dodges, 0);
        assert.equal(analytics.recentEvents[0].dodged, undefined);
    });

    test('healing is credited to the healer and to the healed unit separately', () => {
        const analytics = foldCombatStepEvents(
            createCombatPlaytestAnalytics(['medic', 'hurt']),
            events({ heals: [{ tick: 9, unit: 'hurt', source: 'medic', amount: 24 }] }),
        );
        assert.equal(analytics.units.medic.healingGiven, 24);
        assert.equal(analytics.units.medic.healingReceived, 0);
        assert.equal(analytics.units.hurt.healingReceived, 24);
    });

    test('a self-heal credits the same unit on both sides', () => {
        const analytics = foldCombatStepEvents(
            createCombatPlaytestAnalytics(['medic']),
            events({ heals: [{ tick: 2, unit: 'medic', source: 'medic', amount: 8 }] }),
        );
        assert.equal(analytics.units.medic.healingGiven, 8);
        assert.equal(analytics.units.medic.healingReceived, 8);
    });

    test('a zero-amount heal produces no feed entry', () => {
        const analytics = foldCombatStepEvents(
            createCombatPlaytestAnalytics(['medic', 'hurt']),
            events({ heals: [{ tick: 2, unit: 'hurt', source: 'medic', amount: 0 }] }),
        );
        assert.equal(analytics.recentEvents.length, 0);
        assert.equal(analytics.units.medic.healingGiven, 0);
    });

    test('a kill is credited to the attacker of the same-tick killing blow', () => {
        const analytics = foldCombatStepEvents(
            createCombatPlaytestAnalytics(['a', 'b', 'c']),
            events({
                attacks: [
                    { tick: 11, unit: 'c', target: 'b', damage: 4 },
                    { tick: 11, unit: 'a', target: 'b', damage: 9 },
                ],
                deaths: [{ tick: 11, unit: 'b' }],
            }),
        );
        assert.equal(analytics.units.a.kills, 1);
        assert.equal(analytics.units.c.kills, 0);
        assert.equal(analytics.units.b.diedAtTick, 11);
    });

    test('a death with no attack that tick credits nobody', () => {
        const analytics = foldCombatStepEvents(
            createCombatPlaytestAnalytics(['a', 'b']),
            events({ deaths: [{ tick: 7, unit: 'b' }] }),
        );
        assert.equal(analytics.units.a.kills, 0);
        assert.equal(analytics.units.b.diedAtTick, 7);
    });

    test('the lethal blow is marked on the attack entry, not duplicated', () => {
        const analytics = foldCombatStepEvents(
            createCombatPlaytestAnalytics(['a', 'b']),
            events({
                attacks: [{ tick: 11, unit: 'a', target: 'b', damage: 9 }],
                deaths: [{ tick: 11, unit: 'b' }],
            }),
        );
        const attack = analytics.recentEvents.find(entry => entry.kind === 'attack');
        assert.equal(attack?.lethal, true);
        assert.equal(analytics.recentEvents.filter(entry => entry.kind === 'death').length, 1);
    });

    test('the first recorded death tick is kept when a unit reports death twice', () => {
        let analytics = foldCombatStepEvents(
            createCombatPlaytestAnalytics(['b']),
            events({ deaths: [{ tick: 4, unit: 'b' }] }),
        );
        analytics = foldCombatStepEvents(analytics, events({ deaths: [{ tick: 9, unit: 'b' }] }));
        assert.equal(analytics.units.b.diedAtTick, 4);
    });

    test('decision targets track a unit that has not attacked yet', () => {
        const analytics = foldCombatStepEvents(
            createCombatPlaytestAnalytics(['a', 'b']),
            events({ decisions: [{ tick: 1, unit: 'a', action: '接近', target: 'b' }] }),
        );
        assert.equal(analytics.units.a.lastTargetId, 'b');
        assert.equal(analytics.units.a.lastTargetTick, 1);
    });

    test('a decision without a target leaves the previous target intact', () => {
        let analytics = foldCombatStepEvents(
            createCombatPlaytestAnalytics(['a', 'b']),
            events({ attacks: [{ tick: 1, unit: 'a', target: 'b', damage: 3 }] }),
        );
        analytics = foldCombatStepEvents(
            analytics,
            events({ decisions: [{ tick: 2, unit: 'a', action: '待機', target: '' }] }),
        );
        assert.equal(analytics.units.a.lastTargetId, 'b');
    });

    test('the live feed is capped and keeps the most recent entries', () => {
        const overflow = COMBAT_ANALYTICS_RECENT_EVENT_LIMIT + 5;
        const analytics = foldCombatStepEvents(
            createCombatPlaytestAnalytics(['a', 'b']),
            events({
                attacks: Array.from({ length: overflow }, (_unused, index) => ({
                    tick: index,
                    unit: 'a',
                    target: 'b',
                    damage: 1,
                })),
            }),
        );
        assert.equal(analytics.recentEvents.length, COMBAT_ANALYTICS_RECENT_EVENT_LIMIT);
        assert.equal(analytics.recentEvents[0].tick, 5);
        assert.equal(analytics.recentEvents[analytics.recentEvents.length - 1].tick, overflow - 1);
        // Totals must survive the feed cap — the cap is display-only.
        assert.equal(analytics.units.a.damageDealt, overflow);
    });

    test('folding does not mutate the previous analytics value', () => {
        const before = foldCombatStepEvents(
            createCombatPlaytestAnalytics(['a', 'b']),
            events({ attacks: [{ tick: 1, unit: 'a', target: 'b', damage: 5 }] }),
        );
        const after = foldCombatStepEvents(
            before,
            events({ attacks: [{ tick: 2, unit: 'a', target: 'b', damage: 5 }] }),
        );
        assert.equal(before.units.a.damageDealt, 5, 'previous value must not accumulate');
        assert.equal(after.units.a.damageDealt, 10);
        assert.equal(before.recentEvents.length, 1);
        assert.equal(after.recentEvents.length, 2);
    });

    test('unknown unit ids appearing mid-battle are accumulated rather than dropped', () => {
        const analytics = foldCombatStepEvents(
            createCombatPlaytestAnalytics([]),
            events({ attacks: [{ tick: 1, unit: 'summon', target: 'b', damage: 6 }] }),
        );
        assert.equal(analytics.units.summon.damageDealt, 6);
        assert.equal(analytics.units.b.damageTaken, 6);
    });

    test('a status_applied receipt logs the caster and the recipient', () => {
        const analytics = foldCombatStepEvents(
            createCombatPlaytestAnalytics(['caster', 'victim']),
            events({
                mechanicsReceipts: [
                    { tick: 8, unit: 'caster', target: 'victim', receipt: { stage: 'buildup', kind: 'status_applied', statusId: 'burn' } },
                ],
            }),
        );
        assert.equal(analytics.recentEvents.length, 1);
        const entry = analytics.recentEvents[0];
        assert.equal(entry.kind, 'status');
        assert.equal(entry.statusAction, 'applied');
        assert.equal(entry.statusId, 'burn');
        assert.equal(entry.targetId, 'victim');
        assert.equal(entry.sourceId, 'caster');
    });

    test('a cleansed receipt logs a removal on the recipient', () => {
        const analytics = foldCombatStepEvents(
            createCombatPlaytestAnalytics(['medic', 'patient']),
            events({
                mechanicsReceipts: [
                    { tick: 4, unit: 'medic', target: 'patient', receipt: { stage: 'cleanse', kind: 'cleansed', statusId: 'poison' } },
                ],
            }),
        );
        const entry = analytics.recentEvents[0];
        assert.equal(entry.statusAction, 'removed');
        assert.equal(entry.statusId, 'poison');
        assert.equal(entry.targetId, 'patient');
        assert.equal(entry.sourceId, 'medic');
    });

    test('a lethal_timer_expired receipt is ambient: owner from `unit`, no source', () => {
        const analytics = foldCombatStepEvents(
            createCombatPlaytestAnalytics(['a']),
            events({
                mechanicsReceipts: [
                    { tick: 20, unit: 'a', receipt: { stage: 'lethal_timer', kind: 'lethal_timer_expired', statusId: 'doom' } },
                ],
            }),
        );
        const entry = analytics.recentEvents[0];
        assert.equal(entry.kind, 'status');
        assert.equal(entry.statusAction, 'expired');
        assert.equal(entry.targetId, 'a');
        assert.equal(entry.sourceId, undefined);
    });

    test('non-status mechanics receipts (damage, barrier, targeting) never enter the feed', () => {
        const analytics = foldCombatStepEvents(
            createCombatPlaytestAnalytics(['a', 'b']),
            events({
                mechanicsReceipts: [
                    { tick: 1, unit: 'a', target: 'b', receipt: { stage: 'hp', kind: 'damage', amount: 9 } },
                    { tick: 1, unit: 'a', target: 'b', receipt: { stage: 'barrier', kind: 'barrier_absorbed', amount: 3 } },
                    { tick: 1, unit: 'a', target: 'b', receipt: { stage: 'targeting', kind: 'target_illegal' } },
                ],
            }),
        );
        assert.equal(analytics.recentEvents.length, 0);
    });

    test('a status receipt with no resolvable owner is dropped, not thrown', () => {
        const analytics = foldCombatStepEvents(
            createCombatPlaytestAnalytics([]),
            events({
                mechanicsReceipts: [
                    { tick: 1, unit: 'a', receipt: { stage: 'buildup', kind: 'status_applied', statusId: 'burn' } },
                ],
            }),
        );
        assert.equal(analytics.recentEvents.length, 0);
    });

    test('topDamageTargetId picks the highest total and breaks ties on participant order', () => {
        const analytics = foldCombatStepEvents(
            createCombatPlaytestAnalytics(['a', 'x', 'y']),
            events({
                attacks: [
                    { tick: 1, unit: 'a', target: 'y', damage: 10 },
                    { tick: 1, unit: 'a', target: 'x', damage: 10 },
                ],
            }),
        );
        assert.equal(topDamageTargetId(analytics.units.a, ['a', 'x', 'y']), 'x');
        assert.equal(topDamageTargetId(analytics.units.a, ['a', 'y', 'x']), 'y');
    });

    test('a unit that never dealt damage has no top target', () => {
        const analytics = createCombatPlaytestAnalytics(['a', 'b']);
        assert.equal(topDamageTargetId(analytics.units.a, ['a', 'b']), null);
    });
});

describe('combat playtest analytics through a real session', () => {
    test('a fresh session starts with zeroed stats and an empty feed', () => {
        const snapshot = combatCommandPlaytestSnapshot(start());
        assert.equal(snapshot.recentEvents.length, 0);
        for (const unit of snapshot.units) {
            assert.equal(unit.stats.damageDealt, 0);
            assert.equal(unit.stats.damageTaken, 0);
            assert.equal(unit.stats.kills, 0);
            assert.equal(unit.stats.diedAtTick, null);
            assert.equal(unit.targetId, null);
        }
    });

    test('a resolved battle attributes damage, kills and deaths to real units', () => {
        const finished = runToOutcome(start());
        assert.ok(finished.state.outcome, 'battle should resolve within the tick budget');
        const snapshot = combatCommandPlaytestSnapshot(finished);

        const totalDealt = snapshot.units.reduce((sum, unit) => sum + unit.stats.damageDealt, 0);
        const totalTaken = snapshot.units.reduce((sum, unit) => sum + unit.stats.damageTaken, 0);
        assert.ok(totalDealt > 0, 'a resolved battle must have dealt damage');
        assert.equal(
            Math.round(totalDealt),
            Math.round(totalTaken),
            'every point of damage dealt must land on some unit',
        );

        const dead = snapshot.units.filter(unit => unit.dead);
        assert.ok(dead.length > 0, 'a decisive outcome implies casualties');
        for (const unit of dead) {
            assert.notEqual(unit.stats.diedAtTick, null, `${unit.id} died but has no death tick`);
        }
        const totalKills = snapshot.units.reduce((sum, unit) => sum + unit.stats.kills, 0);
        assert.equal(totalKills, dead.length, 'each casualty is credited exactly once');
    });

    test('living units expose a current action and the target they last engaged', () => {
        const engaged = step(start(), 120);
        const snapshot = combatCommandPlaytestSnapshot(engaged);
        const withTarget = snapshot.units.filter(unit => unit.targetId !== null);
        assert.ok(withTarget.length > 0, 'units should have engaged something within 120 ticks');
        for (const unit of withTarget) {
            assert.equal(typeof unit.targetTick, 'number');
            assert.ok(
                snapshot.units.some(peer => peer.id === unit.targetId),
                `${unit.id} targets ${unit.targetId}, which is not in the roster`,
            );
        }
        assert.ok(snapshot.units.some(unit => typeof unit.action === 'string' && unit.action.length > 0));
    });

    test('the live feed stays bounded while a battle runs long', () => {
        const snapshot = combatCommandPlaytestSnapshot(runToOutcome(start()));
        assert.ok(snapshot.recentEvents.length <= COMBAT_ANALYTICS_RECENT_EVENT_LIMIT);
        for (const entry of snapshot.recentEvents) {
            assert.ok(entry.tick >= 0);
            assert.ok(entry.kind === 'attack' || entry.kind === 'heal' || entry.kind === 'death');
        }
    });

    test('two identical runs produce identical analytics', () => {
        const first = combatCommandPlaytestSnapshot(runToOutcome(start()));
        const second = combatCommandPlaytestSnapshot(runToOutcome(start()));
        assert.deepEqual(
            first.units.map(unit => [unit.id, unit.stats]),
            second.units.map(unit => [unit.id, unit.stats]),
        );
        assert.deepEqual(first.recentEvents, second.recentEvents);
    });

    test('stepping the same session value twice does not double-count', () => {
        const base = step(start(), 60);
        const branchA = step(base, 30);
        const branchB = step(base, 30);
        const statsA = combatCommandPlaytestSnapshot(branchA).units.map(unit => unit.stats);
        const statsB = combatCommandPlaytestSnapshot(branchB).units.map(unit => unit.stats);
        assert.deepEqual(statsA, statsB, 'advancing from one value twice must be reproducible');
    });

    test('the snapshot never leaks the per-victim damage tally', () => {
        const snapshot = combatCommandPlaytestSnapshot(runToOutcome(start()));
        for (const unit of snapshot.units) {
            assert.equal((unit.stats as unknown as Record<string, unknown>).damageByTarget, undefined);
        }
    });
});
