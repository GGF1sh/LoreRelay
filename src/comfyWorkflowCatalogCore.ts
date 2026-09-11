export const WORKFLOW_CATALOG_SCHEMA_VERSION = 1 as const;

export type WorkflowTemplateKind = 'scene' | 'portrait' | 'world_map';
export type WorkflowGraphFamily =
    | 'sdxl_checkpoint_simple'
    | 'sdxl_cartography_canny'
    | 'sdxl_cartography_direct';
export type WorkflowPromptMode = 'pony' | 'illustrious' | 'natural' | 'standard';

export interface BundledWorkflowTemplate {
    id: string;
    title: string;
    kind: WorkflowTemplateKind;
    file: string;
    width: number;
    height: number;
    graphFamily: WorkflowGraphFamily;
    checkpointHint: string;
    promptModes: WorkflowPromptMode[];
    summary: string;
}

export interface BundledWorkflowCatalog {
    schemaVersion: typeof WORKFLOW_CATALOG_SCHEMA_VERSION;
    templates: BundledWorkflowTemplate[];
}

const KINDS = new Set<WorkflowTemplateKind>(['scene', 'portrait', 'world_map']);
const GRAPHS = new Set<WorkflowGraphFamily>([
    'sdxl_checkpoint_simple',
    'sdxl_cartography_canny',
    'sdxl_cartography_direct',
]);
const MODES = new Set<WorkflowPromptMode>(['pony', 'illustrious', 'natural', 'standard']);
const FILE_RE = /^workflow_[a-z0-9_]+\.json$/;

function cleanString(value: unknown, max: number): string {
    return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function cleanInt(value: unknown, min: number, max: number): number | undefined {
    const n = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(n)) { return undefined; }
    const rounded = Math.round(n);
    if (rounded < min || rounded > max) { return undefined; }
    return rounded;
}

export const EMPTY_WORKFLOW_CATALOG: BundledWorkflowCatalog = {
    schemaVersion: WORKFLOW_CATALOG_SCHEMA_VERSION,
    templates: [],
};

export function parseBundledWorkflowCatalog(raw: unknown): BundledWorkflowCatalog | undefined {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) { return undefined; }
    const source = raw as Record<string, unknown>;
    if (source.schemaVersion !== WORKFLOW_CATALOG_SCHEMA_VERSION || !Array.isArray(source.templates)) {
        return undefined;
    }
    const templates: BundledWorkflowTemplate[] = [];
    const seen = new Set<string>();
    for (const entry of source.templates.slice(0, 32)) {
        if (!entry || typeof entry !== 'object' || Array.isArray(entry)) { return undefined; }
        const row = entry as Record<string, unknown>;
        const id = cleanString(row.id, 80).toLowerCase();
        const title = cleanString(row.title, 120);
        const kind = cleanString(row.kind, 32) as WorkflowTemplateKind;
        const file = cleanString(row.file, 80);
        const graphFamily = cleanString(row.graphFamily, 64) as WorkflowGraphFamily;
        const checkpointHint = cleanString(row.checkpointHint, 80);
        const summary = cleanString(row.summary, 400);
        const width = cleanInt(row.width, 64, 2048);
        const height = cleanInt(row.height, 64, 2048);
        const promptModes = Array.isArray(row.promptModes)
            ? [...new Set(row.promptModes
                .map((mode) => cleanString(mode, 32))
                .filter((mode): mode is WorkflowPromptMode => MODES.has(mode as WorkflowPromptMode)))]
            : [];
        if (!id || seen.has(id) || !title || !KINDS.has(kind) || !FILE_RE.test(file)
            || !GRAPHS.has(graphFamily) || width === undefined || height === undefined
            || promptModes.length === 0 || !summary) {
            return undefined;
        }
        if (kind === 'world_map' && graphFamily === 'sdxl_checkpoint_simple') { return undefined; }
        if (kind !== 'world_map' && graphFamily !== 'sdxl_checkpoint_simple') { return undefined; }
        seen.add(id);
        templates.push({
            id, title, kind, file, width, height, graphFamily, checkpointHint, promptModes, summary,
        });
    }
    if (templates.length === 0) { return undefined; }
    return { schemaVersion: WORKFLOW_CATALOG_SCHEMA_VERSION, templates };
}

export function getCatalogTemplate(
    catalog: BundledWorkflowCatalog,
    id: string,
): BundledWorkflowTemplate | undefined {
    const key = id.trim().toLowerCase();
    return catalog.templates.find((entry) => entry.id === key);
}

export function listSceneTemplates(catalog: BundledWorkflowCatalog): BundledWorkflowTemplate[] {
    return catalog.templates.filter((entry) => entry.kind !== 'world_map');
}

export function listMapTemplates(catalog: BundledWorkflowCatalog): BundledWorkflowTemplate[] {
    return catalog.templates.filter((entry) => entry.kind === 'world_map');
}

export function templateMatchesWorkflowPath(template: BundledWorkflowTemplate, workflowPath: string): boolean {
    const normalized = workflowPath.replace(/\\/g, '/').toLowerCase();
    return normalized.endsWith(`/comfyui/${template.file}`) || normalized.endsWith(`/${template.file}`);
}
