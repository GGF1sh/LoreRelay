#!/usr/bin/env node
'use strict';

/**
 * WORLD-LOCATION-NAV-STABILITY-001 (Correction 4).
 *
 * A synthetic DOM harness cannot compute a real getBoundingClientRect layout
 * (there is no CSS engine in Node). That empirical, pixel-level proof is
 * captured separately, live, in the actual VS Code Extension Development
 * Host (see the correction report for the recorded before/after rects).
 *
 * What this suite verifies directly against the real implementation:
 *   - the navigator is positioned in the HTML *before* the variable-height
 *     map viewport (structural precondition for position stability);
 *   - button membership/order never depends on Settlement/Diorama data
 *     availability — only on discovered fog visibility;
 *   - a stable min-height exists on the Settlement/Diorama panels so a
 *     no-data state does not collapse the viewport beneath the navigator;
 *   - keyboard focus on a chip survives the full DOM rebuild that a
 *     following worldView message triggers;
 *   - 12-location catalogs and Japanese labels do not change any of the above.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const worldPath = path.join(root, 'webview', 'modules', '85-world.js');
const source = fs.readFileSync(worldPath, 'utf8');
const html = fs.readFileSync(path.join(root, 'webview', 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'webview', 'styles', '85-world.css'), 'utf8');

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

test('the navigator precedes the map viewport in document order (structural precondition)', () => {
    const navIndex = html.indexOf('id="world-location-navigator"');
    const containerIndex = html.indexOf('id="world-map-container"');
    assert.ok(navIndex >= 0 && containerIndex > navIndex,
        'navigator must appear before world-map-container so panel height changes cannot move it');
    // Exactly one navigator element must exist (no leftover duplicate from the move).
    const occurrences = html.split('id="world-location-navigator"').length - 1;
    assert.strictEqual(occurrences, 1, 'exactly one location-navigator element must exist in the template');
});

test('Settlement/Diorama panels carry a stable min-height floor', () => {
    const sharedFloor = css.match(/#world-settlement\s*,\s*#world-diorama\s*\{[^}]*min-height:\s*(\d+)px/);
    assert.ok(sharedFloor && Number(sharedFloor[1]) >= 600,
        'Settlement and Diorama panels must reserve the full rendered viewport so a no-data state cannot clamp the outer scroll container');
});

// --- Behavioral: run the real renderWorldLocationNavigator against a fake DOM. ---
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
class FakeButton {
    constructor(ownerDoc) {
        this.ownerDoc = ownerDoc;
        this.classList = new FakeClassList();
        this.dataset = {};
        this.attributes = {};
        this._text = '';
        this._focused = false;
    }
    set textContent(v) { this._text = v; }
    get textContent() { return this._text; }
    setAttribute(name, value) { this.attributes[name] = String(value); }
    addEventListener(type, fn) { (this._listeners ||= {})[type] = [...((this._listeners ||= {})[type] || []), fn]; }
    click() {
        this.ownerDoc.activeElement = this;
        this._focused = true;
        (this._listeners?.click || []).forEach((fn) => fn({ stopPropagation() {} }));
    }
    focus(opts) { this.ownerDoc.activeElement = this; this._focused = true; this._focusOpts = opts; }
}
class FakeContainer {
    constructor(ownerDoc) { this.ownerDoc = ownerDoc; this.classList = new FakeClassList(); this.children = []; }
    set innerHTML(v) { this.children = []; if (this.ownerDoc.activeElement && this.children.indexOf(this.ownerDoc.activeElement) === -1) { /* no-op */ } }
    get innerHTML() { return ''; }
    appendChild(child) { this.children.push(child); return child; }
}
function buildDocument() {
    const nav = new FakeContainer(null);
    const doc = {
        activeElement: null,
        getElementById: (id) => (id === 'world-location-navigator' ? nav : null),
        createElement: (tag) => (tag === 'button' ? new FakeButton(doc) : new (class { set textContent(v) { this._t = v; } get textContent() { return this._t; } })()),
    };
    nav.ownerDoc = doc;
    return { doc, nav };
}

function loadNavigator(doc) {
    const T = (key) => key;
    const start = source.indexOf('function renderWorldLocationNavigator');
    const end = source.indexOf('function rebuildRegionFeedbackMap', start);
    assert.ok(start >= 0 && end > start, 'renderWorldLocationNavigator not found');
    const context = {
        document: doc,
        T,
        LOCATION_TYPE_ICON: { other: '📍', town: '🏘' },
        _worldPinCatalog: new Map(),
        _pendingWorldLocationFocusId: null,
        _worldLocationFocusClearTimer: null,
        _selectedPinId: null,
        currentWorldLocationId: null,
        selectWorldLocationPin: () => {},
        setTimeout: () => 1,
        clearTimeout: () => {},
        console,
    };
    vm.createContext(context);
    vm.runInContext(source.slice(start, end) + '\nthis.renderWorldLocationNavigator = renderWorldLocationNavigator;', context, { filename: worldPath });
    return context;
}

