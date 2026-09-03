import * as path from 'path';
import * as fs from 'fs/promises';
import { constants, type Stats } from 'fs';
import { randomUUID } from 'crypto';
import { ModDataError, hashCanonicalModJson, hashNormalizedModPackage, type ModPackageHashFile } from './modHashCore';
import { MAX_MOD_MANIFEST_BYTES, parseModManifestBytes, type ModManifest } from './modManifestCore';
import { discoverModPackageManifests, hashDiscoveredModPackage, readModImportFolder, type ModDiscoveryRoots } from './modDiscoveryHost';
import { resolveModProfile, type ModPackageCandidate } from './modResolverCore';
import { validateModProfile, serializeModLock, serializeModProfile, type ModProfile, type ModResolvedSource } from './modProfileCore';
import { validateModRelativePath } from './modPathCore';
import { validateModContentPackage } from './contributions/modContentCore';
import { parseModZipArchive, readModZipEntry, type ModZipReader } from './modZipCore';

export interface ModImportInspection {
    readonly id: string;
    readonly version: string;
    readonly manifestHash: string;
    readonly contentRating: ModManifest['contentRating'];
}
export interface ModInstallRequest extends ModDiscoveryRoots {
    inspection: ModImportInspection;
    destination: ModResolvedSource;
    /** Trusted caller permission for this inspected package; never sourced from a manifest/profile. */
    allowAdultContentRead?: boolean;
}
export type ModInstallResult =
    | { status: 'installed'; candidate: ModPackageCandidate; cleanup: 'complete' | 'retained'; rescan: Awaited<ReturnType<typeof discoverModPackageManifests>> }
    | { status: 'rejected'; code: string; cleanup: 'not-needed' | 'complete' | 'retained'; reportId?: string };

interface Pin { filename: string; stats: Stats }
interface InspectionSource { filename: string; kind: 'folder' | 'zip'; manifest: ModManifest; manifestHash: string; stats: Stats }
const inspections = new WeakMap<ModImportInspection, InspectionSource>();
function fail(code: string): never { throw new ModDataError(code, 'Local MOD operation rejected; source content and paths are omitted'); }
function identity(a: Stats, b: Stats): boolean { return a.dev === b.dev && a.ino === b.ino && a.mode === b.mode; }
function stableFile(a: Stats, b: Stats): boolean {
    return identity(a, b) && b.isFile() && b.nlink === 1 && a.size === b.size && a.mtimeMs === b.mtimeMs && a.ctimeMs === b.ctimeMs;
}
function samePath(a: string, b: string): boolean { return path.relative(a, b) === ''; }
function absolute(filename: string): string {
    if (!path.isAbsolute(filename) || (process.platform === 'win32' && !/^[a-z]:[\\/]/i.test(filename))) return fail('MOD_INSTALL_ROOT_INVALID');
    return path.resolve(filename);
}
async function directory(filename: string): Promise<Pin> {
    const stats = await fs.lstat(filename);
    if (!stats.isDirectory() || stats.isSymbolicLink() || !samePath(await fs.realpath(filename), filename)) return fail('MOD_INSTALL_UNSAFE_DIRECTORY');
    return { filename, stats };
}
async function check(pins: readonly Pin[]): Promise<void> {
    for (const pin of pins) {
        const current = await directory(pin.filename);
        if (!identity(pin.stats, current.stats)) return fail('MOD_INSTALL_DIRECTORY_CHANGED');
    }
}
async function ancestors(filename: string): Promise<Pin[]> {
    const resolved = absolute(filename), root = path.parse(resolved).root, pins = [await directory(root)];
    let current = root;
    for (const segment of path.relative(root, resolved).split(path.sep).filter(Boolean)) {
        current = path.join(current, segment); pins.push(await directory(current));
    }
    return pins;
}
async function ensure(parent: readonly Pin[], segments: readonly string[]): Promise<Pin[]> {
    const pins = [...parent];
    for (const segment of segments) {
        await check(pins);
        const filename = path.join(pins[pins.length - 1].filename, segment);
        try { await fs.mkdir(filename, { mode: 0o700 }); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error; }
        pins.push(await directory(filename));
    }
    return pins;
}
async function withReader<T>(filename: string, maximum: number, action: (reader: ModZipReader) => Promise<T>): Promise<T> {
    const pins = await ancestors(path.dirname(filename)), before = await fs.lstat(filename);
    if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1 || before.size > maximum) return fail('MOD_IMPORT_SOURCE_INVALID');
    const handle = await fs.open(filename, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    const verify = async (): Promise<void> => {
        await check(pins);
        if (!stableFile(before, await handle.stat()) || !stableFile(before, await fs.lstat(filename))
            || !samePath(filename, await fs.realpath(filename))) return fail('MOD_IMPORT_SOURCE_CHANGED');
    };
    try {
        await verify();
        const reader: ModZipReader = { size: before.size, read: async (offset, length) => {
            if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(length) || offset < 0 || length < 0 || offset + length > before.size) return fail('MOD_IMPORT_READ_LIMIT');
            await verify();
            const bytes = Buffer.alloc(length);
            let cursor = 0;
            while (cursor < length) {
                const part = await handle.read(bytes, cursor, length - cursor, offset + cursor);
                if (!part.bytesRead) return fail('MOD_IMPORT_SOURCE_CHANGED');
                cursor += part.bytesRead;
            }
            await verify(); return bytes;
        } };
        const result = await action(reader); await verify(); return result;
    } finally { await handle.close(); }
}
function manifest(bytes: Uint8Array): ModManifest {
    const parsed = parseModManifestBytes(bytes);
    if (!parsed.ok) return fail('MOD_IMPORT_MANIFEST_INVALID');
    return parsed.value;
}

