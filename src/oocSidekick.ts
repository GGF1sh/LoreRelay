import * as vscode from 'vscode';
import { generateText } from './llmClient';
import { getGameEntryHistory } from './gameStateSync';

let getPanel: () => vscode.WebviewPanel | undefined;

export function initOocSidekick(panelProvider: () => vscode.WebviewPanel | undefined): void {
    getPanel = panelProvider;
}

export async function generateOocCommentary(): Promise<void> {
    const config = vscode.workspace.getConfiguration('textAdventure');
    // We default to true if setting is not present
    if (!config.get<boolean>('oocSidekick.enabled', true)) {
        return;
    }

    const panel = getPanel?.();
    if (!panel) return;

    // Get the last player action and GM response from history
    const history = getGameEntryHistory();
    if (history.length < 2) return;

    // A simple heuristic: take the last 2 entries
    const recent = history.slice(-3).map(e => `[${e.role}]: ${e.content}`).join('\n\n');

    const sys = `You are the OOC (Out of Character) Sidekick. You are observing a tabletop RPG session.
Your job is to provide a brief, funny, or insightful meta-commentary on the most recent turn.
Act like a fellow player or a witty spectator. Limit your response to 1 or 2 short sentences.
Do NOT narrate the story or act as the GM. Output only your commentary.`;

    const user = `Recent turn:\n${recent}`;

    const response = await generateText(sys, user, { temperature: 0.9, maxTokens: 80 });
    
    if (response) {
        panel.webview.postMessage({
            type: 'oocMessage',
            text: response.trim()
        });
    }
}
