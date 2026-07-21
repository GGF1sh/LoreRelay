/**
 * COMBAT-RTS-REPLAY-HASH-DETERMINISM-001 focused tests.
 *
 * PR7 of docs/COMBAT_RTS_COMMAND_SPINE_DESIGN.md §6: the replayHash contract.
 *
 * Contract under test (see CombatExpectedOutput.replayHash's doc comment in
 * gambitCombatCore.ts for the full, precise version):
 *   - algorithm: SHA-256 hex digest, via node:crypto, synchronous — mirrors
 *     the existing direct-mode contract (combatDirectHeadlessCore.ts) rather
 *     than inventing a second convention.
 *   - canonical payload: CombatExpectedOutput exactly as returned, captured
 *     before outputBytes/replayHash themselves exist on it (so the hash
 *     never includes itself). Every field of CombatExpectedOutput is an
 *     array or a primitive — never a Record whose key order could vary — so
 *     no key-sorting canonicalizer is needed; plain double-JSON-round-trip
 *     (stableCombatOutputBytes) is already independent of insertion order.
 *   - presence: replayHash/outputBytes are present if and only if
 *     ctx.commandLog.events.length > 0 — the exact same condition already
 *     gating commandReceipts, reused verbatim.
 */

import * as assert from 'node:assert/strict';
import * as fs from 'fs';
import * as path from 'path';
import { describe, test } from 'node:test';
import {
    BattleSpec, CombatStepEvents, CombatUnitState,
    createCombatState, createCombatStepContext, resolveCombat, stepCombat,
} from './gambitCombatCore';
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

function unit(over: Partial<CombatUnitState> & { name: string; team: 0 | 1 }): any {
    return {
        role: 'Frontline', max_hp: 100, attack: 10, defense: 0, heal_power: 0,
        move_speed: 40, attack_range: 40, attack_cooldown: 0.5, radius: 12,
        pos_x: over.team === 0 ? 0 : 5000, pos_y: 0,
        ...over,
    };
}