/** Only metadata and the root manifest are read. Returned capability is bound to this exact source inspection. */
export async function inspectLocalModImport(input: { filename: string; kind: 'folder' | 'zip' }): Promise<ModImportInspection> {
    if (!['folder', 'zip'].includes(input.kind)) return fail('MOD_IMPORT_KIND_INVALID');
    const filename = absolute(input.filename);
    await ancestors(input.kind === 'folder' ? filename : path.dirname(filename));
    const stats = await fs.lstat(filename);
    const value = input.kind === 'folder'
        ? await withReader(path.join(filename, 'lorerelay.mod.json'), MAX_MOD_MANIFEST_BYTES, async reader => manifest(await reader.read(0, reader.size)))
        : await withReader(filename, 128 * 1024 * 1024, async reader => {
            const entries = await parseModZipArchive(reader);
            return manifest(await readModZipEntry(reader, entries.find(entry => entry.path === 'lorerelay.mod.json')!));
        });
    const manifestHash = hashCanonicalModJson(value);
    const token = Object.freeze({ id: value.id, version: value.version, manifestHash, contentRating: value.contentRating });
    inspections.set(token, { filename, kind: input.kind, manifest: value, manifestHash, stats });
    return token;
}

/** Remove only files/directories created by this transaction, never recursive traversal or an unowned path. */
async function cleanupOwned(root: Pin, owned: readonly Pin[], anchor: readonly Pin[]): Promise<boolean> {
    try {
        await check([...anchor, root]);
        for (const pin of [...owned].reverse()) {
            const relative = path.relative(root.filename, pin.filename);
            if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) return false;
            let current: Stats;
            try { current = await fs.lstat(pin.filename); } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue; throw error; }
            if (!identity(pin.stats, current) || current.isSymbolicLink()) return false;
            await ancestors(path.dirname(pin.filename));
            if (current.isDirectory()) await fs.rmdir(pin.filename);
            else if (current.isFile() && current.nlink === 1) await fs.unlink(pin.filename);
            else return false;
        }
        await check([...anchor, root]); await fs.rmdir(root.filename); return true;
    } catch { return false; }
}

