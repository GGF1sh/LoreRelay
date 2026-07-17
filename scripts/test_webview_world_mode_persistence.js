#!/usr/bin/env node
'use strict';

/**
 * WORLD-SIM-UX-POLISH-001-CORRECTIONS — Correction 3.
 *
 * Behavioral harness (real DOM stand-ins, real function execution) replacing
 * the previous source-text-only assertions. Exercises the actual distinction
 * the independent review found missing:
 *   - location-level "no data" must retain the currently selected mode;
 *   - campaign-level "feature disabled" must fall back once to a mode that
 *     is always available, and must not be re-restored from localStorage.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const worldPath = path.join(root, 'webview', 'modules', '85-world.js');
const source = fs.readFileSync(worldPath, 'utf8');
const diorama = fs.readFileSync(path.join(root, 'webview', 'modules', '86c-settlement-diorama.js'), 'utf8');

let failed = 0;
function test(name, fn) {
    try {
        fn();
        console.log(`OK: ${name}`);
    } catch (error) {
        failed++;
        console.error(`FAIL: ${name}`);
        console.error(error && error.stack ? error.stack : error);
    }
}

class FakeClassList {
    constructor() { this.values = new Set(); }
    add(...v) { v.forEach((x) => this.values.add(x)); }
    remove(...v) { v.forEach((x) => this.values.delete(x)); }
    contains(v) { return this.values.has(v); }
    toggle(v, force) {
        const next = force === undefined ? !this.values.has(v) : Boolean(force);
        if (next) { this.values.add(v); } else { this.values.delete(v); }
        return next;
    }
}
class FakeElement {
    constructor() { this.classList = new FakeClassList(); }
}

function buildDom() {
    const ids = [
        'world-map-mode-settlement', 'world-map-mode-diorama',
        'world-map-mode-mermaid', 'world-map-mode-parchment', 'world-map-mode-tile',
        'world-mermaid', 'world-cartography', 'world-overmap', 'world-settlement', 'world-diorama',
    ];
    const elements = new Map(ids.map((id) => [id, new FakeElement()]));
    return {
        elements,
        getElementById(id) { return elements.get(id) || null; },
    };
}

function buildStore() {
    const map = new Map();
    return {
        getItem: (k) => (map.has(k) ? map.get(k) : null),
        setItem: (k, v) => { map.set(k, String(v)); },
        raw: map,
    };
}

/** One fresh, isolated webview global scope per test: worldMapMode,
 * localStorage, and document must not leak between cases. */
function loadWebviewModeContext(initialStoredMode) {
    const dom = buildDom();
    const store = buildStore();
    if (initialStoredMode) { store.setItem('lorerelay.worldMapMode', initialStoredMode); }

    const context = {
        document: dom,
        localStorage: store,
        requestAnimationFrame: () => {},
        console,
    };
    vm.createContext(context);

    // Function-boundary markers below are exact anchors in
    // webview/modules/85-world.js; if they move, this throws immediately
    // rather than silently testing stale code.
    const hscStart = source.indexOf('function hasSettlementMapContent');
    const hscEnd = source.indexOf('function syncSettlementMapModeUi', hscStart);
    assert.ok(hscStart >= 0 && hscEnd > hscStart, 'hasSettlementMapContent not found');

    const modeStart = source.indexOf('function syncSettlementMapModeUi');
    const modeEnd = source.indexOf('function renderCartographyMap', modeStart);
    assert.ok(modeStart >= 0 && modeEnd > modeStart, 'mode persistence functions not found');

    const script = [
        "let worldMapMode = 'mermaid';",
        "const WORLD_MAP_MODE_KEY = 'lorerelay.worldMapMode';",
        source.slice(hscStart, hscEnd),
        source.slice(modeStart, modeEnd),
        // Mirrors the exact restore-from-storage sequence run at webview init.
        `
        try {
            const saved = localStorage.getItem(WORLD_MAP_MODE_KEY);
            if (saved === 'mermaid' || saved === 'parchment' || saved === 'tile' || saved === 'settlement' || saved === 'diorama') {
                worldMapMode = saved;
            }
        } catch (e) { /* ignore */ }
        `,
        'this.getWorldMapMode = () => worldMapMode;',
        'this.syncSettlementMapModeUi = syncSettlementMapModeUi;',
        'this.syncDioramaMapModeUi = syncDioramaMapModeUi;',
        'this.setWorldMapMode = setWorldMapMode;',
    ].join('\n');
    vm.runInContext(script, context, { filename: worldPath });
    return { context, dom, store };
}

function isPanelVisible(dom, panelId) { return !dom.elements.get(panelId).classList.contains('hidden'); }
function isButtonHidden(dom, btnId) { return dom.elements.get(btnId).classList.contains('hidden'); }

// --- Case: stored diorama + feature enabled + no location data on this
// location -> the mode must be RETAINED. -----------------------------------
test('stored diorama + feature enabled + current location has no diorama data: mode retained', () => {
    const { context, dom } = loadWebviewModeContext('diorama');
    assert.strictEqual(context.getWorldMapMode(), 'diorama', 'restored mode must be diorama before any message arrives');
    const msg = { enableSettlementDiorama: true, settlementDiorama: null };
    context.syncDioramaMapModeUi(msg);
    context.syncSettlementMapModeUi({ ...msg, enableSettlementMode: false, enableMobileBaseSystem: false });
    assert.strictEqual(context.getWorldMapMode(), 'diorama', 'a data-less location must not evict Diorama mode');
    assert.ok(!isButtonHidden(dom, 'world-map-mode-diorama'), 'Diorama button remains visible when the campaign supports it');
});

