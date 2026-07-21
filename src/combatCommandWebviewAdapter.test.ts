import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as vm from 'node:vm';
import { describe, test } from 'node:test';

type PointerHelper = (
    ui: { selection: string[]; pendingOrder: string | null },
    target: { id: string; team: number; dead?: boolean } | null,
    point: { x: number; y: number },
) => Record<string, unknown> | null;

type ResetHelper = (state: Record<string, unknown>, clearPlaytest?: boolean) => void;
type ScenarioHelper = (state: Record<string, unknown>, scenarioId: string) => Record<string, unknown> | null;

function loadWebviewHelpers(): { translate: PointerHelper; reset: ResetHelper; selectScenario: ScenarioHelper; clearedTimers: unknown[] } {
    const source = fs.readFileSync(path.join(__dirname, '../webview/modules/89f-combat-lab.js'), 'utf8');
    const clearedTimers: unknown[] = [];
    const context: Record<string, unknown> = {
        window: { addEventListener() { /* registration only */ } },
        document: { addEventListener() { /* registration only */ } },
        navigator: {},
        vscode: { postMessage() { /* registration only */ } },
        setInterval() { return 1; },
        clearInterval(value: unknown) { clearedTimers.push(value); },
    };
    vm.runInNewContext(`${source}\nglobalThis.__combatHooks = { combatCommandMessageForPointer, resetCombatCommandPlaytestUi, selectCombatLabScenarioForPlaytest };`, context);
    const hooks = context.__combatHooks as {
        combatCommandMessageForPointer: PointerHelper;
        resetCombatCommandPlaytestUi: ResetHelper;
        selectCombatLabScenarioForPlaytest: ScenarioHelper;
    };
    return {
        translate: hooks.combatCommandMessageForPointer,
        reset: hooks.resetCombatCommandPlaytestUi,
        selectScenario: hooks.selectCombatLabScenarioForPlaytest,
        clearedTimers,
    };
}

function transportValue(value: Record<string, unknown> | null): Record<string, unknown> | null {
    return value === null ? null : JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
}

describe('Combat Lab command pointer translation', () => {
    const { translate, reset, selectScenario, clearedTimers } = loadWebviewHelpers();

    test('ground right-click translates to move_to for the current selection', () => {
        const message = translate({ selection: ['ally_2', 'ally_1'], pendingOrder: null }, null, { x: 12.5, y: -8 });
        assert.deepEqual(transportValue(message), {
            type: 'issueCombatCommand', unitIds: ['ally_2', 'ally_1'], command: 'move_to', point: { x: 12.5, y: -8 },
        });
    });

    test('enemy right-click translates to attack_target', () => {
        const message = translate(
            { selection: ['ally_1'], pendingOrder: null },
            { id: 'enemy_3', team: 1 },
            { x: 80, y: 24 },
        );
        assert.deepEqual(transportValue(message), {
            type: 'issueCombatCommand', unitIds: ['ally_1'], command: 'attack_target', targetId: 'enemy_3',
        });
    });

    test('pending attack-move plus a ground target translates to attack_move', () => {
        const message = translate(
            { selection: ['ally_3', 'ally_1'], pendingOrder: 'attack_move' },
            null,
            { x: 100, y: 50 },
        );
        assert.deepEqual(transportValue(message), {
            type: 'issueCombatCommand', unitIds: ['ally_3', 'ally_1'], command: 'attack_move', point: { x: 100, y: 50 },
        });
    });

    test('restart and scenario invalidation synchronously stop the old timer and clear transient UI state', () => {
        const state: Record<string, unknown> = {
            timer: 17,
            running: true,
            selection: ['ally_1'],
            pendingOrder: 'attack_move',
            error: 'old error',
            playtest: { scenarioId: 'old' },
            playtestMode: 'command',
        };
        const restartMessage = selectScenario(state, 'new');
        assert.deepEqual(clearedTimers, [17]);
        assert.deepEqual(JSON.parse(JSON.stringify(state)), {
            timer: null,
            running: false,
            selection: [],
            pendingOrder: null,
            error: '',
            playtest: null,
            playtestMode: 'command',
            selected: 'new',
        });
        assert.deepEqual(transportValue(restartMessage), {
            type: 'startCombatCommandPlaytest',
            scenarioId: 'new',
            mode: 'command',
        });

        const restartState: Record<string, unknown> = {
            timer: 18,
            running: true,
            selection: ['ally_2'],
            pendingOrder: null,
            error: '',
            playtest: { scenarioId: 'new' },
        };
        reset(restartState);
        assert.deepEqual(clearedTimers, [17, 18]);
    });
});
