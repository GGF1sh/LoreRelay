'use strict';
const assert = require('assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');
const vm = require('vm');
const store = require('../out/cartographyAssetStore');
const core = require('../out/cartographyOverlayCore');
const { scanLocalModelRoots } = require('../out/modelScanner');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lorerelay-map-assets-'));
const forge = { meta: { worldSeed: 'one', generatedAt: 'today' }, geography: {
    regions: [{ id: 'r1', x: 100, y: 200, connectedTo: ['r2'] }, { id: 'r2', x: 500, y: 200, connectedTo: ['r1'] }],
    locations: [{ id: 'p1', regionId: 'r1' }] } };
const source = path.join(dir, 'source.png');
fs.writeFileSync(source, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64'));
const image = store.readCartographyImage(source);
const original = fs.readFileSync(source);
const adopted = store.adoptCartographyAsset(dir, forge, image);
assert.equal(store.loadCartographyAsset(dir, forge).imageKey, adopted.imageKey);
assert.deepEqual(fs.readFileSync(source), original);
assert.equal(store.loadCartographyAsset(dir, { ...forge, meta: { ...forge.meta, worldSeed: 'two' } }), undefined);
const overlay = { pins: { p1: { leftPct: 20, topPct: 60 } }, regions: { r1: { leftPct: 5, topPct: 10 } }, showLabels: false, showRoutes: true };
const saved = store.saveCartographyOverlay(dir, forge, adopted.revision, overlay);
assert.equal(store.loadCartographyAsset(dir, forge).overlay.pins.p1.leftPct, 20);
assert.throws(() => store.saveCartographyOverlay(dir, forge, adopted.revision, overlay), /changed/);
for (const value of [NaN, Infinity, -1, 101, '30']) {
    assert.throws(() => core.validateCartographyOverlay({ ...overlay, pins: { p1: { leftPct: value, topPct: 1 } } }, forge));
}
assert.throws(() => core.validateCartographyOverlay({ ...overlay, pins: { stranger: { leftPct: 1, topPct: 1 } } }, forge));
const projection = core.applyCartographyOverlay([{ locationId: 'p1', leftPct: 0, topPct: 0 }],
    [{ regionId: 'r1', leftPct: 0, topPct: 0 }], [{ fromRegionId: 'r1', toRegionId: 'r2', x1Pct: 10, y1Pct: 20, x2Pct: 50, y2Pct: 20 }], overlay);
assert.equal(projection.pins[0].topPct, 60); assert.equal(projection.edges[0].x1Pct, 5); assert.equal(projection.edges[0].x2Pct, 50);
const rename = fs.renameSync;
fs.renameSync = () => { throw new Error('injected disk failure'); };
try { assert.throws(() => store.saveCartographyOverlay(dir, forge, saved.revision, store.emptyCartographyOverlay()), /disk failure/); }
finally { fs.renameSync = rename; }
assert.equal(store.loadCartographyAsset(dir, forge).revision, saved.revision);
assert(fs.readdirSync(path.join(dir, '.lorerelay-map-assets')).some(name => name.includes('.previous-')));
const replaced = store.adoptCartographyAsset(dir, forge, image);
assert.equal(Object.keys(store.loadCartographyAsset(dir, forge).overlay.pins).length, 0);
assert.notEqual(replaced.revision, saved.revision);
assert.equal(store.loadCartographyAsset(dir, forge).marker.mode, 'standard', 'old assets default to silhouette');
const portrait = store.saveCartographyMarker(dir, forge, replaced.revision, 'custom', image);
assert.equal(store.loadCartographyAsset(dir, forge).marker.mode, 'custom');
const standard = store.saveCartographyMarker(dir, forge, portrait.revision, 'standard');
assert.equal(standard.marker.image, portrait.marker.image, 'standard mode retains custom image');
const restored = store.saveCartographyMarker(dir, forge, standard.revision, 'custom');
assert.equal(restored.marker.image, portrait.marker.image, 'switch back without choosing another image');
assert.throws(() => store.saveCartographyMarker(dir, forge, standard.revision, 'standard'), /changed/);
assert.throws(() => store.saveCartographyMarker(dir, forge, restored.revision, 'invalid'), /Invalid/);
assert.throws(() => store.saveCartographyMarker(dir, forge, restored.revision, 'custom', { ...image, bytes: Buffer.alloc(4*1024*1024+1) }), /4 MiB/);
const newBackground = store.adoptCartographyAsset(dir, forge, image);
assert.equal(newBackground.marker.image, restored.marker.image, 'background replacement preserves player preference');
const manifest = path.join(dir, '.lorerelay-map-assets', `${newBackground.worldKey}.json`);
fs.writeFileSync(manifest, JSON.stringify({ ...newBackground, marker: { mode: 'custom', image: '../outside.png' } }));
assert.equal(store.loadCartographyAsset(dir, forge).marker.mode, 'standard', 'invalid portrait path falls back safely');
fs.writeFileSync(manifest, JSON.stringify(newBackground));
const invalid = path.join(dir, 'bad.png'); fs.writeFileSync(invalid, '<svg>not a raster image</svg>');
assert.throws(() => store.readCartographyImage(invalid), /Invalid/);
const modelDir = path.join(dir, 'Checkpoints'); fs.mkdirSync(modelDir);
fs.writeFileSync(path.join(modelDir, 'SDXL.safetensors'), 'model');
const alias = path.join(dir, 'models-alias');
fs.symlinkSync(modelDir, alias, process.platform === 'win32' ? 'junction' : 'dir');
fs.symlinkSync(dir, path.join(modelDir, 'loop'), process.platform === 'win32' ? 'junction' : 'dir');
assert.equal(scanLocalModelRoots([modelDir, alias]).length, 1);
const matrix = path.join(dir, 'StableDiffusion'); fs.mkdirSync(matrix);
fs.writeFileSync(path.join(matrix, 'model.safetensors'), 'model');
const checkpoint = scanLocalModelRoots([matrix])[0];
assert.equal(checkpoint.category, 'checkpoint'); assert.equal(checkpoint.comfyName, 'model.safetensors');

// Exercise the real host boundary: no path is accepted from a webview, and tokens are world/revision bound.
const requireOriginal = Module.prototype.require;
let selected = source;
Module.prototype.require = function(id) { return id === 'vscode' ? { window: { showOpenDialog: async () => selected ? [{ fsPath: selected }] : undefined } } : requireOriginal.apply(this, arguments); };
const host = require('../out/cartographyAssetHost');
Module.prototype.require = requireOriginal;
async function hostTests() {
    let world = forge; const messages = [];
    const deps = { workspace: dir, forge: () => world, post: msg => messages.push(msg), refresh: () => {} };
    await host.handleWorldMapAsset({ action: 'import', path: 'ignored.png' }, deps);
    const preview = messages.at(-1); assert.equal(preview.status, 'preview');
    await host.handleWorldMapAsset({ action: 'adopt', token: 'forged' }, deps); assert.equal(messages.at(-1).status, 'error');
    world = { ...forge, meta: { ...forge.meta, worldSeed: 'other' } };
    await host.handleWorldMapAsset({ action: 'adopt', token: preview.token }, deps); assert.equal(messages.at(-1).status, 'error');
    world = forge;
    await host.handleWorldMapAsset({ action: 'cancel', token: preview.token }, deps);
    await host.handleWorldMapAsset({ action: 'adopt', token: preview.token }, deps); assert.equal(messages.at(-1).status, 'error');
    await host.handleWorldMapAsset({ action: 'import' }, deps);
    const fresh = messages.at(-1);
    selected = undefined;
    await host.handleWorldMapAsset({ action: 'import' }, deps);
    selected = source;
    // A cancelled replacement must leave the displayed preview adoptable.
    await host.handleWorldMapAsset({ action: 'adopt', token: fresh.token }, deps); assert.equal(messages.at(-1).status, 'adopted');
    await host.handleWorldMapAsset({ action: 'adopt', token: fresh.token }, deps); assert.equal(messages.at(-1).status, 'error');
    selected = undefined;
    const before = store.loadCartographyAsset(dir, forge).revision;
    await host.handleWorldMapAsset({ action: 'import' }, deps);
    assert.equal(store.loadCartographyAsset(dir, forge).revision, before);
    await host.handleWorldMapAsset({ action: 'markerImage', worldKey: core.cartographyWorldKey(forge), revision: before }, deps);
    assert.equal(messages.at(-1).status, 'markerCancelled');
    assert.equal(store.loadCartographyAsset(dir, forge).revision, before);
    selected = source;
    await host.handleWorldMapAsset({ action: 'markerImage', worldKey: core.cartographyWorldKey(forge), revision: before }, deps);
    assert.equal(messages.at(-1).status, 'markerSaved');
    const portraitRevision = store.loadCartographyAsset(dir, forge).revision;
    await host.handleWorldMapAsset({ action: 'markerMode', worldKey: 'wrong', revision: portraitRevision, mode: 'standard' }, deps);
    assert.equal(messages.at(-1).status, 'error');
    assert.equal(store.loadCartographyAsset(dir, forge).revision, portraitRevision);

    for (const failure of ['malformed', 'null', 'invalid-shape', 'missing', 'digest']) {
        const recoveryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'map-recovery-'));
        const originalState = store.adoptCartographyAsset(recoveryRoot, forge, image);
        const assetRoot = path.join(recoveryRoot, '.lorerelay-map-assets');
        const stateFile = path.join(assetRoot, `${originalState.worldKey}.json`);
        const imageFile = path.join(assetRoot, originalState.file);
        if (failure === 'malformed') fs.writeFileSync(stateFile, '{broken');
        if (failure === 'null') fs.writeFileSync(stateFile, 'null');
        if (failure === 'invalid-shape') fs.writeFileSync(stateFile, '{}');
        if (failure === 'missing') fs.renameSync(imageFile, path.join(recoveryRoot, 'saved-original.png'));
        if (failure === 'digest') fs.writeFileSync(imageFile, 'corrupt image bytes');
        const oldManifest = fs.readFileSync(stateFile, 'utf8');
        const recoveryDeps = { ...deps, workspace: recoveryRoot };
        await host.handleWorldMapAsset({ action: 'import' }, recoveryDeps);
        assert.equal(messages.at(-1).status, 'preview', failure);
        const recoveryPreview = messages.at(-1);
        await host.handleWorldMapAsset({ action: 'adopt', token: recoveryPreview.token }, recoveryDeps);
        assert.equal(messages.at(-1).status, 'adopted', `${failure}: ${JSON.stringify(messages.at(-1))}`);
        assert(store.loadCartographyAsset(recoveryRoot, forge));
        assert(fs.readdirSync(assetRoot).filter(n => n.includes('.previous-') && n.endsWith('.json'))
            .some(n => fs.readFileSync(path.join(assetRoot, n), 'utf8') === oldManifest), 'old manifest retained');
        if (failure === 'digest') assert(fs.readdirSync(assetRoot).filter(n => n.includes('.previous-') && n.endsWith('.png'))
            .some(n => fs.readFileSync(path.join(assetRoot, n), 'utf8') === 'corrupt image bytes'));

        // Two different broken revisions must never compare equal.
        fs.writeFileSync(stateFile, '{broken-first');
        await host.handleWorldMapAsset({ action: 'import' }, recoveryDeps);
        const stale = messages.at(-1); assert.equal(stale.status, 'preview');
        fs.writeFileSync(stateFile, '{broken-second');
        await host.handleWorldMapAsset({ action: 'adopt', token: stale.token }, recoveryDeps);
        assert.equal(messages.at(-1).status, 'error');
        assert.equal(fs.readFileSync(stateFile, 'utf8'), '{broken-second');
    }

    const context = vm.createContext({ window: { addEventListener() {} }, document: { getElementById: () => null }, vscode: {} });
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../webview/modules/85a-cartography-assets.js'), 'utf8'), context);
    context.message = { cartographyWorldKey: 'one', cartographyAsset: { revision: 'one', overlay },
        cartographyPins: [{ locationId: 'p1', leftPct: 0, topPct: 0 }], cartographyRegionLabels: [],
        cartographyRouteEdges: [{ fromRegionId: 'r1', toRegionId: 'r2', x1Pct: 1, y1Pct: 2, x2Pct: 3, y2Pct: 4 }] };
    const projected = vm.runInContext('overlayCartographyMessage(message)', context);
    assert.equal(projected.cartographyPins[0].leftPct, 20);
    assert.equal(projected.cartographyRegionLabels.length, 0, 'overrides must not reveal filtered labels');
    assert.equal(projected.cartographyShowLabels, false);
    console.log('Cartography assets: persistence, rollback, replacement, tokens, world binding, validation, overlays and junction cycles passed.');
}
hostTests().catch(error => { console.error(error); process.exitCode = 1; });
