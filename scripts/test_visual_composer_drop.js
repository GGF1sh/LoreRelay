'use strict';
const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

// Execute the real composer with a minimal bubbling DOM. The editor listeners
// below reproduce the bundled VS Code 1.136.1 preload's drag forwarding rules.
class Node {
  constructor(tag) { this.tag = tag; this.children = []; this.listeners = {}; this.hidden = false; this.dataset = {}; this.value = ''; this.elements = { namedItem: name => this.all().find(n => n.name === name) }; }
  all() { return this.children.flatMap(n => [n, ...n.all()]); }
  append(...nodes) { for (const n of nodes) { n.parent = this; this.children.push(n); } }
  replaceChildren(...nodes) { this.children = []; this.append(...nodes); }
  setAttribute() {}
  addEventListener(type, callback) { (this.listeners[type] ||= []).push(callback); }
  querySelectorAll(selector) { const tags = selector.split(',').map(x => x.trim()); return this.all().filter(n => tags.includes(n.tag)); }
  querySelector(selector) { return this.all().find(n => selector === '[data-close]' && n.dataset.close); }
  focus() {}
}
const win = new Node('window'), doc = new Node('document'), body = new Node('body');
win.append(doc); doc.append(body); doc.body = body;
doc.createElement = tag => new Node(tag);
doc.getElementById = () => null;
const messages = []; let decodeCount = 0;
class Reader {
  readAsDataURL() { this.result = 'data:image/png;base64,aW1hZ2U='; this.onload(); }
}
const context = { window: win, document: doc, currentLocale: 'ja', vscode: { postMessage: m => messages.push(m) }, bgLayer: null, shouldApplyGameStateUpdate: () => true, addSystemMessage() {}, setSceneBackground() {}, setTimeout, clearTimeout, queueMicrotask, createImageBitmap: async () => { decodeCount++; return { close() {} }; }, FileReader: Reader };
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../webview/modules/60a-visual-composer.js'), 'utf8'), context);
let forwarded = 0;
win.addEventListener('dragenter', e => { if (!e.defaultPrevented && e.dataTransfer.items.every(i => i.kind === 'file')) forwarded++; });
win.addEventListener('dragover', e => { e.preventDefault(); if (e.dataTransfer.items.every(i => i.kind === 'file')) forwarded++; });
win.addEventListener('drag', e => { e.preventDefault(); forwarded++; });
win.addEventListener('drop', () => { forwarded++; });
async function dispatch(target, type, files = [{ size: 5 }]) {
  const event = { type, dataTransfer: { files, items: files.map(() => ({ kind: 'file' })) }, defaultPrevented: false, stopped: false, preventDefault() { this.defaultPrevented = true; }, stopPropagation() { this.stopped = true; } };
  const pending = [];
  for (let n = target; n; n = n.parent) {
    for (const fn of n.listeners[type] || []) pending.push(fn(event));
    if (event.stopped) break;
  }
  await Promise.all(pending);
  return event;
}
(async () => {
  await dispatch(body, 'dragenter'); assert.equal(forwarded, 1, 'closed composer preserves editor behavior');
  win.visualComposer.open('turn-1');
  const requestId = messages.at(-1).requestId;
  const edits = Object.fromEntries(['scene','preserve','avoid','composition','style','aspectRatio','tags','negative','destination'].map(k => [k, '']));
  for (const fn of win.listeners.message) fn({ data: { type: 'visualComposer', requestId, brief: { id: 'brief-1', source: { content: 'published' }, edits }, prompt: 'prompt', valid: true, drafts: [], candidates: [] } });
  const drop = body.all().find(n => n.className === 'visual-drop');
  const formField = body.all().find(n => n.name === 'scene');
  for (const target of [body, formField, drop, drop.children[0]]) {
    for (const type of ['dragenter', 'dragover', 'drag']) {
      const e = await dispatch(target, type);
      assert(e.defaultPrevented && e.stopped, `${type} consumed across the open composer`);
    }
  }
  assert.equal(forwarded, 1, 'no editor overlay may start or update');
  const e = await dispatch(drop, 'drop');
  assert(e.stopped && e.defaultPrevented);
  assert.equal(decodeCount, 1);
  assert.equal(messages.at(-1).action, 'import');
  assert.equal(messages.at(-1).briefId, 'brief-1');
  assert.equal(messages.at(-1).data, 'aW1hZ2U=');
  assert.equal(forwarded, 1, 'handled drop does not reach editor');
  // While an upload is busy, another drop must not open an editor either.
  await dispatch(drop, 'drop'); assert.equal(decodeCount, 1); assert.equal(forwarded, 1);
  const close = body.all().find(n => n.dataset.close);
  close.listeners.click[0]();
  await dispatch(body, 'dragenter'); assert.equal(forwarded, 2);
  console.log('PASS visual composer drag lifecycle: target, child button, other fields, busy upload, closed editor behavior');
})().catch(e => { console.error(e); process.exitCode = 1; });
