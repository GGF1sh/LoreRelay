import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { randomUUID, createHash } from 'crypto';
import { CodexGmClient } from './codexGmClient';
import { AntigravityGmClient } from './antigravityGmClient';
import { GrokGmClient } from './grokGmClient';
import { DeepSeekGmClient } from './deepSeekGmClient';
import { ClaudeGmClient } from './claudeGmClient';
import { GmCandidateGate, formatGmConnectionError, type GmConnectionWitness, type GmConnectionAdapter, type ConnectedGmProvider } from './gmConnectionCore';
import { loadExistingAcceptedTurnScope, loadAcceptedTurnLedger } from './acceptedTurnReplayGuard';
import { activeEpochLedgerHead } from './acceptedTurnReplayGuardCore';
import { getWorkspacePath } from './workspacePaths';
import { onExperienceProfileChanged } from './experience';
import { CHECKPOINT_MUTABLE_LEDGER_FILES } from './checkpointSnapshot';
import type { DeterministicWorkspaceMutationGate, DeterministicWorkspaceMutationLease } from './deterministicWorkspaceMutationGate';
import type { TurnResult } from './types/TurnResult';

let context: vscode.ExtensionContext | undefined;
let mutationGate: DeterministicWorkspaceMutationGate | undefined;
let getGameplayLease: (() => DeterministicWorkspaceMutationLease | undefined) | undefined;
let activeClient: GmConnectionAdapter | undefined;
let cancellationGeneration = 0;
const hostSession = randomUUID();
const profileKey = 'gmConnection.v2.codex';
const claudeProfileKey = 'gmConnection.v2.claude';
const antigravityProfileKey = 'gmConnection.v2.antigravity';
const grokProfileKey = 'gmConnection.v2.grok';
const deepSeekProfileKey = 'gmConnection.v2.deepseek';
const deepSeekSecretKey = 'lorerelay.deepseek.apiKey';
function connectionProfileKey(provider: ConnectedGmProvider): string {
    if (provider === 'deepseek-api') return deepSeekProfileKey;
    if (provider === 'grok-acp') return grokProfileKey;
    return provider === 'codex-app-server' ? profileKey : provider === 'antigravity-cli' ? antigravityProfileKey : claudeProfileKey;
}
interface Profile { executable: string; model: string; maxTokens?: number }

export function initializeGmConnectionHost(value: vscode.ExtensionContext, gate: DeterministicWorkspaceMutationGate,
    gameplayLease?: () => DeterministicWorkspaceMutationLease | undefined): void {
    context = value; mutationGate = gate;
    getGameplayLease = gameplayLease;
    value.subscriptions.push({ dispose: cancelGmConnection },
        onExperienceProfileChanged(cancelGmConnection),
        vscode.workspace.onDidChangeWorkspaceFolders(cancelGmConnection),
        vscode.workspace.onDidChangeConfiguration(event => {
            if (event.affectsConfiguration('textAdventure.workspaceFolder') || event.affectsConfiguration('textAdventure.gmBridge.provider')) cancelGmConnection();
        }));
}

export function cancelGmConnection(): void {
    cancellationGeneration++;
    activeClient?.dispose(); activeClient = undefined;
}

export function isGmConnectionBusy(): boolean { return activeClient !== undefined; }

export async function runConnectedGmChat(prompt: string, provider: ConnectedGmProvider = 'codex-app-server'): Promise<{ ok: boolean; text: string; model?: string; isCurrent?: () => boolean }> {
    if (!context || activeClient) { return { ok: false, text: '' }; }
    const profile = context.workspaceState.get<Profile>(connectionProfileKey(provider));
    if (!profile) { return { ok: false, text: '' }; }
    const generation = cancellationGeneration;
    const workspace = getWorkspacePath();
    const isCurrent = () => generation === cancellationGeneration && workspace === getWorkspacePath();
    let client: GmConnectionAdapter | undefined;
    try {
        client = makeClient(profile, provider); activeClient = client;
        if (await client.initialize() !== 'ready') { throw new Error(provider === 'deepseek-api' ? 'deepseek_key_required' : provider === 'grok-acp' ? 'grok_login_required' : provider === 'codex-app-server' ? 'codex_login_required' : provider === 'antigravity-cli' ? 'antigravity_login_required' : 'claude_login_required'); }
        const text = await client.generate(prompt, () => {});
        if (!isCurrent()) { return { ok: false, text: '' }; }
        return { ok: true, text, model: profile.model, isCurrent };
    } catch (error) {
        if (generation === cancellationGeneration) void vscode.window.showErrorMessage(`GM: ${formatGmConnectionError(error)}`);
        return { ok: false, text: '' };
    } finally { client?.dispose(); if (activeClient === client) activeClient = undefined; }
}

