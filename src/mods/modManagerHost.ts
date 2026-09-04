import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs/promises';
import { constants } from 'fs';
import { createHash, randomUUID } from 'crypto';
import { t } from '../i18n';
import type { DeterministicWorkspaceMutationGate } from '../deterministicWorkspaceMutationGate';
import {
    MOD_LOCK_FILE,
    MOD_PROFILE_FILE,
    evaluateModActivationGate,
    getModActivationGateResult,
    type ModActivationGateResult,
} from './modActivationGateHost';
import { discoverModPackageManifests, type DiscoveredModManifest, type ModDiscoveryRoots } from './modDiscoveryHost';
import {
    authorizeInstalledModPackageRead,
    inspectLocalModImport,
    installLocalModPackage,
    resolveInstalledModProfile,
    type ModInstalledReadAuthorization,
} from './modInstallHost';
import { isLoreRelayVersionCompatible } from './modManifestCore';
import {
    MOD_LOCK_FORMAT,
    MOD_PROFILE_FORMAT,
    computeModLockAggregateHash,
    computeModProfileHash,
    parseModLockBytes,
    parseModProfileBytes,
    serializeModLock,
    serializeModProfile,
    type ModAdultApproval,
    type ModLock,
    type ModProfile,
    type ModResolvedSource,
} from './modProfileCore';

const ADULT_VISIBILITY_KEY = 'lorerelay.mods.showAdultMetadata';
const CONTROL_TRANSACTION_FILE = 'mod-control-transaction.json';
const CONTROL_STAGING_DIR = 'mod-control-staging';
const TRANSACTION_FORMAT = 'lorerelay-mod-control-transaction/1';
const MANAGER_MESSAGES = new Set([
    'requestModManagerState', 'setModAdultVisibility', 'installModPackage', 'setModEnabled',
    'authorizeAdultMod', 'resolveModProfilePreview', 'commitModProfile', 'exportModDiagnostics',
]);

interface ControlTransaction {
    format: typeof TRANSACTION_FORMAT;
    id: string;
    profileHash: string;
    lockHash: string;
    oldProfileHash: string | null;
    oldLockHash: string | null;
}

export interface ModManagerMessage {
    type: string;
    [key: string]: unknown;
}

export interface ModManagerHost {
    handles(type: string): boolean;
    handleMessage(message: ModManagerMessage): Promise<boolean>;
    recoverCurrentWorkspace(): Promise<void>;
    adultSessionApprovals(workspaceRoot: string): readonly ModAdultApproval[];
}

export interface ModManagerHostDeps {
    context: vscode.ExtensionContext;
    getPanel(): vscode.WebviewPanel | undefined;
    getWorkspacePath(): string | undefined;
    currentLoreRelayVersion(): string;
    mutationGate: DeterministicWorkspaceMutationGate;
}

function sha(bytes: Uint8Array | string): string {
    return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
    return !!value && typeof value === 'object' && !Array.isArray(value)
        && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
}

function emptyProfile(): ModProfile {
    return {
        format: MOD_PROFILE_FORMAT,
        enabled: [],
        selected: { campaignKit: null },
        adultContent: { allow: false, approvals: [] },
    };
}

function cloneProfile(profile: ModProfile): ModProfile {
    return JSON.parse(serializeModProfile(profile)) as ModProfile;
}

function lockAggregateHash(lock: ModLock): string {
    const { aggregateHash: _aggregateHash, ...withoutAggregateHash } = lock;
    return computeModLockAggregateHash(withoutAggregateHash);
}

function authorizationKey(value: Pick<ModInstalledReadAuthorization, 'source' | 'id' | 'version'>): string {
    return `${value.source}\0${value.id}\0${value.version}`;
}

function hiddenAdultModIds(
    activation: ModActivationGateResult,
    discovery: Awaited<ReturnType<typeof discoverModPackageManifests>>,
): Set<string> {
    const hidden = new Set(discovery.manifests
        .filter(item => item.manifest.contentRating === 'adult')
        .map(item => item.manifest.id));
    for (const approval of activation.profile?.adultContent.approvals ?? []) hidden.add(approval.id);
    for (const locked of activation.lock?.packages ?? []) {
        if (locked.contentRating === 'adult') hidden.add(locked.id);
    }
    return hidden;
}

