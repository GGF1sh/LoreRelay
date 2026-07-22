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
    renderPlaytest: (state: Record<string, unknown>) => string;
    clearedTimers: unknown[];
    posted: unknown[];
    intervalCreates: number;
    dispatchMessage: (data: unknown) => void;
    state: Record<string, unknown>;
} {
    const source = fs.readFileSync(path.join(__dirname, '../webview/modules/89f-combat-lab.js'), 'utf8');
    const clearedTimers: unknown[] = [];
    const posted: unknown[] = [];
    let intervalCreates = 0;
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
                let content = '';
                return {
                    set textContent(value: string) { content = value; },
                    get innerHTML() { return content; },
                };
            },
        },
        navigator: {},
        vscode: {
            postMessage(message: unknown) {
                posted.push(message);
            },
        },
        setInterval() {
            intervalCreates += 1;
            return 1;
        },
        clearInterval(value: unknown) { clearedTimers.push(value); },
    };
    vm.runInNewContext(
        `${source}\nglobalThis.__combatHooks = { combatCommandMessageForPointer, resetCombatCommandPlaytestUi, selectCombatLabScenarioForPlaytest, bindCombatCommandPlaytest, renderCombatCommandPlaytest, lab: window.LR_combatLab };`,
        context,
    );
    const hooks = context.__combatHooks as {
        combatCommandMessageForPointer: PointerHelper;
        resetCombatCommandPlaytestUi: ResetHelper;
        selectCombatLabScenarioForPlaytest: ScenarioHelper;
        bindCombatCommandPlaytest: BindHelper;
        renderCombatCommandPlaytest: (state: Record<string, unknown>) => string;
        lab: Record<string, unknown>;
    };
    // Stub render so message handlers that call renderCombatLab do not need the DOM.
    vm.runInNewContext('function renderCombatLab() {}', context);
    return {
        translate: hooks.combatCommandMessageForPointer,
        reset: hooks.resetCombatCommandPlaytestUi,
        selectScenario: hooks.selectCombatLabScenarioForPlaytest,
        bind: hooks.bindCombatCommandPlaytest,
        renderPlaytest: hooks.renderCombatCommandPlaytest,
        clearedTimers,
        posted,
        get intervalCreates() { return intervalCreates; },
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
        state.instanceId = 'ns_test';
        const restartMessage = selectScenario(state, 'new');
        assert.deepEqual(clearedTimers, [17]);
        assert.deepEqual(JSON.parse(JSON.stringify(state)), {
            timer: null,
            running: false,
            selection: [],
            pendingOrder: null,
            error: '',
            pendingStart: true,
            pendingStartId: 'ns_test:1',
            activeStartId: null,
            startEpoch: 1,
            instanceId: 'ns_test',
            playtest: null,
            playtestMode: 'command',
            selected: 'new',
            eligibleForHostRestore: false,
        });
        assert.deepEqual(transportValue(restartMessage), {
            type: 'startCombatCommandPlaytest',
            scenarioId: 'new',
            mode: 'command',
            startId: 'ns_test:1',
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

    test('Run/Pause posts host-owned setCombatCommandPlaytestRunning and never schedules webview step timers', () => {
        const live = loadWebviewHelpers();
        live.state.playtest = {
            scenarioId: 'scenarioA',
            mode: 'command',
            tick: 3,
            running: false,
            units: [],
            startId: 'ns_test:9',
        };
        live.state.activeStartId = 'ns_test:9';
        live.state.running = false;
        live.state.selection = [];
        const elements: Record<string, { onclick?: () => void }> = {};
        live.bind({
            querySelector(sel: string) {
                if (!elements[sel]) elements[sel] = {};
                return elements[sel];
            },
            querySelectorAll() { return []; },
        });
        elements['[data-lab="playtest-run"]'].onclick?.();
        assert.equal(live.state.running, true);
        assert.deepEqual(
            transportValue(live.posted[live.posted.length - 1] as Record<string, unknown>),
            {
                type: 'setCombatCommandPlaytestRunning',
                running: true,
                startId: 'ns_test:9',
            },
        );
        assert.equal(live.state.timer, null);
        assert.equal(live.intervalCreates, 0);
        assert.ok(!live.posted.some(message =>
            !!message && typeof message === 'object' && (message as { type?: string }).type === 'stepCombatCommandPlaytest'));
    });

    test('host snapshot running flag restores reopened subscriber UI state', () => {
        const live = loadWebviewHelpers();
        live.state.playtest = null;
        live.state.pendingStart = false;
        live.state.eligibleForHostRestore = true;
        live.state.running = false;
        live.dispatchMessage({
            type: 'combatCommandPlaytestState',
            state: {
                scenarioId: 'scenarioB',
                tick: 12,
                running: true,
                units: [],
                startId: 'old-ns:5',
            },
        });
        assert.equal(live.state.running, true);
        assert.equal((live.state.playtest as { tick: number }).tick, 12);
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
        live.state.instanceId = 'ns_test';
        live.state.selected = 'scenarioA';
        live.state.playtest = null;
        live.state.pendingStart = true;

        const startMsg = live.selectScenario(live.state, 'scenarioB');
        assert.deepEqual(transportValue(startMsg), {
            type: 'startCombatCommandPlaytest',
            scenarioId: 'scenarioB',
            mode: 'command',
            startId: 'ns_test:1',
        });
        assert.equal(live.state.pendingStart, true);
        assert.equal(live.state.selected, 'scenarioB');

        live.dispatchMessage({
            type: 'combatCommandPlaytestState',
            state: { scenarioId: 'scenarioA', tick: 0, units: [], startId: 'ns_test:0' },
        });
        assert.equal(live.state.playtest, null);

        live.dispatchMessage({
            type: 'combatCommandPlaytestState',
            state: { scenarioId: 'scenarioB', tick: 0, units: [], startId: 'ns_test:1' },
        });
        assert.deepEqual(live.state.playtest, { scenarioId: 'scenarioB', tick: 0, units: [], startId: 'ns_test:1' });
        assert.equal(live.state.pendingStart, false);
    });

    test('failed initial Run clears pendingStart and running when startId matches', () => {
        const live = loadWebviewHelpers();
        live.state.selected = 'scenarioA';
        live.state.playtest = null;
        live.state.running = true;
        live.state.pendingStart = true;
        live.state.pendingStartId = 'ns_test:1';

        live.dispatchMessage({
            type: 'combatCommandPlaytestError',
            error: 'INVALID_COMBAT_LAB_SCENARIO',
            operation: 'start',
            scenarioId: 'scenarioA',
            startId: 'ns_test:1',
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
        live.state.pendingStartId = 'ns_test:1';

        live.dispatchMessage({
            type: 'combatCommandPlaytestError',
            error: 'INVALID_COMBAT_LAB_SCENARIO',
            operation: 'start',
            scenarioId: 'scenarioA',
            startId: 'ns_test:1',
        });

        assert.equal(live.state.pendingStart, false);
        assert.equal(live.state.running, false);
        assert.equal(live.state.playtest, null);
        assert.equal(live.state.error, 'INVALID_COMBAT_LAB_SCENARIO');
    });

    test('stale start error for the old scenario is ignored', () => {
        const live = loadWebviewHelpers();
        live.state.instanceId = 'ns_test';
        live.state.selected = 'scenarioA';
        live.state.pendingStart = true;

        live.selectScenario(live.state, 'scenarioB');
        assert.equal(live.state.selected, 'scenarioB');
        assert.equal(live.state.pendingStart, true);
        assert.equal(live.state.pendingStartId, 'ns_test:1');

        live.dispatchMessage({
            type: 'combatCommandPlaytestError',
            error: 'INVALID_COMBAT_LAB_SCENARIO',
            operation: 'start',
            scenarioId: 'scenarioA',
            startId: 'ns_test:0',
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
        live.state.pendingStartId = 'ns_test:1';

        live.dispatchMessage({
            type: 'combatCommandPlaytestState',
            state: { scenarioId: 'scenarioA', tick: 0, units: [], startId: 'ns_test:1' },
        });

        assert.equal(live.state.pendingStart, false);
        assert.deepEqual(live.state.playtest, { scenarioId: 'scenarioA', tick: 0, units: [], startId: 'ns_test:1' });
    });

    test('re-opened webview restores scenario selection from host active playtest state and consumes eligibility', () => {
        const live = loadWebviewHelpers();
        live.state.selected = 'scenarioA';
        live.state.playtest = null;
        live.state.pendingStart = false;
        live.state.eligibleForHostRestore = true;

        live.dispatchMessage({
            type: 'combatCommandPlaytestState',
            state: { scenarioId: 'scenarioB', tick: 12, units: [], startId: 'old-ns:5' },
        });

        assert.equal(live.state.selected, 'scenarioB', 'selected scenario should restore to host session scenarioId');
        assert.equal(live.state.activeStartId, 'old-ns:5', 'activeStartId should restore from host snapshot');
        assert.deepEqual(live.state.playtest, { scenarioId: 'scenarioB', tick: 12, units: [], startId: 'old-ns:5' });
        assert.equal(live.state.eligibleForHostRestore, false, 'eligibility is consumed by a successful restore');
    });

    test('user changes the dropdown before the host snapshot; selection is preserved, new start message is sent, and mismatched snapshot is ignored', () => {
        const live = loadWebviewHelpers();
        live.state.selected = 'scenarioA';
        live.state.eligibleForHostRestore = true;

        const restartMsg = live.selectScenario(live.state, 'scenarioC');
        assert.equal(live.state.eligibleForHostRestore, false, 'user action clears eligibility');
        assert.equal(live.state.selected, 'scenarioC');
        assert.equal(live.state.pendingStart, true);
        assert.deepEqual(transportValue(restartMsg), {
            type: 'startCombatCommandPlaytest',
            scenarioId: 'scenarioC',
            mode: 'command',
            startId: live.state.pendingStartId,
        });

        live.dispatchMessage({
            type: 'combatCommandPlaytestState',
            state: { scenarioId: 'scenarioB', tick: 12, units: [] },
        });

        assert.equal(live.state.selected, 'scenarioC', 'user intentional selection is preserved');
        assert.equal(live.state.playtest, null, 'mismatched snapshot is ignored');
    });

    test('user presses Start or Run before an old host snapshot; it cannot override the new request', () => {
        const live = loadWebviewHelpers();
        live.state.selected = 'scenarioA';
        live.state.eligibleForHostRestore = true;

        const elements: Record<string, { onclick?: () => void; onchange?: (e: unknown) => void }> = {};
        live.bind({ querySelector(sel: string) { if (!elements[sel]) elements[sel] = {}; return elements[sel]; }, querySelectorAll() { return []; } });

        elements['[data-lab="playtest-start"]'].onclick?.();
        assert.equal(live.state.eligibleForHostRestore, false, 'user action clears eligibility');
        assert.equal(live.state.pendingStart, true);

        live.dispatchMessage({
            type: 'combatCommandPlaytestState',
            state: { scenarioId: 'scenarioB', tick: 12, units: [] },
        });

        assert.equal(live.state.selected, 'scenarioA', 'new request scenario is preserved');
        assert.equal(live.state.playtest, null, 'mismatched snapshot is ignored');
    });

    test('state:null consumes the one-time restore opportunity', () => {
        const live = loadWebviewHelpers();
        live.state.selected = 'scenarioA';
        live.state.eligibleForHostRestore = true;

        live.dispatchMessage({
            type: 'combatCommandPlaytestState',
            state: null,
        });

        assert.equal(live.state.eligibleForHostRestore, false);

        live.dispatchMessage({
            type: 'combatCommandPlaytestState',
            state: { scenarioId: 'scenarioB', tick: 12, units: [] },
        });

        assert.equal(live.state.selected, 'scenarioA', 'later host snapshot cannot restore');
        assert.equal(live.state.playtest, null, 'mismatched snapshot is ignored');
    });

    test('later unrelated host snapshots cannot restore after eligibility is cleared', () => {
        const live = loadWebviewHelpers();
        live.state.selected = 'scenarioA';
        live.state.eligibleForHostRestore = false;

        live.dispatchMessage({
            type: 'combatCommandPlaytestState',
            state: { scenarioId: 'scenarioB', tick: 12, units: [] },
        });

        assert.equal(live.state.selected, 'scenarioA', 'later host snapshot cannot restore');
        assert.equal(live.state.playtest, null, 'mismatched snapshot is ignored');
    });

    test('new webview request uses collision-resistant startId namespace, rejecting snapshot from old webview namespace', () => {
        const live = loadWebviewHelpers();
        live.state.instanceId = 'namespace-new';
        live.state.selected = 'scenarioA';
        live.state.eligibleForHostRestore = true;

        const elements: Record<string, { onclick?: () => void; onchange?: (e: unknown) => void }> = {};
        live.bind({ querySelector(sel: string) { if (!elements[sel]) elements[sel] = {}; return elements[sel]; }, querySelectorAll() { return []; } });

        elements['[data-lab="playtest-run"]'].onclick?.();
        assert.equal(live.state.pendingStartId, 'namespace-new:1');

        // Old host session snapshot from previous panel namespace-old:1 arrives
        live.dispatchMessage({
            type: 'combatCommandPlaytestState',
            state: { scenarioId: 'scenarioA', tick: 50, outcome: 'Victory', units: [], startId: 'namespace-old:1' },
        });

        assert.equal(live.state.pendingStart, true);
        assert.equal(live.state.playtest, null);

        // Matching snapshot for namespace-new:1 arrives
        live.dispatchMessage({
            type: 'combatCommandPlaytestState',
            state: { scenarioId: 'scenarioA', tick: 0, units: [], startId: 'namespace-new:1' },
        });

        assert.equal(live.state.pendingStart, false);
        assert.equal(live.state.activeStartId, 'namespace-new:1');
        assert.deepEqual(live.state.playtest, { scenarioId: 'scenarioA', tick: 0, units: [], startId: 'namespace-new:1' });
    });

    test('pending start request rejects a snapshot with missing startId', () => {
        const live = loadWebviewHelpers();
        live.state.instanceId = 'ns1';
        live.state.selected = 'scenarioA';
        live.state.pendingStart = true;
        live.state.pendingStartId = 'ns1:1';

        live.dispatchMessage({
            type: 'combatCommandPlaytestState',
            state: { scenarioId: 'scenarioA', tick: 10, units: [] }, // missing startId
        });

        assert.equal(live.state.pendingStart, true);
        assert.equal(live.state.playtest, null);
    });

    test('active session rejects later missing or mismatched startId snapshot', () => {
        const live = loadWebviewHelpers();
        live.state.selected = 'scenarioA';
        live.state.activeStartId = 'ns1:1';
        live.state.playtest = { scenarioId: 'scenarioA', tick: 5, units: [], startId: 'ns1:1' };

        // Missing startId snapshot rejected
        live.dispatchMessage({
            type: 'combatCommandPlaytestState',
            state: { scenarioId: 'scenarioA', tick: 10, units: [] },
        });
        assert.equal((live.state.playtest as Record<string, unknown>).tick, 5);

        // Mismatched startId snapshot rejected
        live.dispatchMessage({
            type: 'combatCommandPlaytestState',
            state: { scenarioId: 'scenarioA', tick: 10, units: [], startId: 'ns2:1' },
        });
        assert.equal((live.state.playtest as Record<string, unknown>).tick, 5);

        // Matching startId snapshot accepted
        live.dispatchMessage({
            type: 'combatCommandPlaytestState',
            state: { scenarioId: 'scenarioA', tick: 10, units: [], startId: 'ns1:1' },
        });
        assert.equal((live.state.playtest as Record<string, unknown>).tick, 10);
    });

    test('step click is ignored when playtest is null', () => {
        const live = loadWebviewHelpers();
        live.state.playtest = null;
        live.state.eligibleForHostRestore = true;

        const elements: Record<string, { onclick?: () => void }> = {};
        live.bind({ querySelector(sel: string) { if (!elements[sel]) elements[sel] = {}; return elements[sel]; }, querySelectorAll() { return []; } });

        assert.equal(typeof elements['[data-lab="playtest-step"]']?.onclick, 'function');
        elements['[data-lab="playtest-step"]'].onclick?.();
        assert.equal(live.state.playtest, null);
    });

    test('renders always-visible numeric hp/maxHp and HP bar width for units', () => {
        const live = loadWebviewHelpers();
        live.state.playtest = {
            units: [
                { id: 'ally_1', team: 0, x: 0, y: 0, hp: 80, maxHp: 100, dead: false },
                { id: 'enemy_1', team: 1, x: 50, y: 50, hp: 20, maxHp: 50, dead: false },
            ],
            bounds: { minX: -100, maxX: 100, minY: -100, maxY: 100 },
        };

        const html = live.renderPlaytest(live.state);
        assert.ok(html.includes('data-lab="unit-hp"'), 'contains unit-hp element');
        assert.ok(html.includes('80/100'), 'renders 80/100 for ally_1');
        assert.ok(html.includes('20/50'), 'renders 20/50 for enemy_1');
        assert.ok(html.includes('width:80%'), 'renders 80% bar fill for ally_1');
        assert.ok(html.includes('width:40%'), 'renders 40% bar fill for enemy_1');
    });

    test('clamps HP percentage safely between 0% and 100%', () => {
        const live = loadWebviewHelpers();
        live.state.playtest = {
            units: [
                { id: 'ally_1', team: 0, x: 0, y: 0, hp: 150, maxHp: 100, dead: false },
                { id: 'enemy_1', team: 1, x: 50, y: 50, hp: -20, maxHp: 50, dead: false },
            ],
            bounds: { minX: -100, maxX: 100, minY: -100, maxY: 100 },
        };

        const html = live.renderPlaytest(live.state);
        assert.ok(html.includes('100/100'), 'clamps upper hp to maxHp');
        assert.ok(html.includes('0/50'), 'clamps negative hp to 0');
        assert.ok(html.includes('width:100%'), 'clamps upper percentage to 100%');
        assert.ok(html.includes('width:0%'), 'clamps negative percentage to 0%');
    });

    test('dead units visibly render as dead with 0 HP and disabled attribute', () => {
        const live = loadWebviewHelpers();
        live.state.playtest = {
            units: [
                { id: 'ally_1', team: 0, x: 10, y: 20, hp: 0, maxHp: 100, dead: true },
            ],
            bounds: { minX: -100, maxX: 100, minY: -100, maxY: 100 },
        };

        const html = live.renderPlaytest(live.state);
        assert.ok(html.includes('disabled'), 'dead unit button is disabled');
        assert.ok(html.includes('0/100'), 'dead unit displays 0/maxHp');
        assert.ok(html.includes('width:0%'), 'dead unit HP bar width is 0%');
        assert.ok(html.includes('grayscale(100%)'), 'dead unit has grayscale dead visual styling');
        assert.ok(html.includes('data-unit-id="ally_1"'), 'data-unit-id attribute intact');
        assert.ok(html.includes('data-unit-team="0"'), 'data-unit-team attribute intact');
    });
});
