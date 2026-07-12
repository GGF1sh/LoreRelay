import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

import { randomBytes } from 'crypto';
import { processDiceMacros } from './diceRoller';
import { loadGameRules, saveGameRules, clearGameRulesCache, type GameRules } from './gameRules';
import { clearCampaignKitCache } from './campaignKit';
import { clearDiscoveryLedgerCache } from './discoveryLedger';
import {
    initI18n,
    t,
    getConfiguredLocale,
    getWebviewStrings,
    normalizeLocale
} from './i18n';
import { handleWebviewMessage, type WebviewHandlerDeps, type WebviewMessage } from './webviewHandlers';
import { buildRulesProfileApplication } from './rulesProfileApplyCore';
import { resolveRulesProfile } from './rulesProfileCore';
import { importTavernCard } from './tavernCardImporter';
import { loadLorebookForUi, saveLorebookFromUi } from './lorebookLoader';
import { initScenarioDirector, pushScenarioDirectorToWebview } from './scenarioDirector';
import {
    initPartyDirector,
    pushPartyDirectorToWebview,
    savePartyDirectorFromUi
} from './partyDirector';
import { initWorldView, pushWorldViewToWebview, setPreferredSettlementLayer } from './worldView';
import { initAutoLocationImageRunner } from './autoLocationImageRunner';
import {
    executeBulkWorldSimulation,
    executeWorldSimulationAdvance,
    getBulkWorldSimMaxSteps,
    isBulkWorldSimDebugEnabled,
} from './worldSimBulkRunner';
import { runObserverWorldTick } from './worldObservatoryTick';
import { isActiveDebugScenario } from './debugScenarioRunner';
import {
    buildDebugTraceUpdateMessage,
    clearDebugTraceLiveRun,
    ensureDebugTraceLiveRun,
    setDebugTraceHostUpdateListener,
} from './debugTraceHostCore';
import { initVlmQueue } from './vlmQueue';
import { generateAndSaveWorldForge, worldForgeFileExists, getDefaultGeneratorInput } from './worldForgeGenerator';
import { bootstrapNpcRegistryFromForge, isWorldForgeEnabled, loadWorldForge, loadWorldForgeDocument } from './worldForge';
import { resolveCommerceForge } from './livingWorldBridge';
import { resetWorldStateFromForge } from './worldState';
import { buildLocationImagePrompt } from './locationImageBuilder';
import { loadWorldState, isWorldStateEnabled } from './worldState';
import { buildChronicleForWorkspace } from './chronicleLoader';
import {
    getMemoryStatus,
    rebuildMemoryIndex,
    searchMemoryPreview,
    setMemoryBackend
} from './memoryService';
import { interceptPlayerAction } from './companionAgent';
import { tryExecuteDebugScenarioCommand } from './debugScenarioRunner';
import { initOocSidekick, generateOocCommentary } from './oocSidekick';
import { commitTurn, branchFromTurn, getGitTimelineStatus, switchToBranch } from './gitManager';
import {
    disposeGameStateWatcher,
    initGameStateSync,
    sendCurrentState,
    startGameStateWatcher,
    getGameEntryHistory,
    getCachedGameState,
    checkPendingTurnResultFile,
} from './gameStateSync';
import { ensureAcceptedTurnScope } from './acceptedTurnReplayGuard';
import { initTurnResultFallback } from './turnResultFallback';
import { isValidEntryId } from './entryId';
import { isValidEventId } from './worldEventLogCore';
import {
    clampWorldGenCount,
    normalizeWorldForgeSeed,
    normalizeWorldForgeTheme
} from './webviewHandlersCore';
import { resolveAllowedImagePath } from './mediaPaths';
import {
    getWorkspacePath,
    getGameStatePath,
    getHistoryPath,
    getGmProvider,
    writeJsonAtomic
} from './workspacePaths';
import {
    initGmBridgeRunner,
    invokeGmBridge,
    fallbackToClipboard,
    killGmBridgeProcesses,
    resetGmBridgeSessions,
    getGmBridgeOutputChannel,
    isGmBridgeBusy
} from './gmBridgeRunner';
import { isParlorMode, isInWorldMode } from './experience';
import {
    initParlorBridge,
    handleParlorPlayerInput,
    handleInWorldPlayerInput,
    startParlorMode,
    startInWorldMode,
    switchToCampaignMode,
    sendParlorSessionToWebview,
    sendInWorldSessionToWebview,
    sendExperienceProfileToWebview,
    sendParlorSettingsToWebview,
    handleSetParlorConnectionProfile,
    handleSaveParlorPersona,
    handleSetParlorBackground,
} from './parlorBridge';
import { promoteParlorToCampaign, demoteCampaignToParlorWithPrompt } from './parlorPromote';
import {
    initTtsBridgeRunner,
    handleRequestNpcTts,
    pushTtsCapabilitiesToWebview,
    testLocalTtsBridge,
    killActiveTtsProcess,
} from './ttsBridgeRunner';
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
    loadBundledSampleScenario,
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
    killImageGenerationProcess,
    enqueueImageGeneration,
    getResolvedImageMode
} from './imageGenRunner';
import {
    initCartographyRunner,
    runCartographyGeneration,
    killCartographyProcess,
    isCartographyGenerationBusy
} from './cartographyRunner';
import { resolveValidatedForgePath } from './cartographyPathCore';
import {
    initProtagonistBootstrap,
    resetProtagonistBootstrapFlag,
    startProtagonistBootstrapWatcher,
} from './protagonistBootstrap';
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
    deleteCharacter,
    uploadPortrait,
    generatePortrait,
    generateExpression,
    addToParty,
    removeFromParty,
    killPortraitProcess,
    killExpressionProcess,
    getCharacters
} from './characterManager';
import { adaptCharacterToWorld } from './characterWorldAdapter';
import { exportSagaToHtml } from './exportHtml';
import { exportReplayToWorkspace, openReplayExport } from './replayExport';
import { buildAntigravityRelayPayload } from './gmPromptBuilderCore';
import {
    ANTIGRAVITY_RELAY_EXPECTED_OUTPUT,
    buildAntigravityRelayRequest,
    buildAntigravityRelayRequestId,
    getAntigravityRelayRequestPath,
} from './antigravityRelayBridgeCore';
import { clearPendingAntigravityRelayRequest } from './antigravityRelayBridgeHost';
import {
    initGmPromptBuilder,
    buildGmPromptBreakdown,
    buildGrokPrompt,
    processProfileUpdates,
    maybeSuggestArchive,
    resetChronicleSessionPending
} from './gmPromptBuilder';
import { CURRENT_SCHEMA_VERSION } from './migrateGameState';
import { commitGameState } from './stateManager';
import { readStateRevision } from './workspaceStateQueueCore';
import { flushScheduledCommercePersist } from './livingWorldCommercePersist';
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
import { registerCoreCommands } from './extension/commands';
import { runWorkspaceSanityCheckCommand } from './worldIntentSanityRunner';
import {
    runPreviewGmTurnTransactionPlanCommand,
    runRetryFailedTransactionsCommand,
    initStateOrchestratorPlanRunner,
} from './stateOrchestratorPlanRunner';
import { runPreviewWorkspaceMigrationsCommand } from './ledgerMigrationRunner';
import { runApplyVehicleStateMigrationCommand } from './ledgerMigrationWritebackRunner';
import { runRestoreVehicleStateMigrationBackupCommand } from './ledgerMigrationRestoreRunner';
import { injectPngMetadata } from './utils/pngMetadata';
import { createShopkeeperRequestGate } from './shopkeeperRequestGate';

