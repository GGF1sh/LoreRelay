import * as fs from 'fs';
import * as path from 'path';

export const WORLD_FORGE_BASENAME = 'world_forge.json';
export const WORLD_MAP_IMAGE_BASENAME = 'world_map.png';
export const WORLD_MAP_LAYOUT_BASENAME = 'world_map.layout.png';

/** ComfyUI cartography script temp output: `world_map_{8 hex}.png` in workspace root. */
export const CARTOGRAPHY_TEMP_MAP_PATTERN = /^world_map_[a-f0-9]{8}\.png$/i;

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

function resolveRealFile(filePath: string): string | undefined {
    const normalized = path.normalize(filePath);
    if (!fs.existsSync(normalized)) {
        return undefined;
    }
    try {
        if (!fs.statSync(normalized).isFile()) {
            return undefined;
        }
        if (fs.lstatSync(normalized).isSymbolicLink()) {
            return undefined;
        }
        return fs.realpathSync(normalized);
    } catch {
        return undefined;
    }
}

/** `world_forge.json` が workspace 配下の通常ファイルか検証。通過時は realpath を返す。 */
export function validateForgePathInWorkspace(forgePath: string, wsPath: string): string | undefined {
    if (!forgePath || !wsPath) {
        return undefined;
    }
    if (path.basename(forgePath) !== WORLD_FORGE_BASENAME) {
        return undefined;
    }
    const real = resolveRealFile(forgePath);
    if (!real) {
        return undefined;
    }
    const root = normalizeRoot(wsPath);
    if (!isUnderRoot(real, root)) {
        return undefined;
    }
    return real;
}

export function resolveValidatedForgePath(wsPath: string): string | undefined {
    return validateForgePathInWorkspace(path.join(wsPath, WORLD_FORGE_BASENAME), wsPath);
}

/** Cartography 成果物（world_map.png / world_map.layout.png）の出力先が workspace 直下か検証。 */
export function validateCartographyOutputPath(
    outputPath: string,
    wsPath: string,
    expectedBasename: string
): string | undefined {
    if (!outputPath || !wsPath) {
        return undefined;
    }
    if (path.basename(outputPath) !== expectedBasename) {
        return undefined;
    }
    const normalized = path.normalize(outputPath);
    const expected = path.normalize(path.join(wsPath, expectedBasename));
    if (normalized !== expected) {
        return undefined;
    }
    const root = normalizeRoot(wsPath);
    const parent = normalizeRoot(path.dirname(normalized));
    if (parent !== root) {
        return undefined;
    }
    return normalized;
}

export function resolveWorldMapImagePath(wsPath: string): string {
    return path.join(wsPath, WORLD_MAP_IMAGE_BASENAME);
}

export function resolveWorldMapLayoutPath(wsPath: string): string {
    return path.join(wsPath, WORLD_MAP_LAYOUT_BASENAME);
}

/**
 * Python stdout が指す生成 PNG（`world_map_{hex}.png`）が workspace 直下の通常ファイルか検証。
 * `copyFileSync` 前の defense-in-depth 用。
 */
export function validateCartographyGeneratedImagePath(imagePath: string, wsPath: string): string | undefined {
    if (!imagePath || !wsPath) {
        return undefined;
    }
    if (!CARTOGRAPHY_TEMP_MAP_PATTERN.test(path.basename(imagePath))) {
        return undefined;
    }
    const real = resolveRealFile(imagePath);
    if (!real) {
        return undefined;
    }
    const root = normalizeRoot(wsPath);
    if (normalizeRoot(path.dirname(real)) !== root) {
        return undefined;
    }
    return real;
}

/** Python に渡す output ディレクトリが workspace ルートか検証。 */
export function validateCartographyOutputDir(outputDir: string, wsPath: string): string | undefined {
    if (!outputDir || !wsPath) {
        return undefined;
    }
    let real: string;
    try {
        real = fs.realpathSync(path.normalize(outputDir));
    } catch {
        return undefined;
    }
    const root = normalizeRoot(wsPath);
    if (real !== root) {
        return undefined;
    }
    return real;
}