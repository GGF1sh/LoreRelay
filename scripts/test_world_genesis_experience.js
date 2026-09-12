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
  // Run the actual host adoption handler with file-backed stores and fail each
  // write in turn. Both existing campaigns and an empty workspace must recover.
  const adoption = extension.slice(extension.indexOf('async function handleApplyWorldGenesis('), extension.indexOf('\nfunction ', extension.indexOf('async function handleApplyWorldGenesis(')));
  const files = ['world_forge.json', 'npc_registry.json', 'world_state.json', 'game_rules.json'];
  for (const existing of [false, true]) for (let failAt = 0; failAt < 4; failAt++) {
    const dir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'genesis-rollback-'));
    if (existing) for (const file of files) {
      fs.writeFileSync(path.join(dir, file), `old:${file}`);
      fs.writeFileSync(path.join(dir, `${file}.bak`), `backup:${file}`);
    }
    const before = Object.fromEntries(fs.readdirSync(dir).map(file => [file, fs.readFileSync(path.join(dir, file), 'utf8')]));
    const mutate = index => {
      if (index === failAt) throw new Error('injected write failure');
      const target = path.join(dir, files[index]);
      if (fs.existsSync(target)) fs.copyFileSync(target, `${target}.bak`);
      fs.writeFileSync(target, `new:${index}`);
    };
    const messages = [], cacheCleared = new Set();
    const context = vm.createContext({
      console: { error() {}, warn() {} }, fs, path,
      panel: { webview: { postMessage: m => messages.push(m) } },
      worldGenesisApplyInProgress: false, worldGenesisPreviewSession: preview,
      worldGenesisSetupCore_2: require('../out/worldGenesisSetupCore'),
      worldGenesisSetupCore_1: require('../out/worldGenesisSetupCore'),
      worldGenesisExperienceCore_1: require('../out/worldGenesisExperienceCore'),
      worldGenesisRollback_1: require('../out/worldGenesisRollback'),
      worldForgeGenerator_1: { getDefaultGeneratorInput: () => defaults, worldForgeFileExists: () => existing,
        generateAndSaveWorldForge: async () => { try { mutate(0); return { success: true, warnings: [] }; } catch { return { success: false, error: 'save-failed' }; } } },
      worldForge_1: { loadWorldForge: () => forge, bootstrapNpcRegistryFromForge: () => mutate(1), clearWorldForgeCache: () => cacheCleared.add('forge') },
      worldState_1: { resetWorldStateFromForge: () => mutate(2), clearWorldStateCache: () => cacheCleared.add('state') },
      npcRegistry_1: { clearNpcRegistryCache: () => cacheCleared.add('npc') },
      gameRules_1: { saveGameRules: () => { try { mutate(3); return true; } catch { return false; } }, clearGameRulesCache: () => cacheCleared.add('rules') },
      workspacePaths_1: { getWorkspacePath: () => dir, getGameStatePath: () => undefined },
      vscode: { window: { showWarningMessage: async (_m, _o, label) => label, showErrorMessage() {}, showInformationMessage() {} } },
      i18n_1: { t: s => s }, sendGameRules() {}, sendUiState: async () => {}, pushWorldViewToWebview() {},
    });
    vm.runInContext(adoption, context);
    await context.handleApplyWorldGenesis(draft);
    assert(messages.some(m => m.type === 'worldGenesisApplyEnd' && m.status === 'failed'));
    assert.deepEqual(Object.fromEntries(fs.readdirSync(dir).map(file => [file, fs.readFileSync(path.join(dir, file), 'utf8')])), before, `rollback existing=${existing} failAt=${failAt}`);
    assert.equal(cacheCleared.size, 4);
  }
  for (const locale of ['ja', 'zh-CN', 'zh-TW']) {
    const localized = previewWorldGenesis(normalize({ ...draft, experience: { ...experience, locale } })).canonicalContent;
    for (const row of [...localized.geography.regions, ...localized.geography.locations]) {
      for (const old of [...en.canonicalContent.geography.regions, ...en.canonicalContent.geography.locations]) {
        assert(!row.imagePromptHint?.includes(old.name), `stale image hint: ${old.name}`);
      }
    }
    if (locale === 'zh-CN') assert(!/[營會騎團議據點宮遺脈]/.test([...localized.geography.regions, ...localized.geography.locations, ...localized.factions].map(r => r.name).join('')));
  }
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
