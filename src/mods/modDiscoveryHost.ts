import * as path from 'path';
import { lstat, open, opendir, realpath } from 'fs/promises';
import { constants, Dirent, Stats } from 'fs';
import { parseModManifestBytes } from './modManifestCore';
import {
    ModDataError,
    ModPackageFileKind,
    hashCanonicalModJson,
    hashNormalizedModPackage,
} from './modHashCore';
import { MAX_MOD_RESOLVER_CANDIDATES, ModPackageCandidate } from './modResolverCore';
import {
    compareUnicodeCodePointOrder,
    isValidModId,
    modPathCollisionKey,
    validateModRelativePath,
} from './modPathCore';
import { parseSemVer } from './modManifestCore';
import { ModResolvedSource } from './modProfileCore';

export const MAX_MOD_DISCOVERY_FILES_PER_PACKAGE = 2_048;
export const MAX_MOD_DISCOVERY_DIRECTORIES_PER_PACKAGE = 256;
export const MAX_MOD_DISCOVERY_BYTES_PER_PACKAGE = 256 * 1024 * 1024;
export const MAX_MOD_DISCOVERY_JSON_BYTES = 4 * 1024 * 1024;
export const MAX_MOD_DISCOVERY_TEXT_BYTES = 4 * 1024 * 1024;
export const MAX_MOD_DISCOVERY_BINARY_BYTES = 25 * 1024 * 1024;

export interface ModDiscoveryDiagnostic {
    code: string;
    source: ModResolvedSource;
    packageId?: string;
    packageVersion?: string;
    relativePath?: string;
    message: string;
}

export interface ModDiscoveryResult {
    candidates: ModPackageCandidate[];
    diagnostics: ModDiscoveryDiagnostic[];
}

