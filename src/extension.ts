import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

import { randomBytes } from 'crypto';
import { processDiceMacros } from './diceRoller';
import { loadGameRules, saveGameRules, type GameRules } from './gameRules';
import {
    initI18n,
    t,
    getConfiguredLocale,
    getWebviewStrings,
    normalizeLocale
} from './i18n';
import { handleWebviewMessage, type WebviewHandlerDeps, type WebviewMessage } from './webviewHandlers';
import { importTavernCard } from './tavernCardImporter';
import { loadLorebookForUi, saveLorebookFromUi } from './lorebookLoader';
import { initScenarioDirector, pushScenarioDirectorToWebview } from './scenarioDirector';
import {
    initPartyDirector,
    pushPartyDirectorToWebview,
    savePartyDirectorFromUi
} from './partyDirector';
import {
    getMemoryStatus,
    rebuildMemoryIndex,
    searchMemoryPreview,
    setMemoryBackend
} from './memoryService';
import { interceptPlayerAction } from './companionAgent';
import { initOocSidekick, generateOocCommentary } from './oocSidekick';
import { commitTurn, branchFromTurn } from './gitManager';
import {
    disposeGameStateWatcher,
    initGameStateSync,
    sendCurrentState,
    startGameStateWatcher,
    getGameEntryHistory
} from './gameStateSync';
import {
    getWorkspacePath,
    getGameStatePath,
    getHistoryPath,
    getGmProvider
} from './workspacePaths';
import {
    initGmBridgeRunner,
    invokeGmBridge,
    fallbackToClipboard,
    killGmBridgeProcesses,
    getGmBridgeOutputChannel,
    isGmBridgeBusy
} from './gmBridgeRunner';
import {
    initRemotePlayServer,
    startRemotePlayServer,
    stopRemotePlayServer,
    rotateRemotePlayToken,
    getRemotePlayStatus,
    disposeRemotePlayServer
} from './remotePlayServer';
import {
    runSkillScript,
    killActiveScriptProcess,
    getMemoryBackendSetting
} from './skillScriptRunner';
import {
    loadScenarioPack,
    validateScenarioPack,
    exportScenarioPack
} from './scenarioPack';
import {
    initImageGenRunner,
    getSkillDir,
    runImageGeneration,
    runListImageModels,
    sendImageGenConfig,
    handleUpdateImageGenConfig,
    killImageGenerationProcess
} from './imageGenRunner';
import {
    initMediaManifest,
    sendBgmManifest,
    sendSfxManifest,
    startMediaManifestWatchers
} from './mediaManifest';
import {
    initMediaAgent,
    clearMediaAgentState
} from './mediaAgent';
import {
    initCharacterManager,
    getCharactersDir,
    sendCharacterList,
    saveCharacter,
    setActiveCharacter,
    uploadPortrait,
    generatePortrait,
    addToParty,
    removeFromParty,
    killPortraitProcess,
    getCharacters
} from './characterManager';
import { exportSagaToHtml } from './exportHtml';
import {
    initGmPromptBuilder,
    buildGrokPrompt,
    processProfileUpdates,
    maybeSuggestArchive
} from './gmPromptBuilder';
import {
    initCheckpointHandlers,
    handleEditEntry,
    handleToggleExcludeEntry,
    updateSummary,
    archiveSaga,
    summarizeHistory,
    sendCheckpointList,
    handleUndoLastTurn,
    handleRestoreToTurn,
    handleSaveCheckpoint,
    handleRestoreCheckpoint,
    handleDeleteCheckpoint,
    handleRegenerateLastTurn
} from './checkpointHandlers';
import { checkForUpdates } from './updateManager';

let panel: vscode.WebviewPanel | undefined;
let bgmWatcher: vscode.FileSystemWatcher | undefined;
let sfxWatcher: vscode.FileSystemWatcher | undefined;
let extensionContext: vscode.ExtensionContext | undefined;
let openRouterSettingsWarningShown = false;

