import {
    getCatalogTemplate,
    listSceneTemplates,
    templateMatchesWorkflowPath,
    type BundledWorkflowCatalog,
    type BundledWorkflowTemplate,
} from './comfyWorkflowCatalogCore';

export type ImageGenGenerationPath = 'scene' | 'cartography';
export type ImageGenSizeSource = 'template' | 'manual-override' | 'unspecified';

export interface ImageGenSettingsSnapshot {
    workflowTemplateId?: string;
    cartographyTemplateId?: string;
    workflowPath?: string;
    width: number;
    height: number;
    sizeFollowsTemplate?: boolean;
}

export interface ImageGenResolvedSettings {
    generationPath: ImageGenGenerationPath;
    templateId: string;
    template?: BundledWorkflowTemplate;
    cartographyTemplateId: string;
    cartographyTemplate?: BundledWorkflowTemplate;
    workflowFile: string;
    width: number;
    height: number;
    sizeSource: ImageGenSizeSource;
    ignoredStaleSize?: { width: number; height: number };
    sizeFollowsTemplate: boolean;
}

function positiveSize(value: number): boolean {
    return Number.isFinite(value) && value > 0;
}

export function resolveSceneTemplate(
    snapshot: ImageGenSettingsSnapshot,
    catalog: BundledWorkflowCatalog,
    bundledRoot?: string,
): BundledWorkflowTemplate | undefined {
    if (snapshot.workflowTemplateId) {
        const byId = getCatalogTemplate(catalog, snapshot.workflowTemplateId);
        if (byId && listSceneTemplates(catalog).includes(byId)) {
            return byId;
        }
    }
    const workflowPath = snapshot.workflowPath || '';
    if (!workflowPath) {
        return undefined;
    }
    return listSceneTemplates(catalog).find((entry) => templateMatchesWorkflowPath(entry, workflowPath, bundledRoot));
}

export function resolveBundledWorkflowPath(bundledRoot: string, file: string): string {
    const trimmedRoot = bundledRoot.replace(/[\\/]+$/, '');
    const sep = bundledRoot.includes('\\') && !bundledRoot.includes('/') ? '\\' : '/';
    return `${trimmedRoot}${sep}${file}`;
}

export function applyWorkflowTemplateToSnapshot(
    current: ImageGenSettingsSnapshot,
    template: BundledWorkflowTemplate,
    bundledRoot: string,
): ImageGenSettingsSnapshot {
    const workflowPath = resolveBundledWorkflowPath(bundledRoot, template.file);
    if (template.kind === 'world_map') {
        return {
            ...current,
            cartographyTemplateId: template.id,
        };
    }
    return {
        ...current,
        workflowTemplateId: template.id,
        workflowPath,
        sizeFollowsTemplate: true,
        width: 0,
        height: 0,
    };
}

export interface WorkspaceImageGenResolution {
    resolved: ImageGenResolvedSettings;
    sceneWorkflowPath: string;
    cartographyWorkflowFile: string;
    cartographyWorkflowPath: string;
}

export function resolveImageGenExecutionSettings(
    snapshot: ImageGenSettingsSnapshot,
    catalog: BundledWorkflowCatalog,
    bundledRoot?: string,
): ImageGenResolvedSettings {
    const mapTemplate = snapshot.cartographyTemplateId
        ? getCatalogTemplate(catalog, snapshot.cartographyTemplateId)
        : undefined;
    const cartographyTemplate = mapTemplate?.kind === 'world_map' ? mapTemplate : undefined;
    const template = resolveSceneTemplate(snapshot, catalog, bundledRoot);
    const sizeFollowsTemplate = snapshot.sizeFollowsTemplate !== false;
    const configuredWidth = snapshot.width;
    const configuredHeight = snapshot.height;

    if (!template) {
        return {
            generationPath: 'scene',
            templateId: '',
            cartographyTemplateId: cartographyTemplate?.id || '',
            cartographyTemplate,
            workflowFile: '',
            width: positiveSize(configuredWidth) ? configuredWidth : 0,
            height: positiveSize(configuredHeight) ? configuredHeight : 0,
            sizeSource: positiveSize(configuredWidth) && positiveSize(configuredHeight)
                ? 'manual-override'
                : 'unspecified',
            sizeFollowsTemplate,
        };
    }

    const stale = (positiveSize(configuredWidth) && configuredWidth !== template.width)
        || (positiveSize(configuredHeight) && configuredHeight !== template.height);
    const useTemplateSize = sizeFollowsTemplate || (!positiveSize(configuredWidth) && !positiveSize(configuredHeight));
    return {
        generationPath: 'scene',
        templateId: template.id,
        template,
        cartographyTemplateId: cartographyTemplate?.id || '',
        cartographyTemplate,
        workflowFile: template.file,
        width: useTemplateSize || !positiveSize(configuredWidth) ? template.width : configuredWidth,
        height: useTemplateSize || !positiveSize(configuredHeight) ? template.height : configuredHeight,
        sizeSource: useTemplateSize ? 'template' : 'manual-override',
        ignoredStaleSize: useTemplateSize && stale
            ? { width: configuredWidth, height: configuredHeight }
            : undefined,
        sizeFollowsTemplate: useTemplateSize,
    };
}

export function resolveCartographyWorkflowFile(
    snapshot: ImageGenSettingsSnapshot,
    catalog: BundledWorkflowCatalog,
    fallbackFile: string,
): string {
    const template = snapshot.cartographyTemplateId
        ? getCatalogTemplate(catalog, snapshot.cartographyTemplateId)
        : undefined;
    if (template?.kind === 'world_map') { return template.file; }
    return fallbackFile;
}

const DEFAULT_CARTOGRAPHY_FILE = 'workflow_cartography_sdxl_canny.json';

/** Composer-facing settings resolution: template size wins unless the user opted into a manual override. */
export function resolveWorkspaceImageGenSettings(input: {
    snapshot: ImageGenSettingsSnapshot;
    catalog: BundledWorkflowCatalog;
    bundledRoot: string;
    cartographyFallbackFile?: string;
}): WorkspaceImageGenResolution {
    const resolved = resolveImageGenExecutionSettings(input.snapshot, input.catalog, input.bundledRoot);
    const cartographyFile = resolveCartographyWorkflowFile(
        input.snapshot,
        input.catalog,
        input.cartographyFallbackFile || DEFAULT_CARTOGRAPHY_FILE,
    );
    return {
        resolved,
        sceneWorkflowPath: resolved.workflowFile
            ? resolveBundledWorkflowPath(input.bundledRoot, resolved.workflowFile)
            : (input.snapshot.workflowPath || ''),
        cartographyWorkflowFile: cartographyFile,
        cartographyWorkflowPath: resolveBundledWorkflowPath(input.bundledRoot, cartographyFile),
    };
}