function connectionDirectories(provider: ConnectedGmProvider) {
    if (!context) { throw new Error('GM connection Host is unavailable'); }
    const root = path.join(context.globalStorageUri.fsPath, provider === 'deepseek-api' ? 'gm-deepseek-v2' : provider === 'grok-acp' ? 'gm-grok-v2' : provider === 'codex-app-server' ? 'gm-codex-v2' : provider === 'antigravity-cli' ? 'gm-antigravity-v2' : 'gm-claude-v2');
    const profileDirectory = path.join(root, 'profile');
    const workingDirectory = path.join(root, 'work');
    fs.mkdirSync(profileDirectory, { recursive: true });
    fs.mkdirSync(workingDirectory, { recursive: true });
    return { profileDirectory, workingDirectory };
}

function makeClient(profile: Profile, provider: ConnectedGmProvider): GmConnectionAdapter {
    const options = { ...profile, ...connectionDirectories(provider) };
    if (provider === 'deepseek-api') {
        if (!context) throw new Error('deepseek_key_required');
        return new DeepSeekGmClient({ ...options, maxTokens: profile.maxTokens ?? 4096,
            script: path.join(context.extensionPath, 'antigravity-skill', 'text-adventure-gm', 'scripts', 'deepseek_gm.py'),
            getApiKey: async () => (await context?.secrets.get(deepSeekSecretKey)) ?? '',
            onUsage: usage => {
                const text = usage ? `DeepSeek API: 入力${usage.input} / 出力${usage.output} tokens、概算 USD ${usage.estimatedUsdMin.toFixed(6)}–${usage.estimatedUsdMax.toFixed(6)}（単価${usage.priceDate}）`
                    : 'DeepSeek API: 使用量を取得できません。費用は未確認です。';
                vscode.window.setStatusBarMessage(text, 30_000);
            } });
    }
    if (provider === 'grok-acp') return new GrokGmClient(options);
    return provider === 'codex-app-server' ? new CodexGmClient(options)
        : provider === 'antigravity-cli' ? new AntigravityGmClient(options) : new ClaudeGmClient(options);
}

