import * as fs from 'fs';
import * as path from 'path';
import {
    EMPTY_WORKFLOW_CATALOG,
    parseBundledWorkflowCatalog,
    type BundledWorkflowCatalog,
} from './comfyWorkflowCatalogCore';
import { loadImageGenConfig, type ImageGenConfig } from './imageGenConfig';
import {
    sidecarPathsForModelFile,
    suggestImageGenModel,
    type ImageGenModelSuggestion,
} from './imageGenModelSuggestCore';
import {
    resolveWorkspaceImageGenSettings as resolveWorkspaceImageGenSettingsCore,
    type ImageGenResolvedSettings,
    type WorkspaceImageGenResolution,
} from './imageGenSettingsResolveCore';
import { scanLocalModelRoots, type LocalModelFile } from './modelScanner';

const MAX_SIDECAR_BYTES = 256 * 1024;
const MAX_MODEL_SUGGESTIONS = 32;

export function getBundledComfyRoot(extensionPath?: string): string {
    if (extensionPath) {
        return path.join(extensionPath, 'comfyui');
    }
    return path.join(__dirname, '..', 'comfyui');
}

export function loadBundledWorkflowCatalog(bundledRoot: string): BundledWorkflowCatalog {
    try {
        const catalogPath = path.join(bundledRoot, 'templates.json');
        const raw = JSON.parse(fs.readFileSync(catalogPath, 'utf8')) as unknown;
        return parseBundledWorkflowCatalog(raw) || EMPTY_WORKFLOW_CATALOG;
    } catch {
        return EMPTY_WORKFLOW_CATALOG;
    }
}

export interface ResolvedWorkspaceImageGenSettings extends WorkspaceImageGenResolution {
    config: ImageGenConfig;
    catalog: BundledWorkflowCatalog;
    bundledRoot: string;
}

/** Reusable settings resolution for Composer / runners. Does not queue or spawn ComfyUI. */
export function resolveWorkspaceImageGenSettings(
    wsPath: string,
    extensionPath?: string,
    cartographyFallbackFile?: string,
): ResolvedWorkspaceImageGenSettings {
    const bundledRoot = getBundledComfyRoot(extensionPath);
    const catalog = loadBundledWorkflowCatalog(bundledRoot);
    const config = loadImageGenConfig(wsPath);
    const resolution = resolveWorkspaceImageGenSettingsCore({
        snapshot: config,
        catalog,
        bundledRoot,
        cartographyFallbackFile,
    });
    return {
        ...resolution,
        config,
        catalog,
        bundledRoot,
    };
}

export function readLocalModelSidecar(absolutePath: string): { sidecar?: unknown; sidecarSource: string } {
    for (const candidate of sidecarPathsForModelFile(absolutePath)) {
        const sidecarPath = path.normalize(candidate);
        try {
            if (!fs.existsSync(sidecarPath)) {
                continue;
            }
            const stat = fs.statSync(sidecarPath);
            if (!stat.isFile() || stat.size <= 0 || stat.size > MAX_SIDECAR_BYTES) {
                continue;
            }
            const raw = JSON.parse(fs.readFileSync(sidecarPath, 'utf8')) as unknown;
            return { sidecar: raw, sidecarSource: path.basename(sidecarPath) };
        } catch {
            continue;
        }
    }
    return { sidecarSource: '' };
}

function suggestionRank(status: ImageGenModelSuggestion['status']): number {
    if (status === 'ready') {
        return 0;
    }
    if (status === 'comfy-unverified') {
        return 1;
    }
    return 2;
}

export function collectLocalImageGenModelSuggestions(input: {
    roots: readonly string[];
    knownComfyNames?: readonly string[];
}): ImageGenModelSuggestion[] {
    const models = scanLocalModelRoots([...input.roots])
        .filter((row: LocalModelFile) => row.category === 'checkpoint');
    const suggestions = models.map((row) => {
        const sidecar = readLocalModelSidecar(row.absolutePath);
        return suggestImageGenModel({
            comfyName: row.comfyName,
            relativePath: row.relativePath,
            category: row.category,
            sidecar: sidecar.sidecar,
            sidecarSource: sidecar.sidecarSource,
            knownComfyNames: input.knownComfyNames,
        });
    });
    suggestions.sort((a, b) => {
        const rank = suggestionRank(a.status) - suggestionRank(b.status);
        if (rank !== 0) {
            return rank;
        }
        return a.comfyName.localeCompare(b.comfyName);
    });
    return suggestions.slice(0, MAX_MODEL_SUGGESTIONS);
}

export function resolvedSettingsPreview(resolved: ImageGenResolvedSettings, cartographyFile: string) {
    return {
        templateId: resolved.templateId,
        width: resolved.width,
        height: resolved.height,
        sizeSource: resolved.sizeSource,
        workflowFile: resolved.workflowFile,
        ignoredStaleSize: resolved.ignoredStaleSize,
        sizeFollowsTemplate: resolved.sizeFollowsTemplate,
        cartographyTemplateId: resolved.cartographyTemplateId,
        cartographyFile,
    };
}
