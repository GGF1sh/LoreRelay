import * as fs from 'fs';
import * as path from 'path';
import { describe, test } from 'node:test';
import * as assert from 'node:assert/strict';
import { resolveCombat, BattleSpec } from './gambitCombatCore';

describe('Gambit Combat Core - Parity with Godot Golden Master', () => {
    const fixturesDir = path.join(__dirname, '../test/fixtures/combat');
    const files = fs.readdirSync(fixturesDir).filter(f => f.endsWith('.json') && f.startsWith('fixture_'));

    for (const file of files) {
        test(`matches ${file}`, () => {
            const content = fs.readFileSync(path.join(fixturesDir, file), 'utf8');
            const data = JSON.parse(content);

            const spec: BattleSpec = {
                activePreset: data.activePreset,
                deltaSeconds: data.deltaSeconds || (1.0 / 60.0),
                fixedFps: data.fixedFps,
                viewport: data.viewport || { width: 1280, height: 720 },
                participantOrder: data.participantOrder,
                initialState: data.initialState,
            } as any;

            const expected = data.expected;
            const actual = resolveCombat(spec);

            // Compare tick-by-tick arrays
            assert.deepEqual(actual.evaluations, expected.evaluations, 'evaluations mismatch');
            assert.deepEqual(actual.decisions, expected.decisions, 'decisions mismatch');
            assert.deepEqual(actual.attacks, expected.attacks, 'attacks mismatch');
            assert.deepEqual(actual.heals, expected.heals, 'heals mismatch');
            assert.deepEqual(actual.deaths, expected.deaths, 'deaths mismatch');
            assert.deepEqual(actual.focusChanges, expected.focusChanges, 'focusChanges mismatch');

            const actualUnits = actual.finalState.units;
            const expectedUnits = expected.finalState.units;

            assert.equal(actualUnits.length, expectedUnits.length, 'final state units count mismatch');
            for (let i = 0; i < actualUnits.length; i++) {
                const aU = actualUnits[i];
                const eU = expectedUnits[i];
                assert.equal(aU.name, eU.name, `unit name mismatch at ${i}`);
                assert.equal(aU.hp, eU.hp, `unit hp mismatch for ${aU.name}`);
                
                // Allow a small float epsilon difference because JS vs Godot
                const epsilon = 0.005;
                assert.ok(Math.abs(aU.pos_x - eU.pos_x) < epsilon, `unit pos_x mismatch for ${aU.name}. Expected ${eU.pos_x}, got ${aU.pos_x}`);
                assert.ok(Math.abs(aU.pos_y - eU.pos_y) < epsilon, `unit pos_y mismatch for ${aU.name}. Expected ${eU.pos_y}, got ${aU.pos_y}`);
            }

            assert.equal(actual.outcome, expected.outcome, 'outcome mismatch');
        });
    }
});