const OPENROUTER_SECRET_KEY = 'lorerelay.openrouter.apiKey';
const MAX_PLAYER_INPUT_LENGTH = 2000;

function getPanel(): vscode.WebviewPanel | undefined {
    return panel;
}

export function activate(context: vscode.ExtensionContext) {
    extensionContext = context;
    initI18n(context.extensionPath);

    initImageGenRunner({ getPanel, subscriptions: context.subscriptions });
    initMediaAgent({ getPanel, subscriptions: context.subscriptions });
    initMediaManifest({ getPanel });
    initCharacterManager({ getPanel, onPartyChanged: pushPartyDirectorToWebview });
    initGmPromptBuilder({
        getPanel: () => panel,
        onArchiveNow: archiveSaga
    });
    initOocSidekick(() => panel);
    initCheckpointHandlers({ getPanel, isGameOverActive });
    initGmBridgeRunner({
        getPanel,
        buildGrokPrompt,
        getOpenRouterApiKey,
        subscriptions: context.subscriptions
    });

    initRemotePlayServer({
        extensionPath: context.extensionPath,
        getPanel,
        onPlayerInput: handlePlayerInput,
        isGameOverActive,
        isGmBusy: isGmBridgeBusy,
        subscriptions: context.subscriptions
    });

    initGameStateSync({
        getPanel,
        getGameStatePath,
        getWorkspacePath,
        getSkillDir,
        getHistoryPath,
        processProfileUpdates,
        maybeSuggestArchive,
        appendGmBridgeLog: (line) => getGmBridgeOutputChannel().appendLine(line)
    });
    initScenarioDirector({ getPanel: () => panel });
    initPartyDirector({ getPanel: () => panel });

    const openGameCmd = vscode.commands.registerCommand('textadventure.openGame', () => {
        if (panel) {
            panel.reveal(vscode.ViewColumn.One);
            return;
        }

        const skillDir = getSkillDir();
        const resourceRoots = [
            vscode.Uri.file(path.join(context.extensionPath, 'webview')),
            vscode.Uri.file(path.join(context.extensionPath, 'media')),
            ...(vscode.workspace.workspaceFolders?.map(f => f.uri) || [])
        ];
        if (skillDir) {
            resourceRoots.push(vscode.Uri.file(skillDir));
        }

        panel = vscode.window.createWebviewPanel(
            'textAdventureGame',
            t('webview.panel.title'),
            vscode.ViewColumn.One,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: resourceRoots
            }
        );

        const webviewPath = path.join(context.extensionPath, 'webview');
        const htmlPath = path.join(webviewPath, 'index.html');

        let html = fs.readFileSync(htmlPath, 'utf-8');

        const styleUri = panel.webview.asWebviewUri(
            vscode.Uri.file(path.join(webviewPath, 'style.css'))
        );
        const scriptUri = panel.webview.asWebviewUri(
            vscode.Uri.file(path.join(webviewPath, 'script.js'))
        );
        const nonce = getNonce();

        html = html
            .replace(/\{\{styleUri\}\}/g, styleUri.toString())
            .replace(/\{\{scriptUri\}\}/g, scriptUri.toString())
            .replace(/\{\{cspSource\}\}/g, panel.webview.cspSource)
            .replace(/\{\{nonce\}\}/g, nonce);

        panel.webview.html = html;

        startWatchingGameState();
        sendLocaleBundle();

        panel.webview.onDidReceiveMessage(
            (message) => handleWebviewMessage(message as WebviewMessage, createWebviewHandlerDeps()),
            undefined,
            context.subscriptions
        );

        panel.onDidDispose(() => {
            panel = undefined;
            disposeGameStateWatcher();
            if (bgmWatcher) {
                bgmWatcher.dispose();
                bgmWatcher = undefined;
            }
            if (sfxWatcher) {
                sfxWatcher.dispose();
                sfxWatcher = undefined;
            }
            killGmBridgeProcesses();
            killImageGenerationProcess();
            clearMediaAgentState();
            disposeRemotePlayServer();
            killActiveScriptProcess();
            killPortraitProcess();
        });
    });

    const listModelsCmd = vscode.commands.registerCommand('textadventure.listImageModels', () => {
        runListImageModels();
    });

    const loadScenarioCmd = vscode.commands.registerCommand('textadventure.loadScenario', () => {
        loadScenarioPack();
    });

    const importStCharCmd = vscode.commands.registerCommand('textadventure.importStCharacter', () => {
        importTavernCard();
    });

    const importStLoreCmd = vscode.commands.registerCommand('textadventure.importStLorebook', () => {
        importStLorebook();
    });

    const exportScenarioCmd = vscode.commands.registerCommand('textadventure.exportScenario', () => {
        exportScenarioPack();
    });

    const validateScenarioCmd = vscode.commands.registerCommand('textadventure.validateScenario', () => {
        validateScenarioPack();
    });

    const setOpenRouterKeyCmd = vscode.commands.registerCommand('textadventure.setOpenRouterApiKey', () => {
        void setOpenRouterApiKey(context);
    });

    const clearOpenRouterKeyCmd = vscode.commands.registerCommand('textadventure.clearOpenRouterApiKey', () => {
        void clearOpenRouterApiKey(context);
    });

    const checkForUpdatesCmd = vscode.commands.registerCommand('textadventure.checkForUpdates', () => {
        void checkForUpdates(false, context);
    });

    const startRemotePlayCmd = vscode.commands.registerCommand('textadventure.startRemotePlay', () => {
        void toggleRemotePlay(true);
    });

    const stopRemotePlayCmd = vscode.commands.registerCommand('textadventure.stopRemotePlay', () => {
        void toggleRemotePlay(false);
    });

    const rotateRemotePlayTokenCmd = vscode.commands.registerCommand('textadventure.rotateRemotePlayToken', () => {
        void handleRotateRemotePlayToken();
    });

    context.subscriptions.push(
        openGameCmd,
        listModelsCmd,
        loadScenarioCmd,
        importStCharCmd,
        importStLoreCmd,
        exportScenarioCmd,
        validateScenarioCmd,
        setOpenRouterKeyCmd,
        clearOpenRouterKeyCmd,
        checkForUpdatesCmd,
        startRemotePlayCmd,
        stopRemotePlayCmd,
        rotateRemotePlayTokenCmd
    );

    context.subscriptions.push(
        vscode.workspace.onDidChangeConfiguration((e) => {
            if (e.affectsConfiguration('textAdventure.locale')) {
                sendLocaleBundle();
            }
        })
    );

    // Auto check updates once a day (silent)
    const lastCheck = context.globalState.get<number>('lorerelay.lastUpdateCheck', 0);
    const now = Date.now();
    const checkInterval = 24 * 60 * 60 * 1000; // 24 hours
    if (now - lastCheck > checkInterval) {
        // NOTE: lastUpdateCheck is saved *inside* checkForUpdates on success,
        // so a network failure will retry on the next VS Code startup.
        void checkForUpdates(true, context);
    }
}

