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

// Real T() (00-core.js) resolves keys against the loaded locale bundle; this module
// is evaluated standalone in these tests, so back it with the actual en.json strings
// (rather than an identity stub) so assertions can keep checking real button text.
const enLocale = JSON.parse(fs.readFileSync(path.join(__dirname, '../locales/en.json'), 'utf8')) as Record<string, string>;
const testT = (key: string): string => enLocale[key] ?? key;

type BindHelper = (root: { querySelector: (sel: string) => { onclick?: () => void; onchange?: (e: unknown) => void } | null; querySelectorAll: (sel: string) => Array<unknown> }) => void;

type DomNode = {
    id?: string;
    className?: string;
    tagName: string;
    type?: string;
    disabled?: boolean;
    title?: string;
    textContent: string;
    innerHTML: string;
    style: { cssText: string; display?: string; left?: string; top?: string; width?: string; height?: string; filter?: string; background?: string };
    dataset: Record<string, string>;
    attributes: Record<string, string>;
    children: DomNode[];
    parent: DomNode | null;
    onclick?: ((event?: unknown) => void) | null;
    onchange?: ((event?: unknown) => void) | null;
    oncontextmenu?: ((event?: unknown) => void) | null;
    onpointerdown?: ((event?: unknown) => void) | null;
    onpointermove?: ((event?: unknown) => void) | null;
    onpointerup?: ((event?: unknown) => void) | null;
    onmouseover?: ((event?: unknown) => void) | null;
    onmouseout?: ((event?: unknown) => void) | null;
    value?: string;
    append: (...nodes: DomNode[]) => void;
    appendChild: (node: DomNode) => DomNode;
    remove: () => void;
    setAttribute: (name: string, value: string) => void;
    getAttribute: (name: string) => string | null;
    querySelector: (sel: string) => DomNode | null;
    querySelectorAll: (sel: string) => DomNode[];
    contains: (node: DomNode | null | undefined) => boolean;
    closest: (sel: string) => DomNode | null;
    getBoundingClientRect: () => { left: number; top: number; right: number; bottom: number; width: number; height: number };
    setPointerCapture?: (id: number) => void;
    releasePointerCapture?: (id: number) => void;
    scrollIntoView?: (options?: unknown) => void;
};

function createMinimalDom() {
    const nodesById = new Map<string, DomNode>();
    const scrollIntoViewCalls: DomNode[] = [];

    function matches(node: DomNode, sel: string): boolean {
        if (sel.startsWith('[data-lab="') && sel.endsWith('"]')) {
            return node.dataset.lab === sel.slice('[data-lab="'.length, -2);
        }
        if (sel.startsWith('[data-unit-id="') && sel.endsWith('"]')) {
            return node.dataset.unitId === sel.slice('[data-unit-id="'.length, -2);
        }
        if (sel === '[data-unit-id]') return Boolean(node.dataset.unitId);
        if (sel === '[data-unit-id][data-unit-team="0"]:not(:disabled)') {
            return node.dataset.unitId != null && node.dataset.unitTeam === '0' && !node.disabled;
        }
        if (sel === '#pane-status') return node.id === 'pane-status';
        if (sel === '#combat-lab-panel') return node.id === 'combat-lab-panel';
        if (sel.startsWith('#')) return node.id === sel.slice(1);
        return false;
    }

    function walk(node: DomNode, visit: (n: DomNode) => void): void {
        visit(node);
        for (const child of node.children) walk(child, visit);
    }

    function createNode(tagName: string): DomNode {
        const node = {
            tagName: tagName.toUpperCase(),
            textContent: '',
            innerHTML: '',
            style: { cssText: '' },
            dataset: {} as Record<string, string>,
            attributes: {} as Record<string, string>,
            children: [] as DomNode[],
            parent: null as DomNode | null,
            append(...kids: DomNode[]) {
                for (const kid of kids) node.appendChild(kid);
            },
            appendChild(child: DomNode) {
                if (child.parent) child.remove();
                child.parent = node as DomNode;
                node.children.push(child);
                return child;
            },
            remove() {
                if (!node.parent) return;
                node.parent.children = node.parent.children.filter(c => c !== node);
                node.parent = null;
            },
            setAttribute(name: string, value: string) {
                node.attributes[name] = value;
                if (name === 'aria-pressed') node.attributes['aria-pressed'] = value;
                if (name.startsWith('data-')) {
                    const key = name.slice(5).replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
                    node.dataset[key] = value;
                }
            },
            getAttribute(name: string) {
                if (name.startsWith('data-')) {
                    const key = name.slice(5).replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
                    return node.dataset[key] ?? node.attributes[name] ?? null;
                }
                return node.attributes[name] ?? null;
            },
            querySelector(sel: string) {
                let found: DomNode | null = null;
                walk(node as DomNode, n => {
                    if (!found && n !== node && matches(n, sel)) found = n;
                });
                return found;
            },
            querySelectorAll(sel: string) {
                const out: DomNode[] = [];
                walk(node as DomNode, n => {
                    if (n !== node && matches(n, sel)) out.push(n);
                });
                return out;
            },
            contains(other: DomNode | null | undefined) {
                if (!other) return false;
                if (other === node) return true;
                let cur: DomNode | null = other;
                while (cur) {
                    if (cur === node) return true;
                    cur = cur.parent;
                }
                return false;
            },
            closest(sel: string) {
                let cur: DomNode | null = node as DomNode;
                while (cur) {
                    if (matches(cur, sel)) return cur;
                    cur = cur.parent;
                }
                return null;
            },
            getBoundingClientRect() {
                return { left: 0, top: 0, right: 400, bottom: 340, width: 400, height: 340 };
            },
            setPointerCapture() { /* no-op */ },
            releasePointerCapture() { /* no-op */ },
            scrollIntoView() { scrollIntoViewCalls.push(node as DomNode); },
        } as DomNode;
        let currentId = '';
        Object.defineProperty(node, 'id', {
            configurable: true,
            enumerable: true,
            get() { return currentId; },
            set(value: string) {
                if (currentId) nodesById.delete(currentId);
                currentId = String(value || '');
                if (currentId) nodesById.set(currentId, node);
            },
        });
        return node;
    }

    function parseAttributes(attrText: string, node: DomNode): void {
        const attrRe = /([:@A-Za-z0-9_-]+)(?:="([^"]*)")?/g;
        let match: RegExpExecArray | null;
        while ((match = attrRe.exec(attrText)) !== null) {
            const name = match[1];
            const value = match[2] ?? '';
            if (name === 'disabled') {
                node.disabled = true;
                continue;
            }
            if (name === 'type') {
                node.type = value;
                continue;
            }
            if (name === 'title') {
                node.title = value;
                continue;
            }
            if (name === 'style') {
                node.style.cssText = value;
                continue;
            }
            if (name === 'class') {
                node.className = value;
                continue;
            }
            if (name === 'id') {
                node.id = value;
                nodesById.set(value, node);
                continue;
            }
            if (name === 'value') {
                node.value = value;
                continue;
            }
            node.setAttribute(name, value);
        }
    }

    function parseHtml(html: string, parent: DomNode): void {
        const tokenRe = /<!--[\s\S]*?-->|<([A-Za-z0-9-]+)([^>]*)\/>|<([A-Za-z0-9-]+)([^>]*)>|<\/([A-Za-z0-9-]+)>|([^<]+)/g;
        const stack: DomNode[] = [parent];
        let match: RegExpExecArray | null;
        while ((match = tokenRe.exec(html)) !== null) {
            if (match[1]) {
                const node = createNode(match[1]);
                parseAttributes(match[2] || '', node);
                stack[stack.length - 1].appendChild(node);
                continue;
            }
            if (match[5]) {
                if (stack.length > 1) stack.pop();
                continue;
            }
            if (match[3]) {
                const tag = match[3];
                const attrs = match[4] || '';
                const selfClosing = /\/\s*$/.test(attrs) || ['hr', 'br', 'img', 'input'].includes(tag.toLowerCase());
                const node = createNode(tag);
                parseAttributes(attrs.replace(/\/\s*$/, ''), node);
                stack[stack.length - 1].appendChild(node);
                if (!selfClosing) stack.push(node);
                continue;
            }
            if (match[6] != null) {
                const text = match[6];
                if (!text.trim() && text.includes('\n')) continue;
                const top = stack[stack.length - 1];
                top.textContent += text;
            }
        }
    }

    const documentElement = createNode('document');
    const pane = createNode('div');
    pane.id = 'pane-status';
    nodesById.set('pane-status', pane);
    documentElement.appendChild(pane);

    const document = {
        addEventListener() { /* registration only */ },
        getElementById(id: string) {
            return nodesById.get(id) ?? null;
        },
        querySelector(sel: string) {
            if (sel.startsWith('#')) return nodesById.get(sel.slice(1)) ?? null;
            return documentElement.querySelector(sel);
        },
        createElement(tag: string) {
            const node = createNode(tag);
            let textValue = '';
            let htmlValue: string | null = null;
            Object.defineProperty(node, 'textContent', {
                configurable: true,
                enumerable: true,
                get() {
                    if (node.children.length) {
                        return node.children.map(child => child.textContent).join('');
                    }
                    return textValue;
                },
                set(value: string) {
                    textValue = String(value ?? '');
                    htmlValue = null;
                    for (const child of [...node.children]) child.remove();
                },
            });
            // When production code assigns root.innerHTML, parse into children.
            // Reading innerHTML after textContent assignment supports labEsc().
            Object.defineProperty(node, 'innerHTML', {
                configurable: true,
                enumerable: true,
                get() {
                    if (htmlValue != null) return htmlValue;
                    return textValue
                        .replace(/&/g, '&amp;')
                        .replace(/</g, '&lt;')
                        .replace(/>/g, '&gt;')
                        .replace(/"/g, '&quot;');
                },
                set(value: string) {
                    htmlValue = String(value);
                    textValue = '';
                    for (const child of [...node.children]) child.remove();
                    parseHtml(String(value), node);
                },
            });
            return node;
        },
    };

    return { document, nodesById, createNode, pane, scrollIntoViewCalls };
}

