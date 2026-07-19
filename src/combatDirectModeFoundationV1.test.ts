/**
 * COMBAT-DIRECT-MODE-FOUNDATION-V1 + review remediation tests.
 */

import * as assert from "node:assert/strict";
import * as fs from "fs";
import * as path from "path";
import { describe, test } from "node:test";
import {
    COMBAT_SELECTABLE_MODES,
    combatModeAllowsDirectControl,
    combatModeAllowsTacticalOrder,
    combatModeResolutionToJson,
    isCombatSelectableMode,
    resolveCombatMode,
    toRuntimeCombatMode,
} from "./combatModeContract";
import {
    DIRECT_INPUT_DEFAULT_TICK_RATE,
    DIRECT_INPUT_SCHEMA_VERSION,
    directInputLogIsStable,
    emptyDirectInputLog,
    normalizeDirectInputLog,
    parseDirectInputLogJson,
    quantizeDirection,
    quantizeScalar,
    serializeDirectInputLog,
} from "./combatDirectInputCore";
import {
    emptyLogMatchesBareResolve,
    runDirectReplayFoundation,
} from "./combatDirectReplayFoundation";
import { BattleSpec, resolveCombat } from "./gambitCombatCore";

const TR = DIRECT_INPUT_DEFAULT_TICK_RATE;
const ACTOR = "ally";

function event(over: Record<string, unknown>) {
    return { actorId: ACTOR, ...over };
}

