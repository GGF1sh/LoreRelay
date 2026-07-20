/**
 * COMBAT-RTS-TICK-RATE-AND-ZERO-TICK-FIXED-001 focused tests.
 *
 * Two Codex P1 findings against PR3 (COMBAT-RTS-ORDER-SLOT-STOP-RESUME-001):
 *
 *   P1-1: a command log's tickRate was never checked against the battle's own
 *   effective tick rate, so a log recorded at a different rate than the battle
 *   actually runs at would still be accepted and applied on the wrong ticks.
 *
 *   P1-2: stepCombat's first call already advances tickCount to 1 before the
 *   command phase runs, so tickCount is never 0. A command scheduled for
 *   tick 0 (which the input schema accepts — tick is a non-negative integer)
 *   compared its raw tick against tickCount, which never matched, which
 *   permanently stalled commandCursor on that event and silently blocked
 *   every later command in the log, regardless of that command's own tick.
 */

import * as assert from 'node:assert/strict';
import * as fs from 'fs';
import * as path from 'path';
import { describe, test } from 'node:test';
import { BattleSpec, CombatExpectedOutput, resolveCombat } from './gambitCombatCore';
import { CommandInputEvent, CommandInputLog, COMMAND_INPUT_SCHEMA_VERSION } from './combatRtsCommandInputCore';

const fixturesDir = path.join(__dirname, '../test/fixtures/combat');
const fixtureFiles = fs.readdirSync(fixturesDir).filter(f => f.startsWith('fixture_') && f.endsWith('.json')).sort();

function fixtureSpec(file: string): BattleSpec {
    const data = JSON.parse(fs.readFileSync(path.join(fixturesDir, file), 'utf8'));
    return {
        activePreset: data.activePreset,
        deltaSeconds: data.deltaSeconds || (1.0 / 60.0),
        fixedFps: data.fixedFps,
        viewport: data.viewport || { width: 1280, height: 720 },
        participantOrder: data.participantOrder,
        initialState: data.initialState,
    } as BattleSpec;
}

function unit(over: any): any {
    return {
        role: 'Frontline', max_hp: 100, attack: 10, defense: 0, heal_power: 0,
        move_speed: 40, attack_range: 40, attack_cooldown: 0.5, radius: 12,
        pos_x: over.team === 0 ? 0 : 10000, pos_y: 0,
        ...over,
    };
}

/** Two units, far enough apart that neither can ever reach the other within COMBAT_TIMEOUT_TICKS. */
function skirmishSpec(over: Partial<BattleSpec> = {}): BattleSpec {
    return {
        activePreset: 'rts-tick-rate-test',
        deltaSeconds: 1 / 30,
        viewport: { width: 1280, height: 720 },
        participantOrder: ['ally_a', 'ally_b', 'enemy_a'],
        initialState: {
            units: {
                allies: [unit({ name: 'ally_a', team: 0 }), unit({ name: 'ally_b', team: 0, pos_y: 40 })],
                enemies: [unit({ name: 'enemy_a', team: 1 })],
            },
        },
        ...over,
    } as BattleSpec;
}

function commandLog(events: CommandInputEvent[], tickRate: number): CommandInputLog {
    return { schemaVersion: COMMAND_INPUT_SCHEMA_VERSION, tickRate, events };
}

function stopEvent(over: Partial<CommandInputEvent> = {}): CommandInputEvent {
    return { tick: 1, seq: 0, issuerTeam: 0, unitIds: ['ally_a'], command: 'stop', ...over } as CommandInputEvent;
}

function activityFor(output: CombatExpectedOutput, unitId: string) {
    return {
        evaluations: output.evaluations.filter(e => e.unit === unitId),
        decisions: output.decisions.filter(e => e.unit === unitId),
    };
}

