#!/usr/bin/env node
'use strict';

// PARLOR-CAMPAIGN-CLARITY-001: Parlor Settings Campaign card rendering.

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const modulePath = path.join(root, 'webview', 'modules', '87-parlor-settings.js');
const markupPath = path.join(root, 'webview', 'index.html');
const enPath = path.join(root, 'locales', 'en.json');
const jaPath = path.join(root, 'locales', 'ja.json');

function classList(initial) {
    const values = new Set(initial || []);
    return {
        add(...items) { items.forEach((item) => values.add(item)); },
        remove(...items) { items.forEach((item) => values.delete(item)); },
        contains(item) { return values.has(item); },
        toggle(item, on) {
            const next = on === undefined ? !values.has(item) : !!on;
            if (next) values.add(item); else values.delete(item);
            return next;
        },
    };
}

function element(id, classes) {
    const listeners = new Map();
    return {
        id,
        classList: classList(classes),
        attributes: new Map(),
        children: [],
        value: '',
        disabled: false,
        title: '',
        addEventListener(type, handler) {
            if (!listeners.has(type)) listeners.set(type, []);
            listeners.get(type).push(handler);
        },
        emit(type, event = {}) {
            for (const handler of listeners.get(type) || []) handler(event);
        },
        appendChild(child) { this.children.push(child); return child; },
        setAttribute(name, value) { this.attributes.set(name, String(value)); },
        getAttribute(name) { return this.attributes.get(name); },
        removeAttribute(name) { this.attributes.delete(name); },
        focus() {},
    };
}

function createHarness() {
    const elements = new Map();
    const windowListeners = new Map();
    const messages = [];
    const add = (id, classes) => {
        const node = element(id, classes);
        elements.set(id, node);
        return node;
    };

    add('parlor-settings-btn');
    add('parlor-settings-panel', ['hidden']);
    add('parlor-settings-backdrop', ['hidden']);
    add('parlor-settings-panel-close');
    add('parlor-connection-select');
    add('parlor-character-select');
    add('parlor-import-character-btn');
    add('parlor-edit-character-btn');
    add('parlor-persona-name');
    add('parlor-persona-description');
    add('parlor-persona-style');
    add('parlor-persona-save-btn');
    add('parlor-persona-saved', ['hidden']);
    add('parlor-bg-gallery');
    add('parlor-bg-hint', ['hidden']);
    const promoteBtn = add('parlor-promote-btn');
    const freshWrap = add('parlor-campaign-fresh-wrap');
    const frozenWrap = add('parlor-campaign-frozen-wrap', ['hidden']);
    const emptyHint = add('parlor-campaign-empty-hint', ['hidden']);
    const resumeBtn = add('parlor-resume-campaign-btn');
    const freshBtn = add('parlor-fresh-campaign-btn');

    const document = {
        getElementById(id) { return elements.get(id) || null; },
        addEventListener() {},
        createElement() { return element('option'); },
    };
    const window = {
        addEventListener(type, handler) {
            if (!windowListeners.has(type)) windowListeners.set(type, []);
            windowListeners.get(type).push(handler);
        },
    };

    vm.runInContext(
        fs.readFileSync(modulePath, 'utf8'),
        vm.createContext({
            document,
            window,
            vscode: { postMessage(message) { messages.push(message); } },
            T(key) { return key; },
            bgLayer: null,
            setTimeout() { return 1; },
            clearTimeout() {},
        }),
        { filename: modulePath }
    );

    return {
        promoteBtn,
        freshWrap,
        frozenWrap,
        emptyHint,
        resumeBtn,
        freshBtn,
        messages,
        receive(message) {
            for (const handler of windowListeners.get('message') || []) {
                handler({ data: message });
            }
        },
    };
}

function baseSettings(transition) {
    return {
        type: 'parlorSettings',
        characters: [{ id: 'alice', name: 'Alice' }],
        activeCharacterId: 'alice',
        connectionProfiles: [],
        backgrounds: [],
        persona: {},
        campaignTransition: transition,
    };
}

