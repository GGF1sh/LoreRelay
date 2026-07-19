/**
 * COMBAT-DIRECT-MODE-FOUNDATION-V1-001 focused tests.
 *
 * Covers: mode contract, capability fallback, input log schema, empty replay
 * foundation. Does not implement move/attack/dodge/etc.
 */

import * as assert from 'node:assert/strict';
import * as fs from 'fs';
import * as path from 'path';
import { describe, test } from 'node:test';
import {
    COMBAT_SELECTABLE_MODES,
    combatModeResolutionToJson,
    isCombatSelectableMode,
    resolveCombatMode,
    toRuntimeCombatMode,
} from './combatModeContract';
import {
    DIRECT_INPUT_SCHEMA_VERSION,
    directInputLogIsStable,
    emptyDirectInputLog,
    normalizeDirectInputLog,
    parseDirectInputLogJson,
    quantizeDirection,
    quantizeScalar,
    serializeDirectInputLog,
} from './combatDirectInputCore';
import {
    emptyLogMatchesBareResolve,
    runDirectReplayFoundation,
} from './combatDirectReplayFoundation';
import { BattleSpec, resolveCombat } from './gambitCombatCore';

// ---------------------------------------------------------------------------
// Mode contract
// ---------------------------------------------------------------------------

describe('Combat mode contract (foundation V1)', () => {
    test('accepts all five selectable modes', () => {
        assert.deepEqual([...COMBAT_SELECTABLE_MODES], [
            'narrative',
            'legacy_gambit',
            'mechanics_gambit',
            'direct_action',
            'command_spectator',
        ]);
        for (const mode of COMBAT_SELECTABLE_MODES) {
            assert.equal(isCombatSelectableMode(mode), true);
            const result = resolveCombatMode(mode, { directRuntimeAvailable: true });
            assert.equal(result.ok, true);
            if (result.ok) {
                assert.equal(result.resolution.requestedMode, mode);
                assert.equal(result.resolution.resolvedMode, mode);
                assert.equal(result.resolution.fallbackReason, null);
            }
        }
    });

    test('rejects unknown modes', () => {
        for (const bad of ['mechanics_v1', 'direct', 'auto', '', 42, null, undefined, {}]) {
            const result = resolveCombatMode(bad, { directRuntimeAvailable: true });
            assert.equal(result.ok, false);
            if (!result.ok) {
                assert.equal(result.error, 'UNKNOWN_COMBAT_MODE');
            }
        }
    });

    test('direct available keeps direct_action', () => {
        const result = resolveCombatMode('direct_action', { directRuntimeAvailable: true });
        assert.equal(result.ok, true);
        if (result.ok) {
            assert.equal(result.resolution.requestedMode, 'direct_action');
            assert.equal(result.resolution.resolvedMode, 'direct_action');
            assert.equal(result.resolution.fallbackReason, null);
        }
    });

    test('direct unavailable falls back to mechanics_gambit', () => {
        const result = resolveCombatMode('direct_action', { directRuntimeAvailable: false });
        assert.equal(result.ok, true);
        if (result.ok) {
            assert.equal(result.resolution.requestedMode, 'direct_action');
            assert.equal(result.resolution.resolvedMode, 'mechanics_gambit');
            assert.equal(result.resolution.fallbackReason, 'direct_runtime_unavailable');
        }
    });

    test('fallback reason is stable and JSON-safe', () => {
        const a = resolveCombatMode('direct_action', { directRuntimeAvailable: false });
        const b = resolveCombatMode('direct_action', { directRuntimeAvailable: false });
        assert.equal(a.ok && b.ok, true);
        if (a.ok && b.ok) {
            assert.deepEqual(combatModeResolutionToJson(a.resolution), combatModeResolutionToJson(b.resolution));
            const json = JSON.stringify(combatModeResolutionToJson(a.resolution));
            assert.deepEqual(JSON.parse(json), {
                requestedMode: 'direct_action',
                resolvedMode: 'mechanics_gambit',
                fallbackReason: 'direct_runtime_unavailable',
            });
        }
    });

    test('non-direct modes never fall back when capability is false', () => {
        for (const mode of ['narrative', 'legacy_gambit', 'mechanics_gambit', 'command_spectator'] as const) {
            const result = resolveCombatMode(mode, { directRuntimeAvailable: false });
            assert.equal(result.ok, true);
            if (result.ok) {
                assert.equal(result.resolution.resolvedMode, mode);
                assert.equal(result.resolution.fallbackReason, null);
            }
        }
    });

    test('runtime mapping leaves legacy/mechanics identifiers intact', () => {
        assert.equal(toRuntimeCombatMode('legacy_gambit'), 'legacy_gambit');
        assert.equal(toRuntimeCombatMode('mechanics_gambit'), 'mechanics_v1');
        assert.equal(toRuntimeCombatMode('direct_action'), 'mechanics_v1');
        assert.equal(toRuntimeCombatMode('command_spectator'), 'mechanics_v1');
        assert.equal(toRuntimeCombatMode('narrative'), null);
    });
});

