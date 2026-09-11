const assert = require('assert/strict');
const { normalizeWorldGenesisInput, previewWorldGenesis, applyWorldGenesisPreview, buildWorldGenesisPrefill } = require('../out/worldGenesisSetupCore');
const { parseWorldForge } = require('../out/worldForgeCore');
const { WORLD_GENESIS_FEATURES, worldGenesisRules } = require('../out/worldGenesisExperienceCore');
const defaults = { regionCount: 10, factionCount: 5, npcCount: 20 };
const experience = { version: 1, locale: 'ja', features: Object.fromEntries(WORLD_GENESIS_FEATURES.map(k => [k, true])) };
const draft = { presetId: 'fantasy-temperate', presetVersion: 1, seed: 'genesis-experience-test', ...defaults, experience };
const normalize = d => { const r = normalizeWorldGenesisInput(d, defaults); assert(r.ok); return r.input; };
(async () => {
  const input = normalize(draft), preview = previewWorldGenesis(input);
  assert.deepEqual(preview.canonicalContent, previewWorldGenesis(input).canonicalContent);
  const forge = parseWorldForge(require('../out/worldForgeGeneratorCore').generateWorldForge(input).forge);
  for (const row of [...forge.geography.regions, ...forge.geography.locations, ...forge.factions, ...forge.initialNpcs]) assert(/[\u3040-\u30ff\u4e00-\u9fff]/.test(row.name), row.name);
  assert.equal(new Set(forge.initialNpcs.map(n => n.name)).size, 20);
  assert.equal(new Set(forge.geography.regions.map(r => r.name)).size, 10);
  const prefill = buildWorldGenesisPrefill(forge, defaults, 'fallback');
  assert.deepEqual(prefill.experience, experience);
  assert.deepEqual(previewWorldGenesis(normalize(prefill)).canonicalContent, preview.canonicalContent, 'restart reproduces selected language and settings');
  const another = previewWorldGenesis(normalize({ ...draft, seed: 'another-seed' }));
  assert.notEqual(another.summary.worldName, preview.summary.worldName);
  assert.notDeepEqual(another.summary.overview, preview.summary.overview);
  assert.equal(preview.summary.overview.regions.length, 10);
  for (const r of preview.summary.overview.regions) for (const id of r.connectedTo) assert(preview.summary.overview.regions.some(x => x.id === id));
  const en = previewWorldGenesis(normalize({ ...draft, experience: { ...experience, locale: 'en' } }));
  assert.deepEqual(en.canonicalContent.geography.regions.map(r => [r.id, r.connectedTo, r.x, r.y]), preview.canonicalContent.geography.regions.map(r => [r.id, r.connectedTo, r.x, r.y]), 'language never changes topology/IDs');
  assert.equal(normalizeWorldGenesisInput({ ...draft, experience: { ...experience, features: { commerce: 'yes' } } }, defaults).ok, false);
  const patch = worldGenesisRules(experience); assert.equal(patch.enableCommerce, true); assert.equal(patch.enableCommerceUi, true);
  assert.equal(worldGenesisRules({ ...experience, features: { ...experience.features, commerce: false } }).enableCommerceUi, false);
  assert(!Object.hasOwn(patch, 'campaignKitId'));
  let writes = 0;
  const deps = { hasExistingCampaign: () => true, confirmOverwrite: async () => false, save: async () => { writes++; return { success: true, warnings: [] }; }, loadSavedForge: () => forge, onApplied: () => { writes++; } };
  assert.equal((await applyWorldGenesisPreview(input, preview, deps)).status, 'canceled'); assert.equal(writes, 0);
  assert.equal((await applyWorldGenesisPreview(normalize({ ...draft, experience: { ...experience, features: { ...experience.features, commerce: false } } }), preview, deps)).status, 'failed'); assert.equal(writes, 0);
  assert.equal((await applyWorldGenesisPreview(input, preview, { ...deps, confirmOverwrite: async () => true })).status, 'applied'); assert.equal(writes, 2);
  // Exercise the compiled host's real preset handler with a persistent Memento
  // across two host lifetimes. No full extension activation or campaign writes.
  const vm = require('vm'), fs = require('fs'), path = require('path');
  const extension = fs.readFileSync(path.join(__dirname, '../out/extension.js'), 'utf8');
  const handler = extension.slice(extension.indexOf('let worldGenesisPresetSaving'), extension.indexOf('function sendWorldGenesisSetup'));
  const storage = new Map(), replies = [];
  const startHost = () => {
    const context = vm.createContext({
      extensionContext: { globalState: { get: (k, fallback) => storage.get(k) || fallback, update: async (k, v) => storage.set(k, JSON.parse(JSON.stringify(v))) } },
      panel: { webview: { postMessage: msg => replies.push(msg) } },
      worldGenesisSetupCore_2: require('../out/worldGenesisSetupCore'),
      worldForgeGenerator_1: { getDefaultGeneratorInput: () => defaults },
    });
    vm.runInContext(handler, context); return context.saveWorldGenesisUserPreset;
  };
  await startHost()({ ...draft, name: '交易世界' });
  assert.equal(replies.at(-1).saved, true);
  const savedDraft = storage.get('worldGenesis.userPresets.v1')[0].draft;
  assert.equal(savedDraft.seed, undefined, 'saved preferences do not pin the random seed');
  assert.equal(savedDraft.experience.features.commerce, true);
  await startHost()({ ...draft, name: '交易世界', npcCount: 8 });
  assert.equal(storage.get('worldGenesis.userPresets.v1').length, 1, 'same name intentionally updates after restart');
  assert.equal(storage.get('worldGenesis.userPresets.v1')[0].draft.npcCount, 8);
  const snapshot = JSON.stringify([...storage]);
  await startHost()({ ...draft, name: 'bad', experience: { version: 1 } });
  assert.equal(JSON.stringify([...storage]), snapshot, 'invalid preset never writes');
  console.log('PASS genesis experience: localized unique names, deterministic reroll/reopen, topology, rule switches, stale settings, cancel/apply');
})().catch(e => { console.error(e); process.exitCode = 1; });
