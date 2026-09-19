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
