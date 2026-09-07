'use strict';
const assert = require('assert/strict');
const vm = require('vm');
const { CHAT_NATIVE_CARD_HTML } = require('../out/chatNativeCard');
const elements = new Map();
const node = () => ({ textContent: '', hidden: true, children: [],
    replaceChildren() { this.children = []; }, append(child) { this.children.push(child); },
    set innerHTML(_) { throw new Error('untrusted HTML insertion'); } });
const document = { getElementById(id) { if (!elements.has(id)) elements.set(id, node()); return elements.get(id); }, createElement: node };
const sent = [];
let receive;
const parent = { postMessage(message) { sent.push(message); } };
const window = { parent, addEventListener(name, handler) { if (name === 'message') receive = handler; } };
const source = CHAT_NATIVE_CARD_HTML.match(/<script>([\s\S]*?)<\/script>/)[1];
vm.runInNewContext(source, { window, document }, { timeout: 1000 });
assert.equal(sent[0].method, 'ui/initialize');
const message = { jsonrpc: '2.0', method: 'ui/notifications/tool-result', params: { structuredContent: { view: {
    worldTurn: 42, currentLocationId: '<img src=x onerror=alert(1)>', commerce: { credits: 12, cargo: [{ commodityId: '<script>', qty: 2 }] },
    availableActions: [{ actionId: 'commerce:end_day' }], recentEvents: [{ message: '<b>public text</b>' }],
} } } };
receive({ source: {}, data: message });
assert.equal(elements.has('turn'), false, 'non-parent message ignored');
receive({ source: parent, data: message });
assert.equal(elements.get('turn').textContent, '42');
assert.equal(elements.get('location').textContent, '<img src=x onerror=alert(1)>');
assert.equal(elements.get('events').children[0].textContent, '<b>public text</b>');
assert.equal(elements.get('state').hidden, false);
receive({ source: parent, data: { ...message, params: { isError: true } } });
assert.equal(elements.get('state').hidden, true, 'failed read hides stale card');
assert(!sent.some(message => message.method === 'tools/call'), 'card must not initiate game or model calls');
assert(!CHAT_NATIVE_CARD_HTML.includes('localStorage'));
console.log('Chat card bridge/renderer: parent-only messages, public text rendering, failure state and no tool invocation passed. Actual ChatGPT rendering unverified.');
