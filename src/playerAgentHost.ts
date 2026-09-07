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
import { openRemoteAiGateway } from './remoteAiGateway';
import { configureCodexGm, configureClaudeGm, configureAntigravityGm, configureGrokGm, configureDeepSeekGm } from './gmConnectionHost';

export function registerPlayerAgent(context: vscode.ExtensionContext, gate: DeterministicWorkspaceMutationGate) {
    const connections = new Map<'player' | 'narrator' | 'companion', Awaited<ReturnType<typeof openAgentConnection>>>();
    const generations = { player: 0, narrator: 0, companion: 0 };
    const output = vscode.window.createOutputChannel('LoreRelay Agent Connection');
    const gateways = new Map<string, Awaited<ReturnType<typeof openRemoteAiGateway>>>();
    const stop = (role: 'player' | 'narrator' | 'companion') => {
        generations[role]++; gateways.get(role)?.close(); gateways.delete(role);
        connections.get(role)?.dispose(); connections.delete(role);
    };
    const stopAll = () => { stop('player'); stop('narrator'); stop('companion'); };
    async function start(role: 'player' | 'narrator' | 'companion', client: AiConnectionClient = 'claude-desktop', remoteOrigin?: string) {
        if (remoteOrigin && role === 'player') throw new Error('readonly_role_required');
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
                `LoreRelay ${role}\n設定の対象: ${remoteOrigin ?? client}\nクライアント申告名: ${clientName ?? '不明'}（身元は未検証）\nCampaign: ${workspace}\n接続session: ${clientSession}\n`
                + (role === 'player' ? `許可操作: ${allowed.join(', ')}\n新規execute ${maximum}回・30分。` : '公開済みの確定状態のみ。ゲーム操作は許可しません。'),
                { modal: true }, label);
            if (choice !== label || !current()) return;
            const bindings = { service: runtime.service, scope: runtime.scope, current };
            return role === 'player' ? createPlayerDelegation(bindings, allowed, maximum)
                : role === 'companion' ? createCompanionReader(bindings) : createNarratorReader(bindings);
        });
        if (!current()) { connection.dispose(); return; }
        connections.set(role, connection);
        if (remoteOrigin && role !== 'player') {
            const gateway = await openRemoteAiGateway(role, connection.endpoint, connection.secret, remoteOrigin);
            if (!current()) { gateway.close(); return; }
            gateways.set(role, gateway);
            output.clear();
            output.appendLine(`読取専用Remote MCP: ${gateway.url}`);
            output.appendLine(`専用HTTPS tunnelの転送先: http://127.0.0.1:${gateway.localPort}（Hostヘッダーは公開URLのものを保持）`);
            output.appendLine(`一回限りの接続コード（5分）: ${gateway.pairingCode}`);
            output.appendLine('公開URLの /pair に {"code":"接続コード"} をPOSTし、返されたtokenをMCPのAuthorization: Bearerに設定してください。');
            output.appendLine('公開状態の取得前に、このHostでcampaignと接続sessionを確認します。期限30分、無通信5分。');
            output.appendLine('tunnelは自動起動しません。公開URLへの到達を確認後に接続できます。5秒間隔の到達確認が失敗すると失効します（通信待ち上限3秒）。停止後は新規接続が必要です。接続コードとtokenは共有・commitしないでください。');
            output.show(true);
            return;
        }
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
    const startSafely = (role: 'player' | 'narrator' | 'companion', client?: AiConnectionClient, remoteOrigin?: string) => start(role, client, remoteOrigin).catch(() => {
        stop(role); void vscode.window.showWarningMessage('LoreRelay: 接続を開始できません。campaignの状態を確認してください。');
    });
    async function chooseConnection() {
        const client = await vscode.window.showQuickPick([
            { label: 'Codex', id: 'codex' as const },
            { label: 'Gemini CLI', id: 'gemini' as const },
            { label: 'Antigravity CLI — GM', id: 'antigravity-gm' as const },
            { label: 'Grok Build', id: 'grok' as const },
            { label: 'Grok Build — GM', id: 'grok-gm' as const },
            { label: 'DeepSeek API — GM（従量課金）', id: 'deepseek-gm' as const },
            { label: 'Claude Desktop', id: 'claude-desktop' as const },
            { label: 'Claude Code', id: 'claude-code' as const },
            { label: 'Web・スマホ（読取専用Remote MCP）', id: 'remote' as const },
        ], { title: 'LoreRelay — AI接続', placeHolder: '接続先を選択（設定ファイルは自動変更しません）' });
        if (!client) return;
        if (client.id === 'antigravity-gm') { await configureAntigravityGm(); return; }
        if (client.id === 'grok-gm') { await configureGrokGm(); return; }
        if (client.id === 'deepseek-gm') { await configureDeepSeekGm(); return; }
        if (client.id === 'codex' || client.id === 'claude-code') {
            const usage = await vscode.window.showQuickPick(['GMとして使う', 'Player・相談役・観戦者として使う'], { title: `${client.label}の役割` });
            if (!usage) return;
            if (usage === 'GMとして使う') {
                if (client.id === 'codex') await configureCodexGm(); else await configureClaudeGm();
                return;
            }
        }
        const roles = [
            { label: '相談役', description: '公開状態・行動候補の読取のみ。操作権限なし', id: 'companion' as const },
            { label: '委任プレイヤー', description: '取引・市場移動・日送りをHostで承認', id: 'player' as const },
            { label: '観戦者・日記係', description: '公開済みの確定状態の読取のみ', id: 'narrator' as const },
        ];
        const role = await vscode.window.showQuickPick(client.id === 'remote' ? roles.filter(item => item.id !== 'player') : roles,
            { title: 'この接続の役割' });
        if (!role) return;
        if (client.id === 'remote') {
            const origin = await vscode.window.showInputBox({ title: '専用HTTPS tunnelの公開origin（https://example.com）',
                validateInput: value => {
                    try { const url = new URL(value); if (url.protocol === 'https:' && url.origin === value && !url.username && !url.password) return; }
                    catch { /* show the same validation message */ }
                    return 'パスや認証情報を含まないHTTPS originを入力してください。';
                } });
            if (origin) await startSafely(role.id, undefined, origin);
        } else await startSafely(role.id, client.id);
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
        if (!selected) return;
        const gateway = gateways.get(selected.role);
        const choice = await vscode.window.showInformationMessage(selected.label, 'この接続を停止',
            ...(gateway && !gateway.isClosed() ? ['Grok Voice設定を作成'] : []));
        if (choice === 'この接続を停止') stop(selected.role);
        else if (choice === 'Grok Voice設定を作成' && gateway) {
            try {
                const config = gateway.issueVoiceConfiguration();
                output.clear();
                output.appendLine('Grok Voice相談役の設定です。今回の接続コードは消費されました。');
                output.appendLine('この設定をxAIへ送ると、一時読取tokenと公開ゲーム情報をxAIが利用します。ここでは送信もマイク起動も行いません。');
                output.appendLine('別途xAI Voiceの認証が必要です。設定を保存・共有・commitしないでください。失効後は新規接続が必要です。');
                output.appendLine(JSON.stringify(config, null, 2)); output.show(true);
            } catch { void vscode.window.showWarningMessage('Voice設定は、HTTPS tunnelへの到達確認が済んだ未使用接続で作成してください。'); }
        }
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
