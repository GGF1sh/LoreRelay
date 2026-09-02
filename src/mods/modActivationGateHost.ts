import * as fs from 'fs';
import * as path from 'path';
import { constants } from 'fs';
import { open } from 'fs/promises';
import {
    discoverModPackageManifests,
    hashDiscoveredModPackage,
    type ModDiscoveryDiagnostic,
    type ModDiscoveryRoots,
    type ModPackageTreeIdentity,
    type PackageTreeSnapshotEntry,
} from './modDiscoveryHost';
import {
    MAX_MOD_LOCK_BYTES,
    MAX_MOD_PROFILE_BYTES,
    computeModProfileHash,
    parseModLockBytes,
    parseModProfileBytes,
    type ModLock,
    type ModProfile,
} from './modProfileCore';
import {
    assessModCampaignOpen,
    parseModContext,
    type ModContext,
    type ModOpenDecision,
    type ModOpenDiagnostic,
} from './modSafeModeCore';
import type { ModPackageCandidate } from './modResolverCore';
import { resolveModProfile } from './modResolverCore';
import { compareUnicodeCodePointOrder } from './modPathCore';
import { canonicalizeModJson } from './modHashCore';

export const MOD_PROFILE_FILE = 'mod-profile.json';
export const MOD_LOCK_FILE = 'mod-lock.json';
export const MAX_MOD_EVIDENCE_FILE_BYTES = 64 * 1024 * 1024;
export const MAX_MOD_EVIDENCE_CHECKPOINT_FILES = 65_536;
export const MAX_MOD_EVIDENCE_CHECKPOINT_TOTAL_BYTES = 256 * 1024 * 1024;

export interface ModActivationGateInput extends ModDiscoveryRoots {
    workspaceRoot: string;
    currentLoreRelayVersion: string;
    /** False until an explicit adult-session UI is implemented. */
    adultSessionAllowed: boolean;
}

export interface ModActivationGateResult {
    decision: ModOpenDecision;
    /** Slice 2 is the first lane allowed to consume definitions, assets, prompts, or scenarios. */
    contentActivationAllowed: false;
    profile?: ModProfile;
    lock?: ModLock;
}

export type ModCanonicalAuthorization =
    | {
        mode: 'unmodded';
        workspaceRoot: string;
        generation: number;
    }
    | {
        mode: 'modded';
        workspaceRoot: string;
        generation: number;
        lock: ModLock;
        modContext: ModContext;
    };

interface BoundedReadResult {
    kind: 'missing' | 'ok' | 'invalid';
    bytes?: Uint8Array;
    code?: string;
    identity?: FileIdentity;
}

const runtimeByWorkspace = new Map<string, ModActivationGateResult>();
const runtimeFilesByWorkspace = new Map<string, { profile?: FileIdentity; lock?: FileIdentity }>();
const runtimeInputByWorkspace = new Map<string, ModActivationGateInput>();
const runtimeGenerationByWorkspace = new Map<string, number>();
const runtimePackageTreesByWorkspace = new Map<string, ModPackageTreeIdentity[]>();
let nextRuntimeGeneration = 1;

interface FileIdentity {
    dev: number;
    ino: number;
    size: number;
    mtimeMs: number;
    ctimeMs: number;
    nlink: number;
}

function fileIdentity(stats: fs.Stats): FileIdentity {
    return {
        dev: stats.dev,
        ino: stats.ino,
        size: stats.size,
        mtimeMs: stats.mtimeMs,
        ctimeMs: stats.ctimeMs,
        nlink: stats.nlink,
    };
}

function sameFileIdentity(left: FileIdentity | undefined, right: FileIdentity | undefined): boolean {
    return left === undefined
        ? right === undefined
        : right !== undefined
            && left.dev === right.dev
            && left.ino === right.ino
            && left.size === right.size
            && left.mtimeMs === right.mtimeMs
            && left.ctimeMs === right.ctimeMs
            && left.nlink === right.nlink;
}

function workspaceKey(workspaceRoot: string): string {
    return path.resolve(workspaceRoot);
}

function cloneLock(lock: ModLock): ModLock {
    return JSON.parse(JSON.stringify(lock)) as ModLock;
}

function cloneContext(context: ModContext): ModContext {
    return { ...context };
}

function safeDecision(blockers: readonly ModOpenDiagnostic[], warnings: readonly ModOpenDiagnostic[] = []): ModOpenDecision {
    return {
        mode: 'safe-required',
        contributionsActive: false,
        canonicalWritesAllowed: false,
        providerRequestsAllowed: false,
        blockers: [...blockers].sort((left, right) => compareUnicodeCodePointOrder(left.code, right.code)
            || compareUnicodeCodePointOrder(left.modId, right.modId)
            || compareUnicodeCodePointOrder(left.message, right.message)),
        warnings: [...warnings],
    };
}

function gateDiagnostic(code: string, message: string, modId = ''): ModOpenDiagnostic {
    return { code, modId, message };
}

