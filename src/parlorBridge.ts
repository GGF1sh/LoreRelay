import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { t, getConfiguredLocale } from './i18n';
import {
    getActiveCharacterId,
    getActiveCharacterProfile,
    getCharacters,
    setActiveCharacter,
} from './characterManager';
import {
    evaluateParlorVscodeLmPreflight,
    resolveParlorActiveCharacterId,
    shouldInsertParlorFirstGreeting,
} from './parlorFirstUseCore';
import { evaluateParlorCharacterSwitch } from './parlorCharacterSwitchCore';
import { getGameEntryHistory } from './gameStateSync';
import { isValidCharacterId } from './characterId';
import { loadExperienceConfig, saveExperienceConfig, isParlorMode, isInWorldMode } from './experience';
import {
    appendAndSaveParlorMessage,
    getOrCreateParlorSession,
    loadParlorSession,
    saveParlorSession,
} from './parlorSession';
import { parlorMessagesToChatEntries } from './parlorSessionCore';
import { splitCampaignImportForParlor, mergeImportedParlorMessages } from './parlorDemoteCore';
import { appendParlorArchiveRecords } from './parlorArchive';
import { buildParlorArchiveSummaryDelta, mergeParlorSessionSummary } from './parlorArchiveCore';
import { buildParlorUserPrompt } from './parlorPromptBuilder';
import { buildInWorldChatPrompt } from './inWorldPromptBuilder';
import { sanitizeParlorAssistantReply } from './parlorPromptBuilderCore';
import {
    appendAndSaveInWorldMessage,
    getOrCreateInWorldSession,
    loadInWorldSession,
    saveInWorldSession,
} from './inWorldSession';
import {
    invokeParlorVscodeLm,
    isParlorBridgeBusy,
    fallbackToClipboardParlor,
    countParlorVscodeLmModels,
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
    createPlayerPersonaPreset,
    getPlayerPersonaPreset,
    listPlayerPersonaPresets,
    removeNewPlayerPersonaPreset,
    updatePlayerPersonaPreset,
} from './personaPreset';
import {
    mapCharacterToPlayerPersona,
    parsePersonaJsonImport,
    parsePersonaPresetMeta,
    personaFromPreset,
    type PlayerPersonaPreset,
} from './personaPresetCore';
import {
    listWorkspaceParlorBackgrounds,
    toParlorBackgroundWebviewUri,
} from './parlorBackground';
import { resolveParlorCampaignTransition } from './parlorPromoteCore';
import { getGameStatePath } from './workspacePaths';

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