function run() {
    const markup = fs.readFileSync(markupPath, 'utf8');
    const en = JSON.parse(fs.readFileSync(enPath, 'utf8'));
    const ja = JSON.parse(fs.readFileSync(jaPath, 'utf8'));

    assert(/id="parlor-campaign-card"/.test(markup), 'campaign card section exists');
    assert(/id="parlor-resume-campaign-btn"/.test(markup), 'resume button exists');
    assert(/id="parlor-fresh-campaign-btn"/.test(markup), 'fresh frozen-path button exists');
    assert(/data-i18n="webview.parlor.promoteDetailsSummary"/.test(markup), 'details expander exists');
    assert(
        !/Promote to Campaign/.test(markup) || /Start an adventure with this character/.test(markup),
        'markup primary copy uses adventure wording'
    );
    assert(!/昇格/.test(ja['webview.parlor.promoteButton']), 'JA locale primary label drops 昇格');
    assert(
        /Start an adventure with this character/.test(en['webview.parlor.promoteButton']),
        'EN locale primary label updated'
    );

    // no state + non-empty
    {
        const h = createHarness();
        h.receive(baseSettings({
            hasGameState: false,
            hasFrozenCampaign: false,
            parlorMessageCount: 2,
            canCreateFresh: true,
            canResumeFrozen: false,
        }));
        assert(h.freshWrap.classList.contains('hidden') === false, 'fresh wrap visible');
        assert(h.frozenWrap.classList.contains('hidden'), 'frozen wrap hidden');
        assert.strictEqual(h.promoteBtn.disabled, false, 'fresh enabled');
        assert(h.emptyHint.classList.contains('hidden'), 'empty hint hidden when can create');
        h.promoteBtn.emit('click');
        assert(
            h.messages.some((m) => m.type === 'promoteParlor' && m.intent === 'fresh'),
            'fresh click posts promoteParlor intent=fresh'
        );
    }

    // no state + empty
    {
        const h = createHarness();
        h.receive(baseSettings({
            hasGameState: false,
            hasFrozenCampaign: false,
            parlorMessageCount: 0,
            canCreateFresh: false,
            canResumeFrozen: false,
        }));
        assert.strictEqual(h.promoteBtn.disabled, true, 'fresh disabled when empty');
        assert(h.emptyHint.classList.contains('hidden') === false, 'empty hint shown');
        h.promoteBtn.emit('click');
        assert(
            !h.messages.some((m) => m.type === 'promoteParlor'),
            'disabled fresh does not post promote'
        );
    }

    // frozen + empty
    {
        const h = createHarness();
        h.receive(baseSettings({
            hasGameState: true,
            hasFrozenCampaign: true,
            parlorMessageCount: 0,
            canCreateFresh: false,
            canResumeFrozen: true,
        }));
        assert(h.freshWrap.classList.contains('hidden'), 'single fresh wrap hidden when frozen');
        assert(h.frozenWrap.classList.contains('hidden') === false, 'frozen wrap visible');
        assert.strictEqual(h.resumeBtn.disabled, false, 'resume enabled when empty');
        assert.strictEqual(h.freshBtn.disabled, true, 'fresh disabled when empty+frozen');
        h.resumeBtn.emit('click');
        assert(
            h.messages.some((m) => m.type === 'promoteParlor' && m.intent === 'resume'),
            'resume posts intent=resume'
        );
    }

    // frozen + non-empty
    {
        const h = createHarness();
        h.receive(baseSettings({
            hasGameState: true,
            hasFrozenCampaign: true,
            parlorMessageCount: 4,
            canCreateFresh: true,
            canResumeFrozen: true,
        }));
        assert.strictEqual(h.resumeBtn.disabled, false, 'resume enabled');
        assert.strictEqual(h.freshBtn.disabled, false, 'fresh enabled with messages');
        h.freshBtn.emit('click');
        assert(
            h.messages.some((m) => m.type === 'promoteParlor' && m.intent === 'fresh'),
            'frozen-path fresh posts intent=fresh'
        );
    }

    // existing non-frozen + non-empty
    {
        const h = createHarness();
        h.receive(baseSettings({
            hasGameState: true,
            hasFrozenCampaign: false,
            parlorMessageCount: 1,
            canCreateFresh: true,
            canResumeFrozen: false,
        }));
        assert(h.frozenWrap.classList.contains('hidden'), 'no frozen UI without freeze');
        assert.strictEqual(h.promoteBtn.disabled, false, 'fresh still available with existing state');
    }

    // Settings module still does not touch free-input draft.
    assert(
        !/free-input|inputText|player-input/.test(fs.readFileSync(modulePath, 'utf8')),
        'campaign card never reads free-input draft'
    );

    console.log('parlor campaign transition webview: all tests passed.');
}

try {
    run();
} catch (error) {
    console.error(error.stack || error);
    process.exit(1);
}