describe("Combat mode contract (foundation V1)", () => {
    test("accepts all six selectable modes including command and spectator", () => {
        assert.deepEqual([...COMBAT_SELECTABLE_MODES], [
            "narrative",
            "legacy_gambit",
            "mechanics_gambit",
            "direct_action",
            "command",
            "spectator",
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

    test("rejects unknown modes including legacy command_spectator alias", () => {
        for (const bad of ["mechanics_v1", "command_spectator", "direct", "", 42, null, undefined, {}]) {
            const result = resolveCombatMode(bad, { directRuntimeAvailable: true });
            assert.equal(result.ok, false);
        }
    });

    test("direct available keeps direct_action", () => {
        const result = resolveCombatMode("direct_action", { directRuntimeAvailable: true });
        assert.equal(result.ok, true);
        if (result.ok) {
            assert.equal(result.resolution.resolvedMode, "direct_action");
            assert.equal(result.resolution.fallbackReason, null);
        }
    });

    test("direct unavailable falls back to mechanics_gambit", () => {
        const result = resolveCombatMode("direct_action", { directRuntimeAvailable: false });
        assert.equal(result.ok, true);
        if (result.ok) {
            assert.equal(result.resolution.resolvedMode, "mechanics_gambit");
            assert.equal(result.resolution.fallbackReason, "direct_runtime_unavailable");
        }
    });

    test("fallback reason is stable and JSON-safe", () => {
        const a = resolveCombatMode("direct_action", { directRuntimeAvailable: false });
        const b = resolveCombatMode("direct_action", { directRuntimeAvailable: false });
        assert.equal(a.ok && b.ok, true);
        if (a.ok && b.ok) {
            assert.deepEqual(combatModeResolutionToJson(a.resolution), combatModeResolutionToJson(b.resolution));
        }
    });

    test("non-direct modes never fall back when capability is false", () => {
        for (const mode of ["narrative", "legacy_gambit", "mechanics_gambit", "command", "spectator"] as const) {
            const result = resolveCombatMode(mode, { directRuntimeAvailable: false });
            assert.equal(result.ok, true);
            if (result.ok) {
                assert.equal(result.resolution.resolvedMode, mode);
                assert.equal(result.resolution.fallbackReason, null);
            }
        }
    });

    test("runtime mapping and input rights", () => {
        assert.equal(toRuntimeCombatMode("legacy_gambit"), "legacy_gambit");
        assert.equal(toRuntimeCombatMode("mechanics_gambit"), "mechanics_v1");
        assert.equal(toRuntimeCombatMode("direct_action"), "mechanics_v1");
        assert.equal(toRuntimeCombatMode("command"), "mechanics_v1");
        assert.equal(toRuntimeCombatMode("spectator"), "mechanics_v1");
        assert.equal(toRuntimeCombatMode("narrative"), null);
        assert.equal(combatModeAllowsDirectControl("direct_action"), true);
        assert.equal(combatModeAllowsDirectControl("command"), false);
        assert.equal(combatModeAllowsDirectControl("spectator"), false);
        assert.equal(combatModeAllowsTacticalOrder("command"), true);
        assert.equal(combatModeAllowsTacticalOrder("spectator"), false);
    });
});

describe("Direct input log schema (foundation V1)", () => {
    test("order normalization sorts by (tick, seq)", () => {
        const raw = {
            schemaVersion: DIRECT_INPUT_SCHEMA_VERSION,
            tickRate: TR,
            events: [
                event({ tick: 2, seq: 0, action: "pause" }),
                event({ tick: 1, seq: 1, action: "light_attack" }),
                event({ tick: 1, seq: 0, action: "move", phase: "press", direction: { x: 1, y: 0 } }),
            ],
        };
        const n = normalizeDirectInputLog(raw);
        assert.equal(n.ok, true);
        if (n.ok) {
            assert.deepEqual(
                n.log.events.map(e => [e.tick, e.seq, e.action, e.actorId]),
                [
                    [1, 0, "move", ACTOR],
                    [1, 1, "light_attack", ACTOR],
                    [2, 0, "pause", ACTOR],
                ],
            );
        }
    });

    test("tickRate is required, preserved, and rejected when invalid", () => {
        const ok = normalizeDirectInputLog({
            schemaVersion: DIRECT_INPUT_SCHEMA_VERSION,
            tickRate: 30,
            events: [],
        });
        assert.equal(ok.ok, true);
        if (ok.ok) {
            assert.equal(ok.log.tickRate, 30);
            const bytes = serializeDirectInputLog(ok.log);
            assert.ok(bytes.includes("\"tickRate\":30"));
            const round = parseDirectInputLogJson(bytes);
            assert.equal(round.ok, true);
            if (round.ok) assert.equal(round.log.tickRate, 30);
        }
        assert.equal(normalizeDirectInputLog({
            schemaVersion: DIRECT_INPUT_SCHEMA_VERSION,
            events: [],
        }).ok, false);
        assert.equal(normalizeDirectInputLog({
            schemaVersion: DIRECT_INPUT_SCHEMA_VERSION,
            tickRate: 0,
            events: [],
        }).ok, false);
        assert.equal(normalizeDirectInputLog({
            schemaVersion: DIRECT_INPUT_SCHEMA_VERSION,
            tickRate: 1.5,
            events: [],
        }).ok, false);
    });

    test("actorId is required and preserved", () => {
        const n = normalizeDirectInputLog({
            schemaVersion: DIRECT_INPUT_SCHEMA_VERSION,
            tickRate: TR,
            events: [event({ tick: 0, seq: 0, action: "pause" })],
        });
        assert.equal(n.ok, true);
        if (n.ok) {
            assert.equal(n.log.events[0].actorId, ACTOR);
            const again = normalizeDirectInputLog(JSON.parse(serializeDirectInputLog(n.log)));
            assert.equal(again.ok, true);
            if (again.ok) assert.equal(again.log.events[0].actorId, ACTOR);
        }
        assert.equal(normalizeDirectInputLog({
            schemaVersion: DIRECT_INPUT_SCHEMA_VERSION,
            tickRate: TR,
            events: [{ tick: 0, seq: 0, action: "pause" }],
        }).ok, false);
        assert.equal(normalizeDirectInputLog({
            schemaVersion: DIRECT_INPUT_SCHEMA_VERSION,
            tickRate: TR,
            events: [{ tick: 0, seq: 0, action: "pause", actorId: "" }],
        }).ok, false);
    });

    test("mode_switch accepted; mode_transition rejected", () => {
        const ok = normalizeDirectInputLog({
            schemaVersion: DIRECT_INPUT_SCHEMA_VERSION,
            tickRate: TR,
            events: [event({ tick: 0, seq: 0, action: "mode_switch", requestedMode: "mechanics_gambit" })],
        });
        assert.equal(ok.ok, true);
        const bad = normalizeDirectInputLog({
            schemaVersion: DIRECT_INPUT_SCHEMA_VERSION,
            tickRate: TR,
            events: [event({ tick: 0, seq: 0, action: "mode_transition", requestedMode: "mechanics_gambit" })],
        });
        assert.equal(bad.ok, false);
        if (!bad.ok) assert.equal(bad.error, "INVALID_ACTION");
    });

    test("direction quantization to 1/1000", () => {
        assert.equal(quantizeScalar(0.123456), 0.123);
        const d = quantizeDirection(0.3333333, -0.6666666);
        assert.equal(d.x, 0.333);
        assert.equal(d.y, -0.667);
    });

    test("rejects invalid action, negative tick, duplicate seq, non-finite", () => {
        assert.equal(normalizeDirectInputLog({
            schemaVersion: DIRECT_INPUT_SCHEMA_VERSION,
            tickRate: TR,
            events: [event({ tick: 0, seq: 0, action: "teleport" })],
        }).ok, false);
        assert.equal(normalizeDirectInputLog({
            schemaVersion: DIRECT_INPUT_SCHEMA_VERSION,
            tickRate: TR,
            events: [event({ tick: -1, seq: 0, action: "pause" })],
        }).ok, false);
        const dup = normalizeDirectInputLog({
            schemaVersion: DIRECT_INPUT_SCHEMA_VERSION,
            tickRate: TR,
            events: [
                event({ tick: 1, seq: 0, action: "pause" }),
                event({ tick: 1, seq: 0, action: "dodge" }),
            ],
        });
        assert.equal(dup.ok, false);
        if (!dup.ok) assert.equal(dup.error, "DUPLICATE_SEQ");
        assert.equal(normalizeDirectInputLog({
            schemaVersion: DIRECT_INPUT_SCHEMA_VERSION,
            tickRate: TR,
            events: [event({ tick: 0, seq: 0, action: "move", direction: { x: Number.NaN, y: 0 } })],
        }).ok, false);
    });

    test("JSON round trip is stable", () => {
        const raw = {
            schemaVersion: DIRECT_INPUT_SCHEMA_VERSION,
            tickRate: TR,
            events: [
                event({ tick: 3, seq: 1, action: "use_ability", abilityId: "blink", targetId: "enemy_1" }),
                event({ tick: 3, seq: 0, action: "companion_order", order: "heal_priority" }),
                event({ tick: 4, seq: 0, action: "mode_switch", requestedMode: "mechanics_gambit" }),
                event({ tick: 0, seq: 0, action: "move", phase: "press", direction: { x: 0.5, y: 0.5 } }),
            ],
        };
        const first = normalizeDirectInputLog(raw);
        assert.equal(first.ok, true);
        if (!first.ok) return;
        const bytes1 = serializeDirectInputLog(first.log);
        const second = parseDirectInputLogJson(bytes1);
        assert.equal(second.ok, true);
        if (!second.ok) return;
        assert.equal(bytes1, serializeDirectInputLog(second.log));
        assert.equal(directInputLogIsStable(raw), true);
    });

    test("empty log is valid and serializes stably with tickRate", () => {
        const empty = emptyDirectInputLog();
        assert.equal(empty.schemaVersion, DIRECT_INPUT_SCHEMA_VERSION);
        assert.equal(empty.tickRate, DIRECT_INPUT_DEFAULT_TICK_RATE);
        assert.deepEqual(empty.events, []);
        const n = normalizeDirectInputLog(empty);
        assert.equal(n.ok, true);
        if (n.ok) {
            assert.equal(
                serializeDirectInputLog(n.log),
                `{"schemaVersion":"combat-direct-input-v1","tickRate":${DIRECT_INPUT_DEFAULT_TICK_RATE},"events":[]}`,
            );
        }
    });
});

const minimalSpec = (): BattleSpec => ({
    activePreset: "foundation",
    deltaSeconds: 1,
    viewport: { width: 1280, height: 720 },
    participantOrder: ["ally", "enemy"],
    initialState: {
        units: {
            allies: [{
                name: "ally", role: "Frontline", max_hp: 100, attack: 10, defense: 0,
                heal_power: 0, move_speed: 0, attack_range: 999, attack_cooldown: 1,
                radius: 1, pos_x: 0, pos_y: 0,
            }],
            enemies: [{
                name: "enemy", role: "Frontline", max_hp: 100, attack: 10, defense: 0,
                heal_power: 0, move_speed: 0, attack_range: 999, attack_cooldown: 1,
                radius: 1, pos_x: 50, pos_y: 0,
            }],
        },
    },
});

describe("Empty direct replay foundation", () => {
    test("empty log does not change combat state vs bare resolve", () => {
        const spec = minimalSpec();
        assert.equal(emptyLogMatchesBareResolve(spec, "legacy_gambit", { directRuntimeAvailable: false }), true);
        assert.equal(emptyLogMatchesBareResolve(spec, "mechanics_gambit", { directRuntimeAvailable: false }), true);
        assert.equal(emptyLogMatchesBareResolve(spec, "direct_action", { directRuntimeAvailable: true }), true);
        assert.equal(emptyLogMatchesBareResolve(spec, "command", { directRuntimeAvailable: false }), true);
        assert.equal(emptyLogMatchesBareResolve(spec, "spectator", { directRuntimeAvailable: false }), true);
    });

    test("direct unavailable safely falls back to existing mechanics combat", () => {
        const spec = minimalSpec();
        const result = runDirectReplayFoundation({
            spec,
            requestedMode: "direct_action",
            capabilities: { directRuntimeAvailable: false },
            directInput: emptyDirectInputLog(),
        });
        assert.equal(result.ok, true);
        if (!result.ok) return;
        assert.equal(result.mode.resolvedMode, "mechanics_gambit");
        assert.equal(result.runtimeMode, "mechanics_v1");
        const bareMechanics = resolveCombat({ ...spec, combatMode: "mechanics_v1" });
        assert.deepEqual(result.resolution, bareMechanics);
    });

    test("empty log run is deterministic across two calls", () => {
        const spec = minimalSpec();
        const a = runDirectReplayFoundation({
            spec, requestedMode: "direct_action",
            capabilities: { directRuntimeAvailable: true },
            directInput: emptyDirectInputLog(),
        });
        const b = runDirectReplayFoundation({
            spec, requestedMode: "direct_action",
            capabilities: { directRuntimeAvailable: true },
            directInput: emptyDirectInputLog(),
        });
        assert.equal(a.ok && b.ok, true);
        if (a.ok && b.ok) {
            assert.deepEqual(a.resolution, b.resolution);
            assert.equal(a.inputLogBytes, b.inputLogBytes);
        }
    });

    test("CombatResolution shape is unchanged (legacy fields present)", () => {
        const result = runDirectReplayFoundation({
            spec: minimalSpec(),
            requestedMode: "legacy_gambit",
            capabilities: { directRuntimeAvailable: false },
        });
        assert.equal(result.ok, true);
        if (!result.ok) return;
        const r = result.resolution;
        assert.ok(Array.isArray(r.evaluations));
        assert.ok(Array.isArray(r.attacks));
        assert.ok(r.finalState && Array.isArray(r.finalState.units));
        assert.equal(typeof r.outcome, "string");
    });
});

describe("Foundation does not disturb legacy Golden Master / mechanics", () => {
    test("legacy Golden Master fixtures still match 8/8", () => {
        const fixturesDir = path.join(__dirname, "../test/fixtures/combat");
        const files = fs.readdirSync(fixturesDir).filter(f => f.endsWith(".json") && f.startsWith("fixture_"));
        assert.equal(files.length, 8);
        for (const file of files) {
            const data = JSON.parse(fs.readFileSync(path.join(fixturesDir, file), "utf8"));
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
            assert.deepEqual(actual.evaluations, expected.evaluations, file);
            assert.deepEqual(actual.decisions, expected.decisions, file);
            assert.deepEqual(actual.attacks, expected.attacks, file);
            assert.deepEqual(actual.heals, expected.heals, file);
            assert.deepEqual(actual.deaths, expected.deaths, file);
            assert.deepEqual(actual.focusChanges, expected.focusChanges, file);
            assert.equal(actual.outcome, expected.outcome, file);
            for (let i = 0; i < expected.finalState.units.length; i++) {
                assert.equal(actual.finalState.units[i].hp, expected.finalState.units[i].hp);
                assert.ok(Math.abs(actual.finalState.units[i].pos_x - expected.finalState.units[i].pos_x) < 0.005);
                assert.ok(Math.abs(actual.finalState.units[i].pos_y - expected.finalState.units[i].pos_y) < 0.005);
            }
        }
    });

    test("legacy path still free of mechanics receipts", () => {
        const legacy = resolveCombat(minimalSpec());
        assert.equal(legacy.mechanicsReceipts, undefined);
    });
});