function getNonce(): string {
    return randomBytes(16).toString('hex');
}

function sendRemotePlayStatus(): void {
    if (!panel) {
        return;
    }
    panel.webview.postMessage({ type: 'remotePlayStatus', status: getRemotePlayStatus() });
}

async function handleRotateRemotePlayToken(): Promise<void> {
    const status = getRemotePlayStatus();
    if (!status.running) {
        vscode.window.showWarningMessage(t('extension.error.remotePlayNotRunning'));
        return;
    }
    try {
        rotateRemotePlayToken();
        sendRemotePlayStatus();
        const primaryUrl = getRemotePlayStatus().urls[0];
        if (primaryUrl) {
            const picked = await vscode.window.showInformationMessage(
                t('extension.info.remotePlayTokenRotated'),
                t('extension.remotePlay.copyUrl'),
                t('extension.remotePlay.openBrowser')
            );
            if (picked === t('extension.remotePlay.copyUrl')) {
                await vscode.env.clipboard.writeText(primaryUrl);
                vscode.window.showInformationMessage(t('extension.info.remotePlayUrlCopied'));
            } else if (picked === t('extension.remotePlay.openBrowser')) {
                await vscode.env.openExternal(vscode.Uri.parse(primaryUrl));
            }
        }
        void sendCurrentState(0, true);
    } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        vscode.window.showErrorMessage(t('extension.error.remotePlayFailed', { message }));
    }
}

