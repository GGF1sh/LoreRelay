import * as path from 'path';
import { constants, Dirent, Stats } from 'fs';
import { lstat, open, opendir, realpath } from 'fs/promises';
import {
    MAX_MOD_MANIFEST_BYTES,
    ModManifest,
    compareSemVer,
    parseModManifestBytes,
    parseSemVer,
} from './modManifestCore';
import {
    ModDataError,
    ModPackageFileKind,
    hashCanonicalModJson,
    hashNormalizedModPackage,
    isModSha256,
    type ModPackageHashFile,
} from './modHashCore';
import { MAX_MOD_RESOLVER_CANDIDATES, ModPackageCandidate } from './modResolverCore';
import {
    compareUnicodeCodePointOrder,
    isValidModId,
    modPathCollisionKey,
    unicodeInvariantCaseFold,
    validateModRelativePath,
} from './modPathCore';
import { ModResolvedSource } from './modProfileCore';
import { parseModAssetCatalogs } from './contributions/modAssetCore';

export const MAX_MOD_DISCOVERY_FILES_PER_PACKAGE = 2_048;
export const MAX_MOD_DISCOVERY_DIRECTORIES_PER_PACKAGE = 256;
export const MAX_MOD_DISCOVERY_BYTES_PER_PACKAGE = 256 * 1024 * 1024;
export const MAX_MOD_DISCOVERY_JSON_BYTES = 4 * 1024 * 1024;
export const MAX_MOD_DISCOVERY_TEXT_BYTES = 4 * 1024 * 1024;
export const MAX_MOD_DISCOVERY_BINARY_BYTES = 25 * 1024 * 1024;

export interface ModDiscoveryRoots {
    /** Exact VS Code context.globalStorageUri.fsPath value. */
    globalStorageRoot?: string;
    /** Exact workspace folder root for this campaign. */
    workspaceRoot?: string;
}

export interface DiscoveredModManifest {
    source: ModResolvedSource;
    directoryId: string;
    directoryVersion: string;
    manifest: ModManifest;
    manifestHash: string;
}

export interface ModDiscoveryDiagnostic {
    code: string;
    source: ModResolvedSource;
    packageId?: string;
    packageVersion?: string;
    relativePath?: string;
    message: string;
}

export interface ModManifestDiscoveryResult {
    manifests: DiscoveredModManifest[];
    diagnostics: ModDiscoveryDiagnostic[];
}

export interface ModPackageHashResult {
    candidate?: ModPackageCandidate;
    treeIdentity?: ModPackageTreeIdentity;
    /** Exact buffers covered by contentHash; never reopen payloads for activation. */
    contentFiles?: readonly ModPackageHashFile[];
    diagnostics: ModDiscoveryDiagnostic[];
}

export interface ModPackageTreeIdentity {
    source: ModResolvedSource;
    directoryId: string;
    directoryVersion: string;
    entries: readonly PackageTreeSnapshotEntry[];
}

interface RootDiscoveryResult extends ModManifestDiscoveryResult {
    visitedCandidateDirectories: number;
}

interface WalkedFile {
    path: string;
    kind: ModPackageFileKind;
    bytes: Uint8Array;
}

export interface PackageTreeSnapshotEntry {
    path: string;
    type: 'directory' | 'file';
    size: number;
    mode: number;
    nlink: number;
    dev: number;
    ino: number;
    mtimeMs: number;
    ctimeMs: number;
}

interface ReadResult {
    ok: boolean;
    code?: string;
    bytes?: Uint8Array;
    stats?: Stats;
}

function diagnostic(
    code: string,
    source: ModResolvedSource,
    message: string,
    packageId?: string,
    packageVersion?: string,
    relativePath?: string,
): ModDiscoveryDiagnostic {
    return { code, source, ...(packageId ? { packageId } : {}), ...(packageVersion ? { packageVersion } : {}), ...(relativePath ? { relativePath } : {}), message };
}

function sortDiagnostics(diagnostics: readonly ModDiscoveryDiagnostic[]): ModDiscoveryDiagnostic[] {
    return [...diagnostics].sort((left, right) => compareUnicodeCodePointOrder(left.source, right.source)
        || compareUnicodeCodePointOrder(left.packageId ?? '', right.packageId ?? '')
        || compareUnicodeCodePointOrder(left.packageVersion ?? '', right.packageVersion ?? '')
        || compareUnicodeCodePointOrder(left.relativePath ?? '', right.relativePath ?? '')
        || compareUnicodeCodePointOrder(left.code, right.code));
}

function configuredPackagesRoot(roots: ModDiscoveryRoots, source: ModResolvedSource): string | undefined {
    const base = source === 'global' ? roots.globalStorageRoot : roots.workspaceRoot;
    if (!base || !path.isAbsolute(base)) return undefined;
    return source === 'global'
        ? path.join(path.resolve(base), 'mods', 'packages')
        : path.join(path.resolve(base), '.text-adventure', 'mods');
}

function isContained(root: string, target: string): boolean {
    const relative = path.relative(root, target);
    return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}

function packageTreeSnapshotEntry(relativePath: string, type: 'directory' | 'file', stats: Stats): PackageTreeSnapshotEntry {
    return {
        path: relativePath,
        type,
        size: stats.size,
        mode: stats.mode,
        nlink: stats.nlink,
        dev: stats.dev,
        ino: stats.ino,
        mtimeMs: stats.mtimeMs,
        ctimeMs: stats.ctimeMs,
    };
}