/** No UI, activation, campaign writes, update, uninstall, overwrite, or copy/delete rename fallback. */
export async function installLocalModPackage(input: ModInstallRequest): Promise<ModInstallResult> {
    input = { ...input };
    const request = inspections.get(input.inspection);
    if (!request || !['global', 'workspace'].includes(input.destination)) return { status: 'rejected', code: 'MOD_IMPORT_INSPECTION_REQUIRED', cleanup: 'not-needed' };
    if (request.manifest.contentRating === 'adult' && input.allowAdultContentRead !== true) return { status: 'rejected', code: 'ADULT_CONTENT_READ_NOT_AUTHORIZED', cleanup: 'not-needed' };
    const transactionId = randomUUID(), owned: Pin[] = [];
    let stage: Pin | undefined, stagingPins: Pin[] = [], reportPins: Pin[] = [], scopeLock: Pin | undefined;
    let committed: ModPackageCandidate | undefined, cleanup: 'not-needed' | 'complete' | 'retained' = 'not-needed', errorCode: string | undefined;
    try {
        const base = input.destination === 'global' ? input.globalStorageRoot : input.workspaceRoot;
        if (!base) return fail('MOD_INSTALL_ROOT_INVALID');
        const basePins = await ancestors(base);
        const scope = await ensure(basePins, [input.destination === 'global' ? 'mods' : '.text-adventure']);
        const packages = await ensure(scope, [input.destination === 'global' ? 'packages' : 'mods']);
        stagingPins = await ensure(scope, [input.destination === 'global' ? 'staging' : 'mod-staging']);
        reportPins = await ensure(scope, [input.destination === 'global' ? 'validation-reports' : 'mod-validation-reports']);
        const lockPath = path.join(stagingPins[stagingPins.length - 1].filename, '.install-lock');
        await check(stagingPins);
        try { await fs.mkdir(lockPath, { mode: 0o700 }); } catch { return fail('MOD_INSTALL_BUSY'); }
        scopeLock = await directory(lockPath);
        const stageName = path.join(stagingPins[stagingPins.length - 1].filename, transactionId);
        await fs.mkdir(stageName, { mode: 0o700 }); stage = await directory(stageName);
        // This private layout lets the exact existing discovery/hash/closure path validate staging.
        const stagedPins = [...stagingPins, stage];
        for (const segment of ['mods', 'packages', request.manifest.id, request.manifest.version]) {
            await check(stagedPins);
            const filename = path.join(stagedPins[stagedPins.length - 1].filename, segment);
            await fs.mkdir(filename, { mode: 0o700 }); const pin = await directory(filename); owned.push(pin); stagedPins.push(pin);
        }
        const stagedPackage = stagedPins[stagedPins.length - 1].filename;
        const sourcePins = await ancestors(request.kind === 'folder' ? request.filename : path.dirname(request.filename));
        const sourceStats = await fs.lstat(request.filename);
        if (!(request.kind === 'zip' ? stableFile(request.stats, sourceStats) : identity(request.stats, sourceStats))) return fail('MOD_IMPORT_SOURCE_CHANGED');
        const write = async (relative: string, bytes: Uint8Array): Promise<void> => {
            if (!validateModRelativePath(relative).ok) return fail('MOD_INSTALL_PATH_INVALID');
            const segments = relative.split('/'), leaf = segments.pop()!;
            let parents = [...stagedPins];
            for (const segment of segments) {
                const filename = path.join(parents[parents.length - 1].filename, segment);
                await check(parents);
                try { await fs.mkdir(filename, { mode: 0o700 }); owned.push(await directory(filename)); }
                catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error; }
                parents.push(await directory(filename));
            }
            await check(parents);
            const filename = path.join(parents[parents.length - 1].filename, leaf);
            const handle = await fs.open(filename, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | (constants.O_NOFOLLOW ?? 0), 0o600);
            try { owned.push({ filename, stats: await handle.stat() }); await handle.writeFile(bytes); await handle.sync(); }
            finally { await handle.close(); }
            await check(parents);
        };
        let expectedContentHash: string;
        if (request.kind === 'folder') {
            const files = await readModImportFolder({ packageRoot: request.filename, expectedManifestHash: request.manifestHash, allowAdultContentRead: input.allowAdultContentRead === true });
            await check(sourcePins);
            expectedContentHash = hashNormalizedModPackage(files).contentHash;
            for (const file of files) await write(file.path, file.bytes);
        } else {
            expectedContentHash = await withReader(request.filename, 128 * 1024 * 1024, async reader => {
                const entries = await parseModZipArchive(reader), root = entries.find(entry => entry.path === 'lorerelay.mod.json')!;
                if (hashCanonicalModJson(manifest(await readModZipEntry(reader, root))) !== request.manifestHash) return fail('MOD_IMPORT_MANIFEST_CHANGED');
                const files: ModPackageHashFile[] = [];
                for (const entry of entries.filter(entry => !entry.directory)) {
                    const bytes = await readModZipEntry(reader, entry);
                    const kind = /\.json$/i.test(entry.path) ? 'json' : /\.(md|txt)$/i.test(entry.path) || entry.path.split('/').pop() === 'LICENSE' ? 'text' : 'binary';
                    files.push({ path: entry.path, kind, bytes }); await write(entry.path, bytes);
                }
                return hashNormalizedModPackage(files).contentHash;
            });
        }
        await check([...stagedPins, ...packages]);
        const hashed = await hashDiscoveredModPackage({ globalStorageRoot: stageName, source: 'global', id: request.manifest.id, version: request.manifest.version, expectedManifestHash: request.manifestHash, allowAdultContentRead: input.allowAdultContentRead === true, includeContentFiles: true });
        if (!hashed.candidate || !hashed.contentFiles) return fail(hashed.diagnostics[0]?.code ?? 'MOD_INSTALL_VALIDATION_FAILED');
        if (hashed.candidate.contentHash !== expectedContentHash) return fail('MOD_INSTALL_STAGING_CHANGED');
        validateModContentPackage({ ...hashed.candidate, files: hashed.contentFiles });
        const targetPins = await ensure(packages, [request.manifest.id]);
        const targetParent = targetPins[targetPins.length - 1], target = path.join(targetParent.filename, request.manifest.version);
        await check([...stagedPins, ...targetPins, scopeLock]);
        const sourceVolume = (await fs.lstat(stagedPackage)).dev;
        if (!Number.isSafeInteger(sourceVolume) || sourceVolume <= 0 || sourceVolume !== targetParent.stats.dev
            || (process.platform === 'win32' && path.parse(await fs.realpath(stagedPackage)).root.toLowerCase() !== path.parse(await fs.realpath(targetParent.filename)).root.toLowerCase())) return fail('CROSS_DEVICE_STAGING');
        let existing = false;
        try { await fs.lstat(target); existing = true; }
        catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
        if (existing) {
            let priorManifest: ModManifest;
            try { priorManifest = await withReader(path.join(target, 'lorerelay.mod.json'), MAX_MOD_MANIFEST_BYTES, async reader => manifest(await reader.read(0, reader.size))); }
            catch { return fail('MOD_INSTALL_VERSION_EXISTS'); }
            if (hashCanonicalModJson(priorManifest) !== request.manifestHash) return fail('MOD_INSTALL_VARIANT_CONFLICT');
            const prior = await hashDiscoveredModPackage({ ...input, source: input.destination, id: request.manifest.id, version: request.manifest.version, expectedManifestHash: request.manifestHash, allowAdultContentRead: input.allowAdultContentRead === true });
            if (!prior.candidate) return fail('MOD_INSTALL_VERSION_EXISTS');
            return fail(prior.candidate.contentHash === expectedContentHash ? 'MOD_ALREADY_INSTALLED' : 'MOD_INSTALL_VARIANT_CONFLICT');
        }
        // Recheck the exact validated tree immediately before publication, not
        // merely the package directory or its previously enumerated file list.
        for (const entry of hashed.treeIdentity!.entries) {
            const filename = path.join(stagedPackage, entry.path), stats = await fs.lstat(filename);
            if (stats.isSymbolicLink() || stats.dev !== entry.dev || stats.ino !== entry.ino || stats.mode !== entry.mode
                || stats.size !== entry.size || stats.nlink !== entry.nlink || stats.mtimeMs !== entry.mtimeMs || stats.ctimeMs !== entry.ctimeMs
                || !samePath(filename, await fs.realpath(filename))) return fail('MOD_INSTALL_STAGING_CHANGED');
            if (entry.type === 'directory') {
                const expected = new Set(hashed.treeIdentity!.entries.filter(item => item.path && path.posix.dirname(item.path) === (entry.path || '.')).map(item => path.posix.basename(item.path)));
                const directoryHandle = await fs.opendir(filename);
                for await (const child of directoryHandle) if (!expected.delete(child.name)) return fail('MOD_INSTALL_STAGING_CHANGED');
                if (expected.size) return fail('MOD_INSTALL_STAGING_CHANGED');
            }
        }
        await check([...stagedPins, ...targetPins, scopeLock]);
        // Valid existing packages are nonempty directories and cannot be replaced
        // by rename; the scope mutex also serializes cooperating installer processes.
        try { await fs.rename(stagedPackage, target); }
        catch (error) { return fail((error as NodeJS.ErrnoException).code === 'EXDEV' ? 'CROSS_DEVICE_STAGING' : 'MOD_INSTALL_ATOMIC_RENAME_FAILED'); }
        committed = { ...hashed.candidate, source: input.destination };
    } catch (error) {
        errorCode = error instanceof ModDataError && /^[A-Z0-9_]+$/.test(error.code) ? error.code : 'MOD_INSTALL_FAILED';
    } finally {
        if (stage) cleanup = await cleanupOwned(stage, owned, stagingPins) ? 'complete' : 'retained';
        if (scopeLock) {
            try { await check([...stagingPins, scopeLock]); await fs.rmdir(scopeLock.filename); } catch { cleanup = 'retained'; }
        }
    }
    if (committed) {
        let rescan: Awaited<ReturnType<typeof discoverModPackageManifests>>;
        try { rescan = await discoverModPackageManifests(input); }
        catch { rescan = { manifests: [], diagnostics: [{ source: input.destination, code: 'MOD_INSTALL_RESCAN_FAILED', message: 'Installation committed; rescan unavailable' }] }; }
        return { status: 'installed', candidate: committed, cleanup: cleanup === 'complete' ? 'complete' : 'retained', rescan };
    }
    let reportId: string | undefined;
    if (reportPins.length) {
        try {
            await check(reportPins);
            await fs.writeFile(path.join(reportPins[reportPins.length - 1].filename, `${transactionId}.json`), JSON.stringify({ format: 'lorerelay-mod-install-report/1', code: errorCode, cleanup }), { flag: 'wx', mode: 0o600 });
            reportId = transactionId;
        } catch { /* Unsafe/unavailable report destination must not redirect a write. */ }
    }
    return { status: 'rejected', code: errorCode ?? 'MOD_INSTALL_FAILED', cleanup, ...(reportId ? { reportId } : {}) };
}