// ---------------------------------------------------------------------------
// Input log schema
// ---------------------------------------------------------------------------

describe('Direct input log schema (foundation V1)', () => {
    test('order normalization sorts by (tick, seq)', () => {
        const raw = {
            schemaVersion: DIRECT_INPUT_SCHEMA_VERSION,
            events: [
                { tick: 2, seq: 0, action: 'pause' },
                { tick: 1, seq: 1, action: 'light_attack' },
                { tick: 1, seq: 0, action: 'move', phase: 'press', direction: { x: 1, y: 0 } },
            ],
        };
        const n = normalizeDirectInputLog(raw);
        assert.equal(n.ok, true);
        if (n.ok) {
            assert.deepEqual(
                n.log.events.map(e => [e.tick, e.seq, e.action]),
                [
                    [1, 0, 'move'],
                    [1, 1, 'light_attack'],
                    [2, 0, 'pause'],
                ],
            );
        }
    });

    test('direction quantization to 1/1000', () => {
        assert.equal(quantizeScalar(0.123456), 0.123);
        assert.equal(quantizeScalar(0.1235), 0.124);
        const d = quantizeDirection(0.3333333, -0.6666666);
        assert.equal(d.x, 0.333);
        assert.equal(d.y, -0.667);
        const n = normalizeDirectInputLog({
            schemaVersion: DIRECT_INPUT_SCHEMA_VERSION,
            events: [{ tick: 0, seq: 0, action: 'move', phase: 'press', direction: { x: 0.1234567, y: 0.9876543 } }],
        });
        assert.equal(n.ok, true);
        if (n.ok) {
            assert.deepEqual(n.log.events[0].direction, { x: 0.123, y: 0.988 });
        }
    });

    test('rejects invalid action, negative tick, duplicate seq, non-finite', () => {
        assert.equal(
            normalizeDirectInputLog({
                schemaVersion: DIRECT_INPUT_SCHEMA_VERSION,
                events: [{ tick: 0, seq: 0, action: 'teleport' }],
            }).ok,
            false,
        );
        assert.equal(
            normalizeDirectInputLog({
                schemaVersion: DIRECT_INPUT_SCHEMA_VERSION,
                events: [{ tick: -1, seq: 0, action: 'pause' }],
            }).ok,
            false,
        );
        const dup = normalizeDirectInputLog({
            schemaVersion: DIRECT_INPUT_SCHEMA_VERSION,
            events: [
                { tick: 1, seq: 0, action: 'pause' },
                { tick: 1, seq: 0, action: 'dodge' },
            ],
        });
        assert.equal(dup.ok, false);
        if (!dup.ok) assert.equal(dup.error, 'DUPLICATE_SEQ');

        const nonFinite = normalizeDirectInputLog({
            schemaVersion: DIRECT_INPUT_SCHEMA_VERSION,
            events: [{ tick: 0, seq: 0, action: 'move', direction: { x: Number.NaN, y: 0 } }],
        });
        assert.equal(nonFinite.ok, false);
        if (!nonFinite.ok) assert.equal(nonFinite.error, 'NON_FINITE');
    });

    test('JSON round trip is stable', () => {
        const raw = {
            schemaVersion: DIRECT_INPUT_SCHEMA_VERSION,
            events: [
                {
                    tick: 3,
                    seq: 1,
                    action: 'use_ability',
                    abilityId: 'blink',
                    targetId: 'enemy_1',
                },
                {
                    tick: 3,
                    seq: 0,
                    action: 'companion_order',
                    order: 'heal_priority',
                },
                {
                    tick: 4,
                    seq: 0,
                    action: 'mode_transition',
                    requestedMode: 'mechanics_gambit',
                },
                {
                    tick: 0,
                    seq: 0,
                    action: 'move',
                    phase: 'press',
                    direction: { x: 0.5, y: 0.5 },
                },
            ],
        };
        const first = normalizeDirectInputLog(raw);
        assert.equal(first.ok, true);
        if (!first.ok) return;
        const bytes1 = serializeDirectInputLog(first.log);
        const second = parseDirectInputLogJson(bytes1);
        assert.equal(second.ok, true);
        if (!second.ok) return;
        const bytes2 = serializeDirectInputLog(second.log);
        assert.equal(bytes1, bytes2);
        assert.equal(directInputLogIsStable(raw), true);
    });

    test('normalize twice yields byte-identical serialization', () => {
        const raw = {
            schemaVersion: DIRECT_INPUT_SCHEMA_VERSION,
            events: [
                { tick: 5, seq: 2, action: 'guard', phase: 'release' },
                { tick: 5, seq: 0, action: 'guard', phase: 'press' },
                { tick: 1, seq: 0, action: 'dodge', direction: { x: 0.1, y: 0.2 } },
            ],
        };
        const a = normalizeDirectInputLog(raw);
        const b = normalizeDirectInputLog(a.ok ? a.log : raw);
        assert.equal(a.ok && b.ok, true);
        if (a.ok && b.ok) {
            assert.equal(serializeDirectInputLog(a.log), serializeDirectInputLog(b.log));
        }
    });

    test('empty log is valid and serializes stably', () => {
        const empty = emptyDirectInputLog();
        assert.equal(empty.schemaVersion, DIRECT_INPUT_SCHEMA_VERSION);
        assert.deepEqual(empty.events, []);
        const n = normalizeDirectInputLog(empty);
        assert.equal(n.ok, true);
        if (n.ok) {
            assert.equal(serializeDirectInputLog(n.log), '{"schemaVersion":"combat-direct-input-v1","events":[]}');
        }
        assert.equal(normalizeDirectInputLog(undefined).ok, true);
    });
});

