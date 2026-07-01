import * as fs from 'fs';
import * as path from 'path';

export type LocalModelCategory =
    | 'checkpoint'
    | 'controlnet'
    | 'lora'
    | 'vae'
    | 'gguf'
    | 'diffusion'
    | 'text-encoder'
    | 'other';

export interface LocalModelFile {
    absolutePath: string;
    root: string;
    relativePath: string;
    comfyName: string;
    category: LocalModelCategory;
    extension: string;
    sizeBytes: number;
}

export interface LocalModelScanOptions {
    maxDepth?: number;
    maxFiles?: number;
}

const MODEL_EXTENSIONS = new Set([
    '.safetensors',
    '.ckpt',
    '.pt',
    '.pth',
    '.bin',
    '.gguf'
]);

const SKIP_DIRS = new Set([
    '.git',
    '.cache',
    '__pycache__',
    'custom_nodes',
    'input',
    'output',
    'temp',
    'tmp',
    'venv',
    '.venv',
    'python_embeded',
    'python_embedded',
    'node_modules',
    'web',
    'user'
]);

function normalizeRoot(raw: string): string | undefined {
    const trimmed = raw.trim();
    if (!trimmed) {
        return undefined;
    }
    try {
        return path.resolve(trimmed);
    } catch {
        return undefined;
    }
}

function normalizeRelative(p: string): string {
    return p.split(path.sep).join('\\');
}

function categoryFromSegments(segments: string[], extension: string): LocalModelCategory {
    const lower = segments.map((s) => s.toLowerCase());
    if (extension === '.gguf' || lower.some((s) => s.includes('gguf'))) {
        return 'gguf';
    }
    if (lower.some((s) => s === 'checkpoints' || s === 'checkpoint' || s === 'ckpt')) {
        return 'checkpoint';
    }
    if (lower.some((s) => s === 'controlnet' || s === 'control_net' || s === 'control-nets' || s === 'controlnets')) {
        return 'controlnet';
    }
    if (lower.some((s) => s === 'loras' || s === 'lora')) {
        return 'lora';
    }
    if (lower.some((s) => s === 'vae' || s === 'vae_approx')) {
        return 'vae';
    }
    if (lower.some((s) => s === 'diffusion_models' || s === 'unet' || s === 'unets')) {
        return 'diffusion';
    }
    if (lower.some((s) => s === 'text_encoders' || s === 'clip')) {
        return 'text-encoder';
    }
    return 'other';
}

function categoryAnchorIndex(segments: string[], category: LocalModelCategory): number {
    const lower = segments.map((s) => s.toLowerCase());
    const aliases: Record<LocalModelCategory, string[]> = {
        checkpoint: ['checkpoints', 'checkpoint', 'ckpt'],
        controlnet: ['controlnet', 'control_net', 'control-nets', 'controlnets'],
        lora: ['loras', 'lora'],
        vae: ['vae', 'vae_approx'],
        gguf: ['gguf'],
        diffusion: ['diffusion_models', 'unet', 'unets'],
        'text-encoder': ['text_encoders', 'clip'],
        other: []
    };
    return lower.findIndex((s) => aliases[category].includes(s));
}

function buildComfyName(relativePath: string, category: LocalModelCategory): string {
    const segments = relativePath.split(/[\\/]+/).filter(Boolean);
    const idx = categoryAnchorIndex(segments, category);
    if (idx >= 0 && idx + 1 < segments.length) {
        return segments.slice(idx + 1).join('\\');
    }
    return segments.join('\\');
}

function maybeModelFile(filePath: string, root: string): LocalModelFile | undefined {
    const extension = path.extname(filePath).toLowerCase();
    if (!MODEL_EXTENSIONS.has(extension)) {
        return undefined;
    }
    let stat: fs.Stats;
    try {
        stat = fs.statSync(filePath);
    } catch {
        return undefined;
    }
    if (!stat.isFile()) {
        return undefined;
    }

    const relativePath = normalizeRelative(path.relative(root, filePath));
    const segments = relativePath.split(/[\\/]+/).filter(Boolean);
    const category = categoryFromSegments(segments, extension);
    return {
        absolutePath: filePath,
        root,
        relativePath,
        comfyName: buildComfyName(relativePath, category),
        category,
        extension,
        sizeBytes: stat.size
    };
}

export function scanLocalModelRoots(rawRoots: string[], options: LocalModelScanOptions = {}): LocalModelFile[] {
    const maxDepth = Math.max(1, Math.min(20, options.maxDepth ?? 10));
    const maxFiles = Math.max(1, Math.min(10000, options.maxFiles ?? 2000));
    const results: LocalModelFile[] = [];
    const seen = new Set<string>();

    const roots = rawRoots
        .map(normalizeRoot)
        .filter((v): v is string => Boolean(v));

    function add(filePath: string, root: string): void {
        const resolved = path.resolve(filePath);
        const key = process.platform === 'win32' ? resolved.toLowerCase() : resolved;
        if (seen.has(key) || results.length >= maxFiles) {
            return;
        }
        const model = maybeModelFile(resolved, root);
        if (!model) {
            return;
        }
        seen.add(key);
        results.push(model);
    }

    function walk(dir: string, root: string, depth: number): void {
        if (results.length >= maxFiles || depth > maxDepth) {
            return;
        }
        let entries: fs.Dirent[];
        try {
            entries = fs.readdirSync(dir, { withFileTypes: true });
        } catch {
            return;
        }
        for (const entry of entries) {
            if (results.length >= maxFiles) {
                return;
            }
            const fullPath = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                if (!SKIP_DIRS.has(entry.name.toLowerCase())) {
                    walk(fullPath, root, depth + 1);
                }
            } else if (entry.isFile()) {
                add(fullPath, root);
            }
        }
    }

    for (const root of roots) {
        if (!fs.existsSync(root)) {
            continue;
        }
        const stat = fs.statSync(root);
        if (stat.isFile()) {
            add(root, path.dirname(root));
        } else if (stat.isDirectory()) {
            walk(root, root, 0);
        }
    }

    return results.sort((a, b) =>
        a.category.localeCompare(b.category) ||
        a.comfyName.localeCompare(b.comfyName) ||
        a.absolutePath.localeCompare(b.absolutePath)
    );
}

export function formatModelSize(sizeBytes: number): string {
    if (!Number.isFinite(sizeBytes) || sizeBytes < 0) {
        return '?';
    }
    const gib = sizeBytes / 1024 / 1024 / 1024;
    if (gib >= 1) {
        return `${gib.toFixed(2)} GiB`;
    }
    const mib = sizeBytes / 1024 / 1024;
    return `${mib.toFixed(1)} MiB`;
}
