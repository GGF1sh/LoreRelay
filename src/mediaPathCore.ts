import * as fs from 'fs';
import * as path from 'path';

export const ALLOWED_IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif']);

export const IMAGE_MIME: Record<string, string> = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.gif': 'image/gif'
};

function normalizeRoot(root: string): string {
    try {
        return fs.realpathSync(root);
    } catch {
        return path.normalize(root);
    }
}

function isUnderRoot(real: string, root: string): boolean {
    return real === root || real.startsWith(root + path.sep);
}

/** 許可された画像の realpath を返す。拒否時は undefined。 */
export function resolveAllowedImagePath(imagePath: string, allowedRoots: string[]): string | undefined {
    const normalized = path.normalize(imagePath);
    const ext = path.extname(normalized).toLowerCase();
    if (!ALLOWED_IMAGE_EXTENSIONS.has(ext)) {
        return undefined;
    }
    if (!fs.existsSync(normalized)) {
        return undefined;
    }

    try {
        if (fs.lstatSync(normalized).isSymbolicLink()) {
            return undefined;
        }
    } catch {
        return undefined;
    }

    let real: string;
    try {
        real = fs.realpathSync(normalized);
    } catch {
        return undefined;
    }

    try {
        if (!fs.statSync(real).isFile()) {
            return undefined;
        }
    } catch {
        return undefined;
    }

    const roots = allowedRoots.map(normalizeRoot);
    if (!roots.some((root) => isUnderRoot(real, root))) {
        return undefined;
    }

    return real;
}

export function isAllowedImagePath(imagePath: string, allowedRoots: string[]): boolean {
    return resolveAllowedImagePath(imagePath, allowedRoots) !== undefined;
}

export function getImageMimeType(imagePath: string): string | undefined {
    const ext = path.extname(imagePath).toLowerCase();
    return IMAGE_MIME[ext];
}

/** Prefix for skill-dir media refs sent to Webview (never expose absolute paths). */
export const WEBVIEW_SKILL_MEDIA_PREFIX = 'skill:';

function isSafeRelativeRef(ref: string): boolean {
    const normalized = ref.replace(/\\/g, '/');
    if (!normalized || path.isAbsolute(normalized)) {
        return false;
    }
    if (normalized.startsWith('/') || /^[a-zA-Z]:/.test(normalized)) {
        return false;
    }
    const segments = normalized.split('/');
    return !segments.some((seg) => seg === '..');
}

/** Workspace- or skill-root-relative ref from an already-resolved absolute path. */
export function relativizePathUnderRoot(resolvedPath: string, root: string): string | undefined {
    const realRoot = normalizeRoot(root);
    let realResolved: string;
    try {
        realResolved = fs.realpathSync(resolvedPath);
    } catch {
        realResolved = path.normalize(resolvedPath);
    }
    const rel = path.relative(realRoot, realResolved);
    if (!isSafeRelativeRef(rel)) {
        return undefined;
    }
    return rel.split(path.sep).join('/');
}

/** Join a validated relative ref under root (no traversal). */
export function joinPathUnderRoot(root: string, relativeRef: string): string | undefined {
    const ref = String(relativeRef ?? '').trim().replace(/\\/g, '/');
    if (!isSafeRelativeRef(ref)) {
        return undefined;
    }
    const joined = path.normalize(path.join(root, ref));
    const realRoot = normalizeRoot(root);
    if (!isUnderRoot(joined, realRoot) && joined !== realRoot) {
        return undefined;
    }
    return joined;
}