import * as vscode from 'vscode';
import * as fs from 'fs';
import type { GameEntry } from './types/GameState';
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
import { t } from './i18n';
import { getArchiveRemindStep, getArchiveThreshold } from './archivePrompt';
import { isValidEntryId } from './entryId';
import { getWorkspacePath, getGameStatePath, getGmProvider, writeJsonAtomic } from './workspacePaths';
import { migrateGameState } from './migrateGameState';
import { sanitizeGameStateForPersist } from './gameStateSanitize';
import {
    getGameEntryHistory,
    replaceHistoryFromDisk,
    saveHistoryToDisk,
    sendCurrentState,
    setGameEntryHistoryWithSeenIds
} from './gameStateSync';
import { invokeGmBridge, fallbackToClipboard } from './gmBridgeRunner';
import { runSkillScript } from './skillScriptRunner';
import { computeAndSetArchiveMilestone } from './gmPromptBuilder';
import { commitGameState } from './stateManager';

export interface CheckpointHandlerDeps {
    getPanel: () => vscode.WebviewPanel | undefined;
    isGameOverActive: () => boolean;
}

let deps: CheckpointHandlerDeps | undefined;

export function initCheckpointHandlers(handlerDeps: CheckpointHandlerDeps): void {
    deps = handlerDeps;
}

function requireDeps(): CheckpointHandlerDeps {
    if (!deps) {
        throw new Error('initCheckpointHandlers must be called before using checkpoint handlers');
    }
    return deps;
}

function readGameStateFromDisk(statePath: string): Record<string, unknown> | null {
    try {
        const raw = JSON.parse(fs.readFileSync(statePath, 'utf-8')) as unknown;
        if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
            return null;
        }
        const { state } = migrateGameState(raw);
        return state as Record<string, unknown>;
    } catch {
        return null;
    }
}

function writeGameStateToDisk(statePath: string, state: Record<string, unknown>): void {
    commitGameState(state);
}

