import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { spawnSync } from 'child_process';
import { randomBytes } from 'crypto';
import {
    initI18n,
    t,
    getConfiguredLocale,
    getWebviewStrings,
    normalizeLocale
} from './i18n';
import { handleWebviewMessage, type WebviewHandlerDeps, type WebviewMessage } from './webviewHandlers';
import {
    disposeGameStateWatcher,
    initGameStateSync,
    sendCurrentState,
    startGameStateWatcher
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
    getGmBridgeOutputChannel
} from './gmBridgeRunner';
import {
    resolvePythonCommand,
    runSkillScript,
    killActiveScriptProcess
} from './skillScriptRunner';
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
    initCharacterManager,
    getCharactersDir,
    sendCharacterList,
    saveCharacter,
    setActiveCharacter,
    uploadPortrait,
    generatePortrait,
    addToParty,
    removeFromParty
} from './characterManager';
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

    initImageGenRunner({ getPanel });
    initMediaManifest({ getPanel });
    initCharacterManager({ getPanel });
    initGmPromptBuilder({ getPanel, onArchiveNow: archiveSaga });
    initCheckpointHandlers({ getPanel, isGameOverActive });
    initGmBridgeRunner({
        getPanel,
        buildGrokPrompt,
        getOpenRouterApiKey
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

        startWatchingGameState(context);
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
            killActiveScriptProcess();
        });
    });

    const listModelsCmd = vscode.commands.registerCommand('textadventure.listImageModels', () => {
        runListImageModels();
    });

    const loadScenarioCmd = vscode.commands.registerCommand('textadventure.loadScenario', () => {
        loadScenarioPack();
    });

    const importStCharCmd = vscode.commands.registerCommand('textadventure.importStCharacter', () => {
        importStCharacter();
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

    context.subscriptions.push(
        openGameCmd,
        listModelsCmd,
        loadScenarioCmd,
        importStCharCmd,
        importStLoreCmd,
        exportScenarioCmd,
        validateScenarioCmd,
        setOpenRouterKeyCmd,
        clearOpenRouterKeyCmd
    );

    context.subscriptions.push(
        vscode.workspace.onDidChangeConfiguration((e) => {
            if (e.affectsConfiguration('textAdventure.locale')) {
                sendLocaleBundle();
            }
        })
    );
}

function getNonce(): string {
    return randomBytes(16).toString('hex');
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

async function getOpenRouterApiKey(): Promise<string> {
    const secret = (await extensionContext?.secrets.get(OPENROUTER_SECRET_KEY))?.trim();
    if (secret) {
        return secret;
    }

    const config = vscode.workspace.getConfiguration('textAdventure');
    const legacy = config.get<string>('gmBridge.openRouter.apiKey', '').trim();
    if (legacy && !openRouterSettingsWarningShown) {
        openRouterSettingsWarningShown = true;
        vscode.window.showWarningMessage(t('extension.warning.openRouterLegacyKey'));
    }
    return legacy;
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

/** シナリオパック（scenario.json を含むフォルダ）を読み込み、開始シーンをUIに表示する。 */
async function loadScenarioPack() {
    const wsPath = getWorkspacePath();
    if (!wsPath) {
        vscode.window.showWarningMessage(t('extension.error.workspaceRequired'));
        return;
    }

    const picked = await vscode.window.showOpenDialog({
        canSelectFolders: true,
        canSelectFiles: false,
        canSelectMany: false,
        title: t('extension.scenario.openTitle'),
        openLabel: t('extension.scenario.openLabel')
    });
    if (!picked || picked.length === 0) { return; }

    const dir = picked[0].fsPath;
    const scenarioPath = path.join(dir, 'scenario.json');
    if (!fs.existsSync(scenarioPath)) {
        vscode.window.showErrorMessage(t('extension.error.scenarioMissing'));
        return;
    }

    let scenario: any;
    try {
        scenario = JSON.parse(fs.readFileSync(scenarioPath, 'utf-8'));
    } catch (e) {
        vscode.window.showErrorMessage(t('extension.error.scenarioReadFailed', { error: String(e) }));
        return;
    }

    const opening = scenario.opening || {};
    const setup = scenario.setup || {};

    // 開始シーンから game_state.json を生成
    const state: any = {
        entries: [{
            id: 'scenario-opening',
            role: 'gm',
            sender: 'Game Master',
            content: opening.narrative || t('extension.scenario.openingFallback', {
                title: scenario.meta?.title || t('extension.scenario.defaultTitle')
            })
        }],
        status: opening.status || {},
        options: Array.isArray(opening.options) ? opening.options : [],
        theme: setup.theme || 'fantasy'
    };
    if (opening.bgm) { state.bgm = opening.bgm; }
    if (opening.sfx) { state.sfx = opening.sfx; }

    const statePath = getGameStatePath();
    if (!statePath) { return; }

    try {
        fs.writeFileSync(statePath, JSON.stringify(state, null, 2), 'utf-8');
        // GM が参照できるよう scenario.json をワークスペース直下にコピー
        const wsScenario = path.join(wsPath, 'scenario.json');
        if (path.resolve(scenarioPath) !== path.resolve(wsScenario)) {
            fs.copyFileSync(scenarioPath, wsScenario);
        }
    } catch (e) {
        vscode.window.showErrorMessage(t('extension.error.scenarioWriteFailed', { error: String(e) }));
        return;
    }

    // パック専用の BGM / SE があれば設定を切り替える
    const config = vscode.workspace.getConfiguration('textAdventure');
    const packBgm = path.join(dir, 'bgm.json');
    const packSfx = path.join(dir, 'sfx.json');
    const notes: string[] = [];
    if (fs.existsSync(packBgm)) {
        await config.update('bgm.manifestPath', packBgm, vscode.ConfigurationTarget.Workspace);
        notes.push(t('extension.scenario.notesBgm'));
    }
    if (fs.existsSync(packSfx)) {
        await config.update('sfx.manifestPath', packSfx, vscode.ConfigurationTarget.Workspace);
        notes.push(t('extension.scenario.notesSe'));
    }

    // パネルを開く（既に開いていれば reveal）
    await vscode.commands.executeCommand('textadventure.openGame');
    // 反映（パネル生成直後の場合は requestState 側でも送られるが念のため）
    setTimeout(() => {
        sendCurrentState(0, true);
        sendBgmManifest();
        sendSfxManifest();
    }, 400);

    const extra = notes.length
        ? t('extension.info.scenarioExtra', { notes: notes.join(' / ') })
        : '';
    vscode.window.showInformationMessage(
        t('extension.info.scenarioLoaded', {
            title: scenario.meta?.title || t('extension.scenario.defaultTitle'),
            extra
        })
    );
}

function resolvePackageScenarioScript(): string | undefined {
    const candidates = [
        path.join(__dirname, '..', 'scripts', 'package_scenario.py'),
        path.join('C:', 'AI', 'text-adventure-vsce', 'scripts', 'package_scenario.py')
    ];
    for (const p of candidates) {
        if (fs.existsSync(p)) {
            return p;
        }
    }
    return undefined;
}

function validateScenarioData(scenario: Record<string, unknown>): string[] {
    const errors: string[] = [];
    if (scenario.format !== 'text-adventure-scenario/1.0') {
        errors.push('format must be text-adventure-scenario/1.0');
    }
    const meta = scenario.meta as Record<string, unknown> | undefined;
    if (!meta?.title) {
        errors.push('meta.title is required');
    }
    const opening = scenario.opening as Record<string, unknown> | undefined;
    if (!opening?.narrative) {
        errors.push('opening.narrative is required');
    }
    return errors;
}

async function validateScenarioPack() {
    const picked = await vscode.window.showOpenDialog({
        canSelectFolders: true,
        canSelectFiles: false,
        canSelectMany: false,
        title: t('extension.scenario.validateTitle'),
        openLabel: t('extension.scenario.validateLabel')
    });
    if (!picked?.length) {
        return;
    }
    const dir = picked[0].fsPath;
    const scenarioPath = path.join(dir, 'scenario.json');
    if (!fs.existsSync(scenarioPath)) {
        vscode.window.showErrorMessage(t('extension.error.scenarioMissing'));
        return;
    }
    try {
        const scenario = JSON.parse(fs.readFileSync(scenarioPath, 'utf-8')) as Record<string, unknown>;
        const errors = validateScenarioData(scenario);
        const workshopPath = path.join(dir, 'workshop.json');
        const hasWorkshop = fs.existsSync(workshopPath);
        if (errors.length) {
            vscode.window.showWarningMessage(t('extension.warning.scenarioInvalid', { errors: errors.join('; ') }));
            return;
        }
        const title = (scenario.meta as Record<string, unknown>)?.title || dir;
        vscode.window.showInformationMessage(
            t('extension.info.scenarioValid', { title: String(title), workshop: hasWorkshop ? 'yes' : 'no' })
        );
    } catch (e) {
        vscode.window.showErrorMessage(t('extension.error.scenarioReadFailed', { error: String(e) }));
    }
}

async function exportScenarioPack() {
    const picked = await vscode.window.showOpenDialog({
        canSelectFolders: true,
        canSelectFiles: false,
        canSelectMany: false,
        title: t('extension.scenario.exportTitle'),
        openLabel: t('extension.scenario.exportLabel')
    });
    if (!picked?.length) {
        return;
    }
    const dir = picked[0].fsPath;
    const scenarioPath = path.join(dir, 'scenario.json');
    if (!fs.existsSync(scenarioPath)) {
        vscode.window.showErrorMessage(t('extension.error.scenarioMissing'));
        return;
    }
    try {
        const scenario = JSON.parse(fs.readFileSync(scenarioPath, 'utf-8')) as Record<string, unknown>;
        const errors = validateScenarioData(scenario);
        if (errors.length) {
            vscode.window.showWarningMessage(t('extension.warning.scenarioInvalid', { errors: errors.join('; ') }));
            return;
        }
    } catch (e) {
        vscode.window.showErrorMessage(t('extension.error.scenarioReadFailed', { error: String(e) }));
        return;
    }

    const defaultName = `${path.basename(dir)}.zip`;
    const outPick = await vscode.window.showSaveDialog({
        defaultUri: vscode.Uri.file(path.join(dir, defaultName)),
        filters: { 'ZIP': ['zip'] },
        title: t('extension.scenario.exportSaveTitle')
    });
    if (!outPick) {
        return;
    }

    const script = resolvePackageScenarioScript();
    if (!script) {
        vscode.window.showErrorMessage(t('extension.error.packageScriptNotFound'));
        return;
    }
    const python = resolvePythonCommand();
    const result = spawnSync(python, [script, '--dir', dir, '--out', outPick.fsPath], {
        cwd: dir,
        encoding: 'utf-8'
    });
    if (result.status !== 0) {
        vscode.window.showErrorMessage(t('extension.error.scenarioExportFailed', {
            error: (result.stderr || result.stdout || '').trim() || String(result.status)
        }));
        return;
    }
    const title = (JSON.parse(fs.readFileSync(scenarioPath, 'utf-8')) as Record<string, unknown>).meta as Record<string, unknown>;
    vscode.window.showInformationMessage(
        t('extension.info.scenarioExported', { title: String(title?.title || path.basename(dir)), path: outPick.fsPath })
    );
}


function validatePlayerInput(text: unknown): string | undefined {
    if (typeof text !== 'string') {
        return undefined;
    }
    const trimmed = text.trim();
    if (!trimmed || trimmed.length > MAX_PLAYER_INPUT_LENGTH) {
        return undefined;
    }
    return trimmed;
}

function formatPlayerActionWithNote(playerAction: string, authorsNote?: string): string {
    const note = (authorsNote || '').trim();
    if (!note || note.length > 500) {
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
    const playerAction = validatePlayerInput(text);
    if (!playerAction) {
        vscode.window.showErrorMessage(t('extension.error.invalidInput'));
        return;
    }

    if (isGameOverActive()) {
        vscode.window.showWarningMessage(t('extension.warning.gameOverLocked'));
        return;
    }

    const actionForGm = formatPlayerActionWithNote(playerAction, authorsNote);

    const provider = getGmProvider();
    if (provider === 'clipboard') {
        await fallbackToClipboard(actionForGm);
        return;
    }

    const ok = await invokeGmBridge(actionForGm);
    if (!ok) {
        await fallbackToClipboard(actionForGm);
    }
}

function startWatchingGameState(context: vscode.ExtensionContext) {
    const statePath = getGameStatePath();
    if (!statePath) { return; }

    startGameStateWatcher(context);

    if (bgmWatcher) { bgmWatcher.dispose(); }
    if (sfxWatcher) { sfxWatcher.dispose(); }
    const watchers = startMediaManifestWatchers(context);
    bgmWatcher = watchers.bgmWatcher;
    sfxWatcher = watchers.sfxWatcher;
}

async function importStCharacter() {
    const ws = getWorkspacePath();
    if (!ws) {
        vscode.window.showWarningMessage(t('extension.error.workspaceRequired'));
        return;
    }
    const picked = await vscode.window.showOpenDialog({
        canSelectMany: false,
        filters: { 'SillyTavern Card': ['png', 'json'] },
        title: t('extension.st.importCharacterTitle')
    });
    if (!picked?.length) {
        return;
    }
    const charDir = getCharactersDir();
    if (!charDir) {
        return;
    }
    const code = await runSkillScript('import_st_card.py', [
        picked[0].fsPath,
        '--out-dir', charDir,
        '--set-active'
    ]);
    if (code === 0) {
        sendCharacterList();
        vscode.window.showInformationMessage(t('extension.st.importCharacterDone'));
    } else {
        vscode.window.showErrorMessage(t('extension.st.importCharacterFailed'));
    }
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
        if (outPath !== lorebookPath) {
            vscode.window.showInformationMessage(t('extension.st.importLorebookPreserved', { path: outPath }));
        } else {
            vscode.window.showInformationMessage(t('extension.st.importLorebookDone', { path: outPath }));
        }
    } else {
        vscode.window.showErrorMessage(t('extension.st.importLorebookFailed'));
    }
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
        saveCharacter,
        setActiveCharacter,
        uploadPortrait,
        generatePortrait,
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
        handleUpdateImageGenConfig
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
    killActiveScriptProcess();
}