async function readBoundedOrdinaryFile(filePath: string, maximumBytes: number): Promise<BoundedReadResult> {
    try {
        const parent = await fs.promises.lstat(path.dirname(filePath));
        if (parent.isSymbolicLink() || !parent.isDirectory()) return { kind: 'invalid', code: 'FILE_PARENT_NOT_ORDINARY' };
    } catch (error) {
        return (error as NodeJS.ErrnoException).code === 'ENOENT'
            ? { kind: 'missing' }
            : { kind: 'invalid', code: 'FILE_PARENT_STAT_FAILED' };
    }
    let initial: fs.Stats;
    try {
        initial = await fs.promises.lstat(filePath);
    } catch (error) {
        return (error as NodeJS.ErrnoException).code === 'ENOENT'
            ? { kind: 'missing' }
            : { kind: 'invalid', code: 'FILE_STAT_FAILED' };
    }
    if (initial.isSymbolicLink() || !initial.isFile() || initial.nlink !== 1) return { kind: 'invalid', code: 'FILE_NOT_ORDINARY' };
    if (initial.size > maximumBytes) return { kind: 'invalid', code: 'DOCUMENT_TOO_LARGE' };

    let handle: fs.promises.FileHandle | undefined;
    try {
        handle = await open(filePath, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
        const before = await handle.stat();
        if (!before.isFile() || before.nlink !== 1 || before.size > maximumBytes) return { kind: 'invalid', code: 'DOCUMENT_TOO_LARGE' };
        const readCapacity = Math.min(maximumBytes + 1, before.size + 1);
        const bytes = Buffer.alloc(readCapacity);
        let offset = 0;
        while (offset < readCapacity) {
            const read = await handle.read(bytes, offset, readCapacity - offset, offset);
            if (read.bytesRead === 0) break;
            offset += read.bytesRead;
        }
        if (offset > maximumBytes) return { kind: 'invalid', code: 'DOCUMENT_TOO_LARGE' };
        const after = await handle.stat();
        const finalPath = await fs.promises.lstat(filePath);
        if (!finalPath.isFile()
            || finalPath.isSymbolicLink()
            || finalPath.nlink !== 1
            || before.dev !== after.dev
            || before.ino !== after.ino
            || before.size !== after.size
            || before.mtimeMs !== after.mtimeMs
            || before.ctimeMs !== after.ctimeMs
            || before.nlink !== after.nlink
            || after.dev !== finalPath.dev
            || after.ino !== finalPath.ino
            || after.size !== finalPath.size
            || after.mtimeMs !== finalPath.mtimeMs
            || after.ctimeMs !== finalPath.ctimeMs
            || after.nlink !== finalPath.nlink) {
            return { kind: 'invalid', code: 'FILE_CHANGED_DURING_READ' };
        }
        return { kind: 'ok', bytes: bytes.subarray(0, offset), identity: fileIdentity(finalPath) };
    } catch {
        return { kind: 'invalid', code: 'FILE_READ_FAILED' };
    } finally {
        await handle?.close().catch(() => undefined);
    }
}

/** Evidence also guards synchronous write sinks before the UI has opened. */
function readBoundedOrdinaryFileSync(filePath: string, maximumBytes: number): BoundedReadResult {
    let descriptor: number | undefined;
    try {
        const parent = fs.lstatSync(path.dirname(filePath));
        const initial = fs.lstatSync(filePath);
        if (parent.isSymbolicLink() || !parent.isDirectory()
            || initial.isSymbolicLink() || !initial.isFile() || initial.nlink !== 1) {
            return { kind: 'invalid', code: 'FILE_NOT_ORDINARY' };
        }
        if (initial.size > maximumBytes) return { kind: 'invalid', code: 'DOCUMENT_TOO_LARGE' };
        descriptor = fs.openSync(filePath, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
        const before = fs.fstatSync(descriptor);
        if (!before.isFile() || before.nlink !== 1 || !sameFileIdentity(fileIdentity(initial), fileIdentity(before))) {
            return { kind: 'invalid', code: 'FILE_CHANGED_DURING_READ' };
        }
        const bytes = Buffer.alloc(Math.min(maximumBytes + 1, before.size + 1));
        let offset = 0;
        while (offset < bytes.length) {
            const count = fs.readSync(descriptor, bytes, offset, bytes.length - offset, offset);
            if (count === 0) break;
            offset += count;
        }
        const after = fs.fstatSync(descriptor);
        const finalPath = fs.lstatSync(filePath);
        if (offset > maximumBytes || finalPath.isSymbolicLink() || !finalPath.isFile() || finalPath.nlink !== 1
            || !sameFileIdentity(fileIdentity(before), fileIdentity(after))
            || !sameFileIdentity(fileIdentity(after), fileIdentity(finalPath))) {
            return { kind: 'invalid', code: 'FILE_CHANGED_DURING_READ' };
        }
        return { kind: 'ok', bytes: bytes.subarray(0, offset), identity: fileIdentity(finalPath) };
    } catch (error) {
        return (error as NodeJS.ErrnoException).code === 'ENOENT'
            ? { kind: 'missing' }
            : { kind: 'invalid', code: 'FILE_READ_FAILED' };
    } finally {
        if (descriptor !== undefined) fs.closeSync(descriptor);
    }
}

function collectEntryFingerprints(
    value: unknown,
    destination: Set<string>,
): { modEvidencePresent: boolean; invalidModEvidencePresent: boolean } {
    let modEvidencePresent = false;
    let invalidModEvidencePresent = false;
    if (!Array.isArray(value)) return { modEvidencePresent, invalidModEvidencePresent };
    for (const entry of value) {
        if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) continue;
        const record = entry as Record<string, unknown>;
        if (!Object.prototype.hasOwnProperty.call(record, 'modContext')) continue;
        modEvidencePresent = true;
        const context = parseModContext(record.modContext);
        if (context) destination.add(context.lockFingerprint);
        else invalidModEvidencePresent = true;
    }
    return { modEvidencePresent, invalidModEvidencePresent };
}

interface JsonEvidenceRead {
    kind: 'missing' | 'ok' | 'invalid';
    value?: unknown;
    potentialModEvidence?: boolean;
    byteLength?: number;
}

function readJsonEvidence(filePath: string, maximumBytes = MAX_MOD_EVIDENCE_FILE_BYTES): JsonEvidenceRead {
    const read = readBoundedOrdinaryFileSync(filePath, maximumBytes);
    if (read.kind === 'missing') return { kind: 'missing' };
    if (read.kind !== 'ok' || !read.bytes) return { kind: 'invalid' };
    try {
        return {
            kind: 'ok',
            value: JSON.parse(Buffer.from(read.bytes).toString('utf8')) as unknown,
            byteLength: read.bytes.byteLength,
        };
    } catch {
        const text = Buffer.from(read.bytes).toString('utf8');
        return {
            kind: 'invalid',
            byteLength: read.bytes.byteLength,
            potentialModEvidence: text.includes('modContext')
                || text.includes('modLockFingerprint')
                || text.includes('modLockSnapshot')
                || text.includes('text-adventure-checkpoint/1.2'),
        };
    }
}

function collectCampaignEvidence(workspaceRoot: string): {
    historyLockFingerprints: string[];
    checkpointLockFingerprints: string[];
    modEvidencePresent: boolean;
    invalidModEvidencePresent: boolean;
} {
    const history = new Set<string>();
    const checkpoints = new Set<string>();
    let modEvidencePresent = false;
    let invalidModEvidencePresent = false;
    const historyRead = readJsonEvidence(path.join(workspaceRoot, 'game_history.json'));
    if (historyRead.kind === 'invalid' && historyRead.potentialModEvidence !== false) invalidModEvidencePresent = true;
    if (historyRead.kind === 'ok') {
        const result = collectEntryFingerprints(historyRead.value, history);
        modEvidencePresent ||= result.modEvidencePresent;
        invalidModEvidencePresent ||= result.invalidModEvidencePresent;
    }
    const stateRead = readJsonEvidence(path.join(workspaceRoot, 'game_state.json'));
    if (stateRead.kind === 'invalid' && stateRead.potentialModEvidence !== false) invalidModEvidencePresent = true;
    const stateValue = stateRead.value;
    if (stateRead.kind === 'ok' && stateValue && typeof stateValue === 'object' && !Array.isArray(stateValue)) {
        const result = collectEntryFingerprints((stateValue as Record<string, unknown>).entries, history);
        modEvidencePresent ||= result.modEvidencePresent;
        invalidModEvidencePresent ||= result.invalidModEvidencePresent;
    }

    const checkpointDir = path.join(workspaceRoot, '.text-adventure', 'checkpoints');
    let files: string[] = [];
    let checkpointDirectory: fs.Dir | undefined;
    let checkpointDirectoryIdentity: FileIdentity | undefined;
    try {
        const stats = fs.lstatSync(checkpointDir);
        if (stats.isSymbolicLink() || !stats.isDirectory()) throw new Error('checkpoint path is not ordinary');
        checkpointDirectoryIdentity = fileIdentity(stats);
        checkpointDirectory = fs.opendirSync(checkpointDir);
        while (true) {
            const entry = checkpointDirectory.readSync();
            if (!entry) break;
            if (!/^cp-\d+\.json$/.test(entry.name)) continue;
            files.push(entry.name);
            if (files.length > MAX_MOD_EVIDENCE_CHECKPOINT_FILES) {
                invalidModEvidencePresent = true;
                files.length = MAX_MOD_EVIDENCE_CHECKPOINT_FILES;
                break;
            }
        }
        files.sort(compareUnicodeCodePointOrder);
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') invalidModEvidencePresent = true;
        files = [];
    } finally {
        checkpointDirectory?.closeSync();
    }
    let checkpointBytesRead = 0;
    for (const file of files) {
        const read = readJsonEvidence(path.join(checkpointDir, file));
        checkpointBytesRead += read.byteLength ?? 0;
        if (checkpointBytesRead > MAX_MOD_EVIDENCE_CHECKPOINT_TOTAL_BYTES) {
            invalidModEvidencePresent = true;
            break;
        }
        if (read.kind === 'invalid') {
            if (read.potentialModEvidence !== false) invalidModEvidencePresent = true;
            continue;
        }
        if (read.kind === 'missing') {
            invalidModEvidencePresent = true;
            continue;
        }
        const value = read.value;
        if (!value || typeof value !== 'object' || Array.isArray(value)) continue;
        const record = value as Record<string, unknown>;
        const checkpointModFieldsPresent = record.format === 'text-adventure-checkpoint/1.2'
            || Object.prototype.hasOwnProperty.call(record, 'modLockFingerprint')
            || Object.prototype.hasOwnProperty.call(record, 'modLockSnapshot');
        if (checkpointModFieldsPresent) {
            modEvidencePresent = true;
            if (record.format === 'text-adventure-checkpoint/1.2'
                && typeof record.modLockFingerprint === 'string'
                && /^sha256:[a-f0-9]{64}$/.test(record.modLockFingerprint)) {
                checkpoints.add(record.modLockFingerprint);
            } else {
                invalidModEvidencePresent = true;
            }
        }
        const historyResult = collectEntryFingerprints(record.history, history);
        modEvidencePresent ||= historyResult.modEvidencePresent;
        invalidModEvidencePresent ||= historyResult.invalidModEvidencePresent;
    }
    if (checkpointDirectoryIdentity) {
        try {
            const finalDirectory = fs.lstatSync(checkpointDir);
            if (finalDirectory.isSymbolicLink()
                || !finalDirectory.isDirectory()
                || !sameFileIdentity(checkpointDirectoryIdentity, fileIdentity(finalDirectory))) {
                invalidModEvidencePresent = true;
            }
        } catch {
            invalidModEvidencePresent = true;
        }
    }
    return {
        historyLockFingerprints: [...history].sort(),
        checkpointLockFingerprints: [...checkpoints].sort(),
        modEvidencePresent,
        invalidModEvidencePresent,
    };
}

function storeRuntime(
    workspaceRoot: string,
    result: ModActivationGateResult,
    files?: { profile?: FileIdentity; lock?: FileIdentity },
    packageTrees: readonly ModPackageTreeIdentity[] = [],
): ModActivationGateResult {
    const stored: ModActivationGateResult = {
        decision: result.decision.mode === 'normal'
            ? { ...result.decision, modContext: cloneContext(result.decision.modContext) }
            : { ...result.decision, blockers: [...result.decision.blockers], warnings: [...result.decision.warnings] } as ModOpenDecision,
        contentActivationAllowed: false,
        ...(result.profile ? { profile: JSON.parse(JSON.stringify(result.profile)) as ModProfile } : {}),
        ...(result.lock ? { lock: cloneLock(result.lock) } : {}),
    };
    runtimeByWorkspace.set(workspaceKey(workspaceRoot), stored);
    runtimeFilesByWorkspace.set(workspaceKey(workspaceRoot), { ...files });
    runtimePackageTreesByWorkspace.set(workspaceKey(workspaceRoot), packageTrees.map(tree => ({
        ...tree,
        entries: tree.entries.map(entry => ({ ...entry })),
    })));
    runtimeGenerationByWorkspace.set(workspaceKey(workspaceRoot), nextRuntimeGeneration++);
    return stored;
}

export async function evaluateModActivationGate(input: ModActivationGateInput): Promise<ModActivationGateResult> {
    const root = workspaceKey(input.workspaceRoot);
    runtimeInputByWorkspace.set(root, {
        ...input,
        workspaceRoot: root,
        ...(input.globalStorageRoot ? { globalStorageRoot: path.resolve(input.globalStorageRoot) } : {}),
    });
    runtimeByWorkspace.delete(root);
    runtimeFilesByWorkspace.delete(root);
    runtimePackageTreesByWorkspace.delete(root);
    if (!path.isAbsolute(input.workspaceRoot)
        || (input.globalStorageRoot !== undefined && !path.isAbsolute(input.globalStorageRoot))) {
        return storeRuntime(root, {
            decision: safeDecision([gateDiagnostic('ACTIVATION_ROOT_NOT_ABSOLUTE', 'MOD activation roots must be absolute paths')]),
            contentActivationAllowed: false,
        });
    }
    const campaignDir = path.join(root, '.text-adventure');
    const [profileRead, lockRead] = await Promise.all([
        readBoundedOrdinaryFile(path.join(campaignDir, MOD_PROFILE_FILE), MAX_MOD_PROFILE_BYTES),
        readBoundedOrdinaryFile(path.join(campaignDir, MOD_LOCK_FILE), MAX_MOD_LOCK_BYTES),
    ]);
    const runtimeFiles = {
        ...(profileRead.identity ? { profile: profileRead.identity } : {}),
        ...(lockRead.identity ? { lock: lockRead.identity } : {}),
    };

    if (profileRead.kind === 'invalid') {
        return storeRuntime(root, {
            decision: safeDecision([gateDiagnostic(`PROFILE_${profileRead.code}`, 'MOD profile could not be read safely')]),
            contentActivationAllowed: false,
        }, runtimeFiles);
    }
    if (lockRead.kind === 'invalid') {
        return storeRuntime(root, {
            decision: safeDecision([gateDiagnostic(`LOCK_${lockRead.code}`, 'MOD lock could not be read safely')]),
            contentActivationAllowed: false,
        }, runtimeFiles);
    }

    const profileValidation = profileRead.kind === 'ok' && profileRead.bytes
        ? parseModProfileBytes(profileRead.bytes)
        : undefined;
    const lockValidation = lockRead.kind === 'ok' && lockRead.bytes
        ? parseModLockBytes(lockRead.bytes)
        : undefined;
    if (profileValidation && !profileValidation.ok) {
        return storeRuntime(root, {
            decision: safeDecision(profileValidation.issues.map(issue => gateDiagnostic(`PROFILE_${issue.code}`, `${issue.path}: ${issue.message}`))),
            contentActivationAllowed: false,
        }, runtimeFiles);
    }
    if (lockValidation && !lockValidation.ok) {
        return storeRuntime(root, {
            decision: safeDecision(lockValidation.issues.map(issue => gateDiagnostic(`LOCK_${issue.code}`, `${issue.path}: ${issue.message}`))),
            contentActivationAllowed: false,
        }, runtimeFiles);
    }

    const profile = profileValidation?.ok ? profileValidation.value : undefined;
    const lock = lockValidation?.ok ? lockValidation.value : undefined;
    if (!profile || !lock) {
        const evidence = collectCampaignEvidence(root);
        if (evidence.invalidModEvidencePresent) {
            return storeRuntime(root, {
                decision: safeDecision([gateDiagnostic('CAMPAIGN_EVIDENCE_INVALID', 'Campaign MOD evidence is malformed or could not be inspected safely')]),
                contentActivationAllowed: false,
                ...(profile ? { profile } : {}),
                ...(lock ? { lock } : {}),
            }, runtimeFiles);
        }
        const decision = assessModCampaignOpen({
            lock: undefined,
            installedCandidates: [],
            currentLoreRelayVersion: input.currentLoreRelayVersion,
            adultSessionAllowed: input.adultSessionAllowed,
            modProfilePresent: profileRead.kind === 'ok',
            activeProfileHash: profile ? computeModProfileHash(profile) : undefined,
            checkpointLockFingerprints: evidence.checkpointLockFingerprints,
            historyLockFingerprints: evidence.historyLockFingerprints,
            modEvidencePresent: evidence.modEvidencePresent,
        });
        const missingPeer = (profile && !lock) || (!profile && lock);
        return storeRuntime(root, {
            decision: missingPeer
                ? safeDecision([gateDiagnostic('PROFILE_LOCK_PAIR_REQUIRED', 'MOD profile and lock must either both exist or both be absent')])
                : decision,
            contentActivationAllowed: false,
            ...(profile ? { profile } : {}),
            ...(lock ? { lock } : {}),
        }, runtimeFiles);
    }

    const profileHash = computeModProfileHash(profile);
    if (profileHash !== lock.profileHash) {
        return storeRuntime(root, {
            decision: safeDecision([gateDiagnostic('PROFILE_LOCK_HASH_MISMATCH', 'MOD profile does not match the authoritative lock')]),
            contentActivationAllowed: false,
            profile,
            lock,
        }, runtimeFiles);
    }

    const roots: ModDiscoveryRoots = { workspaceRoot: root, ...(input.globalStorageRoot ? { globalStorageRoot: input.globalStorageRoot } : {}) };
    const discovered = await discoverModPackageManifests(roots);
    const discoveryLimit = discovered.diagnostics.find(item => item.code === 'RESOLUTION_COMPLEXITY_LIMIT');
    if (discoveryLimit) {
        return storeRuntime(root, {
            decision: safeDecision([gateDiagnostic(discoveryLimit.code, discoveryLimit.message)]),
            contentActivationAllowed: false,
            profile,
            lock,
        }, runtimeFiles);
    }

    const candidates: ModPackageCandidate[] = [];
    const packageTrees: ModPackageTreeIdentity[] = [];
    const hashDiagnostics: ModDiscoveryDiagnostic[] = [];
    const lockedIdentities = [...new Set(lock.packages.map(pkg => `${pkg.id}\0${pkg.version}`))].sort(compareUnicodeCodePointOrder);
    for (const identity of lockedIdentities) {
        const separator = identity.indexOf('\0');
        const id = identity.slice(0, separator);
        const version = identity.slice(separator + 1);
        const variants = discovered.manifests.filter(item => item.directoryId === id && item.directoryVersion === version);
        for (const manifest of variants) {
            if (manifest.manifest.contentRating === 'adult' && !input.adultSessionAllowed) {
                return storeRuntime(root, {
                    decision: safeDecision([gateDiagnostic('ADULT_SESSION_PERMISSION_REQUIRED', 'Adult session permission is required before activation', id)]),
                    contentActivationAllowed: false,
                    profile,
                    lock,
                }, runtimeFiles);
            }
            const hashed = await hashDiscoveredModPackage({
                ...roots,
                source: manifest.source,
                id,
                version,
                expectedManifestHash: manifest.manifestHash,
                allowAdultContentRead: input.adultSessionAllowed,
            });
            hashDiagnostics.push(...hashed.diagnostics);
            if (hashed.candidate) candidates.push(hashed.candidate);
            if (hashed.treeIdentity) packageTrees.push(hashed.treeIdentity);
        }
    }
    if (hashDiagnostics.length > 0) {
        return storeRuntime(root, {
            decision: safeDecision(hashDiagnostics.map(item => gateDiagnostic(item.code, item.message, item.packageId ?? ''))),
            contentActivationAllowed: false,
            profile,
            lock,
        }, runtimeFiles);
    }
    const candidatesByIdentity = new Map<string, ModPackageCandidate[]>();
    for (const candidate of candidates) {
        const key = `${candidate.directoryId}\0${candidate.directoryVersion}`;
        candidatesByIdentity.set(key, [...(candidatesByIdentity.get(key) ?? []), candidate]);
    }
    for (const variants of candidatesByIdentity.values()) {
        if (variants.length < 2) continue;
        const baseline = variants[0];
        if (variants.some(item => item.manifestHash !== baseline.manifestHash || item.contentHash !== baseline.contentHash)) {
            return storeRuntime(root, {
                decision: safeDecision([gateDiagnostic('PROFILE_DUPLICATE_VARIANT', `Global and workspace variants differ for ${baseline.directoryId}@${baseline.directoryVersion}`, baseline.directoryId)]),
                contentActivationAllowed: false,
                profile,
                lock,
            }, runtimeFiles);
        }
    }

    const resolvedProfile = resolveModProfile(profile, candidates, input.currentLoreRelayVersion);
    if (!resolvedProfile.ok) {
        return storeRuntime(root, {
            decision: safeDecision(resolvedProfile.diagnostics.map(item => gateDiagnostic(`PROFILE_${item.code}`, item.message, item.modId))),
            contentActivationAllowed: false,
            profile,
            lock,
        }, runtimeFiles);
    }
    const resolvedBinding = canonicalizeModJson({
        resolverVersion: resolvedProfile.lock.resolverVersion,
        profileHash: resolvedProfile.lock.profileHash,
        adultContentAllowed: resolvedProfile.lock.adultContentAllowed,
        packages: resolvedProfile.lock.packages,
        loadOrder: resolvedProfile.lock.loadOrder,
        selected: resolvedProfile.lock.selected,
    });
    const lockedBinding = canonicalizeModJson({
        resolverVersion: lock.resolverVersion,
        profileHash: lock.profileHash,
        adultContentAllowed: lock.adultContentAllowed,
        packages: lock.packages,
        loadOrder: lock.loadOrder,
        selected: lock.selected,
    });
    if (resolvedBinding !== lockedBinding) {
        return storeRuntime(root, {
            decision: safeDecision([gateDiagnostic('PROFILE_LOCK_RESOLUTION_MISMATCH', 'The exact profile does not resolve to the authoritative lock')]),
            contentActivationAllowed: false,
            profile,
            lock,
        }, runtimeFiles);
    }

    const decision = assessModCampaignOpen({
        lock,
        installedCandidates: candidates,
        currentLoreRelayVersion: input.currentLoreRelayVersion,
        adultSessionAllowed: input.adultSessionAllowed,
        activeProfileHash: profileHash,
        modProfilePresent: true,
        checkpointLockFingerprints: [],
        historyLockFingerprints: [],
    });
    return storeRuntime(root, { decision, contentActivationAllowed: false, profile, lock }, runtimeFiles, packageTrees);
}

export function getModActivationGateResult(workspaceRoot: string): ModActivationGateResult | undefined {
    return runtimeByWorkspace.get(workspaceKey(workspaceRoot));
}

export function getVerifiedActiveModLock(workspaceRoot: string): ModLock | undefined {
    const current = getModActivationGateResult(workspaceRoot);
    return current?.decision.mode === 'normal' && current.lock && areModCanonicalWritesAllowed(workspaceRoot)
        ? cloneLock(current.lock)
        : undefined;
}

export function getVerifiedActiveModContext(workspaceRoot: string): ModContext | undefined {
    const current = getModActivationGateResult(workspaceRoot);
    return current?.decision.mode === 'normal' && areModCanonicalWritesAllowed(workspaceRoot)
        ? cloneContext(current.decision.modContext)
        : undefined;
}

function fileExists(filePath: string): boolean {
    try {
        fs.lstatSync(filePath);
        return true;
    } catch (error) {
        return (error as NodeJS.ErrnoException).code !== 'ENOENT';
    }
}

function currentOrdinaryFileIdentity(filePath: string): FileIdentity | undefined {
    try {
        const stats = fs.lstatSync(filePath);
        return stats.isFile() && !stats.isSymbolicLink() && stats.nlink === 1 ? fileIdentity(stats) : undefined;
    } catch {
        return undefined;
    }
}

function samePackageTreeIdentityEntry(expected: PackageTreeSnapshotEntry, stats: fs.Stats): boolean {
    const type = stats.isDirectory() ? 'directory' : stats.isFile() ? 'file' : undefined;
    return type === expected.type
        && !stats.isSymbolicLink()
        && (type !== 'file' || stats.nlink === 1)
        && stats.size === expected.size
        && stats.mode === expected.mode
        && stats.nlink === expected.nlink
        && stats.dev === expected.dev
        && stats.ino === expected.ino
        && stats.mtimeMs === expected.mtimeMs
        && stats.ctimeMs === expected.ctimeMs;
}

function isPackageTreeIdentityCurrent(input: ModActivationGateInput, tree: ModPackageTreeIdentity): boolean {
    const base = tree.source === 'global' ? input.globalStorageRoot : input.workspaceRoot;
    if (!base) return false;
    const packagesRoot = tree.source === 'global'
        ? path.join(path.resolve(base), 'mods', 'packages')
        : path.join(path.resolve(base), '.text-adventure', 'mods');
    const idRoot = path.join(packagesRoot, tree.directoryId);
    const packageRoot = path.join(idRoot, tree.directoryVersion);
    try {
        for (const directoryPath of [packagesRoot, idRoot, packageRoot]) {
            const stats = fs.lstatSync(directoryPath);
            if (stats.isSymbolicLink() || !stats.isDirectory()) return false;
        }
        const packagesRootReal = fs.realpathSync(packagesRoot);
        const packageRootReal = fs.realpathSync(packageRoot);
        const relative = path.relative(packagesRootReal, packageRootReal);
        if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) return false;
    } catch {
        return false;
    }
    const entriesByPath = new Map(tree.entries.map(entry => [entry.path, entry]));
    if (!entriesByPath.has('')) return false;
    const expectedChildren = new Map<string, Set<string>>();
    for (const entry of tree.entries) {
        const absolutePath = entry.path
            ? path.join(packageRoot, ...entry.path.split('/'))
            : packageRoot;
        let stats: fs.Stats;
        try {
            stats = fs.lstatSync(absolutePath);
        } catch {
            return false;
        }
        if (!samePackageTreeIdentityEntry(entry, stats)) return false;
        if (!entry.path) continue;
        const parent = path.posix.dirname(entry.path) === '.' ? '' : path.posix.dirname(entry.path);
        const name = path.posix.basename(entry.path);
        const children = expectedChildren.get(parent) ?? new Set<string>();
        children.add(name);
        expectedChildren.set(parent, children);
    }
    for (const entry of tree.entries.filter(item => item.type === 'directory')) {
        const expected = expectedChildren.get(entry.path) ?? new Set<string>();
        const absolutePath = entry.path
            ? path.join(packageRoot, ...entry.path.split('/'))
            : packageRoot;
        let directory: fs.Dir | undefined;
        try {
            directory = fs.opendirSync(absolutePath);
            let count = 0;
            while (true) {
                const child = directory.readSync();
                if (!child) break;
                count += 1;
                if (count > expected.size || !expected.has(child.name)) return false;
            }
            if (count !== expected.size) return false;
        } catch {
            return false;
        } finally {
            directory?.closeSync();
        }
    }
    return true;
}

