import * as vscode from 'vscode';
import type { CharacterProfile } from './types/Character';
import { isValidCharacterId } from './characterId';
import { isValidEntryId } from './entryId';
import { resolveAllowedImagePath } from './mediaPaths';
import { branchFromTurn } from './gitManager';
import { t } from './i18n';

function clampWorldGenCount(value: unknown, min: number, max: number, fallback: number): number {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
        return fallback;
    }
    return Math.max(min, Math.min(max, Math.floor(value)));
}

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
    handlePlayerInput(text: unknown, authorsNote?: string): Promise<void>;
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
    uploadPortrait(id: string): Promise<void>;
    generatePortrait(id: string): Promise<void>;
    importTavernCard(): Promise<void>;
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
    sendImageGenConfig(): void;
    handleUpdateImageGenConfig(raw: unknown): Promise<void>;
    sendGameRules(): void;
    handleUpdateGameRules(raw: unknown): Promise<void>;
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
    handleGenerateWorldForge(seed: string, theme: string, regionCount: number, factionCount: number, npcCount: number): Promise<void>;
    handleGenerateLocationImage(locationId: string): Promise<void>;
    handleSavePartyDirector(director: unknown): Promise<void>;
    handleCopyRemotePlayUrl(url: unknown, role?: unknown): Promise<void>;
    handleBranchTimeline(turnId: string): Promise<void>;
    handleRequestForceSpeak(): Promise<void>;
    handleExportHtml(): Promise<void>;
    handleRequestMermaid(target: string): Promise<void>;
    handleRequestVlmAnalysis(imagePath: string): Promise<void>;
    handleSetNpcPortrait(npcId: string, imagePath: string): Promise<void>;
    handleRequestNpcPortraitLink(npcId: string): Promise<void>;
}

/** Webview からの postMessage を type 別にルーティングする。 */
export async function handleWebviewMessage(message: WebviewMessage, deps: WebviewHandlerDeps): Promise<void> {
    switch (message.type) {
        case 'selectOption':
        case 'freeInput':
            await deps.handlePlayerInput(
                message.text,
                typeof message.authorsNote === 'string' ? message.authorsNote : undefined
            );
            break;
        case 'generateImage':
            await deps.runImageGeneration(
                message.prompt as string,
                message.mode as string,
                typeof message.entryId === 'string' ? message.entryId : undefined
            );
            break;
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
            deps.sendGameRules();
            deps.sendRemotePlayStatus();
            break;
        case 'loadLorebook':
            deps.sendLorebookList();
            break;
        case 'saveLorebook':
            await deps.handleSaveLorebook(message.entries);
            break;
        case 'searchMemory':
            await deps.handleSearchMemory(message.hint);
            break;
        case 'setMemoryBackend':
            await deps.handleSetMemoryBackend(message.backend);
            break;
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
        case 'generateWorldForge': {
            const seed = typeof message.seed === 'string' ? message.seed.trim() : '';
            const theme = typeof message.theme === 'string' ? message.theme.trim() : 'default';
            const regionCount = clampWorldGenCount(message.regionCount, 3, 12, 5);
            const factionCount = clampWorldGenCount(message.factionCount, 2, 6, 3);
            const npcCount = clampWorldGenCount(message.npcCount, 2, 20, 6);
            if (seed) {
                await deps.handleGenerateWorldForge(seed, theme, regionCount, factionCount, npcCount);
            } else {
                vscode.window.showWarningMessage('World Forge: Seed is required.');
            }
            break;
        }
        case 'generateLocationImage':
            if (typeof message.locationId === 'string') {
                await deps.handleGenerateLocationImage(message.locationId);
            }
            break;
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
        case 'loadCharacters':
            deps.sendCharacterList();
            break;
        case 'notifyEquipment': {
            const w = message.weapon ? `Weapon[${message.weapon}]` : '';
            const a = message.armor ? `Armor[${message.armor}]` : '';
            const acc = message.accessory ? `Accessory[${message.accessory}]` : '';
            const eqStr = [w, a, acc].filter(Boolean).join(' ') || 'Nothing';
            const text = `System: [Equipment changed] ${message.name} equipped: ${eqStr}`;
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
            vscode.window.showInformationMessage('Expression generation is not implemented yet. Upload an expression image for now.');
            break;
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
                await deps.handleRestoreToTurn(message.entryId);
            }
            break;
        case 'saveCheckpoint':
            await deps.handleSaveCheckpoint(typeof message.label === 'string' ? message.label : undefined);
            break;
        case 'restoreCheckpoint':
            if (typeof message.checkpointId === 'string') {
                await deps.handleRestoreCheckpoint(message.checkpointId);
            }
            break;
        case 'deleteCheckpoint':
            if (typeof message.checkpointId === 'string') {
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
        case 'editEntry':
            if (typeof message.id === 'string' && isValidEntryId(message.id) &&
                typeof message.content === 'string') {
                await deps.handleEditEntry(message.id, message.content);
            }
            break;
        case 'toggleExcludeEntry':
            if (typeof message.id === 'string' && isValidEntryId(message.id)) {
                await deps.handleToggleExcludeEntry(message.id);
            }
            break;
        case 'branchFromEntry':
            if (typeof message.entryId === 'string' && isValidEntryId(message.entryId)) {
                await deps.handleRestoreToTurn(message.entryId);
            }
            break;
        case 'branchTimeline':
            if (typeof message.turnId === 'string' && isValidEntryId(message.turnId)) {
                await deps.handleBranchTimeline(message.turnId);
            }
            break;
        case 'loadScenario':
            await deps.loadScenarioPack();
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
        case 'getRemotePlayStatus':
            deps.sendRemotePlayStatus();
            break;
        case 'requestForceSpeak':
            await deps.handleRequestForceSpeak();
            break;
        case 'exportHtml':
            await deps.handleExportHtml();
            break;
        case 'requestMermaid':
            await deps.handleRequestMermaid(typeof message.target === 'string' ? message.target : 'questFlow');
            break;
        case 'requestVlmAnalysis':
            if (typeof message.imagePath === 'string' && message.imagePath &&
                resolveAllowedImagePath(message.imagePath)) {
                await deps.handleRequestVlmAnalysis(message.imagePath);
            }
            break;
        case 'setNpcPortrait':
            if (isValidEntryId(message.npcId) &&
                typeof message.imagePath === 'string' && message.imagePath &&
                resolveAllowedImagePath(message.imagePath)) {
                await deps.handleSetNpcPortrait(message.npcId as string, message.imagePath);
            }
            break;
        case 'requestNpcPortraitLink':
            if (isValidEntryId(message.npcId)) {
                await deps.handleRequestNpcPortraitLink(message.npcId as string);
            }
            break;
        default:
            break;
    }
}