export async function configureCodexGm(): Promise<void> {
    if (!context || isGmConnectionBusy()) { return; }
    const generation = cancellationGeneration;
    const workspace = getWorkspacePath();
    const consent = await vscode.window.showWarningMessage(
        'CodexをGMとして使用します。入力、会話履歴、GM用の非公開設定をOpenAIへ送ります。専用の公式ログインを使い、ChatGPT利用枠を消費します。',
        { modal: true }, '接続設定へ進む');
    if (!consent) { return; }
    const previous = context.workspaceState.get<Profile>(profileKey);
    const profile = { executable: previous?.executable ?? 'codex', model: previous?.model ?? 'gpt-5.6-terra' };
    if (isGmConnectionBusy() || generation !== cancellationGeneration || workspace !== getWorkspacePath()) { return; }
    let client: CodexGmClient | undefined;
    const startedAt = Date.now();
    // Only fixed lifecycle labels and duration; never authentication URLs, codes or account data.
    const diagnostic = (stage: string) => console.info(`[LoreRelay Codex login] ${stage}; elapsedMs=${Date.now() - startedAt}`);
    try {
        client = new CodexGmClient({ ...profile, ...connectionDirectories('codex-app-server') }); activeClient = client;
        let status = await client.initialize();
        if (status === 'login_required') {
            const method = await vscode.window.showQuickPick([
                { label: 'デバイスコードでログイン', detail: 'localhost接続は不要です。公式画面にコードを入力します。', mode: 'device' },
                { label: 'ブラウザーの戻り先でログイン', detail: 'このPCのlocalhostへ認証結果を返す従来方式です。', mode: 'browser' },
            ], { title: 'Codexの公式ログイン方式' });
            if (!method || generation !== cancellationGeneration || workspace !== getWorkspacePath()) { diagnostic('cancelled_before_login'); return; }
            let loginId: string;
            let authUrl: string;
            if (method.mode === 'device') {
                const login = await client.startDeviceLogin();
                loginId = login.loginId; authUrl = login.verificationUrl;
                diagnostic('device_started');
                const proceed = await vscode.window.showInformationMessage(
                    `公式ログイン画面にコード ${login.userCode} を入力してください。このVS Codeウィンドウは開いたままにしてください。`,
                    { modal: true }, 'コードをコピーしてブラウザーを開く');
                if (!proceed || generation !== cancellationGeneration || workspace !== getWorkspacePath()) { diagnostic('cancelled_before_browser'); return; }
                await vscode.env.clipboard.writeText(login.userCode);
            } else {
                const login = await client.startLogin();
                loginId = login.loginId; authUrl = login.authUrl;
                diagnostic('browser_callback_started');
            }
            if (generation !== cancellationGeneration || workspace !== getWorkspacePath()) { diagnostic('cancelled_before_browser'); return; }
            if (!await vscode.env.openExternal(vscode.Uri.parse(authUrl))) { throw new Error('codex_login_browser_failed'); }
            const loginClient = client;
            await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification,
                title: 'Codex GM: 公式ログイン完了を待っています（最大10分）', cancellable: true }, async (_, token) => {
                const cancellation = token.onCancellationRequested(() => { diagnostic('cancelled_by_user'); loginClient.dispose(); });
                if (token.isCancellationRequested) loginClient.dispose();
                try { await loginClient.waitForLogin(loginId); }
                finally { cancellation.dispose(); }
            });
            status = await client.checkAuthentication();
        }
        if (status !== 'ready') { throw new Error('codex_login_required'); }
        if (generation !== cancellationGeneration || workspace !== getWorkspacePath()) { return; }
        diagnostic('authentication_confirmed');
        let models: Array<{ model: string; displayName: string }> = [];
        let catalogFailed = false;
        try { models = await client.listModels(); } catch { catalogFailed = true; }
        if (generation !== cancellationGeneration || workspace !== getWorkspacePath()) { return; }
        const choices = models.map(item => ({ label: item.displayName, model: item.model,
            description: item.model, detail: item.model === previous?.model ? '現在の設定' : '公式クライアントのモデル一覧' }));
        choices.sort((a, b) => Number(b.model === previous?.model) - Number(a.model === previous?.model));
        choices.push({ label: 'モデルIDを手入力', model: '', description: '',
            detail: catalogFailed ? '一覧を取得できませんでした。正確なモデルIDを指定できます。' : '一覧にないモデルを指定する' });
        const choice = await vscode.window.showQuickPick(choices, { title: 'GMに使うCodexモデル',
            placeHolder: '使用するモデルを選択してください（自動変更はしません）', matchOnDescription: true });
        if (!choice || generation !== cancellationGeneration || workspace !== getWorkspacePath()) { return; }
        const model = choice.model || await vscode.window.showInputBox({ title: 'GMに使うCodexモデルID', value: profile.model,
            validateInput: value => /^[a-zA-Z0-9_.-]{1,100}$/.test(value) ? undefined : 'モデルIDを入力してください。' });
        if (!model || generation !== cancellationGeneration || workspace !== getWorkspacePath()) { return; }
        profile.model = model;
        await context.workspaceState.update(profileKey, profile);
        await vscode.workspace.getConfiguration('textAdventure').update('gmBridge.provider', 'codex-app-server', vscode.ConfigurationTarget.Workspace);
        void vscode.window.showInformationMessage('Codex GM: 認証確認済み。実モデルの応答は次のゲーム入力で確認します。');
    } catch (error) {
        diagnostic(error instanceof Error && error.message === 'codex_login_timeout' ? 'timed_out'
            : error instanceof Error && error.message === 'codex_connection_closed' ? 'connection_closed' : 'failed');
        void vscode.window.showErrorMessage(`Codex GM接続: ${formatGmConnectionError(error)}`);
    } finally { client?.dispose(); if (activeClient === client) activeClient = undefined; }
}