describe('RTS tick rate — effective battle rate matches ctx.delta\'s basis', () => {
    test('fixedFps 60 + log tickRate 60: command is applied', () => {
        const spec = skirmishSpec({ fixedFps: 60, command: commandLog([stopEvent()], 60) });
        const output = resolveCombat(spec);
        assert.deepEqual(output.commandReceipts!.map(r => r.kind), ['order_accepted', 'order_started']);
        assert.equal(activityFor(output, 'ally_a').evaluations.length, 0, 'stop must actually suppress gambits once applied');
    });

    test('fixedFps 60 + log tickRate 30: rejected, falls back to empty log with no commandReceipts', () => {
        const spec = skirmishSpec({ fixedFps: 60, command: commandLog([stopEvent()], 30) });
        const output = resolveCombat(spec);
        assert.equal('commandReceipts' in output, false);
        assert.ok(activityFor(output, 'ally_a').evaluations.length > 0, 'ally_a must run its normal gambits, unaffected by the rejected log');
    });

    test('deltaSeconds 1/30 (no fixedFps) + log tickRate 30: command is applied', () => {
        const spec = skirmishSpec({ command: commandLog([stopEvent()], 30) });
        const output = resolveCombat(spec);
        assert.deepEqual(output.commandReceipts!.map(r => r.kind), ['order_accepted', 'order_started']);
    });

    test('deltaSeconds 1/60 (no fixedFps) + log tickRate 30: rejected, falls back to empty log', () => {
        const spec = skirmishSpec({ deltaSeconds: 1 / 60, command: commandLog([stopEvent()], 30) });
        const output = resolveCombat(spec);
        assert.equal('commandReceipts' in output, false);
    });

    test('a mismatched log produces output byte-identical to the same battle with no command at all', () => {
        const base = skirmishSpec({ fixedFps: 60 });
        const withMismatch = resolveCombat({ ...base, command: commandLog([stopEvent()], 30) });
        const withoutCommand = resolveCombat(base);
        assert.equal(JSON.stringify(withMismatch), JSON.stringify(withoutCommand));
    });

    test('command absent and an explicit empty log both still produce golden-master-identical bytes', () => {
        for (const file of fixtureFiles) {
            const spec = fixtureSpec(file);
            const baseline = resolveCombat(spec);
            const absent = resolveCombat({ ...spec, command: undefined });
            const empty60 = resolveCombat({ ...spec, command: commandLog([], 60) });
            assert.equal(JSON.stringify(absent), JSON.stringify(baseline), `${file}: absent`);
            assert.equal(JSON.stringify(empty60), JSON.stringify(baseline), `${file}: empty log at the matching rate`);
        }
    });

    test('a truthy but non-integer fixedFps never matches any log tickRate (does not fall through to deltaSeconds)', () => {
        // ctx.delta would use 1/59.94 here, not deltaSeconds — so the tick rate
        // check must not pretend deltaSeconds is the basis it is actually using.
        const spec = skirmishSpec({ fixedFps: 59.94, deltaSeconds: 1 / 30, command: commandLog([stopEvent()], 30) });
        const output = resolveCombat(spec);
        assert.equal('commandReceipts' in output, false);
    });

    test('a deltaSeconds that reciprocates to a near-integer but not a matching one (NTSC-ish 29.97) is rejected, not rounded to 30', () => {
        const spec = skirmishSpec({ deltaSeconds: 1 / 29.97, command: commandLog([stopEvent()], 30) });
        const output = resolveCombat(spec);
        assert.equal('commandReceipts' in output, false);
    });

    test('a truncated-but-close-enough deltaSeconds literal (as the golden master fixtures use) still matches 60', () => {
        // Mirrors the fixtures' literal 0.0166666667 rather than the full
        // repeating decimal 1/60 — the float round-trip has a tiny but nonzero
        // relative error that must still be accepted.
        const spec = skirmishSpec({ deltaSeconds: 0.0166666667, command: commandLog([stopEvent()], 60) });
        const output = resolveCombat(spec);
        assert.deepEqual(output.commandReceipts!.map(r => r.kind), ['order_accepted', 'order_started']);
    });
});

describe('RTS tick rate — no runtime path bypasses tick-rate enforcement', () => {
    test('an invalid raw command (fails schema entirely) still falls back to empty, tick rate aside', () => {
        const spec = skirmishSpec({ fixedFps: 60, command: 'not-a-log' });
        const output = resolveCombat(spec);
        assert.equal('commandReceipts' in output, false);
    });

    test('a battle whose rate cannot be pinned down at all (non-finite deltaSeconds) still runs, with any command collapsed to empty', () => {
        const spec = skirmishSpec({ deltaSeconds: NaN, command: commandLog([stopEvent()], 30) });
        const output = resolveCombat(spec);
        assert.equal('commandReceipts' in output, false);
        // The battle must not crash or hang — it still resolves to some outcome.
        assert.equal(typeof output.outcome, 'string');
    });
});