export function sendInWorldSessionToWebview(): void {
    const panel = requirePanel();
    if (!panel) {
        return;
    }
    const character = getActiveCharacterProfile();
    const characterId = character?.id || getActiveCharacterId();
    if (!characterId || !isValidCharacterId(characterId)) {
        panel.webview.postMessage({
            type: 'parlorSessionUpdate',
            profile: 'inworld',
            entries: [],
            characterName: '',
        });
        return;
    }
    const session = loadInWorldSession(characterId) || getOrCreateInWorldSession(characterId);
    const entries = parlorMessagesToChatEntries(session, character?.name || 'Character');
    panel.webview.postMessage({
        type: 'parlorSessionUpdate',
        profile: 'inworld',
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
    const profile = isInWorldMode() ? 'inworld' : (isParlorMode() ? 'parlor' : 'campaign');
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
    const personaPresets = listPlayerPersonaPresets();
    const configuredPersonaId = experience.parlor?.activePersonaId;
    const activePersonaId = typeof configuredPersonaId === 'string'
        && personaPresets.some((preset) => preset.id === configuredPersonaId)
        ? configuredPersonaId
        : null;
    const backgrounds = listWorkspaceParlorBackgrounds().map((bg) => ({
        id: bg.id,
        label: bg.label,
        uri: toParlorBackgroundWebviewUri(panel, bg.filename) || '',
    }));
    const activeCharacterId = getActiveCharacterId() || null;
    const statePath = getGameStatePath();
    const hasGameState = Boolean(statePath && fs.existsSync(statePath));
    const hasFrozenCampaign = Boolean(experience.campaign?.frozenAt && hasGameState);
    const parlorSession = activeCharacterId ? loadParlorSession(activeCharacterId) : undefined;
    const campaignTransition = resolveParlorCampaignTransition({
        hasGameState,
        hasFrozenCampaign,
        parlorMessageCount: parlorSession?.messages?.length ?? 0,
    });
    panel.webview.postMessage({
        type: 'parlorSettings',
        connectionProfiles: conn.profiles.map((p) => ({ id: p.id, label: p.label, provider: p.provider })),
        activeConnectionId: conn.activeId,
        persona,
        personaPresets: personaPresets.map((preset) => ({
            id: preset.id,
            displayName: preset.name || preset.id,
            ...(preset.meta?.sourceLabel ? { sourceLabel: preset.meta.sourceLabel } : {}),
        })),
        activePersonaId,
        activeBackgroundId: experience.parlor?.backgroundId || null,
        backgrounds,
        characters: getCharacters().map((character) => ({
            id: character.id,
            name: character.name,
            ...(character.portrait ? { portrait: character.portrait } : {}),
        })),
        activeCharacterId,
        campaignTransition,
    });
    applyParlorBackgroundToWebview();
}

function applyParlorBackgroundToWebview(): void {
    const panel = requirePanel();
    if (!panel || (!isParlorMode() && !isInWorldMode())) {
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

    const locale = getConfiguredLocale();
    const split = splitCampaignImportForParlor(entries, { characterId: activeId });
    if (split.archiveRecords.length > 0) {
        appendParlorArchiveRecords(split.archiveRecords);
    }
    let session = loadParlorSession(activeId) || getOrCreateParlorSession(activeId);
    const mergedMessages = mergeImportedParlorMessages(session.messages, split.activeMessages);
    let summary = session.summary;
    if (split.archivedCount > 0) {
        const delta = buildParlorArchiveSummaryDelta(
            split.archiveRecords.flatMap((r) => r.messages),
            character.name,
            locale
        );
        summary = mergeParlorSessionSummary(summary, delta);
    }
    session = {
        ...session,
        messages: mergedMessages,
        summary,
        updatedAt: new Date().toISOString(),
    };
    saveParlorSession(session, character.name, locale);
    sendParlorSessionToWebview();
    return true;
}

export async function startParlorMode(
    characterId?: string,
    opts?: { skipProfileSave?: boolean }
): Promise<boolean> {
    const chars = getCharacters();
    const preferred = characterId && isValidCharacterId(characterId) ? characterId : undefined;
    const activeId = resolveParlorActiveCharacterId({
        preferredId: preferred,
        persistedActiveId: getActiveCharacterId(),
        characterIds: chars.map((c) => c.id),
    });
    if (!activeId) {
        vscode.window.showWarningMessage(t('extension.error.parlorNeedsCharacter'));
        return false;
    }
    // Persist active character before session create/render so display + input
    // paths that read active_character.txt stay consistent.
    setActiveCharacter(activeId);
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
    if (shouldInsertParlorFirstGreeting(session.messages.length, firstMes)) {
        session = appendAndSaveParlorMessage(session, {
            role: 'assistant',
            content: firstMes!,
            characterId: activeId,
        }, character?.name || 'Character', getConfiguredLocale());
    }
    sendExperienceProfileToWebview();
    sendParlorSessionToWebview();
    sendParlorSettingsToWebview();
    return true;
}

/**
 * The only live Parlor character-selection path. startParlorMode owns the
 * active-id persistence, per-character session load/create, greeting-once
 * rule, and Webview refreshes, so a selector can never leave the chat showing
 * a previous character's transcript.
 */
export async function switchParlorCharacter(characterId: string): Promise<boolean> {
    if (!isParlorMode()) {
        return false;
    }
    const decision = evaluateParlorCharacterSwitch({
        requestedCharacterId: characterId,
        characterIds: getCharacters().map((character) => character.id),
        isBusy: parlorInFlight || isParlorBridgeBusy(),
    });
    if (!decision.ok) {
        if (decision.reason === 'busy') {
            vscode.window.showWarningMessage(t('extension.error.parlorCharacterSwitchBusy'));
        } else {
            vscode.window.showWarningMessage(t('extension.error.invalidCharacterId'));
        }
        return false;
    }
    return startParlorMode(decision.characterId);
}

/** Import only after a busy check, then enter the imported character through the same path. */
export async function importParlorCharacter(
    importer: () => Promise<string | undefined>
): Promise<boolean> {
    if (!isParlorMode()) {
        return false;
    }
    if (parlorInFlight || isParlorBridgeBusy()) {
        vscode.window.showWarningMessage(t('extension.error.parlorCharacterSwitchBusy'));
        return false;
    }
    const importedCharacterId = await importer();
    if (!importedCharacterId) {
        return false;
    }
    return switchParlorCharacter(importedCharacterId);
}

export async function startInWorldMode(
    characterId?: string
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
    const experience = loadExperienceConfig();
    saveExperienceConfig({
        profile: 'inworld',
        activeCharacterId: activeId,
        connectionProfileId: conn.activeId,
        campaign: { frozenAt: experience.campaign?.frozenAt || null },
    });
    const character = chars.find((c) => c.id === activeId) || getActiveCharacterProfile();
    const session = loadInWorldSession(activeId) || getOrCreateInWorldSession(activeId);
    saveInWorldSession(session, character?.name || 'Character', getConfiguredLocale());
    sendExperienceProfileToWebview();
    sendInWorldSessionToWebview();
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

function applyParlorPersona(persona: unknown, activePersonaId: string | null): void {
    const next = parsePlayerPersona(persona);
    const previousPersona = loadPlayerPersona();
    const previousActivePersonaId = loadExperienceConfig().parlor?.activePersonaId ?? null;
    savePlayerPersona(next);
    try {
        saveExperienceConfig({ parlor: { activePersonaId } });
    } catch (error) {
        try {
            savePlayerPersona(previousPersona);
            saveExperienceConfig({ parlor: { activePersonaId: previousActivePersonaId } });
        } catch {
            // Keep the original write error as the actionable failure.
        }
        throw error;
    }
}

function showPersonaError(error: unknown): void {
    const detail = error instanceof Error ? error.message : String(error);
    vscode.window.showErrorMessage(t('extension.error.personaPresetWriteFailed', { detail }));
}

export function handleSaveParlorPersona(raw: unknown): void {
    try {
        applyParlorPersona(raw, null);
        sendParlorSettingsToWebview();
    } catch (error) {
        showPersonaError(error);
    }
}

export function handleSelectParlorPersonaPreset(id: string | null): void {
    try {
        if (id === null) {
            saveExperienceConfig({ parlor: { activePersonaId: null } });
        } else {
            const preset = getPlayerPersonaPreset(id);
            if (!preset) {
                vscode.window.showWarningMessage(t('extension.error.personaPresetNotFound'));
                sendParlorSettingsToWebview();
                return;
            }
            applyParlorPersona(personaFromPreset(preset), preset.id);
        }
        sendParlorSettingsToWebview();
    } catch (error) {
        showPersonaError(error);
    }
}

export function handleSaveNewParlorPersonaPreset(raw: unknown, meta?: unknown): void {
    let preset: PlayerPersonaPreset | undefined;
    try {
        preset = createPlayerPersonaPreset(parsePlayerPersona(raw), parsePersonaPresetMeta(meta));
        applyParlorPersona(personaFromPreset(preset), preset.id);
        sendParlorSettingsToWebview();
    } catch (error) {
        if (preset) removeNewPlayerPersonaPreset(preset.id);
        showPersonaError(error);
    }
}

export function handleUpdateParlorPersonaPreset(id: string, raw: unknown): void {
    const previous = getPlayerPersonaPreset(id);
    if (!previous) {
        vscode.window.showWarningMessage(t('extension.error.personaPresetNotFound'));
        return;
    }
    try {
        const preset = updatePlayerPersonaPreset(id, parsePlayerPersona(raw));
        try {
            applyParlorPersona(personaFromPreset(preset), preset.id);
        } catch (error) {
            updatePlayerPersonaPreset(previous.id, personaFromPreset(previous));
            throw error;
        }
        sendParlorSettingsToWebview();
    } catch (error) {
        showPersonaError(error);
    }
}

function sendParlorPersonaDraft(persona: unknown, meta?: PlayerPersonaPreset['meta']): void {
    const panel = requirePanel();
    if (!panel) return;
    panel.webview.postMessage({ type: 'parlorPersonaDraft', persona: parsePlayerPersona(persona), meta });
}

export async function handleCreateParlorPersonaFromCharacter(): Promise<void> {
    const characters = getCharacters();
    const selected = await vscode.window.showQuickPick(
        characters.map((character) => ({ label: character.name || character.id, description: character.id, characterId: character.id })),
        { title: t('extension.info.personaPickCharacter'), placeHolder: t('extension.info.personaPickCharacter') }
    );
    if (!selected) return;
    const character = characters.find((item) => item.id === selected.characterId);
    if (!character) return;
    sendParlorPersonaDraft(mapCharacterToPlayerPersona(character), {
        source: 'character-copy', sourceLabel: character.name || character.id, sourceCharacterId: character.id,
    });
}

export async function handleImportParlorPersonaJson(): Promise<void> {
    const picked = await vscode.window.showOpenDialog({ canSelectMany: false, filters: { 'Persona JSON': ['json'] } });
    if (!picked || picked.length === 0) return;
    try {
        const stat = fs.statSync(picked[0].fsPath);
        if (stat.size > 256 * 1024) throw new Error('Persona JSON is too large');
        const parsed = parsePersonaJsonImport(JSON.parse(fs.readFileSync(picked[0].fsPath, 'utf-8')));
        if (!parsed.persona) {
            vscode.window.showWarningMessage(t('extension.error.personaImportInvalid'));
            return;
        }
        sendParlorPersonaDraft(parsed.persona, { source: 'persona-json', sourceLabel: path.basename(picked[0].fsPath).slice(0, 120) });
        if (parsed.ignoredFields.length > 0) {
            vscode.window.showInformationMessage(t('extension.info.personaImportIgnored', { fields: parsed.ignoredFields.join(', ') }));
        }
    } catch (error) {
        vscode.window.showErrorMessage(t('extension.error.personaImportInvalid', { detail: error instanceof Error ? error.message : String(error) }));
    }
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
    if (panel && (isParlorMode() || isInWorldMode())) {
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

    // Preflight before appending user text so a missing model does not leave a
    // one-sided user bubble in the session transcript.
    const connProfile = getActiveParlorConnectionProfile();
    if (connProfile.provider === 'vscode-lm') {
        const modelCount = await countParlorVscodeLmModels(connProfile.vscodeLm);
        const preflight = evaluateParlorVscodeLmPreflight({
            provider: connProfile.provider,
            availableModelCount: modelCount,
        });
        if (!preflight.ok) {
            vscode.window.showErrorMessage(
                'vscode-lm: AI モデルが見つかりません。GitHub Copilot / Claude Code 等の拡張機能をインストールしてサインインしてください。'
            );
            return;
        }
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

export async function handleInWorldPlayerInput(text: string): Promise<void> {
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
        let session = getOrCreateInWorldSession(characterId);
        session = appendAndSaveInWorldMessage(session, {
            role: 'user',
            content: text,
        }, character.name, getConfiguredLocale());
        sendInWorldSessionToWebview();

        const prompt = buildInWorldChatPrompt(character, session, text);
        const connProfile = getActiveParlorConnectionProfile();
        const result = await invokeParlorByProfile(prompt, connProfile);
        if (!isInWorldMode()) {
            return;
        }
        if (result.ok && result.text) {
            const content = sanitizeParlorAssistantReply(result.text);
            session = appendAndSaveInWorldMessage(session, {
                role: 'assistant',
                content,
                characterId,
                provider: connProfile.provider,
                model: result.model,
            }, character.name, getConfiguredLocale());
            sendInWorldSessionToWebview();
        }
    } finally {
        parlorInFlight = false;
    }
}
