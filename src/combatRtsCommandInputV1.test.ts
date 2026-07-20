/**
 * COMBAT-RTS-COMMAND-INPUT-SCHEMA-001 focused tests.
 *
 * PR2 is schema and normalization only — nothing here drives combat. What these
 * tests pin is the contract the later PRs will build replay on: every rejection
 * is explicit, the canonical form is unique, and the same input always produces
 * the same bytes.
 */

import * as assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
    COMMAND_INPUT_SCHEMA_VERSION, CommandInputEvent, CommandInputLog, CommandInputNormalizeErrorCode,
    DEFAULT_COMMAND_TICK_RATE, RTS_COMMANDS, RtsCommand,
    emptyCommandInputLog, normalizeCommandInputLog,
} from './combatRtsCommandInputCore';

const TICK_RATE = 30;

function log(events: unknown[], over: Record<string, unknown> = {}): unknown {
    return { schemaVersion: COMMAND_INPUT_SCHEMA_VERSION, tickRate: TICK_RATE, events, ...over };
}

function event(over: Record<string, unknown> = {}): Record<string, unknown> {
    return { tick: 0, seq: 0, issuerTeam: 0, unitIds: ['knight'], command: 'stop', ...over };
}

function ok(raw: unknown, expectedTickRate?: number): CommandInputLog {
    const result = normalizeCommandInputLog(raw, expectedTickRate);
    if (!result.ok) assert.fail(`expected success, got ${result.error} ${result.detail || ''}`);
    return result.log;
}

function rejects(raw: unknown, code: CommandInputNormalizeErrorCode, expectedTickRate?: number): void {
    const result = normalizeCommandInputLog(raw, expectedTickRate);
    assert.equal(result.ok, false, `expected ${code}, but normalization succeeded`);
    assert.equal(result.ok === false && result.error, code);
}

/** One valid event per command, with the fields that command actually needs. */
function validEventFor(command: RtsCommand, over: Record<string, unknown> = {}): Record<string, unknown> {
    const base = event({ command, ...over });
    if (command === 'move_to' || command === 'attack_move') base.point = { x: 10, y: -20 };
    if (command === 'attack_target') base.targetId = 'raider';
    return base;
}

describe('RTS command input — accepted logs', () => {
    test('an empty log is valid and carries the schema version', () => {
        const empty = emptyCommandInputLog();
        assert.equal(empty.schemaVersion, COMMAND_INPUT_SCHEMA_VERSION);
        assert.equal(empty.tickRate, DEFAULT_COMMAND_TICK_RATE);
        assert.deepEqual(empty.events, []);
        assert.deepEqual(ok(empty, DEFAULT_COMMAND_TICK_RATE), empty);
    });

    for (const command of RTS_COMMANDS) {
        test(`${command} round-trips through normalization`, () => {
            const result = ok(log([validEventFor(command)]), TICK_RATE);
            assert.equal(result.events.length, 1);
            assert.equal(result.events[0].command, command);
            assert.deepEqual(result.events[0].unitIds, ['knight']);
        });
    }

    test('all five commands validate in a single log', () => {
        const events = RTS_COMMANDS.map((command, index) => validEventFor(command, { tick: index, seq: 0 }));
        const result = ok(log(events), TICK_RATE);
        assert.deepEqual(result.events.map(e => e.command), [...RTS_COMMANDS]);
    });

    test('point commands keep their destination, target commands keep their target', () => {
        const moved = ok(log([validEventFor('move_to')]), TICK_RATE).events[0];
        assert.deepEqual(moved.point, { x: 10, y: -20 });
        assert.equal(moved.targetId, undefined);

        const attacked = ok(log([validEventFor('attack_target')]), TICK_RATE).events[0];
        assert.equal(attacked.targetId, 'raider');
        assert.equal(attacked.point, undefined);
    });

    test('both teams may issue commands', () => {
        for (const issuerTeam of [0, 1]) {
            assert.equal(ok(log([event({ issuerTeam })]), TICK_RATE).events[0].issuerTeam, issuerTeam);
        }
    });

    test('tickRate is accepted when it matches the battle, and when unchecked', () => {
        assert.equal(ok(log([]), TICK_RATE).tickRate, TICK_RATE);
        assert.equal(ok(log([])).tickRate, TICK_RATE);
    });
});

