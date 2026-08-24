const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

const root = path.join(__dirname, '..');
const genesis = require(path.join(root, 'out', 'worldGenesisSetupCore.js'));
const presets = require(path.join(root, 'out', 'genreWorldPresetCore.js'));
const generator = require(path.join(root, 'out', 'worldForgeGeneratorCore.js'));
const forgeCore = require(path.join(root, 'out', 'worldForgeCore.js'));

const defaults = { regionCount: 5, factionCount: 3, npcCount: 6 };
const cyberDraft = {
    presetId: 'cyberpunk-sprawl',
    presetVersion: 1,
    seed: 'genesis-focused-a',
    regionCount: 6,
    factionCount: 3,
    npcCount: 6,
};

function normalize(draft = cyberDraft) {
    const result = genesis.normalizeWorldGenesisInput(draft, defaults);
    assert.strictEqual(result.ok, true, `normalization failed: ${result.reason || 'unknown'}`);
    return result.input;
}

function hashFile(filePath) {
    return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

async function main() {
    const published = genesis.getPublishedWorldGenesisPresets();
    assert(published.length > 1, 'multiple player-selectable presets are required');
    assert(published.every(preset => preset.status === 'published'), 'UI exposure must contain published presets only');
    const exposed = new Set(published.map(preset => `${preset.presetId}@${preset.presetVersion}`));
    const registryEntries = Object.values(presets.GENRE_WORLD_PRESET_REGISTRY)
        .flatMap(versions => Object.values(versions));
    for (const example of registryEntries.filter(preset => preset.status === 'example')) {
        assert(!exposed.has(`${example.presetId}@${example.presetVersion}`), 'example preset leaked into UI exposure');
    }

    assert.strictEqual(presets.resolveGeneratorThemeForPreset('cyberpunk-sprawl', 1), 'cyberpunk');
    assert.strictEqual(presets.resolveGeneratorThemeForPreset('fantasy-temperate', 1), 'default');
    assert.strictEqual(presets.resolveGeneratorThemeForPreset('cyberpunk-sprawl', 999), undefined);
    const normalizedCyber = normalize();
    assert.strictEqual(normalizedCyber.theme, 'cyberpunk', 'host normalization must use the core preset/theme authority');
    assert.strictEqual(
        normalize({ ...cyberDraft, theme: 'dark-fantasy' }).theme,
        'cyberpunk',
        'untrusted Webview theme input must never override the core preset/theme authority'
    );

    const clamped = normalize({
        ...cyberDraft,
        regionCount: -50,
        factionCount: 100,
        npcCount: 2.9,
    });
    assert.deepStrictEqual(
        [clamped.regionCount, clamped.factionCount, clamped.npcCount],
        [3, 6, 2],
        'host normalization must clamp every supported count'
    );

    const previewA = genesis.previewWorldGenesis(normalizedCyber);
    const previewB = genesis.previewWorldGenesis(normalizedCyber);
    assert.deepStrictEqual(previewA.canonicalContent, previewB.canonicalContent, 'same input must produce the same preview');
    assert.deepStrictEqual(previewA.summary, previewB.summary, 'same input must produce the same summary');
    assert.strictEqual(previewA.summary.regionCount, 6);
    assert.strictEqual(previewA.summary.factionCount, 3);
    assert.strictEqual(previewA.summary.npcCount, 6);
    assert(previewA.summary.regionComposition.some(entry => entry.type === 'urban'), 'cyberpunk preview should expose its actual urban composition');

    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lorerelay-world-genesis-'));
    try {
        const forgePath = path.join(tempDir, 'world_forge.json');
        const gameStatePath = path.join(tempDir, 'game_state.json');
        fs.writeFileSync(forgePath, '{"sentinel":"old-world"}\n', 'utf8');
        fs.writeFileSync(gameStatePath, '{"sentinel":"old-game"}\n', 'utf8');
        const beforePreview = [hashFile(forgePath), hashFile(gameStatePath)];
        genesis.previewWorldGenesis(normalizedCyber);
        assert.deepStrictEqual(
            [hashFile(forgePath), hashFile(gameStatePath)],
            beforePreview,
            'Preview must not mutate world_forge.json or game_state.json'
        );

        const seedA = genesis.createWorldGenesisSeed(1000, 'reroll-a');
        const seedB = genesis.createWorldGenesisSeed(1001, 'reroll-b');
        assert.notStrictEqual(seedA, seedB, 'Reroll must create a new seed');
        const rerolled = genesis.previewWorldGenesis(normalize({ ...cyberDraft, seed: seedB }));
        assert.notDeepStrictEqual(rerolled.canonicalContent, previewA.canonicalContent, 'new seed must change the generated preview');
        assert.deepStrictEqual(
            [hashFile(forgePath), hashFile(gameStatePath)],
            beforePreview,
            'Reroll preview must remain read-only'
        );

        let cancelSaveCalls = 0;
        let cancelApplyCalls = 0;
        const canceled = await genesis.applyWorldGenesisPreview(normalizedCyber, previewA, {
            hasExistingCampaign: () => true,
            confirmOverwrite: async () => false,
            save: async () => {
                cancelSaveCalls++;
                fs.writeFileSync(forgePath, '{}', 'utf8');
                return { success: true, warnings: [] };
            },
            loadSavedForge: () => undefined,
            onApplied: () => { cancelApplyCalls++; },
        });
        assert.deepStrictEqual(canceled, { status: 'canceled' });
        assert.strictEqual(cancelSaveCalls, 0, 'cancel must stop before the canonical save seam');
        assert.strictEqual(cancelApplyCalls, 0, 'cancel must stop before reset/refresh');
        assert.deepStrictEqual(
            [hashFile(forgePath), hashFile(gameStatePath)],
            beforePreview,
            'canceled overwrite must leave old canonical data byte-for-byte unchanged'
        );

        let savedForge;
        let expectedAtSave;
        let resetCalls = 0;
        let refreshCalls = 0;
        const applied = await genesis.applyWorldGenesisPreview(normalizedCyber, previewA, {
            hasExistingCampaign: () => true,
            confirmOverwrite: async () => true,
            save: async (input, expectedCanonicalContent) => {
                expectedAtSave = expectedCanonicalContent;
                fs.copyFileSync(forgePath, `${forgePath}.bak`);
                savedForge = generator.generateWorldForge(input).forge;
                fs.writeFileSync(forgePath, `${JSON.stringify(savedForge, null, 2)}\n`, 'utf8');
                return { success: true, warnings: [] };
            },
            loadSavedForge: () => forgeCore.parseWorldForge(JSON.parse(fs.readFileSync(forgePath, 'utf8'))),
            onApplied: () => {
                resetCalls++;
                refreshCalls++;
            },
        });
        assert.strictEqual(applied.status, 'applied');
        assert.deepStrictEqual(expectedAtSave, previewA.canonicalContent, 'save seam must receive the accepted canonical preview');
        assert.strictEqual(fs.readFileSync(`${forgePath}.bak`, 'utf8'), '{"sentinel":"old-world"}\n', 'confirmed overwrite must preserve the old-world backup');
        assert.strictEqual(resetCalls, 1, 'confirmed apply must run the established reset path once');
        assert.strictEqual(refreshCalls, 1, 'confirmed apply must refresh the open UI once');
        assert.deepStrictEqual(
            JSON.parse(JSON.stringify(presets.canonicalContentOf(applied.forge))),
            JSON.parse(JSON.stringify(previewA.canonicalContent)),
            'applied deterministic content must match the accepted preview'
        );
        assert.deepStrictEqual(applied.forge.meta.generationProvenance, {
            presetId: 'cyberpunk-sprawl',
            presetVersion: 1,
            resolvedFrom: 'explicit',
            regionCount: 6,
            factionCount: 3,
            npcCount: 6,
        });

        const prefill = genesis.buildWorldGenesisPrefill(applied.forge, defaults, 'fallback-seed');
        assert.deepStrictEqual(prefill, {
            presetId: 'cyberpunk-sprawl',
            presetVersion: 1,
            seed: 'genesis-focused-a',
            regionCount: 6,
            factionCount: 3,
            npcCount: 6,
        }, 'usable provenance must prefill the current generation settings');

        const unavailable = JSON.parse(JSON.stringify(applied.forge));
        unavailable.meta.generationProvenance.presetVersion = 999;
        const unavailablePrefill = genesis.buildWorldGenesisPrefill(unavailable, defaults, 'fallback-seed');
        assert.strictEqual(unavailablePrefill.warning, 'preset-version-unavailable');
        assert.strictEqual(unavailablePrefill.presetId, undefined, 'unavailable explicit versions must not silently substitute another version');
        assert.strictEqual(unavailablePrefill.presetVersion, undefined);
    } finally {
        fs.rmSync(tempDir, { recursive: true, force: true });
    }

    const extensionSource = fs.readFileSync(path.join(root, 'src', 'extension.ts'), 'utf8');
    const generatorSource = fs.readFileSync(path.join(root, 'src', 'worldForgeGenerator.ts'), 'utf8');
    const handlerSource = fs.readFileSync(path.join(root, 'src', 'webviewHandlers.ts'), 'utf8');
    const bootstrapSource = fs.readFileSync(path.join(root, 'webview', 'modules', '90-bootstrap.js'), 'utf8');
    const htmlSource = fs.readFileSync(path.join(root, 'webview', 'index.html'), 'utf8');
    assert(htmlSource.includes('id="world-genesis-setup"') && htmlSource.includes('id="world-genesis-apply-btn"'));
    assert(bootstrapSource.includes("type: 'requestWorldGenesisSetup'") && bootstrapSource.includes("type: 'previewWorldGenesis'"));
    assert(!bootstrapSource.includes('cyberpunk-sprawl'), 'Webview must not hardcode a second preset list or preset/theme map');
    assert(extensionSource.includes('getPublishedWorldGenesisPresets().map'), 'host registry must supply selectable presets');
    assert(extensionSource.includes('resetWorldStateFromForge(forge, isOverwrite)'));
    assert(extensionSource.includes('await sendUiState(0, true)') && extensionSource.includes('pushWorldViewToWebview()'));
    assert(extensionSource.includes('{ createBackup: true, expectedCanonicalContent }'));
    assert(handlerSource.includes("case 'previewWorldGenesis'") && handlerSource.includes("case 'applyWorldGenesis'"));
    assert(
        generatorSource.indexOf('options.expectedCanonicalContent') < generatorSource.indexOf('writeJsonAtomic(forgePath'),
        'preview parity must be checked before the canonical write'
    );
    assert(bootstrapSource.includes("T('webview.startHub.interviewTemplate')"), 'guided Q&A path must remain available');
    assert(bootstrapSource.includes("type: 'freeInput', text: template, presentationText"), 'guided path must keep player-facing presentation text');

    const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
    assert.strictEqual(packageJson.contributes.configuration.properties['textAdventure.mediaAgent.autoImage'].default, false);
    assert.strictEqual(packageJson.contributes.configuration.properties['textAdventure.imageGen.autoOnLocationChange'].default, false);

    const localeFiles = ['en', 'ja', 'zh-CN', 'zh-TW'];
    const localeBundles = Object.fromEntries(localeFiles.map(locale => [
        locale,
        JSON.parse(fs.readFileSync(path.join(root, 'locales', `${locale}.json`), 'utf8')),
    ]));
    const requiredKeys = Object.keys(localeBundles.en).filter(key => (
        key.startsWith('webview.worldGenesis.') || key.startsWith('extension.worldGenesis.')
    ));
    for (const [locale, bundle] of Object.entries(localeBundles)) {
        for (const key of requiredKeys) {
            assert.strictEqual(typeof bundle[key], 'string', `${locale} is missing ${key}`);
            assert(bundle[key].trim(), `${locale} has an empty ${key}`);
        }
        for (const preset of published) {
            assert(bundle[`webview.worldGenesis.preset.${preset.presetId}.label`], `${locale} missing preset label`);
            assert(bundle[`webview.worldGenesis.preset.${preset.presetId}.description`], `${locale} missing preset description`);
        }
    }

    console.log('World Genesis Setup V1 focused tests passed.');
}

main().catch(error => {
    console.error(error);
    process.exit(1);
});
