import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { getGameStatePath } from './workspacePaths';
import { getCachedGameState } from './gameStateSync';
import { writeJsonAtomic } from './workspacePaths';
import {
    hashImageFile,
    loadVisualMemory,
    storeVisualMemoryEntry,
    getCachedDescription,
} from './visualMemory';
import { makeVisualMemoryEntry } from './visualMemoryCore';
import type { VisualMemoryTag } from './visualMemoryCore';

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
    // Fast path: already in cache
    const cached = getCachedDescription(imagePath);
    if (cached) {
        await writeDescriptionToGameState(imagePath, cached);
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

        const description = await analyzeImage(imagePath);
        if (!description) { return; }

        // Persist to visual_memory.json
        const hash = hashImageFile(imagePath);
        if (hash) {
            const entry = makeVisualMemoryEntry({
                imageHash: hash,
                imagePath,
                description,
                worldTurn: meta.worldTurn,
                locationId: meta.locationId,
                generationPrompt: meta.generationPrompt,
                tags: meta.tags ?? ['generated'],
            });
            storeVisualMemoryEntry(entry);
        }

        // Write back to game_state.json (only if latestImage still matches)
        await writeDescriptionToGameState(imagePath, description);

        // Notify the webview so Vision context refreshes on next render
        queueDeps?.getPanel()?.webview.postMessage({
            type: 'vlmAnalysisComplete',
            imagePath,
            description,
        });
    } catch (e) {
        console.error('[vlmQueue] VLM analysis failed', e);
    }
}

async function writeDescriptionToGameState(
    imagePath: string,
    description: string
): Promise<void> {
    const statePath = getGameStatePath();
    if (!statePath || !fs.existsSync(statePath)) { return; }
    try {
        const raw = JSON.parse(fs.readFileSync(statePath, 'utf-8')) as Record<string, unknown>;
        // Only write if the current state still has this image (guard against stale write)
        if (raw.latestImage !== imagePath) { return; }
        if (raw.latestImageDescription === description) { return; }
        raw.latestImageDescription = description;
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
    const locationId = typeof worldField?.currentLocationId === 'string'
        ? worldField.currentLocationId : undefined;
    const worldTurn = typeof worldField?.worldTurn === 'number'
        ? Math.floor(worldField.worldTurn) : undefined;
    return {
        locationId,
        worldTurn,
        generationPrompt,
        tags: ['generated', ...(locationId ? ['location'] as VisualMemoryTag[] : [])],
    };
}
