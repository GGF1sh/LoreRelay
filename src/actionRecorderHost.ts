import * as vscode from 'vscode';
import * as fs from 'fs';
import { getWorkspacePath, getGameStatePath } from './workspacePaths';
import { isParlorMode, isInWorldMode } from './experience';
import { observeGameActionResults } from './gameActionService';
import { createActionRecorder } from './actionRecorderCore';

export function registerActionRecorder(context: vscode.ExtensionContext) {
    let subscription: { dispose(): void } | undefined;
    let workspace: string | undefined;
    const status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 10);
    status.command = 'textadventure.stopActionRecording';
    const stop = () => { subscription?.dispose(); subscription = undefined; recorder.stop(); status.hide(); };
    const recorder = createActionRecorder(() => {
        stop(); void vscode.window.showInformationMessage('LoreRelay: 100操作に達したため録画を停止しました。テンプレートを出力できます。');
    });
    context.subscriptions.push(status, { dispose: stop },
        vscode.workspace.onDidChangeWorkspaceFolders(stop),
        vscode.workspace.onDidChangeConfiguration(event => { if (event.affectsConfiguration('textAdventure.workspaceFolder')) stop(); }),
        vscode.commands.registerCommand('textadventure.startActionRecording', () => {
            const target = getWorkspacePath();
            const game = getGameStatePath();
            if (!target || !game || !fs.existsSync(game) || isParlorMode() || isInWorldMode()) {
                void vscode.window.showWarningMessage('LoreRelay: 通常campaignを開いてから録画を開始してください。'); return;
            }
            stop(); workspace = target; recorder.start();
            subscription = observeGameActionResults(value => {
                if (getWorkspacePath() !== workspace) { stop(); return; }
                if (value.workspaceId !== workspace) return;
                recorder.observe(value);
                status.text = `$(record) LoreRelay ${recorder.status().count}/100`;
            });
            status.text = '$(record) LoreRelay 0/100'; status.tooltip = 'Commerce操作を録画中。クリックで停止'; status.show();
            void vscode.window.showInformationMessage('LoreRelay: Commerce操作の録画を開始しました。');
        }),
        vscode.commands.registerCommand('textadventure.stopActionRecording', () => {
            stop(); void vscode.window.showInformationMessage(`LoreRelay: 録画停止（${recorder.status().count}操作）。`);
        }),
        vscode.commands.registerCommand('textadventure.exportActionRecording', async () => {
            stop();
            if (!recorder.status().count) { void vscode.window.showInformationMessage('LoreRelay: 録画した操作はありません。'); return; }
            const template = recorder.template();
            const destination = await vscode.window.showSaveDialog({
                title: 'Commerce録画テンプレートを出力（fixture登録までは実行不可）',
                filters: { JSON: ['json'] }, saveLabel: 'テンプレートを出力',
            });
            if (!destination) return;
            await vscode.workspace.fs.writeFile(destination, Buffer.from(JSON.stringify(template, null, 2) + '\n'));
            void vscode.window.showInformationMessage('LoreRelay: テンプレートを出力しました。参照の解決とfixture catalogへの明示登録が必要です。');
        }));
}