describe('RTS command input — rejections', () => {
    test('INVALID_LOG: not an object, or events is not an array', () => {
        for (const bad of [null, undefined, 42, 'log', [], true]) rejects(bad, 'INVALID_LOG');
        rejects(log(undefined as never), 'INVALID_LOG');
        rejects({ schemaVersion: COMMAND_INPUT_SCHEMA_VERSION, tickRate: TICK_RATE, events: {} }, 'INVALID_LOG');
    });

    test('INVALID_SCHEMA_VERSION: anything but an exact match', () => {
        for (const bad of ['combat-command-input-v2', 'COMBAT-COMMAND-INPUT-V1', '', undefined, 1]) {
            rejects(log([], { schemaVersion: bad }), 'INVALID_SCHEMA_VERSION');
        }
    });

    test('INVALID_TICK_RATE: non-positive, non-integer, or mismatched', () => {
        for (const bad of [0, -1, 1.5, NaN, Infinity, '30', null, undefined]) {
            rejects(log([], { tickRate: bad }), 'INVALID_TICK_RATE');
        }
        rejects(log([], { tickRate: 60 }), 'INVALID_TICK_RATE', 30);
    });

    test('INVALID_EVENT: an entry that is not an object', () => {
        for (const bad of [null, 7, 'stop', [], undefined]) rejects(log([bad]), 'INVALID_EVENT');
    });

    test('INVALID_TICK / INVALID_SEQ: must be non-negative integers', () => {
        for (const bad of [-1, 1.5, NaN, Infinity, '0', null, undefined]) {
            rejects(log([event({ tick: bad })]), 'INVALID_TICK');
            rejects(log([event({ seq: bad })]), 'INVALID_SEQ');
        }
    });

    test('DUPLICATE_SEQ: the same (tick, seq) twice', () => {
        rejects(log([event({ tick: 3, seq: 1 }), event({ tick: 3, seq: 1 })]), 'DUPLICATE_SEQ');
        // Same seq at a different tick is fine, and so is a different seq at the same tick.
        assert.equal(ok(log([event({ tick: 3, seq: 1 }), event({ tick: 4, seq: 1 })]), TICK_RATE).events.length, 2);
        assert.equal(ok(log([event({ tick: 3, seq: 1 }), event({ tick: 3, seq: 2 })]), TICK_RATE).events.length, 2);
    });

    test('INVALID_TEAM: only 0 and 1', () => {
        for (const bad of [2, -1, 0.5, '0', null, undefined, true]) {
            rejects(log([event({ issuerTeam: bad })]), 'INVALID_TEAM');
        }
    });

    test('INVALID_UNIT_IDS: empty array, empty string, or non-string entries', () => {
        rejects(log([event({ unitIds: [] })]), 'INVALID_UNIT_IDS');
        rejects(log([event({ unitIds: ['knight', ''] })]), 'INVALID_UNIT_IDS');
        rejects(log([event({ unitIds: ['knight', 42] })]), 'INVALID_UNIT_IDS');
        rejects(log([event({ unitIds: ['knight', null] })]), 'INVALID_UNIT_IDS');
        for (const bad of ['knight', null, undefined, {}]) {
            rejects(log([event({ unitIds: bad })]), 'INVALID_UNIT_IDS');
        }
    });

    test('INVALID_COMMAND: unknown verbs, including avatar verbs that belong to direct mode', () => {
        for (const bad of ['dodge', 'light_attack', 'MOVE_TO', '', null, undefined, 5]) {
            rejects(log([event({ command: bad })]), 'INVALID_COMMAND');
        }
    });

    test('INVALID_POINT: move_to and attack_move require a point', () => {
        for (const command of ['move_to', 'attack_move']) {
            rejects(log([event({ command })]), 'INVALID_POINT');
            for (const bad of [null, 'x,y', 42, [10, 20]]) {
                rejects(log([event({ command, point: bad })]), 'INVALID_POINT');
            }
        }
    });

    test('NON_FINITE: a point whose coordinates are not finite numbers', () => {
        for (const bad of [NaN, Infinity, -Infinity, '10', null, undefined]) {
            rejects(log([event({ command: 'move_to', point: { x: bad, y: 0 } })]), 'NON_FINITE');
            rejects(log([event({ command: 'move_to', point: { x: 0, y: bad } })]), 'NON_FINITE');
        }
    });

    test('INVALID_TARGET_ID: attack_target requires a non-empty target', () => {
        rejects(log([event({ command: 'attack_target' })]), 'INVALID_TARGET_ID');
        for (const bad of ['', null, 42, {}, []]) {
            rejects(log([event({ command: 'attack_target', targetId: bad })]), 'INVALID_TARGET_ID');
        }
    });

    test('the first problem is reported, and nothing partial is returned', () => {
        const result = normalizeCommandInputLog(log([event(), event({ tick: -1 })]), TICK_RATE);
        assert.equal(result.ok, false);
        assert.equal(result.ok === false && result.error, 'INVALID_TICK');
        assert.ok(result.ok === false && (result.detail || '').includes('events[1]'));
    });
});