function samePackageTreeSnapshotEntry(left: PackageTreeSnapshotEntry, right: PackageTreeSnapshotEntry): boolean {
    return left.path === right.path
        && left.type === right.type
        && left.size === right.size
        && left.mode === right.mode
        && left.nlink === right.nlink
        && left.dev === right.dev
        && left.ino === right.ino
        && left.mtimeMs === right.mtimeMs
        && left.ctimeMs === right.ctimeMs;
}

function sortPackageTreeSnapshot(entries: PackageTreeSnapshotEntry[]): PackageTreeSnapshotEntry[] {
    return entries.sort((left, right) => compareUnicodeCodePointOrder(left.path, right.path)
        || compareUnicodeCodePointOrder(left.type, right.type));
}

function samePackageTreeSnapshot(left: readonly PackageTreeSnapshotEntry[], right: readonly PackageTreeSnapshotEntry[]): boolean {
    return left.length === right.length && left.every((entry, index) => samePackageTreeSnapshotEntry(entry, right[index]));
}

async function readDirectoryBounded(absolutePath: string, maximumEntries: number): Promise<{ entries: Dirent[]; exceeded: boolean }> {
    const directory = await opendir(absolutePath);
    const entries: Dirent[] = [];
    try {
        while (true) {
            const entry = await directory.read();
            if (!entry) break;
            entries.push(entry);
            if (entries.length > maximumEntries) return { entries: [], exceeded: true };
        }
    } finally {
        await directory.close().catch(() => undefined);
    }
    entries.sort((left, right) => compareUnicodeCodePointOrder(left.name, right.name));
    return { entries, exceeded: false };
}

async function checkOrdinaryDirectory(absolutePath: string, containmentRootReal: string): Promise<{ ok: true; real: string } | { ok: false; code: string }> {
    try {
        const stats = await lstat(absolutePath);
        if (stats.isSymbolicLink()) return { ok: false, code: 'PACKAGE_LINK_FORBIDDEN' };
        if (!stats.isDirectory()) return { ok: false, code: 'PACKAGE_DIRECTORY_REQUIRED' };
        const resolved = await realpath(absolutePath);
        if (!isContained(containmentRootReal, resolved)) return { ok: false, code: 'PACKAGE_REALPATH_ESCAPE' };
        return { ok: true, real: resolved };
    } catch {
        return { ok: false, code: 'PACKAGE_DIRECTORY_CHECK_FAILED' };
    }
}

