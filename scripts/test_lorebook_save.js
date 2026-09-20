#!/usr/bin/env node
'use strict';
const assert = require('assert'), fs = require('fs'), os = require('os'), path = require('path'), Module = require('module');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lr-lore-save-'));
const filename = path.resolve(__dirname, '../out/lorebookLoader.js');
const loaded = new Module(filename, module);
loaded.filename = filename;
loaded.paths = Module._nodeModulePaths(path.dirname(filename));
const originalLoad = Module._load;
Module._load = function(request, parent, isMain) {
  if (parent === loaded && request === './workspacePaths') return {
    getWorkspacePath: () => root,
    writeJsonAtomic: (p, v) => fs.writeFileSync(p, JSON.stringify(v)),
  };
  if (parent === loaded && request === './mods/modActivationGateHost') return { appendActiveModLorebookEntries: (_ws, e) => e };
  return originalLoad.call(this, request, parent, isMain);
};
try { loaded._compile(fs.readFileSync(filename, 'utf8'), filename); }
finally { Module._load = originalLoad; }
const { saveLorebookFromUi, loadLorebookForUi } = loaded.exports;
try {
  const pinned = { id: 'player-choice', label: 'Player agency', content: 'Wait for the player to decide.', keys: [], enabled: true, pinned: true };
  assert.strictEqual(saveLorebookFromUi([pinned]).ok, true, 'keywordless pinned instruction saves through production path');
  const before = fs.readFileSync(path.join(root, 'lorebook.json'), 'utf8');
  const restored = loadLorebookForUi().entries[0];
  assert.strictEqual(restored.pinned, true, 'pin survives disk reload');
  assert.deepStrictEqual(restored.keys, [], 'no artificial keyword is required');
  assert.strictEqual(restored.content, pinned.content);
  for (const invalid of [
    { ...pinned, pinned: false },
    { ...pinned, content: '' },
    { ...pinned, id: 'bad id!' },
  ]) {
    assert.strictEqual(saveLorebookFromUi([invalid]).ok, false, 'invalid edit is rejected');
    assert.strictEqual(fs.readFileSync(path.join(root, 'lorebook.json'), 'utf8'), before, 'failed save preserves prior bytes');
  }
  assert.strictEqual(saveLorebookFromUi([pinned, pinned]).ok, false, 'duplicate ids stay invalid');
  assert.strictEqual(saveLorebookFromUi([{ ...pinned, pinned: false, keys: ['choice'] }]).ok, true, 'ordinary keyed entries remain valid');
  console.log('All production Lorebook save tests passed.');
} finally {
  if (path.dirname(path.resolve(root)) !== path.resolve(os.tmpdir()) || !path.basename(root).startsWith('lr-lore-save-')) throw Error('unsafe cleanup');
  fs.rmSync(root, { recursive: true, force: true });
}