function areStoredPackageTreesCurrent(workspaceRoot: string): boolean {
    const root = workspaceKey(workspaceRoot);
    const current = runtimeByWorkspace.get(root);
    if (current?.decision.mode !== 'normal') return true;
    const input = runtimeInputByWorkspace.get(root);
    const trees = runtimePackageTreesByWorkspace.get(root);
    const expectedPackageCount = current.lock?.packages.length ?? 0;
    if (!input || !trees
        || !(expectedPackageCount === 0 ? trees.length === 0 : trees.length >= expectedPackageCount)
        || !trees.every(tree => isPackageTreeIdentityCurrent(input, tree))) return false;
    // Absence is part of the proof too: a new counterpart variant must revoke a
    // direct synchronous commit, without waiting for the next async discovery.
    for (const pkg of current.lock?.packages ?? []) {
        for (const source of ['global', 'workspace'] as const) {
            if (trees.some(tree => tree.source === source
                && tree.directoryId === pkg.id && tree.directoryVersion === pkg.version)) continue;
            const base = source === 'global' ? input.globalStorageRoot : input.workspaceRoot;
            if (!base) continue;
            const packagesRoot = source === 'global'
                ? path.join(path.resolve(base), 'mods', 'packages')
                : path.join(path.resolve(base), '.text-adventure', 'mods');
            if (fileExists(path.join(packagesRoot, pkg.id, pkg.version))) return false;
        }
    }
    return true;
}

