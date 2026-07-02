// F5 Replay Export: safe export paths under workspace exports/ (no vscode).

import * as path from 'path';

export const EXPORTS_DIR_NAME = 'exports';

export function sanitizeReplayExportFilename(filename: string): string | undefined {
    const base = path.basename(String(filename ?? '').trim());
    if (!base || base === '.' || base === '..') { return undefined; }
    const safe = base.replace(/[^a-zA-Z0-9._-]/g, '_');
    if (!/\.(md|html)$/i.test(safe)) { return undefined; }
    return safe;
}

export function resolveReplayExportPath(wsPath: string, filename: string): string | undefined {
    if (!wsPath) { return undefined; }
    const safe = sanitizeReplayExportFilename(filename);
    if (!safe) { return undefined; }
    return path.join(wsPath, EXPORTS_DIR_NAME, safe);
}

export function isPathUnderWorkspaceExports(filePath: string, wsPath: string): boolean {
    if (!filePath || !wsPath) { return false; }
    const exportsDir = path.normalize(path.join(wsPath, EXPORTS_DIR_NAME));
    const normalized = path.normalize(filePath);
    return normalized === exportsDir || normalized.startsWith(`${exportsDir}${path.sep}`);
}

/** Relative path from export file to an image inside the workspace. */
export function relativeImagePathFromExport(exportFilePath: string, imagePath: string): string | undefined {
    if (!exportFilePath || !imagePath) { return undefined; }
    const exportDir = path.dirname(exportFilePath);
    const rel = path.relative(exportDir, imagePath);
    if (!rel || path.isAbsolute(rel)) { return undefined; }
    const resolved = path.normalize(path.resolve(exportDir, rel));
    const target = path.normalize(imagePath);
    if (resolved !== target) { return undefined; }
    return rel.split(path.sep).join('/');
}