// --- Case: stored diorama + feature disabled at the campaign level. -------
test('stored diorama + feature disabled: falls back once, is not restored', () => {
    const { context, dom, store } = loadWebviewModeContext('diorama');
    assert.strictEqual(context.getWorldMapMode(), 'diorama');
    context.syncDioramaMapModeUi({ enableSettlementDiorama: false });
    assert.strictEqual(context.getWorldMapMode(), 'mermaid', 'disabled-feature diorama must fall back to the always-available mode');
    assert.ok(isButtonHidden(dom, 'world-map-mode-diorama'), 'Diorama button must hide when the campaign does not support it');
    assert.strictEqual(store.getItem('lorerelay.worldMapMode'), 'mermaid', 'the fallback must be persisted so it is not re-restored next launch');
});

test('feature toggled off between campaigns: a session that starts in Diorama exits it the moment the flag goes false', () => {
    const { context } = loadWebviewModeContext(null);
    context.setWorldMapMode('diorama', { persist: true });
    assert.strictEqual(context.getWorldMapMode(), 'diorama');
    context.syncDioramaMapModeUi({ enableSettlementDiorama: false });
    assert.strictEqual(context.getWorldMapMode(), 'mermaid');
});

test('feature toggled back on: Diorama becomes selectable again but is not force-restored on its own', () => {
    const { context, dom } = loadWebviewModeContext(null);
    context.syncDioramaMapModeUi({ enableSettlementDiorama: false });
    assert.ok(isButtonHidden(dom, 'world-map-mode-diorama'));
    context.syncDioramaMapModeUi({ enableSettlementDiorama: true });
    assert.ok(!isButtonHidden(dom, 'world-map-mode-diorama'), 'button must reappear once the campaign supports it again');
    assert.strictEqual(context.getWorldMapMode(), 'mermaid', 'the mode itself is not silently switched back into Diorama');
    context.setWorldMapMode('diorama', { persist: true });
    assert.strictEqual(context.getWorldMapMode(), 'diorama', 'user can now deliberately re-select Diorama');
});

test('stale panel geometry is cleared: fallback hides the Diorama panel and shows Mermaid', () => {
    const { context, dom } = loadWebviewModeContext('diorama');
    context.syncDioramaMapModeUi({ enableSettlementDiorama: false });
    assert.ok(isPanelVisible(dom, 'world-mermaid'), 'mermaid panel must be shown after fallback');
    assert.ok(!isPanelVisible(dom, 'world-diorama'), 'diorama panel must be hidden after fallback');
});

test('current vs preview location distinction is untouched by mode fallback (Settlement mirrors Diorama)', () => {
    const { context } = loadWebviewModeContext('settlement');
    // Campaign supports Settlement (Mobile Base), location currently previewed
    // has no snapshot content -> mode must be retained, exactly like Diorama.
    context.syncSettlementMapModeUi({
        enableSettlementMode: false,
        enableMobileBaseSystem: true,
        settlementView: null,
        settlementDisplayContext: { previewLocationId: 'loc_other', currentLocationId: 'loc_here' },
    });
    assert.strictEqual(context.getWorldMapMode(), 'settlement', 'a previewed location without data must not evict Settlement mode');
});

test('repeated rapid location switching does not accumulate stale fallbacks or thrash the mode', () => {
    const { context } = loadWebviewModeContext('diorama');
    const enabledMsg = { enableSettlementDiorama: true, settlementDiorama: null };
    for (let i = 0; i < 20; i += 1) {
        context.syncDioramaMapModeUi(enabledMsg);
    }
    assert.strictEqual(context.getWorldMapMode(), 'diorama', 'repeated no-data location messages must never evict a supported mode');
});

test('Settlement feature-disabled behaves symmetrically to Diorama', () => {
    const { context, dom } = loadWebviewModeContext('settlement');
    context.syncSettlementMapModeUi({ enableSettlementMode: false, enableMobileBaseSystem: false, settlementView: null });
    assert.strictEqual(context.getWorldMapMode(), 'mermaid');
    assert.ok(isButtonHidden(dom, 'world-map-mode-settlement'));
});

test('diorama helper module still clears prior geometry and hides its stage on empty state', () => {
    assert.ok(diorama.includes('webview.world.dioramaNoDataLocation'));
    assert.ok(diorama.includes('disposeSettlementDioramaRenderer'));
    assert.ok(diorama.includes('function clearSettlementDioramaScene'));
    assert.ok(diorama.includes('clearSettlementDioramaScene();'));
    const clearStart = diorama.indexOf('function clearSettlementDioramaScene');
    const clearEnd = diorama.indexOf('function rebuildDioramaSceneContent', clearStart);
    const clearSource = diorama.slice(clearStart, clearEnd);
    assert.ok(clearSource.includes('disposeSceneObjects();'), 'no-data transition must release prior scene geometry');
    assert.ok(clearSource.includes('_lastDioramaSettlementId = null;'), 'same snapshot must rebuild after no-data');
    assert.ok(!clearSource.includes('forceContextLoss'), 'no-data transition must preserve the reusable canvas context');
    assert.ok(diorama.includes("stage.classList.add('hidden')"));
});

for (const locale of ['en', 'ja', 'zh-CN', 'zh-TW']) {
    test(`${locale} locale still has the Diorama no-data copy`, () => {
        const messages = JSON.parse(fs.readFileSync(path.join(root, 'locales', `${locale}.json`), 'utf8'));
        assert.ok(messages['webview.world.dioramaNoDataLocation'], `${locale} missing Diorama no-data copy`);
    });
}

if (failed > 0) {
    console.error(`${failed} world mode persistence test(s) failed`);
    process.exit(1);
}
console.log('world mode persistence: all tests passed');