function visibleModId(modId: string | undefined, adultVisible: boolean, hiddenAdultIds: ReadonlySet<string>): { modId?: string } {
    return !modId || (!adultVisible && hiddenAdultIds.has(modId)) ? {} : { modId };
}

async function ordinaryDirectory(filename: string, create = false): Promise<void> {
    if (create) await fs.mkdir(filename, { recursive: false, mode: 0o700 }).catch(error => {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    });
    const stats = await fs.lstat(filename);
    if (!stats.isDirectory() || stats.isSymbolicLink() || path.relative(filename, await fs.realpath(filename)) !== '') {
        throw Object.assign(new Error('Unsafe MOD control directory'), { code: 'MOD_CONTROL_UNSAFE_DIRECTORY' });
    }
}

async function readOrdinary(filename: string, maximum: number): Promise<Buffer | undefined> {
    let before;
    try { before = await fs.lstat(filename); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined; throw error; }
    if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1 || before.size > maximum) {
        throw Object.assign(new Error('Unsafe MOD control file'), { code: 'MOD_CONTROL_UNSAFE_FILE' });
    }
    const handle = await fs.open(filename, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    try {
        const current = await handle.stat();
        if (!current.isFile() || current.dev !== before.dev || current.ino !== before.ino || current.size !== before.size
            || current.mtimeMs !== before.mtimeMs || current.ctimeMs !== before.ctimeMs || current.nlink !== 1) {
            throw Object.assign(new Error('Changed MOD control file'), { code: 'MOD_CONTROL_FILE_CHANGED' });
        }
        const bytes = Buffer.alloc(before.size);
        let offset = 0;
        while (offset < bytes.length) {
            const part = await handle.read(bytes, offset, bytes.length - offset, offset);
            if (!part.bytesRead) throw Object.assign(new Error('Short MOD control read'), { code: 'MOD_CONTROL_FILE_CHANGED' });
            offset += part.bytesRead;
        }
        const after = await fs.lstat(filename);
        if (after.dev !== before.dev || after.ino !== before.ino || after.size !== before.size
            || after.mtimeMs !== before.mtimeMs || after.ctimeMs !== before.ctimeMs || after.nlink !== 1) {
            throw Object.assign(new Error('Changed MOD control file'), { code: 'MOD_CONTROL_FILE_CHANGED' });
        }
        return bytes;
    } finally { await handle.close(); }
}

async function writeExclusive(filename: string, bytes: string): Promise<void> {
    const handle = await fs.open(filename, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | (constants.O_NOFOLLOW ?? 0), 0o600);
    try { await handle.writeFile(bytes, 'utf8'); await handle.sync(); }
    finally { await handle.close(); }
}

function parseTransaction(bytes: Uint8Array): ControlTransaction {
    let value: unknown;
    try { value = JSON.parse(Buffer.from(bytes).toString('utf8')); } catch { value = undefined; }
    if (!isPlainObject(value) || value.format !== TRANSACTION_FORMAT || typeof value.id !== 'string'
        || !/^[0-9a-f-]{36}$/i.test(value.id) || typeof value.profileHash !== 'string' || typeof value.lockHash !== 'string'
        || !(value.oldProfileHash === null || typeof value.oldProfileHash === 'string')
        || !(value.oldLockHash === null || typeof value.oldLockHash === 'string')) {
        throw Object.assign(new Error('Invalid MOD control transaction'), { code: 'MOD_CONTROL_TRANSACTION_INVALID' });
    }
    return value as unknown as ControlTransaction;
}

async function fileHash(filename: string, maximum: number): Promise<string | undefined> {
    const bytes = await readOrdinary(filename, maximum);
    return bytes ? sha(bytes) : undefined;
}

