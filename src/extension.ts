import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { renderWebviewHtml } from './webviewHtmlCore';

import { randomBytes } from 'crypto';
import { processDiceMacros } from './diceRoller';
import { loadGameRules, saveGameRules, clearGameRulesCache, type GameRules } from './gameRules';
import { setEventExcluded } from './gameRulesCore';
import { isValidDomainEventId } from './domainCore';
import { isValidGuildEventId } from './guildCore';
import { isValidPetitionId } from './domainAudienceCore';
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
import { AbilityDefinition, AbilityFixtureDocument, StatusDefinition } from './combatAbilityTypes';
import { CustomAbilityLibrary, duplicateBuiltinAbility, emptyCustomAbilityLibrary, exportCustomAbilityLibrary, importCustomAbilityLibrary, removeCustomAbility, saveCustomAbility, validateWorkshopAbility, workshopShot } from './combatAbilityWorkshopCore';
import { loadCustomAbilityLibrary, writeCustomAbilityLibrary } from './combatAbilityWorkshopStore';
import { CombatLabDocument, CombatLabPlayback, CombatLabRun, compareCombatLabRuns, createCombatLabPlayback, emptyCombatLabDocument, exportCombatLabDocument, importCombatLabDocument, initialCombatLabScenarios, isValidScenario, runCombatLab, swapCombatLabSides } from './combatLabCore';
import { loadCombatLabDocument, writeCombatLabDocument } from './combatLabStore';
import { CombatCommandPlaytestSession, advanceCombatCommandPlaytest, combatCommandPlaytestSnapshot, createCombatCommandPlaytest, issueCombatCommand } from './combatCommandPlaytestCore';
import { buildRulesProfileApplication } from './rulesProfileApplyCore';
import { resolveRulesProfile } from './rulesProfileCore';
import { importTavernCard } from './tavernCardImporter';
import { loadLorebookForUi, saveLorebookFromUi } from './lorebookLoader';
import { getEventManagementCatalog, getSuggestedExclusions } from './eventManagementCore';
import { initScenarioDirector, pushScenarioDirectorToWebview } from './scenarioDirector';
import {
    initPartyDirector,
    pushPartyDirectorToWebview,
    savePartyDirectorFromUi
} from './partyDirector';
import {
    clearWorldSettlementFocus,
    initWorldView,
    pushWorldViewToWebview,
    setPreferredSettlementLayer,
    setWorldSettlementFocus,
} from './worldView';
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
    handleSelectParlorPersonaPreset,
    handleSaveNewParlorPersonaPreset,
    handleUpdateParlorPersonaPreset,
    handleCreateParlorPersonaFromCharacter,
    handleImportParlorPersonaJson,
    handleSetParlorBackground,
    switchParlorCharacter,
    importParlorCharacter,
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
import { routeGameplayInput } from './gameplayInputRouteCore';
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
import { runUpgradeVehicleStateForGameplaySpineCommand } from './gameplaySpineVehicleStateUpgradeRunner';
import { runGameplaySpineVehicleRepairCommand } from './gameplaySpineVehicleRepairRunner';
import { injectPngMetadata } from './utils/pngMetadata';
import { createShopkeeperRequestGate } from './shopkeeperRequestGate';
import { createEndDayRequestGate } from './endDayRequestGate';
import { createMarketTravelRequestGate } from './marketTravelRequestGate';
import {
    createDeterministicWorkspaceMutationGate,
    type DeterministicWorkspaceMutationLease,
    WORLD_MUTATION_IN_PROGRESS,
} from './deterministicWorkspaceMutationGate';

let panel: vscode.WebviewPanel | undefined;
let combatWorkshopStatuses: StatusDefinition[] = [];
let combatWorkshopBuiltins: AbilityDefinition[] = [];
let combatWorkshopLibrary: CustomAbilityLibrary | undefined;
let extensionInstallationPath = '';
let combatLabDocument: CombatLabDocument | undefined;
let combatLabPlayback: CombatLabPlayback | undefined;
let combatLabRecentRuns: CombatLabRun[] = [];
let combatCommandPlaytestSession: CombatCommandPlaytestSession | undefined;
let bgmWatcher: vscode.FileSystemWatcher | undefined;
let sfxWatcher: vscode.FileSystemWatcher | undefined;
let extensionContext: vscode.ExtensionContext | undefined;
let openRouterSettingsWarningShown = false;
const shopkeeperRequestGate = createShopkeeperRequestGate(32);
const endDayRequestGate = createEndDayRequestGate(32);
const marketTravelRequestGate = createMarketTravelRequestGate(32);
const deterministicWorkspaceMutationGate = createDeterministicWorkspaceMutationGate();
const retainedRelayGameplayLeases = new Map<string, {
    requestId: string;
    lease: DeterministicWorkspaceMutationLease;
}>();

