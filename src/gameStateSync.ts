import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import type { GameEntry, HiddenDiceEntry, ProfileUpdate, SceneSprite } from './types/GameState';
import { isValidEntryId } from './entryId';
import { validateGameState } from './validateGameState';

export interface GameStateSyncDeps {
    getPanel(): vscode.WebviewPanel | undefined;
    getGameStatePath(): string | undefined;
    getWorkspacePath(): string | undefined;
    getSkillDir(): string | undefined;
    getHistoryPath(): string | undefined;
    processProfileUpdates(updates: ProfileUpdate[]): void;
    maybeSuggestArchive(): void;
    appendGmBridgeLog(line: string): void;
}

let deps: GameStateSyncDeps | undefined;

let gameEntryHistory: GameEntry[] = [];
const seenEntryIds = new Set<string>();
let schemaWarningShown = false;
let fileWatcher: vscode.FileSystemWatcher | undefined;
let debounceTimer: NodeJS.Timeout | undefined;

export function initGameStateSync(syncDeps: GameStateSyncDeps): void {
    deps = syncDeps;
}

function requireDeps(): GameStateSyncDeps {
    if (!deps) {
        throw new Error('GameStateSync not initialized — call initGameStateSync() in activate()');
    }
    return deps;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isValidGameEntry(value: unknown): value is GameEntry {
    if (!isRecord(value)) {
        return false;
    }
    return (
        isValidEntryId(value.id) &&
        (value.role === 'gm' || value.role === 'user') &&
        typeof value.sender === 'string' &&
        typeof value.content === 'string'
    );
}

export function getGameEntryHistory(): GameEntry[] {
    return gameEntryHistory;
}

export function setGameEntryHistory(entries: GameEntry[]): void {
    gameEntryHistory = entries;
}

export function getSeenEntryIds(): Set<string> {
    return seenEntryIds;
}

export function syncSeenEntryIdsFromHistory(): void {
    seenEntryIds.clear();
    for (const e of gameEntryHistory) {
        if (e.id) {
            seenEntryIds.add(e.id);
        }
    }
}

/** 履歴配列と seen ID をまとめて更新する（Undo / Rewind / Checkpoint 用）。 */
export function setGameEntryHistoryWithSeenIds(entries: GameEntry[], seenIds?: Iterable<string>): void {
    gameEntryHistory = entries;
    seenEntryIds.clear();
    if (seenIds) {
        for (const id of seenIds) {
            seenEntryIds.add(id);
        }
    } else {
        syncSeenEntryIdsFromHistory();
    }
}

export function loadHistoryFromDisk(): void {
    const d = requireDeps();
    const histPath = d.getHistoryPath();
    if (!histPath || !fs.existsSync(histPath)) {
        return;
    }
    try {
        const entries: GameEntry[] = JSON.parse(fs.readFileSync(histPath, 'utf-8'));
        if (Array.isArray(entries)) {
            for (const e of entries) {
                if (isValidGameEntry(e) && !seenEntryIds.has(e.id)) {
                    seenEntryIds.add(e.id);
                    gameEntryHistory.push(e);
                }
            }
        }
    } catch (e) {
        console.error('Error loading game_history.json:', e);
    }
}

export function saveHistoryToDisk(): void {
    const d = requireDeps();
    const histPath = d.getHistoryPath();
    if (!histPath) {
        return;
    }
    try {
        fs.writeFileSync(histPath, JSON.stringify(gameEntryHistory, null, 2), 'utf-8');
    } catch (e) {
        console.error('Error saving game_history.json:', e);
    }
}

/** Saga アーカイブ後に game_history.json の変更をメモリ上の履歴へ反映する */
export function replaceHistoryFromDisk(): void {
    gameEntryHistory = [];
    seenEntryIds.clear();
    loadHistoryFromDisk();
}

/** 画像パスがワークスペースまたは GM スキル配下か検証する。 */
export function isAllowedImagePath(imagePath: string): boolean {
    const d = requireDeps();
    const normalized = path.normalize(imagePath);
    if (!fs.existsSync(normalized)) {
        return false;
    }

    const ws = d.getWorkspacePath();
    if (ws) {
        const wsNorm = path.normalize(ws);
        if (normalized === wsNorm || normalized.startsWith(wsNorm + path.sep)) {
            return true;
        }
    }

    const skillDir = d.getSkillDir();
    if (skillDir) {
        const skillNorm = path.normalize(skillDir);
        if (normalized === skillNorm || normalized.startsWith(skillNorm + path.sep)) {
            return true;
        }
    }

    console.warn(`[Text Adventure] Image path outside workspace/skill, skipped: ${imagePath}`);
    return false;
}

export function safeImageUri(imagePath: string): string | undefined {
    const panel = requireDeps().getPanel();
    if (!imagePath || !isAllowedImagePath(imagePath) || !panel) {
        return undefined;
    }
    return panel.webview.asWebviewUri(vscode.Uri.file(path.normalize(imagePath))).toString();
}

function resolveSpriteForWebview(sprite: SceneSprite | string | undefined): SceneSprite | undefined {
    if (!sprite) {
        return undefined;
    }
    if (typeof sprite === 'string') {
        const uri = safeImageUri(sprite);
        return uri ? { image: uri, position: 'center' } : undefined;
    }
    const out: SceneSprite = { ...sprite };
    if (out.image) {
        const uri = safeImageUri(out.image);
        if (!uri) {
            return undefined;
        }
        out.image = uri;
    }
    return out;
}

export async function sendCurrentState(retryCount = 0, fullHistory = false): Promise<void> {
    const d = requireDeps();
    const statePath = d.getGameStatePath();
    const panel = d.getPanel();
    if (!statePath || !panel) {
        return;
    }

    try {
        if (fs.existsSync(statePath)) {
            const raw = fs.readFileSync(statePath, 'utf-8');
            const state = JSON.parse(raw);

            const schemaErrors = validateGameState(state);
            if (schemaErrors.length > 0) {
                const summary = schemaErrors.join('; ');
                const logLine = `[Text Adventure] game_state.json schema violation: ${summary}`;
                console.warn(logLine);
                d.appendGmBridgeLog(logLine);
                if (!schemaWarningShown) {
                    schemaWarningShown = true;
                    vscode.window.showWarningMessage(
                        'Text Adventure: game_state.json has schema errors — check "Text Adventure: GM Bridge" output for details.'
                    );
                }
            } else {
                schemaWarningShown = false;
            }

            if (Array.isArray(state.profileUpdates) && state.profileUpdates.length > 0) {
                d.processProfileUpdates(state.profileUpdates as ProfileUpdate[]);
                delete state.profileUpdates;
                fs.writeFileSync(statePath, JSON.stringify(state, null, 2), 'utf-8');
            }

            let historyUpdated = false;
            if (state.entries && Array.isArray(state.entries)) {
                state.entries.forEach((rawEntry: unknown) => {
                    if (!isValidGameEntry(rawEntry)) {
                        return;
                    }
                    const entry = rawEntry;
                    const histIdx = gameEntryHistory.findIndex((e) => e.id === entry.id);
                    if (histIdx >= 0) {
                        const prev = gameEntryHistory[histIdx];
                        const next: GameEntry = { ...prev };
                        let changed = false;
                        const setIfString = (key: keyof Pick<GameEntry, 'role' | 'sender' | 'content' | 'image' | 'imagePrompt' | 'editedAt'>) => {
                            const value = entry[key];
                            if (typeof value === 'string' && value !== next[key]) {
                                (next as any)[key] = value;
                                changed = true;
                            }
                        };
                        setIfString('role');
                        setIfString('sender');
                        setIfString('content');
                        setIfString('image');
                        setIfString('imagePrompt');
                        setIfString('editedAt');
                        if (typeof entry.imageBlocked === 'boolean' && entry.imageBlocked !== next.imageBlocked) {
                            next.imageBlocked = entry.imageBlocked;
                            changed = true;
                        }
                        if (typeof entry.excludedFromPrompt === 'boolean' && entry.excludedFromPrompt !== next.excludedFromPrompt) {
                            next.excludedFromPrompt = entry.excludedFromPrompt;
                            changed = true;
                        }
                        if (changed) {
                            gameEntryHistory[histIdx] = next;
                            historyUpdated = true;
                        }
                        return;
                    }
                    if (!seenEntryIds.has(entry.id)) {
                        seenEntryIds.add(entry.id);
                        const entryWithState: Record<string, unknown> = { ...entry };
                        if (entry.role === 'gm') {
                            if (state.status) { entryWithState.status = JSON.parse(JSON.stringify(state.status)); }
                            if (state.options) { entryWithState.options = [...state.options]; }
                            if (state.theme) { entryWithState.theme = state.theme; }
                            if (state.bgm) { entryWithState.bgm = state.bgm; }
                            if (state.mood) { entryWithState.mood = state.mood; }
                            if (state.sfx) { entryWithState.sfx = Array.isArray(state.sfx) ? [...state.sfx] : state.sfx; }
                            if (state.latestImage) { entryWithState.latestImage = state.latestImage; }
                            if (state.background) { entryWithState.background = state.background; }
                            if (state.sprite) {
                                entryWithState.sprite = typeof state.sprite === 'string'
                                    ? state.sprite
                                    : JSON.parse(JSON.stringify(state.sprite));
                            }
                            if (state.summary) { entryWithState.summary = state.summary; }
                            if (state.gameOver) { entryWithState.gameOver = JSON.parse(JSON.stringify(state.gameOver)); }
                        }
                        gameEntryHistory.push(entryWithState as unknown as GameEntry);
                        historyUpdated = true;
                    }
                });
            }
            if (historyUpdated) {
                saveHistoryToDisk();
                d.maybeSuggestArchive();
            }

            const currentEntries: GameEntry[] = Array.isArray(state.entries)
                ? state.entries.filter(isValidGameEntry)
                : [];
            const sourceEntries: GameEntry[] = fullHistory ? gameEntryHistory : currentEntries;
            const entriesToSend = sourceEntries.map((entry: GameEntry) => {
                const e = { ...entry };
                if (e.image) {
                    const uri = safeImageUri(e.image);
                    if (uri) {
                        e.image = uri;
                    } else {
                        delete e.image;
                        e.imageBlocked = true;
                    }
                }
                return e;
            });

            const latestImage = state.latestImage ? safeImageUri(state.latestImage) : undefined;
            const background = state.background ? safeImageUri(state.background) : undefined;
            const sprite = resolveSpriteForWebview(state.sprite);

            const hiddenDice: HiddenDiceEntry[] | undefined =
                Array.isArray(state.hiddenDice)
                    ? (state.hiddenDice as Array<Record<string, unknown>>).map(
                        ({ notation, purpose }) => ({
                            notation: String(notation ?? ''),
                            ...(purpose !== undefined ? { purpose: String(purpose) } : {})
                        })
                    )
                    : undefined;

            panel.webview.postMessage({
                type: 'gameStateUpdate',
                fullHistory,
                state: { ...state, entries: entriesToSend, latestImage, background, sprite, hiddenDice }
            });
        }
    } catch (e) {
        console.error(`Error reading game state (attempt ${retryCount + 1}):`, e);
        if (retryCount < 3) {
            setTimeout(() => sendCurrentState(retryCount + 1, fullHistory), 200);
        }
    }
}

/** game_state.json の FileSystemWatcher を開始する（BGM/SE 監視は extension 側）。 */
export function startGameStateWatcher(context: vscode.ExtensionContext): void {
    loadHistoryFromDisk();
    void sendCurrentState(0, true);

    if (fileWatcher) {
        fileWatcher.dispose();
    }

    fileWatcher = vscode.workspace.createFileSystemWatcher('**/game_state.json');

    const handleChange = () => {
        if (debounceTimer) {
            clearTimeout(debounceTimer);
        }
        debounceTimer = setTimeout(() => {
            void sendCurrentState();
        }, 300);
    };

    fileWatcher.onDidChange(handleChange);
    fileWatcher.onDidCreate(handleChange);

    context.subscriptions.push(fileWatcher);
}

export function disposeGameStateWatcher(): void {
    if (fileWatcher) {
        fileWatcher.dispose();
        fileWatcher = undefined;
    }
    if (debounceTimer) {
        clearTimeout(debounceTimer);
        debounceTimer = undefined;
    }
}