#!/usr/bin/env node
'use strict';
const assert = require('assert');
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const os = require('os');
const zlib = require('zlib');
const { parseModZipArchive, readModZipEntry } = require('../out/mods/modZipCore');
const install = require('../out/mods/modInstallHost');
const { discoverModPackageManifests } = require('../out/mods/modDiscoveryHost');
let assertions = 0;
const eq = (a, b, msg) => { assertions++; assert.deepStrictEqual(a, b, msg); };
const ok = (value, msg) => { assertions++; assert.ok(value, msg); };
async function rejects(action, code) { assertions++; await assert.rejects(action, error => !code || error.code === code); }
function crc(bytes) { let n = 0xffffffff; for (const byte of bytes) { n ^= byte; for (let i = 0; i < 8; i++) n = n & 1 ? (n >>> 1) ^ 0xedb88320 : n >>> 1; } return (n ^ 0xffffffff) >>> 0; }
function archive(entries, edit) {
    let offset = 0;
    const locals = [], centrals = [];
    for (const entry of entries) {
        const name = Buffer.isBuffer(entry.name) ? entry.name : Buffer.from(entry.name), bytes = Buffer.from(entry.bytes || '');
        const method = entry.method ?? 0, flags = entry.flags ?? 0x800, payload = method === 8 ? zlib.deflateRawSync(bytes) : bytes;
        const extra = entry.extra || Buffer.alloc(0), checksum = entry.crc ?? crc(bytes), expanded = entry.expanded ?? bytes.length;
        const h = Buffer.alloc(30); h.writeUInt32LE(0x04034b50); h.writeUInt16LE(20, 4); h.writeUInt16LE(flags, 6); h.writeUInt16LE(method, 8);
        if (!(flags & 8)) { h.writeUInt32LE(checksum, 14); h.writeUInt32LE(payload.length, 18); h.writeUInt32LE(expanded, 22); }
        h.writeUInt16LE(name.length, 26); h.writeUInt16LE(extra.length, 28);
        const c = Buffer.alloc(46); c.writeUInt32LE(0x02014b50); c.writeUInt16LE((3 << 8) | 20, 4); c.writeUInt16LE(20, 6); c.writeUInt16LE(flags, 8); c.writeUInt16LE(method, 10);
        c.writeUInt32LE(checksum, 16); c.writeUInt32LE(payload.length, 20); c.writeUInt32LE(expanded, 24); c.writeUInt16LE(name.length, 28); c.writeUInt16LE(extra.length, 30);
        c.writeUInt32LE(entry.attrs ?? (((String(entry.name).endsWith('/') ? 0x41ed : 0x81a4) * 65536) >>> 0), 38); c.writeUInt32LE(offset, 42);
        const descriptor = flags & 8 ? Buffer.alloc(entry.unsignedDescriptor ? 12 : 16) : Buffer.alloc(0);
        if (descriptor.length) { const at = descriptor.length === 16 ? 4 : 0; if (at) descriptor.writeUInt32LE(0x08074b50); descriptor.writeUInt32LE(checksum, at); descriptor.writeUInt32LE(payload.length, at + 4); descriptor.writeUInt32LE(expanded, at + 8); }
        const local = Buffer.concat([h, name, extra, payload, descriptor]); locals.push(local); centrals.push(Buffer.concat([c, name, extra])); offset += local.length;
    }
    const directory = Buffer.concat(centrals), end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10); end.writeUInt32LE(directory.length, 12); end.writeUInt32LE(offset, 16);
    const result = Buffer.concat([...locals, directory, end]); edit?.(result, offset); return result;
}
function reader(bytes, reads = []) { return { size: bytes.length, read: async (offset, length) => { reads.push([offset, length]); return bytes.subarray(offset, offset + length); } }; }
function packageFiles(id = 'example.install', rating = 'general', dependencies = []) {
    const manifest = { format: 'lorerelay-mod/1', id, version: '1.0.0', name: 'Fixture', authors: ['test'], lorerelay: { minVersion: '1.84.32' }, contentRating: rating, contentTags: [], capabilities: ['localization', 'persona'], dependencies, optionalDependencies: [], conflicts: [], entrypoints: { personas: [{ id: 'traveler', path: 'content/persona.json' }], localization: [{ locale: 'en', path: 'content/en.json' }] } };
    return {
        'lorerelay.mod.json': Buffer.from(JSON.stringify(manifest)),
        'content/persona.json': Buffer.from(JSON.stringify({ version: 1, id: 'traveler', name: 'Traveler', description: 'Fixture persona' })),
        'content/en.json': Buffer.from(JSON.stringify({ format: 'lorerelay-localization/1', locale: 'en', strings: { [`${id}:traveler#name`]: 'Name: ordinary prose' } })),
    };
}
function entries(files, options = {}) { return Object.entries(files).map(([name, bytes]) => ({ name, bytes, ...options })); }
function folder(root, files) { fs.mkdirSync(root, { recursive: true }); for (const [name, bytes] of Object.entries(files)) { fs.mkdirSync(path.dirname(path.join(root, name)), { recursive: true }); fs.writeFileSync(path.join(root, name), bytes); } return root; }
function profile(ids) { return { format: 'lorerelay-mod-profile/1', enabled: ids.map(id => ({ id, version: '>=1.0.0 <2.0.0', source: 'any' })), selected: { campaignKit: null }, adultContent: { allow: false, approvals: [] } }; }

