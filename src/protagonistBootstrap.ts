import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import type { GameEntry } from './types/GameState';
import type { TurnResult } from './types/TurnResult';
import { generateText } from './llmClient';
import { t } from './i18n';
import { getGameStatePath } from './workspacePaths';
import {
    addToParty,
    getCharacters,
    saveCharacter,
    sendCharacterList,
    setActiveCharacter,
} from './characterManager';
import { loadWorldForge } from './worldForge';
import {
    extractProtagonistFromTurnResult,
    formatInterviewTranscript,
    looksLikeInterviewSession,
    parseProtagonistDraft,
    protagonistDraftToProfile,
    resolveUniqueCharacterId,
    summarizeProtagonistDraft,
    type ProtagonistDraft,
} from './protagonistBootstrapCore';

export type ProtagonistBootstrapResult = 'created' | 'skipped' | 'none' | 'existing';

let extensionContext: vscode.ExtensionContext | undefined;
let debounceTimer: NodeJS.Timeout | undefined;
let pendingTurnResult: TurnResult | undefined;

const WORKSPACE_FLAG = 'lorerelay.protagonistBootstrapDone';

export function initProtagonistBootstrap(context: vscode.ExtensionContext): void {
    extensionContext = context;
}

function workspaceFlagKey(): string | undefined {
    const ws = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!ws) {
        return undefined;
    }
    return `${WORKSPACE_FLAG}:${ws}`;
}

function isBootstrapDoneForWorkspace(): boolean {
    const key = workspaceFlagKey();
    if (!key || !extensionContext) {
        return false;
    }
    return extensionContext.workspaceState.get<boolean>(key, false);
}

function markBootstrapDoneForWorkspace(): void {
    const key = workspaceFlagKey();
    if (!key || !extensionContext) {
        return;
    }
    void extensionContext.workspaceState.update(key, true);
}

function hasPlayerProtagonist(): boolean {
    return getCharacters().some((c) => c.controlledBy === 'player');
}

function loadGameEntries(): GameEntry[] {
    const statePath = getGameStatePath();
    if (!statePath || !fs.existsSync(statePath)) {
        return [];
    }
    try {
        const state = JSON.parse(fs.readFileSync(statePath, 'utf-8')) as { entries?: unknown };
        if (!Array.isArray(state.entries)) {
            return [];
        }
        return state.entries.filter((e): e is GameEntry =>
            typeof e === 'object' && e !== null
            && (e as GameEntry).role !== undefined
            && typeof (e as GameEntry).content === 'string'
        );
    } catch {
        return [];
    }
}

async function extractProtagonistFromTranscript(
    entries: GameEntry[],
    theme?: string
): Promise<ProtagonistDraft | null> {
    const transcript = formatInterviewTranscript(entries);
    if (!transcript.trim()) {
        return null;
    }
    const systemPrompt = `You extract the player protagonist from a tabletop RPG setup conversation.
Return ONLY valid JSON (no markdown fences) with this shape:
{
  "name": "character name",
  "description": "appearance, background, abilities (2-4 sentences)",
  "personality": "traits and speech style",
  "equipment": { "weapon": "", "armor": "", "accessory": "" },
  "scenario": "starting situation hook",
  "arrivalReason": "how they fit this world"
}
Use the player's answers as source of truth. If details are missing, infer lightly from context.`;

    const themeLine = theme ? `World theme: ${theme}\n\n` : '';
    const userPrompt = `${themeLine}Conversation:\n${transcript}`;

    let raw: string | null;
    try {
        raw = await generateText(systemPrompt, userPrompt, { temperature: 0.4, maxTokens: 700 });
    } catch (e) {
        console.error('[protagonistBootstrap] LLM extraction failed', e);
        return null;
    }
    if (!raw) {
        return null;
    }
    try {
        const cleaned = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
        return parseProtagonistDraft(JSON.parse(cleaned));
    } catch (e) {
        console.error('[protagonistBootstrap] failed to parse LLM JSON', e, raw);
        return null;
    }
}

async function resolveDraft(options: {
    turnResult?: TurnResult;
    quickstartDraft?: ProtagonistDraft;
}): Promise<ProtagonistDraft | null> {
    if (options.quickstartDraft) {
        return options.quickstartDraft;
    }
    if (options.turnResult) {
        const fromTurn = extractProtagonistFromTurnResult(options.turnResult);
        if (fromTurn) {
            return fromTurn;
        }
    }
    const entries = loadGameEntries();
    if (!looksLikeInterviewSession(entries)) {
        return null;
    }
    const forge = loadWorldForge();
    const theme = forge?.meta?.theme;
    return extractProtagonistFromTranscript(entries, theme);
}

