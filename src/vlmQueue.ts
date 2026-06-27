import * as fs from 'fs';
import * as vscode from 'vscode';
import { getGameStatePath, writeJsonAtomic } from './workspacePaths';
import { getCachedGameState } from './gameStateSync';
import { resolveAllowedImagePath } from './mediaPaths';
import { loadWorldState, isWorldStateEnabled } from './worldState';
import {
    hashImageFile,
    storeVisualMemoryEntry,
    getCachedDescription,
} from './visualMemory';
import { isValidEntryId } from './entryId';
import { makeVisualMemoryEntry } from './visualMemoryCore';
import type { VisualMemoryTag } from './visualMemoryCore';
import {
    sanitizeVlmDescription,
    resolvedImagePathsMatch,
} from './vlmQueueCore';

// ---------------------------------------------------------------------------
// Deps / init
// ---------------------------------------------------------------------------

export interface VlmQueueDeps {
    getPanel: () => vscode.WebviewPanel | undefined;
}

let queueDeps: VlmQueueDeps | undefined;

export function initVlmQueue(deps: VlmQueueDeps): void {
    queueDeps = deps;
}

/** True when textAdventure.vlm.provider is not "disabled". */
export function isVlmEnabled(): boolean {
    return vscode.workspace.getConfiguration('textAdventure').get<string>('vlm.provider', 'disabled') !== 'disabled';
}

// ---------------------------------------------------------------------------
// Queue state
// ---------------------------------------------------------------------------

let analysisInFlight = false;
/** Only the most recently enqueued path is kept; older ones are dropped when busy. */
let pendingPath: string | undefined;
let pendingMeta: VlmAnalysisMeta | undefined;

export interface VlmAnalysisMeta {
    locationId?: string;
    worldTurn?: number;
    generationPrompt?: string;
    tags?: VisualMemoryTag[];
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Enqueues an image for VLM analysis.
 *
 * Behaviour:
 *  - Cache hit  → immediately writes description to game_state.json (sync, fast).
 *  - Cache miss → starts async analysis (fire-and-forget); the GM bridge is not
 *                 blocked. The description will be available on the NEXT GM turn.
 *
 * Safe to call concurrently; only one VLM call runs at a time.
 */
export async function enqueueVlmAnalysis(
    imagePath: string,
    meta: VlmAnalysisMeta = {}
): Promise<void> {
    if (!isVlmEnabled()) { return; }

    const resolvedEnqueue = resolveAllowedImagePath(imagePath);
    if (!resolvedEnqueue) { return; }

    // Fast path: already in cache
    const cached = getCachedDescription(resolvedEnqueue);
    if (cached) {
        await writeDescriptionToGameState(resolvedEnqueue, cached);
        notifyVlmAnalysisComplete(resolvedEnqueue, cached);
        return;
    }

    // Async path: queue analysis (replace any pending job — latest wins)
    pendingPath = imagePath;
    pendingMeta = meta;
    if (!analysisInFlight) {
        drainQueue();
    }
}

// ---------------------------------------------------------------------------
// Internal queue drain
// ---------------------------------------------------------------------------

function drainQueue(): void {
    if (!pendingPath) { return; }
    const imagePath = pendingPath;
    const meta = pendingMeta ?? {};
    pendingPath = undefined;
    pendingMeta = undefined;

    analysisInFlight = true;
    runAnalysis(imagePath, meta).finally(() => {
        analysisInFlight = false;
        if (pendingPath) { drainQueue(); }
    });
}

async function runAnalysis(imagePath: string, meta: VlmAnalysisMeta): Promise<void> {
    try {
        const { analyzeImage } = await import('./vlmProvider');
        vscode.window.setStatusBarMessage('$(eye) Soulgaze: Analyzing scene...', 8000);

        const resolvedPath = resolveAllowedImagePath(imagePath);
        if (!resolvedPath) { return; }

        const rawDescription = await analyzeImage(resolvedPath);
        const description = sanitizeVlmDescription(rawDescription);
        if (!description) {
            notifyVlmAnalysisFailed(resolvedPath);
            return;
        }

        // Persist to visual_memory.json
        const hash = hashImageFile(resolvedPath);
        if (hash) {
            const entry = makeVisualMemoryEntry({
                imageHash: hash,
                imagePath: resolvedPath,
                description,
                worldTurn: meta.worldTurn,
                locationId: meta.locationId,
                generationPrompt: meta.generationPrompt,
                tags: meta.tags ?? ['generated'],
            });
            storeVisualMemoryEntry(entry);
        }

        // Write back to game_state.json (only if latestImage still matches)
        await writeDescriptionToGameState(resolvedPath, description);

        notifyVlmAnalysisComplete(resolvedPath, description);
    } catch (e) {
        console.error('[vlmQueue] VLM analysis failed', e);
        const resolved = resolveAllowedImagePath(imagePath);
        if (resolved) { notifyVlmAnalysisFailed(resolved); }
    }
}

function notifyVlmAnalysisComplete(imagePath: string, description: string): void {
    queueDeps?.getPanel()?.webview.postMessage({
        type: 'vlmAnalysisComplete',
        imagePath,
        description,
    });
}

function notifyVlmAnalysisFailed(imagePath: string): void {
    queueDeps?.getPanel()?.webview.postMessage({
        type: 'vlmAnalysisFailed',
        imagePath,
    });
}

async function writeDescriptionToGameState(
    imagePath: string,
    description: string
): Promise<void> {
    const safeDescription = sanitizeVlmDescription(description);
    if (!safeDescription) { return; }

    const resolvedTarget = resolveAllowedImagePath(imagePath);
    if (!resolvedTarget) { return; }

    const statePath = getGameStatePath();
    if (!statePath || !fs.existsSync(statePath)) { return; }
    try {
        const raw = JSON.parse(fs.readFileSync(statePath, 'utf-8')) as Record<string, unknown>;
        const resolvedLatest = typeof raw.latestImage === 'string'
            ? resolveAllowedImagePath(raw.latestImage)
            : undefined;
        // Only write if the current state still has this image (guard against stale write)
        if (!resolvedImagePathsMatch(resolvedLatest, resolvedTarget)) { return; }
        if (raw.latestImageDescription === safeDescription) { return; }
        raw.latestImageDescription = safeDescription;
        writeJsonAtomic(statePath, raw);
    } catch (e) {
        console.error('[vlmQueue] Failed to write description to game_state', e);
    }
}

// ---------------------------------------------------------------------------
// Helper: build VlmAnalysisMeta from current game state
// ---------------------------------------------------------------------------

/**
 * Reads locationId and worldTurn from the cached game state for use as metadata
 * when enqueuing a newly generated image.
 */
export function buildVlmMetaFromGameState(generationPrompt?: string): VlmAnalysisMeta {
    const state = getCachedGameState();
    const worldField = state?.world as Record<string, unknown> | undefined;
    const rawLocationId = typeof worldField?.currentLocationId === 'string'
        ? worldField.currentLocationId : undefined;
    const locationId = rawLocationId && isValidEntryId(rawLocationId) ? rawLocationId : undefined;
    const worldTurn = isWorldStateEnabled()
        ? loadWorldState()?.worldTurn
        : undefined;
    return {
        locationId,
        worldTurn,
        generationPrompt,
        tags: ['generated', ...(locationId ? ['location'] as VisualMemoryTag[] : [])],
    };
}