async function toggleRemotePlay(start?: boolean): Promise<void> {
    const running = getRemotePlayStatus().running;
    const shouldStart = start === undefined ? !running : start;

    try {
        if (shouldStart) {
            if (!panel) {
                await vscode.commands.executeCommand('textadventure.openGame');
            }
            const status = await startRemotePlayServer();
            sendRemotePlayStatus();
            const primaryUrl = status.urls[0] || `http://127.0.0.1:${status.port}/?token=${status.token}`;
            const picked = await vscode.window.showInformationMessage(
                t('extension.info.remotePlayStarted'),
                t('extension.remotePlay.copyUrl'),
                t('extension.remotePlay.openBrowser')
            );
            if (picked === t('extension.remotePlay.copyUrl')) {
                await vscode.env.clipboard.writeText(primaryUrl);
                vscode.window.showInformationMessage(t('extension.info.remotePlayUrlCopied'));
            } else if (picked === t('extension.remotePlay.openBrowser')) {
                await vscode.env.openExternal(vscode.Uri.parse(primaryUrl));
            }
            void sendCurrentState(0, true);
        } else if (running) {
            stopRemotePlayServer();
            sendRemotePlayStatus();
            vscode.window.showInformationMessage(t('extension.info.remotePlayStopped'));
        }
    } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        vscode.window.showErrorMessage(t('extension.error.remotePlayFailed', { message }));
    }
}

function sendLocaleBundle(): void {
    if (!panel) {
        return;
    }
    const locale = getConfiguredLocale();
    panel.title = t('webview.panel.title', undefined, locale);
    panel.webview.postMessage({
        type: 'localeBundle',
        locale,
        strings: getWebviewStrings(locale)
    });
}

async function handleLocaleChange(rawLocale: unknown): Promise<void> {
    if (typeof rawLocale !== 'string') {
        return;
    }
    const locale = normalizeLocale(rawLocale);
    const config = vscode.workspace.getConfiguration('textAdventure');
    const target = vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0
        ? vscode.ConfigurationTarget.Workspace
        : vscode.ConfigurationTarget.Global;
    await config.update('locale', locale, target);
    sendLocaleBundle();
}

export async function getOpenRouterApiKey(): Promise<string> {
    const secret = (await extensionContext?.secrets.get(OPENROUTER_SECRET_KEY))?.trim();
    if (secret) {
        return secret;
    }

    const config = vscode.workspace.getConfiguration('textAdventure');
    const legacy = config.get<string>('gmBridge.openRouter.apiKey', '').trim();
    if (legacy && extensionContext) {
        await extensionContext.secrets.store(OPENROUTER_SECRET_KEY, legacy);
        
        // Remove key from global and workspace settings
        await config.update('gmBridge.openRouter.apiKey', undefined, vscode.ConfigurationTarget.Global);
        await config.update('gmBridge.openRouter.apiKey', undefined, vscode.ConfigurationTarget.Workspace);
        
        vscode.window.showInformationMessage(t('extension.info.openRouterKeyMigrated'));
        return legacy;
    }
    return '';
}

async function setOpenRouterApiKey(context: vscode.ExtensionContext): Promise<void> {
    const key = await vscode.window.showInputBox({
        prompt: t('extension.openRouter.keyPrompt'),
        placeHolder: t('extension.openRouter.keyPlaceholder'),
        password: true,
        ignoreFocusOut: true
    });
    if (key === undefined) {
        return;
    }

    const trimmed = key.trim();
    if (!trimmed) {
        vscode.window.showWarningMessage(t('extension.warning.openRouterEmptyKey'));
        return;
    }

    await context.secrets.store(OPENROUTER_SECRET_KEY, trimmed);
    vscode.window.showInformationMessage(t('extension.info.openRouterKeySaved'));
}

