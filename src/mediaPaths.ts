import { getWorkspacePath } from './workspacePaths';
import { getSkillDir } from './imageGenRunner';
import {
    ALLOWED_IMAGE_EXTENSIONS,
    IMAGE_MIME,
    WEBVIEW_SKILL_MEDIA_PREFIX,
    getImageMimeType,
    isAllowedImagePath as isAllowedImagePathCore,
    joinPathUnderRoot,
    relativizePathUnderRoot,
    resolveAllowedImagePath as resolveAllowedImagePathCore,
} from './mediaPathCore';

export { ALLOWED_IMAGE_EXTENSIONS, IMAGE_MIME, getImageMimeType };

function getAllowedRoots(): string[] {
    const roots: string[] = [];
    const ws = getWorkspacePath();
    if (ws) {
        roots.push(ws);
    }
    const skillDir = getSkillDir();
    if (skillDir) {
        roots.push(skillDir);
    }
    return roots;
}

/** 画像パスがワークスペースまたは GM スキル配下の許可画像か検証する。 */
export function isAllowedImagePath(imagePath: string): boolean {
    return isAllowedImagePathCore(imagePath, getAllowedRoots());
}

/** 許可された画像の realpath を返す。拒否時は undefined。 */
export function resolveAllowedImagePath(imagePath: string): string | undefined {
    const roots = getAllowedRoots();
    const direct = resolveAllowedImagePathCore(imagePath, roots);
    if (direct) {
        return direct;
    }
    const trimmed = String(imagePath ?? '').trim();
    if (!trimmed) {
        return undefined;
    }
    for (const root of roots) {
        const joined = joinPathUnderRoot(root, trimmed);
        if (joined) {
            const resolved = resolveAllowedImagePathCore(joined, roots);
            if (resolved) {
                return resolved;
            }
        }
    }
    return undefined;
}

/**
 * Webview-safe media ref (workspace-relative or `skill:`-prefixed).
 * Never returns absolute paths or drive-letter paths.
 */
export function toWebviewSafeMediaRef(imagePath: string): string | undefined {
    const resolved = resolveAllowedImagePath(imagePath);
    if (!resolved) {
        return undefined;
    }
    const ws = getWorkspacePath();
    if (ws) {
        const rel = relativizePathUnderRoot(resolved, ws);
        if (rel) {
            return rel;
        }
    }
    const skillDir = getSkillDir();
    if (skillDir) {
        const rel = relativizePathUnderRoot(resolved, skillDir);
        if (rel) {
            return `${WEBVIEW_SKILL_MEDIA_PREFIX}${rel}`;
        }
    }
    return undefined;
}

/** Resolve a Webview media ref back to an allowed absolute path. */
export function resolveMediaPathFromWebviewRef(ref: string): string | undefined {
    const trimmed = String(ref ?? '').trim();
    if (!trimmed) {
        return undefined;
    }
    if (trimmed.startsWith(WEBVIEW_SKILL_MEDIA_PREFIX)) {
        const skillDir = getSkillDir();
        if (!skillDir) {
            return undefined;
        }
        const rel = trimmed.slice(WEBVIEW_SKILL_MEDIA_PREFIX.length);
        const joined = joinPathUnderRoot(skillDir, rel);
        return joined ? resolveAllowedImagePath(joined) : undefined;
    }
    const ws = getWorkspacePath();
    if (!ws) {
        return undefined;
    }
    const joined = joinPathUnderRoot(ws, trimmed);
    return joined ? resolveAllowedImagePath(joined) : undefined;
}