function loadWebviewHelpers(): {
    translate: PointerHelper;
    reset: ResetHelper;
    selectScenario: ScenarioHelper;
    bind: BindHelper;
    renderPlaytest: (state: Record<string, unknown>) => string;
    updateView: (state?: Record<string, unknown>) => boolean;
    canUpdateInPlace: () => boolean;
    clearedTimers: unknown[];
    posted: unknown[];
    intervalCreates: number;
    renderCount: number;
    dispatchMessage: (data: unknown) => void;
    state: Record<string, unknown>;
} {
    const source = fs.readFileSync(path.join(__dirname, '../webview/modules/89f-combat-lab.js'), 'utf8');
    const clearedTimers: unknown[] = [];
    const posted: unknown[] = [];
    let intervalCreates = 0;
    let renderCount = 0;
    const messageListeners: Array<(event: { data: unknown }) => void> = [];
    const context: Record<string, unknown> = {
        window: {
            addEventListener(type: string, fn: (event: { data: unknown }) => void) {
                if (type === 'message') messageListeners.push(fn);
            },
        },
        document: {
            addEventListener() { /* registration only */ },
            getElementById() { return null; },
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
        // Real T() (00-core.js) resolves i18n keys against the loaded locale bundle;
        // this module is evaluated in isolation, so stub it as an identity passthrough.
        T: testT,
        setInterval() {
            intervalCreates += 1;
            return 1;
        },
        clearInterval(value: unknown) { clearedTimers.push(value); },
        __onRenderCombatLab() {
            renderCount += 1;
        },
    };
    vm.runInNewContext(
        `${source}\nglobalThis.__combatHooks = { combatCommandMessageForPointer, resetCombatCommandPlaytestUi, selectCombatLabScenarioForPlaytest, bindCombatCommandPlaytest, renderCombatCommandPlaytest, updateCombatCommandPlaytestView, canUpdateCombatCommandPlaytestInPlace, lab: window.LR_combatLab };`,
        context,
    );
    const hooks = context.__combatHooks as {
        combatCommandMessageForPointer: PointerHelper;
        resetCombatCommandPlaytestUi: ResetHelper;
        selectCombatLabScenarioForPlaytest: ScenarioHelper;
        bindCombatCommandPlaytest: BindHelper;
        renderCombatCommandPlaytest: (state: Record<string, unknown>) => string;
        updateCombatCommandPlaytestView: (state?: Record<string, unknown>) => boolean;
        canUpdateCombatCommandPlaytestInPlace: () => boolean;
        lab: Record<string, unknown>;
    };
    // Stub render so message handlers that call renderCombatLab do not need the DOM.
    // Count calls so multi-subscriber DOM refresh can be asserted without a real panel.
    vm.runInNewContext('function renderCombatLab() { if (typeof __onRenderCombatLab === "function") __onRenderCombatLab(); }', context);
    return {
        translate: hooks.combatCommandMessageForPointer,
        reset: hooks.resetCombatCommandPlaytestUi,
        selectScenario: hooks.selectCombatLabScenarioForPlaytest,
        bind: hooks.bindCombatCommandPlaytest,
        renderPlaytest: hooks.renderCombatCommandPlaytest,
        updateView: hooks.updateCombatCommandPlaytestView,
        canUpdateInPlace: hooks.canUpdateCombatCommandPlaytestInPlace,
        clearedTimers,
        posted,
        get intervalCreates() { return intervalCreates; },
        get renderCount() { return renderCount; },
        dispatchMessage(data: unknown) {
            for (const listener of messageListeners) listener({ data });
        },
        state: hooks.lab,
    };
}

/** Full live module with a minimal DOM so snapshot updates preserve control identity. */
function loadWebviewLiveDom(): {
    posted: unknown[];
    renderCount: number;
    dispatchMessage: (data: unknown) => void;
    state: Record<string, unknown>;
    getPanel: () => DomNode | null;
    query: (sel: string) => DomNode | null;
    queryAll: (sel: string) => DomNode[];
    scrollIntoViewCalls: DomNode[];
} {
    const source = fs.readFileSync(path.join(__dirname, '../webview/modules/89f-combat-lab.js'), 'utf8');
    const posted: unknown[] = [];
    let renderCount = 0;
    const messageListeners: Array<(event: { data: unknown }) => void> = [];
    const { document, scrollIntoViewCalls } = createMinimalDom();
    const context: Record<string, unknown> = {
        window: {
            addEventListener(type: string, fn: (event: { data: unknown }) => void) {
                if (type === 'message') messageListeners.push(fn);
            },
        },
        document,
        navigator: {},
        vscode: {
            postMessage(message: unknown) {
                posted.push(message);
            },
        },
        // Real T() (00-core.js) resolves i18n keys against the loaded locale bundle;
        // this module is evaluated in isolation, so back it with the real en.json
        // strings (see testT above) rather than an identity stub.
        T: testT,
        setInterval() { return 1; },
        clearInterval() { /* no-op */ },
    };
    vm.runInNewContext(source, context);
    // Wrap the live renderCombatLab to count full structural rebuilds only.
    vm.runInNewContext(
        `const __origRenderCombatLab = renderCombatLab;
         renderCombatLab = function() {
           globalThis.__fullRenderCount = (globalThis.__fullRenderCount || 0) + 1;
           return __origRenderCombatLab.apply(this, arguments);
         };`,
        context,
    );
    // Initial structural render (panel creation).
    vm.runInNewContext('renderCombatLab()', context);
    renderCount = Number((context as { __fullRenderCount?: number }).__fullRenderCount || 0);

    const getPanel = () => document.getElementById('combat-lab-panel') as DomNode | null;
    return {
        posted,
        get renderCount() {
            return Number((context as { __fullRenderCount?: number }).__fullRenderCount || 0);
        },
        dispatchMessage(data: unknown) {
            for (const listener of messageListeners) listener({ data });
        },
        state: (context.window as { LR_combatLab: Record<string, unknown> }).LR_combatLab,
        getPanel,
        query(sel: string) {
            return getPanel()?.querySelector(sel) ?? null;
        },
        queryAll(sel: string) {
            return getPanel()?.querySelectorAll(sel) ?? [];
        },
        scrollIntoViewCalls,
    };
}

function runningSnapshot(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
        scenarioId: 'scenarioA',
        mode: 'command',
        tick: 1,
        running: true,
        startId: 'ns_live:1',
        bounds: { minX: -100, maxX: 100, minY: -100, maxY: 100 },
        units: [
            { id: 'ally_1', team: 0, x: -20, y: 0, hp: 80, maxHp: 100, dead: false },
            { id: 'enemy_1', team: 1, x: 40, y: 10, hp: 40, maxHp: 50, dead: false },
        ],
        ...overrides,
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
            pendingPeerAdopt: false,
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

    test('failed restart null preserves pendingStart so the structured start error still matches', () => {
        const live = loadWebviewHelpers();
        live.state.selected = 'scenarioA';
        live.state.playtest = { scenarioId: 'scenarioA', tick: 9, units: [], startId: 'ns_test:1' };
        live.state.activeStartId = 'ns_test:1';
        live.state.pendingStart = true;
        live.state.pendingStartId = 'ns_test:2';
        live.state.running = true;

        live.dispatchMessage({ type: 'combatCommandPlaytestState', state: null });
        assert.equal(live.state.playtest, null, 'retired battle cleared');
        assert.equal(live.state.running, false);
        assert.equal(live.state.pendingStart, true, 'pending start preserved for error match');
        assert.equal(live.state.pendingStartId, 'ns_test:2');
        assert.ok(live.renderCount >= 1, 'null path re-renders so initiator DOM drops the battle');

        live.dispatchMessage({
            type: 'combatCommandPlaytestError',
            error: 'INVALID_COMBAT_LAB_SCENARIO',
            detail: 'scenario failed Combat Lab validation',
            operation: 'start',
            scenarioId: 'scenarioA',
            startId: 'ns_test:2',
        });
        assert.equal(live.state.pendingStart, false);
        assert.equal(live.state.pendingStartId, null);
        assert.equal(live.state.error, 'INVALID_COMBAT_LAB_SCENARIO');
        assert.equal(live.state.playtest, null);
        assert.equal(live.state.running, false);
    });

    test('non-initiator failed restart null then start error clears ghost battle and shows error', () => {
        const live = loadWebviewHelpers();
        // Spectator / other subscriber: showing an old battle, not the initiator.
        live.state.selected = 'scenarioA';
        live.state.playtest = { scenarioId: 'scenarioA', tick: 42, units: [{ id: 'ally_1' }], startId: 'ns_old:1' };
        live.state.activeStartId = 'ns_old:1';
        live.state.pendingStart = false;
        live.state.pendingStartId = null;
        live.state.running = true;
        live.state.error = '';
        const rendersBefore = live.renderCount;

        live.dispatchMessage({ type: 'combatCommandPlaytestState', state: null });
        assert.equal(live.state.playtest, null);
        assert.equal(live.state.pendingStart, false);
        assert.equal(live.state.running, false);
        assert.ok(live.renderCount > rendersBefore, 'non-initiator re-renders on null to drop old battle DOM');
        const rendersAfterNull = live.renderCount;

        live.dispatchMessage({
            type: 'combatCommandPlaytestError',
            error: 'INVALID_COMBAT_LAB_SCENARIO',
            detail: 'scenario failed Combat Lab validation',
            operation: 'start',
            scenarioId: 'scenarioA',
            startId: 'ns_other:9',
        });
        assert.equal(live.state.playtest, null);
        assert.equal(live.state.error, 'INVALID_COMBAT_LAB_SCENARIO');
        assert.equal(live.state.running, false);
        assert.ok(live.renderCount > rendersAfterNull, 'start error re-renders error display for non-initiator');
    });

    test('delayed stale start error is ignored when a newer session is already displayed', () => {
        const live = loadWebviewHelpers();
        live.state.selected = 'scenarioA';
        live.state.playtest = { scenarioId: 'scenarioA', tick: 3, units: [], startId: 'ns_new:1' };
        live.state.activeStartId = 'ns_new:1';
        live.state.pendingStart = false;
        live.state.error = '';
        const rendersBefore = live.renderCount;

        live.dispatchMessage({
            type: 'combatCommandPlaytestError',
            error: 'INVALID_COMBAT_LAB_SCENARIO',
            operation: 'start',
            scenarioId: 'scenarioA',
            startId: 'ns_old:1',
        });
        assert.deepEqual(live.state.playtest, { scenarioId: 'scenarioA', tick: 3, units: [], startId: 'ns_new:1' });
        assert.equal(live.state.error, '', 'stale start error must not clobber a live session');
        assert.equal(live.renderCount, rendersBefore, 'stale start error must not re-render');
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

    test('A: running host snapshots keep the same Pause/Run control mounted', () => {
        const live = loadWebviewLiveDom();
        live.state.selected = 'scenarioA';
        live.state.activeStartId = 'ns_live:1';
        live.state.pendingStart = false;
        live.state.eligibleForHostRestore = false;

        live.dispatchMessage({ type: 'combatCommandPlaytestState', state: runningSnapshot({ tick: 1 }) });
        const runBtn = live.query('[data-lab="playtest-run"]');
        const field = live.query('[data-lab="battlefield"]');
        assert.ok(runBtn, 'run control exists after first live snapshot');
        assert.ok(field, 'battlefield exists after first live snapshot');
        const rendersAfterFirst = live.renderCount;
        assert.equal(runBtn?.textContent, 'Pause');

        for (let tick = 2; tick <= 8; tick += 1) {
            live.dispatchMessage({
                type: 'combatCommandPlaytestState',
                state: runningSnapshot({
                    tick,
                    units: [
                        { id: 'ally_1', team: 0, x: -20 + tick, y: 0, hp: 80 - tick, maxHp: 100, dead: false },
                        { id: 'enemy_1', team: 1, x: 40 - tick, y: 10, hp: 40, maxHp: 50, dead: false },
                    ],
                }),
            });
        }

        assert.equal(live.query('[data-lab="playtest-run"]'), runBtn, 'Pause/Run node identity is stable across snapshots');
        assert.equal(live.query('[data-lab="battlefield"]'), field, 'battlefield node identity is stable across snapshots');
        assert.equal(live.renderCount, rendersAfterFirst, 'running snapshots must not full-rebuild Combat Lab');
        assert.ok(live.query('[data-lab="playtest-status"]')?.textContent.includes('tick 8'));
    });

    test('B: Pause remains actionable during repeated running snapshots', () => {
        const live = loadWebviewLiveDom();
        live.state.selected = 'scenarioA';
        live.state.activeStartId = 'ns_live:1';
        live.state.pendingStart = false;
        live.state.eligibleForHostRestore = false;
        live.state.running = true;

        for (let tick = 1; tick <= 5; tick += 1) {
            live.dispatchMessage({ type: 'combatCommandPlaytestState', state: runningSnapshot({ tick }) });
        }
        assert.equal(live.state.running, true);
        const runBtn = live.query('[data-lab="playtest-run"]');
        assert.equal(runBtn?.textContent, 'Pause');
        const postedBefore = live.posted.length;

        runBtn?.onclick?.();

        assert.equal(live.state.running, false);
        assert.equal(runBtn?.textContent, 'Run');
        const runMessages = live.posted.slice(postedBefore).filter(
            message => !!message && typeof message === 'object' && (message as { type?: string }).type === 'setCombatCommandPlaytestRunning',
        );
        assert.equal(runMessages.length, 1, 'exactly one running-control message');
        assert.deepEqual(transportValue(runMessages[0] as Record<string, unknown>), {
            type: 'setCombatCommandPlaytestRunning',
            running: false,
            startId: 'ns_live:1',
        });
    });

    test('C: step/stop/resume stay single-fire after repeated snapshots', () => {
        const live = loadWebviewLiveDom();
        live.state.selected = 'scenarioA';
        live.state.activeStartId = 'ns_live:1';
        live.state.pendingStart = false;
        live.state.eligibleForHostRestore = false;
        live.state.selection = ['ally_1'];

        for (let tick = 1; tick <= 4; tick += 1) {
            live.dispatchMessage({ type: 'combatCommandPlaytestState', state: runningSnapshot({ tick }) });
        }
        // selection may be filtered by controllable allies; re-assert after snapshots
        live.state.selection = ['ally_1'];
        const postedBefore = live.posted.length;

        live.query('[data-lab="playtest-step"]')?.onclick?.();
        live.query('[data-lab="stop"]')?.onclick?.();
        live.query('[data-lab="resume"]')?.onclick?.();

        const newMessages = live.posted.slice(postedBefore) as Array<Record<string, unknown>>;
        const steps = newMessages.filter(m => m.type === 'stepCombatCommandPlaytest');
        const stops = newMessages.filter(m => m.type === 'issueCombatCommand' && m.command === 'stop');
        const resumes = newMessages.filter(m => m.type === 'issueCombatCommand' && m.command === 'resume_gambit');
        assert.equal(steps.length, 1);
        assert.deepEqual(transportValue(steps[0]), { type: 'stepCombatCommandPlaytest', ticks: 1, startId: 'ns_live:1' });
        assert.equal(stops.length, 1);
        assert.deepEqual(transportValue(stops[0]), {
            type: 'issueCombatCommand', unitIds: ['ally_1'], command: 'stop', startId: 'ns_live:1',
        });
        assert.equal(resumes.length, 1);
        assert.deepEqual(transportValue(resumes[0]), {
            type: 'issueCombatCommand', unitIds: ['ally_1'], command: 'resume_gambit', startId: 'ns_live:1',
        });
    });

    test('D: battlefield selection and move remain actionable without marker duplication', () => {
        const live = loadWebviewLiveDom();
        live.state.selected = 'scenarioA';
        live.state.activeStartId = 'ns_live:1';
        live.state.pendingStart = false;
        live.state.eligibleForHostRestore = false;

        for (let tick = 1; tick <= 3; tick += 1) {
            live.dispatchMessage({
                type: 'combatCommandPlaytestState',
                state: runningSnapshot({
                    tick,
                    units: [
                        { id: 'ally_1', team: 0, x: -20 + tick, y: 0, hp: 80, maxHp: 100, dead: false },
                        { id: 'enemy_1', team: 1, x: 40, y: 10, hp: 40, maxHp: 50, dead: false },
                    ],
                }),
            });
        }

        const field = live.query('[data-lab="battlefield"]');
        const ally = live.query('[data-unit-id="ally_1"]');
        assert.ok(field && ally);
        const markerCount = live.queryAll('[data-unit-id]').length;
        assert.equal(markerCount, 2, 'exactly one marker per unit');

        field?.onclick?.({
            target: ally,
            shiftKey: false,
        });
        // Compare via JSON so the assertion is realm-safe across the vm sandbox Array.
        assert.deepEqual(JSON.parse(JSON.stringify(live.state.selection)), ['ally_1']);
        assert.equal(live.query('[data-unit-id="ally_1"]'), ally, 'selected ally marker node is preserved');

        const postedBefore = live.posted.length;
        field?.oncontextmenu?.({
            preventDefault() { /* no-op */ },
            target: field,
            clientX: 200,
            clientY: 170,
        });
        const moveMessages = live.posted.slice(postedBefore).filter(
            message => !!message && typeof message === 'object' && (message as { type?: string }).type === 'issueCombatCommand',
        );
        assert.equal(moveMessages.length, 1);
        assert.equal((moveMessages[0] as { command?: string }).command, 'move_to');
        assert.equal((moveMessages[0] as { startId?: string }).startId, 'ns_live:1');
        assert.equal(live.queryAll('[data-unit-id]').length, 2, 'snapshot-style marker updates must not duplicate nodes');
    });

    test('E: incremental snapshots update tick, running, position, HP, and outcome without full rebuild', () => {
        const live = loadWebviewLiveDom();
        live.state.selected = 'scenarioA';
        live.state.activeStartId = 'ns_live:1';
        live.state.pendingStart = false;
        live.state.eligibleForHostRestore = false;

        live.dispatchMessage({ type: 'combatCommandPlaytestState', state: runningSnapshot({ tick: 1 }) });
        const rendersAfterMount = live.renderCount;
        const ally = live.query('[data-unit-id="ally_1"]');
        const runBtn = live.query('[data-lab="playtest-run"]');
        const status = live.query('[data-lab="playtest-status"]');
        assert.ok(ally && runBtn && status);

        live.dispatchMessage({
            type: 'combatCommandPlaytestState',
            state: runningSnapshot({
                tick: 9,
                running: true,
                units: [
                    { id: 'ally_1', team: 0, x: 10, y: 20, hp: 12, maxHp: 100, dead: false },
                    { id: 'enemy_1', team: 1, x: 40, y: 10, hp: 0, maxHp: 50, dead: true },
                ],
            }),
        });
        assert.equal(live.renderCount, rendersAfterMount, 'visual snapshot path is incremental');
        assert.equal(live.query('[data-unit-id="ally_1"]'), ally);
        assert.equal(live.query('[data-lab="playtest-run"]'), runBtn);
        assert.ok(status?.textContent.includes('tick 9'));
        assert.ok(String(ally?.title || '').includes('HP 12/100'));
        assert.equal(live.query('[data-unit-id="enemy_1"]')?.disabled, true);
        assert.equal(runBtn?.textContent, 'Pause');

        live.dispatchMessage({
            type: 'combatCommandPlaytestState',
            state: runningSnapshot({
                tick: 10,
                running: false,
                outcome: 'Victory',
                units: [
                    { id: 'ally_1', team: 0, x: 10, y: 20, hp: 12, maxHp: 100, dead: false },
                    { id: 'enemy_1', team: 1, x: 40, y: 10, hp: 0, maxHp: 50, dead: true },
                ],
            }),
        });
        assert.equal(live.renderCount, rendersAfterMount);
        assert.equal(live.state.running, false);
        assert.equal(runBtn?.textContent, 'Run');
        assert.ok(status?.textContent.includes('Victory'));
    });

    test('E2: a successful Start scrolls the battlefield into view exactly once, not on every later snapshot', () => {
        // Regression guard: the battlefield sits below Ability Workshop / Combat Lab
        // JSON in the sidebar and units render mid-box, not at its top edge. A GUI
        // smoke pass once mistook this for "Start produced zero units" purely because
        // a short viewport left the populated battlefield scrolled out of view.
        const live = loadWebviewLiveDom();
        live.state.selected = 'scenarioA';
        live.state.pendingStart = true;
        live.state.pendingStartId = 'ns_live:1';
        live.state.eligibleForHostRestore = false;

        live.dispatchMessage({ type: 'combatCommandPlaytestState', state: runningSnapshot({ tick: 0 }) });
        assert.ok(live.state.playtest, 'the matching start snapshot was accepted');
        assert.equal(live.scrollIntoViewCalls.length, 1, 'battlefield scrolls into view once on a successful start');
        assert.equal(live.scrollIntoViewCalls[0], live.query('[data-lab="battlefield"]'));

        live.dispatchMessage({ type: 'combatCommandPlaytestState', state: runningSnapshot({ tick: 1 }) });
        live.dispatchMessage({ type: 'combatCommandPlaytestState', state: runningSnapshot({ tick: 2 }) });
        assert.equal(live.scrollIntoViewCalls.length, 1, 'ordinary tick snapshots do not re-scroll on every update');
    });

    test('F: structural clears and stale-start guards still work with the live DOM path', () => {
        const live = loadWebviewLiveDom();
        live.state.selected = 'scenarioA';
        live.state.activeStartId = 'ns_live:1';
        live.state.pendingStart = false;
        live.state.eligibleForHostRestore = false;
        live.dispatchMessage({ type: 'combatCommandPlaytestState', state: runningSnapshot({ tick: 3 }) });
        assert.ok(live.state.playtest);

        const rendersBeforeNull = live.renderCount;
        live.state.pendingStart = true;
        live.state.pendingStartId = 'ns_live:2';
        live.dispatchMessage({ type: 'combatCommandPlaytestState', state: null });
        assert.equal(live.state.playtest, null);
        assert.equal(live.state.pendingStart, true);
        assert.equal(live.state.pendingStartId, 'ns_live:2');
        assert.ok(live.renderCount > rendersBeforeNull, 'state:null still full-renders');

        live.dispatchMessage({
            type: 'combatCommandPlaytestError',
            error: 'INVALID_COMBAT_LAB_SCENARIO',
            operation: 'start',
            scenarioId: 'scenarioA',
            startId: 'ns_live:2',
        });
        assert.equal(live.state.pendingStart, false);
        assert.equal(live.state.error, 'INVALID_COMBAT_LAB_SCENARIO');
        assert.equal(live.state.running, false);

        // Display a newer session, then ignore a delayed stale start error.
        live.state.playtest = runningSnapshot({ tick: 1, startId: 'ns_live:9' });
        live.state.activeStartId = 'ns_live:9';
        live.state.error = '';
        live.dispatchMessage({
            type: 'combatCommandPlaytestError',
            error: 'INVALID_COMBAT_LAB_SCENARIO',
            operation: 'start',
            scenarioId: 'scenarioA',
            startId: 'ns_old:1',
        });
        assert.equal(live.state.error, '', 'delayed stale start error ignored while a session is displayed');
        assert.equal((live.state.playtest as { startId?: string }).startId, 'ns_live:9');
    });

    test('B: same-scenario peer replacement adopts new startId and posts controls with it', () => {
        const live = loadWebviewHelpers();
        live.state.selected = 'scenarioA';
        live.state.activeStartId = 'old';
        live.state.playtest = {
            scenarioId: 'scenarioA', mode: 'command', tick: 5, units: [{ id: 'ally_1', team: 0, dead: false }], startId: 'old',
        };
        live.state.running = true;
        live.state.pendingStart = false;
        live.state.eligibleForHostRestore = false;
        live.state.selection = ['ally_1'];

        live.dispatchMessage({
            type: 'combatCommandPlaytestState',
            state: null,
            sessionEvent: 'replaced',
        });
        assert.equal(live.state.playtest, null);
        assert.equal(live.state.activeStartId, null);
        assert.equal(live.state.pendingPeerAdopt, true);
        assert.equal(live.state.selected, 'scenarioA');

        live.dispatchMessage({
            type: 'combatCommandPlaytestState',
            state: {
                scenarioId: 'scenarioA',
                mode: 'command',
                tick: 0,
                running: true,
                units: [{ id: 'ally_1', team: 0, dead: false }],
                startId: 'new',
            },
        });
        assert.equal(live.state.pendingPeerAdopt, false);
        assert.equal(live.state.activeStartId, 'new');
        assert.equal((live.state.playtest as { startId?: string } | null)?.startId, 'new');
        assert.equal(live.state.running, true);

        const elements: Record<string, { onclick?: () => void }> = {};
        live.bind({
            querySelector(sel: string) {
                if (!elements[sel]) elements[sel] = {};
                return elements[sel];
            },
            querySelectorAll() { return []; },
        });
        live.state.selection = ['ally_1'];
        const postedBefore = live.posted.length;

        elements['[data-lab="playtest-run"]'].onclick?.();
        elements['[data-lab="playtest-step"]'].onclick?.();
        // stop uses sendSelectedCombatCommand
        elements['[data-lab="stop"]'].onclick?.();

        const newMsgs = live.posted.slice(postedBefore) as Array<Record<string, unknown>>;
        const runMsgs = newMsgs.filter(m => m.type === 'setCombatCommandPlaytestRunning');
        const stepMsgs = newMsgs.filter(m => m.type === 'stepCombatCommandPlaytest');
        const stopMsgs = newMsgs.filter(m => m.type === 'issueCombatCommand' && m.command === 'stop');
        assert.equal(runMsgs.length, 1);
        assert.deepEqual(transportValue(runMsgs[0]), {
            type: 'setCombatCommandPlaytestRunning', running: false, startId: 'new',
        });
        assert.equal(stepMsgs.length, 1);
        assert.deepEqual(transportValue(stepMsgs[0]), {
            type: 'stepCombatCommandPlaytest', ticks: 1, startId: 'new',
        });
        assert.equal(stopMsgs.length, 1);
        assert.deepEqual(transportValue(stopMsgs[0]), {
            type: 'issueCombatCommand', unitIds: ['ally_1'], command: 'stop', startId: 'new',
        });
    });

    test('C: different-scenario peer replacement updates selected and displays the new session', () => {
        const live = loadWebviewHelpers();
        live.state.selected = 'scenarioA';
        live.state.activeStartId = 'old';
        live.state.playtest = { scenarioId: 'scenarioA', tick: 9, units: [], startId: 'old' };
        live.state.pendingStart = false;
        live.state.eligibleForHostRestore = false;
        live.state.running = true;

        live.dispatchMessage({
            type: 'combatCommandPlaytestState',
            state: null,
            sessionEvent: 'replaced',
        });
        assert.equal(live.state.pendingPeerAdopt, true);
        assert.equal(live.state.selected, 'scenarioA', 'selected unchanged until replacement snapshot');

        live.dispatchMessage({
            type: 'combatCommandPlaytestState',
            state: {
                scenarioId: 'scenarioB',
                mode: 'command',
                tick: 0,
                running: false,
                units: [{ id: 'ally_1', team: 0, dead: false }],
                startId: 'new',
            },
        });
        assert.equal(live.state.selected, 'scenarioB');
        assert.equal(live.state.activeStartId, 'new');
        assert.equal((live.state.playtest as { scenarioId?: string; startId?: string }).scenarioId, 'scenarioB');
        assert.equal((live.state.playtest as { startId?: string }).startId, 'new');
        assert.equal(live.state.running, false);

        // Later new snapshots continue updating.
        live.dispatchMessage({
            type: 'combatCommandPlaytestState',
            state: {
                scenarioId: 'scenarioB',
                mode: 'command',
                tick: 3,
                running: true,
                units: [{ id: 'ally_1', team: 0, dead: false }],
                startId: 'new',
            },
        });
        assert.equal((live.state.playtest as { tick?: number }).tick, 3);
        assert.equal(live.state.running, true);
        assert.equal(live.state.activeStartId, 'new');
    });

    test('D: after peer adopts new startId, delayed old snapshots are ignored', () => {
        const live = loadWebviewHelpers();
        live.state.selected = 'scenarioA';
        live.state.activeStartId = 'old';
        live.state.playtest = { scenarioId: 'scenarioA', tick: 2, units: [], startId: 'old' };
        live.state.pendingStart = false;
        live.state.eligibleForHostRestore = false;

        live.dispatchMessage({ type: 'combatCommandPlaytestState', state: null, sessionEvent: 'replaced' });
        live.dispatchMessage({
            type: 'combatCommandPlaytestState',
            state: { scenarioId: 'scenarioA', tick: 0, units: [], startId: 'new', running: true },
        });
        assert.equal(live.state.activeStartId, 'new');

        live.dispatchMessage({
            type: 'combatCommandPlaytestState',
            state: { scenarioId: 'scenarioA', tick: 99, units: [], startId: 'old', running: true },
        });
        assert.equal(live.state.activeStartId, 'new');
        assert.equal((live.state.playtest as { tick?: number; startId?: string }).tick, 0);
        assert.equal((live.state.playtest as { startId?: string }).startId, 'new');
    });

    test('E: failed replacement clears peer and shows structured error without adopting a session', () => {
        const live = loadWebviewHelpers();
        live.state.selected = 'scenarioA';
        live.state.activeStartId = 'old';
        live.state.playtest = { scenarioId: 'scenarioA', tick: 4, units: [{ id: 'ally_1' }], startId: 'old' };
        live.state.pendingStart = false;
        live.state.eligibleForHostRestore = false;
        live.state.running = true;

        live.dispatchMessage({ type: 'combatCommandPlaytestState', state: null, sessionEvent: 'replaced' });
        assert.equal(live.state.playtest, null);
        assert.equal(live.state.activeStartId, null);
        assert.equal(live.state.pendingPeerAdopt, true);

        live.dispatchMessage({
            type: 'combatCommandPlaytestError',
            error: 'INVALID_COMBAT_LAB_SCENARIO',
            operation: 'start',
            scenarioId: 'scenarioB',
            startId: 'new',
        });
        assert.equal(live.state.pendingPeerAdopt, false);
        assert.equal(live.state.playtest, null);
        assert.equal(live.state.activeStartId, null);
        assert.equal(live.state.running, false);
        assert.equal(live.state.error, 'INVALID_COMBAT_LAB_SCENARIO');
    });

    test('F: initiator pendingStart still matches; mismatched pendingStart is rejected', () => {
        const live = loadWebviewHelpers();
        live.state.selected = 'scenarioA';
        live.state.pendingStart = true;
        live.state.pendingStartId = 'ns:2';
        live.state.eligibleForHostRestore = false;
        live.state.playtest = null;
        live.state.activeStartId = null;

        // Replaced-null preserves initiator pendingStart.
        live.dispatchMessage({ type: 'combatCommandPlaytestState', state: null, sessionEvent: 'replaced' });
        assert.equal(live.state.pendingStart, true);
        assert.equal(live.state.pendingStartId, 'ns:2');
        assert.equal(live.state.pendingPeerAdopt, true);

        // Mismatched startId rejected; pending remains.
        live.dispatchMessage({
            type: 'combatCommandPlaytestState',
            state: { scenarioId: 'scenarioA', tick: 0, units: [], startId: 'ns:1' },
        });
        assert.equal(live.state.pendingStart, true);
        assert.equal(live.state.playtest, null);

        // Matching startId adopts.
        live.dispatchMessage({
            type: 'combatCommandPlaytestState',
            state: { scenarioId: 'scenarioA', tick: 0, units: [], startId: 'ns:2', running: false },
        });
        assert.equal(live.state.pendingStart, false);
        assert.equal(live.state.pendingPeerAdopt, false);
        assert.equal(live.state.activeStartId, 'ns:2');
        assert.deepEqual(live.state.playtest, {
            scenarioId: 'scenarioA', tick: 0, units: [], startId: 'ns:2', running: false,
        });

        // Failed-start matching still works for a later pending request.
        live.state.pendingStart = true;
        live.state.pendingStartId = 'ns:3';
        live.state.playtest = null;
        live.state.activeStartId = null;
        live.dispatchMessage({
            type: 'combatCommandPlaytestError',
            error: 'INVALID_COMBAT_LAB_SCENARIO',
            operation: 'start',
            scenarioId: 'scenarioA',
            startId: 'ns:3',
        });
        assert.equal(live.state.pendingStart, false);
        assert.equal(live.state.error, 'INVALID_COMBAT_LAB_SCENARIO');
    });

    test('G: bare document clear does not prime peer adoption of a later stale snapshot', () => {
        const live = loadWebviewHelpers();
        live.state.selected = 'scenarioA';
        live.state.activeStartId = 'old';
        live.state.playtest = { scenarioId: 'scenarioA', tick: 7, units: [], startId: 'old' };
        live.state.pendingStart = false;
        live.state.eligibleForHostRestore = true;

        live.dispatchMessage({ type: 'combatCommandPlaytestState', state: null });
        assert.equal(live.state.eligibleForHostRestore, false);
        assert.equal(live.state.pendingPeerAdopt, false);
        assert.equal(live.state.playtest, null);
        assert.equal(live.state.activeStartId, null);

        // Opportunistic same-scenario snapshot must not rehydrate after clear.
        live.dispatchMessage({
            type: 'combatCommandPlaytestState',
            state: { scenarioId: 'scenarioA', tick: 0, units: [], startId: 'stale', running: true },
        });
        assert.equal(live.state.playtest, null);
        assert.equal(live.state.activeStartId, null);
        assert.equal(live.state.selected, 'scenarioA');
    });

    test('peer adopts playtestMode from Command→Spectator replacement and restart posts spectator', () => {
        const live = loadWebviewHelpers();
        live.state.selected = 'scenarioA';
        live.state.playtestMode = 'command';
        live.state.activeStartId = 'old';
        live.state.playtest = {
            scenarioId: 'scenarioA', mode: 'command', tick: 2, units: [], startId: 'old',
        };
        live.state.pendingStart = false;
        live.state.eligibleForHostRestore = false;

        live.dispatchMessage({ type: 'combatCommandPlaytestState', state: null, sessionEvent: 'replaced' });
        live.dispatchMessage({
            type: 'combatCommandPlaytestState',
            state: {
                scenarioId: 'scenarioA',
                mode: 'spectator',
                tick: 0,
                running: false,
                units: [],
                startId: 'new-spec',
            },
        });
        assert.equal(live.state.playtestMode, 'spectator', 'peer mode UI state follows host replacement mode');
        assert.equal(live.state.activeStartId, 'new-spec');

        const elements: Record<string, { onclick?: () => void }> = {};
        live.bind({
            querySelector(sel: string) {
                if (!elements[sel]) elements[sel] = {};
                return elements[sel];
            },
            querySelectorAll() { return []; },
        });
        const postedBefore = live.posted.length;
        elements['[data-lab="playtest-start"]'].onclick?.();
        const startMsgs = live.posted.slice(postedBefore).filter(
            message => !!message && typeof message === 'object'
                && (message as { type?: string }).type === 'startCombatCommandPlaytest',
        ) as Array<Record<string, unknown>>;
        assert.equal(startMsgs.length, 1);
        assert.equal(startMsgs[0].mode, 'spectator', 'restart after peer mode adoption must send spectator');
        assert.equal(startMsgs[0].scenarioId, 'scenarioA');
    });

    test('different-scenario peer adoption structurally syncs scenario selector and JSON', () => {
        const live = loadWebviewLiveDom();
        const documentState = {
            scenarios: [
                { id: 'scenarioA', name: 'Alpha', mode: 'mechanics_v1', allies: [], enemies: [], deltaSeconds: 1 / 30 },
                { id: 'scenarioB', name: 'Bravo', mode: 'mechanics_v1', allies: [], enemies: [], deltaSeconds: 1 / 30 },
            ],
        };
        live.dispatchMessage({
            type: 'combatLabState',
            state: {
                document: documentState,
                selected: 'scenarioA',
            },
        });
        live.state.activeStartId = 'old';
        live.state.playtest = { scenarioId: 'scenarioA', mode: 'command', tick: 1, units: [], startId: 'old' };
        live.state.playtestMode = 'command';
        live.state.pendingStart = false;
        live.state.eligibleForHostRestore = false;
        live.state.pendingPeerAdopt = false;

        assert.ok(live.query('[data-lab="scenario"]'), 'scenario selector present after lab state');
        assert.ok(live.query('[data-lab="json"]'), 'JSON textarea present after lab state');
        const rendersBeforeReplace = live.renderCount;

        live.dispatchMessage({ type: 'combatCommandPlaytestState', state: null, sessionEvent: 'replaced' });
        live.dispatchMessage({
            type: 'combatCommandPlaytestState',
            state: {
                scenarioId: 'scenarioB',
                mode: 'command',
                tick: 0,
                running: false,
                units: [{ id: 'ally_1', team: 0, dead: false }],
                startId: 'new-b',
            },
        });

        assert.equal(live.state.selected, 'scenarioB');
        assert.equal(live.state.activeStartId, 'new-b');
        assert.ok(live.renderCount > rendersBeforeReplace, 'different-scenario peer adopt full-renders once');

        const scenarioSelect = live.query('[data-lab="scenario"]');
        const json = live.query('[data-lab="json"]');
        assert.ok(scenarioSelect && json);
        const jsonText = String(json.textContent || (json as { value?: string }).value || '');
        assert.ok(
            jsonText.includes('scenarioB') || jsonText.includes('Bravo'),
            `JSON should show scenario B after structural adopt, got: ${jsonText.slice(0, 160)}`,
        );
        // Selected option for B is marked during full renderCombatLab().
        const panelHtml = String((live.getPanel() as { _html?: string; innerHTML?: string } | null)?.innerHTML || '');
        assert.ok(
            panelHtml.includes('value="scenarioB" selected')
                || panelHtml.includes("value=\"scenarioB\" selected")
                || (scenarioSelect as { value?: string }).value === 'scenarioB',
            'scenario selector must mark scenarioB as selected after structural adopt',
        );

        const rendersAfterAdopt = live.renderCount;
        live.dispatchMessage({
            type: 'combatCommandPlaytestState',
            state: {
                scenarioId: 'scenarioB',
                mode: 'command',
                tick: 2,
                running: true,
                units: [{ id: 'ally_1', team: 0, dead: false }],
                startId: 'new-b',
            },
        });
        assert.equal(live.renderCount, rendersAfterAdopt, 'later same-session snapshots stay incremental');
        assert.equal((live.state.playtest as { tick?: number }).tick, 2);
    });

    test('C: Production Webview adoption after clear', () => {
        const live = loadWebviewHelpers();
        live.state.selected = 'scenarioA';
        live.state.activeStartId = 'old-start-1';
        live.state.playtest = { scenarioId: 'scenarioA', tick: 10, units: [], startId: 'old-start-1' };

        // 1. Process bare document-clear null
        live.dispatchMessage({ type: 'combatCommandPlaytestState', state: null });
        assert.equal(live.state.playtest, null);
        assert.equal(live.state.activeStartId, null);
        assert.equal((live.state as unknown as { pendingPeerAdopt?: boolean }).pendingPeerAdopt, false, 'pendingPeerAdopt remains false on bare clear');

        // 2. Process Host new replaced-null
        live.dispatchMessage({ type: 'combatCommandPlaytestState', state: null, sessionEvent: 'replaced' });
        assert.equal((live.state as unknown as { pendingPeerAdopt?: boolean }).pendingPeerAdopt, true, 'pendingPeerAdopt becomes true on replaced-null');

        // 3. Process following snapshot
        live.dispatchMessage({
            type: 'combatCommandPlaytestState',
            state: {
                scenarioId: 'scenarioB',
                mode: 'spectator',
                tick: 0,
                running: true,
                units: [{ id: 'ally_1', team: 0, dead: false }],
                startId: 'new-after-clear',
            },
        });

        // 4. Verify peer adopts scenarioId, activeStartId, mode, running state
        assert.equal(live.state.selected, 'scenarioB');
        assert.equal(live.state.activeStartId, 'new-after-clear');
        assert.equal(live.state.playtestMode, 'spectator');
        assert.equal(live.state.running, true);
        assert.equal((live.state.playtest as { scenarioId?: string } | null)?.scenarioId, 'scenarioB');

        // 5. Verify Pause posts exactly one message with new startId
        const elements: Record<string, { onclick?: () => void }> = {};
        live.bind({ querySelector(sel: string) { if (!elements[sel]) elements[sel] = {}; return elements[sel]; }, querySelectorAll() { return []; } });
        const postedBefore = live.posted.length;
        elements['[data-lab="playtest-run"]']?.onclick?.();

        const pausePosts = live.posted.slice(postedBefore).filter(
            message => typeof message === 'object'
                && message !== null
                && (message as { type?: string }).type === 'setCombatCommandPlaytestRunning',
        ) as Array<{ type: string; running: boolean; startId: string }>;
        assert.equal(pausePosts.length, 1);
        assert.equal(pausePosts[0].running, false);
        assert.equal(pausePosts[0].startId, 'new-after-clear');
    });

    test('D: Webview adoption after initial failed start', () => {
        const live = loadWebviewHelpers();
        live.state.selected = 'scenarioA';

        // 1. Initial failed start sends bare null
        live.dispatchMessage({ type: 'combatCommandPlaytestState', state: null });
        assert.equal(live.state.playtest, null);
        assert.equal((live.state as unknown as { pendingPeerAdopt?: boolean }).pendingPeerAdopt, false);

        // 2. Later successful start sends replaced-null then snapshot
        live.dispatchMessage({ type: 'combatCommandPlaytestState', state: null, sessionEvent: 'replaced' });
        assert.equal((live.state as unknown as { pendingPeerAdopt?: boolean }).pendingPeerAdopt, true);

        live.dispatchMessage({
            type: 'combatCommandPlaytestState',
            state: {
                scenarioId: 'scenarioA',
                mode: 'command',
                tick: 0,
                running: false,
                units: [{ id: 'ally_1', team: 0, dead: false }],
                startId: 'first-valid-start',
            },
        });

        assert.equal(live.state.activeStartId, 'first-valid-start');
        assert.ok(live.state.playtest);
    });
});