async function readOrdinaryFileBounded(input: {
    absolutePath: string;
    containmentRootReal: string;
    maximumBytes: number;
    afterHandleStat?: () => Promise<void>;
}): Promise<ReadResult> {
    let handle: Awaited<ReturnType<typeof open>> | undefined;
    try {
        const pathStats = await lstat(input.absolutePath);
        if (pathStats.isSymbolicLink()) return { ok: false, code: 'PACKAGE_LINK_FORBIDDEN' };
        if (!pathStats.isFile()) return { ok: false, code: 'PACKAGE_SPECIAL_FILE_FORBIDDEN' };
        if (pathStats.nlink !== 1) return { ok: false, code: 'PACKAGE_HARD_LINK_FORBIDDEN' };
        if (pathStats.size > input.maximumBytes) return { ok: false, code: 'PACKAGE_FILE_SIZE_LIMIT' };
        const beforeReal = await realpath(input.absolutePath);
        if (!isContained(input.containmentRootReal, beforeReal)) return { ok: false, code: 'PACKAGE_REALPATH_ESCAPE' };
        handle = await open(input.absolutePath, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
        const before = await handle.stat();
        if (!before.isFile() || before.nlink !== 1 || before.size !== pathStats.size
            || before.dev !== pathStats.dev || before.ino !== pathStats.ino
            || before.mtimeMs !== pathStats.mtimeMs || before.ctimeMs !== pathStats.ctimeMs) {
            return { ok: false, code: 'PACKAGE_CHANGED_DURING_READ' };
        }
        await input.afterHandleStat?.();
        const bytes = Buffer.alloc(before.size);
        let offset = 0;
        while (offset < bytes.length) {
            const read = await handle.read(bytes, offset, bytes.length - offset, offset);
            if (read.bytesRead === 0) return { ok: false, code: 'PACKAGE_CHANGED_DURING_READ' };
            offset += read.bytesRead;
        }
        const probe = Buffer.alloc(1);
        const extra = await handle.read(probe, 0, 1, before.size);
        if (extra.bytesRead !== 0) return { ok: false, code: 'PACKAGE_CHANGED_DURING_READ' };
        const after = await handle.stat();
        const pathAfter = await lstat(input.absolutePath);
        const afterReal = await realpath(input.absolutePath);
        if (!after.isFile() || after.nlink !== 1 || after.size !== before.size
            || after.dev !== before.dev || after.ino !== before.ino
            || after.mtimeMs !== before.mtimeMs || after.ctimeMs !== before.ctimeMs
            || pathAfter.isSymbolicLink() || !pathAfter.isFile() || pathAfter.nlink !== 1
            || pathAfter.size !== before.size || pathAfter.dev !== before.dev || pathAfter.ino !== before.ino
            || pathAfter.mtimeMs !== before.mtimeMs || pathAfter.ctimeMs !== before.ctimeMs
            || !isContained(input.containmentRootReal, afterReal)) {
            return { ok: false, code: 'PACKAGE_CHANGED_DURING_READ' };
        }
        return { ok: true, bytes, stats: pathAfter };
    } catch {
        return { ok: false, code: 'PACKAGE_FILE_READ_FAILED' };
    } finally {
        await handle?.close().catch(() => undefined);
    }
}

function classifyFile(relativePath: string): ModPackageFileKind | undefined {
    const basename = path.posix.basename(relativePath);
    const extension = path.posix.extname(relativePath).toLowerCase();
    if (extension === '.json') return 'json';
    if (extension === '.md' || extension === '.txt' || basename === 'LICENSE') return 'text';
    if (['.png', '.jpg', '.jpeg', '.webp', '.mp3', '.ogg', '.wav'].includes(extension)) return 'binary';
    return undefined;
}

function fileSizeLimit(kind: ModPackageFileKind): number {
    if (kind === 'json') return MAX_MOD_DISCOVERY_JSON_BYTES;
    if (kind === 'text') return MAX_MOD_DISCOVERY_TEXT_BYTES;
    return MAX_MOD_DISCOVERY_BINARY_BYTES;
}

function hasBinaryMagic(relativePath: string, bytes: Uint8Array): boolean {
    const extension = path.posix.extname(relativePath).toLowerCase();
    const starts = (...expected: number[]): boolean => expected.every((byte, index) => bytes[index] === byte);
    if (extension === '.png') return starts(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);
    if (extension === '.jpg' || extension === '.jpeg') return starts(0xff, 0xd8, 0xff);
    if (extension === '.webp') return starts(0x52, 0x49, 0x46, 0x46) && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50;
    if (extension === '.ogg') return starts(0x4f, 0x67, 0x67, 0x53);
    if (extension === '.wav') return starts(0x52, 0x49, 0x46, 0x46) && bytes[8] === 0x57 && bytes[9] === 0x41 && bytes[10] === 0x56 && bytes[11] === 0x45;
    if (extension === '.mp3') return starts(0x49, 0x44, 0x33)
        || (bytes.length >= 2 && bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0);
    return true;
}

async function readRootManifest(input: {
    packageRoot: string;
    packageRootReal: string;
    source: ModResolvedSource;
    directoryId: string;
    directoryVersion: string;
    afterHandleStat?: (relativePath: string) => Promise<void>;
}): Promise<{ discovered?: DiscoveredModManifest; diagnostics: ModDiscoveryDiagnostic[] }> {
    const relativePath = 'lorerelay.mod.json';
    const read = await readOrdinaryFileBounded({
        absolutePath: path.join(input.packageRoot, relativePath),
        containmentRootReal: input.packageRootReal,
        maximumBytes: MAX_MOD_MANIFEST_BYTES,
        afterHandleStat: input.afterHandleStat ? () => input.afterHandleStat!(relativePath) : undefined,
    });
    if (!read.ok || !read.bytes) {
        return { diagnostics: [diagnostic(read.code ?? 'MANIFEST_READ_FAILED', input.source, 'Root manifest is missing or not one bounded ordinary file', input.directoryId, input.directoryVersion, relativePath)] };
    }
    const parsed = parseModManifestBytes(read.bytes);
    if (!parsed.ok) {
        return {
            diagnostics: parsed.issues.map(issue => diagnostic(issue.code, input.source, `${issue.path}: ${issue.message}`, input.directoryId, input.directoryVersion, relativePath)),
        };
    }
    if (parsed.value.id !== input.directoryId) {
        return { diagnostics: [diagnostic('DIRECTORY_ID_MISMATCH', input.source, 'Directory ID does not exactly equal manifest ID', input.directoryId, input.directoryVersion, relativePath)] };
    }
    if (parsed.value.version !== input.directoryVersion) {
        return { diagnostics: [diagnostic('DIRECTORY_VERSION_MISMATCH', input.source, 'Directory version does not exactly equal manifest version', input.directoryId, input.directoryVersion, relativePath)] };
    }
    return {
        discovered: {
            source: input.source,
            directoryId: input.directoryId,
            directoryVersion: input.directoryVersion,
            manifest: parsed.value,
            manifestHash: hashCanonicalModJson(parsed.value),
        },
        diagnostics: [],
    };
}

async function discoverRoot(root: string, source: ModResolvedSource, candidateBudget: number): Promise<RootDiscoveryResult> {
    const manifests: DiscoveredModManifest[] = [];
    const diagnostics: ModDiscoveryDiagnostic[] = [];
    let visitedCandidateDirectories = 0;
    let rootReal: string;
    let idEntries: Dirent[];
    try {
        const rootStats = await lstat(root);
        if (rootStats.isSymbolicLink() || !rootStats.isDirectory()) {
            return { manifests, diagnostics: [diagnostic('DISCOVERY_ROOT_INVALID', source, 'Configured package root is not an ordinary directory')], visitedCandidateDirectories };
        }
        rootReal = await realpath(root);
        const bounded = await readDirectoryBounded(root, MAX_MOD_RESOLVER_CANDIDATES);
        if (bounded.exceeded) {
            return { manifests, diagnostics: [diagnostic('RESOLUTION_COMPLEXITY_LIMIT', source, `Package root contains more than ${MAX_MOD_RESOLVER_CANDIDATES} first-level entries`)], visitedCandidateDirectories };
        }
        idEntries = bounded.entries;
    } catch (error) {
        const nodeError = error as NodeJS.ErrnoException;
        if (nodeError?.code === 'ENOENT') return { manifests, diagnostics, visitedCandidateDirectories };
        return { manifests, diagnostics: [diagnostic('DISCOVERY_ROOT_READ_FAILED', source, `Package root read failed${nodeError?.code ? ` (${nodeError.code})` : ''}`)], visitedCandidateDirectories };
    }

    const idCollisionKeys = new Set<string>();
    for (const idEntry of idEntries) {
        if (!isValidModId(idEntry.name)) {
            diagnostics.push(diagnostic('DISCOVERY_ID_DIRECTORY_INVALID', source, 'First-level directory is not a canonical MOD ID', idEntry.name));
            continue;
        }
        const idCollision = unicodeInvariantCaseFold(idEntry.name);
        if (idCollisionKeys.has(idCollision)) {
            diagnostics.push(diagnostic('DISCOVERY_ID_COLLISION', source, 'MOD ID directories collide under invariant case folding', idEntry.name));
            continue;
        }
        idCollisionKeys.add(idCollision);
        const idPath = path.join(root, idEntry.name);
        const checkedId = await checkOrdinaryDirectory(idPath, rootReal);
        if (!checkedId.ok) {
            diagnostics.push(diagnostic(checkedId.code, source, 'MOD ID directory must be an ordinary contained directory', idEntry.name));
            continue;
        }
        let versionEntries: Dirent[];
        try {
            const bounded = await readDirectoryBounded(idPath, candidateBudget - visitedCandidateDirectories);
            if (bounded.exceeded) {
                return { manifests: [], diagnostics: sortDiagnostics([...diagnostics, diagnostic('RESOLUTION_COMPLEXITY_LIMIT', source, `Second-level package entries exceed the remaining deterministic budget ${candidateBudget - visitedCandidateDirectories}`, idEntry.name)]), visitedCandidateDirectories };
            }
            versionEntries = bounded.entries;
        } catch {
            diagnostics.push(diagnostic('DISCOVERY_ID_READ_FAILED', source, 'MOD ID directory read failed', idEntry.name));
            continue;
        }
        const versionCollisionKeys = new Set<string>();
        for (const versionEntry of versionEntries) {
            visitedCandidateDirectories += 1;
            if (visitedCandidateDirectories > candidateBudget) {
                return { manifests: [], diagnostics: sortDiagnostics([...diagnostics, diagnostic('RESOLUTION_COMPLEXITY_LIMIT', source, `Candidate directory count exceeds deterministic budget ${candidateBudget}`, idEntry.name, versionEntry.name)]), visitedCandidateDirectories };
            }
            if (!parseSemVer(versionEntry.name)) {
                diagnostics.push(diagnostic('DISCOVERY_VERSION_DIRECTORY_INVALID', source, 'Second-level directory is not exact SemVer', idEntry.name, versionEntry.name));
                continue;
            }
            const versionCollision = unicodeInvariantCaseFold(versionEntry.name);
            if (versionCollisionKeys.has(versionCollision)) {
                diagnostics.push(diagnostic('DISCOVERY_VERSION_COLLISION', source, 'Version directories collide under invariant case folding', idEntry.name, versionEntry.name));
                continue;
            }
            versionCollisionKeys.add(versionCollision);
            const packageRoot = path.join(idPath, versionEntry.name);
            const checkedPackage = await checkOrdinaryDirectory(packageRoot, rootReal);
            if (!checkedPackage.ok) {
                diagnostics.push(diagnostic(checkedPackage.code, source, 'Package version must be an ordinary contained directory', idEntry.name, versionEntry.name));
                continue;
            }
            const manifest = await readRootManifest({
                packageRoot,
                packageRootReal: checkedPackage.real,
                source,
                directoryId: idEntry.name,
                directoryVersion: versionEntry.name,
            });
            diagnostics.push(...manifest.diagnostics);
            if (manifest.discovered) manifests.push(manifest.discovered);
        }
    }
    return { manifests, diagnostics: sortDiagnostics(diagnostics), visitedCandidateDirectories };
}

/** Metadata-only discovery. It never opens package payload files. */
export async function discoverModPackageManifests(roots: ModDiscoveryRoots): Promise<ModManifestDiscoveryResult> {
    const manifests: DiscoveredModManifest[] = [];
    const diagnostics: ModDiscoveryDiagnostic[] = [];
    let remaining = MAX_MOD_RESOLVER_CANDIDATES;
    for (const source of ['global', 'workspace'] as const) {
        const configuredRoot = configuredPackagesRoot(roots, source);
        const baseWasSupplied = source === 'global' ? roots.globalStorageRoot !== undefined : roots.workspaceRoot !== undefined;
        if (!baseWasSupplied) continue;
        if (!configuredRoot) {
            diagnostics.push(diagnostic('DISCOVERY_BASE_ROOT_NOT_ABSOLUTE', source, 'Configured base root must be absolute'));
            continue;
        }
        const result = await discoverRoot(configuredRoot, source, remaining);
        if (result.diagnostics.some(item => item.code === 'RESOLUTION_COMPLEXITY_LIMIT')) {
            return { manifests: [], diagnostics: sortDiagnostics([...diagnostics, ...result.diagnostics]) };
        }
        remaining -= result.visitedCandidateDirectories;
        manifests.push(...result.manifests);
        diagnostics.push(...result.diagnostics);
    }
    manifests.sort((left, right) => compareUnicodeCodePointOrder(left.manifest.id, right.manifest.id)
        || compareSemVer(right.manifest.version, left.manifest.version)
        || compareUnicodeCodePointOrder(left.source, right.source));
    return { manifests, diagnostics: sortDiagnostics(diagnostics) };
}

async function walkExactPackage(input: {
    packageRoot: string;
    packageRootReal: string;
    source: ModResolvedSource;
    packageId: string;
    packageVersion: string;
    afterHandleStat?: (relativePath: string) => Promise<void>;
}): Promise<{ files: WalkedFile[]; treeEntries: PackageTreeSnapshotEntry[]; diagnostics: ModDiscoveryDiagnostic[] }> {
    const diagnostics: ModDiscoveryDiagnostic[] = [];
    const files: WalkedFile[] = [];
    const treeEntries: PackageTreeSnapshotEntry[] = [];
    const collisionKeys = new Set<string>();
    let directoryCount = 1;
    let totalBytes = 0;
    try {
        const rootStats = await lstat(input.packageRoot);
        if (rootStats.isSymbolicLink() || !rootStats.isDirectory()) {
            diagnostics.push(diagnostic('PACKAGE_CHANGED_DURING_HASH', input.source, 'Package root changed before hashing', input.packageId, input.packageVersion));
        } else {
            treeEntries.push(packageTreeSnapshotEntry('', 'directory', rootStats));
        }
    } catch {
        diagnostics.push(diagnostic('PACKAGE_CHANGED_DURING_HASH', input.source, 'Package root became unavailable before hashing', input.packageId, input.packageVersion));
    }
    const queue: Array<{ absolute: string; relative: string }> = [{ absolute: input.packageRoot, relative: '' }];
    while (queue.length > 0 && diagnostics.length === 0) {
        const current = queue.shift()!;
        let entries: Dirent[];
        try {
            const bounded = await readDirectoryBounded(current.absolute, MAX_MOD_DISCOVERY_FILES_PER_PACKAGE + MAX_MOD_DISCOVERY_DIRECTORIES_PER_PACKAGE);
            if (bounded.exceeded) {
                diagnostics.push(diagnostic('PACKAGE_ENTRY_LIMIT', input.source, 'Directory entry count exceeds the bounded package budget', input.packageId, input.packageVersion, current.relative || undefined));
                break;
            }
            entries = bounded.entries;
        } catch {
            diagnostics.push(diagnostic('PACKAGE_READ_FAILED', input.source, 'Directory read failed', input.packageId, input.packageVersion, current.relative || undefined));
            break;
        }
        for (const entry of entries) {
            const relativePath = current.relative ? `${current.relative}/${entry.name}` : entry.name;
            const pathValidation = validateModRelativePath(relativePath);
            if (!pathValidation.ok || !pathValidation.normalized) {
                diagnostics.push(diagnostic('PACKAGE_PATH_INVALID', input.source, `Invalid path: ${pathValidation.code ?? 'UNKNOWN'}`, input.packageId, input.packageVersion, relativePath));
                break;
            }
            const collisionKey = modPathCollisionKey(pathValidation.normalized);
            if (collisionKeys.has(collisionKey)) {
                diagnostics.push(diagnostic('PACKAGE_PATH_COLLISION', input.source, 'Path collides after NFC and invariant case folding', input.packageId, input.packageVersion, relativePath));
                break;
            }
            collisionKeys.add(collisionKey);
            const absolutePath = path.join(current.absolute, entry.name);
            let stats: Stats;
            try {
                stats = await lstat(absolutePath);
            } catch {
                diagnostics.push(diagnostic('PACKAGE_LSTAT_FAILED', input.source, 'File status check failed', input.packageId, input.packageVersion, relativePath));
                break;
            }
            if (stats.isSymbolicLink()) {
                diagnostics.push(diagnostic('PACKAGE_LINK_FORBIDDEN', input.source, 'Symbolic links, junctions, and reparse links are forbidden', input.packageId, input.packageVersion, relativePath));
                break;
            }
            if (stats.isDirectory()) {
                directoryCount += 1;
                if (directoryCount > MAX_MOD_DISCOVERY_DIRECTORIES_PER_PACKAGE) {
                    diagnostics.push(diagnostic('PACKAGE_DIRECTORY_LIMIT', input.source, `Directory count exceeds ${MAX_MOD_DISCOVERY_DIRECTORIES_PER_PACKAGE}`, input.packageId, input.packageVersion, relativePath));
                    break;
                }
                const checked = await checkOrdinaryDirectory(absolutePath, input.packageRootReal);
                if (!checked.ok) {
                    diagnostics.push(diagnostic(checked.code, input.source, 'Directory is not one contained ordinary directory', input.packageId, input.packageVersion, relativePath));
                    break;
                }
                treeEntries.push(packageTreeSnapshotEntry(pathValidation.normalized, 'directory', stats));
                queue.push({ absolute: absolutePath, relative: pathValidation.normalized });
                continue;
            }
            if (!stats.isFile()) {
                diagnostics.push(diagnostic('PACKAGE_SPECIAL_FILE_FORBIDDEN', input.source, 'Only ordinary files and directories are allowed', input.packageId, input.packageVersion, relativePath));
                break;
            }
            if (files.length + 1 > MAX_MOD_DISCOVERY_FILES_PER_PACKAGE) {
                diagnostics.push(diagnostic('PACKAGE_FILE_LIMIT', input.source, `File count exceeds ${MAX_MOD_DISCOVERY_FILES_PER_PACKAGE}`, input.packageId, input.packageVersion, relativePath));
                break;
            }
            const kind = classifyFile(pathValidation.normalized);
            if (!kind) {
                diagnostics.push(diagnostic('PACKAGE_FILE_TYPE_FORBIDDEN', input.source, 'File extension is not permitted by the declarative V1 substrate', input.packageId, input.packageVersion, relativePath));
                break;
            }
            const maximumBytes = fileSizeLimit(kind);
            if (stats.size > maximumBytes) {
                diagnostics.push(diagnostic('PACKAGE_FILE_SIZE_LIMIT', input.source, `File exceeds the ${maximumBytes} byte limit`, input.packageId, input.packageVersion, relativePath));
                break;
            }
            totalBytes += stats.size;
            if (totalBytes > MAX_MOD_DISCOVERY_BYTES_PER_PACKAGE) {
                diagnostics.push(diagnostic('PACKAGE_EXPANDED_SIZE_LIMIT', input.source, `Package exceeds ${MAX_MOD_DISCOVERY_BYTES_PER_PACKAGE} bytes`, input.packageId, input.packageVersion, relativePath));
                break;
            }
            const read = await readOrdinaryFileBounded({
                absolutePath,
                containmentRootReal: input.packageRootReal,
                maximumBytes,
                afterHandleStat: input.afterHandleStat ? () => input.afterHandleStat!(pathValidation.normalized!) : undefined,
            });
            if (!read.ok || !read.bytes || !read.stats) {
                diagnostics.push(diagnostic(read.code ?? 'PACKAGE_FILE_READ_FAILED', input.source, 'Package file could not be read as one stable contained ordinary file', input.packageId, input.packageVersion, relativePath));
                break;
            }
            if (kind === 'binary' && !hasBinaryMagic(pathValidation.normalized, read.bytes)) {
                diagnostics.push(diagnostic('PACKAGE_BINARY_MAGIC_MISMATCH', input.source, 'Binary extension and magic bytes do not agree', input.packageId, input.packageVersion, relativePath));
                break;
            }
            files.push({ path: pathValidation.normalized, kind, bytes: read.bytes });
            treeEntries.push(packageTreeSnapshotEntry(pathValidation.normalized, 'file', read.stats));
        }
    }
    return { files, treeEntries: sortPackageTreeSnapshot(treeEntries), diagnostics };
}

/**
 * Re-enumerate package metadata after hashing. This deliberately reads no file
 * contents, but verifies that the bounded tree is ordinary, contained, and
 * stable throughout the final snapshot.
 */
async function snapshotExactPackageTree(input: {
    packageRoot: string;
    packageRootReal: string;
    source: ModResolvedSource;
    packageId: string;
    packageVersion: string;
}): Promise<{ treeEntries: PackageTreeSnapshotEntry[]; diagnostics: ModDiscoveryDiagnostic[] }> {
    const diagnostics: ModDiscoveryDiagnostic[] = [];
    const treeEntries: PackageTreeSnapshotEntry[] = [];
    const observedNodes: Array<{ absolutePath: string; snapshot: PackageTreeSnapshotEntry }> = [];
    const collisionKeys = new Set<string>();
    let directoryCount = 1;
    let fileCount = 0;
    let totalBytes = 0;
    try {
        const rootStats = await lstat(input.packageRoot);
        const rootReal = await realpath(input.packageRoot);
        if (rootStats.isSymbolicLink() || !rootStats.isDirectory() || rootReal !== input.packageRootReal) {
            throw new Error('package root changed');
        }
        const snapshot = packageTreeSnapshotEntry('', 'directory', rootStats);
        treeEntries.push(snapshot);
        observedNodes.push({ absolutePath: input.packageRoot, snapshot });
    } catch {
        return {
            treeEntries,
            diagnostics: [diagnostic('PACKAGE_TREE_REVALIDATION_FAILED', input.source, 'Package root changed during final tree revalidation', input.packageId, input.packageVersion)],
        };
    }

    const queue: Array<{ absolute: string; relative: string }> = [{ absolute: input.packageRoot, relative: '' }];
    while (queue.length > 0 && diagnostics.length === 0) {
        const current = queue.shift()!;
        let entries: Dirent[];
        try {
            const bounded = await readDirectoryBounded(current.absolute, MAX_MOD_DISCOVERY_FILES_PER_PACKAGE + MAX_MOD_DISCOVERY_DIRECTORIES_PER_PACKAGE);
            if (bounded.exceeded) throw new Error('entry limit');
            entries = bounded.entries;
        } catch {
            diagnostics.push(diagnostic('PACKAGE_TREE_REVALIDATION_FAILED', input.source, 'Package directory could not be enumerated within the bounded final tree revalidation', input.packageId, input.packageVersion, current.relative || undefined));
            break;
        }
        for (const entry of entries) {
            const relativePath = current.relative ? `${current.relative}/${entry.name}` : entry.name;
            const validation = validateModRelativePath(relativePath);
            if (!validation.ok || !validation.normalized) {
                diagnostics.push(diagnostic('PACKAGE_TREE_REVALIDATION_FAILED', input.source, 'Package path changed to an invalid path during final tree revalidation', input.packageId, input.packageVersion, relativePath));
                break;
            }
            const collisionKey = modPathCollisionKey(validation.normalized);
            if (collisionKeys.has(collisionKey)) {
                diagnostics.push(diagnostic('PACKAGE_TREE_REVALIDATION_FAILED', input.source, 'Package paths collide during final tree revalidation', input.packageId, input.packageVersion, relativePath));
                break;
            }
            collisionKeys.add(collisionKey);
            const absolutePath = path.join(current.absolute, entry.name);
            let stats: Stats;
            let resolved: string;
            try {
                stats = await lstat(absolutePath);
                resolved = await realpath(absolutePath);
            } catch {
                diagnostics.push(diagnostic('PACKAGE_TREE_REVALIDATION_FAILED', input.source, 'Package entry became unavailable during final tree revalidation', input.packageId, input.packageVersion, relativePath));
                break;
            }
            if (stats.isSymbolicLink() || !isContained(input.packageRootReal, resolved)) {
                diagnostics.push(diagnostic('PACKAGE_TREE_REVALIDATION_FAILED', input.source, 'Package entry became linked or escaped containment during final tree revalidation', input.packageId, input.packageVersion, relativePath));
                break;
            }
            if (stats.isDirectory()) {
                directoryCount += 1;
                if (directoryCount > MAX_MOD_DISCOVERY_DIRECTORIES_PER_PACKAGE) {
                    diagnostics.push(diagnostic('PACKAGE_TREE_REVALIDATION_FAILED', input.source, 'Package directory count changed beyond its bounded limit', input.packageId, input.packageVersion, relativePath));
                    break;
                }
                const snapshot = packageTreeSnapshotEntry(validation.normalized, 'directory', stats);
                treeEntries.push(snapshot);
                observedNodes.push({ absolutePath, snapshot });
                queue.push({ absolute: absolutePath, relative: validation.normalized });
                continue;
            }
            if (!stats.isFile() || stats.nlink !== 1) {
                diagnostics.push(diagnostic('PACKAGE_TREE_REVALIDATION_FAILED', input.source, 'Package entry is no longer one ordinary file', input.packageId, input.packageVersion, relativePath));
                break;
            }
            fileCount += 1;
            if (fileCount > MAX_MOD_DISCOVERY_FILES_PER_PACKAGE) {
                diagnostics.push(diagnostic('PACKAGE_TREE_REVALIDATION_FAILED', input.source, 'Package file count changed beyond its bounded limit', input.packageId, input.packageVersion, relativePath));
                break;
            }
            const kind = classifyFile(validation.normalized);
            if (!kind || stats.size > fileSizeLimit(kind)) {
                diagnostics.push(diagnostic('PACKAGE_TREE_REVALIDATION_FAILED', input.source, 'Package file type or size changed during final tree revalidation', input.packageId, input.packageVersion, relativePath));
                break;
            }
            totalBytes += stats.size;
            if (totalBytes > MAX_MOD_DISCOVERY_BYTES_PER_PACKAGE) {
                diagnostics.push(diagnostic('PACKAGE_TREE_REVALIDATION_FAILED', input.source, 'Package byte count changed beyond its bounded limit', input.packageId, input.packageVersion, relativePath));
                break;
            }
            const snapshot = packageTreeSnapshotEntry(validation.normalized, 'file', stats);
            treeEntries.push(snapshot);
            observedNodes.push({ absolutePath, snapshot });
        }
    }

    for (const node of diagnostics.length === 0 ? observedNodes : []) {
        try {
            const after = await lstat(node.absolutePath);
            const afterType = after.isDirectory() ? 'directory' : after.isFile() ? 'file' : undefined;
            if (!afterType || after.isSymbolicLink()
                || !samePackageTreeSnapshotEntry(node.snapshot, packageTreeSnapshotEntry(node.snapshot.path, afterType, after))) {
                throw new Error('node changed');
            }
        } catch {
            diagnostics.push(diagnostic('PACKAGE_TREE_REVALIDATION_FAILED', input.source, 'Package entry changed while the final tree snapshot was being verified', input.packageId, input.packageVersion, node.snapshot.path || undefined));
            break;
        }
    }
    return { treeEntries: sortPackageTreeSnapshot(treeEntries), diagnostics };
}

function declaredDirectPaths(manifest: ModManifest): string[] {
    return Object.values(manifest.entrypoints)
        .flatMap(entries => entries ?? [])
        .map(entry => entry.path);
}

/**
 * Hash one exact package only after an explicit resolve/approval request.
 * `validatedTransitivePaths` may be supplied only by future strict content
 * adapters; package data never controls that trusted closure directly.
 */
export async function hashDiscoveredModPackage(input: ModDiscoveryRoots & {
    source: ModResolvedSource;
    id: string;
    version: string;
    expectedManifestHash: string;
    allowAdultContentRead: boolean;
    includeContentFiles?: boolean;
    validatedTransitivePaths?: readonly string[];
    /** Deterministic fault-injection seam used only by focused host tests. */
    afterFileStatForTest?: (relativePath: string) => Promise<void>;
}): Promise<ModPackageHashResult> {
    if (!isValidModId(input.id) || !parseSemVer(input.version) || !isModSha256(input.expectedManifestHash)) {
        return { diagnostics: [diagnostic('HASH_REQUEST_IDENTITY_INVALID', input.source, 'Exact validated id, version, and manifest hash are required')] };
    }
    const packagesRoot = configuredPackagesRoot(input, input.source);
    if (!packagesRoot) return { diagnostics: [diagnostic('DISCOVERY_BASE_ROOT_NOT_ABSOLUTE', input.source, 'Configured base root must be absolute', input.id, input.version)] };
    let packagesRootReal: string;
    try {
        const rootStats = await lstat(packagesRoot);
        if (rootStats.isSymbolicLink() || !rootStats.isDirectory()) throw new Error('invalid root');
        packagesRootReal = await realpath(packagesRoot);
    } catch {
        return { diagnostics: [diagnostic('DISCOVERY_ROOT_INVALID', input.source, 'Configured package root is unavailable or not ordinary', input.id, input.version)] };
    }
    const packageRoot = path.join(packagesRoot, input.id, input.version);
    const checkedPackage = await checkOrdinaryDirectory(packageRoot, packagesRootReal);
    if (!checkedPackage.ok) return { diagnostics: [diagnostic(checkedPackage.code, input.source, 'Exact package directory is unavailable or unsafe', input.id, input.version)] };
    const rootManifest = await readRootManifest({
        packageRoot,
        packageRootReal: checkedPackage.real,
        source: input.source,
        directoryId: input.id,
        directoryVersion: input.version,
        afterHandleStat: input.afterFileStatForTest,
    });
    if (!rootManifest.discovered) return { diagnostics: sortDiagnostics(rootManifest.diagnostics) };
    if (rootManifest.discovered.manifestHash !== input.expectedManifestHash) {
        return { diagnostics: [diagnostic('MANIFEST_CHANGED_SINCE_DISCOVERY', input.source, 'Root manifest hash changed after metadata discovery', input.id, input.version, 'lorerelay.mod.json')] };
    }
    if (rootManifest.discovered.manifest.contentRating === 'adult' && !input.allowAdultContentRead) {
        return { diagnostics: [diagnostic('ADULT_CONTENT_READ_NOT_AUTHORIZED', input.source, 'Adult payload hashing requires an explicit package-read request', input.id, input.version)] };
    }
    const walked = await walkExactPackage({
        packageRoot,
        packageRootReal: checkedPackage.real,
        source: input.source,
        packageId: input.id,
        packageVersion: input.version,
        afterHandleStat: input.afterFileStatForTest,
    });
    if (walked.diagnostics.length > 0) return { diagnostics: sortDiagnostics(walked.diagnostics) };
    const walkedManifest = walked.files.find(file => file.path === 'lorerelay.mod.json');
    const walkedManifestParsed = walkedManifest ? parseModManifestBytes(walkedManifest.bytes) : undefined;
    if (!walkedManifestParsed?.ok || hashCanonicalModJson(walkedManifestParsed.value) !== rootManifest.discovered.manifestHash) {
        return { diagnostics: [diagnostic('PACKAGE_CHANGED_DURING_HASH', input.source, 'Root manifest changed between classification and package hashing', input.id, input.version, 'lorerelay.mod.json')] };
    }

    const requiredPaths = new Set(['lorerelay.mod.json', ...declaredDirectPaths(rootManifest.discovered.manifest)]);
    const allowedPaths = new Set([...requiredPaths, 'README.md', 'LICENSE', 'LICENSE.txt']);
    try {
        for (const asset of parseModAssetCatalogs(rootManifest.discovered.manifest, walked.files)) {
            requiredPaths.add(asset.path);
            allowedPaths.add(asset.path);
        }
    } catch (error) {
        return { diagnostics: [diagnostic(error instanceof ModDataError ? error.code : 'MOD_ASSET_INVALID', input.source, 'Strict asset closure validation failed', input.id, input.version)] };
    }
    for (const suppliedPath of input.validatedTransitivePaths ?? []) {
        const validation = validateModRelativePath(suppliedPath);
        if (!validation.ok || !validation.normalized) {
            return { diagnostics: [diagnostic('TRANSITIVE_PATH_INVALID', input.source, `Validated transitive path is invalid: ${validation.code ?? 'UNKNOWN'}`, input.id, input.version, suppliedPath)] };
        }
        requiredPaths.add(validation.normalized);
        allowedPaths.add(validation.normalized);
    }
    const walkedPaths = new Set(walked.files.map(file => file.path));
    for (const requiredPath of requiredPaths) {
        if (!walkedPaths.has(requiredPath)) {
            return { diagnostics: [diagnostic('DECLARED_PACKAGE_FILE_MISSING', input.source, 'A declared entrypoint, documentation file, or validated transitive file is missing', input.id, input.version, requiredPath)] };
        }
    }
    for (const file of walked.files) {
        if (!allowedPaths.has(file.path)) {
            return { diagnostics: [diagnostic('UNDECLARED_PACKAGE_FILE', input.source, 'Package file is not declared by the manifest/content closure', input.id, input.version, file.path)] };
        }
    }
    try {
        const packageHash = hashNormalizedModPackage(walked.files);
        const finalTree = await snapshotExactPackageTree({
            packageRoot,
            packageRootReal: checkedPackage.real,
            source: input.source,
            packageId: input.id,
            packageVersion: input.version,
        });
        if (finalTree.diagnostics.length > 0 || !samePackageTreeSnapshot(walked.treeEntries, finalTree.treeEntries)) {
            return {
                diagnostics: [diagnostic(
                    'PACKAGE_TREE_CHANGED_DURING_HASH',
                    input.source,
                    'Package tree was added to, removed from, renamed, or otherwise changed during hashing',
                    input.id,
                    input.version,
                )],
            };
        }
        return {
            ...(input.includeContentFiles ? {
                contentFiles: walked.files.filter(file => file.kind === 'binary' || ['scenarios', 'lorebooks', 'personas', 'localization', 'assets'].some(kind =>
                    rootManifest.discovered!.manifest.entrypoints[kind as 'scenarios' | 'lorebooks' | 'personas' | 'localization' | 'assets']?.some(entry => entry.path === file.path)))
                    .map(file => ({ ...file, bytes: Buffer.from(file.bytes) })),
            } : {}),
            candidate: {
                source: input.source,
                directoryId: input.id,
                directoryVersion: input.version,
                manifest: rootManifest.discovered.manifest,
                manifestHash: rootManifest.discovered.manifestHash,
                contentHash: packageHash.contentHash,
            },
            treeIdentity: {
                source: input.source,
                directoryId: input.id,
                directoryVersion: input.version,
                entries: finalTree.treeEntries.map(entry => ({ ...entry })),
            },
            diagnostics: [],
        };
    } catch (error) {
        return {
            diagnostics: [diagnostic(error instanceof ModDataError ? error.code : 'PACKAGE_HASH_FAILED', input.source, error instanceof Error ? error.message : 'Package hashing failed', input.id, input.version)],
        };
    }
}