async function main() {
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'lorerelay-mod-install-'));
    const roots = { globalStorageRoot: folder(path.join(temp, 'global'), {}), workspaceRoot: folder(path.join(temp, 'workspace'), {}) };
    const source = folder(path.join(temp, 'source'), packageFiles());
    const staging = path.join(roots.globalStorageRoot, 'mods/staging');
    const target = path.join(roots.globalStorageRoot, 'mods/packages/example.install/1.0.0');
    try {
        const valid = archive(entries(packageFiles()));
        const parsed = await parseModZipArchive(reader(valid));
        eq(parsed.length, 3, 'stored ZIP central directory parsed');
        for (let i = 0; i < parsed.length; i++) eq(await readModZipEntry(reader(valid), parsed[i]), entries(packageFiles())[i].bytes, 'stored entry CRC/size');
        for (const flags of [0, 0x800, 0x808]) for (const unsignedDescriptor of [false, true]) {
            const zip = archive(entries(packageFiles(), { method: 8, flags, unsignedDescriptor }));
            const list = await parseModZipArchive(reader(zip));
            eq(await readModZipEntry(reader(zip), list[0]), packageFiles()['lorerelay.mod.json'], 'deflate, ASCII/UTF-8, signed/unsigned descriptor');
        }
        for (const name of ['../x.json', '/x.json', 'C:/x.json', 'a\\x.json', 'CON.json', 'x.json:ads', 'a/../x.json', 'a//x.json', 'a./x.json', 'e\u0301.json', '%2e%2e/x.json']) {
            await rejects(() => parseModZipArchive(reader(archive([...entries(packageFiles()), { name, bytes: '{}' }]))));
        }
        for (const extra of [{ name: 'CONTENT/en.json', bytes: '{}' }, { name: 'content', bytes: '{}' }, { name: 'content/en.json', bytes: '{}' }, { name: 'payload.js', bytes: 'x' }, { name: 'nested.zip', bytes: 'PK' }]) await rejects(() => parseModZipArchive(reader(archive([...entries(packageFiles()), extra]))));
        for (const attrs of [0xa1ff0000, 0x61ff0000, 0x21ff0000, 0x11ff0000, 0x81a40400]) await rejects(() => parseModZipArchive(reader(archive(entries(packageFiles(), { attrs })) )));
        for (const flags of [1, 0x40, 0x2000]) await rejects(() => parseModZipArchive(reader(archive(entries(packageFiles(), { flags })))));
        for (const method of [9, 12, 99]) await rejects(() => parseModZipArchive(reader(archive(entries(packageFiles(), { method })))));
        await rejects(() => parseModZipArchive(reader(archive([...entries(packageFiles()), { name: Buffer.from([0xff, 46, 106, 115, 111, 110]), bytes: '{}' }]))));
        await rejects(() => parseModZipArchive(reader(archive(entries(packageFiles(), { extra: Buffer.from([1, 0, 0, 0]) })))), 'MOD_ZIP_EXTRA_UNSUPPORTED');
        await rejects(() => parseModZipArchive(reader(archive(entries(packageFiles()), (b, cd) => b.writeUInt32LE(1, cd + 42)))), 'MOD_ZIP_LAYOUT_INVALID');
        await rejects(() => parseModZipArchive(reader(archive(entries(packageFiles()), b => b[30] ^= 1))), 'MOD_ZIP_HEADER_MISMATCH');
        await rejects(() => parseModZipArchive(reader(valid.subarray(0, valid.length - 1))));
        await rejects(() => parseModZipArchive(reader(Buffer.concat([valid, Buffer.from('trailer')]))));
        await rejects(() => parseModZipArchive(reader(archive(entries(packageFiles()), b => b.writeUInt16LE(1, b.length - 18)))));
        await rejects(() => parseModZipArchive(reader(archive([{ name: 'wrapper/lorerelay.mod.json', bytes: packageFiles()['lorerelay.mod.json'] }]))));
        await rejects(() => parseModZipArchive(reader(archive([...entries(packageFiles()), { name: 'bomb.json', bytes: Buffer.alloc(1024 * 1024), method: 8 }]))), 'MOD_ZIP_EXPANSION_LIMIT');
        await rejects(() => parseModZipArchive(reader(archive([...entries(packageFiles()), { name: 'huge.json', bytes: '{}', expanded: 5 * 1024 * 1024 }]))), 'MOD_ZIP_EXPANSION_LIMIT');
        const badCrc = archive(entries(packageFiles(), { crc: 12 })), badList = await parseModZipArchive(reader(badCrc));
        await rejects(() => readModZipEntry(reader(badCrc), badList[0]), 'MOD_ZIP_CONTENT_MISMATCH');
        const understated = archive(entries(packageFiles(), { method: 8, expanded: 1 })), understatedEntries = await parseModZipArchive(reader(understated));
        await rejects(() => readModZipEntry(reader(understated), understatedEntries[0]), 'MOD_ZIP_DECOMPRESSION_FAILED');
        await rejects(() => parseModZipArchive(reader(archive([...entries(packageFiles()), ...Array.from({ length: 2048 }, (_, i) => ({ name: `file-${i}.json`, bytes: '{}' }))]))), 'MOD_ZIP_ENTRY_LIMIT');
        await rejects(() => parseModZipArchive(reader(archive([...entries(packageFiles()), ...Array.from({ length: 256 }, (_, i) => ({ name: `dir-${i}/file.json`, bytes: '{}' }))]))), 'MOD_ZIP_ENTRY_LIMIT');
        const descriptorMismatch = archive(entries(packageFiles(), { flags: 0x808 }));
        const descriptorAt = 30 + Buffer.byteLength('lorerelay.mod.json') + packageFiles()['lorerelay.mod.json'].length;
        descriptorMismatch.writeUInt32LE(1, descriptorAt + 8);
        await rejects(() => parseModZipArchive(reader(descriptorMismatch)), 'MOD_ZIP_DESCRIPTOR_MISMATCH');
        const adultZip = archive(entries(packageFiles('adult.zip', 'adult'))), metadataReads = [];
        const adultEntries = await parseModZipArchive(reader(adultZip, metadataReads));
        await readModZipEntry(reader(adultZip, metadataReads), adultEntries[0]);
        for (const entry of adultEntries.slice(1)) ok(metadataReads.every(([offset, length]) => offset + length <= entry.dataOffset || offset >= entry.dataOffset + entry.compressed), 'ZIP inspection reads no non-manifest payload');
        await rejects(() => parseModZipArchive({ size: 128 * 1024 * 1024 + 1, read: async () => { throw Error('must not read'); } }), 'MOD_ZIP_SIZE_LIMIT');
        const inspection = await install.inspectLocalModImport({ filename: source, kind: 'folder' });
        eq(Object.keys(inspection).sort(), ['contentRating', 'id', 'manifestHash', 'version'], 'inspection contains no source paths/content');
        eq((await install.installLocalModPackage({ ...roots, destination: 'global', inspection: { ...inspection } })).code, 'MOD_IMPORT_INSPECTION_REQUIRED', 'forged capability denied');
        let result = await install.installLocalModPackage({ ...roots, destination: 'global', inspection });
        eq(result.status, 'installed', 'folder install'); eq(result.cleanup, 'complete', 'success staging cleanup');
        eq(result.candidate.source, 'global', 'destination source'); eq(fs.readdirSync(staging), [], 'no retained successful staging');
        eq(fs.readFileSync(path.join(target, 'content/persona.json')), packageFiles()['content/persona.json'], 'exact copied source bytes');
        eq(fs.readFileSync(path.join(source, 'content/persona.json')), packageFiles()['content/persona.json'], 'source unchanged');
        eq(result.rescan.manifests.length, 1, 'rescan sees installed manifest');
        const originalHash = result.candidate.contentHash;
        result = await install.installLocalModPackage({ ...roots, destination: 'global', inspection });
        eq(result.code, 'MOD_ALREADY_INSTALLED', 'identical version is not overwritten'); eq(result.cleanup, 'complete', 'duplicate cleanup');
        const report = fs.readFileSync(path.join(roots.globalStorageRoot, 'mods/validation-reports', `${result.reportId}.json`), 'utf8');
        ok(!report.includes(temp) && !report.includes('Fixture'), 'failure report has no source path or payload');
        fs.writeFileSync(path.join(source, 'content/persona.json'), JSON.stringify({ version: 1, id: 'traveler', name: 'Changed' }));
        result = await install.installLocalModPackage({ ...roots, destination: 'global', inspection });
        eq(result.code, 'MOD_INSTALL_VARIANT_CONFLICT', 'same id/version different content is explicit conflict');
        eq(fs.readFileSync(path.join(target, 'content/persona.json')), packageFiles()['content/persona.json'], 'conflict preserves installed content');
        const zipPath = path.join(temp, 'source.zip'); fs.writeFileSync(zipPath, valid);
        const zipInspection = await install.inspectLocalModImport({ filename: zipPath, kind: 'zip' });
        result = await install.installLocalModPackage({ ...roots, destination: 'workspace', inspection: zipInspection });
        eq(result.status, 'installed', 'workspace ZIP install'); eq(result.candidate.contentHash, originalHash, 'folder and ZIP normalized hashes agree');
        eq(fs.readdirSync(path.join(roots.workspaceRoot, '.text-adventure/mod-staging')), [], 'workspace-local staging cleanup');
        const preview = await install.resolveInstalledModProfile({ ...roots, profile: profile(['example.install']), loreRelayVersion: '1.84.32' });
        eq(preview.ok, true, 'read-only resolve preview'); eq(preview.lock.packages[0].source, 'workspace', 'identical global/workspace chooses workspace');
        eq(fs.existsSync(path.join(roots.workspaceRoot, '.text-adventure/mod-profile.json')), false, 'preview never writes profile');
        eq(fs.existsSync(path.join(roots.workspaceRoot, '.text-adventure/mod-lock.json')), false, 'preview never writes lock');
        fs.writeFileSync(path.join(roots.workspaceRoot, '.text-adventure/mods/example.install/1.0.0/content/persona.json'), JSON.stringify({ version: 1, id: 'traveler', name: 'Variant' }));
        const conflict = await install.resolveInstalledModProfile({ ...roots, profile: profile(['example.install']), loreRelayVersion: '1.84.32' });
        eq(conflict.ok, false, 'resolve fails closed on global/workspace variant'); eq(conflict.diagnostics[0].code, 'DUPLICATE_VARIANT', 'variant resolver diagnostic');
        const adultSource = folder(path.join(temp, 'adult'), packageFiles('adult.install', 'adult'));
        const adult = await install.inspectLocalModImport({ filename: adultSource, kind: 'folder' });
        result = await install.installLocalModPackage({ ...roots, destination: 'global', inspection: adult });
        eq(result.code, 'ADULT_CONTENT_READ_NOT_AUTHORIZED', 'adult install requires distinct read permission');
        result = await install.installLocalModPackage({ ...roots, destination: 'global', inspection: adult, allowAdultContentRead: true });
        eq(result.status, 'installed', 'explicit adult package read allows installation, not activation');
        const denied = await install.resolveInstalledModProfile({ ...roots, profile: profile(['adult.install']), loreRelayVersion: '1.84.32' });
        eq(denied.ok, false, 'profile alone does not permit adult payload read'); eq(denied.diagnostics[0].code, 'ADULT_CONTENT_READ_NOT_AUTHORIZED', 'adult preview gate');
        const noApproval = await install.resolveInstalledModProfile({ ...roots, profile: profile(['adult.install']), adultReadRequests: [adult], loreRelayVersion: '1.84.32' });
        eq(noApproval.ok, false, 'read authorization is not activation consent');
        const missing = folder(path.join(temp, 'missing'), packageFiles('dependent.install', 'general', [{ id: 'absent.package', version: '>=1.0.0' }]));
        result = await install.installLocalModPackage({ ...roots, destination: 'global', inspection: await install.inspectLocalModImport({ filename: missing, kind: 'folder' }) });
        eq(result.status, 'installed', 'missing dependencies do not prevent storing a valid package');
        eq((await install.resolveInstalledModProfile({ ...roots, profile: profile(['dependent.install']), loreRelayVersion: '1.84.32' })).ok, false, 'resolve reports missing dependencies');
        const invalidFiles = packageFiles('invalid.install'); invalidFiles['content/en.json'] = Buffer.from(JSON.stringify({ format: 'lorerelay-localization/1', locale: 'en', strings: { 'invalid.install:traveler#name': 'javascript:alert(1)' } }));
        const invalidSource = folder(path.join(temp, 'invalid'), invalidFiles);
        result = await install.installLocalModPackage({ ...roots, destination: 'global', inspection: await install.inspectLocalModImport({ filename: invalidSource, kind: 'folder' }) });
        eq(result.code, 'MOD_LOCALIZATION_INVALID', 'P2 closed at install boundary'); eq(result.cleanup, 'complete', 'invalid content staging removed');
        eq(fs.existsSync(path.join(roots.globalStorageRoot, 'mods/packages/invalid.install/1.0.0')), false, 'invalid content never publishes');
        eq(fs.readFileSync(path.join(invalidSource, 'content/en.json')), invalidFiles['content/en.json'], 'rejection never modifies source');
        const driftSource = folder(path.join(temp, 'drift'), packageFiles('drift.install'));
        const drift = await install.inspectLocalModImport({ filename: driftSource, kind: 'folder' });
        const changedManifest = JSON.parse(fs.readFileSync(path.join(driftSource, 'lorerelay.mod.json'))); changedManifest.name = 'Changed manifest'; fs.writeFileSync(path.join(driftSource, 'lorerelay.mod.json'), JSON.stringify(changedManifest));
        eq((await install.installLocalModPackage({ ...roots, destination: 'global', inspection: drift })).code, 'MOD_IMPORT_MANIFEST_CHANGED', 'inspection manifest drift fails');
        const linked = folder(path.join(temp, 'linked'), packageFiles('linked.install'));
        fs.symlinkSync(source, path.join(linked, 'redirect'), 'junction');
        const linkedResult = await install.installLocalModPackage({ ...roots, destination: 'global', inspection: await install.inspectLocalModImport({ filename: linked, kind: 'folder' }) });
        eq(linkedResult.code, 'PACKAGE_LINK_FORBIDDEN', 'folder junction rejected'); eq(linkedResult.cleanup, 'complete', 'linked source cleanup');
        const hard = folder(path.join(temp, 'hard'), packageFiles('hard.install')); fs.linkSync(path.join(source, 'content/persona.json'), path.join(hard, 'README.md'));
        eq((await install.installLocalModPackage({ ...roots, destination: 'global', inspection: await install.inspectLocalModImport({ filename: hard, kind: 'folder' }) })).code, 'PACKAGE_HARD_LINK_FORBIDDEN', 'source hardlinks rejected');
        const cross = folder(path.join(temp, 'cross'), packageFiles('cross.install')); const crossInspection = await install.inspectLocalModImport({ filename: cross, kind: 'folder' });
        const rename = fsp.rename; let renameCalls = 0;
        fsp.rename = async () => { renameCalls++; throw Object.assign(new Error('cross device'), { code: 'EXDEV' }); };
        try { result = await install.installLocalModPackage({ ...roots, destination: 'global', inspection: crossInspection }); } finally { fsp.rename = rename; }
        eq(result.code, 'CROSS_DEVICE_STAGING', 'cross-device rename fails closed'); eq(renameCalls, 1, 'no rename retry/copy fallback'); eq(result.cleanup, 'complete', 'rename failure cleanup');
        eq(fs.existsSync(path.join(roots.globalStorageRoot, 'mods/packages/cross.install/1.0.0')), false, 'failed rename never publishes');
        const nativeStat = fsp.lstat; renameCalls = 0;
        fsp.lstat = async function(filename, ...args) { const stats = await nativeStat.call(this, filename, ...args); if (String(filename) === path.join(roots.globalStorageRoot, 'mods/packages/cross.install')) { const changed = Object.assign(Object.create(Object.getPrototypeOf(stats)), stats); changed.dev++; return changed; } return stats; };
        fsp.rename = async (...args) => { renameCalls++; return rename(...args); };
        try { result = await install.installLocalModPackage({ ...roots, destination: 'global', inspection: crossInspection }); } finally { fsp.lstat = nativeStat; fsp.rename = rename; }
        eq(result.code, 'CROSS_DEVICE_STAGING', 'volume identity mismatch rejects before rename'); eq(renameCalls, 0, 'cross-volume preflight never attempts rename');
        const changingSource = folder(path.join(temp, 'changing'), packageFiles('changing.install'));
        const changing = await install.inspectLocalModImport({ filename: changingSource, kind: 'folder' });
        const nativeMkdir = fsp.mkdir;
        fsp.mkdir = async function(filename, ...args) {
            const result = await nativeMkdir.call(this, filename, ...args);
            if (String(filename) === path.join(roots.globalStorageRoot, 'mods/packages/changing.install')) {
                const uuid = fs.readdirSync(staging).find(name => /^[a-f0-9-]{36}$/.test(name));
                fs.appendFileSync(path.join(staging, uuid, 'mods/packages/changing.install/1.0.0/content/persona.json'), ' ');
            }
            return result;
        };
        try { result = await install.installLocalModPackage({ ...roots, destination: 'global', inspection: changing }); } finally { fsp.mkdir = nativeMkdir; }
        eq(result.code, 'MOD_INSTALL_STAGING_CHANGED', 'post-hash staging modification rejects before publication'); eq(result.cleanup, 'complete', 'modified owned staging cleanup');
        eq(fs.existsSync(path.join(roots.globalStorageRoot, 'mods/packages/changing.install/1.0.0')), false, 'changed staging never publishes');
        const rogueRoot = folder(path.join(temp, 'rogue'), {}), externalRoot = folder(path.join(temp, 'external'), {});
        fs.symlinkSync(externalRoot, path.join(rogueRoot, 'mods'), 'junction');
        eq((await install.installLocalModPackage({ globalStorageRoot: rogueRoot, destination: 'global', inspection: crossInspection })).status, 'rejected', 'destination junction rejected');
        eq(fs.readdirSync(externalRoot), [], 'unsafe destination causes no outside writes');
        fs.mkdirSync(path.join(staging, '.install-lock'));
        eq((await install.installLocalModPackage({ ...roots, destination: 'global', inspection: crossInspection })).code, 'MOD_INSTALL_BUSY', 'cross-process scope lock');
        ok(fs.existsSync(path.join(staging, '.install-lock')), 'another transaction lock not removed'); fs.rmdirSync(path.join(staging, '.install-lock'));
        eq((await discoverModPackageManifests(roots)).diagnostics, [], 'final metadata rescan remains valid');
        console.log(`MOD install lifecycle: ${assertions} assertions passed.`);
    } finally {
        // Test-owned unique temp tree only; junctions are removed as links by rm.
        assert.ok(path.dirname(temp) === os.tmpdir() && path.basename(temp).startsWith('lorerelay-mod-install-'));
        fs.rmSync(temp, { recursive: true, force: true });
    }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