const WORLD_MUTATION_BUSY_COPY = {
    code: WORLD_MUTATION_IN_PROGRESS,
    message: '別の操作を確定中です。',
    nextStep: '完了後に、もう一度操作してください。自動では再試行しません。',
} as const;

const OPENROUTER_SECRET_KEY = 'lorerelay.openrouter.apiKey';
const TTS_EXTERNAL_SECRET_KEY = 'lorerelay.tts.external.apiKey';
const MAX_PLAYER_INPUT_LENGTH = 2000;

function getPanel(): vscode.WebviewPanel | undefined {
    return panel;
}

export function activate(context: vscode.ExtensionContext) {
    extensionInstallationPath = context.extensionPath;
    extensionContext = context;
    context.subscriptions.push({ dispose: () => deterministicWorkspaceMutationGate.dispose() });
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
        appendGmBridgeLog: (line) => getGmBridgeOutputChannel().appendLine(line),
        onRelayRequestSettled: (requestId) => releaseRetainedRelayGameplayLease(requestId),
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

        html = renderWebviewHtml(html, {
            styleUri,
            scriptUri,
            mermaidUri,
            threeUri,
            genesisAssetBaseUri,
            cspSource: panel.webview.cspSource,
            nonce,
        });

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
            endDayRequestGate.dispose();
            marketTravelRequestGate.dispose();
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

    const upgradeVehicleStateForGameplaySpineCmd = vscode.commands.registerCommand(
        'textadventure.upgradeVehicleStateForGameplaySpine',
        () => { void runUpgradeVehicleStateForGameplaySpineCommand(); }
    );

    const gameplaySpineRepairVehicleCmd = vscode.commands.registerCommand(
        'textadventure.gameplaySpineRepairVehicle',
        () => { void runGameplaySpineVehicleRepairCommand(); }
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
        restoreVehicleStateMigrationBackupCmd,
        upgradeVehicleStateForGameplaySpineCmd,
        gameplaySpineRepairVehicleCmd
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
    const workspacePath = getWorkspacePath();
    clearPendingAntigravityRelayRequest(workspacePath, reason);
    releaseRetainedRelayGameplayLease(undefined, workspacePath);
}

function retainRelayGameplayLease(
    workspaceKey: string,
    requestId: string,
    lease: DeterministicWorkspaceMutationLease
): void {
    const previous = retainedRelayGameplayLeases.get(workspaceKey);
    if (previous && previous.requestId !== requestId) {
        previous.lease.release();
    }
    retainedRelayGameplayLeases.set(workspaceKey, { requestId, lease });
}

function releaseRetainedRelayGameplayLease(requestId?: string, workspaceKey?: string): boolean {
    for (const [key, retained] of retainedRelayGameplayLeases) {
        if ((workspaceKey === undefined || key === workspaceKey)
            && (requestId === undefined || retained.requestId === requestId)) {
            retainedRelayGameplayLeases.delete(key);
            return retained.lease.release();
        }
    }
    return false;
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

async function handlePlayerInput(
    text: unknown,
    authorsNote?: string,
    entryId?: string,
    source?: { kind: 'quick_option'; optionIndex: number }
): Promise<void> {
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

    const workspaceKey = getWorkspacePath() ?? '__no_workspace__';
    const playerRequestId = entryId && isValidEntryId(entryId)
        ? entryId
        : `player-${Date.now()}-${randomBytes(6).toString('hex')}`;
    const acquired = deterministicWorkspaceMutationGate.acquire(
        workspaceKey,
        { actionKind: 'gameplay_request', requestId: playerRequestId }
    );
    if (acquired.status === 'busy') {
        panel?.webview.postMessage({
            type: 'playerInputBusy',
            code: acquired.code,
            requestId: playerRequestId,
            owner: acquired.owner,
        });
        return;
    }

    let retainedForRelay = false;
    try {
        const result = await handleAcceptedPlayerInput(trimmed, authorsNote, entryId, source);
        if (result?.relayRequestId) {
            retainRelayGameplayLease(workspaceKey, result.relayRequestId, acquired.lease);
            retainedForRelay = true;
        }
    } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        vscode.window.showErrorMessage(`LoreRelay: ${reason}`);
        panel?.webview.postMessage({ type: 'gmEnd', success: false });
    } finally {
        if (!retainedForRelay) {
            acquired.lease.release();
        }
    }
}

async function handleAcceptedPlayerInput(
    initialText: string,
    authorsNote?: string,
    entryId?: string,
    source?: { kind: 'quick_option'; optionIndex: number }
): Promise<{ relayRequestId?: string } | undefined> {
    let trimmed = initialText;

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

    const state = getCachedGameState();
    const availableOptions = Array.isArray(state?.options) ? state.options as string[] : [];
    const persistedPlayerText = source?.kind === 'quick_option'
        && availableOptions[source.optionIndex] === trimmed
        ? `${source.optionIndex + 1}. ${trimmed}`
        : trimmed;
    persistPlayerInputEntry(persistedPlayerText, entryId);
    const config = vscode.workspace.getConfiguration('textAdventure');
    const relayMode = config.get<boolean>('antigravityRelay.enabled', false);
    const route = await routeGameplayInput(
        { playerAction: trimmed, presentationOptions: availableOptions, relayEnabled: relayMode },
        {
            tryDebugFastPath: (playerAction, presentationOptions) =>
                tryExecuteDebugScenarioCommand(playerAction, presentationOptions),
            dispatchRelay: async (playerAction) => {
                const workspacePath = getWorkspacePath();
                if (!workspacePath) {
                    throw new Error(t('extension.error.workspaceRequired'));
                }
                const breakdown = buildGmPromptBreakdown(playerAction);
                const history = getGameEntryHistory();
                const createdAt = new Date().toISOString();
                const turnIndex = history.filter(e => e.role === 'gm').length + 1;
                const workspaceIdentity = path.resolve(workspacePath);
                try {
                    ensureAcceptedTurnScope(workspacePath);
                } catch (e) {
                    const reason = e instanceof Error ? e.message : String(e);
                    getGmBridgeOutputChannel().appendLine(`[Antigravity Relay] Failed to initialize accepted-turn scope: ${reason}`);
                    throw new Error(`LoreRelay Antigravity Relay could not start: ${reason}`);
                }
                const requestId = buildAntigravityRelayRequestId({
                    workspacePath,
                    playerAction,
                    createdAt,
                    turnIndex,
                });
                const payload = buildAntigravityRelayPayload(playerAction, breakdown, availableOptions, {
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
                    playerAction,
                    minimalContext: { promptContext: breakdown },
                    availableOptions,
                });
                writeJsonAtomic(getAntigravityRelayRequestPath(workspacePath), request);
                await vscode.env.clipboard.writeText(JSON.stringify(payload, null, 2));
                vscode.window.showInformationMessage(t('webview.relay.banner.active'));
                panel?.webview.postMessage({ type: 'relayWaitingStateStart' });
                return requestId;
            },
            dispatchGm: async (playerAction) => {
                let actionForGm = formatPlayerActionWithNote(playerAction, processedAuthorsNote);
                actionForGm = await interceptPlayerAction(actionForGm);
                const provider = getGmProvider();
                if (provider === 'clipboard') {
                    await fallbackToClipboard(actionForGm);
                    return;
                }

                const ok = await invokeGmBridge(actionForGm, diceResult.ledger);
                if (!ok) {
                    await fallbackToClipboard(actionForGm);
                    return;
                }
                const history = getGameEntryHistory();
                const turnIndex = history.filter(e => e.role === 'gm').length;
                const commitInterval = config.get<number>('gitAutoCommitInterval') ?? 1;
                if (commitInterval > 0 && turnIndex > 0 && (turnIndex % commitInterval === 0)) {
                    await commitTurn(turnIndex);
                }
                generateOocCommentary().catch(console.error);
            },
        }
    );
    if (route.kind === 'relay') {
        return { relayRequestId: route.value };
    }
    if (route.kind === 'debug_fast_path') {
        panel?.webview.postMessage({ type: 'gmEnd', success: true });
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

function handleSetWorldSettlementFocus(locationId: unknown): void {
    setWorldSettlementFocus(locationId);
}

function handleClearWorldSettlementFocus(): void {
    clearWorldSettlementFocus();
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
    const eventCatalog = getEventManagementCatalog();
    panel.webview.postMessage({ type: 'gameRules', rules, eventCatalog });
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

async function handleSetEventExcluded(eventId: string, excluded: boolean): Promise<void> {
    if (typeof eventId !== 'string' || typeof excluded !== 'boolean') return;
    
    const parts = eventId.split(':');
    if (parts.length !== 2) return;
    const [ns, id] = parts;
    
    let valid = false;
    if (ns === 'domain') {
        valid = id !== 'domain_quiet_month' && isValidDomainEventId(id);
    } else if (ns === 'guild') {
        valid = id !== 'guild_quiet_week' && isValidGuildEventId(id);
    } else if (ns === 'audience') {
        valid = isValidPetitionId(id);
    }
    
    if (!valid) return;

    const rules = loadGameRules();
    const updated = setEventExcluded(rules, eventId, excluded);
    saveGameRules(updated);
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

    const genre = answers && typeof answers.genre === 'string' ? answers.genre : '';
    const freeformNotes = typeof message.freeformNotes === 'string' ? message.freeformNotes : '';

    let suggestedExclusionCount = 0;
    if (genre) {
        const suggestedExclusions = await getSuggestedExclusions(genre, freeformNotes);
        if (suggestedExclusions.length > 0) {
            application.mergedRules.excludedEventIds = suggestedExclusions;
            suggestedExclusionCount = suggestedExclusions.length;
            if (!application.changedKeys.includes('excludedEventIds')) {
                application.changedKeys.push('excludedEventIds');
            }
        }
    }

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
            suggestedExclusionCount,
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
function workshopAbilityFromJson(value: unknown): AbilityDefinition | undefined {
    if (typeof value !== 'string') return undefined;
    try { return JSON.parse(value) as AbilityDefinition; } catch { return undefined; }
}

function ensureCombatWorkshopFixture(): void {
    if (combatWorkshopBuiltins.length > 0 || !extensionInstallationPath) return;
    try {
        const fixturePath = path.join(extensionInstallationPath, 'resources', 'combat-abilities', 'v1-reference-abilities.json');
        const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8')) as AbilityFixtureDocument;
        if (fixture.schemaVersion === 'combat-ability-v1' && Array.isArray(fixture.statuses) && Array.isArray(fixture.abilities)) {
            combatWorkshopStatuses = structuredClone(fixture.statuses);
            combatWorkshopBuiltins = structuredClone(fixture.abilities);
        }
    } catch {
        // The workshop remains usable for standalone JSON abilities when a
        // development build has not yet copied its fixture resource.
    }
}

function combatWorkshopBuiltinIds(): string[] { return combatWorkshopBuiltins.map(ability => ability.id); }

function currentCombatWorkshopLibrary(): CustomAbilityLibrary {
    ensureCombatWorkshopFixture();
    if (!combatWorkshopLibrary) combatWorkshopLibrary = loadCustomAbilityLibrary(getWorkspacePath(), combatWorkshopStatuses).library;
    return combatWorkshopLibrary;
}

function sendCombatAbilityWorkshop(): void {
    ensureCombatWorkshopFixture();
    const loaded = loadCustomAbilityLibrary(getWorkspacePath(), combatWorkshopStatuses, combatWorkshopBuiltinIds());
    combatWorkshopLibrary = loaded.library;
    panel?.webview.postMessage({ type: 'combatAbilityWorkshopCatalog', catalog: { builtin: combatWorkshopBuiltins, custom: combatWorkshopLibrary.abilities, error: loaded.error } });
}

function handleValidateCombatAbilityWorkshopDraft(json: unknown): void {
    const ability = workshopAbilityFromJson(json);
    const validation = ability ? validateWorkshopAbility(ability, combatWorkshopStatuses) : { valid: false, errors: [{ code: 'INVALID_JSON', message: 'Ability JSON could not be parsed.', path: '$' }], warnings: [] };
    panel?.webview.postMessage({ type: 'combatAbilityWorkshopValidation', validation });
}

function handleDuplicateCombatAbilityWorkshopBuiltin(json: unknown): void {
    ensureCombatWorkshopFixture();
    const selected = workshopAbilityFromJson(json);
    const builtin = selected && combatWorkshopBuiltins.find(ability => ability.id === selected.id);
    if (!builtin) { vscode.window.showWarningMessage('Ability Workshop: select a built-in ability to duplicate it.'); return; }
    const used = new Set([...combatWorkshopBuiltinIds(), ...currentCombatWorkshopLibrary().abilities.map(ability => ability.id)]);
    let suffix = 1;
    let id = `${builtin.id}_custom`;
    while (used.has(id)) id = `${builtin.id}_custom_${suffix++}`;
    const copy = duplicateBuiltinAbility(builtin, id);
    panel?.webview.postMessage({ type: 'combatAbilityWorkshopExport', json: JSON.stringify(copy, null, 2) });
    handleValidateCombatAbilityWorkshopDraft(JSON.stringify(copy));
}

function writeCombatWorkshopLibrary(library: CustomAbilityLibrary): boolean {
    const workspacePath = getWorkspacePath();
    if (!workspacePath) { vscode.window.showWarningMessage('Ability Workshop: open a workspace before saving custom abilities.'); return false; }
    try { writeCustomAbilityLibrary(workspacePath, library, combatWorkshopStatuses, combatWorkshopBuiltinIds()); combatWorkshopLibrary = library; return true; }
    catch (error) { vscode.window.showErrorMessage(`Ability Workshop: ${error instanceof Error ? error.message : 'save failed'}`); return false; }
}

function handleSaveCombatAbilityWorkshopDraft(json: unknown): void {
    const ability = workshopAbilityFromJson(json);
    if (!ability) { handleValidateCombatAbilityWorkshopDraft(json); return; }
    try {
        const current = currentCombatWorkshopLibrary();
        const validated = saveCustomAbility(emptyCustomAbilityLibrary(), ability, combatWorkshopStatuses, combatWorkshopBuiltinIds()).abilities[0];
        const next = current.abilities.some(item => item.id === ability.id)
            ? { ...current, abilities: [...current.abilities.filter(item => item.id !== ability.id), validated] }
            : saveCustomAbility(current, ability, combatWorkshopStatuses, combatWorkshopBuiltinIds());
        if (writeCombatWorkshopLibrary(next)) sendCombatAbilityWorkshop();
    } catch (error) { vscode.window.showErrorMessage(`Ability Workshop: ${error instanceof Error ? error.message : 'invalid ability'}`); handleValidateCombatAbilityWorkshopDraft(json); }
}

function handleDeleteCombatAbilityWorkshopDraft(json: unknown): void {
    const ability = workshopAbilityFromJson(json);
    if (ability && writeCombatWorkshopLibrary(removeCustomAbility(currentCombatWorkshopLibrary(), ability.id))) sendCombatAbilityWorkshop();
}
function handleResetCombatAbilityWorkshop(): void { if (writeCombatWorkshopLibrary(emptyCustomAbilityLibrary())) sendCombatAbilityWorkshop(); }
function handleExportCombatAbilityWorkshop(): void { const json = exportCustomAbilityLibrary(currentCombatWorkshopLibrary()); void vscode.env.clipboard.writeText(json); panel?.webview.postMessage({ type: 'combatAbilityWorkshopExport', json }); }
async function handleImportCombatAbilityWorkshop(): Promise<void> {
    const imported = importCustomAbilityLibrary(await vscode.env.clipboard.readText(), currentCombatWorkshopLibrary(), combatWorkshopStatuses, combatWorkshopBuiltinIds());
    if (imported.error) { vscode.window.showErrorMessage(`Ability Workshop import: ${imported.error}`); return; }
    if (writeCombatWorkshopLibrary(imported.library)) sendCombatAbilityWorkshop();
}
function handleTestCombatAbilityWorkshopShot(json: unknown): void {
    const ability = workshopAbilityFromJson(json);
    if (!ability || !validateWorkshopAbility(ability, combatWorkshopStatuses).valid) { handleValidateCombatAbilityWorkshopDraft(json); return; }
    const shot = workshopShot(ability, { id: 'workshop-attacker', hp: 100, maxHp: 100, attack: 10, defense: 0 }, { id: 'workshop-target', hp: 100, maxHp: 100, attack: 1, defense: 0 }, combatWorkshopStatuses);
    panel?.webview.postMessage({ type: 'combatAbilityWorkshopShot', shot: { ...shot.resolution, deterministic: shot.deterministic } });
}

function currentCombatLabDocument(): CombatLabDocument {
    if (!combatLabDocument) {
        const loaded = loadCombatLabDocument(getWorkspacePath());
        combatLabDocument = loaded.document.scenarios.length ? loaded.document : { ...loaded.document, scenarios: initialCombatLabScenarios(), selectedScenarioId: 'standard_5v5' };
    }
    return combatLabDocument;
}
function combatLabCatalog() {
    ensureCombatWorkshopFixture();
    return { abilities: [...combatWorkshopBuiltins, ...currentCombatWorkshopLibrary().abilities], statuses: combatWorkshopStatuses };
}
function sendCombatLab(): void { panel?.webview.postMessage({ type: 'combatLabState', state: { document: currentCombatLabDocument(), playback: combatLabPlayback ? { cursor: combatLabPlayback.cursor, speed: combatLabPlayback.speed, paused: combatLabPlayback.paused } : undefined } }); sendCombatCommandPlaytest(); }
function selectedCombatLabScenario(value: unknown) { const document = currentCombatLabDocument(); const id = typeof value === 'string' ? value : document.selectedScenarioId; return document.scenarios.find(scenario => scenario.id === id); }
function handleRunCombatLab(scenarioId: unknown, swap = false): void {
    const scenario = selectedCombatLabScenario(scenarioId); if (!scenario) { vscode.window.showWarningMessage('Combat Lab: select a scenario first.'); return; }
    try { const run = runCombatLab(swap ? swapCombatLabSides(scenario) : scenario, combatLabCatalog()); combatLabPlayback = createCombatLabPlayback(run); combatLabRecentRuns = [...combatLabRecentRuns.slice(-1), run]; panel?.webview.postMessage({ type: 'combatLabResult', run }); sendCombatLab(); }
    catch (error) { vscode.window.showErrorMessage(`Combat Lab: ${error instanceof Error ? error.message : 'run failed'}`); }
}
function handleCompareCombatLabRuns(): void { if (combatLabRecentRuns.length < 2) { vscode.window.showWarningMessage('Combat Lab: run two scenarios to compare them.'); return; } panel?.webview.postMessage({ type: 'combatLabComparison', comparison: compareCombatLabRuns(combatLabRecentRuns[0], combatLabRecentRuns[1]) }); }
function handleApplyCombatLabScenario(json: unknown): void {
    if (typeof json !== 'string') return;
    try { const scenario = JSON.parse(json); if (!isValidScenario(scenario)) throw new Error('INVALID_COMBAT_LAB_SCENARIO'); const document = currentCombatLabDocument(); combatLabDocument = { ...document, scenarios: [...document.scenarios.filter(item => item.id !== scenario.id), scenario], selectedScenarioId: scenario.id }; sendCombatLab(); }
    catch (error) { vscode.window.showErrorMessage(`Combat Lab: ${error instanceof Error ? error.message : 'invalid scenario'}`); }
}
function handleCloneCombatLabScenario(scenarioId: unknown): void { const scenario = selectedCombatLabScenario(scenarioId); if (!scenario) return; const document = currentCombatLabDocument(); let n = 1; let id = `${scenario.id}_custom`; while (document.scenarios.some(item => item.id === id)) id = `${scenario.id}_custom_${n++}`; combatLabDocument = { ...document, scenarios: [...document.scenarios, { ...structuredClone(scenario), id, name: `${scenario.name} Copy` }], selectedScenarioId: id }; sendCombatLab(); }
function handleSaveCombatLab(): void { const workspace = getWorkspacePath(); if (!workspace) { vscode.window.showWarningMessage('Combat Lab: open a workspace before saving.'); return; } try { writeCombatLabDocument(workspace, currentCombatLabDocument()); vscode.window.setStatusBarMessage('Combat Lab settings saved.', 3000); } catch (error) { vscode.window.showErrorMessage(`Combat Lab: ${error instanceof Error ? error.message : 'save failed'}`); } }
function handleExportCombatLab(): void { const json = exportCombatLabDocument(currentCombatLabDocument()); void vscode.env.clipboard.writeText(json); panel?.webview.postMessage({ type: 'combatLabExport', json }); }
async function handleImportCombatLab(): Promise<void> { const imported = importCombatLabDocument(await vscode.env.clipboard.readText(), currentCombatLabDocument()); if (imported.error) { vscode.window.showErrorMessage(`Combat Lab import: ${imported.error}`); return; } combatLabDocument = imported.document; sendCombatLab(); }
function handleAdvanceCombatLabPlayback(ticks: unknown): void { if (!combatLabPlayback) return; const count = typeof ticks === 'number' ? ticks : Number(ticks); combatLabPlayback = { ...combatLabPlayback, cursor: Math.min(combatLabPlayback.run.timeline.length, combatLabPlayback.cursor + Math.max(0, Math.trunc(count)) * combatLabPlayback.speed), paused: false }; sendCombatLab(); }
function handlePauseCombatLabPlayback(): void { if (combatLabPlayback) { combatLabPlayback = { ...combatLabPlayback, paused: !combatLabPlayback.paused }; sendCombatLab(); } }
function handleSetCombatLabSpeed(speed: unknown): void { if (!combatLabPlayback) return; const value = Number(speed); if (value === 1 || value === 2 || value === 4) { combatLabPlayback = { ...combatLabPlayback, speed: value }; sendCombatLab(); } }
function sendCombatCommandPlaytest(): void {
    if (combatCommandPlaytestSession) panel?.webview.postMessage({ type: 'combatCommandPlaytestState', state: combatCommandPlaytestSnapshot(combatCommandPlaytestSession) });
}
function sendCombatCommandPlaytestError(error: string, detail?: string): void {
    panel?.webview.postMessage({ type: 'combatCommandPlaytestError', error, detail });
}
function handleStartCombatCommandPlaytest(scenarioId: unknown, mode: unknown): void {
    const scenario = selectedCombatLabScenario(scenarioId);
    if (!scenario) { sendCombatCommandPlaytestError('INVALID_COMBAT_LAB_SCENARIO'); return; }
    const created = createCombatCommandPlaytest(scenario, combatLabCatalog(), mode);
    if (!created.ok) { sendCombatCommandPlaytestError(created.error, created.detail); return; }
    combatCommandPlaytestSession = created.value;
    sendCombatCommandPlaytest();
}
function handleIssueCombatCommand(raw: unknown): void {
    if (!combatCommandPlaytestSession) { sendCombatCommandPlaytestError('COMBAT_PLAYTEST_NOT_STARTED'); return; }
    const issued = issueCombatCommand(combatCommandPlaytestSession, raw);
    if (!issued.ok) { sendCombatCommandPlaytestError(issued.error, issued.detail); return; }
    const stepped = advanceCombatCommandPlaytest(issued.value, 1);
    if (!stepped.ok) { sendCombatCommandPlaytestError(stepped.error, stepped.detail); return; }
    combatCommandPlaytestSession = stepped.value;
    sendCombatCommandPlaytest();
}
function handleStepCombatCommandPlaytest(ticks: unknown): void {
    if (!combatCommandPlaytestSession) { sendCombatCommandPlaytestError('COMBAT_PLAYTEST_NOT_STARTED'); return; }
    const stepped = advanceCombatCommandPlaytest(combatCommandPlaytestSession, ticks);
    if (!stepped.ok) { sendCombatCommandPlaytestError(stepped.error, stepped.detail); return; }
    combatCommandPlaytestSession = stepped.value;
    sendCombatCommandPlaytest();
}

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
        handleSwitchParlorCharacter: async (characterId: string) => {
            await switchParlorCharacter(characterId);
        },
        handleImportParlorCharacter: async () => {
            await importParlorCharacter(() => importTavernCard({ activate: false }));
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
        handlePromoteParlor: async (intent) => {
            clearRelayRequestForCurrentWorkspace('session-transition');
            const result = await promoteParlorToCampaign({ intent: intent || 'auto' });
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
        handleSelectParlorPersonaPreset,
        handleSaveNewParlorPersonaPreset,
        handleUpdateParlorPersonaPreset,
        handleCreateParlorPersonaFromCharacter,
        handleImportParlorPersonaJson,
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
        handleSetWorldSettlementFocus,
        handleClearWorldSettlementFocus,
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
        handleSetEventExcluded,
        toggleRemotePlay,
        sendRemotePlayStatus,
        handleSetAntigravityRelayMode,
        sendCombatAbilityWorkshop,
        handleValidateCombatAbilityWorkshopDraft,
        handleDuplicateCombatAbilityWorkshopBuiltin,
        handleSaveCombatAbilityWorkshopDraft,
        handleDeleteCombatAbilityWorkshopDraft,
        handleResetCombatAbilityWorkshop,
        handleExportCombatAbilityWorkshop,
        handleImportCombatAbilityWorkshop,
        handleTestCombatAbilityWorkshopShot,
        sendCombatLab,
        handleRunCombatLab,
        handleCompareCombatLabRuns,
        handleApplyCombatLabScenario,
        handleCloneCombatLabScenario,
        handleSaveCombatLab,
        handleExportCombatLab,
        handleImportCombatLab,
        handleAdvanceCombatLabPlayback,
        handlePauseCombatLabPlayback,
        handleSetCombatLabSpeed,
        handleStartCombatCommandPlaytest,
        handleIssueCombatCommand,
        handleStepCombatCommandPlaytest,
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
                const mutation = await deterministicWorkspaceMutationGate.run(
                    workspaceKey,
                    { actionKind: 'shopkeeper_trade', requestId },
                    async () => {
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
                return {
                    type: 'shopkeeperDirectTradeResult' as const, requestId, ok: true,
                    receipt: {
                        op: intent.op, commodityId: intent.commodityId, qty: intent.qty,
                        total: intent.op === 'buy' ? result.trade?.totalCost : result.trade?.totalRevenue,
                        applied: result.trade?.applied,
                        persisted: true,
                    },
                };
                    }
                );
                if (mutation.status === 'busy') {
                    return {
                        type: 'shopkeeperDirectTradeResult' as const, requestId, ok: false,
                        rejection: WORLD_MUTATION_BUSY_COPY,
                    };
                }
                if (mutation.status === 'failed') {
                    return {
                        type: 'shopkeeperDirectTradeResult' as const, requestId, ok: false,
                        rejection: {
                            code: 'TRADE_FAILED',
                            message: '取引処理を完了できませんでした。',
                            nextStep: '現在の状態を確認してから、もう一度操作してください。',
                        },
                    };
                }
                return mutation.value;
            });
            if (response.ok) {
                try { pushWorldViewToWebview(getCurrentLocationIdForWorldView()); }
                catch { response.refreshFailed = true; }
            }
            panel?.webview.postMessage(response);
        },
        handleMarketTravelPreview: async (raw: unknown) => {
            const doc = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
            const destinationId = typeof doc.destinationId === 'string' ? doc.destinationId.trim() : undefined;
            const { previewMarketTravel } = await import('./deterministicMarketTravel');
            panel?.webview.postMessage({
                type: 'marketTravelPreviewResult',
                destinationId,
                ...previewMarketTravel(destinationId),
            });
        },
        handleMarketTravelCommit: async (raw: unknown) => {
            const doc = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
            const requestId = typeof doc.requestId === 'string' && /^[A-Za-z0-9_-]{8,128}$/.test(doc.requestId)
                ? doc.requestId : '';
            const destinationId = typeof doc.destinationId === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(doc.destinationId)
                ? doc.destinationId : '';
            const confirmed = doc.confirmed === true;
            if (!requestId || !destinationId) {
                panel?.webview.postMessage({
                    type: 'marketTravelResult', requestId, ok: false,
                    failure: {
                        code: 'CONFIRMATION_REQUIRED',
                        message: '移動には正しい受付番号と移動先の確認が必要です。',
                        nextStep: '移動先を選び直して、確認画面から確定してください。',
                    },
                });
                return;
            }
            const workspaceKey = getWorkspacePath() ?? '__no_workspace__';
            const response = await marketTravelRequestGate.run(workspaceKey, requestId, async () => {
                const mutation = await deterministicWorkspaceMutationGate.run(
                    workspaceKey,
                    { actionKind: 'market_travel', requestId },
                    async () => {
                        const { executeMarketTravel } = await import('./deterministicMarketTravel');
                        const outcome = executeMarketTravel(requestId, destinationId, confirmed);
                        if ('ok' in outcome && !outcome.ok) {
                            return { type: 'marketTravelResult' as const, requestId, ok: false, failure: outcome };
                        }
                        return { type: 'marketTravelResult' as const, requestId, ok: true, receipt: outcome };
                    }
                );
                if (mutation.status === 'busy') {
                    return {
                        type: 'marketTravelResult' as const, requestId, ok: false,
                        failure: WORLD_MUTATION_BUSY_COPY,
                    };
                }
                if (mutation.status === 'failed') {
                    return {
                        type: 'marketTravelResult' as const, requestId, ok: false,
                        failure: {
                            code: 'PERSIST_FAILED',
                            message: '移動処理を完了できませんでした。',
                            nextStep: '現在の状態を確認してから、新しい受付番号でやり直してください。',
                        },
                    };
                }
                return mutation.value;
            });
            if (response.ok) {
                try {
                    pushWorldViewToWebview(getCurrentLocationIdForWorldView());
                } catch {
                    response.refreshFailed = true;
                    if (response.receipt && typeof response.receipt === 'object') {
                        (response.receipt as Record<string, unknown>).refreshFailed = true;
                    }
                }
            }
            panel?.webview.postMessage(response);
        },
        handleEndDayPreview: async () => {
            const { previewEndDay } = await import('./endDayWorldProgression');
            panel?.webview.postMessage({ type: 'endDayPreviewResult', ...previewEndDay() });
        },
        handleEndDayCommit: async (raw: unknown) => {
            const doc = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
            const requestId = typeof doc.requestId === 'string' && /^[A-Za-z0-9_-]{8,128}$/.test(doc.requestId)
                ? doc.requestId : '';
            const confirmed = doc.confirmed === true;
            if (!requestId) {
                panel?.webview.postMessage({
                    type: 'endDayResult', requestId, ok: false,
                    failure: { code: 'CONFIRMATION_REQUIRED', message: '日を終えるには明示的な確認が必要です。', nextStep: '確認画面を開き直してください。' },
                });
                return;
            }
            const workspaceKey = getWorkspacePath() ?? '__no_workspace__';
            const response = await endDayRequestGate.run(workspaceKey, requestId, async () => {
                const mutation = await deterministicWorkspaceMutationGate.run(
                    workspaceKey,
                    { actionKind: 'end_day', requestId },
                    async () => {
                        // executeEndDay performs commit-time canonical reads after shared acquisition.
                        const { executeEndDay } = await import('./endDayWorldProgression');
                        const outcome = executeEndDay(requestId, confirmed);
                        if ('ok' in outcome && !outcome.ok) {
                            return { type: 'endDayResult' as const, requestId, ok: false, failure: outcome };
                        }
                        return { type: 'endDayResult' as const, requestId, ok: true, receipt: outcome };
                    }
                );
                if (mutation.status === 'busy') {
                    return {
                        type: 'endDayResult' as const, requestId, ok: false,
                        failure: WORLD_MUTATION_BUSY_COPY,
                    };
                }
                if (mutation.status === 'failed') {
                    return {
                        type: 'endDayResult' as const, requestId, ok: false,
                        failure: {
                            code: 'SIMULATION_FAILED',
                            message: '一日を進める処理を完了できませんでした。',
                            nextStep: '現在の状態を確認してから、もう一度操作してください。',
                        },
                    };
                }
                return mutation.value;
            });
            // Persistence success remains authoritative even when the display refresh is unavailable.
            if (response.ok) {
                try {
                    pushWorldViewToWebview(getCurrentLocationIdForWorldView());
                } catch {
                    response.refreshFailed = true;
                }
            }
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