export async function configureDeepSeekGm(): Promise<void> {
    if (!context || isGmConnectionBusy()) return;
    const generation = cancellationGeneration, workspace = getWorkspacePath();
    const consent = await vscode.window.showWarningMessage(
        'DeepSeekをGMとして使用します。入力・会話履歴・GM用の非公開設定をDeepSeek APIへ送ります。従量課金です。Web版の無料枠や他社サブスクは使いません。',
        { modal: true }, 'API接続を設定');
    if (!consent) return;
    const previous = context.workspaceState.get<Profile>(deepSeekProfileKey);
    const model = await vscode.window.showQuickPick(['deepseek-v4-flash', 'deepseek-v4-pro'], { title: 'DeepSeek GMモデル（非思考モード）' });
    if (!model) return;
    const limit = await vscode.window.showInputBox({ title: '1回のGM応答の最大出力tokens', value: String(previous?.maxTokens ?? 4096),
        validateInput: value => /^\d+$/.test(value) && Number(value) >= 1 && Number(value) <= 32768 ? undefined : '1〜32768の整数を入力してください。' });
    if (!limit) return;
    const key = await vscode.window.showInputBox({ title: 'DeepSeek APIキー（SecretStorageに保存）', password: true, ignoreFocusOut: true,
        prompt: '空欄なら保存済みキーを使用します。キーは設定ファイルやログへ書きません。' });
    if (key === undefined || isGmConnectionBusy() || generation !== cancellationGeneration || workspace !== getWorkspacePath()) return;
    const apiKey = key.trim() || await context.secrets.get(deepSeekSecretKey) || '';
    if (isGmConnectionBusy() || generation !== cancellationGeneration || workspace !== getWorkspacePath()) return;
    if (!apiKey) { void vscode.window.showErrorMessage('DeepSeek APIキーが必要です。'); return; }
    const profile = { executable: vscode.workspace.getConfiguration('textAdventure').get<string>('gmBridge.python', 'python'),
        model, maxTokens: Number(limit) };
    const client = new DeepSeekGmClient({ ...profile, ...connectionDirectories('deepseek-api'),
        script: path.join(context.extensionPath, 'antigravity-skill', 'text-adventure-gm', 'scripts', 'deepseek_gm.py'), getApiKey: async () => apiKey });
    activeClient = client;
    try {
        const status = await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification,
            title: `DeepSeek APIを確認中: ${model} / 最大${limit} tokens`, cancellable: true }, async (_, token) => {
            const cancellation = token.onCancellationRequested(() => client.dispose());
            try { return await client.initialize(); } finally { cancellation.dispose(); }
        });
        if (status !== 'ready') throw new Error('deepseek_key_required');
        if (generation !== cancellationGeneration || workspace !== getWorkspacePath()) return;
        await context.secrets.store(deepSeekSecretKey, apiKey);
        await context.workspaceState.update(deepSeekProfileKey, profile);
        await vscode.workspace.getConfiguration('textAdventure').update('gmBridge.provider', 'deepseek-api', vscode.ConfigurationTarget.Workspace);
        void vscode.window.showInformationMessage(`DeepSeek API認証・モデル一覧を確認済み。${model} / 最大${limit} tokens。実GM応答は次の入力で確認します。`);
    } catch (error) { void vscode.window.showErrorMessage(`DeepSeek GM: ${formatGmConnectionError(error)}`); }
    finally { client.dispose(); if (activeClient === client) activeClient = undefined; }
}