describe('RTS command input — canonical form', () => {
    test('fields a command does not use are dropped, not carried', () => {
        // A UI that always sends the cursor position must not make `stop` unique.
        const withNoise = ok(log([
            event({ command: 'stop', point: { x: 5, y: 5 }, targetId: 'raider' }),
        ]), TICK_RATE);
        assert.equal(withNoise.events[0].point, undefined);
        assert.equal(withNoise.events[0].targetId, undefined);
        assert.deepEqual(Object.keys(withNoise.events[0]).sort(), ['command', 'issuerTeam', 'seq', 'tick', 'unitIds']);

        const plain = ok(log([event({ command: 'stop' })]), TICK_RATE);
        assert.equal(JSON.stringify(withNoise), JSON.stringify(plain), 'noise changed the canonical bytes');
    });

    test('resume_gambit likewise ignores point and targetId', () => {
        const noisy = ok(log([event({ command: 'resume_gambit', point: { x: 1, y: 2 }, targetId: 'x' })]), TICK_RATE);
        assert.equal(noisy.events[0].point, undefined);
        assert.equal(noisy.events[0].targetId, undefined);
    });

    test('attack_target drops a stray point, move_to drops a stray targetId', () => {
        const attack = ok(log([event({ command: 'attack_target', targetId: 'raider', point: { x: 9, y: 9 } })]), TICK_RATE);
        assert.equal(attack.events[0].point, undefined);
        assert.equal(attack.events[0].targetId, 'raider');

        const move = ok(log([event({ command: 'move_to', point: { x: 1, y: 2 }, targetId: 'raider' })]), TICK_RATE);
        assert.equal(move.events[0].targetId, undefined);
        assert.deepEqual(move.events[0].point, { x: 1, y: 2 });
    });

    test('unrecognized extra fields are not carried through', () => {
        const result = ok(log([event({ nonsense: 'keep me', _internal: 1 })]), TICK_RATE);
        assert.equal((result.events[0] as unknown as Record<string, unknown>).nonsense, undefined);
        assert.equal((result.events[0] as unknown as Record<string, unknown>)._internal, undefined);
    });
});

