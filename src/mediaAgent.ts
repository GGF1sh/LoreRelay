import * as vscode from 'vscode';
import type { StatePatchOp, TurnResult } from './types/TurnResult';
import type { GameEntry, GameState } from './types/GameState';
import { isValidEntryId } from './entryId';
import { enqueueImageGeneration, resetImageQueueDedup } from './imageGenRunner';

export interface MediaAgentDeps {
    getPanel: () => vscode.WebviewPanel | undefined;
    subscriptions: vscode.Disposable[];
}

export interface MediaHints {
    bgm?: string;
    mood?: string;
    sfx?: string | string[];
    imagePrompt?: string;
    entryId?: string;
    imageMode?: string;
}

let deps: MediaAgentDeps | undefined;
let outputChannel: vscode.OutputChannel | undefined;

/** Dedup early stream triggers within a GM session. */
const streamDispatchCache = new Set<string>();
/** Entry IDs already queued or completed for auto-image this session. */
const autoImageEntryIds = new Set<string>();

const STREAM_PATTERNS: Record<keyof Omit<MediaHints, 'entryId' | 'imageMode'>, RegExp> = {
    bgm: /"bgm"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"/,
    mood: /"mood"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"/,
    sfx: /"sfx"\s*:\s*(?:"([^"\\]*(?:\\.[^"\\]*)*)"|(\[[^\]]+\]))/,
    imagePrompt: /"imagePrompt"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"/,
};

export function initMediaAgent(agentDeps: MediaAgentDeps): void {
    deps = agentDeps;
}

function requireDeps(): MediaAgentDeps {
    if (!deps) {
        throw new Error('initMediaAgent must be called before using MediaAgent');
    }
    return deps;
}

export function getMediaAgentOutputChannel(): vscode.OutputChannel {
    if (!outputChannel) {
        outputChannel = vscode.window.createOutputChannel('LoreRelay: Media Agent');
        deps?.subscriptions.push(outputChannel);
    }
    return outputChannel;
}

function isMediaAgentEnabled(): boolean {
    return vscode.workspace.getConfiguration('textAdventure').get<boolean>('mediaAgent.enabled', true);
}

function isAutoImageEnabled(): boolean {
    return vscode.workspace.getConfiguration('textAdventure').get<boolean>('mediaAgent.autoImage', true);
}

function log(line: string): void {
    getMediaAgentOutputChannel().appendLine(line);
}

function cacheKey(field: string, value: string): string {
    return `${field}:${value}`;
}

/** Reset stream dedup cache when a new GM turn starts. */
export function resetMediaStreamCache(): void {
    streamDispatchCache.clear();
}

export function clearMediaAgentCaches(): void {
    streamDispatchCache.clear();
    autoImageEntryIds.clear();
    resetImageQueueDedup();
}

/** Post BGM/SFX triggers directly to Webview (does not block GM). */
export function dispatchAudioTriggers(hints: MediaHints, source: string): void {
    if (!isMediaAgentEnabled()) {
        return;
    }

    const panel = requireDeps().getPanel();
    if (!panel) {
        return;
    }

    const payload: Record<string, unknown> = { type: 'mediaTrigger' };
    let hasAudio = false;

    if (hints.bgm) {
        payload.bgm = hints.bgm;
        hasAudio = true;
    }
    if (hints.mood) {
        payload.mood = hints.mood;
        hasAudio = true;
    }
    if (hints.sfx) {
        payload.sfx = hints.sfx;
        hasAudio = true;
    }

    if (!hasAudio) {
        return;
    }

    panel.webview.postMessage(payload);
    log(`[${source}] audio → bgm=${hints.bgm ?? '-'} mood=${hints.mood ?? '-'} sfx=${JSON.stringify(hints.sfx ?? null)}`);
}

function queueImageFromHints(hints: MediaHints, source: string): void {
    if (!isMediaAgentEnabled() || !isAutoImageEnabled()) {
        return;
    }

    const prompt = hints.imagePrompt?.trim();
    const entryId = hints.entryId?.trim();
    if (!prompt || !entryId || !isValidEntryId(entryId)) {
        return;
    }
    if (autoImageEntryIds.has(entryId)) {
        return;
    }

    const mode = hints.imageMode || 'illustrious';
    const queued = enqueueImageGeneration(prompt.slice(0, 2000), mode, entryId);
    if (queued) {
        autoImageEntryIds.add(entryId);
        log(`[${source}] image queued → entry=${entryId} prompt="${prompt.slice(0, 80)}${prompt.length > 80 ? '…' : ''}"`);
    }
}