export async function configureGrokGm(): Promise<void> {
    if (!context || isGmConnectionBusy()) return;
    const generation = cancellationGeneration, workspace = getWorkspacePath();
    const consent = await vscode.window.showWarningMessage(
        'GrokをGMとして使用します。入力・会話履歴・GM用の非公開設定をxAIへ送ります。公式アカウントの利用枠を使い、API課金へ自動切替しません。',
        { modal: true }, 'GMとして接続');
    if (!consent || isGmConnectionBusy() || generation !== cancellationGeneration || workspace !== getWorkspacePath()) return;
    const previous = context.workspaceState.get<Profile>(grokProfileKey);
    const profile = { executable: previous?.executable ?? 'grok', model: previous?.model ?? '' };
    let client = new GrokGmClient({ ...profile, ...connectionDirectories('grok-acp') });
    let terminal: vscode.Terminal | undefined;
    const owner: GmConnectionAdapter = { initialize: () => client.initialize(), generate: (prompt, draft) => client.generate(prompt, draft),
        dispose: () => { client.dispose(); terminal?.dispose(); } };
    activeClient = owner;
    try {
        let models: Array<{ model: string; displayName: string }> = [];
        try { models = await client.listModels(); } catch { /* explicit manual fallback */ }
        if (generation !== cancellationGeneration || workspace !== getWorkspacePath()) return;
        const choices = models.map(item => ({ label: item.displayName, model: item.model,
            description: item.model === previous?.model ? '現在の設定' : '公式CLIのモデル候補（利用可否は接続時に確認）' }));
        choices.sort((a, b) => Number(b.model === previous?.model) - Number(a.model === previous?.model));
        choices.push({ label: 'モデルIDを手入力', model: '', description: models.length ? '一覧にないモデルを指定する' : '一覧を取得できませんでした' });
        const choice = await vscode.window.showQuickPick(choices, { title: 'GMに使うGrokモデル',
            placeHolder: '使用するモデルを選択してください（自動変更はしません）', matchOnDescription: true });
        if (!choice || generation !== cancellationGeneration || workspace !== getWorkspacePath()) return;
        const model = choice.model || await vscode.window.showInputBox({ title: 'GMに使うGrokモデルID', value: profile.model,
            prompt: '大文字・小文字とハイフンを含め、正確なIDを入力してください。',
            validateInput: value => /^[a-zA-Z0-9_.-]{1,100}$/.test(value) ? undefined : '正確なモデルIDを入力してください。' });
        if (!model || generation !== cancellationGeneration || workspace !== getWorkspacePath()) return;
        profile.model = model;
        client.dispose();
        client = new GrokGmClient({ ...profile, ...connectionDirectories('grok-acp') });
        let status = await client.initialize();
        if (status === 'login_required') {
            const launch = client.loginLaunch();
            client.dispose();
            terminal = vscode.window.createTerminal({ name: 'LoreRelay Grok 公式ログイン', shellPath: launch.executable,
                shellArgs: launch.args, cwd: launch.cwd, env: launch.env, strictEnv: true });
            terminal.show();
            while (status !== 'ready') {
                const check = await vscode.window.showInformationMessage(
                    '専用ターミナルの公式案内からGrokにログインしてください。完了後に認証状態を確認します。', 'ログインを確認');
                if (!check || generation !== cancellationGeneration || workspace !== getWorkspacePath()) return;
                client = new GrokGmClient({ ...profile, ...connectionDirectories('grok-acp') });
                status = await client.initialize();
                if (status !== 'ready') client.dispose();
            }
        }
        if (generation !== cancellationGeneration || workspace !== getWorkspacePath()) return;
        await context.workspaceState.update(grokProfileKey, profile);
        await vscode.workspace.getConfiguration('textAdventure').update('gmBridge.provider', 'grok-acp', vscode.ConfigurationTarget.Workspace);
        void vscode.window.showInformationMessage('Grok GM: 認証とモデル設定を確認済み。実モデルの応答は次のゲーム入力で確認します。');
    } catch (error) {
        void vscode.window.showErrorMessage(`Grok GM: ${formatGmConnectionError(error)}`);
    } finally { owner.dispose(); if (activeClient === owner) activeClient = undefined; }
}

