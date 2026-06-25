import * as fs from 'fs';
import * as path from 'path';

export interface ImageGenTemplates {
    scene: string;
    portrait: string;
    background: string;
    freeform: string;
}

export interface ImageGenConfig {
    version: number;
    checkpoint: string;
    workflowPath: string;
    mode: string;
    steps: number;
    cfg: number;
    width: number;
    height: number;
    samplerName: string;
    scheduler: string;
    positivePrefix: string;
    positiveSuffix: string;
    negativePrompt: string;
    templates: ImageGenTemplates;
}

const ALLOWED_MODES = ['pony', 'illustrious', 'natural', 'standard'] as const;

export const IMAGE_GEN_CONFIG_FILENAME = 'image_gen_config.json';

export const DEFAULT_IMAGE_GEN_CONFIG: ImageGenConfig = {
    version: 1,
    checkpoint: '',
    workflowPath: '',
    mode: 'illustrious',
    steps: 0,
    cfg: 0,
    width: 0,
    height: 0,
    samplerName: '',
    scheduler: '',
    positivePrefix: '',
    positiveSuffix: '',
    negativePrompt: '',
    templates: {
        scene: '{{content}}',
        portrait: '{{character}} portrait, {{description}}',
        background: '{{location}}, {{mood}}, detailed background',
        freeform: '{{prompt}}'
    }
};

export function getImageGenConfigPath(wsPath: string): string {
    return path.join(wsPath, IMAGE_GEN_CONFIG_FILENAME);
}

function clampNum(value: unknown, min: number, max: number, fallback: number): number {
    const n = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(n)) {
        return fallback;
    }
    return Math.min(max, Math.max(min, Math.round(n)));
}

function clampFloat(value: unknown, min: number, max: number, fallback: number): number {
    const n = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(n)) {
        return fallback;
    }
    return Math.min(max, Math.max(min, n));
}

function sanitizeStr(value: unknown, maxLen: number, fallback = ''): string {
    if (typeof value !== 'string') {
        return fallback;
    }
    return value.trim().slice(0, maxLen);
}

function sanitizeTemplates(input: unknown): ImageGenTemplates {
    const base = DEFAULT_IMAGE_GEN_CONFIG.templates;
    if (!input || typeof input !== 'object') {
        return { ...base };
    }
    const t = input as Record<string, unknown>;
    return {
        scene: sanitizeStr(t.scene, 4000, base.scene),
        portrait: sanitizeStr(t.portrait, 4000, base.portrait),
        background: sanitizeStr(t.background, 4000, base.background),
        freeform: sanitizeStr(t.freeform, 4000, base.freeform)
    };
}

/** Validate and normalize user/workspace image generation settings. */
export function sanitizeImageGenConfig(input: unknown): ImageGenConfig {
    const src = (input && typeof input === 'object') ? input as Record<string, unknown> : {};
    const modeRaw = sanitizeStr(src.mode, 32, DEFAULT_IMAGE_GEN_CONFIG.mode).toLowerCase();
    const mode = (ALLOWED_MODES as readonly string[]).includes(modeRaw)
        ? modeRaw
        : DEFAULT_IMAGE_GEN_CONFIG.mode;

    return {
        version: 1,
        checkpoint: sanitizeStr(src.checkpoint, 512),
        workflowPath: sanitizeStr(src.workflowPath, 512),
        mode,
        steps: clampNum(src.steps, 0, 150, 0),
        cfg: clampFloat(src.cfg, 0, 30, 0),
        width: clampNum(src.width, 0, 2048, 0),
        height: clampNum(src.height, 0, 2048, 0),
        samplerName: sanitizeStr(src.samplerName, 64),
        scheduler: sanitizeStr(src.scheduler, 64),
        positivePrefix: sanitizeStr(src.positivePrefix, 4000),
        positiveSuffix: sanitizeStr(src.positiveSuffix, 4000),
        negativePrompt: sanitizeStr(src.negativePrompt, 4000),
        templates: sanitizeTemplates(src.templates)
    };
}

export function loadImageGenConfig(wsPath: string): ImageGenConfig {
    const configPath = getImageGenConfigPath(wsPath);
    if (!fs.existsSync(configPath)) {
        return { ...DEFAULT_IMAGE_GEN_CONFIG, templates: { ...DEFAULT_IMAGE_GEN_CONFIG.templates } };
    }
    try {
        const raw = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
        return sanitizeImageGenConfig(raw);
    } catch {
        return { ...DEFAULT_IMAGE_GEN_CONFIG, templates: { ...DEFAULT_IMAGE_GEN_CONFIG.templates } };
    }
}

export function saveImageGenConfig(wsPath: string, partial: Partial<ImageGenConfig>): ImageGenConfig {
    const current = loadImageGenConfig(wsPath);
    const merged = sanitizeImageGenConfig({ ...current, ...partial, templates: { ...current.templates, ...(partial.templates || {}) } });
    const configPath = getImageGenConfigPath(wsPath);
    fs.writeFileSync(configPath, JSON.stringify(merged, null, 2), 'utf-8');
    return merged;
}