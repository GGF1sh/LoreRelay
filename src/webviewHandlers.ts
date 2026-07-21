import * as vscode from 'vscode';
import type { CharacterProfile } from './types/Character';
import { isValidCharacterId } from './characterId';
import { isValidEntryId } from './entryId';
import { isValidCheckpointId } from './checkpoint';
import { isValidEventId } from './worldEventLogCore';
import { resolveMediaPathFromWebviewRef } from './mediaPaths';
import { t } from './i18n';
import {
    clampString,
    clampWorldGenCount,
    MAX_CHECKPOINT_LABEL_LEN,
    MAX_EDIT_ENTRY_LEN,
    MAX_IMAGE_PROMPT_LEN,
    normalizeMemoryBackend,
    normalizeMermaidTarget,
    normalizeWorldForgeSeed,
    normalizeWorldForgeTheme,
    sanitizeEquipmentNotifyFields
} from './webviewHandlersCore';
import { isExperienceProfile } from './experienceCore';
/** Webview → Extension の postMessage ペイロード（緩い型）。 */
export interface WebviewMessage {
    type: string;
    [key: string]: unknown;
}

/**
 * postMessage ルーターが呼び出すハンドラ群。
 * extension.ts の実装を注入し、God ファイルから switch を分離する。
 */
export interface WebviewHandlerDeps {
    handlePlayerInput(
        text: unknown,
        authorsNote?: string,
        entryId?: string,
        source?: { kind: 'quick_option'; optionIndex: number }
    ): Promise<void>;
    runImageGeneration(prompt: string, mode: string, entryId?: string): Promise<void>;
    handleLocaleChange(rawLocale: unknown): Promise<void>;
    sendLocaleBundle(): void;
    sendCurrentState(retryCount?: number, fullHistory?: boolean): Promise<void>;
    sendBgmManifest(): void;
    sendSfxManifest(): void;
    sendCharacterList(): void;
    sendCheckpointList(): void;
    saveCharacter(character: CharacterProfile): void;
    exportCharacterCard(payload: unknown): Promise<void>;
    setActiveCharacter(id: string): void;
    deleteCharacter(id: string): boolean;
    uploadPortrait(id: string): Promise<void>;
    generatePortrait(id: string): Promise<void>;
    generateExpression(id: string, expression: string): Promise<void>;
    adaptCharacterToWorld(character: Pick<CharacterProfile, 'name' | 'description' | 'personality' | 'equipment'>): Promise<void>;
    importTavernCard(): Promise<string | undefined>;
    addToParty(id: string): void;
    removeFromParty(id: string): void;
    summarizeHistory(): Promise<void>;
    archiveSaga(): Promise<void>;
    handleUndoLastTurn(): Promise<void>;
    handleRestoreToTurn(entryId: string): Promise<void>;
    handleSaveCheckpoint(label?: string): Promise<void>;
    handleRestoreCheckpoint(checkpointId: string): Promise<void>;
    handleDeleteCheckpoint(checkpointId: string): Promise<void>;
    handleRegenerateLastTurn(): Promise<void>;
    updateSummary(summary: unknown): void;
    handleEditEntry(id: string, content: string): Promise<void>;
    handleToggleExcludeEntry(id: string): Promise<void>;
    loadScenarioPack(): Promise<void>;
    loadBundledSampleScenario(sampleId: string): Promise<void>;
    sendImageGenConfig(): void;
    handleUpdateImageGenConfig(raw: unknown): Promise<void>;
    sendGameRules(): void;
    handleUpdateGameRules(raw: unknown): Promise<void>;
    handleSetEventExcluded(eventId: string, excluded: boolean): Promise<void>;
    toggleRemotePlay(start?: boolean): Promise<void>;
    sendRemotePlayStatus(): void;
    sendLorebookList(): void;
    handleSaveLorebook(entries: unknown): Promise<void>;
    handleSearchMemory(hint: unknown): Promise<void>;
    handleSetMemoryBackend(backend: unknown): Promise<void>;
    handleRebuildMemoryIndex(): Promise<void>;
    sendMemoryStatus(): void;
    sendScenarioDirector(): void;
    sendPartyDirector(): void;
    sendWorldView(): void;
    handleSetSettlementViewLayer(layerId: unknown): void;
    handleSetWorldSettlementFocus(locationId: unknown): void;
    handleClearWorldSettlementFocus(): void;
    handleObserverWorldTick(mode: 'watch' | 'advance'): void;
    handleGenerateWorldForge(seed: string, theme: string, regionCount: number, factionCount: number, npcCount: number): Promise<void>;
    handleGenerateWorldMapImage(): Promise<void>;
    handleGenerateLocationImage(locationId: string): Promise<void>;
    handleSavePartyDirector(director: unknown): Promise<void>;
    handleCopyRemotePlayUrl(url: unknown, role?: unknown): Promise<void>;
    handleBranchTimeline(turnId: string): Promise<void>;
    sendGitTimelineStatus(): Promise<void>;
    sendChronicle(): Promise<void>;
    handleSwitchGitBranch(branchName: string): Promise<void>;
    handleRequestForceSpeak(): Promise<void>;
    handleExportHtml(): Promise<void>;
    handleExportReplay(raw: unknown): Promise<void>;
    handleRequestMermaid(target: string): Promise<void>;
    handleRequestVlmAnalysis(imagePath: string): Promise<void>;
    handleSetNpcPortrait(npcId: string, imagePath: string): Promise<void>;
    handleRequestNpcPortraitLink(npcId: string): Promise<void>;
    handleRunQuickstart(prompt: string, overwrite: boolean): Promise<void>;
    handleGenesisApplyProfile(raw: unknown): Promise<void>;
    handleGenesisGenerateImage(raw: unknown): Promise<void>;
    handleAcceptQuest(questId: string): Promise<void>;
    handleAcceptCampaignJob(boardEntryId: string): Promise<void>;
    handleRequestNpcTts(raw: unknown): Promise<void>;
    pushTtsCapabilities(): void;
    insertChatDraft(text: string): void;
    sendDebugCapabilities(): void;
    handleBulkAdvanceWorldSim(steps: number): Promise<void>;
    handleLivingWorldMarketDebug(raw: unknown): Promise<void>;
    handleLivingWorldDirectTrade(raw: unknown): Promise<void>;
    handleShopkeeperDirectTrade(raw: unknown): Promise<void>;
    handleMarketTravelPreview(raw: unknown): Promise<void>;
    handleMarketTravelCommit(raw: unknown): Promise<void>;
    handleEndDayPreview(): Promise<void>;
    handleEndDayCommit(raw: unknown): Promise<void>;
    handleLivingWorldSetPlayerRole(raw: unknown): Promise<void>;
    handleStartParlor(characterId?: string): Promise<void>;
    handleSwitchParlorCharacter(characterId: string): Promise<void>;
    handleImportParlorCharacter(): Promise<void>;
    handleStartInWorld(characterId?: string): Promise<void>;
    handleSwitchExperienceProfile(profile: unknown): Promise<void>;
    sendParlorSettingsToWebview(): void;
    handleSetParlorConnectionProfile(profileId: string): void;
    handleSaveParlorPersona(raw: unknown): void;
    handleSelectParlorPersonaPreset(id: string | null): void;
    handleSaveNewParlorPersonaPreset(raw: unknown, meta?: unknown): void;
    handleUpdateParlorPersonaPreset(id: string, raw: unknown): void;
    handleCreateParlorPersonaFromCharacter(): Promise<void>;
    handleImportParlorPersonaJson(): Promise<void>;
    handleSetParlorBackground(backgroundId: string | null): void;
    handlePromoteParlor(intent?: 'auto' | 'resume' | 'fresh'): Promise<void>;
    handlePreviewGmTurnTransactionPlan(): Promise<void>;
    handleRetryFailedTransactions(): Promise<void>;
    handleSetAntigravityRelayMode(enabled: boolean): Promise<void>;
    sendCombatAbilityWorkshop(): void;
    handleValidateCombatAbilityWorkshopDraft(json: unknown): void;
    handleDuplicateCombatAbilityWorkshopBuiltin(json: unknown): void;
    handleSaveCombatAbilityWorkshopDraft(json: unknown): void;
    handleDeleteCombatAbilityWorkshopDraft(json: unknown): void;
    handleResetCombatAbilityWorkshop(): void;
    handleExportCombatAbilityWorkshop(): void;
    handleImportCombatAbilityWorkshop(): Promise<void>;
    handleTestCombatAbilityWorkshopShot(json: unknown): void;
    sendCombatLab(): void;
    handleRunCombatLab(scenarioId: unknown, swap?: boolean): void;
    handleCompareCombatLabRuns(): void;
    handleApplyCombatLabScenario(json: unknown): void;
    handleCloneCombatLabScenario(scenarioId: unknown): void;
    handleSaveCombatLab(): void;
    handleExportCombatLab(): void;
    handleImportCombatLab(): Promise<void>;
    handleAdvanceCombatLabPlayback(ticks: unknown): void;
    handlePauseCombatLabPlayback(): void;
    handleSetCombatLabSpeed(speed: unknown): void;
    handleStartCombatCommandPlaytest(scenarioId: unknown, mode: unknown): void;
    handleIssueCombatCommand(raw: unknown): void;
    handleStepCombatCommandPlaytest(ticks: unknown): void;
}

