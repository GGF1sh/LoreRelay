import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { getGameEntryHistory } from './gameStateSync';
import { getWorkspacePath } from './workspacePaths';
import { resolveAllowedImagePath } from './mediaPaths';
import { buildChronicleForWorkspace } from './chronicleLoader';
import { readJournalTurnsFromPath } from './chronicleLoader';
import { loadVisualMemory } from './visualMemory';
import { buildWorkspaceMapOverlay } from './mapOverlayBridge';
import {
    buildReplayDocument,
    type ReplayFormat,
    type ReplayOptions,
    type GalleryLike,
    type ReplayJournalTurn,
} from './replayExportCore';
import {
    EXPORTS_DIR_NAME,
    isPathUnderWorkspaceExports,
    relativeImagePathFromExport,
    resolveReplayExportPath,
} from './replayExportPathsCore';
import { t } from './i18n';

export interface ExportReplayRequest {
    format?: ReplayFormat;
    includeImages?: boolean;
    includeGm?: boolean;
    includeDice?: boolean;
    title?: string;
}

export interface ExportReplayResult {
    ok: boolean;
    path?: string;
    message?: string;
}

function defaultFilename(format: ReplayFormat): string {
    const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
    return format === 'html' ? `replay_${stamp}.html` : `replay_${stamp}.md`;
}

function buildGalleryList(): GalleryLike[] {
    const mem = loadVisualMemory();
    const gallery: GalleryLike[] = [];
    for (const entry of Object.values(mem.entries)) {
        if (!entry.imagePath) { continue; }
        gallery.push({
            imagePath: entry.imagePath,
            locationId: entry.locationId,
            worldTurn: entry.worldTurn,
            gmTurn: entry.gmTurn,
            sourceEntryId: entry.sourceEntryId,
            prompt: entry.generationPrompt,
            description: entry.description
        });
    }
    return gallery;
}

function buildJournalTurns(wsPath: string): ReplayJournalTurn[] {
    const journalPath = path.join(wsPath, 'state_journal.ndjson');
    const turns = readJournalTurnsFromPath(journalPath);
    return turns.map((turn) => ({ diceLedger: turn.diceLedger }));
}

export async function exportReplayToWorkspace(request: ExportReplayRequest = {}): Promise<ExportReplayResult> {
    const ws = getWorkspacePath();
    if (!ws) {
        return { ok: false, message: t('extension.error.workspaceRequired') };
    }

    const liveEntries = getGameEntryHistory();
    if (!liveEntries.length) {
        return { ok: false, message: t('extension.error.replayEmpty') };
    }

    const format: ReplayFormat = request.format === 'html' ? 'html' : 'markdown';
    const options: ReplayOptions = {
        format,
        includeImages: request.includeImages !== false,
        includeGm: request.includeGm !== false,
        includeDice: request.includeDice === true
    };

    const exportPath = resolveReplayExportPath(ws, defaultFilename(format));
    if (!exportPath) {
        return { ok: false, message: t('extension.error.replayInvalidPath') };
    }

    const exportsDir = path.join(ws, EXPORTS_DIR_NAME);
    if (!fs.existsSync(exportsDir)) {
        fs.mkdirSync(exportsDir, { recursive: true });
    }

    const resolveRelativeImage = (imagePath: string): string | undefined => {
        const resolved = resolveAllowedImagePath(imagePath);
        if (!resolved) { return undefined; }
        return relativeImagePathFromExport(exportPath, resolved);
    };

    // Snapshot all narrative inputs in one tick before document build / I/O.
    const content = buildReplayDocument({
        entries: JSON.parse(JSON.stringify(liveEntries)),
        chapters: buildChronicleForWorkspace(ws),
        gallery: buildGalleryList(),
        journalTurns: buildJournalTurns(ws),
        options,
        title: request.title?.trim() || 'LoreRelay Replay',
        exportPath,
        resolveRelativeImage,
        mapOverlay: buildWorkspaceMapOverlay(),
    });

    try {
        fs.writeFileSync(exportPath, content, 'utf-8');
    } catch (e) {
        const detail = e instanceof Error ? e.message : String(e);
        return { ok: false, message: t('extension.error.replayWriteFailed', { detail }) };
    }

    return {
        ok: true,
        path: exportPath,
        message: t('extension.info.replayExported', { path: path.basename(exportPath) })
    };
}

export async function openReplayExport(filePath: string): Promise<void> {
    const ws = getWorkspacePath();
    if (!ws || !filePath) { return; }
    if (!isPathUnderWorkspaceExports(filePath, ws)) {
        return;
    }
    const normalized = path.normalize(filePath);
    const uri = vscode.Uri.file(normalized);
    if (normalized.toLowerCase().endsWith('.html')) {
        await vscode.env.openExternal(uri);
        return;
    }
    const doc = await vscode.workspace.openTextDocument(uri);
    await vscode.window.showTextDocument(doc, { preview: false });
}