interface WalkedFile {
    path: string;
    kind: ModPackageFileKind;
    bytes: Uint8Array;
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

function isContained(root: string, target: string): boolean {
    const relative = path.relative(root, target);
    return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
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

async function readDirectoryBounded(
    absolutePath: string,
    maximumEntries: number,
): Promise<{ entries: Dirent[]; exceeded: boolean }> {
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

async function checkOrdinaryDirectory(
    absolutePath: string,
    containmentRootReal: string,
): Promise<{ ok: true; real: string; stats: Stats } | { ok: false; code: string }> {
    try {
        const stats = await lstat(absolutePath);
        if (stats.isSymbolicLink()) return { ok: false, code: 'PACKAGE_LINK_FORBIDDEN' };
        if (!stats.isDirectory()) return { ok: false, code: 'PACKAGE_DIRECTORY_REQUIRED' };
        const resolved = await realpath(absolutePath);
        if (!isContained(containmentRootReal, resolved)) return { ok: false, code: 'PACKAGE_REALPATH_ESCAPE' };
        return { ok: true, real: resolved, stats };
    } catch {
        return { ok: false, code: 'PACKAGE_DIRECTORY_CHECK_FAILED' };
    }
}

async function readOrdinaryFileNoFollow(
    absolutePath: string,
    expected: Stats,
    containmentRootReal: string,
): Promise<{ ok: true; bytes: Uint8Array } | { ok: false; code: string }> {
    let handle: Awaited<ReturnType<typeof open>> | undefined;
    try {
        const beforeReal = await realpath(absolutePath);
        if (!isContained(containmentRootReal, beforeReal)) return { ok: false, code: 'PACKAGE_REALPATH_ESCAPE' };
        handle = await open(absolutePath, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
        const before = await handle.stat();
        if (!before.isFile() || before.nlink !== 1 || before.size !== expected.size
            || before.dev !== expected.dev || before.ino !== expected.ino) {
            return { ok: false, code: 'PACKAGE_CHANGED_DURING_READ' };
        }
        const bytes = await handle.readFile();
        const after = await handle.stat();
        const pathAfter = await lstat(absolutePath);
        const afterReal = await realpath(absolutePath);
        if (!after.isFile() || after.nlink !== 1 || after.size !== before.size
            || after.dev !== before.dev || after.ino !== before.ino
            || pathAfter.isSymbolicLink() || !pathAfter.isFile()
            || pathAfter.dev !== before.dev || pathAfter.ino !== before.ino
            || !isContained(containmentRootReal, afterReal)) {
            return { ok: false, code: 'PACKAGE_CHANGED_DURING_READ' };
        }
        return { ok: true, bytes };
    } catch {
        return { ok: false, code: 'PACKAGE_FILE_READ_FAILED' };
    } finally {
        await handle?.close().catch(() => undefined);
    }
}

async function walkPackage(
    packageRoot: string,
    packagesRootReal: string,
    source: ModResolvedSource,
    packageId: string,
    packageVersion: string,
): Promise<{ files: WalkedFile[]; diagnostics: ModDiscoveryDiagnostic[] }> {
    const diagnostics: ModDiscoveryDiagnostic[] = [];
    const files: WalkedFile[] = [];
    const collisionKeys = new Set<string>();
    let directoryCount = 1;
    let totalBytes = 0;
    const queue: Array<{ absolute: string; relative: string }> = [{ absolute: packageRoot, relative: '' }];

    while (queue.length > 0 && diagnostics.length === 0) {
        const current = queue.shift()!;
        let entries: Dirent[];
        try {
            const bounded = await readDirectoryBounded(
                current.absolute,
                MAX_MOD_DISCOVERY_FILES_PER_PACKAGE + MAX_MOD_DISCOVERY_DIRECTORIES_PER_PACKAGE,
            );
            if (bounded.exceeded) {
                diagnostics.push(diagnostic('PACKAGE_ENTRY_LIMIT', source, 'Directory entry count exceeds the bounded package budget', packageId, packageVersion, current.relative || undefined));
                break;
            }
            entries = bounded.entries;
        } catch {
            diagnostics.push(diagnostic('PACKAGE_READ_FAILED', source, 'Directory read failed', packageId, packageVersion, current.relative || undefined));
            break;
        }
        for (const entry of entries) {
            const relativePath = current.relative ? `${current.relative}/${entry.name}` : entry.name;
            const pathValidation = validateModRelativePath(relativePath);
            if (!pathValidation.ok || !pathValidation.normalized) {
                diagnostics.push(diagnostic('PACKAGE_PATH_INVALID', source, `Invalid path: ${pathValidation.code ?? 'UNKNOWN'}`, packageId, packageVersion, relativePath));
                break;
            }
            const collisionKey = modPathCollisionKey(pathValidation.normalized);
            if (collisionKeys.has(collisionKey)) {
                diagnostics.push(diagnostic('PACKAGE_PATH_COLLISION', source, 'Path collides after NFC and Windows case folding', packageId, packageVersion, relativePath));
                break;
            }
            collisionKeys.add(collisionKey);
            const absolutePath = path.join(current.absolute, entry.name);
            let stats: Stats;
            try {
                stats = await lstat(absolutePath);
            } catch {
                diagnostics.push(diagnostic('PACKAGE_LSTAT_FAILED', source, 'File status check failed', packageId, packageVersion, relativePath));
                break;
            }
            if (stats.isSymbolicLink()) {
                diagnostics.push(diagnostic('PACKAGE_LINK_FORBIDDEN', source, 'Symbolic links, junctions, and reparse links are forbidden', packageId, packageVersion, relativePath));
                break;
            }
            if (stats.isDirectory()) {
                directoryCount += 1;
                if (directoryCount > MAX_MOD_DISCOVERY_DIRECTORIES_PER_PACKAGE) {
                    diagnostics.push(diagnostic('PACKAGE_DIRECTORY_LIMIT', source, `Directory count exceeds ${MAX_MOD_DISCOVERY_DIRECTORIES_PER_PACKAGE}`, packageId, packageVersion, relativePath));
                    break;
                }
                let resolved: string;
                try {
                    resolved = await realpath(absolutePath);
                } catch {
                    diagnostics.push(diagnostic('PACKAGE_REALPATH_FAILED', source, 'Directory realpath check failed', packageId, packageVersion, relativePath));
                    break;
                }
                if (!isContained(packagesRootReal, resolved)) {
                    diagnostics.push(diagnostic('PACKAGE_REALPATH_ESCAPE', source, 'Directory resolves outside the configured package root', packageId, packageVersion, relativePath));
                    break;
                }
                queue.push({ absolute: absolutePath, relative: pathValidation.normalized });
                continue;
            }
            if (!stats.isFile()) {
                diagnostics.push(diagnostic('PACKAGE_SPECIAL_FILE_FORBIDDEN', source, 'Only ordinary files and directories are allowed', packageId, packageVersion, relativePath));
                break;
            }
            if (stats.nlink !== 1) {
                diagnostics.push(diagnostic('PACKAGE_HARD_LINK_FORBIDDEN', source, 'Files with an unexpected hard-link count are forbidden', packageId, packageVersion, relativePath));
                break;
            }
            if (files.length + 1 > MAX_MOD_DISCOVERY_FILES_PER_PACKAGE) {
                diagnostics.push(diagnostic('PACKAGE_FILE_LIMIT', source, `File count exceeds ${MAX_MOD_DISCOVERY_FILES_PER_PACKAGE}`, packageId, packageVersion, relativePath));
                break;
            }
            const kind = classifyFile(pathValidation.normalized);
            if (!kind) {
                diagnostics.push(diagnostic('PACKAGE_FILE_TYPE_FORBIDDEN', source, 'File extension is not permitted by the declarative V1 substrate', packageId, packageVersion, relativePath));
                break;
            }
            if (stats.size > fileSizeLimit(kind)) {
                diagnostics.push(diagnostic('PACKAGE_FILE_SIZE_LIMIT', source, `File exceeds the ${fileSizeLimit(kind)} byte limit`, packageId, packageVersion, relativePath));
                break;
            }
            totalBytes += stats.size;
            if (totalBytes > MAX_MOD_DISCOVERY_BYTES_PER_PACKAGE) {
                diagnostics.push(diagnostic('PACKAGE_EXPANDED_SIZE_LIMIT', source, `Package exceeds ${MAX_MOD_DISCOVERY_BYTES_PER_PACKAGE} bytes`, packageId, packageVersion, relativePath));
                break;
            }
            const readResult = await readOrdinaryFileNoFollow(absolutePath, stats, packagesRootReal);
            if (!readResult.ok) {
                diagnostics.push(diagnostic(readResult.code, source, 'Package file could not be read as one stable contained ordinary file', packageId, packageVersion, relativePath));
                break;
            }
            files.push({ path: pathValidation.normalized, kind, bytes: readResult.bytes });
        }
    }
    return { files, diagnostics };
}

async function discoverRoot(root: string, source: ModResolvedSource, candidateBudget: number): Promise<ModDiscoveryResult> {
    const candidates: ModPackageCandidate[] = [];
    const diagnostics: ModDiscoveryDiagnostic[] = [];
    if (!path.isAbsolute(root)) {
        return { candidates, diagnostics: [diagnostic('DISCOVERY_ROOT_NOT_ABSOLUTE', source, 'Configured package root must be absolute')] };
    }
    let rootReal: string;
    let idEntries: Dirent[];
    try {
        const rootStats = await lstat(root);
        if (!rootStats.isDirectory()) return { candidates, diagnostics: [diagnostic('DISCOVERY_ROOT_INVALID', source, 'Configured package root is not a directory')] };
        rootReal = await realpath(root);
        const bounded = await readDirectoryBounded(root, MAX_MOD_RESOLVER_CANDIDATES);
        if (bounded.exceeded) {
            return { candidates, diagnostics: [diagnostic('RESOLUTION_COMPLEXITY_LIMIT', source, `Package root contains more than ${MAX_MOD_RESOLVER_CANDIDATES} first-level entries`)] };
        }
        idEntries = bounded.entries;
    } catch (error) {
        const nodeError = error as NodeJS.ErrnoException;
        if (nodeError?.code === 'ENOENT') return { candidates, diagnostics };
        return { candidates, diagnostics: [diagnostic('DISCOVERY_ROOT_READ_FAILED', source, `Package root read failed${nodeError?.code ? ` (${nodeError.code})` : ''}`)] };
    }
    const idCollisionKeys = new Set<string>();
    let candidateDirectoryCount = 0;
    for (const idEntry of idEntries) {
        if (!isValidModId(idEntry.name)) {
            diagnostics.push(diagnostic('DISCOVERY_ID_DIRECTORY_INVALID', source, 'First-level directory is not a canonical MOD ID', idEntry.name));
            continue;
        }
        const idCollision = idEntry.name.toLowerCase();
        if (idCollisionKeys.has(idCollision)) {
            diagnostics.push(diagnostic('DISCOVERY_ID_COLLISION', source, 'MOD ID directories collide under Windows case folding', idEntry.name));
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
            const bounded = await readDirectoryBounded(idPath, MAX_MOD_RESOLVER_CANDIDATES);
            if (bounded.exceeded) {
                return { candidates: [], diagnostics: sortDiagnostics([...diagnostics, diagnostic('RESOLUTION_COMPLEXITY_LIMIT', source, `MOD ID directory contains more than ${MAX_MOD_RESOLVER_CANDIDATES} version entries`, idEntry.name)]) };
            }
            versionEntries = bounded.entries;
        } catch {
            diagnostics.push(diagnostic('DISCOVERY_ID_READ_FAILED', source, 'MOD ID directory read failed', idEntry.name));
            continue;
        }
        const versionCollisionKeys = new Set<string>();
        for (const versionEntry of versionEntries) {
            if (!parseSemVer(versionEntry.name)) {
                diagnostics.push(diagnostic('DISCOVERY_VERSION_DIRECTORY_INVALID', source, 'Second-level directory is not exact SemVer', idEntry.name, versionEntry.name));
                continue;
            }
            const versionCollision = versionEntry.name.toLowerCase();
            if (versionCollisionKeys.has(versionCollision)) {
                diagnostics.push(diagnostic('DISCOVERY_VERSION_COLLISION', source, 'Version directories collide under Windows case folding', idEntry.name, versionEntry.name));
                continue;
            }
            versionCollisionKeys.add(versionCollision);
            candidateDirectoryCount += 1;
            if (candidateDirectoryCount > candidateBudget) {
                return {
                    candidates: [],
                    diagnostics: sortDiagnostics([...diagnostics, diagnostic(
                        'RESOLUTION_COMPLEXITY_LIMIT',
                        source,
                        `Candidate directory count exceeds remaining deterministic budget ${candidateBudget}`,
                        idEntry.name,
                        versionEntry.name,
                    )]),
                };
            }
            const packageRoot = path.join(idPath, versionEntry.name);
            const checkedPackage = await checkOrdinaryDirectory(packageRoot, rootReal);
            if (!checkedPackage.ok) {
                diagnostics.push(diagnostic(checkedPackage.code, source, 'Package version must be an ordinary contained directory', idEntry.name, versionEntry.name));
                continue;
            }
            const walked = await walkPackage(packageRoot, checkedPackage.real, source, idEntry.name, versionEntry.name);
            if (walked.diagnostics.length > 0) {
                diagnostics.push(...walked.diagnostics);
                continue;
            }
            const manifestFile = walked.files.find(file => file.path === 'lorerelay.mod.json');
            if (!manifestFile) {
                diagnostics.push(diagnostic('MANIFEST_MISSING', source, 'Package root must contain lorerelay.mod.json', idEntry.name, versionEntry.name));
                continue;
            }
            const manifestResult = parseModManifestBytes(manifestFile.bytes);
            if (!manifestResult.ok) {
                for (const issue of manifestResult.issues) diagnostics.push(diagnostic(issue.code, source, `${issue.path}: ${issue.message}`, idEntry.name, versionEntry.name, 'lorerelay.mod.json'));
                continue;
            }
            if (manifestResult.value.id !== idEntry.name) {
                diagnostics.push(diagnostic('DIRECTORY_ID_MISMATCH', source, 'Directory ID does not exactly equal manifest ID', idEntry.name, versionEntry.name, 'lorerelay.mod.json'));
                continue;
            }
            if (manifestResult.value.version !== versionEntry.name) {
                diagnostics.push(diagnostic('DIRECTORY_VERSION_MISMATCH', source, 'Directory version does not exactly equal manifest version', idEntry.name, versionEntry.name, 'lorerelay.mod.json'));
                continue;
            }
            try {
                const packageHash = hashNormalizedModPackage(walked.files);
                candidates.push({
                    source,
                    directoryId: idEntry.name,
                    directoryVersion: versionEntry.name,
                    manifest: manifestResult.value,
                    manifestHash: hashCanonicalModJson(manifestResult.value),
                    contentHash: packageHash.contentHash,
                });
            } catch (error) {
                diagnostics.push(diagnostic(
                    error instanceof ModDataError ? error.code : 'PACKAGE_HASH_FAILED',
                    source,
                    error instanceof Error ? error.message : 'Package hashing failed',
                    idEntry.name,
                    versionEntry.name,
                ));
            }
        }
    }
    return { candidates, diagnostics: sortDiagnostics(diagnostics) };
}

/**
 * Read-only bounded discovery of exactly the configured global/workspace package roots.
 * No parent scan, watcher, write, extraction, install, delete, or activation occurs.
 */
export async function discoverModPackages(input: {
    globalPackagesRoot?: string;
    workspaceModsRoot?: string;
}): Promise<ModDiscoveryResult> {
    const candidates: ModPackageCandidate[] = [];
    const diagnostics: ModDiscoveryDiagnostic[] = [];
    if (input.globalPackagesRoot) {
        const globalResult = await discoverRoot(input.globalPackagesRoot, 'global', MAX_MOD_RESOLVER_CANDIDATES);
        if (globalResult.diagnostics.some(item => item.code === 'RESOLUTION_COMPLEXITY_LIMIT')) return { candidates: [], diagnostics: globalResult.diagnostics };
        candidates.push(...globalResult.candidates);
        diagnostics.push(...globalResult.diagnostics);
    }
    if (input.workspaceModsRoot) {
        const workspaceResult = await discoverRoot(input.workspaceModsRoot, 'workspace', MAX_MOD_RESOLVER_CANDIDATES - candidates.length);
        if (workspaceResult.diagnostics.some(item => item.code === 'RESOLUTION_COMPLEXITY_LIMIT')) return { candidates: [], diagnostics: sortDiagnostics([...diagnostics, ...workspaceResult.diagnostics]) };
        candidates.push(...workspaceResult.candidates);
        diagnostics.push(...workspaceResult.diagnostics);
    }
    candidates.sort((left, right) => compareUnicodeCodePointOrder(left.manifest.id, right.manifest.id)
        || compareSemVerDescending(left.manifest.version, right.manifest.version)
        || compareUnicodeCodePointOrder(left.source, right.source));
    return { candidates, diagnostics: sortDiagnostics(diagnostics) };
}

function compareSemVerDescending(left: string, right: string): number {
    const leftVersion = parseSemVer(left)!;
    const rightVersion = parseSemVer(right)!;
    for (const key of ['major', 'minor', 'patch'] as const) {
        if (leftVersion[key] !== rightVersion[key]) return leftVersion[key] > rightVersion[key] ? -1 : 1;
    }
    // The resolver performs the full authoritative ordering. This keeps discovery stable.
    return compareUnicodeCodePointOrder(right, left);
}