export async function configureAntigravityGm(): Promise<void> {
    if (!context || isGmConnectionBusy()) return;
    const consent = await vscode.window.showWarningMessage(
        'AntigravityをGMとして使用します。入力・会話履歴・GM用の非公開設定をGoogleへ送ります。公式アカウントの利用枠を使い、API課金や追加AIクレジットへ自動切替しません。',
        { modal: true }, 'GMとして接続');
    if (!consent) return;
    const previous = context.workspaceState.get<Profile>(antigravityProfileKey);
    const model = await vscode.window.showInputBox({ title: 'GMに使うAntigravityモデルID（agy modelsで確認）', value: previous?.model ?? '',
        validateInput: value => /^[a-zA-Z0-9_.-]{1,100}$/.test(value) ? undefined : '正確なモデルIDを入力してください。' });
    if (!model || isGmConnectionBusy()) return;
    const profile = { executable: previous?.executable ?? 'agy', model };
    const generation = cancellationGeneration, workspace = getWorkspacePath();
    const client = new AntigravityGmClient({ ...profile, ...connectionDirectories('antigravity-cli') });
    activeClient = client;
    const inputCancellation = new vscode.CancellationTokenSource();
    try {
        if (await client.initialize() === 'login_required') {
            await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification,
                title: 'Antigravity GM: 公式ログインを待っています', cancellable: true }, async (_, token) => {
                const cancellation = token.onCancellationRequested(() => { inputCancellation.cancel(); client.dispose(); });
                try {
                    await client.login(async url => {
                        if (!await vscode.env.openExternal(vscode.Uri.parse(url))) throw new Error('antigravity_browser_failed');
                        return vscode.window.showInputBox({ title: 'Google公式画面に表示された認証コード',
                            prompt: '認証コードは公式CLIへ渡し、保存しません。接続期限切れの場合は最初からログインしてください。',
                            password: true, ignoreFocusOut: true }, inputCancellation.token);
                    });
                } finally { cancellation.dispose(); }
            });
        }
        if (generation !== cancellationGeneration || workspace !== getWorkspacePath()) return;
        await context.workspaceState.update(antigravityProfileKey, profile);
        await vscode.workspace.getConfiguration('textAdventure').update('gmBridge.provider', 'antigravity-cli', vscode.ConfigurationTarget.Workspace);
        void vscode.window.showInformationMessage('Antigravity GM: CLI起動とツール無効化を確認しました。アカウント認証と実モデルの応答は未確認です。次のゲーム入力で確認します。');
    } catch (error) {
        void vscode.window.showErrorMessage(`Antigravity GM: ${formatGmConnectionError(error)}`);
    } finally {
        inputCancellation.cancel(); inputCancellation.dispose(); client.dispose();
        if (activeClient === client) activeClient = undefined;
    }
}

export async function configureClaudeGm(): Promise<void> {
    if (!context || isGmConnectionBusy()) return;
    const consent = await vscode.window.showWarningMessage(
        'ClaudeをGMとして使用します。入力、会話履歴、GM用の非公開設定をAnthropicへ送ります。専用の公式ログインを使い、Claudeサブスク利用枠を消費します。APIへ自動切替しません。',
        { modal: true }, '接続設定へ進む');
    if (!consent) return;
    const previous = context.workspaceState.get<Profile>(claudeProfileKey);
    const model = await vscode.window.showInputBox({ title: 'GMに使うClaudeの完全なモデルID（別モデルへ自動変更しません）', value: previous?.model ?? '',
        validateInput: value => /^claude-[a-zA-Z0-9_.-]{1,100}$/.test(value) ? undefined : '利用可能な完全なモデルIDを入力してください。' });
    if (!model || isGmConnectionBusy()) return;
    const profile = { executable: previous?.executable ?? 'claude', model };
    const generation = cancellationGeneration, workspace = getWorkspacePath();
    const client = new ClaudeGmClient({ ...profile, ...connectionDirectories('claude-code-subscription') });
    activeClient = client;
    try {
        if (await client.initialize() === 'login_required') {
            await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification,
                title: 'Claude GM: 公式ブラウザーログインを待っています', cancellable: true }, async (_, token) => {
                const cancellation = token.onCancellationRequested(() => client.dispose());
                try { await client.login(); } finally { cancellation.dispose(); }
            });
        }
        if (generation !== cancellationGeneration || workspace !== getWorkspacePath()) return;
        await context.workspaceState.update(claudeProfileKey, profile);
        await vscode.workspace.getConfiguration('textAdventure').update('gmBridge.provider', 'claude-code-subscription', vscode.ConfigurationTarget.Workspace);
        void vscode.window.showInformationMessage(`Claude GM: サブスク認証確認済み（CLI ${client.clientVersion}）。実モデルの応答は次のゲーム入力で確認します。`);
    } catch (error) {
        void vscode.window.showErrorMessage(`Claude GM接続: ${formatGmConnectionError(error)}`);
    } finally { client.dispose(); if (activeClient === client) activeClient = undefined; }
}