describe('RTS command input — quantization', () => {
    test('coordinates are quantized to 1/1000', () => {
        const point = ok(log([event({ command: 'move_to', point: { x: 1.23456789, y: -9.87654321 } })]), TICK_RATE).events[0].point!;
        assert.deepEqual(point, { x: 1.235, y: -9.877 });
    });

    test('quantization is idempotent', () => {
        const once = ok(log([event({ command: 'move_to', point: { x: 0.0005, y: -0.0005 } })]), TICK_RATE);
        const twice = ok(JSON.parse(JSON.stringify(once)), TICK_RATE);
        assert.deepEqual(twice.events[0].point, once.events[0].point);
    });

    test('boundary values round half toward +Infinity, matching quantizeScalar', () => {
        // Math.round breaks ties toward +Infinity, so a negative half rounds
        // toward zero rather than away from it: -0.0005 quantizes to -0, not
        // -0.001. Pinned here because it is asymmetric and easy to assume wrong.
        // (Note: quantizeScalar's own docstring describes this as "half away
        // from zero", which does not match what Math.round does.)
        const cases: Array<[number, number]> = [
            [0.0004, 0], [0.0005, 0.001], [0.0006, 0.001],
            [-0.0004, 0], [-0.0005, 0], [-0.0006, -0.001],
            [1.0005, 1.001], [-1.0005, -1], [-1.0006, -1.001],
        ];
        for (const [input, expected] of cases) {
            const point = ok(log([event({ command: 'move_to', point: { x: input, y: 0 } })]), TICK_RATE).events[0].point!;
            assert.equal(point.x, expected, `x=${input}`);
        }
    });

    test('negative zero is folded to zero so the canonical form stays unique', () => {
        const point = ok(log([event({ command: 'move_to', point: { x: -0, y: -0.0001 } })]), TICK_RATE).events[0].point!;
        // Object.is distinguishes -0 from 0; JSON does not. Folding keeps the
        // in-memory value and the serialized value agreeing after a round trip.
        assert.ok(Object.is(point.x, 0), `x should be +0, got ${Object.is(point.x, -0) ? '-0' : point.x}`);
        assert.ok(Object.is(point.y, 0), `y should be +0, got ${Object.is(point.y, -0) ? '-0' : point.y}`);

        const revived = JSON.parse(JSON.stringify(point)) as { x: number; y: number };
        assert.deepEqual(revived, point, 'a JSON round trip changed the point');
    });

    test('a finite coordinate that overflows to Infinity during quantization is rejected (x)', () => {
        // 1e306 is a finite double, but 1e306 * DIRECTION_QUANTUM (1000) exceeds
        // Number.MAX_VALUE and rounds to Infinity inside quantizeScalar. The
        // pre-quantization finite check alone does not catch this.
        rejects(log([event({ command: 'move_to', point: { x: 1e306, y: 0 } })]), 'NON_FINITE');
    });

    test('a finite coordinate that overflows to -Infinity during quantization is rejected (x)', () => {
        rejects(log([event({ command: 'move_to', point: { x: -1e306, y: 0 } })]), 'NON_FINITE');
    });

    test('the same overflow is caught on y, and for attack_move as well as move_to', () => {
        rejects(log([event({ command: 'move_to', point: { x: 0, y: 1e306 } })]), 'NON_FINITE');
        rejects(log([event({ command: 'move_to', point: { x: 0, y: -1e306 } })]), 'NON_FINITE');
        rejects(log([event({ command: 'attack_move', point: { x: 1e306, y: 0 } })]), 'NON_FINITE');
        rejects(log([event({ command: 'attack_move', point: { x: 0, y: -1e306 } })]), 'NON_FINITE');
    });

    test('a large-but-safe finite coordinate (just under the overflow boundary) normalizes fine', () => {
        // 1e305 * 1000 = 1e308, still within double range, so this must NOT be rejected.
        const point = ok(log([event({ command: 'move_to', point: { x: 1e305, y: -1e305 } })]), TICK_RATE).events[0].point!;
        assert.ok(Number.isFinite(point.x));
        assert.ok(Number.isFinite(point.y));
        assert.equal(point.x, 1e305);
        assert.equal(point.y, -1e305);
    });

    test('every point in a successfully normalized log is finite', () => {
        const result = ok(log([
            validEventFor('move_to', { point: { x: 1e305, y: 2 } }),
            validEventFor('attack_move', { tick: 1, point: { x: -3, y: 1e305 } }),
        ]), TICK_RATE);
        for (const e of result.events) {
            if (e.point) {
                assert.ok(Number.isFinite(e.point.x), `point.x not finite: ${e.point.x}`);
                assert.ok(Number.isFinite(e.point.y), `point.y not finite: ${e.point.y}`);
            }
        }
    });

    test('an overflowing point never reaches JSON.stringify as null', () => {
        // Guards the exact failure mode Codex flagged: ok:true output whose point
        // silently becomes { x: null, y: ... } on the wire.
        const result = normalizeCommandInputLog(log([event({ command: 'move_to', point: { x: 1e306, y: 0 } })]), TICK_RATE);
        assert.equal(result.ok, false);
        if (result.ok) return; // unreachable, narrows the type for the line below
        assert.notEqual(JSON.stringify(result), undefined);
        assert.ok(!JSON.stringify(result).includes('"point"'), 'a rejected log must not carry a point at all');
    });

    test('already-quantized coordinates are untouched', () => {
        const point = ok(log([event({ command: 'move_to', point: { x: 12.345, y: -6.789 } })]), TICK_RATE).events[0].point!;
        assert.deepEqual(point, { x: 12.345, y: -6.789 });
    });

    test('exact integers survive', () => {
        const point = ok(log([event({ command: 'attack_move', point: { x: 0, y: 400 } })]), TICK_RATE).events[0].point!;
        assert.deepEqual(point, { x: 0, y: 400 });
    });
});

