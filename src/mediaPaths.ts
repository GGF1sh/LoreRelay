import { getWorkspacePath } from './workspacePaths';
import { getSkillDir } from './imageGenRunner';
import {
    ALLOWED_IMAGE_EXTENSIONS,
    IMAGE_MIME,
    getImageMimeType,
    isAllowedImagePath as isAllowedImagePathCore,
    resolveAllowedImagePath as resolveAllowedImagePathCore
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
    return resolveAllowedImagePathCore(imagePath, getAllowedRoots());
}