/**
 * 破壊的操作の確認は必ずここ(拡張ホスト側)で行う。
 * webview の window.confirm()/alert() は VS Code webview の iframe サンドボックスで
 * 無許可(allow-modals なし)のため無音で無視され、押しても何も起きないように見える。
 */
async function confirmDestructive(message: string, confirmLabel: string): Promise<boolean> {
    const choice = await vscode.window.showWarningMessage(message, { modal: true }, confirmLabel);
    return choice === confirmLabel;
}

/** Webview からの postMessage を type 別にルーティングする。 */
export async function handleWebviewMessage(message: WebviewMessage, deps: WebviewHandlerDeps): Promise<void> {
    switch (message.type) {
        case 'selectOption':
        case 'freeInput':
            await deps.handlePlayerInput(
                message.text,
                typeof message.authorsNote === 'string' ? message.authorsNote : undefined,
                typeof message.entryId === 'string' && isValidEntryId(message.entryId) ? message.entryId : undefined,
                message.type === 'selectOption'
                    && Number.isInteger(message.optionIndex)
                    && Number(message.optionIndex) >= 0
                    && Number(message.optionIndex) < 12
                    ? { kind: 'quick_option', optionIndex: Number(message.optionIndex) }
                    : undefined
            );
            break;
        case 'previewGmTurnTransactionPlan':
            await deps.handlePreviewGmTurnTransactionPlan();
            break;
        case 'retryFailedTransactions':
            await deps.handleRetryFailedTransactions();
            break;
        case 'generateImage': {
            const prompt = clampString(message.prompt, MAX_IMAGE_PROMPT_LEN);
            const mode = clampString(message.mode, 64) || 'illustrious';
            const entryId = typeof message.entryId === 'string' && isValidEntryId(message.entryId)
                ? message.entryId
                : undefined;
            if (prompt) {
                await deps.runImageGeneration(prompt, mode, entryId);
            }
            break;
        }
        case 'setLocale':
            await deps.handleLocaleChange(message.locale);
            break;
        case 'requestState':
            deps.sendLocaleBundle();
            await deps.sendCurrentState(0, true);
            deps.sendBgmManifest();
            deps.sendSfxManifest();
            deps.sendCharacterList();
            deps.sendCheckpointList();
            deps.sendLorebookList();
            deps.sendMemoryStatus();
            deps.sendScenarioDirector();
            deps.sendPartyDirector();
            deps.sendWorldView();
            deps.pushTtsCapabilities();
            deps.sendGameRules();
            deps.sendDebugCapabilities();
            deps.sendRemotePlayStatus();
            deps.sendCombatAbilityWorkshop();
            deps.sendCombatLab();
            break;
        case 'requestCombatAbilityWorkshop':
            deps.sendCombatAbilityWorkshop();
            break;
        case 'validateCombatAbilityWorkshopDraft':
            deps.handleValidateCombatAbilityWorkshopDraft(message.json);
            break;
        case 'duplicateCombatAbilityWorkshopBuiltin':
            deps.handleDuplicateCombatAbilityWorkshopBuiltin(message.json);
            break;
        case 'saveCombatAbilityWorkshopDraft':
            deps.handleSaveCombatAbilityWorkshopDraft(message.json);
            break;
        case 'deleteCombatAbilityWorkshopDraft':
            deps.handleDeleteCombatAbilityWorkshopDraft(message.json);
            break;
        case 'resetCombatAbilityWorkshop':
            deps.handleResetCombatAbilityWorkshop();
            break;
        case 'exportCombatAbilityWorkshop':
            deps.handleExportCombatAbilityWorkshop();
            break;
        case 'importCombatAbilityWorkshop':
            await deps.handleImportCombatAbilityWorkshop();
            break;
        case 'testCombatAbilityWorkshopShot':
            deps.handleTestCombatAbilityWorkshopShot(message.json);
            break;
        case 'requestCombatLab': deps.sendCombatLab(); break;
        case 'runCombatLab': deps.handleRunCombatLab(message.scenarioId); break;
        case 'swapCombatLabSides': deps.handleRunCombatLab(message.scenarioId, true); break;
        case 'compareCombatLabRuns': deps.handleCompareCombatLabRuns(); break;
        case 'applyCombatLabScenario': deps.handleApplyCombatLabScenario(message.json); break;
        case 'cloneCombatLabScenario': deps.handleCloneCombatLabScenario(message.scenarioId); break;
        case 'saveCombatLab': deps.handleSaveCombatLab(); break;
        case 'exportCombatLab': deps.handleExportCombatLab(); break;
        case 'importCombatLab': await deps.handleImportCombatLab(); break;
        case 'advanceCombatLabPlayback': deps.handleAdvanceCombatLabPlayback(message.ticks); break;
        case 'pauseCombatLabPlayback': deps.handlePauseCombatLabPlayback(); break;
        case 'setCombatLabSpeed': deps.handleSetCombatLabSpeed(message.speed); break;
        case 'startCombatCommandPlaytest': deps.handleStartCombatCommandPlaytest(message.scenarioId, message.mode); break;
        case 'issueCombatCommand': deps.handleIssueCombatCommand(message); break;
        case 'stepCombatCommandPlaytest': deps.handleStepCombatCommandPlaytest(message.ticks); break;
        case 'loadLorebook':
            deps.sendLorebookList();
            break;
        case 'saveLorebook':
            await deps.handleSaveLorebook(message.entries);
            break;
        case 'searchMemory':
            await deps.handleSearchMemory(message.hint);
            break;
        case 'setMemoryBackend': {
            const backend = normalizeMemoryBackend(message.backend);
            if (backend) {
                await deps.handleSetMemoryBackend(backend);
            }
            break;
        }
        case 'rebuildMemoryIndex':
            await deps.handleRebuildMemoryIndex();
            break;
        case 'loadMemory':
            deps.sendMemoryStatus();
            break;
        case 'loadDirector':
            deps.sendScenarioDirector();
            break;
        case 'loadParty':
            deps.sendPartyDirector();
            break;
        case 'loadWorld':
            deps.sendWorldView();
            break;
        case 'setSettlementViewLayer':
            deps.handleSetSettlementViewLayer(message.layerId);
            break;
        case 'setWorldSettlementFocus':
            deps.handleSetWorldSettlementFocus(message.locationId);
            break;
        case 'clearWorldSettlementFocus':
            deps.handleClearWorldSettlementFocus();
            break;
        case 'observerWorldTick': {
            const mode = message.mode === 'advance' ? 'advance' : 'watch';
            deps.handleObserverWorldTick(mode);
            break;
        }
        case 'generateWorldForge': {
            const seed = normalizeWorldForgeSeed(message.seed);
            const theme = normalizeWorldForgeTheme(message.theme);
            const regionCount = clampWorldGenCount(message.regionCount, 3, 12, 5);
            const factionCount = clampWorldGenCount(message.factionCount, 2, 6, 3);
            const npcCount = clampWorldGenCount(message.npcCount, 2, 20, 6);
            if (seed && isValidEventId(seed)) {
                await deps.handleGenerateWorldForge(seed, theme, regionCount, factionCount, npcCount);
            } else {
                vscode.window.showWarningMessage('World Forge: Valid seed is required.');
            }
            break;
        }
        case 'generateWorldMapImage':
            await deps.handleGenerateWorldMapImage();
            break;
        case 'generateLocationImage':
            if (typeof message.locationId === 'string' && isValidEventId(message.locationId.trim())) {
                await deps.handleGenerateLocationImage(message.locationId.trim());
            }
            break;
        case 'insertChatText': {
            const text = clampString(message.text, MAX_EDIT_ENTRY_LEN);
            if (text) {
                deps.insertChatDraft(text);
            }
            break;
        }
        case 'savePartyDirector':
            await deps.handleSavePartyDirector(message.director);
            break;
        case 'copyRemotePlayUrl':
            await deps.handleCopyRemotePlayUrl(message.url, message.role);
            break;
        case 'getGameRules':
            deps.sendGameRules();
            break;
        case 'updateGameRules':
            await deps.handleUpdateGameRules(message.rules);
            break;
        case 'excludeEvent':
            await deps.handleSetEventExcluded(String(message.id), Boolean(message.excluded));
            break;
        case 'loadCharacters':
            deps.sendCharacterList();
            break;
        case 'notifyEquipment': {
            const eq = sanitizeEquipmentNotifyFields(message);
            const w = eq.weapon ? `Weapon[${eq.weapon}]` : '';
            const a = eq.armor ? `Armor[${eq.armor}]` : '';
            const acc = eq.accessory ? `Accessory[${eq.accessory}]` : '';
            const eqStr = [w, a, acc].filter(Boolean).join(' ') || 'Nothing';
            const text = `System: [Equipment changed] ${eq.name} equipped: ${eqStr}`;
            await deps.handlePlayerInput(text, undefined);
            break;
        }
        case 'saveCharacter': {
            const data = message.data as any;
            const character = message.character as CharacterProfile | undefined;
            if (character?.id && isValidCharacterId(character.id)) {
                deps.saveCharacter(character);
                if (message.inParty) {
                    deps.addToParty(character.id);
                }
                
                if (data?.exportFormat === 'st-v2' || data?.exportFormat === 'st-v3') {
                    await deps.exportCharacterCard(data);
                }
            } else {
                vscode.window.showWarningMessage(t('extension.error.invalidCharacterId'));
            }
            break;
        }
        case 'setActiveCharacter':
            if (isValidCharacterId(message.id)) {
                deps.setActiveCharacter(message.id);
            } else {
                vscode.window.showWarningMessage(t('extension.error.invalidCharacterId'));
            }
            break;
        case 'switchParlorCharacter':
            if (isValidCharacterId(message.id)) {
                await deps.handleSwitchParlorCharacter(message.id);
            } else {
                vscode.window.showWarningMessage(t('extension.error.invalidCharacterId'));
            }
            break;
        case 'deleteCharacter': {
            if (!isValidCharacterId(message.id)) {
                vscode.window.showWarningMessage(t('extension.error.invalidCharacterId'));
                break;
            }
            const displayName = typeof message.name === 'string' && message.name.trim()
                ? message.name.trim().slice(0, 120)
                : message.id;
            const confirmed = await confirmDestructive(
                t('extension.confirm.deleteCharacter', { name: displayName }),
                t('extension.confirm.deleteCharacterButton')
            );
            if (!confirmed) { break; }
            if (deps.deleteCharacter(message.id)) {
                vscode.window.showInformationMessage(t('extension.info.characterDeleted'));
            } else {
                vscode.window.showWarningMessage(t('extension.error.characterNotFound'));
            }
            break;
        }
        case 'uploadPortrait':
            if (isValidCharacterId(message.id)) {
                await deps.uploadPortrait(message.id);
            } else {
                vscode.window.showWarningMessage(t('extension.error.invalidCharacterId'));
            }
            break;
        case 'generatePortrait':
            if (isValidCharacterId(message.id)) {
                await deps.generatePortrait(message.id);
            } else {
                vscode.window.showWarningMessage(t('extension.error.invalidCharacterId'));
            }
            break;
        case 'generateExpression':
            if (isValidCharacterId(message.charId) && typeof message.expression === 'string' && message.expression.trim()) {
                await deps.generateExpression(message.charId, message.expression.trim());
            } else {
                vscode.window.showWarningMessage(t('extension.error.invalidCharacterId'));
            }
            break;
        case 'adaptCharacterToWorld': {
            const character = message.character as Record<string, unknown> | undefined;
            if (character && typeof character.name === 'string' && character.name.trim()) {
                await deps.adaptCharacterToWorld({
                    name: character.name,
                    description: typeof character.description === 'string' ? character.description : '',
                    personality: typeof character.personality === 'string' ? character.personality : '',
                    equipment: (character.equipment as CharacterProfile['equipment']) || {},
                });
            } else {
                vscode.window.showWarningMessage('Character name is required to adapt to the world.');
            }
            break;
        }
        case 'importTavernCard':
            await deps.importTavernCard();
            break;
        case 'addToParty':
            if (isValidCharacterId(message.id)) {
                deps.addToParty(message.id);
            }
            break;
        case 'removeFromParty':
            if (isValidCharacterId(message.id)) {
                deps.removeFromParty(message.id);
            }
            break;
        case 'summarizeHistory':
            await deps.summarizeHistory();
            break;
        case 'archiveSaga':
            await deps.archiveSaga();
            break;
        case 'undoLastTurn':
            await deps.handleUndoLastTurn();
            break;
        case 'restoreToTurn':
            if (typeof message.entryId === 'string') {
                if (await confirmDestructive(t('extension.confirm.rewind'), t('extension.confirm.rewindButton'))) {
                    await deps.handleRestoreToTurn(message.entryId);
                }
            }
            break;
        case 'saveCheckpoint': {
            // Webview window.prompt() is silently blocked by the VS Code webview
            // iframe sandbox, so the label must be gathered here instead.
            const label = await vscode.window.showInputBox({
                prompt: t('extension.prompt.checkpointLabel'),
                placeHolder: t('extension.prompt.checkpointLabelPlaceholder')
            });
            await deps.handleSaveCheckpoint(clampString(label, MAX_CHECKPOINT_LABEL_LEN) || undefined);
            break;
        }
        case 'restoreCheckpoint':
            if (typeof message.checkpointId === 'string' && isValidCheckpointId(message.checkpointId)) {
                await deps.handleRestoreCheckpoint(message.checkpointId);
            }
            break;
        case 'deleteCheckpoint':
            if (typeof message.checkpointId === 'string' && isValidCheckpointId(message.checkpointId)) {
                await deps.handleDeleteCheckpoint(message.checkpointId);
            }
            break;
        case 'listCheckpoints':
            deps.sendCheckpointList();
            break;
        case 'regenerateLastTurn':
            await deps.handleRegenerateLastTurn();
            break;
        case 'updateSummary':
            deps.updateSummary(message.summary);
            break;
        case 'acceptQuest':
            if (typeof message.questId === 'string' && isValidEventId(message.questId)) {
                await deps.handleAcceptQuest(message.questId);
            }
            break;
        case 'acceptCampaignJob':
            if (typeof message.boardEntryId === 'string') {
                await deps.handleAcceptCampaignJob(message.boardEntryId);
            }
            break;
        case 'editEntry':
            if (typeof message.id === 'string' && isValidEntryId(message.id) &&
                typeof message.content === 'string') {
                await deps.handleEditEntry(message.id, clampString(message.content, MAX_EDIT_ENTRY_LEN));
            }
            break;
        case 'toggleExcludeEntry':
            if (typeof message.id === 'string' && isValidEntryId(message.id)) {
                await deps.handleToggleExcludeEntry(message.id);
            }
            break;
        case 'branchFromEntry':
            if (typeof message.entryId === 'string' && isValidEntryId(message.entryId)) {
                if (await confirmDestructive(t('extension.confirm.rewind'), t('extension.confirm.rewindButton'))) {
                    await deps.handleRestoreToTurn(message.entryId);
                }
            }
            break;
        case 'branchTimeline':
            if (typeof message.turnId === 'string' && isValidEntryId(message.turnId)) {
                if (await confirmDestructive(t('extension.confirm.gitBranch'), t('extension.confirm.gitBranchButton'))) {
                    await deps.handleBranchTimeline(message.turnId);
                }
            }
            break;
        case 'requestGitTimeline':
            await deps.sendGitTimelineStatus();
            break;
        case 'requestChronicle':
            await deps.sendChronicle();
            break;
        case 'switchGitBranch':
            if (typeof message.branchName === 'string') {
                await deps.handleSwitchGitBranch(message.branchName);
            }
            break;
        case 'loadScenario':
            await deps.loadScenarioPack();
            deps.sendDebugCapabilities();
            break;
        case 'loadBundledScenario':
            if (typeof message.sampleId === 'string') {
                await deps.loadBundledSampleScenario(message.sampleId);
                deps.sendDebugCapabilities();
            }
            break;
        case 'requestImageGenConfig':
            deps.sendImageGenConfig();
            break;
        case 'updateImageGenConfig':
            await deps.handleUpdateImageGenConfig(message.config);
            break;
        case 'toggleRemotePlay':
            await deps.toggleRemotePlay();
            break;
        case 'setAntigravityRelayMode':
            await deps.handleSetAntigravityRelayMode(!!message.enabled);
            break;
        case 'getRemotePlayStatus':
            deps.sendRemotePlayStatus();
            break;
        case 'requestForceSpeak':
            await deps.handleRequestForceSpeak();
            break;
        case 'exportHtml':
            await deps.handleExportHtml();
            break;
        case 'exportReplay':
            await deps.handleExportReplay(message);
            break;
        case 'requestMermaid':
            await deps.handleRequestMermaid(normalizeMermaidTarget(message.target));
            break;
        case 'requestVlmAnalysis': {
            const resolved = typeof message.imagePath === 'string'
                ? resolveMediaPathFromWebviewRef(message.imagePath)
                : undefined;
            if (resolved) {
                await deps.handleRequestVlmAnalysis(resolved);
            }
            break;
        }
        case 'setNpcPortrait': {
            const resolvedPortrait = typeof message.imagePath === 'string'
                ? resolveMediaPathFromWebviewRef(message.imagePath)
                : undefined;
            if (isValidEntryId(message.npcId) && resolvedPortrait) {
                await deps.handleSetNpcPortrait(message.npcId as string, resolvedPortrait);
            }
            break;
        }
        case 'requestNpcPortraitLink':
            if (isValidEntryId(message.npcId)) {
                await deps.handleRequestNpcPortraitLink(message.npcId as string);
            }
            break;
        case 'runQuickstart':
            if (typeof message.prompt === 'string') {
                const overwrite = !!message.overwrite;
                await deps.handleRunQuickstart(message.prompt, overwrite);
            }
            break;
        case 'genesisApplyProfile':
            await deps.handleGenesisApplyProfile(message);
            break;
        case 'genesisGenerateImage':
            await deps.handleGenesisGenerateImage(message);
            break;
        case 'requestNpcTts':
            await deps.handleRequestNpcTts(message);
            break;
        case 'getDebugCapabilities':
            deps.sendDebugCapabilities();
            break;
        case 'bulkAdvanceWorldSim': {
            const steps = typeof message.steps === 'number' ? message.steps : Number(message.steps);
            await deps.handleBulkAdvanceWorldSim(steps);
            break;
        }
        case 'livingWorldMarketDebug':
            await deps.handleLivingWorldMarketDebug(message);
            break;
        case 'livingWorldDirectTrade':
            await deps.handleLivingWorldDirectTrade(message);
            break;
        case 'shopkeeperDirectTrade':
            await deps.handleShopkeeperDirectTrade(message);
            break;
        case 'marketTravelPreview':
            await deps.handleMarketTravelPreview(message);
            break;
        case 'marketTravelCommit':
            await deps.handleMarketTravelCommit(message);
            break;
        case 'endDayPreview':
            await deps.handleEndDayPreview();
            break;
        case 'endDayCommit':
            await deps.handleEndDayCommit(message);
            break;
        case 'livingWorldSetPlayerRole':
            await deps.handleLivingWorldSetPlayerRole(message);
            break;
        case 'startParlor': {
            const characterId = typeof message.characterId === 'string' && isValidCharacterId(message.characterId)
                ? message.characterId
                : undefined;
            await deps.handleStartParlor(characterId);
            break;
        }
        case 'startInWorld': {
            const characterId = typeof message.characterId === 'string' && isValidCharacterId(message.characterId)
                ? message.characterId
                : undefined;
            await deps.handleStartInWorld(characterId);
            break;
        }
        case 'switchExperienceProfile':
            if (isExperienceProfile(message.profile)) {
                await deps.handleSwitchExperienceProfile(message.profile);
            }
            break;
        case 'requestParlorSettings':
            deps.sendParlorSettingsToWebview();
            break;
        case 'importParlorTavernCard':
            await deps.handleImportParlorCharacter();
            break;
        case 'setParlorConnectionProfile':
            if (typeof message.profileId === 'string') {
                deps.handleSetParlorConnectionProfile(message.profileId);
            }
            break;
        case 'saveParlorPersona':
            deps.handleSaveParlorPersona(message.persona);
            break;
        case 'selectParlorPersonaPreset':
            if (message.id === null || typeof message.id === 'string') {
                deps.handleSelectParlorPersonaPreset(message.id);
            }
            break;
        case 'saveNewParlorPersonaPreset':
            deps.handleSaveNewParlorPersonaPreset(message.persona, message.meta);
            break;
        case 'updateParlorPersonaPreset':
            if (typeof message.id === 'string') {
                deps.handleUpdateParlorPersonaPreset(message.id, message.persona);
            }
            break;
        case 'createParlorPersonaFromCharacter':
            await deps.handleCreateParlorPersonaFromCharacter();
            break;
        case 'importParlorPersonaJson':
            await deps.handleImportParlorPersonaJson();
            break;
        case 'setParlorBackground': {
            const bgId = message.backgroundId;
            if (bgId === null || bgId === undefined) {
                deps.handleSetParlorBackground(null);
            } else if (typeof bgId === 'string') {
                deps.handleSetParlorBackground(bgId);
            }
            break;
        }
        case 'promoteParlor': {
            const rawIntent = (message as { intent?: unknown }).intent;
            const intent = rawIntent === 'resume' || rawIntent === 'fresh' || rawIntent === 'auto'
                ? rawIntent
                : 'auto';
            await deps.handlePromoteParlor(intent);
            break;
        }
        default:
            break;
    }
}