describe('RTS command input — ordering', () => {
    test('events are sorted by tick, then seq', () => {
        const result = ok(log([
            event({ tick: 5, seq: 1 }), event({ tick: 1, seq: 2 }),
            event({ tick: 5, seq: 0 }), event({ tick: 1, seq: 0 }),
        ]), TICK_RATE);
        assert.deepEqual(result.events.map(e => [e.tick, e.seq]), [[1, 0], [1, 2], [5, 0], [5, 1]]);
    });

    test('an already-sorted log is unchanged', () => {
        const events = [event({ tick: 0, seq: 0 }), event({ tick: 0, seq: 1 }), event({ tick: 2, seq: 0 })];
        const result = ok(log(events), TICK_RATE);
        assert.deepEqual(result.events.map(e => [e.tick, e.seq]), [[0, 0], [0, 1], [2, 0]]);
    });

    test('unitIds keep their original order — selection order is not sorted away', () => {
        const unitIds = ['zeta', 'alpha', 'mid', 'alpha2'];
        assert.deepEqual(ok(log([event({ unitIds })]), TICK_RATE).events[0].unitIds, unitIds);
    });

    test('sorting events does not disturb each event unitIds', () => {
        const result = ok(log([
            event({ tick: 9, seq: 0, unitIds: ['c', 'a'] }),
            event({ tick: 1, seq: 0, unitIds: ['b', 'd'] }),
        ]), TICK_RATE);
        assert.deepEqual(result.events[0].unitIds, ['b', 'd']);
        assert.deepEqual(result.events[1].unitIds, ['c', 'a']);
    });
});

describe('RTS command input — purity and reproducibility', () => {
    test('the input object is not mutated', () => {
        const raw = log([
            event({ tick: 5, seq: 0, command: 'move_to', point: { x: 1.23456, y: 2 }, unitIds: ['b', 'a'] }),
            event({ tick: 1, seq: 0 }),
        ]);
        const before = JSON.stringify(raw);
        normalizeCommandInputLog(raw, TICK_RATE);
        assert.equal(JSON.stringify(raw), before, 'normalization mutated its input');
    });

    test('the returned unitIds array is a copy, not the caller array', () => {
        const unitIds = ['knight', 'archer'];
        const result = ok(log([event({ unitIds })]), TICK_RATE);
        result.events[0].unitIds.push('injected');
        assert.deepEqual(unitIds, ['knight', 'archer']);
    });

    test('output survives a JSON round trip unchanged', () => {
        const events = RTS_COMMANDS.map((command, index) => validEventFor(command, { tick: index }));
        const normalized = ok(log(events), TICK_RATE);
        const revived = JSON.parse(JSON.stringify(normalized)) as CommandInputLog;
        assert.deepEqual(revived, normalized);
        assert.equal(JSON.stringify(ok(revived, TICK_RATE)), JSON.stringify(normalized));
    });

    test('the same input always produces the same bytes', () => {
        const events = [
            event({ tick: 7, seq: 1, command: 'attack_target', targetId: 'raider' }),
            event({ tick: 2, seq: 0, command: 'move_to', point: { x: 3.14159, y: -2.71828 } }),
            event({ tick: 7, seq: 0, command: 'stop', unitIds: ['z', 'a'] }),
        ];
        const first = JSON.stringify(ok(log(events), TICK_RATE));
        const second = JSON.stringify(ok(log(events.slice().reverse()), TICK_RATE));
        assert.equal(second, first, 'input order changed the canonical bytes');
    });

    test('typed events satisfy the declared interface', () => {
        const typed: CommandInputEvent[] = ok(log([validEventFor('attack_move')]), TICK_RATE).events;
        assert.equal(typed[0].command, 'attack_move');
        assert.equal(typeof typed[0].point!.x, 'number');
    });
});

