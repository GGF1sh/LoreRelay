import * as vscode from 'vscode';
import { t, getConfiguredLocale } from './i18n';
import { getActiveCharacterId, getActiveCharacterProfile, getCharacters } from './characterManager';
import { getGameEntryHistory } from './gameStateSync';
import { isValidCharacterId } from './characterId';
import { loadExperienceConfig, saveExperienceConfig, isParlorMode } from './experience';
import {
    appendAndSaveParlorMessage,
    getOrCreateParlorSession,
    loadParlorSession,
    saveParlorSession,
} from './parlorSession';
import { parlorMessagesToChatEntries } from './parlorSessionCore';
import { mapCampaignEntriesToParlorMessages, mergeImportedParlorMessages } from './parlorDemoteCore';
import { buildParlorUserPrompt } from './parlorPromptBuilder';
import { sanitizeParlorAssistantReply } from './parlorPromptBuilderCore';
import {
    invokeParlorVscodeLm,
    isParlorBridgeBusy,
    fallbackToClipboardParlor,
} from './gmBridgeRunner';
import {
    getActiveParlorConnectionProfile,
    loadConnectionProfiles,
    setActiveParlorConnectionProfileId,
} from './connectionProfile';
import type { ConnectionProfile } from './connectionProfileCore';
import { loadPlayerPersona, savePlayerPersona } from './persona';
import { parsePlayerPersona } from './personaCore';
import {
    listWorkspaceParlorBackgrounds,
    toParlorBackgroundWebviewUri,
} from './parlorBackground';

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

export function sendParlorSettingsToWebview(): void {
    const panel = requirePanel();
    if (!panel) {
        return;
    }
    const conn = loadConnectionProfiles();
    const persona = loadPlayerPersona();
    const experience = loadExperienceConfig();
    const backgrounds = listWorkspaceParlorBackgrounds().map((bg) => ({
        id: bg.id,
        label: bg.label,
        uri: toParlorBackgroundWebviewUri(panel, bg.filename) || '',
    }));
    panel.webview.postMessage({
        type: 'parlorSettings',
        connectionProfiles: conn.profiles.map((p) => ({ id: p.id, label: p.label, provider: p.provider })),
        activeConnectionId: conn.activeId,
        persona,
        activeBackgroundId: experience.parlor?.backgroundId || null,
        backgrounds,
    });
    applyParlorBackgroundToWebview();
}

function applyParlorBackgroundToWebview(): void {
    const panel = requirePanel();
    if (!panel || !isParlorMode()) {
        return;
    }
    const experience = loadExperienceConfig();
    const bgId = experience.parlor?.backgroundId;
    if (!bgId) {
        return;
    }
    const entry = listWorkspaceParlorBackgrounds().find((b) => b.id === bgId);
    if (!entry) {
        return;
    }
    const uri = toParlorBackgroundWebviewUri(panel, entry.filename);
    if (uri) {
        panel.webview.postMessage({ type: 'parlorBackground', uri });
    }
}

async function invokeParlorByProfile(prompt: string, profile: ConnectionProfile): Promise<{ ok: boolean; text: string; model?: string }> {
    if (profile.provider === 'vscode-lm') {
        return invokeParlorVscodeLm(prompt, profile.vscodeLm);
    }
    if (profile.provider === 'clipboard') {
        await fallbackToClipboardParlor(prompt);
        return { ok: false, text: '' };
    }
    vscode.window.showInformationMessage(
        t('extension.info.parlorProviderClipboard', { provider: profile.provider })
    );
    await fallbackToClipboardParlor(prompt);
    return { ok: false, text: '' };
}

export async function demoteToParlorMode(
    characterId?: string,
    importHistory = false
): Promise<boolean> {
    const experience = loadExperienceConfig();
    saveExperienceConfig({
        profile: 'parlor',
        campaign: { frozenAt: experience.campaign?.frozenAt || new Date().toISOString() },
    });

    const ok = await startParlorMode(characterId, { skipProfileSave: true });
    if (!ok) {
        saveExperienceConfig({ profile: 'campaign', campaign: experience.campaign });
        return false;
    }

    if (!importHistory) {
        return true;
    }

    const activeId = characterId || getActiveCharacterId();
    const character = getCharacters().find((c) => c.id === activeId) || getActiveCharacterProfile();
    if (!character || !activeId) {
        return ok;
    }

    const entries = getGameEntryHistory();
    if (entries.length === 0) {
        return ok;
    }

    const imported = mapCampaignEntriesToParlorMessages(entries, {
        maxMessages: 40,
        characterId: activeId,
    });
    let session = loadParlorSession(activeId) || getOrCreateParlorSession(activeId);
    session = {
        ...session,
        messages: mergeImportedParlorMessages(session.messages, imported),
        updatedAt: new Date().toISOString(),
    };
    saveParlorSession(session, character.name, getConfiguredLocale());
    sendParlorSessionToWebview();
    return true;
}

