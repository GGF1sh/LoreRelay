import * as fs from 'fs';
import * as path from 'path';
import { constants } from 'fs';
import { open } from 'fs/promises';
import {
    discoverModPackageManifests,
    hashDiscoveredModPackage,
    type ModDiscoveryDiagnostic,
    type ModDiscoveryRoots,
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
export const MAX_MOD_EVIDENCE_CHECKPOINTS = 2_048;

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

interface BoundedReadResult {
    kind: 'missing' | 'ok' | 'invalid';
    bytes?: Uint8Array;
    code?: string;
    identity?: FileIdentity;
}

const runtimeByWorkspace = new Map<string, ModActivationGateResult>();
const runtimeFilesByWorkspace = new Map<string, { profile?: FileIdentity; lock?: FileIdentity }>();

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

function collectEntryFingerprints(value: unknown, destination: Set<string>): void {
    if (!Array.isArray(value)) return;
    for (const entry of value) {
        if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) continue;
        const context = parseModContext((entry as Record<string, unknown>).modContext);
        if (context) destination.add(context.lockFingerprint);
    }
}

async function readJsonEvidence(filePath: string): Promise<unknown> {
    const read = await readBoundedOrdinaryFile(filePath, MAX_MOD_EVIDENCE_FILE_BYTES);
    if (read.kind !== 'ok' || !read.bytes) return undefined;
    try {
        return JSON.parse(Buffer.from(read.bytes).toString('utf8')) as unknown;
    } catch {
        return undefined;
    }
}

async function collectCampaignEvidence(workspaceRoot: string): Promise<{
    historyLockFingerprints: string[];
    checkpointLockFingerprints: string[];
    checkpointScanLimitExceeded: boolean;
}> {
    const history = new Set<string>();
    const checkpoints = new Set<string>();
    const historyValue = await readJsonEvidence(path.join(workspaceRoot, 'game_history.json'));
    collectEntryFingerprints(historyValue, history);
    const stateValue = await readJsonEvidence(path.join(workspaceRoot, 'game_state.json'));
    if (stateValue && typeof stateValue === 'object' && !Array.isArray(stateValue)) {
        collectEntryFingerprints((stateValue as Record<string, unknown>).entries, history);
    }

    const checkpointDir = path.join(workspaceRoot, '.text-adventure', 'checkpoints');
    let files: string[] = [];
    let checkpointScanLimitExceeded = false;
    try {
        const candidates = (await fs.promises.readdir(checkpointDir))
            .filter(file => /^cp-\d+\.json$/.test(file))
            .sort();
        checkpointScanLimitExceeded = candidates.length > MAX_MOD_EVIDENCE_CHECKPOINTS;
        files = candidates.slice(0, MAX_MOD_EVIDENCE_CHECKPOINTS);
    } catch {
        files = [];
    }
    for (const file of files) {
        const value = await readJsonEvidence(path.join(checkpointDir, file));
        if (!value || typeof value !== 'object' || Array.isArray(value)) continue;
        const record = value as Record<string, unknown>;
        if (record.format === 'text-adventure-checkpoint/1.2'
            && typeof record.modLockFingerprint === 'string'
            && /^sha256:[a-f0-9]{64}$/.test(record.modLockFingerprint)) {
            checkpoints.add(record.modLockFingerprint);
        }
        collectEntryFingerprints(record.history, history);
    }
    return {
        historyLockFingerprints: [...history].sort(),
        checkpointLockFingerprints: [...checkpoints].sort(),
        checkpointScanLimitExceeded,
    };
}

function storeRuntime(
    workspaceRoot: string,
    result: ModActivationGateResult,
    files?: { profile?: FileIdentity; lock?: FileIdentity },
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
    return stored;
}

export async function evaluateModActivationGate(input: ModActivationGateInput): Promise<ModActivationGateResult> {
    const root = workspaceKey(input.workspaceRoot);
    runtimeByWorkspace.delete(root);
    runtimeFilesByWorkspace.delete(root);
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
        const evidence = await collectCampaignEvidence(root);
        if (evidence.checkpointScanLimitExceeded) {
            return storeRuntime(root, {
                decision: safeDecision([gateDiagnostic('CAMPAIGN_EVIDENCE_COMPLEXITY_LIMIT', `At most ${MAX_MOD_EVIDENCE_CHECKPOINTS} checkpoint evidence files may be inspected`)]),
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
    const hashDiagnostics: ModDiscoveryDiagnostic[] = [];
    for (const locked of lock.packages) {
        const manifest = discovered.manifests.find(item => item.source === locked.source
            && item.directoryId === locked.id
            && item.directoryVersion === locked.version);
        if (!manifest) continue;
        if (manifest.manifestHash !== locked.manifestHash) {
            hashDiagnostics.push({
                code: 'LOCKED_PACKAGE_HASH_MISMATCH',
                source: locked.source,
                packageId: locked.id,
                packageVersion: locked.version,
                message: 'Discovered manifest differs from the locked hash',
            });
            continue;
        }
        if (manifest.manifest.contentRating === 'adult' && !input.adultSessionAllowed) {
            return storeRuntime(root, {
                decision: safeDecision([gateDiagnostic('ADULT_SESSION_PERMISSION_REQUIRED', 'Adult session permission is required before activation', locked.id)]),
                contentActivationAllowed: false,
                profile,
                lock,
            }, runtimeFiles);
        }
        const hashed = await hashDiscoveredModPackage({
            ...roots,
            source: locked.source,
            id: locked.id,
            version: locked.version,
            expectedManifestHash: locked.manifestHash,
            allowAdultContentRead: input.adultSessionAllowed,
        });
        hashDiagnostics.push(...hashed.diagnostics);
        if (hashed.candidate) candidates.push(hashed.candidate);
    }
    if (hashDiagnostics.length > 0) {
        return storeRuntime(root, {
            decision: safeDecision(hashDiagnostics.map(item => gateDiagnostic(item.code, item.message, item.packageId ?? ''))),
            contentActivationAllowed: false,
            profile,
            lock,
        }, runtimeFiles);
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
    return storeRuntime(root, { decision, contentActivationAllowed: false, profile, lock }, runtimeFiles);
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
        return fs.lstatSync(filePath).isFile();
    } catch {
        return false;
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

/** Fail closed for unevaluated modded campaigns; ordinary unmodded flows remain unchanged. */
export function areModCanonicalWritesAllowed(workspaceRoot: string): boolean {
    const current = getModActivationGateResult(workspaceRoot);
    const campaignDir = path.join(workspaceKey(workspaceRoot), '.text-adventure');
    if (current) {
        if (!current.decision.canonicalWritesAllowed) return false;
        const expected = runtimeFilesByWorkspace.get(workspaceKey(workspaceRoot));
        return sameFileIdentity(expected?.profile, currentOrdinaryFileIdentity(path.join(campaignDir, MOD_PROFILE_FILE)))
            && sameFileIdentity(expected?.lock, currentOrdinaryFileIdentity(path.join(campaignDir, MOD_LOCK_FILE)));
    }
    return !fileExists(path.join(campaignDir, MOD_PROFILE_FILE))
        && !fileExists(path.join(campaignDir, MOD_LOCK_FILE));
}

export function clearModActivationGateRuntime(): void {
    runtimeByWorkspace.clear();
    runtimeFilesByWorkspace.clear();
}