describe('RTS command input — negative zero canonicalization (tick / seq / issuerTeam)', () => {
    // `-0 === 0` is true, so `isNonNegativeInteger` and the issuerTeam equality
    // check both happily accept -0. Left uncanonicalized it would sit in the
    // output as -0 while an equivalent log with a literal 0 sits as +0 — two
    // representations of what should be one canonical value.

    test('tick = -0 canonicalizes to 0, and is not -0 by Object.is', () => {
        const result = ok(log([event({ tick: -0 })]), TICK_RATE);
        assert.equal(result.events[0].tick, 0);
        assert.ok(!Object.is(result.events[0].tick, -0), 'tick is still -0');
    });

    test('seq = -0 canonicalizes to 0, and is not -0 by Object.is', () => {
        const result = ok(log([event({ seq: -0 })]), TICK_RATE);
        assert.equal(result.events[0].seq, 0);
        assert.ok(!Object.is(result.events[0].seq, -0), 'seq is still -0');
    });

    test('issuerTeam = -0 canonicalizes to 0, and is not -0 by Object.is', () => {
        const result = ok(log([event({ issuerTeam: -0 })]), TICK_RATE);
        assert.equal(result.events[0].issuerTeam, 0);
        assert.ok(!Object.is(result.events[0].issuerTeam, -0), 'issuerTeam is still -0');
    });

    test('ordinary positive integers pass through unaffected', () => {
        const result = ok(log([event({ tick: 42, seq: 7, issuerTeam: 1 })]), TICK_RATE);
        assert.equal(result.events[0].tick, 42);
        assert.equal(result.events[0].seq, 7);
        assert.equal(result.events[0].issuerTeam, 1);
    });

    test('no numeric field anywhere in a normalized log is -0, including point coordinates', () => {
        const events = [
            event({ tick: -0, seq: -0, issuerTeam: -0, command: 'move_to', point: { x: -0, y: -0 } }),
            event({ tick: 3, seq: 1 }),
        ];
        const result = ok(log(events), TICK_RATE);
        for (const e of result.events) {
            assert.ok(!Object.is(e.tick, -0), `tick is -0`);
            assert.ok(!Object.is(e.seq, -0), `seq is -0`);
            assert.ok(!Object.is(e.issuerTeam, -0), `issuerTeam is -0`);
            if (e.point) {
                assert.ok(!Object.is(e.point.x, -0), `point.x is -0`);
                assert.ok(!Object.is(e.point.y, -0), `point.y is -0`);
            }
        }
    });

    test('a JSON round trip of a -0-bearing log is deepEqual to the normalized form', () => {
        const result = ok(log([event({ tick: -0, seq: -0, issuerTeam: -0 })]), TICK_RATE);
        const revived = JSON.parse(JSON.stringify(result)) as CommandInputLog;
        assert.deepEqual(revived, result);
    });
});