describe('RTS tick 0 — folds to simulation tick 1', () => {
    test('a tick 0 stop is applied before the first unit action, and the receipt tick is 1', () => {
        const spec = skirmishSpec({ command: commandLog([stopEvent({ tick: 0 })], 30) });
        const output = resolveCombat(spec);

        assert.deepEqual(
            output.commandReceipts!.map(r => [r.tick, r.kind]),
            [[1, 'order_accepted'], [1, 'order_started']],
        );
        assert.equal(activityFor(output, 'ally_a').evaluations.length, 0, 'the unit must never evaluate gambits at all, including tick 1 itself');
    });

    test('commandCursor is not stalled: a tick 0 event does not block a later tick 2 command', () => {
        const spec = skirmishSpec({
            command: commandLog([
                { tick: 0, seq: 0, issuerTeam: 0, unitIds: ['ally_a'], command: 'stop' },
                { tick: 2, seq: 0, issuerTeam: 0, unitIds: ['ally_b'], command: 'stop' },
            ], 30),
        });
        const output = resolveCombat(spec);

        const receiptsA = output.commandReceipts!.filter(r => r.unitId === 'ally_a');
        const receiptsB = output.commandReceipts!.filter(r => r.unitId === 'ally_b');
        assert.deepEqual(receiptsA.map(r => [r.tick, r.kind]), [[1, 'order_accepted'], [1, 'order_started']]);
        assert.deepEqual(receiptsB.map(r => [r.tick, r.kind]), [[2, 'order_accepted'], [2, 'order_started']]);

        // Both units actually stopped, proving the tick 2 command was not
        // merely receipted but genuinely applied.
        assert.equal(activityFor(output, 'ally_a').evaluations.length, 0);
        assert.equal(activityFor(output, 'ally_b').evaluations.filter(e => e.tick >= 2).length, 0);
        assert.ok(activityFor(output, 'ally_b').evaluations.some(e => e.tick === 1), 'ally_b must still gambit normally on tick 1, before its own tick-2 command lands');
    });

    test('a long chain after tick 0 is not blocked: tick 0, then tick 1, tick 2, and tick 5 all apply', () => {
        const spec = skirmishSpec({
            command: commandLog([
                { tick: 0, seq: 0, issuerTeam: 0, unitIds: ['ally_a'], command: 'stop' },
                { tick: 1, seq: 0, issuerTeam: 0, unitIds: ['ally_a'], command: 'resume_gambit' },
                { tick: 2, seq: 0, issuerTeam: 0, unitIds: ['ally_a'], command: 'stop' },
                { tick: 5, seq: 0, issuerTeam: 0, unitIds: ['ally_a'], command: 'resume_gambit' },
            ], 30),
        });
        const output = resolveCombat(spec);
        const receipts = output.commandReceipts!.map(r => [r.tick, r.command, r.kind]);
        // order_superseded's `command` names the order being replaced, not the
        // replacement — matching the general supersede semantics from PR3.
        assert.deepEqual(receipts, [
            [1, 'stop', 'order_accepted'], [1, 'stop', 'order_started'],
            [1, 'stop', 'order_superseded'], [1, 'resume_gambit', 'order_accepted'],
            [2, 'stop', 'order_accepted'], [2, 'stop', 'order_started'],
            [5, 'stop', 'order_superseded'], [5, 'resume_gambit', 'order_accepted'],
        ]);
    });

    test('tick 0 and tick 1 targeting the same unit: (tick, seq) order applies, tick 1 wins deterministically', () => {
        const spec = skirmishSpec({
            command: commandLog([
                { tick: 0, seq: 0, issuerTeam: 0, unitIds: ['ally_a'], command: 'move_to', point: { x: 1, y: 1 } },
                { tick: 1, seq: 0, issuerTeam: 0, unitIds: ['ally_a'], command: 'stop' },
            ], 30),
        });
        const output = resolveCombat(spec);
        assert.deepEqual(
            output.commandReceipts!.map(r => [r.tick, r.command, r.kind]),
            [
                [1, 'move_to', 'order_accepted'], [1, 'move_to', 'order_started'],
                [1, 'move_to', 'order_superseded'], [1, 'stop', 'order_accepted'], [1, 'stop', 'order_started'],
            ],
        );
    });

    test('participantOrder fan-out and supersede semantics still hold for a tick-0 event', () => {
        const spec = skirmishSpec({
            participantOrder: ['ally_b', 'ally_a', 'enemy_a'],
            command: commandLog([
                { tick: 0, seq: 0, issuerTeam: 0, unitIds: ['ally_a', 'ally_b'], command: 'stop' },
            ], 30),
        });
        const output = resolveCombat(spec);
        const acceptedOrder = output.commandReceipts!.filter(r => r.kind === 'order_accepted').map(r => r.unitId);
        assert.deepEqual(acceptedOrder, ['ally_b', 'ally_a'], 'ally_b ranks before ally_a in participantOrder');
        assert.ok(output.commandReceipts!.every(r => r.tick === 1));
    });

    test('repeated runs of a tick-0-bearing spec produce byte-identical JSON', () => {
        const spec = skirmishSpec({
            command: commandLog([
                { tick: 0, seq: 0, issuerTeam: 0, unitIds: ['ally_a'], command: 'stop' },
                { tick: 3, seq: 0, issuerTeam: 0, unitIds: ['ally_a'], command: 'resume_gambit' },
            ], 30),
        });
        const a = resolveCombat(structuredClone(spec));
        const b = resolveCombat(structuredClone(spec));
        assert.equal(JSON.stringify(a), JSON.stringify(b));
    });
});