async function finishControlTransaction(workspaceRoot: string, transaction: ControlTransaction): Promise<void> {
    const controlRoot = path.join(workspaceRoot, '.text-adventure');
    const stagingRoot = path.join(controlRoot, CONTROL_STAGING_DIR);
    const transactionRoot = path.join(stagingRoot, transaction.id);
    await ordinaryDirectory(workspaceRoot);
    await ordinaryDirectory(controlRoot);
    await ordinaryDirectory(stagingRoot);
    await ordinaryDirectory(transactionRoot);
    const profilePath = path.join(controlRoot, MOD_PROFILE_FILE);
    const lockPath = path.join(controlRoot, MOD_LOCK_FILE);
    const stagedProfile = path.join(transactionRoot, MOD_PROFILE_FILE);
    const stagedLock = path.join(transactionRoot, MOD_LOCK_FILE);
    const oldProfile = path.join(transactionRoot, `${MOD_PROFILE_FILE}.old`);
    const oldLock = path.join(transactionRoot, `${MOD_LOCK_FILE}.old`);

    const publish = async (finalPath: string, stagedPath: string, oldPath: string, expected: string, oldExpected: string | null, maximum: number) => {
        const finalHash = await fileHash(finalPath, maximum);
        if (finalHash === expected) return;
        if (finalHash !== undefined) {
            if (oldExpected === null || finalHash !== oldExpected) throw Object.assign(new Error('MOD controls changed'), { code: 'MOD_CONTROL_CONCURRENT_CHANGE' });
            const savedHash = await fileHash(oldPath, maximum);
            if (savedHash !== undefined) throw Object.assign(new Error('MOD backup already exists'), { code: 'MOD_CONTROL_TRANSACTION_INVALID' });
            await fs.rename(finalPath, oldPath);
        }
        if (await fileHash(stagedPath, maximum) !== expected) throw Object.assign(new Error('Staged MOD control changed'), { code: 'MOD_CONTROL_TRANSACTION_INVALID' });
        await fs.rename(stagedPath, finalPath);
        if (await fileHash(finalPath, maximum) !== expected) throw Object.assign(new Error('Published MOD control changed'), { code: 'MOD_CONTROL_COMMIT_FAILED' });
    };
    await publish(profilePath, stagedProfile, oldProfile, transaction.profileHash, transaction.oldProfileHash, 256 * 1024);
    await publish(lockPath, stagedLock, oldLock, transaction.lockHash, transaction.oldLockHash, 8 * 1024 * 1024);
    const profileBytes = await readOrdinary(profilePath, 256 * 1024);
    const lockBytes = await readOrdinary(lockPath, 8 * 1024 * 1024);
    const profile = profileBytes && parseModProfileBytes(profileBytes);
    const lock = lockBytes && parseModLockBytes(lockBytes);
    if (!profile?.ok || !lock?.ok || computeModProfileHash(profile.value) !== lock.value.profileHash
        || lockAggregateHash(lock.value) !== lock.value.aggregateHash) {
        throw Object.assign(new Error('Committed MOD controls failed validation'), { code: 'MOD_CONTROL_COMMIT_FAILED' });
    }
    await fs.unlink(path.join(controlRoot, CONTROL_TRANSACTION_FILE));
    for (const filename of [oldProfile, oldLock]) await fs.unlink(filename).catch(error => {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    });
    await fs.rmdir(transactionRoot);
    await fs.rmdir(stagingRoot).catch(error => { if ((error as NodeJS.ErrnoException).code !== 'ENOTEMPTY') throw error; });
}

/** Complete a journaled profile/lock pair before any activation-gate read. */
export async function recoverPendingModControlCommit(workspaceRoot: string): Promise<void> {
    const journal = path.join(workspaceRoot, '.text-adventure', CONTROL_TRANSACTION_FILE);
    const bytes = await readOrdinary(journal, 4096);
    if (!bytes) return;
    await finishControlTransaction(workspaceRoot, parseTransaction(bytes));
}

