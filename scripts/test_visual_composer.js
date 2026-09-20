'use strict';
const assert = require('assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');
const core = require('../out/visualComposerCore');
const { VisualComposerStore } = require('../out/visualComposerStore');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lorerelay-visual-test-'));
let workspace = root, scope = { campaignInstanceId: 'campaign', timelineEpochId: 'epoch' };
let entries = [{ id: 'turn-1', role: 'gm', content: '公開された港町。'.repeat(300), secret: 'GM_SECRET', imagePrompt: 'PRIVATE_PROMPT' }, { id: 'user-1', role: 'user', content: 'UNACCEPTED' }];
let clipboard, openDialog = async () => [], exportUri;
const messages = [];
const panel = { webview: { postMessage: async m => { messages.push(m); } } };
const originalLoad = Module._load;
Module._load = function(request, parent, ...rest) {
  if (parent?.filename.endsWith('visualComposerHost.js')) {
    if (request === 'vscode') return { env: { clipboard: { writeText: async text => { clipboard = text; } } }, window: { showOpenDialog: (...args) => openDialog(...args), showSaveDialog: async () => exportUri }, Uri: { file: fsPath => ({ fsPath }), joinPath: (uri, name) => ({ fsPath: path.join(uri.fsPath, name) }) }, workspace: { fs: { writeFile: async (uri, bytes) => fs.writeFileSync(uri.fsPath, bytes) } } };
    if (request === './workspacePaths') return { getWorkspacePath: () => workspace };
    if (request === './acceptedTurnReplayGuard') return { loadExistingAcceptedTurnScope: () => scope, getAcceptedTurnLedgerPath: () => path.join(root, 'no-ledger.json') };
    if (request === './gameStateSync') return { getGameEntryHistory: () => entries, safeImageUri: file => `file://${file}` };
  }
  return originalLoad.call(this, request, parent, ...rest);
};
const { visualComposerHandle } = require('../out/visualComposerHost');
Module._load = originalLoad;
const request = async (action, data = {}) => { messages.length = 0; await visualComposerHandle({ action, ...data }, panel); assert.equal(messages.length, 1); return messages[0]; };
const good = response => { assert.equal(response.error, undefined, response.error); return response; };
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j0ioAAAAASUVORK5CYII=', 'base64');

