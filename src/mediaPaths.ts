import * as fs from 'fs';
import * as path from 'path';
import { getWorkspacePath } from './workspacePaths';
import { getSkillDir } from './imageGenRunner';

/** 画像パスがワークスペースまたは GM スキル配下か検証する（共有ユーティリティ）。 */
export function isAllowedImagePath(imagePath: string): boolean {
    const normalized = path.normalize(imagePath);
    if (!fs.existsSync(normalized)) {
        return false;
    }

    const ws = getWorkspacePath();
    if (ws) {
        const wsNorm = path.normalize(ws);
        if (normalized === wsNorm || normalized.startsWith(wsNorm + path.sep)) {
            return true;
        }
    }

    const skillDir = getSkillDir();
    if (skillDir) {
        const skillNorm = path.normalize(skillDir);
        if (normalized === skillNorm || normalized.startsWith(skillNorm + path.sep)) {
            return true;
        }
    }

    return false;
}