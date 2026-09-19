'use strict';
const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'webview/modules/10-game-state.js'), 'utf8');
const rendered = [];
const copied = [];
const escapeHtml = text => String(text ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
function element() {
  return { children: [], dataset: {}, classList: { add() {} },
    appendChild(child) { this.children.push(child); return child; } };
}
const context = vm.createContext({
  document: { createElement: element, querySelectorAll: () => [] },
  chatLog: { appendChild(div) { rendered.push(div); } },
  window: {},
  navigator: { clipboard: { writeText(text) { copied.push(text); return Promise.resolve(); } } },
  setTimeout() {},
  escapeHtml,
  getCharacterColor: () => '#fff',
  T: key => key,
  updateStartHubVisibility() {},
});
vm.runInContext(source, context);

function render(content, role = 'gm') {
  const entry = Object.freeze({ id: 'display-regression', role, sender: 'GM', content });
  const before = JSON.stringify(entry);
  context.renderMessage(entry);
  assert.equal(JSON.stringify(entry), before, 'rendering must not modify the entry supplied by history');
  const div = rendered.at(-1);
  const body = div.innerHTML.match(/<div class="msg-body">([\s\S]*)<\/div>$/)[1];
  return { div, body, entry };
}

// Use the actual accepted JSON from the reported UI failure, not a separately escaped approximation.
const rawReply = fs.readFileSync(path.join(root, 'docs/assets/npc-identity-v1.89.5/main-31-fixed/reply.txt'), 'utf8');
const accepted = JSON.parse(rawReply.match(/```json\s*([\s\S]*?)```/)[1]).entries[0];
const observed = render(accepted.content);
assert(accepted.content.includes('\\n\\n'), 'evidence must contain literal escaped paragraphs after JSON parsing');
assert.equal(observed.body, escapeHtml(accepted.content.split('\\n\\n').join('\n\n')));
assert(!observed.body.includes('\\n'), 'reported GM narrative renders as paragraphs');
const copyButton = observed.div.children.find(child => child.className === 'msg-actions').children[0];
copyButton.onclick();
assert.equal(copied.at(-1), accepted.content, 'Copy retains the original accepted content');

for (const content of ['第一段落。\n\n第二段落。', 'First.\r\n\r\nSecond.', '改行記号は \\n。', 'No paragraphs.']) {
  assert.equal(render(content).body, escapeHtml(content), 'normal newlines and intentional single escapes stay intact');
}
const malformed = '第一段落。\\n\\n第二段落。\\n\\n\\n第三段落。';
assert.equal(render(malformed).body, '第一段落。\n\n第二段落。\n\n\n第三段落。');
for (const role of ['user', 'system', 'assistant']) {
  assert.equal(render(malformed, role).body, escapeHtml(malformed), `${role} input must remain verbatim`);
}
for (const content of [
  '例: `"a\\n\\nb"`。\\n\\n次の説明。',
  '```js\nconst text = "a\\n\\nb";\n```\n次の説明。\\n\\n続き。',
  '~~~json\n{"text":"a\\n\\nb"}\n~~~',
  '    const text = "a\\n\\nb";',
  '```js\nconst unfinished = "a\\n\\nb";',
  String.raw`C:\notes\n\n を開く。\n\n続き。`,
  String.raw`"C:\Users\A B\n\n" を開く。\n\n続き。`,
  String.raw`\\server\notes\n\n を開く。\n\n続き。`,
]) {
  assert.equal(render(content).body, escapeHtml(content), 'code or Windows-path-bearing GM messages stay verbatim');
}
assert.equal(render('前。\\n\\n<img src=x onerror=alert(1)>').body,
  '前。\n\n&lt;img src=x onerror=alert(1)&gt;', 'paragraph repair must still pass through HTML escaping');
assert.equal(render(String.raw`引用 \" とタブ \t。\n\n続き。`).body,
  String.raw`引用 \" とタブ \t。` + '\n\n続き。', 'other JSON-style escapes must not be decoded');

console.log('PASS GM narrative display: observed paragraphs, normal newlines, verbatim copy/history, role/code/path boundaries, HTML escaping.');

// Exercise restoration through the actual state applier and summary input listener.
// An absent summary must not remain editable and then be submitted back to the Host.
const nodes = new Map();
function restoredElement() {
  const classes = new Set();
  return { value: '', style: {}, children: [], listeners: {}, className: '',
    classList: { add(...names) { names.forEach(n => classes.add(n)); }, remove(...names) { names.forEach(n => classes.delete(n)); }, contains(n) { return classes.has(n); } },
    appendChild(child) { this.children.push(child); },
    set innerHTML(value) { this.children = []; },
    addEventListener(type, listener) { this.listeners[type] = listener; } };
}
const restoredNode = id => {
  if (!nodes.has(id)) nodes.set(id, restoredElement());
  return nodes.get(id);
};
const summaryMessages = [];
const restored = vm.createContext({
  document: { getElementById: restoredNode, createElement: restoredElement, querySelectorAll: () => [] },
  window: {}, messageHistory: [], seenHiddenDiceIds: new Set(), currentTheme: 'fantasy',
  bgLayer: restoredNode('background'), spriteLayer: restoredNode('sprite'), chatLog: restoredNode('chat'),
  vscode: { postMessage(message) { summaryMessages.push(message); } },
  saveState() {}, scrollToBottom() {},
});
vm.runInContext(source, restored);
restored.updateStatus = () => {};
restored.setGameOverOverlay = () => {};
const saga = fs.readFileSync(path.join(root, 'webview/modules/50-character-saga.js'), 'utf8');
const summaryListenerStart = saga.indexOf("document.getElementById('story-summary').addEventListener('input'");
assert(summaryListenerStart >= 0);
vm.runInContext(saga.slice(summaryListenerStart, saga.indexOf("document.getElementById('char-import-st-btn')", summaryListenerStart)), restored);
const prior = Object.freeze({ entries: [], summary: 'Removed future fact', background: 'removed-background.png', sprite: 'removed-portrait.png' });
restored.applyGameState(prior, true);
restored.applyGameState({ entries: [] }, false);
assert.equal(restoredNode('story-summary').value, prior.summary, 'partial updates keep omitted summary');
assert.equal(restored.bgLayer.style.backgroundImage, 'url("removed-background.png")', 'partial updates keep background');
assert.equal(restored.spriteLayer.children.length, 1, 'partial updates keep sprite');
restored.applyGameState({ entries: [] }, true);
assert.equal(restoredNode('story-summary').value, '', 'full restoration clears omitted summary');
assert.equal(restored.bgLayer.style.backgroundImage, '', 'full restoration clears omitted background');
assert.equal(restored.bgLayer.className, 'theme-fantasy', 'theme background replaces the removed scene');
assert.equal(restored.spriteLayer.children.length, 0, 'full restoration clears omitted sprite');
assert.equal(restored.spriteLayer.classList.contains('visible'), false);
const summaryNode = restoredNode('story-summary');
summaryNode.value += 'Player continuation';
summaryNode.listeners.input({ target: summaryNode });
assert.equal(summaryMessages.at(-1).type, 'updateSummary');
assert.equal(summaryMessages.at(-1).summary, 'Player continuation', 'removed text cannot leak through a later summary edit');
assert.equal(prior.summary, 'Removed future fact', 'display restoration does not rewrite saved source data');
restored.applyGameState({ entries: [], summary: 'Restored fact', background: 'restored.png', sprite: 'restored-portrait.png' }, true);
assert.equal(summaryNode.value, 'Restored fact', 'supplied restored values still apply');
assert.equal(restored.bgLayer.style.backgroundImage, 'url("restored.png")');
assert.equal(restored.spriteLayer.children.length, 1);
console.log('PASS full-history presentation restoration: clear absent summary/background/sprite, retain partial updates, prevent summary resubmission.');