/** Fail closed for unevaluated modded campaigns; ordinary unmodded flows remain unchanged. */
export function areModCanonicalWritesAllowed(workspaceRoot: string): boolean {
    const current = getModActivationGateResult(workspaceRoot);
    const campaignDir = path.join(workspaceKey(workspaceRoot), '.text-adventure');
    try {
        const parent = fs.lstatSync(campaignDir);
        if (parent.isSymbolicLink() || !parent.isDirectory()) return false;
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') return false;
    }
    const controlMatches = (expected: FileIdentity | undefined, fileName: string): boolean => {
        const filePath = path.join(campaignDir, fileName);
        return expected
            ? sameFileIdentity(expected, currentOrdinaryFileIdentity(filePath))
            : !fileExists(filePath);
    };
    if (current) {
        if (!current.decision.canonicalWritesAllowed) return false;
        const expected = runtimeFilesByWorkspace.get(workspaceKey(workspaceRoot));
        const bindingsCurrent = controlMatches(expected?.profile, MOD_PROFILE_FILE)
            && controlMatches(expected?.lock, MOD_LOCK_FILE)
            && areStoredPackageTreesCurrent(workspaceRoot);
        if (!bindingsCurrent) return false;
        if (current.decision.mode === 'unmodded') {
            const evidence = collectCampaignEvidence(workspaceKey(workspaceRoot));
            return !evidence.modEvidencePresent && !evidence.invalidModEvidencePresent;
        }
        return true;
    }
    if (fileExists(path.join(campaignDir, MOD_PROFILE_FILE))
        || fileExists(path.join(campaignDir, MOD_LOCK_FILE))) return false;
    const evidence = collectCampaignEvidence(workspaceKey(workspaceRoot));
    return !evidence.modEvidencePresent && !evidence.invalidModEvidencePresent;
}

