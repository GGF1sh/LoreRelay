import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { spawn, spawnSync, ChildProcess } from 'child_process';
import { randomBytes } from 'crypto';
import type { GameEntry, HiddenDiceEntry, ProfileUpdate, SceneSprite } from './types/GameState';
import {
    buildStateFromGmEntry,
    deleteCheckpointFile,
    findLastGmEntry,
    listCheckpointMetas,
    listRewindTargets,
    loadCheckpointFile,
    saveCheckpointFile,
    truncateHistoryOneTurn,
    truncateHistoryToGmEntry
} from './checkpoint';
import type { CharacterProfile } from './types/Character';
import {
    initI18n,
    t,
    getConfiguredLocale,
    getWebviewStrings,
    normalizeLocale,
    type SupportedLocale
} from './i18n';
import { buildMemoryPromptContext, buildSagaPromptContext, type MemoryChunk } from './memoryBank';
import {
    computeArchiveMilestone,
    getArchiveRemindStep,
    getArchiveThreshold,
    getContextTier,
    isArchiveAutoPromptEnabled,
    supportsArchivePrompt,
    type GmProvider
} from './archivePrompt';
import {
    filterValidCharacterIds,
    isValidCharacterId,
    resolveCharacterJsonPath,
    resolvePortraitPath
} from './characterId';
import {
    formatRedactedAction,
    maskSensitiveFileInArgs,
    safeUnlinkPlayerActionFile,
    writePlayerActionFile,
    writePromptFile
} from './playerAction';
import { validateGameState } from './validateGameState';
import {
    getImageGenConfigPath,
    loadImageGenConfig,
    saveImageGenConfig,
    sanitizeImageGenConfig,
    type ImageGenConfig
} from './imageGenConfig';

let panel: vscode.WebviewPanel | undefined;
let fileWatcher: vscode.FileSystemWatcher | undefined;
let bgmWatcher: vscode.FileSystemWatcher | undefined;
let sfxWatcher: vscode.FileSystemWatcher | undefined;
let imageOutputChannel: vscode.OutputChannel | undefined;
let grokOutputChannel: vscode.OutputChannel | undefined;
let grokProcess: ChildProcess | undefined;
let imageGenerationProcess: ChildProcess | undefined;
let activeScriptProcess: ChildProcess | undefined;
let extensionContext: vscode.ExtensionContext | undefined;
let grokSessionActive = false;
let localGmSessionActive = false;
let debounceTimer: NodeJS.Timeout | undefined;

let gameEntryHistory: GameEntry[] = [];
const seenEntryIds = new Set<string>();
let schemaWarningShown = false;
let openRouterSettingsWarningShown = false;

const CHARACTER_META_FILES = new Set(['party.json', 'dynamic_profiles.json']);
const OPENROUTER_SECRET_KEY = 'lorerelay.openrouter.apiKey';

/** 最後にアーカイブ促しを出したマイルストーン（重複防止） */
let lastArchivePromptMilestone = 0;

const MAX_PLAYER_INPUT_LENGTH = 2000;