/** Read-only resolve preview. Never persists a profile/lock or changes campaign/runtime authorization. */
export async function resolveInstalledModProfile(input: ModDiscoveryRoots & { profile: ModProfile; loreRelayVersion: string; adultReadRequests?: readonly ModImportInspection[] }) {
    const parsed = validateModProfile(input.profile);
    if (!parsed.ok) return { ok: false as const, diagnostics: parsed.issues.map(issue => ({ code: issue.code })) };
    input = { ...input, profile: JSON.parse(serializeModProfile(parsed.value)), adultReadRequests: [...(input.adultReadRequests ?? [])] };
    const discovery = await discoverModPackageManifests(input);
    if (discovery.diagnostics.length) return { ok: false as const, diagnostics: discovery.diagnostics.map(item => ({ code: item.code })) };
    const needed = new Set(input.profile.enabled.map(entry => entry.id));
    for (let size = -1; size !== needed.size;) {
        size = needed.size;
        for (const entry of discovery.manifests) if (needed.has(entry.manifest.id)) for (const dependency of entry.manifest.dependencies) needed.add(dependency.id);
    }
    const candidates: ModPackageCandidate[] = [];
    let totalBytes = 0;
    for (const entry of discovery.manifests.filter(entry => needed.has(entry.manifest.id))) {
        const allowAdultContentRead = input.adultReadRequests?.some(request => inspections.has(request) && request.id === entry.manifest.id && request.version === entry.manifest.version && request.manifestHash === entry.manifestHash) ?? false;
        const hashed = await hashDiscoveredModPackage({ ...input, source: entry.source, id: entry.directoryId, version: entry.directoryVersion, expectedManifestHash: entry.manifestHash, allowAdultContentRead, includeContentFiles: true });
        if (!hashed.candidate || !hashed.contentFiles) return { ok: false as const, diagnostics: hashed.diagnostics.map(item => ({ code: item.code })) };
        totalBytes += hashed.treeIdentity!.entries.filter(item => item.type === 'file').reduce((sum, item) => sum + item.size, 0);
        if (totalBytes > 256 * 1024 * 1024) return { ok: false as const, diagnostics: [{ code: 'MOD_RESOLVE_BYTE_LIMIT' }] };
        try { validateModContentPackage({ ...hashed.candidate, files: hashed.contentFiles }); }
        catch (error) { return { ok: false as const, diagnostics: [{ code: error instanceof ModDataError ? error.code : 'MOD_CONTENT_SCHEMA_INVALID' }] }; }
        candidates.push(hashed.candidate);
    }
    const resolution = resolveModProfile(input.profile, candidates, input.loreRelayVersion);
    return resolution.ok ? { ...resolution, profileJson: serializeModProfile(input.profile), lockJson: serializeModLock(resolution.lock) } : resolution;
}