// ---------------------------------------------------------------------------
// Empty replay foundation
// ---------------------------------------------------------------------------

const minimalSpec = (): BattleSpec => ({
    activePreset: 'foundation',
    deltaSeconds: 1,
    viewport: { width: 1280, height: 720 },
    participantOrder: ['ally', 'enemy'],
    initialState: {
        units: {
            allies: [{
                name: 'ally', role: 'Frontline', max_hp: 100, attack: 10, defense: 0,
                heal_power: 0, move_speed: 0, attack_range: 999, attack_cooldown: 1,
                radius: 1, pos_x: 0, pos_y: 0,
            }],
            enemies: [{
                name: 'enemy', role: 'Frontline', max_hp: 100, attack: 10, defense: 0,
                heal_power: 0, move_speed: 0, attack_range: 999, attack_cooldown: 1,
                radius: 1, pos_x: 50, pos_y: 0,
            }],
        },
    },
});

describe('Empty direct replay foundation', () => {
    test('empty log does not change combat state vs bare resolve', () => {
        const spec = minimalSpec();
        assert.equal(
            emptyLogMatchesBareResolve(spec, 'legacy_gambit', { directRuntimeAvailable: false }),
            true,
        );
        assert.equal(
            emptyLogMatchesBareResolve(spec, 'mechanics_gambit', { directRuntimeAvailable: false }),
            true,
        );
        assert.equal(
            emptyLogMatchesBareResolve(spec, 'direct_action', { directRuntimeAvailable: true }),
            true,
        );
    });

    test('direct unavailable safely falls back to existing mechanics combat', () => {
        const spec = minimalSpec();
        const result = runDirectReplayFoundation({
            spec,
            requestedMode: 'direct_action',
            capabilities: { directRuntimeAvailable: false },
            directInput: emptyDirectInputLog(),
        });
        assert.equal(result.ok, true);
        if (!result.ok) return;
        assert.equal(result.mode.resolvedMode, 'mechanics_gambit');
        assert.equal(result.mode.fallbackReason, 'direct_runtime_unavailable');
        assert.equal(result.runtimeMode, 'mechanics_v1');

        const bareMechanics = resolveCombat({ ...spec, combatMode: 'mechanics_v1' });
        assert.deepEqual(result.resolution, bareMechanics);
    });

    test('empty log run is deterministic across two calls', () => {
        const spec = minimalSpec();
        const a = runDirectReplayFoundation({
            spec,
            requestedMode: 'direct_action',
            capabilities: { directRuntimeAvailable: true },
            directInput: emptyDirectInputLog(),
        });
        const b = runDirectReplayFoundation({
            spec,
            requestedMode: 'direct_action',
            capabilities: { directRuntimeAvailable: true },
            directInput: emptyDirectInputLog(),
        });
        assert.equal(a.ok && b.ok, true);
        if (a.ok && b.ok) {
            assert.deepEqual(a.resolution, b.resolution);
            assert.equal(a.inputLogBytes, b.inputLogBytes);
            assert.deepEqual(a.modeJson, b.modeJson);
        }
    });

    test('CombatResolution shape is unchanged (legacy fields present)', () => {
        const result = runDirectReplayFoundation({
            spec: minimalSpec(),
            requestedMode: 'legacy_gambit',
            capabilities: { directRuntimeAvailable: false },
        });
        assert.equal(result.ok, true);
        if (!result.ok) return;
        const r = result.resolution;
        assert.ok(Array.isArray(r.evaluations));
        assert.ok(Array.isArray(r.decisions));
        assert.ok(Array.isArray(r.attacks));
        assert.ok(Array.isArray(r.heals));
        assert.ok(Array.isArray(r.deaths));
        assert.ok(Array.isArray(r.focusChanges));
        assert.ok(r.finalState && Array.isArray(r.finalState.units));
        assert.equal(typeof r.outcome, 'string');
    });
});