/**
 * Revalidates the exact profile, lock, and every locked package tree before issuing
 * one short-lived canonical-mutation lease. A modded lease never degrades to an
 * unmodded/undefined context.
 */
export async function acquireModCanonicalAuthorization(workspaceRoot: string): Promise<ModCanonicalAuthorization | undefined> {
    const root = workspaceKey(workspaceRoot);
    const current = runtimeByWorkspace.get(root);
    if (!current) {
        if (!areModCanonicalWritesAllowed(root)) return undefined;
        runtimeInputByWorkspace.set(root, {
            workspaceRoot: root,
            currentLoreRelayVersion: '',
            adultSessionAllowed: false,
        });
        storeRuntime(root, {
            decision: {
                mode: 'unmodded', contributionsActive: false, canonicalWritesAllowed: true,
                providerRequestsAllowed: true, blockers: [], warnings: [],
            },
            contentActivationAllowed: false,
        });
        return { mode: 'unmodded', workspaceRoot: root, generation: runtimeGenerationByWorkspace.get(root)! };
    }
    if (!areModCanonicalWritesAllowed(root)) return undefined;
    const input = runtimeInputByWorkspace.get(root);
    if (current.decision.mode === 'normal') {
        if (!input || !current.lock) return undefined;
        const expectedFingerprint = current.lock.aggregateHash;
        const expectedProfileHash = current.lock.profileHash;
        const refreshed = await evaluateModActivationGate(input);
        if (refreshed.decision.mode !== 'normal'
            || !refreshed.lock
            || refreshed.lock.aggregateHash !== expectedFingerprint
            || refreshed.lock.profileHash !== expectedProfileHash
            || !areModCanonicalWritesAllowed(root)) {
            return undefined;
        }
        return {
            mode: 'modded',
            workspaceRoot: root,
            generation: runtimeGenerationByWorkspace.get(root) ?? 0,
            lock: cloneLock(refreshed.lock),
            modContext: cloneContext(refreshed.decision.modContext),
        };
    }
    if (current.decision.mode !== 'unmodded') return undefined;
    if (input) {
        const refreshed = await evaluateModActivationGate(input);
        if (refreshed.decision.mode !== 'unmodded' || !areModCanonicalWritesAllowed(root)) return undefined;
    }
    return {
        mode: 'unmodded',
        workspaceRoot: root,
        generation: runtimeGenerationByWorkspace.get(root) ?? 0,
    };
}

/** Final synchronous identity/generation check immediately before an authoritative write. */
export function isModCanonicalAuthorizationCurrent(authorization: ModCanonicalAuthorization): boolean {
    const root = workspaceKey(authorization.workspaceRoot);
    if (root !== authorization.workspaceRoot
        || authorization.generation !== (runtimeGenerationByWorkspace.get(root) ?? 0)
        || !areModCanonicalWritesAllowed(root)) {
        return false;
    }
    const current = runtimeByWorkspace.get(root);
    if (authorization.mode === 'unmodded') return current === undefined || current.decision.mode === 'unmodded';
    return current?.decision.mode === 'normal'
        && current.lock?.aggregateHash === authorization.lock.aggregateHash
        && current.decision.modContext.lockFingerprint === authorization.modContext.lockFingerprint
        && current.decision.modContext.adultActive === authorization.modContext.adultActive;
}

export function clearModActivationGateRuntime(): void {
    runtimeByWorkspace.clear();
    runtimeFilesByWorkspace.clear();
    runtimeInputByWorkspace.clear();
    runtimeGenerationByWorkspace.clear();
    runtimePackageTreesByWorkspace.clear();
}