describe('RTS command input — unitIds copy safety', () => {
    // These guard against a TOCTOU (time-of-check/time-of-use) class of bug:
    // validating element N and then copying the array via a second pass (e.g.
    // `.slice()`) reads every index twice. A hostile array can return a valid
    // string on the first read and something else on the second, so anything
    // that re-reads after validation can silently smuggle a different value
    // into the output than the one that was actually checked.

    test('unitIds.slice is never called, even when overridden', () => {
        const unitIds = ['knight', 'archer'];
        let sliceCalled = false;
        Object.defineProperty(unitIds, 'slice', {
            value: () => { sliceCalled = true; throw new Error('slice must not be called'); },
            writable: true,
            configurable: true,
        });
        const result = ok(log([event({ unitIds })]), TICK_RATE);
        assert.equal(sliceCalled, false, 'unitIds.slice was called');
        assert.deepEqual(result.events[0].unitIds, ['knight', 'archer']);
    });

    test('overriding slice to return [Infinity], a BigInt, or a cyclic array does not affect the output', () => {
        const cyclic: unknown[] = [];
        cyclic.push(cyclic);
        const maliciousSliceImpls: Array<() => unknown> = [
            () => [Infinity],
            () => [123n],
            () => cyclic,
        ];
        for (const maliciousSlice of maliciousSliceImpls) {
            const unitIds = ['knight', 'archer'];
            Object.defineProperty(unitIds, 'slice', { value: maliciousSlice, writable: true, configurable: true });
            const result = ok(log([event({ unitIds })]), TICK_RATE);
            assert.deepEqual(result.events[0].unitIds, ['knight', 'archer']);
        }
    });

    test("the input array's own constructor / Symbol.species is never consulted", () => {
        const unitIds = ['knight', 'archer'];
        let speciesAccessed = false;
        class SpeciesTrap {
            static get [Symbol.species](): ArrayConstructor {
                speciesAccessed = true;
                return Array;
            }
        }
        Object.defineProperty(unitIds, 'constructor', { value: SpeciesTrap, writable: true, configurable: true });
        const result = ok(log([event({ unitIds })]), TICK_RATE);
        assert.equal(speciesAccessed, false, 'Symbol.species was consulted');
        assert.deepEqual(result.events[0].unitIds, ['knight', 'archer']);
    });

    test('a hostile index getter is read exactly once — no double-read after validation', () => {
        const unitIds: string[] = ['knight', 'archer', 'mage'];
        let readCountForIndex1 = 0;
        Object.defineProperty(unitIds, '1', {
            get() {
                readCountForIndex1++;
                // A second read (the old .slice() pass) would observe this and
                // smuggle 'INJECTED' into the output despite validation having
                // seen 'archer'.
                return readCountForIndex1 === 1 ? 'archer' : 'INJECTED';
            },
            configurable: true,
        });
        const result = ok(log([event({ unitIds })]), TICK_RATE);
        assert.equal(readCountForIndex1, 1, 'index 1 was read more than once');
        assert.deepEqual(result.events[0].unitIds, ['knight', 'archer', 'mage']);
    });

    test('a hostile getter that turns invalid after the first read cannot un-invalidate a rejection either', () => {
        const unitIds: string[] = ['knight', ''];
        let readCount = 0;
        Object.defineProperty(unitIds, '1', {
            get() {
                readCount++;
                // Invalid on the read that matters (validation); a later read
                // turning "valid" must not matter, because there must be no
                // later read.
                return readCount === 1 ? '' : 'archer';
            },
            configurable: true,
        });
        rejects(log([event({ unitIds })]), 'INVALID_UNIT_IDS');
        assert.equal(readCount, 1, 'index 1 was read more than once');
    });

    test('unitIds order is preserved through the copy', () => {
        const unitIds = ['zeta', 'alpha', 'mid'];
        const result = ok(log([event({ unitIds })]), TICK_RATE);
        assert.deepEqual(result.events[0].unitIds, unitIds);
    });

    test('the caller-supplied unitIds array is not mutated', () => {
        const unitIds = ['knight', 'archer'];
        const before = unitIds.slice();
        ok(log([event({ unitIds })]), TICK_RATE);
        assert.deepEqual(unitIds, before);
    });
});

describe('RTS command input — unitIds.length read exactly once', () => {
    // Codex P2 on PR #33: the old code checked `Array.isArray(unitIds) ||
    // unitIds.length === 0`, then separately read `unitIds.length` again to
    // size the copy. A Proxy length trap can answer differently each time it
    // is invoked, so those two reads did not have to agree.

    test('a Proxy length trap answering 1 then 0 cannot smuggle an empty unitIds past the non-empty check', () => {
        const target = ['knight'];
        let lengthReads = 0;
        const hostileUnitIds = new Proxy(target, {
            get(obj, prop, receiver) {
                if (prop === 'length') {
                    lengthReads++;
                    // 1st read (the check the old code ran first) sees non-empty;
                    // a 2nd read (the old code's separate size read) would see 0.
                    return lengthReads === 1 ? 1 : 0;
                }
                return Reflect.get(obj, prop, receiver);
            },
        });

        const result = ok(log([event({ unitIds: hostileUnitIds })]), TICK_RATE);
        assert.equal(lengthReads, 1, 'unitIds.length was read more than once');
        assert.deepEqual(result.events[0].unitIds, ['knight']);
    });

    test('a Proxy length trap answering 0 then 1 is rejected, and the trap fires only once', () => {
        const target: string[] = [];
        let lengthReads = 0;
        const hostileUnitIds = new Proxy(target, {
            get(obj, prop, receiver) {
                if (prop === 'length') {
                    lengthReads++;
                    return lengthReads === 1 ? 0 : 1;
                }
                return Reflect.get(obj, prop, receiver);
            },
        });
        rejects(log([event({ unitIds: hostileUnitIds })]), 'INVALID_UNIT_IDS');
        assert.equal(lengthReads, 1, 'unitIds.length was read more than once');
    });

    test('the length trap fires exactly once for an ordinary, non-hostile read too', () => {
        const target = ['a', 'b', 'c'];
        let lengthReads = 0;
        const trackedUnitIds = new Proxy(target, {
            get(obj, prop, receiver) {
                if (prop === 'length') lengthReads++;
                return Reflect.get(obj, prop, receiver);
            },
        });
        const result = ok(log([event({ unitIds: trackedUnitIds })]), TICK_RATE);
        assert.equal(lengthReads, 1);
        assert.deepEqual(result.events[0].unitIds, ['a', 'b', 'c']);
    });

    test('an ordinary non-empty array still succeeds, unchanged', () => {
        const result = ok(log([event({ unitIds: ['knight', 'archer'] })]), TICK_RATE);
        assert.deepEqual(result.events[0].unitIds, ['knight', 'archer']);
    });

    test('an ordinary empty array is still INVALID_UNIT_IDS', () => {
        rejects(log([event({ unitIds: [] })]), 'INVALID_UNIT_IDS');
    });
});

