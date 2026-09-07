import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { randomUUID, createHash } from 'crypto';
import { CodexGmClient } from './codexGmClient';
import { GmCandidateGate, formatGmConnectionError, type GmConnectionWitness } from './gmConnectionCore';
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
let activeClient: CodexGmClient | undefined;
let cancellationGeneration = 0;
const hostSession = randomUUID();
const profileKey = 'gmConnection.v2.codex';
interface Profile { executable: string; model: string }

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

export async function runCodexGmChat(prompt: string): Promise<{ ok: boolean; text: string; model?: string }> {
    if (!context || activeClient) { return { ok: false, text: '' }; }
    const profile = context.workspaceState.get<Profile>(profileKey);
    if (!profile) { return { ok: false, text: '' }; }
    const generation = cancellationGeneration;
    const workspace = getWorkspacePath();
    let client: CodexGmClient | undefined;
    try {
        client = makeClient(profile); activeClient = client;
        if (await client.initialize() !== 'ready') { throw new Error('codex_login_required'); }
        const text = await client.generate(prompt, () => {});
        if (generation !== cancellationGeneration || workspace !== getWorkspacePath()) { return { ok: false, text: '' }; }
        return { ok: true, text, model: profile.model };
    } catch (error) {
        if (generation === cancellationGeneration) void vscode.window.showErrorMessage(`Codex GM: ${formatGmConnectionError(error)}`);
        return { ok: false, text: '' };
    } finally { client?.dispose(); if (activeClient === client) activeClient = undefined; }
}

function makeClient(profile: Profile): CodexGmClient {
    if (!context) { throw new Error('GM connection Host is unavailable'); }
    const root = path.join(context.globalStorageUri.fsPath, 'gm-codex-v2');
    const profileDirectory = path.join(root, 'profile');
    const workingDirectory = path.join(root, 'work');
    fs.mkdirSync(profileDirectory, { recursive: true });
    fs.mkdirSync(workingDirectory, { recursive: true });
    return new CodexGmClient({ ...profile, profileDirectory, workingDirectory });
}

export async function configureCodexGm(): Promise<void> {
    if (!context || isGmConnectionBusy()) { return; }
    const consent = await vscode.window.showWarningMessage(
        'CodexをGMとして使用します。入力、会話履歴、GM用の非公開設定をOpenAIへ送ります。専用の公式ログインを使い、ChatGPT利用枠を消費します。',
        { modal: true }, '接続設定へ進む');
    if (!consent) { return; }
    const previous = context.workspaceState.get<Profile>(profileKey);
    const model = await vscode.window.showInputBox({ title: 'GMに使うCodexモデルID', value: previous?.model ?? 'gpt-5.6-terra',
        validateInput: value => /^[a-zA-Z0-9_.-]{1,100}$/.test(value) ? undefined : 'モデルIDを入力してください。' });
    if (!model) { return; }
    const profile = { executable: previous?.executable ?? 'codex', model };
    const generation = cancellationGeneration;
    const workspace = getWorkspacePath();
    if (isGmConnectionBusy()) { return; }
    let client: CodexGmClient | undefined;
    try {
        client = makeClient(profile); activeClient = client;
        let status = await client.initialize();
        if (status === 'login_required') {
            const login = await client.startLogin();
            if (!await vscode.env.openExternal(vscode.Uri.parse(login.authUrl))) { throw new Error('codex_login_browser_failed'); }
            const loginClient = client;
            await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification,
                title: 'Codex GM: ブラウザーでの公式ログイン完了を待っています', cancellable: true }, async (_, token) => {
                const cancellation = token.onCancellationRequested(() => loginClient.dispose());
                try { await loginClient.waitForLogin(login.loginId); }
                finally { cancellation.dispose(); }
            });
            status = await client.checkAuthentication();
        }
        if (status !== 'ready') { throw new Error('codex_login_required'); }
        if (generation !== cancellationGeneration || workspace !== getWorkspacePath()) { return; }
        await context.workspaceState.update(profileKey, profile);
        await vscode.workspace.getConfiguration('textAdventure').update('gmBridge.provider', 'codex-app-server', vscode.ConfigurationTarget.Workspace);
        void vscode.window.showInformationMessage('Codex GM: 認証確認済み。実モデルの応答は次のゲーム入力で確認します。');
    } catch (error) {
        void vscode.window.showErrorMessage(`Codex GM接続: ${formatGmConnectionError(error)}`);
    } finally { client?.dispose(); if (activeClient === client) activeClient = undefined; }
}

function captureWitness(workspace: string, requestId: string): GmConnectionWitness {
    const scope = loadExistingAcceptedTurnScope(workspace);
    if (!scope) { throw new Error('GM timeline scope is missing'); }
    const ledger = loadAcceptedTurnLedger(workspace, scope.campaignInstanceId);
    return { workspace, campaignInstanceId: scope.campaignInstanceId, timelineEpochId: scope.timelineEpochId,
        parentIdentityHash: activeEpochLedgerHead(ledger.records, scope)?.identityHash ?? null, hostSession, requestId };
}

export async function runCodexGmCandidate(prompt: string, normalize: (reply: string) => TurnResult,
    onDraft: (text: string) => void, afterAccepted?: () => void): Promise<boolean> {
    if (!context || !mutationGate || activeClient) { throw new Error('GM connection is busy or unavailable'); }
    const profile = context.workspaceState.get<Profile>(profileKey);
    const workspace = getWorkspacePath();
    if (!profile || !workspace) { throw new Error('Configure Codex GM in AI connections first'); }
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
    let client: CodexGmClient | undefined;
    try {
        client = makeClient(profile); activeClient = client;
        if (await client.initialize() !== 'ready') { throw new Error('codex_login_required'); }
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