async function clearOpenRouterApiKey(context: vscode.ExtensionContext): Promise<void> {
    await context.secrets.delete(OPENROUTER_SECRET_KEY);
    vscode.window.showInformationMessage(t('extension.info.openRouterKeyCleared'));
}




function formatPlayerActionWithNote(playerAction: string, authorsNote?: string): string {
    const note = (authorsNote || '').trim();
    if (!note) {
        return playerAction;
    }
    return `[Author's Note: ${note}]\n${playerAction}`;
}

function isGameOverActive(): boolean {
    const statePath = getGameStatePath();
    if (!statePath || !fs.existsSync(statePath)) {
        return false;
    }
    try {
        const current = JSON.parse(fs.readFileSync(statePath, 'utf-8'));
        return Boolean(current?.gameOver?.active);
    } catch {
        return false;
    }
}

async function handlePlayerInput(text: unknown, authorsNote?: string): Promise<void> {
    if (typeof text !== 'string') {
        vscode.window.showErrorMessage(t('extension.error.invalidInput'));
        return;
    }

    let trimmed = text.trim();
    if (!trimmed) {
        vscode.window.showErrorMessage(t('extension.error.inputEmpty'));
        return;
    }

    if (trimmed.length > MAX_PLAYER_INPUT_LENGTH) {
        vscode.window.showErrorMessage(t('extension.error.inputTooLong', { max: String(MAX_PLAYER_INPUT_LENGTH) }));
        return;
    }

    const diceResult = processDiceMacros(trimmed);
    trimmed = diceResult.text;
    if (!trimmed) {
        vscode.window.showErrorMessage(t('extension.error.inputEmpty'));
        return;
    }

    if (isGameOverActive()) {
        vscode.window.showWarningMessage(t('extension.warning.gameOverLocked'));
        return;
    }

    let processedAuthorsNote: string | undefined = undefined;
    if (authorsNote) {
        const trimmedNote = authorsNote.trim();
        if (trimmedNote.length > 500) {
            vscode.window.showWarningMessage(t('extension.warning.authorsNoteTooLong', { max: '500' }));
        } else if (trimmedNote.length > 0) {
            processedAuthorsNote = trimmedNote;
        }
    }

    let actionForGm = formatPlayerActionWithNote(trimmed, processedAuthorsNote);
    actionForGm = await interceptPlayerAction(actionForGm);

    const provider = getGmProvider();
    if (provider === 'clipboard') {
        await fallbackToClipboard(actionForGm);
        return;
    }

    const ok = await invokeGmBridge(actionForGm, diceResult.ledger);
    if (!ok) {
        await fallbackToClipboard(actionForGm);
    } else {
        const history = getGameEntryHistory();
        const turnIndex = history.filter(e => e.role === 'gm').length;
        
        const config = vscode.workspace.getConfiguration('textAdventure');
        const commitInterval = config.get<number>('gitAutoCommitInterval') ?? 1;
        if (commitInterval > 0 && turnIndex > 0 && (turnIndex % commitInterval === 0)) {
            await commitTurn(turnIndex);
        }

        // Trigger OOC Sidekick asynchronously without blocking the UI
        generateOocCommentary().catch(console.error);
    }
}

async function handleRequestForceSpeak(): Promise<void> {
    const chars = getCharacters();
    if (chars.length === 0) {
        vscode.window.showWarningMessage('No characters available to speak.');
        return;
    }
    const names = chars.map(c => c.name).filter(Boolean);
    const picked = await vscode.window.showQuickPick(names, {
        placeHolder: 'Select a character to force them to speak next'
    });
    if (picked) {
        await handlePlayerInput(`System: Force ${picked} to speak next.`, undefined);
    }
}

async function handleExportHtml(): Promise<void> {
    const uri = await vscode.window.showSaveDialog({
        defaultUri: vscode.Uri.file('saga_archive.html'),
        filters: { 'HTML Files': ['html'] }
    });
    if (uri) {
        await exportSagaToHtml(uri);
    }
}