async function confirmAndCreate(
    draft: ProtagonistDraft,
    source: 'interview' | 'quickstart' | 'turn_result'
): Promise<ProtagonistBootstrapResult> {
    const existingIds = getCharacters().map((c) => c.id);
    const id = resolveUniqueCharacterId(draft.name, existingIds);
    const preview = summarizeProtagonistDraft(draft);

    const autoAccept = source === 'quickstart';
    let accepted = autoAccept;
    if (!autoAccept) {
        const message = t('extension.confirm.protagonistBootstrap', {
            name: draft.name,
            preview,
        });
        const createLabel = t('extension.confirm.protagonistBootstrapCreate');
        const skipLabel = t('extension.confirm.protagonistBootstrapSkip');
        const answer = await vscode.window.showInformationMessage(
            message,
            { modal: true },
            createLabel,
            skipLabel
        );
        accepted = answer === createLabel;
        if (answer === skipLabel) {
            markBootstrapDoneForWorkspace();
            return 'skipped';
        }
        if (!accepted) {
            return 'none';
        }
    }

    const profile = protagonistDraftToProfile(draft, id);
    saveCharacter(profile);
    setActiveCharacter(id);
    addToParty(id);
    sendCharacterList();
    markBootstrapDoneForWorkspace();

    if (autoAccept) {
        void vscode.window.showInformationMessage(
            t('extension.info.protagonistBootstrapCreated', { name: draft.name })
        );
    } else {
        void vscode.window.showInformationMessage(
            t('extension.info.protagonistBootstrapCreatedParty', { name: draft.name })
        );
    }
    return 'created';
}

export async function maybeBootstrapProtagonist(options: {
    turnResult?: TurnResult;
    quickstartDraft?: ProtagonistDraft;
    requireWorldForge?: boolean;
    source?: 'interview' | 'quickstart' | 'turn_result';
} = {}): Promise<ProtagonistBootstrapResult> {
    if (hasPlayerProtagonist()) {
        return 'existing';
    }
    if (isBootstrapDoneForWorkspace()) {
        return 'none';
    }

    const requireForge = options.requireWorldForge !== false;
    if (requireForge && !loadWorldForge()) {
        return 'none';
    }

    const draft = await resolveDraft(options);
    if (!draft) {
        return 'none';
    }

    const source = options.source
        ?? (options.quickstartDraft ? 'quickstart' : options.turnResult ? 'turn_result' : 'interview');
    return confirmAndCreate(draft, source);
}

/** Debounced hook from turn_result / world_forge watchers. */
export function scheduleProtagonistBootstrap(turnResult?: TurnResult): void {
    if (turnResult) {
        pendingTurnResult = turnResult;
    }
    if (debounceTimer) {
        clearTimeout(debounceTimer);
    }
    debounceTimer = setTimeout(() => {
        const snapshot = pendingTurnResult;
        pendingTurnResult = undefined;
        void maybeBootstrapProtagonist({ turnResult: snapshot, source: 'turn_result' });
    }, 1500);
}

export function startProtagonistBootstrapWatcher(): vscode.Disposable | undefined {
    const folder = vscode.workspace.workspaceFolders?.[0];
    if (!folder) {
        return undefined;
    }
    const watcher = vscode.workspace.createFileSystemWatcher(
        new vscode.RelativePattern(folder, 'world_forge.json')
    );
    const handle = () => scheduleProtagonistBootstrap();
    watcher.onDidCreate(handle);
    watcher.onDidChange(handle);
    return watcher;
}

/** Clear the per-workspace "bootstrap done / skipped" flag so registration can run again. */
export async function resetProtagonistBootstrapFlag(): Promise<boolean> {
    const key = workspaceFlagKey();
    if (!key || !extensionContext) {
        void vscode.window.showWarningMessage(t('extension.error.workspaceRequired'));
        return false;
    }
    const yes = t('extension.confirm.resetProtagonistBootstrapYes');
    const answer = await vscode.window.showInformationMessage(
        t('extension.confirm.resetProtagonistBootstrap'),
        { modal: true },
        yes
    );
    if (answer !== yes) {
        return false;
    }
    await extensionContext.workspaceState.update(key, false);
    void vscode.window.showInformationMessage(t('extension.info.protagonistBootstrapReset'));
    const result = await maybeBootstrapProtagonist({ requireWorldForge: false, source: 'interview' });
    if (result === 'none') {
        void vscode.window.showInformationMessage(t('extension.info.protagonistBootstrapResetNoDraft'));
    }
    return true;
}

/** Build a draft from Quickstart LLM fields. */
export function quickstartFieldsToDraft(parsed: {
    characterName?: string;
    characterDescription?: string;
    scenarioObjective?: string;
}): ProtagonistDraft | null {
    return parseProtagonistDraft({
        name: parsed.characterName,
        description: parsed.characterDescription,
        scenario: parsed.scenarioObjective,
        personality: '',
    });
}