export async function handleEditEntry(id: string, content: string): Promise<void> {
    const panel = requireDeps().getPanel();
    const safeCon = content.trim().slice(0, 20000);
    if (!safeCon) { return; }
    const statePath = getGameStatePath();
    if (!statePath || !fs.existsSync(statePath)) { return; }
    const editedAt = new Date().toISOString();
    try {
        const state = readGameStateFromDisk(statePath);
        if (!state) { return; }
        let changed = false;
        const entry = (state.entries as GameEntry[] | undefined)?.find((e) => e.id === id);
        if (entry) {
            entry.content = safeCon;
            (entry as GameEntry & { editedAt?: string }).editedAt = editedAt;
            writeGameStateToDisk(statePath, state);
            changed = true;
        }
        const hist = getGameEntryHistory().find((e) => e.id === id);
        if (hist) {
            hist.content = safeCon;
            (hist as GameEntry & { editedAt?: string }).editedAt = editedAt;
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

export async function handleToggleExcludeEntry(id: string): Promise<void> {
    const panel = requireDeps().getPanel();
    const statePath = getGameStatePath();
    if (!statePath || !fs.existsSync(statePath)) { return; }
    try {
        const state = readGameStateFromDisk(statePath);
        const entry = state ? (state.entries as GameEntry[] | undefined)?.find((e) => e.id === id) : undefined;
        const hist = getGameEntryHistory().find((e) => e.id === id);
        if (!entry && !hist) {
            sendCurrentState(0, true);
            return;
        }
        const excluded = !Boolean(entry?.excludedFromPrompt ?? hist?.excludedFromPrompt);
        if (entry && state) {
            entry.excludedFromPrompt = excluded;
            writeGameStateToDisk(statePath, state);
        }
        if (hist) {
            (hist as GameEntry & { excludedFromPrompt?: boolean }).excludedFromPrompt = excluded;
            saveHistoryToDisk();
        }
        panel?.webview.postMessage({ type: 'entryExcludeToggled', id, excluded });
    } catch (e) {
        console.error('Error toggling exclude:', e);
    }
}

export function updateSummary(summary: unknown): void {
    if (typeof summary !== 'string') {
        return;
    }
    const safeSummary = summary.trim().slice(0, 20000);
    const statePath = getGameStatePath();
    if (statePath && fs.existsSync(statePath)) {
        try {
            const state = readGameStateFromDisk(statePath);
            if (!state) { return; }
            state.summary = safeSummary;
            writeGameStateToDisk(statePath, state);
        } catch (e) {
            console.error('Error updating summary:', e);
        }
    }
}

export async function archiveSaga(): Promise<void> {
    const panel = requireDeps().getPanel();
    const provider = getGmProvider();
    if (provider === 'clipboard' || provider === 'command') {
        vscode.window.showWarningMessage(t('extension.error.archiveUnavailable'));
        panel?.webview.postMessage({ type: 'sagaArchived' });
        return;
    }

    const code = await runSkillScript('archive_saga.py', ['--provider', provider]);
    if (code === 0) {
        replaceHistoryFromDisk();
        const config = vscode.workspace.getConfiguration('textAdventure');
        const orModel = config.get<string>('gmBridge.openRouter.model', '');
        const threshold = getArchiveThreshold(provider, orModel);
        const remindStep = getArchiveRemindStep();
        computeAndSetArchiveMilestone(getGameEntryHistory().length, threshold, remindStep);
        vscode.window.showInformationMessage(t('extension.info.sagaDone'));
        panel?.webview.postMessage({ type: 'sagaArchived' });
    } else {
        vscode.window.showErrorMessage(t('extension.error.sagaFailed'));
        panel?.webview.postMessage({ type: 'sagaArchived' });
    }
}

export async function summarizeHistory(): Promise<void> {
    const panel = requireDeps().getPanel();
    const provider = getGmProvider();
    if (provider === 'clipboard' || provider === 'command') {
        vscode.window.showWarningMessage(t('extension.error.summarizeUnavailable'));
        panel?.webview.postMessage({ type: 'summaryUpdated' });
        return;
    }

    const code = await runSkillScript('summarize_gm.py', ['--provider', provider]);

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
        writeGameStateToDisk(statePath, newState as unknown as Record<string, unknown>);
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

export function sendCheckpointList(): void {
    const panel = requireDeps().getPanel();
    const ws = getWorkspacePath();
    if (!panel || !ws) {
        return;
    }
    panel.webview.postMessage({
        type: 'checkpointList',
        checkpoints: listCheckpointMetas(ws),
        rewindTargets: listRewindTargets(getGameEntryHistory())
    });
}

export async function handleUndoLastTurn(): Promise<void> {
    const ws = getWorkspacePath();
    if (!ws) {
        vscode.window.showWarningMessage(t('extension.error.workspaceRequired'));
        return;
    }
    const history = getGameEntryHistory();
    if (history.length === 0) {
        vscode.window.showWarningMessage(t('extension.warning.noHistoryToUndo'));
        return;
    }
    setGameEntryHistoryWithSeenIds(truncateHistoryOneTurn(history));
    saveHistoryToDisk();
    await writeRestoredGameState(findLastGmEntry(getGameEntryHistory()), t('extension.info.undoSuccess'));
}

export async function handleRestoreToTurn(entryId: string): Promise<void> {
    const ws = getWorkspacePath();
    if (!ws) {
        vscode.window.showWarningMessage(t('extension.error.workspaceRequired'));
        return;
    }
    if (!isValidEntryId(entryId)) {
        vscode.window.showWarningMessage(t('extension.warning.rewindNotFound'));
        return;
    }
    const result = truncateHistoryToGmEntry(getGameEntryHistory(), entryId);
    if (!result) {
        vscode.window.showWarningMessage(t('extension.warning.rewindNotFound'));
        return;
    }
    setGameEntryHistoryWithSeenIds(result.history, result.seenIds);
    saveHistoryToDisk();
    const gm = findLastGmEntry(getGameEntryHistory());
    await writeRestoredGameState(gm, t('extension.info.rewindSuccess'));
}

export async function handleSaveCheckpoint(label?: string): Promise<void> {
    const ws = getWorkspacePath();
    if (!ws) {
        vscode.window.showWarningMessage(t('extension.error.workspaceRequired'));
        return;
    }
    const history = getGameEntryHistory();
    if (history.length === 0) {
        vscode.window.showWarningMessage(t('extension.warning.noHistoryToCheckpoint'));
        return;
    }
    const meta = saveCheckpointFile(ws, history, label);
    if (!meta) {
        vscode.window.showWarningMessage(t('extension.warning.noHistoryToCheckpoint'));
        return;
    }
    sendCheckpointList();
    vscode.window.showInformationMessage(t('extension.info.checkpointSaved', { label: meta.label }));
}

export async function handleRestoreCheckpoint(checkpointId: string): Promise<void> {
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
    setGameEntryHistoryWithSeenIds(cp.history);
    saveHistoryToDisk();
    const gm = findLastGmEntry(getGameEntryHistory());
    await writeRestoredGameState(gm, t('extension.info.checkpointRestored', { label: cp.meta.label }));
}

export async function handleDeleteCheckpoint(checkpointId: string): Promise<void> {
    const ws = getWorkspacePath();
    if (!ws) {
        return;
    }
    if (deleteCheckpointFile(ws, checkpointId)) {
        sendCheckpointList();
        vscode.window.showInformationMessage(t('extension.info.checkpointDeleted'));
    }
}

export async function handleRegenerateLastTurn(): Promise<void> {
    const { isGameOverActive } = requireDeps();
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
    const trimmed = truncateHistoryOneTurn([...getGameEntryHistory()]);
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
    setGameEntryHistoryWithSeenIds(trimmed);
    saveHistoryToDisk();
    const gm = findLastGmEntry(getGameEntryHistory());
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