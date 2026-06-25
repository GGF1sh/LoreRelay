import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { getWorkspacePath } from './workspacePaths';
import { getSkillDir } from './imageGenRunner';

export interface MediaManifestDeps {
    getPanel: () => vscode.WebviewPanel | undefined;
}

let deps: MediaManifestDeps | undefined;

export function initMediaManifest(manifestDeps: MediaManifestDeps): void {
    deps = manifestDeps;
}

function requireDeps(): MediaManifestDeps {
    if (!deps) {
        throw new Error('initMediaManifest must be called before using media manifests');
    }
    return deps;
}

interface BgmTrack { id: string; file: string; mood?: string; description?: string; loop?: boolean; volume?: number }
interface SfxItem { id: string; file: string; description?: string; volume?: number }

function getBgmManifestPath(): string | undefined {
    const config = vscode.workspace.getConfiguration('textAdventure');
    const configured = config.get<string>('bgm.manifestPath', '').trim();
    if (configured) { return configured; }
    const ws = getWorkspacePath();
    return ws ? path.join(ws, 'bgm.json') : undefined;
}

function getSfxManifestPath(): string | undefined {
    const config = vscode.workspace.getConfiguration('textAdventure');
    const configured = config.get<string>('sfx.manifestPath', '').trim();
    if (configured) { return configured; }

    const ws = getWorkspacePath();
    if (ws) {
        const wsManifest = path.join(ws, 'sfx.json');
        if (fs.existsSync(wsManifest)) { return wsManifest; }
    }
    const skillDir = getSkillDir();
    if (skillDir) {
        const bundled = path.join(skillDir, 'sfx.json');
        if (fs.existsSync(bundled)) { return bundled; }
    }
    return undefined;
}

/** 音声ファイルパスを解決する（マニフェスト dir → <subfolder>/ → 絶対パス）。 */
function resolveMediaFile(file: string, manifestDir: string, subfolder: string): string | undefined {
    if (!file) { return undefined; }
    const candidates = [
        path.isAbsolute(file) ? file : path.join(manifestDir, file),
        path.join(manifestDir, subfolder, file)
    ];
    for (const c of candidates) {
        if (fs.existsSync(c)) { return c; }
    }
    return undefined;
}

export function sendBgmManifest(): void {
    const panel = requireDeps().getPanel();
    if (!panel) { return; }
    const config = vscode.workspace.getConfiguration('textAdventure');
    const enabled = config.get<boolean>('bgm.enabled', true);
    const defaultVolume = config.get<number>('bgm.volume', 50);

    const manifestPath = getBgmManifestPath();
    let tracks: Array<{ id: string; uri: string; mood?: string; description?: string; loop?: boolean; volume?: number }> = [];

    if (enabled && manifestPath && fs.existsSync(manifestPath)) {
        try {
            const raw = fs.readFileSync(manifestPath, 'utf-8');
            const manifest = JSON.parse(raw);
            const manifestDir = path.dirname(manifestPath);
            const rawTracks: BgmTrack[] = Array.isArray(manifest) ? manifest : (manifest.tracks || []);
            for (const t of rawTracks) {
                if (!t || !t.id || !t.file) { continue; }
                const resolved = resolveMediaFile(t.file, manifestDir, 'bgm');
                if (!resolved) { continue; }
                tracks.push({
                    id: String(t.id),
                    uri: panel.webview.asWebviewUri(vscode.Uri.file(resolved)).toString(),
                    mood: t.mood,
                    description: t.description,
                    loop: t.loop,
                    volume: t.volume
                });
            }
        } catch (e) {
            console.error('Error reading bgm.json:', e);
        }
    }

    panel.webview.postMessage({ type: 'bgmManifest', tracks, defaultVolume, enabled });
}

export function sendSfxManifest(): void {
    const panel = requireDeps().getPanel();
    if (!panel) { return; }
    const config = vscode.workspace.getConfiguration('textAdventure');
    const enabled = config.get<boolean>('sfx.enabled', true);
    const defaultVolume = config.get<number>('sfx.volume', 70);

    const manifestPath = getSfxManifestPath();
    const sounds: Array<{ id: string; uri: string; description?: string; volume?: number }> = [];

    if (enabled && manifestPath && fs.existsSync(manifestPath)) {
        try {
            const raw = fs.readFileSync(manifestPath, 'utf-8');
            const manifest = JSON.parse(raw);
            const manifestDir = path.dirname(manifestPath);
            const rawSounds: SfxItem[] = Array.isArray(manifest) ? manifest : (manifest.sounds || []);
            for (const s of rawSounds) {
                if (!s || !s.id || !s.file) { continue; }
                const resolved = resolveMediaFile(s.file, manifestDir, 'sfx');
                if (!resolved) { continue; }
                sounds.push({
                    id: String(s.id),
                    uri: panel.webview.asWebviewUri(vscode.Uri.file(resolved)).toString(),
                    description: s.description,
                    volume: s.volume
                });
            }
        } catch (e) {
            console.error('Error reading sfx.json:', e);
        }
    }

    panel.webview.postMessage({ type: 'sfxManifest', sounds, defaultVolume, enabled });
}

export function startMediaManifestWatchers(context: vscode.ExtensionContext): {
    bgmWatcher: vscode.FileSystemWatcher;
    sfxWatcher: vscode.FileSystemWatcher;
} {
    sendBgmManifest();
    const bgmWatcher = vscode.workspace.createFileSystemWatcher('**/bgm.json');
    bgmWatcher.onDidChange(() => sendBgmManifest());
    bgmWatcher.onDidCreate(() => sendBgmManifest());
    bgmWatcher.onDidDelete(() => sendBgmManifest());
    context.subscriptions.push(bgmWatcher);

    sendSfxManifest();
    const sfxWatcher = vscode.workspace.createFileSystemWatcher('**/sfx.json');
    sfxWatcher.onDidChange(() => sendSfxManifest());
    sfxWatcher.onDidCreate(() => sendSfxManifest());
    sfxWatcher.onDidDelete(() => sendSfxManifest());
    context.subscriptions.push(sfxWatcher);

    return { bgmWatcher, sfxWatcher };
}