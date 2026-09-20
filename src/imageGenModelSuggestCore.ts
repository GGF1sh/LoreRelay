import type { MediaModelFamily } from './mediaProfileCore';
import type { WorkflowPromptMode } from './comfyWorkflowCatalogCore';

export type ImageGenSuggestionStatus = 'ready' | 'unresolved' | 'comfy-unverified';

export interface ImageGenModelEvidence {
    comfyName: string;
    relativePath: string;
    category: string;
    filenameFamily: MediaModelFamily;
    sidecarFamily: MediaModelFamily | 'none';
    sidecarBaseModel: string;
    sidecarSource: string;
}

export interface ImageGenModelSuggestion {
    status: ImageGenSuggestionStatus;
    comfyName: string;
    modelFamily: MediaModelFamily;
    mode: WorkflowPromptMode | '';
    profileId: string;
    workflowTemplateId: string;
    reasons: string[];
    evidence: ImageGenModelEvidence;
    comfyNameKnown?: boolean;
}

const SIDECAR_BASE_KEYS = ['baseModel', 'BaseModel', 'base_model'];

function asRecord(value: unknown): Record<string, unknown> | undefined {
    if (!value || typeof value !== 'object' || Array.isArray(value)) { return undefined; }
    const proto = Object.getPrototypeOf(value);
    if (proto !== Object.prototype && proto !== null) { return undefined; }
    return value as Record<string, unknown>;
}

function readString(record: Record<string, unknown>, key: string): string {
    const value = record[key];
    return typeof value === 'string' ? value.trim().slice(0, 120) : '';
}

const MODEL_FILE_RE = /\.(safetensors|ckpt|pt|pth|bin)$/i;

/** Local sidecar names next to a checkpoint. No network lookup. */
export function sidecarPathsForModelFile(absolutePath: string): string[] {
    const normalized = absolutePath.replace(/\\/g, '/');
    const slash = normalized.lastIndexOf('/');
    const dir = slash >= 0 ? normalized.slice(0, slash + 1) : '';
    const file = slash >= 0 ? normalized.slice(slash + 1) : normalized;
    const dot = file.lastIndexOf('.');
    const stem = dot > 0 ? file.slice(0, dot) : file;
    return [
        `${dir}${file}.json`,
        `${dir}${stem}.civitai.info`,
        `${dir}${stem}.cm-info.json`,
        `${dir}${stem}.json`,
    ];
}

export function parseComfyCheckpointListOutput(stdout: string): string[] {
    const names: string[] = [];
    const seen = new Set<string>();
    for (const line of stdout.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed || /^利用可能/.test(trimmed) || /^available checkpoints/i.test(trimmed)) {
            continue;
        }
        if (!MODEL_FILE_RE.test(trimmed)) {
            continue;
        }
        const key = trimmed.replace(/\\/g, '/').toLowerCase();
        if (seen.has(key)) {
            continue;
        }
        seen.add(key);
        names.push(trimmed);
    }
    return names;
}

export function extractSidecarBaseModel(raw: unknown): string {
    const root = asRecord(raw);
    if (!root) { return ''; }
    for (const key of SIDECAR_BASE_KEYS) {
        const direct = readString(root, key);
        if (direct) { return direct; }
    }
    for (const nestedKey of ['model', 'Model', 'civitai', 'Civitai']) {
        const nested = asRecord(root[nestedKey]);
        if (!nested) { continue; }
        for (const key of SIDECAR_BASE_KEYS) {
            const value = readString(nested, key);
            if (value) { return value; }
        }
    }
    return '';
}

export function familyFromBaseModelLabel(label: string): MediaModelFamily {
    const normalized = label.toLowerCase();
    if (!normalized) { return 'unknown'; }
    if (normalized.includes('flux') || normalized.includes('sd 3') || normalized.includes('sd3')
        || normalized.includes('qwen') || normalized.includes('z-image') || normalized.includes('hidream')) {
        return 'unknown';
    }
    if (normalized.includes('anima')) { return 'anima'; }
    if (normalized.includes('pony')) { return 'pony'; }
    if (normalized.includes('illustrious') || normalized.includes('noob') || normalized.includes('sdxl')
        || normalized.includes('sd xl')) {
        return 'sdxl';
    }
    if (normalized.includes('sd 1') || normalized.includes('sd1.') || normalized === 'sd1.5') {
        return 'unknown';
    }
    return 'unknown';
}

export function familyFromFilename(name: string): MediaModelFamily {
    const normalized = name.toLowerCase();
    if (normalized.includes('flux') || normalized.includes('qwen') || normalized.includes('z-image')
        || normalized.includes('zimage') || normalized.includes('sd3')) {
        return 'unknown';
    }
    if (normalized.includes('anima')) { return 'anima'; }
    if (normalized.includes('pony')) { return 'pony'; }
    if (normalized.includes('illustrious') || normalized.includes('noobai') || normalized.includes('sdxl')
        || normalized.includes('xl_')) {
        return 'sdxl';
    }
    return 'unknown';
}

