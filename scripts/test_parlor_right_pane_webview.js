#!/usr/bin/env node
'use strict';

// PARLOR-RIGHT-PANE-001: keep the right shell and only filter its tabs.

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const tabsPath = path.join(root, 'webview', 'modules', '40-dice-calc-tabs.js');
const bootstrapPath = path.join(root, 'webview', 'modules', '90-bootstrap.js');
const layoutPath = path.join(root, 'webview', 'styles', '10-layout-chat.css');
const markupPath = path.join(root, 'webview', 'index.html');

function makeClassList(initial) {
    const values = new Set(initial || []);
    return {
        add(...names) { names.forEach((name) => values.add(name)); },
        remove(...names) { names.forEach((name) => values.delete(name)); },
        contains(name) { return values.has(name); },
        toggle(name, force) {
            const next = force === undefined ? !values.has(name) : !!force;
            if (next) { values.add(name); } else { values.delete(name); }
            return next;
        },
    };
}

function createTabHarness() {
    const ids = [
        'pane-status', 'pane-character', 'pane-inspector', 'pane-world', 'pane-lorebook',
        'pane-memory', 'pane-director', 'pane-party', 'pane-vehicles', 'pane-ooc',
    ];
    const buttons = ids.map((id) => ({
        dataset: { target: id },
        classList: makeClassList(id === 'pane-status' ? ['active'] : []),
        attributes: new Map(),
        style: { removeProperty() {} },
        tabIndex: 0,
        setAttribute(name, value) { this.attributes.set(name, String(value)); },
        getAttribute(name) { return this.attributes.get(name); },
    }));
    const panes = ids.map((id) => ({
        id,
        classList: makeClassList(id === 'pane-status' ? ['active'] : []),
        attributes: new Map(),
        style: { removeProperty() {} },
        scrollTop: 0,
        setAttribute(name, value) { this.attributes.set(name, String(value)); },
        getAttribute(name) { return this.attributes.get(name); },
    }));
    const statusArea = { dataset: {}, scrollTop: 0 };
    const elementById = new Map([...panes.map((pane) => [pane.id, pane]), ['status-area', statusArea]]);
    const document = {
        getElementById(id) { return elementById.get(id) || null; },
        querySelectorAll(selector) {
            if (selector === '#status-tabs .tab-btn') { return buttons; }
            if (selector === '#status-area .tab-pane') { return panes; }
            return [];
        },
        querySelector(selector) {
            if (selector === '#status-tabs .tab-btn.active') { return buttons.find((button) => button.classList.contains('active')) || null; }
            if (selector === '#status-area .tab-pane.active') { return panes.find((pane) => pane.classList.contains('active')) || null; }
            return null;
        },
    };
    const source = fs.readFileSync(tabsPath, 'utf8');
    const start = source.indexOf('function activateStatusPane');
    const end = source.indexOf('const statusTabs =', start);
    assert(start >= 0 && end > start, 'tab profile source boundary exists');
    const context = vm.createContext({ document, window: {}, vscode: { postMessage() {} }, console });
    vm.runInContext(source.slice(start, end), context, { filename: tabsPath });
    return { buttons, panes, statusArea, sync: context.window.syncStatusTabsForExperienceProfile };
}

function byTarget(buttons, target) {
    return buttons.find((button) => button.dataset.target === target);
}

function byId(panes, id) {
    return panes.find((pane) => pane.id === id);
}

function run() {
    const css = fs.readFileSync(layoutPath, 'utf8');
    const markup = fs.readFileSync(markupPath, 'utf8');
    const bootstrap = fs.readFileSync(bootstrapPath, 'utf8');
    assert(!/body\.profile-parlor\s+#status-area\s*[,\{]/.test(css), 'Parlor CSS must never blanket-hide #status-area');
    assert(/#status-tabs \.tab-btn\.profile-parlor-hidden/.test(css), 'Parlor CSS hides incompatible tabs explicitly');
    assert(/id="resizer"/.test(markup) && /id="status-area"/.test(markup), 'right pane shell remains in markup');
    assert(/syncStatusTabsForExperienceProfile\(experienceProfile\)/.test(bootstrap), 'profile updates synchronize tab availability once');

    const h = createTabHarness();
    assert.strictEqual(typeof h.sync, 'function', 'tab profile synchronizer is exposed');

    h.sync('campaign');
    assert(!h.buttons.some((button) => button.classList.contains('profile-parlor-hidden')), 'Campaign restores all tab buttons');
    assert.strictEqual(byTarget(h.buttons, 'pane-status').classList.contains('active'), true, 'Campaign preserves normal status tab');

    h.sync('parlor');
    const allowed = ['pane-character', 'pane-lorebook', 'pane-memory', 'pane-ooc'];
    const blocked = ['pane-status', 'pane-inspector', 'pane-world', 'pane-director', 'pane-party', 'pane-vehicles'];
    for (const target of allowed) {
        assert(!byTarget(h.buttons, target).classList.contains('profile-parlor-hidden'), `${target} remains visible in Parlor`);
        assert.strictEqual(byTarget(h.buttons, target).tabIndex, 0, `${target} remains keyboard reachable`);
    }
    for (const target of blocked) {
        assert(byTarget(h.buttons, target).classList.contains('profile-parlor-hidden'), `${target} hides in Parlor`);
        assert.strictEqual(byTarget(h.buttons, target).tabIndex, -1, `${target} cannot receive tab focus`);
        assert(byId(h.panes, target).classList.contains('profile-parlor-hidden'), `${target} pane hides in Parlor`);
    }
    assert(byTarget(h.buttons, 'pane-character').classList.contains('active'), 'incompatible active Status falls back to Character Profile');
    assert(byId(h.panes, 'pane-character').classList.contains('active'), 'matching Character Profile pane becomes active');
    assert.strictEqual(h.statusArea.dataset.activePane, 'pane-character', 'right pane records the fallback pane');

    h.sync('campaign');
    h.sync('parlor');
    h.sync('campaign');
    h.sync('parlor');
    // An already allowed selection remains selected during a Parlor profile update.
    byTarget(h.buttons, 'pane-lorebook').classList.add('active');
    byTarget(h.buttons, 'pane-character').classList.remove('active');
    byId(h.panes, 'pane-lorebook').classList.add('active');
    byId(h.panes, 'pane-character').classList.remove('active');
    h.sync('parlor');
    assert(byTarget(h.buttons, 'pane-lorebook').classList.contains('active'), 'allowed active tab survives Parlor sync');

    h.sync('campaign');
    assert(!h.buttons.some((button) => button.classList.contains('profile-parlor-hidden')), 'leaving Parlor restores normal availability');

    const clampSource = bootstrap.slice(bootstrap.indexOf('function clampStatusPaneWidth'), bootstrap.indexOf("window.addEventListener('DOMContentLoaded'", bootstrap.indexOf('function clampStatusPaneWidth')));
    const clampContext = vm.createContext({ Number, Math });
    vm.runInContext(`${clampSource}; this.clamp = clampStatusPaneWidth;`, clampContext, { filename: bootstrapPath });
    assert.strictEqual(clampContext.clamp(0), 60, 'zero persisted width is clamped to the existing minimum');
    assert.strictEqual(clampContext.clamp('invalid'), 320, 'invalid persisted width falls back safely');
    assert.strictEqual(clampContext.clamp(9999), 800, 'oversized persisted width is clamped to the existing maximum');

    console.log('Parlor right-pane Webview regression tests passed.');
}

try {
    run();
} catch (error) {
    console.error(error.stack || error);
    process.exit(1);
}