async function handleBranchTimeline(turnId: string): Promise<void> {
    if (!turnId) return;
    const ok = await branchFromTurn(turnId);
    if (ok) {
        const picked = await vscode.window.showInformationMessage(
            t('extension.info.branchCreated', { turnId }) || `Branched timeline at turn. Reloading workspace to apply.`,
            'Reload Window'
        );
        if (picked === 'Reload Window') {
            await vscode.commands.executeCommand('workbench.action.reloadWindow');
        }
    }
}

function startWatchingGameState() {
    const statePath = getGameStatePath();
    if (!statePath) { return; }

    startGameStateWatcher();

    if (bgmWatcher) { bgmWatcher.dispose(); }
    if (sfxWatcher) { sfxWatcher.dispose(); }
    const watchers = startMediaManifestWatchers();
    bgmWatcher = watchers.bgmWatcher;
    sfxWatcher = watchers.sfxWatcher;
}



async function importStLorebook() {
    const ws = getWorkspacePath();
    if (!ws) {
        vscode.window.showWarningMessage(t('extension.error.workspaceRequired'));
        return;
    }
    const picked = await vscode.window.showOpenDialog({
        canSelectMany: false,
        filters: { 'JSON': ['json'] },
        title: t('extension.st.importLorebookTitle')
    });
    if (!picked?.length) {
        return;
    }
    const lorebookPath = path.join(ws, 'lorebook.json');
    let outPath = lorebookPath;
    if (fs.existsSync(lorebookPath)) {
        outPath = path.join(ws, 'lorebook.imported.json');
    }
    const code = await runSkillScript('import_st_lorebook.py', [picked[0].fsPath, '--out', outPath]);
    if (code === 0) {
        sendLorebookList();
        if (outPath !== lorebookPath) {
            vscode.window.showInformationMessage(t('extension.st.importLorebookPreserved', { path: outPath }));
        } else {
            vscode.window.showInformationMessage(t('extension.st.importLorebookDone', { path: outPath }));
        }
    } else {
        vscode.window.showErrorMessage(t('extension.st.importLorebookFailed'));
    }
}

function sendLorebookList(): void {
    if (!panel) {
        return;
    }
    const data = loadLorebookForUi();
    panel.webview.postMessage({
        type: 'lorebookList',
        sourceFile: data.sourceFile,
        writeFile: data.writeFile,
        entries: data.entries
    });
}

function sendMemoryStatus(): void {
    if (!panel) {
        return;
    }
    panel.webview.postMessage({ type: 'memoryStatus', status: getMemoryStatus() });
}

function sendScenarioDirector(): void {
    pushScenarioDirectorToWebview();
}

function sendPartyDirector(): void {
    pushPartyDirectorToWebview();
}

async function handleSavePartyDirector(raw: unknown): Promise<void> {
    const result = savePartyDirectorFromUi(raw);
    if (!panel) {
        return;
    }
    if (result.ok) {
        panel.webview.postMessage({ type: 'partyDirectorSaved', path: result.path });
        vscode.window.showInformationMessage(
            t('extension.info.partyDirectorSaved', { path: result.path || 'party_director.json' })
        );
    } else {
        vscode.window.showErrorMessage(
            t('extension.error.partyDirectorSaveFailed', { detail: result.error || 'unknown' })
        );
    }
}

async function handleCopyRemotePlayUrl(url: unknown, role?: unknown): Promise<void> {
    const text = typeof url === 'string' ? url.trim() : '';
    if (!text) {
        return;
    }
    await vscode.env.clipboard.writeText(text);
    const key = role === 'spectator'
        ? 'extension.info.remotePlaySpectatorUrlCopied'
        : 'extension.info.remotePlayUrlCopied';
    vscode.window.showInformationMessage(t(key));
}

async function handleSearchMemory(hint: unknown): Promise<void> {
    const text = typeof hint === 'string' ? hint.trim() : '';
    const matches = searchMemoryPreview(text, 10);
    panel?.webview.postMessage({ type: 'memorySearchResult', matches, hint: text });
}