export function modeForFamily(family: MediaModelFamily, sidecarLabel: string): WorkflowPromptMode | '' {
    if (family === 'pony') { return 'pony'; }
    if (family === 'sdxl') {
        return /illustrious|noobai|noob/i.test(sidecarLabel) ? 'illustrious' : 'natural';
    }
    return '';
}

export function profileForFamily(family: MediaModelFamily, mode: WorkflowPromptMode | ''): string {
    if (family === 'pony' && mode === 'pony') { return 'pony-sdxl-simple'; }
    if (family === 'sdxl' && mode === 'illustrious') { return 'sdxl-illustrious-simple'; }
    if (family === 'sdxl') { return 'sdxl-generic-simple'; }
    return '';
}

function normalizeComfyName(name: string): string {
    return name.trim().replace(/\\/g, '/').toLowerCase();
}

export function comfyNameIsKnown(comfyName: string, knownNames: readonly string[] | undefined): boolean | undefined {
    if (!knownNames) { return undefined; }
    const needle = normalizeComfyName(comfyName);
    return knownNames.some((name) => normalizeComfyName(name) === needle);
}

export function suggestImageGenModel(input: {
    comfyName: string;
    relativePath: string;
    category: string;
    sidecar?: unknown;
    sidecarSource?: string;
    knownComfyNames?: readonly string[];
}): ImageGenModelSuggestion {
    const filenameFamily = familyFromFilename(`${input.comfyName} ${input.relativePath}`);
    const sidecarBaseModel = extractSidecarBaseModel(input.sidecar);
    const sidecarFamily = sidecarBaseModel ? familyFromBaseModelLabel(sidecarBaseModel) : 'none';
    const reasons: string[] = [];
    let status: ImageGenSuggestionStatus = 'ready';
    let modelFamily: MediaModelFamily = 'unknown';

    if (sidecarFamily !== 'none' && sidecarFamily !== 'unknown' && filenameFamily !== 'unknown'
        && sidecarFamily !== filenameFamily) {
        status = 'unresolved';
        reasons.push(`Filename suggests ${filenameFamily}, sidecar baseModel "${sidecarBaseModel}" suggests ${sidecarFamily}.`);
    } else if (sidecarFamily !== 'none' && sidecarFamily !== 'unknown') {
        modelFamily = sidecarFamily;
        reasons.push(`Local sidecar ${input.sidecarSource || 'metadata'} baseModel="${sidecarBaseModel}".`);
    } else if (filenameFamily !== 'unknown') {
        modelFamily = filenameFamily;
        reasons.push(`Filename/path indicates ${filenameFamily}.`);
        if (sidecarBaseModel && sidecarFamily === 'unknown') {
            status = 'unresolved';
            reasons.push(`Sidecar baseModel "${sidecarBaseModel}" is not a supported LoreRelay family.`);
            modelFamily = 'unknown';
        }
    } else {
        status = 'unresolved';
        reasons.push('No supported family could be read from the filename or local sidecar.');
    }

    if (modelFamily === 'anima') {
        status = 'unresolved';
        reasons.push('Anima checkpoints are not assigned an SDXL scene template.');
    }

    const mode = status === 'ready' ? modeForFamily(modelFamily, `${sidecarBaseModel} ${input.comfyName}`) : '';
    const profileId = status === 'ready' ? profileForFamily(modelFamily, mode) : '';
    const workflowTemplateId = status === 'ready' && (modelFamily === 'sdxl' || modelFamily === 'pony')
        ? 'scene-sdxl-square'
        : '';
    const known = comfyNameIsKnown(input.comfyName, input.knownComfyNames);
    if (status === 'ready' && known === false) {
        status = 'unresolved';
        reasons.push('This file name is not in the current ComfyUI checkpoint list.');
    } else if (status === 'ready' && known === undefined) {
        status = 'comfy-unverified';
        reasons.push('ComfyUI checkpoint list was not available; name was not verified.');
    } else if (known === true) {
        reasons.push('Matches a checkpoint name reported by ComfyUI.');
    }

    const applyable = status !== 'unresolved';
    return {
        status,
        comfyName: input.comfyName,
        modelFamily: applyable ? modelFamily : 'unknown',
        mode: applyable ? mode : '',
        profileId: applyable ? profileId : '',
        workflowTemplateId: applyable ? workflowTemplateId : '',
        reasons,
        evidence: {
            comfyName: input.comfyName,
            relativePath: input.relativePath,
            category: input.category,
            filenameFamily,
            sidecarFamily,
            sidecarBaseModel,
            sidecarSource: input.sidecarSource || '',
        },
        comfyNameKnown: known,
    };
}