function captureWitness(workspace: string, requestId: string): GmConnectionWitness {
    const scope = loadExistingAcceptedTurnScope(workspace);
    if (!scope) { throw new Error('GM timeline scope is missing'); }
    const ledger = loadAcceptedTurnLedger(workspace, scope.campaignInstanceId);
    return { workspace, campaignInstanceId: scope.campaignInstanceId, timelineEpochId: scope.timelineEpochId,
        parentIdentityHash: activeEpochLedgerHead(ledger.records, scope)?.identityHash ?? null, hostSession, requestId };
}

export async function runConnectedGmCandidate(prompt: string, normalize: (reply: string) => TurnResult,
    onDraft: (text: string) => void, afterAccepted?: () => void, provider: ConnectedGmProvider = 'codex-app-server'): Promise<boolean> {
    if (!context || !mutationGate || activeClient) { throw new Error('GM connection is busy or unavailable'); }
    const profile = context.workspaceState.get<Profile>(connectionProfileKey(provider));
    const workspace = getWorkspacePath();
    if (!profile || !workspace) { throw new Error('Configure GM in AI connections first'); }
    const requestId = randomUUID();
    const generation = cancellationGeneration;
    const witness = captureWitness(workspace, requestId);
    const parentLease = getGameplayLease?.();
    if (parentLease && parentLease.workspaceKey !== workspace) { throw new Error('GM gameplay lease scope mismatch'); }
    const gate = new GmCandidateGate(witness);
    const stateHash = () => {
        const hash = createHash('sha256');
        for (const file of ['game_state.json', ...CHECKPOINT_MUTABLE_LEDGER_FILES, 'game_rules.json', 'world_forge.json']) {
            const target = path.join(workspace, file);
            hash.update(file + '\0');
            if (fs.existsSync(target)) {
                hash.update('present\0').update(createHash('sha256').update(fs.readFileSync(target)).digest());
            } else { hash.update('absent\0'); }
        }
        return hash.digest('hex');
    };
    const initialHash = stateHash();
    let client: GmConnectionAdapter | undefined;
    try {
        client = makeClient(profile, provider); activeClient = client;
        if (await client.initialize() !== 'ready') { throw new Error(provider === 'deepseek-api' ? 'deepseek_key_required' : provider === 'grok-acp' ? 'grok_login_required' : provider === 'codex-app-server' ? 'codex_login_required' : provider === 'antigravity-cli' ? 'antigravity_login_required' : 'claude_login_required'); }
        const reply = await client.generate(prompt, onDraft);
        const candidate = normalize(reply);
        const isCurrent = () => generation === cancellationGeneration && workspace === getWorkspacePath()
            && (!parentLease || getGameplayLease?.() === parentLease)
            && stateHash() === initialHash && gate.inspect(captureWitness(workspace, requestId), candidate) === 'ready';
        const commit = async () => {
            const { submitGmTurnCandidate } = await import('./gameStateSync');
            const outcome = await submitGmTurnCandidate(workspace, candidate, isCurrent);
            if (outcome.kind === 'newlyAccepted' && afterAccepted) {
                try { afterAccepted(); }
                catch { throw new Error('GM turn accepted; profile persistence incomplete. Do not replay.'); }
            }
            return outcome;
        };
        // Normal player input already owns the existing gameplay lease. Reacquiring it
        // would reject every reply as busy. A standalone dispatch still acquires the gate.
        const result = parentLease
            ? { status: 'completed' as const, value: await commit() }
            : await mutationGate.run(workspace, { actionKind: 'gm_candidate', requestId }, commit);
        if (result.status !== 'completed') { throw new Error(result.status === 'busy' ? 'WORLD_MUTATION_IN_PROGRESS' : 'GM result requires inspection'); }
        if (result.value.kind !== 'newlyAccepted') { throw new Error(result.value.reason ?? result.value.kind); }
        if (result.value.persistence === 'partial') { throw new Error('GM turn accepted; partial persistence requires inspection. Do not replay.'); }
        return true;
    } finally { gate.cancel(); client?.dispose(); if (activeClient === client) activeClient = undefined; }
}