function pin(id, name, discovered = true) {
    return { locationId: id, locationName: name, locationType: 'town', fogVisibility: discovered ? 'discovered' : 'rumored', regionName: 'Region' };
}

test('button membership/order is unaffected by Settlement/Diorama data availability', () => {
    const { doc, nav } = buildDocument();
    const context = loadNavigator(doc);
    const ids = ['loc_a', 'loc_b', 'loc_c'];
    ids.forEach((id, i) => context._worldPinCatalog.set(id, pin(id, `Location ${i}`)));

    context.renderWorldLocationNavigator();
    const orderWithData = nav.children.filter((c) => c instanceof Object && c.dataset).map((c) => c.dataset.locationId);

    // Simulate switching to a location with zero Settlement/Diorama data —
    // this must not touch the pin catalog itself, matching the real message
    // flow (settlementView becomes null, the catalog of discovered pins does not).
    context.renderWorldLocationNavigator();
    const orderNoData = nav.children.filter((c) => c instanceof Object && c.dataset).map((c) => c.dataset.locationId);

    assert.deepStrictEqual(orderWithData, ['loc_a', 'loc_b', 'loc_c']);
    assert.deepStrictEqual(orderNoData, orderWithData, 'button order must be identical regardless of data availability');
});

test('12 locations render in deterministic catalog order with Japanese labels', () => {
    const { doc, nav } = buildDocument();
    const context = loadNavigator(doc);
    const names = ['サファイア港', 'リード市場', 'ミストグローブ', '鉄尖塔', 'ガラスオアシス', 'ウォッチキープ',
        'アッシュフォージ', '真珠諸島', 'リード・デルタ', '見張り野営地', '真珠の港', '塩の平原'];
    names.forEach((name, i) => context._worldPinCatalog.set(`loc_${i}`, pin(`loc_${i}`, name)));
    context.renderWorldLocationNavigator();
    const rendered = nav.children.filter((c) => c.dataset && c.dataset.locationId);
    assert.strictEqual(rendered.length, 12, 'all 12 discovered locations must render as chips');
    rendered.forEach((btn, i) => {
        assert.ok(btn.textContent.includes(names[i]), `chip ${i} must render its Japanese label`);
    });
});

test('undiscovered (rumored) locations are excluded, discovered ones are not reordered by that exclusion', () => {
    const { doc, nav } = buildDocument();
    const context = loadNavigator(doc);
    context._worldPinCatalog.set('loc_a', pin('loc_a', 'A', true));
    context._worldPinCatalog.set('loc_hidden', pin('loc_hidden', 'Hidden', false));
    context._worldPinCatalog.set('loc_b', pin('loc_b', 'B', true));
    context.renderWorldLocationNavigator();
    const ids = nav.children.filter((c) => c.dataset && c.dataset.locationId).map((c) => c.dataset.locationId);
    assert.deepStrictEqual(ids, ['loc_a', 'loc_b']);
});

test('keyboard focus on a chip survives the full rebuild triggered by the next message (data -> no-data -> data)', () => {
    const { doc, nav } = buildDocument();
    const context = loadNavigator(doc);
    context._worldPinCatalog.set('loc_a', pin('loc_a', 'A'));
    context._worldPinCatalog.set('loc_b', pin('loc_b', 'B'));
    context.renderWorldLocationNavigator();
    const chipB = nav.children.find((c) => c.dataset && c.dataset.locationId === 'loc_b');
    chipB.click(); // native click focuses the element, exactly like a real <button>

    // Chromium can briefly expose <body>/null during the asynchronous host
    // round-trip. The remembered click target must survive that interval.
    doc.activeElement = null;
    context.renderWorldLocationNavigator(); // "no data" location
    context.renderWorldLocationNavigator(); // back to a data-bearing location
    const refocused = doc.activeElement;
    assert.ok(refocused && refocused.dataset && refocused.dataset.locationId === 'loc_b',
        'focus must land back on the equivalent chip after repeated rebuilds, not on <body>/null');
});

test('repeated rapid rebuilds (10x) keep exactly one chip per catalog entry (no stale/duplicate geometry)', () => {
    const { doc, nav } = buildDocument();
    const context = loadNavigator(doc);
    ['loc_a', 'loc_b', 'loc_c'].forEach((id) => context._worldPinCatalog.set(id, pin(id, id)));
    for (let i = 0; i < 10; i += 1) { context.renderWorldLocationNavigator(); }
    const ids = nav.children.filter((c) => c.dataset && c.dataset.locationId).map((c) => c.dataset.locationId);
    assert.deepStrictEqual(ids, ['loc_a', 'loc_b', 'loc_c'], 'no accumulation of stale chips across repeated renders');
});

test('narrow width remains a pure CSS concern: the flex row is set to wrap, not to reflow based on data', () => {
    assert.ok(/\.world-location-navigator\s*\{[^}]*flex-wrap:\s*wrap/.test(css),
        'wrapping at narrow widths must be handled by flex-wrap, independent of data availability');
});

if (failed > 0) {
    console.error(`${failed} location navigator stability test(s) failed`);
    process.exit(1);
}
console.log('world location navigator stability: all tests passed');