/** Extract media hints from JSON Patch ops (turn_result.statePatch). */
export function extractMediaFromPatches(patches: StatePatchOp[]): MediaHints {
    const hints: MediaHints = {};

    for (const patch of patches) {
        if (patch.op === 'remove') {
            continue;
        }
        const path = patch.path;
        if (path === '/bgm' && typeof patch.value === 'string') {
            hints.bgm = patch.value;
        } else if (path === '/mood' && typeof patch.value === 'string') {
            hints.mood = patch.value;
        } else if (path === '/sfx') {
            if (typeof patch.value === 'string') {
                hints.sfx = patch.value;
            } else if (Array.isArray(patch.value)) {
                hints.sfx = patch.value.filter((v): v is string => typeof v === 'string');
            }
        } else if (/^\/entries\/\d+\/imagePrompt$/.test(path) && typeof patch.value === 'string') {
            hints.imagePrompt = patch.value;
            const idxMatch = path.match(/^\/entries\/(\d+)\//);
            if (idxMatch) {
                hints.entryId = `turn-patch-${idxMatch[1]}`;
            }
        }
    }

    return hints;
}

/** Only parse media hints from the JSON code fence region (avoids narrative false positives). */
function extractJsonFenceRegion(buffer: string): string {
    const jsonFence = buffer.indexOf('```json');
    if (jsonFence >= 0) {
        return buffer.slice(jsonFence);
    }
    const genericFence = buffer.lastIndexOf('```');
    if (genericFence >= 0 && buffer.indexOf('{', genericFence) >= 0) {
        return buffer.slice(genericFence);
    }
    return '';
}

/** Scan accumulated GM stdout for media JSON fields and fire early triggers. */
export function parseGmStreamChunk(buffer: string): MediaHints {
    const hints: MediaHints = {};
    const jsonRegion = extractJsonFenceRegion(buffer);
    if (!jsonRegion || jsonRegion.length < 8) {
        return hints;
    }

    for (const [field, pattern] of Object.entries(STREAM_PATTERNS) as [keyof typeof STREAM_PATTERNS, RegExp][]) {
        const match = jsonRegion.match(pattern);
        if (!match) {
            continue;
        }
        let raw = match[1] ?? match[2];
        if (!raw) {
            continue;
        }
        raw = raw.replace(/\\"/g, '"').replace(/\\\\/g, '\\');

        if (field === 'sfx' && raw.startsWith('[')) {
            try {
                const parsed = JSON.parse(raw);
                if (Array.isArray(parsed)) {
                    hints.sfx = parsed.filter((v): v is string => typeof v === 'string');
                }
            } catch {
                hints.sfx = raw;
            }
        } else if (field === 'imagePrompt') {
            hints.imagePrompt = raw;
        } else {
            (hints as Record<string, string>)[field] = raw;
        }
    }

    const idMatch = jsonRegion.match(/"id"\s*:\s*"(turn-[^"]+)"/);
    if (idMatch) {
        hints.entryId = idMatch[1];
    }

    return hints;
}

/** Dispatch stream hints with per-field dedup (fires once per unique value per GM session). */
export function dispatchStreamMediaHints(hints: MediaHints): void {
    if (!isMediaAgentEnabled()) {
        return;
    }

    const audioHints: MediaHints = {};
    let hasNewAudio = false;

    for (const field of ['bgm', 'mood'] as const) {
        const value = hints[field];
        if (!value) {
            continue;
        }
        const key = cacheKey(field, value);
        if (streamDispatchCache.has(key)) {
            continue;
        }
        streamDispatchCache.add(key);
        audioHints[field] = value;
        hasNewAudio = true;
    }

    if (hints.sfx) {
        const sfxKey = cacheKey('sfx', JSON.stringify(hints.sfx));
        if (!streamDispatchCache.has(sfxKey)) {
            streamDispatchCache.add(sfxKey);
            audioHints.sfx = hints.sfx;
            hasNewAudio = true;
        }
    }

    if (hasNewAudio) {
        dispatchAudioTriggers(audioHints, 'gm-stream');
    }

    if (hints.imagePrompt && hints.entryId) {
        const imgKey = cacheKey('image', `${hints.entryId}:${hints.imagePrompt.slice(0, 64)}`);
        if (!streamDispatchCache.has(imgKey)) {
            streamDispatchCache.add(imgKey);
            queueImageFromHints(hints, 'gm-stream');
        }
    }
}

/** Process turn_result.json: fire audio immediately, queue image in background. */
export function handleTurnResultMedia(turnResult: TurnResult): void {
    if (!isMediaAgentEnabled()) {
        return;
    }

    const hints: MediaHints = { entryId: turnResult.turnId };

    if (turnResult.statePatch?.length) {
        Object.assign(hints, extractMediaFromPatches(turnResult.statePatch));
    }

    if (turnResult.media) {
        if (turnResult.media.bgm) { hints.bgm = turnResult.media.bgm; }
        if (turnResult.media.mood) { hints.mood = turnResult.media.mood; }
        if (turnResult.media.sfx) { hints.sfx = turnResult.media.sfx; }
        if (turnResult.media.imagePrompt) { hints.imagePrompt = turnResult.media.imagePrompt; }
        if (turnResult.media.imageMode) { hints.imageMode = turnResult.media.imageMode; }
    }

    queueImageFromHints(hints, 'turn-result');
}

/** When game_state.json updates, auto-queue image for new GM entries with imagePrompt. */
export function handleGameStateMedia(state: GameState, isNewGmEntry: (entry: GameEntry) => boolean): void {
    if (!isMediaAgentEnabled() || !isAutoImageEnabled() || !Array.isArray(state.entries)) {
        return;
    }

    for (const entry of state.entries) {
        if (entry.role !== 'gm' || !isNewGmEntry(entry)) {
            continue;
        }
        if (entry.image || !entry.imagePrompt) {
            continue;
        }
        queueImageFromHints({
            imagePrompt: entry.imagePrompt,
            entryId: entry.id,
            imageMode: 'illustrious'
        }, 'game-state');
    }
}

export function clearMediaAgentState(): void {
    clearMediaAgentCaches();
}