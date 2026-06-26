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