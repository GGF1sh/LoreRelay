import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { createCommerceActionRuntime } from './commerceActionRuntime';
import { getWorkspacePath, getGameStatePath } from './workspacePaths';
import { isParlorMode, isInWorldMode } from './experience';
import { hashGameActionValue, type GameActionId } from './gameActionService';
import { createPlayerDelegation, createNarratorReader } from './playerDelegationCore';
import { openAgentConnection } from './playerIpcHost';
import type { DeterministicWorkspaceMutationGate } from './deterministicWorkspaceMutationGate';

export function registerPlayerAgent(context: vscode.ExtensionContext, gate: DeterministicWorkspaceMutationGate) {
    const connections = new Map<'player' | 'narrator', Awaited<ReturnType<typeof openAgentConnection>>>();
    const generations = { player: 0, narrator: 0 };
    const output = vscode.window.createOutputChannel('LoreRelay Agent Connection');
    const stop = (role: 'player' | 'narrator') => { generations[role]++; connections.get(role)?.dispose(); connections.delete(role); };
    const stopAll = () => { stop('player'); stop('narrator'); };
    async function start(role: 'player' | 'narrator') {
        const workspace = getWorkspacePath();
        if (!workspace || !getGameStatePath() || !fs.existsSync(getGameStatePath()!) || isParlorMode() || isInWorldMode()) {
            void vscode.window.showWarningMessage('LoreRelay: 通常campaignを開いてください。'); return;
        }
        stop(role);
        const generation = generations[role];
        const runtime = await createCommerceActionRuntime(gate);
        const scope = hashGameActionValue(runtime.scope());
        const current = () => generations[role] === generation && getWorkspacePath() === workspace && runtime.authorized()
            && hashGameActionValue(runtime.scope()) === scope;
        let allowed: GameActionId[] = [];
        let maximum = 10;
        if (role === 'player') {
            const chosen = await vscode.window.showQuickPick([
                { label: 'Shopkeeper trade', action: 'commerce:trade' as const, picked: true },
                { label: 'Market travel', action: 'commerce:travel' as const, picked: true },
                { label: 'End day', action: 'commerce:end_day' as const, picked: true },
            ], { canPickMany: true, title: '外部AIへ委譲するCommerce操作' });
            if (!chosen?.length || !current()) return;
            allowed = chosen.map(item => item.action);
            const count = await vscode.window.showInputBox({ title: '新規execute受付回数（期限30分）', value: '10',
                validateInput: value => /^\d+$/.test(value) && Number(value) >= 1 && Number(value) <= 100 ? undefined : '1〜100の整数を入力してください。' });
            if (count === undefined || !current()) return;
            maximum = Number(count);
        }
        const connection = await openAgentConnection(role, async clientSession => {
            if (!current()) return;
            const label = role === 'player' ? '操作を委譲する' : '公開情報の読取を許可';
            const choice = await vscode.window.showWarningMessage(
                `LoreRelay ${role}\nCampaign: ${workspace}\n接続session: ${clientSession}\n`
                + (role === 'player' ? `許可操作: ${allowed.join(', ')}\n新規execute ${maximum}回・30分。` : '公開済みの確定状態のみ。ゲーム操作は許可しません。'),
                { modal: true }, label);
            if (choice !== label || !current()) return;
            const bindings = { service: runtime.service, scope: runtime.scope, current };
            return role === 'player' ? createPlayerDelegation(bindings, allowed, maximum) : createNarratorReader(bindings);
        });
        if (!current()) { connection.dispose(); return; }
        connections.set(role, connection);
        const config = JSON.stringify({ mcpServers: { [`lorerelay-${role}`]: { command: 'node',
            args: [path.join(context.extensionPath, 'out', role === 'player' ? 'playerMcp.js' : 'narratorMcp.js')],
            env: { LORERELAY_AGENT_ENDPOINT: connection.endpoint, LORERELAY_AGENT_SECRET: connection.secret } } } }, null, 2);
        output.clear(); output.appendLine('この接続専用の設定です。クライアント接続後、Host側でsessionとcampaignを確認してください。');
        output.appendLine(config); output.show(true);
        if (await vscode.window.showInformationMessage('LoreRelay: 接続待機中。MCPクライアントに設定し、Host側の確認へ進んでください。', '設定をコピー') === '設定をコピー') {
            if (current()) await vscode.env.clipboard.writeText(config);
        }
    }
    const startSafely = (role: 'player' | 'narrator') => start(role).catch(() => {
        stop(role); void vscode.window.showWarningMessage('LoreRelay: 接続を開始できません。campaignの状態を確認してください。');
    });
    context.subscriptions.push(output, { dispose: stopAll },
        vscode.workspace.onDidChangeWorkspaceFolders(stopAll),
        vscode.workspace.onDidChangeConfiguration(event => { if (event.affectsConfiguration('textAdventure.workspaceFolder')) stopAll(); }),
        vscode.commands.registerCommand('textadventure.startPlayerAgent', () => startSafely('player')),
        vscode.commands.registerCommand('textadventure.stopPlayerAgent', () => { stop('player'); void vscode.window.showInformationMessage('LoreRelay: 操作委譲を停止しました。開始済みの処理は取り消しません。'); }),
        vscode.commands.registerCommand('textadventure.startNarrator', () => startSafely('narrator')),
        vscode.commands.registerCommand('textadventure.stopNarrator', () => stop('narrator')));
}