export async function startParlorMode(
    characterId?: string,
    opts?: { skipProfileSave?: boolean }
): Promise<boolean> {
    const chars = getCharacters();
    let activeId = characterId && isValidCharacterId(characterId) ? characterId : getActiveCharacterId();
    if (!activeId && chars.length === 1) {
        activeId = chars[0].id;
    }
    if (!activeId) {
        vscode.window.showWarningMessage(t('extension.error.parlorNeedsCharacter'));
        return false;
    }
    const conn = loadConnectionProfiles();
    if (!opts?.skipProfileSave) {
        const experience = loadExperienceConfig();
        saveExperienceConfig({
            profile: 'parlor',
            activeCharacterId: activeId,
            connectionProfileId: conn.activeId,
            campaign: { frozenAt: experience.campaign?.frozenAt || new Date().toISOString() },
        });
    } else {
        saveExperienceConfig({ activeCharacterId: activeId, connectionProfileId: conn.activeId });
    }
    const character = chars.find((c) => c.id === activeId) || getActiveCharacterProfile();
    let session = loadParlorSession(activeId) || getOrCreateParlorSession(activeId);
    const firstMes = character?.stSource?.first_mes?.trim();
    if (session.messages.length === 0 && firstMes) {
        session = appendAndSaveParlorMessage(session, {
            role: 'assistant',
            content: firstMes,
            characterId: activeId,
        }, character?.name || 'Character', getConfiguredLocale());
    }
    sendExperienceProfileToWebview();
    sendParlorSessionToWebview();
    sendParlorSettingsToWebview();
    return true;
}

export async function switchToCampaignMode(): Promise<void> {
    saveExperienceConfig({ profile: 'campaign' });
    sendExperienceProfileToWebview();
}

export function handleSetParlorConnectionProfile(profileId: string): void {
    if (!/^[a-zA-Z0-9_-]{1,64}$/.test(profileId)) {
        return;
    }
    const next = setActiveParlorConnectionProfileId(profileId);
    saveExperienceConfig({ connectionProfileId: next.activeId });
    sendParlorSettingsToWebview();
}

export function handleSaveParlorPersona(raw: unknown): void {
    const persona = parsePlayerPersona(raw);
    savePlayerPersona(persona);
    sendParlorSettingsToWebview();
}

export function handleSetParlorBackground(backgroundId: string | null): void {
    const experience = loadExperienceConfig();
    const parlor = { ...experience.parlor };
    if (backgroundId && /^[a-zA-Z0-9_-]{1,64}$/.test(backgroundId)) {
        parlor.backgroundId = backgroundId;
    } else {
        delete parlor.backgroundId;
    }
    saveExperienceConfig({ parlor });
    const panel = requirePanel();
    if (panel && isParlorMode()) {
        if (parlor.backgroundId) {
            applyParlorBackgroundToWebview();
        } else {
            panel.webview.postMessage({ type: 'parlorBackground', uri: null });
        }
    }
    sendParlorSettingsToWebview();
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
        }, character.name, getConfiguredLocale());
        sendParlorSessionToWebview();

        const prompt = buildParlorUserPrompt(character, session, text);
        const connProfile = getActiveParlorConnectionProfile();
        const result = await invokeParlorByProfile(prompt, connProfile);
        if (!isParlorMode()) {
            return;
        }
        if (result.ok && result.text) {
            const content = sanitizeParlorAssistantReply(result.text);
            session = appendAndSaveParlorMessage(session, {
                role: 'assistant',
                content,
                characterId,
                provider: connProfile.provider,
                model: result.model,
            }, character.name, getConfiguredLocale());
            sendParlorSessionToWebview();
        }
    } finally {
        parlorInFlight = false;
    }
}