async function handleSetMemoryBackend(backend: unknown): Promise<void> {
    try {
        await setMemoryBackend(String(backend || 'auto'));
        sendMemoryStatus();
        vscode.window.showInformationMessage(t('extension.info.memoryBackendSet', { backend: String(backend) }));
    } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        vscode.window.showErrorMessage(t('extension.error.memoryBackendFailed', { message }));
    }
}

async function handleRebuildMemoryIndex(): Promise<void> {
    try {
        await rebuildMemoryIndex();
        sendMemoryStatus();
        vscode.window.showInformationMessage(t('extension.info.memoryRebuilt'));
    } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        vscode.window.showErrorMessage(t('extension.error.memoryRebuildFailed', { message }));
    }
}

async function handleSaveLorebook(rawEntries: unknown): Promise<void> {
    const entries = Array.isArray(rawEntries) ? rawEntries : [];
    const result = saveLorebookFromUi(entries);
    if (!result.ok) {
        const detail = (result.errors || []).join('; ');
        vscode.window.showErrorMessage(t('extension.error.lorebookSaveFailed', { detail }));
        panel?.webview.postMessage({ type: 'lorebookSaveResult', ok: false, errors: result.errors || [] });
        return;
    }
    void runSkillScript('memory_bank.py', ['--rebuild', '--backend', getMemoryBackendSetting()]);
    sendLorebookList();
    panel?.webview.postMessage({ type: 'lorebookSaveResult', ok: true, path: result.path });
    vscode.window.showInformationMessage(t('extension.info.lorebookSaved', { path: result.path || 'lorebook.json' }));
}

function sendGameRules(): void {
    if (!panel) return;
    const rules = loadGameRules();
    panel.webview.postMessage({ type: 'gameRules', rules });
}

async function handleUpdateGameRules(raw: unknown): Promise<void> {
    if (!raw || typeof raw !== 'object') return;
    saveGameRules(raw as Partial<GameRules>);
    sendGameRules();
}

/** Webview postMessage ルーターへ渡すハンドラ束ね。 */
function createWebviewHandlerDeps(): WebviewHandlerDeps {
    return {
        handlePlayerInput,
        runImageGeneration,
        handleLocaleChange,
        sendLocaleBundle,
        sendCurrentState,
        sendBgmManifest,
        sendSfxManifest,
        sendCharacterList,
        sendCheckpointList,
        sendLorebookList,
        handleSaveLorebook,
        handleSearchMemory,
        handleSetMemoryBackend,
        handleRebuildMemoryIndex,
        sendMemoryStatus,
        sendScenarioDirector,
        sendPartyDirector,
        handleSavePartyDirector,
        handleCopyRemotePlayUrl,
        saveCharacter,
        setActiveCharacter,
        uploadPortrait,
        generatePortrait,
        importTavernCard,
        addToParty,
        removeFromParty,
        summarizeHistory,
        archiveSaga,
        handleUndoLastTurn,
        handleRestoreToTurn,
        handleSaveCheckpoint,
        handleRestoreCheckpoint,
        handleDeleteCheckpoint,
        handleRegenerateLastTurn,
        updateSummary,
        handleEditEntry,
        handleToggleExcludeEntry,
        loadScenarioPack,
        sendImageGenConfig,
        handleUpdateImageGenConfig,
        sendGameRules,
        handleUpdateGameRules,
        toggleRemotePlay,
        sendRemotePlayStatus,
        handleBranchTimeline,
        handleRequestForceSpeak,
        handleExportHtml
    };
}

export function deactivate() {
    disposeGameStateWatcher();
    if (bgmWatcher) {
        bgmWatcher.dispose();
    }
    if (sfxWatcher) {
        sfxWatcher.dispose();
    }
    killGmBridgeProcesses();
    killImageGenerationProcess();
    clearMediaAgentState();
    disposeRemotePlayServer();
    killActiveScriptProcess();
    killPortraitProcess();
}
