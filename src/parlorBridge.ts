import * as vscode from 'vscode';
import { t } from './i18n';
import { getGmProvider } from './workspacePaths';
import { getActiveCharacterId, getActiveCharacterProfile, getCharacters } from './characterManager';
import { isValidCharacterId } from './characterId';
import { saveExperienceConfig, isParlorMode } from './experience';
import {
    appendAndSaveParlorMessage,
    getOrCreateParlorSession,
    loadParlorSession,
} from './parlorSession';
import { parlorMessagesToChatEntries } from './parlorSessionCore';
import { buildParlorUserPrompt } from './parlorPromptBuilder';
import { sanitizeParlorAssistantReply } from './parlorPromptBuilderCore';
import { invokeParlorVscodeLm, isParlorBridgeBusy, fallbackToClipboard } from './gmBridgeRunner';

export interface ParlorBridgeDeps {
    getPanel: () => vscode.WebviewPanel | undefined;
}

let deps: ParlorBridgeDeps | undefined;
let parlorInFlight = false;

export function initParlorBridge(parlorDeps: ParlorBridgeDeps): void {
    deps = parlorDeps;
}

function requirePanel(): vscode.WebviewPanel | undefined {
    return deps?.getPanel();
}

export function sendParlorSessionToWebview(): void {
    const panel = requirePanel();
    if (!panel) {
        return;
    }
    const character = getActiveCharacterProfile();
    const characterId = character?.id || getActiveCharacterId();
    if (!characterId || !isValidCharacterId(characterId)) {
        panel.webview.postMessage({
            type: 'parlorSessionUpdate',
            profile: 'parlor',
            entries: [],
            characterName: '',
        });
        return;
    }
    const session = loadParlorSession(characterId) || getOrCreateParlorSession(characterId);
    const entries = parlorMessagesToChatEntries(session, character?.name || 'Character');
    panel.webview.postMessage({
        type: 'parlorSessionUpdate',
        profile: 'parlor',
        entries,
        characterName: character?.name || 'Character',
        activeCharacterId: characterId,
    });
}

export function sendExperienceProfileToWebview(): void {
    const panel = requirePanel();
    if (!panel) {
        return;
    }
    const profile = isParlorMode() ? 'parlor' : 'campaign';
    const chars = getCharacters();
    panel.webview.postMessage({
        type: 'experienceProfile',
        profile,
        hasCharacter: chars.length > 0,
        activeCharacterId: getActiveCharacterId() || null,
    });
}

export async function startParlorMode(characterId?: string): Promise<boolean> {
    const chars = getCharacters();
    let activeId = characterId && isValidCharacterId(characterId) ? characterId : getActiveCharacterId();
    if (!activeId && chars.length === 1) {
        activeId = chars[0].id;
    }
    if (!activeId) {
        vscode.window.showWarningMessage(t('extension.error.parlorNeedsCharacter'));
        return false;
    }
    saveExperienceConfig({
        profile: 'parlor',
        activeCharacterId: activeId,
    });
    const character = chars.find((c) => c.id === activeId) || getActiveCharacterProfile();
    let session = loadParlorSession(activeId) || getOrCreateParlorSession(activeId);
    const firstMes = character?.stSource?.first_mes?.trim();
    if (session.messages.length === 0 && firstMes) {
        session = appendAndSaveParlorMessage(session, {
            role: 'assistant',
            content: firstMes,
            characterId: activeId,
        });
    }
    sendExperienceProfileToWebview();
    sendParlorSessionToWebview();
    return true;
}

export async function switchToCampaignMode(): Promise<void> {
    saveExperienceConfig({ profile: 'campaign' });
    sendExperienceProfileToWebview();
}

export async function handleParlorPlayerInput(text: string): Promise<void> {
    if (parlorInFlight || isParlorBridgeBusy()) {
        vscode.window.showWarningMessage(t('extension.error.gmBusy'));
        return;
    }
    const character = getActiveCharacterProfile();
    const characterId = character?.id || getActiveCharacterId();
    if (!character || !characterId) {
        vscode.window.showWarningMessage(t('extension.error.parlorNeedsCharacter'));
        return;
    }

    parlorInFlight = true;
    try {
        let session = getOrCreateParlorSession(characterId);
        session = appendAndSaveParlorMessage(session, {
            role: 'user',
            content: text,
        });
        sendParlorSessionToWebview();

        const provider = getGmProvider();
        if (provider === 'clipboard') {
            const prompt = buildParlorUserPrompt(character, session, text);
            await fallbackToClipboard(prompt);
            return;
        }

        const prompt = buildParlorUserPrompt(character, session, text);
        const result = await invokeParlorVscodeLm(prompt);
        if (result.ok && result.text) {
            const content = sanitizeParlorAssistantReply(result.text);
            session = appendAndSaveParlorMessage(session, {
                role: 'assistant',
                content,
                characterId,
                provider: 'vscode-lm',
                model: result.model,
            });
            sendParlorSessionToWebview();
        } else {
            await fallbackToClipboard(prompt);
        }
    } finally {
        parlorInFlight = false;
    }
}