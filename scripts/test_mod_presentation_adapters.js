#!/usr/bin/env node
'use strict';
const assert = require('assert');
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const os = require('os');
const zlib = require('zlib');
const vm = require('vm');
const Module = require('module');
const { createVscodeStub } = require('./test_helpers/vscode_stub');
const vscode = createVscodeStub();
vscode.workspace.isTrusted = true;
vscode.commands = { executeCommand: async () => undefined };
class Disposable { constructor(fn = () => {}) { this.fn = fn; } dispose() { this.fn(); } static from(...items) { return new Disposable(() => items.forEach(x => x.dispose())); } }
vscode.Disposable = Disposable;
vscode.EventEmitter = class { constructor() { this.event = () => new Disposable(); } dispose() {} };
vscode.FileSystemError = { FileNotFound: () => new Error('Not found'), NoPermissions: () => new Error('Read only') };
vscode.FileType = { File: 1 }; vscode.FilePermission = { Readonly: 1 };
vscode.Uri.from = parts => ({ authority: '', query: '', fragment: '', ...parts, toString() { return `${this.scheme}://${this.authority}${this.path}`; } });
let provider;
vscode.workspace.registerFileSystemProvider = (scheme, value, options) => { assert.equal(scheme, 'lorerelay-mod-asset'); assert.equal(options.isReadonly, true); provider = value; return new Disposable(); };
const originalRequire = Module.prototype.require;
Module.prototype.require = function(id) { return id === 'vscode' ? vscode : originalRequire.apply(this, arguments); };
const assetCore = require('../out/mods/contributions/modAssetCore');
const loc = require('../out/mods/contributions/modLocalizationCore');
const core = require('../out/mods/contributions/modContentCore');
const gate = require('../out/mods/modActivationGateHost');
const broker = require('../out/mods/modAssetBroker');
const discovery = require('../out/mods/modDiscoveryHost');
const hash = require('../out/mods/modHashCore');
const profileCore = require('../out/mods/modProfileCore');
const resolver = require('../out/mods/modResolverCore');
let assertions = 0;
const eq = (actual, expected, message) => { assertions++; assert.deepStrictEqual(actual, expected, message); };
const ok = (value, message) => { assertions++; assert.ok(value, message); };
const throws = (fn, message) => { assertions++; assert.throws(fn, undefined, message); };
function crc(bytes, reflected = true) {
    let c = reflected ? 0xffffffff : 0;
    for (const byte of bytes) {
        c ^= reflected ? byte : byte << 24;
        for (let i = 0; i < 8; i++) c = reflected ? ((c & 1) ? (c >>> 1) ^ 0xedb88320 : c >>> 1) : ((c & 0x80000000) ? (c << 1) ^ 0x04c11db7 : c << 1);
    }
    return (reflected ? c ^ 0xffffffff : c) >>> 0;
}
function pngChunk(type, data) {
    const b = Buffer.alloc(data.length + 12); b.writeUInt32BE(data.length); b.write(type, 4, 'ascii'); data.copy(b, 8); b.writeUInt32BE(crc(b.subarray(4, b.length - 4)), b.length - 4); return b;
}
function png(width = 1, height = 1, extra = [], payload = zlib.deflateSync(Buffer.from([0, 100, 20, 30, 255]))) {
    const h = Buffer.alloc(13); h.writeUInt32BE(width); h.writeUInt32BE(height, 4); h[8] = 8; h[9] = 6;
    return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), pngChunk('IHDR', h), ...extra, pngChunk('IDAT', payload), pngChunk('IEND', Buffer.alloc(0))]);
}
function wav(seconds = 0.01) {
    const data = Buffer.alloc(Math.round(8000 * seconds)), b = Buffer.alloc(44 + data.length + (data.length & 1));
    b.write('RIFF'); b.writeUInt32LE(b.length - 8, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(8000, 24); b.writeUInt32LE(8000, 28); b.writeUInt16LE(1, 32); b.writeUInt16LE(8, 34); b.write('data', 36); b.writeUInt32LE(data.length, 40); data.copy(b, 44); return b;
}
function mp3(count) { const frame = Buffer.alloc(417); frame.writeUInt32BE(0xfffb9000); return Buffer.concat(Array.from({ length: count }, () => frame)); }
function riff(form, chunks) {
    const body = Buffer.concat(chunks.map(([type, data]) => { const h = Buffer.alloc(8); h.write(type); h.writeUInt32LE(data.length, 4); return Buffer.concat([h, data, ...(data.length & 1 ? [Buffer.alloc(1)] : [])]); }));
    const h = Buffer.alloc(12); h.write('RIFF'); h.writeUInt32LE(body.length + 4, 4); h.write(form, 8); return Buffer.concat([h, body]);
}
function ogg(packets, granule = 0n) {
    return Buffer.concat(packets.map((packet, i) => {
        const h = Buffer.alloc(28); h.write('OggS'); h[5] = (i === 0 ? 2 : 0) | (i === packets.length - 1 ? 4 : 0); h.writeBigInt64LE(i === packets.length - 1 ? granule : 0n, 6); h.writeUInt32LE(1, 14); h.writeUInt32LE(i, 18); h[26] = 1; h[27] = packet.length;
        const page = Buffer.concat([h, packet]); page.writeUInt32LE(crc(page, false), 22); return page;
    }));
}
function boundary(relativeFile, mocks, append = '') {
    const filename = path.join(__dirname, '../out', relativeFile), instance = new Module(filename, module);
    instance.filename = filename; instance.paths = Module._nodeModulePaths(path.dirname(filename));
    const empty = new Proxy({}, { get: (_o, k) => k === '__esModule' ? true : () => undefined }), original = Module._load;
    Module._load = function(request, parent, isMain) { if (parent === instance) { if (Object.hasOwn(mocks, request)) return mocks[request]; if (request.startsWith('.')) return empty; } return original.call(this, request, parent, isMain); };
    try { instance._compile(fs.readFileSync(filename, 'utf8') + '\n' + append, filename); return instance.exports; } finally { Module._load = original; }
}

async function main() {
    const configuration = vscode.workspace.getConfiguration('any-section');
    for (const fallback of ['', 0, false, null, { enabled: true }]) eq(configuration.get('unset-key', fallback), fallback, 'shared configuration stub returns caller default');
    eq(configuration.get('unset-key'), undefined, 'omitted default remains undefined');
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'lorerelay-mod-presentation-'));
    const globalStorageRoot = path.join(temp, 'global');
    const validate = (bytes, kind = 'image', mime = 'image/png', name = 'image.png') => assetCore.validateModAssetBytes(kind, mime, name, bytes);
    const timers = [], disposeCallbacks = [];
    const nativeInterval = global.setInterval, nativeClearInterval = global.clearInterval;
    const registration = broker.registerModAssetBroker();
    try {
        eq(validate(png()).width, 1, 'valid PNG dimensions');
        for (const b of [png(9000), png(8000, 6000), Buffer.concat([png(), Buffer.from('<html>')]), png(1, 1, [pngChunk('acTL', Buffer.alloc(8))]), png(1, 1, [pngChunk('tEXt', Buffer.from('x\0<script>'))]), png(1, 1, [], Buffer.concat([zlib.deflateSync(Buffer.from([0, 1, 2, 3, 4])), Buffer.from('PK\x03\x04')])), png(1, 1, [], zlib.deflateSync(Buffer.alloc(1000)))]) throws(() => validate(b), 'PNG rejects size/animation/metadata/trailers/inflate mismatch');
        const badCrc = png(); badCrc[badCrc.length - 1] ^= 1; throws(() => validate(badCrc), 'PNG CRC');
        throws(() => validate(png(), 'image', 'image/jpeg', 'image.jpg'), 'magic/declared MIME mismatch');
        throws(() => validate(png(), 'image', 'image/png', 'image.svg'), 'extension mismatch');
        for (const text of ['<svg/>', '<html/>', 'GIF89a', 'PK\x03\x04', 'MZ']) throws(() => validate(Buffer.from(text)), 'unsupported executable/container/raster');
        const webp = riff('WEBP', [['VP8L', Buffer.from([0x2f, 0, 0, 0, 0, 0])]]);
        eq(validate(webp, 'icon', 'image/webp', 'a.webp').height, 1, 'WebP lossless header');
        const anim = Buffer.alloc(10); anim[0] = 2;
        throws(() => validate(riff('WEBP', [['VP8X', anim], ['ANIM', Buffer.alloc(6)]]), 'image', 'image/webp', 'a.webp'), 'animated WebP excluded');
        throws(() => validate(Buffer.concat([webp, Buffer.from('payload')]), 'image', 'image/webp', 'a.webp'), 'RIFF trailing payload');
        const jpeg = Buffer.from([255,216,255,192,0,11,8,0,1,0,1,1,1,17,0,255,218,0,8,1,1,0,0,63,0,1,255,217]);
        eq(validate(jpeg, 'image', 'image/jpeg', 'a.jpeg').width, 1, 'JPEG bounded frame and scan');
        throws(() => validate(Buffer.concat([jpeg, Buffer.from('PK\x03\x04')]), 'image', 'image/jpeg', 'a.jpg'), 'JPEG trailer rejected');
        const metadataJpeg = Buffer.concat([jpeg.subarray(0, 2), Buffer.from([255, 225, 0, 4, 0, 0]), jpeg.subarray(2)]);
        throws(() => validate(metadataJpeg, 'image', 'image/jpeg', 'a.jpg'), 'untrusted JPEG APP segment rejected');
        eq(validate(wav(), 'sfx', 'audio/wav', 's.wav').durationSeconds, 0.01, 'WAV sample-count duration');
        throws(() => validate(wav(61), 'sfx', 'audio/wav', 's.wav'), 'sfx duration');
        throws(() => validate(wav(1201), 'bgm', 'audio/wav', 's.wav'), 'bgm duration');
        const forgedRate = wav(); forgedRate.writeUInt32LE(1, 28); throws(() => validate(forgedRate, 'audio', 'audio/wav', 's.wav'), 'forged WAV byte rate');
        eq(validate(mp3(2), 'audio', 'audio/mpeg', 's.mp3').durationSeconds, 2 * 1152 / 44100, 'MP3 counted frames');
        throws(() => validate(mp3(2300), 'sfx', 'audio/mpeg', 's.mp3'), 'MP3 frame-count duration ignores tags');
        throws(() => validate(Buffer.concat([Buffer.from('ID3'), mp3(2)]), 'audio', 'audio/mpeg', 's.mp3'), 'MP3 metadata not a duration authority');
        const vh = Buffer.alloc(30); vh[0] = 1; vh.write('vorbis', 1); vh[11] = 1; vh.writeUInt32LE(8000, 12); vh[28] = 0x66; vh[29] = 1;
        const vc = Buffer.alloc(16); vc[0] = 3; vc.write('vorbis', 1); vc[15] = 1;
        const packets = [vh, vc, Buffer.from('\x05vorbis\x01', 'binary'), Buffer.from([0, 0])];
        eq(validate(ogg(packets), 'sfx', 'audio/ogg', 's.ogg').durationSeconds, 0.004, 'Ogg maximum-block duration');
        throws(() => validate(ogg(packets, 100000n), 'sfx', 'audio/ogg', 's.ogg'), 'forged Ogg granules');
        const brokenOgg = ogg(packets); brokenOgg[40] ^= 1; throws(() => validate(brokenOgg, 'sfx', 'audio/ogg', 's.ogg'), 'Ogg CRC');
        throws(() => validate(Buffer.concat([ogg(packets), ogg(packets)]), 'audio', 'audio/ogg', 's.ogg'), 'chained Ogg not silently truncated');

        async function install(id, rating = 'general') {
            const root = path.join(globalStorageRoot, 'mods/packages', id, '1.0.0'); fs.mkdirSync(root, { recursive: true });
            const manifest = { format: 'lorerelay-mod/1', id, version: '1.0.0', name: id, authors: ['test'], lorerelay: { minVersion: '1.84.32' }, contentRating: rating, contentTags: [], capabilities: ['asset', 'localization', 'lorebook', 'persona', 'scenario'], dependencies: [], optionalDependencies: [], conflicts: [], entrypoints: { scenarios: [{ id: 'arrival', path: 'scenario.json' }], lorebooks: [{ id: 'book', path: 'lore.json' }], personas: [{ id: 'traveler', path: 'persona.json' }], assets: [{ path: 'assets.json' }], localization: [{ locale: 'ja', path: 'ja.json' }, { locale: 'en', path: 'en.json' }] } };
            const docs = {
                'scenario.json': { format: 'text-adventure-scenario/1.0', meta: { title: 'Arrival', description: 'Source scenario description' }, opening: { narrative: 'Source opening never translated' } },
                'lore.json': { format: 'text-adventure-lorebook/1.0', entries: [{ id: 'town', comment: 'Town', keys: ['port'], content: 'Source lore never translated' }] },
                'persona.json': { version: 1, id: 'traveler', name: 'Traveler', description: 'Source persona never translated' },
                'assets.json': { format: 'lorerelay-assets/1', assets: [{ id: 'view', kind: 'background', path: 'image.png', mediaType: 'image/png', alt: 'Source view' }, { id: 'music', kind: 'bgm', path: 'music.wav', mediaType: 'audio/wav', alt: 'Source music' }, { id: 'bell', kind: 'sfx', path: 'bell.wav', mediaType: 'audio/wav' }] },
                'ja.json': { format: 'lorerelay-localization/1', locale: 'ja', strings: { [`${id}:arrival#name`]: '到着', [`${id}:traveler#name`]: '旅人', [`${id}:view#alt`]: '港の風景', [`${id}:music#alt`]: '港の音楽' } },
                'en.json': { format: 'lorerelay-localization/1', locale: 'en', strings: { [`${id}:town#label`]: 'Harbor town' } },
            };
            for (const [name, doc] of Object.entries({ 'lorerelay.mod.json': manifest, ...docs })) fs.writeFileSync(path.join(root, name), JSON.stringify(doc));
            fs.writeFileSync(path.join(root, 'image.png'), png()); fs.writeFileSync(path.join(root, 'music.wav'), wav()); fs.writeFileSync(path.join(root, 'bell.wav'), wav(0.02));
            const result = await discovery.hashDiscoveredModPackage({ globalStorageRoot, source: 'global', id, version: '1.0.0', expectedManifestHash: hash.hashCanonicalModJson(manifest), allowAdultContentRead: true, includeContentFiles: true });
            ok(result.candidate, `strict catalog closure hashes ${id}: ${JSON.stringify(result.diagnostics)}`);
            return { ...result.candidate, files: result.contentFiles, root, docs };
        }
        const active = await install('example.story'), inactive = await install('inactive.story'), adult = await install('adult.story', 'adult');
        const installed = [adult, active, inactive];
        function resolve(packages, allowAdult = false) {
            const profile = { format: 'lorerelay-mod-profile/1', enabled: packages.map(pkg => ({ id: pkg.manifest.id, version: '1.0.0', source: 'global' })), selected: { campaignKit: null }, adultContent: { allow: allowAdult, approvals: allowAdult ? packages.filter(p => p.manifest.contentRating === 'adult').map(p => ({ id: p.manifest.id, version: '1.0.0', manifestHash: p.manifestHash, contentHash: p.contentHash })) : [] } };
            const result = resolver.resolveModProfile(profile, installed, '1.84.32'); ok(result.ok, 'resolve fixture'); return { profile, lock: result.lock };
        }
        function campaign(name, profile, lock) { const ws = path.join(temp, name); fs.mkdirSync(path.join(ws, '.text-adventure'), { recursive: true }); fs.writeFileSync(path.join(ws, '.text-adventure/mod-profile.json'), profileCore.serializeModProfile(profile)); fs.writeFileSync(path.join(ws, '.text-adventure/mod-lock.json'), profileCore.serializeModLock(lock)); return ws; }
        const { profile, lock } = resolve([active]), ws = campaign('campaign', profile, lock);
        const input = workspaceRoot => ({ workspaceRoot, globalStorageRoot, currentLoreRelayVersion: '1.84.32', adultSessionAllowed: false });
        const registry = core.buildModContentRegistry(lock, installed);
        eq(registry.assets.map(x => x.id), ['example.story:bell', 'example.story:music', 'example.story:view'], 'deterministic asset order; inactive/adult excluded');
        eq(registry, core.buildModContentRegistry(lock, [...installed].reverse()), 'enumeration order cannot change registry');
        eq(loc.resolveModLocalizedField(registry, 'example.story:traveler', 'name', 'ja'), '旅人', 'exact locale');
        eq(loc.resolveModLocalizedField(registry, 'example.story:town', 'label', 'ja'), 'Harbor town', 'same MOD English fallback');
        eq(loc.resolveModLocalizedField(registry, 'example.story:arrival', 'description', 'ja'), 'Source scenario description', 'authored text fallback');
        eq(loc.resolveModLocalizedField(registry, 'example.story:traveler', 'name', 'ja-JP'), 'Traveler', 'no invented language-only fallback');
        eq(loc.resolveModLocalizedField(registry, 'inactive.story:traveler', 'name', 'ja'), undefined, 'no fallback to another package');
        eq(registry.personas[0].value.name, 'Traveler', 'persona prompt content unchanged');
        eq(registry.scenarios[0].value.opening.narrative, 'Source opening never translated', 'scenario opening unchanged');
        eq(registry.lorebooks[0].value.content, 'Source lore never translated', 'lore content unchanged');
        eq(loc.localizeModLoreLabels(registry, ['📌 example.story:town — Town', 'Local label', 'example.story:town — Forged'], 'ja'), ['📌 example.story:town — Harbor town', 'Local label', 'example.story:town — Forged'], 'display-only lore translation retains attribution and exact source binding');
        function changed(name, mutate) { const files = active.files.map(file => { if (file.path !== name) return file; const doc = JSON.parse(Buffer.from(file.bytes)); mutate(doc); return { ...file, bytes: Buffer.from(JSON.stringify(doc)) }; }); return () => core.buildModContentRegistry(lock, [{ ...active, files }]); }
        for (const key of ['webview.error', 'gm.system', 'base:town#label', 'inactive.story:town#label', 'example.story:town#content', 'example.story:traveler#speakingStyle', 'example.story:arrival#opening', 'example.story:missing#name', 'example.story:town#constructor']) throws(changed('ja.json', d => { d.strings[key] = 'forbidden'; }), `localization namespace/field: ${key}`);
        for (const value of ['<script>', '![x](file:///x)', 'line\ntext', 'x'.repeat(4097), 7]) throws(changed('ja.json', d => { d.strings['example.story:traveler#name'] = value; }), 'localization strict plain-text/size/type');
        for (const value of ['javascript:alert(1)', 'mailto:user@example.com', 'custom+thing.v2:item', 'urn:uuid:123', 'Prefix javascript:alert(1)', '[link](/path)', '[link][ref]', '[ref]: /path', '![image](relative.png)', '<https://example.com>', '<user@example.com>', 'www.example.com', 'user@example.com']) throws(changed('ja.json', d => { d.strings['example.story:traveler#name'] = value; }), `localization rejects generic URI/Markdown/autolink: ${value}`);
        for (const value of ['Note: ordinary prose', '時刻: 12:30', 'Ratio 1:2', '備考：通常の文章', '[ordinary bracketed words]']) {
            const result = changed('ja.json', d => { d.strings['example.story:traveler#name'] = value; })();
            eq(loc.resolveModLocalizedField(result, 'example.story:traveler', 'name', 'ja'), value, 'ordinary colon/bracket prose survives');
        }
        throws(changed('ja.json', d => { d.locale = 'en'; }), 'descriptor locale binding');
        throws(changed('ja.json', d => { d.replace = true; }), 'no replacement directive');
        for (const mutate of [d => d.assets[0].path = '../image.png', d => d.assets[0].path = 'https://x/a.png', d => d.assets[0].path = 'C:/a.png', d => d.assets[0].id = 'traveler', d => d.assets.push(d.assets[0]), d => d.assets[0].script = 'x', d => d.assets[0].mediaType = 'image/svg+xml', d => d.assets[0].kind = 'video']) throws(changed('assets.json', mutate), 'catalog paths/namespace/collision/schema');
        const dupLocale = { ...active, manifest: { ...active.manifest, entrypoints: { ...active.manifest.entrypoints, localization: [...active.manifest.entrypoints.localization, { locale: 'ja', path: 'ja.json' }] } } };
        throws(() => core.buildModContentRegistry(lock, [dupLocale]), 'duplicate resource/field/locale fails closed');
        const opened = [], originalOpen = fsp.open;
        fsp.open = async function(filename, ...args) { opened.push(String(filename)); return originalOpen.call(this, filename, ...args); };
        try { eq((await gate.evaluateModActivationGate(input(ws))).decision.mode, 'normal', 'presentation gate activation'); } finally { fsp.open = originalOpen; }
        for (const pkg of [adult, inactive]) eq(opened.filter(name => name.startsWith(pkg.root) && !name.endsWith('lorerelay.mod.json')), [], 'inactive/adult payload stays unread');
        const permission = resolve([adult], true), adultWs = campaign('adult-campaign', permission.profile, permission.lock);
        eq((await gate.evaluateModActivationGate(input(adultWs))).decision.mode, 'safe-required', 'production adult session remains denied even with profile approval');
        eq(gate.getActiveModContributions(adultWs), undefined, 'adult localization/catalog never exposed');
        eq(gate.getActiveModAsset(ws, 'inactive.story:view'), undefined, 'inactive asset ID');
        eq(gate.getActiveModAsset(ws, 'adult.story:view'), undefined, 'adult asset ID');
        const detached = gate.getActiveModAsset(ws, 'example.story:view'); detached.bytes[0] = 0;
        eq(gate.getActiveModAsset(ws, 'example.story:view').bytes[0], 137, 'immutable verified-buffer ownership');
        const detachedRegistry = gate.getActiveModContributions(ws); detachedRegistry.localization[0].text = 'forged';
        eq(gate.getActiveModContributions(ws), registry, 'detached localization/metadata');

        let lastUri, revoked = 0; const messages = [];
        const panel = { webview: { options: { localResourceRoots: [] }, asWebviewUri: uri => { lastUri = uri; return { toString: () => `https://broker.test${uri.path}` }; }, postMessage: m => { messages.push(m); return Promise.resolve(true); } }, onDidDispose: fn => { disposeCallbacks.push(fn); return new Disposable(); } };
        global.setInterval = fn => { timers.push(fn); return { unref() {} }; }; global.clearInterval = () => {};
        broker.attachModAssetBroker(panel, ws, () => revoked++);
        global.setInterval = nativeInterval;
        const uri = broker.resolveModAssetForWebview(panel, ws, 'example.story:view'), issued = lastUri;
        ok(uri && !uri.includes(ws) && !uri.includes(active.root) && !uri.includes('example.story'), 'URI contains only opaque session/id tokens');
        eq(panel.webview.options.localResourceRoots[0].scheme, 'lorerelay-mod-asset', 'no package filesystem root granted');
        eq(provider.readFile(issued), png(), 'read serves exact hashed PNG buffer');
        eq(provider.stat(issued).size, png().length, 'stat is guarded too');
        let releaseRefresh, enteredRefresh;
        const heldRefresh = new Promise(resolve => { releaseRefresh = resolve; });
        const refreshEntered = new Promise(resolve => { enteredRefresh = resolve; });
        const openBeforeRefresh = fsp.open;
        let held = false;
        fsp.open = async function(filename, ...args) {
            if (!held && String(filename).endsWith('mod-profile.json')) { held = true; enteredRefresh(); await heldRefresh; }
            return openBeforeRefresh.call(this, filename, ...args);
        };
        let refresh;
        try {
            refresh = gate.acquireModCanonicalAuthorization(ws);
            await refreshEntered;
            eq(gate.isModActivationGateRefreshing(ws), true, 'real canonical acquisition reports pending revalidation');
            timers[0](); eq(revoked, 0, 'routine pending rehash is not permanent revocation');
            throws(() => provider.readFile(issued), 'pending revalidation still denies provider reads');
            throws(() => provider.stat(issued), 'pending revalidation still denies provider stat');
            eq(broker.resolveModAssetForWebview(panel, ws, 'example.story:view'), undefined, 'pending verification cannot issue new URI grants');
        } finally { releaseRefresh(); fsp.open = openBeforeRefresh; }
        eq((await refresh).mode, 'modded', 'unchanged lock revalidates normally');
        eq(gate.isModActivationGateRefreshing(ws), false, 'pending marker clears after completed gate');
        timers[0](); eq(revoked, 0, 'successful routine acquisition preserves healthy panel');
        eq(provider.readFile(issued), png(), 'already issued URI survives unchanged-lock refresh');
        eq(broker.resolveModAssetForWebview(panel, ws, 'example.story:view'), uri, 'same panel can resolve after routine refresh');
        eq(broker.resolveModAssetForWebview(panel, adultWs, 'example.story:view'), undefined, 'panel cannot cross workspace');
        for (const id of ['inactive.story:view', 'adult.story:view', '../image.png', 'file:///secret', 'example.story:unknown']) eq(broker.resolveModAssetForWebview(panel, ws, id), undefined, 'only locked ID lookup');
        for (const change of [{ scheme: 'file' }, { authority: 'other' }, { query: 'x' }, { fragment: 'x' }, { path: issued.path + '/..' }]) throws(() => provider.readFile({ ...issued, ...change }), 'forged URI denied');
        for (const method of ['readDirectory', 'createDirectory', 'writeFile', 'delete', 'rename']) throws(() => provider[method](issued), 'read-only broker has no enumeration/mutation');
        eq(broker.isLegacyMediaOutsideModPackages(path.join(active.root, 'image.png')), false, 'legacy paths cannot bypass active broker');
        eq(broker.isLegacyMediaOutsideModPackages(path.join(inactive.root, 'image.png')), false, 'legacy paths cannot read inactive MOD');
        const legacy = path.join(ws, 'legacy.wav'); fs.writeFileSync(legacy, wav());
        eq(broker.isLegacyMediaOutsideModPackages(legacy), true, 'ordinary local legacy media compatible');
        const junctionPackage = path.join(temp, 'junction-campaign/.text-adventure/mods/inactive.story/1.0.0');
        const junctionTarget = path.join(temp, 'legacy-target');
        fs.mkdirSync(junctionPackage, { recursive: true }); fs.mkdirSync(junctionTarget);
        fs.writeFileSync(path.join(junctionPackage, 'lorerelay.mod.json'), '{}'); fs.writeFileSync(path.join(junctionTarget, 'music.wav'), wav());
        fs.symlinkSync(junctionTarget, path.join(junctionPackage, 'redirect'), 'junction');
        const redirected = path.join(junctionPackage, 'redirect/music.wav');
        eq(broker.isLegacyMediaOutsideModPackages(redirected), false, 'junction out of inactive MOD retains its lexical MOD ancestry');
        eq(broker.isLegacyMediaOutsideModPackages(path.join(junctionTarget, 'music.wav')), true, 'ordinary target itself is still legacy-compatible');
        fs.writeFileSync(path.join(ws, 'bgm.json'), JSON.stringify([{ id: 'legacy', file: legacy }, { id: 'raw-inactive', file: path.join(inactive.root, 'music.wav') }, { id: 'raw-junction', file: redirected }, { id: 'example.story:music', file: legacy }]));
        const media = boundary('mediaManifest.js', { './workspacePaths': { getWorkspacePath: () => ws }, './mods/modAssetBroker': broker, './mods/modActivationGateHost': gate, './mods/modPathCore': require('../out/mods/modPathCore'), './i18n': { getConfiguredLocale: () => 'ja' } });
        media.initMediaManifest({ getPanel: () => panel }); media.sendBgmManifest(); media.sendSfxManifest();
        eq(messages.find(m => m.type === 'bgmManifest').tracks.map(x => x.id), ['legacy', 'example.story:music'], 'existing music manifest appends locked audio without raw fallback/collision');
        eq(messages.find(m => m.type === 'bgmManifest').tracks[1].description, '港の音楽', 'asset alt localized at presentation boundary');
        eq(messages.find(m => m.type === 'sfxManifest').sounds.map(x => x.id), ['example.story:bell'], 'locked SFX reaches existing manifest');
        let selected;
        vscode.window.showQuickPick = async items => { selected = items; return undefined; };
        const scenario = boundary('scenarioPack.js', { './workspacePaths': { getWorkspacePath: () => ws }, './mods/modActivationGateHost': gate, './i18n': { t: x => x, getConfiguredLocale: () => 'ja' } });
        await scenario.loadScenarioPack(); eq(selected[1].label, '到着', 'real Scenario picker receives localized display name'); eq(selected[1].description, 'example.story:arrival', 'Scenario retains canonical attribution');
        const parlor = boundary('parlorBridge.js', {
            './workspacePaths': { getWorkspacePath: () => ws, getGameStatePath: () => undefined }, './mods/modAssetBroker': broker, './mods/modActivationGateHost': gate,
            './i18n': { t: x => x, getConfiguredLocale: () => 'ja' }, './persona': { loadPlayerPersona: () => registry.personas[0].value }, './personaPreset': { listPlayerPersonaPresets: () => registry.personas.map(x => x.value) },
            './experience': { loadExperienceConfig: () => ({ parlor: {} }), isParlorMode: () => false, isInWorldMode: () => false }, './connectionProfile': { loadConnectionProfiles: () => ({ profiles: [] }) },
            './characterManager': { getActiveCharacterId: () => undefined, getCharacters: () => [] }, './parlorBackground': { listWorkspaceParlorBackgrounds: () => [] },
        });
        parlor.initParlorBridge({ getPanel: () => panel }); parlor.sendParlorSettingsToWebview();
        const settings = messages.find(m => m.type === 'parlorSettings'); eq(settings.personaPresets[0].displayName, '旅人', 'real Persona display is localized'); eq(settings.persona.name, 'Traveler', 'editable/source persona is not translated'); eq(settings.backgrounds[0].id, 'example.story:view', 'raster ID reaches existing background gallery');

        fs.appendFileSync(path.join(active.root, 'image.png'), 'changed');
        throws(() => provider.readFile(issued), 'already-issued URI stops after package drift');
        throws(() => provider.stat(issued), 'stat/cache validation stops after package drift');
        eq(gate.getActiveModContributions(ws), undefined, 'localization also disappears after drift');
        timers[0](); eq(revoked, 1, 'presentation refresh revokes already-rendered assets'); timers[0](); eq(revoked, 1, 'no repeated revoke notification');
        eq(broker.resolveModAssetForWebview(panel, ws, 'example.story:view'), undefined, 'no URI reissue on stale panel');
        for (const fn of disposeCallbacks) fn(); throws(() => provider.readFile(issued), 'panel disposal revokes grants');

        // Execute the actual media module with tiny DOM/audio stubs: revocation also stops in-flight playback.
        const audio = [], elements = new Map(), intervalCallbacks = new Map(); let timerId = 0;
        const element = () => ({ style: {}, classList: { toggle() {} }, addEventListener() {}, appendChild() {}, value: '', innerHTML: '', textContent: '' });
        class Audio { constructor(src = '') { this.src = src; this.paused = true; audio.push(this); } play() { this.paused = false; return Promise.resolve(); } pause() { this.paused = true; } addEventListener() {} }
        const ctx = vm.createContext({ Audio, document: { getElementById: id => { if (!elements.has(id)) elements.set(id, element()); return elements.get(id); }, createElement: element }, setInterval: fn => { intervalCallbacks.set(++timerId, fn); return timerId; }, clearInterval: id => intervalCallbacks.delete(id), console });
        vm.runInContext(fs.readFileSync(path.join(__dirname, '../webview/modules/30-bgm-sfx.js'), 'utf8'), ctx);
        vm.runInContext("setBgmManifest([{id:'mod:music',uri:'safe',modAsset:true}],50,true); bgmAudioReady=true; playBgmById('mod:music'); setSfxManifest([{id:'mod:bell',uri:'bell',modAsset:true}],70,true); playSfx('mod:bell');", ctx);
        ok(audio.some(a => !a.paused), 'real media code starts authorized clips');
        vm.runInContext('setBgmManifest([],50,true); setSfxManifest([],70,true);', ctx);
        ok(audio.every(a => a.paused), 'revocation pauses background crossfade and SFX'); eq(intervalCallbacks.size, 0, 'revocation cancels pending crossfade');
        vm.runInContext("setBgmManifest([{id:'mod:music',uri:'safe',modAsset:true},{id:'local',uri:'legacy'}],50,true); playBgmById('mod:music');", ctx);
        for (let tick = 0; tick < 24; tick++) for (const callback of [...intervalCallbacks.values()]) callback();
        vm.runInContext("playBgmById('local'); setBgmManifest([{id:'local',uri:'legacy'}],50,true);", ctx);
        ok(audio.every(a => a.paused), 'revocation also stops the fading-out MOD track after current ID changes to legacy');
        eq(intervalCallbacks.size, 0, 'mixed MOD-to-legacy crossfade cannot restart revoked audio');
        console.log(`MOD presentation adapters: ${assertions} assertions passed.`);
    } finally {
        global.setInterval = nativeInterval; global.clearInterval = nativeClearInterval;
        registration.dispose(); gate.clearModActivationGateRuntime(); Module.prototype.require = originalRequire;
        fs.rmSync(temp, { recursive: true, force: true });
    }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
