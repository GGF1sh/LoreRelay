import * as vscode from 'vscode';
import type { CharacterProfile } from './types/Character';
import { isValidCharacterId } from './characterId';
import { isValidEntryId } from './entryId';
import { t } from './i18n';

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
    setActiveCharacter(id: string): void;
    uploadPortrait(id: string): Promise<void>;
    generatePortrait(id: string): Promise<void>;
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
            deps.sendGameRules();
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
        case 'saveCharacter': {
            const character = message.character as CharacterProfile | undefined;
            if (character?.id && isValidCharacterId(character.id)) {
                deps.saveCharacter(character);
                if (message.inParty) {
                    deps.addToParty(character.id);
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
        case 'loadScenario':
            await deps.loadScenarioPack();
            break;
        case 'requestImageGenConfig':
            deps.sendImageGenConfig();
            break;
        case 'updateImageGenConfig':
            await deps.handleUpdateImageGenConfig(message.config);
            break;
        default:
            break;
    }
}