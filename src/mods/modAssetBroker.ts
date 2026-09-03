import * as vscode from 'vscode';
import { createHash, randomBytes } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { getActiveModAsset, getActiveModContributions } from './modActivationGateHost';

const scheme = 'lorerelay-mod-asset';
interface Grant { workspaceRoot: string; id: string; fingerprint: string }
interface PanelGrant { root: vscode.Uri; workspaceRoot: string; fingerprint: string; revoked: boolean; paths: Set<string>; timer?: ReturnType<typeof setInterval> }
const grants = new Map<string, Grant>();
const panels = new Map<vscode.WebviewPanel, PanelGrant>();

/** Legacy media manifests cannot serve as a raw-path fallback into installed/inactive MODs. */
export function isLegacyMediaOutsideModPackages(filename: string): boolean {
    try {
        const real = fs.realpathSync(filename), stat = fs.statSync(real);
        if (!stat.isFile() || stat.nlink !== 1) return false;
        let directory = path.dirname(real);
        for (let depth = 0; depth < 64; depth++) {
            const parent = path.dirname(directory), name = path.basename(directory).toLowerCase(), parentName = path.basename(parent).toLowerCase();
            if (fs.existsSync(path.join(directory, 'lorerelay.mod.json')) || (name === 'mods' && parentName === '.text-adventure') || (name === 'packages' && parentName === 'mods')) return false;
            if (parent === directory) return true;
            directory = parent;
        }
    } catch { /* Unknown containment is not legacy authorization. */ }
    return false;
}

function read(uri: vscode.Uri): Uint8Array {
    if (uri.scheme !== scheme || uri.authority || uri.query || uri.fragment) throw vscode.FileSystemError.FileNotFound();
    const grant = grants.get(uri.path);
    const asset = grant && getActiveModAsset(grant.workspaceRoot, grant.id);
    if (!grant || !asset || asset.lockFingerprint !== grant.fingerprint) throw vscode.FileSystemError.FileNotFound();
    return asset.bytes;
}

function size(uri: vscode.Uri): number {
    if (uri.scheme !== scheme || uri.authority || uri.query || uri.fragment) throw vscode.FileSystemError.FileNotFound();
    const grant = grants.get(uri.path), registry = grant && getActiveModContributions(grant.workspaceRoot);
    const asset = registry?.assets.find(item => item.id === grant?.id);
    if (!asset || !grant || registry?.lockFingerprint !== grant.fingerprint) throw vscode.FileSystemError.FileNotFound();
    return asset.value.byteLength;
}

/** Read-only virtual files: no disk paths, directory listing, imports, writes or caller-provided URI. */
export function registerModAssetBroker(): vscode.Disposable {
    const events = new vscode.EventEmitter<vscode.FileChangeEvent[]>();
    const deny = (): never => { throw vscode.FileSystemError.NoPermissions(); };
    const provider: vscode.FileSystemProvider = {
        onDidChangeFile: events.event,
        watch: () => new vscode.Disposable(() => undefined),
        stat: uri => ({ type: vscode.FileType.File, ctime: 0, mtime: 0, size: size(uri), permissions: vscode.FilePermission.Readonly }),
        readFile: read,
        readDirectory: deny, createDirectory: deny, writeFile: deny, delete: deny, rename: deny,
    };
    const registration = vscode.workspace.registerFileSystemProvider(scheme, provider, { isReadonly: true, isCaseSensitive: true });
    return vscode.Disposable.from(registration, events, new vscode.Disposable(() => {
        for (const state of panels.values()) if (state.timer) clearInterval(state.timer);
        grants.clear(); panels.clear();
    }));
}

/** A panel gets only its opaque session root, not either installed MOD package root. */
export function attachModAssetBroker(panel: vscode.WebviewPanel, workspaceRoot: string, onRevoked: () => void): void {
    if (panels.has(panel)) return;
    const registry = getActiveModContributions(workspaceRoot);
    if (!registry) return;
    const state: PanelGrant = { root: vscode.Uri.from({ scheme, path: `/${randomBytes(24).toString('hex')}` }), workspaceRoot, fingerprint: registry.lockFingerprint, revoked: false, paths: new Set() };
    panels.set(panel, state);
    panel.webview.options = { ...panel.webview.options, localResourceRoots: [...(panel.webview.options.localResourceRoots ?? []), state.root] };
    const revoke = (): void => { for (const key of state.paths) grants.delete(key); state.paths.clear(); state.revoked = true; };
    // Already-rendered resources are removed too. Reads themselves do not wait for this presentation refresh.
    const timer = setInterval(() => {
        if (!state.revoked && getActiveModContributions(workspaceRoot)?.lockFingerprint !== state.fingerprint) {
            revoke(); onRevoked();
        }
    }, 1000);
    state.timer = timer;
    timer.unref();
    panel.onDidDispose(() => { clearInterval(timer); revoke(); panels.delete(panel); });
}

/** Resolve one canonical ID; metadata/paths supplied by webview or MODs cannot grant access. */
export function resolveModAssetForWebview(panel: vscode.WebviewPanel, workspaceRoot: string, id: string): string | undefined {
    const state = panels.get(panel), registry = getActiveModContributions(workspaceRoot);
    if (!state || state.revoked || state.workspaceRoot !== workspaceRoot || state.fingerprint !== registry?.lockFingerprint) return undefined;
    const asset = registry.assets.find(item => item.id === id);
    if (!asset) return undefined;
    const extensions: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'audio/mpeg': 'mp3', 'audio/ogg': 'ogg', 'audio/wav': 'wav' };
    const key = `${state.root.path}/${createHash('sha256').update(id).digest('hex')}.${extensions[asset.value.mediaType]}`;
    grants.set(key, { workspaceRoot, id, fingerprint: registry.lockFingerprint }); state.paths.add(key);
    return panel.webview.asWebviewUri(vscode.Uri.from({ scheme, path: key })).toString();
}
