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

type BindHelper = (root: { querySelector: (sel: string) => { onclick?: () => void; onchange?: (e: unknown) => void } | null; querySelectorAll: (sel: string) => Array<unknown> }) => void;

function loadWebviewHelpers(): {
    translate: PointerHelper;
    reset: ResetHelper;
    selectScenario: ScenarioHelper;
    bind: BindHelper;
    clearedTimers: unknown[];
    dispatchMessage: (data: unknown) => void;
    state: Record<string, unknown>;
} {
    const source = fs.readFileSync(path.join(__dirname, '../webview/modules/89f-combat-lab.js'), 'utf8');
    const clearedTimers: unknown[] = [];
    const messageListeners: Array<(event: { data: unknown }) => void> = [];
    const context: Record<string, unknown> = {
        window: {
            addEventListener(type: string, fn: (event: { data: unknown }) => void) {
                if (type === 'message') messageListeners.push(fn);
            },
        },
        document: {
            addEventListener() { /* registration only */ },
            createElement() {
                return {
                    set textContent(_value: string) { /* escape helper */ },
                    get innerHTML() { return ''; },
                };
            },
        },
        navigator: {},
        vscode: { postMessage() { /* registration only */ } },
        setInterval() { return 1; },
        clearInterval(value: unknown) { clearedTimers.push(value); },
    };
    vm.runInNewContext(
        `${source}\nglobalThis.__combatHooks = { combatCommandMessageForPointer, resetCombatCommandPlaytestUi, selectCombatLabScenarioForPlaytest, bindCombatCommandPlaytest, lab: window.LR_combatLab };`,
        context,
    );
    const hooks = context.__combatHooks as {
        combatCommandMessageForPointer: PointerHelper;
        resetCombatCommandPlaytestUi: ResetHelper;
        selectCombatLabScenarioForPlaytest: ScenarioHelper;
        bindCombatCommandPlaytest: BindHelper;
        lab: Record<string, unknown>;
    };
    // Stub render so message handlers that call renderCombatLab do not need the DOM.
    vm.runInNewContext('function renderCombatLab() {}', context);
    return {
        translate: hooks.combatCommandMessageForPointer,
        reset: hooks.resetCombatCommandPlaytestUi,
        selectScenario: hooks.selectCombatLabScenarioForPlaytest,
        bind: hooks.bindCombatCommandPlaytest,
        clearedTimers,
        dispatchMessage(data: unknown) {
            for (const listener of messageListeners) listener({ data });
        },
        state: hooks.lab,
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
            pendingStart: true,
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

    test('host null playtest state (document change) stops the timer and clears the UI battle', () => {
        const live = loadWebviewHelpers();
        Object.assign(live.state, {
            timer: 42,
            running: true,
            selection: ['ally_1'],
            pendingOrder: 'attack_move',
            playtest: { scenarioId: 'stale' },
            error: 'previous',
        });
        live.dispatchMessage({ type: 'combatCommandPlaytestState', state: null });
        assert.ok(live.clearedTimers.includes(42), `timer not cleared, saw ${JSON.stringify(live.clearedTimers)}`);
        assert.equal(live.state.timer, null);
        assert.equal(live.state.running, false);
        assert.equal(live.state.playtest, null);
        assert.equal((live.state.selection as string[]).length, 0);
        assert.equal(live.state.pendingOrder, null);
        assert.equal(live.state.error, '');
    });

    test('first Run click sets running to true when no playtest exists', () => {
        const live = loadWebviewHelpers();
        live.state.playtest = null;
        live.state.running = false;

        const elements: Record<string, { onclick?: () => void; onchange?: (e: unknown) => void }> = {};
        const mockRoot = {
            querySelector(sel: string) {
                if (!elements[sel]) elements[sel] = {};
                return elements[sel];
            },
            querySelectorAll() { return []; },
        };

        live.bind(mockRoot);
        assert.equal(typeof elements['[data-lab="playtest-run"]']?.onclick, 'function');
        elements['[data-lab="playtest-run"]'].onclick?.();

        assert.equal(live.state.running, true, 'state.running should be true on first Run click');
    });

    test('scenario change during pending start request re-issues start and ignores stale host response', () => {
        const live = loadWebviewHelpers();
        live.state.selected = 'scenarioA';
        live.state.playtest = null;
        live.state.pendingStart = true;

        const startMsg = live.selectScenario(live.state, 'scenarioB');
        assert.deepEqual(transportValue(startMsg), {
            type: 'startCombatCommandPlaytest',
            scenarioId: 'scenarioB',
            mode: 'command',
        });
        assert.equal(live.state.pendingStart, true);
        assert.equal(live.state.selected, 'scenarioB');

        live.dispatchMessage({
            type: 'combatCommandPlaytestState',
            state: { scenarioId: 'scenarioA', tick: 0, units: [] },
        });
        assert.equal(live.state.playtest, null);

        live.dispatchMessage({
            type: 'combatCommandPlaytestState',
            state: { scenarioId: 'scenarioB', tick: 0, units: [] },
        });
        assert.deepEqual(live.state.playtest, { scenarioId: 'scenarioB', tick: 0, units: [] });
        assert.equal(live.state.pendingStart, false);
    });

    test('failed initial Run clears pendingStart and running', () => {
        const live = loadWebviewHelpers();
        live.state.selected = 'scenarioA';
        live.state.playtest = null;
        live.state.running = true;
        live.state.pendingStart = true;

        live.dispatchMessage({
            type: 'combatCommandPlaytestError',
            error: 'INVALID_COMBAT_LAB_SCENARIO',
            operation: 'start',
            scenarioId: 'scenarioA',
        });

        assert.equal(live.state.pendingStart, false);
        assert.equal(live.state.running, false);
        assert.equal(live.state.playtest, null);
        assert.equal(live.state.error, 'INVALID_COMBAT_LAB_SCENARIO');
    });

    test('failed Start/restart returns to a clean paused/no-session state', () => {
        const live = loadWebviewHelpers();
        live.state.selected = 'scenarioA';
        live.state.playtest = null;
        live.state.running = false;
        live.state.pendingStart = true;

        live.dispatchMessage({
            type: 'combatCommandPlaytestError',
            error: 'INVALID_COMBAT_LAB_SCENARIO',
            operation: 'start',
            scenarioId: 'scenarioA',
        });

        assert.equal(live.state.pendingStart, false);
        assert.equal(live.state.running, false);
        assert.equal(live.state.playtest, null);
        assert.equal(live.state.error, 'INVALID_COMBAT_LAB_SCENARIO');
    });

    test('stale start error for the old scenario is ignored', () => {
        const live = loadWebviewHelpers();
        live.state.selected = 'scenarioA';
        live.state.pendingStart = true;

        live.selectScenario(live.state, 'scenarioB');
        assert.equal(live.state.selected, 'scenarioB');
        assert.equal(live.state.pendingStart, true);

        live.dispatchMessage({
            type: 'combatCommandPlaytestError',
            error: 'INVALID_COMBAT_LAB_SCENARIO',
            operation: 'start',
            scenarioId: 'scenarioA',
        });

        assert.equal(live.state.selected, 'scenarioB');
        assert.equal(live.state.pendingStart, true);
        assert.equal(live.state.error, '');
    });

    test('issue/step errors do not stop a valid live session', () => {
        const live = loadWebviewHelpers();
        live.state.selected = 'scenarioA';
        live.state.playtest = { scenarioId: 'scenarioA', tick: 10, units: [] };
        live.state.running = true;
        live.state.pendingStart = false;

        live.dispatchMessage({
            type: 'combatCommandPlaytestError',
            error: 'INVALID_UNIT_SELECTION',
            operation: 'issue',
        });

        assert.equal(live.state.running, true);
        assert.deepEqual(live.state.playtest, { scenarioId: 'scenarioA', tick: 10, units: [] });
        assert.equal(live.state.error, 'INVALID_UNIT_SELECTION');
    });

    test('successful matching state still clears pendingStart normally', () => {
        const live = loadWebviewHelpers();
        live.state.selected = 'scenarioA';
        live.state.pendingStart = true;

        live.dispatchMessage({
            type: 'combatCommandPlaytestState',
            state: { scenarioId: 'scenarioA', tick: 0, units: [] },
        });

        assert.equal(live.state.pendingStart, false);
        assert.deepEqual(live.state.playtest, { scenarioId: 'scenarioA', tick: 0, units: [] });
    });

    test('re-opened webview restores scenario selection from host active playtest state', () => {
        const live = loadWebviewHelpers();
        live.state.selected = 'scenarioA';
        live.state.playtest = null;
        live.state.pendingStart = false;

        live.dispatchMessage({
            type: 'combatCommandPlaytestState',
            state: { scenarioId: 'scenarioB', tick: 12, units: [] },
        });

        assert.equal(live.state.selected, 'scenarioB', 'selected scenario should restore to host session scenarioId');
        assert.deepEqual(live.state.playtest, { scenarioId: 'scenarioB', tick: 12, units: [] });
    });
});
