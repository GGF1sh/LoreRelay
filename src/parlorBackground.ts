import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { getWorkspacePath } from './workspacePaths';
import {
    PARLOR_BACKGROUNDS_DIR,
    ParlorBackgroundEntry,
    listParlorBackgroundEntries,
} from './parlorBackgroundCore';

export function getParlorBackgroundsDir(): string | undefined {
    const ws = getWorkspacePath();
    if (!ws) {
        return undefined;
    }
    const dir = path.join(ws, PARLOR_BACKGROUNDS_DIR);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
    return dir;
}

export function listWorkspaceParlorBackgrounds(): ParlorBackgroundEntry[] {
    const dir = getParlorBackgroundsDir();
    if (!dir) {
        return [];
    }
    try {
        const names = fs.readdirSync(dir).filter((n) => fs.statSync(path.join(dir, n)).isFile());
        return listParlorBackgroundEntries(names);
    } catch {
        return [];
    }
}

export function resolveParlorBackgroundPath(filename: string): string | undefined {
    const dir = getParlorBackgroundsDir();
    if (!dir) {
        return undefined;
    }
    const base = path.resolve(dir);
    const resolved = path.resolve(base, filename);
    if (!resolved.startsWith(base + path.sep)) {
        return undefined;
    }
    if (!fs.existsSync(resolved)) {
        return undefined;
    }
    return resolved;
}

export function toParlorBackgroundWebviewUri(
    panel: vscode.WebviewPanel,
    filename: string
): string | undefined {
    const abs = resolveParlorBackgroundPath(filename);
    if (!abs) {
        return undefined;
    }
    return panel.webview.asWebviewUri(vscode.Uri.file(abs)).toString();
}