/** Journaled two-file commit for an empty campaign; interruption is completed on the next gate open. */
export async function commitModControlPair(workspaceRoot: string, profileJson: string, lockJson: string): Promise<void> {
    const parsedProfile = parseModProfileBytes(Buffer.from(profileJson));
    const parsedLock = parseModLockBytes(Buffer.from(lockJson));
    if (!parsedProfile.ok || !parsedLock.ok || serializeModProfile(parsedProfile.value) !== profileJson
        || serializeModLock(parsedLock.value) !== lockJson || computeModProfileHash(parsedProfile.value) !== parsedLock.value.profileHash) {
        throw Object.assign(new Error('Invalid MOD control pair'), { code: 'MOD_CONTROL_PAIR_INVALID' });
    }
    const expectedAggregate = lockAggregateHash(parsedLock.value);
    if (expectedAggregate !== parsedLock.value.aggregateHash) throw Object.assign(new Error('Invalid MOD lock hash'), { code: 'MOD_CONTROL_PAIR_INVALID' });
    await ordinaryDirectory(workspaceRoot);
    const controlRoot = path.join(workspaceRoot, '.text-adventure');
    await ordinaryDirectory(controlRoot, true);
    await recoverPendingModControlCommit(workspaceRoot);
    const oldProfileBytes = await readOrdinary(path.join(controlRoot, MOD_PROFILE_FILE), 256 * 1024);
    const oldLockBytes = await readOrdinary(path.join(controlRoot, MOD_LOCK_FILE), 8 * 1024 * 1024);
    if (!!oldProfileBytes !== !!oldLockBytes) throw Object.assign(new Error('Partial MOD controls'), { code: 'MOD_CONTROL_PAIR_REQUIRED' });
    const id = randomUUID();
    const stagingRoot = path.join(controlRoot, CONTROL_STAGING_DIR);
    await ordinaryDirectory(stagingRoot, true);
    const transactionRoot = path.join(stagingRoot, id);
    await fs.mkdir(transactionRoot, { mode: 0o700 });
    await ordinaryDirectory(transactionRoot);
    await writeExclusive(path.join(transactionRoot, MOD_PROFILE_FILE), profileJson);
    await writeExclusive(path.join(transactionRoot, MOD_LOCK_FILE), lockJson);
    const transaction: ControlTransaction = {
        format: TRANSACTION_FORMAT,
        id,
        profileHash: sha(profileJson),
        lockHash: sha(lockJson),
        oldProfileHash: oldProfileBytes ? sha(oldProfileBytes) : null,
        oldLockHash: oldLockBytes ? sha(oldLockBytes) : null,
    };
    await writeExclusive(path.join(controlRoot, CONTROL_TRANSACTION_FILE), `${JSON.stringify(transaction)}\n`);
    await finishControlTransaction(workspaceRoot, transaction);
}

async function campaignEligibility(workspaceRoot: string): Promise<{ empty: boolean; reason?: string }> {
    try {
        await ordinaryDirectory(workspaceRoot);
        const rootEntries = await fs.readdir(workspaceRoot, { withFileTypes: true });
        for (const entry of rootEntries) {
            if (!['.text-adventure', '.vscode'].includes(entry.name) || !entry.isDirectory() || entry.isSymbolicLink()) {
                return { empty: false, reason: 'MOD_MANAGER_CAMPAIGN_FORK_REQUIRED' };
            }
        }
        const controlRoot = path.join(workspaceRoot, '.text-adventure');
        try { await ordinaryDirectory(controlRoot); }
        catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { empty: true }; throw error; }
        const allowed = new Set([
            'mods', 'mod-staging', 'mod-validation-reports', CONTROL_STAGING_DIR, CONTROL_TRANSACTION_FILE,
            MOD_PROFILE_FILE, MOD_LOCK_FILE,
        ]);
        const entries = await fs.readdir(controlRoot, { withFileTypes: true });
        if (entries.some(entry => !allowed.has(entry.name) || entry.isSymbolicLink())) {
            return { empty: false, reason: 'MOD_MANAGER_CAMPAIGN_FORK_REQUIRED' };
        }
        const profile = await readOrdinary(path.join(controlRoot, MOD_PROFILE_FILE), 256 * 1024);
        const lock = await readOrdinary(path.join(controlRoot, MOD_LOCK_FILE), 8 * 1024 * 1024);
        if (!!profile !== !!lock) return { empty: false, reason: 'MOD_CONTROL_PAIR_REQUIRED' };
        return { empty: true };
    } catch (error) {
        return { empty: false, reason: typeof (error as { code?: unknown }).code === 'string' ? String((error as { code?: unknown }).code) : 'MOD_MANAGER_CAMPAIGN_INSPECTION_FAILED' };
    }
}

