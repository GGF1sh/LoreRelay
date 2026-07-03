import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import type { GmProvider } from './archivePrompt';

const RENAME_RETRY_ATTEMPTS = 5;
const RENAME_RETRY_BASE_MS = 12;

function renameWithRetrySync(tmp: string, filePath: string): void {
    let lastError: unknown;
    for (let attempt = 0; attempt < RENAME_RETRY_ATTEMPTS; attempt++) {
        try {
            fs.renameSync(tmp, filePath);
            return;
        } catch (e) {
            lastError = e;
            if (attempt + 1 >= RENAME_RETRY_ATTEMPTS) {
                break;
            }
            const deadline = Date.now() + RENAME_RETRY_BASE_MS * (attempt + 1);
            while (Date.now() < deadline) {
                // brief spin for Windows EPERM / transient locks
            }
        }
    }
    try {
        if (fs.existsSync(tmp)) {
            fs.unlinkSync(tmp);
        }
    } catch {
        // ignore cleanup failure
    }
    throw lastError;
}

export function writeJsonAtomic(filePath: string, data: unknown, createBackup = false): void {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
    if (createBackup && fs.existsSync(filePath)) {
        try {
            fs.copyFileSync(filePath, `${filePath}.bak`);
        } catch {
            // ignore backup failure to not block write
        }
    }
    const tmp = `${filePath}.${process.pid}.${Date.now()}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf-8');
    renameWithRetrySync(tmp, filePath);
}

export async function writeJsonAtomicAsync(
    filePath: string,
    data: unknown,
    createBackup = false
): Promise<void> {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
    if (createBackup && fs.existsSync(filePath)) {
        try {
            await fs.promises.copyFile(filePath, `${filePath}.bak`);
        } catch {
            // ignore backup failure
        }
    }
    const tmp = `${filePath}.${process.pid}.${Date.now()}.tmp`;
    const json = JSON.stringify(data, null, 2);
    await fs.promises.writeFile(tmp, json, 'utf-8');
    let lastError: unknown;
    for (let attempt = 0; attempt < RENAME_RETRY_ATTEMPTS; attempt++) {
        try {
            await fs.promises.rename(tmp, filePath);
            return;
        } catch (e) {
            lastError = e;
            if (attempt + 1 < RENAME_RETRY_ATTEMPTS) {
                await new Promise((resolve) => setTimeout(resolve, RENAME_RETRY_BASE_MS * (attempt + 1)));
            }
        }
    }
    try {
        await fs.promises.unlink(tmp);
    } catch {
        // ignore
    }
    throw lastError;
}

/** マルチルート時は textAdventure.workspaceFolder で名前指定、未設定なら先頭フォルダ。 */
export function getActiveWorkspaceFolder(): vscode.WorkspaceFolder | undefined {
    const folders = vscode.workspace.workspaceFolders;
    if (!folders || folders.length === 0) {
        return undefined;
    }
    if (folders.length === 1) {
        return folders[0];
    }
    const config = vscode.workspace.getConfiguration('textAdventure');
    const hint = config.get<string>('workspaceFolder', '').trim();
    if (hint) {
        const match = folders.find(
            f => f.name === hint || f.uri.fsPath === hint || f.uri.fsPath.endsWith(hint)
        );
        if (match) {
            return match;
        }
        console.warn(`textAdventure.workspaceFolder "${hint}" not found; using first folder.`);
    }
    return folders[0];
}

export function getWorkspacePath(): string | undefined {
    return getActiveWorkspaceFolder()?.uri.fsPath;
}

export function getGameStatePath(): string | undefined {
    const folder = getActiveWorkspaceFolder();
    return folder ? path.join(folder.uri.fsPath, 'game_state.json') : undefined;
}

export function getHistoryPath(): string | undefined {
    const ws = getWorkspacePath();
    return ws ? path.join(ws, 'game_history.json') : undefined;
}

export function getGmProvider(): GmProvider {
    const config = vscode.workspace.getConfiguration('textAdventure');
    const provider = config.get<string>('gmBridge.provider', '').trim();
    if (
        provider === 'grok' ||
        provider === 'clipboard' ||
        provider === 'command' ||
        provider === 'ollama' ||
        provider === 'koboldcpp' ||
        provider === 'openrouter' ||
        provider === 'vscode-lm'
    ) {
        return provider;
    }
    if (!config.get<boolean>('grokBridge.enabled', true)) {
        return 'clipboard';
    }
    return 'grok';
}