describe('RTS command input — other single-read fixes found by the limited audit', () => {
    // The task asked for a narrow audit of normalizeCommandInputLog for the
    // same check-once/use-twice shape as the named unitIds.length bug. Two more
    // instances turned up and were fixed the same way; these tests cover them.

    test('raw.events is read exactly once, even from a getter', () => {
        const events = [event({ unitIds: ['knight'] })];
        let eventsReads = 0;
        const raw = {
            schemaVersion: COMMAND_INPUT_SCHEMA_VERSION,
            tickRate: TICK_RATE,
            get events() { eventsReads++; return events; },
        };
        const result = ok(raw, TICK_RATE);
        assert.equal(eventsReads, 1, 'raw.events getter was invoked more than once');
        assert.equal(result.events.length, 1);
    });

    test('point.x and point.y are each read exactly once', () => {
        const seenReads: string[] = [];
        const hostilePoint = {
            get x() { seenReads.push('x'); return 12.345; },
            get y() { seenReads.push('y'); return -6.789; },
        };
        const result = ok(log([event({ command: 'move_to', point: hostilePoint })]), TICK_RATE);
        assert.deepEqual(seenReads, ['x', 'y']);
        assert.deepEqual(result.events[0].point, { x: 12.345, y: -6.789 });
    });

    test('a point.x getter is never given a chance to answer a second time with a different value', () => {
        let reads = 0;
        const hostilePoint = {
            // A second read would answer Infinity; if the code only reads once,
            // that branch can never be taken and normalization must succeed.
            get x() { reads++; return reads === 1 ? 5 : Infinity; },
            y: 0,
        };
        const result = normalizeCommandInputLog(log([event({ command: 'move_to', point: hostilePoint })]), TICK_RATE);
        assert.equal(reads, 1, 'point.x was read more than once');
        assert.equal(result.ok, true);
    });

    // Codex P2 on PR #33: the schemaVersion check read `raw.schemaVersion` once
    // for the comparison and a second time via String() while building the
    // failure detail. Confirmed exploitable before fixing it: a getter that
    // answers a bogus version on the first read and throws on the second turns
    // an ordinary rejection into an uncaught exception out of
    // normalizeCommandInputLog itself.
    test('raw.schemaVersion is read exactly once', () => {
        let reads = 0;
        const raw = {
            get schemaVersion() { reads++; return 'bogus-version'; },
            tickRate: TICK_RATE,
            events: [],
        };
        const result = normalizeCommandInputLog(raw, TICK_RATE);
        assert.equal(reads, 1, 'raw.schemaVersion was read more than once');
        assert.equal(result.ok, false);
        assert.equal(result.ok === false && result.error, 'INVALID_SCHEMA_VERSION');
    });

    test('a schemaVersion getter that throws on a second access does not crash normalization', () => {
        let reads = 0;
        const raw = {
            get schemaVersion() {
                reads++;
                if (reads === 1) return 'bogus-version';
                throw new Error('a second read must never happen');
            },
            tickRate: TICK_RATE,
            events: [],
        };
        assert.doesNotThrow(() => normalizeCommandInputLog(raw, TICK_RATE));
        assert.equal(reads, 1);
    });

    test('the failure detail reflects the single value that was actually checked', () => {
        const result = normalizeCommandInputLog(log([], { schemaVersion: 'v-999' }), TICK_RATE);
        assert.equal(result.ok, false);
        assert.equal(result.ok === false && result.detail, 'v-999');
    });
});
