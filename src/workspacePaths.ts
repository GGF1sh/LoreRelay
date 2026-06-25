import * as vscode from 'vscode';
import * as path from 'path';
import type { GmProvider } from './archivePrompt';

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
        provider === 'openrouter'
    ) {
        return provider;
    }
    if (!config.get<boolean>('grokBridge.enabled', true)) {
        return 'clipboard';
    }
    return 'grok';
}