export function activate(context: vscode.ExtensionContext) {
    extensionContext = context;
    initI18n(context.extensionPath);

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
            async (message) => {
                switch (message.type) {
                    case 'selectOption':
                    case 'freeInput':
                        await handlePlayerInput(
                            message.text,
                            typeof message.authorsNote === 'string' ? message.authorsNote : undefined
                        );
                        break;
                    case 'generateImage':
                        await runImageGeneration(
                            message.prompt,
                            message.mode,
                            typeof message.entryId === 'string' ? message.entryId : undefined
                        );
                        break;
                    case 'setLocale':
                        await handleLocaleChange(message.locale);
                        break;
                    case 'requestState':
                        sendLocaleBundle();
                        sendCurrentState(0, true);
                        sendBgmManifest();
                        sendSfxManifest();
                        sendCharacterList();
                        sendCheckpointList();
                        break;
                    case 'loadCharacters':
                        sendCharacterList();
                        break;
                    case 'saveCharacter':
                        if (message.character?.id && isValidCharacterId(message.character.id)) {
                            saveCharacter(message.character);
                            if (message.inParty) {
                                addToParty(message.character.id);
                            }
                        } else {
                            vscode.window.showWarningMessage(t('extension.error.invalidCharacterId'));
                        }
                        break;
                    case 'setActiveCharacter':
                        if (isValidCharacterId(message.id)) {
                            setActiveCharacter(message.id);
                        } else {
                            vscode.window.showWarningMessage(t('extension.error.invalidCharacterId'));
                        }
                        break;
                    case 'uploadPortrait':
                        if (isValidCharacterId(message.id)) {
                            await uploadPortrait(message.id);
                        } else {
                            vscode.window.showWarningMessage(t('extension.error.invalidCharacterId'));
                        }
                        break;
                    case 'generatePortrait':
                        if (isValidCharacterId(message.id)) {
                            await generatePortrait(message.id);
                        } else {
                            vscode.window.showWarningMessage(t('extension.error.invalidCharacterId'));
                        }
                        break;
                    case 'addToParty':
                        if (isValidCharacterId(message.id)) {
                            addToParty(message.id);
                        }
                        break;
                    case 'removeFromParty':
                        if (isValidCharacterId(message.id)) {
                            removeFromParty(message.id);
                        }
                        break;
                    case 'summarizeHistory':
                        await summarizeHistory();
                        break;
                    case 'archiveSaga':
                        await archiveSaga();
                        break;
                    case 'undoLastTurn':
                        await handleUndoLastTurn();
                        break;
                    case 'restoreToTurn':
                        if (typeof message.entryId === 'string') {
                            await handleRestoreToTurn(message.entryId);
                        }
                        break;
                    case 'saveCheckpoint':
                        await handleSaveCheckpoint(typeof message.label === 'string' ? message.label : undefined);
                        break;
                    case 'restoreCheckpoint':
                        if (typeof message.checkpointId === 'string') {
                            await handleRestoreCheckpoint(message.checkpointId);
                        }
                        break;
                    case 'deleteCheckpoint':
                        if (typeof message.checkpointId === 'string') {
                            await handleDeleteCheckpoint(message.checkpointId);
                        }
                        break;
                    case 'listCheckpoints':
                        sendCheckpointList();
                        break;
                    case 'regenerateLastTurn':
                        await handleRegenerateLastTurn();
                        break;
                    case 'updateSummary':
                        updateSummary(message.summary);
                        break;
                    case 'editEntry':
                        if (typeof message.id === 'string' && isValidEntryId(message.id) &&
                            typeof message.content === 'string') {
                            await handleEditEntry(message.id, message.content);
                        }
                        break;
                    case 'toggleExcludeEntry':
                        if (typeof message.id === 'string' && isValidEntryId(message.id)) {
                            await handleToggleExcludeEntry(message.id);
                        }
                        break;
                    case 'branchFromEntry':
                        if (typeof message.entryId === 'string' && isValidEntryId(message.entryId)) {
                            await handleRestoreToTurn(message.entryId);
                        }
                        break;
                    case 'loadScenario':
                        await loadScenarioPack();
                        break;
                    case 'requestImageGenConfig':
                        sendImageGenConfig();
                        break;
                    case 'updateImageGenConfig':
                        await handleUpdateImageGenConfig(message.config);
                        break;
                }
            },
            undefined,
            context.subscriptions
        );

        panel.onDidDispose(() => {
            panel = undefined;
            if (fileWatcher) {
                fileWatcher.dispose();
                fileWatcher = undefined;
            }
            if (bgmWatcher) {
                bgmWatcher.dispose();
                bgmWatcher = undefined;
            }
            if (sfxWatcher) {
                sfxWatcher.dispose();
                sfxWatcher = undefined;
            }
            if (debounceTimer) {
                clearTimeout(debounceTimer);
                debounceTimer = undefined;
            }
            if (grokProcess) {
                grokProcess.kill();
                grokProcess = undefined;
            }
            if (gmProcess) {
                gmProcess.kill();
                gmProcess = undefined;
            }
            if (imageGenerationProcess) {
                imageGenerationProcess.kill();
                imageGenerationProcess = undefined;
            }
            if (activeScriptProcess) {
                activeScriptProcess.kill();
                activeScriptProcess = undefined;
            }
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

function gmLanguageName(locale?: SupportedLocale): string {
    const loc = locale ?? getConfiguredLocale();
    return t(`gm.languageName.${loc}`, undefined, loc);
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

/** ComfyUI/StabilityMatrix から利用可能なチェックポイント一覧を取得して Output に表示する。 */
function runListImageModels() {
    const wsPath = getWorkspacePath() || process.cwd();
    const scriptPath = resolveComfyScript(wsPath);
    if (!scriptPath) {
        vscode.window.showWarningMessage(t('extension.error.comfyScriptNotFound'));
        return;
    }

    if (!imageOutputChannel) {
        imageOutputChannel = vscode.window.createOutputChannel('Text Adventure: Image Gen');
    }
    const env = buildImageGenEnv(wsPath);
    imageOutputChannel.show(true);
    imageOutputChannel.appendLine(`\n=== List Image Models (${env.COMFYUI_URL || 'http://127.0.0.1:8188'}) ===`);

    const child = spawn('python', [scriptPath, '--list-models'], { shell: false, env });
    child.stdout.on('data', (data) => imageOutputChannel?.append(data.toString()));
    child.stderr.on('data', (data) => imageOutputChannel?.append(data.toString()));
    child.on('error', (err) => {
        imageOutputChannel?.appendLine(`\n[Error: ${err.message}]`);
        vscode.window.showErrorMessage(t('extension.error.pythonFailed', { message: err.message }));
    });
    child.on('close', (code) => {
        imageOutputChannel?.appendLine(`\n[exited with code ${code}]`);
    });
}

/** マルチルート時は textAdventure.workspaceFolder で名前指定、未設定なら先頭フォルダ。 */
function getActiveWorkspaceFolder(): vscode.WorkspaceFolder | undefined {
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

function getGameStatePath(): string | undefined {
    const folder = getActiveWorkspaceFolder();
    return folder ? path.join(folder.uri.fsPath, 'game_state.json') : undefined;
}

function getWorkspacePath(): string | undefined {
    return getActiveWorkspaceFolder()?.uri.fsPath;
}

function getGmProvider(): GmProvider {
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

function getHistoryPath(): string | undefined {
    const ws = getWorkspacePath();
    return ws ? path.join(ws, 'game_history.json') : undefined;
}

/** 再起動後も履歴を保持するため game_history.json から読み込む。 */
function loadHistoryFromDisk() {
    const histPath = getHistoryPath();
    if (!histPath || !fs.existsSync(histPath)) { return; }
    try {
        const entries: GameEntry[] = JSON.parse(fs.readFileSync(histPath, 'utf-8'));
        if (Array.isArray(entries)) {
            for (const e of entries) {
                if (isValidGameEntry(e) && !seenEntryIds.has(e.id)) {
                    seenEntryIds.add(e.id);
                    gameEntryHistory.push(e);
                }
            }
        }
    } catch (e) {
        console.error('Error loading game_history.json:', e);
    }
}

function saveHistoryToDisk() {
    const histPath = getHistoryPath();
    if (!histPath) { return; }
    try {
        fs.writeFileSync(histPath, JSON.stringify(gameEntryHistory, null, 2), 'utf-8');
    } catch (e) {
        console.error('Error saving game_history.json:', e);
    }
}

/** Saga アーカイブ後に game_history.json の変更をメモリ上の履歴へ反映する */
function replaceHistoryFromDisk(): void {
    gameEntryHistory = [];
    seenEntryIds.clear();
    loadHistoryFromDisk();
}

/** comfyui_generate.py の場所を設定・既知パスから解決する。 */
function resolveComfyScript(wsPath: string): string | undefined {
    const config = vscode.workspace.getConfiguration('textAdventure');
    let scriptPath = config.get<string>('skillPath') || '';

    if (!scriptPath || !fs.existsSync(scriptPath)) {
        const possiblePaths = [
            path.join('C:', 'AI', 'TextAdventureGMSkill', 'scripts', 'comfyui_generate.py'),
            path.join(wsPath, '.agents', 'skills', 'text-adventure-gm', 'scripts', 'comfyui_generate.py'),
            path.join(wsPath, '.grok', 'skills', 'text-adventure-gm', 'scripts', 'comfyui_generate.py')
        ];
        scriptPath = '';
        for (const p of possiblePaths) {
            if (fs.existsSync(p)) { scriptPath = p; break; }
        }
    }
    return scriptPath || undefined;
}

/** 画像生成バックエンド設定を comfyui_generate.py へ渡す環境変数として構築する。 */
function buildImageGenEnv(wsPath?: string): NodeJS.ProcessEnv {
    const vsConfig = vscode.workspace.getConfiguration('textAdventure');
    const env: NodeJS.ProcessEnv = { ...process.env };
    const wsConfig = wsPath ? loadImageGenConfig(wsPath) : undefined;

    if (wsPath) {
        env.TA_IMAGE_CONFIG = getImageGenConfigPath(wsPath);
    }

    const url = vsConfig.get<string>('imageGen.comfyuiUrl', '').trim();
    if (url) { env.COMFYUI_URL = url; }

    const checkpoint = wsConfig?.checkpoint || vsConfig.get<string>('imageGen.checkpoint', '').trim();
    if (checkpoint) { env.TA_CHECKPOINT = checkpoint; }

    const workflowPath = wsConfig?.workflowPath || vsConfig.get<string>('imageGen.workflowPath', '').trim();
    if (workflowPath) { env.TA_WORKFLOW = workflowPath; }

    const steps = (wsConfig && wsConfig.steps > 0) ? wsConfig.steps : vsConfig.get<number>('imageGen.steps', 0);
    if (steps > 0) { env.TA_STEPS = String(steps); }
    const cfgVal = (wsConfig && wsConfig.cfg > 0) ? wsConfig.cfg : vsConfig.get<number>('imageGen.cfg', 0);
    if (cfgVal > 0) { env.TA_CFG = String(cfgVal); }
    const width = (wsConfig && wsConfig.width > 0) ? wsConfig.width : vsConfig.get<number>('imageGen.width', 0);
    if (width > 0) { env.TA_WIDTH = String(width); }
    const height = (wsConfig && wsConfig.height > 0) ? wsConfig.height : vsConfig.get<number>('imageGen.height', 0);
    if (height > 0) { env.TA_HEIGHT = String(height); }

    if (wsConfig?.samplerName) { env.TA_SAMPLER = wsConfig.samplerName; }
    if (wsConfig?.scheduler) { env.TA_SCHEDULER = wsConfig.scheduler; }
    if (wsConfig?.positivePrefix) { env.TA_POSITIVE_PREFIX = wsConfig.positivePrefix; }
    if (wsConfig?.positiveSuffix) { env.TA_POSITIVE_SUFFIX = wsConfig.positiveSuffix; }
    if (wsConfig?.negativePrompt) { env.TA_NEGATIVE_PROMPT = wsConfig.negativePrompt; }
    if (wsConfig?.mode) { env.TA_MODE = wsConfig.mode; }

    return env;
}

function sendImageGenConfig(): void {
    const wsPath = getWorkspacePath();
    if (!wsPath) {
        panel?.webview.postMessage({ type: 'imageGenConfig', config: sanitizeImageGenConfig({}) });
        return;
    }
    panel?.webview.postMessage({ type: 'imageGenConfig', config: loadImageGenConfig(wsPath) });
}

async function handleUpdateImageGenConfig(raw: unknown): Promise<void> {
    const wsPath = getWorkspacePath();
    if (!wsPath) {
        vscode.window.showWarningMessage(t('extension.error.workspaceRequired'));
        return;
    }
    try {
        const current = loadImageGenConfig(wsPath);
        const partial = (raw && typeof raw === 'object') ? raw as Partial<ImageGenConfig> : {};
        const saved = saveImageGenConfig(wsPath, { ...current, ...partial, templates: { ...current.templates, ...(partial.templates || {}) } });
        panel?.webview.postMessage({ type: 'imageGenConfig', config: saved });
    } catch (e) {
        console.error('Failed to save image_gen_config.json:', e);
        vscode.window.showErrorMessage(t('extension.error.imageGenConfigSaveFailed'));
    }
}

function getGrokOutputChannel(): vscode.OutputChannel {
    if (!grokOutputChannel) {
        grokOutputChannel = vscode.window.createOutputChannel('Text Adventure: GM Bridge');
    }
    return grokOutputChannel;
}

/** ollama_gm.py / koboldcpp_gm.py の場所を設定・既知パスから解決する。 */
function resolveGmBridgeScript(scriptName: string): string | undefined {
    const config = vscode.workspace.getConfiguration('textAdventure');
    const configured = config.get<string>('gmBridge.scriptPath', '').trim();
    if (configured) {
        const dir = path.dirname(configured);
        const candidate = path.join(dir, scriptName);
        if (fs.existsSync(candidate)) {
            return candidate;
        }
    }

    const skillScript = config.get<string>('skillPath', '').trim();
    if (skillScript) {
        const dir = path.dirname(skillScript);
        const candidate = path.join(dir, scriptName);
        if (fs.existsSync(candidate)) {
            return candidate;
        }
    }

    const wsPath = getWorkspacePath() || process.cwd();
    const possibleDirs = [
        path.join('C:', 'AI', 'TextAdventureGMSkill', 'scripts'),
        path.join(wsPath, '.agents', 'skills', 'text-adventure-gm', 'scripts'),
        path.join(wsPath, '.grok', 'skills', 'text-adventure-gm', 'scripts')
    ];
    for (const dir of possibleDirs) {
        const candidate = path.join(dir, scriptName);
        if (fs.existsSync(candidate)) {
            return candidate;
        }
    }
    return undefined;
}

function resolvePythonCommand(): string {
    const config = vscode.workspace.getConfiguration('textAdventure');
    return config.get<string>('gmBridge.python', 'python').trim() || 'python';
}

function buildLocalGmEnv(provider: 'ollama' | 'koboldcpp' | 'openrouter'): NodeJS.ProcessEnv {
    const config = vscode.workspace.getConfiguration('textAdventure');
    const env: NodeJS.ProcessEnv = { ...process.env };
    const python = resolvePythonCommand();
    if (python) {
        env.TA_GM_PYTHON = python;
    }
    env.TA_LOCALE = getConfiguredLocale();
    env.TA_MEMORY_BACKEND = getMemoryBackendSetting();

    if (provider === 'ollama') {
        const url = config.get<string>('gmBridge.ollama.url', '').trim();
        const model = config.get<string>('gmBridge.ollama.model', '').trim();
        if (url) { env.OLLAMA_URL = url; }
        if (model) { env.OLLAMA_MODEL = model; }
    } else if (provider === 'koboldcpp') {
        const url = config.get<string>('gmBridge.koboldcpp.url', '').trim();
        if (url) { env.KOBOLDCPP_URL = url; }
    } else if (provider === 'openrouter') {
        const model = config.get<string>('gmBridge.openRouter.model', '').trim();
        if (model) { env.OPENROUTER_MODEL = model; }
    }
    return env;
}

function resolveGrokCommand(configured: string): string {
    if (configured && configured !== 'grok') {
        return configured;
    }
    const home = process.env.USERPROFILE || process.env.HOME || '';
    const winPath = path.join(home, '.grok', 'bin', 'grok.exe');
    if (process.platform === 'win32' && fs.existsSync(winPath)) {
        return winPath;
    }
    return 'grok';
}

interface LorebookEntry {
    id?: string;
    keys?: string[];
    content?: string;
    comment?: string;
    priority?: number;
    enabled?: boolean;
}

function loadCharacterById(id: string): CharacterProfile | undefined {
    const charDir = getCharactersDir();
    if (!charDir) {
        return undefined;
    }
    const filePath = path.join(charDir, `${id}.json`);
    if (!fs.existsSync(filePath)) {
        return undefined;
    }
    try {
        return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as CharacterProfile;
    } catch {
        return undefined;
    }
}

function getActiveCharacterProfile(): CharacterProfile | undefined {
    const id = getActiveCharacterId();
    return id ? loadCharacterById(id) : undefined;
}

function loadDynamicProfiles(): Record<string, string> {
    const charDir = getCharactersDir();
    if (!charDir) {
        return {};
    }
    const dynPath = path.join(charDir, 'dynamic_profiles.json');
    if (!fs.existsSync(dynPath)) {
        return {};
    }
    try {
        const raw = JSON.parse(fs.readFileSync(dynPath, 'utf-8'));
        return raw && typeof raw === 'object' && !Array.isArray(raw) ? raw as Record<string, string> : {};
    } catch {
        return {};
    }
}

function getPartyMemberIds(): string[] {
    const ids = [...getPartyIds()];
    const activeId = getActiveCharacterId();
    if (activeId && !ids.includes(activeId)) {
        ids.unshift(activeId);
    }
    return ids;
}

function buildPartyPromptContext(): string {
    const dynProfiles = loadDynamicProfiles();
    const ids = getPartyMemberIds();
    if (ids.length === 0) {
        return '';
    }
    const lines = ['[Party Members / Active Characters]'];
    for (const id of ids) {
        const char = loadCharacterById(id);
        if (!char) {
            continue;
        }
        lines.push(`--- ${char.name} (ID: ${id}) ---`);
        lines.push(`Description: ${char.description}`);
        lines.push(`Personality: ${char.personality}`);
        if (char.stSource?.first_mes) {
            lines.push(`Opening line hint: ${char.stSource.first_mes}`);
        }
        if (dynProfiles[id]) {
            lines.push(`Dynamic memory: ${dynProfiles[id]}`);
        }
    }
    lines.push('Have party members react in character, converse with each other, and adapt gear to the current world theme.');
    return lines.join('\n');
}

function loadStorySummary(): string {
    const statePath = getGameStatePath();
    if (!statePath || !fs.existsSync(statePath)) {
        return '';
    }
    try {
        const state = JSON.parse(fs.readFileSync(statePath, 'utf-8'));
        return typeof state.summary === 'string' ? state.summary.trim() : '';
    } catch {
        return '';
    }
}

function loadLorebookEntries(): LorebookEntry[] {
    const ws = getWorkspacePath();
    if (!ws) {
        return [];
    }
    const candidates = [path.join(ws, 'lorebook.json'), path.join(ws, 'world_info.json')];
    for (const p of candidates) {
        if (!fs.existsSync(p)) {
            continue;
        }
        try {
            const raw = JSON.parse(fs.readFileSync(p, 'utf-8'));
            if (Array.isArray(raw.entries)) {
                return raw.entries.filter((e: LorebookEntry) => e.enabled !== false);
            }
        } catch {
            /* try next */
        }
    }
    return [];
}

function matchLorebookEntries(text: string, maxEntries = 5): LorebookEntry[] {
    const hay = text.toLowerCase();
    const hits: Array<{ priority: number; entry: LorebookEntry }> = [];
    for (const entry of loadLorebookEntries()) {
        const keys = entry.keys || [];
        const matched = keys.some((k) => {
            const key = String(k).trim().toLowerCase();
            return key.length > 0 && hay.includes(key);
        });
        if (matched) {
            hits.push({ priority: entry.priority ?? 0, entry });
        }
    }
    hits.sort((a, b) => b.priority - a.priority);
    return hits.slice(0, maxEntries).map((h) => h.entry);
}

/** textAdventure.memory.backend — tfidf | chromadb | auto */
function getMemoryBackendSetting(): string {
    const config = vscode.workspace.getConfiguration('textAdventure');
    const v = config.get<string>('memory.backend', 'auto').trim().toLowerCase();
    if (v === 'tfidf' || v === 'chromadb' || v === 'auto') {
        return v;
    }
    return 'auto';
}

/** Chroma / auto 時は Python memory_bank.py 経由で embedding 検索 */
function resolveMemoriesViaPython(ws: string, hintText: string, backend: string): MemoryChunk[] {
    const scriptPath = resolveGmBridgeScript('memory_bank.py');
    if (!scriptPath) {
        return [];
    }
    const python = resolvePythonCommand();
    const result = spawnSync(
        python,
        [
            scriptPath,
            '--cwd', ws,
            '--resolve',
            '--json',
            '--text', hintText,
            '--max', '3',
            '--backend', backend
        ],
        { encoding: 'utf-8', timeout: 15000 }
    );
    if (result.status !== 0 || !result.stdout?.trim()) {
        return [];
    }
    try {
        const parsed = JSON.parse(result.stdout.trim());
        return Array.isArray(parsed) ? parsed as MemoryChunk[] : [];
    } catch {
        return [];
    }
}

function formatMemoryPromptFromChunks(matches: MemoryChunk[]): string {
    if (matches.length === 0) {
        return '';
    }
    const parts = ['[Memory Bank — relevant memories]'];
    for (const m of matches) {
        parts.push(`--- ${m.label || m.id} (${m.source}) ---`);
        parts.push(String(m.text || '').trim());
    }
    return parts.join('\n');
}

/** GM プロンプト用メモリ文脈（backend 設定に応じて TS / Python を切替） */
function buildMemoryContextForPrompt(ws: string, hintText: string): string {
    const backend = getMemoryBackendSetting();
    if (backend === 'tfidf') {
        return buildMemoryPromptContext(ws, hintText, 3);
    }
    const viaPy = formatMemoryPromptFromChunks(resolveMemoriesViaPython(ws, hintText, backend));
    if (viaPy) {
        return viaPy;
    }
    return buildMemoryPromptContext(ws, hintText, 3);
}

/** 履歴が閾値を超えたら Webview + 通知で章アーカイブを促す（プロバイダー別閾値） */
function maybeSuggestArchive(): void {
    if (!isArchiveAutoPromptEnabled() || !panel) {
        return;
    }
    const provider = getGmProvider();
    if (!supportsArchivePrompt(provider)) {
        return;
    }
    const config = vscode.workspace.getConfiguration('textAdventure');
    const orModel = config.get<string>('gmBridge.openRouter.model', '');
    const threshold = getArchiveThreshold(provider, orModel);
    const remindStep = getArchiveRemindStep();
    const count = gameEntryHistory.length;
    const milestone = computeArchiveMilestone(count, threshold, remindStep);
    if (milestone === undefined || milestone <= lastArchivePromptMilestone) {
        return;
    }
    lastArchivePromptMilestone = milestone;

    const tier = getContextTier(provider, orModel);
    panel.webview.postMessage({
        type: 'archiveSuggest',
        count,
        threshold,
        tier
    });

    const msg = t('extension.info.archiveSuggest', { count: String(count), threshold: String(threshold) });
    const action = t('extension.archive.now');
    void vscode.window.showInformationMessage(msg, action).then((choice) => {
        if (choice === action) {
            void archiveSaga();
        }
    });
}

function buildLorebookPromptContext(hintText: string): string {
    const matches = matchLorebookEntries(hintText);
    if (matches.length === 0) {
        return '';
    }
    const parts = ['[Lorebook — matched entries]'];
    for (const e of matches) {
        parts.push(`--- ${e.comment || e.id || 'entry'} ---`);
        parts.push(String(e.content || '').trim());
    }
    return parts.join('\n');
}

function buildGmPromptContext(playerAction: string): string {
    const chunks: string[] = [];
    const ws = getWorkspacePath();
    const summary = loadStorySummary();
    if (summary) {
        chunks.push(`[Story Synopsis]\n${summary}`);
    }
    // Saga 章（sagas/）— 圧縮済みの長期ナラティブ
    if (ws) {
        const sagaCtx = buildSagaPromptContext(ws, 2);
        if (sagaCtx) {
            chunks.push(sagaCtx);
        }
    }
    const partyCtx = buildPartyPromptContext();
    if (partyCtx) {
        chunks.push(partyCtx);
    }
    const recent = gameEntryHistory
        .filter((e) => !e.excludedFromPrompt)
        .slice(-3)
        .map((e) => e.content)
        .join('\n');
    const hint = `${recent}\n${playerAction}`;
    // Memory Bank — TF-IDF または ChromaDB（設定による）
    if (ws) {
        const memoryCtx = buildMemoryContextForPrompt(ws, hint);
        if (memoryCtx) {
            chunks.push(memoryCtx);
        }
    }
    const loreCtx = buildLorebookPromptContext(hint);
    if (loreCtx) {
        chunks.push(loreCtx);
    }
    return chunks.length ? `\n\n${chunks.join('\n\n')}` : '';
}

function processProfileUpdates(updates: ProfileUpdate[]): void {
    const charDir = getCharactersDir();
    if (!charDir || updates.length === 0) {
        return;
    }
    const dynPath = path.join(charDir, 'dynamic_profiles.json');
    let dynProfiles = loadDynamicProfiles();
    let changed = false;
    for (const up of updates as unknown[]) {
        if (typeof up !== 'object' || up === null) {
            continue;
        }
        const record = up as Partial<ProfileUpdate>;
        if (isValidCharacterId(record.characterId) && typeof record.dynamicProfile === 'string') {
            const dynamicProfile = record.dynamicProfile.trim().slice(0, 20000);
            if (!dynamicProfile) {
                continue;
            }
            dynProfiles[record.characterId] = dynamicProfile;
            changed = true;
        }
    }
    if (changed) {
        fs.writeFileSync(dynPath, JSON.stringify(dynProfiles, null, 2), 'utf-8');
        getGrokOutputChannel().appendLine(
            `[Dynamic Profiles] Updated memory for ${updates.length} character(s).`
        );
        // 動的プロフィール更新後はメモリインデックスを再構築
        const ws = getWorkspacePath();
        if (ws) {
            void runSkillScript('memory_bank.py', ['--rebuild', '--backend', getMemoryBackendSetting()]);
        }
    }
}

function buildGrokPrompt(playerAction: string, isContinuation: boolean): string {
    const locale = getConfiguredLocale();
    const base = t('gm.prompt.playerAction', { action: playerAction }, locale);
    const context = buildGmPromptContext(playerAction);
    if (isContinuation) {
        return t('gm.prompt.continue', { base }, locale) + context;
    }
    return t('gm.prompt.start', { base, languageName: gmLanguageName(locale) }, locale) + context;
}

function resolveSpriteForWebview(sprite: SceneSprite | string | undefined): SceneSprite | undefined {
    if (!sprite) {
        return undefined;
    }
    if (typeof sprite === 'string') {
        const uri = safeImageUri(sprite);
        return uri ? { image: uri, position: 'center' } : undefined;
    }
    const out: SceneSprite = { ...sprite };
    if (out.image) {
        const uri = safeImageUri(out.image);
        if (!uri) {
            return undefined;
        }
        out.image = uri;
    }
    return out;
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

const ENTRY_ID_PATTERN = /^[a-zA-Z0-9_-]{1,64}$/;

function isValidEntryId(entryId: unknown): entryId is string {
    return typeof entryId === 'string' && ENTRY_ID_PATTERN.test(entryId);
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isValidGameEntry(value: unknown): value is GameEntry {
    if (!isRecord(value)) {
        return false;
    }
    return (
        isValidEntryId(value.id) &&
        (value.role === 'gm' || value.role === 'user') &&
        typeof value.sender === 'string' &&
        typeof value.content === 'string'
    );
}

/** 履歴・game_state を entry.id で画像更新し、Webview に patch を送る。 */
function applyImageToEntryById(wsPath: string, entryId: string, imagePath: string, prompt: string): boolean {
    const histIdx = gameEntryHistory.findIndex((e) => e.id === entryId);
    if (histIdx < 0) {
        return false;
    }

    gameEntryHistory[histIdx] = {
        ...gameEntryHistory[histIdx],
        image: imagePath,
        imagePrompt: prompt
    };
    saveHistoryToDisk();

    const statePath = path.join(wsPath, 'game_state.json');
    if (fs.existsSync(statePath)) {
        try {
            const stateData = JSON.parse(fs.readFileSync(statePath, 'utf-8')) as Record<string, unknown>;
            let stateUpdated = false;
            const entries = stateData.entries;
            if (Array.isArray(entries)) {
                const ei = entries.findIndex(
                    (e) => typeof e === 'object' && e !== null && (e as GameEntry).id === entryId
                );
                if (ei >= 0) {
                    const row = entries[ei] as Record<string, unknown>;
                    row.image = imagePath;
                    row.imagePrompt = prompt;
                    stateUpdated = true;
                }
            }
            const lastGm = findLastGmEntry(gameEntryHistory);
            if (lastGm?.id === entryId) {
                stateData.latestImage = imagePath;
                stateUpdated = true;
            }
            if (stateUpdated) {
                fs.writeFileSync(statePath, JSON.stringify(stateData, null, 2), 'utf-8');
            }
        } catch {
            // game_state 更新失敗は履歴更新だけでも続行
        }
    }

    const uri = safeImageUri(imagePath);
    if (panel && uri) {
        panel.webview.postMessage({
            type: 'updateEntry',
            entry: { id: entryId, image: uri, imagePrompt: prompt }
        });
    }
    return true;
}

async function invokeGrokBridge(playerAction: string): Promise<boolean> {
    const config = vscode.workspace.getConfiguration('textAdventure');
    if (!config.get<boolean>('grokBridge.enabled', true)) {
        return false;
    }

    const cwd = getWorkspacePath();
    if (!cwd) {
        vscode.window.showWarningMessage(t('extension.error.workspaceRequired'));
        return false;
    }

    if (grokProcess || gmProcess) {
        vscode.window.showWarningMessage(t('extension.error.gmBusy'));
        return false;
    }

    const grokCmd = resolveGrokCommand(config.get<string>('grokBridge.command', 'grok') || 'grok');
    const autoApprove = config.get<boolean>('grokBridge.autoApprove', true);
    const isContinuation = grokSessionActive;
    const prompt = buildGrokPrompt(playerAction, isContinuation);
    const promptFile = writePromptFile(cwd, prompt);

    const args = ['--prompt-file', promptFile, '--cwd', cwd];
    if (autoApprove) {
        args.push('--always-approve');
    }
    if (isContinuation) {
        args.push('--continue');
    }

    const channel = getGrokOutputChannel();
    channel.clear();
    channel.appendLine(`> ${grokCmd} --prompt-file <redacted-file> --cwd ${cwd}${autoApprove ? ' --always-approve' : ''}${isContinuation ? ' --continue' : ''}`);
    channel.appendLine(`Player action: ${formatRedactedAction(playerAction)}\n`);
    channel.show(true);

    panel?.webview.postMessage({ type: 'gmStart' });
    vscode.window.setStatusBarMessage(t('extension.status.gmProcessing'), 0);

    return new Promise((resolve) => {
        grokProcess = spawn(grokCmd, args, {
            cwd,
            shell: false,
            stdio: ['ignore', 'pipe', 'pipe'],
            env: process.env
        });

        grokProcess.stdout?.on('data', (data: Buffer) => {
            channel.append(data.toString());
        });

        grokProcess.stderr?.on('data', (data: Buffer) => {
            channel.append(data.toString());
        });

        grokProcess.on('error', (err) => {
            grokProcess = undefined;
            safeUnlinkPlayerActionFile(promptFile);
            vscode.window.setStatusBarMessage('');
            panel?.webview.postMessage({ type: 'gmEnd', success: false });
            channel.appendLine(`\n[Error: ${err.message}]`);
            vscode.window.showErrorMessage(t('extension.error.grokFailed', { message: err.message }));
            resolve(false);
        });

        grokProcess.on('close', (code) => {
            grokProcess = undefined;
            safeUnlinkPlayerActionFile(promptFile);
            vscode.window.setStatusBarMessage('');
            panel?.webview.postMessage({ type: 'gmEnd', success: code === 0 });
            channel.appendLine(`\n[grok exited with code ${code ?? 'unknown'}]`);

            if (code === 0) {
                grokSessionActive = true;
                vscode.window.showInformationMessage(t('extension.info.grokDone'));
                resolve(true);
            } else {
                vscode.window.showWarningMessage(
                    t('extension.warning.grokExit', { code: String(code ?? 'unknown') })
                );
                resolve(false);
            }
        });
    });
}

let gmProcess: ChildProcess | undefined;

async function invokeLocalLlmBridge(
    provider: 'ollama' | 'koboldcpp' | 'openrouter',
    playerAction: string
): Promise<boolean> {
    let scriptName = 'ollama_gm.py';
    if (provider === 'koboldcpp') scriptName = 'koboldcpp_gm.py';
    if (provider === 'openrouter') scriptName = 'openrouter_gm.py';
    
    const scriptPath = resolveGmBridgeScript(scriptName);
    if (!scriptPath) {
        vscode.window.showErrorMessage(
            t('extension.error.scriptNotFound', { script: scriptName })
        );
        return false;
    }

    const cwd = getWorkspacePath();
    if (!cwd) {
        vscode.window.showWarningMessage(t('extension.error.workspaceRequired'));
        return false;
    }

    if (gmProcess || grokProcess) {
        vscode.window.showWarningMessage(t('extension.error.gmBusy'));
        return false;
    }

    const python = resolvePythonCommand();
    const config = vscode.workspace.getConfiguration('textAdventure');
    const actionFile = writePlayerActionFile(cwd, playerAction);
    const args = [scriptPath, '--cwd', cwd, '--action-file', actionFile, '--locale', getConfiguredLocale()];
    let openRouterApiKey = '';
    if (localGmSessionActive || grokSessionActive) {
        args.push('--continue-game');
    }

    if (provider === 'ollama') {
        const model = config.get<string>('gmBridge.ollama.model', '').trim();
        const url = config.get<string>('gmBridge.ollama.url', '').trim();
        if (model) { args.push('--model', model); }
        if (url) { args.push('--url', url); }
    } else if (provider === 'koboldcpp') {
        const url = config.get<string>('gmBridge.koboldcpp.url', '').trim();
        if (url) { args.push('--url', url); }
    } else if (provider === 'openrouter') {
        openRouterApiKey = await getOpenRouterApiKey();
        const model = config.get<string>('gmBridge.openRouter.model', '').trim();
        if (!openRouterApiKey) {
            safeUnlinkPlayerActionFile(actionFile);
            vscode.window.showErrorMessage(t('extension.error.openRouterKeyMissing'));
            return false;
        }
        if (model) { args.push('--model', model); }
    }

    const channel = getGrokOutputChannel();
    channel.clear();
    channel.appendLine(`> ${python} ${maskSensitiveFileInArgs(args, actionFile).join(' ')}`);
    channel.appendLine(`Provider: ${provider}`);
    channel.appendLine(`Player action: ${formatRedactedAction(playerAction)}\n`);
    channel.show(true);

    panel?.webview.postMessage({ type: 'gmStart' });
    vscode.window.setStatusBarMessage(t('extension.status.gmProcessing'), 0);

    const env = buildLocalGmEnv(provider);
    if (provider === 'openrouter') {
        env.OPENROUTER_API_KEY = openRouterApiKey;
    }

    return new Promise((resolve) => {
        gmProcess = spawn(python, args, {
            cwd,
            shell: false,
            stdio: ['ignore', 'pipe', 'pipe'],
            env
        });

        gmProcess.stdout?.on('data', (data: Buffer) => channel.append(data.toString()));
        gmProcess.stderr?.on('data', (data: Buffer) => channel.append(data.toString()));

        const finishGm = (code: number | null) => {
            safeUnlinkPlayerActionFile(actionFile);
            gmProcess = undefined;
            vscode.window.setStatusBarMessage('');
            panel?.webview.postMessage({ type: 'gmEnd', success: code === 0 });
            channel.appendLine(`\n[${provider} exited with code ${code ?? 'unknown'}]`);

            if (code === 0) {
                localGmSessionActive = true;
                let msgKey = 'extension.info.gmDone';
                if (provider === 'ollama') { msgKey = 'extension.info.ollamaDone'; }
                if (provider === 'koboldcpp') { msgKey = 'extension.info.koboldDone'; }
                vscode.window.showInformationMessage(t(msgKey));
                resolve(true);
            } else {
                vscode.window.showWarningMessage(
                    t('extension.warning.localExit', { provider, code: String(code ?? 'unknown') })
                );
                resolve(false);
            }
        };

        gmProcess.on('error', (err) => {
            channel.appendLine(`\n[Error: ${err.message}]`);
            vscode.window.showErrorMessage(t('extension.error.gmBridgeFailed', { provider, message: err.message }));
            finishGm(null);
        });

        gmProcess.on('close', (code) => finishGm(code));
    });
}

function substituteBridgeArgs(args: string[], playerAction: string, cwd: string, actionFile?: string): string[] {
    return args.map((arg) =>
        arg
            .replace(/\{actionFile\}/g, actionFile ?? '')
            .replace(/\{action\}/g, playerAction)
            .replace(/\{cwd\}/g, cwd)
    );
}

async function invokeCustomGmBridge(playerAction: string): Promise<boolean> {
    const config = vscode.workspace.getConfiguration('textAdventure');
    const executable = config.get<string>('gmBridge.command', '').trim();
    if (!executable) {
        vscode.window.showErrorMessage(t('extension.error.gmCommandUnset'));
        return false;
    }

    const cwd = getWorkspacePath();
    if (!cwd) {
        vscode.window.showWarningMessage(t('extension.error.workspaceRequired'));
        return false;
    }

    if (gmProcess || grokProcess) {
        vscode.window.showWarningMessage(t('extension.error.gmBusy'));
        return false;
    }

    const argTemplate = config.get<string[]>('gmBridge.commandArgs', ['--prompt-file', '{actionFile}', '--cwd', '{cwd}', '--always-approve']);
    const usesActionFile = argTemplate.some((arg) => arg.includes('{actionFile}'));
    const actionFile = usesActionFile ? writePlayerActionFile(cwd, playerAction) : undefined;
    const args = substituteBridgeArgs(argTemplate, playerAction, cwd, actionFile);

    const channel = getGrokOutputChannel();
    channel.clear();
    channel.appendLine(`> ${executable} ${maskSensitiveFileInArgs(args, actionFile ?? '').join(' ')}`);
    channel.appendLine(`Player action: ${formatRedactedAction(playerAction)}\n`);
    channel.show(true);

    panel?.webview.postMessage({ type: 'gmStart' });
    vscode.window.setStatusBarMessage(t('extension.status.gmProcessing'), 0);

    return new Promise((resolve) => {
        gmProcess = spawn(executable, args, {
            cwd,
            shell: false,
            stdio: ['ignore', 'pipe', 'pipe'],
            env: process.env
        });

        gmProcess.stdout?.on('data', (data: Buffer) => channel.append(data.toString()));
        gmProcess.stderr?.on('data', (data: Buffer) => channel.append(data.toString()));

        gmProcess.on('error', (err) => {
            gmProcess = undefined;
            safeUnlinkPlayerActionFile(actionFile);
            vscode.window.setStatusBarMessage('');
            panel?.webview.postMessage({ type: 'gmEnd', success: false });
            channel.appendLine(`\n[Error: ${err.message}]`);
            vscode.window.showErrorMessage(t('extension.error.gmCommandFailed', { message: err.message }));
            resolve(false);
        });

        gmProcess.on('close', (code) => {
            gmProcess = undefined;
            safeUnlinkPlayerActionFile(actionFile);
            vscode.window.setStatusBarMessage('');
            panel?.webview.postMessage({ type: 'gmEnd', success: code === 0 });
            channel.appendLine(`\n[exited with code ${code ?? 'unknown'}]`);
            if (code === 0) {
                vscode.window.showInformationMessage(t('extension.info.gmDone'));
                resolve(true);
            } else {
                vscode.window.showWarningMessage(t('extension.warning.gmCommandExit', { code: String(code ?? 'unknown') }));
                resolve(false);
            }
        });
    });
}

async function invokeGmBridge(playerAction: string): Promise<boolean> {
    const provider = getGmProvider();
    switch (provider) {
        case 'clipboard':
            return false;
        case 'command':
            return invokeCustomGmBridge(playerAction);
        case 'ollama':
            return invokeLocalLlmBridge('ollama', playerAction);
        case 'koboldcpp':
            return invokeLocalLlmBridge('koboldcpp', playerAction);
        case 'openrouter':
            return invokeLocalLlmBridge('openrouter', playerAction);
        case 'grok':
        default:
            return invokeGrokBridge(playerAction);
    }
}

async function fallbackToClipboard(text: string): Promise<void> {
    const config = vscode.workspace.getConfiguration('textAdventure');
    if (!config.get<boolean>('grokBridge.fallbackToClipboard', true)) {
        return;
    }
    await vscode.env.clipboard.writeText(text);
    vscode.window.showInformationMessage(t('extension.info.clipboard', { text }));
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

    loadHistoryFromDisk();
    sendCurrentState(0, true);

    if (fileWatcher) {
        fileWatcher.dispose();
    }

    fileWatcher = vscode.workspace.createFileSystemWatcher('**/game_state.json');

    const handleChange = () => {
        if (debounceTimer) {
            clearTimeout(debounceTimer);
        }
        debounceTimer = setTimeout(() => {
            sendCurrentState();
        }, 300);
    };

    fileWatcher.onDidChange(handleChange);
    fileWatcher.onDidCreate(handleChange);

    context.subscriptions.push(fileWatcher);

    // BGM マニフェストの監視
    sendBgmManifest();
    if (bgmWatcher) { bgmWatcher.dispose(); }
    bgmWatcher = vscode.workspace.createFileSystemWatcher('**/bgm.json');
    bgmWatcher.onDidChange(() => sendBgmManifest());
    bgmWatcher.onDidCreate(() => sendBgmManifest());
    bgmWatcher.onDidDelete(() => sendBgmManifest());
    context.subscriptions.push(bgmWatcher);

    // SE マニフェストの監視
    sendSfxManifest();
    if (sfxWatcher) { sfxWatcher.dispose(); }
    sfxWatcher = vscode.workspace.createFileSystemWatcher('**/sfx.json');
    sfxWatcher.onDidChange(() => sendSfxManifest());
    sfxWatcher.onDidCreate(() => sendSfxManifest());
    sfxWatcher.onDidDelete(() => sendSfxManifest());
    context.subscriptions.push(sfxWatcher);
}

/** 画像パスがワークスペースまたは GM スキル配下か検証する。 */
function isAllowedImagePath(imagePath: string): boolean {
    const normalized = path.normalize(imagePath);
    if (!fs.existsSync(normalized)) {
        return false;
    }

    const ws = getWorkspacePath();
    if (ws) {
        const wsNorm = path.normalize(ws);
        if (normalized === wsNorm || normalized.startsWith(wsNorm + path.sep)) {
            return true;
        }
    }

    const skillDir = getSkillDir();
    if (skillDir) {
        const skillNorm = path.normalize(skillDir);
        if (normalized === skillNorm || normalized.startsWith(skillNorm + path.sep)) {
            return true;
        }
    }

    console.warn(`[Text Adventure] Image path outside workspace/skill, skipped: ${imagePath}`);
    return false;
}

function safeImageUri(imagePath: string): string | undefined {
    if (!imagePath || !isAllowedImagePath(imagePath)) {
        return undefined;
    }
    return panel!.webview.asWebviewUri(vscode.Uri.file(path.normalize(imagePath))).toString();
}

// ===== BGM マニフェスト =====
interface BgmTrack { id: string; file: string; mood?: string; description?: string; loop?: boolean; volume?: number }

function getBgmManifestPath(): string | undefined {
    const config = vscode.workspace.getConfiguration('textAdventure');
    const configured = config.get<string>('bgm.manifestPath', '').trim();
    if (configured) { return configured; }
    const ws = getWorkspacePath();
    return ws ? path.join(ws, 'bgm.json') : undefined;
}

/** 音声ファイルパスを解決する（マニフェスト dir → <subfolder>/ → 絶対パス）。 */
function resolveMediaFile(file: string, manifestDir: string, subfolder: string): string | undefined {
    if (!file) { return undefined; }
    const candidates = [
        path.isAbsolute(file) ? file : path.join(manifestDir, file),
        path.join(manifestDir, subfolder, file)
    ];
    for (const c of candidates) {
        if (fs.existsSync(c)) { return c; }
    }
    return undefined;
}

function sendBgmManifest() {
    if (!panel) { return; }
    const config = vscode.workspace.getConfiguration('textAdventure');
    const enabled = config.get<boolean>('bgm.enabled', true);
    const defaultVolume = config.get<number>('bgm.volume', 50);

    const manifestPath = getBgmManifestPath();
    let tracks: Array<{ id: string; uri: string; mood?: string; description?: string; loop?: boolean; volume?: number }> = [];

    if (enabled && manifestPath && fs.existsSync(manifestPath)) {
        try {
            const raw = fs.readFileSync(manifestPath, 'utf-8');
            const manifest = JSON.parse(raw);
            const manifestDir = path.dirname(manifestPath);
            const rawTracks: BgmTrack[] = Array.isArray(manifest) ? manifest : (manifest.tracks || []);
            for (const t of rawTracks) {
                if (!t || !t.id || !t.file) { continue; }
                const resolved = resolveMediaFile(t.file, manifestDir, 'bgm');
                if (!resolved) { continue; }
                tracks.push({
                    id: String(t.id),
                    uri: panel.webview.asWebviewUri(vscode.Uri.file(resolved)).toString(),
                    mood: t.mood,
                    description: t.description,
                    loop: t.loop,
                    volume: t.volume
                });
            }
        } catch (e) {
            console.error('Error reading bgm.json:', e);
        }
    }

    panel.webview.postMessage({ type: 'bgmManifest', tracks, defaultVolume, enabled });
}

/** GM スキルフォルダ（comfyui_generate.py の2階層上）を解決する。同梱SE等の参照に使う。 */
function getSkillDir(): string | undefined {
    const wsPath = getWorkspacePath() || process.cwd();
    const scriptPath = resolveComfyScript(wsPath);
    if (!scriptPath) { return undefined; }
    return path.dirname(path.dirname(scriptPath)); // .../scripts/x.py → スキルルート
}

// ===== 効果音(SE)マニフェスト =====
interface SfxItem { id: string; file: string; description?: string; volume?: number }

/** sfx.json のパスを解決。workspace 優先、無ければ同梱スキルの sfx.json にフォールバック。 */
function getSfxManifestPath(): string | undefined {
    const config = vscode.workspace.getConfiguration('textAdventure');
    const configured = config.get<string>('sfx.manifestPath', '').trim();
    if (configured) { return configured; }

    const ws = getWorkspacePath();
    if (ws) {
        const wsManifest = path.join(ws, 'sfx.json');
        if (fs.existsSync(wsManifest)) { return wsManifest; }
    }
    // 同梱（箱から出してすぐ鳴る）フォールバック
    const skillDir = getSkillDir();
    if (skillDir) {
        const bundled = path.join(skillDir, 'sfx.json');
        if (fs.existsSync(bundled)) { return bundled; }
    }
    return undefined;
}

function sendSfxManifest() {
    if (!panel) { return; }
    const config = vscode.workspace.getConfiguration('textAdventure');
    const enabled = config.get<boolean>('sfx.enabled', true);
    const defaultVolume = config.get<number>('sfx.volume', 70);

    const manifestPath = getSfxManifestPath();
    const sounds: Array<{ id: string; uri: string; description?: string; volume?: number }> = [];

    if (enabled && manifestPath && fs.existsSync(manifestPath)) {
        try {
            const raw = fs.readFileSync(manifestPath, 'utf-8');
            const manifest = JSON.parse(raw);
            const manifestDir = path.dirname(manifestPath);
            const rawSounds: SfxItem[] = Array.isArray(manifest) ? manifest : (manifest.sounds || []);
            for (const s of rawSounds) {
                if (!s || !s.id || !s.file) { continue; }
                const resolved = resolveMediaFile(s.file, manifestDir, 'sfx');
                if (!resolved) { continue; }
                sounds.push({
                    id: String(s.id),
                    uri: panel.webview.asWebviewUri(vscode.Uri.file(resolved)).toString(),
                    description: s.description,
                    volume: s.volume
                });
            }
        } catch (e) {
            console.error('Error reading sfx.json:', e);
        }
    }

    panel.webview.postMessage({ type: 'sfxManifest', sounds, defaultVolume, enabled });
}

async function sendCurrentState(retryCount = 0, fullHistory = false) {
    const statePath = getGameStatePath();
    if (!statePath || !panel) { return; }

    try {
        if (fs.existsSync(statePath)) {
            const raw = fs.readFileSync(statePath, 'utf-8');
            const state = JSON.parse(raw);

            // Runtime schema validation (warn only — do not abort)
            const schemaErrors = validateGameState(state);
            if (schemaErrors.length > 0) {
                const summary = schemaErrors.join('; ');
                const logLine = `[Text Adventure] game_state.json schema violation: ${summary}`;
                console.warn(logLine);
                if (!grokOutputChannel) {
                    grokOutputChannel = vscode.window.createOutputChannel('Text Adventure: GM Bridge');
                }
                grokOutputChannel.appendLine(logLine);
                if (!schemaWarningShown) {
                    schemaWarningShown = true;
                    vscode.window.showWarningMessage(
                        `Text Adventure: game_state.json has schema errors — check "Text Adventure: GM Bridge" output for details.`
                    );
                }
            } else {
                schemaWarningShown = false;
            }

            if (Array.isArray(state.profileUpdates) && state.profileUpdates.length > 0) {
                processProfileUpdates(state.profileUpdates as ProfileUpdate[]);
                delete state.profileUpdates;
                fs.writeFileSync(statePath, JSON.stringify(state, null, 2), 'utf-8');
            }

            // Accumulate new entries with raw file paths for history
            let historyUpdated = false;
            if (state.entries && Array.isArray(state.entries)) {
                state.entries.forEach((rawEntry: unknown) => {
                    if (!isValidGameEntry(rawEntry)) {
                        return;
                    }
                    const entry = rawEntry;
                    const histIdx = gameEntryHistory.findIndex((e) => e.id === entry.id);
                    if (histIdx >= 0) {
                        const prev = gameEntryHistory[histIdx];
                        const next: GameEntry = { ...prev };
                        let changed = false;
                        const setIfString = (key: keyof Pick<GameEntry, 'role' | 'sender' | 'content' | 'image' | 'imagePrompt' | 'editedAt'>) => {
                            const value = entry[key];
                            if (typeof value === 'string' && value !== next[key]) {
                                (next as any)[key] = value;
                                changed = true;
                            }
                        };
                        setIfString('role');
                        setIfString('sender');
                        setIfString('content');
                        setIfString('image');
                        setIfString('imagePrompt');
                        setIfString('editedAt');
                        if (typeof entry.imageBlocked === 'boolean' && entry.imageBlocked !== next.imageBlocked) {
                            next.imageBlocked = entry.imageBlocked;
                            changed = true;
                        }
                        if (typeof entry.excludedFromPrompt === 'boolean' && entry.excludedFromPrompt !== next.excludedFromPrompt) {
                            next.excludedFromPrompt = entry.excludedFromPrompt;
                            changed = true;
                        }
                        if (changed) {
                            gameEntryHistory[histIdx] = next;
                            historyUpdated = true;
                        }
                        return;
                    }
                    if (!seenEntryIds.has(entry.id)) {
                        seenEntryIds.add(entry.id);
                        const entryWithState: any = { ...entry };
                        if (entry.role === 'gm') {
                            if (state.status) { entryWithState.status = JSON.parse(JSON.stringify(state.status)); }
                            if (state.options) { entryWithState.options = [...state.options]; }
                            if (state.theme) { entryWithState.theme = state.theme; }
                            if (state.bgm) { entryWithState.bgm = state.bgm; }
                            if (state.mood) { entryWithState.mood = state.mood; }
                            if (state.sfx) { entryWithState.sfx = Array.isArray(state.sfx) ? [...state.sfx] : state.sfx; }
                            if (state.latestImage) { entryWithState.latestImage = state.latestImage; }
                            if (state.background) { entryWithState.background = state.background; }
                            if (state.sprite) { entryWithState.sprite = typeof state.sprite === 'string' ? state.sprite : JSON.parse(JSON.stringify(state.sprite)); }
                            if (state.summary) { entryWithState.summary = state.summary; }
                            if (state.gameOver) { entryWithState.gameOver = JSON.parse(JSON.stringify(state.gameOver)); }
                        }
                        gameEntryHistory.push(entryWithState);
                        historyUpdated = true;
                    }
                });
            }
            if (historyUpdated) {
                saveHistoryToDisk();
                maybeSuggestArchive();
            }

            // fullHistory=true (panel reopen): send all accumulated entries with fresh URIs
            // fullHistory=false (normal update): send only current state's entries
            const currentEntries: GameEntry[] = Array.isArray(state.entries)
                ? state.entries.filter(isValidGameEntry)
                : [];
            const sourceEntries: GameEntry[] = fullHistory ? gameEntryHistory : currentEntries;
            const entriesToSend = sourceEntries.map((entry: GameEntry) => {
                const e = { ...entry };
                if (e.image) {
                    const uri = safeImageUri(e.image);
                    if (uri) { e.image = uri; } else { delete e.image; e.imageBlocked = true; }
                }
                return e;
            });

            const latestImage = state.latestImage ? safeImageUri(state.latestImage) : undefined;
            const background = state.background ? safeImageUri(state.background) : undefined;
            const sprite = resolveSpriteForWebview(state.sprite);

            // Strip any accidental `result` field from hiddenDice before sending to Webview
            const hiddenDice: HiddenDiceEntry[] | undefined =
                Array.isArray(state.hiddenDice)
                    ? (state.hiddenDice as Array<Record<string, unknown>>).map(
                        ({ notation, purpose }) => ({
                            notation: String(notation ?? ''),
                            ...(purpose !== undefined ? { purpose: String(purpose) } : {})
                        })
                    )
                    : undefined;

            panel.webview.postMessage({
                type: 'gameStateUpdate',
                fullHistory,
                state: { ...state, entries: entriesToSend, latestImage, background, sprite, hiddenDice }
            });
        }
    } catch (e) {
        console.error(`Error reading game state (attempt ${retryCount + 1}):`, e);
        if (retryCount < 3) {
            setTimeout(() => sendCurrentState(retryCount + 1, fullHistory), 200);
        }
    }
}

async function runImageGeneration(prompt: string, mode: string, entryId?: string) {
    const wsPath = getWorkspacePath();
    if (!wsPath) {
        vscode.window.showWarningMessage(t('extension.error.workspaceRequired'));
        return;
    }

    if (typeof prompt !== 'string' || prompt.length > 2000) {
        vscode.window.showErrorMessage(t('extension.error.invalidPrompt'));
        return;
    }

    const allowedModes = ['pony', 'illustrious', 'natural', 'standard'];
    const wsConfig = loadImageGenConfig(wsPath);
    const defaultMode = allowedModes.includes(wsConfig.mode) ? wsConfig.mode : 'illustrious';
    const safeMode = typeof mode === 'string' && allowedModes.includes(mode) ? mode : defaultMode;

    if (imageGenerationProcess) {
        vscode.window.showWarningMessage(t('extension.warning.imageBusy'));
        return;
    }

    const scriptPath = resolveComfyScript(wsPath);
    const outputDir = path.join(wsPath, 'output');

    if (!scriptPath) {
        vscode.window.showWarningMessage(t('extension.error.imageScriptNotFound'));
        return;
    }

    if (!imageOutputChannel) {
        imageOutputChannel = vscode.window.createOutputChannel('Text Adventure: Image Gen');
    }
    const env = buildImageGenEnv(wsPath);
    imageOutputChannel.show(true);
    imageOutputChannel.appendLine(`Backend: ${env.COMFYUI_URL || 'http://127.0.0.1:8188 (default)'}`);
    imageOutputChannel.appendLine(`Checkpoint: ${env.TA_CHECKPOINT || '(workflow default)'}`);
    imageOutputChannel.appendLine(`Generating image with mode: ${safeMode}`);
    imageOutputChannel.appendLine(`Prompt: ${prompt}`);
    panel?.webview.postMessage({ type: 'imageGenStart' });

    const child = spawn('python', [scriptPath, prompt, outputDir, safeMode], {
        shell: false,
        env
    });
    imageGenerationProcess = child;

    let generatedImagePath = '';
    let imageGenFinished = false;

    child.stdout.on('data', (data) => {
        const out = data.toString();
        imageOutputChannel?.append(out);
        
        // 最終的に出力される絶対パス（.png で終わる行）を探す
        const lines = out.split('\n');
        for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed.endsWith('.png') && trimmed.length > 4) {
                generatedImagePath = trimmed;
            }
        }
    });

    child.stderr.on('data', (data) => {
        imageOutputChannel?.append(data.toString());
    });

    const finishImageGeneration = (code: number | null) => {
        if (imageGenFinished) {
            return;
        }
        imageGenFinished = true;
        imageGenerationProcess = undefined;
        imageOutputChannel?.appendLine(`\nProcess exited with code ${code}`);
        panel?.webview.postMessage({ type: 'imageGenEnd', success: code === 0 });

        if (code === 0 && generatedImagePath && entryId && isValidEntryId(entryId)) {
            const ok = applyImageToEntryById(wsPath, entryId, generatedImagePath, prompt);
            if (ok) {
                imageOutputChannel?.appendLine(`Updated entry ${entryId} with new image`);
            } else {
                imageOutputChannel?.appendLine(`Entry ${entryId} not found in game history`);
            }
        }
    };

    child.on('error', (err) => {
        imageOutputChannel?.appendLine(`\n[Error: ${err.message}]`);
        vscode.window.showErrorMessage(t('extension.error.pythonFailed', { message: err.message }));
        finishImageGeneration(null);
    });

    child.on('close', (code) => finishImageGeneration(code));
}
async function runSkillScript(scriptName: string, args: string[]): Promise<number> {
    const wsPath = getWorkspacePath() || process.cwd();
    const scriptPath = resolveGmBridgeScript(scriptName);
    if (!scriptPath) {
        vscode.window.showErrorMessage(t('extension.error.scriptNotFound', { script: scriptName }));
        return 1;
    }
    const python = resolvePythonCommand();
    const env: NodeJS.ProcessEnv = {
        ...process.env,
        TA_MEMORY_BACKEND: getMemoryBackendSetting(),
        TA_LOCALE: getConfiguredLocale()
    };
    const needsOpenRouterKey = args.includes('openrouter');
    if (needsOpenRouterKey) {
        const openRouterApiKey = await getOpenRouterApiKey();
        if (openRouterApiKey) {
            env.OPENROUTER_API_KEY = openRouterApiKey;
        }
    }
    return new Promise((resolve) => {
        const child = spawn(python, [scriptPath, ...args], { cwd: wsPath, shell: false, env });
        activeScriptProcess = child;
        child.stdout?.on('data', (d: Buffer) => getGrokOutputChannel().append(d.toString()));
        child.stderr?.on('data', (d: Buffer) => getGrokOutputChannel().append(d.toString()));
        child.on('close', (code) => {
            activeScriptProcess = undefined;
            resolve(code ?? 1);
        });
        child.on('error', (err) => {
            activeScriptProcess = undefined;
            resolve(1);
        });
    });
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

// ===== Character Management =====

function getCharactersDir(): string | undefined {
    const ws = getWorkspacePath();
    if (!ws) return undefined;
    const charDir = path.join(ws, 'characters');
    if (!fs.existsSync(charDir)) {
        fs.mkdirSync(charDir, { recursive: true });
    }
    return charDir;
}

function getPartyIds(): string[] {
    const charDir = getCharactersDir();
    if (!charDir) return [];
    const partyFile = path.join(charDir, 'party.json');
    if (fs.existsSync(partyFile)) {
        try {
            return JSON.parse(fs.readFileSync(partyFile, 'utf-8'));
        } catch {
            return [];
        }
    }
    return [];
}

function savePartyIds(ids: string[]) {
    const charDir = getCharactersDir();
    if (!charDir) return;
    const partyFile = path.join(charDir, 'party.json');
    try {
        fs.writeFileSync(partyFile, JSON.stringify(filterValidCharacterIds(ids), null, 2), 'utf-8');
    } catch (e) {
        console.error('Error saving party:', e);
    }
}

function addToParty(id: string) {
    const ids = getPartyIds();
    if (!ids.includes(id)) {
        ids.push(id);
        savePartyIds(ids);
        sendCharacterList();
    }
}

function removeFromParty(id: string) {
    const ids = getPartyIds();
    const newIds = ids.filter(x => x !== id);
    if (ids.length !== newIds.length) {
        savePartyIds(newIds);
        sendCharacterList();
    }
}

function getActiveCharacterId(): string | undefined {
    const charDir = getCharactersDir();
    if (!charDir) return undefined;
    const activeFile = path.join(charDir, 'active_character.txt');
    if (fs.existsSync(activeFile)) {
        return fs.readFileSync(activeFile, 'utf-8').trim();
    }
    return undefined;
}

function sendCharacterList() {
    if (!panel) return;
    const charDir = getCharactersDir();
    if (!charDir) return;

    const characters: CharacterProfile[] = [];
    try {
        const files = fs.readdirSync(charDir);
        for (const file of files) {
            if (file.endsWith('.json') && !CHARACTER_META_FILES.has(file)) {
                const raw = fs.readFileSync(path.join(charDir, file), 'utf-8');
                const char = JSON.parse(raw) as CharacterProfile;
                if (!char.id || !char.name) {
                    continue;
                }
                if (char.portrait) {
                    const uri = safeImageUri(char.portrait);
                    if (uri) char.portrait = uri;
                }
                characters.push(char);
            }
        }
    } catch (e) {
        console.error('Error reading characters directory:', e);
    }

    panel.webview.postMessage({
        type: 'characterList',
        characters,
        activeCharacterId: getActiveCharacterId(),
        partyIds: getPartyIds()
    });
}

function saveCharacter(character: CharacterProfile) {
    const charDir = getCharactersDir();
    if (!charDir || !isValidCharacterId(character.id)) return;
    const filePath = resolveCharacterJsonPath(charDir, character.id);
    if (!filePath) return;
    try {
        fs.writeFileSync(filePath, JSON.stringify(character, null, 2), 'utf-8');
        sendCharacterList();
    } catch (e) {
        console.error('Error saving character:', e);
    }
}

function setActiveCharacter(id: string) {
    const charDir = getCharactersDir();
    if (!charDir || !isValidCharacterId(id)) return;
    try {
        const activeFile = path.join(charDir, 'active_character.txt');
        fs.writeFileSync(activeFile, id, 'utf-8');
        sendCharacterList();
    } catch (e) {
        console.error('Error setting active character:', e);
    }
}

async function uploadPortrait(id: string) {
    const charDir = getCharactersDir();
    if (!charDir || !isValidCharacterId(id)) return;
    const picked = await vscode.window.showOpenDialog({
        canSelectMany: false,
        filters: {
            'Images': ['png', 'jpg', 'jpeg', 'webp']
        }
    });
    if (!picked || picked.length === 0) return;

    const sourcePath = picked[0].fsPath;
    const ext = path.extname(sourcePath);
    const destPath = resolvePortraitPath(charDir, id, ext);
    const jsonPath = resolveCharacterJsonPath(charDir, id);
    if (!destPath || !jsonPath) return;
    
    try {
        fs.copyFileSync(sourcePath, destPath);
        if (fs.existsSync(jsonPath)) {
            const char: CharacterProfile = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
            char.portrait = destPath;
            saveCharacter(char);
        }
    } catch (e) {
        vscode.window.showErrorMessage(`Failed to copy image: ${e}`);
    }
}

async function generatePortrait(id: string) {
    const charDir = getCharactersDir();
    if (!charDir || !isValidCharacterId(id)) return;
    
    const jsonPath = resolveCharacterJsonPath(charDir, id);
    if (!jsonPath || !fs.existsSync(jsonPath)) return;
    
    const char: CharacterProfile = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
    
    // 現在のテーマ（世界観）を取得してアレンジに活用する
    const wsPath = getWorkspacePath() || process.cwd();
    let currentTheme = 'fantasy';
    const statePath = getGameStatePath();
    if (statePath && fs.existsSync(statePath)) {
        try {
            const state = JSON.parse(fs.readFileSync(statePath, 'utf-8'));
            if (state.theme) currentTheme = state.theme;
        } catch (e) {}
    }

    // 立ち絵用のプロンプト構築。テーマによるアレンジを含む。
    const prompt = `A high quality full body character portrait of ${char.name}. ${char.description}. The setting is a ${currentTheme} world. The character's outfit and gear are adapted to fit the ${currentTheme} theme seamlessly.`;

    const scriptPath = resolveComfyScript(wsPath);
    if (!scriptPath) {
        vscode.window.showWarningMessage(t('extension.error.imageScriptNotFound'));
        return;
    }

    if (!imageOutputChannel) {
        imageOutputChannel = vscode.window.createOutputChannel('Text Adventure: Image Gen');
    }
    const env = buildImageGenEnv(wsPath);
    const portraitConfig = loadImageGenConfig(wsPath);
    const portraitMode = ['pony', 'illustrious', 'natural', 'standard'].includes(portraitConfig.mode)
        ? portraitConfig.mode
        : 'illustrious';

    imageOutputChannel.show(true);
    imageOutputChannel.appendLine(`Generating portrait for ${char.name} in theme ${currentTheme}...`);
    panel?.webview.postMessage({ type: 'imageGenStart' });

    // output を charDir に直接保存する
    const child = spawn('python', [scriptPath, prompt, charDir, portraitMode], {
        shell: false,
        env
    });

    child.stdout.on('data', (data) => imageOutputChannel?.append(data.toString()));
    child.stderr.on('data', (data) => imageOutputChannel?.append(data.toString()));

    child.on('close', (code) => {
        imageOutputChannel?.appendLine(`\nProcess exited with code ${code}`);
        panel?.webview.postMessage({ type: 'imageGenEnd', success: code === 0 });
        
        if (code === 0) {
            // 生成された画像（scene_XXXX.png）を探し、リネームして portrait に設定する
            // 簡易的に最新のPNGを探す
            try {
                const files = fs.readdirSync(charDir)
                    .filter(f => f.startsWith('scene_') && f.endsWith('.png'))
                    .map(f => ({ name: f, time: fs.statSync(path.join(charDir, f)).mtime.getTime() }))
                    .sort((a, b) => b.time - a.time);
                    
                if (files.length > 0) {
                    const latest = files[0].name;
                    const src = path.join(charDir, latest);
                    const dest = path.join(charDir, `${id}_portrait.png`);
                    fs.renameSync(src, dest);
                    
                    char.portrait = dest;
                    saveCharacter(char);
                    vscode.window.showInformationMessage('Portrait generated successfully!');
                }
            } catch (e) {
                console.error('Failed to link generated portrait:', e);
            }
        }
    });
}

async function handleEditEntry(id: string, content: string): Promise<void> {
    const safeCon = content.trim().slice(0, 20000);
    if (!safeCon) { return; }
    const statePath = getGameStatePath();
    if (!statePath || !fs.existsSync(statePath)) { return; }
    const editedAt = new Date().toISOString();
    try {
        const state = JSON.parse(fs.readFileSync(statePath, 'utf-8'));
        let changed = false;
        const entry = (state.entries as GameEntry[] | undefined)?.find((e) => e.id === id);
        if (entry) {
            entry.content = safeCon;
            (entry as any).editedAt = editedAt;
            fs.writeFileSync(statePath, JSON.stringify(state, null, 2), 'utf-8');
            changed = true;
        }
        const hist = gameEntryHistory.find((e) => e.id === id);
        if (hist) {
            hist.content = safeCon;
            (hist as any).editedAt = editedAt;
            saveHistoryToDisk();
            changed = true;
        }
        if (!changed) {
            sendCurrentState(0, true);
            return;
        }
        panel?.webview.postMessage({ type: 'entryEdited', id, content: safeCon });
    } catch (e) {
        console.error('Error editing entry:', e);
    }
}

async function handleToggleExcludeEntry(id: string): Promise<void> {
    const statePath = getGameStatePath();
    if (!statePath || !fs.existsSync(statePath)) { return; }
    try {
        const state = JSON.parse(fs.readFileSync(statePath, 'utf-8'));
        const entry = (state.entries as GameEntry[] | undefined)?.find((e) => e.id === id);
        const hist = gameEntryHistory.find((e) => e.id === id);
        if (!entry && !hist) {
            sendCurrentState(0, true);
            return;
        }
        const excluded = !Boolean(entry?.excludedFromPrompt ?? hist?.excludedFromPrompt);
        if (entry) {
            entry.excludedFromPrompt = excluded;
            fs.writeFileSync(statePath, JSON.stringify(state, null, 2), 'utf-8');
        }
        if (hist) {
            (hist as any).excludedFromPrompt = excluded;
            saveHistoryToDisk();
        }
        panel?.webview.postMessage({ type: 'entryExcludeToggled', id, excluded });
    } catch (e) {
        console.error('Error toggling exclude:', e);
    }
}

function updateSummary(summary: unknown) {
    if (typeof summary !== 'string') {
        return;
    }
    const safeSummary = summary.trim().slice(0, 20000);
    const statePath = getGameStatePath();
    if (statePath && fs.existsSync(statePath)) {
        try {
            const state = JSON.parse(fs.readFileSync(statePath, 'utf-8'));
            state.summary = safeSummary;
            fs.writeFileSync(statePath, JSON.stringify(state, null, 2), 'utf-8');
            // sendCurrentState() will be triggered by fileWatcher
        } catch (e) {
            console.error('Error updating summary:', e);
        }
    }
}

/** Webview「章をアーカイブ」— 古い履歴を sagas/ に圧縮保存 */
async function archiveSaga() {
    const provider = getGmProvider();
    if (provider === 'clipboard' || provider === 'command') {
        vscode.window.showWarningMessage(t('extension.error.archiveUnavailable'));
        panel?.webview.postMessage({ type: 'sagaArchived' });
        return;
    }

    const code = await runSkillScript('archive_saga.py', ['--provider', provider]);
    if (code === 0) {
        replaceHistoryFromDisk();
        // アーカイブ後の履歴件数に合わせて促しマイルストーンをリセット（再アーカイブ時に再促しできるように）
        const config = vscode.workspace.getConfiguration('textAdventure');
        const orModel = config.get<string>('gmBridge.openRouter.model', '');
        const threshold = getArchiveThreshold(provider, orModel);
        const remindStep = getArchiveRemindStep();
        lastArchivePromptMilestone =
            computeArchiveMilestone(gameEntryHistory.length, threshold, remindStep) ?? 0;
        vscode.window.showInformationMessage(t('extension.info.sagaDone'));
        panel?.webview.postMessage({ type: 'sagaArchived' });
    } else {
        vscode.window.showErrorMessage(t('extension.error.sagaFailed'));
        panel?.webview.postMessage({ type: 'sagaArchived' });
    }
}

async function summarizeHistory() {
    const provider = getGmProvider();
    if (provider === 'clipboard' || provider === 'command') {
        vscode.window.showWarningMessage(t('extension.error.summarizeUnavailable'));
        panel?.webview.postMessage({ type: 'summaryUpdated' });
        return;
    }

    const code = await runSkillScript('summarize_gm.py', [
        '--provider', provider
    ]);

    if (code === 0) {
        vscode.window.showInformationMessage(t('extension.info.summaryDone'));
        panel?.webview.postMessage({ type: 'summaryUpdated' });
    } else {
        vscode.window.showErrorMessage(t('extension.error.summaryFailed'));
        panel?.webview.postMessage({ type: 'summaryUpdated' });
    }
}

async function writeRestoredGameState(
    prevGmEntry: (GameEntry & Record<string, unknown>) | undefined,
    successMessage: string
): Promise<boolean> {
    const statePath = getGameStatePath();
    if (!statePath) {
        return false;
    }
    const newState = prevGmEntry ? buildStateFromGmEntry(prevGmEntry) : {
        entries: [],
        status: {},
        options: [],
        theme: 'fantasy'
    };
    try {
        fs.writeFileSync(statePath, JSON.stringify(newState, null, 2), 'utf-8');
        replaceHistoryFromDisk();
        sendCurrentState(0, true);
        sendCheckpointList();
        vscode.window.showInformationMessage(successMessage);
        return true;
    } catch (e) {
        vscode.window.showErrorMessage(t('extension.error.undoFailed', { error: String(e) }));
        return false;
    }
}

function sendCheckpointList(): void {
    const ws = getWorkspacePath();
    if (!panel || !ws) {
        return;
    }
    panel.webview.postMessage({
        type: 'checkpointList',
        checkpoints: listCheckpointMetas(ws),
        rewindTargets: listRewindTargets(gameEntryHistory)
    });
}

async function handleUndoLastTurn() {
    const ws = getWorkspacePath();
    if (!ws) {
        vscode.window.showWarningMessage(t('extension.error.workspaceRequired'));
        return;
    }
    if (gameEntryHistory.length === 0) {
        vscode.window.showWarningMessage(t('extension.warning.noHistoryToUndo'));
        return;
    }
    gameEntryHistory = truncateHistoryOneTurn(gameEntryHistory);
    seenEntryIds.clear();
    for (const e of gameEntryHistory) {
        if (e.id) { seenEntryIds.add(e.id); }
    }
    saveHistoryToDisk();
    await writeRestoredGameState(findLastGmEntry(gameEntryHistory), t('extension.info.undoSuccess'));
}

async function handleRestoreToTurn(entryId: string) {
    const ws = getWorkspacePath();
    if (!ws) {
        vscode.window.showWarningMessage(t('extension.error.workspaceRequired'));
        return;
    }
    if (!isValidEntryId(entryId)) {
        vscode.window.showWarningMessage(t('extension.warning.rewindNotFound'));
        return;
    }
    const result = truncateHistoryToGmEntry(gameEntryHistory, entryId);
    if (!result) {
        vscode.window.showWarningMessage(t('extension.warning.rewindNotFound'));
        return;
    }
    gameEntryHistory = result.history;
    seenEntryIds.clear();
    for (const id of result.seenIds) {
        seenEntryIds.add(id);
    }
    saveHistoryToDisk();
    const gm = findLastGmEntry(gameEntryHistory);
    await writeRestoredGameState(gm, t('extension.info.rewindSuccess'));
}

async function handleSaveCheckpoint(label?: string) {
    const ws = getWorkspacePath();
    if (!ws) {
        vscode.window.showWarningMessage(t('extension.error.workspaceRequired'));
        return;
    }
    if (gameEntryHistory.length === 0) {
        vscode.window.showWarningMessage(t('extension.warning.noHistoryToCheckpoint'));
        return;
    }
    const meta = saveCheckpointFile(ws, gameEntryHistory, label);
    if (!meta) {
        vscode.window.showWarningMessage(t('extension.warning.noHistoryToCheckpoint'));
        return;
    }
    sendCheckpointList();
    vscode.window.showInformationMessage(t('extension.info.checkpointSaved', { label: meta.label }));
}

async function handleRestoreCheckpoint(checkpointId: string) {
    const ws = getWorkspacePath();
    if (!ws) {
        vscode.window.showWarningMessage(t('extension.error.workspaceRequired'));
        return;
    }
    const cp = loadCheckpointFile(ws, checkpointId);
    if (!cp?.history?.length) {
        vscode.window.showWarningMessage(t('extension.warning.checkpointNotFound'));
        return;
    }
    gameEntryHistory = cp.history;
    seenEntryIds.clear();
    for (const e of gameEntryHistory) {
        if (e.id) { seenEntryIds.add(e.id); }
    }
    saveHistoryToDisk();
    const gm = findLastGmEntry(gameEntryHistory);
    await writeRestoredGameState(gm, t('extension.info.checkpointRestored', { label: cp.meta.label }));
}

async function handleDeleteCheckpoint(checkpointId: string) {
    const ws = getWorkspacePath();
    if (!ws) {
        return;
    }
    if (deleteCheckpointFile(ws, checkpointId)) {
        sendCheckpointList();
        vscode.window.showInformationMessage(t('extension.info.checkpointDeleted'));
    }
}

async function handleRegenerateLastTurn() {
    const ws = getWorkspacePath();
    if (!ws) {
        vscode.window.showWarningMessage(t('extension.error.workspaceRequired'));
        return;
    }
    if (isGameOverActive()) {
        vscode.window.showWarningMessage(t('extension.warning.gameOverLocked'));
        return;
    }
    let lastUserAction: string | undefined;
    const trimmed = truncateHistoryOneTurn([...gameEntryHistory]);
    for (let i = trimmed.length - 1; i >= 0; i--) {
        if (trimmed[i].role === 'user') {
            lastUserAction = trimmed[i].content;
            break;
        }
    }
    if (!lastUserAction) {
        vscode.window.showWarningMessage(t('extension.warning.noTurnToRegenerate'));
        return;
    }
    gameEntryHistory = trimmed;
    seenEntryIds.clear();
    for (const e of gameEntryHistory) {
        if (e.id) { seenEntryIds.add(e.id); }
    }
    saveHistoryToDisk();
    const gm = findLastGmEntry(gameEntryHistory);
    if (!(await writeRestoredGameState(gm, t('extension.info.regenerateStarted')))) {
        return;
    }
    const regenPrompt = t('gm.prompt.regenerate', { action: lastUserAction });
    const provider = getGmProvider();
    if (provider === 'clipboard') {
        await fallbackToClipboard(regenPrompt);
        return;
    }
    const ok = await invokeGmBridge(regenPrompt);
    if (!ok) {
        await fallbackToClipboard(regenPrompt);
    }
}

export function deactivate() {
    if (fileWatcher) {
        fileWatcher.dispose();
    }
    if (bgmWatcher) {
        bgmWatcher.dispose();
    }
    if (sfxWatcher) {
        sfxWatcher.dispose();
    }
    if (debounceTimer) {
        clearTimeout(debounceTimer);
    }
    if (grokProcess) {
        grokProcess.kill();
        grokProcess = undefined;
    }
    if (gmProcess) {
        gmProcess.kill();
        gmProcess = undefined;
    }
    if (imageGenerationProcess) {
        imageGenerationProcess.kill();
        imageGenerationProcess = undefined;
    }
    if (activeScriptProcess) {
        activeScriptProcess.kill();
        activeScriptProcess = undefined;
    }
}