function skirmishSpec(over: Partial<BattleSpec> = {}): BattleSpec {
    return {
        activePreset: 'rts-replay-hash-test',
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

function commandLog(events: CommandInputEvent[], tickRate = 30): CommandInputLog {
    return { schemaVersion: COMMAND_INPUT_SCHEMA_VERSION, tickRate, events };
}

function moveTo(unitId: string, point: { x: number; y: number }, over: Partial<CommandInputEvent> = {}): CommandInputEvent {
    return { tick: 1, seq: 0, issuerTeam: 0, unitIds: [unitId], command: 'move_to', point, ...over } as CommandInputEvent;
}

function attackTarget(unitId: string, targetId: string, over: Partial<CommandInputEvent> = {}): CommandInputEvent {
    return { tick: 1, seq: 0, issuerTeam: 0, unitIds: [unitId], command: 'attack_target', targetId, ...over } as CommandInputEvent;
}

function attackMove(unitId: string, point: { x: number; y: number }, over: Partial<CommandInputEvent> = {}): CommandInputEvent {
    return { tick: 1, seq: 0, issuerTeam: 0, unitIds: [unitId], command: 'attack_move', point, ...over } as CommandInputEvent;
}

/** A harmless, distant placeholder that keeps the opposing team alive without interfering. */
function harmlessDistantEnemy(name = 'harmless_enemy'): any {
    return unit({ name, team: 1, pos_x: 1_000_000, pos_y: 0, attack: 0, move_speed: 0 });
}

describe('replayHash — compatibility with the existing golden master', () => {
    for (const file of fixtureFiles) {
        test(`${file}: command absent omits replayHash/outputBytes and stays byte-identical`, () => {
            const spec = fixtureSpec(file);
            const bare = resolveCombat(spec);
            const withUndefinedCommand = resolveCombat({ ...spec, command: undefined });
            assert.equal('replayHash' in bare, false);
            assert.equal('outputBytes' in bare, false);
            assert.equal(JSON.stringify(bare), JSON.stringify(withUndefinedCommand));
        });
    }
});

describe('replayHash — presence and the absent/empty compatibility contract', () => {
    test('absent command input omits replayHash and outputBytes entirely', () => {
        const spec = skirmishSpec({ command: undefined });
        const output = resolveCombat(spec);
        assert.equal('replayHash' in output, false);
        assert.equal('outputBytes' in output, false);
        assert.equal('commandReceipts' in output, false);
    });

    test('an explicit empty command log also omits replayHash and outputBytes, byte-identical to absent', () => {
        const specAbsent = skirmishSpec({ command: undefined });
        const specEmpty = skirmishSpec({ command: commandLog([]) });
        const outAbsent = resolveCombat(specAbsent);
        const outEmpty = resolveCombat(specEmpty);
        assert.equal('replayHash' in outEmpty, false);
        assert.equal('outputBytes' in outEmpty, false);
        assert.equal(JSON.stringify(outAbsent), JSON.stringify(outEmpty));
    });

    test('a non-empty command log produces both replayHash and outputBytes', () => {
        const spec = skirmishSpec({ command: commandLog([moveTo('ally_a', { x: 100, y: 0 })]) });
        const output = resolveCombat(spec);
        assert.equal(typeof output.replayHash, 'string');
        assert.equal(typeof output.outputBytes, 'string');
    });
});

describe('replayHash — determinism', () => {
    test('the same BattleSpec and command log repeated three times produce the same hash', () => {
        const spec = skirmishSpec({ command: commandLog([moveTo('ally_a', { x: 300, y: 0 })]) });
        const a = resolveCombat(spec);
        const b = resolveCombat(spec);
        const c = resolveCombat(spec);
        assert.equal(a.replayHash, b.replayHash);
        assert.equal(b.replayHash, c.replayHash);
        assert.equal(a.outputBytes, b.outputBytes);
        assert.equal(b.outputBytes, c.outputBytes);
    });

    test('a structuredClone of the same input produces the same hash', () => {
        const spec = skirmishSpec({ command: commandLog([moveTo('ally_a', { x: 300, y: 0 })]) });
        const a = resolveCombat(spec);
        const b = resolveCombat(structuredClone(spec));
        assert.equal(a.replayHash, b.replayHash);
        assert.equal(a.outputBytes, b.outputBytes);
    });

    test('reversed unitIds with equivalent normalized meaning produce the same hash', () => {
        // Application order is participantOrder.indexOf(), not unitIds' own
        // array order (design §4) — receipts and every downstream effect are
        // already independent of this, so the hash must be too.
        const fwd = skirmishSpec({
            command: commandLog([{ tick: 1, seq: 0, issuerTeam: 0, unitIds: ['ally_a', 'ally_b'], command: 'stop' } as CommandInputEvent]),
        });
        const rev = skirmishSpec({
            command: commandLog([{ tick: 1, seq: 0, issuerTeam: 0, unitIds: ['ally_b', 'ally_a'], command: 'stop' } as CommandInputEvent]),
        });
        const outFwd = resolveCombat(fwd);
        const outRev = resolveCombat(rev);
        assert.equal(outFwd.replayHash, outRev.replayHash);
        assert.equal(outFwd.outputBytes, outRev.outputBytes);
    });

    test('stepCombat repeated from identical cloned state/context produces identical results', () => {
        const spec = skirmishSpec({ command: commandLog([moveTo('ally_a', { x: 100, y: 0 })]) });
        const ctx = createCombatStepContext(spec);
        const state = createCombatState(spec);
        const a = stepCombat(structuredClone(state), ctx);
        const b = stepCombat(structuredClone(state), ctx);
        assert.equal(JSON.stringify(a.state), JSON.stringify(b.state));
        assert.equal(JSON.stringify(a.events), JSON.stringify(b.events));
    });
});

describe('replayHash — sensitivity to meaningful changes', () => {
    test('a meaningful command point change produces a different hash and different bytes', () => {
        const specA = skirmishSpec({ command: commandLog([moveTo('ally_a', { x: 100, y: 0 })]) });
        const specB = skirmishSpec({ command: commandLog([moveTo('ally_a', { x: 200, y: 0 })]) });
        const outA = resolveCombat(specA);
        const outB = resolveCombat(specB);
        assert.notEqual(outA.replayHash, outB.replayHash);
        assert.notEqual(outA.outputBytes, outB.outputBytes);
    });

    test('a meaningful command sequence/order change produces a different hash and different bytes', () => {
        // Same two events, seq swapped: (tick,seq) total order (design §1)
        // flips which command wins under the "last wins" rule (design §4),
        // so the two logs are NOT equivalent despite containing the same
        // events — unlike the reversed-unitIds case above.
        const eventsA: CommandInputEvent[] = [
            { tick: 1, seq: 0, issuerTeam: 0, unitIds: ['ally_a'], command: 'move_to', point: { x: 100, y: 0 } } as CommandInputEvent,
            { tick: 1, seq: 1, issuerTeam: 0, unitIds: ['ally_a'], command: 'stop' } as CommandInputEvent,
        ];
        const eventsB: CommandInputEvent[] = [
            { tick: 1, seq: 1, issuerTeam: 0, unitIds: ['ally_a'], command: 'move_to', point: { x: 100, y: 0 } } as CommandInputEvent,
            { tick: 1, seq: 0, issuerTeam: 0, unitIds: ['ally_a'], command: 'stop' } as CommandInputEvent,
        ];
        const specA = skirmishSpec({ command: commandLog(eventsA) });
        const specB = skirmishSpec({ command: commandLog(eventsB) });
        const outA = resolveCombat(specA);
        const outB = resolveCombat(specB);
        assert.notEqual(outA.replayHash, outB.replayHash);
        assert.notEqual(outA.outputBytes, outB.outputBytes);
    });

    test('a meaningful initial HP change produces a different hash and different bytes', () => {
        const participantOrder = ['ally_a', 'enemy_a'];
        const specA = skirmishSpec({
            participantOrder,
            initialState: { units: { allies: [unit({ name: 'ally_a', team: 0, hp: 100, max_hp: 100 })], enemies: [unit({ name: 'enemy_a', team: 1 })] } },
            command: commandLog([moveTo('ally_a', { x: 100, y: 0 })]),
        });
        const specB = skirmishSpec({
            participantOrder,
            initialState: { units: { allies: [unit({ name: 'ally_a', team: 0, hp: 50, max_hp: 100 })], enemies: [unit({ name: 'enemy_a', team: 1 })] } },
            command: commandLog([moveTo('ally_a', { x: 100, y: 0 })]),
        });
        const outA = resolveCombat(specA);
        const outB = resolveCombat(specB);
        assert.notEqual(outA.replayHash, outB.replayHash);
        assert.notEqual(outA.outputBytes, outB.outputBytes);
    });

    test('a meaningful initial position change produces a different hash and different bytes', () => {
        const participantOrder = ['ally_a', 'enemy_a'];
        const specA = skirmishSpec({
            participantOrder,
            initialState: { units: { allies: [unit({ name: 'ally_a', team: 0, pos_x: 0, pos_y: 0 })], enemies: [unit({ name: 'enemy_a', team: 1 })] } },
            command: commandLog([moveTo('ally_a', { x: 100, y: 0 })]),
        });
        const specB = skirmishSpec({
            participantOrder,
            initialState: { units: { allies: [unit({ name: 'ally_a', team: 0, pos_x: 10, pos_y: 0 })], enemies: [unit({ name: 'enemy_a', team: 1 })] } },
            command: commandLog([moveTo('ally_a', { x: 100, y: 0 })]),
        });
        const outA = resolveCombat(specA);
        const outB = resolveCombat(specB);
        assert.notEqual(outA.replayHash, outB.replayHash);
        assert.notEqual(outA.outputBytes, outB.outputBytes);
    });

    test('a meaningful participantOrder change (flipping a distance tie-break) produces a different hash and different bytes', () => {
        const initialState = {
            units: {
                allies: [unit({ name: 'ally_a', team: 0, pos_x: 0, pos_y: 0, attack_range: 40 })],
                enemies: [
                    unit({ name: 'enemy_x', team: 1, pos_x: 20, pos_y: 0, max_hp: 100000, hp: 100000, attack: 0 }),
                    unit({ name: 'enemy_y', team: 1, pos_x: -20, pos_y: 0, max_hp: 100000, hp: 100000, attack: 0 }),
                ],
            },
        };
        const command = commandLog([attackMove('ally_a', { x: 300, y: 0 })]);
        const specXFirst = skirmishSpec({ participantOrder: ['ally_a', 'enemy_x', 'enemy_y'], initialState, command });
        const specYFirst = skirmishSpec({ participantOrder: ['ally_a', 'enemy_y', 'enemy_x'], initialState, command });
        const outXFirst = resolveCombat(specXFirst);
        const outYFirst = resolveCombat(specYFirst);
        assert.notEqual(outXFirst.replayHash, outYFirst.replayHash);
        assert.notEqual(outXFirst.outputBytes, outYFirst.outputBytes);
    });

    test('a receipt/final-state-affecting combat change produces a different hash and different bytes', () => {
        const specNoKill = skirmishSpec({
            participantOrder: ['ally_a', 'enemy_a', 'harmless_enemy'],
            initialState: {
                units: {
                    allies: [unit({ name: 'ally_a', team: 0, attack: 5, attack_range: 40 })],
                    // max_hp far too large for attack:5 to ever finish it off
                    // within the battle's timeout, so this spec genuinely never
                    // completes the order (Timeout, not target_defeated) —
                    // unlike specKill below, which one-shots the same target.
                    enemies: [unit({ name: 'enemy_a', team: 1, pos_x: 20, max_hp: 10_000_000, hp: 10_000_000, attack: 0 }), harmlessDistantEnemy()],
                },
            },
            command: commandLog([attackTarget('ally_a', 'enemy_a')]),
        });
        const specKill = skirmishSpec({
            participantOrder: ['ally_a', 'enemy_a', 'harmless_enemy'],
            initialState: {
                units: {
                    allies: [unit({ name: 'ally_a', team: 0, attack: 999, attack_range: 40 })],
                    enemies: [unit({ name: 'enemy_a', team: 1, pos_x: 20, max_hp: 100, hp: 100, attack: 0 }), harmlessDistantEnemy()],
                },
            },
            command: commandLog([attackTarget('ally_a', 'enemy_a')]),
        });
        const outNoKill = resolveCombat(specNoKill);
        const outKill = resolveCombat(specKill);
        assert.notEqual(outNoKill.replayHash, outKill.replayHash);
        assert.notEqual(outNoKill.outputBytes, outKill.outputBytes);
        // The actual mechanism behind the hash difference: outKill completes
        // the attack_target order (target_defeated) this run; outNoKill does not.
        assert.ok(outKill.commandReceipts!.some(r => r.kind === 'order_completed' && r.reason === 'target_defeated'));
        assert.ok(!outNoKill.commandReceipts!.some(r => r.kind === 'order_completed'));
    });
});

describe('replayHash — formatting', () => {
    test('replayHash is a lowercase 64-character hex string (sha256 hex digest)', () => {
        const spec = skirmishSpec({ command: commandLog([moveTo('ally_a', { x: 100, y: 0 })]) });
        const output = resolveCombat(spec);
        assert.equal(typeof output.replayHash, 'string');
        assert.equal(output.replayHash!.length, 64);
        assert.match(output.replayHash!, /^[0-9a-f]{64}$/);
    });

    test('outputBytes parses as JSON and round-trips to an object matching the other returned fields', () => {
        const spec = skirmishSpec({ command: commandLog([moveTo('ally_a', { x: 100, y: 0 })]) });
        const output = resolveCombat(spec);
        const parsed = JSON.parse(output.outputBytes!);
        assert.deepEqual(parsed.finalState, output.finalState);
        assert.deepEqual(parsed.outcome, output.outcome);
        assert.deepEqual(parsed.commandReceipts, output.commandReceipts);
        // The payload must never include itself.
        assert.equal('replayHash' in parsed, false);
        assert.equal('outputBytes' in parsed, false);
    });
});

describe('replayHash — no caller-owned mutation', () => {
    test('resolveCombat does not mutate the caller-owned BattleSpec or its command log', () => {
        const spec = skirmishSpec({ command: commandLog([moveTo('ally_a', { x: 100, y: 0 })]) });
        const specSnapshot = JSON.stringify(spec);
        resolveCombat(spec);
        assert.equal(JSON.stringify(spec), specSnapshot);
    });

    test('stepCombat does not mutate the caller-owned state or context', () => {
        const spec = skirmishSpec({ command: commandLog([moveTo('ally_a', { x: 100, y: 0 })]) });
        const ctx = createCombatStepContext(spec);
        const ctxSnapshot = JSON.stringify(ctx);
        const state = createCombatState(spec);
        const stateSnapshot = JSON.stringify(state);
        const result: { events: CombatStepEvents } = stepCombat(state, ctx);
        assert.equal(JSON.stringify(state), stateSnapshot, 'input state must not be mutated');
        assert.equal(JSON.stringify(ctx), ctxSnapshot, 'input ctx must not be mutated');
        assert.ok(result.events.evaluations.length >= 0);
    });
});
