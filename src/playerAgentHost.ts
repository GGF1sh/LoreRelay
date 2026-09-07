import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { createCommerceActionRuntime } from './commerceActionRuntime';
import { getWorkspacePath, getGameStatePath } from './workspacePaths';
import { isParlorMode, isInWorldMode, onExperienceProfileChanged } from './experience';
import { hashGameActionValue, type GameActionId } from './gameActionService';
import { createPlayerDelegation, createNarratorReader, createCompanionReader, PLAYER_TOOLS } from './playerDelegationCore';
import { openAgentConnection } from './playerIpcHost';
import type { DeterministicWorkspaceMutationGate } from './deterministicWorkspaceMutationGate';
import { buildAiConnectionConfig, type AiConnectionClient } from './aiClientIntegrationCore';

export function registerPlayerAgent(context: vscode.ExtensionContext, gate: DeterministicWorkspaceMutationGate) {
    const connections = new Map<'player' | 'narrator' | 'companion', Awaited<ReturnType<typeof openAgentConnection>>>();
    const generations = { player: 0, narrator: 0, companion: 0 };
    const output = vscode.window.createOutputChannel('LoreRelay Agent Connection');
    const stop = (role: 'player' | 'narrator' | 'companion') => { generations[role]++; connections.get(role)?.dispose(); connections.delete(role); };
    const stopAll = () => { stop('player'); stop('narrator'); stop('companion'); };
    async function start(role: 'player' | 'narrator' | 'companion', client: AiConnectionClient = 'claude-desktop') {
        const workspace = getWorkspacePath();
        if (!workspace || !getGameStatePath() || !fs.existsSync(getGameStatePath()!) || isParlorMode() || isInWorldMode()) {
            void vscode.window.showWarningMessage('LoreRelay: 通常campaignを開いてください。'); return;
        }
        stop(role);
        const generation = generations[role];
        const runtime = await createCommerceActionRuntime(gate);
        const scope = hashGameActionValue(runtime.scope());
        const current = () => generations[role] === generation && getWorkspacePath() === workspace && runtime.authorized()
            && !isParlorMode() && !isInWorldMode() && hashGameActionValue(runtime.scope()) === scope;
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
        const connection = await openAgentConnection(role, async (clientSession, clientName) => {
            if (!current()) return;
            const label = role === 'player' ? '操作を委譲する' : '公開情報の読取を許可';
            const choice = await vscode.window.showWarningMessage(
                `LoreRelay ${role}\n設定の対象: ${client}\nクライアント申告名: ${clientName ?? '不明'}（身元は未検証）\nCampaign: ${workspace}\n接続session: ${clientSession}\n`
                + (role === 'player' ? `許可操作: ${allowed.join(', ')}\n新規execute ${maximum}回・30分。` : '公開済みの確定状態のみ。ゲーム操作は許可しません。'),
                { modal: true }, label);
            if (choice !== label || !current()) return;
            const bindings = { service: runtime.service, scope: runtime.scope, current };
            return role === 'player' ? createPlayerDelegation(bindings, allowed, maximum)
                : role === 'companion' ? createCompanionReader(bindings) : createNarratorReader(bindings);
        });
        if (!current()) { connection.dispose(); return; }
        connections.set(role, connection);
        const generated = buildAiConnectionConfig(client, role,
            path.join(context.extensionPath, 'out', `${role}Mcp.js`),
            connection.endpoint, connection.secret);
        const config = generated.text;
        output.clear(); output.appendLine('この接続専用の設定です。クライアント接続後、Host側でsessionとcampaignを確認してください。');
        output.appendLine(`設定先: ${generated.destination}。既存設定へ必要な項目のみ追加してください。秘密値を含むため共有・commitしないでください。`);
        output.appendLine(config); output.show(true);
        if (await vscode.window.showInformationMessage('LoreRelay: 接続待機中。MCPクライアントに設定し、Host側の確認へ進んでください。', '設定をコピー') === '設定をコピー') {
            if (current()) await vscode.env.clipboard.writeText(config);
        }
    }
    const startSafely = (role: 'player' | 'narrator' | 'companion', client?: AiConnectionClient) => start(role, client).catch(() => {
        stop(role); void vscode.window.showWarningMessage('LoreRelay: 接続を開始できません。campaignの状態を確認してください。');
    });
    async function chooseConnection() {
        const client = await vscode.window.showQuickPick([
            { label: 'Codex', id: 'codex' as const },
            { label: 'Gemini CLI', id: 'gemini' as const },
            { label: 'Grok Build', id: 'grok' as const },
            { label: 'Claude Desktop', id: 'claude-desktop' as const },
            { label: 'Claude Code', id: 'claude-code' as const },
        ], { title: 'LoreRelay — AI接続', placeHolder: '接続先を選択（設定ファイルは自動変更しません）' });
        if (!client) return;
        const role = await vscode.window.showQuickPick([
            { label: '相談役', description: '公開状態・行動候補の読取のみ。操作権限なし', id: 'companion' as const },
            { label: '委任プレイヤー', description: '取引・市場移動・日送りをHostで承認', id: 'player' as const },
            { label: '観戦者・日記係', description: '公開済みの確定状態の読取のみ', id: 'narrator' as const },
        ], { title: 'この接続の役割' });
        if (role) await startSafely(role.id, client.id);
    }
    async function showConnectionStatus() {
        const labels = { waiting: '接続待機', approval_pending: 'Host承認待ち', connected: '接続済み', closed: '失効・切断済み' };
        const entries = [...connections].map(([role, connection]) => {
            const status = connection.getAgentConnectionStatus();
            return { role, label: `${role}: ${labels[status.phase]}`,
                description: `完了応答 ${status.completedCalls}件（成功操作数ではありません）`,
                detail: `session: ${status.clientSession ?? '未接続'} / 公開tool: ${role === 'player' ? PLAYER_TOOLS.join(', ')
                    : role === 'companion' ? 'read_player_view, query_available' : 'read_committed_facts'}` };
        });
        if (!entries.length) { void vscode.window.showInformationMessage('LoreRelay: AI接続は開始されていません。'); return; }
        const selected = await vscode.window.showQuickPick(entries, { title: 'AI接続の状態（ゲーム操作は実行しません）',
            placeHolder: '公開toolの存在は、現在のexecute承認・残回数を保証しません。' });
        if (selected && await vscode.window.showInformationMessage(selected.label, 'この接続を停止') === 'この接続を停止') stop(selected.role);
    }
    context.subscriptions.push(output, { dispose: stopAll },
        onExperienceProfileChanged(stopAll),
        vscode.workspace.onDidChangeWorkspaceFolders(stopAll),
        vscode.workspace.onDidChangeConfiguration(event => { if (event.affectsConfiguration('textAdventure.workspaceFolder')) stopAll(); }),
        vscode.commands.registerCommand('textadventure.openAiConnection', chooseConnection),
        vscode.commands.registerCommand('textadventure.aiConnectionStatus', showConnectionStatus),
        vscode.commands.registerCommand('textadventure.startPlayerAgent', () => startSafely('player')),
        vscode.commands.registerCommand('textadventure.stopPlayerAgent', () => { stop('player'); void vscode.window.showInformationMessage('LoreRelay: 操作委譲を停止しました。開始済みの処理は取り消しません。'); }),
        vscode.commands.registerCommand('textadventure.startNarrator', () => startSafely('narrator')),
        vscode.commands.registerCommand('textadventure.stopNarrator', () => stop('narrator')));
}