// ---------------------------------------------------------------------------
// Golden Master 8/8 + mechanics isolation (must remain green)
// ---------------------------------------------------------------------------

describe('Foundation does not disturb legacy Golden Master / mechanics', () => {
    test('legacy Golden Master fixtures still match 8/8', () => {
        const fixturesDir = path.join(__dirname, '../test/fixtures/combat');
        const files = fs.readdirSync(fixturesDir).filter(f => f.endsWith('.json') && f.startsWith('fixture_'));
        assert.equal(files.length, 8, `expected 8 golden fixtures, found ${files.length}`);

        for (const file of files) {
            const data = JSON.parse(fs.readFileSync(path.join(fixturesDir, file), 'utf8'));
            const spec: BattleSpec = {
                activePreset: data.activePreset,
                deltaSeconds: data.deltaSeconds || (1.0 / 60.0),
                fixedFps: data.fixedFps,
                viewport: data.viewport || { width: 1280, height: 720 },
                participantOrder: data.participantOrder,
                initialState: data.initialState,
            } as BattleSpec;
            const expected = data.expected;
            const actual = resolveCombat(spec);

            assert.deepEqual(actual.evaluations, expected.evaluations, `${file} evaluations`);
            assert.deepEqual(actual.decisions, expected.decisions, `${file} decisions`);
            assert.deepEqual(actual.attacks, expected.attacks, `${file} attacks`);
            assert.deepEqual(actual.heals, expected.heals, `${file} heals`);
            assert.deepEqual(actual.deaths, expected.deaths, `${file} deaths`);
            assert.deepEqual(actual.focusChanges, expected.focusChanges, `${file} focusChanges`);
            assert.equal(actual.outcome, expected.outcome, `${file} outcome`);

            const actualUnits = actual.finalState.units;
            const expectedUnits = expected.finalState.units;
            assert.equal(actualUnits.length, expectedUnits.length);
            for (let i = 0; i < actualUnits.length; i++) {
                assert.equal(actualUnits[i].name, expectedUnits[i].name);
                assert.equal(actualUnits[i].hp, expectedUnits[i].hp);
                const epsilon = 0.005;
                assert.ok(Math.abs(actualUnits[i].pos_x - expectedUnits[i].pos_x) < epsilon);
                assert.ok(Math.abs(actualUnits[i].pos_y - expectedUnits[i].pos_y) < epsilon);
            }
        }
    });

    test('legacy path still free of mechanics receipts', () => {
        const legacy = resolveCombat(minimalSpec());
        assert.equal(legacy.mechanicsReceipts, undefined);
    });
});
