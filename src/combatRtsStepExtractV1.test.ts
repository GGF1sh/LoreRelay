/**
 * COMBAT-RTS-STEP-EXTRACT-001 focused tests.
 *
 * The tick body now lives in `stepCombat` and `resolveCombat` is a loop over it.
 * The golden master proves the extraction preserved behaviour; these tests pin
 * the properties the RTS command spine will depend on:
 *   - driving the loop by hand reproduces `resolveCombat` exactly,
 *   - `stepCombat` never mutates the state it is handed,
 *   - the state is JSON-safe, so a battle can be paused and resumed.
 *
 * See docs/COMBAT_RTS_COMMAND_SPINE_DESIGN.md.
 */

import * as assert from 'node:assert/strict';
import * as fs from 'fs';
import * as path from 'path';
import { describe, test } from 'node:test';
import {
    BattleSpec, CombatExpectedOutput, CombatState, CombatStepEvents,
    combatTerminalOutcome, createCombatState, createCombatStepContext, resolveCombat, stepCombat,
} from './gambitCombatCore';

const fixturesDir = path.join(__dirname, '../test/fixtures/combat');

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

const fixtureFiles = fs.readdirSync(fixturesDir).filter(f => f.startsWith('fixture_') && f.endsWith('.json')).sort();

/** Reimplements what `resolveCombat` does, using only the exported step API. */
function runByHand(spec: BattleSpec): CombatExpectedOutput {
    const ctx = createCombatStepContext(spec);
    let state = createCombatState(spec);
    const acc: CombatStepEvents = {
        evaluations: [], decisions: [], attacks: [], heals: [], deaths: [], focusChanges: [], mechanicsReceipts: [], commandReceipts: [],
    };

    while (state.tick <= ctx.timeoutTicks) {
        const terminal = combatTerminalOutcome(state, ctx);
        if (terminal) { state = { ...state, outcome: terminal }; break; }
        const stepped = stepCombat(state, ctx);
        state = stepped.state;
        for (const key of Object.keys(acc) as Array<keyof CombatStepEvents>) {
            (acc[key] as unknown[]).push(...(stepped.events[key] as unknown[]));
        }
    }

    let outcome = state.outcome;
    if (state.tick > ctx.timeoutTicks && outcome === '') outcome = 'Timeout';

    const output: CombatExpectedOutput = {
        evaluations: acc.evaluations, decisions: acc.decisions, attacks: acc.attacks,
        heals: acc.heals, deaths: acc.deaths, focusChanges: acc.focusChanges,
        finalState: {
            units: ctx.participantOrder.map(name => {
                const u = state.units[name];
                return { name: u.name, hp: u.hp, pos_x: u.pos_x, pos_y: u.pos_y };
            }),
        },
        outcome,
    };
    if (ctx.combatMode === 'mechanics_v1') output.mechanicsReceipts = acc.mechanicsReceipts;
    if (ctx.commandLog.events.length > 0) output.commandReceipts = acc.commandReceipts;
    return output;
}

describe('RTS step extraction — the loop is now caller-owned', () => {
    for (const file of fixtureFiles) {
        test(`stepping ${file} by hand matches resolveCombat byte for byte`, () => {
            const spec = fixtureSpec(file);
            assert.equal(JSON.stringify(runByHand(spec)), JSON.stringify(resolveCombat(spec)));
        });
    }

    test('resolveCombat is still reproducible across calls', () => {
        const spec = fixtureSpec(fixtureFiles[0]);
        assert.equal(JSON.stringify(resolveCombat(spec)), JSON.stringify(resolveCombat(spec)));
    });
});

describe('RTS step extraction — purity', () => {
    const spec = fixtureSpec(fixtureFiles[0]);

    test('stepCombat does not mutate the state it is given', () => {
        const ctx = createCombatStepContext(spec);
        const state = createCombatState(spec);
        const before = JSON.stringify(state);
        for (let i = 0; i < 30; i++) stepCombat(state, ctx);
        assert.equal(JSON.stringify(state), before, 'the input state was mutated');
    });

    test('stepping the same state twice yields the same result', () => {
        const ctx = createCombatStepContext(spec);
        let state = createCombatState(spec);
        for (let i = 0; i < 10; i++) state = stepCombat(state, ctx).state;
        const a = stepCombat(state, ctx);
        const b = stepCombat(state, ctx);
        assert.equal(JSON.stringify(a.state), JSON.stringify(b.state));
        assert.equal(JSON.stringify(a.events), JSON.stringify(b.events));
    });

    test('each step advances exactly one tick', () => {
        const ctx = createCombatStepContext(spec);
        let state = createCombatState(spec);
        assert.equal(state.tick, 0);
        for (let expected = 1; expected <= 20; expected++) {
            state = stepCombat(state, ctx).state;
            assert.equal(state.tick, expected);
        }
    });

    test('state survives a JSON round trip, so a battle can be paused and resumed', () => {
        const ctx = createCombatStepContext(spec);
        let state = createCombatState(spec);
        for (let i = 0; i < 25; i++) state = stepCombat(state, ctx).state;

        const revived = JSON.parse(JSON.stringify(state)) as CombatState;
        const fromLive = stepCombat(state, ctx);
        const fromRevived = stepCombat(revived, ctx);
        assert.equal(JSON.stringify(fromRevived.state), JSON.stringify(fromLive.state));
        assert.equal(JSON.stringify(fromRevived.events), JSON.stringify(fromLive.events));
    });
});

describe('RTS step extraction — terminal check', () => {
    test('an unfinished battle reports no outcome', () => {
        const spec = fixtureSpec(fixtureFiles[0]);
        const ctx = createCombatStepContext(spec);
        assert.equal(combatTerminalOutcome(createCombatState(spec), ctx), '');
    });

    test('the terminal check is what ends the run, and it matches the reported outcome', () => {
        for (const file of fixtureFiles) {
            const spec = fixtureSpec(file);
            const ctx = createCombatStepContext(spec);
            let state = createCombatState(spec);
            let terminal = '';
            while (state.tick <= ctx.timeoutTicks) {
                terminal = combatTerminalOutcome(state, ctx);
                if (terminal) break;
                state = stepCombat(state, ctx).state;
            }
            const expected = resolveCombat(spec).outcome;
            assert.equal(terminal || 'Timeout', expected, `${file}: terminal outcome mismatch`);
        }
    });
});