let panel: vscode.WebviewPanel | undefined;
let bgmWatcher: vscode.FileSystemWatcher | undefined;
let sfxWatcher: vscode.FileSystemWatcher | undefined;
let extensionContext: vscode.ExtensionContext | undefined;
let openRouterSettingsWarningShown = false;
const shopkeeperRequestGate = createShopkeeperRequestGate(32);

const OPENROUTER_SECRET_KEY = 'lorerelay.openrouter.apiKey';
const TTS_EXTERNAL_SECRET_KEY = 'lorerelay.tts.external.apiKey';
const MAX_PLAYER_INPUT_LENGTH = 2000;

function getPanel(): vscode.WebviewPanel | undefined {
    return panel;
}

export function activate(context: vscode.ExtensionContext) {
    extensionContext = context;
    clearGameRulesCache();
    initI18n(context.extensionPath);

    initImageGenRunner({ getPanel, subscriptions: context.subscriptions });
    initCartographyRunner({ getPanel, extensionPath: context.extensionPath, subscriptions: context.subscriptions });
    initMediaAgent({ getPanel, subscriptions: context.subscriptions });
    initMediaManifest({ getPanel });
    initCharacterManager({
        getPanel,
        onPartyChanged: pushPartyDirectorToWebview,
        subscriptions: context.subscriptions,
    });
    initGmPromptBuilder({
        getPanel: () => panel,
        onArchiveNow: archiveSaga
    });
    resetChronicleSessionPending();
    initOocSidekick(() => panel);
    initCheckpointHandlers({ getPanel, isGameOverActive });
    initGmBridgeRunner({
        getPanel,
        buildGrokPrompt,
        getOpenRouterApiKey,
        subscriptions: context.subscriptions
    });
    initParlorBridge({ getPanel });
    initTurnResultFallback(checkPendingTurnResultFile);

    initTtsBridgeRunner({
        getPanel,
        getTtsApiKey,
        subscriptions: context.subscriptions,
    });

    initRemotePlayServer({
        extensionPath: context.extensionPath,
        getPanel,
        onPlayerInput: handlePlayerInput,
        isGameOverActive,
        isGmBusy: isGmBridgeBusy,
        subscriptions: context.subscriptions
    });

    initProtagonistBootstrap(context);
    const protagonistBootstrapWatcher = startProtagonistBootstrapWatcher();
    if (protagonistBootstrapWatcher) {
        context.subscriptions.push(protagonistBootstrapWatcher);
    }

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
    initWorldView({ getPanel: () => panel });
    initAutoLocationImageRunner({ getPanel: () => panel });
    initVlmQueue({ getPanel: () => panel });
    initStateOrchestratorPlanRunner({ getPanel: () => panel });

    const openGameCmd = vscode.commands.registerCommand('textadventure.openGame', async () => {
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

        let html = await fs.promises.readFile(htmlPath, 'utf-8');

        // Webview の Chromium が古い JS/CSS をディスクキャッシュし、
        // Reload Window でも反映されない問題を防ぐ。
        const webviewAssetUri = (fileName: string): string => {
            const filePath = path.join(webviewPath, fileName);
            const assetVersion = (() => {
                try {
                    return Math.floor(fs.statSync(filePath).mtimeMs).toString(36);
                } catch {
                    return Date.now().toString(36);
                }
            })();
            return panel!.webview.asWebviewUri(
                vscode.Uri.file(filePath).with({ query: `v=${assetVersion}` })
            ).toString();
        };

        const styleUri = webviewAssetUri('style.css');
        const scriptUri = webviewAssetUri('script.js');
        const mermaidUri = webviewAssetUri(path.join('vendor', 'mermaid.min.js'));
        const threeUri = webviewAssetUri(path.join('vendor', 'three.min.js'));
        const genesisAssetBaseUri = panel.webview.asWebviewUri(vscode.Uri.file(webviewPath)).toString();
        const nonce = getNonce();

        html = html
            .replace(/\{\{styleUri\}\}/g, styleUri.toString())
            .replace(/\{\{scriptUri\}\}/g, scriptUri.toString())
            .replace(/\{\{mermaidUri\}\}/g, mermaidUri.toString())
            .replace(/\{\{threeUri\}\}/g, threeUri.toString())
            .replace(/\{\{genesisAssetBaseUri\}\}/g, genesisAssetBaseUri)
            .replace(/\{\{cspSource\}\}/g, panel.webview.cspSource)
            .replace(/\{\{nonce\}\}/g, nonce);

        panel.webview.html = html;

        setDebugTraceHostUpdateListener(() => sendDebugTraceUpdate());
        startWatchingGameState();
        sendLocaleBundle();
        sendDebugCapabilities();
        sendExperienceProfileToWebview();
        sendRelayModeStatus();

        panel.webview.onDidReceiveMessage(
            (message) => handleWebviewMessage(message as WebviewMessage, createWebviewHandlerDeps()),
            undefined,
            context.subscriptions
        );

        panel.onDidDispose(() => {
            setDebugTraceHostUpdateListener(undefined);
            panel = undefined;
            shopkeeperRequestGate.dispose();
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
            resetGmBridgeSessions();
            killImageGenerationProcess();
            killCartographyProcess();
            clearMediaAgentState();
            disposeRemotePlayServer();
            killActiveScriptProcess();
            killPortraitProcess();
            killExpressionProcess();
        });
    });

    registerCoreCommands(context, importStLorebook);

    const setOpenRouterKeyCmd = vscode.commands.registerCommand('textadventure.setOpenRouterApiKey', () => {
        void setOpenRouterApiKey(context);
    });

    const clearOpenRouterKeyCmd = vscode.commands.registerCommand('textadventure.clearOpenRouterApiKey', () => {
        void clearOpenRouterApiKey(context);
    });

    const setTtsApiKeyCmd = vscode.commands.registerCommand('textadventure.setTtsApiKey', () => {
        void setTtsApiKey(context);
    });

    const clearTtsApiKeyCmd = vscode.commands.registerCommand('textadventure.clearTtsApiKey', () => {
        void clearTtsApiKey(context);
    });

    const testLocalTtsCmd = vscode.commands.registerCommand('textadventure.testLocalTts', () => {
        void testLocalTtsBridge();
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

    const generateWorldMapImageCmd = vscode.commands.registerCommand('textadventure.generateWorldMapImage', async () => {
        await handleGenerateWorldMapImage();
    });

    const listLmModelsCmd = vscode.commands.registerCommand('textadventure.listLmModels', async () => {
        const models = await vscode.lm.selectChatModels({});
        if (!models.length) {
            vscode.window.showWarningMessage('vscode-lm: 利用可能なモデルなし（AI拡張が未登録）');
            return;
        }
        const lines = models.map(m => `${m.vendor}/${m.family} — ${m.name} (id: ${m.id})`);
        const channel = vscode.window.createOutputChannel('LoreRelay: LM Models');
        channel.clear();
        channel.appendLine('=== vscode.lm 利用可能モデル ===');
        lines.forEach(l => channel.appendLine(l));
        channel.show(true);
        vscode.window.showInformationMessage(`${models.length} モデル検出 → 出力チャンネル参照`);
    });

    const resetProtagonistBootstrapCmd = vscode.commands.registerCommand(
        'textadventure.resetProtagonistBootstrap',
        () => { void resetProtagonistBootstrapFlag(); }
    );

    const exportReplayCmd = vscode.commands.registerCommand('textadventure.exportReplay', () => {
        void handleExportReplay({});
    });

    const promoteParlorCmd = vscode.commands.registerCommand('textadventure.promoteParlorToCampaign', () => {
        void promoteParlorToCampaign().then((result) => {
            if (result.ok) {
                void sendUiState(0, true);
            }
        });
    });

    const runWorkspaceSanityCheckCmd = vscode.commands.registerCommand(
        'textadventure.runWorkspaceSanityCheck',
        () => { void runWorkspaceSanityCheckCommand(); }
    );

    const previewWorkspaceMigrationsCmd = vscode.commands.registerCommand(
        'textadventure.previewWorkspaceMigrations',
        () => { void runPreviewWorkspaceMigrationsCommand(); }
    );

    const previewGmTurnTransactionPlanCmd = vscode.commands.registerCommand(
        'textadventure.previewGmTurnTransactionPlan',
        () => { void runPreviewGmTurnTransactionPlanCommand(); }
    );

    const retryFailedTransactionsCmd = vscode.commands.registerCommand(
        'textadventure.retryFailedTransactions',
        () => { void runRetryFailedTransactionsCommand(); }
    );

    const applyVehicleStateMigrationCmd = vscode.commands.registerCommand(
        'textadventure.applyVehicleStateMigration',
        () => { void runApplyVehicleStateMigrationCommand(); }
    );

    const restoreVehicleStateMigrationBackupCmd = vscode.commands.registerCommand(
        'textadventure.restoreVehicleStateMigrationBackup',
        () => { void runRestoreVehicleStateMigrationBackupCommand(); }
    );

    const generateWorldForgeCmd = vscode.commands.registerCommand('textadventure.generateWorldForge', async () => {
        const defaults = getDefaultGeneratorInput();
        const seed = await vscode.window.showInputBox({
            prompt: 'World seed (letters, digits, hyphens, underscores — determines the generated world)',
            placeHolder: 'e.g. lost-catacombs',
            validateInput: (v) => {
                const normalized = normalizeWorldForgeSeed(v);
                if (!normalized) { return 'Seed cannot be empty'; }
                if (!isValidEventId(normalized)) { return 'Seed must use letters, digits, hyphens, or underscores only'; }
                return undefined;
            }
        });
        if (!seed) { return; }
        const normalizedSeed = normalizeWorldForgeSeed(seed);
        if (!isValidEventId(normalizedSeed)) { return; }
        const themeInput = await vscode.window.showQuickPick(
            ['dungeon-crawler', 'dark-fantasy', 'cyberpunk', 'default'],
            { placeHolder: 'Choose world theme' }
        );
        if (!themeInput) { return; }
        await handleGenerateWorldForge(
            normalizedSeed,
            normalizeWorldForgeTheme(themeInput),
            defaults.regionCount,
            defaults.factionCount,
            defaults.npcCount
        );
    });

    context.subscriptions.push(
        openGameCmd,
        setOpenRouterKeyCmd,
        clearOpenRouterKeyCmd,
        setTtsApiKeyCmd,
        clearTtsApiKeyCmd,
        testLocalTtsCmd,
        startRemotePlayCmd,
        stopRemotePlayCmd,
        rotateRemotePlayTokenCmd,
        listLmModelsCmd,
        generateWorldForgeCmd,
        generateWorldMapImageCmd,
        resetProtagonistBootstrapCmd,
        exportReplayCmd,
        promoteParlorCmd,
        runWorkspaceSanityCheckCmd,
        previewGmTurnTransactionPlanCmd,
        retryFailedTransactionsCmd,
        previewWorkspaceMigrationsCmd,
        applyVehicleStateMigrationCmd,
        restoreVehicleStateMigrationBackupCmd
    );

    context.subscriptions.push(
        vscode.workspace.onDidChangeConfiguration((e) => {
            if (e.affectsConfiguration('textAdventure.locale')) {
                sendLocaleBundle();
            }
            if (e.affectsConfiguration('textAdventure.antigravityRelay.enabled')) {
                const enabled = vscode.workspace.getConfiguration('textAdventure').get<boolean>('antigravityRelay.enabled', false);
                if (!enabled) {
                    clearRelayRequestForCurrentWorkspace('relay-mode-off');
                }
                sendRelayModeStatus();
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

function sendRelayModeStatus(): void {
    const config = vscode.workspace.getConfiguration('textAdventure');
    panel?.webview.postMessage({
        type: 'relayModeStatus',
        antigravityRelayMode: config.get<boolean>('antigravityRelay.enabled', false)
    });
}

function clearRelayRequestForCurrentWorkspace(reason: 'relay-mode-off' | 'scenario-load' | 'session-transition'): void {
    clearPendingAntigravityRelayRequest(getWorkspacePath(), reason);
}

async function handleSetAntigravityRelayMode(enabled: boolean): Promise<void> {
    const config = vscode.workspace.getConfiguration('textAdventure');
    const target = vscode.workspace.workspaceFolders?.length
        ? vscode.ConfigurationTarget.Workspace
        : vscode.ConfigurationTarget.Global;
    await config.update('antigravityRelay.enabled', enabled, target);
    if (!enabled) {
        clearRelayRequestForCurrentWorkspace('relay-mode-off');
    } else if (!getWorkspacePath()) {
        vscode.window.showWarningMessage(t('extension.error.workspaceRequired'));
    }
    sendRelayModeStatus();
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

export async function getTtsApiKey(): Promise<string> {
    return (await extensionContext?.secrets.get(TTS_EXTERNAL_SECRET_KEY))?.trim() || '';
}

async function setTtsApiKey(context: vscode.ExtensionContext): Promise<void> {
    const key = await vscode.window.showInputBox({
        prompt: t('extension.tts.keyPrompt'),
        placeHolder: t('extension.tts.keyPlaceholder'),
        password: true,
        ignoreFocusOut: true,
    });
    if (key === undefined) { return; }
    const trimmed = key.trim();
    if (!trimmed) {
        vscode.window.showWarningMessage(t('extension.warning.ttsEmptyKey'));
        return;
    }
    await context.secrets.store(TTS_EXTERNAL_SECRET_KEY, trimmed);
    vscode.window.showInformationMessage(t('extension.info.ttsKeySaved'));
}

async function clearTtsApiKey(context: vscode.ExtensionContext): Promise<void> {
    await context.secrets.delete(TTS_EXTERNAL_SECRET_KEY);
    vscode.window.showInformationMessage(t('extension.info.ttsKeyCleared'));
}




function formatPlayerActionWithNote(playerAction: string, authorsNote?: string): string {
    const note = (authorsNote || '').trim();
    if (!note) {
        return playerAction;
    }
    return `[Author's Note: ${note}]\n${playerAction}`;
}

/**
 * プレイヤーの発言を game_state.json に即座に追記する（GM実行前）。
 * 以前は空ワークスペースの最初のターンだけ(ファイル新規作成時のみ)実行していたため、
 * 2ターン目以降のプレイヤー発言はどこにも永続化されず、Webview のローカル state
 * (vscode.setState)にしか残らない = ウィンドウ再読み込みで消える不具合になっていた。
 * Persist-Before-Narrate の原則通り、GM の応答を待たず必ずここで書き込む。
 *
 * entryId が渡された場合はそれをそのまま使う — Webview が楽観的表示に使った ID と
 * 一致させることで、後で gameStateUpdate が返ってきた際に applyGameState() の
 * 既存ID重複チェックに引っかかり、同じ発言が二重に描画されるのを防ぐ。
 */
function persistPlayerInputEntry(playerAction: string, entryId?: string): void {
    const statePath = getGameStatePath();
    if (!statePath) {
        return;
    }

    let state: Record<string, unknown>;
    if (fs.existsSync(statePath)) {
        try {
            state = JSON.parse(fs.readFileSync(statePath, 'utf-8')) as Record<string, unknown>;
        } catch (e) {
            console.error('Failed to read game_state.json before persisting player input', e);
            return;
        }
    } else {
        state = { schemaVersion: CURRENT_SCHEMA_VERSION, entries: [], options: [], status: {} };
    }

    const baseRevision = readStateRevision(state);
    const entries = Array.isArray(state.entries) ? [...state.entries] : [];
    entries.push({
        id: (entryId && isValidEntryId(entryId)) ? entryId : `user-${Date.now()}`,
        role: 'user',
        sender: 'Player',
        content: playerAction
    });
    state.entries = entries;

    commitGameState(state, {
        baseRevision,
        mergeProfile: 'entries-only',
    });
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

async function handlePlayerInput(text: unknown, authorsNote?: string, entryId?: string): Promise<void> {
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

    if (isParlorMode()) {
        await handleParlorPlayerInput(trimmed);
        return;
    }
    if (isInWorldMode()) {
        await handleInWorldPlayerInput(trimmed);
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
    persistPlayerInputEntry(trimmed, entryId);

    if (await tryExecuteDebugScenarioCommand(trimmed)) {
        return;
    }

    const config = vscode.workspace.getConfiguration('textAdventure');
    const relayMode = config.get<boolean>('antigravityRelay.enabled', false);
    if (relayMode) {
        const workspacePath = getWorkspacePath();
        if (!workspacePath) {
            vscode.window.showErrorMessage(t('extension.error.workspaceRequired'));
            return;
        }
        const breakdown = buildGmPromptBreakdown(trimmed);
        const state = getCachedGameState();
        const availableOptions = Array.isArray(state?.options) ? state.options as string[] : [];
        const history = getGameEntryHistory();
        const createdAt = new Date().toISOString();
        const turnIndex = history.filter(e => e.role === 'gm').length + 1;
        const workspaceIdentity = path.resolve(workspacePath);
        try {
            ensureAcceptedTurnScope(workspacePath);
        } catch (e) {
            const reason = e instanceof Error ? e.message : String(e);
            getGmBridgeOutputChannel().appendLine(`[Antigravity Relay] Failed to initialize accepted-turn scope: ${reason}`);
            vscode.window.showErrorMessage(`LoreRelay Antigravity Relay could not start: ${reason}`);
            return;
        }
        const requestId = buildAntigravityRelayRequestId({
            workspacePath,
            playerAction: trimmed,
            createdAt,
            turnIndex,
        });
        const payload = buildAntigravityRelayPayload(trimmed, breakdown, availableOptions, {
            requestId,
            createdAt,
            targetOutput: ANTIGRAVITY_RELAY_EXPECTED_OUTPUT,
            workspacePath,
            workspaceIdentity,
        });
        const request = buildAntigravityRelayRequest({
            requestId,
            createdAt,
            workspacePath,
            workspaceIdentity,
            playerAction: trimmed,
            minimalContext: {
                promptContext: breakdown,
            },
            availableOptions,
        });
        writeJsonAtomic(getAntigravityRelayRequestPath(workspacePath), request);
        await vscode.env.clipboard.writeText(JSON.stringify(payload, null, 2));
        vscode.window.showInformationMessage(t('webview.relay.banner.active'));
        
        panel?.webview.postMessage({ type: 'relayWaitingStateStart' });
        return;
    }

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

async function handleRequestMermaid(target: string): Promise<void> {
    const promptMap: Record<string, string> = {
        questFlow: 'System: Render the current main quest and sub-quests flow using a Mermaid flowchart (e.g. `graph TD`). Include states like active, completed, or failed.',
        relations: 'System: Render the relationship graph of the protagonist and known NPCs using a Mermaid graph (e.g. `graph LR`). Include edge labels for relationship types.'
    };
    const req = promptMap[target] || `System: Render ${target} using Mermaid.js syntax.`;
    await handlePlayerInput(req, undefined);
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

async function handleExportReplay(raw: unknown): Promise<void> {
    const msg = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
    const format = msg.format === 'html' ? 'html' : 'markdown';
    const result = await exportReplayToWorkspace({
        format,
        includeImages: msg.includeImages !== false,
        includeGm: msg.includeGm !== false,
        includeDice: msg.includeDice === true,
        title: typeof msg.title === 'string' ? msg.title : undefined
    });
    if (panel) {
        panel.webview.postMessage({ type: 'replayExportResult', ...result });
    }
    if (result.ok && result.path) {
        const open = await vscode.window.showInformationMessage(
            result.message ?? t('extension.info.replayExported', { path: result.path }),
            t('extension.button.replayOpen')
        );
        if (open === t('extension.button.replayOpen')) {
            await openReplayExport(result.path);
        }
    } else if (!result.ok && result.message) {
        vscode.window.showWarningMessage(result.message);
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

async function sendGitTimelineStatus(): Promise<void> {
    if (!panel) {
        return;
    }
    const status = await getGitTimelineStatus();
    panel.webview.postMessage({ type: 'gitTimelineStatus', ...status });
}

async function sendChronicle(): Promise<void> {
    if (!panel) {
        return;
    }
    const ws = getWorkspacePath();
    if (!ws) {
        panel.webview.postMessage({ type: 'chronicleData', chapters: [] });
        return;
    }
    const chapters = buildChronicleForWorkspace(ws);
    panel.webview.postMessage({ type: 'chronicleData', chapters });
}

async function handleSwitchGitBranch(branchName: string): Promise<void> {
    await switchToBranch(branchName);
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

function sendWorldView(): void {
    pushWorldViewToWebview(getCurrentLocationIdForWorldView());
}

function handleSetSettlementViewLayer(layerId: unknown): void {
    if (typeof layerId === 'string') {
        setPreferredSettlementLayer(layerId);
    }
    pushWorldViewToWebview(getCurrentLocationIdForWorldView());
}

/** World Observatory: advance the world one tick without a player turn (watch/advance mode). */
function handleObserverWorldTick(mode: 'watch' | 'advance'): void {
    runObserverWorldTick(mode);
    pushWorldViewToWebview(getCurrentLocationIdForWorldView());
}


async function handleGenerateWorldForge(
    seed: string,
    theme: string,
    regionCount: number,
    factionCount: number,
    npcCount: number
): Promise<void> {
    const safeSeed = normalizeWorldForgeSeed(seed);
    const safeTheme = normalizeWorldForgeTheme(theme);
    if (!safeSeed || !isValidEventId(safeSeed)) {
        vscode.window.showWarningMessage('World Forge: Valid seed is required.');
        return;
    }
    const safeRegionCount = clampWorldGenCount(regionCount, 3, 12, 5);
    const safeFactionCount = clampWorldGenCount(factionCount, 2, 6, 3);
    const safeNpcCount = clampWorldGenCount(npcCount, 2, 20, 6);

    const isOverwrite = worldForgeFileExists();
    if (isOverwrite) {
        const answer = await vscode.window.showWarningMessage(
            'world_forge.json already exists. Overwrite it? (A .bak backup will be created.)',
            { modal: true },
            'Overwrite',
            'Cancel'
        );
        if (answer !== 'Overwrite') { return; }
    }

    panel?.webview.postMessage({ type: 'worldGenStart' });

    const result = await generateAndSaveWorldForge(
        {
            worldSeed: safeSeed,
            theme: safeTheme,
            regionCount: safeRegionCount,
            factionCount: safeFactionCount,
            npcCount: safeNpcCount
        },
        { createBackup: true }
    );

    if (!result.success) {
        panel?.webview.postMessage({ type: 'worldGenEnd', success: false });
        vscode.window.showErrorMessage(`World Forge generation failed: ${result.error ?? 'unknown error'}`);
        return;
    }

    if (result.warnings.length > 0) {
        console.warn('[generateWorldForge] warnings:', result.warnings);
    }

    const forge = loadWorldForge();
    if (forge) {
        bootstrapNpcRegistryFromForge(forge, { createBackup: true, overwrite: isOverwrite });
        resetWorldStateFromForge(forge, isOverwrite);
        saveGameRules({ enableWorldForge: true, enableNpcRegistry: true });
        sendGameRules();
    }

    panel?.webview.postMessage({ type: 'worldGenEnd', success: true });
    pushWorldViewToWebview();

    vscode.window.showInformationMessage(
        `World "${forge?.meta.worldName ?? safeSeed}" generated! (${forge?.geography.regions.length ?? 0} regions, ${forge?.factions.length ?? 0} factions, ${forge?.initialNpcs.length ?? 0} NPCs)`
    );
}

async function handleGenerateWorldMapImage(): Promise<void> {
    if (!isWorldForgeEnabled()) {
        vscode.window.showErrorMessage('World Forge not enabled or missing world_forge.json.');
        return;
    }
    const wsPath = getWorkspacePath();
    const forgePath = wsPath ? resolveValidatedForgePath(wsPath) : undefined;
    if (!forgePath) {
        vscode.window.showErrorMessage('world_forge.json not found in workspace root.');
        return;
    }
    if (isCartographyGenerationBusy()) {
        vscode.window.showWarningMessage('World map generation is already running.');
        return;
    }
    const ok = await runCartographyGeneration(forgePath);
    if (ok) {
        pushWorldViewToWebview(getCurrentLocationIdForWorldView());
        vscode.window.showInformationMessage('World map image saved as world_map.png.');
    } else {
        vscode.window.showErrorMessage('World map generation failed. See LoreRelay: Cartography output.');
    }
}

async function handleGenerateLocationImage(locationId: string): Promise<void> {
    const trimmed = locationId.trim();
    if (!trimmed || !isValidEventId(trimmed)) {
        vscode.window.showWarningMessage('World Forge: Valid location ID is required.');
        return;
    }
    const forge = loadWorldForge();
    if (!forge) {
        vscode.window.showErrorMessage('World Forge not enabled or missing world_forge.json.');
        return;
    }
    const worldState = isWorldStateEnabled() ? loadWorldState() : undefined;
    const prompt = buildLocationImagePrompt(forge, trimmed, worldState);
    if (!prompt) {
        vscode.window.showErrorMessage(`Could not build image prompt for location: ${trimmed}`);
        return;
    }
    panel?.webview.postMessage({ type: 'locationImageGenStart', locationId: trimmed });
    const mode = getResolvedImageMode();
    const queued = enqueueImageGeneration(prompt, mode, `loc:${trimmed}`);
    if (queued) {
        vscode.window.showInformationMessage(`Queued image generation for ${trimmed}.`);
    } else {
        panel?.webview.postMessage({ type: 'locationImageGenEnd', success: false, locationId: trimmed });
        vscode.window.showWarningMessage('Image generation already queued or busy.');
    }
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

function isDebugTraceVisible(): boolean {
    const wsPath = getWorkspacePath();
    const debugScenarioActive = wsPath ? isActiveDebugScenario(wsPath) : false;
    return isBulkWorldSimDebugEnabled() || debugScenarioActive;
}

function sendDebugTraceUpdate(): void {
    if (!panel || !isDebugTraceVisible()) {
        return;
    }
    panel.webview.postMessage(buildDebugTraceUpdateMessage());
}

function syncDebugTraceLiveRun(): void {
    const wsPath = getWorkspacePath();
    const debugScenarioActive = wsPath ? isActiveDebugScenario(wsPath) : false;
    if (!debugScenarioActive) {
        clearDebugTraceLiveRun();
        return;
    }
    const state = loadWorldState();
    ensureDebugTraceLiveRun(state?.worldTurn ?? 0);
}

function sendDebugCapabilities(): void {
    if (!panel) { return; }
    syncDebugTraceLiveRun();
    const wsPath = getWorkspacePath();
    const debugScenarioActive = wsPath ? isActiveDebugScenario(wsPath) : false;
    const rules = loadGameRules();
    const showDebugConsole = isDebugTraceVisible();
    const forge = loadWorldForge();
    const rawDoc = loadWorldForgeDocument();
    const commerce = forge && rawDoc ? resolveCommerceForge(forge, rawDoc) : undefined;
    const marketLocations = forge && commerce
        ? commerce.markets.map((m) => {
            const loc = forge.geography.locations.find((l) => l.id === m.locationId);
            return { id: m.locationId, name: loc?.name ?? m.locationId };
        })
        : [];
    const marketCommodities = commerce
        ? commerce.commodities.map((c) => ({ id: c.id, name: c.name }))
        : [];
    panel.webview.postMessage({
        type: 'debugCapabilities',
        bulkWorldSim: showDebugConsole,
        bulkWorldSimMaxSteps: getBulkWorldSimMaxSteps(),
        debugScenarioActive,
        showDebugConsole,
        enableCommerce: rules.enableCommerce === true,
        livingWorldMarketDebug: showDebugConsole && rules.enableCommerce === true && marketLocations.length > 0,
        marketLocations,
        marketCommodities,
    });
    sendDebugTraceUpdate();
}

async function handleUpdateGameRules(raw: unknown): Promise<void> {
    if (!raw || typeof raw !== 'object') return;
    saveGameRules(raw as Partial<GameRules>);
    clearCampaignKitCache();
    clearDiscoveryLedgerCache();
    sendGameRules();
}

async function handleGenesisApplyProfile(raw: unknown): Promise<void> {
    const message = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
    const answers = message.answers && typeof message.answers === 'object'
        ? message.answers as Record<string, unknown>
        : undefined;
    const application = buildRulesProfileApplication(loadGameRules(), answers);
    const ok = saveGameRules(application.mergedRules);
    if (ok) {
        clearCampaignKitCache();
        clearDiscoveryLedgerCache();
        sendGameRules();
        panel?.webview.postMessage({
            type: 'genesisProfileApplied',
            ok: true,
            profileId: application.profile.profileId,
            summary: application.profile.summary,
            warnings: application.profile.warnings,
            changedKeys: application.changedKeys,
        });
        vscode.window.setStatusBarMessage(`Genesis profile applied: ${application.profile.profileId}`, 3500);
        return;
    }

    panel?.webview.postMessage({
        type: 'genesisProfileApplied',
        ok: false,
        profileId: application.profile.profileId,
        summary: application.profile.summary,
        warnings: application.profile.warnings,
        changedKeys: [],
        error: 'save_failed',
    });
    vscode.window.showErrorMessage('Genesis profile could not be saved to game_rules.json.');
}

async function handleGenesisGenerateImage(raw: unknown): Promise<void> {
    const message = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
    const profile = resolveRulesProfile({
        genre: message.genre,
        imageGenerationWanted: true,
    });
    const prompt = profile.comfyUiStylePrompt.slice(0, 4000);
    if (!prompt) { return; }
    await runImageGeneration(prompt, 'illustrious', 'genesis');
}

async function exportCharacterCard(payload: any): Promise<void> {
    const defaultName = (payload.char_name || 'Character').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 80) || 'Character';
    const uri = await vscode.window.showSaveDialog({
        defaultUri: vscode.Uri.file(`${defaultName}.png`),
        filters: { 'PNG Images': ['png'] },
        title: 'Export Character Card (V2/V3)'
    });
    if (!uri) return;

    try {
        let pngBuffer: Buffer;
        const match = typeof payload.portrait === 'string'
            ? /^data:image\/png;base64,([a-zA-Z0-9+/=\r\n]+)$/.exec(payload.portrait)
            : null;
        if (match) {
            const base64Data = match[1].replace(/\s+/g, '');
            if (base64Data.length > 12 * 1024 * 1024) {
                vscode.window.showErrorMessage('Portrait PNG is too large for character card export.');
                return;
            }
            pngBuffer = Buffer.from(base64Data, 'base64');
            if (pngBuffer.length <= 0 || pngBuffer.length > 8 * 1024 * 1024) {
                vscode.window.showErrorMessage('Portrait PNG is too large for character card export.');
                return;
            }
        } else {
            vscode.window.showErrorMessage('No valid PNG portrait provided for export.');
            return;
        }

        const metadata = { ...payload };
        delete metadata.portrait;
        delete metadata.expressions; // Strip oversized base64 data from JSON metadata
        const jsonStr = JSON.stringify(metadata);
        const base64Json = Buffer.from(jsonStr, 'utf-8').toString('base64');
        
        const finalPngBuffer = injectPngMetadata(pngBuffer, 'chara', base64Json);
        
        await vscode.workspace.fs.writeFile(uri, new Uint8Array(finalPngBuffer));
        vscode.window.showInformationMessage(`Character exported successfully to ${uri.fsPath}`);
    } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        vscode.window.showErrorMessage(`Failed to export character: ${message}`);
    }
}

function getCurrentLocationIdForWorldView(): string | undefined {
    const world = getCachedGameState()?.world as Record<string, unknown> | undefined;
    const id = typeof world?.currentLocationId === 'string' ? world.currentLocationId : undefined;
    return id && isValidEntryId(id) ? id : undefined;
}

async function sendUiState(retryCount = 0, fullHistory = false): Promise<void> {
    sendExperienceProfileToWebview();
    if (isParlorMode()) {
        sendParlorSessionToWebview();
        sendParlorSettingsToWebview();
        return;
    }
    if (isInWorldMode()) {
        sendInWorldSessionToWebview();
        sendParlorSettingsToWebview();
        return;
    }
    await sendCurrentState(retryCount, fullHistory);
}

/** Webview postMessage ルーターへ渡すハンドラ束ね。 */
function createWebviewHandlerDeps(): WebviewHandlerDeps {
    return {
        handlePlayerInput,
        runImageGeneration,
        handleLocaleChange,
        sendLocaleBundle,
        sendCurrentState: sendUiState,
        handleStartParlor: async (characterId?: string) => {
            clearRelayRequestForCurrentWorkspace('session-transition');
            const ok = await startParlorMode(characterId);
            if (ok) {
                await sendUiState(0, true);
            }
        },
        handleStartInWorld: async (characterId?: string) => {
            clearRelayRequestForCurrentWorkspace('session-transition');
            const ok = await startInWorldMode(characterId);
            if (ok) {
                await sendUiState(0, true);
                pushWorldViewToWebview(getCurrentLocationIdForWorldView());
            }
        },
        handleSwitchExperienceProfile: async (profile: unknown) => {
            if (profile === 'campaign') {
                if (isInWorldMode()) {
                    clearRelayRequestForCurrentWorkspace('session-transition');
                    await switchToCampaignMode();
                    await sendUiState(0, true);
                    return;
                }
                clearRelayRequestForCurrentWorkspace('session-transition');
                const result = await promoteParlorToCampaign();
                if (result.ok) {
                    await sendUiState(0, true);
                }
            } else if (profile === 'parlor') {
                clearRelayRequestForCurrentWorkspace('session-transition');
                const ok = await demoteCampaignToParlorWithPrompt();
                if (ok) {
                    await sendUiState(0, true);
                }
            } else if (profile === 'inworld') {
                clearRelayRequestForCurrentWorkspace('session-transition');
                const ok = await startInWorldMode();
                if (ok) {
                    await sendUiState(0, true);
                    pushWorldViewToWebview(getCurrentLocationIdForWorldView());
                }
            }
        },
        handlePromoteParlor: async () => {
            clearRelayRequestForCurrentWorkspace('session-transition');
            const result = await promoteParlorToCampaign();
            if (result.ok) {
                await sendUiState(0, true);
            }
        },
        handlePreviewGmTurnTransactionPlan: async () => {
            await runPreviewGmTurnTransactionPlanCommand();
        },
        handleRetryFailedTransactions: async () => {
            await runRetryFailedTransactionsCommand();
        },
        sendParlorSettingsToWebview,
        handleSetParlorConnectionProfile,
        handleSaveParlorPersona,
        handleSetParlorBackground,
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
        sendWorldView,
        handleSetSettlementViewLayer,
        handleObserverWorldTick,
        handleGenerateWorldForge,
        handleGenerateWorldMapImage,
        handleGenerateLocationImage,
        handleSavePartyDirector,
        handleCopyRemotePlayUrl,
        saveCharacter,
        setActiveCharacter,
        deleteCharacter,
        uploadPortrait,
        generatePortrait,
        generateExpression,
        adaptCharacterToWorld: async (character) => {
            const forge = loadWorldForge();
            let theme = forge?.meta?.theme;
            if (!theme) {
                const statePath = getGameStatePath();
                if (statePath && fs.existsSync(statePath)) {
                    try {
                        const state = JSON.parse(fs.readFileSync(statePath, 'utf-8'));
                        if (typeof state.theme === 'string' && state.theme) { theme = state.theme; }
                    } catch { /* ignore */ }
                }
            }
            if (!theme) {
                vscode.window.showWarningMessage('No world theme found yet. Set up the world first, then adapt the character.');
                return;
            }
            const draft = await adaptCharacterToWorld(character, theme);
            if (!draft) {
                vscode.window.showErrorMessage('Failed to generate a world-adapted character draft.');
                return;
            }
            panel?.webview.postMessage({ type: 'characterWorldAdaptationDraft', draft });
        },
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
        loadScenarioPack: async () => {
            clearRelayRequestForCurrentWorkspace('scenario-load');
            await loadScenarioPack();
        },
        loadBundledSampleScenario: async (sampleId: string) => {
            clearRelayRequestForCurrentWorkspace('scenario-load');
            await loadBundledSampleScenario(sampleId);
        },
        sendImageGenConfig,
        handleUpdateImageGenConfig,
        sendGameRules,
        sendDebugCapabilities,
        handleUpdateGameRules,
        toggleRemotePlay,
        sendRemotePlayStatus,
        handleSetAntigravityRelayMode,
        handleBranchTimeline,
        sendGitTimelineStatus,
        sendChronicle,
        handleSwitchGitBranch,
        handleRequestForceSpeak,
        handleExportHtml,
        handleExportReplay,
        handleRequestMermaid,
        exportCharacterCard,
        handleRequestVlmAnalysis: async (imagePath: string) => {
            if (!resolveAllowedImagePath(imagePath)) {
                vscode.window.showWarningMessage('VLM: Image path is not allowed or missing.');
                return;
            }
            const { enqueueVlmAnalysis, buildVlmMetaFromGameState } = await import('./vlmQueue');
            await enqueueVlmAnalysis(imagePath, buildVlmMetaFromGameState());
        },
        handleRequestNpcPortraitLink: async (npcId: string) => {
            if (!isValidEntryId(npcId)) { return; }
            const { loadVisualMemory } = await import('./visualMemory');
            const mem = loadVisualMemory();
            const entries = Object.values(mem.entries)
                .filter((e) => resolveAllowedImagePath(e.imagePath))
                .sort((a, b) => b.analyzedAt.localeCompare(a.analyzedAt))
                .slice(0, 40);
            if (entries.length === 0) {
                vscode.window.showWarningMessage('No analyzed images in visual memory. Analyze an image first via the Gallery.');
                return;
            }
            const items = entries.map((e) => ({
                label: path.basename(e.imagePath),
                description: e.locationId ? `@${e.locationId}` : '',
                detail: e.description?.slice(0, 80),
                imagePath: e.imagePath,
            }));
            const picked = await vscode.window.showQuickPick(items, {
                placeHolder: `Select portrait image for NPC "${npcId}"`,
                matchOnDescription: true,
                matchOnDetail: true,
            });
            if (!picked) { return; }
            const { setNpcPortrait } = await import('./npcRegistry');
            const ok = setNpcPortrait(npcId, picked.imagePath);
            if (ok) {
                vscode.window.setStatusBarMessage(`Portrait set for ${npcId}`, 3000);
                pushWorldViewToWebview(getCurrentLocationIdForWorldView());
            } else {
                vscode.window.showWarningMessage(`NPC "${npcId}" not found or image path rejected.`);
            }
        },
        handleSetNpcPortrait: async (npcId: string, imagePath: string) => {
            const { setNpcPortrait } = await import('./npcRegistry');
            const ok = setNpcPortrait(npcId, imagePath);
            if (ok) {
                vscode.window.setStatusBarMessage(`Portrait set for ${npcId}`, 3000);
                pushWorldViewToWebview(getCurrentLocationIdForWorldView());
            } else {
                vscode.window.showWarningMessage(`NPC "${npcId}" not found or image path rejected.`);
            }
        },
        handleRunQuickstart: async (prompt: string, overwrite: boolean) => {
            clearRelayRequestForCurrentWorkspace('scenario-load');
            const { runQuickstart } = await import('./quickstartRunner');
            const result = await runQuickstart(prompt, overwrite);
            if (result.success) {
                vscode.window.showInformationMessage('Quickstart generation complete! Reloading...');
                sendCurrentState(1, false);
                pushScenarioDirectorToWebview();
                pushWorldViewToWebview();
            } else if (result.error === 'ALREADY_EXISTS') {
                const ans = await vscode.window.showWarningMessage(
                    'Workspace already contains a world_forge.json or character.json. Overwrite?',
                    'Yes', 'Cancel'
                );
                if (ans === 'Yes') {
                    const res2 = await runQuickstart(prompt, true);
                    if (res2.success) {
                        vscode.window.showInformationMessage('Quickstart generation complete! Reloading...');
                        sendCurrentState(1, false);
                        pushScenarioDirectorToWebview();
                        pushWorldViewToWebview();
                    } else {
                        vscode.window.showErrorMessage(`Quickstart failed: ${res2.error}`);
                    }
                }
            } else {
                vscode.window.showErrorMessage(`Quickstart failed: ${result.error}`);
            }
        },
        handleGenesisApplyProfile,
        handleGenesisGenerateImage,
        handleAcceptQuest: async (questId: string) => {
            const { loadWorldState, saveWorldState } = await import('./worldState');
            const state = loadWorldState();
            if (state && state.questHooks) {
                const q = state.questHooks.find(h => h.id === questId);
                if (q && q.status === 'available') {
                    q.status = 'active';
                    saveWorldState(state);
                    pushWorldViewToWebview();
                }
            }
        },
        handleAcceptCampaignJob: async (boardEntryId: string) => {
            const { acceptCampaignJobBoardEntry } = await import('./campaignJobAccept');
            const gameState = getCachedGameState() as { world?: { currentLocationId?: string } } | undefined;
            const currentLocationId = typeof gameState?.world?.currentLocationId === 'string'
                ? gameState.world.currentLocationId
                : undefined;
            if (acceptCampaignJobBoardEntry(boardEntryId, currentLocationId)) {
                pushWorldViewToWebview();
            }
        },
        handleRequestNpcTts: async (raw: unknown) => {
            await handleRequestNpcTts(raw);
        },
        pushTtsCapabilities: () => {
            pushTtsCapabilitiesToWebview();
        },
        insertChatDraft: (text: string) => {
            const draft = text.trim().slice(0, 20_000);
            if (!draft) { return; }
            panel?.webview.postMessage({ type: 'insertChatDraft', text: draft });
        },
        handleBulkAdvanceWorldSim: async (steps: number) => {
            const wsPath = getWorkspacePath();
            const inDebugScenario = wsPath ? isActiveDebugScenario(wsPath) : false;
            const maxSteps = getBulkWorldSimMaxSteps();
            const clamped = Math.max(1, Math.min(maxSteps, Math.floor(steps)));
            const confirmLabel = t('extension.confirm.bulkWorldSimConfirm');
            const ok = await vscode.window.showWarningMessage(
                t('extension.confirm.bulkWorldSim', { steps: String(clamped) }),
                { modal: true },
                confirmLabel
            );
            if (ok !== confirmLabel) { return; }

            const result = inDebugScenario
                ? executeWorldSimulationAdvance(clamped, maxSteps)
                : await executeBulkWorldSimulation(clamped);
            if (!result.ok) {
                const key =
                    result.reason === 'DISABLED' ? 'extension.warn.bulkWorldSimDisabled'
                        : result.reason === 'SIM_OFF' ? 'extension.warn.bulkWorldSimSimOff'
                            : result.reason === 'NO_FORGE' ? 'extension.warn.bulkWorldSimNoForge'
                                : 'extension.warn.bulkWorldSimInvalidSteps';
                vscode.window.showWarningMessage(t(key));
                panel?.webview.postMessage({ type: 'bulkWorldSimResult', ok: false, reason: result.reason });
                return;
            }

            const s = result.summary;
            pushWorldViewToWebview(getCurrentLocationIdForWorldView());
            vscode.window.showInformationMessage(
                t('extension.info.bulkWorldSimDone', {
                    start: String(s.startWorldTurn),
                    end: String(s.endWorldTurn),
                    events: String(s.totalEventsEmitted),
                })
            );
            panel?.webview.postMessage({ type: 'bulkWorldSimResult', ok: true, summary: s });
            sendDebugTraceUpdate();
        },
        handleLivingWorldMarketDebug: async (raw: unknown) => {
            const doc = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
            const locationId = typeof doc.locationId === 'string' ? doc.locationId : '';
            const commodityId = typeof doc.commodityId === 'string' ? doc.commodityId : '';
            const multiplier = typeof doc.multiplier === 'number' ? doc.multiplier : Number(doc.multiplier);
            if (!locationId || !commodityId || !Number.isFinite(multiplier) || multiplier <= 0) {
                panel?.webview.postMessage({
                    type: 'livingWorldMarketDebugResult',
                    ok: false,
                    reason: 'INVALID',
                });
                return;
            }
            const { applyLivingWorldMarketDebugOps } = await import('./livingWorldMarketDebug');
            const result = applyLivingWorldMarketDebugOps([{
                locationId,
                commodityId,
                multiplier,
            }]);
            if (!result.ok) {
                panel?.webview.postMessage({
                    type: 'livingWorldMarketDebugResult',
                    ok: false,
                    reason: result.reason,
                });
                return;
            }
            pushWorldViewToWebview(getCurrentLocationIdForWorldView());
            panel?.webview.postMessage({
                type: 'livingWorldMarketDebugResult',
                ok: true,
                applied: result.applied,
            });
        },
        handleLivingWorldDirectTrade: async (raw: unknown) => {
            const doc = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
            const op = doc.op === 'buy' || doc.op === 'sell' ? doc.op : '';
            const marketLocationId = typeof doc.marketLocationId === 'string' ? doc.marketLocationId : '';
            const commodityId = typeof doc.commodityId === 'string' ? doc.commodityId : '';
            const qty = typeof doc.qty === 'number' ? doc.qty : Number(doc.qty);
            if (!op || !marketLocationId || !commodityId || !Number.isFinite(qty)) {
                panel?.webview.postMessage({
                    type: 'livingWorldDirectTradeResult',
                    ok: false,
                    reason: 'INVALID',
                });
                return;
            }
            const { executeLivingWorldDirectTrade } = await import('./livingWorldCommerceUi');
            const result = executeLivingWorldDirectTrade({
                op,
                marketLocationId,
                commodityId,
                qty,
            });
            if (!result.ok) {
                panel?.webview.postMessage({
                    type: 'livingWorldDirectTradeResult',
                    ok: false,
                    reason: result.reason,
                    code: result.code,
                    message: result.message,
                });
                return;
            }
            pushWorldViewToWebview(getCurrentLocationIdForWorldView());
            panel?.webview.postMessage({
                type: 'livingWorldDirectTradeResult',
                ok: true,
                trade: result.trade,
            });
        },
        handleShopkeeperDirectTrade: async (raw: unknown) => {
            const { parseShopkeeperIntent, shopkeeperRejectionText } = await import('./shopkeeperDirectTradeCore');
            const doc = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
            const requestId = typeof doc.requestId === 'string' && /^[A-Za-z0-9_-]{8,128}$/.test(doc.requestId)
                ? doc.requestId
                : '';
            const intent = parseShopkeeperIntent(raw);
            if (!requestId || !intent) {
                panel?.webview.postMessage({
                    type: 'shopkeeperDirectTradeResult', requestId, ok: false,
                    rejection: { code: 'INVALID_QTY', ...shopkeeperRejectionText('INVALID_QTY') },
                });
                return;
            }
            const workspaceKey = getWorkspacePath() ?? '__no_workspace__';
            const response = await shopkeeperRequestGate.run(workspaceKey, requestId, async () => {
                // Only identifiers, operation and quantity cross the boundary.
                const { executeLivingWorldDirectTrade, flushScheduledCommercePersist } = await import('./livingWorldCommerceUi');
                const result = executeLivingWorldDirectTrade(intent);
                if (!result.ok) {
                    const code = result.code || result.reason;
                    return {
                        type: 'shopkeeperDirectTradeResult' as const, requestId, ok: false,
                        rejection: { code, ...shopkeeperRejectionText(code) },
                    };
                }
                const persistence = flushScheduledCommercePersist();
                const persisted = persistence.ok
                    && persistence.gameAttempted && persistence.gameOk
                    && persistence.worldAttempted && persistence.worldOk;
                if (!persisted) {
                    return {
                        type: 'shopkeeperDirectTradeResult' as const, requestId, ok: false,
                        rejection: {
                            code: persistence.partial ? 'PARTIAL_PERSIST_FAILED' : 'PERSIST_FAILED',
                            message: '取引結果を世界に書き込んだことを確認できませんでした。',
                            nextStep: '現在の状態を確認してから再試行してください。',
                        },
                        persistence,
                    };
                }
                pushWorldViewToWebview(getCurrentLocationIdForWorldView());
                return {
                    type: 'shopkeeperDirectTradeResult' as const, requestId, ok: true,
                    receipt: {
                        op: intent.op, commodityId: intent.commodityId, qty: intent.qty,
                        total: intent.op === 'buy' ? result.trade?.totalCost : result.trade?.totalRevenue,
                        applied: result.trade?.applied,
                        persisted: true,
                    },
                };
            });
            panel?.webview.postMessage(response);
        },
        handleLivingWorldSetPlayerRole: async (raw: unknown) => {
            const doc = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
            const role = typeof doc.role === 'string' ? doc.role : '';
            if (!role) {
                panel?.webview.postMessage({
                    type: 'livingWorldSetPlayerRoleResult',
                    ok: false,
                    reason: 'INVALID_ROLE',
                });
                return;
            }
            const { setLivingWorldPlayerRole } = await import('./livingWorldCommerceUi');
            const result = setLivingWorldPlayerRole(role as import('./livingWorldTypes').PlayerRole);
            if (!result.ok) {
                panel?.webview.postMessage({
                    type: 'livingWorldSetPlayerRoleResult',
                    ok: false,
                    reason: result.reason,
                });
                return;
            }
            pushWorldViewToWebview(getCurrentLocationIdForWorldView());
            panel?.webview.postMessage({
                type: 'livingWorldSetPlayerRoleResult',
                ok: true,
            });
        },
    };
}

export function deactivate() {
    panel = undefined;
    flushScheduledCommercePersist();
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
    resetGmBridgeSessions();
    killImageGenerationProcess();
    killCartographyProcess();
    clearMediaAgentState();
    disposeRemotePlayServer();
    killActiveScriptProcess();
    killActiveTtsProcess();
    killPortraitProcess();
    killExpressionProcess();
}
