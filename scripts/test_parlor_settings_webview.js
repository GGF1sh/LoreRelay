#!/usr/bin/env node
'use strict';

// PARLOR-SETTINGS-CLOSE-001: availability must never force the panel open.

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const modulePath = path.join(root, 'webview', 'modules', '87-parlor-settings.js');
const bootstrapPath = path.join(root, 'webview', 'modules', '90-bootstrap.js');
const markupPath = path.join(root, 'webview', 'index.html');

function makeClassList(initial) {
    const classes = new Set(initial || []);
    return {
        add(...names) { names.forEach((name) => classes.add(name)); },
        remove(...names) { names.forEach((name) => classes.delete(name)); },
        contains(name) { return classes.has(name); },
        toggle(name, force) {
            const next = force === undefined ? !classes.has(name) : !!force;
            if (next) { classes.add(name); } else { classes.delete(name); }
            return next;
        },
    };
}

function makeElement(id, classes) {
    const listeners = new Map();
    return {
        id,
        classList: makeClassList(classes),
        attributes: new Map(),
        value: '',
        focusCount: 0,
        addEventListener(type, handler) {
            if (!listeners.has(type)) { listeners.set(type, []); }
            listeners.get(type).push(handler);
        },
        click() {
            for (const handler of listeners.get('click') || []) {
                handler({ preventDefault() {} });
            }
        },
        setAttribute(name, value) { this.attributes.set(name, String(value)); },
        getAttribute(name) { return this.attributes.get(name); },
        focus() { this.focusCount++; },
    };
}

function createHarness() {
    const elements = new Map();
    const documentListeners = new Map();
    const windowListeners = new Map();
    const postMessages = [];
    const add = (id, classes) => {
        const el = makeElement(id, classes);
        elements.set(id, el);
        return el;
    };

    const settingsButton = add('parlor-settings-btn');
    const panel = add('parlor-settings-panel', ['img-gen-panel', 'hidden']);
    const backdrop = add('parlor-settings-backdrop', ['img-gen-backdrop', 'hidden']);
    const closeButton = add('parlor-settings-panel-close');
    const connection = add('parlor-connection-select');
    const personaName = add('parlor-persona-name');
    const personaDesc = add('parlor-persona-description');
    const personaStyle = add('parlor-persona-style');
    add('parlor-persona-save-btn');
    add('parlor-persona-saved', ['hidden']);
    add('parlor-bg-gallery');
    add('parlor-bg-hint', ['hidden']);
    add('parlor-promote-btn');
    panel.setAttribute('aria-hidden', 'true');
    backdrop.setAttribute('aria-hidden', 'true');

    const document = {
        getElementById(id) { return elements.get(id) || null; },
        addEventListener(type, handler) {
            if (!documentListeners.has(type)) { documentListeners.set(type, []); }
            documentListeners.get(type).push(handler);
        },
    };
    const window = {
        addEventListener(type, handler) {
            if (!windowListeners.has(type)) { windowListeners.set(type, []); }
            windowListeners.get(type).push(handler);
        },
    };
    const context = vm.createContext({
        document,
        window,
        vscode: { postMessage(message) { postMessages.push(message); } },
        T(key) { return key; },
        bgLayer: null,
        setTimeout() { return 0; },
        clearTimeout() {},
    });
    vm.runInContext(fs.readFileSync(modulePath, 'utf8'), context, { filename: modulePath });
    return {
        settingsButton,
        panel,
        backdrop,
        closeButton,
        connection,
        personaName,
        personaDesc,
        personaStyle,
        postMessages,
        setAvailability: window.setParlorSettingsPanelAvailability,
        keydown(key) {
            const event = { key, prevented: false, preventDefault() { this.prevented = true; } };
            for (const handler of documentListeners.get('keydown') || []) { handler(event); }
            return event;
        },
    };
}

function assertClosed(h, label) {
    assert(h.panel.classList.contains('hidden'), `${label}: panel must be hidden`);
    assert(h.backdrop.classList.contains('hidden'), `${label}: backdrop must be hidden`);
    assert.strictEqual(h.panel.getAttribute('aria-hidden'), 'true', `${label}: panel aria-hidden`);
    assert.strictEqual(h.backdrop.getAttribute('aria-hidden'), 'true', `${label}: backdrop aria-hidden`);
}

function open(h) {
    h.settingsButton.click();
    assert(!h.panel.classList.contains('hidden'), 'launcher click opens panel');
    assert(!h.backdrop.classList.contains('hidden'), 'launcher click opens backdrop');
    assert.strictEqual(h.panel.getAttribute('aria-hidden'), 'false', 'open panel aria-hidden');
    assert.strictEqual(h.backdrop.getAttribute('aria-hidden'), 'false', 'open backdrop aria-hidden');
}

function run() {
    const markup = fs.readFileSync(markupPath, 'utf8');
    const bootstrap = fs.readFileSync(bootstrapPath, 'utf8');
    assert(/id="parlor-settings-wrap" class="profile-parlor-only"/.test(markup), 'launcher keeps Parlor-only availability gate');
    assert(/id="parlor-settings-panel" class="img-gen-panel hidden" aria-hidden="true"/.test(markup), 'panel is initially hidden without profile-parlor-only');
    assert(!/id="parlor-settings-panel"[^>]*profile-parlor-only/.test(markup), 'generic profile class cannot override panel hidden state');
    assert(/setParlorSettingsPanelAvailability\(experienceProfile === 'parlor'\)/.test(bootstrap), 'profile sync closes panel outside Parlor without opening it inside Parlor');

    const h = createHarness();
    assertClosed(h, 'initial load');
    h.setAvailability(true);
    assertClosed(h, 'entering Parlor');

    h.connection.value = 'clipboard-profile';
    h.personaName.value = 'Player';
    h.personaDesc.value = 'Keep this description';
    h.personaStyle.value = 'calm';
    open(h);
    assert(h.postMessages.some((message) => message.type === 'requestParlorSettings'), 'opening requests current settings');
    h.closeButton.click();
    assertClosed(h, 'close button');
    assert.strictEqual(h.settingsButton.focusCount, 1, 'close returns focus to launcher');
    assert.strictEqual(h.connection.value, 'clipboard-profile', 'close does not reset connection');
    assert.strictEqual(h.personaName.value, 'Player', 'close does not reset persona name');
    assert.strictEqual(h.personaDesc.value, 'Keep this description', 'close does not reset persona description');
    assert.strictEqual(h.personaStyle.value, 'calm', 'close does not reset persona style');

    open(h);
    h.backdrop.click();
    assertClosed(h, 'backdrop click');

    open(h);
    const escape = h.keydown('Escape');
    assert(escape.prevented, 'Escape prevents default while closing the open panel');
    assertClosed(h, 'Escape');

    h.setAvailability(true);
    assertClosed(h, 'Parlor profile update after close');
    h.setAvailability(false);
    assertClosed(h, 'switch away from Parlor');
    h.setAvailability(true);
    assertClosed(h, 'switch back to Parlor');

    const reloaded = createHarness();
    assertClosed(reloaded, 'reload-style initialization');
    console.log('Parlor settings Webview regression tests passed.');
}

try {
    run();
} catch (error) {
    console.error(error.stack || error);
    process.exit(1);
}
