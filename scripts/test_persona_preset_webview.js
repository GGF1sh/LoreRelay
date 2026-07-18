#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const root = path.join(__dirname, '..');
const modulePath = path.join(root, 'webview', 'modules', '87-parlor-settings.js');

function classList(initial) { const values = new Set(initial || []); return { add(...v) { v.forEach((x) => values.add(x)); }, remove(...v) { v.forEach((x) => values.delete(x)); }, contains(v) { return values.has(v); }, toggle(v, on) { if (on) values.add(v); else values.delete(v); } }; }
function element(id, classes) { const listeners = new Map(); return { id, classList: classList(classes), attributes: new Map(), children: [], value: '', disabled: false, addEventListener(type, fn) { if (!listeners.has(type)) listeners.set(type, []); listeners.get(type).push(fn); }, emit(type, event = {}) { for (const fn of listeners.get(type) || []) fn(event); }, appendChild(child) { this.children.push(child); return child; }, setAttribute(k, v) { this.attributes.set(k, String(v)); }, getAttribute(k) { return this.attributes.get(k); }, removeAttribute(k) { this.attributes.delete(k); }, focus() {} }; }

const elements = new Map(); const listeners = new Map(); const messages = [];
const add = (id, classes) => { const node = element(id, classes); elements.set(id, node); return node; };
[
    'parlor-settings-btn', 'parlor-settings-panel', 'parlor-settings-backdrop', 'parlor-settings-panel-close', 'parlor-connection-select', 'parlor-character-select', 'parlor-import-character-btn', 'parlor-edit-character-btn',
    'parlor-persona-name', 'parlor-persona-description', 'parlor-persona-style', 'parlor-persona-preset-select', 'parlor-persona-from-character-btn', 'parlor-persona-import-json-btn', 'parlor-persona-apply-btn', 'parlor-persona-save-new-btn', 'parlor-persona-update-btn', 'parlor-persona-saved', 'parlor-bg-gallery', 'parlor-bg-hint', 'parlor-promote-btn', 'parlor-campaign-fresh-wrap', 'parlor-campaign-frozen-wrap', 'parlor-campaign-empty-hint', 'parlor-resume-campaign-btn', 'parlor-fresh-campaign-btn'
].forEach((id) => add(id, id.includes('panel') || id.includes('backdrop') ? ['hidden'] : []));
const document = { getElementById(id) { return elements.get(id) || null; }, addEventListener() {}, createElement() { return element('option'); } };
const window = { addEventListener(type, fn) { if (!listeners.has(type)) listeners.set(type, []); listeners.get(type).push(fn); } };
vm.runInContext(fs.readFileSync(modulePath, 'utf8'), vm.createContext({ document, window, vscode: { postMessage(m) { messages.push(m); } }, T(k) { return k; }, bgLayer: null, setTimeout() { return 1; }, clearTimeout() {} }), { filename: modulePath });
const receive = (data) => { for (const fn of listeners.get('message') || []) fn({ data }); };

receive({ type: 'parlorSettings', characters: [{ id: 'speaker', name: 'Speaker' }], activeCharacterId: 'speaker', connectionProfiles: [], backgrounds: [], persona: { name: 'Current' }, personaPresets: [{ id: 'traveler', displayName: 'Traveler' }], activePersonaId: 'traveler', campaignTransition: {} });
assert.strictEqual(elements.get('parlor-persona-preset-select').value, 'traveler', 'active preset renders');
elements.get('parlor-persona-preset-select').value = 'traveler'; elements.get('parlor-persona-preset-select').emit('change');
assert(messages.some((m) => m.type === 'selectParlorPersonaPreset' && m.id === 'traveler'), 'dropdown selects preset through host');
elements.get('parlor-persona-from-character-btn').emit('click'); elements.get('parlor-persona-import-json-btn').emit('click');
assert(messages.some((m) => m.type === 'createParlorPersonaFromCharacter') && messages.some((m) => m.type === 'importParlorPersonaJson'), 'draft actions use dedicated host paths');
receive({ type: 'parlorPersonaDraft', persona: { name: 'Copied', description: 'Only text', speakingStyle: 'Calm' }, meta: { source: 'character-copy', sourceCharacterId: 'other' } });
assert.strictEqual(elements.get('parlor-persona-name').value, 'Copied', 'draft fills editable fields');
elements.get('parlor-persona-save-new-btn').emit('click');
assert(messages.some((m) => m.type === 'saveNewParlorPersonaPreset' && m.meta.sourceCharacterId === 'other'), 'save-new keeps informational provenance only');
assert.strictEqual(elements.get('parlor-character-select').value, 'speaker', 'persona operations do not change the conversation character selector');
assert(!messages.some((m) => m.type === 'switchParlorCharacter'), 'persona actions never request a character switch');
console.log('Persona preset Webview tests passed.');