function safeCode(error: unknown): string {
    const code = (error as { code?: unknown })?.code;
    return typeof code === 'string' && /^[A-Z0-9_]+$/.test(code) ? code : 'MOD_MANAGER_OPERATION_FAILED';
}

export function createModManagerHost(deps: ModManagerHostDeps): ModManagerHost {
    const drafts = new Map<string, ModProfile>();
    const previews = new Map<string, { profileJson: string; lockJson: string; lock: ModLock }>();
    const authorizations = new Map<string, Map<string, ModInstalledReadAuthorization>>();
    const workspaceKey = (root: string) => path.resolve(root).toLowerCase();
    const roots = (workspaceRoot: string): ModDiscoveryRoots => ({ workspaceRoot, globalStorageRoot: deps.context.globalStorageUri.fsPath });
    const sessionMap = (workspaceRoot: string) => {
        const key = workspaceKey(workspaceRoot);
        let map = authorizations.get(key);
        if (!map) { map = new Map(); authorizations.set(key, map); }
        return map;
    };
    const approvals = (workspaceRoot: string): ModAdultApproval[] => [...sessionMap(workspaceRoot).values()].map(item => ({
        id: item.id, version: item.version, manifestHash: item.manifestHash, contentHash: item.contentHash,
    }));
    const post = (message: unknown) => { void deps.getPanel()?.webview.postMessage(message); };
    const notice = (code: string) => post({ type: 'modManagerNotice', code });
    const evaluate = async (workspaceRoot: string): Promise<ModActivationGateResult> => evaluateModActivationGate({
        ...roots(workspaceRoot),
        workspaceRoot,
        currentLoreRelayVersion: deps.currentLoreRelayVersion(),
        adultSessionAllowed: approvals(workspaceRoot).length > 0,
        adultSessionApprovals: approvals(workspaceRoot),
    });
    const discoveryFor = async (workspaceRoot: string) => discoverModPackageManifests(roots(workspaceRoot));

    const sendState = async (workspaceRoot: string, code?: string): Promise<void> => {
        await recoverPendingModControlCommit(workspaceRoot);
        const activation = await evaluate(workspaceRoot);
        const discovery = await discoveryFor(workspaceRoot);
        const visible = deps.context.globalState.get<boolean>(ADULT_VISIBILITY_KEY, false);
        const hiddenAdultIds = hiddenAdultModIds(activation, discovery);
        const installed = discovery.manifests.filter(item => visible || item.manifest.contentRating !== 'adult');
        const key = workspaceKey(workspaceRoot);
        if (!drafts.has(key)) drafts.set(key, cloneProfile(activation.profile ?? emptyProfile()));
        const draft = drafts.get(key)!;
        const eligibility = await campaignEligibility(workspaceRoot);
        const session = sessionMap(workspaceRoot);
        const packages = installed.map(item => ({
            id: item.manifest.id,
            version: item.manifest.version,
            source: item.source,
            name: item.manifest.name,
            contentRating: item.manifest.contentRating,
            capabilities: [...item.manifest.capabilities],
            compatible: isLoreRelayVersionCompatible(item.manifest, deps.currentLoreRelayVersion()),
            dependencies: item.manifest.dependencies.map(dep => ({ id: dep.id, version: dep.version })),
            conflicts: item.manifest.conflicts.map(conflict => ({ id: conflict.id, version: conflict.version })),
            enabled: draft.enabled.some(enabled => enabled.id === item.manifest.id && enabled.version === `=${item.manifest.version}` && (enabled.source === 'any' || enabled.source === item.source)),
            sessionAuthorized: session.has(authorizationKey({ source: item.source, id: item.manifest.id, version: item.manifest.version })),
        })).sort((a, b) => a.id.localeCompare(b.id) || b.version.localeCompare(a.version) || a.source.localeCompare(b.source));
        const blockerCodes = activation.decision.blockers.map(item => ({
            code: item.code,
            ...visibleModId(item.modId, visible, hiddenAdultIds),
        }));
        const preview = previews.get(key);
        post({
            type: 'modManagerState',
            adultVisible: visible,
            campaignEmpty: eligibility.empty,
            campaignReason: eligibility.reason ?? null,
            safeMode: activation.decision.mode === 'safe-required',
            blockers: blockerCodes,
            discoveryDiagnostics: discovery.diagnostics.map(item => ({
                code: item.code,
                ...visibleModId(item.packageId, visible, hiddenAdultIds),
                source: item.source,
            })),
            packages,
            preview: preview ? {
                ok: true,
                fingerprint: preview.lock.aggregateHash,
                packages: preview.lock.packages.filter(pkg => visible || pkg.contentRating !== 'adult').map(pkg => ({ id: pkg.id, version: pkg.version, source: pkg.source })),
            } : null,
            canCommit: eligibility.empty && !!preview,
            ...(code ? { notice: code } : {}),
        });
    };

    const findManifest = async (workspaceRoot: string, message: ModManagerMessage): Promise<DiscoveredModManifest | undefined> => {
        if (typeof message.id !== 'string' || typeof message.version !== 'string' || !['global', 'workspace'].includes(String(message.source))) return undefined;
        const discovery = await discoveryFor(workspaceRoot);
        return discovery.manifests.find(item => item.manifest.id === message.id && item.manifest.version === message.version && item.source === message.source);
    };

    const authorizeAdult = async (workspaceRoot: string, manifest: DiscoveredModManifest): Promise<ModInstalledReadAuthorization | undefined> => {
        if (!deps.context.globalState.get<boolean>(ADULT_VISIBILITY_KEY, false) || manifest.manifest.contentRating !== 'adult') return undefined;
        const confirm = t('webview.modManager.confirmAdultSession', { id: manifest.manifest.id, version: manifest.manifest.version });
        const label = t('webview.modManager.confirm');
        if (await vscode.window.showWarningMessage(confirm, { modal: true }, label) !== label) return undefined;
        const result = await authorizeInstalledModPackageRead({
            ...roots(workspaceRoot), source: manifest.source, id: manifest.manifest.id,
            version: manifest.manifest.version, expectedManifestHash: manifest.manifestHash,
        });
        if (!result.ok) { notice(result.code); return undefined; }
        sessionMap(workspaceRoot).set(authorizationKey(result.authorization), result.authorization);
        return result.authorization;
    };

    const host: ModManagerHost = {
        handles: type => MANAGER_MESSAGES.has(type),
        adultSessionApprovals: workspaceRoot => approvals(workspaceRoot),
        recoverCurrentWorkspace: async () => {
            const workspaceRoot = deps.getWorkspacePath();
            if (workspaceRoot) await recoverPendingModControlCommit(workspaceRoot);
        },
        handleMessage: async message => {
            if (!MANAGER_MESSAGES.has(message.type)) return false;
            const workspaceRoot = deps.getWorkspacePath();
            if (!workspaceRoot) { notice('MOD_MANAGER_WORKSPACE_REQUIRED'); return true; }
            const key = workspaceKey(workspaceRoot);
            try {
                if (message.type === 'requestModManagerState') await sendState(workspaceRoot);
                else if (message.type === 'setModAdultVisibility') {
                    const visible = message.visible === true;
                    if (visible) {
                        const label = t('webview.modManager.confirm');
                        if (await vscode.window.showWarningMessage(t('webview.modManager.confirmAdultVisibility'), { modal: true }, label) !== label) return true;
                    } else {
                        sessionMap(workspaceRoot).clear();
                        previews.delete(key);
                    }
                    await deps.context.globalState.update(ADULT_VISIBILITY_KEY, visible);
                    await sendState(workspaceRoot);
                } else if (message.type === 'installModPackage') {
                    if (!['folder', 'zip'].includes(String(message.kind)) || !['global', 'workspace'].includes(String(message.destination))) return true;
                    await fs.mkdir(deps.context.globalStorageUri.fsPath, { recursive: true });
                    const kind = message.kind as 'folder' | 'zip';
                    const selected = await vscode.window.showOpenDialog({
                        canSelectMany: false,
                        canSelectFiles: kind === 'zip',
                        canSelectFolders: kind === 'folder',
                        ...(kind === 'zip' ? { filters: { ZIP: ['zip'] } } : {}),
                        title: t(kind === 'zip' ? 'webview.modManager.pickZip' : 'webview.modManager.pickFolder'),
                    });
                    if (!selected?.[0]) return true;
                    const inspection = await inspectLocalModImport({ filename: selected[0].fsPath, kind });
                    let allowAdultContentRead = false;
                    if (inspection.contentRating === 'adult') {
                        if (!deps.context.globalState.get<boolean>(ADULT_VISIBILITY_KEY, false)) { notice('ADULT_METADATA_HIDDEN'); return true; }
                        const label = t('webview.modManager.confirm');
                        if (await vscode.window.showWarningMessage(t('webview.modManager.confirmAdultInstall', { id: inspection.id, version: inspection.version }), { modal: true }, label) !== label) return true;
                        allowAdultContentRead = true;
                    }
                    const result = await installLocalModPackage({
                        ...roots(workspaceRoot), destination: message.destination as ModResolvedSource,
                        inspection, allowAdultContentRead,
                    });
                    if (result.status === 'installed' && result.readAuthorization) {
                        sessionMap(workspaceRoot).set(authorizationKey(result.readAuthorization), result.readAuthorization);
                    }
                    await sendState(workspaceRoot, result.status === 'installed' ? 'MOD_INSTALL_SUCCESS' : result.code);
                } else if (message.type === 'setModEnabled') {
                    const manifest = await findManifest(workspaceRoot, message);
                    if (!manifest || typeof message.enabled !== 'boolean'
                        || (manifest.manifest.contentRating === 'adult' && message.enabled)) return true;
                    const activation = getModActivationGateResult(workspaceRoot) ?? await evaluate(workspaceRoot);
                    if (!drafts.has(key)) drafts.set(key, cloneProfile(activation.profile ?? emptyProfile()));
                    const draft = drafts.get(key)!;
                    draft.enabled = draft.enabled.filter(item => item.id !== manifest.manifest.id);
                    draft.adultContent.approvals = draft.adultContent.approvals.filter(item => item.id !== manifest.manifest.id);
                    if (manifest.manifest.contentRating === 'adult' && draft.adultContent.approvals.length === 0) {
                        draft.adultContent.allow = false;
                    }
                    if (message.enabled === true) draft.enabled.push({ id: manifest.manifest.id, version: `=${manifest.manifest.version}`, source: manifest.source });
                    previews.delete(key);
                    await sendState(workspaceRoot);
                } else if (message.type === 'authorizeAdultMod') {
                    const manifest = await findManifest(workspaceRoot, message);
                    if (!manifest || manifest.manifest.contentRating !== 'adult') return true;
                    const authorization = await authorizeAdult(workspaceRoot, manifest);
                    if (!authorization) return true;
                    const activation = getModActivationGateResult(workspaceRoot) ?? await evaluate(workspaceRoot);
                    if (!drafts.has(key)) drafts.set(key, cloneProfile(activation.profile ?? emptyProfile()));
                    const draft = drafts.get(key)!;
                    const alreadyApproved = draft.adultContent.approvals.some(item => item.id === authorization.id && item.version === authorization.version
                        && item.manifestHash === authorization.manifestHash && item.contentHash === authorization.contentHash);
                    if (!alreadyApproved) {
                        const eligibility = await campaignEligibility(workspaceRoot);
                        if (!eligibility.empty) { await sendState(workspaceRoot, 'MOD_MANAGER_CAMPAIGN_FORK_REQUIRED'); return true; }
                        const label = t('webview.modManager.enableAdult');
                        if (await vscode.window.showWarningMessage(t('webview.modManager.confirmAdultEnable', {
                            id: authorization.id, version: authorization.version,
                        }), { modal: true }, label) !== label) { await sendState(workspaceRoot); return true; }
                        draft.adultContent.allow = true;
                        draft.adultContent.approvals = [...draft.adultContent.approvals.filter(item => item.id !== authorization.id), {
                            id: authorization.id, version: authorization.version,
                            manifestHash: authorization.manifestHash, contentHash: authorization.contentHash,
                        }];
                        draft.enabled = [...draft.enabled.filter(item => item.id !== authorization.id), {
                            id: authorization.id, version: `=${authorization.version}`, source: authorization.source,
                        }];
                        previews.delete(key);
                    }
                    await sendState(workspaceRoot, 'ADULT_SESSION_AUTHORIZED');
                } else if (message.type === 'resolveModProfilePreview') {
                    const activation = getModActivationGateResult(workspaceRoot) ?? await evaluate(workspaceRoot);
                    if (!drafts.has(key)) drafts.set(key, cloneProfile(activation.profile ?? emptyProfile()));
                    const result = await resolveInstalledModProfile({
                        ...roots(workspaceRoot), profile: drafts.get(key)!, loreRelayVersion: deps.currentLoreRelayVersion(),
                        adultReadRequests: [...sessionMap(workspaceRoot).values()],
                    });
                    if (result.ok) {
                        previews.set(key, { profileJson: result.profileJson, lockJson: result.lockJson, lock: result.lock });
                        await sendState(workspaceRoot, 'MOD_RESOLVE_SUCCESS');
                    } else {
                        previews.delete(key);
                        await sendState(workspaceRoot, result.diagnostics[0]?.code ?? 'MOD_RESOLVE_FAILED');
                    }
                } else if (message.type === 'commitModProfile') {
                    const mutation = await deps.mutationGate.run(
                        workspaceRoot,
                        { actionKind: 'mod_profile_commit', requestId: `mod-profile-${randomUUID()}` },
                        async (): Promise<string> => {
                            const preview = previews.get(key);
                            let eligibility = await campaignEligibility(workspaceRoot);
                            if (!preview || !eligibility.empty) return eligibility.reason ?? 'MOD_RESOLVE_PREVIEW_REQUIRED';
                            const rerun = await resolveInstalledModProfile({
                                ...roots(workspaceRoot), profile: drafts.get(key)!, loreRelayVersion: deps.currentLoreRelayVersion(),
                                adultReadRequests: [...sessionMap(workspaceRoot).values()],
                            });
                            if (!rerun.ok || rerun.profileJson !== preview.profileJson || rerun.lockJson !== preview.lockJson) {
                                previews.delete(key);
                                return 'MOD_RESOLVE_PREVIEW_STALE';
                            }
                            eligibility = await campaignEligibility(workspaceRoot);
                            if (!eligibility.empty) return eligibility.reason ?? 'MOD_MANAGER_CAMPAIGN_FORK_REQUIRED';
                            await commitModControlPair(workspaceRoot, preview.profileJson, preview.lockJson);
                            previews.delete(key);
                            return 'MOD_CONTROL_COMMIT_SUCCESS';
                        },
                    );
                    if (mutation.status === 'busy') await sendState(workspaceRoot, mutation.code);
                    else if (mutation.status === 'failed') throw mutation.error;
                    else await sendState(workspaceRoot, mutation.value);
                } else if (message.type === 'exportModDiagnostics') {
                    const activation = await evaluate(workspaceRoot);
                    const visible = deps.context.globalState.get<boolean>(ADULT_VISIBILITY_KEY, false);
                    const discovery = await discoveryFor(workspaceRoot);
                    const adultIds = hiddenAdultModIds(activation, discovery);
                    const report = {
                        format: 'lorerelay-mod-diagnostics/1',
                        safeMode: activation.decision.mode === 'safe-required',
                        blockers: activation.decision.blockers.map(item => ({ code: item.code, ...visibleModId(item.modId, visible, adultIds) })),
                        discovery: discovery.diagnostics.map(item => ({ code: item.code, source: item.source, ...visibleModId(item.packageId, visible, adultIds) })),
                    };
                    await vscode.env.clipboard.writeText(`${JSON.stringify(report, null, 2)}\n`);
                    notice('MOD_DIAGNOSTICS_COPIED');
                }
            } catch (error) { await sendState(workspaceRoot, safeCode(error)).catch(() => notice(safeCode(error))); }
            return true;
        },
    };
    return host;
}
