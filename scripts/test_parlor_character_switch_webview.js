#!/usr/bin/env node
'use strict';

// PARLOR-CHARACTER-SWITCH-001: both selectors wait for host acceptance.

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const settingsPath = path.join(root, 'webview', 'modules', '87-parlor-settings.js');
const characterPath = path.join(root, 'webview', 'modules', '50-character-saga.js');
const markupPath = path.join(root, 'webview', 'index.html');

function classList(initial) {
    const values = new Set(initial || []);
    return { add(...items) { items.forEach((item) => values.add(item)); }, remove(...items) { items.forEach((item) => values.delete(item)); }, contains(item) { return values.has(item); }, toggle(item, on) { if (on) values.add(item); else values.delete(item); } };
}

function element(id, classes) {
    const listeners = new Map();
    return {
        id, classList: classList(classes), attributes: new Map(), children: [], value: '', disabled: false,
        addEventListener(type, handler) { if (!listeners.has(type)) listeners.set(type, []); listeners.get(type).push(handler); },
        emit(type, event = {}) { for (const handler of listeners.get(type) || []) handler(event); },
        appendChild(child) { this.children.push(child); return child; },
        setAttribute(name, value) { this.attributes.set(name, String(value)); },
        getAttribute(name) { return this.attributes.get(name); },
        focus() {},
    };
}

function createHarness() {
    const elements = new Map();
    const windowListeners = new Map();
    const messages = [];
    const add = (id, classes) => { const node = element(id, classes); elements.set(id, node); return node; };
    const characterSelect = add('parlor-character-select');
    const importButton = add('parlor-import-character-btn');
    const editButton = add('parlor-edit-character-btn');
    add('parlor-settings-btn'); add('parlor-settings-panel', ['hidden']); add('parlor-settings-backdrop', ['hidden']); add('parlor-settings-panel-close');
    add('parlor-connection-select'); add('parlor-persona-name'); add('parlor-persona-description'); add('parlor-persona-style'); add('parlor-persona-save-btn'); add('parlor-persona-saved', ['hidden']); add('parlor-bg-gallery'); add('parlor-bg-hint', ['hidden']); add('parlor-promote-btn');
    const document = {
        getElementById(id) { return elements.get(id) || null; },
        addEventListener() {},
        createElement() { return element('option'); },
    };
    const window = {
        currentCharacters: [{ id: 'alice', name: 'Alice', description: 'full profile' }, { id: 'bob', name: 'Bob', description: 'full profile' }],
        addEventListener(type, handler) { if (!windowListeners.has(type)) windowListeners.set(type, []); windowListeners.get(type).push(handler); },
    };
    vm.runInContext(fs.readFileSync(settingsPath, 'utf8'), vm.createContext({ document, window, vscode: { postMessage(message) { messages.push(message); } }, T(key) { return key; }, bgLayer: null, setTimeout() { return 1; }, clearTimeout() {} }), { filename: settingsPath });
    return {
        characterSelect, importButton, editButton, messages, window,
        receive(message) { for (const handler of windowListeners.get('message') || []) handler({ data: message }); },
    };
}

function run() {
    const characterSource = fs.readFileSync(characterPath, 'utf8');
    const markup = fs.readFileSync(markupPath, 'utf8');
    assert(/experienceProfile === 'parlor'[\s\S]*type: 'switchParlorCharacter'/.test(characterSource),
        'right-pane Character Profile selector uses the canonical Parlor switch message');
    assert(/charSelect\.value = activeCharId \|\| 'new'/.test(characterSource),
        'right-pane selector restores the actual active character until host acceptance');
    assert(/id="parlor-character-select"/.test(markup) && /id="parlor-import-character-btn"/.test(markup) && /id="parlor-edit-character-btn"/.test(markup),
        'settings drawer provides the compact character controls');

    const h = createHarness();
    h.receive({ type: 'parlorSettings', characters: [{ id: 'alice', name: 'Alice' }, { id: 'bob', name: 'Bob' }], activeCharacterId: 'alice', connectionProfiles: [], backgrounds: [] });
    assert.strictEqual(h.characterSelect.value, 'alice', 'settings selector reflects active A');
    h.characterSelect.value = 'bob';
    h.characterSelect.emit('change');
    assert.strictEqual(h.characterSelect.value, 'alice', 'pending/rejected settings selection restores A');
    assert(h.messages.some((message) => message.type === 'switchParlorCharacter' && message.id === 'bob'),
        'settings selector requests the same canonical switch');
    h.receive({ type: 'parlorSettings', characters: [{ id: 'alice', name: 'Alice' }, { id: 'bob', name: 'Bob' }], activeCharacterId: 'bob', connectionProfiles: [], backgrounds: [] });
    assert.strictEqual(h.characterSelect.value, 'bob', 'host acceptance synchronizes the settings selector');
    h.importButton.emit('click');
    assert(h.messages.some((message) => message.type === 'importParlorTavernCard'), 'settings import uses the Parlor import path');
    let edited;
    h.window.openCharacterCreator = (character) => { edited = character; };
    h.editButton.emit('click');
    assert.strictEqual(edited?.id, 'bob', 'settings edit reuses the existing full Character Profile editor');
    assert(!/free-input|inputText|player-input/.test(fs.readFileSync(settingsPath, 'utf8')), 'settings switching never reads or sends the free-input draft');

    console.log('Parlor character-switch Webview regression tests passed.');
}

try {
    run();
} catch (error) {
    console.error(error.stack || error);
    process.exit(1);
}
