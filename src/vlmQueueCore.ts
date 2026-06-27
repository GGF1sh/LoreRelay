// Pure helpers for VLM queue / game_state write-back (Phase 5b hardening).
// No vscode or fs imports.

export const MAX_VLM_DESCRIPTION_CHARS = 1200;

/** Normalizes a VLM description for safe storage in game_state / visual_memory. */
export function sanitizeVlmDescription(
    value: unknown,
    maxLen: number = MAX_VLM_DESCRIPTION_CHARS
): string | undefined {
    if (typeof value !== 'string') { return undefined; }
    const text = value.replace(/\s+/g, ' ').trim();
    return text ? text.slice(0, maxLen) : undefined;
}

/**
 * Returns true when two already-resolved absolute image paths refer to the same file.
 */
export function resolvedImagePathsMatch(
    resolvedLatest: string | undefined,
    resolvedTarget: string | undefined
): boolean {
    return Boolean(resolvedLatest && resolvedTarget && resolvedLatest === resolvedTarget);
}

/** Loose path compare for webview gallery matching (normalized slashes + case). */
export function normalizePathForCompare(p: string): string {
    return p.replace(/\\/g, '/').toLowerCase();
}

export function imagePathsLooselyMatch(a: string | undefined, b: string | undefined): boolean {
    if (!a || !b) { return false; }
    const na = normalizePathForCompare(a);
    const nb = normalizePathForCompare(b);
    return na === nb;
}