(async () => {
  const canonical = ['game_state.json', 'game_history.json', 'visual_memory.json'];
  for (const file of canonical) fs.writeFileSync(path.join(root, file), JSON.stringify({ secret: 'GM_SECRET', equipment: ['sword'], gold: 99 }));
  const before = canonical.map(file => fs.readFileSync(path.join(root, file), 'utf8'));
  assert((await request('open', { entryId: 'user-1' })).error);
  assert((await request('open', { entryId: '../game_state' })).error);
  const initial = good(await request('open', { entryId: 'turn-1', source: { content: 'FORGED' } }));
  const briefId = initial.brief.id;
  assert.equal(initial.brief.source.content, entries[0].content);
  assert(initial.prompt.length > 300);
  for (const forbidden of ['GM_SECRET', 'PRIVATE_PROMPT', 'UNACCEPTED', 'FORGED']) assert(!JSON.stringify(initial).includes(forbidden));
  assert.equal(initial.brief.edits.aspectRatio, '16:9');
  let edits = { ...initial.brief.edits, scene: '赤い塔を背景に', preserve: '黒髪', destination: 'ChatGPT', tags: 'harbor, sunset', negative: 'text, watermark' };
  good(await request('save', { briefId, edits }));
  assert.equal(new VisualComposerStore(root).read().drafts[0].source.content, entries[0].content);
  good(await request('copy', { briefId, edits })); assert(clipboard.includes(edits.scene)); assert(clipboard.includes(entries[0].content));
  exportUri = { fsPath: path.join(root, 'export.txt') };
  good(await request('export', { briefId, edits })); assert.equal(fs.readFileSync(exportUri.fsPath, 'utf8'), clipboard);
  good(await request('preview', { briefId, edits: { ...edits, scene: 'UNSAVED' } }));
  assert.equal(new VisualComposerStore(root).read().drafts[0].edits.scene, edits.scene);
  assert((await request('save', { briefId, edits: { ...edits, aspectRatio: 'inject' } })).error);
  assert((await request('import', { briefId, edits, data: 'bad input' })).error);
  assert((await request('import', { briefId, edits, data: Buffer.from('<svg/>').toString('base64') })).error);
  assert.throws(() => core.visualComposerImageFormat(Buffer.alloc(core.visualComposerImageLimit + 1)));
  assert.throws(() => core.visualComposerImageFormat(png.subarray(0, png.length - 1)));
  assert.equal(core.visualComposerImageFormat(png), 'png');
  const imported = good(await request('import', { briefId, edits, data: png.toString('base64'), service: 'user reported' }));
  const candidateId = imported.candidates[0].id;
  assert.deepEqual(imported.candidates[0].targets, []);
  good(await request('import', { briefId, edits, data: png.toString('base64'), service: 'user reported' }));
  assert.equal(new VisualComposerStore(root).read().candidates.length, 1);
  assert.equal(fs.readdirSync(path.join(root, '.text-adventure', 'visuals')).filter(f => f.endsWith('.png')).length, 1);
  good(await request('bind', { candidateId, target: 'turn' }));
  let listed = good(await request('list')); assert.deepEqual(listed.candidates[0].targets, ['turn']);
  good(await request('bind', { candidateId, target: 'background' }));
  good(await request('bind', { candidateId, target: 'turn', enabled: false }));
  assert.deepEqual(good(await request('list')).candidates[0].targets, ['background']);
  // Duplicate pixels with another prompt retain their own receipt, without duplicating image bytes.
  edits = { ...edits, style: 'watercolor' };
  const second = good(await request('import', { briefId, edits, data: png.toString('base64') })).candidates[1];
  good(await request('bind', { candidateId: second.id, target: 'background' }));
  listed = good(await request('list'));
  assert.deepEqual(listed.candidates[0].targets, []); assert.deepEqual(listed.candidates[1].targets, ['background']);
  assert.equal(new VisualComposerStore(root).read().candidates[0].brief.edits.style, '');
  // Progress does not retarget an open brief.
  entries.push({ id: 'turn-2', role: 'gm', content: '山の上' });
  assert.equal(good(await request('resume', { briefId })).brief.source.turnId, 'turn-1');
  // Same-id edit, Undo and epoch/session changes invalidate presentation, not stored candidates.
  const old = entries[0].content; entries[0].content = 'changed';
  assert.equal(good(await request('list')).candidates[0].valid, false); entries[0].content = old;
  scope.timelineEpochId = 'after-undo';
  listed = good(await request('list')); assert.equal(listed.candidates.length, 2); assert.deepEqual(listed.candidates[1].targets, []);
  assert((await request('bind', { candidateId, target: 'turn' })).error);
  good(await request('bind', { candidateId: second.id, target: 'background', enabled: false }));
  // Import after Undo is still a candidate; it cannot become a current background.
  good(await request('import', { briefId, edits, data: png.toString('base64') }));
  scope.campaignInstanceId = 'other'; assert.equal(good(await request('list')).candidates.length, 0);
  assert((await request('resume', { briefId })).error); scope.campaignInstanceId = 'campaign';
  openDialog = async () => { workspace = path.join(root, 'other'); return [{ scheme: 'file', fsPath: path.join(root, 'external.png') }]; };
  fs.writeFileSync(path.join(root, 'external.png'), png);
  assert((await request('import', { briefId, edits })).error); workspace = root;
  // Deletion is scoped by session, clears every adoption, survives reload,
  // and preserves shared pixels, source files and editable drafts.
  scope.timelineEpochId = 'epoch';
  good(await request('bind', { candidateId: second.id, target: 'turn' }));
  good(await request('bind', { candidateId: second.id, target: 'background' }));
  scope.campaignInstanceId = 'other';
  assert((await request('deleteCandidate', { candidateId: second.id })).error);
  scope.campaignInstanceId = 'campaign';
  assert((await request('deleteCandidate', { candidateId: '../presentation.json' })).error);
  const remaining = good(await request('deleteCandidate', { candidateId: second.id }));
  assert.deepEqual(remaining.candidates.map(c => c.id), [candidateId]);
  const reopened = new VisualComposerStore(root).read();
  assert.equal(reopened.candidates.length, 1);
  assert.deepEqual(reopened.bindings, []);
  assert.equal(reopened.drafts.length, 1);
  assert(fs.existsSync(new VisualComposerStore(root).imagePath(reopened.candidates[0])));
  assert.deepEqual(fs.readFileSync(path.join(root, 'external.png')), png);
  assert((await request('deleteCandidate', { candidateId: second.id })).error);
  good(await request('import', { briefId, edits, data: png.toString('base64') }));
  assert.equal(new VisualComposerStore(root).read().candidates.length, 2);
  assert.deepEqual(canonical.map(file => fs.readFileSync(path.join(root, file), 'utf8')), before);
  const store = new VisualComposerStore(root);
  assert.throws(() => store.imagePath({ imageHash: '../escape', extension: 'png' }));
  assert.throws(() => store.change(() => { throw new Error('aborted'); }));
  assert(!fs.existsSync(path.join(root, '.text-adventure', 'visuals', 'write.lock')));
  assert.equal(store.read().schemaVersion, 1);
  console.log('PASS visual composer: public-only context, long text, copy/export, validation, deduplication, receipts, adoption/removal/replacement, Undo, session isolation, reload, immutable canonical files');
})().catch(e => { console.error(e); process.exitCode = 1; }).finally(() => fs.rmSync(root, { recursive: true, force: true }));
